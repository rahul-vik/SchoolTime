import { Router } from "express";
import { getOrgCredits, logAudit, nowIso, schemas } from "../services/common.js";
import { hashPassword } from "../auth.js";
import { randomUUID } from "node:crypto";
import { getRolePermissionContext } from "../services/roleAccess.js";

export function createUserRoutes(db) {
  const router = Router();
  const getCurrentRole = async (req) => {
    const row = await db.get("SELECT role FROM users WHERE id = ? AND org_id = ?", req.auth.userId, req.auth.orgId);
    return row?.role || req.auth.role;
  };

  router.get("/me", async (req, res) => {
    const row = await db.get(
      `SELECT u.id, u.org_id, u.full_name, u.email, u.role, o.name AS org_name
       FROM users u
       JOIN organizations o ON o.id = u.org_id
       WHERE u.id = ?`,
      req.auth.userId,
    );
    if (!row) return res.status(404).json({ error: "User not found" });
    const credits = await getOrgCredits(db, row.org_id);
    const access = await getRolePermissionContext(db, row.role);
    res.json({
      user: {
        id: row.id,
        orgId: row.org_id,
        orgName: row.org_name,
        fullName: row.full_name,
        email: row.email,
        role: row.role,
        permissions: access.permissions,
        availableRoles: access.availableRoles,
      },
      license: { creditsRemaining: credits },
    });
  });

  router.patch("/me", async (req, res) => {
    const parsed = schemas.updateMeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    const { fullName, password } = parsed.data;
    if (fullName === undefined && password === undefined) {
      return res.status(400).json({ error: "Provide full name and/or a new password" });
    }
    const row = await db.get("SELECT id, org_id FROM users WHERE id = ?", req.auth.userId);
    if (!row) return res.status(404).json({ error: "User not found" });
    const sets = [];
    const vals = [];
    if (fullName !== undefined) {
      sets.push("full_name = ?");
      vals.push(fullName.trim());
    }
    if (password !== undefined) {
      sets.push("password_hash = ?");
      vals.push(hashPassword(password));
    }
    vals.push(req.auth.userId);
    await db.run(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, ...vals);
    await logAudit(db, row.org_id, req.auth.userId, "PROFILE_UPDATED", "user", req.auth.userId, { changed: { fullName: fullName !== undefined, password: password !== undefined } });
    const next = await db.get("SELECT id, org_id, full_name, email, role FROM users WHERE id = ?", req.auth.userId);
    const access = await getRolePermissionContext(db, next.role);
    res.json({
      user: {
        id: next.id,
        orgId: next.org_id,
        fullName: next.full_name,
        email: next.email,
        role: next.role,
        permissions: access.permissions,
        availableRoles: access.availableRoles,
      },
    });
  });

  router.get("/users", async (req, res) => {
    const access = await getRolePermissionContext(db, await getCurrentRole(req));
    if (!access.permissions.canManageUsers) return res.status(403).json({ error: "Forbidden" });
    const users = await db.all("SELECT id, full_name, email, role, is_active, created_at FROM users WHERE org_id = ? ORDER BY created_at ASC", req.auth.orgId);
    res.json({ users: users.map((u) => ({ ...u, isActive: Boolean(u.is_active) })) });
  });

  router.post("/users", async (req, res) => {
    const access = await getRolePermissionContext(db, await getCurrentRole(req));
    if (!access.permissions.canManageUsers) return res.status(403).json({ error: "Forbidden" });
    const parsed = schemas.createUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    if (!access.availableRoles.includes(String(parsed.data.role || "").trim().toLowerCase())) {
      return res.status(400).json({ error: "Role is not allowed by role access policy" });
    }
    const emailNorm = parsed.data.email.trim().toLowerCase();
    if (await db.get("SELECT id FROM users WHERE email = ?", emailNorm)) return res.status(409).json({ error: "Email already registered" });

    const id = randomUUID();
    await db.run(
      "INSERT INTO users (id, org_id, full_name, email, password_hash, role, created_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
      id,
      req.auth.orgId,
      parsed.data.fullName.trim(),
      emailNorm,
      hashPassword(parsed.data.password),
      parsed.data.role,
      nowIso(),
    );
    await logAudit(db, req.auth.orgId, req.auth.userId, "USER_CREATED", "user", id, { role: parsed.data.role });
    res.status(201).json({ ok: true });
  });

  router.patch("/users/:id", async (req, res) => {
    const currentRole = await getCurrentRole(req);
    const access = await getRolePermissionContext(db, currentRole);
    if (!access.permissions.canManageUsers) return res.status(403).json({ error: "Forbidden" });
    const parsed = schemas.tenantUserPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    const target = await db.get("SELECT id, role FROM users WHERE id = ? AND org_id = ?", req.params.id, req.auth.orgId);
    if (!target) return res.status(404).json({ error: "User not found" });

    if (parsed.data.role !== undefined) {
      if (!access.availableRoles.includes(String(parsed.data.role || "").trim().toLowerCase())) {
        return res.status(400).json({ error: "Role is not allowed by role access policy" });
      }
      if (currentRole !== "owner" && parsed.data.role === "owner") return res.status(403).json({ error: "Only owner can assign owner role" });
    }

    if (parsed.data.password !== undefined) {
      if (String(target.role || "").toLowerCase() === "owner" && String(currentRole || "").toLowerCase() !== "owner") {
        return res.status(403).json({ error: "Only an owner can set the owner account password" });
      }
    }

    const sets = [];
    const vals = [];
    if (parsed.data.role !== undefined) {
      sets.push("role = ?");
      vals.push(parsed.data.role);
    }
    if (parsed.data.isActive !== undefined) {
      sets.push("is_active = ?");
      vals.push(parsed.data.isActive ? 1 : 0);
    }
    if (parsed.data.password !== undefined) {
      sets.push("password_hash = ?");
      vals.push(hashPassword(parsed.data.password));
    }
    vals.push(req.params.id, req.auth.orgId);

    await db.transaction(async (tx) => {
      await tx.run(`UPDATE users SET ${sets.join(", ")} WHERE id = ? AND org_id = ?`, ...vals);
      if (parsed.data.password !== undefined) {
        await tx.run("UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", nowIso(), req.params.id);
      }
    });

    await logAudit(db, req.auth.orgId, req.auth.userId, "USER_UPDATED", "user", req.params.id, {
      ...(parsed.data.role !== undefined && { role: parsed.data.role }),
      ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
      passwordChanged: parsed.data.password !== undefined,
    });
    res.json({ ok: true });
  });

  return router;
}

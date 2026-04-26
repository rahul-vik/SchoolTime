import { Router } from "express";
import { getOrgCredits, logAudit, nowIso, schemas } from "../services/common.js";
import { hashPassword } from "../auth.js";
import { randomUUID } from "node:crypto";
import { requireRole } from "../middleware/requireRole.js";

export function createUserRoutes(db) {
  const router = Router();

  router.get("/me", (req, res) => {
    const row = db.prepare("SELECT id, org_id, full_name, email, role FROM users WHERE id = ?").get(req.auth.userId);
    if (!row) return res.status(404).json({ error: "User not found" });
    res.json({ user: { id: row.id, orgId: row.org_id, fullName: row.full_name, email: row.email, role: row.role }, license: { creditsRemaining: getOrgCredits(db, row.org_id) } });
  });

  router.patch("/me", (req, res) => {
    const parsed = schemas.updateMeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    const { fullName, password } = parsed.data;
    if (fullName === undefined && password === undefined) {
      return res.status(400).json({ error: "Provide full name and/or a new password" });
    }
    const row = db.prepare("SELECT id, org_id FROM users WHERE id = ?").get(req.auth.userId);
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
    db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
    logAudit(db, row.org_id, req.auth.userId, "PROFILE_UPDATED", "user", req.auth.userId, { changed: { fullName: fullName !== undefined, password: password !== undefined } });
    const next = db.prepare("SELECT id, org_id, full_name, email, role FROM users WHERE id = ?").get(req.auth.userId);
    res.json({ user: { id: next.id, orgId: next.org_id, fullName: next.full_name, email: next.email, role: next.role } });
  });

  router.get("/users", requireRole("owner", "admin"), (req, res) => {
    const users = db.prepare("SELECT id, full_name, email, role, is_active, created_at FROM users WHERE org_id = ? ORDER BY created_at ASC").all(req.auth.orgId);
    res.json({ users: users.map((u) => ({ ...u, isActive: Boolean(u.is_active) })) });
  });

  router.post("/users", requireRole("owner", "admin"), (req, res) => {
    const parsed = schemas.createUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    const emailNorm = parsed.data.email.trim().toLowerCase();
    if (db.prepare("SELECT id FROM users WHERE email = ?").get(emailNorm)) return res.status(409).json({ error: "Email already registered" });

    const id = randomUUID();
    db.prepare("INSERT INTO users (id, org_id, full_name, email, password_hash, role, created_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)")
      .run(id, req.auth.orgId, parsed.data.fullName.trim(), emailNorm, hashPassword(parsed.data.password), parsed.data.role, nowIso());
    logAudit(db, req.auth.orgId, req.auth.userId, "USER_CREATED", "user", id, { role: parsed.data.role });
    res.status(201).json({ ok: true });
  });

  router.patch("/users/:id", requireRole("owner", "admin"), (req, res) => {
    const parsed = schemas.roleUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    const target = db.prepare("SELECT id, role FROM users WHERE id = ? AND org_id = ?").get(req.params.id, req.auth.orgId);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (req.auth.role !== "owner" && parsed.data.role === "owner") return res.status(403).json({ error: "Only owner can assign owner role" });

    db.prepare("UPDATE users SET role = ?, is_active = COALESCE(?, is_active) WHERE id = ? AND org_id = ?")
      .run(parsed.data.role, parsed.data.isActive === undefined ? null : parsed.data.isActive ? 1 : 0, req.params.id, req.auth.orgId);
    logAudit(db, req.auth.orgId, req.auth.userId, "USER_UPDATED", "user", req.params.id, parsed.data);
    res.json({ ok: true });
  });

  return router;
}

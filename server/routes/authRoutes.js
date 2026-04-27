import { Router } from "express";
import { randomUUID } from "node:crypto";
import { comparePassword, hashOpaqueToken, hashPassword, makeOpaqueToken } from "../auth.js";
import { getOrgCredits, isAfter, logAudit, nowIso, schemas } from "../services/common.js";
import { issueTokenPair } from "../services/tokens.js";
import { getSignupInitialCredits } from "../services/platformSettings.js";
import { createOrgWithOwnerUser } from "../services/registrationService.js";
import { getRolePermissionContext } from "../services/roleAccess.js";
import { sendPasswordResetEmail } from "../services/emailService.js";

export function createAuthRoutes(db) {
  const router = Router();

  router.post("/register", async (req, res) => {
    const parsed = schemas.registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    const { orgName, fullName, email, password } = parsed.data;
    const emailNorm = email.trim().toLowerCase();
    if (await db.get("SELECT id FROM users WHERE email = ?", emailNorm)) return res.status(409).json({ error: "Email already registered" });

    const initialCredits = await getSignupInitialCredits(db);
    const { orgId, userId } = await db.transaction(async (tx) =>
      createOrgWithOwnerUser(tx, {
        orgName,
        fullName,
        emailNorm,
        plainPassword: password,
        initialCredits,
        creditLedgerReason: "TRIAL_SIGNUP",
        creditLedgerMeta: { notes: `Initial ${initialCredits} timetable credits` },
      }),
    );

    const user = { id: userId, org_id: orgId, email: emailNorm, role: "owner" };
    const tokens = await issueTokenPair(db, user);
    const access = await getRolePermissionContext(db, "owner");
    res.status(201).json({
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: userId,
        orgId,
        orgName: orgName.trim(),
        fullName,
        email: emailNorm,
        role: "owner",
        permissions: access.permissions,
        availableRoles: access.availableRoles,
      },
      license: { creditsRemaining: initialCredits },
    });
  });

  router.post("/login", async (req, res) => {
    const parsed = schemas.loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
    const emailNorm = parsed.data.email.trim().toLowerCase();
    const row = await db.get(
      `SELECT u.id, u.org_id, u.full_name, u.email, u.password_hash, u.role, u.is_active, o.name AS org_name
       FROM users u
       JOIN organizations o ON o.id = u.org_id
       WHERE u.email = ?`,
      emailNorm,
    );
    if (!row) return res.status(404).json({ error: "Account not found" });
    if (!comparePassword(parsed.data.password, row.password_hash)) return res.status(401).json({ error: "Incorrect password" });
    if (!row.is_active) return res.status(403).json({ error: "User is deactivated" });
    const tokens = await issueTokenPair(db, row);
    await logAudit(db, row.org_id, row.id, "USER_LOGIN", "user", row.id);
    const credits = await getOrgCredits(db, row.org_id);
    const access = await getRolePermissionContext(db, row.role);
    res.json({
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
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

  router.post("/refresh", async (req, res) => {
    const parsed = schemas.refreshSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid refresh request" });
    const tokenHash = hashOpaqueToken(parsed.data.refreshToken);
    const row = await db.get(
      "SELECT rt.id, rt.user_id, rt.org_id, rt.expires_at, rt.revoked_at, u.email, u.role, u.is_active FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id WHERE rt.token_hash = ?",
      tokenHash,
    );
    if (!row || row.revoked_at || isAfter(nowIso(), row.expires_at) || !row.is_active) return res.status(401).json({ error: "Invalid refresh token" });
    await db.run("UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?", nowIso(), row.id);
    const tokens = await issueTokenPair(db, { id: row.user_id, org_id: row.org_id, email: row.email, role: row.role });
    res.json({ token: tokens.accessToken, refreshToken: tokens.refreshToken });
  });

  router.post("/password-reset/request", async (req, res) => {
    const parsed = schemas.resetRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
    const emailNorm = parsed.data.email.trim().toLowerCase();
    const user = await db.get("SELECT id, org_id FROM users WHERE email = ?", emailNorm);
    if (!user) return res.json({ ok: true });
    const rawToken = makeOpaqueToken();
    await db.run(
      "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)",
      randomUUID(),
      user.id,
      hashOpaqueToken(rawToken),
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      nowIso(),
    );
    const emailOut = await sendPasswordResetEmail(emailNorm, rawToken);
    if (!emailOut.sent && process.env.NODE_ENV !== "production") {
      console.warn("[password-reset] SMTP not configured. Reset email skipped for:", emailNorm);
    }
    await logAudit(db, user.org_id, user.id, "PASSWORD_RESET_REQUESTED", "user", user.id);
    res.json({ ok: true });
  });

  router.post("/password-reset/confirm", async (req, res) => {
    const parsed = schemas.resetConfirmSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
    const hash = hashOpaqueToken(parsed.data.token);
    const row = await db.get(
      "SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at, u.org_id FROM password_reset_tokens prt JOIN users u ON u.id = prt.user_id WHERE prt.token_hash = ?",
      hash,
    );
    if (!row || row.used_at || isAfter(nowIso(), row.expires_at)) return res.status(400).json({ error: "Invalid or expired token" });
    await db.transaction(async (tx) => {
      await tx.run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(parsed.data.newPassword), row.user_id);
      await tx.run("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?", nowIso(), row.id);
      await tx.run("UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", nowIso(), row.user_id);
      await logAudit(tx, row.org_id, row.user_id, "PASSWORD_RESET_CONFIRMED", "user", row.user_id);
    });
    res.json({ ok: true });
  });

  return router;
}

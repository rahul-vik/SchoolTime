import { Router } from "express";
import { randomUUID } from "node:crypto";
import { comparePassword, hashOpaqueToken, hashPassword, makeOpaqueToken } from "../auth.js";
import { getOrgCredits, isAfter, logAudit, nowIso, schemas, writeCreditLedger } from "../services/common.js";
import { issueTokenPair } from "../services/tokens.js";

export function createAuthRoutes(db) {
  const router = Router();

  router.post("/register", async (req, res) => {
    const parsed = schemas.registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    const { orgName, fullName, email, password } = parsed.data;
    const emailNorm = email.trim().toLowerCase();
    if (await db.get("SELECT id FROM users WHERE email = ?", emailNorm)) return res.status(409).json({ error: "Email already registered" });

    const orgId = randomUUID();
    const userId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.run("INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)", orgId, orgName.trim(), nowIso());
      await tx.run(
        "INSERT INTO users (id, org_id, full_name, email, password_hash, role, created_at, is_active) VALUES (?, ?, ?, ?, ?, 'owner', ?, 1)",
        userId,
        orgId,
        fullName.trim(),
        emailNorm,
        hashPassword(password),
        nowIso(),
      );
      await tx.run("INSERT INTO licenses (org_id, credits_remaining, updated_at) VALUES (?, ?, ?)", orgId, 10, nowIso());
      await writeCreditLedger(tx, orgId, 10, "TRIAL_SIGNUP", { notes: "Initial 10 timetable credits" });
      await logAudit(tx, orgId, userId, "ORG_REGISTERED", "organization", orgId, { ownerEmail: emailNorm });
    })();

    const user = { id: userId, org_id: orgId, email: emailNorm, role: "owner" };
    const tokens = await issueTokenPair(db, user);
    res.status(201).json({ token: tokens.accessToken, refreshToken: tokens.refreshToken, user: { id: userId, orgId, fullName, email: emailNorm, role: "owner" }, license: { creditsRemaining: 10 } });
  });

  router.post("/login", async (req, res) => {
    const parsed = schemas.loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
    const emailNorm = parsed.data.email.trim().toLowerCase();
    const row = await db.get("SELECT id, org_id, full_name, email, password_hash, role, is_active FROM users WHERE email = ?", emailNorm);
    if (!row || !comparePassword(parsed.data.password, row.password_hash)) return res.status(401).json({ error: "Invalid credentials" });
    if (!row.is_active) return res.status(403).json({ error: "User is deactivated" });
    const tokens = await issueTokenPair(db, row);
    await logAudit(db, row.org_id, row.id, "USER_LOGIN", "user", row.id);
    const credits = await getOrgCredits(db, row.org_id);
    res.json({ token: tokens.accessToken, refreshToken: tokens.refreshToken, user: { id: row.id, orgId: row.org_id, fullName: row.full_name, email: row.email, role: row.role }, license: { creditsRemaining: credits } });
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
    })();
    res.json({ ok: true });
  });

  return router;
}

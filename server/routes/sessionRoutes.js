import { Router } from "express";
import { hashOpaqueToken } from "../auth.js";
import { logAudit, nowIso, schemas } from "../services/common.js";

export function createSessionRoutes(db) {
  const router = Router();
  router.post("/logout", async (req, res) => {
    const parsed = schemas.refreshSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid logout request" });
    await db.run("UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND org_id = ?", nowIso(), hashOpaqueToken(parsed.data.refreshToken), req.auth.orgId);
    await logAudit(db, req.auth.orgId, req.auth.userId, "USER_LOGOUT", "user", req.auth.userId);
    res.json({ ok: true });
  });
  return router;
}

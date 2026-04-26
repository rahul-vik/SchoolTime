import { Router } from "express";
import { randomUUID } from "node:crypto";
import { hashApiKey, logAudit, nowIso, schemas } from "../services/common.js";
import { makeOpaqueToken } from "../auth.js";

export function createApiKeyRoutes(db) {
  const router = Router();

  router.get("/api-keys", (req, res) => {
    const keys = db.prepare(`SELECT id, name, key_prefix, created_at, last_used_at, revoked_at FROM api_keys WHERE org_id = ? ORDER BY created_at DESC`).all(req.auth.orgId);
    res.json({ apiKeys: keys });
  });

  router.post("/api-keys", (req, res) => {
    const parsed = schemas.apiKeyCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    const raw = `tt_${makeOpaqueToken()}`;
    const id = randomUUID();
    const keyPrefix = raw.slice(0, 12);
    db.prepare(`INSERT INTO api_keys (id, org_id, name, key_hash, key_prefix, created_by_user_id, created_at, last_used_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`)
      .run(id, req.auth.orgId, parsed.data.name.trim(), hashApiKey(raw), keyPrefix, req.auth.userId, nowIso());
    logAudit(db, req.auth.orgId, req.auth.userId, "API_KEY_CREATED", "api_key", id, { name: parsed.data.name });
    res.status(201).json({ id, apiKey: raw });
  });

  router.delete("/api-keys/:id", (req, res) => {
    const result = db.prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND org_id = ? AND revoked_at IS NULL")
      .run(nowIso(), req.params.id, req.auth.orgId);
    if (!result.changes) return res.status(404).json({ error: "API key not found" });
    logAudit(db, req.auth.orgId, req.auth.userId, "API_KEY_REVOKED", "api_key", req.params.id);
    res.json({ ok: true });
  });

  return router;
}

import { Router } from "express";
import { randomUUID } from "node:crypto";
import { hashApiKey, logAudit, nowIso, schemas } from "../services/common.js";
import { makeOpaqueToken } from "../auth.js";

export function createApiKeyRoutes(db) {
  const router = Router();

  router.get("/api-keys", async (req, res) => {
    const keys = await db.all("SELECT id, name, key_prefix, created_at, last_used_at, revoked_at FROM api_keys WHERE org_id = ? ORDER BY created_at DESC", req.auth.orgId);
    res.json({ apiKeys: keys });
  });

  router.post("/api-keys", async (req, res) => {
    const parsed = schemas.apiKeyCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    const raw = `tt_${makeOpaqueToken()}`;
    const id = randomUUID();
    const keyPrefix = raw.slice(0, 12);
    await db.run(
      "INSERT INTO api_keys (id, org_id, name, key_hash, key_prefix, created_by_user_id, created_at, last_used_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)",
      id,
      req.auth.orgId,
      parsed.data.name.trim(),
      hashApiKey(raw),
      keyPrefix,
      req.auth.userId,
      nowIso(),
    );
    await logAudit(db, req.auth.orgId, req.auth.userId, "API_KEY_CREATED", "api_key", id, { name: parsed.data.name });
    res.status(201).json({ id, apiKey: raw });
  });

  router.delete("/api-keys/:id", async (req, res) => {
    const result = await db.run("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND org_id = ? AND revoked_at IS NULL", nowIso(), req.params.id, req.auth.orgId);
    if (!result.changes) return res.status(404).json({ error: "API key not found" });
    await logAudit(db, req.auth.orgId, req.auth.userId, "API_KEY_REVOKED", "api_key", req.params.id);
    res.json({ ok: true });
  });

  return router;
}

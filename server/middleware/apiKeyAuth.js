import { hashApiKey, nowIso } from "../services/common.js";

export function apiKeyAuthMiddleware(db) {
  return async (req, res, next) => {
    const raw = req.headers["x-api-key"];
    if (!raw || typeof raw !== "string") {
      res.status(401).json({ error: "Missing API key" });
      return;
    }
    const row = await db.get("SELECT id, org_id FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL", hashApiKey(raw));
    if (!row) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }
    await db.run("UPDATE api_keys SET last_used_at = ? WHERE id = ?", nowIso(), row.id);
    req.auth = { orgId: row.org_id, userId: null, role: "api_key", apiKeyId: row.id };
    next();
  };
}

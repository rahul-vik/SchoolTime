import { hashApiKey, nowIso } from "../services/common.js";

export function apiKeyAuthMiddleware(db) {
  return (req, res, next) => {
    const raw = req.headers["x-api-key"];
    if (!raw || typeof raw !== "string") {
      res.status(401).json({ error: "Missing API key" });
      return;
    }
    const row = db.prepare("SELECT id, org_id FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL").get(hashApiKey(raw));
    if (!row) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }
    db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(nowIso(), row.id);
    req.auth = { orgId: row.org_id, userId: null, role: "api_key", apiKeyId: row.id };
    next();
  };
}

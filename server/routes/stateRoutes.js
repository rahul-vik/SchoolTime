import { Router } from "express";
import { logAudit, nowIso, schemas } from "../services/common.js";

export function createStateRoutes(db) {
  const router = Router();

  router.get("/state", (req, res) => {
    const row = db.prepare("SELECT state_json FROM tenant_state WHERE org_id = ?").get(req.auth.orgId);
    res.json({ state: row ? JSON.parse(row.state_json) : null });
  });

  router.put("/state", (req, res) => {
    const parsed = schemas.tenantStateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid state payload", details: parsed.error.issues });
    db.prepare("INSERT INTO tenant_state (org_id, state_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(org_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at")
      .run(req.auth.orgId, JSON.stringify(parsed.data), nowIso());
    logAudit(db, req.auth.orgId, req.auth.userId, "TENANT_STATE_SAVED", "tenant_state", req.auth.orgId);
    res.json({ ok: true });
  });

  return router;
}

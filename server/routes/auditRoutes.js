import { Router } from "express";
import { buildAuditWhere, csvEscape } from "../services/common.js";

export function createAuditRoutes(db) {
  const router = Router();

  router.get("/audit-logs", async (req, res) => {
    const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 500));
    const { whereSql, args } = buildAuditWhere(req.query, req.auth.orgId);
    const logs = (await db.all(`SELECT a.id, a.action, a.entity_type, a.entity_id, a.metadata_json, a.created_at, u.full_name
        FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
        WHERE ${whereSql}
        ORDER BY a.created_at DESC LIMIT ?`, ...args, limit))
      .map((l) => ({ ...l, metadata: l.metadata_json ? JSON.parse(l.metadata_json) : null }));
    res.json({ logs });
  });

  router.get("/audit-logs/export.csv", async (req, res) => {
    const limit = Math.max(1, Math.min(Number(req.query.limit || 1000), 5000));
    const { whereSql, args } = buildAuditWhere(req.query, req.auth.orgId);
    const rows = await db.all(`SELECT a.created_at, IFNULL(u.full_name,'System') actor, a.action, a.entity_type, IFNULL(a.entity_id,'') entity_id, IFNULL(a.metadata_json,'') metadata_json
        FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
        WHERE ${whereSql}
        ORDER BY a.created_at DESC LIMIT ?`, ...args, limit);
    const header = "created_at,actor,action,entity_type,entity_id,metadata_json";
    const lines = rows.map((r) => [r.created_at, r.actor, r.action, r.entity_type, r.entity_id, r.metadata_json].map(csvEscape).join(","));
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=\"audit-logs.csv\"");
    res.send([header, ...lines].join("\n"));
  });

  return router;
}

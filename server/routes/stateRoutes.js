import { Router } from "express";
import { logAudit, nowIso, schemas } from "../services/common.js";
import { getRolePermissionContext } from "../services/roleAccess.js";
import { migrateTenantState } from "../services/tenantStateMigration.js";

export function createStateRoutes(db) {
  const router = Router();
  const sectionAuditMap = {
    setup: { action: "SCHOOL_SETUP_UPDATED", entityType: "school_setup" },
    standards: { action: "STANDARDS_UPDATED", entityType: "standards" },
    subjects: { action: "SUBJECTS_UPDATED", entityType: "subjects" },
    teachers: { action: "TEACHERS_UPDATED", entityType: "teachers" },
    periods: { action: "PERIODS_UPDATED", entityType: "periods" },
    rules: { action: "PREFERENCES_UPDATED", entityType: "preferences" },
  };

  router.get("/state", async (req, res) => {
    const row = await db.get("SELECT state_json FROM tenant_state WHERE org_id = ?", req.auth.orgId);
    if (!row) return res.json({ state: null });
    const parsed = JSON.parse(row.state_json);
    const migrated = migrateTenantState(parsed);
    if (migrated.changed) {
      await db.run(
        "INSERT INTO tenant_state (org_id, state_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(org_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at",
        req.auth.orgId,
        JSON.stringify(migrated.state),
        nowIso(),
      );
    }
    res.json({ state: migrated.state });
  });

  router.put("/state", async (req, res) => {
    const roleRow = await db.get("SELECT role FROM users WHERE id = ? AND org_id = ?", req.auth.userId, req.auth.orgId);
    const access = await getRolePermissionContext(db, roleRow?.role || req.auth.role);
    if (!access.permissions.canConfigureTimetable) return res.status(403).json({ error: "Forbidden" });
    const migrated = migrateTenantState(req.body);
    const parsed = schemas.tenantStateSchema.safeParse(migrated.state);
    if (!parsed.success) return res.status(400).json({ error: "Invalid state payload", details: parsed.error.issues });
    const sectionKey = String(req.query.section || "").trim().toLowerCase();
    const mapped = sectionAuditMap[sectionKey] || null;
    await db.run(
      "INSERT INTO tenant_state (org_id, state_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(org_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at",
      req.auth.orgId,
      JSON.stringify(parsed.data),
      nowIso(),
    );
    if (mapped) {
      await logAudit(db, req.auth.orgId, req.auth.userId, mapped.action, mapped.entityType, req.auth.orgId, { section: sectionKey });
    }
    res.json({ ok: true });
  });

  return router;
}

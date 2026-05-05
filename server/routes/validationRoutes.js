import { Router } from "express";
import { logAudit, nowIso } from "../services/common.js";
import { applyApprovedFix } from "../services/timetableAutoFixService.js";

function parseMeta(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function flattenFindings(rows) {
  const out = [];
  for (const row of rows || []) {
    const meta = parseMeta(row.metadata_json);
    const findings = Array.isArray(meta?.findings) ? meta.findings : [];
    for (const finding of findings) {
      out.push({
        ...finding,
        runId: row.entity_id,
        validationLoggedAt: row.created_at,
      });
    }
  }
  return out;
}

export function createValidationRoutes(db) {
  const router = Router();

  router.get("/validation/findings", async (req, res) => {
    const runId = String(req.query.runId || "").trim();
    const risk = String(req.query.risk || "").trim().toUpperCase();
    const status = String(req.query.status || "").trim().toUpperCase();
    const limit = Math.min(300, Math.max(1, Number(req.query.limit || 100) || 100));
    const args = [req.auth.orgId];
    let where = "org_id = ? AND action = 'TIMETABLE_VALIDATED' AND entity_type = 'timetable_run'";
    if (runId) {
      where += " AND entity_id = ?";
      args.push(runId);
    }
    const rows = await db.all(
      `SELECT entity_id, metadata_json, created_at
       FROM audit_logs
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT ?`,
      ...args,
      limit,
    );
    const all = flattenFindings(rows)
      .filter((f) => (risk ? String(f.risk || "").toUpperCase() === risk : true))
      .filter((f) => (status ? String(f.status || "").toUpperCase() === status : true));
    res.json({ findings: all, total: all.length });
  });

  router.post("/validation/findings/:findingId/apply", async (req, res) => {
    const findingId = String(req.params.findingId || "").trim();
    const runId = String(req.body?.runId || "").trim();
    if (!findingId || !runId) return res.status(400).json({ error: "runId and findingId are required" });

    const run = await db.get(
      "SELECT id, entries_json, report_json, state_json FROM timetable_runs WHERE org_id = ? AND id = ? LIMIT 1",
      req.auth.orgId,
      runId,
    );
    if (!run) return res.status(404).json({ error: "Run not found" });

    const validationRow = await db.get(
      `SELECT metadata_json FROM audit_logs
       WHERE org_id = ? AND action = 'TIMETABLE_VALIDATED' AND entity_type = 'timetable_run' AND entity_id = ?
       ORDER BY created_at DESC LIMIT 1`,
      req.auth.orgId,
      runId,
    );
    const validationMeta = parseMeta(validationRow?.metadata_json) || {};
    const findings = Array.isArray(validationMeta.findings) ? validationMeta.findings : [];
    const finding = findings.find((f) => f.findingId === findingId);
    if (!finding) return res.status(404).json({ error: "Finding not found for this run" });

    if (!(finding.autoFixable && String(finding.risk || "").toUpperCase() === "LOW")) {
      await logAudit(db, req.auth.orgId, req.auth.userId, "TIMETABLE_FIX_APPROVED_APPLIED", "timetable_run", runId, {
        findingId,
        status: "APPROVED_MANUAL_ONLY",
        note: "This finding requires manual remediation due to risk level.",
      });
      return res.json({ ok: true, applied: false, status: "APPROVED_MANUAL_ONLY" });
    }

    const entries = run.entries_json ? JSON.parse(run.entries_json) : [];
    const fix = applyApprovedFix({ finding, entries });
    const updatedEntries = fix.entries || entries;
    const report = run.report_json ? JSON.parse(run.report_json) : {};
    const nextReport = {
      ...report,
      validation: {
        ...(report.validation || {}),
        approvedAppliedCount: Number(report.validation?.approvedAppliedCount || 0) + (fix.summary?.appliedCount || 0),
        lastApprovedAppliedAt: nowIso(),
      },
    };

    await db.run("UPDATE timetable_runs SET entries_json = ?, report_json = ? WHERE id = ? AND org_id = ?", JSON.stringify(updatedEntries), JSON.stringify(nextReport), runId, req.auth.orgId);
    await logAudit(db, req.auth.orgId, req.auth.userId, "TIMETABLE_FIX_APPROVED_APPLIED", "timetable_run", runId, {
      findingId,
      appliedCount: fix.summary?.appliedCount || 0,
      applied: fix.summary?.applied || [],
    });
    res.json({ ok: true, applied: true, summary: fix.summary });
  });

  return router;
}

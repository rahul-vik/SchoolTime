import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getOrgCredits, logAudit, nowIso, schemas, writeCreditLedger } from "../services/common.js";
import { runTimetableEngine } from "../engine.js";
import { migrateTenantState } from "../services/tenantStateMigration.js";
import { validateTimetableRun } from "../services/timetableValidationService.js";
import { applyLowRiskAutoFixes } from "../services/timetableAutoFixService.js";

export function createB2BRoutes(db) {
  const router = Router();
  const summarizeFindings = (findings) => {
    const byRisk = {};
    const bySeverity = {};
    for (const f of findings || []) {
      byRisk[f.risk] = (byRisk[f.risk] || 0) + 1;
      bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    }
    return {
      total: (findings || []).length,
      byRisk,
      bySeverity,
      autoApplyEligible: (findings || []).filter((f) => f.autoFixable && f.risk === "LOW").length,
      pendingApproval: (findings || []).filter((f) => !(f.autoFixable && f.risk === "LOW")).length,
      autoApplied: (findings || []).filter((f) => f.autoApplied).length,
    };
  };

  router.post("/b2b/timetable/generate", async (req, res) => {
    const migrated = migrateTenantState(req.body);
    const parsed = schemas.tenantStateSchema.safeParse(migrated.state);
    if (!parsed.success) return res.status(400).json({ error: "Invalid generation payload", details: parsed.error.issues });
    const runId = randomUUID();

    try {
      const output = await db.transaction(async (tx) => {
        const credits = await getOrgCredits(tx, req.auth.orgId);
        if (credits <= 0) throw new Error("NO_CREDITS");
        await tx.run("UPDATE licenses SET credits_remaining = ?, updated_at = ? WHERE org_id = ?", credits - 1, nowIso(), req.auth.orgId);
        await writeCreditLedger(tx, req.auth.orgId, -1, "B2B_TIMETABLE_GENERATION", { runId, apiKeyId: req.auth.apiKeyId });
        const result = runTimetableEngine(parsed.data);
        const validation = validateTimetableRun({ state: parsed.data, entries: result.entries, runId });
        const autoFix = applyLowRiskAutoFixes({ entries: result.entries, findings: validation.findings });
        const finalFindings = autoFix.findings;
        result.entries = autoFix.entries;
        result.report = {
          ...(result.report || {}),
          validation: {
            ...summarizeFindings(finalFindings),
            checkedAt: validation.checkedAt,
            autoFixSummary: autoFix.summary,
          },
        };
        const owner = await tx.get("SELECT id FROM users WHERE org_id = ? ORDER BY created_at ASC LIMIT 1", req.auth.orgId);
        await tx.run(
          "INSERT INTO timetable_runs (id, org_id, status, score, created_by_user_id, created_at, report_json, entries_json, state_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          runId,
          req.auth.orgId,
          result.status,
          result.score,
          owner.id,
          nowIso(),
          JSON.stringify(result.report),
          JSON.stringify(result.entries),
          JSON.stringify(parsed.data),
        );
        await logAudit(tx, req.auth.orgId, null, "TIMETABLE_VALIDATED", "timetable_run", runId, {
          runId,
          source: "B2B",
          summary: result.report.validation,
          findings: finalFindings,
        });
        if ((autoFix.summary?.appliedCount || 0) > 0) {
          await logAudit(tx, req.auth.orgId, null, "TIMETABLE_FIX_AUTO_APPLIED", "timetable_run", runId, {
            runId,
            source: "B2B",
            applied: autoFix.summary.applied,
            appliedCount: autoFix.summary.appliedCount,
          });
        }
        await logAudit(tx, req.auth.orgId, null, "B2B_TIMETABLE_GENERATED", "timetable_run", runId, { apiKeyId: req.auth.apiKeyId, score: result.score });
        return { result, creditsRemaining: credits - 1 };
      });
      res.json({ timetable: output.result, license: { creditsRemaining: output.creditsRemaining }, runId });
    } catch (error) {
      if (error.message === "NO_CREDITS") return res.status(402).json({ error: "No credits remaining. Add credits to this organization before calling generate again." });
      return res.status(500).json({ error: "Generation failed" });
    }
  });

  return router;
}

import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getOrgCredits, logAudit, nowIso, schemas, writeCreditLedger } from "../services/common.js";
import { runTenantPreflightCheck, runTenantFeasibilityReport } from "../../shared/tenantPreflightCheck.js";
import { runTimetableGenerationEngine } from "../timetableSolverRunner.js";
import { generateExportFile, normalizeExportScope } from "../services/exportService.js";
import { divisionsForScheduling, scopeTenantForScheduling, subjectsForScheduling } from "../../shared/divisionScheduling.js";
import { migrateTenantState } from "../services/tenantStateMigration.js";
import { validateTimetableRun } from "../services/timetableValidationService.js";
import { applyLowRiskAutoFixes } from "../services/timetableAutoFixService.js";
import {
  applyTimetableEdit,
  appendManualEditAudit,
  getValidAddOptions,
  getValidEditTargets,
  resolveTimetableEditPayload,
} from "../services/timetableManualEditService.js";
import { mergeLiveReportFromEntries } from "../../shared/recomputeTimetableReport.js";

/** Express may give `string | string[]` for duplicate keys; take first stable value. */
function firstQueryParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function normalizeExportQueryType(type) {
  return String(type ?? "").trim().toUpperCase();
}
function normalizeRunIdParam(runId) {
  const id = String(runId ?? "").trim();
  return id || "";
}

export function createTimetableRoutes(db) {
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

  router.post("/timetable/generate", async (req, res) => {
    const rawBody = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? { ...req.body } : {};
    const timetableSolver = typeof rawBody.timetableSolver === "string" ? rawBody.timetableSolver.trim() : undefined;
    delete rawBody.timetableSolver;
    const legacyEngineOptions =
      rawBody.legacyEngineOptions && typeof rawBody.legacyEngineOptions === "object" && !Array.isArray(rawBody.legacyEngineOptions)
        ? rawBody.legacyEngineOptions
        : undefined;
    delete rawBody.legacyEngineOptions;
    const migrated = migrateTenantState(rawBody);
    const parsed = schemas.tenantStateSchema.safeParse(migrated.state);
    if (!parsed.success) return res.status(400).json({ error: "Invalid generation payload", details: parsed.error.issues });
    if (divisionsForScheduling(parsed.data.divisions).length === 0) {
      return res.status(400).json({
        error: "No active divisions for scheduling. Resume at least one class under Standards & Divisions.",
      });
    }
    if (subjectsForScheduling(parsed.data.subjects).length === 0) {
      return res.status(400).json({
        error: "No active subjects for scheduling. Resume at least one subject under Subjects.",
      });
    }
    const scoped = scopeTenantForScheduling(parsed.data);
    if (scoped.teachers.length === 0) {
      return res.status(400).json({
        error: "No teachers in scheduling scope. Resume paused teachers or assign teachers to active classes and subjects.",
      });
    }
    const preflight = runTenantPreflightCheck(scoped);
    const feasibility = runTenantFeasibilityReport(scoped);
    if (!preflight.ok) {
      return res.status(400).json({
        error: "Timetable setup has blocking issues. Fix scheduling rules or period settings before generating.",
        preflight: {
          errorCount: preflight.errorCount,
          issues: preflight.errors.slice(0, 25),
        },
      });
    }
    const runId = randomUUID();
    const createdAt = nowIso();
    try {
      const output = await db.transaction(async (tx) => {
        const credits = await getOrgCredits(tx, req.auth.orgId);
        if (credits <= 0) throw new Error("NO_CREDITS");
        await tx.run("UPDATE licenses SET credits_remaining = ?, updated_at = ? WHERE org_id = ?", credits - 1, nowIso(), req.auth.orgId);
        await writeCreditLedger(tx, req.auth.orgId, -1, "TIMETABLE_GENERATION", { runId });
        const result = await runTimetableGenerationEngine(parsed.data, { timetableSolver, legacyEngineOptions });
        const validation = validateTimetableRun({ state: parsed.data, entries: result.entries, runId });
        const autoFix = applyLowRiskAutoFixes({ entries: result.entries, findings: validation.findings });
        const finalFindings = autoFix.findings;
        result.entries = autoFix.entries;
        result.report = {
          ...(result.report || {}),
          preflight: {
            ok: true,
            issueCount: preflight.issueCount,
            warningCount: preflight.warningCount,
          },
          feasibility: {
            ok: feasibility.ok,
            issueCount: feasibility.issueCount,
            errorCount: feasibility.errorCount,
            warningCount: feasibility.warningCount,
            totalRequired: feasibility.totalRequired,
            totalPlaceable: feasibility.totalPlaceable,
            demandPeriods: feasibility.demandPeriods,
            supplyPeriods: feasibility.supplyPeriods,
            rows: feasibility.rows,
            issues: feasibility.issues.slice(0, 40),
          },
          validation: {
            ...summarizeFindings(finalFindings),
            checkedAt: validation.checkedAt,
            autoFixSummary: autoFix.summary,
          },
        };
        await tx.run(
          "INSERT INTO timetable_runs (id, org_id, status, score, created_by_user_id, created_at, report_json, entries_json, state_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          runId,
          req.auth.orgId,
          result.status,
          result.score,
          req.auth.userId,
          createdAt,
          JSON.stringify(result.report),
          JSON.stringify(result.entries),
          JSON.stringify(parsed.data),
        );
        // Persist the same snapshot the engine used so PDF/Excel export always has tenant_state (client save is debounced and may not have run yet).
        await tx.run(
          "INSERT INTO tenant_state (org_id, state_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(org_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at",
          req.auth.orgId,
          JSON.stringify(parsed.data),
          createdAt,
        );
        await logAudit(tx, req.auth.orgId, req.auth.userId, "TIMETABLE_VALIDATED", "timetable_run", runId, {
          runId,
          summary: result.report.validation,
          findings: finalFindings,
        });
        if ((autoFix.summary?.appliedCount || 0) > 0) {
          await logAudit(tx, req.auth.orgId, req.auth.userId, "TIMETABLE_FIX_AUTO_APPLIED", "timetable_run", runId, {
            runId,
            applied: autoFix.summary.applied,
            appliedCount: autoFix.summary.appliedCount,
          });
        }
        await logAudit(tx, req.auth.orgId, req.auth.userId, "TIMETABLE_GENERATED", "timetable_run", runId, { score: result.score, status: result.status });
        return { result, creditsRemaining: credits - 1 };
      });
      res.json({
        timetable: { ...output.result, runId, generatedAt: createdAt, sourceState: parsed.data },
        license: { creditsRemaining: output.creditsRemaining },
        runId,
        createdAt,
      });
    } catch (error) {
      if (error.message === "NO_CREDITS") return res.status(402).json({ error: "No credits remaining. Purchase a credit pack from Settings to continue." });
      return res.status(500).json({ error: "Generation failed" });
    }
  });

  router.get("/timetable/runs", async (req, res) => {
    const rows = await db.all("SELECT id, status, score, created_at FROM timetable_runs WHERE org_id = ? ORDER BY created_at DESC LIMIT 25", req.auth.orgId);
    res.json({ runs: rows });
  });

  router.get("/timetable/latest", async (req, res) => {
    const row = await db.get(
      "SELECT id, status, score, report_json, entries_json, state_json, created_at FROM timetable_runs WHERE org_id = ? AND entries_json IS NOT NULL ORDER BY created_at DESC LIMIT 1",
      req.auth.orgId,
    );
    if (!row) return res.json({ run: null, timetable: null });
    try {
      const report = row.report_json ? JSON.parse(row.report_json) : {};
      const entries = row.entries_json ? JSON.parse(row.entries_json) : [];
      const sourceState = row.state_json ? migrateTenantState(JSON.parse(row.state_json)).state : null;
      const liveReport = sourceState ? mergeLiveReportFromEntries(sourceState, entries, report) : report;
      const liveScore = liveReport.objective?.score ?? row.score;
      const liveStatus =
        liveScore > 85 ? "FEASIBLE" : liveScore > 60 ? "PARTIAL" : "INFEASIBLE";
      return res.json({
        run: { id: row.id, status: liveStatus, score: liveScore, createdAt: row.created_at },
        timetable: {
          entries,
          score: liveScore,
          status: liveStatus,
          report: liveReport,
          runId: row.id,
          generatedAt: row.created_at,
          sourceState,
        },
      });
    } catch {
      return res.status(500).json({ error: "Stored timetable data is invalid" });
    }
  });

  async function handleTimetableExportDownload(req, res) {
    const type = normalizeExportQueryType(firstQueryParam(req.query.type));
    const scope = normalizeExportScope(firstQueryParam(req.query.scope));
    if (!["PDF", "EXCEL"].includes(type)) return res.status(400).json({ error: "Invalid export type" });
    if (!["ALL_DIVISIONS", "ALL_TEACHERS", "REPORTS_BUNDLE"].includes(scope)) return res.status(400).json({ error: "Invalid export scope" });

    const requestedRunId = normalizeRunIdParam(firstQueryParam(req.query.runId));
    const run = requestedRunId
      ? await db.get("SELECT id, entries_json, state_json FROM timetable_runs WHERE org_id = ? AND id = ? AND entries_json IS NOT NULL LIMIT 1", req.auth.orgId, requestedRunId)
      : await db.get("SELECT id, entries_json, state_json FROM timetable_runs WHERE org_id = ? AND entries_json IS NOT NULL ORDER BY created_at DESC LIMIT 1", req.auth.orgId);
    if (!run) return res.status(404).json({ error: "No generated timetable available for export" });

    const stateRow = await db.get("SELECT state_json FROM tenant_state WHERE org_id = ?", req.auth.orgId);

    let entries = [];
    let state = null;
    try {
      const runEntries = JSON.parse(run.entries_json || "[]");
      if (run.state_json) {
        state = migrateTenantState(JSON.parse(run.state_json)).state;
      } else if (stateRow?.state_json) {
        state = migrateTenantState(JSON.parse(stateRow.state_json)).state;
      } else {
        return res.status(404).json({ error: "Tenant state not found" });
      }
      const editedTimetable = state?.lastGeneratedTimetable;
      const editedEntries = editedTimetable?.entries;
      const sameRun = editedTimetable?.runId && editedTimetable.runId === run.id;
      const hasManualEdits = Number(editedTimetable?.report?.manualEditCount || 0) > 0
        || (Array.isArray(editedTimetable?.manualEdits) && editedTimetable.manualEdits.length > 0);
      entries = sameRun && hasManualEdits && Array.isArray(editedEntries) && editedEntries.length > 0 ? editedEntries : runEntries;
    } catch {
      return res.status(500).json({ error: "Stored timetable data is invalid" });
    }
    if (!state || typeof state !== "object") {
      return res.status(500).json({ error: "Stored timetable data is invalid" });
    }

    try {
      const file = await generateExportFile({ type, scope, state, entries });
      res.setHeader("Content-Type", file.contentType);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Surrogate-Control", "no-store");
      res.setHeader("Content-Disposition", `attachment; filename=\"${file.filename}\"`);
      res.send(file.buffer);
      try {
        await logAudit(db, req.auth.orgId, req.auth.userId, "TIMETABLE_EXPORTED", "timetable_run", run.id, { type, scope, filename: file.filename });
      } catch (auditErr) {
        console.error("[timetable/export] audit log failed:", auditErr);
      }
    } catch (error) {
      console.error("[timetable/export] generate failed:", error);
      if (error.message === "UNSUPPORTED_SCOPE") return res.status(400).json({ error: "Export scope not supported for requested type" });
      if (error.message === "UNSUPPORTED_TYPE") return res.status(400).json({ error: "Export type not supported" });
      const detail = process.env.NODE_ENV !== "production" ? String(error.message || error) : undefined;
      return res.status(500).json({ error: "Failed to generate export file", ...(detail ? { detail } : {}) });
    }
  }

  // Canonical path (use in client). Legacy path kept for older frontends.
  router.get("/timetable/download", handleTimetableExportDownload);
  router.get("/timetable/exports/download", handleTimetableExportDownload);

  async function loadEditContext(req) {
    const runId = normalizeRunIdParam(req.body?.runId);
    const run = runId
      ? await db.get(
          "SELECT id, entries_json, state_json FROM timetable_runs WHERE org_id = ? AND id = ? LIMIT 1",
          req.auth.orgId,
          runId,
        )
      : await db.get(
          "SELECT id, entries_json, state_json FROM timetable_runs WHERE org_id = ? AND entries_json IS NOT NULL ORDER BY created_at DESC LIMIT 1",
          req.auth.orgId,
        );
    if (!run) return { error: "No generated timetable found", status: 404 };
    const tenantStateRow = await db.get("SELECT state_json FROM tenant_state WHERE org_id = ?", req.auth.orgId);
    const resolved = resolveTimetableEditPayload({ body: req.body, runRow: run, tenantStateRow });
    if (resolved.error) return { error: resolved.error, status: 400 };
    return { run, ...resolved };
  }

  router.post("/timetable/valid-add-options", async (req, res) => {
    const ctx = await loadEditContext(req);
    if (ctx.error) return res.status(ctx.status || 400).json({ error: ctx.error });
    const divisionId = String(req.body?.divisionId || "").trim();
    const dayOfWeek = String(req.body?.dayOfWeek || "").trim();
    const slotNumber = Number(req.body?.slotNumber);
    if (!divisionId || !dayOfWeek || !Number.isFinite(slotNumber)) {
      return res.status(400).json({ error: "divisionId, dayOfWeek, and slotNumber are required" });
    }
    const result = getValidAddOptions({
      entries: ctx.entries,
      state: ctx.state,
      divisionId,
      dayOfWeek,
      slotNumber,
    });
    if (result.error) return res.status(400).json({ error: result.error });
    return res.json({
      runId: ctx.runId || ctx.run.id,
      addable: result.addable,
      invalidReason: result.invalidReason,
      subjects: result.subjects,
      teachersBySubject: result.teachersBySubject,
      cell: result.cell,
      diagnostics: result.diagnostics ?? null,
      repairPlans: result.repairPlans ?? [],
    });
  });

  router.post("/timetable/valid-edit-targets", async (req, res) => {
    const ctx = await loadEditContext(req);
    if (ctx.error) return res.status(ctx.status || 400).json({ error: ctx.error });
    const source = req.body?.source;
    const scopeDivisionId = String(req.body?.scopeDivisionId || req.body?.divisionId || "").trim() || null;
    const result = getValidEditTargets({
      entries: ctx.entries,
      state: ctx.state,
      source,
      scopeDivisionId,
    });
    if (result.error) return res.status(400).json({ error: result.error });
    return res.json({
      runId: ctx.runId || ctx.run.id,
      source: result.source,
      targets: result.targets,
    });
  });

  router.post("/timetable/apply-edit", async (req, res) => {
    const ctx = await loadEditContext(req);
    if (ctx.error) return res.status(ctx.status || 400).json({ error: ctx.error });
    const operation = req.body?.operation;
    const source = req.body?.source;
    const target = req.body?.target;
    const result = applyTimetableEdit({
      entries: ctx.entries,
      state: ctx.state,
      source,
      target,
      operation,
      subjectId: req.body?.subjectId,
      teacherId: req.body?.teacherId,
    });
    if (!result.ok) {
      return res.status(400).json({
        error: result.error || "Edit not allowed",
        reasons: result.reasons || [],
      });
    }

    try {
      const output = await db.transaction(async (tx) => {
        const report = ctx.run.report_json ? JSON.parse(ctx.run.report_json) : {};
        const prevTimetable = {
          entries: ctx.entries,
          report,
          runId: ctx.run.id,
          manualEdits: [],
        };
        const { manualEdits, report: nextReport } = appendManualEditAudit(prevTimetable, {
          source,
          target,
          operation: result.operation,
          kind: result.kind,
          entriesBefore: ctx.entries,
          subjectId: req.body?.subjectId,
          teacherId: req.body?.teacherId,
        });
        const nextReportFull = mergeLiveReportFromEntries(ctx.state, result.entries, {
          ...nextReport,
          ...(report.validation ? { validation: report.validation } : {}),
        });
        const liveScore = nextReportFull.objective?.score ?? ctx.run.score;
        const liveStatus =
          liveScore > 85 ? "FEASIBLE" : liveScore > 60 ? "PARTIAL" : "INFEASIBLE";
        await tx.run(
          "UPDATE timetable_runs SET entries_json = ?, report_json = ?, score = ?, status = ? WHERE id = ? AND org_id = ?",
          JSON.stringify(result.entries),
          JSON.stringify(nextReportFull),
          liveScore,
          liveStatus,
          ctx.run.id,
          req.auth.orgId,
        );

        const tenantRow = await tx.get("SELECT state_json FROM tenant_state WHERE org_id = ?", req.auth.orgId);
        let tenantState = null;
        if (tenantRow?.state_json) {
          tenantState = migrateTenantState(JSON.parse(tenantRow.state_json)).state;
        }
        if (tenantState) {
          const lastGenerated = tenantState.lastGeneratedTimetable || {};
          const sameRun = !lastGenerated.runId || lastGenerated.runId === ctx.run.id;
          if (sameRun) {
            tenantState.lastGeneratedTimetable = {
              ...lastGenerated,
              entries: result.entries,
              report: nextReportFull,
              score: liveScore,
              status: liveStatus,
              manualEdits,
              runId: ctx.run.id,
            };
            await tx.run(
              "INSERT INTO tenant_state (org_id, state_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(org_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at",
              req.auth.orgId,
              JSON.stringify(tenantState),
              nowIso(),
            );
          }
        }

        await logAudit(tx, req.auth.orgId, req.auth.userId, "TIMETABLE_MANUAL_EDIT", "timetable_run", ctx.run.id, {
          operation: result.operation,
          kind: result.kind,
          source: source || null,
          target,
          subjectId: req.body?.subjectId || null,
          teacherId: req.body?.teacherId || null,
        });

        return {
          entries: result.entries,
          manualEdits,
          report: nextReportFull,
          score: liveScore,
          status: liveStatus,
          timetable: {
            entries: result.entries,
            manualEdits,
            report: nextReportFull,
            score: liveScore,
            status: liveStatus,
            runId: ctx.run.id,
          },
        };
      });

      return res.json({
        ok: true,
        runId: ctx.run.id,
        operation: result.operation,
        kind: result.kind,
        entries: output.entries,
        validation: result.validation,
        timetable: output.timetable,
      });
    } catch (err) {
      console.error("[timetable/apply-edit]", err);
      return res.status(500).json({ error: "Failed to apply timetable edit" });
    }
  });

  return router;
}

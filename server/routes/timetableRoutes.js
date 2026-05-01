import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getOrgCredits, logAudit, nowIso, schemas, writeCreditLedger } from "../services/common.js";
import { runTimetableEngine } from "../engine.js";
import { generateExportFile, normalizeExportScope } from "../services/exportService.js";

/** Express may give `string | string[]` for duplicate keys; take first stable value. */
function firstQueryParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function normalizeExportQueryType(type) {
  return String(type ?? "").trim().toUpperCase();
}

export function createTimetableRoutes(db) {
  const router = Router();

  router.post("/timetable/generate", async (req, res) => {
    const parsed = schemas.tenantStateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid generation payload", details: parsed.error.issues });
    const runId = randomUUID();
    try {
      const output = await db.transaction(async (tx) => {
        const credits = await getOrgCredits(tx, req.auth.orgId);
        if (credits <= 0) throw new Error("NO_CREDITS");
        await tx.run("UPDATE licenses SET credits_remaining = ?, updated_at = ? WHERE org_id = ?", credits - 1, nowIso(), req.auth.orgId);
        await writeCreditLedger(tx, req.auth.orgId, -1, "TIMETABLE_GENERATION", { runId });
        const result = runTimetableEngine(parsed.data);
        await tx.run(
          "INSERT INTO timetable_runs (id, org_id, status, score, created_by_user_id, created_at, report_json, entries_json, state_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          runId,
          req.auth.orgId,
          result.status,
          result.score,
          req.auth.userId,
          nowIso(),
          JSON.stringify(result.report),
          JSON.stringify(result.entries),
          JSON.stringify(parsed.data),
        );
        // Persist the same snapshot the engine used so PDF/Excel export always has tenant_state (client save is debounced and may not have run yet).
        await tx.run(
          "INSERT INTO tenant_state (org_id, state_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(org_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at",
          req.auth.orgId,
          JSON.stringify(parsed.data),
          nowIso(),
        );
        await logAudit(tx, req.auth.orgId, req.auth.userId, "TIMETABLE_GENERATED", "timetable_run", runId, { score: result.score, status: result.status });
        return { result, creditsRemaining: credits - 1 };
      });
      res.json({ timetable: output.result, license: { creditsRemaining: output.creditsRemaining }, runId });
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
      "SELECT id, status, score, report_json, entries_json, created_at FROM timetable_runs WHERE org_id = ? AND entries_json IS NOT NULL ORDER BY created_at DESC LIMIT 1",
      req.auth.orgId,
    );
    if (!row) return res.json({ run: null, timetable: null });
    try {
      const report = row.report_json ? JSON.parse(row.report_json) : {};
      const entries = row.entries_json ? JSON.parse(row.entries_json) : [];
      return res.json({
        run: { id: row.id, status: row.status, score: row.score, createdAt: row.created_at },
        timetable: { entries, score: row.score, status: row.status, report },
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

    const run = await db.get("SELECT id, entries_json, state_json FROM timetable_runs WHERE org_id = ? AND entries_json IS NOT NULL ORDER BY created_at DESC LIMIT 1", req.auth.orgId);
    if (!run) return res.status(404).json({ error: "No generated timetable available for export" });

    const stateRow = await db.get("SELECT state_json FROM tenant_state WHERE org_id = ?", req.auth.orgId);

    let entries = [];
    let state = null;
    try {
      entries = JSON.parse(run.entries_json || "[]");
      if (run.state_json) {
        state = JSON.parse(run.state_json);
      } else if (stateRow?.state_json) {
        state = JSON.parse(stateRow.state_json);
      } else {
        return res.status(404).json({ error: "Tenant state not found" });
      }
    } catch {
      return res.status(500).json({ error: "Stored timetable data is invalid" });
    }
    if (!state || typeof state !== "object") {
      return res.status(500).json({ error: "Stored timetable data is invalid" });
    }

    try {
      const file = await generateExportFile({ type, scope, state, entries });
      res.setHeader("Content-Type", file.contentType);
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

  return router;
}

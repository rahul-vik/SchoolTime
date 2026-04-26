import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getOrgCredits, logAudit, nowIso, schemas, writeCreditLedger } from "../services/common.js";
import { runTimetableEngine } from "../engine.js";

export function createB2BRoutes(db) {
  const router = Router();

  router.post("/b2b/timetable/generate", async (req, res) => {
    const parsed = schemas.tenantStateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid generation payload", details: parsed.error.issues });
    const runId = randomUUID();

    try {
      const output = await db.transaction(async (tx) => {
        const credits = await getOrgCredits(tx, req.auth.orgId);
        if (credits <= 0) throw new Error("NO_CREDITS");
        await tx.run("UPDATE licenses SET credits_remaining = ?, updated_at = ? WHERE org_id = ?", credits - 1, nowIso(), req.auth.orgId);
        await writeCreditLedger(tx, req.auth.orgId, -1, "B2B_TIMETABLE_GENERATION", { runId, apiKeyId: req.auth.apiKeyId });
        const result = runTimetableEngine(parsed.data);
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
        await logAudit(tx, req.auth.orgId, null, "B2B_TIMETABLE_GENERATED", "timetable_run", runId, { apiKeyId: req.auth.apiKeyId, score: result.score });
        return { result, creditsRemaining: credits - 1 };
      });
      res.json({ timetable: output.result, license: { creditsRemaining: output.creditsRemaining }, runId });
    } catch (error) {
      if (error.message === "NO_CREDITS") return res.status(402).json({ error: "No credits remaining. Purchase a 10-pack to continue." });
      return res.status(500).json({ error: "Generation failed" });
    }
  });

  return router;
}

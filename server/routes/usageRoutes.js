import { Router } from "express";
import { getOrgCredits } from "../services/common.js";

export function createUsageRoutes(db) {
  const router = Router();
  router.get("/usage", async (req, res) => {
    const orgId = req.auth.orgId;
    const credits = await getOrgCredits(db, orgId);
    const totalUsers = (await db.get("SELECT COUNT(*) c FROM users WHERE org_id = ?", orgId))?.c || 0;
    const totalRuns = (await db.get("SELECT COUNT(*) c FROM timetable_runs WHERE org_id = ?", orgId))?.c || 0;
    const successfulRuns = (await db.get("SELECT COUNT(*) c FROM timetable_runs WHERE org_id = ? AND status = 'FEASIBLE'", orgId))?.c || 0;
    const recentCredits = await db.all("SELECT id, delta, reason, created_at FROM credit_ledger WHERE org_id = ? ORDER BY created_at DESC LIMIT 20", orgId);
    // Use GROUP BY expression (not alias "day") — "day" is reserved in PostgreSQL and breaks GROUP BY day.
    const byDayRows = await db.all(
      "SELECT substr(created_at, 1, 10) AS run_day, COUNT(*) AS run_count FROM timetable_runs WHERE org_id = ? GROUP BY substr(created_at, 1, 10) ORDER BY substr(created_at, 1, 10) DESC LIMIT 14",
      orgId,
    );
    const byDay = byDayRows
      .map((r) => ({ day: r.run_day, count: Number(r.run_count) }))
      .reverse();
    res.json({ summary: { creditsRemaining: credits, totalUsers, totalRuns, successfulRuns }, recentCredits, byDay });
  });
  return router;
}

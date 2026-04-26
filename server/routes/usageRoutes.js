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
    const byDay = await db.all("SELECT substr(created_at,1,10) day, COUNT(*) count FROM timetable_runs WHERE org_id = ? GROUP BY day ORDER BY day DESC LIMIT 14", orgId);
    res.json({ summary: { creditsRemaining: credits, totalUsers, totalRuns, successfulRuns }, recentCredits, byDay: byDay.reverse() });
  });
  return router;
}

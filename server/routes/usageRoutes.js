import { Router } from "express";
import { getOrgCredits } from "../services/common.js";

export function createUsageRoutes(db) {
  const router = Router();
  router.get("/usage", (req, res) => {
    const orgId = req.auth.orgId;
    const credits = getOrgCredits(db, orgId);
    const totalUsers = db.prepare("SELECT COUNT(*) c FROM users WHERE org_id = ?").get(orgId).c;
    const totalRuns = db.prepare("SELECT COUNT(*) c FROM timetable_runs WHERE org_id = ?").get(orgId).c;
    const successfulRuns = db.prepare("SELECT COUNT(*) c FROM timetable_runs WHERE org_id = ? AND status = 'FEASIBLE'").get(orgId).c;
    const recentCredits = db.prepare("SELECT id, delta, reason, created_at FROM credit_ledger WHERE org_id = ? ORDER BY created_at DESC LIMIT 20").all(orgId);
    const byDay = db.prepare("SELECT substr(created_at,1,10) day, COUNT(*) count FROM timetable_runs WHERE org_id = ? GROUP BY day ORDER BY day DESC LIMIT 14").all(orgId);
    res.json({ summary: { creditsRemaining: credits, totalUsers, totalRuns, successfulRuns }, recentCredits, byDay: byDay.reverse() });
  });
  return router;
}

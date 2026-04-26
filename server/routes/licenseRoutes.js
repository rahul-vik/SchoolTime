import { Router } from "express";
import { getOrgCredits, logAudit, nowIso, writeCreditLedger } from "../services/common.js";

export function createLicenseRoutes(db) {
  const router = Router();
  router.post("/license/purchase-pack", (req, res) => {
    const packSize = 10;
    const creditsRemaining = db.transaction(() => {
      const current = getOrgCredits(db, req.auth.orgId);
      db.prepare("UPDATE licenses SET credits_remaining = ?, updated_at = ? WHERE org_id = ?").run(current + packSize, nowIso(), req.auth.orgId);
      writeCreditLedger(db, req.auth.orgId, packSize, "MANUAL_PACK_PURCHASE", { packSize });
      logAudit(db, req.auth.orgId, req.auth.userId, "LICENSE_PACK_PURCHASED", "license", req.auth.orgId, { packSize });
      return current + packSize;
    })();
    res.json({ license: { creditsRemaining, packSize } });
  });
  return router;
}

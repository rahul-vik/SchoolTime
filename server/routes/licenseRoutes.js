import { Router } from "express";
import { getOrgCredits, logAudit, nowIso, writeCreditLedger } from "../services/common.js";

export function createLicenseRoutes(db) {
  const router = Router();
  router.post("/license/purchase-pack", async (req, res) => {
    const packSize = 10;
    const creditsRemaining = await db.transaction(async (tx) => {
      const current = await getOrgCredits(tx, req.auth.orgId);
      await tx.run("UPDATE licenses SET credits_remaining = ?, updated_at = ? WHERE org_id = ?", current + packSize, nowIso(), req.auth.orgId);
      await writeCreditLedger(tx, req.auth.orgId, packSize, "MANUAL_PACK_PURCHASE", { packSize });
      await logAudit(tx, req.auth.orgId, req.auth.userId, "LICENSE_PACK_PURCHASED", "license", req.auth.orgId, { packSize });
      return current + packSize;
    });
    res.json({ license: { creditsRemaining, packSize } });
  });
  return router;
}

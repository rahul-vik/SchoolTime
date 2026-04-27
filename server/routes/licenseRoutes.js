import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getOrgCredits, logAudit, nowIso, schemas, writeCreditLedger } from "../services/common.js";
import { getCreditPackPriceCents, getCreditPackSize } from "../services/platformSettings.js";

export function createLicenseRoutes(db) {
  const router = Router();

  /** Pack size and list price (informational) for the purchase-credits screen. */
  router.get("/license/purchase-pack-info", async (_req, res) => {
    const packSize = await getCreditPackSize(db);
    const priceCents = await getCreditPackPriceCents(db);
    res.json({ packSize, priceCents });
  });

  /** School owner/admin submits a request; platform portal must approve before credits are added. */
  router.post("/license/purchase-request", async (req, res) => {
    const parsed = schemas.creditPurchaseRequestSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    const packSize = await getCreditPackSize(db);
    const packCount = parsed.data.packCount;
    const creditsTotal = packCount * packSize;
    const id = randomUUID();
    const note = parsed.data.note?.trim() || null;
    const createdAt = nowIso();
    await db.run(
      `INSERT INTO credit_purchase_requests (id, org_id, user_id, pack_count, credits_total, status, requester_note, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      id,
      req.auth.orgId,
      req.auth.userId,
      packCount,
      creditsTotal,
      note,
      createdAt,
    );
    await logAudit(db, req.auth.orgId, req.auth.userId, "CREDIT_PURCHASE_REQUESTED", "credit_purchase_request", id, {
      packCount,
      packSize,
      creditsTotal,
    });
    res.json({
      ok: true,
      request: { id, status: "pending", packCount, creditsTotal, packSize, createdAt },
      message: "Purchase request sent. Credits are added after platform approval.",
    });
  });

  router.get("/license/my-credit-purchase-requests", async (req, res) => {
    const rows = await db.all(
      `SELECT id, pack_count, credits_total, status, requester_note, created_at, resolved_at, resolver_note
       FROM credit_purchase_requests WHERE org_id = ? ORDER BY created_at DESC LIMIT 50`,
      req.auth.orgId,
    );
    res.json({ requests: rows });
  });

  return router;
}

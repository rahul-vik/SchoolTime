import crypto from "node:crypto";
import { Router } from "express";
import { hashPassword } from "../auth.js";
import { getOrgCredits, logAudit, nowIso, schemas, writeCreditLedger } from "../services/common.js";
import { createOrgWithOwnerUser } from "../services/registrationService.js";
import { getSignupInitialCredits, getAllPlatformSettings, getRoleAccessPolicy, upsertPlatformSettings, upsertRoleAccessPolicy } from "../services/platformSettings.js";
import { listPlatformErrors } from "../services/platformErrorLog.js";
import { deleteUserInTransaction } from "../services/platformUserLifecycle.js";
import { purgeOrganizationInTransaction } from "../services/platformOrgDelete.js";
import {
  exportOrganizationBundle,
  exportOrganizationTimetableSetupBundle,
  importOrganizationBundleInTransaction,
  importOrganizationTimetableSetupBundleInTransaction,
  creatorOrgBundleImportBodySchema,
  remapBundleOrganizationId,
  remapTimetableSetupBundleOrganizationId,
} from "../services/platformOrgBundle.js";

function parseLimitOffset(req, { defaultLimit = 50, maxLimit = 100 } = {}) {
  const limit = Math.min(maxLimit, Math.max(1, parseInt(String(req.query.limit || defaultLimit), 10) || defaultLimit));
  const offset = Math.max(0, parseInt(String(req.query.offset || "0"), 10) || 0);
  return { limit, offset };
}

function generatePortalTempPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(16);
  let s = "";
  for (let i = 0; i < 14; i++) s += chars[bytes[i] % chars.length];
  return s;
}

export function createCreatorRoutes(db) {
  const router = Router();

  router.get("/overview", async (_req, res) => {
    const row = await db.get(
      `SELECT
        (SELECT COUNT(*) FROM organizations) AS org_count,
        (SELECT COUNT(*) FROM users) AS user_count,
        (SELECT COALESCE(SUM(credits_remaining), 0) FROM licenses) AS total_credits_remaining`,
    );
    const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const errors24h = await db.get("SELECT COUNT(*) AS c FROM platform_error_logs WHERE created_at >= ?", sinceIso);
    res.json({
      organizations: Number(row?.org_count || 0),
      users: Number(row?.user_count || 0),
      creditsRemainingAcrossOrgs: Number(row?.total_credits_remaining || 0),
      errorLogsLast24h: Number(errors24h?.c || 0),
    });
  });

  router.get("/orgs", async (req, res) => {
    const { limit, offset } = parseLimitOffset(req);
    const sortByRaw = String(req.query.sortBy || "created").toLowerCase();
    const sortDirRaw = String(req.query.sortDir || "desc").toLowerCase();
    const sortByMap = {
      created: "o.created_at",
      lastActive: "last_activity_at",
    };
    const orderColumn = sortByMap[sortByRaw] || sortByMap.created;
    const orderDir = sortDirRaw === "asc" ? "ASC" : "DESC";
    const totalRow = await db.get("SELECT COUNT(*) AS c FROM organizations");
    const rows = await db.all(
      `SELECT o.id, o.name, o.created_at,
        COALESCE(l.credits_remaining, 0) AS credits_remaining,
        (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id) AS user_count,
        (SELECT MAX(a.created_at) FROM audit_logs a WHERE a.org_id = o.id) AS last_activity_at
       FROM organizations o
       LEFT JOIN licenses l ON l.org_id = o.id
       ORDER BY ${orderColumn} ${orderDir}, o.created_at DESC
       LIMIT ? OFFSET ?`,
      limit,
      offset,
    );
    res.json({ orgs: rows, total: Number(totalRow?.c || 0), limit, offset, sortBy: sortByRaw, sortDir: orderDir.toLowerCase() });
  });

  router.get("/org-purges", async (req, res) => {
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "50"), 10) || 50));
    const rows = await db.all(
      "SELECT id, created_at, org_id, org_name, summary_json, notes FROM platform_org_purges ORDER BY created_at DESC LIMIT ?",
      limit,
    );
    const purges = rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      orgId: r.org_id,
      orgName: r.org_name,
      notes: r.notes,
      summary: (() => {
        try {
          return JSON.parse(r.summary_json);
        } catch {
          return null;
        }
      })(),
    }));
    res.json({ purges });
  });

  router.delete("/orgs/:orgId", async (req, res) => {
    const orgId = String(req.params.orgId || "").trim();
    if (!orgId) return res.status(400).json({ error: "Invalid org" });
    const parsed = schemas.creatorOrgDeleteSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    try {
      await db.transaction(async (tx) => {
        await purgeOrganizationInTransaction(tx, orgId, {
          confirmationName: parsed.data.confirmationName,
          notes: parsed.data.notes ?? null,
        });
      });
      res.json({ ok: true });
    } catch (e) {
      if (e.message === "NOT_FOUND") return res.status(404).json({ error: "Organization not found" });
      if (e.message === "NAME_MISMATCH") {
        return res.status(400).json({ error: "Confirmation name must exactly match the organization name (trimmed)." });
      }
      throw e;
    }
  });

  router.get("/orgs/:orgId/export-bundle", async (req, res) => {
    const orgId = String(req.params.orgId || "").trim();
    if (!orgId) return res.status(400).json({ error: "Invalid org" });
    const scopeRaw = String(req.query.scope || "full").trim().toLowerCase();
    const scope = scopeRaw === "timetable" ? "timetable" : "full";
    try {
      const bundle =
        scope === "timetable" ? await exportOrganizationTimetableSetupBundle(db, orgId) : await exportOrganizationBundle(db, orgId);
      const slug = String(bundle.organization.name || "org")
        .trim()
        .replace(/[^\w\-]+/g, "_")
        .slice(0, 48);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const filename =
        scope === "timetable"
          ? `schooltime-org-${slug}-${orgId}-timetable-setup.json`
          : `schooltime-org-${slug}-${orgId}.json`;
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(JSON.stringify(bundle, null, 2));
    } catch (e) {
      if (e.message === "NOT_FOUND") return res.status(404).json({ error: "Organization not found" });
      throw e;
    }
  });

  router.post("/orgs/:orgId/import-bundle", async (req, res) => {
    const orgId = String(req.params.orgId || "").trim();
    if (!orgId) return res.status(400).json({ error: "Invalid org", errorCode: "INVALID_ORG" });
    const parsed = creatorOrgBundleImportBodySchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.issues, errorCode: "INVALID_REQUEST" });
    }
    const {
      scope: importScope,
      bundle,
      remapBundleOrgIdToUrlOrg,
      confirmationName,
      confirmationSourceOrganizationName,
      confirmationTargetOrganizationName,
    } = parsed.data;
    if (!bundle || typeof bundle !== "object") {
      return res.status(400).json({ error: "Missing bundle", errorCode: "MISSING_BUNDLE" });
    }

    const scope = importScope === "timetable" ? "timetable" : "full";
    const remap = Boolean(remapBundleOrgIdToUrlOrg);
    let bundleForImport = bundle;
    let confirmationForImport = String(confirmationName || "").trim();
    let auditExtra = {};

    if (remap) {
      const targetRow = await db.get("SELECT id, name FROM organizations WHERE id = ?", orgId);
      if (!targetRow) return res.status(404).json({ error: "Organization not found", errorCode: "TARGET_ORG_NOT_FOUND" });

      const sourceNameTrim = String(confirmationSourceOrganizationName || "").trim();
      const targetNameTrim = String(confirmationTargetOrganizationName || "").trim();
      const bundleOrgName = String(bundle.organization?.name || "").trim();
      const bundleOrgId = String(bundle.organization?.id || "").trim();

      if (!bundleOrgId) {
        return res.status(400).json({ error: "Bundle is missing organization.id", errorCode: "INVALID_BUNDLE" });
      }
      if (sourceNameTrim !== bundleOrgName) {
        return res.status(400).json({
          error: "Source confirmation must exactly match organization.name in the bundle (trimmed).",
          errorCode: "SOURCE_NAME_MISMATCH",
        });
      }
      if (targetNameTrim !== String(targetRow.name || "").trim()) {
        return res.status(400).json({
          error: "Target confirmation must exactly match this organization's name in the database (trimmed).",
          errorCode: "TARGET_NAME_MISMATCH",
        });
      }

      try {
        bundleForImport = scope === "timetable" ? remapTimetableSetupBundleOrganizationId(bundle, orgId) : remapBundleOrganizationId(bundle, orgId);
      } catch (e) {
        if (e.message === "REMAP_ORG_ID_INCONSISTENT") {
          return res.status(400).json({
            error:
              "Bundle contains an org_id that does not match the bundle's organization.id; refusing remap. Re-export from source or fix the JSON.",
            errorCode: "REMAP_ORG_ID_INCONSISTENT",
            detail: e.detail || null,
          });
        }
        if (e.message === "INVALID_BUNDLE") {
          return res.status(400).json({ error: "Invalid bundle payload", details: e.details || null, errorCode: "INVALID_BUNDLE" });
        }
        throw e;
      }

      confirmationForImport = sourceNameTrim;
      auditExtra = { remappedOrgIdFrom: bundleOrgId, remapBundleOrgIdToUrlOrg: true };
    } else if (String(bundle.organization?.id || "").trim() !== orgId) {
      return res.status(400).json({
        error:
          "Bundle organization.id must match the URL org id. To load a bundle from another org into this row, enable remap in the portal and confirm both organization names (see API docs).",
        errorCode: "ORG_ID_MISMATCH",
      });
    }

    try {
      const out = await db.transaction(async (tx) => {
        if (scope === "timetable") {
          const result = await importOrganizationTimetableSetupBundleInTransaction(tx, bundleForImport, {
            targetOrgId: orgId,
            confirmationName: confirmationForImport,
          });
          await logAudit(tx, orgId, null, "PLATFORM_ORG_TIMETABLE_SETUP_IMPORT", "organization", orgId, {
            bundleVersion: bundleForImport.bundleVersion,
            bundleKind: bundleForImport.bundleKind,
            ...auditExtra,
          });
          return { ...result, scope: "timetable" };
        }
        const result = await importOrganizationBundleInTransaction(tx, bundleForImport, {
          targetOrgId: orgId,
          confirmationName: confirmationForImport,
        });
        await logAudit(tx, orgId, null, "PLATFORM_ORG_BUNDLE_IMPORT", "organization", orgId, {
          userCount: result.userCount,
          bundleVersion: bundleForImport.bundleVersion,
          ...auditExtra,
        });
        return { ...result, scope: "full" };
      });
      if (out.scope === "timetable") {
        res.json({
          ok: true,
          orgId: out.orgId,
          scope: "timetable",
          remapped: remap,
          message: remap
            ? "Timetable setup imported; bundle org id was remapped to this organization. Previous timetable runs were removed."
            : "Timetable setup imported; tenant_state was updated and previous timetable runs were removed.",
        });
      } else {
        res.json({
          ok: true,
          orgId: out.orgId,
          scope: "full",
          userCount: out.userCount,
          remapped: remap,
          message: remap
            ? "Bundle imported; ids in the file were remapped to this organization."
            : "Bundle imported; this organization's data was replaced from the file.",
        });
      }
    } catch (e) {
      if (e.message === "NOT_FOUND") {
        return res.status(404).json({ error: "Organization not found", errorCode: "NOT_FOUND" });
      }
      if (e.message === "NAME_MISMATCH") {
        return res.status(400).json({
          error: "Confirmation name must exactly match the organization name in the bundle (trimmed).",
          errorCode: "NAME_MISMATCH",
        });
      }
      if (e.message === "ORG_ID_MISMATCH" || e.message === "USER_ORG_MISMATCH") {
        return res.status(400).json({
          error: "Bundle org or user org_id does not match URL organization id.",
          errorCode: e.message,
        });
      }
      if (e.message === "INVALID_BUNDLE") {
        return res.status(400).json({ error: "Invalid bundle payload", details: e.details || null, errorCode: "INVALID_BUNDLE" });
      }
      if (e.message === "EMAIL_IN_USE") {
        return res.status(400).json({
          error:
            "One or more bundle user emails are already registered to another organization. Change or remove those accounts elsewhere, adjust emails in the bundle, then retry.",
          errorCode: "EMAIL_IN_USE",
          emails: Array.isArray(e.emails) ? e.emails : [],
        });
      }
      throw e;
    }
  });

  router.get("/users", async (req, res) => {
    const { limit, offset } = parseLimitOffset(req);
    const q = String(req.query.q || "").trim().slice(0, 80);
    let where = "";
    const args = [];
    if (q) {
      where = "WHERE (LOWER(u.email) LIKE ? OR LOWER(u.full_name) LIKE ? OR LOWER(o.name) LIKE ?)";
      const like = `%${q.toLowerCase()}%`;
      args.push(like, like, like);
    }
    const totalRow = await db.get(`SELECT COUNT(*) AS c FROM users u JOIN organizations o ON o.id = u.org_id ${where}`, ...args);
    const rows = await db.all(
      `SELECT u.id, u.org_id, u.full_name, u.email, u.role, u.created_at, u.is_active, o.name AS org_name,
        (SELECT MAX(a.created_at) FROM audit_logs a WHERE a.user_id = u.id) AS last_activity_at
       FROM users u
       JOIN organizations o ON o.id = u.org_id
       ${where}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      ...args,
      limit,
      offset,
    );
    res.json({ users: rows, total: Number(totalRow?.c || 0), limit, offset });
  });

  router.get("/credit-ledger", async (req, res) => {
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || "80"), 10) || 80));
    const orgId = String(req.query.orgId || "").trim() || null;
    let where = "";
    const args = [];
    if (orgId) {
      where = "WHERE c.org_id = ?";
      args.push(orgId);
    }
    const rows = await db.all(
      `SELECT c.id, c.org_id, c.delta, c.reason, c.created_at, c.metadata_json, o.name AS org_name
       FROM credit_ledger c
       JOIN organizations o ON o.id = c.org_id
       ${where}
       ORDER BY c.created_at DESC
       LIMIT ?`,
      ...args,
      limit,
    );
    res.json({ entries: rows });
  });

  router.get("/credit-purchase-requests", async (req, res) => {
    const status = String(req.query.status || "pending").toLowerCase();
    const allowed = new Set(["pending", "approved", "rejected", "all"]);
    if (!allowed.has(status)) return res.status(400).json({ error: "Invalid status" });
    let where = "WHERE r.status = 'pending'";
    if (status === "approved") where = "WHERE r.status = 'approved'";
    if (status === "rejected") where = "WHERE r.status = 'rejected'";
    if (status === "all") where = "";
    const rows = await db.all(
      `SELECT r.id, r.created_at, r.org_id, r.user_id, r.pack_count, r.credits_total, r.status, r.requester_note, r.resolved_at, r.resolver_note,
        o.name AS org_name, u.email AS requester_email, u.full_name AS requester_name
       FROM credit_purchase_requests r
       JOIN organizations o ON o.id = r.org_id
       JOIN users u ON u.id = r.user_id
       ${where}
       ORDER BY r.created_at DESC
       LIMIT 120`,
    );
    res.json({ requests: rows });
  });

  router.post("/credit-purchase-requests/:requestId/approve", async (req, res) => {
    const requestId = String(req.params.requestId || "").trim();
    if (!requestId) return res.status(400).json({ error: "Invalid request" });
    try {
      const out = await db.transaction(async (tx) => {
        const row = await tx.get(
          "SELECT id, org_id, user_id, pack_count, credits_total, status FROM credit_purchase_requests WHERE id = ?",
          requestId,
        );
        if (!row) throw new Error("NOT_FOUND");
        if (row.status !== "pending") throw new Error("NOT_PENDING");
        const current = await getOrgCredits(tx, row.org_id);
        const next = current + row.credits_total;
        await tx.run("UPDATE licenses SET credits_remaining = ?, updated_at = ? WHERE org_id = ?", next, nowIso(), row.org_id);
        await writeCreditLedger(tx, row.org_id, row.credits_total, "PURCHASE_APPROVED", { requestId: row.id, packCount: row.pack_count });
        await tx.run(
          "UPDATE credit_purchase_requests SET status = 'approved', resolved_at = ?, resolver_note = NULL WHERE id = ?",
          nowIso(),
          requestId,
        );
        await logAudit(tx, row.org_id, null, "CREDIT_PURCHASE_APPROVED", "credit_purchase_request", requestId, {
          creditsTotal: row.credits_total,
          requesterUserId: row.user_id,
        });
        return { orgId: row.org_id, creditsRemaining: next };
      });
      res.json({ ok: true, ...out });
    } catch (e) {
      if (e.message === "NOT_FOUND") return res.status(404).json({ error: "Request not found" });
      if (e.message === "NOT_PENDING") return res.status(409).json({ error: "Request is not pending" });
      throw e;
    }
  });

  router.post("/credit-purchase-requests/:requestId/reject", async (req, res) => {
    const requestId = String(req.params.requestId || "").trim();
    if (!requestId) return res.status(400).json({ error: "Invalid request" });
    const parsed = schemas.creatorCreditPurchaseRejectSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    const row = await db.get("SELECT id, org_id, status FROM credit_purchase_requests WHERE id = ?", requestId);
    if (!row) return res.status(404).json({ error: "Request not found" });
    if (row.status !== "pending") return res.status(409).json({ error: "Request is not pending" });
    const note = parsed.data.note?.trim() || null;
    await db.run(
      "UPDATE credit_purchase_requests SET status = 'rejected', resolved_at = ?, resolver_note = ? WHERE id = ?",
      nowIso(),
      note,
      requestId,
    );
    await logAudit(db, row.org_id, null, "CREDIT_PURCHASE_REJECTED", "credit_purchase_request", requestId, { note });
    res.json({ ok: true });
  });

  router.post("/orgs/:orgId/credits", async (req, res) => {
    const orgId = String(req.params.orgId || "").trim();
    if (!orgId) return res.status(400).json({ error: "Invalid org" });
    const parsed = schemas.creatorCreditsAdjustSchema.safeParse(req.body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const msg = flat.fieldErrors.delta?.[0] || "Invalid request";
      return res.status(400).json({ error: msg, details: parsed.error.issues });
    }
    const org = await db.get("SELECT id FROM organizations WHERE id = ?", orgId);
    if (!org) return res.status(404).json({ error: "Organization not found" });
    try {
      const creditsRemaining = await db.transaction(async (tx) => {
        const current = await getOrgCredits(tx, orgId);
        const next = current + parsed.data.delta;
        if (next < 0) throw new Error("NEGATIVE");
        await tx.run("UPDATE licenses SET credits_remaining = ?, updated_at = ? WHERE org_id = ?", next, nowIso(), orgId);
        await writeCreditLedger(tx, orgId, parsed.data.delta, "PLATFORM_ADJUSTMENT", { reason: parsed.data.reason });
        await logAudit(tx, orgId, null, "PLATFORM_CREDIT_ADJUST", "license", orgId, { delta: parsed.data.delta, reason: parsed.data.reason });
        return next;
      });
      res.json({ ok: true, orgId, creditsRemaining });
    } catch (e) {
      if (e.message === "NEGATIVE") return res.status(400).json({ error: "Adjustment would make credits negative" });
      throw e;
    }
  });

  router.patch("/users/:userId/active", async (req, res) => {
    const userId = String(req.params.userId || "").trim();
    if (!userId) return res.status(400).json({ error: "Invalid user" });
    const parsed = schemas.creatorUserActiveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    const u = await db.get("SELECT id, org_id, email, role FROM users WHERE id = ?", userId);
    if (!u) return res.status(404).json({ error: "User not found" });
    await db.transaction(async (tx) => {
      await tx.run("UPDATE users SET is_active = ? WHERE id = ?", parsed.data.isActive ? 1 : 0, userId);
      if (!parsed.data.isActive) {
        await tx.run("UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", nowIso(), userId);
      }
      await logAudit(tx, u.org_id, null, parsed.data.isActive ? "PLATFORM_USER_ACTIVATED" : "PLATFORM_USER_DEACTIVATED", "user", userId, { email: u.email, role: u.role });
    });
    res.json({ ok: true, userId, isActive: parsed.data.isActive });
  });

  router.post("/users/:userId/set-password", async (req, res) => {
    const userId = String(req.params.userId || "").trim();
    if (!userId) return res.status(400).json({ error: "Invalid user" });
    const parsed = schemas.creatorUserPasswordSetSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    const u = await db.get("SELECT id, org_id, email FROM users WHERE id = ?", userId);
    if (!u) return res.status(404).json({ error: "User not found" });
    const raw = parsed.data.password;
    let plain = typeof raw === "string" ? raw.trim() : "";
    if (plain && plain.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters, or leave blank to auto-generate" });
    }
    if (!plain) plain = generatePortalTempPassword();
    await db.transaction(async (tx) => {
      await tx.run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(plain), userId);
      await tx.run("UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", nowIso(), userId);
      await logAudit(tx, u.org_id, null, "PLATFORM_USER_PASSWORD_SET", "user", userId, {
        email: u.email,
        generated: !raw || !String(raw).trim(),
      });
    });
    res.json({ ok: true, userId, newPassword: plain });
  });

  router.patch("/users/:userId", async (req, res) => {
    const userId = String(req.params.userId || "").trim();
    if (!userId) return res.status(400).json({ error: "Invalid user" });
    const parsed = schemas.creatorUserPatchSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    const existing = await db.get("SELECT id, org_id, email, full_name, role FROM users WHERE id = ?", userId);
    if (!existing) return res.status(404).json({ error: "User not found" });
    const nextEmail = parsed.data.email ? parsed.data.email.trim().toLowerCase() : null;
    if (nextEmail) {
      const clash = await db.get("SELECT id FROM users WHERE email = ? AND id <> ?", nextEmail, userId);
      if (clash) return res.status(409).json({ error: "Email already registered" });
    }
    const sets = [];
    const vals = [];
    if (parsed.data.fullName !== undefined) {
      sets.push("full_name = ?");
      vals.push(parsed.data.fullName.trim());
    }
    if (nextEmail !== null) {
      sets.push("email = ?");
      vals.push(nextEmail);
    }
    if (parsed.data.role !== undefined) {
      sets.push("role = ?");
      vals.push(parsed.data.role);
    }
    vals.push(userId);
    await db.run(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, ...vals);
    await logAudit(db, existing.org_id, null, "PLATFORM_USER_UPDATED", "user", userId, {
      fullNameChanged: parsed.data.fullName !== undefined,
      emailChanged: nextEmail !== null,
      roleChanged: parsed.data.role !== undefined,
    });
    const row = await db.get(
      `SELECT u.id, u.org_id, u.full_name, u.email, u.role, u.created_at, u.is_active, o.name AS org_name,
        (SELECT MAX(a.created_at) FROM audit_logs a WHERE a.user_id = u.id) AS last_activity_at
       FROM users u
       JOIN organizations o ON o.id = u.org_id
       WHERE u.id = ?`,
      userId,
    );
    res.json({ ok: true, user: row });
  });

  router.delete("/users/:userId", async (req, res) => {
    const userId = String(req.params.userId || "").trim();
    if (!userId) return res.status(400).json({ error: "Invalid user" });
    try {
      await db.transaction(async (tx) => {
        await deleteUserInTransaction(tx, userId);
      });
      res.json({ ok: true, userId });
    } catch (e) {
      if (e.message === "NOT_FOUND") return res.status(404).json({ error: "User not found" });
      if (e.message === "SOLE_USER_IN_ORG") {
        return res.status(409).json({
          error: "This is the only user in the organization. Remove or merge the org in the database, or deactivate the account instead.",
        });
      }
      if (e.message === "NO_FALLBACK_USER") {
        return res.status(409).json({ error: "No other active user in this organization to reassign records. Activate another user first." });
      }
      throw e;
    }
  });

  router.post("/register-org", async (req, res) => {
    const parsed = schemas.creatorRegisterOrgSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    const { orgName, fullName, email, password } = parsed.data;
    const emailNorm = email.trim().toLowerCase();
    if (await db.get("SELECT id FROM users WHERE email = ?", emailNorm)) {
      return res.status(409).json({ error: "Email already registered" });
    }
    const defaultInitial = await getSignupInitialCredits(db);
    const initialCredits = parsed.data.initialCredits != null ? parsed.data.initialCredits : defaultInitial;
    const capped = Math.max(0, Math.min(1_000_000, Math.floor(Number(initialCredits))));
    const { orgId, userId } = await db.transaction(async (tx) =>
      createOrgWithOwnerUser(tx, {
        orgName,
        fullName,
        emailNorm,
        plainPassword: password,
        initialCredits: capped,
        creditLedgerReason: "CREATOR_SIGNUP",
        creditLedgerMeta: { notes: "Organization created from platform portal", initialCredits: capped },
      }),
    );
    res.status(201).json({
      ok: true,
      orgId,
      userId,
      email: emailNorm,
      initialCredits: capped,
      message: "Share the email and password with the school owner so they can sign in from the main app.",
    });
  });

  router.get("/platform-settings", async (_req, res) => {
    const settings = await getAllPlatformSettings(db);
    res.json({ settings });
  });

  router.patch("/platform-settings", async (req, res) => {
    const parsed = schemas.creatorSettingsPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    const entries = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return res.status(400).json({ error: "No settings to update" });
    const partial = Object.fromEntries(entries);
    await upsertPlatformSettings(db, partial);
    const settings = await getAllPlatformSettings(db);
    res.json({ ok: true, settings });
  });

  router.get("/role-access", async (_req, res) => {
    const policy = await getRoleAccessPolicy(db);
    res.json({ policy });
  });

  router.put("/role-access", async (req, res) => {
    const parsed = schemas.creatorRoleAccessPolicySchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    const deduped = [];
    const seen = new Set();
    for (const role of parsed.data.roles) {
      const key = role.key.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push({ ...role, key });
    }
    const policy = { roles: deduped };
    await upsertRoleAccessPolicy(db, policy);
    res.json({ ok: true, policy });
  });

  router.get("/error-logs", async (req, res) => {
    const limit = Math.min(300, Math.max(1, parseInt(String(req.query.limit || "100"), 10) || 100));
    const rows = await listPlatformErrors(db, { limit });
    res.json({ logs: rows });
  });

  router.get("/audit-logs", async (req, res) => {
    const limit = Math.min(250, Math.max(1, parseInt(String(req.query.limit || "100"), 10) || 100));
    const orgId = String(req.query.orgId || "").trim() || null;
    const q = String(req.query.q || "").trim().slice(0, 80);
    let where = "WHERE 1=1";
    const args = [];
    if (orgId) {
      where += " AND a.org_id = ?";
      args.push(orgId);
    }
    if (q) {
      where += " AND (a.action LIKE ? OR a.entity_type LIKE ? OR COALESCE(u.full_name,'') LIKE ?)";
      const like = `%${q}%`;
      args.push(like, like, like);
    }
    const rows = await db.all(
      `SELECT a.id, a.org_id, a.user_id, a.action, a.entity_type, a.entity_id, a.metadata_json, a.created_at,
        o.name AS org_name,
        u.full_name AS user_name
       FROM audit_logs a
       JOIN organizations o ON o.id = a.org_id
       LEFT JOIN users u ON u.id = a.user_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT ?`,
      ...args,
      limit,
    );
    res.json({ logs: rows });
  });

  router.get("/validation-findings", async (req, res) => {
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || "100"), 10) || 100));
    const orgId = String(req.query.orgId || "").trim() || null;
    let where = "WHERE a.action = 'TIMETABLE_VALIDATED' AND a.entity_type = 'timetable_run'";
    const args = [];
    if (orgId) {
      where += " AND a.org_id = ?";
      args.push(orgId);
    }
    const rows = await db.all(
      `SELECT a.entity_id, a.metadata_json, a.created_at, o.name AS org_name, a.org_id
       FROM audit_logs a
       JOIN organizations o ON o.id = a.org_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT ?`,
      ...args,
      limit,
    );
    const findings = [];
    for (const row of rows) {
      let meta = null;
      try {
        meta = row.metadata_json ? JSON.parse(row.metadata_json) : null;
      } catch {
        meta = null;
      }
      const list = Array.isArray(meta?.findings) ? meta.findings : [];
      for (const f of list) findings.push({ ...f, runId: row.entity_id, orgId: row.org_id, orgName: row.org_name, validationLoggedAt: row.created_at });
    }
    res.json({ findings, total: findings.length });
  });

  return router;
}

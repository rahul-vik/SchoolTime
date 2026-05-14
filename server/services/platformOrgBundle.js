import { z } from "zod";
import { nowIso } from "./common.js";
import { deleteOrganizationDataInTransaction } from "./platformOrgDelete.js";

export const ORG_BUNDLE_VERSION = 1;
export const TIMETABLE_SETUP_BUNDLE_KIND = "timetable_setup";
const MAX_ERROR_LOG_ROWS = 2500;

/** Zod schema for POST body wrapper (bundle payload validated separately). */
export const creatorOrgBundleImportBodySchema = z
  .object({
    /** `full` (default): replace entire org from backup. `timetable`: only `tenant_state` (+ clear runs). */
    scope: z.enum(["full", "timetable"]).optional().default("full"),
    confirmationName: z.string().max(200).optional(),
    bundle: z.record(z.string(), z.unknown()),
    /** When true, rewrites bundle org ids to `:orgId` before import; requires source/target name confirmations. */
    remapBundleOrgIdToUrlOrg: z.boolean().optional(),
    confirmationSourceOrganizationName: z.string().max(200).optional(),
    confirmationTargetOrganizationName: z.string().max(200).optional(),
  })
  .superRefine((data, ctx) => {
    const remap = Boolean(data.remapBundleOrgIdToUrlOrg);
    if (remap) {
      if (!String(data.confirmationSourceOrganizationName || "").trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Required when remapBundleOrgIdToUrlOrg is true",
          path: ["confirmationSourceOrganizationName"],
        });
      }
      if (!String(data.confirmationTargetOrganizationName || "").trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Required when remapBundleOrgIdToUrlOrg is true",
          path: ["confirmationTargetOrganizationName"],
        });
      }
    } else if (!String(data.confirmationName || "").trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "confirmationName is required unless remapBundleOrgIdToUrlOrg is true",
        path: ["confirmationName"],
      });
    }
  });

function rowToPlain(row) {
  if (!row || typeof row !== "object") return row;
  const o = {};
  for (const [k, v] of Object.entries(row)) {
    o[k] = v;
  }
  return o;
}

/**
 * Build a portable JSON bundle for one organization (platform migration / backup).
 */
export async function exportOrganizationBundle(db, orgId) {
  const org = await db.get("SELECT id, name, created_at FROM organizations WHERE id = ?", orgId);
  if (!org) throw new Error("NOT_FOUND");

  const users = await db.all("SELECT id, org_id, full_name, email, password_hash, role, created_at, is_active FROM users WHERE org_id = ? ORDER BY created_at ASC", orgId);
  const license = await db.get("SELECT org_id, credits_remaining, updated_at FROM licenses WHERE org_id = ?", orgId);
  const creditLedger = await db.all(
    "SELECT id, org_id, delta, reason, created_at, metadata_json FROM credit_ledger WHERE org_id = ? ORDER BY created_at ASC",
    orgId,
  );
  const tenantState = await db.get("SELECT org_id, state_json, updated_at FROM tenant_state WHERE org_id = ?", orgId);
  const timetableRuns = await db.all(
    "SELECT id, org_id, status, score, created_by_user_id, created_at, report_json, entries_json, state_json FROM timetable_runs WHERE org_id = ? ORDER BY created_at ASC",
    orgId,
  );
  const auditLogs = await db.all(
    "SELECT id, org_id, user_id, action, entity_type, entity_id, metadata_json, created_at FROM audit_logs WHERE org_id = ? ORDER BY created_at ASC LIMIT 5000",
    orgId,
  );
  const apiKeys = await db.all(
    "SELECT id, org_id, name, key_hash, key_prefix, created_by_user_id, created_at, last_used_at, revoked_at FROM api_keys WHERE org_id = ? ORDER BY created_at ASC",
    orgId,
  );
  const creditPurchaseRequests = await db.all(
    "SELECT id, org_id, user_id, pack_count, credits_total, status, requester_note, created_at, resolved_at, resolver_note FROM credit_purchase_requests WHERE org_id = ? ORDER BY created_at ASC",
    orgId,
  );
  const platformErrorLogs = await db.all(
    "SELECT id, created_at, level, message, detail_text, stack_text, route, method, org_id, user_id, metadata_json FROM platform_error_logs WHERE org_id = ? ORDER BY created_at ASC LIMIT ?",
    orgId,
    MAX_ERROR_LOG_ROWS,
  );

  return {
    bundleVersion: ORG_BUNDLE_VERSION,
    exportedAt: nowIso(),
    /** All `org_id` / `organization.id` fields in this object refer to the same organization id. */
    organization: rowToPlain(org),
    users: users.map(rowToPlain),
    license: license ? rowToPlain(license) : null,
    creditLedger: creditLedger.map(rowToPlain),
    tenantState: tenantState ? rowToPlain(tenantState) : null,
    timetableRuns: timetableRuns.map(rowToPlain),
    auditLogs: auditLogs.map(rowToPlain),
    apiKeys: apiKeys.map(rowToPlain),
    creditPurchaseRequests: creditPurchaseRequests.map(rowToPlain),
    platformErrorLogs: platformErrorLogs.map(rowToPlain),
  };
}

/**
 * Parse `tenant_state.state_json` into a plain object for export (never an array).
 * Invalid or non-object JSON becomes `{}`.
 */
function parseTenantStateJsonForExport(raw) {
  if (raw == null) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return { ...raw };
  if (typeof raw !== "string") return {};
  const s = raw.trim();
  if (!s) return {};
  try {
    const p = JSON.parse(s);
    return typeof p === "object" && p !== null && !Array.isArray(p) ? p : {};
  } catch {
    return {};
  }
}

/**
 * Portable JSON: timetable configuration only (`tenant_state` payload — standards, subjects, periods, teachers, rules, etc.).
 * Does not include users, licenses, runs, or audit rows.
 */
export async function exportOrganizationTimetableSetupBundle(db, orgId) {
  const org = await db.get("SELECT id, name FROM organizations WHERE id = ?", orgId);
  if (!org) throw new Error("NOT_FOUND");
  const row = await db.get("SELECT state_json FROM tenant_state WHERE org_id = ?", orgId);
  const tenantState = row ? parseTenantStateJsonForExport(row.state_json) : {};
  return {
    bundleVersion: ORG_BUNDLE_VERSION,
    bundleKind: TIMETABLE_SETUP_BUNDLE_KIND,
    exportedAt: nowIso(),
    organization: { id: org.id, name: org.name },
    tenantState,
  };
}

/** Max `?` placeholders per `IN (...)` chunk for email conflict checks (SQLite limits). */
const EMAIL_IN_QUERY_CHUNK = 400;

/**
 * Distinct exact `email` values from bundle users, or throws {@link Error} `INVALID_BUNDLE`
 * when two rows share the same email under a case-insensitive comparison.
 */
function distinctBundleEmailsOrThrowInvalid(users) {
  const seenNorm = new Set();
  const duplicateNorm = new Set();
  const distinct = [];
  const seenExact = new Set();
  for (const u of users) {
    const raw = String(u.email ?? "");
    const norm = raw.trim().toLowerCase();
    if (seenNorm.has(norm)) duplicateNorm.add(norm);
    else seenNorm.add(norm);
    if (!seenExact.has(raw)) {
      seenExact.add(raw);
      distinct.push(raw);
    }
  }
  if (duplicateNorm.size > 0) {
    const err = new Error("INVALID_BUNDLE");
    err.details = {
      message: "Duplicate user emails in bundle (case-insensitive match)",
      duplicateEmails: Array.from(duplicateNorm).sort(),
    };
    throw err;
  }
  return distinct;
}

/**
 * Ensures no remaining `users` row (outside `targetOrgId`) uses any bundle email.
 * Call **before** deleting the target org so a failed import never wipes data.
 */
async function assertBundleEmailsNotRegisteredInOtherOrgs(tx, targetOrgId, distinctEmails) {
  if (distinctEmails.length === 0) return;
  const conflicts = new Set();
  for (let i = 0; i < distinctEmails.length; i += EMAIL_IN_QUERY_CHUNK) {
    const chunk = distinctEmails.slice(i, i + EMAIL_IN_QUERY_CHUNK);
    const placeholders = chunk.map(() => "?").join(", ");
    const rows = await tx.all(
      `SELECT email FROM users WHERE email IN (${placeholders}) AND org_id != ?`,
      ...chunk,
      targetOrgId,
    );
    for (const r of rows) {
      if (r?.email) conflicts.add(r.email);
    }
  }
  if (conflicts.size > 0) {
    const err = new Error("EMAIL_IN_USE");
    err.emails = Array.from(conflicts).sort();
    throw err;
  }
}

const bundleShapeSchema = z.object({
  bundleVersion: z.literal(1),
  exportedAt: z.string().optional(),
  organization: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    created_at: z.string().min(1),
  }),
  users: z.array(
    z.object({
      id: z.string().min(1),
      org_id: z.string().min(1),
      full_name: z.string().min(1),
      email: z.string().min(1).max(320),
      password_hash: z.string().min(1),
      role: z.string().min(1),
      created_at: z.string().min(1),
      is_active: z.union([z.number(), z.boolean()]),
    }),
  ),
  license: z
    .object({
      org_id: z.string(),
      credits_remaining: z.number(),
      updated_at: z.string(),
    })
    .nullable()
    .optional(),
  creditLedger: z
    .array(
      z.object({
        id: z.string().min(1),
        org_id: z.string(),
        delta: z.number(),
        reason: z.string(),
        created_at: z.string(),
        metadata_json: z.string().nullable().optional(),
      }),
    )
    .optional(),
  tenantState: z
    .object({
      org_id: z.string(),
      state_json: z.string(),
      updated_at: z.string(),
    })
    .nullable()
    .optional(),
  timetableRuns: z
    .array(
      z.object({
        id: z.string().min(1),
        org_id: z.string(),
        status: z.string(),
        score: z.number().nullable().optional(),
        created_by_user_id: z.string().min(1),
        created_at: z.string(),
        report_json: z.string().nullable().optional(),
        entries_json: z.string().nullable().optional(),
        state_json: z.string().nullable().optional(),
      }),
    )
    .optional(),
  auditLogs: z
    .array(
      z.object({
        id: z.string().min(1),
        org_id: z.string(),
        user_id: z.string().nullable().optional(),
        action: z.string(),
        entity_type: z.string(),
        entity_id: z.string().nullable().optional(),
        metadata_json: z.string().nullable().optional(),
        created_at: z.string(),
      }),
    )
    .optional(),
  apiKeys: z
    .array(
      z.object({
        id: z.string().min(1),
        org_id: z.string(),
        name: z.string(),
        key_hash: z.string(),
        key_prefix: z.string(),
        created_by_user_id: z.string(),
        created_at: z.string(),
        last_used_at: z.string().nullable().optional(),
        revoked_at: z.string().nullable().optional(),
      }),
    )
    .optional(),
  creditPurchaseRequests: z
    .array(
      z.object({
        id: z.string().min(1),
        org_id: z.string(),
        user_id: z.string(),
        pack_count: z.number(),
        credits_total: z.number(),
        status: z.string(),
        requester_note: z.string().nullable().optional(),
        created_at: z.string(),
        resolved_at: z.string().nullable().optional(),
        resolver_note: z.string().nullable().optional(),
      }),
    )
    .optional(),
  platformErrorLogs: z
    .array(
      z.object({
        id: z.string().min(1),
        created_at: z.string(),
        level: z.string(),
        message: z.string(),
        detail_text: z.string().nullable().optional(),
        stack_text: z.string().nullable().optional(),
        route: z.string().nullable().optional(),
        method: z.string().nullable().optional(),
        org_id: z.string().nullable().optional(),
        user_id: z.string().nullable().optional(),
        metadata_json: z.string().nullable().optional(),
      }),
    )
    .optional(),
});

const timetableSetupBundleShapeSchema = z.object({
  bundleVersion: z.literal(1),
  bundleKind: z.literal(TIMETABLE_SETUP_BUNDLE_KIND),
  exportedAt: z.string().optional(),
  organization: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
  }),
  tenantState: z.unknown().optional(),
});

function toInt01(v) {
  if (typeof v === "boolean") return v ? 1 : 0;
  return Number(v) ? 1 : 0;
}

function assertOrgIdMatchesSourceForRemap(label, orgId, sourceOrgId) {
  if (orgId == null) return;
  if (orgId === sourceOrgId) return;
  const err = new Error("REMAP_ORG_ID_INCONSISTENT");
  err.detail = { label, orgId, sourceOrgId };
  throw err;
}

/**
 * Deep-clone a bundle object and rewrite `organization.id` plus every `org_id`
 * exported in {@link exportOrganizationBundle} from the bundle's original org id
 * to `targetOrgId`. Throws if any non-null `org_id` is neither the source id nor already the target.
 */
export function remapBundleOrganizationId(bundleUnknown, targetOrgId) {
  const bundle = JSON.parse(JSON.stringify(bundleUnknown));
  const org = bundle.organization;
  if (!org || typeof org.id !== "string" || !String(org.id).trim()) {
    const err = new Error("INVALID_BUNDLE");
    err.details = { message: "bundle.organization.id missing" };
    throw err;
  }
  const sourceOrgId = String(org.id).trim();
  const target = String(targetOrgId || "").trim();
  if (!target) {
    const err = new Error("INVALID_BUNDLE");
    err.details = { message: "targetOrgId missing" };
    throw err;
  }
  if (sourceOrgId === target) return bundle;

  org.id = target;

  for (const u of bundle.users || []) {
    if (!u || typeof u !== "object") continue;
    assertOrgIdMatchesSourceForRemap("users.org_id", u.org_id, sourceOrgId);
    u.org_id = target;
  }

  if (bundle.license && typeof bundle.license === "object") {
    assertOrgIdMatchesSourceForRemap("license.org_id", bundle.license.org_id, sourceOrgId);
    bundle.license.org_id = target;
  }

  for (const row of bundle.creditLedger || []) {
    if (!row || typeof row !== "object") continue;
    assertOrgIdMatchesSourceForRemap("creditLedger.org_id", row.org_id, sourceOrgId);
    row.org_id = target;
  }

  if (bundle.tenantState && typeof bundle.tenantState === "object") {
    assertOrgIdMatchesSourceForRemap("tenantState.org_id", bundle.tenantState.org_id, sourceOrgId);
    bundle.tenantState.org_id = target;
  }

  for (const row of bundle.timetableRuns || []) {
    if (!row || typeof row !== "object") continue;
    assertOrgIdMatchesSourceForRemap("timetableRuns.org_id", row.org_id, sourceOrgId);
    row.org_id = target;
  }

  for (const row of bundle.auditLogs || []) {
    if (!row || typeof row !== "object") continue;
    assertOrgIdMatchesSourceForRemap("auditLogs.org_id", row.org_id, sourceOrgId);
    row.org_id = target;
  }

  for (const row of bundle.apiKeys || []) {
    if (!row || typeof row !== "object") continue;
    assertOrgIdMatchesSourceForRemap("apiKeys.org_id", row.org_id, sourceOrgId);
    row.org_id = target;
  }

  for (const row of bundle.creditPurchaseRequests || []) {
    if (!row || typeof row !== "object") continue;
    assertOrgIdMatchesSourceForRemap("creditPurchaseRequests.org_id", row.org_id, sourceOrgId);
    row.org_id = target;
  }

  for (const row of bundle.platformErrorLogs || []) {
    if (!row || typeof row !== "object") continue;
    if (row.org_id == null) continue;
    assertOrgIdMatchesSourceForRemap("platformErrorLogs.org_id", row.org_id, sourceOrgId);
    row.org_id = target;
  }

  return bundle;
}

/**
 * Clone a **timetable_setup** bundle and set `organization.id` to `targetOrgId`.
 * (Setup bundles carry no per-table `org_id` fields — only `organization.id`.)
 */
export function remapTimetableSetupBundleOrganizationId(bundleUnknown, targetOrgId) {
  const bundle = JSON.parse(JSON.stringify(bundleUnknown));
  const org = bundle.organization;
  if (!org || typeof org.id !== "string" || !String(org.id).trim()) {
    const err = new Error("INVALID_BUNDLE");
    err.details = { message: "bundle.organization.id missing" };
    throw err;
  }
  const target = String(targetOrgId || "").trim();
  if (!target) {
    const err = new Error("INVALID_BUNDLE");
    err.details = { message: "targetOrgId missing" };
    throw err;
  }
  org.id = target;
  return bundle;
}

/**
 * Apply only `tenant_state` for `targetOrgId` from a **timetable_setup** bundle.
 * Deletes all `timetable_runs` for the org first so old generated grids are not left pointing at replaced setup
 * (FK-safe: `timetable_runs.created_by_user_id` references `users`; we do not touch users).
 */
export async function importOrganizationTimetableSetupBundleInTransaction(tx, bundleUnknown, { targetOrgId, confirmationName }) {
  const parsed = timetableSetupBundleShapeSchema.safeParse(bundleUnknown);
  if (!parsed.success) {
    const err = new Error("INVALID_BUNDLE");
    err.details = parsed.error.flatten();
    throw err;
  }
  const b = parsed.data;
  if (String(b.organization.name).trim() !== String(confirmationName || "").trim()) {
    throw new Error("NAME_MISMATCH");
  }
  if (b.organization.id !== targetOrgId) {
    throw new Error("ORG_ID_MISMATCH");
  }
  const orgRow = await tx.get("SELECT id FROM organizations WHERE id = ?", targetOrgId);
  if (!orgRow) throw new Error("NOT_FOUND");

  await tx.run("DELETE FROM timetable_runs WHERE org_id = ?", targetOrgId);

  const stateObj =
    b.tenantState != null && typeof b.tenantState === "object" && !Array.isArray(b.tenantState) ? b.tenantState : {};
  const stateJson = JSON.stringify(stateObj);
  const updatedAt = nowIso();
  const existing = await tx.get("SELECT org_id FROM tenant_state WHERE org_id = ?", targetOrgId);
  if (existing) {
    await tx.run("UPDATE tenant_state SET state_json = ?, updated_at = ? WHERE org_id = ?", stateJson, updatedAt, targetOrgId);
  } else {
    await tx.run("INSERT INTO tenant_state (org_id, state_json, updated_at) VALUES (?, ?, ?)", targetOrgId, stateJson, updatedAt);
  }

  return { orgId: targetOrgId };
}

/**
 * Replace entire organization data with bundle contents (same org id as in bundle).
 * Caller must enforce creator auth and confirmation name.
 */
export async function importOrganizationBundleInTransaction(tx, bundleUnknown, { targetOrgId, confirmationName }) {
  const parsed = bundleShapeSchema.safeParse(bundleUnknown);
  if (!parsed.success) {
    const err = new Error("INVALID_BUNDLE");
    err.details = parsed.error.flatten();
    throw err;
  }
  const b = parsed.data;
  if (String(b.organization.name).trim() !== String(confirmationName || "").trim()) {
    throw new Error("NAME_MISMATCH");
  }
  if (b.organization.id !== targetOrgId) {
    throw new Error("ORG_ID_MISMATCH");
  }
  for (const u of b.users) {
    if (u.org_id !== targetOrgId) throw new Error("USER_ORG_MISMATCH");
  }

  const distinctEmails = distinctBundleEmailsOrThrowInvalid(b.users);
  await assertBundleEmailsNotRegisteredInOtherOrgs(tx, targetOrgId, distinctEmails);

  await deleteOrganizationDataInTransaction(tx, targetOrgId);

  await tx.run("INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)", b.organization.id, b.organization.name, b.organization.created_at);

  for (const u of b.users) {
    await tx.run(
      "INSERT INTO users (id, org_id, full_name, email, password_hash, role, created_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      u.id,
      u.org_id,
      u.full_name,
      u.email,
      u.password_hash,
      u.role,
      u.created_at,
      toInt01(u.is_active),
    );
  }

  const lic = b.license;
  if (lic) {
    await tx.run("INSERT INTO licenses (org_id, credits_remaining, updated_at) VALUES (?, ?, ?)", lic.org_id, lic.credits_remaining, lic.updated_at);
  } else {
    await tx.run("INSERT INTO licenses (org_id, credits_remaining, updated_at) VALUES (?, 0, ?)", targetOrgId, nowIso());
  }

  for (const row of b.creditLedger || []) {
    await tx.run(
      "INSERT INTO credit_ledger (id, org_id, delta, reason, created_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?)",
      row.id,
      row.org_id,
      row.delta,
      row.reason,
      row.created_at,
      row.metadata_json ?? null,
    );
  }

  const ts = b.tenantState;
  if (ts) {
    await tx.run("INSERT INTO tenant_state (org_id, state_json, updated_at) VALUES (?, ?, ?)", ts.org_id, ts.state_json, ts.updated_at);
  } else {
    await tx.run("INSERT INTO tenant_state (org_id, state_json, updated_at) VALUES (?, ?, ?)", targetOrgId, "{}", nowIso());
  }

  for (const row of b.timetableRuns || []) {
    await tx.run(
      "INSERT INTO timetable_runs (id, org_id, status, score, created_by_user_id, created_at, report_json, entries_json, state_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      row.id,
      row.org_id,
      row.status,
      row.score ?? null,
      row.created_by_user_id,
      row.created_at,
      row.report_json ?? null,
      row.entries_json ?? null,
      row.state_json ?? null,
    );
  }

  for (const row of b.auditLogs || []) {
    await tx.run(
      "INSERT INTO audit_logs (id, org_id, user_id, action, entity_type, entity_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      row.id,
      row.org_id,
      row.user_id ?? null,
      row.action,
      row.entity_type,
      row.entity_id ?? null,
      row.metadata_json ?? null,
      row.created_at,
    );
  }

  for (const row of b.apiKeys || []) {
    await tx.run(
      "INSERT INTO api_keys (id, org_id, name, key_hash, key_prefix, created_by_user_id, created_at, last_used_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      row.id,
      row.org_id,
      row.name,
      row.key_hash,
      row.key_prefix,
      row.created_by_user_id,
      row.created_at,
      row.last_used_at ?? null,
      row.revoked_at ?? null,
    );
  }

  for (const row of b.creditPurchaseRequests || []) {
    await tx.run(
      "INSERT INTO credit_purchase_requests (id, org_id, user_id, pack_count, credits_total, status, requester_note, created_at, resolved_at, resolver_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      row.id,
      row.org_id,
      row.user_id,
      row.pack_count,
      row.credits_total,
      row.status,
      row.requester_note ?? null,
      row.created_at,
      row.resolved_at ?? null,
      row.resolver_note ?? null,
    );
  }

  for (const row of b.platformErrorLogs || []) {
    await tx.run(
      "INSERT INTO platform_error_logs (id, created_at, level, message, detail_text, stack_text, route, method, org_id, user_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      row.id,
      row.created_at,
      row.level,
      row.message,
      row.detail_text ?? null,
      row.stack_text ?? null,
      row.route ?? null,
      row.method ?? null,
      row.org_id ?? targetOrgId,
      row.user_id ?? null,
      row.metadata_json ?? null,
    );
  }

  return { orgId: targetOrgId, userCount: b.users.length };
}

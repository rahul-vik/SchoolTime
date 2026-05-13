import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const subjectScopeModeSchema = z.enum(["ALL_IN_SELECTED_CLASSES", "CUSTOM_DIVISION_OVERRIDES"]);
const subjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  code: z.string().min(1),
  category: z.string().min(1),
  weeklyPeriods: z.number().int().min(1).max(20),
  maxPerDay: z.number().int().min(1).max(10).nullable().optional(),
  priorityWeight: z.number().int().min(1).max(10),
  colorHex: z.string().min(1).optional(),
  mediumIds: z.array(z.string().min(1)),
  standardIds: z.array(z.string().min(1)),
  divisionScopeMode: subjectScopeModeSchema.optional(),
  divisionIncludeIds: z.array(z.string().min(1)).optional(),
  divisionExcludeIds: z.array(z.string().min(1)).optional(),
  divisionLimits: z
    .array(
      z.object({
        divisionId: z.string().min(1),
        weeklyPeriods: z.number().int().min(1).max(20).optional(),
        maxPerDay: z.number().int().min(1).max(10).optional(),
      })
    )
    .optional(),
  isActive: z.boolean().optional(),
});

const classTeacherPreferencesSchema = z.object({
  enabled: z.boolean().optional(),
  dailyPrimaryMinPeriods: z.number().int().min(0).max(2).optional(),
  schedulingMode: z.enum(["STRICT", "BEST_FIT", "OPTIMAL"]).optional(),
  firstPeriodMode: z.string().optional(), // backward-compatible legacy field
  ctFirstPeriodDays: z.array(z.string().min(1)).optional(),
});

export const schemas = {
  registerSchema: z.object({ orgName: z.string().min(2), fullName: z.string().min(2), email: z.string().email(), password: z.string().min(6) }),
  loginSchema: z.object({ email: z.string().email(), password: z.string().min(1) }),
  createUserSchema: z.object({
    fullName: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.string().min(2).max(40).regex(/^[a-z][a-z0-9_ -]*$/i),
  }),
  roleUpdateSchema: z.object({
    role: z.string().min(2).max(40).regex(/^[a-z][a-z0-9_ -]*$/i),
    isActive: z.boolean().optional(),
  }),
  /** Tenant admin `PATCH /users/:id` — at least one field required. */
  tenantUserPatchSchema: z
    .object({
      role: z.string().min(2).max(40).regex(/^[a-z][a-z0-9_ -]*$/i).optional(),
      isActive: z.boolean().optional(),
      password: z.string().min(6).max(120).optional(),
    })
    .refine((d) => d.role !== undefined || d.isActive !== undefined || d.password !== undefined, {
      message: "Provide at least one of role, isActive, or password",
    }),
  updateMeSchema: z.object({ fullName: z.string().min(2).max(120).optional(), password: z.string().min(6).max(120).optional() }).strict(),
  refreshSchema: z.object({ refreshToken: z.string().min(20) }),
  resetRequestSchema: z.object({ email: z.string().email() }),
  resetConfirmSchema: z.object({ token: z.string().min(20), newPassword: z.string().min(6) }),
  apiKeyCreateSchema: z.object({ name: z.string().min(2).max(80) }),
  tenantStateSchema: z.object({
    school: z.any(), mediums: z.array(z.any()), standards: z.array(z.any()), divisions: z.array(z.any()), subjects: z.array(subjectSchema),
    teachers: z.array(z.any()), periodSlots: z.array(z.any()), workingDays: z.array(z.any()), schedulingRules: z.array(z.any()),
    classTeacherPreferences: classTeacherPreferencesSchema.optional(),
    exportJobs: z.array(z.any()).optional(),
    lastGeneratedTimetable: z.any().nullable().optional(),
    teacherSubjects: z.array(z.any()).optional(), freePeriodRules: z.array(z.any()).optional(), subjectAllocations: z.array(z.any()).optional(),
  }),
  creatorRegisterOrgSchema: z.object({
    orgName: z.string().min(2),
    fullName: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    initialCredits: z.number().int().min(0).max(1_000_000).optional(),
  }),
  creatorCreditsAdjustSchema: z
    .object({
      delta: z.number().int(),
      reason: z.string().min(2).max(120),
    })
    .refine((d) => d.delta !== 0 && d.delta % 10 === 0, { message: "Delta must be a non-zero multiple of 10", path: ["delta"] }),
  creatorSettingsPatchSchema: z.object({
    signup_initial_credits: z.number().int().min(0).max(1_000_000).optional(),
    credit_pack_size: z.number().int().min(1).max(10_000).optional(),
    credit_pack_price_cents: z.number().int().min(0).max(100_000_000).optional(),
  }),
  creatorUserActiveSchema: z.object({ isActive: z.boolean() }),
  /** Optional `password`: if omitted or blank, server generates a temporary password and returns it once. */
  creatorUserPasswordSetSchema: z.object({
    password: z.string().max(128).nullish(),
  }),
  creatorUserPatchSchema: z
    .object({
      fullName: z.string().min(2).max(120).optional(),
      email: z.string().email().optional(),
      role: z.string().min(2).max(40).regex(/^[a-z][a-z0-9_ -]*$/i).optional(),
    })
    .refine((d) => d.fullName !== undefined || d.email !== undefined || d.role !== undefined, {
      message: "Provide at least one field to update",
    }),
  creatorRoleAccessPolicySchema: z.object({
    roles: z.array(z.object({
      key: z.string().min(2).max(40).regex(/^[a-z][a-z0-9_ -]*$/i),
      canManageUsers: z.boolean(),
      canManageCredits: z.boolean(),
      canViewAudit: z.boolean(),
      canManageApiKeys: z.boolean(),
      canConfigureTimetable: z.boolean(),
    })).min(1).max(30),
  }),
  creatorOrgDeleteSchema: z.object({
    confirmationName: z.string().min(1).max(200),
    notes: z.string().max(500).optional(),
  }),
  creditPurchaseRequestSchema: z.object({
    packCount: z.number().int().min(1).max(500),
    note: z.string().max(500).optional(),
  }),
  creatorCreditPurchaseRejectSchema: z.object({
    note: z.string().max(500).optional(),
  }),
};

export function nowIso() { return new Date().toISOString(); }
export function isAfter(aIso, bIso) { return new Date(aIso).getTime() > new Date(bIso).getTime(); }
export function hashApiKey(raw) { return crypto.createHash("sha256").update(raw).digest("hex"); }

export function csvEscape(v) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) return `"${s.replace(/"/g, "\"\"")}"`;
  return s;
}

export function buildAuditWhere(query, orgId) {
  const where = ["a.org_id = ?"];
  const args = [orgId];
  if (query.action) { where.push("a.action = ?"); args.push(String(query.action)); }
  if (query.entityType) { where.push("a.entity_type = ?"); args.push(String(query.entityType)); }
  if (query.from) { where.push("a.created_at >= ?"); args.push(String(query.from)); }
  if (query.to) { where.push("a.created_at <= ?"); args.push(String(query.to)); }
  if (query.q) {
    where.push("(a.action LIKE ? OR a.entity_type LIKE ? OR IFNULL(u.full_name,'') LIKE ? OR IFNULL(a.entity_id,'') LIKE ?)");
    const like = `%${String(query.q)}%`;
    args.push(like, like, like, like);
  }
  return { whereSql: where.join(" AND "), args };
}

export async function writeCreditLedger(db, orgId, delta, reason, metadata = null) {
  await db.run(
    "INSERT INTO credit_ledger (id, org_id, delta, reason, created_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?)",
    randomUUID(),
    orgId,
    delta,
    reason,
    nowIso(),
    metadata ? JSON.stringify(metadata) : null,
  );
}

export async function logAudit(db, orgId, userId, action, entityType, entityId = null, metadata = null) {
  await db.run(
    "INSERT INTO audit_logs (id, org_id, user_id, action, entity_type, entity_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    randomUUID(),
    orgId,
    userId || null,
    action,
    entityType,
    entityId,
    metadata ? JSON.stringify(metadata) : null,
    nowIso(),
  );
}

export async function getOrgCredits(db, orgId) {
  const row = await db.get("SELECT credits_remaining FROM licenses WHERE org_id = ?", orgId);
  return row?.credits_remaining ?? 0;
}

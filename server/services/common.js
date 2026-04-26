import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export const schemas = {
  registerSchema: z.object({ orgName: z.string().min(2), fullName: z.string().min(2), email: z.string().email(), password: z.string().min(6) }),
  loginSchema: z.object({ email: z.string().email(), password: z.string().min(1) }),
  createUserSchema: z.object({ fullName: z.string().min(2), email: z.string().email(), password: z.string().min(6), role: z.enum(["admin", "staff"]) }),
  roleUpdateSchema: z.object({ role: z.enum(["owner", "admin", "staff"]), isActive: z.boolean().optional() }),
  updateMeSchema: z.object({ fullName: z.string().min(2).max(120).optional(), password: z.string().min(6).max(120).optional() }).strict(),
  refreshSchema: z.object({ refreshToken: z.string().min(20) }),
  resetRequestSchema: z.object({ email: z.string().email() }),
  resetConfirmSchema: z.object({ token: z.string().min(20), newPassword: z.string().min(6) }),
  apiKeyCreateSchema: z.object({ name: z.string().min(2).max(80) }),
  tenantStateSchema: z.object({
    school: z.any(), mediums: z.array(z.any()), standards: z.array(z.any()), divisions: z.array(z.any()), subjects: z.array(z.any()),
    teachers: z.array(z.any()), periodSlots: z.array(z.any()), workingDays: z.array(z.any()), schedulingRules: z.array(z.any()),
    teacherSubjects: z.array(z.any()).optional(), freePeriodRules: z.array(z.any()).optional(), subjectAllocations: z.array(z.any()).optional(),
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

export function writeCreditLedger(db, orgId, delta, reason, metadata = null) {
  db.prepare("INSERT INTO credit_ledger (id, org_id, delta, reason, created_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?)")
    .run(randomUUID(), orgId, delta, reason, nowIso(), metadata ? JSON.stringify(metadata) : null);
}

export function logAudit(db, orgId, userId, action, entityType, entityId = null, metadata = null) {
  db.prepare("INSERT INTO audit_logs (id, org_id, user_id, action, entity_type, entity_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(randomUUID(), orgId, userId || null, action, entityType, entityId, metadata ? JSON.stringify(metadata) : null, nowIso());
}

export function getOrgCredits(db, orgId) {
  const row = db.prepare("SELECT credits_remaining FROM licenses WHERE org_id = ?").get(orgId);
  return row?.credits_remaining ?? 0;
}

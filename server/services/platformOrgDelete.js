import { randomUUID } from "node:crypto";
import { nowIso } from "./common.js";

/**
 * Permanently removes an organization and all tenant data (users, state, runs, credits, keys, audit rows for that org).
 * Writes one durable row to platform_org_purges before destructive deletes.
 */
export async function purgeOrganizationInTransaction(tx, orgId, { confirmationName, notes = null }) {
  const org = await tx.get("SELECT id, name FROM organizations WHERE id = ?", orgId);
  if (!org) throw new Error("NOT_FOUND");
  if (org.name.trim() !== String(confirmationName || "").trim()) {
    throw new Error("NAME_MISMATCH");
  }

  const users = await tx.all("SELECT id, email, full_name, role, is_active FROM users WHERE org_id = ? ORDER BY created_at ASC", orgId);
  const runCount = Number((await tx.get("SELECT COUNT(*) AS c FROM timetable_runs WHERE org_id = ?", orgId))?.c || 0);
  const keyCount = Number((await tx.get("SELECT COUNT(*) AS c FROM api_keys WHERE org_id = ?", orgId))?.c || 0);
  const ledgerCount = Number((await tx.get("SELECT COUNT(*) AS c FROM credit_ledger WHERE org_id = ?", orgId))?.c || 0);
  const platformErrorLogCount = Number((await tx.get("SELECT COUNT(*) AS c FROM platform_error_logs WHERE org_id = ?", orgId))?.c || 0);
  const hasTenantState = Boolean(await tx.get("SELECT 1 FROM tenant_state WHERE org_id = ? LIMIT 1", orgId));
  const licenseRow = await tx.get("SELECT credits_remaining FROM licenses WHERE org_id = ?", orgId);
  const creditsAtPurge = licenseRow?.credits_remaining ?? 0;

  const summary = {
    orgId,
    orgName: org.name,
    creditsRemainingAtPurge: creditsAtPurge,
    userCount: users.length,
    users: users.map((u) => ({ id: u.id, email: u.email, fullName: u.full_name, role: u.role, isActive: Boolean(u.is_active) })),
    timetableRunCount: runCount,
    apiKeyCount: keyCount,
    creditLedgerRowCount: ledgerCount,
    platformErrorLogRowCount: platformErrorLogCount,
    hadTenantState: hasTenantState,
    notes: notes || null,
  };

  await tx.run(
    "INSERT INTO platform_org_purges (id, created_at, org_id, org_name, summary_json, notes) VALUES (?, ?, ?, ?, ?, ?)",
    randomUUID(),
    nowIso(),
    orgId,
    org.name.trim(),
    JSON.stringify(summary),
    notes || null,
  );

  await tx.run("DELETE FROM refresh_tokens WHERE org_id = ?", orgId);
  await tx.run("DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE org_id = ?)", orgId);
  await tx.run("DELETE FROM api_keys WHERE org_id = ?", orgId);
  await tx.run("DELETE FROM timetable_runs WHERE org_id = ?", orgId);
  await tx.run("DELETE FROM credit_purchase_requests WHERE org_id = ?", orgId);
  await tx.run("DELETE FROM credit_ledger WHERE org_id = ?", orgId);
  await tx.run("DELETE FROM tenant_state WHERE org_id = ?", orgId);
  await tx.run("DELETE FROM platform_error_logs WHERE org_id = ?", orgId);
  await tx.run("DELETE FROM licenses WHERE org_id = ?", orgId);
  await tx.run("DELETE FROM audit_logs WHERE org_id = ?", orgId);
  await tx.run("DELETE FROM users WHERE org_id = ?", orgId);
  await tx.run("DELETE FROM organizations WHERE id = ?", orgId);
}

import { randomUUID } from "node:crypto";
import { hashPassword } from "../auth.js";
import { logAudit, nowIso, writeCreditLedger } from "./common.js";

/**
 * Creates organization, owner user, license row, optional credit ledger entry, and audit log.
 * Caller must run inside db.transaction.
 */
export async function createOrgWithOwnerUser(tx, {
  orgName,
  fullName,
  emailNorm,
  plainPassword,
  initialCredits,
  creditLedgerReason,
  creditLedgerMeta,
}) {
  const orgId = randomUUID();
  const userId = randomUUID();
  await tx.run("INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)", orgId, orgName.trim(), nowIso());
  await tx.run(
    "INSERT INTO users (id, org_id, full_name, email, password_hash, role, created_at, is_active) VALUES (?, ?, ?, ?, ?, 'owner', ?, 1)",
    userId,
    orgId,
    fullName.trim(),
    emailNorm,
    hashPassword(plainPassword),
    nowIso(),
  );
  await tx.run("INSERT INTO licenses (org_id, credits_remaining, updated_at) VALUES (?, ?, ?)", orgId, initialCredits, nowIso());
  if (initialCredits !== 0) {
    await writeCreditLedger(tx, orgId, initialCredits, creditLedgerReason, creditLedgerMeta);
  }
  await logAudit(tx, orgId, userId, "ORG_REGISTERED", "organization", orgId, { ownerEmail: emailNorm });
  return { orgId, userId };
}

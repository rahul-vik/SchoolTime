import { logAudit, nowIso } from "./common.js";

/**
 * Hard-delete a user from any org. Requires at least one other active user in the same org
 * to reassign timetable_runs.created_by_user_id. Revokes sessions and clears FK references.
 */
export async function deleteUserInTransaction(tx, userId) {
  const user = await tx.get("SELECT id, org_id, role, email FROM users WHERE id = ?", userId);
  if (!user) throw new Error("NOT_FOUND");

  const others = await tx.get("SELECT COUNT(*) AS c FROM users WHERE org_id = ? AND id != ?", user.org_id, userId);
  if (Number(others?.c || 0) < 1) {
    throw new Error("SOLE_USER_IN_ORG");
  }

  const fallback = await tx.get(
    `SELECT id FROM users WHERE org_id = ? AND id != ? AND is_active = 1
     ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, created_at ASC LIMIT 1`,
    user.org_id,
    userId,
  );
  if (!fallback) throw new Error("NO_FALLBACK_USER");

  await tx.run("DELETE FROM refresh_tokens WHERE user_id = ?", userId);
  await tx.run("DELETE FROM password_reset_tokens WHERE user_id = ?", userId);
  await tx.run("DELETE FROM api_keys WHERE created_by_user_id = ?", userId);
  await tx.run("UPDATE audit_logs SET user_id = NULL WHERE user_id = ?", userId);
  await tx.run("UPDATE timetable_runs SET created_by_user_id = ? WHERE created_by_user_id = ? AND org_id = ?", fallback.id, userId, user.org_id);
  await tx.run("DELETE FROM users WHERE id = ?", userId);

  await logAudit(tx, user.org_id, null, "PLATFORM_USER_DELETED", "user", userId, { email: user.email, role: user.role });
}

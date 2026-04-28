export async function bootstrapSession({
  hasStoredSession,
  getMe,
  loadState,
  clearToken,
  applyTenantState,
  onUser,
  onCredits,
  onHydrated,
  onLoading,
  onNoState,
  loadLatestTimetable,
  onTimetable,
  onTimetableStatus,
  isCancelled,
}) {
  if (!hasStoredSession()) {
    onLoading(false);
    return;
  }
  try {
    const me = await getMe();
    if (isCancelled()) return;
    onUser(me.user);
    onCredits(me.license?.creditsRemaining ?? 0);
    try {
      const stateResp = await loadState();
      if (isCancelled()) return;
      if (stateResp.state) applyTenantState(stateResp.state);
      else onNoState?.(me.user);
    } catch {
      // Keep session active even if tenant state hydration fails.
      if (!isCancelled()) onNoState?.(me.user);
    }
    try {
      const latest = await loadLatestTimetable?.();
      if (isCancelled()) return;
      if (latest?.timetable) {
        onTimetable?.(latest.timetable);
        onTimetableStatus?.("GENERATED");
      }
    } catch {
      // best-effort hydration for previous generated timetable
    }
  } catch {
    clearToken();
    // Only clear session when auth bootstrap itself fails (e.g. invalid token / expired session).
    if (!isCancelled()) {
      onUser(null);
      onCredits(0);
    }
  } finally {
    if (!isCancelled()) {
      onHydrated(true);
      onLoading(false);
    }
  }
}

export async function authenticateUser({
  mode,
  form,
  login,
  register,
  loadState,
  applyTenantState,
  onUser,
  onCredits,
  onHydrated,
  onNoState,
  loadLatestTimetable,
  onTimetable,
  onTimetableStatus,
}) {
  const action = mode === "login" ? login : register;
  const resp = await action(form);
  onUser(resp.user);
  onCredits(resp.license?.creditsRemaining ?? 0);
  try {
    const stateResp = await loadState();
    if (stateResp.state) applyTenantState(stateResp.state);
    else onNoState?.(resp.user);
  } catch {
    // Authentication already succeeded; treat state hydration as best-effort.
  }
  try {
    const latest = await loadLatestTimetable?.();
    if (latest?.timetable) {
      onTimetable?.(latest.timetable);
      onTimetableStatus?.("GENERATED");
    }
  } catch {
    // best-effort hydration for previous generated timetable
  }
  onHydrated(true);
  return resp;
}

export async function fetchAdminData({
  permissions,
  getUsers,
  getUsage,
  getAuditLogs,
  getApiKeys,
}) {
  const canManageUsers = Boolean(permissions?.canManageUsers);
  const canViewAudit = Boolean(permissions?.canViewAudit);
  const canManageApiKeys = Boolean(permissions?.canManageApiKeys);
  const userPromise = canManageUsers ? getUsers() : Promise.resolve({ users: [] });
  const [usersSettled, usageSettled] = await Promise.allSettled([userPromise, getUsage()]);
  const usersResp = usersSettled.status === "fulfilled" ? usersSettled.value : { users: [] };
  const usageResp = usageSettled.status === "fulfilled" ? usageSettled.value : null;
  const result = {
    users: usersResp.users || [],
    usage: usageResp,
    logs: [],
    apiKeys: [],
  };
  if (canViewAudit || canManageApiKeys) {
    const [auditSettled, keySettled] = await Promise.allSettled([
      canViewAudit ? getAuditLogs() : Promise.resolve({ logs: [] }),
      canManageApiKeys ? getApiKeys() : Promise.resolve({ apiKeys: [] }),
    ]);
    const auditResp = auditSettled.status === "fulfilled" ? auditSettled.value : { logs: [] };
    const keyResp = keySettled.status === "fulfilled" ? keySettled.value : { apiKeys: [] };
    result.logs = auditResp.logs || [];
    result.apiKeys = keyResp.apiKeys || [];
  }
  return result;
}

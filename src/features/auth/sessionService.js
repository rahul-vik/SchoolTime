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
    const stateResp = await loadState();
    if (isCancelled()) return;
    if (stateResp.state) applyTenantState(stateResp.state);
  } catch {
    clearToken();
    // If getMe succeeded but loadState failed, tokens were cleared — must drop user too or the UI stays "logged in" with no Authorization header.
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
}) {
  const action = mode === "login" ? login : register;
  const resp = await action(form);
  onUser(resp.user);
  onCredits(resp.license?.creditsRemaining ?? 0);
  try {
    const stateResp = await loadState();
    if (stateResp.state) applyTenantState(stateResp.state);
  } catch {
    // Authentication already succeeded; treat state hydration as best-effort.
  }
  onHydrated(true);
}

export async function fetchAdminData({
  role,
  getUsers,
  getUsage,
  getAuditLogs,
  getApiKeys,
}) {
  const [usersResp, usageResp] = await Promise.all([getUsers(), getUsage()]);
  const result = {
    users: usersResp.users || [],
    usage: usageResp,
    logs: [],
    apiKeys: [],
  };
  if (role === "owner" || role === "admin") {
    const [auditResp, keyResp] = await Promise.all([getAuditLogs(), getApiKeys()]);
    result.logs = auditResp.logs || [];
    result.apiKeys = keyResp.apiKeys || [];
  }
  return result;
}

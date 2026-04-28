import { useState } from "react";
import { createApiKey, createUser, exportAuditLogsCsv, getAuditLogsFiltered, revokeApiKey, updateUser } from "../../api";
import { useBreakpoint } from "../shared/uiPrimitives";

const CREDIT_REASON_LABELS = {
  TRIAL_SIGNUP: "Free signup credits added",
  CREATOR_SIGNUP: "Starting credits added",
  TIMETABLE_GENERATION: "1 credit used for timetable creation",
  B2B_TIMETABLE_GENERATION: "1 credit used via API timetable creation",
  PLATFORM_ADJUSTMENT: "Credits adjusted by platform admin",
  PURCHASE_APPROVED: "Credit purchase approved by platform admin",
};

function getCreditReasonLabel(reason) {
  const key = String(reason || "").trim().toUpperCase();
  if (CREDIT_REASON_LABELS[key]) return CREDIT_REASON_LABELS[key];
  return String(reason || "Credit update")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^./, (m) => m.toUpperCase());
}

const SECTION_LABELS = {
  user: "Users",
  auth: "Sign in",
  organization: "Organization",
  school_setup: "School setup",
  standards: "Standards",
  subjects: "Subjects",
  teachers: "Teachers",
  periods: "Periods",
  preferences: "Preferences",
  timetable_run: "Timetable",
  timetable: "Timetable",
  license: "Credits",
  credit_purchase_request: "Credit purchase",
  api_key: "API keys",
  state: "School setup",
  tenant_state: "School setup",
};

const ACTION_LABELS = {
  ORG_REGISTERED: "Organization account created",
  USER_LOGIN: "User signed in",
  USER_LOGOUT: "User signed out",
  USER_CREATED: "Team member added",
  USER_UPDATED: "Team member updated",
  PROFILE_UPDATED: "Profile updated",
  PLATFORM_USER_ACTIVATED: "User access enabled",
  PLATFORM_USER_DEACTIVATED: "User access disabled",
  PLATFORM_USER_DELETED: "User removed",
  PASSWORD_RESET_REQUESTED: "Password reset requested",
  PASSWORD_RESET_CONFIRMED: "Password reset completed",
  TENANT_STATE_SAVED: "School setup updated",
  SCHOOL_SETUP_UPDATED: "School setup updated",
  STANDARDS_UPDATED: "Standards updated",
  SUBJECTS_UPDATED: "Subjects updated",
  TEACHERS_UPDATED: "Teachers updated",
  PERIODS_UPDATED: "Periods updated",
  PREFERENCES_UPDATED: "Preferences updated",
  TIMETABLE_GENERATED: "Timetable created",
  TIMETABLE_EXPORTED: "Timetable exported",
  LICENSE_PURCHASED: "Credits added",
  CREDIT_PURCHASE_REQUESTED: "Credit purchase requested",
  CREDIT_PURCHASE_APPROVED: "Credit purchase approved",
  CREDIT_PURCHASE_REJECTED: "Credit purchase rejected",
  API_KEY_CREATED: "API key created",
  API_KEY_REVOKED: "API key revoked",
  PLATFORM_CREDIT_ADJUST: "Credits adjusted",
};

function toTitleCase(value) {
  return String(value || "")
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function getSectionLabel(entityType) {
  if (!entityType) return "General";
  return SECTION_LABELS[entityType] || toTitleCase(entityType);
}

function getActionLabel(action) {
  if (!action) return "Activity recorded";
  return ACTION_LABELS[action] || toTitleCase(action);
}

export function UsageDashboardPage({ usageData, navigate, ui }) {
  const { T, css, Btn } = ui;
  const { isMobile } = useBreakpoint();
  if (!usageData) {
    return (
      <div style={css.card}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Usage</h3>
        <p style={{ margin: 0, fontSize: 12, color: T.textSoft }}>
          No usage data available right now.
        </p>
        <div style={{ marginTop: 12 }}>
          <Btn onClick={() => navigate("generate")} size="sm">Go to Create</Btn>
        </div>
      </div>
    );
  }
  const s = usageData.summary || {};
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
        {[["Timetable balance", s.creditsRemaining, T.brand], ["Total creations", s.totalRuns, T.info], ["Completed", s.successfulRuns, T.success], ["Team members", s.totalUsers, T.warning]].map(([label, value, color]) => (
          <div key={label} style={{ ...css.card, padding: 12, borderRadius: 10 }}>
            <div style={{ fontSize: 10, color: T.textSoft, marginBottom: 6, fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1.1 }}>{value ?? 0}</div>
          </div>
        ))}
      </div>
      <div style={css.card}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>Recent balance activity</h3>
        {(usageData.recentCredits || []).length === 0 ? (
          <p style={{ color: T.textSoft, fontSize: 12 }}>No balance activity yet</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {usageData.recentCredits.map((l) => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, background: T.surfaceAlt, borderRadius: 8, padding: "8px 10px" }}>
                <span>
                  <div>{getCreditReasonLabel(l.reason)}</div>
                  <div style={{ fontSize: 11, color: T.textSoft, marginTop: 2 }}>
                    {l.created_at ? new Date(l.created_at).toLocaleString() : ""}
                  </div>
                </span>
                <span style={{ color: l.delta > 0 ? T.success : T.danger, fontWeight: 700 }}>{l.delta > 0 ? `+${l.delta}` : l.delta}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 12 }}><Btn onClick={() => navigate("generate")} size="sm">Go to Create</Btn></div>
      </div>
    </div>
  );
}

function normalizeTeamUserRow(u) {
  const full_name = u.full_name ?? u.fullName ?? "";
  const email = u.email ?? "";
  return { ...u, full_name, email };
}

/** Ensures the signed-in account appears in School team even if the users API failed or returned an empty list (e.g. partial fetch after register). */
function mergeMeIntoTeamUsers(users, me) {
  const rows = (users || []).map(normalizeTeamUserRow);
  if (!me?.id) return rows;
  const ids = new Set(rows.map((r) => r.id));
  if (ids.has(me.id)) return rows;
  return [normalizeTeamUserRow({ id: me.id, full_name: me.fullName ?? me.full_name, email: me.email, role: me.role, is_active: 1 }), ...rows];
}

export function UsersPage({ users, me, availableRoles = ["owner", "admin", "staff"], onRefresh, notify, ui }) {
  const { css, Input, Select, Btn, T } = ui;
  const { isMobile } = useBreakpoint();
  const canManageUsers = Boolean(me?.permissions?.canManageUsers);
  const roleOptions = availableRoles
    .filter((r) => (me?.role === "owner" ? true : r !== "owner"))
    .map((r) => ({ value: r, label: r.charAt(0).toUpperCase() + r.slice(1) }));
  const defaultCreateRole = roleOptions.some((r) => r.value === "staff") ? "staff" : (roleOptions[0]?.value || "staff");
  const [form, setForm] = useState({ fullName: "", email: "", password: "", role: defaultCreateRole });
  const [busy, setBusy] = useState(false);
  const displayUsers = mergeMeIntoTeamUsers(users, me);

  const addUser = async () => {
    setBusy(true);
    try {
      await createUser(form);
      setForm({ fullName: "", email: "", password: "", role: defaultCreateRole });
      await onRefresh();
      notify("User created", "success");
    } catch (err) {
      notify(err.message || "Failed to create user", "danger");
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (u, role) => {
    try {
      await updateUser(u.id, { role });
      await onRefresh();
      notify("User updated", "success");
    } catch (err) {
      notify(err.message || "Failed to update user", "danger");
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(300px,1fr) minmax(360px,2fr)", gap: 14, width: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <div style={css.card}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>Add team member</h3>
        <Input label="Full Name" value={form.fullName} onChange={(v) => setForm((p) => ({ ...p, fullName: v }))} />
        <Input label="Email" value={form.email} onChange={(v) => setForm((p) => ({ ...p, email: v }))} />
        <Input label="Temporary Password" type="password" value={form.password} onChange={(v) => setForm((p) => ({ ...p, password: v }))} />
        <Select label="Role" value={form.role} onChange={(v) => setForm((p) => ({ ...p, role: v }))} options={roleOptions.filter((o) => o.value !== "owner")} />
        <Btn onClick={addUser} fullWidth disabled={busy}>{busy ? "Creating..." : "Add Team Member"}</Btn>
      </div>
      <div style={css.card}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>School team</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {displayUsers.map((u) => (
            <div key={u.id} style={{ background: T.surfaceAlt, borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{u.full_name}</div>
                <div style={{ fontSize: 11, color: T.textSoft }}>{u.email}</div>
              </div>
              <span style={css.badge(u.role === "owner" ? T.brand : u.role === "admin" ? T.warning : T.textSoft)}>{u.role}</span>
              {canManageUsers && u.id !== me.id && (
                <select value={u.role} onChange={(e) => changeRole(u, e.target.value)} style={{ ...css.input, width: 110, padding: "6px 8px", fontSize: 12 }}>
                  {roleOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.value}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ApiKeysPage({ apiKeys, onRefresh, notify, ui }) {
  const { css, T, Btn } = ui;
  const { isMobile } = useBreakpoint();
  const [name, setName] = useState("");
  const [createdKey, setCreatedKey] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const resp = await createApiKey(name.trim());
      setCreatedKey(resp.apiKey);
      setName("");
      await onRefresh();
      notify("API key created", "success");
    } catch (err) {
      notify(err.message || "Failed to create API key", "danger");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id) => {
    try {
      await revokeApiKey(id);
      await onRefresh();
      notify("API key revoked", "success");
    } catch (err) {
      notify(err.message || "Failed to revoke API key", "danger");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={css.card}>
        <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Create Integration Key</h3>
        <div style={{ display: "flex", gap: 8, flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center" }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Connection name" style={{ ...css.input, flex: 1, minWidth: 0 }} />
          <Btn onClick={create} disabled={busy} fullWidth={isMobile}>{busy ? "Creating..." : "Create Key"}</Btn>
        </div>
        {createdKey && <p style={{ marginTop: 10, fontSize: 12, color: T.warning }}>Copy now (shown once): <code>{createdKey}</code></p>}
      </div>
      <div style={css.card}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>Saved Integration Keys</h3>
        {(apiKeys || []).length === 0 ? <p style={{ color: T.textSoft, fontSize: 12 }}>No keys yet.</p> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {apiKeys.map((k) => (
              <div key={k.id} style={{ background: T.surfaceAlt, borderRadius: 8, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{k.name}</div>
                  <div style={{ fontSize: 11, color: T.textSoft }}>{k.key_prefix}... · last used: {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "never"}</div>
                </div>
                {k.revoked_at ? <span style={css.badge(T.danger)}>Revoked</span> : <Btn variant="ghost" size="sm" onClick={() => revoke(k.id)} style={{ color: T.danger }}>Revoke</Btn>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AuditLogsPage({ logs, setLogs, notify, ui }) {
  const { css, T, Btn } = ui;
  const { isMobile } = useBreakpoint();
  const [filters, setFilters] = useState({ q: "", action: "", entityType: "" });
  const [busy, setBusy] = useState(false);
  const actionOptions = Array.from(new Set((logs || []).map((l) => l.action).filter(Boolean)))
    .sort()
    .map((v) => ({ value: v, label: getActionLabel(v) }));
  const sectionOptions = Array.from(new Set((logs || []).map((l) => l.entity_type).filter(Boolean)))
    .sort()
    .map((v) => ({ value: v, label: getSectionLabel(v) }));

  const runSearch = async () => {
    setBusy(true);
    try {
      const resp = await getAuditLogsFiltered(filters);
      setLogs(resp.logs || []);
    } catch (err) {
      notify(err.message || "Failed to load audit logs", "danger");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    try {
      await exportAuditLogsCsv(filters);
      notify("Audit logs export downloaded", "success");
    } catch (err) {
      notify(err.message || "Export failed", "danger");
    }
  };

  return (
    <div style={css.card}>
      <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>Activity History</h3>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: T.textSoft }}>
        Simple activity view. Technical system details are hidden.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.3fr 1.3fr auto auto", gap: 8, marginBottom: 12 }}>
        <select value={filters.action} onChange={(e) => setFilters((p) => ({ ...p, action: e.target.value }))} style={css.input}>
          <option value="">All activity types</option>
          {actionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={filters.entityType} onChange={(e) => setFilters((p) => ({ ...p, entityType: e.target.value }))} style={css.input}>
          <option value="">All sections</option>
          {sectionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn variant="ghost" onClick={runSearch} disabled={busy} style={{ flex: isMobile ? 1 : undefined }}>{busy ? "..." : "Search"}</Btn>
          <Btn onClick={exportCsv} style={{ flex: isMobile ? 1 : undefined }}>Download CSV</Btn>
        </div>
      </div>
      {(logs || []).length === 0 ? (
        <p style={{ color: T.textSoft, fontSize: 12 }}>No activity yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {logs.map((l) => (
            <div key={l.id} style={{ background: T.surfaceAlt, borderRadius: 8, padding: "9px 12px", display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{getActionLabel(l.action)}</div>
                <div style={{ fontSize: 11, color: T.textSoft }}>{getSectionLabel(l.entity_type)}</div>
                <div style={{ fontSize: 11, color: T.textSoft }}>{l.full_name || "System"}</div>
              </div>
              <div style={{ fontSize: 11, color: T.textSoft, whiteSpace: "nowrap" }}>{new Date(l.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

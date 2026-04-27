import { useEffect, useState } from "react";
import { updateMe } from "../../api";
import { ApiKeysPage, AuditLogsPage, UsageDashboardPage, UsersPage } from "../admin/AdminPages";
import { PurchaseCreditsPage } from "../billing/PurchaseCreditsPage";
import { useBreakpoint } from "../shared/uiPrimitives";

function ProfilePanel({ me, onUserUpdated, notify, ui }) {
  const { css, Input, Btn, T, Field } = ui;
  const [fullName, setFullName] = useState(me?.fullName || "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFullName(me?.fullName || "");
  }, [me?.id, me?.fullName]);

  const save = async () => {
    const body = {};
    if (fullName.trim() !== (me?.fullName || "").trim()) {
      if (fullName.trim().length < 2) {
        notify("Full name must be at least 2 characters", "warning");
        return;
      }
      body.fullName = fullName.trim();
    }
    if (password) body.password = password;
    if (Object.keys(body).length === 0) {
      notify("No changes to save", "info");
      return;
    }
    setBusy(true);
    try {
      const data = await updateMe(body);
      onUserUpdated(data.user);
      setPassword("");
      notify("Profile updated", "success");
    } catch (err) {
      notify(err.message || "Could not update profile", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={css.card}>
      <h3 style={{ margin: "0 0 14px", fontSize: 14 }}>Your profile</h3>
      <Field label="Email">
        <div style={{ fontSize: 14, color: T.textMid, padding: "10px 12px", background: T.surfaceAlt, borderRadius: 8, border: `1px solid ${T.surfaceBorder}` }}>{me?.email || "—"}</div>
      </Field>
      <Input label="Full name" value={fullName} onChange={setFullName} required />
      <Input label="New password" type="password" value={password} onChange={setPassword} help="Leave blank to keep your current password" />
      <Btn onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Btn>
    </div>
  );
}

export function SettingsPage({ settingsTab, setSettingsTab, usageData, navigate, users, me, onRefresh, onUserUpdated, notify, apiKeys, logs, setLogs, onCreditsUpdated, ui }) {
  const { isMobile } = useBreakpoint();
  const tabs = [
    { id: "profile", label: "Profile" },
    ...(me?.role === "owner" || me?.role === "admin"
      ? [
          { id: "users", label: "Users" },
          { id: "purchase-credits", label: "Purchase credits" },
          { id: "usage", label: "Usage" },
          { id: "api-keys", label: "API Keys" },
          { id: "audit", label: "Audit Logs" },
        ]
      : [{ id: "usage", label: "Usage" }]),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <h2 style={{ margin: 0, fontSize: isMobile ? 18 : 20, fontWeight: 700 }}>Settings</h2>
      <div style={{ ...ui.css.card, padding: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSettingsTab(t.id)}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${settingsTab === t.id ? ui.T.brand : ui.T.surfaceBorder}`,
              background: settingsTab === t.id ? ui.T.brand : "transparent",
              color: settingsTab === t.id ? "#fff" : ui.T.textMid,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {settingsTab === "profile" && <ProfilePanel me={me} onUserUpdated={onUserUpdated} notify={notify} ui={ui} />}
      {settingsTab === "usage" && <UsageDashboardPage usageData={usageData} navigate={navigate} ui={ui} />}
      {settingsTab === "purchase-credits" && (
        <PurchaseCreditsPage
          navigate={navigate}
          notify={notify}
          onCreditsUpdated={onCreditsUpdated}
          onBack={() => setSettingsTab("usage")}
          onSubmitted={() => setSettingsTab("purchase-credits")}
          ui={ui}
        />
      )}
      {settingsTab === "users" && <UsersPage users={users} me={me} onRefresh={onRefresh} notify={notify} ui={ui} />}
      {settingsTab === "api-keys" && <ApiKeysPage apiKeys={apiKeys} onRefresh={onRefresh} notify={notify} ui={ui} />}
      {settingsTab === "audit" && <AuditLogsPage logs={logs} setLogs={setLogs} notify={notify} ui={ui} />}
    </div>
  );
}

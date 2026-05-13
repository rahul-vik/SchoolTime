import { useCallback, useEffect, useState } from "react";
import {
  clearCreatorToken,
  creatorAdjustCredits,
  creatorDeleteOrganization,
  creatorDeleteUser,
  creatorUpdateUser,
  creatorGetOverview,
  creatorGetPlatformSettings,
  creatorListAuditLogs,
  creatorListCreditLedger,
  creatorListCreditPurchaseRequests,
  creatorApproveCreditPurchase,
  creatorRejectCreditPurchase,
  creatorListErrorLogs,
  creatorListOrgPurges,
  creatorListOrgs,
  creatorListUsers,
  creatorListValidationFindings,
  creatorLogin,
  creatorLogout,
  creatorPatchPlatformSettings,
  creatorGetRoleAccessPolicy,
  creatorPutRoleAccessPolicy,
  creatorRegisterOrg,
  creatorSetUserActive,
  creatorSetUserPassword,
  getCreatorToken,
} from "./creatorApi";
import { Btn, Input, Modal, T, UiIcon, css, useBreakpoint } from "../shared/uiPrimitives";
import { formatDateTimeIndian } from "../shared/dateTimeFormat";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "orgs", label: "Organizations" },
  { id: "users", label: "Users" },
  { id: "credits", label: "Credit ledger" },
  { id: "audit", label: "Audit" },
  { id: "errors", label: "Error logs" },
  { id: "validation-findings", label: "Auto Fixing" },
  { id: "settings", label: "Pricing & credits" },
  { id: "role-access", label: "Role access" },
  { id: "register", label: "Register org" },
];

const formatDateTime = formatDateTimeIndian;

function EyeIcon({ off = false }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M2.5 12s3.6-6 9.5-6 9.5 6 9.5 6-3.6 6-9.5 6-9.5-6-9.5-6z" {...common} />
      <circle cx="12" cy="12" r="2.8" {...common} />
      {off && <path d="M4 20L20 4" {...common} />}
    </svg>
  );
}

export function CreatorApp() {
  const { isMobile } = useBreakpoint();
  const [token, setTokenState] = useState(() => getCreatorToken());
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginErr, setLoginErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("overview");
  const [toast, setToast] = useState(null);

  const [overview, setOverview] = useState(null);
  const [orgs, setOrgs] = useState(null);
  const [users, setUsers] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [audit, setAudit] = useState(null);
  const [errors, setErrors] = useState(null);
  const [validationFindings, setValidationFindings] = useState(null);
  const [settings, setSettings] = useState(null);
  const [roleAccessPolicy, setRoleAccessPolicy] = useState({ roles: [] });
  const [newRoleKey, setNewRoleKey] = useState("");

  const [userQ, setUserQ] = useState("");
  const [roleVisibility, setRoleVisibility] = useState({ owner: true, admin: true, staff: true });
  const [userEditModal, setUserEditModal] = useState(null);
  const [userEditForm, setUserEditForm] = useState({ fullName: "", email: "", role: "staff" });
  /** Plaintext passwords the portal has set or seen this session only (not loaded from the server). */
  const [portalUserPasswordById, setPortalUserPasswordById] = useState({});
  const [portalUserPwReveal, setPortalUserPwReveal] = useState({});
  const [passwordResetUser, setPasswordResetUser] = useState(null);
  const [passwordResetPlain, setPasswordResetPlain] = useState("");
  const [orgSortBy, setOrgSortBy] = useState("created");
  const [orgSortDir, setOrgSortDir] = useState("desc");
  const [creditOrgId, setCreditOrgId] = useState("");
  const [creditPacksTen, setCreditPacksTen] = useState("");
  const [creditReason, setCreditReason] = useState("Support adjustment");
  const [orgCreditModal, setOrgCreditModal] = useState(null);
  const [orgCreditPacks, setOrgCreditPacks] = useState("");
  const [orgCreditReason, setOrgCreditReason] = useState("Operator adjustment");
  const [orgDeleteModal, setOrgDeleteModal] = useState(null);
  const [orgDeleteConfirmName, setOrgDeleteConfirmName] = useState("");
  const [orgDeleteNotes, setOrgDeleteNotes] = useState("");
  const [orgPurges, setOrgPurges] = useState(null);
  const [creditPurchasePending, setCreditPurchasePending] = useState(null);
  const [reg, setReg] = useState({ orgName: "", fullName: "", email: "", password: "", initialCredits: "" });
  const [settingsDraft, setSettingsDraft] = useState({ signup_initial_credits: "", credit_pack_size: "", credit_pack_price_cents: "" });
  const schoolAppPath = (() => {
    const base = String(import.meta.env.BASE_URL || "/");
    const normalizedBase = base.replace(/\/+$/, "");
    return normalizedBase || "/";
  })();

  const notify = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 5000);
  }, []);

  const refreshTab = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    try {
      if (tab === "overview") setOverview(await creatorGetOverview());
      if (tab === "orgs") {
        const o = await creatorListOrgs({ limit: 80, sortBy: orgSortBy, sortDir: orgSortDir });
        setOrgs(o);
        try {
          setOrgPurges(await creatorListOrgPurges({ limit: 25 }));
        } catch (e) {
          setOrgPurges({ purges: [] });
          const msg = String(e?.message || "");
          if (/platform portal only|Unknown platform portal/i.test(msg)) {
            notify("Organizations loaded. Restart the API server to enable purge history (GET /api/creator/org-purges).", "warning");
          } else {
            notify(msg || "Could not load purge history", "warning");
          }
        }
        try {
          setCreditPurchasePending(await creatorListCreditPurchaseRequests({ status: "pending" }));
        } catch {
          setCreditPurchasePending({ requests: [] });
        }
      }
      if (tab === "users") setUsers(await creatorListUsers({ limit: 80, q: userQ || undefined }));
      if (tab === "credits") setLedger(await creatorListCreditLedger({ limit: 120, orgId: creditOrgId.trim() || undefined }));
      if (tab === "audit") setAudit(await creatorListAuditLogs({ limit: 120 }));
      if (tab === "errors") setErrors(await creatorListErrorLogs({ limit: 120 }));
      if (tab === "validation-findings") setValidationFindings(await creatorListValidationFindings({ limit: 200 }));
      if (tab === "settings") {
        const s = await creatorGetPlatformSettings();
        setSettings(s.settings);
        const g = (k) => s.settings[k]?.value;
        setSettingsDraft({
          signup_initial_credits: String(g("signup_initial_credits") ?? ""),
          credit_pack_size: String(g("credit_pack_size") ?? ""),
          credit_pack_price_cents: String(g("credit_pack_price_cents") ?? ""),
        });
      }
      if (tab === "role-access") {
        const out = await creatorGetRoleAccessPolicy();
        setRoleAccessPolicy(out.policy || { roles: [] });
      }
    } catch (e) {
      const msg = String(e?.message || "Load failed");
      if (/session expired|invalid auth token|missing auth token/i.test(msg)) {
        clearCreatorToken();
        setTokenState(null);
        setLoginErr("Your platform session expired. Please sign in again.");
        notify("Platform session expired. Please sign in again.", "warning");
      } else {
        notify(msg, "danger");
      }
    } finally {
      setBusy(false);
    }
  }, [token, tab, userQ, creditOrgId, orgSortBy, orgSortDir, notify]);

  useEffect(() => {
    refreshTab();
  }, [refreshTab]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginErr("");
    setBusy(true);
    try {
      await creatorLogin(loginPassword);
      setLoginPassword("");
      setTokenState(getCreatorToken());
      notify("Signed in to platform portal");
    } catch (err) {
      setLoginErr(err.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = () => {
    creatorLogout();
    setTokenState(null);
    setOverview(null);
    notify("Signed out");
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {};
      const si = Number(settingsDraft.signup_initial_credits);
      const ps = Number(settingsDraft.credit_pack_size);
      const pr = Number(settingsDraft.credit_pack_price_cents);
      if (settingsDraft.signup_initial_credits !== "" && Number.isFinite(si)) body.signup_initial_credits = si;
      if (settingsDraft.credit_pack_size !== "" && Number.isFinite(ps)) body.credit_pack_size = ps;
      if (settingsDraft.credit_pack_price_cents !== "" && Number.isFinite(pr)) body.credit_pack_price_cents = pr;
      const out = await creatorPatchPlatformSettings(body);
      setSettings(out.settings);
      notify("Settings saved");
    } catch (err) {
      notify(err.message || "Save failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  const toggleRolePermission = (roleKey, permissionKey, value) => {
    setRoleAccessPolicy((prev) => ({
      ...prev,
      roles: (prev.roles || []).map((r) => (r.key === roleKey ? { ...r, [permissionKey]: value } : r)),
    }));
  };

  const addRole = () => {
    const key = newRoleKey.trim().replace(/\s+/g, " ").toLowerCase();
    if (!key) {
      notify("Enter a role name before adding", "warning");
      return;
    }
    if (!/^[a-z][a-z0-9_ -]*$/i.test(key)) {
      notify("Role key can use letters, numbers, space, underscore, hyphen", "warning");
      return;
    }
    if ((roleAccessPolicy.roles || []).some((r) => String(r.key || "").trim().toLowerCase() === key)) {
      notify("Role already exists", "warning");
      return;
    }
    setRoleAccessPolicy((prev) => ({
      ...prev,
      roles: [
        ...(prev.roles || []),
        { key, canManageUsers: false, canManageCredits: false, canViewAudit: false, canManageApiKeys: false, canConfigureTimetable: true },
      ],
    }));
    setNewRoleKey("");
    notify("Role added. Click save to apply.", "info");
  };

  const removeRole = (key) => {
    if (key === "owner" || key === "admin" || key === "staff") {
      notify("Default roles cannot be removed", "warning");
      return;
    }
    setRoleAccessPolicy((prev) => ({ ...prev, roles: (prev.roles || []).filter((r) => r.key !== key) }));
  };

  const saveRoleAccessPolicy = async () => {
    setBusy(true);
    try {
      const out = await creatorPutRoleAccessPolicy(roleAccessPolicy);
      setRoleAccessPolicy(out.policy || roleAccessPolicy);
      notify("Role access policy saved");
    } catch (err) {
      notify(err.message || "Save failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  const handleAdjustCredits = async (e) => {
    e.preventDefault();
    if (!creditOrgId.trim()) {
      notify("Organization ID is required", "warning");
      return;
    }
    const packs = Number(creditPacksTen);
    if (!Number.isFinite(packs) || packs === 0 || !Number.isInteger(packs)) {
      notify("Enter a whole number of 10-credit packs.", "warning");
      return;
    }
    const delta = packs * 10;
    setBusy(true);
    try {
      await creatorAdjustCredits(creditOrgId.trim(), { delta, reason: creditReason.trim() || "Adjustment" });
      notify("Credits updated");
      setCreditPacksTen("");
    } catch (err) {
      notify(err.message || "Update failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  const submitOrgCredits = async (e) => {
    e.preventDefault();
    if (!orgCreditModal) return;
    const packs = Number(orgCreditPacks);
    if (!Number.isFinite(packs) || packs === 0 || !Number.isInteger(packs)) {
      notify("Enter a whole number of 10-credit packs.", "warning");
      return;
    }
    const delta = packs * 10;
    setBusy(true);
    try {
      await creatorAdjustCredits(orgCreditModal.id, { delta, reason: orgCreditReason.trim() || "Adjustment" });
      notify("Organization credits updated");
      setOrgCreditModal(null);
      setOrgCreditPacks("");
      await refreshTab();
    } catch (err) {
      notify(err.message || "Update failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  const toggleUserActive = async (u) => {
    const next = !Boolean(u.is_active);
    const label = next ? "activate" : "deactivate";
    if (!window.confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} ${u.full_name} (${u.email})?`)) return;
    setBusy(true);
    try {
      await creatorSetUserActive(u.id, next);
      notify(`User ${next ? "activated" : "deactivated"}`);
      await refreshTab();
    } catch (err) {
      notify(err.message || "Update failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  const removeUser = async (u) => {
    if (!window.confirm(`Permanently delete user ${u.full_name} (${u.email})? This cannot be undone. Not allowed if they are the only user in the school.`)) return;
    setBusy(true);
    try {
      await creatorDeleteUser(u.id);
      notify("User deleted");
      await refreshTab();
    } catch (err) {
      notify(err.message || "Delete failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  const openEditUser = (u) => {
    setUserEditModal(u);
    setUserEditForm({
      fullName: u.full_name || "",
      email: u.email || "",
      role: u.role || "staff",
    });
  };

  const submitEditUser = async (e) => {
    e.preventDefault();
    if (!userEditModal) return;
    const payload = {
      fullName: userEditForm.fullName.trim(),
      email: userEditForm.email.trim().toLowerCase(),
      role: userEditForm.role,
    };
    setBusy(true);
    try {
      await creatorUpdateUser(userEditModal.id, payload);
      notify("User updated");
      setUserEditModal(null);
      await refreshTab();
    } catch (err) {
      notify(err.message || "Update failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  const openPasswordReset = (u) => {
    setPasswordResetUser(u);
    setPasswordResetPlain("");
  };

  const submitPasswordReset = async (e) => {
    e.preventDefault();
    if (!passwordResetUser) return;
    setBusy(true);
    try {
      const body = {};
      const trimmed = passwordResetPlain.trim();
      if (trimmed) body.password = trimmed;
      const out = await creatorSetUserPassword(passwordResetUser.id, body);
      setPortalUserPasswordById((p) => ({ ...p, [passwordResetUser.id]: out.newPassword }));
      setPortalUserPwReveal((r) => ({ ...r, [passwordResetUser.id]: true }));
      notify("Password updated. Use the eye icon in the table to show or hide it. Copy it now if you need to share it.");
      setPasswordResetUser(null);
      setPasswordResetPlain("");
    } catch (err) {
      notify(err.message || "Password update failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        orgName: reg.orgName.trim(),
        fullName: reg.fullName.trim(),
        email: reg.email.trim(),
        password: reg.password,
      };
      const ic = reg.initialCredits.trim();
      if (ic !== "") body.initialCredits = Number(ic);
      const ownerPassword = reg.password;
      const out = await creatorRegisterOrg(body);
      notify(out.message || "Organization created");
      if (out.userId && ownerPassword) {
        setPortalUserPasswordById((p) => ({ ...p, [out.userId]: ownerPassword }));
      }
      setReg({ orgName: "", fullName: "", email: "", password: "", initialCredits: "" });
    } catch (err) {
      notify(err.message || "Registration failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  const submitDeleteOrg = async (e) => {
    e.preventDefault();
    if (!orgDeleteModal) return;
    setBusy(true);
    try {
      await creatorDeleteOrganization(orgDeleteModal.id, {
        confirmationName: orgDeleteConfirmName.trim(),
        notes: orgDeleteNotes.trim() || undefined,
      });
      notify("Organization and all related data removed");
      setOrgDeleteModal(null);
      setOrgDeleteConfirmName("");
      setOrgDeleteNotes("");
      await refreshTab();
    } catch (err) {
      notify(err.message || "Delete failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  const approveCreditPurchase = async (reqId) => {
    if (!window.confirm("Approve and add these credits to the school?")) return;
    setBusy(true);
    try {
      await creatorApproveCreditPurchase(reqId);
      notify("Purchase approved");
      await refreshTab();
    } catch (err) {
      notify(err.message || "Approve failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  const rejectCreditPurchase = async (reqId) => {
    const note = window.prompt("Optional note for the school (stored on the request):", "");
    if (note === null) return;
    if (!window.confirm("Reject this credit purchase request?")) return;
    setBusy(true);
    try {
      await creatorRejectCreditPurchase(reqId, { note: note.trim() || undefined });
      notify("Request rejected");
      await refreshTab();
    } catch (err) {
      notify(err.message || "Reject failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div style={{ minHeight: "100vh", background: T.surfaceAlt, color: T.text, fontFamily: "Inter, system-ui, sans-serif", padding: 24 }}>
        <div style={{ maxWidth: 420, margin: "64px auto", ...css.card }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 20, color: T.brand }}>SchoolTime platform portal</h1>
          <p style={{ margin: "0 0 20px", fontSize: 14, color: T.textMid, lineHeight: 1.5 }}>
            Operator dashboard: enrollments, credits, audit trail, and server error logs. This is separate from the school app.
          </p>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.textMid, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Portal password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showLoginPassword ? "text" : "password"}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="From CREATOR_PORTAL_PASSWORD*"
                  style={{ ...css.input, paddingRight: 40 }}
                />
                <button
                  type="button"
                  aria-label={showLoginPassword ? "Hide password" : "Show password"}
                  title={showLoginPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowLoginPassword((v) => !v)}
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    border: "none",
                    background: "transparent",
                    color: T.textSoft,
                    cursor: "pointer",
                    padding: 4,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <EyeIcon off={showLoginPassword} />
                </button>
              </div>
            </div>
            {loginErr && <p style={{ color: T.danger, fontSize: 13, marginTop: 8 }}>{loginErr}</p>}
            <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end", flexWrap: "wrap", alignItems: "center" }}>
              <Btn type="button" variant="ghost" iconOnly ariaLabel="Back to school app" onClick={() => { window.location.href = schoolAppPath; }}>
                <UiIcon name="school" size={20} stroke="currentColor" />
              </Btn>
              <Btn type="submit" disabled={busy} iconOnly ariaLabel={busy ? "Signing in" : "Sign in"} title={busy ? "Signing in…" : "Sign in"}>
                {busy ? <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1 }}>…</span> : <UiIcon name="login" size={20} stroke="currentColor" />}
              </Btn>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const pt = {
    table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
    th: { padding: "11px 14px", textAlign: "left", borderBottom: `1px solid ${T.surfaceBorder}`, fontSize: 12, fontWeight: 700, color: T.textMid, verticalAlign: "middle" },
    td: { padding: "11px 14px", verticalAlign: "middle", borderBottom: `1px solid ${T.surfaceBorder}` },
    tdMono: { padding: "11px 14px", verticalAlign: "middle", borderBottom: `1px solid ${T.surfaceBorder}`, fontFamily: "ui-monospace, monospace", fontSize: 11, color: T.textMid },
    tdActions: { padding: "10px 14px", verticalAlign: "middle", borderBottom: `1px solid ${T.surfaceBorder}`, textAlign: "right" },
    tableSm: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
    thSm: { padding: "10px 14px", textAlign: "left", borderBottom: `1px solid ${T.surfaceBorder}`, fontSize: 11, fontWeight: 700, color: T.textMid, verticalAlign: "middle" },
    tdSm: { padding: "10px 14px", verticalAlign: "middle", borderBottom: `1px solid ${T.surfaceBorder}` },
    toolRow: { marginBottom: 14, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" },
    modalActions: { display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end", flexWrap: "wrap" },
    inlineField: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 },
    inlineLabel: { fontSize: 11, fontWeight: 700, color: T.textMid, textTransform: "uppercase", letterSpacing: "0.06em", lineHeight: 1.2 },
    inlineInput: { ...css.input, height: 39, padding: "8px 12px", boxSizing: "border-box" },
    /** Single-line control + action button (input and button share 39px height). */
    controlWithIconRow: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
    iconSq39: { height: 39, padding: "0 12px", flexShrink: 0, boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center" },
    rowActions: { display: "inline-flex", gap: 8, flexWrap: "nowrap", justifyContent: "flex-end", alignItems: "center", whiteSpace: "nowrap" },
  };

  const renderPortalUserPasswordCell = (u) => {
    const known = portalUserPasswordById[u.id];
    const revealed = Boolean(portalUserPwReveal[u.id]);
    const displayText = !revealed
      ? "••••••••"
      : known || "Not available";
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, maxWidth: 320 }}>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: "ui-monospace, Consolas, monospace",
            fontSize: 12,
            lineHeight: 1.35,
            color: revealed && known ? T.text : T.textMid,
            wordBreak: revealed && !known ? "break-word" : "normal",
            whiteSpace: revealed && known ? "nowrap" : "normal",
            overflow: revealed && known ? "hidden" : "visible",
            textOverflow: revealed && known ? "ellipsis" : "clip",
          }}
          title={revealed && known ? known : revealed && !known ? "Set a new password with the key icon to show it here." : undefined}
        >
          {displayText}
        </span>
        <Btn
          type="button"
          variant="ghost"
          size="sm"
          iconOnly
          ariaLabel={revealed ? `Hide password for ${u.full_name}` : `Show password for ${u.full_name}`}
          title={revealed ? "Hide" : "Show"}
          onClick={() => setPortalUserPwReveal((p) => ({ ...p, [u.id]: !p[u.id] }))}
          disabled={busy}
        >
          <EyeIcon off={revealed} />
        </Btn>
        <Btn
          type="button"
          variant="ghost"
          size="sm"
          iconOnly
          ariaLabel={`Set new password for ${u.full_name}`}
          title="Set new password"
          onClick={() => openPasswordReset(u)}
          disabled={busy}
        >
          <UiIcon name="key" size={16} stroke="currentColor" />
        </Btn>
      </div>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: T.surfaceAlt, color: T.text, fontFamily: "Inter, system-ui, sans-serif" }}>
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 2000,
            padding: "12px 20px",
            borderRadius: 10,
            background: toast.type === "danger" ? T.danger : T.brand,
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            maxWidth: "min(560px, 92vw)",
            textAlign: "center",
          }}
        >
          {toast.msg}
        </div>
      )}

      <header style={{ background: T.brand, color: "#fff", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>SchoolTime · Platform portal</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>Credits, members, and operations</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Btn variant="ghost" size="sm" iconOnly ariaLabel="Open school app" onClick={() => { window.location.href = schoolAppPath; }} style={{ color: "#fff", borderColor: "rgba(255,255,255,0.35)" }}>
            <UiIcon name="school" size={18} stroke="currentColor" />
          </Btn>
          <Btn variant="ghost" size="sm" iconOnly ariaLabel="Sign out" onClick={handleLogout} disabled={busy} style={{ color: "#fff", borderColor: "rgba(255,255,255,0.35)" }}>
            <UiIcon name="logout" size={18} stroke="currentColor" />
          </Btn>
        </div>
      </header>

      <div style={{ display: "flex", minHeight: "calc(100vh - 74px)" }}>
        <aside
          style={{
            width: isMobile ? "100%" : 248,
            borderRight: isMobile ? "none" : `1px solid ${T.surfaceBorder}`,
            borderBottom: isMobile ? `1px solid ${T.surfaceBorder}` : "none",
            background: T.surface,
            padding: isMobile ? "10px 12px" : "14px 12px",
            boxSizing: "border-box",
          }}
        >
          <div style={{ display: "flex", gap: 8, flexDirection: isMobile ? "row" : "column", overflowX: isMobile ? "auto" : "visible", paddingBottom: isMobile ? 4 : 0 }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: tab === t.id ? `1px solid ${T.brand}` : `1px solid ${T.surfaceBorder}`,
                  background: tab === t.id ? `${T.brand}14` : "transparent",
                  color: tab === t.id ? T.brand : T.textMid,
                  fontWeight: tab === t.id ? 700 : 600,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                  minWidth: isMobile ? "max-content" : "auto",
                  whiteSpace: "nowrap",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          {!isMobile && (
            <div style={{ marginTop: 12 }}>
              <Btn type="button" variant="ghost" size="sm" fullWidth onClick={refreshTab} disabled={busy}>
                <UiIcon name="refresh" size={16} stroke="currentColor" />
                {busy ? "Refreshing..." : "Refresh"}
              </Btn>
            </div>
          )}
        </aside>

        <main style={{ padding: 20, maxWidth: 1280, margin: "0", width: "100%", boxSizing: "border-box" }}>
        {tab === "overview" && overview && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
            {[
              ["Organizations", overview.organizations],
              ["Users", overview.users],
              ["Credits (sum)", overview.creditsRemainingAcrossOrgs],
              ["Errors (24h)", overview.errorLogsLast24h],
            ].map(([label, val]) => (
              <div key={label} style={{ ...css.card, padding: 16 }}>
                <div style={{ fontSize: 12, color: T.textMid, fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, color: T.brand }}>{val}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "orgs" && orgs && (
          <div>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: T.textMid, lineHeight: 1.5 }}>
              Credits belong to each <strong>organization</strong>. Schools request extra credits from the app; <strong>pending requests</strong> appear below for you to approve or reject. Use <strong>Add credits</strong> for manual adjustments. <strong>Remove organization</strong> deletes the org and related data; a <strong>purge record</strong> is kept below.
            </p>
            <div style={{ ...pt.toolRow, marginBottom: 12 }}>
              <div style={{ ...pt.inlineField, minWidth: 180 }}>
                <label style={pt.inlineLabel} htmlFor="org-sort-by">Sort organizations by</label>
                <select
                  id="org-sort-by"
                  value={orgSortBy}
                  onChange={(e) => setOrgSortBy(e.target.value)}
                  style={pt.inlineInput}
                >
                  <option value="created">Created date</option>
                  <option value="lastActive">Last activity date</option>
                </select>
              </div>
              <div style={{ ...pt.inlineField, minWidth: 140 }}>
                <label style={pt.inlineLabel} htmlFor="org-sort-dir">Order</label>
                <select
                  id="org-sort-dir"
                  value={orgSortDir}
                  onChange={(e) => setOrgSortDir(e.target.value)}
                  style={pt.inlineInput}
                >
                  <option value="desc">Newest first</option>
                  <option value="asc">Oldest first</option>
                </select>
              </div>
            </div>
            {creditPurchasePending?.requests?.length > 0 && (
              <div style={{ ...css.card, marginBottom: 16, padding: 0, overflow: "auto" }}>
                <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.surfaceBorder}` }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text }}>Pending credit purchase requests</h3>
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: T.textMid }}>Approve to add credits to the license balance, or reject with an optional note.</p>
                </div>
                {isMobile ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12 }}>
                    {creditPurchasePending.requests.map((r) => (
                      <div key={r.id} style={{ border: `1px solid ${T.surfaceBorder}`, borderRadius: 10, padding: "10px 12px", background: T.surface }}>
                        <div style={{ fontSize: 12, color: T.textSoft }}>{formatDateTime(r.created_at)}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{r.org_name}</div>
                        <div style={{ marginTop: 4, fontSize: 12, color: T.textMid }}>{r.requester_name} · {r.requester_email}</div>
                        <div style={{ marginTop: 6, fontSize: 12, color: T.textMid }}>Packs: <b>{r.pack_count}</b> · Credits: <b>{r.credits_total}</b></div>
                        <div style={{ marginTop: 6, fontSize: 12, color: T.textSoft }}>{r.requester_note || "No note"}</div>
                        <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <Btn size="sm" iconOnly ariaLabel="Approve request" onClick={() => approveCreditPurchase(r.id)} disabled={busy}><UiIcon name="check" size={16} stroke="currentColor" /></Btn>
                          <Btn size="sm" variant="danger" iconOnly ariaLabel="Reject request" onClick={() => rejectCreditPurchase(r.id)} disabled={busy}><UiIcon name="close" size={16} stroke="#fff" /></Btn>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                <table style={pt.table}>
                  <thead>
                    <tr>
                      <th style={pt.th}>Requested</th>
                      <th style={pt.th}>School</th>
                      <th style={pt.th}>Requester</th>
                      <th style={pt.th}>Packs</th>
                      <th style={pt.th}>Credits</th>
                      <th style={pt.th}>Note</th>
                      <th style={{ ...pt.th, textAlign: "right", width: 1 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {creditPurchasePending.requests.map((r) => (
                      <tr key={r.id}>
                        <td style={{ ...pt.td, whiteSpace: "nowrap", fontSize: 12 }}>{formatDateTime(r.created_at)}</td>
                        <td style={pt.td}>{r.org_name}</td>
                        <td style={pt.td}><span style={{ fontSize: 12 }}>{r.requester_name}</span><br /><span style={{ fontSize: 11, color: T.textMid }}>{r.requester_email}</span></td>
                        <td style={pt.td}>{r.pack_count}</td>
                        <td style={{ ...pt.td, fontWeight: 700 }}>{r.credits_total}</td>
                        <td style={{ ...pt.td, fontSize: 12, color: T.textMid }}>{r.requester_note || "—"}</td>
                        <td style={pt.tdActions}>
                          <div style={pt.rowActions}>
                            <Btn size="sm" iconOnly ariaLabel="Approve request" onClick={() => approveCreditPurchase(r.id)} disabled={busy}>
                              <UiIcon name="check" size={16} stroke="currentColor" />
                            </Btn>
                            <Btn size="sm" variant="danger" iconOnly ariaLabel="Reject request" onClick={() => rejectCreditPurchase(r.id)} disabled={busy}>
                              <UiIcon name="close" size={16} stroke="#fff" />
                            </Btn>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                )}
              </div>
            )}
            {orgCreditModal && (
              <Modal
                title={`Credits — ${orgCreditModal.name}`}
                onClose={() => { setOrgCreditModal(null); setOrgCreditPacks(""); }}
              >
                <p style={{ margin: "0 0 14px", fontSize: 13, color: T.textMid }}>
                  Current balance: <strong>{orgCreditModal.credits_remaining}</strong> credits for this school.
                </p>
                <form onSubmit={submitOrgCredits}>
                  <Input
                    label="10-credit packs (+ or −)"
                    value={orgCreditPacks}
                    onChange={setOrgCreditPacks}
                    placeholder="e.g. 5 adds 50, −2 removes 20"
                    help="Whole numbers only. Each pack is exactly 10 credits."
                  />
                  <Input label="Reason (audit)" value={orgCreditReason} onChange={setOrgCreditReason} />
                  <div style={pt.modalActions}>
                    <Btn type="button" variant="ghost" iconOnly ariaLabel="Cancel" onClick={() => { setOrgCreditModal(null); setOrgCreditPacks(""); }} disabled={busy}>
                      <UiIcon name="close" size={18} stroke="currentColor" />
                    </Btn>
                    <Btn type="submit" iconOnly ariaLabel="Apply credits" disabled={busy}>
                      <UiIcon name="check" size={18} stroke="currentColor" />
                    </Btn>
                  </div>
                </form>
              </Modal>
            )}
            {orgDeleteModal && (
              <Modal
                title={`Remove organization — ${orgDeleteModal.name}`}
                onClose={() => { setOrgDeleteModal(null); setOrgDeleteConfirmName(""); setOrgDeleteNotes(""); }}
              >
                <p style={{ margin: "0 0 12px", fontSize: 13, color: T.danger, fontWeight: 600 }}>
                  This cannot be undone. All users, sign-ins, timetable state, generated timetables/reports, credit history, and keys for this school will be deleted.
                </p>
                <p style={{ margin: "0 0 14px", fontSize: 13, color: T.textMid }}>
                  Type the organization name exactly as shown: <strong style={{ color: T.text }}>{orgDeleteModal.name}</strong>
                </p>
                <form onSubmit={submitDeleteOrg}>
                  <Input label="Confirmation (organization name)" value={orgDeleteConfirmName} onChange={setOrgDeleteConfirmName} placeholder={orgDeleteModal.name} required />
                  <Input label="Notes (stored on purge record)" value={orgDeleteNotes} onChange={setOrgDeleteNotes} placeholder="Optional reason for your records" />
                  <div style={pt.modalActions}>
                    <Btn type="button" variant="ghost" iconOnly ariaLabel="Cancel" onClick={() => { setOrgDeleteModal(null); setOrgDeleteConfirmName(""); setOrgDeleteNotes(""); }} disabled={busy}>
                      <UiIcon name="close" size={18} stroke="currentColor" />
                    </Btn>
                    <Btn type="submit" variant="danger" disabled={busy}>Remove organization</Btn>
                  </div>
                </form>
              </Modal>
            )}
            <div style={{ ...css.card, padding: 0, overflow: "auto" }}>
              {isMobile ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12 }}>
                  {orgs.orgs.map((o) => (
                    <div key={o.id} style={{ border: `1px solid ${T.surfaceBorder}`, borderRadius: 10, padding: "10px 12px", background: T.surface }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{o.name}</div>
                        <span style={css.badge(T.brand)}>{o.credits_remaining} credits</span>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, color: T.textMid }}>Users: {o.user_count}</div>
                      <div style={{ marginTop: 2, fontSize: 12, color: T.textSoft }}>Created: {formatDateTime(o.created_at)}</div>
                      <div style={{ marginTop: 2, fontSize: 12, color: T.textSoft }}>Last activity: {formatDateTime(o.last_activity_at)}</div>
                      <div style={{ marginTop: 8, fontFamily: "ui-monospace, monospace", fontSize: 11, color: T.textSoft, wordBreak: "break-all" }}>{o.id}</div>
                      <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <Btn size="sm" iconOnly ariaLabel={`Add credits — ${o.name}`} onClick={() => { setOrgCreditModal(o); setOrgCreditPacks(""); setOrgCreditReason("Operator adjustment"); }} disabled={busy}><UiIcon name="create" size={16} stroke="currentColor" /></Btn>
                        <Btn size="sm" variant="danger" iconOnly ariaLabel={`Remove organization — ${o.name}`} onClick={() => { setOrgDeleteModal(o); setOrgDeleteConfirmName(""); setOrgDeleteNotes(""); }} disabled={busy}><UiIcon name="trash" size={16} stroke="#fff" /></Btn>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
              <table style={pt.table}>
                <thead>
                  <tr>
                    <th style={pt.th}>School / org</th>
                    <th style={pt.th}>Current credits</th>
                    <th style={pt.th}>Users</th>
                    <th style={pt.th}>Created</th>
                    <th style={pt.th}>Last activity</th>
                    <th style={pt.th}>Org ID</th>
                    <th style={{ ...pt.th, textAlign: "right", width: 1 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.orgs.map((o) => (
                    <tr key={o.id}>
                      <td style={{ ...pt.td, fontWeight: 600 }}>{o.name}</td>
                      <td style={{ ...pt.td, fontWeight: 700, fontSize: 15 }}>{o.credits_remaining}</td>
                      <td style={pt.td}>{o.user_count}</td>
                      <td style={{ ...pt.td, whiteSpace: "nowrap", fontSize: 12 }}>{formatDateTime(o.created_at)}</td>
                      <td style={{ ...pt.td, whiteSpace: "nowrap", fontSize: 12 }}>{formatDateTime(o.last_activity_at)}</td>
                      <td style={pt.tdMono}>{o.id}</td>
                      <td style={pt.tdActions}>
                        <div style={pt.rowActions}>
                          <Btn size="sm" iconOnly ariaLabel={`Add credits — ${o.name}`} onClick={() => { setOrgCreditModal(o); setOrgCreditPacks(""); setOrgCreditReason("Operator adjustment"); }} disabled={busy}>
                            <UiIcon name="create" size={16} stroke="currentColor" />
                          </Btn>
                          <Btn size="sm" variant="danger" iconOnly ariaLabel={`Remove organization — ${o.name}`} onClick={() => { setOrgDeleteModal(o); setOrgDeleteConfirmName(""); setOrgDeleteNotes(""); }} disabled={busy}>
                            <UiIcon name="trash" size={16} stroke="#fff" />
                          </Btn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </div>
            <div style={{ padding: "10px 4px 0", fontSize: 12, color: T.textMid }}>Total organizations: {orgs.total}</div>

            {orgPurges?.purges?.length > 0 && (
              <div style={{ ...css.card, marginTop: 16, padding: 16 }}>
                <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: T.text }}>Recent organization removals</h3>
                <p style={{ margin: "0 0 12px", fontSize: 12, color: T.textMid }}>Snapshot of users and counts is stored for compliance and support.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {orgPurges.purges.map((p) => (
                    <div key={p.id} style={{ border: `1px solid ${T.surfaceBorder}`, borderRadius: 10, padding: "10px 12px", fontSize: 12 }}>
                      <div style={{ fontWeight: 700, color: T.text }}>{p.orgName} <span style={{ fontWeight: 500, color: T.textMid }}>({formatDateTime(p.createdAt)})</span></div>
                      {p.summary && (
                        <div style={{ marginTop: 6, color: T.textMid, lineHeight: 1.5 }}>
                          Users removed: {p.summary.userCount} · Runs: {p.summary.timetableRunCount} · Credit rows: {p.summary.creditLedgerRowCount} · API keys: {p.summary.apiKeyCount}
                          {typeof p.summary.platformErrorLogRowCount === "number" ? ` · Error log rows: ${p.summary.platformErrorLogRowCount}` : ""}
                          {p.summary.hadTenantState ? " · Had timetable setup data" : ""}
                          {p.notes ? ` · Notes: ${p.notes}` : ""}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "users" && users && (
          <div>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: T.textMid, lineHeight: 1.5 }}>
              Each row is one login. School credits are managed on the <strong>Organizations</strong> tab. Multiple rows usually mean several schools or test accounts.
              The eye only shows a password if this portal already knows it (after Register org or Set password with the key icon).
            </p>
            <div style={{ ...pt.toolRow, marginBottom: 12 }}>
              {Array.from(new Set((users.users || []).map((u) => String(u.role || "").toLowerCase()).filter(Boolean))).map((roleKey) => (
                <label key={roleKey} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: T.textMid }}>
                  <input
                    type="checkbox"
                    checked={roleVisibility[roleKey] ?? true}
                    onChange={(e) => setRoleVisibility((prev) => ({ ...prev, [roleKey]: e.target.checked }))}
                  />
                  Show {roleKey}
                </label>
              ))}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ ...pt.inlineLabel, display: "block", marginBottom: 6 }} htmlFor="portal-user-search">Search (name, email, org)</label>
              <div style={pt.controlWithIconRow}>
                <input
                  id="portal-user-search"
                  type="text"
                  value={userQ}
                  onChange={(e) => setUserQ(e.target.value)}
                  placeholder="Filter…"
                  style={{ ...pt.inlineInput, flex: "1 1 220px", minWidth: 0, maxWidth: 480, width: "100%" }}
                />
                <Btn type="button" iconOnly ariaLabel="Search users" onClick={refreshTab} disabled={busy} style={pt.iconSq39}>
                  <UiIcon name="search" size={18} stroke="currentColor" />
                </Btn>
              </div>
            </div>
            <div style={{ ...css.card, padding: 0, overflow: "auto" }}>
              {isMobile ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12 }}>
                  {users.users.filter((u) => roleVisibility[String(u.role || "").toLowerCase()] ?? true).map((u) => (
                    <div key={u.id} style={{ border: `1px solid ${T.surfaceBorder}`, borderRadius: 10, padding: "10px 12px", background: T.surface }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{u.full_name}</div>
                        <span style={css.badge(u.role === "owner" ? T.brand : u.role === "admin" ? T.warning : T.textSoft)}>{u.role}</span>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, color: T.textMid }}>{u.email}</div>
                      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.textMid, textTransform: "uppercase", letterSpacing: "0.05em" }}>Password</span>
                        <div style={{ flex: "1 1 200px", minWidth: 0 }}>{renderPortalUserPasswordCell(u)}</div>
                      </div>
                      <div style={{ marginTop: 2, fontSize: 12, color: T.textSoft }}>{u.org_name}</div>
                      <div style={{ marginTop: 2, fontSize: 12, color: T.textSoft }}>Created: {formatDateTime(u.created_at)}</div>
                      <div style={{ marginTop: 2, fontSize: 12, color: T.textSoft }}>Last activity: {formatDateTime(u.last_activity_at, "No activity yet")}</div>
                      <div style={{ marginTop: 8, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <Btn size="sm" variant="ghost" iconOnly ariaLabel={`Edit ${u.full_name}`} onClick={() => openEditUser(u)} disabled={busy}><UiIcon name="preferences" size={16} stroke="currentColor" /></Btn>
                        <Btn size="sm" variant="ghost" iconOnly ariaLabel={u.is_active ? `Deactivate ${u.full_name}` : `Activate ${u.full_name}`} onClick={() => toggleUserActive(u)} disabled={busy}><UiIcon name={u.is_active ? "pause" : "play"} size={16} stroke="currentColor" /></Btn>
                        <Btn size="sm" variant="danger" iconOnly ariaLabel={`Delete user ${u.full_name}`} onClick={() => removeUser(u)} disabled={busy}><UiIcon name="trash" size={16} stroke="#fff" /></Btn>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
              <table style={pt.table}>
                <thead>
                  <tr>
                    <th style={pt.th}>Name</th>
                    <th style={pt.th}>Email</th>
                    <th style={pt.th}>Password</th>
                    <th style={pt.th}>Role</th>
                    <th style={pt.th}>Org</th>
                    <th style={pt.th}>Active</th>
                    <th style={pt.th}>Created</th>
                    <th style={pt.th}>Last activity</th>
                    <th style={{ ...pt.th, textAlign: "right", width: 1 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.users.filter((u) => roleVisibility[String(u.role || "").toLowerCase()] ?? true).map((u) => (
                    <tr key={u.id}>
                      <td style={pt.td}>{u.full_name}</td>
                      <td style={pt.td}>{u.email}</td>
                      <td style={{ ...pt.td, maxWidth: 340 }}>{renderPortalUserPasswordCell(u)}</td>
                      <td style={pt.td}>{u.role}</td>
                      <td style={pt.td}>{u.org_name}</td>
                      <td style={pt.td}>{u.is_active ? "Yes" : "No"}</td>
                      <td style={{ ...pt.td, whiteSpace: "nowrap", fontSize: 12 }}>{formatDateTime(u.created_at)}</td>
                      <td style={{ ...pt.td, whiteSpace: "nowrap", fontSize: 12 }}>{formatDateTime(u.last_activity_at, "No activity yet")}</td>
                      <td style={pt.tdActions}>
                        <div style={pt.rowActions}>
                          <Btn
                            size="sm"
                            variant="ghost"
                            iconOnly
                            ariaLabel={`Edit ${u.full_name}`}
                            onClick={() => openEditUser(u)}
                            disabled={busy}
                          >
                            <UiIcon name="preferences" size={16} stroke="currentColor" />
                          </Btn>
                          <Btn
                            size="sm"
                            variant="ghost"
                            iconOnly
                            ariaLabel={u.is_active ? `Deactivate ${u.full_name}` : `Activate ${u.full_name}`}
                            onClick={() => toggleUserActive(u)}
                            disabled={busy}
                          >
                            <UiIcon name={u.is_active ? "pause" : "play"} size={16} stroke="currentColor" />
                          </Btn>
                          <Btn size="sm" variant="danger" iconOnly ariaLabel={`Delete user ${u.full_name}`} onClick={() => removeUser(u)} disabled={busy}>
                            <UiIcon name="trash" size={16} stroke="#fff" />
                          </Btn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </div>
            {userEditModal && (
              <Modal title={`Edit user — ${userEditModal.full_name}`} onClose={() => setUserEditModal(null)}>
                <form onSubmit={submitEditUser}>
                  <Input label="Full name" value={userEditForm.fullName} onChange={(v) => setUserEditForm((p) => ({ ...p, fullName: v }))} required />
                  <Input label="Email" value={userEditForm.email} onChange={(v) => setUserEditForm((p) => ({ ...p, email: v }))} required />
                  <div style={{ ...pt.inlineField, marginBottom: 12 }}>
                    <label style={pt.inlineLabel}>Role</label>
                    <select
                      value={userEditForm.role}
                      onChange={(e) => setUserEditForm((p) => ({ ...p, role: e.target.value }))}
                      style={pt.inlineInput}
                    >
                      <option value="owner">owner</option>
                      <option value="admin">admin</option>
                      <option value="staff">staff</option>
                    </select>
                  </div>
                  <div style={pt.modalActions}>
                    <Btn type="button" variant="ghost" iconOnly ariaLabel="Cancel" onClick={() => setUserEditModal(null)} disabled={busy}>
                      <UiIcon name="close" size={18} stroke="currentColor" />
                    </Btn>
                    <Btn type="submit" iconOnly ariaLabel="Save user" disabled={busy}>
                      <UiIcon name="check" size={18} stroke="currentColor" />
                    </Btn>
                  </div>
                </form>
              </Modal>
            )}
            {passwordResetUser && (
              <Modal
                title={`Set password — ${passwordResetUser.full_name}`}
                onClose={() => {
                  setPasswordResetUser(null);
                  setPasswordResetPlain("");
                }}
                scrollToTopKey={passwordResetUser.id}
              >
                <form onSubmit={submitPasswordReset}>
                  <p style={{ margin: "0 0 14px", fontSize: 13, color: T.textMid, lineHeight: 1.55 }}>
                    This replaces the user’s current password and signs them out on all devices. Leave the field blank for a random password. After you save, use the eye icon in the Users table to show or hide it.
                  </p>
                  <Input
                    label="New password (optional)"
                    type="password"
                    value={passwordResetPlain}
                    onChange={(v) => setPasswordResetPlain(v)}
                    help="Minimum 6 characters if you type one yourself."
                  />
                  <div style={pt.modalActions}>
                    <Btn
                      type="button"
                      variant="ghost"
                      iconOnly
                      ariaLabel="Cancel"
                      onClick={() => {
                        setPasswordResetUser(null);
                        setPasswordResetPlain("");
                      }}
                      disabled={busy}
                    >
                      <UiIcon name="close" size={18} stroke="currentColor" />
                    </Btn>
                    <Btn type="submit" iconOnly ariaLabel="Save new password" disabled={busy}>
                      <UiIcon name="check" size={18} stroke="currentColor" />
                    </Btn>
                  </div>
                </form>
              </Modal>
            )}
          </div>
        )}

        {tab === "credits" && ledger && (
          <div>
            <form onSubmit={(e) => { e.preventDefault(); refreshTab(); }} style={{ marginBottom: 14 }}>
              <label style={{ ...pt.inlineLabel, display: "block", marginBottom: 6 }} htmlFor="credit-ledger-org-filter">Filter by org ID (optional)</label>
              <div style={pt.controlWithIconRow}>
                <input
                  id="credit-ledger-org-filter"
                  type="text"
                  value={creditOrgId}
                  onChange={(e) => setCreditOrgId(e.target.value)}
                  placeholder="UUID"
                  style={{ ...pt.inlineInput, flex: "1 1 220px", minWidth: 0, maxWidth: 520, width: "100%" }}
                />
                <Btn
                  type="submit"
                  variant="ghost"
                  iconOnly
                  ariaLabel="Apply filter and reload ledger"
                  disabled={busy}
                  style={pt.iconSq39}
                >
                  <UiIcon name="filter" size={18} stroke="currentColor" />
                </Btn>
              </div>
            </form>
            <div style={{ ...css.card, marginBottom: 20 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Adjust credits (by organization)</h3>
              <p style={{ margin: "0 0 12px", fontSize: 12, color: T.textMid }}>Amount must be a multiple of 10. Enter whole <strong>packs of 10</strong>; positive adds credits, negative removes.</p>
              <form onSubmit={handleAdjustCredits} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
                <div style={{ ...pt.inlineField, flex: "1 1 200px", minWidth: 0 }}>
                  <label style={pt.inlineLabel} htmlFor="credit-adjust-org-id">Organization ID</label>
                  <input
                    id="credit-adjust-org-id"
                    type="text"
                    required
                    value={creditOrgId}
                    onChange={(e) => setCreditOrgId(e.target.value)}
                    style={pt.inlineInput}
                  />
                </div>
                <div style={{ ...pt.inlineField, flex: "0 1 168px", minWidth: 0 }}>
                  <label style={pt.inlineLabel} htmlFor="credit-adjust-packs">10-credit packs (+ or −)</label>
                  <input
                    id="credit-adjust-packs"
                    type="text"
                    value={creditPacksTen}
                    onChange={(e) => setCreditPacksTen(e.target.value)}
                    placeholder="e.g. 3 or −2"
                    style={pt.inlineInput}
                  />
                </div>
                <div style={{ ...pt.inlineField, flex: "1 1 200px", minWidth: 0 }}>
                  <label style={pt.inlineLabel} htmlFor="credit-adjust-reason">Audit reason</label>
                  <input
                    id="credit-adjust-reason"
                    type="text"
                    value={creditReason}
                    onChange={(e) => setCreditReason(e.target.value)}
                    style={pt.inlineInput}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                  <span style={{ ...pt.inlineLabel, visibility: "hidden" }} aria-hidden="true">Action</span>
                  <Btn type="submit" iconOnly ariaLabel="Apply credit adjustment" disabled={busy} style={pt.iconSq39}>
                    <UiIcon name="check" size={18} stroke="currentColor" />
                  </Btn>
                </div>
              </form>
            </div>
            <div style={{ ...css.card, padding: 0, overflow: "auto" }}>
              <table style={pt.tableSm}>
                <thead>
                  <tr>
                    <th style={pt.thSm}>When</th>
                    <th style={pt.thSm}>Org</th>
                    <th style={{ ...pt.thSm, textAlign: "right" }}>Δ</th>
                    <th style={pt.thSm}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.entries.map((r) => (
                    <tr key={r.id}>
                      <td style={{ ...pt.tdSm, whiteSpace: "nowrap" }}>{formatDateTime(r.created_at)}</td>
                      <td style={pt.tdSm}>{r.org_name}</td>
                      <td style={{ ...pt.tdSm, textAlign: "right", fontWeight: 700, color: r.delta < 0 ? T.danger : T.success }}>{r.delta}</td>
                      <td style={pt.tdSm}>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "audit" && audit && (
          <div style={{ ...css.card, padding: 0, overflow: "auto" }}>
            <table style={pt.tableSm}>
              <thead>
                <tr>
                  <th style={pt.thSm}>When</th>
                  <th style={pt.thSm}>Org</th>
                  <th style={pt.thSm}>Action</th>
                  <th style={pt.thSm}>Entity</th>
                  <th style={pt.thSm}>User</th>
                </tr>
              </thead>
              <tbody>
                {audit.logs.map((r) => (
                  <tr key={r.id}>
                    <td style={{ ...pt.tdSm, whiteSpace: "nowrap" }}>{formatDateTime(r.created_at)}</td>
                    <td style={pt.tdSm}>{r.org_name}</td>
                    <td style={pt.tdSm}>{r.action}</td>
                    <td style={pt.tdSm}>{r.entity_type}</td>
                    <td style={pt.tdSm}>{r.user_name || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "errors" && errors && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {errors.logs.length === 0 && <p style={{ color: T.textMid }}>No errors recorded yet. Unhandled server exceptions are logged here.</p>}
            {errors.logs.map((r) => (
              <div key={r.id} style={{ ...css.card, padding: 14 }}>
                <div style={{ fontSize: 12, color: T.textMid }}>{formatDateTime(r.created_at)} · {r.method} {r.route}</div>
                <div style={{ fontWeight: 700, marginTop: 6 }}>{r.message}</div>
                {r.detail_text && <pre style={{ margin: "8px 0 0", fontSize: 11, whiteSpace: "pre-wrap", color: T.textMid }}>{r.detail_text}</pre>}
                {r.stack_text && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: "pointer", fontSize: 12 }}>Stack trace</summary>
                    <pre style={{ fontSize: 10, overflow: "auto", maxHeight: 200, background: T.surfaceAlt, padding: 8, borderRadius: 6 }}>{r.stack_text}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "validation-findings" && validationFindings && (
          <div style={{ ...css.card, padding: 0, overflow: "auto" }}>
            <table style={pt.tableSm}>
              <thead>
                <tr>
                  <th style={pt.thSm}>When</th>
                  <th style={pt.thSm}>School</th>
                  <th style={pt.thSm}>Run</th>
                  <th style={pt.thSm}>Code</th>
                  <th style={pt.thSm}>Risk</th>
                  <th style={pt.thSm}>Status</th>
                </tr>
              </thead>
              <tbody>
                {validationFindings.findings.map((r) => (
                  <tr key={`${r.runId}-${r.findingId}`}>
                    <td style={{ ...pt.tdSm, whiteSpace: "nowrap" }}>{formatDateTime(r.validationLoggedAt)}</td>
                    <td style={pt.tdSm}>{r.orgName}</td>
                    <td style={pt.tdSm}>{r.runId}</td>
                    <td style={pt.tdSm}>{r.code}</td>
                    <td style={pt.tdSm}>{r.risk}</td>
                    <td style={pt.tdSm}>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "settings" && settings && (
          <form onSubmit={handleSaveSettings} style={{ ...css.card, maxWidth: 480 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Defaults (live)</h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: T.textMid, lineHeight: 1.5 }}>
              New self-serve signups receive <strong>signup initial credits</strong>. The in-app purchase screen uses <strong>credit pack size</strong> per pack; schools request packs and you approve here. Pack price is informational for future billing.
            </p>
            <Input label="Signup initial credits" value={settingsDraft.signup_initial_credits} onChange={(v) => setSettingsDraft((d) => ({ ...d, signup_initial_credits: v }))} />
            <Input label="Credit pack size · purchase flow" value={settingsDraft.credit_pack_size} onChange={(v) => setSettingsDraft((d) => ({ ...d, credit_pack_size: v }))} />
            <Input label="Pack price · cents · reference" value={settingsDraft.credit_pack_price_cents} onChange={(v) => setSettingsDraft((d) => ({ ...d, credit_pack_price_cents: v }))} />
            <div style={pt.modalActions}>
              <Btn type="submit" iconOnly ariaLabel="Save settings" disabled={busy}>
                <UiIcon name="check" size={18} stroke="currentColor" />
              </Btn>
            </div>
          </form>
        )}

        {tab === "role-access" && (
          <div style={{ ...css.card, maxWidth: 980 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Role access control</h3>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: T.textMid, lineHeight: 1.5 }}>
              Define what each role can see and do. You can also add custom roles here.
            </p>
            <div style={{ ...pt.toolRow, marginBottom: 12 }}>
              <div style={{ ...pt.inlineField, minWidth: 280 }}>
                <label style={pt.inlineLabel}>Add new role</label>
                <input value={newRoleKey} onChange={(e) => setNewRoleKey(e.target.value)} placeholder="e.g. coordinator" style={pt.inlineInput} />
              </div>
              <Btn type="button" ariaLabel="Add role" onClick={addRole}>
                <UiIcon name="create" size={16} stroke="currentColor" />
                Add role
              </Btn>
            </div>
            <div style={{ overflow: "auto", border: `1px solid ${T.surfaceBorder}`, borderRadius: 10 }}>
              <table style={pt.tableSm}>
                <thead>
                  <tr>
                    <th style={pt.thSm}>Role</th>
                    <th style={pt.thSm}>Manage users</th>
                    <th style={pt.thSm}>Manage credits</th>
                    <th style={pt.thSm}>View audit</th>
                    <th style={pt.thSm}>Manage API keys</th>
                    <th style={pt.thSm}>Configure timetable</th>
                    <th style={{ ...pt.thSm, textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(roleAccessPolicy.roles || []).map((r) => (
                    <tr key={r.key}>
                      <td style={{ ...pt.tdSm, fontWeight: 700 }}>{r.key}</td>
                      {["canManageUsers", "canManageCredits", "canViewAudit", "canManageApiKeys", "canConfigureTimetable"].map((perm) => (
                        <td key={perm} style={pt.tdSm}>
                          <input type="checkbox" checked={Boolean(r[perm])} onChange={(e) => toggleRolePermission(r.key, perm, e.target.checked)} />
                        </td>
                      ))}
                      <td style={{ ...pt.tdSm, textAlign: "right" }}>
                        <Btn type="button" variant="ghost" size="sm" iconOnly ariaLabel={`Remove ${r.key}`} onClick={() => removeRole(r.key)} disabled={busy}>
                          <UiIcon name="trash" size={15} stroke="currentColor" />
                        </Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={pt.modalActions}>
              <Btn type="button" iconOnly ariaLabel="Save role access" onClick={saveRoleAccessPolicy} disabled={busy}>
                <UiIcon name="check" size={18} stroke="currentColor" />
              </Btn>
            </div>
          </div>
        )}

        {tab === "register" && (
          <form onSubmit={handleRegister} style={{ ...css.card, maxWidth: 480 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Register organization (owner)</h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: T.textMid, lineHeight: 1.5 }}>
              Creates a new school account the same way self-serve signup does, with an optional custom starting credit balance.
            </p>
            <Input label="Organization name" value={reg.orgName} onChange={(v) => setReg((r) => ({ ...r, orgName: v }))} required />
            <Input label="Owner full name" value={reg.fullName} onChange={(v) => setReg((r) => ({ ...r, fullName: v }))} required />
            <Input label="Owner email" type="email" value={reg.email} onChange={(v) => setReg((r) => ({ ...r, email: v }))} required />
            <Input label="Initial password (share with owner)" type="password" value={reg.password} onChange={(v) => setReg((r) => ({ ...r, password: v }))} required />
            <Input label="Initial credits (optional, blank = portal default)" value={reg.initialCredits} onChange={(v) => setReg((r) => ({ ...r, initialCredits: v }))} placeholder="e.g. 50" />
            <div style={pt.modalActions}>
              <Btn type="submit" iconOnly ariaLabel="Create organization" disabled={busy}>
                <UiIcon name="create" size={18} stroke="currentColor" />
              </Btn>
            </div>
          </form>
        )}
        </main>
      </div>
    </div>
  );
}

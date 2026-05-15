import { useEffect, useId, useState } from "react";
import { confirmPasswordReset, requestPasswordReset } from "../../api";

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

function PasswordInputWithToggle({ label, value, onChange, placeholder, ui }) {
  const { Field, css, T } = ui;
  const [visible, setVisible] = useState(false);
  const autoId = useId();
  const controlId = `schooltime-password${autoId.replace(/:/g, "")}`;
  return (
    <Field label={label} htmlFor={controlId}>
      <div style={{ position: "relative" }}>
        <input
          id={controlId}
          name="password"
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={visible ? "off" : "current-password"}
          style={{ ...css.input, paddingRight: 40 }}
        />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          title={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((v) => !v)}
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
          <EyeIcon off={visible} />
        </button>
      </div>
    </Field>
  );
}

export function AuthScreen({ mode, setMode, onSubmit, ui, branding }) {
  const { T, Input, Btn, Field, css } = ui;
  const { BRAND_FONT, schoolTimeLogo } = branding;

  const [form, setForm] = useState({ orgName: "", fullName: "", email: "", password: "" });
  const [reset, setReset] = useState({ token: "", newPassword: "" });
  const [resetTokenHint, setResetTokenHint] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [operatorIconHover, setOperatorIconHover] = useState(false);
  const isCompact = typeof window !== "undefined" ? window.innerWidth < 900 : false;
  const creatorPortalPath = (() => {
    const base = String(import.meta.env.BASE_URL || "/");
    const normalizedBase = base === "/" ? "" : base.replace(/\/+$/, "");
    return `${normalizedBase}/creator`;
  })();

  useEffect(() => {
    // Clear stale auth errors when switching between login/register/reset views.
    setError("");
    setResetTokenHint("");
  }, [mode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search || "");
    const token = params.get("token");
    const modeQuery = params.get("mode");
    if (token) {
      setReset((prev) => ({ ...prev, token: token.trim() }));
      setMode("reset");
      setResetTokenHint("Reset token pre-filled from link.");
    } else if (modeQuery === "reset") {
      setMode("reset");
    }
  }, [setMode]);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      await onSubmit(form);
    } catch (err) {
      const rawMessage = err?.message || "Authentication failed";
      const lower = String(rawMessage).toLowerCase();
      if (mode === "login") {
        setError("Incorrect username or password.");
      } else if (mode === "register") {
        if (lower.includes("exists") || lower.includes("already")) {
          setError("This email is already registered. Please sign in instead.");
        } else if (lower.includes("invalid") || lower.includes("email")) {
          setError("Please enter a valid email address.");
        } else if (lower.includes("password")) {
          setError("Please use a stronger password (at least 6 characters).");
        } else {
          setError("Could not create your account. Please check your details and try again.");
        }
      } else {
        setError(rawMessage);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRequestReset = async () => {
    if (!String(form.email || "").trim()) {
      setError("Enter your email first to request a reset token.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await requestPasswordReset(form.email);
      setResetTokenHint("If this email exists, reset instructions have been sent.");
      setMode("reset");
    } catch (err) {
      setError(err.message || "Could not request reset");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmReset = async () => {
    setBusy(true);
    setError("");
    try {
      await confirmPasswordReset(reset.token, reset.newPassword);
      setMode("login");
      setReset({ token: "", newPassword: "" });
      setResetTokenHint("");
    } catch (err) {
      setError(err.message || "Could not reset password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#edf2ff 0%,#f8faff 40%,#eef4ff 100%)", display: "grid", placeItems: "center", padding: isCompact ? 12 : 18, boxSizing: "border-box", width: "100%", overflowX: "hidden" }}>
      <div style={{ width: "100%", maxWidth: 1020, minWidth: 0, display: "grid", gridTemplateColumns: isCompact ? "1fr" : "1.05fr 1fr", borderRadius: isCompact ? 16 : 22, overflow: "hidden", boxShadow: "0 30px 70px rgba(18,33,64,0.16)", border: `1px solid ${T.surfaceBorder}`, boxSizing: "border-box" }}>
        <div style={{ background: "linear-gradient(150deg,#0d1733 0%,#16213e 52%,#1c2c56 100%)", color: "#fff", padding: isCompact ? "24px 20px 22px" : "34px 34px 28px", display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0 }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "6px 12px", borderRadius: 999, background: "rgba(255,255,255,0.12)", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>School Planner</div>
            <h1 style={{ margin: "16px 0 8px", fontFamily: BRAND_FONT, fontSize: isCompact ? 28 : 34, lineHeight: 1.05, letterSpacing: "0.02em" }}>SchoolTime</h1>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.78)", fontSize: 14 }}>
              A simple timetable platform built for schools and teaching teams.
            </p>
          </div>
          <div style={{ display: "grid", gap: 10, marginTop: 24 }}>
            {[
              "Create timetables quickly",
              "Manage staff access by role",
              "Track key activity clearly",
            ].map((point) => (
              <div key={point} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <span style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(80,250,180,0.18)", color: "#7effcf", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 900 }}>•</span>
                <span style={{ color: "rgba(255,255,255,0.9)" }}>{point}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: isCompact ? "repeat(auto-fit, minmax(100px, 1fr))" : "repeat(3, minmax(0, 1fr))", gap: 10 }}>
            {[["99.9%", "Reliability goal"], ["Team roles", "Access control"], ["Live", "Usage updates"]].map(([v, l]) => (
              <div key={l} style={{ background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 10, padding: "10px 10px 9px" }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{v}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.72)", marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: "relative", background: "#fff", padding: isCompact ? "24px 18px 20px" : "34px 30px 24px", minWidth: 0, boxSizing: "border-box" }}>
          <button
            type="button"
            aria-label="Platform operator sign-in"
            onClick={() => {
              window.location.assign(creatorPortalPath);
            }}
            onMouseEnter={() => setOperatorIconHover(true)}
            onMouseLeave={() => setOperatorIconHover(false)}
            style={{
              position: "absolute",
              top: isCompact ? 8 : 12,
              left: isCompact ? 8 : 12,
              width: 34,
              height: 34,
              padding: 0,
              margin: 0,
              border: "none",
              borderRadius: 9,
              background: operatorIconHover ? "rgba(26,26,46,0.05)" : "transparent",
              color: T.textSoft,
              opacity: operatorIconHover ? 0.55 : 0.28,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              transition: "opacity 0.18s ease, background 0.18s ease",
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="3" width="7.5" height="7.5" rx="1.2" />
              <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.2" />
              <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.2" />
              <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.2" />
            </svg>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, paddingLeft: isCompact ? 36 : 40 }}>
            <img src={schoolTimeLogo} alt="SchoolTime logo" style={{ width: 52, height: 52, borderRadius: 14, objectFit: "cover", boxShadow: "0 8px 24px rgba(15,52,96,0.24)" }} />
            <div>
              <h2 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "0.02em", fontFamily: BRAND_FONT }}>SchoolTime</h2>
              <p style={{ margin: "2px 0 0", color: T.textSoft, fontSize: 12 }}>Welcome back</p>
            </div>
          </div>
          <p style={{ margin: "0 0 18px", fontSize: 13, color: T.textSoft }}>
            {mode === "login" ? "Sign in to continue." : mode === "register" ? "Create your school account and invite your team." : "Reset your password."}
          </p>

          {mode === "register" && (
            <>
              <Input label="Organization Name" value={form.orgName} onChange={(v) => setForm((p) => ({ ...p, orgName: v }))} placeholder="Example Public School" />
              <Input label="Full Name" value={form.fullName} onChange={(v) => setForm((p) => ({ ...p, fullName: v }))} placeholder="Admin user" />
            </>
          )}
          <Input label="Email" value={form.email} onChange={(v) => setForm((p) => ({ ...p, email: v }))} placeholder="you@school.org" />
          {mode !== "reset" && (
            <PasswordInputWithToggle
              label="Password"
              value={form.password}
              onChange={(v) => setForm((p) => ({ ...p, password: v }))}
              placeholder="At least 6 characters"
              ui={{ Field, css, T }}
            />
          )}
          {mode === "reset" && (
            <>
              <Input label="Reset Token" value={reset.token} onChange={(v) => setReset((p) => ({ ...p, token: v }))} />
              <PasswordInputWithToggle
                label="New Password"
                value={reset.newPassword}
                onChange={(v) => setReset((p) => ({ ...p, newPassword: v }))}
                ui={{ Field, css, T }}
              />
            </>
          )}
          {resetTokenHint && <p style={{ fontSize: 11, color: T.info, marginBottom: 10 }}>{resetTokenHint}</p>}
          {error && <p style={{ color: T.danger, fontSize: 12, marginBottom: 10 }}>{error}</p>}
          {mode === "reset"
            ? <Btn onClick={handleConfirmReset} fullWidth disabled={busy} style={{ height: 42 }}>{busy ? "Please wait..." : "Reset Password"}</Btn>
            : <Btn onClick={submit} fullWidth disabled={busy} style={{ height: 42 }}>{busy ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}</Btn>}

          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
            <button onClick={() => setMode((m) => (m === "login" ? "register" : "login"))} style={{ background: "none", border: "none", color: T.info, cursor: "pointer", fontSize: 12, padding: 0 }}>
              {mode === "login" ? "Need an account? Register" : "Already have an account? Login"}
            </button>
            {mode === "login" && (
              <button type="button" onClick={handleRequestReset} disabled={!form.email || busy} style={{ background: "none", border: "none", color: T.textSoft, cursor: "pointer", fontSize: 12, padding: 0 }}>
                Send password reset token
              </button>
            )}
            <button type="button" onClick={() => setMode((m) => (m === "reset" ? "login" : "reset"))} style={{ background: "none", border: "none", color: T.textSoft, cursor: "pointer", fontSize: 11, padding: 0 }}>
              {mode === "reset" ? "Back to login" : "Have reset token?"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";

export const T = {
  brand: "#1a1a2e", brandMid: "#16213e", accent: "#0f3460",
  gold: "#e94560", goldLight: "#ff6b6b",
  surface: "#ffffff", surfaceAlt: "#f7f8fc", surfaceBorder: "#e8eaf0",
  text: "#1a1a2e", textMid: "#4a4a6a", textSoft: "#8888aa",
  success: "#10b981", warning: "#f59e0b", danger: "#ef4444", info: "#3b82f6",
  LANGUAGE: "#7c3aed", CORE: "#0369a1", NON_CORE: "#0891b2",
  PRACTICAL: "#059669", EXTRA_CURRICULAR: "#d97706", BREAK: "#6b7280", FREE: "#9ca3af",
};

export const BRAND_FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";

export function UiIcon({ name, size = 18, stroke = "currentColor", style }) {
  const common = { fill: "none", stroke, strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" };
  const icons = {
    timetable: (<><rect x="3" y="5" width="18" height="16" rx="2.5" {...common} /><path d="M8 3.5v3M16 3.5v3M3 9.5h18M8 13h3M13 13h3M8 17h3" {...common} /></>),
    create: (<><path d="M12 5v14M5 12h14" {...common} /></>),
    alert: (<><path d="M12 4l8.5 15H3.5L12 4z" {...common} /><path d="M12 9v4.5M12 16.5h.01" {...common} /></>),
    reports: (<><path d="M4 20h16" {...common} /><path d="M7 20v-5M12 20V9M17 20v-8" {...common} /></>),
    downloads: (<><path d="M12 4v10" {...common} /><path d="M8.5 10.5L12 14l3.5-3.5" {...common} /><rect x="4" y="17" width="16" height="3.5" rx="1.2" {...common} /></>),
    subject: (<><path d="M6 4h10a3 3 0 0 1 3 3v13H6z" {...common} /><path d="M6 4h-1a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h1" {...common} /><path d="M9.5 9.5h6M9.5 13h6" {...common} /></>),
    teacher: (<><circle cx="12" cy="8" r="3.2" {...common} /><path d="M5 19.5a7 7 0 0 1 14 0" {...common} /></>),
    preferences: (<><path d="M12 3.8l1.7 1.9 2.5-.2.6 2.4 2.3 1.1-1.1 2.3 1.1 2.3-2.3 1.1-.6 2.4-2.5-.2-1.7 1.9-1.7-1.9-2.5.2-.6-2.4-2.3-1.1 1.1-2.3-1.1-2.3 2.3-1.1.6-2.4 2.5.2L12 3.8z" {...common} /><circle cx="12" cy="12" r="2.5" {...common} /></>),
    period: (<><circle cx="12" cy="12" r="8.2" {...common} /><path d="M12 7.5V12l3.5 2" {...common} /></>),
    school: (<><path d="M12 5L3 9l9 4 9-4-9-4z" {...common} /><path d="M6 10.5V16a6.5 3.5 0 0 0 12 0v-5.5" {...common} /></>),
    building: (<><path d="M4.5 20V6.5L12 3l7.5 3.5V20" {...common} /><path d="M9 20v-4h6v4M8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01" {...common} /></>),
    pin: (<><path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" {...common} /><circle cx="12" cy="11" r="2" {...common} /></>),
    check: (<><path d="M5 12.5l4.2 4.2L19 7.8" {...common} /></>),
    close: (<><path d="M6 6l12 12M18 6L6 18" {...common} /></>),
    star: (<><path d="M12 4.5l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 9.7l5-.7L12 4.5z" {...common} /></>),
    trash: (<><path d="M3 6h18" {...common} /><path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" {...common} /><path d="M19 6v12.5A2.5 2.5 0 0 1 16.5 21h-9A2.5 2.5 0 0 1 5 18.5V6" {...common} /><path d="M10 11v5M14 11v5" {...common} /></>),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ flexShrink: 0, ...style }}>
      {icons[name] || icons.timetable}
    </svg>
  );
}

export function useBreakpoint() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return { isMobile: w < 768, isTablet: w >= 768 && w < 1024, isDesktop: w >= 1024, width: w };
}

export const css = {
  card: { background: T.surface, borderRadius: 12, border: `1px solid ${T.surfaceBorder}`, padding: 20 },
  input: { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.surfaceBorder}`, fontSize: 14, color: T.text, background: T.surface, outline: "none", boxSizing: "border-box", fontFamily: "inherit" },
  badge: (color) => ({ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: color + "22", color }),
  btn: (v = "primary", sz = "md") => {
    const bg = v === "primary" ? T.brand : v === "danger" ? T.danger : v === "success" ? T.success : v === "warning" ? T.warning : "transparent";
    const col = ["primary", "danger", "success", "warning"].includes(v) ? "#fff" : T.textMid;
    const pad = sz === "sm" ? "6px 12px" : sz === "lg" ? "13px 28px" : "9px 18px";
    const fs = sz === "sm" ? 12 : sz === "lg" ? 15 : 13;
    return { display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 8, fontWeight: 600, cursor: "pointer", border: v === "ghost" ? `1px solid ${T.surfaceBorder}` : "none", background: bg, color: col, padding: pad, fontSize: fs, fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap" };
  },
};

export function Btn({ children, onClick, variant = "primary", size = "md", disabled, style, type = "button", fullWidth }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ ...css.btn(variant, size), opacity: disabled ? 0.5 : 1, width: fullWidth ? "100%" : undefined, justifyContent: fullWidth ? "center" : undefined, transform: hov && !disabled ? "translateY(-1px)" : "none", boxShadow: hov && !disabled && variant === "primary" ? `0 4px 14px ${T.brand}40` : "none", ...style }}
    >
      {children}
    </button>
  );
}

export function Field({ label, children, error, help, required }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.textMid, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}{required && <span style={{ color: T.danger }}> *</span>}</label>}
      {children}
      {error && <p style={{ fontSize: 11, color: T.danger, margin: "4px 0 0" }}>{error}</p>}
      {help && <p style={{ fontSize: 11, color: T.textSoft, margin: "4px 0 0" }}>{help}</p>}
    </div>
  );
}

export function Input({ label, value, onChange, placeholder, type = "text", error, help, required, style: sty }) {
  return (
    <Field label={label} error={error} help={help} required={required}>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ ...css.input, borderColor: error ? T.danger : T.surfaceBorder, ...sty }} />
    </Field>
  );
}

export function Select({ label, value, onChange, options, placeholder, error }) {
  return (
    <Field label={label} error={error}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...css.input, appearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24'%3E%3Cpath fill='%23666' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function Modal({ title, children, onClose, width = 560 }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 2000, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 12px", boxSizing: "border-box" }} onClick={onClose}>
      <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: `min(${typeof width === "number" ? `${width}px` : width}, calc(100vw - 24px))`, maxHeight: "92vh", overflow: "auto", boxShadow: "0 -8px 40px rgba(0,0,0,0.18)", animation: "slideUp 0.25s ease", boxSizing: "border-box" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "18px 16px 14px", borderBottom: `1px solid ${T.surfaceBorder}`, position: "sticky", top: 0, background: T.surface, zIndex: 1 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, minWidth: 0, flex: 1 }}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: T.surfaceAlt, border: "none", cursor: "pointer", color: T.textMid, width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><UiIcon name="close" size={15} stroke={T.textMid} /></button>
        </div>
        <div style={{ padding: "16px 16px 28px", boxSizing: "border-box" }}>{children}</div>
      </div>
    </div>
  );
}

export function Toast({ msg, type, onDismiss }) {
  const bg = type === "success" ? T.success : type === "danger" ? T.danger : type === "info" ? T.info : T.warning;

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        background: bg,
        color: "#fff",
        padding: "14px 16px 12px",
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 600,
        boxShadow: "0 8px 32px rgba(0,0,0,0.28)",
        animation: "toastIn 0.3s ease",
        maxWidth: "min(560px, calc(100vw - 24px))",
        width: "max-content",
        minWidth: "min(280px, calc(100vw - 24px))",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            lineHeight: 1.45,
            fontWeight: 600,
          }}
        >
          {msg}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close notification"
          style={{
            width: 28,
            height: 28,
            border: "1px solid rgba(255,255,255,0.45)",
            background: "rgba(255,255,255,0.16)",
            color: "#fff",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
            padding: 0,
          }}
        >
          <UiIcon name="close" size={14} stroke="#fff" />
        </button>
      </div>
    </div>
  );
}

export function EmptyState({ icon, iconKey, title, desc, action }) {
  return (
    <div style={{ textAlign: "center", padding: "52px 24px" }}>
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "center", color: T.textSoft }}>
        {iconKey ? <UiIcon name={iconKey} size={52} stroke={T.textSoft} /> : <div style={{ fontSize: 52, lineHeight: 1 }}>{icon}</div>}
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: T.text, margin: "0 0 8px" }}>{title}</h3>
      <p style={{ fontSize: 14, color: T.textSoft, margin: "0 0 24px", maxWidth: 320, marginLeft: "auto", marginRight: "auto" }}>{desc}</p>
      {action}
    </div>
  );
}

export function ProgressBar({ value, max, color = T.brand, height = 6 }) {
  const pct = Math.min(100, max > 0 ? Math.round((value / max) * 100) : 0);
  return (
    <div style={{ background: T.surfaceBorder, borderRadius: height, height, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, background: color, height: "100%", borderRadius: height, transition: "width 0.5s ease" }} />
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = { FEASIBLE: [T.success, "Feasible"], PARTIAL: [T.warning, "Partial"], INFEASIBLE: [T.danger, "Infeasible"], DRAFT: [T.textSoft, "Draft"], GENERATING: [T.info, "Generating"], GENERATED: [T.success, "Generated"], PUBLISHED: [T.brand, "Published"], FAILED: [T.danger, "Failed"], QUEUED: [T.textSoft, "Queued"], PROCESSING: [T.info, "Processing"], COMPLETED: [T.success, "Completed"] };
  const [color, label] = map[status] || [T.textSoft, status];
  return <span style={css.badge(color)}>{label}</span>;
}

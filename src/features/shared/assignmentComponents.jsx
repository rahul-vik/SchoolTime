import { useEffect, useMemo, useRef, useState } from "react";
import { sortStandardsAscending } from "../../../shared/schoolDisplayOrder.js";
import { T, UiIcon, css, useBreakpoint } from "./uiPrimitives";

/** Red outline/border for paused scheduling entities (divisions, subjects, teachers). */
export function schedulingPausedOutlineStyle(paused) {
  if (paused !== true) return {};
  return { border: `1px solid ${T.danger}`, boxShadow: `0 0 0 1px ${T.danger}44` };
}

/** Left accent for paused rows in tables/lists. */
export function schedulingPausedRowStyle(paused) {
  if (paused !== true) return {};
  return { boxShadow: `inset 3px 0 0 ${T.danger}` };
}

export function SchedulingPauseButton({ paused, onToggle, size = 13, entityLabel = "item" }) {
  const isPaused = paused === true;
  return (
    <button
      type="button"
      onClick={onToggle}
      title={isPaused ? `Resume ${entityLabel} for timetable` : `Pause ${entityLabel} (exclude from timetable)`}
      aria-label={isPaused ? `Resume ${entityLabel}` : `Pause ${entityLabel}`}
      style={{ background: "none", border: "none", cursor: "pointer", color: isPaused ? T.danger : T.textMid, padding: 0, lineHeight: 1, display: "flex", alignItems: "center" }}
    >
      <UiIcon name={isPaused ? "play" : "pause"} size={size} stroke="currentColor" />
    </button>
  );
}

export function DivisionPill({ div, mediums, onRemove, onMediumChange, schedulingPaused = false, onTogglePaused }) {
  const [showPicker, setShowPicker] = useState(false);
  const ref = useRef(null);
  const med = mediums.find((m) => m.id === div.mediumId);
  const medColor = med?.isPrimary ? T.brand : T.textSoft;
  const paused = schedulingPaused === true;

  useEffect(() => {
    if (!showPicker) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setShowPicker(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showPicker]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 6px 5px 10px", background: paused ? T.danger + "08" : T.surfaceAlt, borderRadius: 20, border: `1px solid ${paused ? T.danger : T.surfaceBorder}`, fontSize: 12, opacity: paused ? 0.85 : 1, ...(paused ? { boxShadow: `0 0 0 1px ${T.danger}44` } : {}) }}>
        {onTogglePaused ? (
          <button
            type="button"
            onClick={onTogglePaused}
            title={paused ? "Resume division for timetable" : "Pause division (exclude from timetable)"}
            aria-label={paused ? "Resume division" : "Pause division"}
            style={{ background: "none", border: "none", cursor: "pointer", color: paused ? T.danger : T.textMid, padding: 0, lineHeight: 1, display: "flex", alignItems: "center" }}
          >
            <UiIcon name={paused ? "play" : "pause"} size={13} stroke="currentColor" />
          </button>
        ) : null}
        <span style={{ fontWeight: 700 }}>{div.name}</span>
        <button onClick={() => setShowPicker((p) => !p)} title="Change medium" style={{ background: medColor + "18", border: `1px solid ${medColor}30`, borderRadius: 10, padding: "1px 6px", fontSize: 11, fontWeight: 700, color: medColor, cursor: "pointer", lineHeight: 1.5 }}>{med?.code || "?"}</button>
        <button type="button" onClick={onRemove} aria-label="Remove division" style={{ background: "none", border: "none", cursor: "pointer", color: T.textSoft, padding: "0 2px", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><UiIcon name="close" size={13} stroke={T.textSoft} /></button>
      </div>
      {showPicker && (
        <div style={{ position: "absolute", top: "110%", left: 0, zIndex: 500, background: T.surface, border: `1px solid ${T.surfaceBorder}`, borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: 150, maxHeight: 200, overflowY: "auto", padding: "4px 0" }}>
          {mediums.map((m) => (
            <button key={m.id} onClick={() => { onMediumChange(m.id); setShowPicker(false); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", background: m.id === div.mediumId ? T.brand + "10" : "transparent", border: "none", cursor: "pointer", fontSize: 12, color: T.text, textAlign: "left" }}>
              <span style={{ fontWeight: 700, color: m.isPrimary ? T.brand : T.textMid, minWidth: 26 }}>{m.code}</span>
              <span style={{ flex: 1 }}>{m.name}</span>
              {m.id === div.mediumId && <UiIcon name="check" size={12} stroke={T.success} />}
              {m.isPrimary && m.id !== div.mediumId && <span style={{ fontSize: 9, color: T.textSoft }}>primary</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TeacherDivisionMapper({ assignedDivisionIds, onChange, standards, divisions }) {
  const { isMobile } = useBreakpoint();
  const [isUnrestricted, setIsUnrestricted] = useState(assignedDivisionIds.length === 0);

  const stdsWithDivs = useMemo(
    () => sortStandardsAscending(standards).map((std) => ({ std, divs: divisions.filter((d) => d.standardId === std.id) })).filter((x) => x.divs.length > 0),
    [standards, divisions],
  );

  const selectedStdIds = useMemo(
    () => stdsWithDivs.filter(({ divs }) => divs.some((d) => assignedDivisionIds.includes(d.id))).map(({ std }) => std.id),
    [stdsWithDivs, assignedDivisionIds],
  );

  const [expandedStds, setExpandedStds] = useState(() => new Set(selectedStdIds));

  const toggleExpand = (stdId) => {
    setExpandedStds((prev) => { const n = new Set(prev); n.has(stdId) ? n.delete(stdId) : n.add(stdId); return n; });
  };

  const toggleDiv = (divId) => {
    const next = assignedDivisionIds.includes(divId) ? assignedDivisionIds.filter((id) => id !== divId) : [...assignedDivisionIds, divId];
    onChange(next);
  };

  const toggleStandard = (std, divs) => {
    const allSelected = divs.every((d) => assignedDivisionIds.includes(d.id));
    if (allSelected) {
      onChange(assignedDivisionIds.filter((id) => !divs.some((d) => d.id === id)));
    } else {
      const toAdd = divs.map((d) => d.id).filter((id) => !assignedDivisionIds.includes(id));
      onChange([...assignedDivisionIds, ...toAdd]);
      setExpandedStds((prev) => { const n = new Set(prev); n.add(std.id); return n; });
    }
  };

  const selectAll = () => onChange(divisions.map((d) => d.id));
  const clearAll = () => onChange([]);
  const setUnrestricted = () => {
    setIsUnrestricted(true);
    onChange([]);
  };
  const enableRestrictedSelection = () => {
    setIsUnrestricted(false);
    onChange([]);
  };

  const summaryText = isUnrestricted ? "All divisions (unrestricted)" : `${assignedDivisionIds.length} division${assignedDivisionIds.length !== 1 ? "s" : ""} assigned`;

  return (
    <div style={{ border: `1px solid ${T.surfaceBorder}`, borderRadius: 10, overflow: "hidden", maxWidth: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, padding: "10px 14px", background: T.surfaceAlt, borderBottom: `1px solid ${T.surfaceBorder}` }}>
        <div style={{ minWidth: 0, flex: isMobile ? "1 1 100%" : undefined }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.textMid }}>Division Assignment</span>
          <span style={{ fontSize: 11, color: T.textSoft, marginLeft: isMobile ? 0 : 8, display: isMobile ? "block" : "inline", marginTop: isMobile ? 4 : 0 }}>{summaryText}</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={setUnrestricted} style={{ ...css.btn("ghost", "sm"), fontSize: 11, padding: "4px 10px", color: isUnrestricted ? T.success : T.textSoft, borderColor: isUnrestricted ? T.success + "60" : T.surfaceBorder, background: isUnrestricted ? T.success + "10" : "transparent" }}>
            {isUnrestricted ? <UiIcon name="check" size={11} stroke="currentColor" style={{ marginRight: 2 }} /> : null}All (unrestricted)
          </button>
          {isUnrestricted ? (
            <button onClick={enableRestrictedSelection} style={{ ...css.btn("ghost", "sm"), fontSize: 11, padding: "4px 10px", color: T.brand }}>
              Set selected divisions
            </button>
          ) : (
            <button onClick={clearAll} style={{ ...css.btn("ghost", "sm"), fontSize: 11, padding: "4px 10px", color: T.danger }}>Clear</button>
          )}
        </div>
      </div>

      {!isUnrestricted && (
        <div style={{ padding: "8px 14px", background: T.warning + "0c", borderBottom: `1px solid ${T.warning + "25"}`, fontSize: 11, color: T.warning, display: "flex", alignItems: "center", gap: 6 }}>
          <span>⚠</span> Teacher will only be scheduled in the selected divisions below.
        </div>
      )}

      <div style={{ maxHeight: 280, overflowY: "auto" }}>
        {stdsWithDivs.map(({ std, divs }) => {
          const allSel = divs.every((d) => assignedDivisionIds.includes(d.id));
          const someSel = !allSel && divs.some((d) => assignedDivisionIds.includes(d.id));
          const isExp = expandedStds.has(std.id);
          return (
            <div key={std.id} style={{ borderBottom: `1px solid ${T.surfaceBorder}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: (allSel || someSel) && !isUnrestricted ? T.brand + "06" : T.surface, cursor: "pointer" }} onClick={() => toggleExpand(std.id)}>
                {!isUnrestricted && (
                  <input type="checkbox" checked={allSel} ref={(el) => { if (el) el.indeterminate = someSel; }} onChange={() => toggleStandard(std, divs)} onClick={(e) => e.stopPropagation()} style={{ width: 15, height: 15, cursor: "pointer", accentColor: T.brand }} />
                )}
                <div style={{ width: 28, height: 28, borderRadius: 8, background: (allSel && !isUnrestricted) ? T.brand : T.brand + "18", display: "flex", alignItems: "center", justifyContent: "center", color: (allSel && !isUnrestricted) ? "#fff" : T.brand, fontWeight: 900, fontSize: 11, flexShrink: 0 }}>{std.name}</div>
                <span style={{ fontSize: 13, fontWeight: 600, flex: 1, color: T.text }}>Standard {std.name}</span>
                {!isUnrestricted && someSel && <span style={css.badge(T.warning)}>{divs.filter((d) => assignedDivisionIds.includes(d.id)).length}/{divs.length}</span>}
                {!isUnrestricted && allSel && <span style={css.badge(T.success)}>All</span>}
                <span style={{ fontSize: 11, color: T.textSoft, transform: isExp ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>›</span>
              </div>

              {isExp && (
                <div style={{ padding: isMobile ? "6px 12px 10px 12px" : "6px 14px 10px 52px", background: T.surfaceAlt, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {divs.map((div) => {
                    const checked = isUnrestricted || assignedDivisionIds.includes(div.id);
                    return (
                      <label key={div.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, border: `1.5px solid ${checked && !isUnrestricted ? T.brand : T.surfaceBorder}`, background: checked && !isUnrestricted ? T.brand + "12" : T.surface, cursor: isUnrestricted ? "default" : "pointer", fontSize: 12, fontWeight: 600, color: checked && !isUnrestricted ? T.brand : T.textMid, userSelect: "none" }}>
                        {!isUnrestricted && (
                          <input type="checkbox" checked={assignedDivisionIds.includes(div.id)} onChange={() => toggleDiv(div.id)} style={{ width: 13, height: 13, accentColor: T.brand, cursor: "pointer" }} />
                        )}
                        Div {div.name}
                        {isUnrestricted && <span style={{ fontSize: 9, color: T.textSoft, fontWeight: 400 }}>free</span>}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {stdsWithDivs.length === 0 && <div style={{ padding: "20px", textAlign: "center", color: T.textSoft, fontSize: 13 }}>No standards/divisions configured yet</div>}
      </div>

      {!isUnrestricted && stdsWithDivs.length > 0 && (
        <div style={{ padding: "8px 14px", borderTop: `1px solid ${T.surfaceBorder}`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={selectAll} style={{ ...css.btn("ghost", "sm"), fontSize: 11, padding: "4px 10px" }}>Select all divisions</button>
          <span style={{ fontSize: 11, color: T.textSoft, marginLeft: isMobile ? 0 : "auto" }}>{assignedDivisionIds.length} selected</span>
        </div>
      )}
    </div>
  );
}

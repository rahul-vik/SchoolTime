import { useState } from "react";
import { T, EmptyState, useBreakpoint } from "./uiPrimitives";
import { teacherFullName, isClassTeacherLesson } from "./timetableDisplayHelpers";

export function TimetableGrid({ timetable, divisions, teachers, subjects, periodSlots, workingDays, viewMode, selectedId, onCellClick, isEditable, pendingSwap, standards, mediums = [] }) {
  const bp = useBreakpoint();
  const [activeDay, setActiveDay] = useState(0);

  if (!timetable?.entries) return <EmptyState iconKey="timetable" title="No timetable" desc="Generate a timetable to view it here" />;

  const days = workingDays;
  const slots = periodSlots;
  const cellH = bp.isMobile ? 52 : 62;

  const getEntry = (eId, day, sn) => (
    viewMode === "division"
      ? timetable.entries.find((e) => e.divisionId === eId && e.dayOfWeek === day && e.slotNumber === sn)
      : timetable.entries.find((e) => e.teacherId === eId && e.dayOfWeek === day && e.slotNumber === sn)
  );

  const renderCell = (entry) => {
    if (!entry) return <div style={{ height: cellH, background: T.surfaceBorder + "40", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 9, color: T.textSoft }}>—</span></div>;
    if (entry.slotType === "BREAK" || entry.slotType === "LUNCH") return <div style={{ height: 36, background: T.surfaceBorder, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 11, color: T.textSoft, fontWeight: 700 }}>{entry.label}</span></div>;
    if (entry.isFreePeriod) return <div style={{ height: cellH, background: T.surfaceAlt, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", border: `1px dashed ${T.surfaceBorder}` }}><span style={{ fontSize: 11, color: T.textSoft }}>Free</span></div>;

    const sub = subjects.find((s) => s.id === entry.subjectId);
    const tch = teachers.find((t) => t.id === entry.teacherId);
    const div = divisions.find((d) => d.id === entry.divisionId);
    const color = sub?.colorHex || T.CORE;
    const isPending = pendingSwap && pendingSwap.divisionId === entry.divisionId && pendingSwap.dayOfWeek === entry.dayOfWeek && pendingSwap.slotNumber === entry.slotNumber;
    const showCt = isClassTeacherLesson(entry, teachers);

    return (
      <div
        onClick={() => isEditable && onCellClick && onCellClick(entry)}
        style={{ height: cellH, borderRadius: 6, padding: "6px 7px", cursor: isEditable ? "pointer" : "default", background: color + "18", border: `1px solid ${color}35`, borderLeft: `3px solid ${color}`, boxShadow: isPending ? `0 0 0 2px ${T.gold}` : "none", transition: "all 0.15s", display: "flex", flexDirection: "column", justifyContent: "space-between", overflow: "hidden" }}
      >
        <div style={{ minWidth: 0 }}>
          {showCt ? (
            <div
              title="Class teacher period"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 8,
                fontSize: bp.isMobile ? 10 : 11,
                fontWeight: 800,
                lineHeight: 1.25,
                minWidth: 0,
              }}
            >
              <span style={{ color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                {sub?.code || "?"}
              </span>
              <span style={{ color: "#000000", fontWeight: 800, flexShrink: 0 }}>CT</span>
            </div>
          ) : (
            <span
              style={{ fontSize: bp.isMobile ? 10 : 11, fontWeight: 800, color, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}
            >
              {sub?.code || "?"}
            </span>
          )}
        </div>
        {viewMode === "division" && tch && (
          <span style={{ fontSize: bp.isMobile ? 9 : 10, color: T.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
            {teacherFullName(tch)}
          </span>
        )}
        {viewMode === "teacher" && div && (() => {
          const std = (standards || []).find((s) => s.id === div.standardId);
          const med = (mediums || []).find((m) => m.id === div.mediumId);
          const medCode = String(med?.code || "").trim();
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
              <span style={{ fontSize: bp.isMobile ? 9 : 10, color: T.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Std {std?.name}-{div.name}
              </span>
              {medCode ? (
                <span style={{ fontSize: bp.isMobile ? 8 : 9, color: "#000000", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {medCode}
                </span>
              ) : null}
            </div>
          );
        })()}
      </div>
    );
  };

  if (bp.isMobile) {
    const day = days[activeDay];
    return (
      <div>
        <div style={{ display: "flex", gap: 4, overflowX: "auto", marginBottom: 16, paddingBottom: 4 }}>
          {days.map((d, i) => (
            <button key={d} onClick={() => setActiveDay(i)} style={{ padding: "7px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: activeDay === i ? T.brand : T.surfaceAlt, color: activeDay === i ? "#fff" : T.textMid, flexShrink: 0, transition: "all 0.15s" }}>{d.slice(0, 3)}</button>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {slots.map((slot) => (
            <div key={slot.slotNumber} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ width: 58, flexShrink: 0 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: T.textSoft, textTransform: "uppercase" }}>{slot.label.replace("Period ", "P")}</div>
                <div style={{ fontSize: 9, color: T.textSoft }}>{slot.startTime}</div>
              </div>
              <div style={{ flex: 1 }}>{renderCell(getEntry(selectedId, day, slot.slotNumber))}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 3, minWidth: 680 }}>
        <thead><tr>
          <th style={{ width: 72, padding: "8px 10px", textAlign: "left", fontSize: 11, color: T.textSoft, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Day</th>
          {slots.map((s) => <th key={s.slotNumber} style={{ minWidth: 90, padding: "6px 3px", textAlign: "center", fontSize: 9, color: T.textSoft, fontWeight: 700 }}><div>{s.label.replace("Period ", "P")}</div><div style={{ opacity: 0.65 }}>{s.startTime}</div></th>)}
        </tr></thead>
        <tbody>
          {days.map((day) => (
            <tr key={day}>
              <td style={{ padding: "3px 10px 3px 3px", fontSize: 11, fontWeight: 700, color: T.textMid, whiteSpace: "nowrap" }}>{day.slice(0, 3)}</td>
              {slots.map((s) => <td key={s.slotNumber} style={{ padding: 2, verticalAlign: "top" }}>{renderCell(getEntry(selectedId, day, s.slotNumber))}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

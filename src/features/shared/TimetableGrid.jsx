import { useState, useMemo } from "react";
import { slotActiveOnWeekday } from "../../../shared/periodSlotDays.js";
import { EmptyState, T, useBreakpoint } from "./uiPrimitives";
import { isClassTeacherLesson, teacherFullName } from "./timetableDisplayHelpers.js";

/** Stable column order when period rows are reordered in Setup; scales min widths by column count. */
function useTimetableGridLayout(periodSlots, isMobile, isTablet) {
  return useMemo(() => {
    const raw = Array.isArray(periodSlots) ? periodSlots : [];
    const slots = [...raw].sort((a, b) => Number(a.slotNumber) - Number(b.slotNumber));
    const n = slots.length;
    const dayColPx = isMobile ? 58 : isTablet ? 68 : 72;
    // Fewer columns → room for labels; many columns → tighter floor + horizontal scroll
    const perSlotMin =
      n <= 0
        ? 0
        : n <= 4
          ? 104
          : n <= 6
            ? 94
            : n <= 8
              ? 86
              : n <= 10
                ? 80
                : n <= 12
                  ? 74
                  : n <= 14
                    ? 70
                    : n <= 18
                      ? 64
                      : 58;
    const spacing = 3;
    const tableMinW = n <= 0 ? dayColPx + 120 : dayColPx + n * perSlotMin + (n + 1) * spacing * 2;
    const headerFontPx = n > 16 ? 7.5 : n > 12 ? 8 : n > 8 ? 8.5 : 9;
    const headerPad = n > 14 ? "5px 1px" : n > 10 ? "6px 2px" : "6px 3px";
    const lessonCellPadX = n > 12 ? 5 : n > 8 ? 6 : 7;
    return {
      slots,
      n,
      dayColPx,
      tableMinW,
      headerFontPx,
      headerPad,
      lessonCellPadX,
    };
  }, [periodSlots, isMobile, isTablet]);
}

export function TimetableGrid({ timetable, divisions, teachers, subjects, periodSlots, workingDays, viewMode, selectedId, onCellClick, isEditable, pendingSwap, standards, mediums = [] }) {
  const bp = useBreakpoint();
  const [activeDay, setActiveDay] = useState(0);

  if (!timetable?.entries) return <EmptyState iconKey="timetable" title="No timetable" desc="Generate a timetable to view it here" />;

  const days = workingDays;
  const layout = useTimetableGridLayout(periodSlots, bp.isMobile, bp.isTablet);
  const slots = layout.slots;
  const cellH = bp.isMobile ? 52 : layout.n > 14 ? 56 : 62;

  if (!bp.isMobile && layout.n === 0) {
    return <EmptyState iconKey="period" title="No period slots" desc="Add periods under Periods in the sidebar, then generate again." />;
  }

  const idEq = (a, b) => a != null && b != null && String(a) === String(b);
  const getEntry = (eId, day, sn) => {
    const snN = Number(sn);
    return viewMode === "division"
      ? timetable.entries.find((e) => idEq(e.divisionId, eId) && e.dayOfWeek === day && Number(e.slotNumber) === snN)
      : timetable.entries.find((e) => idEq(e.teacherId, eId) && e.dayOfWeek === day && Number(e.slotNumber) === snN);
  };

  const renderCell = (entry, day, slot) => {
    const inactive = slot && day && !slotActiveOnWeekday(slot, day);
    if (inactive) {
      return (
        <div
          style={{
            height: cellH,
            background: T.surfaceBorder + "55",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `1px dashed ${T.surfaceBorder}`,
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 700, color: T.textSoft }}>Off</span>
        </div>
      );
    }
    if (!entry) return <div style={{ height: cellH, background: T.surfaceBorder + "40", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 9, color: T.textSoft }}>—</span></div>;
    if (entry.slotType === "BREAK" || entry.slotType === "LUNCH") return <div style={{ height: 36, background: T.surfaceBorder, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 11, color: T.textSoft, fontWeight: 700 }}>{entry.label}</span></div>;

    const slotIsBreakOrLunch = slot && (slot.slotType === "BREAK" || slot.slotType === "LUNCH");
    const entryIsLessonLike = Boolean(entry.subjectId && !entry.isFreePeriod && entry.slotType !== "BREAK" && entry.slotType !== "LUNCH");
    if (slotIsBreakOrLunch && entryIsLessonLike) {
      const sub = subjects.find((s) => s.id === entry.subjectId);
      const code = sub?.code || "?";
      return (
        <div
          title="This column is Break or Lunch in the period grid, but the saved timetable still has a lesson on this slot number. Usually the live Periods layout no longer matches the run that was generated: use Create to regenerate, or ensure the app uses the run snapshot for the grid (sourceState.periodSlots)."
          style={{
            minHeight: cellH,
            borderRadius: 6,
            padding: "6px 8px",
            background: `${T.warning}22`,
            border: `1px solid ${T.warning}66`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 4,
            boxSizing: "border-box",
          }}
        >
          <span style={{ fontSize: 11, color: T.textSoft, fontWeight: 700 }}>{slot.label || slot.slotType}</span>
          <span style={{ fontSize: 10, color: T.textMid, lineHeight: 1.35, fontWeight: 600 }}>
            Stored lesson ({code}) — layout mismatch. Regenerate.
          </span>
        </div>
      );
    }

    const isPending =
      pendingSwap &&
      pendingSwap.divisionId === entry.divisionId &&
      pendingSwap.dayOfWeek === entry.dayOfWeek &&
      Number(pendingSwap.slotNumber) === Number(entry.slotNumber);
    if (entry.isFreePeriod) {
      return (
        <div
          onClick={() => isEditable && onCellClick && onCellClick(entry)}
          title={isEditable ? "Tap to swap with another period" : undefined}
          style={{
            height: cellH,
            background: T.surfaceAlt,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `1px dashed ${T.surfaceBorder}`,
            cursor: isEditable ? "pointer" : "default",
            boxShadow: isPending ? `0 0 0 2px ${T.gold}` : "none",
            transition: "all 0.15s",
          }}
        >
          <span style={{ fontSize: 11, color: T.textSoft }}>Free</span>
        </div>
      );
    }

    const sub = subjects.find((s) => s.id === entry.subjectId);
    const tch = teachers.find((t) => t.id === entry.teacherId);
    const div = divisions.find((d) => d.id === entry.divisionId);
    const color = sub?.colorHex || T.CORE;
    const showCt = isClassTeacherLesson(entry, teachers);

    const padX = bp.isMobile ? 7 : layout.lessonCellPadX;
    return (
      <div
        onClick={() => isEditable && onCellClick && onCellClick(entry)}
        style={{ height: cellH, borderRadius: 6, padding: `6px ${padX}px`, cursor: isEditable ? "pointer" : "default", background: color + "18", border: `1px solid ${color}35`, borderLeft: `3px solid ${color}`, boxShadow: isPending ? `0 0 0 2px ${T.gold}` : "none", transition: "all 0.15s", display: "flex", flexDirection: "column", justifyContent: "space-between", overflow: "hidden" }}
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
                fontSize: bp.isMobile ? 10 : layout.n > 12 ? 10 : 11,
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
              style={{ fontSize: bp.isMobile ? 10 : layout.n > 12 ? 10 : 11, fontWeight: 800, color, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}
            >
              {sub?.code || "?"}
            </span>
          )}
        </div>
        {viewMode === "division" && tch && (
          <span style={{ fontSize: bp.isMobile ? 9 : layout.n > 12 ? 9 : 10, color: T.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
            {teacherFullName(tch)}
          </span>
        )}
        {viewMode === "teacher" && div && (() => {
          const std = (standards || []).find((s) => s.id === div.standardId);
          const med = (mediums || []).find((m) => m.id === div.mediumId);
          const medCode = String(med?.code || "").trim();
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
              <span style={{ fontSize: bp.isMobile ? 9 : layout.n > 12 ? 9 : 10, color: T.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
              <div style={{ width: layout.dayColPx, flexShrink: 0 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: T.textSoft, textTransform: "uppercase" }}>{slot.label.replace("Period ", "P")}</div>
                <div style={{ fontSize: 9, color: T.textSoft }}>{slot.startTime}</div>
              </div>
              <div style={{ flex: 1 }}>{renderCell(getEntry(selectedId, day, slot.slotNumber), day, slot)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table
        style={{
          borderCollapse: "separate",
          borderSpacing: 3,
          width: "100%",
          minWidth: layout.tableMinW,
          tableLayout: "fixed",
        }}
      >
        <colgroup>
          <col style={{ width: layout.dayColPx }} />
          {slots.map((s) => (
            <col key={s.slotNumber} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th
              style={{
                width: layout.dayColPx,
                padding: "8px 10px",
                textAlign: "left",
                fontSize: 11,
                color: T.textSoft,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                verticalAlign: "bottom",
              }}
            >
              Day
            </th>
            {slots.map((s) => (
              <th
                key={s.slotNumber}
                style={{
                  padding: layout.headerPad,
                  textAlign: "center",
                  fontSize: layout.headerFontPx,
                  color: T.textSoft,
                  fontWeight: 700,
                  verticalAlign: "bottom",
                  overflow: "hidden",
                  minWidth: 0,
                }}
              >
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(s.label || "").replace("Period ", "P")}</div>
                <div style={{ opacity: 0.65, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.startTime}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day}>
              <td style={{ padding: "3px 10px 3px 3px", fontSize: 11, fontWeight: 700, color: T.textMid, whiteSpace: "nowrap", verticalAlign: "top" }}>{day.slice(0, 3)}</td>
              {slots.map((s) => (
                <td key={s.slotNumber} style={{ padding: 2, verticalAlign: "top", minWidth: 0 }}>
                  {renderCell(getEntry(selectedId, day, s.slotNumber), day, s)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

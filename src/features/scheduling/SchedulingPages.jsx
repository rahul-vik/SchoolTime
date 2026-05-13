import { useMemo, useState } from "react";
import { UiIcon, useBreakpoint } from "../shared/uiPrimitives";
import { defaultWorkingDaysFallback, normalizeActiveWeekdays, slotActiveOnAllWeekdays } from "../../../shared/periodSlotDays.js";

export function PeriodsPage({ periodSlots, setPeriodSlots, workingDays, notify, ui }) {
  const { T, css, Btn, Modal, Input, Select, Field } = ui;
  const { isMobile } = useBreakpoint();
  const [editIdx, setEditIdx] = useState(null);
  const [editSlot, setEditSlot] = useState(null);
  const typeColors = { LESSON: T.brand, BREAK: T.warning, LUNCH: T.success, ASSEMBLY: T.info };
  const typeOptions = [{ value: "LESSON", label: "Lesson" }, { value: "BREAK", label: "Break" }, { value: "LUNCH", label: "Lunch" }, { value: "ASSEMBLY", label: "Assembly" }];
  const lessonCount = periodSlots.filter((s) => s.slotType === "LESSON").length;
  const daysForSchool = useMemo(() => defaultWorkingDaysFallback(workingDays), [workingDays]);

  const toggleSlotWeekday = (slotIndex, day) => {
    setPeriodSlots((p) =>
      p.map((s, i) => {
        if (i !== slotIndex) return s;
        const cur = normalizeActiveWeekdays(s.activeWeekdays, workingDays);
        const on = cur.includes(day);
        if (on && cur.length <= 1) {
          notify("Keep at least one day selected for each period.", "warning");
          return s;
        }
        const next = on ? cur.filter((d) => d !== day) : [...cur, day];
        return { ...s, activeWeekdays: sortWeekdaysInWorkingOrder(next, defaultWorkingDaysFallback(workingDays)) };
      })
    );
  };

  const toggleEditWeekday = (day) => {
    if (!editSlot) return;
    const cur = normalizeActiveWeekdays(editSlot.activeWeekdays, workingDays);
    const on = cur.includes(day);
    if (on && cur.length <= 1) {
      notify("Keep at least one day selected for each period.", "warning");
      return;
    }
    const next = on ? cur.filter((d) => d !== day) : [...cur, day];
    setEditSlot((p) => ({ ...p, activeWeekdays: sortWeekdaysInWorkingOrder(next, defaultWorkingDaysFallback(workingDays)) }));
  };

  const weekdayToggleRow = (activeDays, onToggle, keyPrefix) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 8 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: T.textSoft, textTransform: "uppercase", letterSpacing: "0.04em", width: "100%" }}>Runs on</span>
      {daysForSchool.map((day) => {
        const selected = activeDays.includes(day);
        return (
          <button
            key={`${keyPrefix}-${day}`}
            type="button"
            onClick={() => onToggle(day)}
            style={{
              padding: "4px 9px",
              borderRadius: 8,
              border: `1px solid ${selected ? T.success : T.surfaceBorder}`,
              background: selected ? T.success + "18" : T.surface,
              color: selected ? T.success : T.textMid,
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {day.slice(0, 3)}
          </button>
        );
      })}
    </div>
  );

  const saveSlot = () => {
    if (!editSlot) return;
    const normalized = normalizeActiveWeekdays(editSlot.activeWeekdays, workingDays);
    setPeriodSlots((p) => p.map((s, i) => (i === editIdx ? { ...editSlot, activeWeekdays: normalized } : s)));
    setEditIdx(null);
    setEditSlot(null);
    notify("Period slot updated");
  };

  return (
    <div style={{ width: "100%", maxWidth: 920, minWidth: 0, boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 0, marginBottom: 18 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: isMobile ? 18 : 20, fontWeight: 700 }}>Period Structure</h2>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: T.textSoft }}>
            {lessonCount} lesson periods · {periodSlots.length} total slots · toggle days per slot (default: all school days)
          </p>
        </div>
        <Btn
          onClick={() => {
            const wd = defaultWorkingDaysFallback(workingDays);
            setPeriodSlots((p) => [
              ...p,
              {
                slotNumber: p.length + 1,
                startTime: "16:00",
                endTime: "16:45",
                slotType: "LESSON",
                label: `Period ${p.filter((s) => s.slotType === "LESSON").length + 1}`,
                durationMins: 45,
                activeWeekdays: [...wd],
              },
            ]);
            notify("Slot added");
          }}
          size="sm"
          fullWidth={isMobile}
        >
          + Add Slot
        </Btn>
      </div>
      <div style={{ ...css.card, padding: isMobile ? 16 : 20 }}>
        {periodSlots.map((slot, i) => {
          const activeDays = normalizeActiveWeekdays(slot.activeWeekdays, workingDays);
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "11px 0",
                borderBottom: i < periodSlots.length - 1 ? `1px solid ${T.surfaceBorder}` : "none",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: (typeColors[slot.slotType] || T.brand) + "20",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 900,
                  color: typeColors[slot.slotType] || T.brand,
                  flexShrink: 0,
                }}
              >
                {slot.slotNumber}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{slot.label}</span>
                  <span style={css.badge(typeColors[slot.slotType] || T.brand)}>{slot.slotType}</span>
                </div>
                <span style={{ fontSize: 11, color: T.textSoft }}>
                  {slot.startTime} – {slot.endTime} · {slot.durationMins} min
                </span>
                {weekdayToggleRow(activeDays, (day) => toggleSlotWeekday(i, day), `row-${i}`)}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <Btn
                  onClick={() => {
                    setEditIdx(i);
                    setEditSlot({ ...slot, activeWeekdays: [...activeDays] });
                  }}
                  variant="ghost"
                  size="sm"
                >
                  Edit
                </Btn>
                {lessonCount > 2 && (
                  <Btn
                    onClick={() => {
                      setPeriodSlots((p) => p.filter((_, j) => j !== i).map((s, j) => ({ ...s, slotNumber: j + 1 })));
                      notify("Slot removed");
                    }}
                    variant="ghost"
                    size="sm"
                    style={{ color: T.danger }}
                  >
                    <UiIcon name="close" size={14} stroke="currentColor" />
                  </Btn>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {editIdx !== null && editSlot && (
        <Modal title="Edit Period Slot" onClose={() => { setEditIdx(null); setEditSlot(null); }} width={440}>
          <Input label="Label" value={editSlot.label} onChange={(v) => setEditSlot((p) => ({ ...p, label: v }))} />
          <Select label="Type" value={editSlot.slotType} onChange={(v) => setEditSlot((p) => ({ ...p, slotType: v }))} options={typeOptions} />
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: "0 12px" }}>
            <Input label="Start" type="time" value={editSlot.startTime} onChange={(v) => setEditSlot((p) => ({ ...p, startTime: v }))} />
            <Input label="End" type="time" value={editSlot.endTime} onChange={(v) => setEditSlot((p) => ({ ...p, endTime: v }))} />
            <Field label="Mins">
              <input type="number" value={editSlot.durationMins} onChange={(e) => setEditSlot((p) => ({ ...p, durationMins: +e.target.value }))} style={css.input} />
            </Field>
          </div>
          <Field label="School days this slot runs">
            {weekdayToggleRow(normalizeActiveWeekdays(editSlot.activeWeekdays, workingDays), toggleEditWeekday, "edit")}
          </Field>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn onClick={saveSlot}>Save</Btn>
            <Btn onClick={() => { setEditIdx(null); setEditSlot(null); }} variant="ghost">
              Cancel
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function divisionDisplayName(division, standards) {
  if (!division) return "";
  const std = (standards || []).find((s) => s.id === division.standardId);
  const sn = std?.name ?? division.standardId ?? "?";
  return `Std ${sn} · Div ${division.name || "?"}`;
}

function sortWeekdaysInWorkingOrder(days, workingDays) {
  const rank = (d) => {
    const i = workingDays.indexOf(d);
    return i >= 0 ? i : 999;
  };
  return [...new Set(days)].sort((a, b) => rank(a) - rank(b));
}

/** Slot numbers (grid indices) excluded when EXCLUDE_SLOT uses preset targets. */
function slotNumbersExcludedBySlotTargets(slotTargets, firstMorning, firstAfterLunch, lastLesson) {
  const s = new Set();
  if (!Array.isArray(slotTargets)) return s;
  for (const t of slotTargets) {
    if (t === "FIRST_MORNING" && firstMorning != null) s.add(firstMorning);
    if (t === "FIRST_AFTER_LUNCH" && firstAfterLunch != null) s.add(firstAfterLunch);
    if (t === "LAST_LESSON" && lastLesson != null) s.add(lastLesson);
  }
  return s;
}

function firstLessonSlotNumberNotExcluded(lessonSlots, excludedSlotNumbers) {
  for (const row of lessonSlots || []) {
    if (!excludedSlotNumbers.has(row.slotNumber)) return row.slotNumber;
  }
  return (lessonSlots || [])[0]?.slotNumber ?? "";
}

/** Drop exclude-slot presets that would forbid this specific lesson slot. */
function pruneSlotTargetsForFixedLesson(slotTargets, slotNumber, firstMorning, firstAfterLunch, lastLesson) {
  if (slotNumber === "" || slotNumber == null || Number.isNaN(Number(slotNumber))) return [...(slotTargets || [])];
  if (!Array.isArray(slotTargets)) return [];
  const n = Number(slotNumber);
  return slotTargets.filter((t) => {
    if (t === "FIRST_MORNING" && firstMorning != null && n === Number(firstMorning)) return false;
    if (t === "FIRST_AFTER_LUNCH" && firstAfterLunch != null && n === Number(firstAfterLunch)) return false;
    if (t === "LAST_LESSON" && lastLesson != null && n === Number(lastLesson)) return false;
    return true;
  });
}

/**
 * Returns a user-facing error if fixed placement contradicts exclude-day or exclude-slot for this subject.
 * Contradictions are blocked in the UI and on save (not silently auto-fixed).
 */
function getSubjectPreferenceContradictionMessage(draft, meta) {
  const { firstMorning, firstAfterLunch, lastLesson } = meta;
  if (!draft.enableIncludeOnly) return null;
  const incDays = Array.isArray(draft.includeWeekdays) ? draft.includeWeekdays : [];
  const incSlot = draft.includeSlotNumber;
  if (draft.enableExcludeDay) {
    const exDays = Array.isArray(draft.dayTargets) ? draft.dayTargets : [];
    if (incDays.some((d) => exDays.includes(d))) {
      return "Fixed day & period cannot use a weekday you also marked as excluded. Remove the overlap or turn off one of these options.";
    }
  }
  if (draft.enableExcludeSlot && incSlot !== "" && incSlot != null && !Number.isNaN(Number(incSlot))) {
    const excluded = slotNumbersExcludedBySlotTargets(draft.slotTargets || [], firstMorning, firstAfterLunch, lastLesson);
    if (excluded.has(Number(incSlot))) {
      return "Fixed day & period cannot use a lesson slot you marked as excluded (first morning / first after lunch / last lesson). Change the fixed slot or remove that exclusion.";
    }
  }
  return null;
}

/**
 * Keeps exclude-day / exclude-slot / fixed-day&period consistent when loading or adjusting combined form.
 * Used mainly when opening the editor for legacy data; chip toggles block new contradictions.
 */
function applyRuleContradictionGuards(draft, meta) {
  const { firstMorning, firstAfterLunch, lastLesson, lessonSlots, workingDays } = meta;
  const next = { ...draft };
  next.dayTargets = [...(next.dayTargets || [])];
  next.slotTargets = [...(next.slotTargets || [])];
  next.includeWeekdays = sortWeekdaysInWorkingOrder([...(next.includeWeekdays || [])], workingDays);

  if (!next.enableIncludeOnly) return next;

  const excludedDays = next.enableExcludeDay ? new Set(next.dayTargets) : new Set();
  const excludedSlots = next.enableExcludeSlot
    ? slotNumbersExcludedBySlotTargets(next.slotTargets, firstMorning, firstAfterLunch, lastLesson)
    : new Set();

  const prevIncDays = [...next.includeWeekdays];
  next.includeWeekdays = next.includeWeekdays.filter((d) => !excludedDays.has(d));
  if (next.includeWeekdays.length === 0 && prevIncDays.length > 0) {
    next.dayTargets = next.dayTargets.filter((d) => !prevIncDays.includes(d));
    next.includeWeekdays = sortWeekdaysInWorkingOrder(prevIncDays, workingDays).filter((d) => !next.dayTargets.includes(d));
  }
  if (next.includeWeekdays.length === 0) {
    const fb = workingDays.find((d) => !next.dayTargets.includes(d));
    if (fb) next.includeWeekdays = [fb];
  }

  if (excludedSlots.has(Number(next.includeSlotNumber))) {
    next.includeSlotNumber = firstLessonSlotNumberNotExcluded(lessonSlots, excludedSlots);
  }

  if (next.includeSlotNumber !== "" && next.includeSlotNumber != null && !Number.isNaN(Number(next.includeSlotNumber))) {
    next.slotTargets = pruneSlotTargetsForFixedLesson(
      next.slotTargets,
      next.includeSlotNumber,
      firstMorning,
      firstAfterLunch,
      lastLesson
    );
  }

  return next;
}

export function RulesPage({ schedulingRules, setSchedulingRules, classTeacherPreferences, setClassTeacherPreferences, subjects, divisions, standards, periodSlots, workingDays, notify, helpers, ui }) {
  const { T, css, Btn, EmptyState, Modal, Input, Select, Field } = ui;
  const { getSlotMeta } = helpers;
  const { isMobile } = useBreakpoint();
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({
    subjectId: "",
    enableExcludeSlot: true,
    enableExcludeDay: false,
    enableIncludeOnly: false,
    editingIncludeRuleId: null,
    includeDivisionIds: [],
    includeWeekdays: [],
    includeSlotNumber: "",
    isActive: true,
    note: "",
    slotTargets: [],
    dayTargets: [],
  });
  const { firstMorning, firstAfterLunch, lastLesson, lessonSlots } = useMemo(() => getSlotMeta(periodSlots), [periodSlots, getSlotMeta]);
  const ruleMeta = useMemo(
    () => ({ firstMorning, firstAfterLunch, lastLesson, lessonSlots, workingDays }),
    [firstMorning, firstAfterLunch, lastLesson, lessonSlots, workingDays]
  );
  const preferenceContradiction = useMemo(() => {
    if (!modal) return null;
    return getSubjectPreferenceContradictionMessage(form, ruleMeta);
  }, [modal, form, ruleMeta]);
  const ruleTypeOpts = [
    { value: "EXCLUDE_SLOT", label: "Excluded Slot Set" },
    { value: "EXCLUDE_DAY", label: "Exclude Day" },
    { value: "INCLUDE_ONLY", label: "Fixed day & period (divisions)" },
  ];

  const ruleColors = { NOT_FIRST_MORNING: T.warning, NOT_FIRST_AFTER_LUNCH: T.info, BOTH_BOUNDARY: T.gold, EXCLUDE_SLOT: T.danger, EXCLUDE_DAY: "#8b5cf6", INCLUDE_ONLY: "#0d9488" };

  const ruleDesc = (rule) => {
    const slotPresetLabel = {
      FIRST_MORNING: `Slot ${firstMorning} (first morning)`,
      FIRST_AFTER_LUNCH: firstAfterLunch ? `Slot ${firstAfterLunch} (first after lunch)` : "First after lunch (not available)",
      LAST_LESSON: `Slot ${lastLesson} (last lesson)`,
      FIRST_MORNING_AND_FIRST_AFTER_LUNCH: firstAfterLunch ? `Slot ${firstMorning} + Slot ${firstAfterLunch}` : `Slot ${firstMorning}`,
      FIRST_MORNING_AND_LAST_LESSON: `Slot ${firstMorning} + Slot ${lastLesson}`,
      FIRST_AFTER_LUNCH_AND_LAST_LESSON: firstAfterLunch ? `Slot ${firstAfterLunch} + Slot ${lastLesson}` : `Slot ${lastLesson}`,
      FIRST_MORNING_AND_FIRST_AFTER_LUNCH_AND_LAST_LESSON: firstAfterLunch ? `Slot ${firstMorning} + Slot ${firstAfterLunch} + Slot ${lastLesson}` : `Slot ${firstMorning} + Slot ${lastLesson}`,
    };
    const slotTargetLabel = {
      FIRST_MORNING: "First morning",
      FIRST_AFTER_LUNCH: "First after lunch",
      LAST_LESSON: "Last lesson",
    };
    switch (rule.ruleType) {
      case "NOT_FIRST_MORNING": return `Cannot be placed in slot ${firstMorning} (first morning)`;
      case "NOT_FIRST_AFTER_LUNCH": return firstAfterLunch ? `Cannot be placed in slot ${firstAfterLunch} (first after lunch)` : "No lunch break found";
      case "BOTH_BOUNDARY": {
        const p = [`Slot ${firstMorning} (first morning)`];
        if (firstAfterLunch) p.push(`Slot ${firstAfterLunch} (first after lunch)`);
        p.push(`Slot ${lastLesson} (last lesson)`);
        return `Excluded from: ${p.join(", ")}`;
      }
      case "EXCLUDE_SLOT":
        if (Array.isArray(rule.slotTargets) && rule.slotTargets.length > 0) {
          return `Excluded from: ${rule.slotTargets.map((s) => slotTargetLabel[s] || s).join(", ")}`;
        }
        if (rule.slotPreset) return `Excluded from: ${slotPresetLabel[rule.slotPreset] || rule.slotPreset}`;
        return rule.slotNumber ? `Excluded from slot number ${rule.slotNumber}` : "No slot specified";
      case "EXCLUDE_DAY":
        if (Array.isArray(rule.dayOfWeekList) && rule.dayOfWeekList.length > 0) return `Not scheduled on: ${rule.dayOfWeekList.join(", ")}`;
        return rule.dayOfWeek ? `Not scheduled on ${rule.dayOfWeek}` : "No day specified";
      case "INCLUDE_ONLY": {
        const divIds = Array.isArray(rule.divisionIds) && rule.divisionIds.length > 0
          ? rule.divisionIds
          : rule.divisionId
            ? [rule.divisionId]
            : [];
        const divLabels = divIds.map((id) => {
          const d = (divisions || []).find((x) => x.id === id);
          return d ? divisionDisplayName(d, standards) : id;
        });
        const dn = divLabels.length ? divLabels.join(", ") : "No divisions";
        const mode = rule.includeMode || "PRESET_LAST_LESSON";
        if (mode === "CUSTOM" && Array.isArray(rule.allowedCells) && rule.allowedCells.length > 0) {
          const bits = rule.allowedCells.map((c) => `${c.dayOfWeek} slot ${c.slotNumber}`).join(", ");
          return `Only in: ${bits} — ${dn}`;
        }
        const wd = rule.includeWeekday || "FRIDAY";
        return lastLesson ? `Only last lesson (slot ${lastLesson}) on ${wd} — ${dn}` : `Only on ${wd} last lesson — ${dn}`;
      }
      default: return "";
    }
  };

  const openCombinedPreferenceModal = (subjectId, focusRule) => {
    const existingSlot = schedulingRules.find((r) => r.subjectId === subjectId && r.ruleType === "EXCLUDE_SLOT");
    const existingDay = schedulingRules.find((r) => r.subjectId === subjectId && r.ruleType === "EXCLUDE_DAY");
    const includeFromFocus = focusRule?.ruleType === "INCLUDE_ONLY" ? focusRule : null;
    let includeDivisionIdsOpen = divisions?.[0]?.id ? [divisions[0].id] : [];
    let includeWeekdaysOpen = workingDays[0] ? [workingDays[0]] : ["MONDAY"];
    let includeSlotOpen = lastLesson || lessonSlots[0]?.slotNumber || "";
    if (includeFromFocus) {
      const divIds = Array.isArray(includeFromFocus.divisionIds) && includeFromFocus.divisionIds.length > 0
        ? [...includeFromFocus.divisionIds]
        : includeFromFocus.divisionId
          ? [includeFromFocus.divisionId]
          : [];
      if (divIds.length) includeDivisionIdsOpen = divIds;

      const incMode = includeFromFocus.includeMode || "PRESET_LAST_LESSON";
      const incCells = Array.isArray(includeFromFocus.allowedCells) ? includeFromFocus.allowedCells : [];
      if (incMode === "CUSTOM" && incCells.length > 0) {
        const slotNums = [...new Set(incCells.map((c) => Number(c?.slotNumber)).filter((n) => !Number.isNaN(n)))];
        includeSlotOpen = slotNums.length >= 1 ? slotNums[0] : includeSlotOpen;
        const dayList = incCells.map((c) => c?.dayOfWeek).filter(Boolean);
        includeWeekdaysOpen = sortWeekdaysInWorkingOrder(dayList, workingDays);
        if (includeWeekdaysOpen.length === 0) {
          includeWeekdaysOpen = includeFromFocus.includeWeekday ? [includeFromFocus.includeWeekday] : [workingDays[0] || "MONDAY"];
        }
      } else {
        includeWeekdaysOpen = includeFromFocus.includeWeekday ? [includeFromFocus.includeWeekday] : includeWeekdaysOpen;
        includeSlotOpen = lastLesson || includeSlotOpen;
      }
    }
    setForm(
      applyRuleContradictionGuards(
        {
          subjectId: subjectId || subjects[0]?.id || "",
          enableExcludeSlot: Boolean(existingSlot),
          enableExcludeDay: Boolean(existingDay),
          enableIncludeOnly: Boolean(includeFromFocus),
          editingIncludeRuleId: includeFromFocus?.id || null,
          includeDivisionIds: includeDivisionIdsOpen,
          includeWeekdays: includeWeekdaysOpen,
          includeSlotNumber: includeSlotOpen,
          isActive: (existingSlot?.isActive ?? existingDay?.isActive ?? includeFromFocus?.isActive) !== false,
          note: existingSlot?.note || existingDay?.note || includeFromFocus?.note || "",
          slotTargets: Array.isArray(existingSlot?.slotTargets)
            ? existingSlot.slotTargets
            : existingSlot?.slotPreset
              ? existingSlot.slotPreset.split("_AND_")
              : [],
          dayTargets: Array.isArray(existingDay?.dayOfWeekList)
            ? existingDay.dayOfWeekList
            : existingDay?.dayOfWeek
              ? [existingDay.dayOfWeek]
              : [],
        },
        ruleMeta
      )
    );
    setModal(existingSlot || existingDay || includeFromFocus ? "edit" : "add");
  };
  const addRule = () => {
    if (!form.subjectId) return;
    const contradiction = getSubjectPreferenceContradictionMessage(form, ruleMeta);
    if (contradiction) {
      notify(contradiction, "danger");
      return;
    }
    const f = applyRuleContradictionGuards({ ...form }, ruleMeta);
    const aligned =
      JSON.stringify([form.dayTargets, form.slotTargets, form.includeWeekdays, form.includeSlotNumber]) !==
      JSON.stringify([f.dayTargets, f.slotTargets, f.includeWeekdays, f.includeSlotNumber]);
    const hasSlotEx = f.enableExcludeSlot && Array.isArray(f.slotTargets) && f.slotTargets.length > 0;
    const hasDayEx = f.enableExcludeDay && Array.isArray(f.dayTargets) && f.dayTargets.length > 0;
    const lessonSlotNums = new Set((lessonSlots || []).map((s) => s.slotNumber));
    const incSlotOk =
      f.includeSlotNumber !== "" &&
      f.includeSlotNumber !== null &&
      f.includeSlotNumber !== undefined &&
      lessonSlotNums.has(Number(f.includeSlotNumber));
    const daysOk =
      Array.isArray(f.includeWeekdays) &&
      f.includeWeekdays.length > 0 &&
      f.includeWeekdays.every((d) => workingDays.includes(d));
    const hasInc =
      f.enableIncludeOnly &&
      Array.isArray(f.includeDivisionIds) &&
      f.includeDivisionIds.length > 0 &&
      daysOk &&
      incSlotOk;
    if (!hasSlotEx && !hasDayEx && !hasInc) {
      notify("Turn on at least one preference and fill required fields (slots, days, or division include)", "warning");
      return;
    }
    if (f.enableExcludeSlot && !hasSlotEx) { notify("Select at least one excluded slot", "warning"); return; }
    if (f.enableExcludeDay && !hasDayEx) { notify("Select at least one excluded day", "warning"); return; }
    if (f.enableIncludeOnly) {
      if (!Array.isArray(f.includeDivisionIds) || f.includeDivisionIds.length === 0) {
        notify("Select at least one division (class)", "warning");
        return;
      }
      if (!daysOk) {
        notify("Select at least one working day for fixed placement", "warning");
        return;
      }
      if (!incSlotOk) {
        notify("Choose a lesson period from your period grid", "warning");
        return;
      }
      const slotRowForInc = periodSlots.find((ps) => ps.slotNumber === Number(f.includeSlotNumber));
      if (
        f.includeWeekdays?.length > 0 &&
        (!slotRowForInc || !slotActiveOnAllWeekdays(slotRowForInc, f.includeWeekdays, workingDays))
      ) {
        notify(
          "That lesson period is not scheduled on all of the days you selected. Change the days, pick another slot, or enable those days for that period under Periods.",
          "warning"
        );
        return;
      }
    }
    setSchedulingRules((prev) => {
      let next = [...prev];
      const upsert = (ruleType, payload) => {
        const idx = next.findIndex((r) => r.subjectId === f.subjectId && r.ruleType === ruleType);
        if (idx >= 0) next[idx] = { ...next[idx], ...payload, ruleType, subjectId: f.subjectId };
        else next.push({ id: `r${Date.now()}-${ruleType}`, subjectId: f.subjectId, ruleType, ...payload });
      };
      const remove = (ruleType) => {
        next = next.filter((r) => !(r.subjectId === f.subjectId && r.ruleType === ruleType));
      };
      if (f.enableExcludeSlot) upsert("EXCLUDE_SLOT", { isActive: f.isActive, note: f.note, slotTargets: f.slotTargets, slotPreset: undefined, dayOfWeek: undefined });
      else remove("EXCLUDE_SLOT");
      if (f.enableExcludeDay) upsert("EXCLUDE_DAY", { isActive: f.isActive, note: f.note, dayOfWeekList: f.dayTargets, dayOfWeek: undefined, slotPreset: undefined });
      else remove("EXCLUDE_DAY");

      if (!f.enableIncludeOnly) {
        if (f.editingIncludeRuleId) {
          next = next.filter((r) => r.id !== f.editingIncludeRuleId);
        }
      } else if (f.includeDivisionIds?.length > 0) {
        const slotNum = Number(f.includeSlotNumber);
        const daysSorted = sortWeekdaysInWorkingOrder(
          f.includeWeekdays.filter((d) => workingDays.includes(d)),
          workingDays
        );
        const allowedCells = daysSorted.map((day) => ({ dayOfWeek: day, slotNumber: slotNum }));
        const incPayload = {
          isActive: f.isActive,
          note: f.note,
          divisionIds: [...f.includeDivisionIds],
          divisionId: f.includeDivisionIds[0] || null,
          includeMode: "CUSTOM",
          includeWeekday: daysSorted[0] || "MONDAY",
          allowedCells,
        };
        next = next.filter((r) => !(r.subjectId === f.subjectId && r.ruleType === "INCLUDE_ONLY"));
        const id = f.editingIncludeRuleId || `r${Date.now()}-INC`;
        next.push({ id, subjectId: f.subjectId, ruleType: "INCLUDE_ONLY", ...incPayload });
      }

      return next;
    });
    notify(aligned ? "Preference updated. Excluded days/slots and fixed placement were aligned where they conflicted." : "Preference updated");
    setModal(null);
  };
  const quickAdd = () => {};
  const toggleRule = (id) => setSchedulingRules((p) => p.map((r) => r.id === id ? { ...r, isActive: !r.isActive } : r));
  const deleteRule = (id) => { setSchedulingRules((p) => p.filter((r) => r.id !== id)); notify("Rule removed"); };
  const activeCount = schedulingRules.filter((r) => r.isActive).length;
  const classTeacherPrefs = classTeacherPreferences || { enabled: false, ctFirstPeriodDays: [], dailyPrimaryMinPeriods: 0, schedulingMode: "STRICT" };
  const classTeacherRulesEnabled = classTeacherPrefs.enabled !== false;
  const selectedCtDays = Array.isArray(classTeacherPrefs.ctFirstPeriodDays) ? classTeacherPrefs.ctFirstPeriodDays : [];
  const grouped = useMemo(() => { const m = new Map(); schedulingRules.forEach((r) => { if (!m.has(r.subjectId)) m.set(r.subjectId, []); m.get(r.subjectId).push(r); }); return m; }, [schedulingRules]);

  const excludedSlotNumsForFixedPicker = slotNumbersExcludedBySlotTargets(
    form.enableExcludeSlot ? (form.slotTargets || []) : [],
    firstMorning,
    firstAfterLunch,
    lastLesson
  );
  const lessonSlotsBase =
    form.enableIncludeOnly && form.enableExcludeSlot && (lessonSlots || []).some((s) => !excludedSlotNumsForFixedPicker.has(s.slotNumber))
      ? (lessonSlots || []).filter((s) => !excludedSlotNumsForFixedPicker.has(s.slotNumber))
      : lessonSlots || [];
  const incDaysPick = form.includeWeekdays || [];
  const lessonSlotsForFixedSelect =
    form.enableIncludeOnly && incDaysPick.length > 0
      ? (lessonSlotsBase || []).filter((s) => {
          const row = periodSlots.find((ps) => ps.slotNumber === s.slotNumber);
          return slotActiveOnAllWeekdays(row, incDaysPick, workingDays);
        })
      : lessonSlotsBase || [];

  return (
    <div style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 0, marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}><h2 style={{ margin: 0, fontSize: isMobile ? 17 : 20, fontWeight: 700, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}><UiIcon name="preferences" size={18} stroke={T.text} />Placement Preferences<span style={{ ...css.badge(T.gold), fontSize: 12 }}>{activeCount} active</span></h2><p style={{ margin: "4px 0 0", fontSize: 12, color: T.textSoft }}>These are applied automatically when creating timetables</p></div>
        <Btn onClick={() => openCombinedPreferenceModal(subjects[0]?.id || "", null)} size="sm" fullWidth={isMobile}>+ Add Preference</Btn>
      </div>

      <div style={{ ...css.card, marginBottom: 18, background: T.brand + "08", border: `1px solid ${T.brand + "25"}` }}>
        <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: T.brand }}>Based on your period timings</h4>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[{ label: "First morning slot", value: firstMorning ? `Slot ${firstMorning} (${periodSlots.find((s) => s.slotNumber === firstMorning)?.startTime})` : "—", color: T.warning }, { label: "First after lunch", value: firstAfterLunch ? `Slot ${firstAfterLunch} (${periodSlots.find((s) => s.slotNumber === firstAfterLunch)?.startTime})` : "No lunch break", color: T.info }, { label: "Last lesson slot", value: lastLesson ? `Slot ${lastLesson} (${periodSlots.find((s) => s.slotNumber === lastLesson)?.endTime})` : "—", color: T.success }].map((item) => (
            <div key={item.label} style={{ flex: "1 1 160px", padding: "10px 14px", background: item.color + "12", borderRadius: 8, border: `1px solid ${item.color + "30"}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: item.color, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{item.value}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: T.textSoft, margin: "10px 0 0" }}>If you change your period structure or lunch time, these values update automatically.</p>
      </div>

      <div style={{ ...css.card, marginBottom: 18, border: `1px solid ${T.info + "30"}`, background: T.info + "08" }}>
        <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: T.info }}>Class Teacher Rules</h4>
        <p style={{ fontSize: 12, color: T.textMid, margin: "0 0 12px" }}>Apply homeroom-based placement for class teachers.</p>
        <Field label="">
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={classTeacherPrefs.enabled !== false}
              onChange={(e) => setClassTeacherPreferences((p) => ({ ...(p || {}), enabled: e.target.checked }))}
              style={{ width: 18, height: 18, cursor: "pointer" }}
            />
            <span style={{ fontSize: 14, color: T.textMid, fontWeight: 600 }}>Enable class teacher placement rules</span>
          </label>
        </Field>
        <Field label="First Period Priority Days">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {workingDays.map((day) => {
              const checked = selectedCtDays.includes(day);
              return (
                <button
                  key={day}
                  onClick={() => {
                    if (!classTeacherRulesEnabled) return;
                    setClassTeacherPreferences((p) => {
                      const current = Array.isArray(p?.ctFirstPeriodDays) ? p.ctFirstPeriodDays : [];
                      const next = checked ? current.filter((d) => d !== day) : [...current, day];
                      return { ...(p || {}), ctFirstPeriodDays: next };
                    });
                  }}
                  disabled={!classTeacherRulesEnabled}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: `1px solid ${checked ? T.info : T.surfaceBorder}`,
                    background: checked ? T.info + "12" : T.surface,
                    color: checked ? T.info : T.textMid,
                    opacity: classTeacherRulesEnabled ? 1 : 0.6,
                    cursor: classTeacherRulesEnabled ? "pointer" : "not-allowed",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </Field>
        <p style={{ fontSize: 11, color: T.textSoft, margin: "8px 0 0" }}>
          Selected days apply first-period class teacher priority for the assigned class teacher class.
        </p>
      </div>


      {schedulingRules.length === 0
        ? <EmptyState iconKey="preferences" title="No preferences added" desc="Add preferences to control when subjects are placed." action={<Btn onClick={() => openCombinedPreferenceModal(subjects[0]?.id || "", null)}>Add First Preference</Btn>} />
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[...grouped.entries()].map(([subjectId, rules]) => {
              const sub = subjects.find((s) => s.id === subjectId);
              if (!sub) return null;
              return (
                <div key={subjectId} style={css.card}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}><div style={{ width: 9, height: 9, borderRadius: "50%", background: sub.colorHex || T.CORE }} /><span style={{ fontWeight: 700, fontSize: 14 }}>{sub.name}</span><span style={css.badge(T[sub.category] || T.CORE)}>{sub.category.replace(/_/g, " ")}</span></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {rules.map((rule) => (
                      <div key={rule.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 14px", background: rule.isActive ? (ruleColors[rule.ruleType] + "0d") : T.surfaceBorder + "40", borderRadius: 8, border: `1px solid ${rule.isActive ? ruleColors[rule.ruleType] + "35" : T.surfaceBorder}`, opacity: rule.isActive ? 1 : 0.6, flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}><span style={css.badge(ruleColors[rule.ruleType] || T.brand)}>{ruleTypeOpts.find((o) => o.value === rule.ruleType)?.label || rule.ruleType}</span>{!rule.isActive && <span style={css.badge(T.textSoft)}>Inactive</span>}</div>
                          <div style={{ fontSize: 12, color: T.textMid }}>{ruleDesc(rule)}</div>
                          {rule.note && <div style={{ fontSize: 11, color: T.textSoft, marginTop: 3, fontStyle: "italic" }}>{rule.note}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", width: isMobile ? "100%" : undefined, justifyContent: isMobile ? "flex-end" : undefined }}>
                          <button onClick={() => toggleRule(rule.id)} style={{ background: rule.isActive ? T.success + "18" : T.surfaceAlt, border: `1px solid ${rule.isActive ? T.success + "40" : T.surfaceBorder}`, borderRadius: 6, cursor: "pointer", padding: "4px 10px", fontSize: 11, fontWeight: 700, color: rule.isActive ? T.success : T.textSoft }}>{rule.isActive ? "ON" : "OFF"}</button>
                          <Btn onClick={() => openCombinedPreferenceModal(rule.subjectId, rule)} variant="ghost" size="sm">Edit</Btn>
                          <Btn onClick={() => deleteRule(rule.id)} variant="ghost" size="sm" style={{ color: T.danger }}><UiIcon name="close" size={14} stroke="currentColor" /></Btn>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {modal && (
        <Modal title={modal === "add" ? "Add Placement Preference" : "Edit Placement Preference"} onClose={() => setModal(null)} width={520}>
          <Select label="Subject" value={form.subjectId} onChange={(v) => setForm((p) => ({ ...p, subjectId: v }))} options={subjects.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))} placeholder="Select subject" />
          <Field label="">
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.enableExcludeSlot !== false}
                onChange={(e) => setForm((p) => applyRuleContradictionGuards({ ...p, enableExcludeSlot: e.target.checked }, ruleMeta))}
                style={{ width: 18, height: 18, cursor: "pointer" }}
              />
              <span style={{ fontSize: 14, color: T.textMid, fontWeight: 600 }}>Exclude Slot Set</span>
            </label>
          </Field>
          {form.enableExcludeSlot && (
            <Field label="Excluded Slots">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[{ id: "FIRST_MORNING", label: "First morning" }, { id: "FIRST_AFTER_LUNCH", label: "First after lunch" }, { id: "LAST_LESSON", label: "Last lesson" }]
                  .filter((s) => firstAfterLunch || s.id !== "FIRST_AFTER_LUNCH")
                  .map((slot) => {
                    const selected = (form.slotTargets || []).includes(slot.id);
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() =>
                          setForm((p) => {
                            const slotTargets = selected ? (p.slotTargets || []).filter((x) => x !== slot.id) : [...(p.slotTargets || []), slot.id];
                            if (!selected && p.enableIncludeOnly) {
                              const ex = slotNumbersExcludedBySlotTargets(slotTargets, firstMorning, firstAfterLunch, lastLesson);
                              if (ex.has(Number(p.includeSlotNumber))) {
                                notify(
                                  "Cannot exclude this slot: fixed placement uses it. Change the fixed lesson slot first or turn off fixed placement.",
                                  "warning",
                                );
                                return p;
                              }
                            }
                            return applyRuleContradictionGuards({ ...p, slotTargets }, ruleMeta);
                          })
                        }
                        style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${selected ? T.info : T.surfaceBorder}`, background: selected ? T.info + "12" : T.surface, color: selected ? T.info : T.textMid, cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                      >
                        {slot.label}
                      </button>
                    );
                  })}
              </div>
              <p style={{ fontSize: 11, color: T.textSoft, margin: "8px 0 0" }}>
                You cannot exclude a boundary slot that fixed placement already uses—change the fixed lesson slot or turn off fixed placement first.
              </p>
            </Field>
          )}
          <Field label="">
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.enableExcludeDay === true}
                onChange={(e) => setForm((p) => applyRuleContradictionGuards({ ...p, enableExcludeDay: e.target.checked }, ruleMeta))}
                style={{ width: 18, height: 18, cursor: "pointer" }}
              />
              <span style={{ fontSize: 14, color: T.textMid, fontWeight: 600 }}>Exclude Day</span>
            </label>
          </Field>
          {form.enableExcludeDay && (
            <Field label="Excluded Days">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {workingDays.map((day) => {
                  const selected = (form.dayTargets || []).includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() =>
                        setForm((p) => {
                          let dayTargets = [...(p.dayTargets || [])];
                          let includeWeekdays = [...(p.includeWeekdays || [])];
                          if (selected) dayTargets = dayTargets.filter((x) => x !== day);
                          else {
                            if (p.enableIncludeOnly && includeWeekdays.includes(day)) {
                              notify(
                                "Cannot exclude this day: fixed placement uses it. Remove it from fixed days first or turn off fixed placement.",
                                "warning",
                              );
                              return p;
                            }
                            dayTargets = [...dayTargets, day];
                          }
                          return applyRuleContradictionGuards(
                            {
                              ...p,
                              dayTargets,
                              includeWeekdays: sortWeekdaysInWorkingOrder(includeWeekdays, workingDays),
                            },
                            ruleMeta
                          );
                        })
                      }
                      style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${selected ? T.warning : T.surfaceBorder}`, background: selected ? T.warning + "12" : T.surface, color: selected ? T.warning : T.textMid, cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: 11, color: T.textSoft, margin: "8px 0 0" }}>
                You cannot exclude a day that fixed placement uses—remove that day from fixed placement first, or turn off fixed placement.
              </p>
            </Field>
          )}
          <Field label="">
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.enableIncludeOnly === true}
                onChange={(e) =>
                  setForm((p) =>
                    applyRuleContradictionGuards(
                      {
                        ...p,
                        enableIncludeOnly: e.target.checked,
                        includeSlotNumber:
                          p.includeSlotNumber !== "" && p.includeSlotNumber != null
                            ? p.includeSlotNumber
                            : lessonSlots[0]?.slotNumber ?? "",
                        includeWeekdays:
                          Array.isArray(p.includeWeekdays) && p.includeWeekdays.length > 0
                            ? p.includeWeekdays
                            : workingDays[0]
                              ? [workingDays[0]]
                              : ["MONDAY"],
                        includeDivisionIds:
                          Array.isArray(p.includeDivisionIds) && p.includeDivisionIds.length > 0
                            ? p.includeDivisionIds
                            : divisions?.[0]?.id
                              ? [divisions[0].id]
                              : [],
                      },
                      ruleMeta
                    )
                  )
                }
                style={{ width: 18, height: 18, cursor: "pointer" }}
              />
              <span style={{ fontSize: 14, color: T.textMid, fontWeight: 600 }}>Fixed day and period (divisions)</span>
            </label>
          </Field>
          {form.enableIncludeOnly && (
            <>
              <Field label="Divisions (classes)">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(divisions || []).map((d) => {
                    const selected = (form.includeDivisionIds || []).includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() =>
                          setForm((p) => {
                            const cur = p.includeDivisionIds || [];
                            const nextIds = selected ? cur.filter((x) => x !== d.id) : [...cur, d.id];
                            return { ...p, includeDivisionIds: nextIds };
                          })
                        }
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: `1px solid ${selected ? T.brand : T.surfaceBorder}`,
                          background: selected ? T.brand + "12" : T.surface,
                          color: selected ? T.brand : T.textMid,
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {divisionDisplayName(d, standards)}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label="Days (same lesson period on each)">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {workingDays.map((day) => {
                    const selected = (form.includeWeekdays || []).includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() =>
                          setForm((p) => {
                            const cur = p.includeWeekdays || [];
                            let dayTargets = [...(p.dayTargets || [])];
                            let nextDays;
                            if (selected) nextDays = cur.filter((x) => x !== day);
                            else {
                              if (p.enableExcludeDay && dayTargets.includes(day)) {
                                notify(
                                  "Cannot add this day to fixed placement: it is marked as excluded. Remove it from excluded days first or turn off exclude day.",
                                  "warning",
                                );
                                return p;
                              }
                              nextDays = [...cur, day];
                            }
                            return applyRuleContradictionGuards(
                              {
                                ...p,
                                dayTargets,
                                includeWeekdays: sortWeekdaysInWorkingOrder(nextDays, workingDays),
                              },
                              ruleMeta
                            );
                          })
                        }
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: `1px solid ${selected ? T.success : T.surfaceBorder}`,
                          background: selected ? T.success + "12" : T.surface,
                          color: selected ? T.success : T.textMid,
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label="Lesson period (same slot number on each fixed day)">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(lessonSlotsForFixedSelect || []).map((s) => {
                    const row = periodSlots.find((ps) => ps.slotNumber === s.slotNumber);
                    const tail = row?.label ? ` · ${row.label}` : "";
                    const selected = Number(form.includeSlotNumber) === Number(s.slotNumber);
                    return (
                      <button
                        key={s.slotNumber}
                        type="button"
                        onClick={() =>
                          setForm((p) =>
                            applyRuleContradictionGuards({ ...p, includeSlotNumber: s.slotNumber }, ruleMeta)
                          )
                        }
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: `1px solid ${selected ? T.success : T.surfaceBorder}`,
                          background: selected ? T.success + "12" : T.surface,
                          color: selected ? T.success : T.textMid,
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        Slot {s.slotNumber}
                        {tail}
                      </button>
                    );
                  })}
                </div>
              </Field>
              {form.enableIncludeOnly && incDaysPick.length > 0 && (lessonSlotsForFixedSelect || []).length === 0 ? (
                <p style={{ fontSize: 11, color: T.warning, margin: "0 0 4px" }}>
                  No lesson period runs on every selected day. Under Periods, turn on more days for a lesson slot, or change the days above.
                </p>
              ) : null}
              <p style={{ fontSize: 11, color: T.textSoft, margin: 0 }}>
                Each selected class gets this subject only in the chosen lesson slot on the days you tick (not elsewhere in that class timetable). One shared period number for all selected days and divisions. Fixed placement cannot contradict excluded days or excluded boundary slots for the same subject—resolve overlaps in this form before saving. Set weekly periods to at least the number of days selected, per class, or generation may not fill all slots.
              </p>
            </>
          )}
          <Input label="Note (optional)" value={form.note || ""} onChange={(v) => setForm((p) => ({ ...p, note: v }))} placeholder="e.g. PE should not be right after assembly" />
          <Field label=""><label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}><input type="checkbox" checked={form.isActive !== false} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} style={{ width: 18, height: 18, cursor: "pointer" }} /><span style={{ fontSize: 14, color: T.textMid, fontWeight: 500 }}>Preference is active</span></label></Field>
          {preferenceContradiction ? (
            <p style={{ fontSize: 12, color: T.danger, margin: "0 0 10px", fontWeight: 600 }}>{preferenceContradiction}</p>
          ) : null}
          <div style={{ display: "flex", gap: 10 }}>
            <Btn onClick={addRule} disabled={Boolean(preferenceContradiction)}>
              Save Preference
            </Btn>
            <Btn onClick={() => setModal(null)} variant="ghost">
              Cancel
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

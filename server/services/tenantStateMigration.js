import { ensurePeriodSlotsActiveWeekdays, slotActiveOnWeekday } from "../../shared/periodSlotDays.js";
import { normalizeTenantSchoolOrdering } from "../../shared/schoolDisplayOrder.js";
import { resolveClassTeacherEnabled } from "../../shared/classTeacherPreferences.js";

function normalizeSubject(subject) {
  let changed = false;
  const next = { ...subject };
  if (!next.divisionScopeMode) {
    next.divisionScopeMode = "ALL_IN_SELECTED_CLASSES";
    changed = true;
  }
  if (!Array.isArray(next.divisionIncludeIds)) {
    next.divisionIncludeIds = [];
    changed = true;
  }
  if (!Array.isArray(next.divisionExcludeIds)) {
    next.divisionExcludeIds = [];
    changed = true;
  }
  if (!Array.isArray(next.divisionLimits)) {
    next.divisionLimits = [];
    changed = true;
  }
  return { value: next, changed };
}

function normalizeTeacher(teacher) {
  let changed = false;
  const next = { ...teacher };
  const classTeacherDivisionIds = Array.isArray(next.classTeacherDivisionIds) ? next.classTeacherDivisionIds : [];
  if (!Array.isArray(next.classTeacherDivisionIds)) changed = true;
  const singleClassTeacherDivisionId = classTeacherDivisionIds[0] || null;
  if (classTeacherDivisionIds.length > 1 || next.primaryClassTeacherDivisionId !== singleClassTeacherDivisionId) {
    next.classTeacherDivisionIds = singleClassTeacherDivisionId ? [singleClassTeacherDivisionId] : [];
    next.primaryClassTeacherDivisionId = singleClassTeacherDivisionId;
    changed = true;
  }
  if (!Array.isArray(next.divisionSubjectExclusions)) {
    next.divisionSubjectExclusions = [];
    changed = true;
  }
  return { value: next, changed };
}

function normalizeSchedulingRule(rule) {
  const next = { ...rule };
  let changed = false;
  if (next.ruleType === "BOTH_BOUNDARY") {
    next.ruleType = "EXCLUDE_SLOT";
    next.slotTargets = ["FIRST_MORNING", "FIRST_AFTER_LUNCH", "LAST_LESSON"];
    changed = true;
  } else if (next.ruleType === "NOT_FIRST_MORNING") {
    next.ruleType = "EXCLUDE_SLOT";
    next.slotTargets = ["FIRST_MORNING"];
    changed = true;
  } else if (next.ruleType === "NOT_FIRST_AFTER_LUNCH") {
    next.ruleType = "EXCLUDE_SLOT";
    next.slotTargets = ["FIRST_AFTER_LUNCH"];
    changed = true;
  }
  if (next.ruleType === "EXCLUDE_SLOT" && !Array.isArray(next.slotTargets)) {
    if (typeof next.slotPreset === "string" && next.slotPreset.trim()) {
      next.slotTargets = next.slotPreset.split("_AND_");
    } else {
      next.slotTargets = [];
    }
    changed = true;
  }
  if (next.ruleType === "EXCLUDE_DAY" && !Array.isArray(next.dayOfWeekList)) {
    next.dayOfWeekList = next.dayOfWeek ? [next.dayOfWeek] : [];
    changed = true;
  }
  if (next.ruleType === "INCLUDE_ONLY") {
    if (!next.includeMode) {
      next.includeMode = "PRESET_LAST_LESSON";
      changed = true;
    }
    if (next.includeWeekday == null || String(next.includeWeekday).trim() === "") {
      next.includeWeekday = "FRIDAY";
      changed = true;
    }
    if (next.divisionId === undefined || next.divisionId === "") {
      next.divisionId = null;
      changed = true;
    }
    if (!Array.isArray(next.divisionIds) || next.divisionIds.length === 0) {
      if (next.divisionId) {
        next.divisionIds = [next.divisionId];
      } else {
        next.divisionIds = [];
      }
      changed = true;
    } else if (!next.divisionId || !next.divisionIds.includes(next.divisionId)) {
      next.divisionId = next.divisionIds[0] || null;
      changed = true;
    }
    if (!Array.isArray(next.allowedCells)) {
      next.allowedCells = [];
      changed = true;
    }
  }
  return { value: next, changed };
}

/** Drop INCLUDE_ONLY CUSTOM cells that contradict period active weekdays (slot off that day). */
function pruneIncludeOnlyAllowedCells(rule, periodSlots) {
  if (rule.ruleType !== "INCLUDE_ONLY" || rule.includeMode !== "CUSTOM") return { value: rule, changed: false };
  if (!Array.isArray(rule.allowedCells) || rule.allowedCells.length === 0) return { value: rule, changed: false };
  if (!Array.isArray(periodSlots) || periodSlots.length === 0) return { value: rule, changed: false };
  const prevLen = rule.allowedCells.length;
  const nextCells = rule.allowedCells.filter((c) => {
    if (!c || c.dayOfWeek == null) return false;
    const row = periodSlots.find((s) => Number(s.slotNumber) === Number(c.slotNumber));
    return row && slotActiveOnWeekday(row, c.dayOfWeek);
  });
  if (nextCells.length === prevLen) return { value: rule, changed: false };
  if (nextCells.length === 0) {
    return { value: { ...rule, allowedCells: [], isActive: false }, changed: true };
  }
  return { value: { ...rule, allowedCells: nextCells }, changed: true };
}

function lastLessonSlotNumber(periodSlots) {
  const ls = (periodSlots || []).filter((s) => s.slotType === "LESSON").sort((a, b) => a.slotNumber - b.slotNumber);
  if (!ls.length) return null;
  return ls[ls.length - 1].slotNumber;
}

/** If PRESET_LAST_LESSON points at a last-lesson slot that is off on the chosen weekday, disable the rule (avoids impossible engine constraints). */
function sanitizeIncludeOnlyPresetRule(rule, periodSlots, workingDays) {
  if (rule.ruleType !== "INCLUDE_ONLY" || rule.includeMode !== "PRESET_LAST_LESSON") return { value: rule, changed: false };
  const weekday = rule.includeWeekday || "FRIDAY";
  if (!Array.isArray(workingDays) || workingDays.length === 0) return { value: rule, changed: false };
  if (!workingDays.includes(weekday)) {
    if (rule.isActive === false) return { value: rule, changed: false };
    return { value: { ...rule, isActive: false }, changed: true };
  }
  const lastN = lastLessonSlotNumber(periodSlots);
  if (lastN == null) return { value: rule, changed: false };
  const slotRow = (periodSlots || []).find((s) => Number(s.slotNumber) === Number(lastN));
  if (!slotRow || slotActiveOnWeekday(slotRow, weekday)) return { value: rule, changed: false };
  if (rule.isActive === false) return { value: rule, changed: false };
  return { value: { ...rule, isActive: false }, changed: true };
}

export function migrateTenantState(inputState) {
  const state = inputState && typeof inputState === "object" ? { ...inputState } : {};
  let changed = false;

  if (Array.isArray(state.subjects)) {
    const migratedSubjects = state.subjects.map((s) => normalizeSubject(s));
    if (migratedSubjects.some((m) => m.changed)) changed = true;
    state.subjects = migratedSubjects.map((m) => m.value);
  }

  if (Array.isArray(state.teachers)) {
    const migratedTeachers = state.teachers.map((t) => normalizeTeacher(t));
    if (migratedTeachers.some((m) => m.changed)) changed = true;
    state.teachers = migratedTeachers.map((m) => m.value);
  }

  const wdRaw =
    Array.isArray(state.workingDays) && state.workingDays.length > 0
      ? state.workingDays
      : ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  const orderedSchool = normalizeTenantSchoolOrdering({
    standards: state.standards || [],
    divisions: state.divisions || [],
    workingDays: wdRaw,
  });
  const packSchool = JSON.stringify({
    w: orderedSchool.workingDays,
    s: orderedSchool.standards,
    d: orderedSchool.divisions,
  });
  const prevSchool = JSON.stringify({
    w: state.workingDays || [],
    s: state.standards || [],
    d: state.divisions || [],
  });
  if (packSchool !== prevSchool) {
    state.workingDays = orderedSchool.workingDays;
    state.standards = orderedSchool.standards;
    state.divisions = orderedSchool.divisions;
    changed = true;
  }
  const wd =
    Array.isArray(state.workingDays) && state.workingDays.length > 0
      ? state.workingDays
      : ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  if (Array.isArray(state.periodSlots)) {
    const nextSlots = ensurePeriodSlotsActiveWeekdays(state.periodSlots, wd);
    const before = JSON.stringify(state.periodSlots);
    const after = JSON.stringify(nextSlots);
    if (before !== after) {
      state.periodSlots = nextSlots;
      changed = true;
    }
  }

  if (Array.isArray(state.schedulingRules)) {
    const slots = state.periodSlots || [];
    const migratedRules = state.schedulingRules.map((r) => {
      const n1 = normalizeSchedulingRule(r);
      const n2 = pruneIncludeOnlyAllowedCells(n1.value, slots);
      const n3 = sanitizeIncludeOnlyPresetRule(n2.value, slots, wd);
      return { value: n3.value, changed: n1.changed || n2.changed || n3.changed };
    });
    if (migratedRules.some((m) => m.changed)) changed = true;
    state.schedulingRules = migratedRules.map((m) => m.value);
  }

  if (state.classTeacherPreferences != null && typeof state.classTeacherPreferences === "object") {
    const raw = state.classTeacherPreferences;
    const legacyImplicitEnabled =
      raw.enabled === undefined &&
      ((Array.isArray(raw.ctFirstPeriodDays) && raw.ctFirstPeriodDays.length > 0) ||
        Number(raw.dailyPrimaryMinPeriods) > 0 ||
        (Array.isArray(state.teachers) &&
          state.teachers.some((t) => (t.classTeacherDivisionIds || []).length > 0)));
    const nextEnabled =
      raw.enabled === undefined
        ? legacyImplicitEnabled
        : resolveClassTeacherEnabled(raw, {});
    if (raw.enabled !== nextEnabled) {
      state.classTeacherPreferences = { ...raw, enabled: nextEnabled };
      changed = true;
    }
  }

  return { state, changed };
}


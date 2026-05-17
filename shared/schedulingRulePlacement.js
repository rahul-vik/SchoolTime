/**
 * Shared placement-rule checks (INCLUDE_ONLY, exclude day/slot) for feasibility and validation.
 * Mirrors legacy engine constraints without teacher/division occupancy.
 */

import { slotActiveOnWeekday, defaultWorkingDaysFallback } from "./periodSlotDays.js";

export function getPeriodSlotMeta(periodSlots) {
  const slots = periodSlots || [];
  const ls = slots.filter((s) => s.slotType === "LESSON").sort((a, b) => a.slotNumber - b.slotNumber);
  if (!ls.length) {
    return { firstMorning: null, firstAfterLunch: null, lastLesson: null, lessonSlots: ls };
  }
  const firstMorning = ls[0].slotNumber;
  const lastLesson = ls[ls.length - 1].slotNumber;
  const lunchNums = slots.filter((s) => s.slotType === "LUNCH").map((s) => s.slotNumber);
  let firstAfterLunch = null;
  if (lunchNums.length > 0) {
    const maxL = Math.max(...lunchNums);
    const after = ls.filter((s) => s.slotNumber > maxL);
    if (after.length) firstAfterLunch = after[0].slotNumber;
  }
  return { firstMorning, firstAfterLunch, lastLesson, lessonSlots: ls };
}

function includeRuleDivisionIds(rule) {
  if (Array.isArray(rule?.divisionIds) && rule.divisionIds.length > 0) return rule.divisionIds;
  if (rule?.divisionId) return [rule.divisionId];
  return [];
}

function slotNumbersExcludedBySlotTargets(slotTargets, meta) {
  const s = new Set();
  if (!Array.isArray(slotTargets)) return s;
  for (const t of slotTargets) {
    if (t === "FIRST_MORNING" && meta.firstMorning != null) s.add(meta.firstMorning);
    if (t === "FIRST_AFTER_LUNCH" && meta.firstAfterLunch != null) s.add(meta.firstAfterLunch);
    if (t === "LAST_LESSON" && meta.lastLesson != null) s.add(meta.lastLesson);
  }
  return s;
}

function blockedByPreset(preset, slotNumber, meta) {
  switch (preset) {
    case "FIRST_MORNING":
      return slotNumber === meta.firstMorning;
    case "FIRST_AFTER_LUNCH":
      return meta.firstAfterLunch !== null && slotNumber === meta.firstAfterLunch;
    case "LAST_LESSON":
      return slotNumber === meta.lastLesson;
    case "FIRST_MORNING_AND_FIRST_AFTER_LUNCH":
      return slotNumber === meta.firstMorning || (meta.firstAfterLunch !== null && slotNumber === meta.firstAfterLunch);
    case "FIRST_MORNING_AND_LAST_LESSON":
      return slotNumber === meta.firstMorning || slotNumber === meta.lastLesson;
    case "FIRST_AFTER_LUNCH_AND_LAST_LESSON":
      return (meta.firstAfterLunch !== null && slotNumber === meta.firstAfterLunch) || slotNumber === meta.lastLesson;
    case "FIRST_MORNING_AND_FIRST_AFTER_LUNCH_AND_LAST_LESSON":
      return (
        slotNumber === meta.firstMorning ||
        (meta.firstAfterLunch !== null && slotNumber === meta.firstAfterLunch) ||
        slotNumber === meta.lastLesson
      );
    default:
      return false;
  }
}

export function isDayBlockedByRule(subjectId, day, rules) {
  return (rules || []).some(
    (r) =>
      r.subjectId === subjectId &&
      r.isActive !== false &&
      r.ruleType === "EXCLUDE_DAY" &&
      ((Array.isArray(r.dayOfWeekList) && r.dayOfWeekList.includes(day)) || r.dayOfWeek === day),
  );
}

export function isSlotBlockedByRule(subjectId, slotNumber, periodSlots, rules) {
  const meta = getPeriodSlotMeta(periodSlots);
  const blockedByTargets = (targets) => {
    if (!Array.isArray(targets) || targets.length === 0) return false;
    return targets.some(
      (t) =>
        (t === "FIRST_MORNING" && slotNumber === meta.firstMorning) ||
        (t === "FIRST_AFTER_LUNCH" && meta.firstAfterLunch !== null && slotNumber === meta.firstAfterLunch) ||
        (t === "LAST_LESSON" && slotNumber === meta.lastLesson),
    );
  };
  for (const rule of (rules || []).filter((r) => r.subjectId === subjectId && r.isActive !== false)) {
    switch (rule.ruleType) {
      case "NOT_FIRST_MORNING":
        if (slotNumber === meta.firstMorning) return true;
        break;
      case "NOT_FIRST_AFTER_LUNCH":
        if (meta.firstAfterLunch !== null && slotNumber === meta.firstAfterLunch) return true;
        break;
      case "BOTH_BOUNDARY":
        if (slotNumber === meta.firstMorning || slotNumber === meta.lastLesson) return true;
        if (meta.firstAfterLunch !== null && slotNumber === meta.firstAfterLunch) return true;
        break;
      case "EXCLUDE_SLOT":
        if (blockedByTargets(rule.slotTargets)) return true;
        if (rule.slotPreset && blockedByPreset(rule.slotPreset, slotNumber, meta)) return true;
        if (rule.slotNumber !== undefined && slotNumber === rule.slotNumber) return true;
        break;
      default:
        break;
    }
  }
  return false;
}

export function includeOnlyRulesFor(subjectId, divisionId, rules) {
  return (rules || []).filter(
    (r) =>
      r &&
      r.ruleType === "INCLUDE_ONLY" &&
      r.isActive !== false &&
      r.subjectId === subjectId &&
      includeRuleDivisionIds(r).includes(divisionId),
  );
}

export function cellMatchesIncludeOnlyRule(rule, day, slotNumber, periodSlots, workingDays) {
  const mode = rule.includeMode || "PRESET_LAST_LESSON";
  if (mode === "CUSTOM") {
    if (!Array.isArray(rule.allowedCells) || rule.allowedCells.length === 0) return false;
    return rule.allowedCells.some((c) => {
      if (!c || c.dayOfWeek !== day || Number(c.slotNumber) !== Number(slotNumber)) return false;
      const slotRow = (periodSlots || []).find((s) => Number(s.slotNumber) === Number(c.slotNumber));
      if (!slotRow) return false;
      return slotActiveOnWeekday(slotRow, day);
    });
  }
  if (mode === "PRESET_LAST_LESSON") {
    const weekday = rule.includeWeekday || "FRIDAY";
    const wd = defaultWorkingDaysFallback(workingDays);
    if (!wd.includes(weekday)) return false;
    const { lastLesson } = getPeriodSlotMeta(periodSlots);
    if (lastLesson == null) return false;
    if (day !== weekday || Number(slotNumber) !== Number(lastLesson)) return false;
    const slotRow = (periodSlots || []).find((s) => Number(s.slotNumber) === Number(lastLesson));
    if (slotRow && !slotActiveOnWeekday(slotRow, day)) return false;
    return true;
  }
  return false;
}

/** If any INCLUDE_ONLY applies to this division+subject, (day, slot) must satisfy every such rule. */
export function isPlacementAllowedByIncludeOnly(subjectId, divisionId, day, slotNumber, periodSlots, workingDays, rules) {
  const rel = includeOnlyRulesFor(subjectId, divisionId, rules);
  if (rel.length === 0) return true;
  return rel.every((r) => cellMatchesIncludeOnlyRule(r, day, slotNumber, periodSlots, workingDays, rules));
}

/**
 * Count lesson cells where a subject could legally be placed for a division (rules + inactive slots).
 */
export function countLegallyPlaceableCells({ periodSlots, workingDays, rules, subjectId, divisionId }) {
  const wd = defaultWorkingDaysFallback(workingDays);
  const lessonSlots = (periodSlots || []).filter((s) => s.slotType === "LESSON");
  let n = 0;
  for (const day of wd) {
    if (isDayBlockedByRule(subjectId, day, rules)) continue;
    for (const slot of lessonSlots) {
      const sn = Number(slot.slotNumber);
      if (!slotActiveOnWeekday(slot, day)) continue;
      if (isSlotBlockedByRule(subjectId, sn, periodSlots, rules)) continue;
      if (!isPlacementAllowedByIncludeOnly(subjectId, divisionId, day, sn, periodSlots, workingDays, rules)) continue;
      n += 1;
    }
  }
  return n;
}

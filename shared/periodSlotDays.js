/**
 * Which weekdays a period slot runs (subset of tenant working days).
 * Missing or empty array = all working days (backward compatible).
 */

/** Monday → Sunday calendar order for school working-day lists. */
export const WEEKDAY_CANONICAL_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

/** Dedupe and sort selected working days in Mon→Sun order (unknown tokens last, then A–Z). */
export function sortWorkingDaysCanonical(workingDays) {
  if (!Array.isArray(workingDays) || workingDays.length === 0) return [];
  const uniq = [...new Set(workingDays.map((d) => String(d)))];
  return uniq.sort((a, b) => {
    const ia = WEEKDAY_CANONICAL_ORDER.indexOf(a);
    const ib = WEEKDAY_CANONICAL_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export function defaultWorkingDaysFallback(workingDays) {
  const sorted = sortWorkingDaysCanonical(workingDays || []);
  if (sorted.length > 0) return sorted;
  return ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
}

/** Normalize stored activeWeekdays to a non-empty subset of workingDays. */
export function normalizeActiveWeekdays(activeWeekdays, workingDays) {
  const wd = defaultWorkingDaysFallback(workingDays);
  if (!Array.isArray(activeWeekdays) || activeWeekdays.length === 0) return [...wd];
  const filtered = [...new Set(activeWeekdays.filter((d) => wd.includes(d)))];
  const sorted = sortWorkingDaysCanonical(filtered);
  return sorted.length > 0 ? sorted : [...wd];
}

export function ensurePeriodSlotsActiveWeekdays(periodSlots, workingDays) {
  const wd = defaultWorkingDaysFallback(workingDays);
  return (periodSlots || []).map((s) => ({
    ...s,
    activeWeekdays: normalizeActiveWeekdays(s.activeWeekdays, wd),
  }));
}

/** True if this slot occurs on the given weekday (for timetable / engine). */
export function slotActiveOnWeekday(slot, day) {
  if (!slot || !day) return true;
  const aw = slot.activeWeekdays;
  if (!Array.isArray(aw) || aw.length === 0) return true;
  return aw.includes(day);
}

/** Lesson slot is used in rules UI for at least one of the given days (e.g. fixed placement). */
export function slotTouchesAnyWeekday(slot, weekdays, allWorkingDays) {
  const aw = normalizeActiveWeekdays(slot.activeWeekdays, allWorkingDays);
  const days = Array.isArray(weekdays) ? weekdays : [];
  return days.some((d) => aw.includes(d));
}

/** True if the slot runs on every listed weekday (e.g. fixed placement on Mon+Tue requires both). */
export function slotActiveOnAllWeekdays(slot, weekdays, allWorkingDays) {
  const aw = normalizeActiveWeekdays(slot.activeWeekdays, allWorkingDays);
  const days = Array.isArray(weekdays) ? weekdays : [];
  if (days.length === 0) return true;
  return days.every((d) => aw.includes(d));
}

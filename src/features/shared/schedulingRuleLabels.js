import { findEntityById } from "./idLookups.js";

const WEEKDAY_LABELS = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

/** e.g. "Thursday" from "THURSDAY" */
export function formatWeekdayLabel(dayCode) {
  const key = String(dayCode || "").trim().toUpperCase();
  return WEEKDAY_LABELS[key] || key.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

/** e.g. "period 6" from slot number */
export function formatPeriodLabel(slotNumber) {
  const n = Number(slotNumber);
  if (Number.isNaN(n)) return "a period";
  return `period ${n}`;
}

/** Std 6 · Div A */
export function formatClassLabel(division, standards) {
  if (!division) return null;
  const std = findEntityById(standards, division.standardId);
  const sn = std?.name ?? "?";
  const dn = division.name || "?";
  return `Std ${sn} · Div ${dn}`;
}

/**
 * Comma-separated class names; unknown ids become a count, never raw ids.
 */
export function formatClassList(divisionIds, divisions, standards, maxNames = 5) {
  const ids = [...new Set((divisionIds || []).filter(Boolean))];
  if (ids.length === 0) return "no classes selected";

  const named = [];
  let unknown = 0;
  for (const id of ids) {
    const div = findEntityById(divisions, id);
    const label = formatClassLabel(div, standards);
    if (label) named.push(label);
    else unknown += 1;
  }

  const parts = named.slice(0, maxNames);
  const restNamed = Math.max(0, named.length - maxNames);
  const rest = restNamed + unknown;
  let text = parts.join(", ");
  if (rest === 1) text += text ? ", and 1 other class" : "1 other class";
  else if (rest > 1) text += text ? `, and ${rest} other classes` : `${rest} other classes`;
  if (unknown > 0 && named.length === 0) {
    return `${unknown} class${unknown === 1 ? "" : "es"} (re-select classes — list may have changed)`;
  }
  return text || "selected classes";
}

function formatAllowedTimeSlots(allowedCells) {
  const cells = (allowedCells || []).filter((c) => c?.dayOfWeek && c?.slotNumber != null);
  if (cells.length === 0) return null;

  const unique = new Map();
  for (const c of cells) {
    const key = `${c.dayOfWeek}|${c.slotNumber}`;
    unique.set(key, { day: c.dayOfWeek, slot: Number(c.slotNumber) });
  }
  const list = [...unique.values()];

  if (list.length === 1) {
    const { day, slot } = list[0];
    return `${formatWeekdayLabel(day)}, ${formatPeriodLabel(slot)}`;
  }

  const shown = list.slice(0, 3).map(({ day, slot }) => `${formatWeekdayLabel(day)} ${formatPeriodLabel(slot)}`);
  const extra = list.length - shown.length;
  let text = shown.join("; ");
  if (extra > 0) text += `; +${extra} more time${extra === 1 ? "" : "s"}`;
  return text;
}

/**
 * Plain-language summary for INCLUDE_ONLY placement preferences.
 */
export function formatIncludeOnlyRuleLabel(rule, { divisions, standards, lastLessonSlot } = {}) {
  const divIds = Array.isArray(rule.divisionIds) && rule.divisionIds.length > 0
    ? rule.divisionIds
    : rule.divisionId
      ? [rule.divisionId]
      : [];
  const classes = formatClassList(divIds, divisions, standards);

  const mode = rule.includeMode || "PRESET_LAST_LESSON";
  if (mode === "CUSTOM" && Array.isArray(rule.allowedCells) && rule.allowedCells.length > 0) {
    const when = formatAllowedTimeSlots(rule.allowedCells);
    if (when) {
      return `This subject can only be taught on ${when} · Classes: ${classes}`;
    }
  }

  const wd = formatWeekdayLabel(rule.includeWeekday || "FRIDAY");
  const slot = lastLessonSlot ?? rule.includeSlotNumber ?? rule.slotNumber;
  const period =
    slot != null ? `the last lesson (${formatPeriodLabel(slot)})` : "the last lesson";
  if (mode === "PRESET_LAST_LESSON" || !mode) {
    return `This subject can only use ${period} on ${wd} · Classes: ${classes}`;
  }
  return `Fixed day and period for this subject · Classes: ${classes}`;
}

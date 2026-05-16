import { resolveClassTeacherEnabled } from "../../shared/classTeacherPreferences.js";

/**
 * Legacy production rows often omit `enabled` while still using class-teacher days or assignments.
 * @param {object|undefined|null} raw
 * @param {Array|undefined|null} teachers
 */
export function legacyClassTeacherImplicitEnabled(raw, teachers) {
  if (!raw || typeof raw !== "object") return false;
  if (raw.enabled === true || raw.enabled === false) return false;
  return (
    (Array.isArray(raw.ctFirstPeriodDays) && raw.ctFirstPeriodDays.length > 0) ||
    Number(raw.dailyPrimaryMinPeriods) > 0 ||
    (Array.isArray(teachers) && teachers.some((t) => (t?.classTeacherDivisionIds || []).length > 0))
  );
}

/**
 * Canonical class-teacher preferences for engine + persisted tenant state.
 * @param {object|undefined|null} raw
 * @param {Array|undefined|null} teachers
 */
export function normalizeClassTeacherPreferences(raw, teachers = []) {
  const base = {
    enabled: false,
    ctFirstPeriodDays: [],
    dailyPrimaryMinPeriods: 0,
    schedulingMode: "STRICT",
  };
  if (!raw || typeof raw !== "object") {
    return { ...base };
  }
  const schedulingMode =
    raw.schedulingMode === "OPTIMAL" ? "OPTIMAL" : raw.schedulingMode === "BEST_FIT" ? "BEST_FIT" : "STRICT";
  const enabled =
    raw.enabled === undefined
      ? legacyClassTeacherImplicitEnabled(raw, teachers)
      : resolveClassTeacherEnabled(raw, {});
  return {
    ...base,
    ...raw,
    schedulingMode,
    enabled,
    ctFirstPeriodDays: Array.isArray(raw.ctFirstPeriodDays) ? raw.ctFirstPeriodDays : [],
    dailyPrimaryMinPeriods: Number(raw.dailyPrimaryMinPeriods) || 0,
  };
}

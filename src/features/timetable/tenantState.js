import { ensurePeriodSlotsActiveWeekdays, sortWorkingDaysCanonical } from "../../../shared/periodSlotDays.js";
import { normalizeTenantSchoolOrdering, orderSubjectStandardIds } from "../../../shared/schoolDisplayOrder.js";
import { resolveClassTeacherEnabled } from "../../../shared/classTeacherPreferences.js";
import { normalizeSubjectSchedulingFields, normalizeTeacherSchedulingFields } from "../../../shared/divisionScheduling.js";

function normalizeClassTeacherPreferences(rawPrefs, seedPrefs, workingDays) {
  const seed = seedPrefs || {};
  const next = rawPrefs || {};
  const allowedDays = new Set((workingDays || []).map((d) => String(d)));
  const fallbackDays = sortWorkingDaysCanonical((seed.ctFirstPeriodDays || workingDays || []).filter((d) => allowedDays.has(d)));
  const normalizedDays = Array.isArray(next.ctFirstPeriodDays)
    ? sortWorkingDaysCanonical([...new Set(next.ctFirstPeriodDays.map((d) => String(d)).filter((d) => allowedDays.has(d)))])
    : [];
  return {
    enabled: resolveClassTeacherEnabled(next, seed),
    dailyPrimaryMinPeriods: Math.max(0, Math.min(2, Number(next.dailyPrimaryMinPeriods || 0))),
    schedulingMode: next.schedulingMode === "OPTIMAL" ? "OPTIMAL" : next.schedulingMode === "BEST_FIT" ? "BEST_FIT" : "STRICT",
    ctFirstPeriodDays: normalizedDays.length > 0 ? normalizedDays : fallbackDays,
  };
}

function normalizeSubjects(subjects, standards, divisions) {
  const standardIds = orderSubjectStandardIds((standards || []).map((s) => s.id), standards);
  const allowedDivisionIds = new Set((divisions || []).map((d) => d.id));
  return (subjects || []).map((sub) => {
    const nextStandardIdsRaw = Array.isArray(sub.standardIds) && sub.standardIds.length > 0 ? sub.standardIds : standardIds;
    const nextStandardIds = orderSubjectStandardIds(nextStandardIdsRaw, standards);
    const scopeMode = sub.divisionScopeMode === "CUSTOM_DIVISION_OVERRIDES" ? "CUSTOM_DIVISION_OVERRIDES" : "ALL_IN_SELECTED_CLASSES";
    const divisionIncludeIds = Array.isArray(sub.divisionIncludeIds) ? [...new Set(sub.divisionIncludeIds.filter((id) => allowedDivisionIds.has(id)))] : [];
    const divisionExcludeIds = Array.isArray(sub.divisionExcludeIds) ? [...new Set(sub.divisionExcludeIds.filter((id) => allowedDivisionIds.has(id)))] : [];
    const divisionLimits = Array.isArray(sub.divisionLimits)
      ? sub.divisionLimits
          .filter((dl) => allowedDivisionIds.has(dl.divisionId))
          .map((dl) => ({
            divisionId: dl.divisionId,
            ...(dl.weeklyPeriods !== undefined ? { weeklyPeriods: Math.max(1, Number(dl.weeklyPeriods) || 1) } : {}),
            ...(dl.maxPerDay !== undefined ? { maxPerDay: Math.max(1, Number(dl.maxPerDay) || 1) } : {}),
          }))
          .filter((dl) => dl.weeklyPeriods !== undefined || dl.maxPerDay !== undefined)
      : [];
    return {
      ...sub,
      standardIds: nextStandardIds,
      divisionScopeMode: scopeMode,
      divisionIncludeIds,
      divisionExcludeIds: divisionExcludeIds.filter((id) => !divisionIncludeIds.includes(id)),
      divisionLimits,
    };
  });
}

export function applyTenantStateWithFallback(state, seed, setters) {
  if (!state) return;
  setters.setSchool(state.school || seed.school);
  setters.setMediums(state.mediums || seed.mediums);
  const wdSource =
    Array.isArray(state.workingDays) && state.workingDays.length > 0
      ? state.workingDays
      : Array.isArray(seed.workingDays) && seed.workingDays.length > 0
        ? seed.workingDays
        : ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  const nextSchool = normalizeTenantSchoolOrdering({
    standards: state.standards || seed.standards,
    divisions: state.divisions || seed.divisions,
    workingDays: wdSource,
  });
  const nextStandards = nextSchool.standards;
  const nextDivisions = nextSchool.divisions;
  const wd = nextSchool.workingDays.length > 0 ? nextSchool.workingDays : ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  setters.setStandards(nextStandards);
  setters.setDivisions(nextDivisions);
  setters.setSubjects(normalizeSubjects(state.subjects || seed.subjects, nextStandards, nextDivisions));
  setters.setTeachers((state.teachers || seed.teachers || []).map((t) => normalizeTeacherSchedulingFields(t)));
  const rawPeriodSlots = state.periodSlots || seed.periodSlots;
  setters.setPeriodSlots(ensurePeriodSlotsActiveWeekdays(rawPeriodSlots, wd));
  setters.setWorkingDays(wd);
  setters.setSchedulingRules(state.schedulingRules || seed.schedulingRules);
  setters.setClassTeacherPreferences(normalizeClassTeacherPreferences(state.classTeacherPreferences, seed.classTeacherPreferences, wd));
  if (setters.setExportJobs) setters.setExportJobs(state.exportJobs || []);
  if (setters.setTimetable) {
    const restored = state.lastGeneratedTimetable || null;
    setters.setTimetable(restored);
    if (setters.setTimetableStatus) setters.setTimetableStatus(restored ? "GENERATED" : "DRAFT");
  }
}

export function buildTenantState(state) {
  const next = normalizeTenantSchoolOrdering({
    standards: state.standards,
    divisions: state.divisions,
    workingDays: state.workingDays,
  });
  const workingDays =
    next.workingDays.length > 0 ? next.workingDays : ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  return {
    school: state.school,
    mediums: state.mediums,
    standards: next.standards,
    divisions: next.divisions,
    subjects: state.subjects,
    teachers: state.teachers,
    periodSlots: state.periodSlots,
    workingDays,
    schedulingRules: state.schedulingRules,
    classTeacherPreferences: state.classTeacherPreferences,
    exportJobs: state.exportJobs,
    lastGeneratedTimetable: state.lastGeneratedTimetable,
    teacherSubjects: state.teacherSubjects,
    ...(Array.isArray(state.divisionSubjectTeacherLocks)
      ? { divisionSubjectTeacherLocks: state.divisionSubjectTeacherLocks }
      : {}),
    freePeriodRules: state.freePeriodRules,
    subjectAllocations: state.subjectAllocations,
  };
}

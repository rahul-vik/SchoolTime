import { ensurePeriodSlotsActiveWeekdays } from "../../../shared/periodSlotDays.js";

function normalizeClassTeacherPreferences(rawPrefs, seedPrefs, workingDays) {
  const seed = seedPrefs || {};
  const next = rawPrefs || {};
  const allowedDays = new Set((workingDays || []).map((d) => String(d)));
  const fallbackDays = (seed.ctFirstPeriodDays || workingDays || []).filter((d) => allowedDays.has(d));
  const normalizedDays = Array.isArray(next.ctFirstPeriodDays)
    ? [...new Set(next.ctFirstPeriodDays.map((d) => String(d)).filter((d) => allowedDays.has(d)))]
    : [];
  return {
    enabled: next.enabled !== false,
    dailyPrimaryMinPeriods: Math.max(0, Math.min(2, Number(next.dailyPrimaryMinPeriods || 0))),
    schedulingMode: next.schedulingMode === "OPTIMAL" ? "OPTIMAL" : next.schedulingMode === "BEST_FIT" ? "BEST_FIT" : "STRICT",
    ctFirstPeriodDays: normalizedDays.length > 0 ? normalizedDays : fallbackDays,
  };
}

function normalizeSubjects(subjects, standards, divisions) {
  const standardIds = (standards || []).map((s) => s.id);
  const allowedDivisionIds = new Set((divisions || []).map((d) => d.id));
  return (subjects || []).map((sub) => {
    const nextStandardIds = Array.isArray(sub.standardIds) && sub.standardIds.length > 0 ? sub.standardIds : standardIds;
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
  setters.setStandards(state.standards || seed.standards);
  const nextDivisions = state.divisions || seed.divisions;
  const nextStandards = state.standards || seed.standards;
  setters.setDivisions(nextDivisions);
  setters.setSubjects(normalizeSubjects(state.subjects || seed.subjects, nextStandards, nextDivisions));
  setters.setTeachers(state.teachers || seed.teachers);
  const nextWorkingDays = state.workingDays || seed.workingDays;
  const rawPeriodSlots = state.periodSlots || seed.periodSlots;
  setters.setPeriodSlots(ensurePeriodSlotsActiveWeekdays(rawPeriodSlots, nextWorkingDays));
  setters.setWorkingDays(nextWorkingDays);
  setters.setSchedulingRules(state.schedulingRules || seed.schedulingRules);
  setters.setClassTeacherPreferences(normalizeClassTeacherPreferences(state.classTeacherPreferences, seed.classTeacherPreferences, nextWorkingDays));
  if (setters.setExportJobs) setters.setExportJobs(state.exportJobs || []);
  if (setters.setTimetable) {
    const restored = state.lastGeneratedTimetable || null;
    setters.setTimetable(restored);
    if (setters.setTimetableStatus) setters.setTimetableStatus(restored ? "GENERATED" : "DRAFT");
  }
}

export function buildTenantState(state) {
  return {
    school: state.school,
    mediums: state.mediums,
    standards: state.standards,
    divisions: state.divisions,
    subjects: state.subjects,
    teachers: state.teachers,
    periodSlots: state.periodSlots,
    workingDays: state.workingDays,
    schedulingRules: state.schedulingRules,
    classTeacherPreferences: state.classTeacherPreferences,
    exportJobs: state.exportJobs,
    lastGeneratedTimetable: state.lastGeneratedTimetable,
    teacherSubjects: state.teacherSubjects,
    freePeriodRules: state.freePeriodRules,
    subjectAllocations: state.subjectAllocations,
  };
}

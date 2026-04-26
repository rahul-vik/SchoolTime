export function applyTenantStateWithFallback(state, seed, setters) {
  if (!state) return;
  setters.setSchool(state.school || seed.school);
  setters.setMediums(state.mediums || seed.mediums);
  setters.setStandards(state.standards || seed.standards);
  setters.setDivisions(state.divisions || seed.divisions);
  setters.setSubjects(state.subjects || seed.subjects);
  setters.setTeachers(state.teachers || seed.teachers);
  setters.setPeriodSlots(state.periodSlots || seed.periodSlots);
  setters.setWorkingDays(state.workingDays || seed.workingDays);
  setters.setSchedulingRules(state.schedulingRules || seed.schedulingRules);
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
    teacherSubjects: state.teacherSubjects,
    freePeriodRules: state.freePeriodRules,
    subjectAllocations: state.subjectAllocations,
  };
}

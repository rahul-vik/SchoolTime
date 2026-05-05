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
  return { value: next, changed };
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

  if (Array.isArray(state.schedulingRules)) {
    const migratedRules = state.schedulingRules.map((r) => normalizeSchedulingRule(r));
    if (migratedRules.some((m) => m.changed)) changed = true;
    state.schedulingRules = migratedRules.map((m) => m.value);
  }

  return { state, changed };
}


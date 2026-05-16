/**
 * Scheduling pause: paused divisions, subjects, and teachers are omitted from timetable
 * generation, exports, and in-run reports (when lists are scoped).
 */

export function isSchedulingPaused(entity) {
  return entity?.schedulingPaused === true;
}

export function isDivisionSchedulingPaused(division) {
  return isSchedulingPaused(division);
}

export function isSubjectSchedulingPaused(subject) {
  return isSchedulingPaused(subject);
}

export function isTeacherSchedulingPaused(teacher) {
  return isSchedulingPaused(teacher);
}

export function normalizeSchedulingPausedFields(entity) {
  if (!entity || typeof entity !== "object") return entity;
  return {
    ...entity,
    schedulingPaused: entity.schedulingPaused === true,
  };
}

export function normalizeDivisionSchedulingFields(division) {
  return normalizeSchedulingPausedFields(division);
}

export function normalizeSubjectSchedulingFields(subject) {
  return normalizeSchedulingPausedFields(subject);
}

export function normalizeTeacherSchedulingFields(teacher) {
  return normalizeSchedulingPausedFields(teacher);
}

function asDivisionList(divisions) {
  return Array.isArray(divisions) ? divisions : [];
}

/** Divisions included in timetable generation and scheduling reports. */
export function divisionsForScheduling(divisions) {
  return asDivisionList(divisions).filter((d) => d && d.id && !isDivisionSchedulingPaused(d));
}

export function activeDivisionIdSet(divisions) {
  return new Set(divisionsForScheduling(divisions).map((d) => String(d.id)));
}

export function countPausedDivisions(divisions) {
  return asDivisionList(divisions).filter(isDivisionSchedulingPaused).length;
}

function asSubjectList(subjects) {
  return Array.isArray(subjects) ? subjects : [];
}

function asTeacherList(teachers) {
  return Array.isArray(teachers) ? teachers : [];
}

/** Subjects included in timetable generation and scheduling reports. */
export function subjectsForScheduling(subjects) {
  return asSubjectList(subjects).filter((s) => s && s.id && !isSubjectSchedulingPaused(s));
}

export function activeSubjectIdSet(subjects) {
  return new Set(subjectsForScheduling(subjects).map((s) => String(s.id)));
}

export function countPausedSubjects(subjects) {
  return asSubjectList(subjects).filter(isSubjectSchedulingPaused).length;
}

/** Teachers not individually paused (may still be excluded by division/subject scope). */
export function teachersForScheduling(teachers) {
  return asTeacherList(teachers).filter((t) => t && t.id && !isTeacherSchedulingPaused(t));
}

export function countPausedTeachers(teachers) {
  return asTeacherList(teachers).filter(isTeacherSchedulingPaused).length;
}

export function teacherAllowedInDivision(teacher, divisionId) {
  const assigned = teacher?.assignedDivisionIds || [];
  if (assigned.length === 0) return true;
  return assigned.some((id) => String(id) === String(divisionId));
}

export function teacherSubjectAllowedInDivision(teacher, subjectId, divisionId) {
  const rows = teacher?.divisionSubjectExclusions || [];
  const hit = rows.find((r) => String(r.divisionId) === String(divisionId));
  if (!hit) return true;
  return !(hit.subjectIds || []).some((id) => String(id) === String(subjectId));
}

export function subjectAppliesToDivision(subject, division) {
  if (!subject || !division) return false;
  if (!(subject.standardIds || []).includes(division.standardId)) return false;
  if (!(subject.mediumIds || []).includes(division.mediumId)) return false;
  const scopeMode = subject.divisionScopeMode === "CUSTOM_DIVISION_OVERRIDES" ? "CUSTOM_DIVISION_OVERRIDES" : "ALL_IN_SELECTED_CLASSES";
  if (scopeMode === "ALL_IN_SELECTED_CLASSES") return true;
  const includeIds = subject.divisionIncludeIds || [];
  const excludeIds = subject.divisionExcludeIds || [];
  if (includeIds.length > 0) return includeIds.includes(division.id);
  if (excludeIds.length > 0) return !excludeIds.includes(division.id);
  return true;
}

export function teacherHasSchedulingScope(teacher, activeDivisions, activeSubjects) {
  if (!teacher || isTeacherSchedulingPaused(teacher)) return false;
  const activeIds = new Set((activeDivisions || []).map((d) => String(d.id)));
  if (activeIds.size === 0) return false;

  const assigned = (teacher.assignedDivisionIds || []).map(String);
  const ctIds = [
    ...(teacher.classTeacherDivisionIds || []),
    ...(teacher.primaryClassTeacherDivisionId ? [teacher.primaryClassTeacherDivisionId] : []),
  ].map(String);

  if (assigned.some((id) => activeIds.has(id))) return true;
  if (ctIds.some((id) => activeIds.has(id))) return true;

  if (assigned.length === 0 && ctIds.length === 0) {
    const subjectIds = (teacher.subjectIds || []).filter((sid) =>
      (activeSubjects || []).some((s) => String(s.id) === String(sid)),
    );
    if (subjectIds.length === 0) return false;
    const subjectById = new Map((activeSubjects || []).map((s) => [String(s.id), s]));
    return (activeDivisions || []).some((div) =>
      subjectIds.some((sid) => {
        const sub = subjectById.get(String(sid));
        return sub && subjectAppliesToDivision(sub, div);
      }),
    );
  }

  return false;
}

function ruleTouchesActiveSubject(rule, activeSubjectIds) {
  if (!rule?.subjectId) return true;
  return activeSubjectIds.has(String(rule.subjectId));
}

function filterRowsByDivision(rows, divisionIdField, activeIds) {
  return (rows || []).filter((row) => {
    const id = row?.[divisionIdField];
    if (id == null || id === "") return true;
    return activeIds.has(String(id));
  });
}

function pruneTeacherDivisionRefs(teacher, activeIds) {
  const assigned = (teacher.assignedDivisionIds || []).filter((id) => activeIds.has(String(id)));
  const classTeacherDivisionIds = (teacher.classTeacherDivisionIds || []).filter((id) => activeIds.has(String(id)));
  const primary = teacher.primaryClassTeacherDivisionId;
  const primaryClassTeacherDivisionId =
    primary != null && activeIds.has(String(primary)) ? primary : classTeacherDivisionIds[0] || null;
  const divisionSubjectExclusions = (teacher.divisionSubjectExclusions || []).filter((r) =>
    activeIds.has(String(r.divisionId)),
  );
  return {
    ...teacher,
    assignedDivisionIds: assigned,
    classTeacherDivisionIds,
    primaryClassTeacherDivisionId,
    divisionSubjectExclusions,
  };
}

function ruleTouchesActiveDivision(rule, activeIds) {
  const ids = [];
  if (rule?.divisionId) ids.push(rule.divisionId);
  if (Array.isArray(rule?.divisionIds)) ids.push(...rule.divisionIds);
  if (ids.length === 0) return true;
  return ids.some((id) => activeIds.has(String(id)));
}

/**
 * Returns tenant payload scoped to active (unpaused) divisions for engine / CP-SAT.
 */
export function scopeTenantForScheduling(tenant) {
  const allDivisions = asDivisionList(tenant?.divisions);
  const allSubjects = asSubjectList(tenant?.subjects);
  const allTeachers = asTeacherList(tenant?.teachers);
  const activeDivisions = divisionsForScheduling(allDivisions);
  const activeSubjects = subjectsForScheduling(allSubjects);
  const activeIds = activeDivisionIdSet(allDivisions);
  const activeSubjectIds = activeSubjectIdSet(allSubjects);

  const teachers = allTeachers
    .filter((t) => teacherHasSchedulingScope(t, activeDivisions, activeSubjects))
    .map((t) => pruneTeacherDivisionRefs(t, activeIds));

  const teacherSubjects = (tenant?.teacherSubjects || []).filter((ts) => {
    if (ts?.teacherId != null && ts.teacherId !== "") {
      const teacher = allTeachers.find((t) => String(t.id) === String(ts.teacherId));
      if (teacher && isTeacherSchedulingPaused(teacher)) return false;
    }
    if (ts?.subjectId != null && ts.subjectId !== "" && !activeSubjectIds.has(String(ts.subjectId))) return false;
    if (ts?.divisionId == null || ts.divisionId === "") return true;
    return activeIds.has(String(ts.divisionId));
  });

  const schedulingScope = {
    activeDivisionCount: activeDivisions.length,
    pausedDivisionCount: allDivisions.length - activeDivisions.length,
    pausedDivisionIds: allDivisions.filter(isDivisionSchedulingPaused).map((d) => d.id),
    totalDivisionCount: allDivisions.length,
    activeSubjectCount: activeSubjects.length,
    pausedSubjectCount: allSubjects.length - activeSubjects.length,
    pausedSubjectIds: allSubjects.filter(isSubjectSchedulingPaused).map((s) => s.id),
    totalSubjectCount: allSubjects.length,
    activeTeacherCount: teachers.length,
    pausedTeacherCount: countPausedTeachers(allTeachers),
    excludedTeacherCount: allTeachers.length - countPausedTeachers(allTeachers) - teachers.length,
    totalTeacherCount: allTeachers.length,
  };

  return {
    ...tenant,
    divisions: activeDivisions,
    subjects: activeSubjects,
    teachers,
    fixedSlots: (tenant?.fixedSlots || []).filter((row) => {
      if (row?.divisionId != null && row.divisionId !== "" && !activeIds.has(String(row.divisionId))) return false;
      if (row?.subjectId != null && row.subjectId !== "" && !activeSubjectIds.has(String(row.subjectId))) return false;
      return true;
    }),
    subjectAllocations: (tenant?.subjectAllocations || []).filter((row) => {
      if (row?.divisionId != null && row.divisionId !== "" && !activeIds.has(String(row.divisionId))) return false;
      if (row?.subjectId != null && row.subjectId !== "" && !activeSubjectIds.has(String(row.subjectId))) return false;
      return true;
    }),
    teacherSubjects,
    schedulingRules: (tenant?.schedulingRules || []).filter(
      (r) => ruleTouchesActiveDivision(r, activeIds) && ruleTouchesActiveSubject(r, activeSubjectIds),
    ),
    _schedulingScope: schedulingScope,
  };
}

export function buildSchedulingScopeReport(scopedTenant) {
  if (scopedTenant?._schedulingScope) return scopedTenant._schedulingScope;
  const allDivisions = asDivisionList(scopedTenant?.divisions);
  const allSubjects = asSubjectList(scopedTenant?.subjects);
  const allTeachers = asTeacherList(scopedTenant?.teachers);
  const activeDivisions = divisionsForScheduling(allDivisions);
  const activeSubjects = subjectsForScheduling(allSubjects);
  const scoped = scopeTenantForScheduling({
    divisions: allDivisions,
    subjects: allSubjects,
    teachers: allTeachers,
    schedulingRules: [],
  });
  return {
    activeDivisionCount: activeDivisions.length,
    pausedDivisionCount: allDivisions.length - activeDivisions.length,
    pausedDivisionIds: allDivisions.filter(isDivisionSchedulingPaused).map((d) => d.id),
    totalDivisionCount: allDivisions.length,
    activeSubjectCount: activeSubjects.length,
    pausedSubjectCount: allSubjects.length - activeSubjects.length,
    pausedSubjectIds: allSubjects.filter(isSubjectSchedulingPaused).map((s) => s.id),
    totalSubjectCount: allSubjects.length,
    activeTeacherCount: scoped.teachers.length,
    pausedTeacherCount: countPausedTeachers(allTeachers),
    excludedTeacherCount: allTeachers.length - countPausedTeachers(allTeachers) - scoped.teachers.length,
    totalTeacherCount: allTeachers.length,
  };
}

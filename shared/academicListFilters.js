import {
  subjectAppliesToDivision,
  teacherAllowedInDivision,
  teacherSubjectAllowedInDivision,
} from "./divisionScheduling.js";

function normalizeSearchText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function uniqueStringIds(values) {
  return [...new Set((values || []).map(String).filter(Boolean))];
}

export function subjectMatchesSearch(sub, query) {
  if (!query) return true;
  const hay = `${sub.name || ""} ${sub.code || ""}`.toLowerCase();
  return hay.includes(query);
}

export function teacherMatchesSearch(teacher, query) {
  if (!query) return true;
  const hay = `${teacher.firstName || ""} ${teacher.lastName || ""} ${teacher.employeeCode || ""} ${teacher.email || ""}`.toLowerCase();
  return hay.includes(query);
}

export function subjectMatchesStandardFilter(sub, selectedStandardIds) {
  if (!selectedStandardIds?.length) return true;
  const filterSet = new Set(selectedStandardIds.map(String));
  return (sub.standardIds || []).some((id) => filterSet.has(String(id)));
}

function teacherTeachesInDivision(teacher, division, subjects) {
  if (!teacher || !division?.id) return false;
  if (!teacherAllowedInDivision(teacher, division.id)) return false;
  const subjectById = new Map((subjects || []).map((s) => [String(s.id), s]));
  return (teacher.subjectIds || []).some((sid) => {
    const sub = subjectById.get(String(sid));
    return (
      sub
      && subjectAppliesToDivision(sub, division)
      && teacherSubjectAllowedInDivision(teacher, sid, division.id)
    );
  });
}

/**
 * Standards a teacher is actually linked to via division assignments, class-teacher
 * roles, and subjects taught in those divisions (not every standard on the subject).
 */
export function teacherStandardIds(teacher, subjects, divisions) {
  const ids = new Set();
  const allDivisions = divisions || [];
  const classTeacherDivIds = uniqueStringIds([
    ...(teacher.classTeacherDivisionIds || []),
    ...(teacher.primaryClassTeacherDivisionId ? [teacher.primaryClassTeacherDivisionId] : []),
  ]);

  for (const divId of classTeacherDivIds) {
    const div = allDivisions.find((d) => String(d.id) === String(divId));
    if (div?.standardId) ids.add(String(div.standardId));
  }

  const assigned = teacher.assignedDivisionIds || [];
  const divisionsToScan = assigned.length > 0
    ? allDivisions.filter((d) => teacherAllowedInDivision(teacher, d.id))
    : allDivisions;

  for (const div of divisionsToScan) {
    if (!div?.standardId) continue;
    const stdId = String(div.standardId);
    if (classTeacherDivIds.includes(String(div.id)) || teacherTeachesInDivision(teacher, div, subjects)) {
      ids.add(stdId);
    }
  }

  return ids;
}

export function teacherMatchesStandardFilter(teacher, selectedStandardIds, subjects, divisions) {
  if (!selectedStandardIds?.length) return true;
  const filterSet = new Set(selectedStandardIds.map(String));
  const teacherStds = teacherStandardIds(teacher, subjects, divisions);
  return [...teacherStds].some((id) => filterSet.has(id));
}

export function teacherMatchesSubjectFilter(teacher, selectedSubjectIds) {
  if (!selectedSubjectIds?.length) return true;
  const filterSet = new Set(selectedSubjectIds.map(String));
  return (teacher.subjectIds || []).some((id) => filterSet.has(String(id)));
}

export function filterSubjectsList(subjects, { search = "", standardIds = [] } = {}) {
  const q = normalizeSearchText(search);
  return (subjects || []).filter(
    (sub) => subjectMatchesSearch(sub, q) && subjectMatchesStandardFilter(sub, standardIds),
  );
}

export function filterTeachersList(teachers, { search = "", standardIds = [], subjectIds = [] }, subjects, divisions) {
  const q = normalizeSearchText(search);
  return (teachers || []).filter(
    (t) =>
      teacherMatchesSearch(t, q)
      && teacherMatchesStandardFilter(t, standardIds, subjects, divisions)
      && teacherMatchesSubjectFilter(t, subjectIds),
  );
}

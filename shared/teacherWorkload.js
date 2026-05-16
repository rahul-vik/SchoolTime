import { getTeacherEffectiveCapacity } from "./teacherCapacity.js";

/** Lesson placements only (excludes free / break / lunch on teacher grid). */
export function countTeacherTeachingPeriods(teacherId, entries) {
  return (entries || []).filter(
    (e) =>
      String(e.teacherId) === String(teacherId) &&
      !e.isFreePeriod &&
      e.subjectId &&
      e.slotType !== "BREAK" &&
      e.slotType !== "LUNCH",
  ).length;
}

export function hasTimetableForWorkload(timetable, timetableStatus) {
  const entries = timetable?.entries;
  if (!Array.isArray(entries) || entries.length === 0) return false;
  return timetableStatus !== "GENERATING" && timetableStatus !== "QUEUED";
}

export function buildTeacherWorkloadStats(teacher, timetable, periodSlots, workingDays) {
  const assigned = countTeacherTeachingPeriods(teacher?.id, timetable?.entries);
  const { effectiveWeekly } = getTeacherEffectiveCapacity(teacher, periodSlots, workingDays);
  const max = Math.max(1, effectiveWeekly);
  const pct = Math.round((assigned / max) * 100);
  return { assigned, max, pct };
}

export function teacherWorkloadColor(pct, colors) {
  if (pct > 90) return colors.danger;
  if (pct > 70) return colors.warning;
  return colors.success;
}

function teacherDisplayNameKey(teacher) {
  const name = `${String(teacher?.lastName || "").trim()} ${String(teacher?.firstName || "").trim()}`.trim();
  return name || String(teacher?.id || "");
}

/** Lower pct / fewer assigned periods sort first (lightest workload at top). */
export function compareTeacherWorkloadStats(a, b) {
  const pctA = Number(a?.pct) || 0;
  const pctB = Number(b?.pct) || 0;
  if (pctA !== pctB) return pctA - pctB;
  const assignedA = Number(a?.assigned) || 0;
  const assignedB = Number(b?.assigned) || 0;
  if (assignedA !== assignedB) return assignedA - assignedB;
  return 0;
}

/** Sort teacher entities by workload map (ascending). Preserves input order when map is empty. */
export function sortTeachersByWorkloadAsc(teachers, workloadByTeacherId) {
  if (!Array.isArray(teachers) || teachers.length === 0) return [];
  if (!workloadByTeacherId || workloadByTeacherId.size === 0) return [...teachers];
  return [...teachers].sort((a, b) => {
    const wa = workloadByTeacherId.get(String(a.id)) ?? { pct: 0, assigned: 0 };
    const wb = workloadByTeacherId.get(String(b.id)) ?? { pct: 0, assigned: 0 };
    const cmp = compareTeacherWorkloadStats(wa, wb);
    if (cmp !== 0) return cmp;
    return teacherDisplayNameKey(a).localeCompare(teacherDisplayNameKey(b), undefined, { sensitivity: "base" });
  });
}

/** Sort report workload rows (ascending). */
export function sortTeacherWorkloadRowsAsc(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return [...rows].sort((a, b) => {
    const cmp = compareTeacherWorkloadStats(
      { pct: a.pct, assigned: a.assigned },
      { pct: b.pct, assigned: b.assigned },
    );
    if (cmp !== 0) return cmp;
    return teacherDisplayNameKey(a.teacher).localeCompare(teacherDisplayNameKey(b.teacher), undefined, {
      sensitivity: "base",
    });
  });
}

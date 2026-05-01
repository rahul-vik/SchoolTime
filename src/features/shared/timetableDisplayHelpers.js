/** Pure helpers for timetable grid / headers (class teacher + medium tags). */

export function teacherFullName(t) {
  if (!t) return "";
  const fn = (t.firstName || "").trim();
  const ln = (t.lastName || "").trim();
  const full = `${fn} ${ln}`.trim();
  return full || String(t.employeeCode || "").trim();
}

export function findClassTeacherForDivision(divisionId, teachers) {
  if (!divisionId) return null;
  return (teachers || []).find((x) => (x.classTeacherDivisionIds || []).includes(divisionId)) || null;
}

/** Primary teaching subject for badges (primarySubjectId, else first subjectIds). */
export function classTeacherPrimarySubject(teacher, subjects) {
  if (!teacher) return null;
  const list = subjects || [];
  const pid = teacher.primarySubjectId;
  if (pid) return list.find((s) => s.id === pid) || null;
  const sid = (teacher.subjectIds || [])[0];
  return sid ? list.find((s) => s.id === sid) || null : null;
}

export function classTeacherDivisionLabels(teacher, divisions, standards) {
  const ids = teacher?.classTeacherDivisionIds || [];
  return ids
    .map((dId) => {
      const div = divisions.find((d) => d.id === dId);
      const std = div ? standards.find((s) => s.id === div.standardId) : null;
      return div ? `Std ${std?.name || "?"}-${div.name}` : null;
    })
    .filter(Boolean);
}

export function mediumTagForDivision(div, mediums) {
  if (!div?.mediumId) return "";
  const m = (mediums || []).find((x) => x.id === div.mediumId);
  const tag = (m?.code || m?.name || "").trim();
  return tag ? ` · ${tag}` : "";
}

export function isClassTeacherLesson(entry, teachers) {
  if (!entry?.teacherId || !entry?.divisionId) return false;
  const t = teachers.find((x) => x.id === entry.teacherId);
  return Boolean(t && (t.classTeacherDivisionIds || []).includes(entry.divisionId));
}

/** Soft indigo CT pill — same visual language as Teacher Workload `CT ×n` (readable on screen and print). */
export const CLASS_TEACHER_CT_PILL_BG = "#4f46e518";
export const CLASS_TEACHER_CT_PILL_FG = "#4f46e5";
export const CLASS_TEACHER_CT_PILL_BORDER = "#4f46e538";

const CLASS_TEACHER_CT_FONT =
  'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Helvetica, Arial, "Noto Sans", sans-serif';

/** Soft indigo pill for workload-style **CT ×n** badges in Reports UI. */
export function classTeacherCtBadgeStyle() {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    flexShrink: 0,
    fontFamily: CLASS_TEACHER_CT_FONT,
    fontWeight: 600,
    letterSpacing: "0.02em",
    background: CLASS_TEACHER_CT_PILL_BG,
    color: CLASS_TEACHER_CT_PILL_FG,
    border: `1.5px solid ${CLASS_TEACHER_CT_PILL_BORDER}`,
    borderRadius: 999,
    lineHeight: 1,
    padding: "3px 9px",
    fontSize: 10,
  };
}

/** Short UI line for teacher morning/evening free-period counts (max 4 each). */
export function formatTeacherFreePeriodsShort(morning, evening) {
  const m = Math.max(0, Number(morning) || 0);
  const e = Math.max(0, Number(evening) || 0);
  if (m === 0 && e === 0) return "";
  const parts = [];
  if (m > 0) parts.push(`${m} morning`);
  if (e > 0) parts.push(`${e} evening`);
  return `${parts.join(" · ")} / day`;
}

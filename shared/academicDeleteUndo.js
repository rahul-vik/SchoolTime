/**
 * Session undo helpers for academic entity deletes (in-memory tenant state).
 * Restores the last removed row if its id is not already present.
 */

export function removeTeacherForUndo(teachers, teacherId) {
  const list = teachers || [];
  const removed = list.find((t) => t.id === teacherId);
  if (!removed) return { teachers: list, removed: null };
  return {
    teachers: list.filter((t) => t.id !== teacherId),
    removed,
  };
}

export function restoreDeletedTeacher(teachers, removed) {
  if (!removed) return { teachers: teachers || [], restored: false };
  const list = teachers || [];
  if (list.some((t) => t.id === removed.id)) return { teachers: list, restored: false };
  return { teachers: [...list, removed], restored: true };
}

export function teacherUndoLabel(teacher) {
  if (!teacher) return "teacher";
  const name = [teacher.firstName, teacher.lastName].filter(Boolean).join(" ").trim();
  return name || teacher.employeeCode || "teacher";
}

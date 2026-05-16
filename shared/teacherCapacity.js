/** Auto max periods/day and week from free morning/evening + period slot layout. */
export function getTeacherComputedCapacity(teacherLike, periodSlots, workingDays) {
  const lessonSlots = (periodSlots || [])
    .filter((s) => s.slotType === "LESSON")
    .sort((a, b) => a.slotNumber - b.slotNumber);
  const lunchNums = (periodSlots || []).filter((s) => s.slotType === "LUNCH").map((s) => s.slotNumber);
  const firstAfterLunch =
    lunchNums.length > 0
      ? lessonSlots.find((s) => s.slotNumber > Math.max(...lunchNums))?.slotNumber ?? null
      : null;
  const morningLessonCount = lessonSlots.filter((s) =>
    firstAfterLunch ? s.slotNumber < firstAfterLunch : s.slotNumber <= Math.ceil(lessonSlots.length / 2),
  ).length;
  const eveningLessonCount = lessonSlots.length - morningLessonCount;
  const fm = Math.max(0, Number(teacherLike?.freeMorningPeriods || 0));
  const fe = Math.max(0, Number(teacherLike?.freeEveningPeriods || 0));
  const sessionAllowed = Math.max(0, morningLessonCount - fm) + Math.max(0, eveningLessonCount - fe);
  const maxPerDay = Math.max(0, Math.min(lessonSlots.length, sessionAllowed));
  const maxPerWeek = Math.max(30, maxPerDay * (workingDays?.length || 0));
  return { maxPerDay, maxPerWeek };
}

/** Effective caps used by timetable engine when placing lessons (mirrors server/engine.js). */
export function getTeacherEffectiveCapacity(teacher, periodSlots, workingDays) {
  const computed = getTeacherComputedCapacity(teacher, periodSlots, workingDays);
  const configuredDaily = Number(teacher?.maxPerDay || 0);
  const configuredWeekly = Number(teacher?.maxPerWeek || 0);
  const effectiveDaily =
    configuredDaily > 0 ? Math.min(computed.maxPerDay, configuredDaily) : computed.maxPerDay;
  const effectiveWeekly =
    configuredWeekly > 0 ? Math.min(computed.maxPerWeek, configuredWeekly) : computed.maxPerWeek;
  return {
    computed,
    effectiveDaily,
    effectiveWeekly,
    hasConfiguredDaily: configuredDaily > 0,
    hasConfiguredWeekly: configuredWeekly > 0,
    configuredMaxPerDay: configuredDaily > 0 ? configuredDaily : null,
    configuredMaxPerWeek: configuredWeekly > 0 ? configuredWeekly : null,
  };
}

/** Persist optional caps: 0 = use auto at generation time. */
export function normalizeTeacherCapacityOnSave(teacherLike, periodSlots, workingDays) {
  const computed = getTeacherComputedCapacity(teacherLike, periodSlots, workingDays);
  const rawDay = Number(teacherLike?.maxPerDay || 0);
  const rawWeek = Number(teacherLike?.maxPerWeek || 0);
  return {
    maxPerDay: rawDay > 0 ? Math.max(1, Math.min(computed.maxPerDay, rawDay)) : 0,
    maxPerWeek: rawWeek > 0 ? Math.max(1, Math.min(computed.maxPerWeek, rawWeek)) : 0,
  };
}

export function formatTeacherCapacitySummary(teacher, periodSlots, workingDays) {
  const cap = getTeacherEffectiveCapacity(teacher, periodSlots, workingDays);
  if (cap.hasConfiguredWeekly) {
    const autoNote =
      cap.effectiveWeekly !== cap.computed.maxPerWeek
        ? ` · auto ${cap.computed.maxPerWeek}/wk`
        : "";
    return `Max ${cap.effectiveWeekly}/wk (set)${autoNote}`;
  }
  return `Auto max ${cap.effectiveDaily}/day · ${cap.computed.maxPerWeek}/wk`;
}

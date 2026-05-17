/**
 * Post-run continuity checks aligned with legacy engine placement rules
 * (`server/engine.js`: streak limits and cross-division same-day continuity).
 */

export function buildLessonSlots(periodSlots) {
  return (periodSlots || []).filter((s) => s.slotType === "LESSON").sort((a, b) => a.slotNumber - b.slotNumber);
}

export function buildLessonIdxBySlot(lessonSlots) {
  const map = new Map();
  lessonSlots.forEach((s, i) => map.set(Number(s.slotNumber), i));
  return map;
}

function entryAt(entriesByCell, divisionId, day, slotNumber) {
  return entriesByCell.get(`${divisionId}:${day}:${slotNumber}`) || null;
}

function buildEntriesByCell(lessonEntries) {
  const map = new Map();
  for (const e of lessonEntries) {
    if (!e?.divisionId || e.isFreePeriod || e.slotType !== "LESSON" || !e.teacherId) continue;
    map.set(`${e.divisionId}:${e.dayOfWeek}:${e.slotNumber}`, e);
  }
  return map;
}

function hasTeacherContinuityInDivisionOnDay(teacherId, divisionId, day, lessonSlots, entriesByCell) {
  for (let i = 1; i < lessonSlots.length; i++) {
    const prevSlot = lessonSlots[i - 1].slotNumber;
    const currSlot = lessonSlots[i].slotNumber;
    const prev = entryAt(entriesByCell, divisionId, day, prevSlot);
    const curr = entryAt(entriesByCell, divisionId, day, currSlot);
    if (
      prev &&
      curr &&
      prev.teacherId === teacherId &&
      curr.teacherId === teacherId &&
      prev.slotType === "LESSON" &&
      curr.slotType === "LESSON" &&
      !prev.isFreePeriod &&
      !curr.isFreePeriod
    ) {
      return true;
    }
  }
  return false;
}

/**
 * @returns {{ code: string, teacherId: string, divisionId: string, subjectId?: string, dayOfWeek: string, slotNumber?: number, streak: number, limit: number }[]}
 */
export function scanTeacherContinuityStreakViolations({ lessonEntries, teachers, periodSlots, workingDays }) {
  const lessonSlots = buildLessonSlots(periodSlots);
  const lessonIdxBySlot = buildLessonIdxBySlot(lessonSlots);
  const entriesByCell = buildEntriesByCell(lessonEntries);
  const teacherById = new Map((teachers || []).map((t) => [t.id, t]));
  const violations = [];

  const divisionDays = new Map();
  for (const e of lessonEntries) {
    if (!e?.divisionId || e.isFreePeriod || !e.teacherId) continue;
    const k = `${e.divisionId}:${e.dayOfWeek}`;
    if (!divisionDays.has(k)) divisionDays.set(k, new Set());
    divisionDays.get(k).add(e.teacherId);
  }

  for (const [divDay, teacherIds] of divisionDays) {
    const [divisionId, day] = divDay.split(":");
    for (const teacherId of teacherIds) {
      const teacher = teacherById.get(teacherId);
      if (!teacher) continue;
      const maxSame = Math.max(1, Number(teacher.maxContinuousSameSubjectPerDivision || 2));
      const maxCombined = Math.max(1, Number(teacher.maxContinuousAnySubjectPerDivision || 3));

      for (const slot of lessonSlots) {
        const startIdx = lessonIdxBySlot.get(Number(slot.slotNumber));
        if (startIdx === undefined) continue;
        const placed = entryAt(entriesByCell, divisionId, day, slot.slotNumber);
        if (!placed || placed.teacherId !== teacherId) continue;

        let streakAny = 0;
        let streakSame = 0;
        for (let i = startIdx - 1; i >= 0; i--) {
          const prevSlot = lessonSlots[i].slotNumber;
          const prev = entryAt(entriesByCell, divisionId, day, prevSlot);
          if (!prev || prev.teacherId !== teacherId || prev.isFreePeriod) break;
          streakAny += 1;
          if (prev.subjectId === placed.subjectId) streakSame += 1;
          else if (streakSame > 0) break;
        }
        const runAny = streakAny + 1;
        const runSame = streakSame + 1;
        if (runAny > maxCombined) {
          violations.push({
            code: "CONTINUITY_ANY_SUBJECT_EXCEEDED",
            teacherId,
            divisionId,
            subjectId: placed.subjectId,
            dayOfWeek: day,
            slotNumber: slot.slotNumber,
            streak: runAny,
            limit: maxCombined,
          });
        }
        if (runSame > maxSame) {
          violations.push({
            code: "CONTINUITY_SAME_SUBJECT_EXCEEDED",
            teacherId,
            divisionId,
            subjectId: placed.subjectId,
            dayOfWeek: day,
            slotNumber: slot.slotNumber,
            streak: runSame,
            limit: maxSame,
          });
        }
      }
    }
  }

  return violations;
}

/**
 * @returns {{ code: string, teacherId: string, dayOfWeek: string, divisionIds: string[] }[]}
 */
export function scanTeacherCrossDivisionContinuityViolations({ lessonEntries, divisions, periodSlots, workingDays }) {
  const lessonSlots = buildLessonSlots(periodSlots);
  const entriesByCell = buildEntriesByCell(lessonEntries);
  const violations = [];
  const days = workingDays?.length ? workingDays : ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

  for (const day of days) {
    const teacherIds = new Set(
      lessonEntries.filter((e) => e?.teacherId && !e.isFreePeriod && e.dayOfWeek === day).map((e) => e.teacherId),
    );
    for (const teacherId of teacherIds) {
    const divisionsWithContinuity = [];
    for (const div of divisions || []) {
      if (hasTeacherContinuityInDivisionOnDay(teacherId, div.id, day, lessonSlots, entriesByCell)) {
        divisionsWithContinuity.push(div.id);
      }
    }
    if (divisionsWithContinuity.length > 1) {
      violations.push({
        code: "TEACHER_CROSS_DIVISION_CONTINUITY",
        teacherId,
        dayOfWeek: day,
        divisionIds: divisionsWithContinuity,
      });
    }
    }
  }

  return violations;
}

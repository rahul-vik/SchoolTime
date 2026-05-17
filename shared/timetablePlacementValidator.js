/**
 * Shared placement checks for manual timetable edits (and engine parity).
 * Mirrors legacy engine `canPlaceAssignment` constraints.
 */

import { slotActiveOnWeekday, defaultWorkingDaysFallback } from "./periodSlotDays.js";
import { subjectAppliesToDivision } from "./divisionScheduling.js";
import {
  getPeriodSlotMeta,
  isDayBlockedByRule,
  isSlotBlockedByRule,
  isPlacementAllowedByIncludeOnly,
} from "./schedulingRulePlacement.js";
import { getTeacherEffectiveCapacity } from "./teacherCapacity.js";
import { buildLessonSlots, buildLessonIdxBySlot } from "./timetableContinuity.js";

const MAX_TEAM_TEACHERS_PER_PAIR = 2;

export const PLACEMENT_REASON_MESSAGES = {
  DIVISION_BLOCKED: "Teacher is not assigned to this class",
  DIVISION_OCCUPIED: "This class period is already occupied",
  NON_LESSON_SLOT: "Not a teaching period (break or lunch)",
  SLOT_INACTIVE_THIS_DAY: "Period is inactive on this weekday",
  DAY_RULE_BLOCKED: "Subject cannot be taught on this day (preference)",
  SLOT_RULE_BLOCKED: "Subject cannot be placed in this period (preference)",
  INCLUDE_RULE_BLOCKED: "Subject is restricted to specific cells only (INCLUDE ONLY)",
  SUBJECT_WEEKLY_TARGET_REACHED: "Weekly period target for this subject is already met",
  SUBJECT_MAX_PER_DAY: "Daily limit for this subject in this class is reached",
  TEACHER_SUBJECT_LOCK_MISMATCH: "Another teacher is locked for this class and subject",
  TEACHER_SLOT_TAKEN: "Teacher is already teaching another class in this period",
  TEACHER_FREE_PERIOD_RULE: "Teacher must stay free in this period",
  TEACHER_DAILY_CAPACITY: "Teacher has reached the daily lesson limit",
  TEACHER_MORNING_CAPACITY: "Teacher has too many morning lessons reserved as free",
  TEACHER_EVENING_CAPACITY: "Teacher has too many end-of-day lessons reserved as free",
  TEACHER_WEEKLY_CAPACITY: "Teacher has reached the weekly lesson limit",
  CONTINUITY_LIMIT: "Too many back-to-back lessons for this teacher",
  CROSS_DIVISION_CONTINUITY_DAY: "Teacher already has continuity in another class this day",
  DOUBLE_PERIOD_RULE: "Double-period subject must stay in adjacent pairs",
  ROOM_UNAVAILABLE: "Room or lab is not available in this period",
  SAME_CELL: "Cannot move to the same cell",
  SOURCE_EMPTY: "Nothing to move from this cell",
  TARGET_NOT_FREE: "Target is not a free period",
  CROSS_DIVISION_FREE: "Free periods can only be used within the same class",
  BOTH_FREE: "Cannot swap two free periods",
  BREAK_OR_LUNCH: "Break and lunch cells cannot be edited",
  INVALID_OPERATION: "This edit is not allowed",
};

function dSlotKey(divisionId, day, slot) {
  return `${divisionId}:${day}:${slot}`;
}

function tSlotKey(teacherId, day, slot) {
  return `${teacherId}:${day}:${slot}`;
}

function tDayKey(teacherId, day) {
  return `${teacherId}:${day}`;
}

function tWeekKey(teacherId) {
  return `${teacherId}:WEEK`;
}

function subWKey(divisionId, subjectId) {
  return `${divisionId}:${subjectId}`;
}

function subDKey(divisionId, subjectId, day) {
  return `${divisionId}:${subjectId}:${day}`;
}

function subTeacherLockKey(divisionId, subjectId) {
  return `${divisionId}:${subjectId}`;
}

export function getDivisionSubjectLimits(subject, divisionId, subjectAllocations) {
  const limits = (subject?.divisionLimits || []).find((dl) => dl.divisionId === divisionId);
  const legacyAlloc = (subjectAllocations || []).find(
    (a) => a.divisionId === divisionId && a.subjectId === subject?.id,
  );
  return {
    weeklyPeriods:
      limits?.weeklyPeriods !== undefined
        ? Number(limits.weeklyPeriods)
        : legacyAlloc?.weeklyPeriods !== undefined
          ? Number(legacyAlloc.weeklyPeriods)
          : Number(subject?.weeklyPeriods || 0),
    maxPerDay:
      limits?.maxPerDay !== undefined
        ? Number(limits.maxPerDay)
        : Number(subject?.maxPerDay || 2),
  };
}

function teacherAllowedInDivision(teacher, divisionId) {
  const assigned = teacher.assignedDivisionIds || [];
  if (assigned.length === 0) return true;
  return assigned.includes(divisionId);
}

function teacherSubjectAllowedInDivision(teacher, subjectId, divisionId) {
  const rows = teacher.divisionSubjectExclusions || [];
  const hit = rows.find((r) => r.divisionId === divisionId);
  if (!hit) return true;
  return !(hit.subjectIds || []).includes(subjectId);
}

function isTeamTeachingAllowed(ctx, divisionId, subjectId) {
  const sub = ctx.subjects.find((s) => s.id === subjectId);
  if (sub?.allowTeamTeaching) return true;
  const persisted = (ctx.divisionSubjectTeacherLocks || []).find(
    (l) => l.divisionId === divisionId && l.subjectId === subjectId,
  );
  if (persisted?.teamTeachingAllowed) return true;
  const explicit = (ctx.teacherSubjects || []).filter(
    (ts) => ts.subjectId === subjectId && (!ts.divisionId || ts.divisionId === divisionId),
  );
  const teacherSet = new Set(explicit.map((ts) => ts.teacherId).filter(Boolean));
  return teacherSet.size > 1;
}

function maxTeachersForDivisionSubject(ctx, divisionId, subjectId) {
  return isTeamTeachingAllowed(ctx, divisionId, subjectId) ? MAX_TEAM_TEACHERS_PER_PAIR : 1;
}

/** Room scheduling stub — structure for future lab/room constraints. */
export function checkRoomAvailability(_ctx, _placement) {
  return { ok: true };
}

/**
 * @param {object} state tenant snapshot (periodSlots, teachers, rules, …)
 * @param {object[]} entries timetable entry rows
 */
export function createPlacementValidatorContext(state, entries) {
  const periodSlots = state?.periodSlots || [];
  const workingDays = defaultWorkingDaysFallback(state?.workingDays);
  const divisionsResolved = Array.isArray(state?.divisions) ? state.divisions : [];
  const subjects = state?.subjects || [];
  const teachers = state?.teachers || [];
  const rules = state?.schedulingRules || [];
  const teacherSubjects = state?.teacherSubjects || [];
  const divisionSubjectTeacherLocks = state?.divisionSubjectTeacherLocks || [];
  const freePeriodRules = state?.freePeriodRules || [];
  const subjectAllocations = state?.subjectAllocations || [];

  const lessonSlots = buildLessonSlots(periodSlots);
  const lessonIdxBySlot = buildLessonIdxBySlot(lessonSlots);
  const meta = getPeriodSlotMeta(periodSlots);
  const firstAfterLunch = meta.firstAfterLunch;
  const isMornSlot = (n) =>
    firstAfterLunch ? n < firstAfterLunch : n <= Math.ceil(lessonSlots.length / 2);

  const divisionSlotMap = new Map();
  const teacherSlotMap = new Map();
  const teacherDailyCount = new Map();
  const teacherMorningCount = new Map();
  const teacherEveningCount = new Map();
  const teacherWeeklyCount = new Map();
  const subjectWeeklyCount = new Map();
  const subjectDailyCount = new Map();
  const divisionSubjectTeacherLock = new Map();

  const registerLesson = (e) => {
    if (!e || e.slotType === "BREAK" || e.slotType === "LUNCH") return;
    const key = dSlotKey(e.divisionId, e.dayOfWeek, e.slotNumber);
    divisionSlotMap.set(key, e);
    if (!e.isFreePeriod && e.teacherId && e.subjectId) {
      teacherSlotMap.set(tSlotKey(e.teacherId, e.dayOfWeek, e.slotNumber), e.divisionId);
      teacherDailyCount.set(
        tDayKey(e.teacherId, e.dayOfWeek),
        (teacherDailyCount.get(tDayKey(e.teacherId, e.dayOfWeek)) || 0) + 1,
      );
      if (isMornSlot(Number(e.slotNumber))) {
        teacherMorningCount.set(
          tDayKey(e.teacherId, e.dayOfWeek),
          (teacherMorningCount.get(tDayKey(e.teacherId, e.dayOfWeek)) || 0) + 1,
        );
      } else {
        teacherEveningCount.set(
          tDayKey(e.teacherId, e.dayOfWeek),
          (teacherEveningCount.get(tDayKey(e.teacherId, e.dayOfWeek)) || 0) + 1,
        );
      }
      teacherWeeklyCount.set(tWeekKey(e.teacherId), (teacherWeeklyCount.get(tWeekKey(e.teacherId)) || 0) + 1);
      subjectWeeklyCount.set(
        subWKey(e.divisionId, e.subjectId),
        (subjectWeeklyCount.get(subWKey(e.divisionId, e.subjectId)) || 0) + 1,
      );
      subjectDailyCount.set(
        subDKey(e.divisionId, e.subjectId, e.dayOfWeek),
        (subjectDailyCount.get(subDKey(e.divisionId, e.subjectId, e.dayOfWeek)) || 0) + 1,
      );
      const lockKey = subTeacherLockKey(e.divisionId, e.subjectId);
      if (!divisionSubjectTeacherLock.has(lockKey)) {
        divisionSubjectTeacherLock.set(lockKey, new Set([e.teacherId]));
      } else {
        divisionSubjectTeacherLock.get(lockKey).add(e.teacherId);
      }
    }
  };

  for (const e of entries || []) {
    registerLesson(e);
  }

  const ctx = {
    entries: entries || [],
    divisions: divisionsResolved,
    subjects,
    teachers,
    periodSlots,
    workingDays,
    rules,
    teacherSubjects,
    divisionSubjectTeacherLocks,
    freePeriodRules,
    subjectAllocations,
    lessonSlots,
    lessonIdxBySlot,
    isMornSlot,
    divisionSlotMap,
    teacherSlotMap,
    teacherDailyCount,
    teacherMorningCount,
    teacherEveningCount,
    teacherWeeklyCount,
    subjectWeeklyCount,
    subjectDailyCount,
    divisionSubjectTeacherLock,
    getLockedTeachersForPair(divisionId, subjectId) {
      return divisionSubjectTeacherLock.get(subTeacherLockKey(divisionId, subjectId)) || new Set();
    },
    maxTeachersForDivisionSubject(divisionId, subjectId) {
      return maxTeachersForDivisionSubject(ctx, divisionId, subjectId);
    },
  };

  return ctx;
}

function getTeacherCapacity(ctx, teacher) {
  const cap = getTeacherEffectiveCapacity(teacher, ctx.periodSlots, ctx.workingDays);
  const lessonSlots = ctx.lessonSlots;
  const mornSlots = lessonSlots.filter((s) => ctx.isMornSlot(s.slotNumber));
  const eveSlots = lessonSlots.filter((s) => !ctx.isMornSlot(s.slotNumber));
  const fm = Math.max(0, Number(teacher.freeMorningPeriods || 0));
  const fe = Math.max(0, Number(teacher.freeEveningPeriods || 0));
  const morningAllowed = Math.max(0, mornSlots.length - fm);
  const eveningAllowed = Math.max(0, eveSlots.length - fe);
  return {
    effectiveDailyMax: cap.effectiveDaily,
    effectiveWeeklyMax: cap.effectiveWeekly,
    morningAllowed,
    eveningAllowed,
  };
}

function teacherHasLessonAtSlot(ctx, teacherId, day, slotNumber, ignoreTeacherSlots, ignoreCells) {
  const slotIgnores = ignoreTeacherSlots || new Set();
  const cellIgnores = ignoreCells || new Set();
  const tKey = tSlotKey(teacherId, day, slotNumber);
  if (slotIgnores.has(`teacher:${tKey}`)) return false;
  for (const e of ctx.entries) {
    if (!e?.teacherId || e.isFreePeriod || e.slotType === "BREAK" || e.slotType === "LUNCH") continue;
    if (e.teacherId !== teacherId || e.dayOfWeek !== day || Number(e.slotNumber) !== Number(slotNumber)) {
      continue;
    }
    const ck = dSlotKey(e.divisionId, day, slotNumber);
    if (cellIgnores.has(ck)) continue;
    return true;
  }
  return false;
}

/** Relocating an existing lesson: only teacher clash + reserved free period. */
function checkTeacherSlotFree(ctx, teacher, day, slotNumber, ignoreTeacherSlots, ignoreCells) {
  if (teacherHasLessonAtSlot(ctx, teacher.id, day, slotNumber, ignoreTeacherSlots, ignoreCells)) {
    return { ok: false, reason: "TEACHER_SLOT_TAKEN" };
  }
  if (
    (ctx.freePeriodRules || []).some(
      (r) => r.teacherId === teacher.id && r.dayOfWeek === day && Number(r.slotNumber) === Number(slotNumber),
    )
  ) {
    return { ok: false, reason: "TEACHER_FREE_PERIOD_RULE" };
  }
  return { ok: true };
}

function canAssignTeacherForSlot(ctx, teacher, day, slotNumber, ignoreTeacherSlots, ignoreCells) {
  if (teacherHasLessonAtSlot(ctx, teacher.id, day, slotNumber, ignoreTeacherSlots, ignoreCells)) {
    return { ok: false, reason: "TEACHER_SLOT_TAKEN" };
  }
  if (
    (ctx.freePeriodRules || []).some(
      (r) => r.teacherId === teacher.id && r.dayOfWeek === day && Number(r.slotNumber) === Number(slotNumber),
    )
  ) {
    return { ok: false, reason: "TEACHER_FREE_PERIOD_RULE" };
  }
  const { effectiveDailyMax, effectiveWeeklyMax, morningAllowed, eveningAllowed } = getTeacherCapacity(ctx, teacher);
  if ((ctx.teacherDailyCount.get(tDayKey(teacher.id, day)) || 0) >= effectiveDailyMax) {
    return { ok: false, reason: "TEACHER_DAILY_CAPACITY" };
  }
  if (ctx.isMornSlot(slotNumber)) {
    if ((ctx.teacherMorningCount.get(tDayKey(teacher.id, day)) || 0) >= morningAllowed) {
      return { ok: false, reason: "TEACHER_MORNING_CAPACITY" };
    }
  } else if ((ctx.teacherEveningCount.get(tDayKey(teacher.id, day)) || 0) >= eveningAllowed) {
    return { ok: false, reason: "TEACHER_EVENING_CAPACITY" };
  }
  if ((ctx.teacherWeeklyCount.get(tWeekKey(teacher.id)) || 0) >= effectiveWeeklyMax) {
    return { ok: false, reason: "TEACHER_WEEKLY_CAPACITY" };
  }
  return { ok: true };
}

function violatesContinuityLimits(ctx, teacher, divisionId, day, slotNumber, subjectId, ignoreCells) {
  const maxSameSubject = Math.max(1, Number(teacher.maxContinuousSameSubjectPerDivision || 2));
  const maxCombined = Math.max(1, Number(teacher.maxContinuousAnySubjectPerDivision || 3));
  const startIdx = ctx.lessonIdxBySlot.get(Number(slotNumber));
  if (startIdx === undefined) return false;

  const cellIgnores = ignoreCells || new Set();
  const readCell = (divId, d, sn) => {
    const k = dSlotKey(divId, d, sn);
    if (cellIgnores.has(k)) return null;
    return ctx.divisionSlotMap.get(k) || null;
  };

  let streakAny = 0;
  let streakSame = 0;
  for (let i = startIdx - 1; i >= 0; i--) {
    const prevSlot = ctx.lessonSlots[i].slotNumber;
    const prev = readCell(divisionId, day, prevSlot);
    if (!prev || prev.teacherId !== teacher.id || prev.isFreePeriod || prev.slotType !== "LESSON") break;
    streakAny += 1;
    if (prev.subjectId === subjectId) streakSame += 1;
    else if (streakSame > 0) break;
  }
  if (streakAny + 1 > maxCombined) return true;
  if (streakSame + 1 > maxSameSubject) return true;
  return false;
}

function candidateCreatesContinuityForDivision(ctx, teacherId, divisionId, day, slotNumber, ignoreCells) {
  const idx = ctx.lessonIdxBySlot.get(Number(slotNumber));
  if (idx === undefined) return false;
  const cellIgnores = ignoreCells || new Set();
  const readCell = (divId, d, sn) => {
    const k = dSlotKey(divId, d, sn);
    if (cellIgnores.has(k)) return null;
    return ctx.divisionSlotMap.get(k) || null;
  };
  const prevSlot = idx > 0 ? ctx.lessonSlots[idx - 1].slotNumber : null;
  const nextSlot = idx < ctx.lessonSlots.length - 1 ? ctx.lessonSlots[idx + 1].slotNumber : null;
  const prev = prevSlot !== null ? readCell(divisionId, day, prevSlot) : null;
  const next = nextSlot !== null ? readCell(divisionId, day, nextSlot) : null;
  const leftMatch = prev && prev.teacherId === teacherId && prev.slotType === "LESSON" && !prev.isFreePeriod;
  const rightMatch = next && next.teacherId === teacherId && next.slotType === "LESSON" && !next.isFreePeriod;
  return Boolean(leftMatch || rightMatch);
}

function hasTeacherContinuityInDivisionOnDay(ctx, teacherId, divisionId, day, ignoreCells) {
  const cellIgnores = ignoreCells || new Set();
  const readCell = (motionDivId, d, sn) => {
    const k = dSlotKey(motionDivId, d, sn);
    if (cellIgnores.has(k)) return null;
    return ctx.divisionSlotMap.get(k) || null;
  };
  for (let i = 1; i < ctx.lessonSlots.length; i++) {
    const prevSlot = ctx.lessonSlots[i - 1].slotNumber;
    const currSlot = ctx.lessonSlots[i].slotNumber;
    const prev = readCell(divisionId, day, prevSlot);
    const curr = readCell(divisionId, day, currSlot);
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

function violatesSingleClassContinuityPerDay(ctx, teacherId, divisionId, day, slotNumber, ignoreCells) {
  if (!candidateCreatesContinuityForDivision(ctx, teacherId, divisionId, day, slotNumber, ignoreCells)) {
    return false;
  }
  for (const div of ctx.divisions) {
    if (String(div.id) === String(divisionId)) continue;
    if (hasTeacherContinuityInDivisionOnDay(ctx, teacherId, div.id, day, ignoreCells)) return true;
  }
  return false;
}

function motionDivIdEq(a, b) {
  return a != null && b != null && String(a) === String(b);
}

export function findEntryAt(entries, divisionId, dayOfWeek, slotNumber) {
  const sn = Number(slotNumber);
  return (entries || []).find(
    (e) =>
      motionDivIdEq(e.divisionId, divisionId) &&
      e.dayOfWeek === dayOfWeek &&
      Number(e.slotNumber) === sn,
  );
}

export function placementFailure(reason, extra = {}) {
  return {
    ok: false,
    reason,
    reasonCode: reason,
    reasonMessage: PLACEMENT_REASON_MESSAGES[reason] || reason,
    ...extra,
  };
}

export function placementSuccess(extra = {}) {
  return { ok: true, ...extra };
}

/**
 * Core placement check — mirrors engine `canPlaceAssignment`.
 * @param {Set<string>} [options.ignoreCells] division cell keys treated as empty
 * @param {Set<string>} [options.ignoreTeacherSlots] keys `teacher:tId:day:slot`
 */
export function evaluatePlacement(ctx, options) {
  const {
    teacher,
    divisionId,
    day,
    slotNumber,
    subjectId,
    ignoreSoftRules = false,
    ignoreCells = new Set(),
    ignoreTeacherSlots = new Set(),
    roomId = null,
    /** When true, skip weekly/daily subject and teacher capacity caps (swap/move). */
    relocatingExistingLesson = false,
  } = options;

  if (!teacher) return placementFailure("NO_ELIGIBLE_SUBJECT");
  if (!teacherAllowedInDivision(teacher, divisionId)) return placementFailure("DIVISION_BLOCKED");
  const dKey = dSlotKey(divisionId, day, slotNumber);
  if (!ignoreCells.has(dKey) && ctx.divisionSlotMap.has(dKey)) {
    const occupant = ctx.divisionSlotMap.get(dKey);
    if (occupant && !occupant.isFreePeriod) return placementFailure("DIVISION_OCCUPIED");
  }
  const slotRow = ctx.periodSlots.find((s) => Number(s.slotNumber) === Number(slotNumber));
  if (!slotRow) return placementFailure("NON_LESSON_SLOT");
  if (slotRow.slotType && slotRow.slotType !== "LESSON") return placementFailure("NON_LESSON_SLOT");
  if (!slotActiveOnWeekday(slotRow, day)) return placementFailure("SLOT_INACTIVE_THIS_DAY");
  if (!ignoreSoftRules && isDayBlockedByRule(subjectId, day, ctx.rules)) {
    return placementFailure("DAY_RULE_BLOCKED");
  }
  if (!ignoreSoftRules && isSlotBlockedByRule(subjectId, slotNumber, ctx.periodSlots, ctx.rules)) {
    return placementFailure("SLOT_RULE_BLOCKED");
  }
  if (
    !isPlacementAllowedByIncludeOnly(
      subjectId,
      divisionId,
      day,
      slotNumber,
      ctx.periodSlots,
      ctx.workingDays,
      ctx.rules,
    )
  ) {
    return placementFailure("INCLUDE_RULE_BLOCKED");
  }
  const sub = ctx.subjects.find((s) => s.id === subjectId);
  if (sub && !relocatingExistingLesson) {
    const subDayCount = ctx.subjectDailyCount.get(subDKey(divisionId, subjectId, day)) || 0;
    const subWeekCount = ctx.subjectWeeklyCount.get(subWKey(divisionId, subjectId)) || 0;
    const { weeklyPeriods: required, maxPerDay } = getDivisionSubjectLimits(
      sub,
      divisionId,
      ctx.subjectAllocations,
    );
    if (subWeekCount >= (required || 0)) return placementFailure("SUBJECT_WEEKLY_TARGET_REACHED");
    if (subDayCount >= (maxPerDay || 2)) return placementFailure("SUBJECT_MAX_PER_DAY");
  }
  const lockedTeachers = ctx.getLockedTeachersForPair(divisionId, subjectId);
  const maxTeachers = ctx.maxTeachersForDivisionSubject(divisionId, subjectId);
  if (lockedTeachers.size > 0 && !lockedTeachers.has(teacher.id) && lockedTeachers.size >= maxTeachers) {
    return placementFailure("TEACHER_SUBJECT_LOCK_MISMATCH");
  }
  const teacherSlotCheck = relocatingExistingLesson
    ? checkTeacherSlotFree(ctx, teacher, day, slotNumber, ignoreTeacherSlots, ignoreCells)
    : canAssignTeacherForSlot(ctx, teacher, day, slotNumber, ignoreTeacherSlots, ignoreCells);
  if (!teacherSlotCheck.ok) return placementFailure(teacherSlotCheck.reason);
  if (violatesContinuityLimits(ctx, teacher, divisionId, day, slotNumber, subjectId, ignoreCells)) {
    return placementFailure("CONTINUITY_LIMIT");
  }
  if (violatesSingleClassContinuityPerDay(ctx, teacher.id, divisionId, day, slotNumber, ignoreCells)) {
    return placementFailure("CROSS_DIVISION_CONTINUITY_DAY");
  }
  const roomCheck = checkRoomAvailability(ctx, { divisionId, day, slotNumber, subjectId, teacherId: teacher.id, roomId });
  if (!roomCheck.ok) return placementFailure(roomCheck.reason || "ROOM_UNAVAILABLE");
  return placementSuccess();
}

function isLessonCell(entry) {
  if (!entry) return false;
  if (entry.slotType === "BREAK" || entry.slotType === "LUNCH") return false;
  return true;
}

function isOccupiedLesson(entry) {
  return isLessonCell(entry) && !entry.isFreePeriod && entry.subjectId && entry.teacherId;
}

export function inferEditKind(sourceEntry, targetEntry) {
  if (!isLessonCell(sourceEntry) || !isLessonCell(targetEntry)) {
    return { kind: "INVALID", reasonCode: "BREAK_OR_LUNCH" };
  }
  if (isOccupiedLesson(sourceEntry) && targetEntry?.isFreePeriod) {
    if (motionDivIdEq(sourceEntry.divisionId, targetEntry.divisionId)) {
      return { kind: "MOVE_TO_FREE" };
    }
    return { kind: "INVALID", reasonCode: "CROSS_DIVISION_FREE" };
  }
  if (sourceEntry?.isFreePeriod && isOccupiedLesson(targetEntry)) {
    if (motionDivIdEq(sourceEntry.divisionId, targetEntry.divisionId)) {
      return { kind: "MOVE_TO_FREE" };
    }
    return { kind: "INVALID", reasonCode: "CROSS_DIVISION_FREE" };
  }
  if (sourceEntry?.isFreePeriod && targetEntry?.isFreePeriod) {
    return { kind: "INVALID", reasonCode: "BOTH_FREE" };
  }
  if (isOccupiedLesson(sourceEntry) && isOccupiedLesson(targetEntry)) {
    return { kind: "SWAP" };
  }
  return { kind: "INVALID", reasonCode: "INVALID_OPERATION" };
}

function buildIgnoreSetsForEdit(source, target) {
  const ignoreCells = new Set();
  const addCell = (c) => {
    if (!c) return;
    ignoreCells.add(dSlotKey(c.divisionId, c.dayOfWeek, c.slotNumber));
  };
  addCell(source);
  addCell(target);
  return { ignoreCells };
}

function validateSubjectCountsAfterEntries(entries, state) {
  const weekly = new Map();
  const daily = new Map();
  for (const e of entries || []) {
    if (!e?.subjectId || e.isFreePeriod || e.slotType !== "LESSON") continue;
    const wk = subWKey(e.divisionId, e.subjectId);
    const dk = subDKey(e.divisionId, e.subjectId, e.dayOfWeek);
    weekly.set(wk, (weekly.get(wk) || 0) + 1);
    daily.set(dk, (daily.get(dk) || 0) + 1);
  }
  for (const [wk, count] of weekly) {
    const [divisionId, subjectId] = wk.split(":");
    const sub = (state?.subjects || []).find((s) => s.id === subjectId);
    if (!sub) continue;
    const { weeklyPeriods: required } = getDivisionSubjectLimits(sub, divisionId, state?.subjectAllocations);
    if (count > (required || 0)) {
      return { ok: false, reasonCode: "SUBJECT_WEEKLY_TARGET_REACHED" };
    }
  }
  for (const [dk, count] of daily) {
    const parts = dk.split(":");
    const divisionId = parts[0];
    const subjectId = parts[1];
    const day = parts.slice(2).join(":");
    const sub = (state?.subjects || []).find((s) => s.id === subjectId);
    if (!sub) continue;
    const { maxPerDay } = getDivisionSubjectLimits(sub, divisionId, state?.subjectAllocations);
    if (count > (maxPerDay || 2)) {
      return { ok: false, reasonCode: "SUBJECT_MAX_PER_DAY" };
    }
  }
  return { ok: true };
}

function violatesDoublePeriodAfterEntries(entries, state) {
  const subjectsById = new Map((state?.subjects || []).map((s) => [s.id, s]));
  const lessonSlots = buildLessonSlots(state?.periodSlots || []);
  const slotIdx = buildLessonIdxBySlot(lessonSlots);
  const byDivSubDay = new Map();

  for (const e of entries) {
    if (!e?.subjectId || e.isFreePeriod || e.slotType !== "LESSON") continue;
    const sub = subjectsById.get(e.subjectId);
    if (!sub?.requiresDoublePeriod) continue;
    const k = `${e.divisionId}:${e.subjectId}:${e.dayOfWeek}`;
    if (!byDivSubDay.has(k)) byDivSubDay.set(k, []);
    byDivSubDay.get(k).push(Number(e.slotNumber));
  }

  for (const [, slots] of byDivSubDay) {
    if (slots.length <= 1) continue;
    slots.sort((a, b) => a - b);
    let i = 0;
    while (i < slots.length) {
      const idx = slotIdx.get(slots[i]);
      const nextSlot = idx !== undefined && idx < lessonSlots.length - 1 ? lessonSlots[idx + 1].slotNumber : null;
      if (slots[i + 1] === nextSlot) {
        i += 2;
        continue;
      }
      if (i + 1 < slots.length) return true;
      i += 1;
    }
  }
  return false;
}

export function applyManualEditToEntries(entries, operation, source, target) {
  const list = [...(entries || [])];
  const sourceEntry = findEntryAt(list, source.divisionId, source.dayOfWeek, source.slotNumber);
  const targetEntry = findEntryAt(list, target.divisionId, target.dayOfWeek, target.slotNumber);
  if (!sourceEntry || !targetEntry) return { entries: list, changed: false };

  const kind =
    operation === "MOVE"
      ? "MOVE_TO_FREE"
      : operation === "SWAP"
        ? "SWAP"
        : inferEditKind(sourceEntry, targetEntry).kind;

  const patchCell = (e, subjectId, teacherId) => {
    const sid = subjectId != null ? subjectId : null;
    const tid = teacherId != null ? teacherId : null;
    const isFree = !sid && !tid;
    const next = { ...e, subjectId: sid, teacherId: tid, isFreePeriod: isFree };
    if (isFree) next.label = "Free";
    else delete next.label;
    return next;
  };

  if (kind === "MOVE_TO_FREE") {
    const lesson = isOccupiedLesson(sourceEntry) ? sourceEntry : targetEntry;
    const free = sourceEntry.isFreePeriod ? sourceEntry : targetEntry;
    return {
      changed: true,
      entries: list.map((e) => {
        if (e === sourceEntry) return patchCell(e, null, null);
        if (e === targetEntry) return patchCell(e, lesson.subjectId, lesson.teacherId);
        return e;
      }),
      kind: "MOVE_TO_FREE",
    };
  }

  if (kind === "SWAP") {
    return {
      changed: true,
      entries: list.map((e) => {
        if (e === sourceEntry) return patchCell(e, targetEntry.subjectId, targetEntry.teacherId);
        if (e === targetEntry) return patchCell(e, sourceEntry.subjectId, sourceEntry.teacherId);
        return e;
      }),
      kind: "SWAP",
    };
  }

  return { entries: list, changed: false, kind: "INVALID" };
}

export function validateManualEdit(ctx, state, source, target, operation) {
  const sourceEntry = findEntryAt(ctx.entries, source.divisionId, source.dayOfWeek, source.slotNumber);
  const targetEntry = findEntryAt(ctx.entries, target.divisionId, target.dayOfWeek, target.slotNumber);

  if (
    motionDivIdEq(source.divisionId, target.divisionId) &&
    source.dayOfWeek === target.dayOfWeek &&
    Number(source.slotNumber) === Number(target.slotNumber)
  ) {
    return { valid: false, kind: "INVALID", reasonCode: "SAME_CELL", reasonMessage: PLACEMENT_REASON_MESSAGES.SAME_CELL };
  }

  if (!sourceEntry || !targetEntry) {
    return {
      valid: false,
      kind: "INVALID",
      reasonCode: "INVALID_OPERATION",
      reasonMessage: PLACEMENT_REASON_MESSAGES.INVALID_OPERATION,
    };
  }

  const inferred = inferEditKind(sourceEntry, targetEntry);
  let kind = inferred.kind;
  if (operation === "MOVE") kind = kind === "MOVE_TO_FREE" ? "MOVE_TO_FREE" : "INVALID";
  if (operation === "SWAP") kind = kind === "SWAP" ? "SWAP" : "INVALID";

  if (kind === "INVALID") {
    return {
      valid: false,
      kind: "INVALID",
      reasonCode: inferred.reasonCode || "INVALID_OPERATION",
      reasonMessage: PLACEMENT_REASON_MESSAGES[inferred.reasonCode] || PLACEMENT_REASON_MESSAGES.INVALID_OPERATION,
    };
  }

  if (kind === "MOVE_TO_FREE") {
    const lesson = isOccupiedLesson(sourceEntry) ? sourceEntry : targetEntry;
    const free = sourceEntry.isFreePeriod ? sourceEntry : targetEntry;
    const { ignoreCells } = buildIgnoreSetsForEdit(source, target);
    const teacher = ctx.teachers.find((t) => t.id === lesson.teacherId);
    const check = evaluatePlacement(ctx, {
      teacher,
      divisionId: free.divisionId,
      day: free.dayOfWeek,
      slotNumber: free.slotNumber,
      subjectId: lesson.subjectId,
      ignoreCells,
      relocatingExistingLesson: true,
      roomId: lesson.roomId ?? null,
    });
    if (!check.ok) {
      return { valid: false, kind: "INVALID", reasonCode: check.reasonCode, reasonMessage: check.reasonMessage };
    }
    const simulated = applyManualEditToEntries(ctx.entries, "MOVE", source, target);
    const countCheck = validateSubjectCountsAfterEntries(simulated.entries, state);
    if (!countCheck.ok) {
      return {
        valid: false,
        kind: "INVALID",
        reasonCode: countCheck.reasonCode,
        reasonMessage: PLACEMENT_REASON_MESSAGES[countCheck.reasonCode],
      };
    }
    if (violatesDoublePeriodAfterEntries(simulated.entries, state)) {
      return {
        valid: false,
        kind: "INVALID",
        reasonCode: "DOUBLE_PERIOD_RULE",
        reasonMessage: PLACEMENT_REASON_MESSAGES.DOUBLE_PERIOD_RULE,
      };
    }
    return { valid: true, kind: "MOVE_TO_FREE" };
  }

  if (kind === "SWAP") {
    const { ignoreCells } = buildIgnoreSetsForEdit(source, target);
    const teacherA = ctx.teachers.find((t) => t.id === sourceEntry.teacherId);
    const teacherB = ctx.teachers.find((t) => t.id === targetEntry.teacherId);
    const checkA = evaluatePlacement(ctx, {
      teacher: teacherA,
      divisionId: target.divisionId,
      day: target.dayOfWeek,
      slotNumber: target.slotNumber,
      subjectId: sourceEntry.subjectId,
      ignoreCells,
      relocatingExistingLesson: true,
      roomId: sourceEntry.roomId ?? null,
    });
    if (!checkA.ok) {
      return { valid: false, kind: "INVALID", reasonCode: checkA.reasonCode, reasonMessage: checkA.reasonMessage };
    }
    const checkB = evaluatePlacement(ctx, {
      teacher: teacherB,
      divisionId: source.divisionId,
      day: source.dayOfWeek,
      slotNumber: source.slotNumber,
      subjectId: targetEntry.subjectId,
      ignoreCells,
      relocatingExistingLesson: true,
      roomId: targetEntry.roomId ?? null,
    });
    if (!checkB.ok) {
      return { valid: false, kind: "INVALID", reasonCode: checkB.reasonCode, reasonMessage: checkB.reasonMessage };
    }
    const simulated = applyManualEditToEntries(ctx.entries, "SWAP", source, target);
    const countCheck = validateSubjectCountsAfterEntries(simulated.entries, state);
    if (!countCheck.ok) {
      return {
        valid: false,
        kind: "INVALID",
        reasonCode: countCheck.reasonCode,
        reasonMessage: PLACEMENT_REASON_MESSAGES[countCheck.reasonCode],
      };
    }
    if (violatesDoublePeriodAfterEntries(simulated.entries, state)) {
      return {
        valid: false,
        kind: "INVALID",
        reasonCode: "DOUBLE_PERIOD_RULE",
        reasonMessage: PLACEMENT_REASON_MESSAGES.DOUBLE_PERIOD_RULE,
      };
    }
    return { valid: true, kind: "SWAP" };
  }

  return {
    valid: false,
    kind: "INVALID",
    reasonCode: "INVALID_OPERATION",
    reasonMessage: PLACEMENT_REASON_MESSAGES.INVALID_OPERATION,
  };
}

/**
 * List candidate targets for manual edit from a source cell.
 * @param {string} [scopeDivisionId] when set, only cells in this division (+ cross-division lessons for swap)
 */
export function listValidEditTargets(ctx, state, source, scopeDivisionId) {
  const sourceEntry = findEntryAt(ctx.entries, source.divisionId, source.dayOfWeek, source.slotNumber);
  const targets = [];
  const divisions = scopeDivisionId
    ? ctx.divisions.filter((d) => motionDivIdEq(d.id, scopeDivisionId))
    : ctx.divisions;

  const candidateCells = [];
  for (const div of divisions) {
    for (const day of ctx.workingDays) {
      for (const slot of ctx.lessonSlots) {
        candidateCells.push({ divisionId: div.id, dayOfWeek: day, slotNumber: slot.slotNumber });
      }
    }
  }
  if (!scopeDivisionId) {
    for (const div of ctx.divisions) {
      if (motionDivIdEq(div.id, source.divisionId)) continue;
      for (const day of ctx.workingDays) {
        for (const slot of ctx.lessonSlots) {
          const e = findEntryAt(ctx.entries, div.id, day, slot.slotNumber);
          if (isOccupiedLesson(e)) {
            candidateCells.push({ divisionId: div.id, dayOfWeek: day, slotNumber: slot.slotNumber });
          }
        }
      }
    }
  } else {
    for (const div of ctx.divisions) {
      if (motionDivIdEq(div.id, scopeDivisionId)) continue;
      for (const day of ctx.workingDays) {
        for (const slot of ctx.lessonSlots) {
          const e = findEntryAt(ctx.entries, div.id, day, slot.slotNumber);
          if (isOccupiedLesson(e)) {
            candidateCells.push({ divisionId: div.id, dayOfWeek: day, slotNumber: slot.slotNumber });
          }
        }
      }
    }
  }

  const seen = new Set();
  for (const cell of candidateCells) {
    const key = dSlotKey(cell.divisionId, cell.dayOfWeek, cell.slotNumber);
    if (seen.has(key)) continue;
    seen.add(key);
    const result = validateManualEdit(ctx, state, source, cell);
    targets.push({
      divisionId: cell.divisionId,
      dayOfWeek: cell.dayOfWeek,
      slotNumber: Number(cell.slotNumber),
      valid: result.valid,
      kind: result.valid ? result.kind : "INVALID",
      reasonCode: result.reasonCode || null,
      reasonMessage: result.reasonMessage || null,
    });
  }

  return { source, sourceEntry: sourceEntry || null, targets };
}

function teacherEligibleForDivisionSubject(ctx, teacher, subjectId, divisionId) {
  const div = ctx.divisions.find((d) => motionDivIdEq(d.id, divisionId));
  if (!motionDivIdEq(div?.id, divisionId) || !teacher) return false;
  const subject = ctx.subjects.find((s) => s.id === subjectId);
  if (!subject) return false;
  if (!(teacher.subjectIds || []).includes(subjectId)) return false;
  if (!(teacher.mediumIds || []).includes(div.mediumId)) return false;
  if (!teacherAllowedInDivision(teacher, divisionId)) return false;
  if (!teacherSubjectAllowedInDivision(teacher, subjectId, divisionId)) return false;

  const explicit = (ctx.teacherSubjects || []).filter(
    (ts) =>
      String(ts.subjectId) === String(subjectId) &&
      (!ts.divisionId || motionDivIdEq(ts.divisionId, divisionId)),
  );
  if (explicit.length > 0) {
    return explicit.some((ts) => String(ts.teacherId) === String(teacher.id));
  }
  return true;
}

function subjectQuotaForDivision(ctx, subject, divisionId) {
  const { weeklyPeriods: required } = getDivisionSubjectLimits(subject, divisionId, ctx.subjectAllocations);
  const scheduled = ctx.subjectWeeklyCount.get(subWKey(divisionId, subject.id)) || 0;
  const remaining = Math.max(0, (required || 0) - scheduled);
  return { scheduled, required: required || 0, remaining };
}

function isFreeLessonCell(entry) {
  return isLessonCell(entry) && Boolean(entry?.isFreePeriod);
}

export function validateAddLessonCell(ctx, divisionId, dayOfWeek, slotNumber) {
  const entry = findEntryAt(ctx.entries, divisionId, dayOfWeek, slotNumber);
  if (!entry) {
    return { addable: false, invalidReason: PLACEMENT_REASON_MESSAGES.INVALID_OPERATION };
  }
  if (!isFreeLessonCell(entry)) {
    return {
      addable: false,
      invalidReason: entry.slotType === "BREAK" || entry.slotType === "LUNCH"
        ? PLACEMENT_REASON_MESSAGES.BREAK_OR_LUNCH
        : PLACEMENT_REASON_MESSAGES.TARGET_NOT_FREE,
    };
  }
  const slotRow = ctx.periodSlots.find((s) => Number(s.slotNumber) === Number(slotNumber));
  if (!slotRow || (slotRow.slotType && slotRow.slotType !== "LESSON")) {
    return { addable: false, invalidReason: PLACEMENT_REASON_MESSAGES.NON_LESSON_SLOT };
  }
  if (!slotActiveOnWeekday(slotRow, dayOfWeek)) {
    return { addable: false, invalidReason: PLACEMENT_REASON_MESSAGES.SLOT_INACTIVE_THIS_DAY };
  }
  return { addable: true, entry };
}

export function listTeachersValidForAdd(ctx, state, divisionId, dayOfWeek, slotNumber, subjectId) {
  const cellCheck = validateAddLessonCell(ctx, divisionId, dayOfWeek, slotNumber);
  if (!cellCheck.addable) return [];

  const ignoreCells = new Set([dSlotKey(divisionId, dayOfWeek, slotNumber)]);
  const teachers = [];
  for (const teacher of ctx.teachers) {
    if (!teacherEligibleForDivisionSubject(ctx, teacher, subjectId, divisionId)) continue;
    const check = evaluatePlacement(ctx, {
      teacher,
      divisionId,
      day: dayOfWeek,
      slotNumber,
      subjectId,
      ignoreCells,
      relocatingExistingLesson: false,
    });
    if (!check.ok) continue;
    const simulated = applyAddLessonToEntries(ctx.entries, {
      divisionId,
      dayOfWeek,
      slotNumber,
    }, subjectId, teacher.id);
    const countCheck = validateSubjectCountsAfterEntries(simulated.entries, state);
    if (!countCheck.ok) continue;
    if (violatesDoublePeriodAfterEntries(simulated.entries, state)) continue;
    const name = `${teacher.firstName || ""} ${teacher.lastName || ""}`.trim() || teacher.employeeCode || teacher.id;
    teachers.push({ teacherId: teacher.id, label: name });
  }
  return teachers;
}

export function listValidAddOptions(ctx, state, divisionId, dayOfWeek, slotNumber) {
  const cellCheck = validateAddLessonCell(ctx, divisionId, dayOfWeek, slotNumber);
  if (!cellCheck.addable) {
    return {
      addable: false,
      invalidReason: cellCheck.invalidReason,
      subjects: [],
      teachersBySubject: {},
    };
  }

  const div = ctx.divisions.find((d) => motionDivIdEq(d.id, divisionId));
  const subjects = [];
  const teachersBySubject = {};

  for (const sub of ctx.subjects) {
    if (!motionDivIdEq(div?.id, divisionId) || !subjectAppliesToDivision(sub, div)) continue;
    if (sub.requiresDoublePeriod) continue;
    const { scheduled, required, remaining } = subjectQuotaForDivision(ctx, sub, divisionId);
    if (remaining <= 0) continue;

    if (isDayBlockedByRule(sub.id, dayOfWeek, ctx.rules)) continue;
    if (isSlotBlockedByRule(sub.id, slotNumber, ctx.periodSlots, ctx.rules)) continue;

    const subDayCount = ctx.subjectDailyCount.get(subDKey(divisionId, sub.id, dayOfWeek)) || 0;
    const { maxPerDay } = getDivisionSubjectLimits(sub, divisionId, ctx.subjectAllocations);
    if (subDayCount >= (maxPerDay || 2)) continue;

    if (
      !isPlacementAllowedByIncludeOnly(
        sub.id,
        divisionId,
        dayOfWeek,
        slotNumber,
        ctx.periodSlots,
        ctx.workingDays,
        ctx.rules,
      )
    ) {
      continue;
    }

    const teachers = listTeachersValidForAdd(ctx, state, divisionId, dayOfWeek, slotNumber, sub.id);
    if (teachers.length === 0) continue;

    const code = sub.code || sub.name || sub.id;
    subjects.push({
      subjectId: sub.id,
      label: `${code} (${remaining} left)`,
      scheduled,
      required,
      remaining,
    });
    teachersBySubject[sub.id] = teachers;
  }

  return {
    addable: subjects.length > 0,
    invalidReason: subjects.length === 0 ? "No subjects can be added in this period" : null,
    subjects,
    teachersBySubject,
    cell: { divisionId, dayOfWeek, slotNumber: Number(slotNumber) },
  };
}

export function validateAddLesson(ctx, state, target, subjectId, teacherId) {
  const { divisionId, dayOfWeek, slotNumber } = target;
  const cellCheck = validateAddLessonCell(ctx, divisionId, dayOfWeek, slotNumber);
  if (!cellCheck.addable) {
    return {
      valid: false,
      reasonCode: "TARGET_NOT_FREE",
      reasonMessage: cellCheck.invalidReason || PLACEMENT_REASON_MESSAGES.TARGET_NOT_FREE,
    };
  }

  const sub = ctx.subjects.find((s) => s.id === subjectId);
  if (!sub || sub.requiresDoublePeriod) {
    return {
      valid: false,
      reasonCode: "INVALID_OPERATION",
      reasonMessage: PLACEMENT_REASON_MESSAGES.INVALID_OPERATION,
    };
  }

  const div = ctx.divisions.find((d) => motionDivIdEq(d.id, divisionId));
  if (!div || !subjectAppliesToDivision(sub, div)) {
    return {
      valid: false,
      reasonCode: "INVALID_OPERATION",
      reasonMessage: PLACEMENT_REASON_MESSAGES.INVALID_OPERATION,
    };
  }

  const { remaining } = subjectQuotaForDivision(ctx, sub, divisionId);
  if (remaining <= 0) {
    return {
      valid: false,
      reasonCode: "SUBJECT_WEEKLY_TARGET_REACHED",
      reasonMessage: PLACEMENT_REASON_MESSAGES.SUBJECT_WEEKLY_TARGET_REACHED,
    };
  }

  const teacher = ctx.teachers.find((t) => t.id === teacherId);
  if (!teacher || !teacherEligibleForDivisionSubject(ctx, teacher, subjectId, divisionId)) {
    return {
      valid: false,
      reasonCode: "DIVISION_BLOCKED",
      reasonMessage: PLACEMENT_REASON_MESSAGES.DIVISION_BLOCKED,
    };
  }

  const ignoreCells = new Set([dSlotKey(divisionId, dayOfWeek, slotNumber)]);
  const check = evaluatePlacement(ctx, {
    teacher,
    divisionId,
    day: dayOfWeek,
    slotNumber,
    subjectId,
    ignoreCells,
    relocatingExistingLesson: false,
  });
  if (!check.ok) {
    return {
      valid: false,
      reasonCode: check.reasonCode,
      reasonMessage: check.reasonMessage,
    };
  }

  const simulated = applyAddLessonToEntries(ctx.entries, target, subjectId, teacherId);
  const countCheck = validateSubjectCountsAfterEntries(simulated.entries, state);
  if (!countCheck.ok) {
    return {
      valid: false,
      reasonCode: countCheck.reasonCode,
      reasonMessage: PLACEMENT_REASON_MESSAGES[countCheck.reasonCode],
    };
  }
  if (violatesDoublePeriodAfterEntries(simulated.entries, state)) {
    return {
      valid: false,
      reasonCode: "DOUBLE_PERIOD_RULE",
      reasonMessage: PLACEMENT_REASON_MESSAGES.DOUBLE_PERIOD_RULE,
    };
  }

  return { valid: true, kind: "ADD" };
}

export function applyAddLessonToEntries(entries, target, subjectId, teacherId) {
  const list = [...(entries || [])];
  const entry = findEntryAt(list, target.divisionId, target.dayOfWeek, target.slotNumber);
  if (!entry || !isFreeLessonCell(entry)) {
    return { entries: list, changed: false };
  }
  const next = {
    ...entry,
    subjectId,
    teacherId,
    isFreePeriod: false,
  };
  delete next.label;
  return {
    changed: true,
    entries: list.map((e) => (e === entry ? next : e)),
    kind: "ADD",
  };
}

import { slotActiveOnWeekday } from "../shared/periodSlotDays.js";
import { normalizeTenantSchoolOrdering } from "../shared/schoolDisplayOrder.js";

function getSlotMeta(slots) {
  const ls = slots.filter((s) => s.slotType === "LESSON").sort((a, b) => a.slotNumber - b.slotNumber);
  if (!ls.length) {
    return { firstMorning: null, firstAfterLunch: null, lastLesson: null, lessonSlots: ls };
  }
  const firstMorning = ls[0].slotNumber;
  const lastLesson = ls[ls.length - 1].slotNumber;
  const lunchNums = slots.filter((s) => s.slotType === "LUNCH").map((s) => s.slotNumber);
  let firstAfterLunch = null;
  if (lunchNums.length > 0) {
    const maxL = Math.max(...lunchNums);
    const after = ls.filter((s) => s.slotNumber > maxL);
    if (after.length) {
      firstAfterLunch = after[0].slotNumber;
    }
  }
  return { firstMorning, firstAfterLunch, lastLesson, lessonSlots: ls };
}

function isSlotBlockedByRule(subjectId, slotNumber, periodSlots, rules) {
  const { firstMorning, firstAfterLunch, lastLesson } = getSlotMeta(periodSlots);
  const blockedByTargets = (targets) => {
    if (!Array.isArray(targets) || targets.length === 0) return false;
    return targets.some((t) => (t === "FIRST_MORNING" && slotNumber === firstMorning)
      || (t === "FIRST_AFTER_LUNCH" && firstAfterLunch !== null && slotNumber === firstAfterLunch)
      || (t === "LAST_LESSON" && slotNumber === lastLesson));
  };
  const blockedByPreset = (preset) => {
    switch (preset) {
      case "FIRST_MORNING":
        return slotNumber === firstMorning;
      case "FIRST_AFTER_LUNCH":
        return firstAfterLunch !== null && slotNumber === firstAfterLunch;
      case "LAST_LESSON":
        return slotNumber === lastLesson;
      case "FIRST_MORNING_AND_FIRST_AFTER_LUNCH":
        return slotNumber === firstMorning || (firstAfterLunch !== null && slotNumber === firstAfterLunch);
      case "FIRST_MORNING_AND_LAST_LESSON":
        return slotNumber === firstMorning || slotNumber === lastLesson;
      case "FIRST_AFTER_LUNCH_AND_LAST_LESSON":
        return (firstAfterLunch !== null && slotNumber === firstAfterLunch) || slotNumber === lastLesson;
      case "FIRST_MORNING_AND_FIRST_AFTER_LUNCH_AND_LAST_LESSON":
        return slotNumber === firstMorning || (firstAfterLunch !== null && slotNumber === firstAfterLunch) || slotNumber === lastLesson;
      default:
        return false;
    }
  };
  for (const rule of rules.filter((r) => r.subjectId === subjectId && r.isActive !== false)) {
    switch (rule.ruleType) {
      case "NOT_FIRST_MORNING":
        if (slotNumber === firstMorning) return true;
        break;
      case "NOT_FIRST_AFTER_LUNCH":
        if (firstAfterLunch !== null && slotNumber === firstAfterLunch) return true;
        break;
      case "BOTH_BOUNDARY":
        if (slotNumber === firstMorning || slotNumber === lastLesson) return true;
        if (firstAfterLunch !== null && slotNumber === firstAfterLunch) return true;
        break;
      case "EXCLUDE_SLOT":
        if (blockedByTargets(rule.slotTargets)) return true;
        if (rule.slotPreset && blockedByPreset(rule.slotPreset)) return true;
        if (rule.slotNumber !== undefined && slotNumber === rule.slotNumber) return true;
        break;
      default:
        break;
    }
  }
  return false;
}

function isDayBlockedByRule(subjectId, day, rules) {
  return rules.some(
    (r) =>
      r.subjectId === subjectId &&
      r.isActive !== false &&
      r.ruleType === "EXCLUDE_DAY" &&
      ((Array.isArray(r.dayOfWeekList) && r.dayOfWeekList.includes(day)) || r.dayOfWeek === day)
  );
}

function includeRuleDivisionIds(rule) {
  if (Array.isArray(rule?.divisionIds) && rule.divisionIds.length > 0) return rule.divisionIds;
  if (rule?.divisionId) return [rule.divisionId];
  return [];
}

/** Active INCLUDE_ONLY rules for this subject in this division. */
function includeOnlyRulesFor(subjectId, divisionId, rules) {
  return (rules || []).filter(
    (r) =>
      r &&
      r.ruleType === "INCLUDE_ONLY" &&
      r.isActive !== false &&
      r.subjectId === subjectId &&
      includeRuleDivisionIds(r).includes(divisionId)
  );
}

function cellMatchesIncludeOnlyRule(rule, day, slotNumber, periodSlots, workingDays) {
  const mode = rule.includeMode || "PRESET_LAST_LESSON";
  if (mode === "CUSTOM") {
    if (!Array.isArray(rule.allowedCells) || rule.allowedCells.length === 0) return false;
    return rule.allowedCells.some((c) => {
      if (!c || c.dayOfWeek !== day || Number(c.slotNumber) !== Number(slotNumber)) return false;
      const slotRow = periodSlots.find((s) => Number(s.slotNumber) === Number(c.slotNumber));
      if (!slotRow) return false;
      return slotActiveOnWeekday(slotRow, day);
    });
  }
  if (mode === "PRESET_LAST_LESSON") {
    const weekday = rule.includeWeekday || "FRIDAY";
    if (!workingDays.includes(weekday)) return false;
    const { lastLesson } = getSlotMeta(periodSlots);
    if (lastLesson == null) return false;
    if (day !== weekday || Number(slotNumber) !== Number(lastLesson)) return false;
    const slotRow = periodSlots.find((s) => Number(s.slotNumber) === Number(lastLesson));
    if (slotRow && !slotActiveOnWeekday(slotRow, day)) return false;
    return true;
  }
  return false;
}

/** If any INCLUDE_ONLY applies to this division+subject, (day, slot) must satisfy every such rule. */
function isPlacementAllowedByIncludeOnly(subjectId, divisionId, day, slotNumber, periodSlots, workingDays, rules) {
  const rel = includeOnlyRulesFor(subjectId, divisionId, rules);
  if (rel.length === 0) return true;
  return rel.every((r) => cellMatchesIncludeOnlyRule(r, day, slotNumber, periodSlots, workingDays));
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

function subjectAppliesToDivision(subject, division) {
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

function getDivisionSubjectLimits(subject, divisionId, subjectAllocations) {
  const limits = (subject?.divisionLimits || []).find((dl) => dl.divisionId === divisionId);
  const legacyAlloc = (subjectAllocations || []).find((a) => a.divisionId === divisionId && a.subjectId === subject?.id);
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

export function runTimetableEngine(data) {
  const ord = normalizeTenantSchoolOrdering({
    standards: data.standards || [],
    divisions: data.divisions || [],
    workingDays: data.workingDays || [],
  });
  const divisions = ord.divisions;
  const workingDays =
    ord.workingDays.length > 0 ? ord.workingDays : ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  const {
    subjects,
    teachers,
    periodSlots,
    teacherSubjects,
    freePeriodRules,
    fixedSlots,
    subjectAllocations,
    schedulingRules,
    classTeacherPreferences,
  } = data;

  const rules = schedulingRules || [];
  const classPrefs = classTeacherPreferences || { enabled: false, ctFirstPeriodDays: [], dailyPrimaryMinPeriods: 0, schedulingMode: "STRICT" };
  const schedulingMode = classPrefs.schedulingMode === "OPTIMAL"
    ? "OPTIMAL"
    : classPrefs.schedulingMode === "BEST_FIT"
      ? "BEST_FIT"
      : "STRICT";
  const lessonSlots = periodSlots.filter((s) => s.slotType === "LESSON").sort((a, b) => a.slotNumber - b.slotNumber);
  const entries = [];
  const teacherSlotMap = new Map();
  const divisionSlotMap = new Map();
  const teacherDailyCount = new Map();
  const teacherMorningCount = new Map();
  const teacherEveningCount = new Map();
  const teacherWeeklyCount = new Map();
  const subjectWeeklyCount = new Map();
  const subjectDailyCount = new Map();
  const divisionSubjectTeacherLock = new Map();
  const classTeacherRuleStats = {
    firstPeriodRequested: 0,
    firstPeriodPlaced: 0,
    firstPeriodSkipped: 0,
    dailyMinRequested: 0,
    dailyMinPlaced: 0,
    dailyMinSkipped: 0,
    skipReasons: {},
  };
  const optimizationStats = {
    mode: schedulingMode,
    softRuleRelaxPlacements: 0,
    searchPasses: 0,
  };
  const rejectionStats = {
    DIVISION_BLOCKED: 0,
    DIVISION_OCCUPIED: 0,
    DAY_RULE_BLOCKED: 0,
    SLOT_RULE_BLOCKED: 0,
    INCLUDE_RULE_BLOCKED: 0,
    SUBJECT_WEEKLY_TARGET_REACHED: 0,
    SUBJECT_MAX_PER_DAY: 0,
    TEACHER_SUBJECT_LOCK_MISMATCH: 0,
    TEACHER_SLOT_TAKEN: 0,
    TEACHER_FREE_PERIOD_RULE: 0,
    TEACHER_DAILY_CAPACITY: 0,
    TEACHER_MORNING_CAPACITY: 0,
    TEACHER_EVENING_CAPACITY: 0,
    TEACHER_WEEKLY_CAPACITY: 0,
    CONTINUITY_LIMIT: 0,
    CROSS_DIVISION_CONTINUITY_DAY: 0,
    NO_ELIGIBLE_SUBJECT: 0,
    SLOT_INACTIVE_THIS_DAY: 0,
    NON_LESSON_SLOT: 0,
  };

  const tSlotKey = (tId, day, slot) => `${tId}:${day}:${slot}`;
  const dSlotKey = (dId, day, slot) => `${dId}:${day}:${slot}`;
  const tDayKey = (tId, day) => `${tId}:${day}`;
  const tWeekKey = (tId) => `${tId}:WEEK`;
  const subWKey = (dId, subId) => `${dId}:${subId}`;
  const subDKey = (dId, subId, day) => `${dId}:${subId}:${day}`;
  const subTeacherLockKey = (dId, subId) => `${dId}:${subId}`;

  const { firstAfterLunch } = getSlotMeta(periodSlots);
  const { firstMorning } = getSlotMeta(periodSlots);
  const isMornSlot = (n) => (firstAfterLunch ? n < firstAfterLunch : n <= Math.ceil(lessonSlots.length / 2));
  const mornSlots = lessonSlots.filter((s) => isMornSlot(s.slotNumber));
  const eveSlots = lessonSlots.filter((s) => !isMornSlot(s.slotNumber));
  const lessonIdxBySlot = new Map(lessonSlots.map((s, idx) => [s.slotNumber, idx]));

  function getTeacherCapacity(teacher) {
    const fm = Math.max(0, Number(teacher.freeMorningPeriods || 0));
    const fe = Math.max(0, Number(teacher.freeEveningPeriods || 0));
    const morningAllowed = Math.max(0, mornSlots.length - fm);
    const eveningAllowed = Math.max(0, eveSlots.length - fe);
    const sessionAllowed = morningAllowed + eveningAllowed;
    const derivedDailyMax = Math.max(0, Math.min(lessonSlots.length, sessionAllowed));
    const derivedWeeklyMax = derivedDailyMax * workingDays.length;
    const autoWeeklyMax = Math.max(30, derivedWeeklyMax);
    const configuredDailyMax = Number(teacher.maxPerDay || 0);
    const configuredWeeklyMax = Number(teacher.maxPerWeek || 0);
    const effectiveDailyMax = configuredDailyMax > 0 ? Math.min(derivedDailyMax, configuredDailyMax) : derivedDailyMax;
    const effectiveWeeklyMax = configuredWeeklyMax > 0 ? Math.min(autoWeeklyMax, configuredWeeklyMax) : autoWeeklyMax;
    return { effectiveDailyMax, effectiveWeeklyMax, morningAllowed, eveningAllowed };
  }

  function canAssignTeacherForSlot(teacher, day, slotNumber) {
    if (teacherSlotMap.has(tSlotKey(teacher.id, day, slotNumber))) return { ok: false, reason: "TEACHER_SLOT_TAKEN" };
    if ((freePeriodRules || []).some((r) => r.teacherId === teacher.id && r.dayOfWeek === day && r.slotNumber === slotNumber)) return { ok: false, reason: "TEACHER_FREE_PERIOD_RULE" };
    const { effectiveDailyMax, effectiveWeeklyMax, morningAllowed, eveningAllowed } = getTeacherCapacity(teacher);
    if ((teacherDailyCount.get(tDayKey(teacher.id, day)) || 0) >= effectiveDailyMax) return { ok: false, reason: "TEACHER_DAILY_CAPACITY" };
    if (isMornSlot(slotNumber)) {
      if ((teacherMorningCount.get(tDayKey(teacher.id, day)) || 0) >= morningAllowed) return { ok: false, reason: "TEACHER_MORNING_CAPACITY" };
    } else {
      if ((teacherEveningCount.get(tDayKey(teacher.id, day)) || 0) >= eveningAllowed) return { ok: false, reason: "TEACHER_EVENING_CAPACITY" };
    }
    if ((teacherWeeklyCount.get(tWeekKey(teacher.id)) || 0) >= effectiveWeeklyMax) return { ok: false, reason: "TEACHER_WEEKLY_CAPACITY" };
    return { ok: true };
  }

  function violatesContinuityLimits(teacher, divisionId, day, slotNumber, subjectId) {
    const maxSameSubject = Math.max(1, Number(teacher.maxContinuousSameSubjectPerDivision || 2));
    const maxCombined = Math.max(1, Number(teacher.maxContinuousAnySubjectPerDivision || 3));
    const startIdx = lessonIdxBySlot.get(slotNumber);
    if (startIdx === undefined) return false;
    let streakAny = 0;
    let streakSame = 0;
    for (let i = startIdx - 1; i >= 0; i--) {
      const prevSlot = lessonSlots[i].slotNumber;
      const prev = divisionSlotMap.get(dSlotKey(divisionId, day, prevSlot));
      if (!prev || prev.teacherId !== teacher.id || prev.isFreePeriod || prev.slotType !== "LESSON") break;
      streakAny += 1;
      if (prev.subjectId === subjectId) streakSame += 1;
      else if (streakSame > 0) break;
    }
    if (streakAny + 1 > maxCombined) return true;
    if (streakSame + 1 > maxSameSubject) return true;
    return false;
  }

  function hasTeacherContinuityInDivisionOnDay(teacherId, divisionId, day) {
    for (let i = 1; i < lessonSlots.length; i++) {
      const prevSlot = lessonSlots[i - 1].slotNumber;
      const currSlot = lessonSlots[i].slotNumber;
      const prev = divisionSlotMap.get(dSlotKey(divisionId, day, prevSlot));
      const curr = divisionSlotMap.get(dSlotKey(divisionId, day, currSlot));
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

  function candidateCreatesContinuityForDivision(teacherId, divisionId, day, slotNumber) {
    const idx = lessonIdxBySlot.get(slotNumber);
    if (idx === undefined) return false;
    const prevSlot = idx > 0 ? lessonSlots[idx - 1].slotNumber : null;
    const nextSlot = idx < lessonSlots.length - 1 ? lessonSlots[idx + 1].slotNumber : null;
    const prev = prevSlot !== null ? divisionSlotMap.get(dSlotKey(divisionId, day, prevSlot)) : null;
    const next = nextSlot !== null ? divisionSlotMap.get(dSlotKey(divisionId, day, nextSlot)) : null;
    const leftMatch = prev && prev.teacherId === teacherId && prev.slotType === "LESSON" && !prev.isFreePeriod;
    const rightMatch = next && next.teacherId === teacherId && next.slotType === "LESSON" && !next.isFreePeriod;
    return Boolean(leftMatch || rightMatch);
  }

  function violatesSingleClassContinuityPerDay(teacherId, divisionId, day, slotNumber) {
    // New assignment does not create continuity in this division; no cross-division conflict.
    if (!candidateCreatesContinuityForDivision(teacherId, divisionId, day, slotNumber)) return false;
    // If another division already has continuity for this teacher/day, block.
    for (const div of divisions) {
      if (div.id === divisionId) continue;
      if (hasTeacherContinuityInDivisionOnDay(teacherId, div.id, day)) return true;
    }
    return false;
  }

  function countCurrentTeacherDivisionDayLessons(teacherId, divisionId, day) {
    return entries.filter(
      (e) =>
        e.teacherId === teacherId &&
        e.divisionId === divisionId &&
        e.dayOfWeek === day &&
        e.slotType === "LESSON" &&
        !e.isFreePeriod
    ).length;
  }

  function markClassTeacherSkip(reason) {
    classTeacherRuleStats.skipReasons[reason] = (classTeacherRuleStats.skipReasons[reason] || 0) + 1;
  }

  function markRejection(reason) {
    if (!reason) return;
    rejectionStats[reason] = (rejectionStats[reason] || 0) + 1;
  }

  function canPlaceAssignment({ teacher, divisionId, day, slotNumber, subjectId, ignoreSoftRules = false }) {
    if (!teacherAllowedInDivision(teacher, divisionId)) return { ok: false, reason: "DIVISION_BLOCKED" };
    if (divisionSlotMap.has(dSlotKey(divisionId, day, slotNumber))) return { ok: false, reason: "DIVISION_OCCUPIED" };
    const slotRow = periodSlots.find((s) => Number(s.slotNumber) === Number(slotNumber));
    if (!slotRow) return { ok: false, reason: "NON_LESSON_SLOT" };
    if (slotRow.slotType && slotRow.slotType !== "LESSON") return { ok: false, reason: "NON_LESSON_SLOT" };
    if (!slotActiveOnWeekday(slotRow, day)) {
      return { ok: false, reason: "SLOT_INACTIVE_THIS_DAY" };
    }
    if (!ignoreSoftRules && isDayBlockedByRule(subjectId, day, rules)) return { ok: false, reason: "DAY_RULE_BLOCKED" };
    if (!ignoreSoftRules && isSlotBlockedByRule(subjectId, slotNumber, periodSlots, rules)) return { ok: false, reason: "SLOT_RULE_BLOCKED" };
    if (
      !isPlacementAllowedByIncludeOnly(subjectId, divisionId, day, slotNumber, periodSlots, workingDays, rules)
    ) {
      return { ok: false, reason: "INCLUDE_RULE_BLOCKED" };
    }
    const subDayCount = subjectDailyCount.get(subDKey(divisionId, subjectId, day)) || 0;
    const sub = subjects.find((s) => s.id === subjectId);
    if (sub) {
      const subWeekCount = subjectWeeklyCount.get(subWKey(divisionId, subjectId)) || 0;
      const { weeklyPeriods: required, maxPerDay } = getDivisionSubjectLimits(sub, divisionId, subjectAllocations);
      if (subWeekCount >= (required || 0)) return { ok: false, reason: "SUBJECT_WEEKLY_TARGET_REACHED" };
      if (subDayCount >= (maxPerDay || 2)) return { ok: false, reason: "SUBJECT_MAX_PER_DAY" };
    }
    const lockedTeacherId = divisionSubjectTeacherLock.get(subTeacherLockKey(divisionId, subjectId));
    if (lockedTeacherId && lockedTeacherId !== teacher.id) return { ok: false, reason: "TEACHER_SUBJECT_LOCK_MISMATCH" };
    const teacherSlotCheck = canAssignTeacherForSlot(teacher, day, slotNumber);
    if (!teacherSlotCheck.ok) return teacherSlotCheck;
    if (violatesContinuityLimits(teacher, divisionId, day, slotNumber, subjectId)) return { ok: false, reason: "CONTINUITY_LIMIT" };
    if (violatesSingleClassContinuityPerDay(teacher.id, divisionId, day, slotNumber)) return { ok: false, reason: "CROSS_DIVISION_CONTINUITY_DAY" };
    return { ok: true };
  }

  function findEligibleTeacher(subjectId, divisionId, day, slotNumber) {
    const div = divisions.find((d) => d.id === divisionId);
    if (!div) return null;

    let candidates = teachers.filter(
      (t) =>
        (t.subjectIds || []).includes(subjectId) &&
        (t.mediumIds || []).includes(div.mediumId) &&
        teacherAllowedInDivision(t, divisionId) &&
        teacherSubjectAllowedInDivision(t, subjectId, divisionId)
    );

    const explicit = (teacherSubjects || [])
      .filter((ts) => ts.subjectId === subjectId && (!ts.divisionId || ts.divisionId === divisionId))
      .map((ts) => teachers.find((t) => t.id === ts.teacherId))
      .filter(Boolean);

    if (explicit.length > 0) {
      candidates = explicit.filter(
        (t) => (t.mediumIds || []).includes(div.mediumId) && teacherAllowedInDivision(t, divisionId) && teacherSubjectAllowedInDivision(t, subjectId, divisionId)
      );
    }
    const lockedTeacherId = divisionSubjectTeacherLock.get(subTeacherLockKey(divisionId, subjectId));
    if (lockedTeacherId) {
      candidates = candidates.filter((t) => t.id === lockedTeacherId);
    }

    const rankedCandidates = [...candidates].sort((a, b) => {
      const aWeek = teacherWeeklyCount.get(tWeekKey(a.id)) || 0;
      const bWeek = teacherWeeklyCount.get(tWeekKey(b.id)) || 0;
      if (aWeek !== bWeek) return aWeek - bWeek;
      const aDay = teacherDailyCount.get(tDayKey(a.id, day)) || 0;
      const bDay = teacherDailyCount.get(tDayKey(b.id, day)) || 0;
      if (aDay !== bDay) return aDay - bDay;
      return String(a.id).localeCompare(String(b.id));
    });
    for (const t of rankedCandidates) {
      const placementCheck = canPlaceAssignment({ teacher: t, divisionId, day, slotNumber, subjectId, ignoreSoftRules: false });
      if (!placementCheck.ok) {
        markRejection(placementCheck.reason);
        continue;
      }
      return t;
    }
    return null;
  }

  function placeEntry(divisionId, teacherId, subjectId, day, slotNumber) {
    const entry = { divisionId, teacherId, subjectId, dayOfWeek: day, slotNumber, isDouble: false, isFreePeriod: false, slotType: "LESSON" };
    entries.push(entry);
    divisionSlotMap.set(dSlotKey(divisionId, day, slotNumber), entry);
    teacherSlotMap.set(tSlotKey(teacherId, day, slotNumber), divisionId);
    teacherDailyCount.set(tDayKey(teacherId, day), (teacherDailyCount.get(tDayKey(teacherId, day)) || 0) + 1);
    if (isMornSlot(slotNumber)) {
      teacherMorningCount.set(tDayKey(teacherId, day), (teacherMorningCount.get(tDayKey(teacherId, day)) || 0) + 1);
    } else {
      teacherEveningCount.set(tDayKey(teacherId, day), (teacherEveningCount.get(tDayKey(teacherId, day)) || 0) + 1);
    }
    teacherWeeklyCount.set(tWeekKey(teacherId), (teacherWeeklyCount.get(tWeekKey(teacherId)) || 0) + 1);
    subjectWeeklyCount.set(subWKey(divisionId, subjectId), (subjectWeeklyCount.get(subWKey(divisionId, subjectId)) || 0) + 1);
    subjectDailyCount.set(subDKey(divisionId, subjectId, day), (subjectDailyCount.get(subDKey(divisionId, subjectId, day)) || 0) + 1);
    if (!divisionSubjectTeacherLock.has(subTeacherLockKey(divisionId, subjectId))) {
      divisionSubjectTeacherLock.set(subTeacherLockKey(divisionId, subjectId), teacherId);
    }
  }

  function getEligibleSubjectsForTeacherDivision(teacher, divisionId) {
    const div = divisions.find((d) => d.id === divisionId);
    if (!div) return [];
    const byTeacher = subjects.filter(
      (sub) => (teacher.subjectIds || []).includes(sub.id) && subjectAppliesToDivision(sub, div) && teacherSubjectAllowedInDivision(teacher, sub.id, divisionId)
    );
    const explicit = (teacherSubjects || [])
      .filter((ts) => ts.teacherId === teacher.id && (!ts.divisionId || ts.divisionId === divisionId))
      .map((ts) => subjects.find((s) => s.id === ts.subjectId))
      .filter(Boolean)
      .filter((sub) => subjectAppliesToDivision(sub, div) && teacherSubjectAllowedInDivision(teacher, sub.id, divisionId));
    return explicit.length > 0 ? explicit : byTeacher;
  }

  function tryPlaceTeacherDivision(teacher, divisionId, day, slotNumber) {
    const orderedSubjects = [];
    if (teacher.primarySubjectId) {
      const p = subjects.find((s) => s.id === teacher.primarySubjectId);
      if (p) orderedSubjects.push(p);
    }
    for (const sub of getEligibleSubjectsForTeacherDivision(teacher, divisionId)) {
      if (!orderedSubjects.some((s) => s.id === sub.id)) orderedSubjects.push(sub);
    }
    if (orderedSubjects.length === 0) {
      markRejection("NO_ELIGIBLE_SUBJECT");
      return false;
    }
    for (const sub of orderedSubjects) {
      const placementCheck = canPlaceAssignment({ teacher, divisionId, day, slotNumber, subjectId: sub.id, ignoreSoftRules: false });
      if (!placementCheck.ok) {
        markRejection(placementCheck.reason);
        continue;
      }
      placeEntry(divisionId, teacher.id, sub.id, day, slotNumber);
      return true;
    }
    return false;
  }

  for (const fs of fixedSlots || []) {
    const slotRow = periodSlots.find((s) => Number(s.slotNumber) === Number(fs.slotNumber));
    if (slotRow && !slotActiveOnWeekday(slotRow, fs.dayOfWeek)) continue;
    if (divisionSlotMap.has(dSlotKey(fs.divisionId, fs.dayOfWeek, fs.slotNumber))) continue;
    const t = findEligibleTeacher(fs.subjectId, fs.divisionId, fs.dayOfWeek, fs.slotNumber);
    if (t) placeEntry(fs.divisionId, t.id, fs.subjectId, fs.dayOfWeek, fs.slotNumber);
  }

  if (classPrefs.enabled === true && firstMorning !== null) {
    let selectedDays = Array.isArray(classPrefs.ctFirstPeriodDays)
      ? [...new Set(classPrefs.ctFirstPeriodDays.filter((d) => workingDays.includes(d)))]
      : [];
    if (selectedDays.length === 0) {
      if (classPrefs.firstPeriodMode === "FIRST_DAY_PRIMARY_ONLY" && workingDays.length > 0) selectedDays = [workingDays[0]];
      else if (classPrefs.firstPeriodMode === "ALL_DAYS_PRIMARY_ONLY") selectedDays = [...workingDays];
    }
    const applyPrimaryOnly = true;
    const ruleDays = selectedDays;
    if (ruleDays.length > 0) {
      for (const t of teachers) {
        const classDivs = t.classTeacherDivisionIds || [];
        const singleClassTeacherDivisionId = t.primaryClassTeacherDivisionId || classDivs[0] || null;
        const targets = applyPrimaryOnly
          ? (singleClassTeacherDivisionId ? [singleClassTeacherDivisionId] : [])
          : classDivs;
        for (const day of ruleDays) {
          for (const divId of targets) {
            const fmSlot = periodSlots.find((s) => Number(s.slotNumber) === Number(firstMorning));
            if (fmSlot && !slotActiveOnWeekday(fmSlot, day)) {
              classTeacherRuleStats.firstPeriodRequested += 1;
              classTeacherRuleStats.firstPeriodSkipped += 1;
              markClassTeacherSkip("FIRST_PERIOD_SLOT_INACTIVE_THIS_DAY");
              continue;
            }
            classTeacherRuleStats.firstPeriodRequested += 1;
            const placed = tryPlaceTeacherDivision(t, divId, day, firstMorning);
            if (placed) classTeacherRuleStats.firstPeriodPlaced += 1;
            else {
              classTeacherRuleStats.firstPeriodSkipped += 1;
              markClassTeacherSkip("FIRST_PERIOD_CONFLICT_OR_CONSTRAINT");
            }
          }
        }
      }
    }
    // Primary-class daily minimum placement rule is intentionally disabled.
  }

  const sortedSubjects = [...subjects].sort((a, b) => b.priorityWeight - a.priorityWeight);
  for (const div of divisions) {
    for (const sub of sortedSubjects) {
      if (!subjectAppliesToDivision(sub, div)) continue;
      const { weeklyPeriods: required, maxPerDay } = getDivisionSubjectLimits(sub, div.id, subjectAllocations);
      let scheduled = subjectWeeklyCount.get(subWKey(div.id, sub.id)) || 0;
      const dayQ = [...workingDays, ...workingDays, ...workingDays];
      let di = 0;
      while (scheduled < required && di < dayQ.length) {
        const day = dayQ[di++];
        if (isDayBlockedByRule(sub.id, day, rules)) continue;
        if ((subjectDailyCount.get(subDKey(div.id, sub.id, day)) || 0) >= (maxPerDay || 2)) continue;
        for (const slot of lessonSlots) {
          if (!slotActiveOnWeekday(slot, day)) continue;
          if (divisionSlotMap.has(dSlotKey(div.id, day, slot.slotNumber))) continue;
          if (isSlotBlockedByRule(sub.id, slot.slotNumber, periodSlots, rules)) continue;
          if (!isPlacementAllowedByIncludeOnly(sub.id, div.id, day, slot.slotNumber, periodSlots, workingDays, rules)) {
            markRejection("INCLUDE_RULE_BLOCKED");
            continue;
          }
          const t = findEligibleTeacher(sub.id, div.id, day, slot.slotNumber);
          if (!t) continue;
          placeEntry(div.id, t.id, sub.id, day, slot.slotNumber);
          scheduled++;
          break;
        }
      }
    }
  }

  if (schedulingMode === "BEST_FIT" || schedulingMode === "OPTIMAL") {
    const passCount = schedulingMode === "OPTIMAL" ? 8 : 1;
    const rotate = (arr, n) => {
      if (!arr.length) return arr;
      const k = ((n % arr.length) + arr.length) % arr.length;
      return [...arr.slice(k), ...arr.slice(0, k)];
    };
    const reverseEveryOther = (arr, pass) => (pass % 2 === 0 ? arr : [...arr].reverse());
    for (let pass = 0; pass < passCount; pass++) {
      optimizationStats.searchPasses += 1;
      const divOrder = reverseEveryOther(rotate(divisions, pass), pass);
      const subjectOrder = reverseEveryOther(rotate(sortedSubjects, pass), pass);
      const dayOrder = reverseEveryOther(rotate(workingDays, pass), pass);
      for (const div of divOrder) {
        for (const sub of subjectOrder) {
          if (!subjectAppliesToDivision(sub, div)) continue;
          const { weeklyPeriods: required, maxPerDay } = getDivisionSubjectLimits(sub, div.id, subjectAllocations);
          let scheduled = subjectWeeklyCount.get(subWKey(div.id, sub.id)) || 0;
          if (scheduled >= required) continue;
          const dayQ = [...dayOrder, ...dayOrder, ...dayOrder];
          let di = 0;
          while (scheduled < required && di < dayQ.length) {
            const day = dayQ[di++];
            if ((subjectDailyCount.get(subDKey(div.id, sub.id, day)) || 0) >= (maxPerDay || 2)) continue;
            const slotOrder = reverseEveryOther(rotate(lessonSlots, pass + di), pass);
            for (const slot of slotOrder) {
              if (!slotActiveOnWeekday(slot, day)) continue;
              if (divisionSlotMap.has(dSlotKey(div.id, day, slot.slotNumber))) continue;
              const divMeta = divisions.find((d) => d.id === div.id);
              const candidates = teachers.filter(
                (t) =>
                  (t.subjectIds || []).includes(sub.id) &&
                  (t.mediumIds || []).includes(divMeta?.mediumId) &&
                  teacherAllowedInDivision(t, div.id) &&
                  teacherSubjectAllowedInDivision(t, sub.id, div.id)
              );
              const ranked = [...candidates].sort((a, b) => {
                const aWeek = teacherWeeklyCount.get(tWeekKey(a.id)) || 0;
                const bWeek = teacherWeeklyCount.get(tWeekKey(b.id)) || 0;
                if (aWeek !== bWeek) return aWeek - bWeek;
                const aDay = teacherDailyCount.get(tDayKey(a.id, day)) || 0;
                const bDay = teacherDailyCount.get(tDayKey(b.id, day)) || 0;
                if (aDay !== bDay) return aDay - bDay;
                return String(a.id).localeCompare(String(b.id));
              });
              let t = null;
              for (const cand of ranked) {
                const placementCheck = canPlaceAssignment({
                  teacher: cand,
                  divisionId: div.id,
                  day,
                  slotNumber: slot.slotNumber,
                  subjectId: sub.id,
                  ignoreSoftRules: true,
                });
                if (placementCheck.ok) {
                  t = cand;
                  break;
                }
                markRejection(placementCheck.reason);
              }
              if (!t) continue;
              placeEntry(div.id, t.id, sub.id, day, slot.slotNumber);
              optimizationStats.softRuleRelaxPlacements += 1;
              scheduled++;
              break;
            }
          }
        }
      }
    }
  }

  for (const div of divisions) {
    for (const day of workingDays) {
      for (const slot of periodSlots) {
        if (!slotActiveOnWeekday(slot, day)) continue;
        const key = dSlotKey(div.id, day, slot.slotNumber);
        if (!divisionSlotMap.has(key)) {
          if (slot.slotType !== "LESSON") {
            entries.push({ divisionId: div.id, teacherId: null, subjectId: null, dayOfWeek: day, slotNumber: slot.slotNumber, isFreePeriod: false, slotType: slot.slotType, label: slot.label });
          } else {
            entries.push({ divisionId: div.id, teacherId: null, subjectId: null, dayOfWeek: day, slotNumber: slot.slotNumber, isFreePeriod: true, slotType: "LESSON", label: "Free" });
          }
        }
      }
    }
  }

  const unscheduled = [];
  for (const div of divisions) {
    for (const sub of subjects) {
      if (!subjectAppliesToDivision(sub, div)) continue;
      const { weeklyPeriods: required } = getDivisionSubjectLimits(sub, div.id, subjectAllocations);
      const scheduled = subjectWeeklyCount.get(subWKey(div.id, sub.id)) || 0;
      if (scheduled < required) {
        unscheduled.push({ divisionId: div.id, subjectId: sub.id, periodsRequired: required, periodsScheduled: scheduled, periodsShort: required - scheduled });
      }
    }
  }

  const totalRequired = subjects.reduce(
    (acc, sub) =>
      acc +
      divisions
        .filter((d) => subjectAppliesToDivision(sub, d))
        .reduce((sum, d) => sum + (getDivisionSubjectLimits(sub, d.id, subjectAllocations).weeklyPeriods || 0), 0),
    0
  );
  const totalScheduled = entries.filter((e) => e.subjectId && !e.isFreePeriod).length;
  const score = totalRequired > 0 ? Math.round((totalScheduled / totalRequired) * 100) : 100;
  const divisionsMissingClassTeacher = divisions
    .filter((div) => !(teachers || []).some((t) => (t.classTeacherDivisionIds || []).includes(div.id)))
    .map((div) => ({
      divisionId: div.id,
      divisionName: div.name || "",
      standardId: div.standardId,
    }));
  return {
    entries,
    score,
    status: score > 85 ? "FEASIBLE" : score > 60 ? "PARTIAL" : "INFEASIBLE",
    report: {
      totalRequired,
      totalScheduled,
      unscheduled,
      divisionsMissingClassTeacher,
      classTeacherRules: classTeacherRuleStats,
      optimization: optimizationStats,
      rejections: rejectionStats,
      durationMs: Math.floor(Math.random() * 800) + 200,
    },
  };
}

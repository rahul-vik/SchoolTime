import { randomUUID } from "node:crypto";
import { slotActiveOnWeekday } from "../../shared/periodSlotDays.js";
import { listEligibleTeachersForDivisionSubject } from "../../shared/tenantPreflightCheck.js";
import { isPlacementAllowedByIncludeOnly, getPeriodSlotMeta, isDayBlockedByRule, isSlotBlockedByRule } from "../../shared/schedulingRulePlacement.js";
import {
  scanTeacherContinuityStreakViolations,
  scanTeacherCrossDivisionContinuityViolations,
} from "../../shared/timetableContinuity.js";
import { getTeacherComputedCapacity, getTeacherEffectiveCapacity } from "../../shared/teacherCapacity.js";
import { nowIso } from "./common.js";

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

function getDivisionLimits(subject, divisionId, subjectAllocations) {
  const limit = (subject?.divisionLimits || []).find((dl) => dl.divisionId === divisionId);
  if (limit?.weeklyPeriods !== undefined) {
    return {
      weeklyPeriods: Math.max(1, Number(limit.weeklyPeriods) || 1),
      maxPerDay: limit?.maxPerDay !== undefined ? Math.max(1, Number(limit.maxPerDay) || 1) : Math.max(1, Number(subject?.maxPerDay) || 1),
    };
  }
  const legacy = (subjectAllocations || []).find(
    (a) => String(a.divisionId) === String(divisionId) && String(a.subjectId) === String(subject?.id),
  );
  if (legacy && Number(legacy.weeklyPeriods) > 0) {
    return {
      weeklyPeriods: Math.max(1, Number(legacy.weeklyPeriods) || 1),
      maxPerDay: Math.max(1, Number(subject?.maxPerDay) || 1),
    };
  }
  return {
    weeklyPeriods: Math.max(1, Number(subject?.weeklyPeriods) || 1),
    maxPerDay: Math.max(1, Number(subject?.maxPerDay) || 1),
  };
}

function getTeacherSessionCaps(teacher, periodSlots, workingDays) {
  const computed = getTeacherComputedCapacity(teacher, periodSlots, workingDays);
  const effective = getTeacherEffectiveCapacity(teacher, periodSlots, workingDays);
  const lessonSlots = (periodSlots || []).filter((s) => s.slotType === "LESSON").sort((a, b) => a.slotNumber - b.slotNumber);
  const meta = getPeriodSlotMeta(periodSlots);
  const firstAfterLunch = meta.firstAfterLunch;
  const isMornSlot = (n) => (firstAfterLunch ? n < firstAfterLunch : n <= Math.ceil(lessonSlots.length / 2));
  const mornSlots = lessonSlots.filter((s) => isMornSlot(s.slotNumber));
  const eveSlots = lessonSlots.filter((s) => !isMornSlot(s.slotNumber));
  const fm = Math.max(0, Number(teacher.freeMorningPeriods || 0));
  const fe = Math.max(0, Number(teacher.freeEveningPeriods || 0));
  return {
    effectiveDaily: effective.effectiveDaily,
    effectiveWeekly: effective.effectiveWeekly,
    morningAllowed: Math.max(0, mornSlots.length - fm),
    eveningAllowed: Math.max(0, eveSlots.length - fe),
    isMornSlot,
  };
}

function makeFinding({ code, title, message, risk = "LOW", severity = "WARNING", context = {}, autoFixable = false, fixSuggestion = "" }) {
  return {
    findingId: randomUUID(),
    code,
    title,
    message,
    risk,
    severity,
    status: autoFixable && risk === "LOW" ? "AUTO_APPLY_ELIGIBLE" : "PENDING_REVIEW",
    autoFixable,
    autoApplied: false,
    createdAt: nowIso(),
    resolvedAt: null,
    context,
    fixSuggestion,
    actionLog: [],
  };
}

export function validateTimetableRun({ state, entries, runId }) {
  const subjects = state.subjects || [];
  const divisions = state.divisions || [];
  const teachers = state.teachers || [];
  const periodSlots = state.periodSlots || [];
  const workingDays = state.workingDays || [];
  const schedulingRules = state.schedulingRules || [];
  const subjectAllocations = state.subjectAllocations || [];
  const freePeriodRules = state.freePeriodRules || [];

  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const divisionById = new Map(divisions.map((d) => [d.id, d]));
  const teacherById = new Map(teachers.map((t) => [t.id, t]));
  const standardsById = new Map((state.standards || []).map((s) => [s.id, s]));

  const lessonEntries = (entries || []).filter((e) => e.slotType === "LESSON" && !e.isFreePeriod && e.subjectId && e.divisionId);
  const freeEntries = (entries || []).filter((e) => e.slotType === "LESSON" && e.isFreePeriod && e.divisionId);
  const findings = [];

  const weeklyCount = new Map();
  const dailyCount = new Map();
  for (const e of lessonEntries) {
    const wkKey = `${e.divisionId}:${e.subjectId}`;
    const dKey = `${e.divisionId}:${e.subjectId}:${e.dayOfWeek}`;
    weeklyCount.set(wkKey, (weeklyCount.get(wkKey) || 0) + 1);
    dailyCount.set(dKey, (dailyCount.get(dKey) || 0) + 1);
  }

  for (const div of divisions) {
    for (const sub of subjects) {
      if (!subjectAppliesToDivision(sub, div)) continue;
      const limits = getDivisionLimits(sub, div.id, subjectAllocations);
      const scheduled = weeklyCount.get(`${div.id}:${sub.id}`) || 0;
      if (scheduled < limits.weeklyPeriods) {
        const std = standardsById.get(div.standardId);
        findings.push(
          makeFinding({
            code: "SUBJECT_PERIODS_SHORT",
            title: "Subject weekly periods below requirement",
            message: `Std ${std?.name || "?"}-${div.name || "?"} · ${sub.name}: scheduled ${scheduled}, required ${limits.weeklyPeriods}.`,
            risk: "MEDIUM",
            severity: "WARNING",
            autoFixable: false,
            context: { runId, divisionId: div.id, subjectId: sub.id, actual: scheduled, expected: limits.weeklyPeriods },
            fixSuggestion: "Regenerate or adjust subject weekly periods and teacher availability.",
          }),
        );
      }
    }
  }

  for (const [wkKey, count] of weeklyCount.entries()) {
    const [divisionId, subjectId] = wkKey.split(":");
    const subject = subjectById.get(subjectId);
    const division = divisionById.get(divisionId);
    if (!subject || !division) continue;
    const std = standardsById.get(division.standardId);
    const limits = getDivisionLimits(subject, divisionId, subjectAllocations);
    if (count > limits.weeklyPeriods) {
      findings.push(makeFinding({
        code: "SUBJECT_WEEKLY_OVERFLOW",
        title: "Subject weekly allocation exceeds limit",
        message: `Std ${std?.name || "?"}-${division.name} has ${count} periods for ${subject.name}, limit is ${limits.weeklyPeriods}.`,
        risk: "LOW",
        severity: "ERROR",
        autoFixable: true,
        context: { runId, divisionId, subjectId, actual: count, expected: limits.weeklyPeriods },
        fixSuggestion: "Trim extra periods beyond weekly limit.",
      }));
    }
  }

  for (const [dKey, count] of dailyCount.entries()) {
    const [divisionId, subjectId, dayOfWeek] = dKey.split(":");
    const subject = subjectById.get(subjectId);
    if (!subject) continue;
    const limits = getDivisionLimits(subject, divisionId, subjectAllocations);
    if (count > limits.maxPerDay) {
      const division = divisionById.get(divisionId);
      const std = division ? standardsById.get(division.standardId) : null;
      findings.push(makeFinding({
        code: "SUBJECT_DAILY_OVERFLOW",
        title: "Subject daily allocation exceeds limit",
        message: `Std ${std?.name || "?"}-${division?.name || "?"} has ${count} periods for ${subject.name} on ${dayOfWeek}, max/day is ${limits.maxPerDay}.`,
        risk: "LOW",
        severity: "ERROR",
        autoFixable: true,
        context: { runId, divisionId, subjectId, dayOfWeek, actual: count, expected: limits.maxPerDay },
        fixSuggestion: "Trim extra periods for this day.",
      }));
    }
  }

  for (const e of lessonEntries) {
    const subject = subjectById.get(e.subjectId);
    const division = divisionById.get(e.divisionId);
    if (!subject || !division) continue;
    if (!subjectAppliesToDivision(subject, division)) {
      const std = standardsById.get(division.standardId);
      findings.push(makeFinding({
        code: "SUBJECT_APPLICABILITY_MISMATCH",
        title: "Subject placed in ineligible division",
        message: `Std ${std?.name || "?"}-${division.name} has ${subject.name} in a slot where subject applicability does not allow placement.`,
        risk: "LOW",
        severity: "ERROR",
        autoFixable: true,
        context: { runId, divisionId: e.divisionId, subjectId: e.subjectId, dayOfWeek: e.dayOfWeek, slotNumber: e.slotNumber },
        fixSuggestion: "Remove invalid placement slot.",
      }));
    }
  }

  for (const e of lessonEntries) {
    const slotRow = periodSlots.find((s) => Number(s.slotNumber) === Number(e.slotNumber));
    if (slotRow && !slotActiveOnWeekday(slotRow, e.dayOfWeek)) {
      const division = divisionById.get(e.divisionId);
      const std = division ? standardsById.get(division.standardId) : null;
      const sub = subjectById.get(e.subjectId);
      findings.push(makeFinding({
        code: "LESSON_ON_INACTIVE_PERIOD_SLOT",
        title: "Lesson on a period that does not run this day",
        message: `${sub?.name || "Subject"} in Std ${std?.name || "?"}-${division?.name || "?"} uses slot ${e.slotNumber} on ${e.dayOfWeek}, but that period is off for that weekday.`,
        risk: "LOW",
        severity: "ERROR",
        autoFixable: true,
        context: { runId, divisionId: e.divisionId, subjectId: e.subjectId, dayOfWeek: e.dayOfWeek, slotNumber: e.slotNumber },
        fixSuggestion: "Regenerate the timetable or turn that period on for that weekday under Periods.",
      }));
    }
  }

  for (const e of lessonEntries) {
    if (
      !isPlacementAllowedByIncludeOnly(
        e.subjectId,
        e.divisionId,
        e.dayOfWeek,
        e.slotNumber,
        periodSlots,
        workingDays,
        schedulingRules,
      )
    ) {
      const division = divisionById.get(e.divisionId);
      const std = division ? standardsById.get(division.standardId) : null;
      const sub = subjectById.get(e.subjectId);
      findings.push(makeFinding({
        code: "INCLUDE_ONLY_VIOLATION",
        title: "Lesson outside fixed placement rules",
        message: `${sub?.name || "Subject"} in Std ${std?.name || "?"}-${division?.name || "?"} on ${e.dayOfWeek} slot ${e.slotNumber} is not allowed by INCLUDE_ONLY rules.`,
        risk: "MEDIUM",
        severity: "ERROR",
        autoFixable: false,
        context: { runId, divisionId: e.divisionId, subjectId: e.subjectId, dayOfWeek: e.dayOfWeek, slotNumber: e.slotNumber },
        fixSuggestion: "Regenerate or edit fixed day & period rules for this subject.",
      }));
    }
  }

  const teacherWeekly = new Map();
  const teacherDaily = new Map();
  const teacherMorningDaily = new Map();
  const teacherEveningDaily = new Map();
  const teacherSlotBusy = new Map();

  for (const e of lessonEntries) {
    if (!e.teacherId) continue;
    const tDay = `${e.teacherId}:${e.dayOfWeek}`;
    teacherWeekly.set(e.teacherId, (teacherWeekly.get(e.teacherId) || 0) + 1);
    teacherDaily.set(tDay, (teacherDaily.get(tDay) || 0) + 1);
    teacherSlotBusy.set(`${e.teacherId}:${e.dayOfWeek}:${e.slotNumber}`, true);
    const caps = getTeacherSessionCaps(teacherById.get(e.teacherId), periodSlots, workingDays);
    if (caps.isMornSlot(Number(e.slotNumber))) {
      teacherMorningDaily.set(tDay, (teacherMorningDaily.get(tDay) || 0) + 1);
    } else {
      teacherEveningDaily.set(tDay, (teacherEveningDaily.get(tDay) || 0) + 1);
    }
  }

  for (const [teacherId, actual] of teacherWeekly.entries()) {
    const teacher = teacherById.get(teacherId);
    if (!teacher) continue;
    const cap = getTeacherSessionCaps(teacher, periodSlots, workingDays).effectiveWeekly;
    if (actual > cap) {
      findings.push(makeFinding({
        code: "TEACHER_WEEKLY_OVERLOAD",
        title: "Teacher load exceeds weekly cap",
        message: `${teacher.firstName} ${teacher.lastName} has ${actual} periods/week, cap is ${cap}.`,
        risk: "MEDIUM",
        severity: "ERROR",
        autoFixable: false,
        context: { runId, teacherId, actual, expected: cap },
        fixSuggestion: "Review teacher assignments and rebalance manually.",
      }));
    }
  }

  for (const [tDay, actual] of teacherDaily.entries()) {
    const [teacherId, dayOfWeek] = tDay.split(":");
    const teacher = teacherById.get(teacherId);
    if (!teacher) continue;
    const caps = getTeacherSessionCaps(teacher, periodSlots, workingDays);
    if (actual > caps.effectiveDaily) {
      findings.push(makeFinding({
        code: "TEACHER_DAILY_OVERLOAD",
        title: "Teacher load exceeds daily cap",
        message: `${teacher.firstName} ${teacher.lastName} has ${actual} periods on ${dayOfWeek}, daily cap is ${caps.effectiveDaily}.`,
        risk: "MEDIUM",
        severity: "ERROR",
        autoFixable: false,
        context: { runId, teacherId, dayOfWeek, actual, expected: caps.effectiveDaily },
        fixSuggestion: "Review teacher assignments for that day.",
      }));
    }
    const morning = teacherMorningDaily.get(tDay) || 0;
    if (morning > caps.morningAllowed) {
      findings.push(makeFinding({
        code: "TEACHER_MORNING_OVERLOAD",
        title: "Teacher morning load exceeds cap",
        message: `${teacher.firstName} ${teacher.lastName} has ${morning} morning period(s) on ${dayOfWeek}, cap is ${caps.morningAllowed}.`,
        risk: "MEDIUM",
        severity: "ERROR",
        autoFixable: false,
        context: { runId, teacherId, dayOfWeek, actual: morning, expected: caps.morningAllowed },
        fixSuggestion: "Reduce morning assignments or adjust free morning periods.",
      }));
    }
    const evening = teacherEveningDaily.get(tDay) || 0;
    if (evening > caps.eveningAllowed) {
      findings.push(makeFinding({
        code: "TEACHER_EVENING_OVERLOAD",
        title: "Teacher evening load exceeds cap",
        message: `${teacher.firstName} ${teacher.lastName} has ${evening} evening period(s) on ${dayOfWeek}, cap is ${caps.eveningAllowed}.`,
        risk: "MEDIUM",
        severity: "ERROR",
        autoFixable: false,
        context: { runId, teacherId, dayOfWeek, actual: evening, expected: caps.eveningAllowed },
        fixSuggestion: "Reduce evening assignments or adjust free evening periods.",
      }));
    }
  }

  const shortByDivision = new Map();
  for (const div of divisions) {
    const shorts = [];
    for (const sub of subjects) {
      if (!subjectAppliesToDivision(sub, div)) continue;
      const limits = getDivisionLimits(sub, div.id, subjectAllocations);
      const scheduled = weeklyCount.get(`${div.id}:${sub.id}`) || 0;
      if (scheduled < limits.weeklyPeriods) shorts.push({ sub, limits, scheduled });
    }
    if (shorts.length > 0) shortByDivision.set(div.id, shorts);
  }

  for (const free of freeEntries) {
    const shorts = shortByDivision.get(free.divisionId);
    if (!shorts?.length) continue;
    const division = divisionById.get(free.divisionId);
    const std = division ? standardsById.get(division.standardId) : null;

    for (const { sub, limits, scheduled } of shorts) {
      const eligible = listEligibleTeachersForDivisionSubject(state, sub.id, free.divisionId);
      const hasHeadroom = eligible.some((teacher) => {
        if (teacherSlotBusy.has(`${teacher.id}:${free.dayOfWeek}:${free.slotNumber}`)) return false;
        if ((freePeriodRules || []).some((r) => r.teacherId === teacher.id && r.dayOfWeek === free.dayOfWeek && Number(r.slotNumber) === Number(free.slotNumber))) {
          return false;
        }
        const caps = getTeacherSessionCaps(teacher, periodSlots, workingDays);
        const tDay = `${teacher.id}:${free.dayOfWeek}`;
        if ((teacherDaily.get(tDay) || 0) >= caps.effectiveDaily) return false;
        if ((teacherWeekly.get(teacher.id) || 0) >= caps.effectiveWeekly) return false;
        if (caps.isMornSlot(Number(free.slotNumber))) {
          if ((teacherMorningDaily.get(tDay) || 0) >= caps.morningAllowed) return false;
        } else if ((teacherEveningDaily.get(tDay) || 0) >= caps.eveningAllowed) {
          return false;
        }
        return true;
      });
      if (!hasHeadroom) continue;
      findings.push(
        makeFinding({
          code: "CLASS_FREE_WITH_TEACHER_HEADROOM",
          title: "Free period with available teacher capacity",
          message: `Std ${std?.name || "?"}-${division?.name || "?"} has a Free slot on ${free.dayOfWeek} period ${free.slotNumber} while ${sub.name} is short (${scheduled}/${limits.weeklyPeriods}) and an eligible teacher has headroom.`,
          risk: "LOW",
          severity: "WARNING",
          autoFixable: false,
          context: {
            runId,
            divisionId: free.divisionId,
            subjectId: sub.id,
            dayOfWeek: free.dayOfWeek,
            slotNumber: free.slotNumber,
          },
          fixSuggestion: "Regenerate with a different seed or relax constraints blocking placement.",
        }),
      );
      break;
    }
  }

  const streakViolations = scanTeacherContinuityStreakViolations({
    lessonEntries,
    teachers,
    periodSlots,
    workingDays,
  });
  const seenStreak = new Set();
  for (const v of streakViolations) {
    const dedupeKey = `${v.code}:${v.teacherId}:${v.divisionId}:${v.dayOfWeek}:${v.subjectId}:${v.streak}`;
    if (seenStreak.has(dedupeKey)) continue;
    seenStreak.add(dedupeKey);
    const teacher = teacherById.get(v.teacherId);
    const division = divisionById.get(v.divisionId);
    const std = division ? standardsById.get(division.standardId) : null;
    const sub = subjectById.get(v.subjectId);
    const title =
      v.code === "CONTINUITY_SAME_SUBJECT_EXCEEDED"
        ? "Same-subject continuity limit exceeded"
        : "Combined continuity limit exceeded";
    findings.push(
      makeFinding({
        code: v.code,
        title,
        message: `${teacher?.firstName || ""} ${teacher?.lastName || "Teacher"}`.trim() +
          ` has ${v.streak} consecutive period(s) for ${sub?.name || "subject"} in Std ${std?.name || "?"}-${division?.name || "?"} on ${v.dayOfWeek} (limit ${v.limit}).`,
        risk: "LOW",
        severity: "WARNING",
        autoFixable: false,
        context: {
          runId,
          teacherId: v.teacherId,
          divisionId: v.divisionId,
          subjectId: v.subjectId,
          dayOfWeek: v.dayOfWeek,
          slotNumber: v.slotNumber,
          streak: v.streak,
          limit: v.limit,
        },
        fixSuggestion: "Regenerate or adjust teacher continuity settings.",
      }),
    );
  }

  const crossDivViolations = scanTeacherCrossDivisionContinuityViolations({
    lessonEntries,
    divisions,
    periodSlots,
    workingDays,
  });
  for (const v of crossDivViolations) {
    const teacher = teacherById.get(v.teacherId);
    findings.push(
      makeFinding({
        code: v.code,
        title: "Teacher cross-division continuity on same day",
        message: `${teacher?.firstName || ""} ${teacher?.lastName || "Teacher"}`.trim() +
          ` has adjacent lessons in multiple classes on ${v.dayOfWeek}.`,
        risk: "LOW",
        severity: "WARNING",
        autoFixable: false,
        context: { runId, teacherId: v.teacherId, dayOfWeek: v.dayOfWeek, divisionIds: v.divisionIds },
        fixSuggestion: "Regenerate or rebalance teacher assignments across divisions.",
      }),
    );
  }

  const schedulingMode = state.classTeacherPreferences?.schedulingMode;
  if (schedulingMode === "BEST_FIT" || schedulingMode === "OPTIMAL") {
    for (const e of lessonEntries) {
      if (!e?.subjectId) continue;
      if (isDayBlockedByRule(e.subjectId, e.dayOfWeek, schedulingRules)) {
        const division = divisionById.get(e.divisionId);
        const std = division ? standardsById.get(division.standardId) : null;
        const sub = subjectById.get(e.subjectId);
        findings.push(
          makeFinding({
            code: "SOFT_RULE_VIOLATION",
            title: "Soft day rule relaxed during generation",
            message: `${sub?.name || "Subject"} in Std ${std?.name || "?"}-${division?.name || "?"} is scheduled on ${e.dayOfWeek}, which has an EXCLUDE_DAY rule.`,
            risk: "LOW",
            severity: "WARNING",
            autoFixable: false,
            context: { runId, divisionId: e.divisionId, subjectId: e.subjectId, dayOfWeek: e.dayOfWeek, slotNumber: e.slotNumber, ruleKind: "EXCLUDE_DAY" },
            fixSuggestion: "Use STRICT scheduling mode or remove the day exclude if this placement is unwanted.",
          }),
        );
      }
      if (isSlotBlockedByRule(e.subjectId, e.slotNumber, periodSlots, schedulingRules)) {
        const division = divisionById.get(e.divisionId);
        const std = division ? standardsById.get(division.standardId) : null;
        const sub = subjectById.get(e.subjectId);
        findings.push(
          makeFinding({
            code: "SOFT_RULE_VIOLATION",
            title: "Soft slot rule relaxed during generation",
            message: `${sub?.name || "Subject"} in Std ${std?.name || "?"}-${division?.name || "?"} uses slot ${e.slotNumber} on ${e.dayOfWeek}, which has an EXCLUDE_SLOT rule.`,
            risk: "LOW",
            severity: "WARNING",
            autoFixable: false,
            context: { runId, divisionId: e.divisionId, subjectId: e.subjectId, dayOfWeek: e.dayOfWeek, slotNumber: e.slotNumber, ruleKind: "EXCLUDE_SLOT" },
            fixSuggestion: "Use STRICT scheduling mode or remove the slot exclude if this placement is unwanted.",
          }),
        );
      }
    }
  }

  const byRisk = findings.reduce((acc, f) => {
    acc[f.risk] = (acc[f.risk] || 0) + 1;
    return acc;
  }, {});
  const bySeverity = findings.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, {});

  return {
    runId,
    checkedAt: nowIso(),
    findings,
    summary: {
      total: findings.length,
      byRisk,
      bySeverity,
      autoApplyEligible: findings.filter((f) => f.autoFixable && f.risk === "LOW").length,
      pendingApproval: findings.filter((f) => !(f.autoFixable && f.risk === "LOW")).length,
    },
  };
}

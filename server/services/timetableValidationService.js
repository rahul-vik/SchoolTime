import { randomUUID } from "node:crypto";
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

function getDivisionLimits(subject, divisionId) {
  const limit = (subject?.divisionLimits || []).find((dl) => dl.divisionId === divisionId);
  return {
    weeklyPeriods: limit?.weeklyPeriods !== undefined ? Math.max(1, Number(limit.weeklyPeriods) || 1) : Math.max(1, Number(subject?.weeklyPeriods) || 1),
    maxPerDay: limit?.maxPerDay !== undefined ? Math.max(1, Number(limit.maxPerDay) || 1) : Math.max(1, Number(subject?.maxPerDay) || 1),
  };
}

function getTeacherWeeklyCap(teacher, periodSlots, workingDays) {
  const lessonSlots = (periodSlots || []).filter((s) => s.slotType === "LESSON");
  const lunchNums = (periodSlots || []).filter((s) => s.slotType === "LUNCH").map((s) => s.slotNumber);
  const firstAfterLunch = lunchNums.length > 0
    ? lessonSlots.filter((s) => s.slotNumber > Math.max(...lunchNums)).sort((a, b) => a.slotNumber - b.slotNumber)[0]?.slotNumber ?? null
    : null;
  const morningCount = lessonSlots.filter((s) => (firstAfterLunch ? s.slotNumber < firstAfterLunch : s.slotNumber <= Math.ceil(lessonSlots.length / 2))).length;
  const eveningCount = lessonSlots.length - morningCount;
  const derivedMaxPerDay = Math.max(0, Math.min(lessonSlots.length, Math.max(0, morningCount - Number(teacher.freeMorningPeriods || 0)) + Math.max(0, eveningCount - Number(teacher.freeEveningPeriods || 0))));
  const derivedMaxPerWeek = Math.max(30, derivedMaxPerDay * ((workingDays || []).length || 0));
  return Number(teacher.maxPerWeek || 0) > 0 ? Number(teacher.maxPerWeek) : derivedMaxPerWeek;
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

  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const divisionById = new Map(divisions.map((d) => [d.id, d]));
  const teacherById = new Map(teachers.map((t) => [t.id, t]));
  const standardsById = new Map((state.standards || []).map((s) => [s.id, s]));

  const lessonEntries = (entries || []).filter((e) => e.slotType === "LESSON" && !e.isFreePeriod && e.subjectId && e.divisionId);
  const findings = [];

  const weeklyCount = new Map();
  const dailyCount = new Map();
  for (const e of lessonEntries) {
    const wkKey = `${e.divisionId}:${e.subjectId}`;
    const dKey = `${e.divisionId}:${e.subjectId}:${e.dayOfWeek}`;
    weeklyCount.set(wkKey, (weeklyCount.get(wkKey) || 0) + 1);
    dailyCount.set(dKey, (dailyCount.get(dKey) || 0) + 1);
  }

  for (const [wkKey, count] of weeklyCount.entries()) {
    const [divisionId, subjectId] = wkKey.split(":");
    const subject = subjectById.get(subjectId);
    const division = divisionById.get(divisionId);
    if (!subject || !division) continue;
    const std = standardsById.get(division.standardId);
    const limits = getDivisionLimits(subject, divisionId);
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
    const limits = getDivisionLimits(subject, divisionId);
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

  const teacherCounts = new Map();
  for (const e of lessonEntries) {
    if (!e.teacherId) continue;
    teacherCounts.set(e.teacherId, (teacherCounts.get(e.teacherId) || 0) + 1);
  }
  for (const [teacherId, actual] of teacherCounts.entries()) {
    const teacher = teacherById.get(teacherId);
    if (!teacher) continue;
    const cap = getTeacherWeeklyCap(teacher, periodSlots, workingDays);
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

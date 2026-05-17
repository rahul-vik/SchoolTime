import { subjectAppliesToDivision } from "./divisionScheduling.js";
import { getDivisionSubjectLimits } from "./timetablePlacementValidator.js";

function subWKey(divisionId, subjectId) {
  return `${divisionId}:${subjectId}`;
}

/** Matches legacy engine / {@link computeLegacyObjective} lesson rows. */
export function isLessonPlacementEntry(entry) {
  return Boolean(entry?.subjectId && !entry.isFreePeriod && entry.slotType === "LESSON");
}

export function buildSubjectWeeklyCountsFromEntries(entries) {
  const counts = new Map();
  for (const e of entries || []) {
    if (!isLessonPlacementEntry(e)) continue;
    const k = subWKey(e.divisionId, e.subjectId);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts;
}

export function recomputeUnscheduledFromEntries(state, entries) {
  const divisions = state?.divisions || [];
  const subjects = state?.subjects || [];
  const subjectAllocations = state?.subjectAllocations || [];
  const subjectWeeklyCount = buildSubjectWeeklyCountsFromEntries(entries);
  const unscheduled = [];

  for (const div of divisions) {
    for (const sub of subjects) {
      if (!subjectAppliesToDivision(sub, div)) continue;
      const { weeklyPeriods: required } = getDivisionSubjectLimits(sub, div.id, subjectAllocations);
      const req = Number(required) || 0;
      const scheduled = subjectWeeklyCount.get(subWKey(div.id, sub.id)) || 0;
      if (scheduled < req) {
        unscheduled.push({
          divisionId: div.id,
          subjectId: sub.id,
          periodsRequired: req,
          periodsScheduled: scheduled,
          periodsShort: req - scheduled,
        });
      }
    }
  }
  return unscheduled;
}

export function recomputeTimetableMetricsFromEntries(state, entries) {
  const divisions = state?.divisions || [];
  const subjects = state?.subjects || [];
  const subjectAllocations = state?.subjectAllocations || [];
  const lessons = (entries || []).filter(isLessonPlacementEntry);
  const totalScheduled = lessons.length;

  let totalRequired = 0;
  let unscheduledShort = 0;
  for (const div of divisions) {
    for (const sub of subjects) {
      if (!subjectAppliesToDivision(sub, div)) continue;
      const { weeklyPeriods: required } = getDivisionSubjectLimits(sub, div.id, subjectAllocations);
      const req = Number(required) || 0;
      totalRequired += req;
      const sched = lessons.filter(
        (e) => String(e.divisionId) === String(div.id) && String(e.subjectId) === String(sub.id),
      ).length;
      if (sched < req) unscheduledShort += req - sched;
    }
  }

  const score = totalRequired > 0 ? Math.round((totalScheduled / totalRequired) * 100) : 100;
  const status = score > 85 ? "FEASIBLE" : score > 60 ? "PARTIAL" : "INFEASIBLE";
  const unscheduled = recomputeUnscheduledFromEntries(state, entries);

  return { totalRequired, totalScheduled, unscheduledShort, score, status, unscheduled };
}

/**
 * Merge entry-derived shortage metrics into a timetable report (keeps generate-time diagnostics).
 */
export function mergeLiveReportFromEntries(state, entries, baseReport = {}) {
  const metrics = recomputeTimetableMetricsFromEntries(state, entries);
  return {
    ...baseReport,
    totalRequired: metrics.totalRequired,
    totalScheduled: metrics.totalScheduled,
    unscheduled: metrics.unscheduled,
    objective: {
      ...(baseReport.objective && typeof baseReport.objective === "object" ? baseReport.objective : {}),
      totalRequired: metrics.totalRequired,
      totalScheduled: metrics.totalScheduled,
      unscheduledShort: metrics.unscheduledShort,
      score: metrics.score,
    },
    liveFromEntries: true,
  };
}

/** Timetable view model with report/score aligned to current entries. */
export function withLiveTimetableReport(timetable) {
  if (!timetable || !Array.isArray(timetable.entries)) return timetable;
  const state = timetable.sourceState;
  if (!state || !Array.isArray(state.divisions) || !Array.isArray(state.subjects)) return timetable;

  const metrics = recomputeTimetableMetricsFromEntries(state, timetable.entries);
  const report = mergeLiveReportFromEntries(state, timetable.entries, timetable.report || {});
  return {
    ...timetable,
    score: metrics.score,
    status: metrics.status,
    report,
  };
}

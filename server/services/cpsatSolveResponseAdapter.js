import { CPSAT_CONTRACT_VERSION } from "../../shared/cpsatContract.js";
import { buildFullEntriesFromLessonRows } from "./timetableLessonGridFill.js";

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

function subWKey(divisionId, subjectId) {
  return `${divisionId}:${subjectId}`;
}

/**
 * @param {object} tenant - Original tenant (engine input)
 * @param {object} solveResponse - Parsed JSON from sidecar
 * @returns {{ ok: true, result: object } | { ok: false, reason: string }}
 */
export function adaptCpsatSolveResponse(tenant, solveResponse) {
  if (!solveResponse || typeof solveResponse !== "object") return { ok: false, reason: "empty_response" };
  if (String(solveResponse.contractVersion || "") !== CPSAT_CONTRACT_VERSION) {
    return { ok: false, reason: "contract_mismatch" };
  }
  const status = String(solveResponse.solverStatus || "");
  if (!["FEASIBLE", "OPTIMAL", "PARTIAL"].includes(status)) return { ok: false, reason: `status_${status || "missing"}` };
  const lessons = solveResponse.entries;
  if (!Array.isArray(lessons)) return { ok: false, reason: "entries_missing" };

  const divisions = tenant.divisions || [];
  const subjects = tenant.subjects || [];
  const subjectAllocations = tenant.subjectAllocations || [];
  const subjectWeeklyCount = new Map();

  for (const row of lessons) {
    if (!row || row.isFreePeriod || !row.subjectId || !row.teacherId) continue;
    const k = subWKey(row.divisionId, row.subjectId);
    subjectWeeklyCount.set(k, (subjectWeeklyCount.get(k) || 0) + 1);
  }

  const unscheduled = [];
  for (const div of divisions) {
    for (const sub of subjects) {
      if (!subjectAppliesToDivision(sub, div)) continue;
      const { weeklyPeriods: required } = getDivisionSubjectLimits(sub, div.id, subjectAllocations);
      const scheduled = subjectWeeklyCount.get(subWKey(div.id, sub.id)) || 0;
      if (scheduled < required) {
        unscheduled.push({
          divisionId: div.id,
          subjectId: sub.id,
          periodsRequired: required,
          periodsScheduled: scheduled,
          periodsShort: required - scheduled,
        });
      }
    }
  }

  const entries = buildFullEntriesFromLessonRows(tenant, lessons);
  const totalRequired = subjects.reduce(
    (acc, sub) =>
      acc +
      divisions
        .filter((d) => subjectAppliesToDivision(sub, d))
        .reduce((sum, d) => sum + (getDivisionSubjectLimits(sub, d.id, subjectAllocations).weeklyPeriods || 0), 0),
    0,
  );
  const totalScheduled = entries.filter((e) => e.subjectId && !e.isFreePeriod).length;
  const score = totalRequired > 0 ? Math.round((totalScheduled / totalRequired) * 100) : 100;

  const report = {
    ...(typeof solveResponse.report === "object" && solveResponse.report ? solveResponse.report : {}),
    totalRequired,
    totalScheduled,
    unscheduled,
    rejections: solveResponse.report?.rejections && typeof solveResponse.report.rejections === "object" ? solveResponse.report.rejections : {},
    cpsat: {
      ...(solveResponse.report?.cpsat && typeof solveResponse.report.cpsat === "object" ? solveResponse.report.cpsat : {}),
      solverStatus: status,
      wallMs: solveResponse.timing?.wallMs,
      solveMs: solveResponse.timing?.solveMs,
      demandSummary: solveResponse.report?.cpsat?.demandSummary,
      objectives: solveResponse.report?.cpsat?.objectives,
    },
  };

  return {
    ok: true,
    result: {
      entries,
      score,
      status: score > 85 ? "FEASIBLE" : score > 60 ? "PARTIAL" : "INFEASIBLE",
      report,
    },
  };
}

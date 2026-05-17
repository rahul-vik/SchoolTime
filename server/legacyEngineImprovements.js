/**
 * Legacy greedy engine improvements: multi-restart, hardest-first ordering, backtracking.
 */

export function getLegacyRestartCount(schedulingMode, data) {
  const override = data?.legacyEngineOptions?.restarts;
  if (override !== undefined && override !== null) {
    return Math.max(1, Math.min(12, Number(override) || 1));
  }
  const env = Number(process.env.LEGACY_ENGINE_RESTARTS);
  if (Number.isFinite(env) && env > 0) {
    return Math.max(1, Math.min(12, Math.floor(env)));
  }
  if (schedulingMode === "OPTIMAL") return 3;
  if (schedulingMode === "BEST_FIT") return 5;
  return 4;
}

export function getLegacyBacktrackDepth(data) {
  const override = data?.legacyEngineOptions?.backtrackDepth;
  if (override !== undefined && override !== null) {
    return Math.max(1, Math.min(20, Number(override) || 4));
  }
  const env = Number(process.env.LEGACY_ENGINE_BACKTRACK_DEPTH);
  if (Number.isFinite(env) && env > 0) {
    return Math.max(1, Math.min(20, Math.floor(env)));
  }
  return 4;
}

export function getLegacyMaxBacktrackRounds(data) {
  const override = data?.legacyEngineOptions?.maxBacktrackRounds;
  if (override !== undefined && override !== null) {
    return Math.max(0, Math.min(40, Number(override) || 12));
  }
  return 12;
}

export function getLegacyLockRepairRounds(data) {
  const override = data?.legacyEngineOptions?.lockRepairRounds;
  if (override !== undefined && override !== null) {
    return Math.max(1, Math.min(8, Number(override) || 4));
  }
  const env = Number(process.env.LEGACY_ENGINE_LOCK_REPAIR_ROUNDS);
  if (Number.isFinite(env) && env > 0) {
    return Math.max(1, Math.min(8, Math.floor(env)));
  }
  return 4;
}

import { compareLexicographicObjective } from "./legacyEngineLocalSearch.js";

export function countUnscheduledShort(report) {
  if (report?.objective?.unscheduledShort !== undefined) {
    return Number(report.objective.unscheduledShort) || 0;
  }
  return (report?.unscheduled || []).reduce((sum, u) => sum + Number(u.periodsShort || 0), 0);
}

/** Higher score = prefer this result. Returns positive if `a` is better than `b`. */
export function compareEngineResults(a, b) {
  if (!b) return 1;
  if (!a) return -1;
  const oa = a.report?.objective;
  const ob = b.report?.objective;
  if (oa && ob) {
    const lex = compareLexicographicObjective(oa, ob);
    if (lex !== 0) return lex;
  }
  if (a.score !== b.score) return a.score > b.score ? 1 : -1;
  const shortA = countUnscheduledShort(a.report);
  const shortB = countUnscheduledShort(b.report);
  if (shortA !== shortB) return shortA < shortB ? 1 : -1;
  const schedA = Number(a.report?.totalScheduled || 0);
  const schedB = Number(b.report?.totalScheduled || 0);
  if (schedA !== schedB) return schedA > schedB ? 1 : -1;
  return 0;
}

export function rotateArray(arr, seed) {
  if (!arr?.length) return arr || [];
  const k = (((Number(seed) || 0) % arr.length) + arr.length) % arr.length;
  return [...arr.slice(k), ...arr.slice(0, k)];
}

/**
 * @param {object} sub
 * @param {object} div
 * @param {object} ctx - { rules, subjectAllocations, getDivisionSubjectLimits, countEligibleTeachers }
 */
export function subjectDifficultyForDivision(sub, div, ctx) {
  const { rules, subjectAllocations, getDivisionSubjectLimits, countEligibleTeachers } = ctx;
  const { weeklyPeriods } = getDivisionSubjectLimits(sub, div.id, subjectAllocations);
  const includeCount = (rules || []).filter((r) => {
    if (!r || r.ruleType !== "INCLUDE_ONLY" || r.isActive === false || r.subjectId !== sub.id) return false;
    const divIds = Array.isArray(r.divisionIds) && r.divisionIds.length > 0 ? r.divisionIds : r.divisionId ? [r.divisionId] : [];
    return divIds.includes(div.id);
  }).length;
  const softRuleCount = (rules || []).filter(
    (r) => r && r.subjectId === sub.id && r.isActive !== false && r.ruleType !== "INCLUDE_ONLY",
  ).length;
  const eligible = Math.max(0, countEligibleTeachers(sub, div));
  const scarcity = eligible === 0 ? 100 : 8 / eligible;
  return (
    Number(sub.priorityWeight || 0) * 12 +
    Number(weeklyPeriods || 0) * 3 +
    includeCount * 55 +
    softRuleCount * 6 +
    scarcity
  );
}

export function sortSubjectsHardestFirst(subjects, div, ctx, seed) {
  const scored = subjects
    .map((sub, idx) => ({
      sub,
      idx,
      difficulty: subjectDifficultyForDivision(sub, div, ctx),
    }))
    .sort((a, b) => b.difficulty - a.difficulty || a.idx - b.idx);
  const ordered = scored.map((x) => x.sub);
  return rotateArray(ordered, seed);
}

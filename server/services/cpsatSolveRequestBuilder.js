import { randomUUID } from "node:crypto";
import { CPSAT_CONTRACT_VERSION, CPSAT_SCHEMA } from "../../shared/cpsatContract.js";

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

/**
 * Rough upper bound on CP-SAT decision complexity for guardrails (contract size caps).
 */
export function estimateCpSatLessonDecisionVars(tenant) {
  const divisions = tenant.divisions || [];
  const subjects = tenant.subjects || [];
  const teachers = tenant.teachers || [];
  const workingDays = tenant.workingDays?.length ? tenant.workingDays.length : 5;
  const lessonSlots = (tenant.periodSlots || []).filter((s) => s.slotType === "LESSON").length || 1;
  const activeCellsPerDivision = workingDays * lessonSlots;
  let units = 0;
  let maxEligible = 1;
  for (const div of divisions) {
    for (const sub of subjects) {
      if (!subjectAppliesToDivision(sub, div)) continue;
      const { weeklyPeriods } = getDivisionSubjectLimits(sub, div.id, tenant.subjectAllocations);
      const n = Math.max(0, weeklyPeriods);
      units += n;
      const elig = teachers.filter(
        (t) =>
          (t.subjectIds || []).includes(sub.id) &&
          (t.mediumIds || []).includes(div.mediumId) &&
          (!(t.assignedDivisionIds || []).length || (t.assignedDivisionIds || []).includes(div.id)),
      ).length;
      maxEligible = Math.max(maxEligible, elig || 1);
    }
  }
  return units * maxEligible * activeCellsPerDivision;
}

/**
 * @param {object} params
 * @param {object} params.tenant - Normalized tenant state (engine input shape).
 * @param {string} [params.orgId]
 * @param {string} [params.snapshotAt] - ISO string
 * @param {object} params.runtime - From getTimetableSolverRuntime()
 */
export function buildCpsatSolveRequest({ tenant, orgId, snapshotAt, runtime }) {
  const timeoutMs = runtime.timeoutMs ?? 30_000;
  const timeLimitSec = Math.max(1, Math.floor(timeoutMs / 1000) - 1);
  return {
    contractVersion: CPSAT_CONTRACT_VERSION,
    schema: CPSAT_SCHEMA,
    requestId: randomUUID(),
    orgId: orgId || "",
    snapshotAt: snapshotAt || new Date().toISOString(),
    options: {
      timeLimitSec,
      proveOptimality: false,
      randomSeed: Number(process.env.CP_SAT_RANDOM_SEED || 1),
      objectiveProfile: "FULL_DEMAND_THEN_MIN_FRAGMENTATION",
      softRuleMode: "MATCH_LEGACY_STRICT",
      emitInfeasibilityHints: String(process.env.CP_SAT_EMIT_IIS || "").trim() === "1",
      maxResponseEntries: runtime.cpSatMaxResponseEntries,
    },
    tenant: {
      workingDays: tenant.workingDays,
      periodSlots: tenant.periodSlots,
      divisions: tenant.divisions,
      subjects: tenant.subjects,
      teachers: tenant.teachers,
      teacherSubjects: tenant.teacherSubjects || [],
      subjectAllocations: tenant.subjectAllocations || [],
      schedulingRules: tenant.schedulingRules || [],
      fixedSlots: tenant.fixedSlots || [],
      freePeriodRules: tenant.freePeriodRules || [],
      classTeacherPreferences: tenant.classTeacherPreferences || { enabled: false },
      standards: tenant.standards || [],
    },
  };
}

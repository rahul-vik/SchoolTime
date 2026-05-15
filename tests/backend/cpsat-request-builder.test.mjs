import test from "node:test";
import assert from "node:assert/strict";
import { buildCpsatSolveRequest, estimateCpSatLessonDecisionVars } from "../../server/services/cpsatSolveRequestBuilder.js";
import { CPSAT_CONTRACT_VERSION, CPSAT_SCHEMA } from "../../shared/cpsatContract.js";

const tinyTenant = {
  divisions: [{ id: "d1", name: "A", standardId: "s1", mediumId: "m1" }],
  subjects: [
    {
      id: "sub1",
      weeklyPeriods: 1,
      maxPerDay: 2,
      mediumIds: ["m1"],
      standardIds: ["s1"],
      divisionScopeMode: "ALL_IN_SELECTED_CLASSES",
      divisionIncludeIds: [],
      divisionExcludeIds: [],
      divisionLimits: [],
    },
  ],
  teachers: [
    {
      id: "t1",
      mediumIds: ["m1"],
      subjectIds: ["sub1"],
      maxPerDay: 8,
      maxPerWeek: 40,
      freeMorningPeriods: 0,
      freeEveningPeriods: 0,
      assignedDivisionIds: [],
      divisionSubjectExclusions: [],
    },
  ],
  periodSlots: [{ slotNumber: 1, slotType: "LESSON" }],
  workingDays: ["MONDAY"],
  teacherSubjects: [],
  subjectAllocations: [],
  schedulingRules: [],
  fixedSlots: [],
  freePeriodRules: [],
  classTeacherPreferences: { enabled: false, schedulingMode: "STRICT" },
  standards: [],
};

test("buildCpsatSolveRequest carries tenant fields and contract metadata", () => {
  const req = buildCpsatSolveRequest({
    tenant: tinyTenant,
    orgId: "org-1",
    snapshotAt: "2026-05-15T00:00:00.000Z",
    runtime: { timeoutMs: 30_000, cpSatMaxResponseEntries: 1000 },
  });
  assert.equal(req.contractVersion, CPSAT_CONTRACT_VERSION);
  assert.equal(req.schema, CPSAT_SCHEMA);
  assert.equal(req.orgId, "org-1");
  assert.equal(req.tenant.divisions.length, 1);
  assert.equal(req.tenant.classTeacherPreferences.schedulingMode, "STRICT");
  assert.ok(req.options.timeLimitSec >= 1);
  assert.equal(req.options.softRuleMode, "MATCH_LEGACY_STRICT");
  assert.equal(req.options.objectiveProfile, "FULL_DEMAND_THEN_MIN_FRAGMENTATION");
});

test("estimateCpSatLessonDecisionVars returns positive for non-empty tenant", () => {
  const est = estimateCpSatLessonDecisionVars(tinyTenant);
  assert.ok(est > 0);
});

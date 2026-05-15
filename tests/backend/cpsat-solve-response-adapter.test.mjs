import test from "node:test";
import assert from "node:assert/strict";
import { adaptCpsatSolveResponse } from "../../server/services/cpsatSolveResponseAdapter.js";
import { CPSAT_CONTRACT_VERSION } from "../../shared/cpsatContract.js";

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

test("adaptCpsatSolveResponse merges demand and objective fields from sidecar", () => {
  const solveResponse = {
    contractVersion: CPSAT_CONTRACT_VERSION,
    solverStatus: "OPTIMAL",
    timing: { wallMs: 12, solveMs: 10 },
    entries: [
      {
        divisionId: "d1",
        teacherId: "t1",
        subjectId: "sub1",
        dayOfWeek: "MONDAY",
        slotNumber: 1,
        isDouble: false,
        isFreePeriod: false,
        slotType: "LESSON",
      },
    ],
    report: {
      totalRequired: 1,
      totalScheduled: 1,
      unscheduled: [],
      cpsat: {
        demandSummary: {
          placedCount: 1,
          totalCount: 1,
          placedWeight: 5,
          totalWeight: 5,
          unplacedDemands: [],
        },
        objectives: {
          profile: "FULL_DEMAND_THEN_MIN_FRAGMENTATION",
          primary: "MAX_WEIGHTED_DEMAND_FULL_COVERAGE",
          placedDemandWeight: 5,
          secondary: "MIN_TEACHER_DAY_FRAGMENTATION_PROXY",
          secondaryPenalty: 2,
        },
        objectiveValue: 2,
        cpSatStatus: "OPTIMAL",
        solverStatus: "OPTIMAL",
      },
    },
  };
  const out = adaptCpsatSolveResponse(tinyTenant, solveResponse);
  assert.equal(out.ok, true);
  assert.equal(out.result.report.cpsat.demandSummary.placedWeight, 5);
  assert.equal(out.result.report.cpsat.objectives.secondaryPenalty, 2);
  assert.equal(out.result.report.cpsat.solverStatus, "OPTIMAL");
  assert.equal(out.result.report.cpsat.solveMs, 10);
});

test("adaptCpsatSolveResponse accepts PARTIAL with unscheduled gaps", () => {
  const tenantTwoPeriods = {
    ...tinyTenant,
    subjects: [{ ...tinyTenant.subjects[0], weeklyPeriods: 2 }],
  };
  const solveResponse = {
    contractVersion: CPSAT_CONTRACT_VERSION,
    solverStatus: "PARTIAL",
    timing: { wallMs: 20, solveMs: 18 },
    entries: [
      {
        divisionId: "d1",
        teacherId: "t1",
        subjectId: "sub1",
        dayOfWeek: "MONDAY",
        slotNumber: 1,
        isDouble: false,
        isFreePeriod: false,
        slotType: "LESSON",
      },
    ],
    report: {
      totalRequired: 2,
      totalScheduled: 1,
      unscheduled: [
        {
          divisionId: "d1",
          subjectId: "sub1",
          periodsRequired: 2,
          periodsScheduled: 1,
          periodsShort: 1,
        },
      ],
      cpsat: { solverStatus: "PARTIAL" },
    },
  };
  const out = adaptCpsatSolveResponse(tenantTwoPeriods, solveResponse);
  assert.equal(out.ok, true);
  assert.equal(out.result.score, 50);
  assert.equal(out.result.report.unscheduled.length, 1);
  assert.equal(out.result.report.cpsat.solverStatus, "PARTIAL");
});

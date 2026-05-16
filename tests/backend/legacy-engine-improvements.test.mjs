import test from "node:test";
import assert from "node:assert/strict";
import { runTimetableEngine } from "../../server/engine.js";
import {
  compareEngineResults,
  getLegacyRestartCount,
  sortSubjectsHardestFirst,
} from "../../server/legacyEngineImprovements.js";

test("getLegacyRestartCount respects legacyEngineOptions override", () => {
  assert.equal(getLegacyRestartCount("STRICT", { legacyEngineOptions: { restarts: 1 } }), 1);
  assert.equal(getLegacyRestartCount("STRICT", {}), 4);
});

test("compareEngineResults prefers higher score then fewer shortages", () => {
  const a = { score: 90, report: { totalScheduled: 9, unscheduled: [{ periodsShort: 1 }] } };
  const b = { score: 80, report: { totalScheduled: 8, unscheduled: [{ periodsShort: 3 }] } };
  assert.ok(compareEngineResults(a, b) > 0);
  assert.ok(compareEngineResults(b, a) < 0);
});

test("sortSubjectsHardestFirst ranks INCLUDE_ONLY subjects earlier", () => {
  const div = { id: "d1", standardId: "s1", mediumId: "m1" };
  const easy = { id: "sub-e", priorityWeight: 1, weeklyPeriods: 2 };
  const hard = { id: "sub-h", priorityWeight: 1, weeklyPeriods: 2 };
  const rules = [
    {
      ruleType: "INCLUDE_ONLY",
      subjectId: "sub-h",
      divisionId: "d1",
      isActive: true,
      includeMode: "PRESET_LAST_LESSON",
      includeWeekday: "FRIDAY",
    },
  ];
  const ordered = sortSubjectsHardestFirst([easy, hard], div, {
    rules,
    subjectAllocations: [],
    getDivisionSubjectLimits: (sub) => ({ weeklyPeriods: sub.weeklyPeriods, maxPerDay: 2 }),
    countEligibleTeachers: () => 2,
  }, 0);
  assert.equal(ordered[0].id, "sub-h");
});

test("runTimetableEngine exposes optimization restart metadata", () => {
  const med = "med-en";
  const std = "std-5";
  const periodSlots = [
    { slotNumber: 1, slotType: "LESSON", label: "P1" },
    { slotNumber: 2, slotType: "LESSON", label: "P2" },
  ];
  const out = runTimetableEngine({
    divisions: [{ id: "d1", name: "1-A", standardId: std, mediumId: med }],
    subjects: [
      {
        id: "sub-a",
        priorityWeight: 5,
        weeklyPeriods: 2,
        maxPerDay: 2,
        mediumIds: [med],
        standardIds: [std],
        divisionScopeMode: "ALL_IN_SELECTED_CLASSES",
        divisionIncludeIds: [],
        divisionExcludeIds: [],
        divisionLimits: [],
      },
    ],
    teachers: [
      {
        id: "t1",
        mediumIds: [med],
        subjectIds: ["sub-a"],
        assignedDivisionIds: [],
        divisionSubjectExclusions: [],
        maxPerDay: 8,
        maxPerWeek: 40,
        freeMorningPeriods: 0,
        freeEveningPeriods: 0,
      },
    ],
    periodSlots,
    workingDays: ["MONDAY", "TUESDAY"],
    teacherSubjects: [],
    freePeriodRules: [],
    fixedSlots: [],
    subjectAllocations: [],
    schedulingRules: [],
    classTeacherPreferences: { enabled: false, schedulingMode: "STRICT" },
    legacyEngineOptions: { restarts: 2 },
  });
  assert.equal(out.report.optimization.restartCount, 2);
  assert.ok(out.report.optimization.attemptSeed === 0 || out.report.optimization.winningSeed === 0 || out.report.optimization.winningSeed === 1);
});

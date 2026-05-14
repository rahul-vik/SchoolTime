import test from "node:test";
import assert from "node:assert/strict";
import { runTimetableGenerationEngine } from "../../server/timetableSolverRunner.js";

const tinyPayload = {
  divisions: [{ id: "d1", name: "A", standardId: "s1", mediumId: "m1" }],
  subjects: [
    {
      id: "sub1",
      name: "Math",
      code: "MAT",
      category: "CORE",
      weeklyPeriods: 1,
      maxPerDay: 2,
      priorityWeight: 10,
      colorHex: "#000",
      mediumIds: ["m1"],
      standardIds: ["s1"],
      divisionScopeMode: "ALL_IN_SELECTED_CLASSES",
      divisionIncludeIds: [],
      divisionExcludeIds: [],
      divisionLimits: [],
      isActive: true,
    },
  ],
  teachers: [
    {
      id: "t1",
      firstName: "A",
      lastName: "B",
      employeeCode: "T1",
      email: "t@t.test",
      maxPerDay: 8,
      maxPerWeek: 40,
      mediumIds: ["m1"],
      subjectIds: ["sub1"],
      primarySubjectId: "sub1",
      freeMorningPeriods: 0,
      freeEveningPeriods: 0,
      assignedDivisionIds: [],
      classTeacherDivisionIds: [],
      primaryClassTeacherDivisionId: null,
      divisionSubjectExclusions: [],
    },
  ],
  periodSlots: [
    { slotNumber: 1, slotType: "LESSON", label: "P1" },
    { slotNumber: 2, slotType: "LESSON", label: "P2" },
  ],
  workingDays: ["MONDAY"],
  teacherSubjects: [],
  freePeriodRules: [],
  fixedSlots: [],
  subjectAllocations: [],
  schedulingRules: [],
  classTeacherPreferences: { enabled: false, ctFirstPeriodDays: [], dailyPrimaryMinPeriods: 0, schedulingMode: "STRICT" },
};

test("solver runner legacy mode annotates report", async () => {
  const prev = process.env.TIMETABLE_SOLVER;
  process.env.TIMETABLE_SOLVER = "legacy";
  try {
    const out = await runTimetableGenerationEngine(tinyPayload);
    assert.equal(out.report.solver.requested, "legacy");
    assert.equal(out.report.solver.applied, "legacy");
    assert.equal(out.report.solver.workerUsed, false);
    assert.equal(out.report.solver.fallbackReason, null);
  } finally {
    if (prev === undefined) delete process.env.TIMETABLE_SOLVER;
    else process.env.TIMETABLE_SOLVER = prev;
  }
});

test("solver runner experimental completes and tags report", async () => {
  const prevS = process.env.TIMETABLE_SOLVER;
  const prevT = process.env.TIMETABLE_SOLVER_TIMEOUT_MS;
  process.env.TIMETABLE_SOLVER = "experimental";
  process.env.TIMETABLE_SOLVER_TIMEOUT_MS = "30000";
  try {
    const out = await runTimetableGenerationEngine(tinyPayload);
    assert.equal(out.report.solver.requested, "experimental");
    assert.equal(out.report.solver.applied, "experimental");
    assert.equal(out.report.solver.workerUsed, true);
    assert.ok(out.report.experimental?.prototype);
  } finally {
    if (prevS === undefined) delete process.env.TIMETABLE_SOLVER;
    else process.env.TIMETABLE_SOLVER = prevS;
    if (prevT === undefined) delete process.env.TIMETABLE_SOLVER_TIMEOUT_MS;
    else process.env.TIMETABLE_SOLVER_TIMEOUT_MS = prevT;
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { validateTimetableRun } from "../../server/services/timetableValidationService.js";

const periodSlots = [
  { slotNumber: 1, slotType: "LESSON", activeWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] },
  { slotNumber: 2, slotType: "LESSON", activeWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] },
  { slotNumber: 3, slotType: "LUNCH", activeWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] },
  { slotNumber: 4, slotType: "LESSON", activeWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] },
];

function baseState() {
  return {
    standards: [{ id: "st1", name: "5" }],
    divisions: [{ id: "div-a", name: "A", standardId: "st1", mediumId: "m1" }],
    subjects: [
      {
        id: "sub-math",
        name: "Math",
        code: "MAT",
        weeklyPeriods: 2,
        maxPerDay: 2,
        standardIds: ["st1"],
        mediumIds: ["m1"],
      },
    ],
    teachers: [
      {
        id: "t1",
        firstName: "A",
        lastName: "Teacher",
        subjectIds: ["sub-math"],
        mediumIds: ["m1"],
        freeMorningPeriods: 0,
        freeEveningPeriods: 0,
        maxPerDay: 1,
        maxPerWeek: 2,
      },
    ],
    mediums: [{ id: "m1", name: "EN" }],
    workingDays: ["MONDAY", "TUESDAY"],
    periodSlots,
    schedulingRules: [
      {
        id: "inc1",
        subjectId: "sub-math",
        ruleType: "INCLUDE_ONLY",
        isActive: true,
        divisionIds: ["div-a"],
        includeMode: "CUSTOM",
        allowedCells: [{ dayOfWeek: "MONDAY", slotNumber: 1 }],
      },
    ],
    teacherSubjects: [],
    freePeriodRules: [],
    subjectAllocations: [],
  };
}

test("validateTimetableRun detects INCLUDE_ONLY_VIOLATION", () => {
  const state = baseState();
  const entries = [
    {
      divisionId: "div-a",
      subjectId: "sub-math",
      teacherId: "t1",
      dayOfWeek: "TUESDAY",
      slotNumber: 1,
      slotType: "LESSON",
      isFreePeriod: false,
    },
  ];
  const out = validateTimetableRun({ state, entries, runId: "r1" });
  assert.ok(out.findings.some((f) => f.code === "INCLUDE_ONLY_VIOLATION"));
});

test("validateTimetableRun detects teacher daily overload", () => {
  const state = baseState();
  const entries = [
    { divisionId: "div-a", subjectId: "sub-math", teacherId: "t1", dayOfWeek: "MONDAY", slotNumber: 1, slotType: "LESSON", isFreePeriod: false },
    { divisionId: "div-a", subjectId: "sub-math", teacherId: "t1", dayOfWeek: "MONDAY", slotNumber: 4, slotType: "LESSON", isFreePeriod: false },
  ];
  const out = validateTimetableRun({ state, entries, runId: "r2" });
  assert.ok(out.findings.some((f) => f.code === "TEACHER_DAILY_OVERLOAD"));
});

test("validateTimetableRun emits SUBJECT_PERIODS_SHORT warning", () => {
  const state = baseState();
  const entries = [
    { divisionId: "div-a", subjectId: "sub-math", teacherId: "t1", dayOfWeek: "MONDAY", slotNumber: 1, slotType: "LESSON", isFreePeriod: false },
  ];
  const out = validateTimetableRun({ state, entries, runId: "r3" });
  assert.ok(out.findings.some((f) => f.code === "SUBJECT_PERIODS_SHORT" && f.severity === "WARNING"));
});

test("validateTimetableRun detects CONTINUITY_SAME_SUBJECT_EXCEEDED", () => {
  const state = baseState();
  state.teachers[0].maxContinuousSameSubjectPerDivision = 1;
  state.teachers[0].maxContinuousAnySubjectPerDivision = 3;
  const entries = [
    { divisionId: "div-a", subjectId: "sub-math", teacherId: "t1", dayOfWeek: "MONDAY", slotNumber: 1, slotType: "LESSON", isFreePeriod: false },
    { divisionId: "div-a", subjectId: "sub-math", teacherId: "t1", dayOfWeek: "MONDAY", slotNumber: 2, slotType: "LESSON", isFreePeriod: false },
  ];
  const out = validateTimetableRun({ state, entries, runId: "r4" });
  assert.ok(out.findings.some((f) => f.code === "CONTINUITY_SAME_SUBJECT_EXCEEDED" && f.severity === "WARNING"));
});

test("validateTimetableRun detects TEACHER_CROSS_DIVISION_CONTINUITY", () => {
  const state = baseState();
  state.divisions.push({ id: "div-b", name: "B", standardId: "st1", mediumId: "m1" });
  state.teachers.push({
    id: "t2",
    firstName: "B",
    lastName: "Teacher",
    subjectIds: ["sub-math"],
    mediumIds: ["m1"],
    freeMorningPeriods: 0,
    freeEveningPeriods: 0,
    maxPerDay: 4,
    maxPerWeek: 8,
  });
  const entries = [
    { divisionId: "div-a", subjectId: "sub-math", teacherId: "t2", dayOfWeek: "MONDAY", slotNumber: 1, slotType: "LESSON", isFreePeriod: false },
    { divisionId: "div-a", subjectId: "sub-math", teacherId: "t2", dayOfWeek: "MONDAY", slotNumber: 2, slotType: "LESSON", isFreePeriod: false },
    { divisionId: "div-b", subjectId: "sub-math", teacherId: "t2", dayOfWeek: "MONDAY", slotNumber: 1, slotType: "LESSON", isFreePeriod: false },
    { divisionId: "div-b", subjectId: "sub-math", teacherId: "t2", dayOfWeek: "MONDAY", slotNumber: 2, slotType: "LESSON", isFreePeriod: false },
  ];
  const out = validateTimetableRun({ state, entries, runId: "r5" });
  assert.ok(out.findings.some((f) => f.code === "TEACHER_CROSS_DIVISION_CONTINUITY" && f.severity === "WARNING"));
});

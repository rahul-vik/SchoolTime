import test from "node:test";
import assert from "node:assert/strict";
import { runTenantFeasibilityReport } from "../../shared/tenantPreflightCheck.js";

const workingDays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

test("runTenantFeasibilityReport flags impossible INCLUDE_ONLY capacity", () => {
  const state = {
    standards: [{ id: "st1", name: "5" }],
    divisions: [{ id: "motionDiv-a", name: "A", standardId: "st1", mediumId: "m1" }],
    subjects: [
      {
        id: "sub1",
        name: "Art",
        code: "ART",
        category: "NON_CORE",
        weeklyPeriods: 3,
        maxPerDay: 2,
        priorityWeight: 5,
        mediumIds: ["m1"],
        standardIds: ["st1"],
        isActive: true,
      },
    ],
    teachers: [
      {
        id: "t1",
        firstName: "T",
        lastName: "One",
        mediumIds: ["m1"],
        subjectIds: ["sub1"],
        maxPerDay: 8,
        maxPerWeek: 40,
        freeMorningPeriods: 0,
        freeEveningPeriods: 0,
      },
    ],
    mediums: [{ id: "m1", name: "EN" }],
    schedulingRules: [
      {
        id: "inc",
        subjectId: "sub1",
        ruleType: "INCLUDE_ONLY",
        isActive: true,
        divisionIds: ["div-a"],
        includeMode: "CUSTOM",
        allowedCells: [{ dayOfWeek: "FRIDAY", slotNumber: 1 }],
      },
    ],
    periodSlots: [
      { slotNumber: 1, slotType: "LESSON", activeWeekdays: ["FRIDAY"] },
      { slotNumber: 2, slotType: "LESSON", activeWeekdays: workingDays },
    ],
    workingDays,
    teacherSubjects: [],
    divisionSubjectTeacherLocks: [],
  };
  state.divisions[0].id = "div-a";

  const r = runTenantFeasibilityReport(state);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.code === "SUBJECT_PLACEABLE_CELLS_SHORT"));
  assert.equal(r.rows[0].placeable, 1);
  assert.equal(r.rows[0].required, 3);
});

test("runTenantFeasibilityReport ok when demand fits placeable cells", () => {
  const state = {
    standards: [{ id: "st1", name: "5" }],
    divisions: [{ id: "div-a", name: "A", standardId: "st1", mediumId: "m1" }],
    subjects: [
      {
        id: "sub1",
        name: "Math",
        code: "MAT",
        category: "CORE",
        weeklyPeriods: 2,
        maxPerDay: 2,
        priorityWeight: 8,
        mediumIds: ["m1"],
        standardIds: ["st1"],
        isActive: true,
      },
    ],
    teachers: [
      {
        id: "t1",
        firstName: "T",
        lastName: "One",
        mediumIds: ["m1"],
        subjectIds: ["sub1"],
        maxPerDay: 8,
        maxPerWeek: 40,
        freeMorningPeriods: 0,
        freeEveningPeriods: 0,
      },
    ],
    mediums: [{ id: "m1", name: "EN" }],
    schedulingRules: [],
    periodSlots: [
      { slotNumber: 1, slotType: "LESSON" },
      { slotNumber: 2, slotType: "LESSON" },
    ],
    workingDays: ["MONDAY", "TUESDAY"],
    teacherSubjects: [],
    divisionSubjectTeacherLocks: [],
  };
  const r = runTenantFeasibilityReport(state);
  assert.equal(r.ok, true);
  assert.equal(r.errorCount, 0);
  assert.ok(r.rows[0].placeable >= r.rows[0].required);
});

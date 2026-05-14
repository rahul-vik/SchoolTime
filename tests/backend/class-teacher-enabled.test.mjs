import test from "node:test";
import assert from "node:assert/strict";
import { runTimetableEngine } from "../../server/engine.js";
import { migrateTenantState } from "../../server/services/tenantStateMigration.js";

const med = "med-en";
const std = "std-5";

const periodSlots = [
  { slotNumber: 1, slotType: "LESSON", label: "P1" },
  { slotNumber: 2, slotType: "LESSON", label: "P2" },
];

const workingDays = ["MONDAY"];

test("class teacher placement runs only when enabled is explicitly true", () => {
  const divisions = [{ id: "div-a", name: "A", standardId: std, mediumId: med }];
  const teacher = {
    id: "t-ct",
    firstName: "C",
    lastName: "T",
    employeeCode: "CT1",
    email: "ct@school.test",
    maxPerDay: 8,
    maxPerWeek: 40,
    mediumIds: [med],
    subjectIds: ["sub-core"],
    primarySubjectId: "sub-core",
    freeMorningPeriods: 0,
    freeEveningPeriods: 0,
    assignedDivisionIds: [],
    classTeacherDivisionIds: ["div-a"],
    primaryClassTeacherDivisionId: "div-a",
    divisionSubjectExclusions: [],
  };
  const subject = {
    id: "sub-core",
    name: "Core",
    code: "COR",
    category: "CORE",
    weeklyPeriods: 1,
    maxPerDay: 2,
    priorityWeight: 10,
    colorHex: "#111",
    mediumIds: [med],
    standardIds: [std],
    divisionScopeMode: "ALL_IN_SELECTED_CLASSES",
    divisionIncludeIds: [],
    divisionExcludeIds: [],
    divisionLimits: [],
    isActive: true,
  };

  const base = {
    divisions,
    subjects: [subject],
    teachers: [teacher],
    periodSlots,
    workingDays,
    teacherSubjects: [],
    freePeriodRules: [],
    fixedSlots: [],
    subjectAllocations: [],
    schedulingRules: [],
  };

  const outOmit = runTimetableEngine({
    ...base,
    classTeacherPreferences: { ctFirstPeriodDays: ["MONDAY"], dailyPrimaryMinPeriods: 0, schedulingMode: "STRICT" },
  });
  assert.equal(outOmit.report.classTeacherRules.firstPeriodRequested, 0);

  const outFalse = runTimetableEngine({
    ...base,
    classTeacherPreferences: { enabled: false, ctFirstPeriodDays: ["MONDAY"], dailyPrimaryMinPeriods: 0, schedulingMode: "STRICT" },
  });
  assert.equal(outFalse.report.classTeacherRules.firstPeriodRequested, 0);

  const outTrue = runTimetableEngine({
    ...base,
    classTeacherPreferences: { enabled: true, ctFirstPeriodDays: ["MONDAY"], dailyPrimaryMinPeriods: 0, schedulingMode: "STRICT" },
  });
  assert.ok(outTrue.report.classTeacherRules.firstPeriodRequested > 0);
});

test("migrateTenantState sets enabled false when omitted on class teacher preferences", () => {
  const { state } = migrateTenantState({
    classTeacherPreferences: { ctFirstPeriodDays: ["MONDAY"], schedulingMode: "STRICT" },
  });
  assert.equal(state.classTeacherPreferences.enabled, false);
});

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
    legacyEngineOptions: { restarts: 1, localSearchIterations: 0 },
  });
  assert.ok(outOmit.report.classTeacherRules.firstPeriodRequested > 0);

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

test("migrateTenantState preserves legacy class teacher when CT settings were in use", () => {
  const { state } = migrateTenantState({
    teachers: [{ classTeacherDivisionIds: ["div-a"] }],
    classTeacherPreferences: { ctFirstPeriodDays: ["MONDAY"], schedulingMode: "STRICT" },
  });
  assert.equal(state.classTeacherPreferences.enabled, true);
});

test("migrateTenantState sets enabled false when omitted and no CT usage", () => {
  const { state } = migrateTenantState({
    classTeacherPreferences: { schedulingMode: "STRICT" },
  });
  assert.equal(state.classTeacherPreferences.enabled, false);
});

test("class teacher first period survives lock repair for same subject", () => {
  const divisions = [{ id: "div-a", name: "A", standardId: std, mediumId: med }];
  const subjectMath = {
    id: "sub-math",
    name: "Math",
    code: "MAT",
    category: "CORE",
    weeklyPeriods: 12,
    maxPerDay: 3,
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
  const subjectEng = {
    id: "sub-eng",
    name: "English",
    code: "ENG",
    category: "LANGUAGE",
    weeklyPeriods: 2,
    maxPerDay: 2,
    priorityWeight: 5,
    colorHex: "#222",
    mediumIds: [med],
    standardIds: [std],
    divisionScopeMode: "ALL_IN_SELECTED_CLASSES",
    divisionIncludeIds: [],
    divisionExcludeIds: [],
    divisionLimits: [],
    isActive: true,
  };
  const ctTeacher = {
    id: "t-ct",
    firstName: "Class",
    lastName: "Teacher",
    employeeCode: "CT1",
    email: "ct@school.test",
    maxPerDay: 8,
    maxPerWeek: 40,
    mediumIds: [med],
    subjectIds: ["sub-math", "sub-eng"],
    primarySubjectId: "sub-math",
    freeMorningPeriods: 0,
    freeEveningPeriods: 0,
    assignedDivisionIds: [],
    classTeacherDivisionIds: ["div-a"],
    primaryClassTeacherDivisionId: "div-a",
    divisionSubjectExclusions: [],
  };
  const helper = {
    id: "t-help",
    firstName: "Help",
    lastName: "Teacher",
    employeeCode: "H1",
    email: "h@school.test",
    maxPerDay: 8,
    maxPerWeek: 40,
    mediumIds: [med],
    subjectIds: ["sub-math", "sub-eng"],
    primarySubjectId: "sub-eng",
    freeMorningPeriods: 0,
    freeEveningPeriods: 0,
    assignedDivisionIds: [],
    classTeacherDivisionIds: [],
    primaryClassTeacherDivisionId: null,
    divisionSubjectExclusions: [],
  };
  ctTeacher.classTeacherDivisionIds = ["div-a"];
  ctTeacher.primaryClassTeacherDivisionId = "div-a";

  const out = runTimetableEngine({
    divisions,
    subjects: [subjectMath, subjectEng],
    teachers: [ctTeacher, helper],
    periodSlots: [
      { slotNumber: 1, slotType: "LESSON", label: "P1" },
      { slotNumber: 2, slotType: "LESSON", label: "P2" },
      { slotNumber: 3, slotType: "LESSON", label: "P3" },
    ],
    workingDays: ["MONDAY", "TUESDAY", "WEDNESDAY"],
    teacherSubjects: [],
    freePeriodRules: [],
    fixedSlots: [],
    subjectAllocations: [],
    schedulingRules: [],
    classTeacherPreferences: {
      enabled: true,
      ctFirstPeriodDays: ["MONDAY"],
      dailyPrimaryMinPeriods: 0,
      schedulingMode: "STRICT",
    },
    legacyEngineOptions: { restarts: 1, localSearchIterations: 0 },
  });

  const monP1 = out.entries.find(
    (e) => e.divisionId === "div-a" && e.dayOfWeek === "MONDAY" && Number(e.slotNumber) === 1 && !e.isFreePeriod,
  );
  assert.ok(monP1, "expected a lesson in Monday period 1");
  assert.equal(monP1.teacherId, "t-ct", "class teacher should keep Monday first period after lock repair");
  assert.equal(monP1.subjectId, "sub-math", "class teacher first period should prefer primary subject");
});

test("dailyPrimaryMinPeriods places extra primary-subject lessons per working day", () => {
  const divisions = [{ id: "div-a", name: "A", standardId: std, mediumId: med }];
  const subjectMath = {
    id: "sub-math",
    name: "Math",
    code: "MAT",
    category: "CORE",
    weeklyPeriods: 10,
    maxPerDay: 4,
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
  const ctTeacher = {
    id: "t-ct",
    firstName: "Class",
    lastName: "Teacher",
    employeeCode: "CT1",
    email: "ct@school.test",
    maxPerDay: 8,
    maxPerWeek: 40,
    mediumIds: [med],
    subjectIds: ["sub-math"],
    primarySubjectId: "sub-math",
    freeMorningPeriods: 0,
    freeEveningPeriods: 0,
    assignedDivisionIds: [],
    classTeacherDivisionIds: ["div-a"],
    primaryClassTeacherDivisionId: "div-a",
    divisionSubjectExclusions: [],
  };

  const out = runTimetableEngine({
    divisions,
    subjects: [subjectMath],
    teachers: [ctTeacher],
    periodSlots: [
      { slotNumber: 1, slotType: "LESSON", label: "P1" },
      { slotNumber: 2, slotType: "LESSON", label: "P2" },
      { slotNumber: 3, slotType: "LESSON", label: "P3" },
    ],
    workingDays: ["MONDAY", "TUESDAY"],
    teacherSubjects: [],
    freePeriodRules: [],
    fixedSlots: [],
    subjectAllocations: [],
    schedulingRules: [],
    classTeacherPreferences: {
      enabled: true,
      ctFirstPeriodDays: [],
      dailyPrimaryMinPeriods: 2,
      schedulingMode: "STRICT",
    },
    legacyEngineOptions: { restarts: 1, localSearchIterations: 0 },
  });

  assert.ok(out.report.classTeacherRules.dailyMinPlaced >= 4, "expected at least 2 primary periods per day across 2 days");
  for (const day of ["MONDAY", "TUESDAY"]) {
    const count = out.entries.filter(
      (e) =>
        e.divisionId === "div-a" &&
        e.dayOfWeek === day &&
        e.teacherId === "t-ct" &&
        e.subjectId === "sub-math" &&
        !e.isFreePeriod,
    ).length;
    assert.ok(count >= 2, `expected >=2 CT math lessons on ${day}, got ${count}`);
  }
});

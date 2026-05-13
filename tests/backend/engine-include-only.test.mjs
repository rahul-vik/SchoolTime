import test from "node:test";
import assert from "node:assert/strict";
import { runTimetableEngine } from "../../server/engine.js";

const med = "med-en";
const std = "std-5";

const periodSlots = [
  { slotNumber: 1, slotType: "LESSON", label: "P1" },
  { slotNumber: 2, slotType: "LESSON", label: "P2" },
  { slotNumber: 3, slotType: "LUNCH", label: "Lunch" },
  { slotNumber: 4, slotType: "LESSON", label: "P3" },
];

const workingDays = ["MONDAY", "TUESDAY", "WEDNESDAY"];

function baseTeacher() {
  return {
    id: "t-1",
    firstName: "T",
    lastName: "One",
    employeeCode: "T1",
    email: "t1@school.test",
    maxPerDay: 8,
    maxPerWeek: 40,
    mediumIds: [med],
    subjectIds: ["sub-lab"],
    primarySubjectId: "sub-lab",
    freeMorningPeriods: 0,
    freeEveningPeriods: 0,
    assignedDivisionIds: [],
    classTeacherDivisionIds: [],
    primaryClassTeacherDivisionId: null,
    divisionSubjectExclusions: [],
  };
}

function baseSubject(weeklyPeriods = 2) {
  return {
    id: "sub-lab",
    name: "Lab",
    code: "LAB",
    category: "NON_CORE",
    weeklyPeriods,
    maxPerDay: 3,
    priorityWeight: 5,
    colorHex: "#0891b2",
    mediumIds: [med],
    standardIds: [std],
    divisionScopeMode: "ALL_IN_SELECTED_CLASSES",
    divisionIncludeIds: [],
    divisionExcludeIds: [],
    divisionLimits: [],
    isActive: true,
  };
}

function runEngine(schedulingRules, divisions, classTeacherPreferences, subjectWeeklyPeriods = 2) {
  return runTimetableEngine({
    divisions,
    subjects: [baseSubject(subjectWeeklyPeriods)],
    teachers: [baseTeacher()],
    periodSlots,
    workingDays,
    teacherSubjects: [],
    freePeriodRules: [],
    fixedSlots: [],
    subjectAllocations: [],
    schedulingRules,
    classTeacherPreferences: classTeacherPreferences || {
      enabled: false,
      ctFirstPeriodDays: [],
      dailyPrimaryMinPeriods: 0,
      schedulingMode: "STRICT",
    },
  });
}

test("INCLUDE_ONLY CUSTOM + divisionIds restricts only matching divisions", () => {
  const divisions = [
    { id: "div-a", name: "A", standardId: std, mediumId: med },
    { id: "div-b", name: "B", standardId: std, mediumId: med },
  ];
  const schedulingRules = [
    {
      id: "inc-1",
      subjectId: "sub-lab",
      ruleType: "INCLUDE_ONLY",
      isActive: true,
      divisionIds: ["div-a"],
      divisionId: "div-a",
      includeMode: "CUSTOM",
      includeWeekday: "MONDAY",
      allowedCells: [
        { dayOfWeek: "MONDAY", slotNumber: 2 },
        { dayOfWeek: "TUESDAY", slotNumber: 2 },
      ],
    },
  ];
  const out = runEngine(schedulingRules, divisions);
  const labA = out.entries.filter((e) => e.divisionId === "div-a" && e.subjectId === "sub-lab" && !e.isFreePeriod);
  const labB = out.entries.filter((e) => e.divisionId === "div-b" && e.subjectId === "sub-lab" && !e.isFreePeriod);

  assert.equal(labA.length, 2);
  for (const e of labA) {
    assert.equal(e.slotNumber, 2);
    assert.ok(["MONDAY", "TUESDAY"].includes(e.dayOfWeek));
  }
  const daysA = new Set(labA.map((e) => e.dayOfWeek));
  assert.equal(daysA.size, 2);

  assert.equal(labB.length, 2);
  for (const e of labB) {
    assert.ok(e.slotNumber === 1 || e.slotNumber === 4 || e.slotNumber === 2);
  }
});

test("period slot inactive on a weekday is not used for lessons that day", () => {
  const divisions = [{ id: "div-a", name: "A", standardId: std, mediumId: med }];
  const slotsInactiveMon = [
    { slotNumber: 1, slotType: "LESSON", label: "P1", activeWeekdays: ["TUESDAY", "WEDNESDAY"] },
    { slotNumber: 2, slotType: "LESSON", label: "P2" },
    { slotNumber: 3, slotType: "LUNCH", label: "Lunch" },
    { slotNumber: 4, slotType: "LESSON", label: "P3" },
  ];
  const out = runTimetableEngine({
    divisions,
    subjects: [baseSubject(6)],
    teachers: [baseTeacher()],
    periodSlots: slotsInactiveMon,
    workingDays,
    teacherSubjects: [],
    freePeriodRules: [],
    fixedSlots: [],
    subjectAllocations: [],
    schedulingRules: [],
    classTeacherPreferences: {
      enabled: false,
      ctFirstPeriodDays: [],
      dailyPrimaryMinPeriods: 0,
      schedulingMode: "STRICT",
    },
  });
  const monP1 = out.entries.filter((e) => e.dayOfWeek === "MONDAY" && e.slotNumber === 1 && e.slotType === "LESSON");
  assert.equal(monP1.length, 0);
  const tueP1 = out.entries.filter((e) => e.dayOfWeek === "TUESDAY" && e.slotNumber === 1 && e.slotType === "LESSON");
  assert.ok(tueP1.length >= 1);
});

test("INCLUDE_ONLY CUSTOM ignores allowed cells where that period is off that weekday", () => {
  const divisions = [{ id: "div-a", name: "A", standardId: std, mediumId: med }];
  const slots = [
    { slotNumber: 1, slotType: "LESSON", label: "P1" },
    { slotNumber: 2, slotType: "LESSON", label: "P2", activeWeekdays: ["TUESDAY", "WEDNESDAY"] },
    { slotNumber: 3, slotType: "LUNCH", label: "Lunch" },
    { slotNumber: 4, slotType: "LESSON", label: "P3" },
  ];
  const schedulingRules = [
    {
      id: "inc-inactive-cell",
      subjectId: "sub-lab",
      ruleType: "INCLUDE_ONLY",
      isActive: true,
      divisionIds: ["div-a"],
      divisionId: "div-a",
      includeMode: "CUSTOM",
      allowedCells: [
        { dayOfWeek: "MONDAY", slotNumber: 2 },
        { dayOfWeek: "TUESDAY", slotNumber: 2 },
      ],
    },
  ];
  const out = runTimetableEngine({
    divisions,
    subjects: [baseSubject(2)],
    teachers: [baseTeacher()],
    periodSlots: slots,
    workingDays,
    teacherSubjects: [],
    freePeriodRules: [],
    fixedSlots: [],
    subjectAllocations: [],
    schedulingRules,
    classTeacherPreferences: {
      enabled: false,
      ctFirstPeriodDays: [],
      dailyPrimaryMinPeriods: 0,
      schedulingMode: "STRICT",
    },
  });
  const lab = out.entries.filter((e) => e.divisionId === "div-a" && e.subjectId === "sub-lab" && !e.isFreePeriod);
  assert.equal(lab.length, 1);
  assert.equal(lab[0].dayOfWeek, "TUESDAY");
  assert.equal(lab[0].slotNumber, 2);
  const monBad = out.entries.filter((e) => e.subjectId === "sub-lab" && e.dayOfWeek === "MONDAY" && e.slotNumber === 2);
  assert.equal(monBad.length, 0);
});

test("INCLUDE_ONLY legacy divisionId only still applies", () => {
  const divisions = [{ id: "div-a", name: "A", standardId: std, mediumId: med }];
  const schedulingRules = [
    {
      id: "inc-2",
      subjectId: "sub-lab",
      ruleType: "INCLUDE_ONLY",
      isActive: true,
      divisionId: "div-a",
      includeMode: "CUSTOM",
      includeWeekday: "MONDAY",
      allowedCells: [{ dayOfWeek: "WEDNESDAY", slotNumber: 4 }],
    },
  ];
  const out = runEngine(schedulingRules, divisions, undefined, 1);
  const lab = out.entries.filter((e) => e.subjectId === "sub-lab" && !e.isFreePeriod);
  assert.equal(lab.length, 1);
  assert.equal(lab[0].dayOfWeek, "WEDNESDAY");
  assert.equal(lab[0].slotNumber, 4);
});

test("OPTIMAL mode still enforces INCLUDE_ONLY", () => {
  const divisions = [{ id: "div-a", name: "A", standardId: std, mediumId: med }];
  const schedulingRules = [
    {
      id: "inc-3",
      subjectId: "sub-lab",
      ruleType: "INCLUDE_ONLY",
      isActive: true,
      divisionIds: ["div-a"],
      divisionId: "div-a",
      includeMode: "CUSTOM",
      includeWeekday: "MONDAY",
      allowedCells: [
        { dayOfWeek: "MONDAY", slotNumber: 1 },
        { dayOfWeek: "TUESDAY", slotNumber: 1 },
      ],
    },
  ];
  const out = runEngine(schedulingRules, divisions, {
    enabled: false,
    ctFirstPeriodDays: [],
    dailyPrimaryMinPeriods: 0,
    schedulingMode: "OPTIMAL",
  });
  const lab = out.entries.filter((e) => e.subjectId === "sub-lab" && !e.isFreePeriod);
  assert.equal(lab.length, 2);
  for (const e of lab) {
    assert.equal(e.slotNumber, 1);
    assert.ok(["MONDAY", "TUESDAY"].includes(e.dayOfWeek));
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { runTimetableEngine } from "../../server/engine.js";

const med = "med-en";
const std = "std-5";
const divId = "div-1";

const periodSlots = [
  { slotNumber: 1, slotType: "LESSON", label: "P1" },
  { slotNumber: 2, slotType: "LESSON", label: "P2" },
  { slotNumber: 3, slotType: "LESSON", label: "P3" },
  { slotNumber: 4, slotType: "LESSON", label: "P4" },
];

const workingDays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

const subjectMath = {
  id: "sub-math",
  name: "Math",
  code: "MAT",
  category: "CORE",
  weeklyPeriods: 4,
  maxPerDay: 2,
  priorityWeight: 8,
  colorHex: "#000",
  mediumIds: [med],
  standardIds: [std],
  allowTeamTeaching: true,
  isActive: true,
};

function teacher(id) {
  return {
    id,
    firstName: id,
    lastName: "T",
    employeeCode: id,
    email: `${id}@school.test`,
    maxPerDay: 8,
    maxPerWeek: 40,
    mediumIds: [med],
    subjectIds: ["sub-math"],
    primarySubjectId: "sub-math",
    freeMorningPeriods: 0,
    freeEveningPeriods: 0,
    assignedDivisionIds: [divId],
    classTeacherDivisionIds: [],
    primaryClassTeacherDivisionId: null,
    divisionSubjectExclusions: [],
  };
}

test("allowTeamTeaching permits two teachers for same division+subject", () => {
  const divisions = [{ id: divId, name: "1-A", standardId: std, mediumId: med }];
  const out = runTimetableEngine({
    divisions,
    subjects: [subjectMath],
    teachers: [teacher("t-a"), teacher("t-b")],
    periodSlots,
    workingDays,
    teacherSubjects: [
      { subjectId: "sub-math", teacherId: "t-a", divisionId: divId },
      { subjectId: "sub-math", teacherId: "t-b", divisionId: divId },
    ],
    divisionSubjectTeacherLocks: [],
    freePeriodRules: [],
    fixedSlots: [],
    subjectAllocations: [],
    schedulingRules: [],
    classTeacherPreferences: { enabled: false, ctFirstPeriodDays: [], dailyPrimaryMinPeriods: 0, schedulingMode: "STRICT" },
    legacyEngineOptions: { restarts: 2, localSearchIterations: 0 },
  });
  const mathLessons = out.entries.filter((e) => e.subjectId === "sub-math" && !e.isFreePeriod);
  const teacherIds = new Set(mathLessons.map((e) => e.teacherId));
  assert.ok(mathLessons.length >= 2);
  assert.ok(teacherIds.size >= 2, `expected >= 2 teachers, got ${[...teacherIds].join(",")}`);
});

test("teamTeachingAllowed on lock entry permits second teacher", () => {
  const divisions = [{ id: divId, name: "1-A", standardId: std, mediumId: med }];
  const out = runTimetableEngine({
    divisions,
    subjects: [{ ...subjectMath, allowTeamTeaching: false }],
    teachers: [teacher("t-a"), teacher("t-b")],
    periodSlots,
    workingDays,
    teacherSubjects: [
      { subjectId: "sub-math", teacherId: "t-a", divisionId: divId },
      { subjectId: "sub-math", teacherId: "t-b", divisionId: divId },
    ],
    divisionSubjectTeacherLocks: [
      { divisionId: divId, subjectId: "sub-math", teacherId: "t-a", teamTeachingAllowed: true },
    ],
    freePeriodRules: [],
    fixedSlots: [],
    subjectAllocations: [],
    schedulingRules: [],
    classTeacherPreferences: { enabled: false, schedulingMode: "STRICT" },
    legacyEngineOptions: { restarts: 2, localSearchIterations: 0 },
  });
  const mathLessons = out.entries.filter((e) => e.subjectId === "sub-math" && !e.isFreePeriod);
  const teacherIds = new Set(mathLessons.map((e) => e.teacherId));
  assert.ok(teacherIds.has("t-a"));
  assert.ok(teacherIds.size >= 2 || mathLessons.length >= 2);
});

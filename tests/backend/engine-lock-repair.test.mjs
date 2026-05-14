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
];

const workingDays = ["MONDAY", "TUESDAY"];

const subjectMath = {
  id: "sub-math",
  name: "Math",
  code: "MAT",
  category: "CORE",
  weeklyPeriods: 3,
  maxPerDay: 3,
  priorityWeight: 8,
  colorHex: "#000",
  mediumIds: [med],
  standardIds: [std],
  divisionScopeMode: "ALL_IN_SELECTED_CLASSES",
  divisionIncludeIds: [],
  divisionExcludeIds: [],
  divisionLimits: [],
  isActive: true,
};

function teacher(id, assignedDivisionIds) {
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
    assignedDivisionIds,
    classTeacherDivisionIds: [],
    primaryClassTeacherDivisionId: null,
    divisionSubjectExclusions: [],
  };
}

test("teacherSubjects singleton pre-locks so only assigned teacher teaches that subject", () => {
  const divisions = [{ id: divId, name: "1-A", standardId: std, mediumId: med }];
  const tGen = teacher("t-general", []);
  const tSpec = teacher("t-spec", [divId]);
  const out = runTimetableEngine({
    divisions,
    subjects: [subjectMath],
    teachers: [tGen, tSpec],
    periodSlots,
    workingDays,
    teacherSubjects: [{ teacherId: "t-spec", subjectId: "sub-math", divisionId: divId }],
    freePeriodRules: [],
    fixedSlots: [],
    subjectAllocations: [],
    schedulingRules: [],
    classTeacherPreferences: { enabled: false, ctFirstPeriodDays: [], dailyPrimaryMinPeriods: 0, schedulingMode: "STRICT" },
  });
  const mathLessons = out.entries.filter((e) => e.subjectId === "sub-math" && !e.isFreePeriod);
  assert.equal(mathLessons.length, 3);
  assert.ok(mathLessons.every((e) => e.teacherId === "t-spec"));
});

import test from "node:test";
import assert from "node:assert/strict";
import { createPlacementValidatorContext } from "../../shared/timetablePlacementValidator.js";
import {
  collectAddLessonDiagnostics,
  findRepairPlansForAdd,
} from "../../shared/timetableRepairSuggestions.js";

const med = "med-en";
const std = "std-5";
const divA = "motion-div-a";
const divB = "motion-div-b";

const state = {
  divisions: [
    { id: divA, name: "A", standardId: std, mediumId: med },
    { id: divB, name: "B", standardId: std, mediumId: med },
  ],
  subjects: [
    {
      id: "sub-a",
      name: "Math",
      code: "MAT",
      category: "CORE",
      weeklyPeriods: 4,
      maxPerDay: 2,
      mediumIds: [med],
      standardIds: [std],
    },
    {
      id: "sub-b",
      name: "Sci",
      code: "SCI",
      category: "CORE",
      weeklyPeriods: 4,
      maxPerDay: 2,
      mediumIds: [med],
      standardIds: [std],
    },
  ],
  teachers: [
    {
      id: "t-1",
      firstName: "A",
      lastName: "One",
      maxPerDay: 8,
      maxPerWeek: 40,
      mediumIds: [med],
      subjectIds: ["sub-a", "sub-b"],
      assignedDivisionIds: [],
      freeMorningPeriods: 0,
      freeEveningPeriods: 0,
    },
  ],
  periodSlots: [
    { slotNumber: 1, slotType: "LESSON", activeWeekdays: ["MONDAY", "TUESDAY"] },
    { slotNumber: 2, slotType: "LESSON", activeWeekdays: ["MONDAY", "TUESDAY"] },
  ],
  workingDays: ["MONDAY", "TUESDAY"],
  schedulingRules: [],
  teacherSubjects: [],
  divisionSubjectTeacherLocks: [],
  freePeriodRules: [],
  subjectAllocations: [],
};

const entries = [
  {
    divisionId: divA,
    dayOfWeek: "TUESDAY",
    slotNumber: 1,
    subjectId: null,
    teacherId: null,
    isFreePeriod: true,
    slotType: "LESSON",
    label: "Free",
  },
  {
    divisionId: divA,
    dayOfWeek: "TUESDAY",
    slotNumber: 2,
    subjectId: null,
    teacherId: null,
    isFreePeriod: true,
    slotType: "LESSON",
    label: "Free",
  },
  {
    divisionId: divB,
    dayOfWeek: "TUESDAY",
    slotNumber: 1,
    subjectId: "sub-b",
    teacherId: "t-1",
    isFreePeriod: false,
    slotType: "LESSON",
  },
  {
    divisionId: divB,
    dayOfWeek: "TUESDAY",
    slotNumber: 2,
    subjectId: null,
    teacherId: null,
    isFreePeriod: true,
    slotType: "LESSON",
    label: "Free",
  },
];

test("collectAddLessonDiagnostics lists teacher slot blockers", () => {
  const ctx = createPlacementValidatorContext(state, entries);
  const diag = collectAddLessonDiagnostics(ctx, state, divA, "TUESDAY", 1);
  assert.equal(diag.cellAddable, true);
  assert.ok(diag.teacherSlotBlockers.length > 0);
  assert.equal(diag.teacherSlotBlockers[0].reasonCode, "TEACHER_SLOT_TAKEN");
});

test("findRepairPlansForAdd proposes move to free period", () => {
  const ctx = createPlacementValidatorContext(state, entries);
  const plans = findRepairPlansForAdd(ctx, state, divA, "TUESDAY", 1);
  assert.ok(plans.length > 0);
  assert.equal(plans[0].steps[0].operation, "MOVE");
  assert.equal(plans[0].steps[0].kind, "MOVE_TO_FREE");
});

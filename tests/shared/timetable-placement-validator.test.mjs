import test from "node:test";
import assert from "node:assert/strict";
import {
  applyManualEditToEntries,
  createPlacementValidatorContext,
  validateManualEdit,
} from "../../shared/timetablePlacementValidator.js";

const med = "med-en";
const std = "std-5";

const periodSlots = [
  { slotNumber: 1, slotType: "LESSON", label: "P1", activeWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY"] },
  { slotNumber: 2, slotType: "LESSON", label: "P2", activeWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY"] },
  { slotNumber: 3, slotType: "LUNCH", label: "Lunch" },
];

const workingDays = ["MONDAY", "TUESDAY", "WEDNESDAY"];

function baseState(divisions, entries, extra = {}) {
  return {
    divisions,
    subjects: [
      {
        id: "sub-a",
        name: "Math",
        code: "MAT",
        category: "CORE",
        weeklyPeriods: 4,
        maxPerDay: 2,
        priorityWeight: 5,
        mediumIds: [med],
        standardIds: [std],
        isActive: true,
      },
      {
        id: "sub-b",
        name: "Sci",
        code: "SCI",
        category: "CORE",
        weeklyPeriods: 4,
        maxPerDay: 2,
        priorityWeight: 5,
        mediumIds: [med],
        standardIds: [std],
        isActive: true,
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
      {
        id: "t-2",
        firstName: "B",
        lastName: "Two",
        maxPerDay: 8,
        maxPerWeek: 40,
        mediumIds: [med],
        subjectIds: ["sub-a", "sub-b"],
        assignedDivisionIds: [],
        freeMorningPeriods: 0,
        freeEveningPeriods: 0,
      },
    ],
    periodSlots,
    workingDays,
    schedulingRules: [],
    teacherSubjects: [],
    divisionSubjectTeacherLocks: [],
    freePeriodRules: [],
    subjectAllocations: [],
    ...extra,
  };
}

function lessonEntry(divisionId, day, slot, subjectId, teacherId) {
  return {
    divisionId,
    dayOfWeek: day,
    slotNumber: slot,
    subjectId,
    teacherId,
    isFreePeriod: false,
    slotType: "LESSON",
  };
}

function freeEntry(divisionId, day, slot) {
  return {
    divisionId,
    dayOfWeek: day,
    slotNumber: slot,
    subjectId: null,
    teacherId: null,
    isFreePeriod: true,
    slotType: "LESSON",
    label: "Free",
  };
}

test("validateManualEdit allows same-division lesson swap when teachers are free", () => {
  const divId = "motion-div-1";
  const entries = [
    lessonEntry(divId, "MONDAY", 1, "sub-a", "t-1"),
    lessonEntry(divId, "MONDAY", 2, "sub-b", "t-2"),
    freeEntry(divId, "TUESDAY", 1),
    freeEntry(divId, "TUESDAY", 2),
    freeEntry(divId, "WEDNESDAY", 1),
    freeEntry(divId, "WEDNESDAY", 2),
  ];
  const state = baseState([{ id: divId, name: "A", standardId: std, mediumId: med }], entries);
  const ctx = createPlacementValidatorContext(state, entries);
  const result = validateManualEdit(
    ctx,
    state,
    { divisionId: divId, dayOfWeek: "MONDAY", slotNumber: 1 },
    { divisionId: divId, dayOfWeek: "MONDAY", slotNumber: 2 },
    "SWAP",
  );
  assert.equal(result.valid, true);
  assert.equal(result.kind, "SWAP");
});

test("validateManualEdit rejects swap when target teacher is busy elsewhere", () => {
  const divA = "div-a";
  const divB = "div-b";
  const divC = "div-c";
  const entries = [
    lessonEntry(divA, "MONDAY", 1, "sub-a", "t-1"),
    lessonEntry(divB, "MONDAY", 1, "sub-b", "t-2"),
    lessonEntry(divC, "MONDAY", 1, "sub-a", "t-1"),
    freeEntry(divA, "MONDAY", 2),
    freeEntry(divB, "MONDAY", 2),
    freeEntry(divC, "MONDAY", 2),
  ];
  const state = baseState(
    [
      { id: divA, name: "A", standardId: std, mediumId: med },
      { id: divB, name: "B", standardId: std, mediumId: med },
      { id: divC, name: "C", standardId: std, mediumId: med },
    ],
    entries,
  );
  const ctx = createPlacementValidatorContext(state, entries);
  const result = validateManualEdit(
    ctx,
    state,
    { divisionId: divA, dayOfWeek: "MONDAY", slotNumber: 1 },
    { divisionId: divB, dayOfWeek: "MONDAY", slotNumber: 1 },
    "SWAP",
  );
  assert.equal(result.valid, false);
  assert.equal(result.reasonCode, "TEACHER_SLOT_TAKEN");
});

test("validateManualEdit allows move to free in same division", () => {
  const divId = "div-a";
  const entries = [
    lessonEntry(divId, "MONDAY", 1, "sub-a", "t-1"),
    freeEntry(divId, "MONDAY", 2),
    freeEntry(divId, "TUESDAY", 1),
    freeEntry(divId, "TUESDAY", 2),
  ];
  const state = baseState([{ id: divId, name: "A", standardId: std, mediumId: med }], entries);
  const ctx = createPlacementValidatorContext(state, entries);
  const result = validateManualEdit(
    ctx,
    state,
    { divisionId: divId, dayOfWeek: "MONDAY", slotNumber: 1 },
    { divisionId: divId, dayOfWeek: "MONDAY", slotNumber: 2 },
    "MOVE",
  );
  assert.equal(result.valid, true);
  assert.equal(result.kind, "MOVE_TO_FREE");
  const applied = applyManualEditToEntries(entries, "MOVE", { divisionId: divId, dayOfWeek: "MONDAY", slotNumber: 1 }, { divisionId: divId, dayOfWeek: "MONDAY", slotNumber: 2 });
  assert.equal(applied.changed, true);
  const atFree = applied.entries.find((e) => Number(e.slotNumber) === 2 && e.dayOfWeek === "MONDAY");
  assert.equal(atFree.subjectId, "sub-a");
  assert.equal(atFree.teacherId, "t-1");
});

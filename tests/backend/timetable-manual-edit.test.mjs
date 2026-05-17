import test from "node:test";
import assert from "node:assert/strict";
import {
  applyTimetableEdit,
  getValidAddOptions,
  getValidEditTargets,
  resolveTimetableEditPayload,
} from "../../server/services/timetableManualEditService.js";

const med = "med-en";
const std = "std-5";
const divId = "div-a";

const periodSlots = [
  { slotNumber: 1, slotType: "LESSON", activeWeekdays: ["MONDAY", "TUESDAY"] },
  { slotNumber: 2, slotType: "LESSON", activeWeekdays: ["MONDAY", "TUESDAY"] },
];

const state = {
  divisions: [{ id: divId, name: "A", standardId: std, mediumId: med }],
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
  workingDays: ["MONDAY", "TUESDAY"],
  schedulingRules: [],
  teacherSubjects: [],
  divisionSubjectTeacherLocks: [],
  freePeriodRules: [],
  subjectAllocations: [],
};

const entries = [
  {
    divisionId: divId,
    dayOfWeek: "MONDAY",
    slotNumber: 1,
    subjectId: "sub-a",
    teacherId: "t-1",
    isFreePeriod: false,
    slotType: "LESSON",
  },
  {
    divisionId: divId,
    dayOfWeek: "MONDAY",
    slotNumber: 2,
    subjectId: "sub-b",
    teacherId: "t-2",
    isFreePeriod: false,
    slotType: "LESSON",
  },
  {
    divisionId: divId,
    dayOfWeek: "TUESDAY",
    slotNumber: 1,
    subjectId: null,
    teacherId: null,
    isFreePeriod: true,
    slotType: "LESSON",
    label: "Free",
  },
  {
    divisionId: divId,
    dayOfWeek: "TUESDAY",
    slotNumber: 2,
    subjectId: null,
    teacherId: null,
    isFreePeriod: true,
    slotType: "LESSON",
    label: "Free",
  },
];

test("resolveTimetableEditPayload prefers run entries and state_json", () => {
  const resolved = resolveTimetableEditPayload({
    body: {},
    runRow: {
      id: "run-1",
      entries_json: JSON.stringify(entries),
      state_json: JSON.stringify(state),
    },
    tenantStateRow: null,
  });
  assert.equal(resolved.runId, "run-1");
  assert.equal(resolved.entries.length, 4);
  assert.equal(resolved.state.divisions[0].id, divId);
});

test("getValidEditTargets marks swap and free-move cells", () => {
  const out = getValidEditTargets({
    entries,
    state,
    source: { divisionId: divId, dayOfWeek: "MONDAY", slotNumber: 1 },
    scopeDivisionId: divId,
  });
  assert.ok(!out.error);
  const swapTarget = out.targets.find(
    (t) => t.dayOfWeek === "MONDAY" && t.slotNumber === 2,
  );
  assert.equal(swapTarget.valid, true);
  assert.equal(swapTarget.kind, "SWAP");
  const moveTarget = out.targets.find(
    (t) => t.dayOfWeek === "TUESDAY" && t.slotNumber === 1,
  );
  assert.equal(moveTarget.valid, true);
  assert.equal(moveTarget.kind, "MOVE_TO_FREE");
});

test("applyTimetableEdit atomically returns updated entries or reasons", () => {
  const ok = applyTimetableEdit({
    entries,
    state,
    operation: "SWAP",
    source: { divisionId: divId, dayOfWeek: "MONDAY", slotNumber: 1 },
    target: { divisionId: divId, dayOfWeek: "MONDAY", slotNumber: 2 },
  });
  assert.equal(ok.ok, true);
  const p1 = ok.entries.find((e) => e.dayOfWeek === "MONDAY" && Number(e.slotNumber) === 1);
  const p2 = ok.entries.find((e) => e.dayOfWeek === "MONDAY" && Number(e.slotNumber) === 2);
  assert.equal(p1.subjectId, "sub-b");
  assert.equal(p2.subjectId, "sub-a");

  const bad = applyTimetableEdit({
    entries,
    state,
    operation: "SWAP",
    source: { divisionId: divId, dayOfWeek: "MONDAY", slotNumber: 1 },
    target: { divisionId: divId, dayOfWeek: "MONDAY", slotNumber: 1 },
  });
  assert.ok(bad.error);
  assert.ok(Array.isArray(bad.reasons) || bad.error);
});

test("getValidAddOptions lists subjects with remaining quota on free cell", () => {
  const out = getValidAddOptions({
    entries,
    state,
    divisionId: divId,
    dayOfWeek: "TUESDAY",
    slotNumber: 1,
  });
  assert.ok(!out.error);
  assert.equal(out.addable, true);
  const subA = out.subjects.find((s) => s.subjectId === "sub-a");
  assert.ok(subA);
  assert.ok(subA.remaining > 0);
  assert.ok(Array.isArray(out.teachersBySubject["sub-a"]));
  assert.ok(out.teachersBySubject["sub-a"].length > 0);
});

test("applyTimetableEdit ADD places lesson on free period", () => {
  const ok = applyTimetableEdit({
    entries,
    state,
    operation: "ADD",
    target: { divisionId: divId, dayOfWeek: "TUESDAY", slotNumber: 1 },
    subjectId: "sub-b",
    teacherId: "t-2",
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.operation, "ADD");
  const cell = ok.entries.find((e) => e.dayOfWeek === "TUESDAY" && Number(e.slotNumber) === 1);
  assert.equal(cell.subjectId, "sub-b");
  assert.equal(cell.teacherId, "t-2");
  assert.equal(cell.isFreePeriod, false);
});

test("getValidAddOptions omits subject at weekly cap", () => {
  const cappedState = {
    ...state,
    subjects: state.subjects.map((s) =>
      s.id === "sub-a" ? { ...s, weeklyPeriods: 1 } : s,
    ),
  };
  const out = getValidAddOptions({
    entries,
    state: cappedState,
    divisionId: divId,
    dayOfWeek: "TUESDAY",
    slotNumber: 1,
  });
  assert.ok(!out.subjects.some((s) => s.subjectId === "sub-a"));
});

test("getValidAddOptions returns diagnostics and repair plan for teacher conflict", () => {
  const divB = "div-b";
  const conflictState = {
    ...state,
    teachers: state.teachers.filter((t) => t.id === "t-1"),
    divisions: [...state.divisions, { id: divB, name: "B", standardId: std, mediumId: med }],
  };
  const conflictEntries = [
    ...entries,
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
  const out = getValidAddOptions({
    entries: conflictEntries,
    state: conflictState,
    divisionId: divId,
    dayOfWeek: "TUESDAY",
    slotNumber: 1,
  });
  assert.ok(!out.error);
  assert.equal(out.addable, false);
  assert.ok(Array.isArray(out.repairPlans));
  assert.ok(out.repairPlans.length > 0, "expected at least one repair plan");
  assert.ok(
    (out.diagnostics?.teacherSlotBlockers || []).some((b) => b.reasonCode === "TEACHER_SLOT_TAKEN"),
    "expected TEACHER_SLOT_TAKEN blocker",
  );
  const plan = out.repairPlans[0];
  assert.ok(plan.steps.length >= 1);
  assert.ok(plan.enablesAdd?.subjectId);
  assert.ok(plan.enablesAdd?.teacherId);
});

test("applyTimetableEdit ADD rejects busy teacher", () => {
  const divB = "motion-div-b";
  const busyState = {
    ...state,
    divisions: [...state.divisions, { id: divB, name: "B", standardId: std, mediumId: med }],
  };
  const busyEntries = [
    ...entries,
    {
      divisionId: divB,
      dayOfWeek: "TUESDAY",
      slotNumber: 1,
      subjectId: "sub-b",
      teacherId: "t-1",
      isFreePeriod: false,
      slotType: "LESSON",
    },
  ];
  const bad = applyTimetableEdit({
    entries: busyEntries,
    state: busyState,
    operation: "ADD",
    target: { divisionId: divId, dayOfWeek: "TUESDAY", slotNumber: 1 },
    subjectId: "sub-a",
    teacherId: "t-1",
  });
  assert.ok(!bad.ok);
  assert.ok(bad.reasons?.some((r) => r.reasonCode === "TEACHER_SLOT_TAKEN") || /teacher/i.test(bad.error || ""));
});

import test from "node:test";
import assert from "node:assert/strict";
import { validateTimetableRun } from "../../server/services/timetableValidationService.js";
import { applyLowRiskAutoFixes } from "../../server/services/timetableAutoFixService.js";

function buildBaseState() {
  return {
    standards: [{ id: "std-5", name: "5" }],
    divisions: [{ id: "div-a", name: "A", standardId: "std-5", mediumId: "med-en" }],
    subjects: [
      {
        id: "sub-math",
        name: "Math",
        standardIds: ["std-5"],
        mediumIds: ["med-en"],
        divisionScopeMode: "ALL_IN_SELECTED_CLASSES",
        weeklyPeriods: 2,
        maxPerDay: 1,
        divisionLimits: [],
      },
      {
        id: "sub-music",
        name: "Music",
        standardIds: ["std-5"],
        mediumIds: ["med-en"],
        divisionScopeMode: "CUSTOM_DIVISION_OVERRIDES",
        divisionIncludeIds: [],
        divisionExcludeIds: ["div-a"],
        weeklyPeriods: 1,
        maxPerDay: 1,
        divisionLimits: [],
      },
    ],
    teachers: [
      {
        id: "t-1",
        firstName: "John",
        lastName: "Doe",
        freeMorningPeriods: 0,
        freeEveningPeriods: 0,
        maxPerWeek: 2,
      },
    ],
    workingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
    periodSlots: [
      { slotNumber: 1, slotType: "LESSON" },
      { slotNumber: 2, slotType: "LESSON" },
      { slotNumber: 3, slotType: "LUNCH" },
      { slotNumber: 4, slotType: "LESSON" },
    ],
  };
}

function buildOverflowEntries() {
  return [
    { divisionId: "div-a", dayOfWeek: "MONDAY", slotNumber: 1, slotType: "LESSON", subjectId: "sub-math", teacherId: "t-1", isFreePeriod: false },
    { divisionId: "div-a", dayOfWeek: "MONDAY", slotNumber: 2, slotType: "LESSON", subjectId: "sub-math", teacherId: "t-1", isFreePeriod: false },
    { divisionId: "div-a", dayOfWeek: "TUESDAY", slotNumber: 1, slotType: "LESSON", subjectId: "sub-math", teacherId: "t-1", isFreePeriod: false },
    { divisionId: "div-a", dayOfWeek: "WEDNESDAY", slotNumber: 1, slotType: "LESSON", subjectId: "sub-music", teacherId: "t-1", isFreePeriod: false },
  ];
}

test("validation emits weekly/daily/applicability/teacher-cap findings", () => {
  const state = buildBaseState();
  const entries = buildOverflowEntries();
  const out = validateTimetableRun({ state, entries, runId: "run-1" });
  const codes = new Set(out.findings.map((f) => f.code));

  assert.equal(codes.has("SUBJECT_WEEKLY_OVERFLOW"), true);
  assert.equal(codes.has("SUBJECT_DAILY_OVERFLOW"), true);
  assert.equal(codes.has("SUBJECT_APPLICABILITY_MISMATCH"), true);
  assert.equal(codes.has("TEACHER_WEEKLY_OVERLOAD"), true);
  assert.ok(out.summary.total >= 4);
});

test("auto-fix removes only low-risk safe findings", () => {
  const state = buildBaseState();
  const entries = buildOverflowEntries();
  const validation = validateTimetableRun({ state, entries, runId: "run-2" });
  const fixed = applyLowRiskAutoFixes({ entries, findings: validation.findings });

  const mathAfter = fixed.entries.filter((e) => e.subjectId === "sub-math").length;
  const musicAfter = fixed.entries.filter((e) => e.subjectId === "sub-music").length;
  assert.equal(mathAfter <= 2, true);
  assert.equal(musicAfter, 0);

  const overload = fixed.findings.find((f) => f.code === "TEACHER_WEEKLY_OVERLOAD");
  assert.ok(overload);
  assert.equal(overload.autoApplied, false);
  assert.equal(overload.status, "PENDING_REVIEW");
});

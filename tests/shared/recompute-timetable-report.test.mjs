import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSubjectWeeklyCountsFromEntries,
  isLessonPlacementEntry,
  mergeLiveReportFromEntries,
  recomputeTimetableMetricsFromEntries,
  recomputeUnscheduledFromEntries,
  withLiveTimetableReport,
} from "../../shared/recomputeTimetableReport.js";

const med = "med-1";
const std = "std-5";
const divId = "motion-div-a";

const state = {
  divisions: [{ id: divId, name: "A", standardId: std, mediumId: med }],
  subjects: [
    {
      id: "sub-a",
      name: "Math",
      weeklyPeriods: 4,
      maxPerDay: 2,
      mediumIds: [med],
      standardIds: [std],
    },
    {
      id: "sub-b",
      name: "Sci",
      weeklyPeriods: 2,
      maxPerDay: 2,
      mediumIds: [med],
      standardIds: [std],
    },
  ],
  subjectAllocations: [],
};

function lesson(overrides) {
  return {
    divisionId: divId,
    dayOfWeek: "MONDAY",
    slotNumber: 1,
    subjectId: "sub-a",
    teacherId: "t-1",
    isFreePeriod: false,
    slotType: "LESSON",
    ...overrides,
  };
}

test("isLessonPlacementEntry excludes free and break rows", () => {
  assert.equal(isLessonPlacementEntry(lesson({})), true);
  assert.equal(isLessonPlacementEntry(lesson({ isFreePeriod: true })), false);
  assert.equal(isLessonPlacementEntry(lesson({ slotType: "BREAK" })), false);
  assert.equal(isLessonPlacementEntry(lesson({ subjectId: null })), false);
});

test("recomputeUnscheduledFromEntries reflects added lessons", () => {
  const base = [lesson({ slotNumber: 1 }), lesson({ slotNumber: 2, dayOfWeek: "TUESDAY" })];
  const gaps = recomputeUnscheduledFromEntries(state, base);
  const mathGap = gaps.find((g) => g.subjectId === "sub-a");
  assert.ok(mathGap);
  assert.equal(mathGap.periodsRequired, 4);
  assert.equal(mathGap.periodsScheduled, 2);
  assert.equal(mathGap.periodsShort, 2);

  const filled = [
    ...base,
    lesson({ slotNumber: 3, dayOfWeek: "MONDAY" }),
    lesson({ slotNumber: 4, dayOfWeek: "TUESDAY" }),
  ];
  const after = recomputeUnscheduledFromEntries(state, filled);
  assert.equal(after.find((g) => g.subjectId === "sub-a"), undefined);
});

test("mergeLiveReportFromEntries updates totals and keeps generate metadata", () => {
  const entries = [lesson({ slotNumber: 1 }), lesson({ slotNumber: 2, dayOfWeek: "TUESDAY" })];
  const baseReport = {
    rejections: { TEACHER_SLOT_TAKEN: 3 },
    optimization: { mode: "STRICT" },
    unscheduled: [{ divisionId: divId, subjectId: "sub-a", periodsShort: 99 }],
  };
  const merged = mergeLiveReportFromEntries(state, entries, baseReport);
  assert.equal(merged.rejections.TEACHER_SLOT_TAKEN, 3);
  assert.equal(merged.optimization.mode, "STRICT");
  assert.equal(merged.liveFromEntries, true);
  assert.equal(merged.unscheduled.length, 2);
  assert.equal(merged.totalScheduled, 2);
  assert.equal(merged.totalRequired, 6);
  assert.equal(merged.objective.unscheduledShort, 4);
});

test("withLiveTimetableReport updates score from entries", () => {
  const timetable = {
    score: 40,
    status: "INFEASIBLE",
    sourceState: state,
    entries: [
      lesson({ slotNumber: 1 }),
      lesson({ slotNumber: 2, dayOfWeek: "TUESDAY" }),
      lesson({ slotNumber: 3, dayOfWeek: "MONDAY", subjectId: "sub-b" }),
      lesson({ slotNumber: 4, dayOfWeek: "TUESDAY", subjectId: "sub-b" }),
    ],
    report: { totalScheduled: 1, totalRequired: 6, unscheduled: [] },
  };
  const live = withLiveTimetableReport(timetable);
  assert.equal(live.score, 67);
  assert.equal(live.report.totalScheduled, 4);
  assert.equal(live.report.unscheduled.length, 1);
  assert.equal(live.report.unscheduled[0].periodsShort, 2);
});

test("buildSubjectWeeklyCountsFromEntries keys by division and subject", () => {
  const counts = buildSubjectWeeklyCountsFromEntries([
    lesson({}),
    lesson({ slotNumber: 2, subjectId: "sub-b" }),
  ]);
  assert.equal(counts.get(`${divId}:sub-a`), 1);
  assert.equal(counts.get(`${divId}:sub-b`), 1);
});

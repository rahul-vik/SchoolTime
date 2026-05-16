import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTeacherWorkloadStats,
  compareTeacherWorkloadStats,
  countTeacherTeachingPeriods,
  hasTimetableForWorkload,
  sortTeachersByWorkloadAsc,
  sortTeacherWorkloadRowsAsc,
} from "../../shared/teacherWorkload.js";

test("countTeacherTeachingPeriods ignores free and break rows", () => {
  const entries = [
    { teacherId: "t1", subjectId: "s1", slotType: "LESSON" },
    { teacherId: "t1", isFreePeriod: true, slotType: "LESSON" },
    { teacherId: "t1", subjectId: "s1", slotType: "BREAK" },
    { teacherId: "t2", subjectId: "s2", slotType: "LESSON" },
  ];
  assert.equal(countTeacherTeachingPeriods("t1", entries), 1);
});

test("hasTimetableForWorkload when generated with entries", () => {
  assert.equal(hasTimetableForWorkload({ entries: [{ teacherId: "t1" }] }, "GENERATED"), true);
  assert.equal(hasTimetableForWorkload({ entries: [] }, "GENERATED"), false);
  assert.equal(hasTimetableForWorkload({ entries: [{ teacherId: "t1" }] }, "GENERATING"), false);
});

test("buildTeacherWorkloadStats respects configured weekly cap", () => {
  const periodSlots = [{ slotNumber: 1, slotType: "LESSON" }];
  const teacher = { id: "t1", freeMorningPeriods: 0, freeEveningPeriods: 0, maxPerWeek: 10 };
  const timetable = { entries: Array.from({ length: 8 }, () => ({ teacherId: "t1", subjectId: "s1", slotType: "LESSON" })) };
  const stats = buildTeacherWorkloadStats(teacher, timetable, periodSlots, ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]);
  assert.equal(stats.assigned, 8);
  assert.equal(stats.max, 10);
  assert.equal(stats.pct, 80);
});

test("sortTeachersByWorkloadAsc puts lightest load first", () => {
  const teachers = [
    { id: "heavy", firstName: "H", lastName: "Heavy" },
    { id: "light", firstName: "L", lastName: "Light" },
    { id: "mid", firstName: "M", lastName: "Mid" },
  ];
  const map = new Map([
    ["heavy", { assigned: 20, max: 20, pct: 100 }],
    ["light", { assigned: 2, max: 20, pct: 10 }],
    ["mid", { assigned: 10, max: 20, pct: 50 }],
  ]);
  assert.deepEqual(
    sortTeachersByWorkloadAsc(teachers, map).map((t) => t.id),
    ["light", "mid", "heavy"],
  );
});

test("sortTeacherWorkloadRowsAsc orders by pct then assigned", () => {
  const rows = [
    { teacher: { id: "b", firstName: "B", lastName: "Z" }, assigned: 5, pct: 50 },
    { teacher: { id: "a", firstName: "A", lastName: "A" }, assigned: 1, pct: 10 },
    { teacher: { id: "c", firstName: "C", lastName: "Y" }, assigned: 1, pct: 10 },
  ];
  const sorted = sortTeacherWorkloadRowsAsc(rows).map((r) => r.teacher.id);
  assert.deepEqual(sorted, ["a", "c", "b"]);
});

test("compareTeacherWorkloadStats prefers lower pct then fewer periods", () => {
  assert.ok(compareTeacherWorkloadStats({ pct: 10, assigned: 5 }, { pct: 20, assigned: 1 }) < 0);
  assert.ok(compareTeacherWorkloadStats({ pct: 10, assigned: 1 }, { pct: 10, assigned: 5 }) < 0);
  assert.equal(compareTeacherWorkloadStats({ pct: 10, assigned: 5 }, { pct: 10, assigned: 5 }), 0);
});

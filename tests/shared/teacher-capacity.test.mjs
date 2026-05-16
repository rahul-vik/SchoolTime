import test from "node:test";
import assert from "node:assert/strict";
import {
  formatTeacherCapacitySummary,
  getTeacherEffectiveCapacity,
  normalizeTeacherCapacityOnSave,
} from "../../shared/teacherCapacity.js";

const periodSlots = [
  { slotNumber: 1, slotType: "LESSON" },
  { slotNumber: 2, slotType: "LESSON" },
  { slotNumber: 3, slotType: "LESSON" },
  { slotNumber: 4, slotType: "LESSON" },
  { slotNumber: 5, slotType: "LESSON" },
  { slotNumber: 6, slotType: "LESSON" },
];
const workingDays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

test("normalizeTeacherCapacityOnSave keeps 0 when weekly cap not set", () => {
  const teacher = { freeMorningPeriods: 0, freeEveningPeriods: 0, maxPerWeek: 0 };
  const saved = normalizeTeacherCapacityOnSave(teacher, periodSlots, workingDays);
  assert.equal(saved.maxPerWeek, 0);
});

test("normalizeTeacherCapacityOnSave stores explicit weekly cap", () => {
  const teacher = { freeMorningPeriods: 0, freeEveningPeriods: 0, maxPerWeek: 18 };
  const saved = normalizeTeacherCapacityOnSave(teacher, periodSlots, workingDays);
  assert.equal(saved.maxPerWeek, 18);
});

test("getTeacherEffectiveCapacity uses configured weekly for engine parity", () => {
  const teacher = { freeMorningPeriods: 0, freeEveningPeriods: 0, maxPerWeek: 18 };
  const cap = getTeacherEffectiveCapacity(teacher, periodSlots, workingDays);
  assert.equal(cap.effectiveWeekly, 18);
  assert.equal(cap.hasConfiguredWeekly, true);
});

test("formatTeacherCapacitySummary shows set label when configured", () => {
  const teacher = { freeMorningPeriods: 0, freeEveningPeriods: 0, maxPerWeek: 20 };
  const line = formatTeacherCapacitySummary(teacher, periodSlots, workingDays);
  assert.match(line, /20\/wk \(set\)/);
});

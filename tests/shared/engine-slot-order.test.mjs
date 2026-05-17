import test from "node:test";
import assert from "node:assert/strict";
import { buildSlotOrderForPlacement, rotateLessonSlots } from "../../shared/engineSlotOrder.js";

const slots = [
  { slotNumber: 1 },
  { slotNumber: 2 },
  { slotNumber: 3 },
  { slotNumber: 4 },
];

test("rotateLessonSlots shifts starting period", () => {
  const r = rotateLessonSlots(slots, 2);
  assert.deepEqual(
    r.map((s) => s.slotNumber),
    [3, 4, 1, 2],
  );
});

test("buildSlotOrderForPlacement varies by day and subject", () => {
  const mon = buildSlotOrderForPlacement(slots, { attemptSeed: 3, dayIndex: 0, subjectId: "sub-a" }).map((s) => s.slotNumber);
  const tue = buildSlotOrderForPlacement(slots, { attemptSeed: 3, dayIndex: 1, subjectId: "sub-a" }).map((s) => s.slotNumber);
  const other = buildSlotOrderForPlacement(slots, { attemptSeed: 3, dayIndex: 0, subjectId: "sub-b" }).map((s) => s.slotNumber);
  assert.notDeepEqual(mon, tue);
  assert.notDeepEqual(mon, other);
});

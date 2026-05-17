import test from "node:test";
import assert from "node:assert/strict";
import { runTimetableEngine } from "../../server/engine.js";

function countDistinctSlotsForSubject(entries, divisionId, subjectId) {
  const nums = entries
    .filter((e) => e.divisionId === divisionId && e.subjectId === subjectId && !e.isFreePeriod)
    .map((e) => Number(e.slotNumber));
  return new Set(nums).size;
}

test("rotating slot order and period spread reduce single-column subjects when possible", () => {
  const tenant = {
    workingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
    standards: [{ id: "st1", name: "8", sortOrder: 1 }],
    divisions: [{ id: "div-a", name: "A", standardId: "st1", mediumId: "m1" }],
    subjects: [
      {
        id: "sub-math",
        name: "Math",
        code: "M",
        category: "CORE",
        weeklyPeriods: 5,
        maxPerDay: 1,
        priorityWeight: 10,
        mediumIds: ["m1"],
        standardIds: ["st1"],
      },
      {
        id: "sub-eng",
        name: "English",
        code: "E",
        category: "LANGUAGE",
        weeklyPeriods: 5,
        maxPerDay: 1,
        priorityWeight: 8,
        mediumIds: ["m1"],
        standardIds: ["st1"],
      },
    ],
    teachers: [
      {
        id: "t-math",
        firstName: "M",
        lastName: "T",
        subjectIds: ["sub-math"],
        mediumIds: ["m1"],
        assignedDivisionIds: ["motion-a"],
      },
      {
        id: "t-eng",
        firstName: "E",
        lastName: "T",
        subjectIds: ["sub-eng"],
        mediumIds: ["m1"],
        assignedDivisionIds: ["motion-a"],
      },
    ],
    periodSlots: [
      { slotNumber: 1, slotType: "LESSON", label: "P1" },
      { slotNumber: 2, slotType: "LESSON", label: "P2" },
      { slotNumber: 3, slotType: "LESSON", label: "P3" },
      { slotNumber: 4, slotType: "LESSON", label: "P4" },
      { slotNumber: 5, slotType: "LESSON", label: "P5" },
    ],
    schedulingRules: [],
    teacherSubjects: [],
    freePeriodRules: [],
    fixedSlots: [],
    subjectAllocations: [],
    classTeacherPreferences: { enabled: false, schedulingMode: "STRICT" },
    legacyEngineOptions: { restarts: 1, localSearchIterations: 0 },
  };

  tenant.teachers[0].assignedDivisionIds = ["div-a"];
  tenant.teachers[1].assignedDivisionIds = ["div-a"];

  const out = runTimetableEngine(tenant);
  assert.ok(out.report?.optimization?.periodSpread);
  const mathSlots = countDistinctSlotsForSubject(out.entries, "div-a", "sub-math");
  const engSlots = countDistinctSlotsForSubject(out.entries, "div-a", "sub-eng");
  assert.ok(mathSlots >= 2, `expected math across multiple periods, got ${mathSlots}`);
  assert.ok(engSlots >= 2, `expected english across multiple periods, got ${engSlots}`);
});

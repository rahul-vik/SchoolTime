import test from "node:test";
import assert from "node:assert/strict";
import { runTimetableEngine } from "../../server/engine.js";

const baseTenant = {
  workingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
  standards: [{ id: "st1", name: "8", sortOrder: 1 }],
  divisions: [{ id: "div-a", name: "A", standardId: "st1", mediumId: "m1" }],
  subjects: [
    {
      id: "sub-math",
      name: "Math",
      code: "M",
      category: "CORE",
      weeklyPeriods: 4,
      maxPerDay: 2,
      priorityWeight: 10,
      mediumIds: ["m1"],
      standardIds: ["st1"],
    },
    {
      id: "sub-eng",
      name: "English",
      code: "E",
      category: "LANGUAGE",
      weeklyPeriods: 3,
      maxPerDay: 2,
      priorityWeight: 8,
      mediumIds: ["m1"],
      standardIds: ["st1"],
    },
    {
      id: "sub-lab",
      name: "Lab",
      code: "L",
      category: "PRACTICAL",
      weeklyPeriods: 2,
      maxPerDay: 2,
      priorityWeight: 5,
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
      assignedDivisionIds: ["div-a"],
    },
    {
      id: "t-eng",
      firstName: "E",
      lastName: "T",
      subjectIds: ["sub-eng"],
      mediumIds: ["m1"],
      assignedDivisionIds: ["div-a"],
    },
    {
      id: "t-lab",
      firstName: "L",
      lastName: "T",
      subjectIds: ["sub-lab"],
      mediumIds: ["m1"],
      assignedDivisionIds: ["div-a"],
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
};

test("runTimetableEngine reports phased flow metadata and gap utilization pass", () => {
  const out = runTimetableEngine({ ...baseTenant, legacyEngineOptions: { restarts: 1, localSearchIterations: 0 } });
  assert.equal(out.report?.optimization?.subjectOrder, "phased");
  assert.ok(out.report?.optimization?.flowPhases?.CORE >= 1);
  assert.ok(out.report?.optimization?.flowPhases?.LANGUAGE >= 1);
  assert.ok(out.report?.optimization?.gapUtilization);
  const lessons = out.entries.filter((e) => !e.isFreePeriod && e.subjectId);
  assert.ok(lessons.length >= 7);
});

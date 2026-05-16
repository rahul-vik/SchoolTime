import test from "node:test";
import assert from "node:assert/strict";
import {
  divisionsForScheduling,
  isDivisionSchedulingPaused,
  scopeTenantForScheduling,
  teacherHasSchedulingScope,
} from "../../shared/divisionScheduling.js";

test("paused divisions excluded from scheduling list", () => {
  const divisions = [
    { id: "d1", standardId: "s1", mediumId: "m1", name: "A", schedulingPaused: false },
    { id: "d2", standardId: "s1", mediumId: "m1", name: "B", schedulingPaused: true },
  ];
  assert.equal(divisionsForScheduling(divisions).length, 1);
  assert.equal(divisionsForScheduling(divisions)[0].id, "d1");
  assert.equal(isDivisionSchedulingPaused(divisions[1]), true);
});

test("scopeTenantForScheduling filters teachers tied only to paused divisions", () => {
  const tenant = {
    divisions: [
      { id: "d1", standardId: "s1", mediumId: "m1", name: "A" },
      { id: "d2", standardId: "s1", mediumId: "m1", name: "B", schedulingPaused: true },
    ],
    subjects: [{ id: "sub1", standardIds: ["s1"], mediumIds: ["m1"], weeklyPeriods: 5 }],
    teachers: [
      { id: "t1", subjectIds: ["sub1"], mediumIds: ["m1"], assignedDivisionIds: ["d1"] },
      { id: "t2", subjectIds: ["sub1"], mediumIds: ["m1"], assignedDivisionIds: ["d2"] },
    ],
    schedulingRules: [],
  };
  const scoped = scopeTenantForScheduling(tenant);
  assert.equal(scoped.divisions.length, 1);
  assert.equal(scoped.teachers.length, 1);
  assert.equal(scoped.teachers[0].id, "t1");
  assert.equal(scoped._schedulingScope.pausedDivisionCount, 1);
});

test("unrestricted teacher remains when they can teach an active division", () => {
  const divisions = [
    { id: "d1", standardId: "s1", mediumId: "m1", name: "A" },
    { id: "d2", standardId: "s1", mediumId: "m1", name: "B", schedulingPaused: true },
  ];
  const subjects = [{ id: "sub1", standardIds: ["s1"], mediumIds: ["m1"], weeklyPeriods: 5 }];
  const teacher = { id: "t1", subjectIds: ["sub1"], mediumIds: ["m1"], assignedDivisionIds: [] };
  assert.equal(teacherHasSchedulingScope(teacher, divisionsForScheduling(divisions), subjects), true);
});

test("paused subjects excluded from scheduling scope", () => {
  const tenant = {
    divisions: [{ id: "d1", standardId: "s1", mediumId: "m1", name: "A" }],
    subjects: [
      { id: "sub1", standardIds: ["s1"], mediumIds: ["m1"], weeklyPeriods: 5 },
      { id: "sub2", standardIds: ["s1"], mediumIds: ["m1"], weeklyPeriods: 3, schedulingPaused: true },
    ],
    teachers: [{ id: "t1", subjectIds: ["sub1"], mediumIds: ["m1"], assignedDivisionIds: ["d1"] }],
    schedulingRules: [],
  };
  const scoped = scopeTenantForScheduling(tenant);
  assert.equal(scoped.subjects.length, 1);
  assert.equal(scoped.subjects[0].id, "sub1");
  assert.equal(scoped._schedulingScope.pausedSubjectCount, 1);
});

test("paused teachers excluded from scheduling scope", () => {
  const tenant = {
    divisions: [{ id: "d1", standardId: "s1", mediumId: "m1", name: "A" }],
    subjects: [{ id: "sub1", standardIds: ["s1"], mediumIds: ["m1"], weeklyPeriods: 5 }],
    teachers: [
      { id: "t1", subjectIds: ["sub1"], mediumIds: ["m1"], assignedDivisionIds: ["d1"] },
      { id: "t2", subjectIds: ["sub1"], mediumIds: ["m1"], assignedDivisionIds: ["d1"], schedulingPaused: true },
    ],
    schedulingRules: [],
  };
  const scoped = scopeTenantForScheduling(tenant);
  assert.equal(scoped.teachers.length, 1);
  assert.equal(scoped.teachers[0].id, "t1");
  assert.equal(scoped._schedulingScope.pausedTeacherCount, 1);
});

import test from "node:test";
import assert from "node:assert/strict";
import { migrateTenantState } from "../../server/services/tenantStateMigration.js";

const med = "med-en";
const std = "std-5";
const divId = "motion-div";

test("migrateTenantState defaults allowTeamTeaching and requiresDoublePeriod on subjects", () => {
  const { state, changed } = migrateTenantState({
    subjects: [{ id: "sub-a", name: "Math", weeklyPeriods: 4 }],
  });
  assert.equal(changed, true);
  assert.equal(state.subjects[0].allowTeamTeaching, false);
  assert.equal(state.subjects[0].requiresDoublePeriod, false);
});

test("migrateTenantState seeds divisionSubjectTeacherLocks from single teacher per division+subject", () => {
  const { state, changed } = migrateTenantState({
    divisions: [{ id: divId, standardId: std, mediumId: med }],
    subjects: [
      {
        id: "sub-math",
        mediumIds: [med],
        standardIds: [std],
        divisionScopeMode: "ALL_IN_SELECTED_CLASSES",
      },
    ],
    teachers: [{ id: "t-a" }, { id: "t-b" }],
    teacherSubjects: [{ divisionId: divId, subjectId: "sub-math", teacherId: "t-a" }],
  });
  assert.equal(changed, true);
  assert.equal(state.divisionSubjectTeacherLocks.length, 1);
  assert.deepEqual(state.divisionSubjectTeacherLocks[0], {
    divisionId: divId,
    subjectId: "sub-math",
    teacherId: "t-a",
  });
});

test("migrateTenantState dedupes locks and drops stale entity refs", () => {
  const { state, changed } = migrateTenantState({
    divisions: [{ id: divId, standardId: std, mediumId: med }],
    subjects: [{ id: "sub-math", mediumIds: [med], standardIds: [std] }],
    teachers: [{ id: "t-a" }],
    divisionSubjectTeacherLocks: [
      { divisionId: divId, subjectId: "sub-math", teacherId: "t-a", teamTeachingAllowed: true },
      { divisionId: divId, subjectId: "sub-math", teacherId: "t-a" },
      { divisionId: "gone", subjectId: "sub-math", teacherId: "t-a" },
    ],
  });
  assert.equal(changed, true);
  assert.equal(state.divisionSubjectTeacherLocks.length, 1);
  assert.equal(state.divisionSubjectTeacherLocks[0].teamTeachingAllowed, true);
});

test("migrateTenantState does not auto-lock when multiple teachers share division+subject", () => {
  const { state } = migrateTenantState({
    workingDays: ["MONDAY"],
    periodSlots: [],
    classTeacherPreferences: { enabled: false, schedulingMode: "STRICT" },
    divisionSubjectTeacherLocks: [],
    divisions: [{ id: divId, standardId: std, mediumId: med }],
    subjects: [
      {
        id: "sub-math",
        mediumIds: [med],
        standardIds: [std],
        divisionScopeMode: "ALL_IN_SELECTED_CLASSES",
        requiresDoublePeriod: false,
        allowTeamTeaching: false,
      },
    ],
    teachers: [{ id: "t-a" }, { id: "t-b" }],
    teacherSubjects: [
      { divisionId: divId, subjectId: "sub-math", teacherId: "t-a" },
      { divisionId: divId, subjectId: "sub-math", teacherId: "t-b" },
    ],
  });
  assert.equal(state.divisionSubjectTeacherLocks.length, 0);
});

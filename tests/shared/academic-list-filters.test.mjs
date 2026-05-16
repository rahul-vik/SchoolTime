import test from "node:test";
import assert from "node:assert/strict";
import {
  filterSubjectsList,
  filterTeachersList,
  subjectMatchesSearch,
  teacherMatchesSearch,
  teacherStandardIds,
} from "../../shared/academicListFilters.js";

test("subjectMatchesSearch matches name and code", () => {
  const sub = { name: "Mathematics", code: "MATH" };
  assert.equal(subjectMatchesSearch(sub, "math"), true);
  assert.equal(subjectMatchesSearch(sub, "hema"), true);
  assert.equal(subjectMatchesSearch(sub, "sci"), false);
});

test("filterSubjectsList by standards is multi-select OR", () => {
  const subjects = [
    { id: "s1", name: "A", code: "A", standardIds: ["std1"] },
    { id: "s2", name: "B", code: "B", standardIds: ["std2"] },
    { id: "s3", name: "C", code: "C", standardIds: ["std1", "std2"] },
  ];
  const one = filterSubjectsList(subjects, { standardIds: ["std1"] });
  assert.deepEqual(one.map((s) => s.id), ["s1", "s3"]);
  const two = filterSubjectsList(subjects, { standardIds: ["std1", "std2"] });
  assert.deepEqual(two.map((s) => s.id), ["s1", "s2", "s3"]);
});

test("filterTeachersList by subject and standard", () => {
  const subjects = [
    { id: "sub1", name: "Eng", code: "ENG", standardIds: ["std1"], mediumIds: ["m1"] },
    { id: "sub2", name: "Sci", code: "SCI", standardIds: ["std2"], mediumIds: ["m1"] },
  ];
  const divisions = [
    { id: "d1", name: "A", standardId: "std1", mediumId: "m1" },
    { id: "d2", name: "B", standardId: "std2", mediumId: "m1" },
  ];
  const teachers = [
    { id: "t1", firstName: "Ann", lastName: "Lee", employeeCode: "T1", subjectIds: ["sub1"], mediumIds: ["m1"] },
    { id: "t2", firstName: "Bob", lastName: "Kay", employeeCode: "T2", subjectIds: ["sub2"], assignedDivisionIds: ["d2"], mediumIds: ["m1"] },
    { id: "t3", firstName: "Cal", lastName: "May", employeeCode: "T3", subjectIds: [], classTeacherDivisionIds: ["d1"], mediumIds: ["m1"] },
  ];
  assert.deepEqual(
    filterTeachersList(teachers, { subjectIds: ["sub1"] }, subjects, divisions).map((t) => t.id),
    ["t1"],
  );
  assert.deepEqual(
    filterTeachersList(teachers, { standardIds: ["std1"] }, subjects, divisions).map((t) => t.id).sort(),
    ["t1", "t3"],
  );
  assert.equal(teacherStandardIds(teachers[2], subjects, divisions).has("std1"), true);
});

test("standard filter ignores subject standards outside assigned divisions", () => {
  const subjects = [
    { id: "sub1", name: "Eng", code: "ENG", standardIds: ["std1", "std2"], mediumIds: ["m1"] },
  ];
  const divisions = [
    { id: "d1", name: "A", standardId: "std1", mediumId: "m1" },
    { id: "d2", name: "B", standardId: "std2", mediumId: "m1" },
  ];
  const teachers = [
    { id: "t1", subjectIds: ["sub1"], assignedDivisionIds: ["d1"], mediumIds: ["m1"] },
    { id: "t2", subjectIds: ["sub1"], assignedDivisionIds: [], mediumIds: ["m1"] },
  ];
  assert.deepEqual(
    filterTeachersList(teachers, { standardIds: ["std2"] }, subjects, divisions).map((t) => t.id),
    ["t2"],
  );
  assert.deepEqual(
    filterTeachersList(teachers, { standardIds: ["std1"] }, subjects, divisions).map((t) => t.id).sort(),
    ["t1", "t2"],
  );
});

test("teacherMatchesSearch matches employee code", () => {
  const t = { firstName: "X", lastName: "Y", employeeCode: "EMP99", email: "" };
  assert.equal(teacherMatchesSearch(t, "emp99"), true);
});

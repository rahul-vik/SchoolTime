import test from "node:test";
import assert from "node:assert/strict";
import {
  removeTeacherForUndo,
  restoreDeletedTeacher,
  teacherUndoLabel,
} from "../../shared/academicDeleteUndo.js";

test("removeTeacherForUndo returns removed row and filters list", () => {
  const teachers = [
    { id: "t1", firstName: "A", lastName: "One" },
    { id: "t2", firstName: "B", lastName: "Two" },
  ];
  const { teachers: next, removed } = removeTeacherForUndo(teachers, "t1");
  assert.equal(next.length, 1);
  assert.equal(next[0].id, "t2");
  assert.equal(removed.id, "t1");
});

test("restoreDeletedTeacher re-inserts when id absent", () => {
  const removed = { id: "t1", firstName: "A", lastName: "One" };
  const { teachers, restored } = restoreDeletedTeacher([{ id: "t2" }], removed);
  assert.equal(restored, true);
  assert.equal(teachers.length, 2);
  assert.ok(teachers.some((t) => t.id === "t1"));
});

test("restoreDeletedTeacher is no-op when id already exists", () => {
  const removed = { id: "t1", firstName: "A" };
  const { teachers, restored } = restoreDeletedTeacher([{ id: "t1" }], removed);
  assert.equal(restored, false);
  assert.equal(teachers.length, 1);
});

test("teacherUndoLabel prefers full name", () => {
  assert.equal(teacherUndoLabel({ firstName: "Jane", lastName: "Doe" }), "Jane Doe");
  assert.equal(teacherUndoLabel({ employeeCode: "T42" }), "T42");
});

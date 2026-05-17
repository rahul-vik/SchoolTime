import test from "node:test";
import assert from "node:assert/strict";
import { getTimetableSolverRuntime } from "../../server/config/env.js";

test("getTimetableSolverRuntime defaults to hybrid when CP_SAT_SOLVER_URL set and TIMETABLE_SOLVER unset", () => {
  const prevSolver = process.env.TIMETABLE_SOLVER;
  const prevUrl = process.env.CP_SAT_SOLVER_URL;
  delete process.env.TIMETABLE_SOLVER;
  process.env.CP_SAT_SOLVER_URL = "http://127.0.0.1:8790/solve";
  try {
    const rt = getTimetableSolverRuntime();
    assert.equal(rt.mode, "hybrid");
  } finally {
    if (prevSolver === undefined) delete process.env.TIMETABLE_SOLVER;
    else process.env.TIMETABLE_SOLVER = prevSolver;
    if (prevUrl === undefined) delete process.env.CP_SAT_SOLVER_URL;
    else process.env.CP_SAT_SOLVER_URL = prevUrl;
  }
});

test("getTimetableSolverRuntime respects explicit TIMETABLE_SOLVER=legacy", () => {
  const prevSolver = process.env.TIMETABLE_SOLVER;
  const prevUrl = process.env.CP_SAT_SOLVER_URL;
  process.env.TIMETABLE_SOLVER = "legacy";
  process.env.CP_SAT_SOLVER_URL = "http://127.0.0.1:8790/solve";
  try {
    const rt = getTimetableSolverRuntime();
    assert.equal(rt.mode, "legacy");
  } finally {
    if (prevSolver === undefined) delete process.env.TIMETABLE_SOLVER;
    else process.env.TIMETABLE_SOLVER = prevSolver;
    if (prevUrl === undefined) delete process.env.CP_SAT_SOLVER_URL;
    else process.env.CP_SAT_SOLVER_URL = prevUrl;
  }
});

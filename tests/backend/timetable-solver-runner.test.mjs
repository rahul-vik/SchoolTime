import test from "node:test";
import assert from "node:assert/strict";
import { runTimetableGenerationEngine } from "../../server/timetableSolverRunner.js";

const tinyPayload = {
  divisions: [{ id: "d1", name: "A", standardId: "s1", mediumId: "m1" }],
  subjects: [
    {
      id: "sub1",
      name: "Math",
      code: "MAT",
      category: "CORE",
      weeklyPeriods: 1,
      maxPerDay: 2,
      priorityWeight: 10,
      colorHex: "#000",
      mediumIds: ["m1"],
      standardIds: ["s1"],
      divisionScopeMode: "ALL_IN_SELECTED_CLASSES",
      divisionIncludeIds: [],
      divisionExcludeIds: [],
      divisionLimits: [],
      isActive: true,
    },
  ],
  teachers: [
    {
      id: "t1",
      firstName: "A",
      lastName: "B",
      employeeCode: "T1",
      email: "t@t.test",
      maxPerDay: 8,
      maxPerWeek: 40,
      mediumIds: ["m1"],
      subjectIds: ["sub1"],
      primarySubjectId: "sub1",
      freeMorningPeriods: 0,
      freeEveningPeriods: 0,
      assignedDivisionIds: [],
      classTeacherDivisionIds: [],
      primaryClassTeacherDivisionId: null,
      divisionSubjectExclusions: [],
    },
  ],
  periodSlots: [
    { slotNumber: 1, slotType: "LESSON", label: "P1" },
    { slotNumber: 2, slotType: "LESSON", label: "P2" },
  ],
  workingDays: ["MONDAY"],
  teacherSubjects: [],
  freePeriodRules: [],
  fixedSlots: [],
  subjectAllocations: [],
  schedulingRules: [],
  classTeacherPreferences: { enabled: false, ctFirstPeriodDays: [], dailyPrimaryMinPeriods: 0, schedulingMode: "STRICT" },
};

test("solver runner legacy mode annotates report", async () => {
  const prev = process.env.TIMETABLE_SOLVER;
  process.env.TIMETABLE_SOLVER = "legacy";
  try {
    const out = await runTimetableGenerationEngine(tinyPayload);
    assert.equal(out.report.solver.requested, "legacy");
    assert.equal(out.report.solver.timetableSolverSource, "env");
    assert.equal(out.report.solver.applied, "legacy");
    assert.equal(out.report.solver.workerUsed, false);
    assert.equal(out.report.solver.fallbackReason, null);
  } finally {
    if (prev === undefined) delete process.env.TIMETABLE_SOLVER;
    else process.env.TIMETABLE_SOLVER = prev;
  }
});

test("solver runner experimental completes and tags report", async () => {
  const prevS = process.env.TIMETABLE_SOLVER;
  const prevT = process.env.TIMETABLE_SOLVER_TIMEOUT_MS;
  process.env.TIMETABLE_SOLVER = "experimental";
  process.env.TIMETABLE_SOLVER_TIMEOUT_MS = "30000";
  try {
    const out = await runTimetableGenerationEngine(tinyPayload);
    assert.equal(out.report.solver.requested, "experimental");
    assert.equal(out.report.solver.timetableSolverSource, "env");
    assert.equal(out.report.solver.applied, "experimental");
    assert.equal(out.report.solver.workerUsed, true);
    assert.ok(out.report.experimental?.prototype);
  } finally {
    if (prevS === undefined) delete process.env.TIMETABLE_SOLVER;
    else process.env.TIMETABLE_SOLVER = prevS;
    if (prevT === undefined) delete process.env.TIMETABLE_SOLVER_TIMEOUT_MS;
    else process.env.TIMETABLE_SOLVER_TIMEOUT_MS = prevT;
  }
});

test("solver runner cp_sat without URL falls back to legacy", async () => {
  const prevS = process.env.TIMETABLE_SOLVER;
  const prevU = process.env.CP_SAT_SOLVER_URL;
  process.env.TIMETABLE_SOLVER = "cp_sat";
  delete process.env.CP_SAT_SOLVER_URL;
  try {
    const out = await runTimetableGenerationEngine(tinyPayload);
    assert.equal(out.report.solver.requested, "cp_sat");
    assert.equal(out.report.solver.applied, "legacy");
    assert.equal(out.report.solver.workerUsed, false);
    assert.equal(out.report.solver.fallbackReason, "cp_sat_url_missing");
  } finally {
    if (prevS === undefined) delete process.env.TIMETABLE_SOLVER;
    else process.env.TIMETABLE_SOLVER = prevS;
    if (prevU === undefined) delete process.env.CP_SAT_SOLVER_URL;
    else process.env.CP_SAT_SOLVER_URL = prevU;
  }
});

test("solver runner per-request cp_sat overrides env legacy when URL missing", async () => {
  const prevS = process.env.TIMETABLE_SOLVER;
  const prevU = process.env.CP_SAT_SOLVER_URL;
  process.env.TIMETABLE_SOLVER = "legacy";
  delete process.env.CP_SAT_SOLVER_URL;
  try {
    const out = await runTimetableGenerationEngine(tinyPayload, { timetableSolver: "cp_sat" });
    assert.equal(out.report.solver.requested, "cp_sat");
    assert.equal(out.report.solver.timetableSolverSource, "request");
    assert.equal(out.report.solver.applied, "legacy");
    assert.equal(out.report.solver.fallbackReason, "cp_sat_url_missing");
  } finally {
    if (prevS === undefined) delete process.env.TIMETABLE_SOLVER;
    else process.env.TIMETABLE_SOLVER = prevS;
    if (prevU === undefined) delete process.env.CP_SAT_SOLVER_URL;
    else process.env.CP_SAT_SOLVER_URL = prevU;
  }
});

test("solver runner cp_sat size cap skips worker and uses legacy", async () => {
  const prevS = process.env.TIMETABLE_SOLVER;
  const prevU = process.env.CP_SAT_SOLVER_URL;
  const prevM = process.env.CP_SAT_MAX_DECISION_VARS;
  process.env.TIMETABLE_SOLVER = "cp_sat";
  process.env.CP_SAT_SOLVER_URL = "http://127.0.0.1:9/solve";
  process.env.CP_SAT_MAX_DECISION_VARS = "1";
  try {
    const out = await runTimetableGenerationEngine(tinyPayload);
    assert.equal(out.report.solver.requested, "cp_sat");
    assert.equal(out.report.solver.applied, "legacy");
    assert.equal(out.report.solver.workerUsed, false);
    assert.equal(out.report.solver.fallbackReason, "cp_sat_size_cap");
  } finally {
    if (prevS === undefined) delete process.env.TIMETABLE_SOLVER;
    else process.env.TIMETABLE_SOLVER = prevS;
    if (prevU === undefined) delete process.env.CP_SAT_SOLVER_URL;
    else process.env.CP_SAT_SOLVER_URL = prevU;
    if (prevM === undefined) delete process.env.CP_SAT_MAX_DECISION_VARS;
    else process.env.CP_SAT_MAX_DECISION_VARS = prevM;
  }
});

test("solver runner hybrid without URL falls back to legacy with hybridStage", async () => {
  const prevS = process.env.TIMETABLE_SOLVER;
  const prevU = process.env.CP_SAT_SOLVER_URL;
  process.env.TIMETABLE_SOLVER = "hybrid";
  delete process.env.CP_SAT_SOLVER_URL;
  try {
    const out = await runTimetableGenerationEngine(tinyPayload);
    assert.equal(out.report.solver.requested, "hybrid");
    assert.equal(out.report.solver.applied, "legacy");
    assert.equal(out.report.solver.workerUsed, false);
    assert.equal(out.report.solver.fallbackReason, "cp_sat_url_missing");
    assert.equal(out.report.solver.hybridStage, "legacy_preflight");
  } finally {
    if (prevS === undefined) delete process.env.TIMETABLE_SOLVER;
    else process.env.TIMETABLE_SOLVER = prevS;
    if (prevU === undefined) delete process.env.CP_SAT_SOLVER_URL;
    else process.env.CP_SAT_SOLVER_URL = prevU;
  }
});

test("solver runner hybrid size cap skips worker and tags hybridStage", async () => {
  const prevS = process.env.TIMETABLE_SOLVER;
  const prevU = process.env.CP_SAT_SOLVER_URL;
  const prevM = process.env.CP_SAT_MAX_DECISION_VARS;
  process.env.TIMETABLE_SOLVER = "hybrid";
  process.env.CP_SAT_SOLVER_URL = "http://127.0.0.1:9/solve";
  process.env.CP_SAT_MAX_DECISION_VARS = "1";
  try {
    const out = await runTimetableGenerationEngine(tinyPayload);
    assert.equal(out.report.solver.requested, "hybrid");
    assert.equal(out.report.solver.applied, "legacy");
    assert.equal(out.report.solver.workerUsed, false);
    assert.equal(out.report.solver.fallbackReason, "cp_sat_size_cap");
    assert.equal(out.report.solver.hybridStage, "legacy_preflight");
  } finally {
    if (prevS === undefined) delete process.env.TIMETABLE_SOLVER;
    else process.env.TIMETABLE_SOLVER = prevS;
    if (prevU === undefined) delete process.env.CP_SAT_SOLVER_URL;
    else process.env.CP_SAT_SOLVER_URL = prevU;
    if (prevM === undefined) delete process.env.CP_SAT_MAX_DECISION_VARS;
    else process.env.CP_SAT_MAX_DECISION_VARS = prevM;
  }
});

test("solver runner hybrid worker failure falls back to legacy with hybridStage", async () => {
  const prevS = process.env.TIMETABLE_SOLVER;
  const prevU = process.env.CP_SAT_SOLVER_URL;
  const prevT = process.env.TIMETABLE_SOLVER_TIMEOUT_MS;
  process.env.TIMETABLE_SOLVER = "HyBrId";
  process.env.CP_SAT_SOLVER_URL = "http://127.0.0.1:1/solve";
  process.env.TIMETABLE_SOLVER_TIMEOUT_MS = "15000";
  try {
    const out = await runTimetableGenerationEngine(tinyPayload);
    assert.equal(out.report.solver.requested, "hybrid");
    assert.equal(out.report.solver.applied, "legacy");
    assert.equal(out.report.solver.workerUsed, false);
    assert.equal(out.report.solver.fallbackReason, "error");
    assert.equal(out.report.solver.hybridStage, "legacy_fallback");
    assert.ok(String(out.report.solver.fallbackDetail || "").length > 0);
  } finally {
    if (prevS === undefined) delete process.env.TIMETABLE_SOLVER;
    else process.env.TIMETABLE_SOLVER = prevS;
    if (prevU === undefined) delete process.env.CP_SAT_SOLVER_URL;
    else process.env.CP_SAT_SOLVER_URL = prevU;
    if (prevT === undefined) delete process.env.TIMETABLE_SOLVER_TIMEOUT_MS;
    else process.env.TIMETABLE_SOLVER_TIMEOUT_MS = prevT;
  }
});

test("solver runner cp_sat without URL has no hybridStage", async () => {
  const prevS = process.env.TIMETABLE_SOLVER;
  const prevU = process.env.CP_SAT_SOLVER_URL;
  process.env.TIMETABLE_SOLVER = "cp_sat";
  delete process.env.CP_SAT_SOLVER_URL;
  try {
    const out = await runTimetableGenerationEngine(tinyPayload);
    assert.equal(out.report.solver.requested, "cp_sat");
    assert.equal(out.report.solver.hybridStage, undefined);
  } finally {
    if (prevS === undefined) delete process.env.TIMETABLE_SOLVER;
    else process.env.TIMETABLE_SOLVER = prevS;
    if (prevU === undefined) delete process.env.CP_SAT_SOLVER_URL;
    else process.env.CP_SAT_SOLVER_URL = prevU;
  }
});

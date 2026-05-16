import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { migrateSqliteSchema, SQLITE_SCHEMA_VERSION } from "../../server/db/sqliteMigrations.js";
import { normalizeClassTeacherPreferences } from "../../server/services/classTeacherPreferencesNormalize.js";
import { migrateTenantState } from "../../server/services/tenantStateMigration.js";
import { runTimetableEngine } from "../../server/engine.js";

test("normalizeClassTeacherPreferences preserves legacy CT when enabled omitted", () => {
  const prefs = normalizeClassTeacherPreferences(
    { ctFirstPeriodDays: ["MONDAY"], schedulingMode: "STRICT" },
    [{ classTeacherDivisionIds: ["div-a"] }],
  );
  assert.equal(prefs.enabled, true);
});

test("engine applies legacy class teacher when preferences omit enabled but CT is in use", () => {
  const med = "med-en";
  const std = "std-5";
  const out = runTimetableEngine({
    divisions: [{ id: "div-a", name: "A", standardId: std, mediumId: med }],
    subjects: [
      {
        id: "sub-core",
        name: "Core",
        weeklyPeriods: 1,
        maxPerDay: 2,
        priorityWeight: 10,
        mediumIds: [med],
        standardIds: [std],
        divisionScopeMode: "ALL_IN_SELECTED_CLASSES",
        divisionIncludeIds: [],
        divisionExcludeIds: [],
        divisionLimits: [],
      },
    ],
    teachers: [
      {
        id: "t-ct",
        mediumIds: [med],
        subjectIds: ["sub-core"],
        assignedDivisionIds: [],
        classTeacherDivisionIds: ["div-a"],
        divisionSubjectExclusions: [],
        maxPerDay: 8,
        maxPerWeek: 40,
        freeMorningPeriods: 0,
        freeEveningPeriods: 0,
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
    classTeacherPreferences: { ctFirstPeriodDays: ["MONDAY"], schedulingMode: "STRICT" },
    legacyEngineOptions: { restarts: 1, localSearchIterations: 0 },
  });
  assert.ok(out.report.classTeacherRules.firstPeriodRequested > 0);
});

test("migrateTenantState adds classTeacherPreferences object when missing", () => {
  const { state, changed } = migrateTenantState({ workingDays: ["MONDAY"], periodSlots: [] });
  assert.equal(changed, true);
  assert.equal(state.classTeacherPreferences.enabled, false);
  assert.equal(state.classTeacherPreferences.schedulingMode, "STRICT");
});

test("sqlite schema migration is additive for legacy production shape", () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, full_name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'owner', created_at TEXT NOT NULL);
    CREATE TABLE timetable_runs (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, status TEXT NOT NULL, score INTEGER, created_by_user_id TEXT NOT NULL, created_at TEXT NOT NULL, report_json TEXT, entries_json TEXT);
    INSERT INTO users (id, org_id, full_name, email, password_hash, created_at) VALUES ('u1', 'o1', 'U', 'u@test', 'h', '2020-01-01');
    INSERT INTO timetable_runs (id, org_id, status, score, created_by_user_id, created_at) VALUES ('r1', 'o1', 'FEASIBLE', 90, 'u1', '2020-01-01');
  `);
  migrateSqliteSchema(db);
  const user = db.prepare("SELECT is_active FROM users WHERE id = 'u1'").get();
  assert.equal(user.is_active, 1);
  const cols = db.prepare("PRAGMA table_info(timetable_runs)").all().map((c) => c.name);
  assert.ok(cols.includes("state_json"));
  const meta = db.prepare("SELECT schema_version FROM schema_metadata WHERE id = 1").get();
  assert.equal(meta.schema_version, SQLITE_SCHEMA_VERSION);
  db.close();
});

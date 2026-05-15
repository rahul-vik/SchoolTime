import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { migrateSqliteSchema, SQLITE_SCHEMA_VERSION } from "../../server/db/sqliteMigrations.js";

test("migrateSqliteSchema adds missing columns on legacy-shaped database", () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner',
      created_at TEXT NOT NULL
    );
    CREATE TABLE timetable_runs (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      status TEXT NOT NULL,
      score INTEGER,
      created_by_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      report_json TEXT,
      entries_json TEXT
    );
  `);

  migrateSqliteSchema(db);

  const userCols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  const runCols = db.prepare("PRAGMA table_info(timetable_runs)").all().map((c) => c.name);
  assert.ok(userCols.includes("is_active"));
  assert.ok(runCols.includes("state_json"));

  const meta = db.prepare("SELECT schema_version FROM schema_metadata WHERE id = 1").get();
  assert.equal(meta.schema_version, SQLITE_SCHEMA_VERSION);

  db.close();
});

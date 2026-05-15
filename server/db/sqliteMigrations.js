/**
 * Additive SQLite schema upgrades for existing production databases.
 * New installs get full DDL from bootstrap; older files may miss columns/tables.
 */
export const SQLITE_SCHEMA_VERSION = 4;

function tableHasColumn(db, table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

function ensureColumn(db, table, column, alterSql) {
  if (!tableHasColumn(db, table, column)) {
    db.exec(alterSql);
  }
}

/**
 * @param {import("better-sqlite3").Database} db
 */
export function migrateSqliteSchema(db) {
  ensureColumn(db, "users", "is_active", "ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "timetable_runs", "state_json", "ALTER TABLE timetable_runs ADD COLUMN state_json TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_metadata (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      schema_version INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const now = new Date().toISOString();
  const row = db.prepare("SELECT schema_version FROM schema_metadata WHERE id = 1").get();
  if (!row) {
    db.prepare("INSERT INTO schema_metadata (id, schema_version, updated_at) VALUES (1, ?, ?)").run(
      SQLITE_SCHEMA_VERSION,
      now,
    );
  } else if (Number(row.schema_version) < SQLITE_SCHEMA_VERSION) {
    db.prepare("UPDATE schema_metadata SET schema_version = ?, updated_at = ? WHERE id = 1").run(
      SQLITE_SCHEMA_VERSION,
      now,
    );
  }
}

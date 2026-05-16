/**
 * Additive Postgres schema upgrades for existing production databases.
 * New installs use server/db/postgres-schema.sql; older DBs may miss columns/tables.
 */
import { SQLITE_SCHEMA_VERSION } from "./sqliteMigrations.js";

export const POSTGRES_SCHEMA_VERSION = SQLITE_SCHEMA_VERSION;

async function columnExists(pool, table, column) {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     LIMIT 1`,
    [table, column],
  );
  return (r.rowCount || 0) > 0;
}

async function ensureColumn(pool, table, column, alterSql) {
  if (!(await columnExists(pool, table, column))) {
    await pool.query(alterSql);
  }
}

/**
 * @param {import("pg").Pool} pool
 */
export async function migratePostgresSchema(pool) {
  await ensureColumn(pool, "users", "is_active", "ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1");
  await ensureColumn(pool, "timetable_runs", "state_json", "ALTER TABLE timetable_runs ADD COLUMN state_json TEXT");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_metadata (
      id INTEGER PRIMARY KEY,
      schema_version INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const now = new Date().toISOString();
  const meta = await pool.query("SELECT schema_version FROM schema_metadata WHERE id = 1");
  if (meta.rowCount === 0) {
    await pool.query("INSERT INTO schema_metadata (id, schema_version, updated_at) VALUES (1, $1, $2)", [
      POSTGRES_SCHEMA_VERSION,
      now,
    ]);
  } else if (Number(meta.rows[0].schema_version) < POSTGRES_SCHEMA_VERSION) {
    await pool.query("UPDATE schema_metadata SET schema_version = $1, updated_at = $2 WHERE id = 1", [
      POSTGRES_SCHEMA_VERSION,
      now,
    ]);
  }
}

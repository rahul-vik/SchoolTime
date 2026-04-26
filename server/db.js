import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { ENV } from "./config/env.js";

const { Pool } = pg;
const DB_CLIENT = String(process.env.DB_CLIENT || "sqlite").toLowerCase();
const EXPECTED_POSTGRES_SCHEMA_VERSION = 1;

let sqlite = null;
let pgPool = null;

const sqliteBootstrapSql = `
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (org_id) REFERENCES organizations(id)
);
CREATE TABLE IF NOT EXISTS licenses (
  org_id TEXT PRIMARY KEY,
  credits_remaining INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organizations(id)
);
CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY (org_id) REFERENCES organizations(id)
);
CREATE TABLE IF NOT EXISTS tenant_state (
  org_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organizations(id)
);
CREATE TABLE IF NOT EXISTS timetable_runs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  status TEXT NOT NULL,
  score INTEGER,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  report_json TEXT,
  entries_json TEXT,
  state_json TEXT,
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (org_id) REFERENCES organizations(id)
);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);
`;

function toPgSql(sql) {
  let idx = 0;
  return String(sql)
    .replace(/IFNULL\(/g, "COALESCE(")
    .replace(/\?/g, () => `$${++idx}`);
}

async function initSqlite() {
  const dataDir = path.resolve("server", "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "app.db");
  sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(sqliteBootstrapSql);
}

async function initPostgres() {
  const conn = process.env.DATABASE_URL;
  if (!conn) throw new Error("DB_CLIENT=postgres but DATABASE_URL is not set.");
  const appName = (process.env.PGAPPNAME || process.env.PG_APPLICATION_NAME || "schooltime-api").trim();
  pgPool = new Pool({
    connectionString: conn,
    application_name: appName,
    ssl: ENV.isProduction ? { rejectUnauthorized: false } : undefined,
  });
  const schemaPath = path.resolve("server", "db", "postgres-schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");
  await pgPool.query(schemaSql);
  const meta = await pgPool.query("SELECT schema_version FROM schema_metadata WHERE id = 1");
  const actual = Number(meta.rows?.[0]?.schema_version || 0);
  if (actual !== EXPECTED_POSTGRES_SCHEMA_VERSION) {
    throw new Error(
      `Postgres schema version mismatch: expected ${EXPECTED_POSTGRES_SCHEMA_VERSION}, got ${actual}. Run migration/update scripts before starting the API.`,
    );
  }
}

export async function initDb() {
  if (DB_CLIENT === "postgres") {
    await initPostgres();
    console.log("[db] using postgres");
    return;
  }
  await initSqlite();
  console.log("[db] using sqlite");
}

async function query(sql, args = [], client = null) {
  if (DB_CLIENT === "postgres") {
    const runner = client || pgPool;
    const out = await runner.query(toPgSql(sql), args);
    return out;
  }
  const trimmed = String(sql).trim().toUpperCase();
  if (trimmed.startsWith("SELECT")) {
    return { rows: sqlite.prepare(sql).all(...args), rowCount: 0 };
  }
  const info = sqlite.prepare(sql).run(...args);
  return { rows: [], rowCount: info.changes, lastID: info.lastInsertRowid };
}

export const db = {
  client: DB_CLIENT,
  async get(sql, ...args) {
    const out = await query(sql, args);
    return out.rows[0] || null;
  },
  async all(sql, ...args) {
    const out = await query(sql, args);
    return out.rows || [];
  },
  async run(sql, ...args) {
    const out = await query(sql, args);
    return { changes: out.rowCount || 0, lastInsertRowid: out.lastID ?? null };
  },
  async exec(sql) {
    if (DB_CLIENT === "postgres") {
      await pgPool.query(sql);
    } else {
      sqlite.exec(sql);
    }
  },
  async transaction(work) {
    if (DB_CLIENT === "postgres") {
      const client = await pgPool.connect();
      try {
        await client.query("BEGIN");
        const tx = {
          get: async (sql, ...args) => {
            const out = await query(sql, args, client);
            return out.rows[0] || null;
          },
          all: async (sql, ...args) => {
            const out = await query(sql, args, client);
            return out.rows || [];
          },
          run: async (sql, ...args) => {
            const out = await query(sql, args, client);
            return { changes: out.rowCount || 0, lastInsertRowid: null };
          },
        };
        const out = await work(tx);
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }
    sqlite.exec("BEGIN");
    const tx = {
      get: async (sql, ...args) => sqlite.prepare(sql).get(...args) || null,
      all: async (sql, ...args) => sqlite.prepare(sql).all(...args),
      run: async (sql, ...args) => {
        const info = sqlite.prepare(sql).run(...args);
        return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
      },
    };
    try {
      const out = await work(tx);
      sqlite.exec("COMMIT");
      return out;
    } catch (e) {
      sqlite.exec("ROLLBACK");
      throw e;
    }
  },
};

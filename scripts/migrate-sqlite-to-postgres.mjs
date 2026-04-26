import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import pg from "pg";

const { Pool } = pg;

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlitePath = path.join(projectRoot, "server", "data", "app.db");
const schemaPath = path.join(projectRoot, "server", "db", "postgres-schema.sql");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required. Set it in environment/.env before running migration.");
  process.exit(1);
}

if (!fs.existsSync(sqlitePath)) {
  console.error(`SQLite database not found: ${sqlitePath}`);
  process.exit(1);
}

if (!fs.existsSync(schemaPath)) {
  console.error(`Postgres schema file not found: ${schemaPath}`);
  process.exit(1);
}

const tableOrder = [
  "organizations",
  "users",
  "licenses",
  "credit_ledger",
  "tenant_state",
  "timetable_runs",
  "refresh_tokens",
  "password_reset_tokens",
  "audit_logs",
  "api_keys",
];

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, "\"\"")}"`;
}

function buildInsertQuery(table, columns) {
  const cols = columns.map(quoteIdent).join(", ");
  const vals = columns.map((_, i) => `$${i + 1}`).join(", ");
  return `INSERT INTO ${quoteIdent(table)} (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING`;
}

async function main() {
  const sqlite = new Database(sqlitePath, { readonly: true });
  const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    const schemaSql = fs.readFileSync(schemaPath, "utf8");
    await client.query("BEGIN");
    await client.query(schemaSql);

    for (const table of tableOrder) {
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      if (!rows.length) {
        console.log(`- ${table}: 0 rows`);
        continue;
      }
      const columns = Object.keys(rows[0]);
      const query = buildInsertQuery(table, columns);
      for (const row of rows) {
        await client.query(query, columns.map((c) => row[c]));
      }
      console.log(`- ${table}: ${rows.length} rows`);
    }

    await client.query("COMMIT");
    console.log("SQLite -> Postgres migration completed successfully.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
}

main();


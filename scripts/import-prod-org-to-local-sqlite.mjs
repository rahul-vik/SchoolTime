/**
 * Copy one organization's rows from production Postgres into local SQLite (new org + user ids).
 *
 * Security:
 * - Requires IMPORT_I_UNDERSTAND_COPY_TO_LOCAL=YES
 * - Requires IMPORT_SOURCE_DATABASE_URL (prod read-only URL recommended; never commit)
 * - Requires IMPORT_LOCAL_PLAINTEXT_PASSWORD (>= 12 chars) — all imported users get this password
 * - Does not copy refresh_tokens or password_reset_tokens
 *
 * Usage (PowerShell):
 *   $env:IMPORT_I_UNDERSTAND_COPY_TO_LOCAL="YES"
 *   $env:IMPORT_SOURCE_DATABASE_URL="postgresql://..."
 *   $env:IMPORT_LOCAL_PLAINTEXT_PASSWORD="YourLongPasswordHere"
 *   node scripts/import-prod-org-to-local-sqlite.mjs --school "Surana"
 *
 * Optional:
 *   IMPORT_ORG_ID=<prod org uuid>     — pick org when multiple match --school
 *   IMPORT_ORG_NAME_SUFFIX=" (local)" — appended to organization name in SQLite
 *   IMPORT_EMAIL_TAG="surana"         — emails become <tag>+<oldIdPrefix>@local-import.invalid
 *   IMPORT_PRESERVE_ORG_CREATED_AT=YES — keep prod created_at on org row (imported school sorts old in creator portal default "newest first")
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import pg from "pg";
import { hashPassword } from "../server/auth.js";

const { Pool } = pg;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlitePath = path.join(projectRoot, "server", "data", "app.db");

function argValue(name) {
  const i = process.argv.indexOf(name);
  if (i === -1) return null;
  return process.argv[i + 1] || null;
}

const schoolArg = argValue("--school") || process.env.IMPORT_SCHOOL_NAME || "Surana";
const sourceUrl = process.env.IMPORT_SOURCE_DATABASE_URL || "";
const confirm = process.env.IMPORT_I_UNDERSTAND_COPY_TO_LOCAL || "";
const localPassword = process.env.IMPORT_LOCAL_PLAINTEXT_PASSWORD || "";
const orgNameSuffix = process.env.IMPORT_ORG_NAME_SUFFIX ?? " (local import)";
const emailTag = (process.env.IMPORT_EMAIL_TAG || "import").replace(/[^a-z0-9-]/gi, "").slice(0, 24) || "import";
const forcedOrgId = process.env.IMPORT_ORG_ID || null;

if (confirm !== "YES") {
  console.error("Set IMPORT_I_UNDERSTAND_COPY_TO_LOCAL=YES to run (writes to local SQLite).");
  process.exit(1);
}
if (!sourceUrl) {
  console.error("Set IMPORT_SOURCE_DATABASE_URL to production Postgres connection string.");
  process.exit(1);
}
if (localPassword.length < 12) {
  console.error("Set IMPORT_LOCAL_PLAINTEXT_PASSWORD to a password with at least 12 characters (applied to every imported user).");
  process.exit(1);
}
if (!fs.existsSync(sqlitePath)) {
  console.error(`Local SQLite not found: ${sqlitePath}`);
  process.exit(1);
}

const pool = new Pool({
  connectionString: sourceUrl,
  ssl: { rejectUnauthorized: false },
});

const passwordHash = hashPassword(localPassword);

async function main() {
  const client = await pool.connect();
  try {
    let orgRow;
    if (forcedOrgId) {
      orgRow = (await client.query("SELECT id, name, created_at FROM organizations WHERE id = $1", [forcedOrgId])).rows[0];
      if (!orgRow) {
        console.error(`No organization with id ${forcedOrgId}`);
        process.exit(1);
      }
    } else {
      const like = `%${schoolArg.replace(/%/g, "\\%")}%`;
      const { rows } = await client.query(
        "SELECT id, name, created_at FROM organizations WHERE name ILIKE $1 ORDER BY created_at ASC",
        [like],
      );
      if (rows.length === 0) {
        console.error(`No organization matched name ILIKE %${schoolArg}%`);
        process.exit(1);
      }
      if (rows.length > 1) {
        console.error("Multiple organizations matched. Pick one and set IMPORT_ORG_ID:\n");
        for (const r of rows) console.error(`  ${r.id}  ${r.name}`);
        process.exit(1);
      }
      orgRow = rows[0];
    }

    const sourceOrgId = orgRow.id;
    console.log(`Source org: ${sourceOrgId} — ${orgRow.name}`);

    const users = (await client.query("SELECT * FROM users WHERE org_id = $1 ORDER BY created_at ASC", [sourceOrgId])).rows;
    const licenses = (await client.query("SELECT * FROM licenses WHERE org_id = $1", [sourceOrgId])).rows;
    const ledger = (await client.query("SELECT * FROM credit_ledger WHERE org_id = $1 ORDER BY created_at ASC", [sourceOrgId])).rows;
    const tenantState = (await client.query("SELECT * FROM tenant_state WHERE org_id = $1", [sourceOrgId])).rows;
    const runs = (await client.query("SELECT * FROM timetable_runs WHERE org_id = $1 ORDER BY created_at ASC", [sourceOrgId])).rows;
    const audits = (await client.query("SELECT * FROM audit_logs WHERE org_id = $1 ORDER BY created_at ASC", [sourceOrgId])).rows;
    const keys = (await client.query("SELECT * FROM api_keys WHERE org_id = $1", [sourceOrgId])).rows;
    const cpr = (await client.query("SELECT * FROM credit_purchase_requests WHERE org_id = $1", [sourceOrgId])).rows;
    const pel = (await client.query("SELECT * FROM platform_error_logs WHERE org_id = $1 ORDER BY created_at ASC LIMIT 500", [sourceOrgId])).rows;

    const newOrgId = randomUUID();
    /** Use "now" for org row so the school appears at the top of the creator portal (default sort: created desc). */
    const localOrgCreatedAt = process.env.IMPORT_PRESERVE_ORG_CREATED_AT === "YES" ? orgRow.created_at : new Date().toISOString();
    const userIdMap = new Map();
    for (const u of users) {
      userIdMap.set(u.id, randomUUID());
    }

    const sqlite = new Database(sqlitePath);
    sqlite.pragma("foreign_keys = ON");

    const insOrg = sqlite.prepare(
      "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    );
    const insUser = sqlite.prepare(
      "INSERT INTO users (id, org_id, full_name, email, password_hash, role, created_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const insLicense = sqlite.prepare(
      "INSERT INTO licenses (org_id, credits_remaining, updated_at) VALUES (?, ?, ?)",
    );
    const insLedger = sqlite.prepare(
      "INSERT INTO credit_ledger (id, org_id, delta, reason, created_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const insTenant = sqlite.prepare(
      "INSERT INTO tenant_state (org_id, state_json, updated_at) VALUES (?, ?, ?)",
    );
    const insRun = sqlite.prepare(
      "INSERT INTO timetable_runs (id, org_id, status, score, created_by_user_id, created_at, report_json, entries_json, state_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const insAudit = sqlite.prepare(
      "INSERT INTO audit_logs (id, org_id, user_id, action, entity_type, entity_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const insKey = sqlite.prepare(
      "INSERT INTO api_keys (id, org_id, name, key_hash, key_prefix, created_by_user_id, created_at, last_used_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const insCpr = sqlite.prepare(
      "INSERT INTO credit_purchase_requests (id, org_id, user_id, pack_count, credits_total, status, requester_note, created_at, resolved_at, resolver_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const insPel = sqlite.prepare(
      "INSERT INTO platform_error_logs (id, created_at, level, message, detail_text, stack_text, route, method, org_id, user_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );

    const tx = sqlite.transaction(() => {
      const newName = `${String(orgRow.name).trim()}${orgNameSuffix}`;
      insOrg.run(newOrgId, newName, localOrgCreatedAt);

      for (const u of users) {
        const newId = userIdMap.get(u.id);
        const short = String(u.id).replace(/-/g, "").slice(0, 12);
        const email = `${emailTag}+${short}@local-import.invalid`;
        insUser.run(
          newId,
          newOrgId,
          u.full_name,
          email,
          passwordHash,
          u.role,
          u.created_at,
          Number(u.is_active) ? 1 : 0,
        );
      }

      for (const row of licenses) {
        insLicense.run(newOrgId, row.credits_remaining, row.updated_at);
      }

      for (const row of ledger) {
        insLedger.run(randomUUID(), newOrgId, row.delta, row.reason, row.created_at, row.metadata_json);
      }

      for (const row of tenantState) {
        insTenant.run(newOrgId, row.state_json, row.updated_at);
      }

      for (const row of runs) {
        const newCreator = userIdMap.get(row.created_by_user_id) || [...userIdMap.values()][0];
        insRun.run(
          randomUUID(),
          newOrgId,
          row.status,
          row.score,
          newCreator,
          row.created_at,
          row.report_json,
          row.entries_json,
          row.state_json,
        );
      }

      for (const row of audits) {
        const uid = row.user_id ? userIdMap.get(row.user_id) || null : null;
        insAudit.run(randomUUID(), newOrgId, uid, row.action, row.entity_type, row.entity_id, row.metadata_json, row.created_at);
      }

      for (const row of keys) {
        insKey.run(
          randomUUID(),
          newOrgId,
          row.name,
          row.key_hash,
          row.key_prefix,
          userIdMap.get(row.created_by_user_id) || [...userIdMap.values()][0],
          row.created_at,
          row.last_used_at,
          row.revoked_at,
        );
      }

      for (const row of cpr) {
        insCpr.run(
          randomUUID(),
          newOrgId,
          userIdMap.get(row.user_id) || [...userIdMap.values()][0],
          row.pack_count,
          row.credits_total,
          row.status,
          row.requester_note,
          row.created_at,
          row.resolved_at,
          row.resolver_note,
        );
      }

      for (const row of pel) {
        const uid = row.user_id ? userIdMap.get(row.user_id) || null : null;
        insPel.run(
          randomUUID(),
          row.created_at,
          row.level,
          row.message,
          row.detail_text,
          row.stack_text,
          row.route,
          row.method,
          newOrgId,
          uid,
          row.metadata_json,
        );
      }
    });

    tx();
    sqlite.close();

    console.log("\nImport finished.");
    console.log(`  New local organization id: ${newOrgId}`);
    console.log(`  New local organization name: ${String(orgRow.name).trim()}${orgNameSuffix}`);
    console.log(`  Imported users: ${users.length} (emails are @local-import.invalid — see script header)`);
    console.log(`  Login password for all imported users: (value of IMPORT_LOCAL_PLAINTEXT_PASSWORD)`);
    console.log("\nFirst user email (owner if first in list):");
    if (users[0]) {
      const short = String(users[0].id).replace(/-/g, "").slice(0, 12);
      console.log(`  ${emailTag}+${short}@local-import.invalid`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

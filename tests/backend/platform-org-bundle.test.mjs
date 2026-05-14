import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { importOrganizationBundleInTransaction, remapBundleOrganizationId, remapTimetableSetupBundleOrganizationId, exportOrganizationTimetableSetupBundle, importOrganizationTimetableSetupBundleInTransaction, TIMETABLE_SETUP_BUNDLE_KIND } from "../../server/services/platformOrgBundle.js";

function loadSqliteOrgBootstrapSql() {
  const dbPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../server/db.js");
  const dbJs = fs.readFileSync(dbPath, "utf8");
  const m = dbJs.match(/const sqliteBootstrapSql = `([\s\S]*?)`;\s*\r?\n\r?\nfunction toPgSql/);
  assert.ok(m, "could not extract sqliteBootstrapSql from server/db.js");
  return m[1];
}

const SQLITE_ORG_BOOTSTRAP = loadSqliteOrgBootstrapSql();

function openMemoryOrgDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = OFF");
  sqlite.exec(SQLITE_ORG_BOOTSTRAP);
  return sqlite;
}

async function runInSqliteTransaction(sqlite, work) {
  sqlite.exec("BEGIN");
  const tx = {
    get: async (sql, ...args) => sqlite.prepare(sql).get(...args) || null,
    all: async (sql, ...args) => sqlite.prepare(sql).all(...args),
    run: async (sql, ...args) => {
      sqlite.prepare(sql).run(...args);
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
}

const noopTx = {
  get: async () => null,
  all: async () => [],
  run: async () => {},
};

const baseBundle = {
  bundleVersion: 1,
  organization: { id: "org-rvsm", name: "RVSM", created_at: "2020-01-01T00:00:00.000Z" },
  users: [{ id: "u1", org_id: "org-rvsm", full_name: "A", email: "a@x.com", password_hash: "h", role: "owner", created_at: "2020-01-01T00:00:00.000Z", is_active: 1 }],
  license: { org_id: "org-rvsm", credits_remaining: 10, updated_at: "2020-01-01T00:00:00.000Z" },
  creditLedger: [{ id: "cl1", org_id: "org-rvsm", delta: 10, reason: "X", created_at: "2020-01-01T00:00:00.000Z" }],
  tenantState: { org_id: "org-rvsm", state_json: "{}", updated_at: "2020-01-01T00:00:00.000Z" },
  timetableRuns: [{ id: "tr1", org_id: "org-rvsm", status: "ok", created_by_user_id: "u1", created_at: "2020-01-01T00:00:00.000Z" }],
  auditLogs: [{ id: "al1", org_id: "org-rvsm", action: "X", entity_type: "y", created_at: "2020-01-01T00:00:00.000Z" }],
  apiKeys: [
    {
      id: "k1",
      org_id: "org-rvsm",
      name: "k",
      key_hash: "x",
      key_prefix: "ab",
      created_by_user_id: "u1",
      created_at: "2020-01-01T00:00:00.000Z",
    },
  ],
  creditPurchaseRequests: [
    {
      id: "cpr1",
      org_id: "org-rvsm",
      user_id: "u1",
      pack_count: 1,
      credits_total: 10,
      status: "pending",
      created_at: "2020-01-01T00:00:00.000Z",
    },
  ],
  platformErrorLogs: [{ id: "pel1", created_at: "2020-01-01T00:00:00.000Z", level: "error", message: "m", org_id: "org-rvsm" }],
};

test("remapBundleOrganizationId rewrites all exported org id fields", () => {
  const out = remapBundleOrganizationId(baseBundle, "org-test");
  assert.equal(out.organization.id, "org-test");
  assert.equal(out.users[0].org_id, "org-test");
  assert.equal(out.license.org_id, "org-test");
  assert.equal(out.creditLedger[0].org_id, "org-test");
  assert.equal(out.tenantState.org_id, "org-test");
  assert.equal(out.timetableRuns[0].org_id, "org-test");
  assert.equal(out.auditLogs[0].org_id, "org-test");
  assert.equal(out.apiKeys[0].org_id, "org-test");
  assert.equal(out.creditPurchaseRequests[0].org_id, "org-test");
  assert.equal(out.platformErrorLogs[0].org_id, "org-test");
  assert.equal(baseBundle.organization.id, "org-rvsm", "input bundle unchanged");
});

test("remapBundleOrganizationId leaves null platformErrorLogs.org_id", () => {
  const b = {
    ...baseBundle,
    platformErrorLogs: [{ id: "pel2", created_at: "2020-01-01T00:00:00.000Z", level: "error", message: "m", org_id: null }],
  };
  const out = remapBundleOrganizationId(b, "org-test");
  assert.equal(out.platformErrorLogs[0].org_id, null);
});

test("remapBundleOrganizationId throws on stray org_id", () => {
  const b = {
    ...baseBundle,
    users: [{ ...baseBundle.users[0], org_id: "other-org" }],
  };
  assert.throws(() => remapBundleOrganizationId(b, "org-test"), (e) => e.message === "REMAP_ORG_ID_INCONSISTENT");
});

const miniSchemaSql = `
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (org_id) REFERENCES organizations(id)
);
CREATE TABLE tenant_state (
  org_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organizations(id)
);
CREATE TABLE timetable_runs (
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
`;

function createMemoryDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(miniSchemaSql);
  async function get(sql, ...args) {
    return sqlite.prepare(sql).get(...args) || null;
  }
  async function all(sql, ...args) {
    return sqlite.prepare(sql).all(...args);
  }
  async function run(sql, ...args) {
    sqlite.prepare(sql).run(...args);
  }
  return {
    get,
    all,
    run,
    async transaction(work) {
      sqlite.exec("BEGIN");
      const tx = { get, run, all };
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
}

test("exportOrganizationTimetableSetupBundle returns timetable_setup and parsed tenantState", async () => {
  const db = createMemoryDb();
  const orgId = "org-a";
  await db.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    orgId,
    "Alpha School",
    "2020-01-01T00:00:00.000Z",
  );
  await db.run("INSERT INTO users (id, org_id, full_name, email, password_hash, role, created_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", "u1", orgId, "Owner", "o@a.test", "h", "owner", "2020-01-01T00:00:00.000Z", 1);
  await db.run(
    "INSERT INTO tenant_state (org_id, state_json, updated_at) VALUES (?, ?, ?)",
    orgId,
    JSON.stringify({ standards: [{ id: "s1", name: "5" }] }),
    "2020-01-02T00:00:00.000Z",
  );
  const bundle = await exportOrganizationTimetableSetupBundle(db, orgId);
  assert.equal(bundle.bundleKind, TIMETABLE_SETUP_BUNDLE_KIND);
  assert.equal(bundle.organization.id, orgId);
  assert.equal(bundle.organization.name, "Alpha School");
  assert.deepEqual(bundle.tenantState.standards, [{ id: "s1", name: "5" }]);
});

test("importOrganizationTimetableSetupBundleInTransaction round-trip clears runs and applies state", async () => {
  const db = createMemoryDb();
  const orgId = "org-b";
  await db.run("INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)", orgId, "Beta", "2020-01-01T00:00:00.000Z");
  await db.run("INSERT INTO users (id, org_id, full_name, email, password_hash, role, created_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", "u2", orgId, "Owner", "o@b.test", "h", "owner", "2020-01-01T00:00:00.000Z", 1);
  await db.run(
    "INSERT INTO tenant_state (org_id, state_json, updated_at) VALUES (?, ?, ?)",
    orgId,
    JSON.stringify({ subjects: [] }),
    "2020-01-01T00:00:00.000Z",
  );
  await db.run(
    "INSERT INTO timetable_runs (id, org_id, status, score, created_by_user_id, created_at, report_json, entries_json, state_json) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL)",
    "run-1",
    orgId,
    "FEASIBLE",
    1,
    "u2",
    "2020-01-03T00:00:00.000Z",
  );

  const exported = await exportOrganizationTimetableSetupBundle(db, orgId);
  assert.ok(Array.isArray(exported.tenantState.subjects));

  await db.run("UPDATE tenant_state SET state_json = ? WHERE org_id = ?", JSON.stringify({ patched: true }), orgId);

  await db.transaction(async (tx) => {
    await importOrganizationTimetableSetupBundleInTransaction(tx, exported, {
      targetOrgId: orgId,
      confirmationName: "Beta",
    });
  });

  const runCount = Number((await db.get("SELECT COUNT(*) AS c FROM timetable_runs WHERE org_id = ?", orgId))?.c || 0);
  assert.equal(runCount, 0);
  const ts = await db.get("SELECT state_json FROM tenant_state WHERE org_id = ?", orgId);
  const parsed = JSON.parse(ts.state_json);
  assert.equal(parsed.patched, undefined);
  assert.ok(Array.isArray(parsed.subjects));
});

test("remapTimetableSetupBundleOrganizationId sets organization.id", () => {
  const b = {
    bundleVersion: 1,
    bundleKind: TIMETABLE_SETUP_BUNDLE_KIND,
    organization: { id: "src", name: "N" },
    tenantState: { x: 1 },
  };
  const out = remapTimetableSetupBundleOrganizationId(b, "dst");
  assert.equal(out.organization.id, "dst");
  assert.equal(b.organization.id, "src");
});

test("importOrganizationBundleInTransaction rejects duplicate emails in bundle (case-insensitive)", async () => {
  const bundle = {
    bundleVersion: 1,
    organization: { id: "org-a", name: "School A", created_at: "2020-01-01T00:00:00.000Z" },
    users: [
      { id: "u1", org_id: "org-a", full_name: "A", email: "dup@e.com", password_hash: "h", role: "owner", created_at: "2020-01-01T00:00:00.000Z", is_active: 1 },
      { id: "u2", org_id: "org-a", full_name: "B", email: "Dup@e.com", password_hash: "h", role: "teacher", created_at: "2020-01-01T00:00:00.000Z", is_active: 1 },
    ],
  };
  await assert.rejects(
    () => importOrganizationBundleInTransaction(noopTx, bundle, { targetOrgId: "org-a", confirmationName: "School A" }),
    (e) => e.message === "INVALID_BUNDLE" && Array.isArray(e.details?.duplicateEmails) && e.details.duplicateEmails.includes("dup@e.com"),
  );
});

test("importOrganizationBundleInTransaction rejects EMAIL_IN_USE before deleting target org", async () => {
  const sqlite = openMemoryOrgDb();
  sqlite.prepare("INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)").run("org-a", "School A", "2020-01-01T00:00:00.000Z");
  sqlite.prepare("INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)").run("org-b", "School B", "2020-01-01T00:00:00.000Z");
  sqlite.prepare(
    "INSERT INTO users (id, org_id, full_name, email, password_hash, role, created_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run("u-b", "org-b", "Other", "taken@e.com", "h", "owner", "2020-01-01T00:00:00.000Z", 1);

  const bundle = {
    bundleVersion: 1,
    organization: { id: "org-a", name: "School A", created_at: "2020-01-01T00:00:00.000Z" },
    users: [
      {
        id: "u-new",
        org_id: "org-a",
        full_name: "Importer",
        email: "taken@e.com",
        password_hash: "h2",
        role: "owner",
        created_at: "2020-01-01T00:00:00.000Z",
        is_active: 1,
      },
    ],
  };

  await assert.rejects(
    () => runInSqliteTransaction(sqlite, (tx) => importOrganizationBundleInTransaction(tx, bundle, { targetOrgId: "org-a", confirmationName: "School A" })),
    (e) => e.message === "EMAIL_IN_USE" && Array.isArray(e.emails) && e.emails.includes("taken@e.com"),
  );

  const orgACount = sqlite.prepare("SELECT COUNT(*) AS c FROM organizations WHERE id = ?").get("org-a")?.c;
  assert.equal(orgACount, 1);
  sqlite.close();
});

test("importOrganizationBundleInTransaction succeeds when conflicting email exists only on target org", async () => {
  const sqlite = openMemoryOrgDb();
  sqlite.prepare("INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)").run("org-a", "School A", "2020-01-01T00:00:00.000Z");
  sqlite.prepare(
    "INSERT INTO users (id, org_id, full_name, email, password_hash, role, created_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run("u-old", "org-a", "Old", "same@e.com", "h0", "owner", "2020-01-01T00:00:00.000Z", 1);
  sqlite.prepare("INSERT INTO licenses (org_id, credits_remaining, updated_at) VALUES (?, ?, ?)").run("org-a", 0, "2020-01-01T00:00:00.000Z");
  sqlite.prepare("INSERT INTO tenant_state (org_id, state_json, updated_at) VALUES (?, ?, ?)").run("org-a", "{}", "2020-01-01T00:00:00.000Z");

  const bundle = {
    bundleVersion: 1,
    organization: { id: "org-a", name: "School A", created_at: "2020-01-01T00:00:00.000Z" },
    users: [
      {
        id: "u-rep",
        org_id: "org-a",
        full_name: "Replaced",
        email: "same@e.com",
        password_hash: "h1",
        role: "owner",
        created_at: "2020-01-02T00:00:00.000Z",
        is_active: 1,
      },
    ],
  };

  await runInSqliteTransaction(sqlite, (tx) => importOrganizationBundleInTransaction(tx, bundle, { targetOrgId: "org-a", confirmationName: "School A" }));

  const row = sqlite.prepare("SELECT id, full_name FROM users WHERE org_id = ?").get("org-a");
  assert.equal(row.id, "u-rep");
  assert.equal(row.full_name, "Replaced");
  sqlite.close();
});

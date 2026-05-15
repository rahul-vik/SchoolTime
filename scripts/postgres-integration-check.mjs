import { randomUUID } from "node:crypto";
import { db, initDb } from "../server/db.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  if (String(process.env.DB_CLIENT || "").toLowerCase() !== "postgres") {
    console.log("Skipping Postgres integration check (DB_CLIENT is not postgres).");
    return;
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for Postgres integration check.");
  }

  await initDb();

  const schema = await db.get("SELECT schema_version FROM schema_metadata WHERE id = 1");
  assert(schema?.schema_version === 4, `Unexpected schema version: ${schema?.schema_version}`);

  const orgId = randomUUID();
  const userId = randomUUID();
  const now = new Date().toISOString();
  const email = `integration-${Date.now()}@example.com`;

  await db.transaction(async (tx) => {
    await tx.run("INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)", orgId, "Integration Org", now);
    await tx.run(
      "INSERT INTO users (id, org_id, full_name, email, password_hash, role, created_at, is_active) VALUES (?, ?, ?, ?, ?, 'owner', ?, 1)",
      userId,
      orgId,
      "Integration User",
      email,
      "integration-test-hash",
      now,
    );
    await tx.run("INSERT INTO licenses (org_id, credits_remaining, updated_at) VALUES (?, ?, ?)", orgId, 10, now);
  });

  const user = await db.get("SELECT id, email FROM users WHERE id = ?", userId);
  assert(user?.id === userId, "Inserted user not found via db.get");
  assert(user?.email === email, "Inserted user email mismatch");

  const orgUsers = await db.all("SELECT id FROM users WHERE org_id = ?", orgId);
  assert(orgUsers.length === 1, "Expected exactly one user for test org");

  await db.transaction(async (tx) => {
    await tx.run("DELETE FROM licenses WHERE org_id = ?", orgId);
    await tx.run("DELETE FROM users WHERE id = ?", userId);
    await tx.run("DELETE FROM organizations WHERE id = ?", orgId);
  });

  const cleaned = await db.get("SELECT id FROM organizations WHERE id = ?", orgId);
  assert(!cleaned, "Cleanup failed for integration test organization");

  console.log("Postgres integration check passed.");
}

main().catch((err) => {
  console.error("Postgres integration check failed:", err.message);
  process.exit(1);
});

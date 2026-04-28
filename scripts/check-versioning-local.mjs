import { execSync } from "node:child_process";
import fs from "node:fs";

function run(cmd, fallback = "") {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").trim();
  } catch {
    return fallback;
  }
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function parseSemver(value) {
  const m = String(value || "").trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const version = String(pkg.version || "").trim();
if (!parseSemver(version)) {
  fail(`Versioning check failed: package.json version "${version}" must be strict SemVer (x.y.z).`);
}

const branch = run("git rev-parse --abbrev-ref HEAD", "");
if (!branch) {
  fail("Versioning check failed: unable to determine current git branch.");
}

if (branch.startsWith("release/")) {
  const declared = branch.replace(/^release\//, "").trim();
  if (declared !== version) {
    fail(`Versioning check failed: release branch "${branch}" must match package.json version "${version}".`);
  }
}

if (branch.startsWith("hotfix/")) {
  const declared = branch.replace(/^hotfix\//, "").trim();
  if (declared !== version) {
    fail(`Versioning check failed: hotfix branch "${branch}" must match package.json version "${version}".`);
  }
}

if (branch.startsWith("feature/") || branch.startsWith("fix/")) {
  const changed = run("git diff --name-only HEAD", "");
  const files = changed ? changed.split(/\r?\n/).filter(Boolean) : [];
  if (files.includes("package.json")) {
    fail(`Versioning check failed: version bumps are not allowed on ${branch}. Use release/* or hotfix/* branch.`);
  }
}

console.log(`Versioning check passed: ${branch} @ v${version}`);

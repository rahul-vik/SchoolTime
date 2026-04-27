import fs from "node:fs";
import { execSync } from "node:child_process";

const eventName = process.env.GITHUB_EVENT_NAME || "";
const baseRef = process.env.GITHUB_BASE_REF || "";
const headRef = process.env.GITHUB_HEAD_REF || "";
const isReleaseBranch = headRef.startsWith("release/");
const isHotfixBranch = headRef.startsWith("hotfix/");

function run(cmd, fallback = "") {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString("utf8").trim();
  } catch {
    return fallback;
  }
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (eventName !== "pull_request") {
  console.log("Release governance check skipped (not a pull request event).");
  process.exit(0);
}

const baseBranch = baseRef || "";
const compareBase = baseBranch === "main" ? "origin/main" : baseBranch === "develop" ? "origin/develop" : "";
if (!compareBase) {
  console.log("Release governance check skipped (base branch is not main/develop).");
  process.exit(0);
}

const changedRaw = run(`git diff --name-only ${compareBase}...HEAD`, "");
const changed = changedRaw ? changedRaw.split(/\r?\n/).filter(Boolean) : [];
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const mainPkgRaw = run("git show origin/main:package.json", "");
const mainPkg = mainPkgRaw ? JSON.parse(mainPkgRaw) : null;

const requiresReleaseMetaChanges = !mainPkg || String(mainPkg.version || "") !== String(pkg.version || "");
if (baseBranch === "develop") {
  if (isReleaseBranch || isHotfixBranch) {
    console.log("Release governance check passed (release/hotfix branch into develop).");
    process.exit(0);
  }
  if (changed.includes("package.json")) {
    fail("Release governance failed: package.json version bumps are only allowed on release/* or hotfix/* branches.");
  }
  if (changed.includes("CHANGELOG.md")) {
    fail("Release governance failed: CHANGELOG.md release entries are only allowed on release/* or hotfix/* branches.");
  }
  console.log("Release governance check passed.");
  process.exit(0);
}

if (!isReleaseBranch && !isHotfixBranch) {
  console.log("Release governance check skipped (PR to main is not release/* or hotfix/*).");
  process.exit(0);
}

if (requiresReleaseMetaChanges) {
  if (!changed.includes("package.json")) {
    fail("Release governance failed: package.json version bump is required for release/hotfix PRs.");
  }
  if (!changed.includes("CHANGELOG.md")) {
    fail("Release governance failed: CHANGELOG.md update is required for release/hotfix PRs.");
  }
}

if (isReleaseBranch) {
  const declared = headRef.replace(/^release\//, "").trim();
  if (pkg.version !== declared) {
    fail(`Release governance failed: release branch (${declared}) must match package.json version (${pkg.version}).`);
  }
}

console.log("Release governance check passed.");

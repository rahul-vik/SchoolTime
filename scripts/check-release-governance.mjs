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

function parseSemver(value) {
  const m = String(value || "").trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function compareSemver(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
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
const parsedCurrent = parseSemver(pkg.version);
if (!parsedCurrent) {
  fail(`Release governance failed: package.json version "${pkg.version}" must be strict SemVer (x.y.z).`);
}
const mainPkgRaw = run("git show origin/main:package.json", "");
const mainPkg = mainPkgRaw ? JSON.parse(mainPkgRaw) : null;
const parsedMain = parseSemver(mainPkg?.version || "");
if (mainPkg && !parsedMain) {
  fail(`Release governance failed: origin/main package.json version "${mainPkg.version}" is invalid SemVer.`);
}

const requiresReleaseMetaChanges = !mainPkg || String(mainPkg.version || "") !== String(pkg.version || "");
if (baseBranch === "develop") {
  if (isReleaseBranch) {
    const declared = headRef.replace(/^release\//, "").trim();
    if (pkg.version !== declared) {
      fail(`Release governance failed: release branch (${declared}) must match package.json version (${pkg.version}).`);
    }
    const parsedDeclared = parseSemver(declared);
    if (!parsedDeclared) {
      fail(`Release governance failed: release branch name "${declared}" must be strict SemVer (x.y.z).`);
    }
    console.log("Release governance check passed (release branch into develop).");
    process.exit(0);
  }
  if (isHotfixBranch) {
    const declared = headRef.replace(/^hotfix\//, "").trim();
    if (pkg.version !== declared) {
      fail(`Release governance failed: hotfix branch (${declared}) must match package.json version (${pkg.version}).`);
    }
    const parsedDeclared = parseSemver(declared);
    if (!parsedDeclared) {
      fail(`Release governance failed: hotfix branch name "${declared}" must be strict SemVer (x.y.z).`);
    }
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

if (isHotfixBranch) {
  const declared = headRef.replace(/^hotfix\//, "").trim();
  if (pkg.version !== declared) {
    fail(`Release governance failed: hotfix branch (${declared}) must match package.json version (${pkg.version}).`);
  }
}

if (parsedMain) {
  if (compareSemver(parsedCurrent, parsedMain) <= 0) {
    fail(
      `Release governance failed: package.json version (${pkg.version}) must be greater than origin/main (${mainPkg.version}) for release/hotfix PRs.`
    );
  }
}

console.log("Release governance check passed.");

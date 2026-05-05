#!/usr/bin/env node
/**
 * Merge origin/main into develop and regenerate AUTO_* docs so GitHub does not
 * report conflicts on develop → main PRs.
 *
 * Usage:
 *   git checkout develop && git pull origin develop
 *   npm run release:sync-develop
 *   git status   # then commit + push if files changed
 *
 * If conflicts remain outside AUTO_* files, resolve them manually, then:
 *   npm run docs:auto
 *   git add docs/AUTO_CHANGELOG.md docs/AUTO_RULES_INTELLIGENCE.md
 *   git commit
 */
import { execSync } from "node:child_process";

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: "inherit", encoding: "utf8", ...opts });
}

function runOut(cmd) {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

const branch = runOut("git rev-parse --abbrev-ref HEAD");
if (branch !== "develop") {
  fail(`Run this on branch "develop" (current: "${branch}").`);
}

const dirty = runOut("git status --porcelain");
if (dirty) {
  fail(
    "Working tree is not clean. Commit or stash changes before release:sync-develop.\n" +
      dirty,
  );
}

console.log("[release:sync-develop] git fetch origin …");
run("git fetch origin");

console.log("[release:sync-develop] merging origin/main …");
try {
  run(`git merge origin/main -m "Merge branch 'main' into develop (pre-main PR sync)"`);
} catch {
  console.log("[release:sync-develop] merge needs conflict resolution.");
}

let unmerged = runOut("git diff --name-only --diff-filter=U")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

if (unmerged.length) {
  const autoPaths = unmerged.filter(
    (p) => p === "docs/AUTO_CHANGELOG.md" || p === "docs/AUTO_RULES_INTELLIGENCE.md",
  );

  if (autoPaths.length) {
    console.log("[release:sync-develop] regenerating AUTO_* via npm run docs:auto …");
    run("npm run docs:auto");
    run("git add docs/AUTO_CHANGELOG.md docs/AUTO_RULES_INTELLIGENCE.md");
  }

  unmerged = runOut("git diff --name-only --diff-filter=U")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (unmerged.length) {
    fail(
      `[release:sync-develop] Unresolved conflicts:\n  ${unmerged.join("\n  ")}\n` +
        "Fix manually, then run npm run docs:auto and git add on the AUTO_* files if needed.",
    );
  }

  const mergeHead = runOut("git rev-parse -q --verify MERGE_HEAD");
  if (mergeHead) {
    console.log("[release:sync-develop] completing merge commit …");
    run("git commit --no-edit");
  }
}

console.log("[release:sync-develop] npm run docs:auto (final consistency check) …");
run("npm run docs:auto");

const changes = runOut("git status --porcelain");
if (changes) {
  run("git add docs/AUTO_CHANGELOG.md docs/AUTO_RULES_INTELLIGENCE.md");
}

const after = runOut("git status --porcelain");
console.log("\n[release:sync-develop] Finished.");
if (after) {
  console.log("Staged or unstaged changes present. Review `git status`, then:\n  git commit -m \"chore: regenerate AUTO_* after syncing main into develop\"\n  git push origin develop");
} else {
  console.log("Nothing to commit. Push develop if you added merge commits: git push origin develop");
}

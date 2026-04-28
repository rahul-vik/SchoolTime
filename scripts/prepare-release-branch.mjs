import { execSync } from "node:child_process";

function run(cmd, opts = {}) {
  try {
    execSync(cmd, { stdio: "inherit", ...opts });
  } catch (err) {
    process.exit(err?.status || 1);
  }
}

function runOut(cmd, fallback = "") {
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

const branch = runOut("git rev-parse --abbrev-ref HEAD", "");
if (!(branch.startsWith("release/") || branch.startsWith("hotfix/"))) {
  fail(`Release prepare failed: current branch "${branch}" is not release/* or hotfix/*.`);
}

console.log(`[release-prepare] Branch: ${branch}`);
run("git fetch origin");
console.log("[release-prepare] Merging origin/main to pre-resolve generated-doc conflicts...");
run("git merge origin/main");
console.log("[release-prepare] Regenerating auto docs...");
run("npm run docs:auto");
run("git add docs/AUTO_CHANGELOG.md docs/AUTO_RULES_INTELLIGENCE.md");
console.log("[release-prepare] Done. Commit if files changed, then continue release checks/push.");

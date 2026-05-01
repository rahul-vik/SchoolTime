/**
 * Mirrors `.github/workflows/ci.yml` locally so pushes are unlikely to fail CI.
 * Set SKIP_VERIFY_PUSH=1 to skip (or use `git push --no-verify`).
 */
import { execSync } from "node:child_process";

function run(cmd, env = process.env) {
  execSync(cmd, { stdio: "inherit", env, shell: process.platform === "win32" });
}

function getBranch() {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

if (process.env.SKIP_VERIFY_PUSH === "1") {
  console.log("verify-before-push: skipped (SKIP_VERIFY_PUSH=1)");
  process.exit(0);
}

console.log("verify-before-push: running CI-equivalent checks…\n");

run("npm run check:versioning");

const branch = getBranch();
const needsGovernance = branch.startsWith("release/") || branch.startsWith("hotfix/");
if (needsGovernance) {
  try {
    execSync("git fetch origin main --quiet", {
      stdio: process.env.VERIFY_PUSH_VERBOSE ? "inherit" : "ignore",
    });
  } catch {
    console.warn(
      "verify-before-push: warning — fetch origin/main failed; release governance may use a stale main.\n"
    );
  }
  const env = {
    ...process.env,
    GITHUB_EVENT_NAME: "pull_request",
    GITHUB_BASE_REF: "main",
    GITHUB_HEAD_REF: branch,
  };
  console.log("▶ check:release-governance (simulated PR base=main, head=" + branch + ")\n");
  run("npm run check:release-governance", env);
}

console.log("▶ build\n");
run("npm run build");

console.log("▶ smoke:prod\n");
run("npm run smoke:prod");

console.log("▶ audit:security\n");
run("npm run audit:security");

console.log("\nverify-before-push: all checks passed.\n");

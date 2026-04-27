import { execSync } from "node:child_process";

function run(command, fallback = "") {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "pipe"] }).toString("utf8").trim();
  } catch {
    return fallback;
  }
}

const changedRaw = run("git diff --name-only HEAD~1 HEAD", "");
const changedFiles = changedRaw ? changedRaw.split(/\r?\n/).filter(Boolean) : [];

const highRiskMatchers = [
  /^server\/routes\/auth/i,
  /^server\/routes\/license/i,
  /^server\/routes\/apiKey/i,
  /^server\/db/i,
  /^server\/config\/env/i,
  /^server\/middleware\//i,
  /^scripts\/migrate/i,
  /^docs\/POSTGRES_MIGRATION\.md$/i,
  /^\.github\/workflows\/.*deploy/i,
];

const mediumRiskMatchers = [
  /^server\//i,
  /^\.github\/workflows\//i,
  /^\.cursor\/rules\//i,
];

const classify = (file) => {
  if (highRiskMatchers.some((rx) => rx.test(file))) return "high";
  if (mediumRiskMatchers.some((rx) => rx.test(file))) return "medium";
  return "low";
};

let risk = "low";
for (const file of changedFiles) {
  const r = classify(file);
  if (r === "high") {
    risk = "high";
    break;
  }
  if (r === "medium") risk = "medium";
}

// Additional guardrail: huge change sets are never auto-fixed/auto-merged.
const maxFilesForAuto = 6;
const safeAutofix = risk === "low" && changedFiles.length <= maxFilesForAuto;

console.log(`risk=${risk}`);
console.log(`safe_autofix=${safeAutofix ? "true" : "false"}`);
console.log(`changed_files=${changedFiles.length}`);
if (changedFiles.length) {
  console.log("files:");
  for (const file of changedFiles) console.log(`- ${file}`);
}

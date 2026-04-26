import fs from "node:fs";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const versionArgIdx = args.findIndex((a) => a === "--version");
const version = versionArgIdx >= 0 ? args[versionArgIdx + 1] : "";

if (!version) {
  console.error("Missing --version argument");
  process.exit(1);
}

const changelogPath = "CHANGELOG.md";
const today = new Date().toISOString().slice(0, 10);

function run(cmd, fallback = "") {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString("utf8").trim();
  } catch {
    return fallback;
  }
}

const latestTag = run("git describe --tags --abbrev=0", "");
const range = latestTag ? `${latestTag}..HEAD` : "HEAD";
const commitsRaw = run(`git log --pretty=format:%s ${range}`, "");
const commits = commitsRaw
  ? commitsRaw
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((m) => !m.startsWith("chore(release):"))
      .slice(0, 50)
  : [];

const bullets = commits.length ? commits.map((m) => `- ${m}`) : ["- Maintenance release."];
const newSection = [`## [${version}] - ${today}`, "", ...bullets, ""].join("\n");

let content = fs.existsSync(changelogPath)
  ? fs.readFileSync(changelogPath, "utf8")
  : "# Changelog\n\nAll notable changes to SchoolTime are documented in this file.\n\n";

if (content.includes(`## [${version}]`)) {
  console.log(`CHANGELOG already contains version ${version}`);
  process.exit(0);
}

const marker = "All notable changes to SchoolTime are documented in this file.";
if (content.includes(marker)) {
  content = content.replace(`${marker}\n\n`, `${marker}\n\n${newSection}\n`);
} else {
  content = `${content.trim()}\n\n${newSection}\n`;
}

fs.writeFileSync(changelogPath, content, "utf8");
console.log(`Updated CHANGELOG.md for ${version}`);

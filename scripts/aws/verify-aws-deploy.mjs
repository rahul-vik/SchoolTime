#!/usr/bin/env node
/**
 * Smoke-check a deployed API base URL.
 * Usage: node scripts/aws/verify-aws-deploy.mjs https://api.example.com/api
 */
const base = String(process.argv[2] || "").trim().replace(/\/+$/, "");
if (!base) {
  console.error("Usage: node scripts/aws/verify-aws-deploy.mjs <API_BASE_URL>");
  console.error("Example: https://api.yourdomain.com/api");
  process.exit(1);
}

const healthUrl = `${base}/health`;

async function main() {
  console.log(`Checking ${healthUrl} ...`);
  let res;
  try {
    res = await fetch(healthUrl, { method: "GET", cache: "no-store" });
  } catch (err) {
    console.error("FAIL: could not reach API (network / DNS / HTTPS / firewall).");
    console.error(err?.message || err);
    process.exit(1);
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.error(`FAIL: expected JSON, got HTTP ${res.status}`);
    console.error(text.slice(0, 200));
    process.exit(1);
  }
  if (!res.ok || !json.ok) {
    console.error(`FAIL: HTTP ${res.status}`, json);
    process.exit(1);
  }
  console.log("OK: /api/health");
  console.log(JSON.stringify(json, null, 2));
  console.log("\nNext: open GitHub Pages, register a school, generate a timetable.");
}

main();

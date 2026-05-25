import fs from "node:fs";
import path from "node:path";

let cached = null;

/**
 * Release metadata for the deployed web bundle (matches Vite `define` when
 * `dist/schooltime-release.json` exists). Used by `GET /api/health` so clients
 * can detect newer deployments.
 */
export function getAppReleaseMeta() {
  if (cached) return cached;

  const cwd = process.cwd();
  const distJson = path.join(cwd, "dist", "schooltime-release.json");

  try {
    const raw = fs.readFileSync(distJson, "utf8");
    cached = JSON.parse(raw);
    return cached;
  } catch {
    try {
      const pkgPath = path.join(cwd, "package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      const v = String(pkg.version || "0.0.0").trim() || "0.0.0";
      const bn = String(process.env.APP_BUILD_NUMBER || "0").trim() || "0";
      const sha =
        String(process.env.GITHUB_SHA || process.env.RENDER_GIT_COMMIT || "unknown")
          .trim()
          .slice(0, 12) || "unknown";
      cached = {
        version: v,
        buildNumber: /^\d+$/.test(bn) ? bn : "0",
        buildSha: sha,
        buildBranch: "runtime",
        buildTime: new Date().toISOString(),
        releaseLabel: `V${v} (${/^\d+$/.test(bn) ? bn : "0"})`,
      };
      return cached;
    } catch {
      cached = {
        version: "0.0.0",
        buildNumber: "0",
        buildSha: "unknown",
        buildBranch: "unknown",
        buildTime: "",
        releaseLabel: "V0.0.0 (0)",
      };
      return cached;
    }
  }
}

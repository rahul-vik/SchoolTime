import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json" assert { type: "json" };
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function safeGit(command, fallback = "unknown") {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").trim() || fallback;
  } catch {
    return fallback;
  }
}

const buildSha = safeGit("git rev-parse --short HEAD", "local");
const buildBranch = safeGit("git rev-parse --abbrev-ref HEAD", "local");
const buildNumber = safeGit("git rev-list --count HEAD", "0");
const buildTime = new Date().toISOString();
const releaseLabel = `V${pkg.version} (${buildNumber})`;

function schooltimeReleaseJsonPlugin() {
  const meta = {
    version: pkg.version,
    buildNumber,
    buildSha,
    buildBranch,
    buildTime,
    releaseLabel,
  };
  return {
    name: "schooltime-release-json",
    closeBundle() {
      const outDir = path.resolve("dist");
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "schooltime-release.json"), `${JSON.stringify(meta)}\n`, "utf8");
    },
  };
}

export default defineConfig({
  plugins: [react(), schooltimeReleaseJsonPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD_NUMBER__: JSON.stringify(buildNumber),
    __APP_RELEASE_LABEL__: JSON.stringify(releaseLabel),
    __APP_BUILD_SHA__: JSON.stringify(buildSha),
    __APP_BUILD_BRANCH__: JSON.stringify(buildBranch),
    __APP_BUILD_TIME__: JSON.stringify(buildTime),
  },
  server: {
    // Use VITE_API_BASE_URL=/api in dev so export downloads hit the real API instead of index.html.
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
});

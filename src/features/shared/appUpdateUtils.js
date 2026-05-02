/** @typedef {{ version?: string, buildNumber?: string, buildSha?: string }} ReleaseInfo */

function semverGt(a, b) {
  const pa = String(a || "0").split(".").map((x) => parseInt(x, 10) || 0);
  const pb = String(b || "0").split(".").map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return true;
    if (da < db) return false;
  }
  return false;
}

/** True when the server's deployed web bundle is newer than this client's build. */
export function serverReleaseIsNewer(server, client) {
  if (!server || typeof server.version !== "string") return false;
  const sv = server.version.trim();
  const cv = String(client.version || "").trim();
  if (!sv || !cv || cv === "dev") return false;

  if (semverGt(cv, sv)) return false;
  if (semverGt(sv, cv)) return true;

  const sn = parseInt(String(server.buildNumber || "0"), 10) || 0;
  const cn = parseInt(String(client.buildNumber || "0"), 10) || 0;
  if (sn > cn) return true;
  if (sn < cn) return false;

  const sSha = String(server.buildSha || "").trim();
  const cSha = String(client.buildSha || "").trim();
  if (!sSha || !cSha || sSha === "unknown" || cSha === "local" || cSha === "unknown") return false;
  return sSha !== cSha;
}

export function getClientReleaseSnapshot() {
  return {
    version: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev",
    buildNumber: typeof __APP_BUILD_NUMBER__ !== "undefined" ? __APP_BUILD_NUMBER__ : "0",
    buildSha: typeof __APP_BUILD_SHA__ !== "undefined" ? __APP_BUILD_SHA__ : "local",
  };
}

export async function hardRefreshSchoolTimeApp() {
  try {
    if (typeof caches !== "undefined" && typeof caches.keys === "function") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // ignore cache API errors
  }
  window.location.reload();
}

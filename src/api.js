function resolveApiBase(value) {
  const fallback = "http://localhost:8787/api";
  const raw = String(value || fallback).trim();
  if (!raw) return fallback;

  // Relative API bases (e.g. "/api") are valid in local/proxy setups.
  if (raw.startsWith("/")) return raw.replace(/\/+$/, "") || "/api";

  try {
    const parsed = new URL(raw);
    const cleanPath = parsed.pathname.replace(/\/+$/, "");
    // School app APIs are tenant-auth routes under /api. If env accidentally points to /api/b2b,
    // user-auth calls (like purchase requests) can hit API-key middleware and fail.
    if (cleanPath === "/api/b2b") parsed.pathname = "/api";
    // Render/GitHub Pages setup often provides only origin; backend routes live under /api.
    if (!cleanPath || cleanPath === "/") parsed.pathname = "/api";
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    // Leave custom non-URL values untouched; request errors will surface clearly.
    const cleaned = raw.replace(/\/+$/, "");
    if (cleaned === "/api/b2b") return "/api";
    return cleaned;
  }
}

const API_BASE = resolveApiBase(import.meta.env.VITE_API_BASE_URL);
const SESSION_REFRESH_SKEW_MS = 2 * 60 * 1000; // refresh 2 minutes before token expiry
const SESSION_REFRESH_MIN_DELAY_MS = 30 * 1000;
let sessionRefreshTimer = null;
let refreshInFlight = null;

/** Public `GET /health` — no auth; used for app update detection in production. */
export async function getPublicHealth() {
  const url = `${API_BASE}/health`;
  let res;
  try {
    res = await fetch(url, { method: "GET", cache: "no-store" });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

/** Decode JWT payload (no signature verify) — used only to reject platform tokens stored as school session. */
function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function clearStoredSession() {
  localStorage.removeItem("tt_token");
  localStorage.removeItem("tt_refresh_token");
}

function normalizeSchoolAccessToken(token) {
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (payload?.scope === "platform_creator") {
    clearStoredSession();
    return null;
  }
  return token;
}

function getToken() {
  return normalizeSchoolAccessToken(localStorage.getItem("tt_token"));
}

function getRefreshToken() {
  return localStorage.getItem("tt_refresh_token");
}

function getTokenExpiryMs(token) {
  const payload = decodeJwtPayload(token);
  const expSeconds = Number(payload?.exp || 0);
  return expSeconds > 0 ? expSeconds * 1000 : null;
}

function clearSessionRefreshTimer() {
  if (sessionRefreshTimer) {
    window.clearTimeout(sessionRefreshTimer);
    sessionRefreshTimer = null;
  }
}

function scheduleSessionRefresh() {
  clearSessionRefreshTimer();
  const token = getToken();
  const refreshToken = getRefreshToken();
  if (!token || !refreshToken) return;
  const expiryAtMs = getTokenExpiryMs(token);
  if (!expiryAtMs) return;
  const delayMs = Math.max(SESSION_REFRESH_MIN_DELAY_MS, expiryAtMs - Date.now() - SESSION_REFRESH_SKEW_MS);
  sessionRefreshTimer = window.setTimeout(() => {
    refreshSession().catch(() => null);
  }, delayMs);
}

function setTokens(accessToken, refreshToken) {
  localStorage.setItem("tt_token", accessToken);
  if (refreshToken) localStorage.setItem("tt_refresh_token", refreshToken);
  scheduleSessionRefresh();
}

export function clearToken() {
  clearStoredSession();
  clearSessionRefreshTimer();
}

function forceLogoutToAuth() {
  clearStoredSession();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("schooltime:auth-expired"));
  }
}

/** 401 from B2B middleware when a tenant route is missing on the server — not a session problem. */
function isMisroutedApiKey401(res, data) {
  return res.status === 401 && typeof data?.error === "string" && /missing api key/i.test(data.error);
}

function misroutedTenantApiMessage() {
  return "This feature is not available on the API server (missing route). Restart or redeploy the backend, then try again.";
}

async function rawRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error("Cannot reach the API server. Check VITE_API_BASE_URL, backend status, and CORS settings.");
  }
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function refreshSession() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  const { res, data } = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  }).then(async (r) => ({ res: r, data: await r.json().catch(() => ({})) }));

  if (!res.ok || !data.token) {
    clearToken();
    return false;
  }
  setTokens(data.token, data.refreshToken);
  return true;
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function request(path, options = {}) {
  const { suppressAutoLogout = false, ...requestOptions } = options;
  // Recover if access token was cleared but refresh token still exists.
  if (!getToken() && getRefreshToken() && !path.startsWith("/auth/")) {
    await refreshSession().catch(() => false);
  }
  let { res, data } = await rawRequest(path, requestOptions);
  if (isMisroutedApiKey401(res, data)) {
    throw new Error(misroutedTenantApiMessage());
  }
  if (res.status === 401 && !path.startsWith("/auth/")) {
    const refreshed = await refreshSession();
    if (refreshed) {
      ({ res, data } = await rawRequest(path, requestOptions));
    } else {
      if (!suppressAutoLogout) forceLogoutToAuth();
      throw new Error("Session expired. Please sign in again.");
    }
  }
  if (isMisroutedApiKey401(res, data)) {
    throw new Error(misroutedTenantApiMessage());
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth/")) {
      if (!suppressAutoLogout) forceLogoutToAuth();
      throw new Error("Session expired. Please sign in again.");
    }
    if (res.status === 403 && typeof data.error === "string" && data.error.includes("platform portal only")) {
      clearToken();
    }
    const err = new Error(data.error || "Request failed");
    if (data.preflight) err.preflight = data.preflight;
    if (data.details) err.details = data.details;
    throw err;
  }
  return data;
}

/** Same 401 → refresh → retry behavior as `request`, for non-JSON responses (e.g. file downloads). */
async function fetchWithAuthRetry(url, init = {}) {
  const authHeaders = () => {
    const headers = { ...(init.headers || {}) };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  };
  let res = await fetch(url, { ...init, headers: authHeaders() });
  if (res.status === 401 && !String(url).includes("/auth/")) {
    const refreshed = await refreshSession();
    if (refreshed) res = await fetch(url, { ...init, headers: authHeaders() });
  }
  return res;
}

export async function register(payload) {
  const data = await request("/auth/register", { method: "POST", body: JSON.stringify(payload) });
  setTokens(data.token, data.refreshToken);
  return data;
}

export async function login(payload) {
  const data = await request("/auth/login", { method: "POST", body: JSON.stringify(payload) });
  setTokens(data.token, data.refreshToken);
  return data;
}

export async function logout() {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    try {
      await request("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) });
    } catch {
      // no-op
    }
  }
  clearToken();
}

export function hasStoredSession() {
  return Boolean(getToken());
}

// Keep session alive across long-running active usage.
if (typeof window !== "undefined" && getToken() && getRefreshToken()) {
  scheduleSessionRefresh();
}

export function getMe() { return request("/me"); }
export function updateMe(payload) { return request("/me", { method: "PATCH", body: JSON.stringify(payload) }); }
export function loadState() { return request("/state"); }
export function saveState(state, section) {
  const q = section ? `?section=${encodeURIComponent(section)}` : "";
  return request(`/state${q}`, { method: "PUT", body: JSON.stringify(state), suppressAutoLogout: true });
}
export function generateTimetable(state) {
  if (!getToken()) throw new Error("Your session is not available. Please sign in again.");
  return request("/timetable/generate", { method: "POST", body: JSON.stringify(state) });
}
export function getLatestTimetable() {
  return request("/timetable/latest", { suppressAutoLogout: true });
}

export function fetchValidEditTargets(body) {
  return request("/timetable/valid-edit-targets", {
    method: "POST",
    body: JSON.stringify(body),
    suppressAutoLogout: true,
  });
}

export function fetchValidAddOptions(body) {
  return request("/timetable/valid-add-options", {
    method: "POST",
    body: JSON.stringify(body),
    suppressAutoLogout: true,
  });
}

export function applyTimetableEdit(body) {
  return request("/timetable/apply-edit", {
    method: "POST",
    body: JSON.stringify(body),
    suppressAutoLogout: true,
  });
}
export function getPurchasePackInfo() {
  return request("/license/purchase-pack-info", { suppressAutoLogout: true });
}

export function createCreditPurchaseRequest(body) {
  return request("/license/purchase-request", {
    method: "POST",
    body: JSON.stringify(body),
    suppressAutoLogout: true,
  });
}

export function getMyCreditPurchaseRequests() {
  return request("/license/my-credit-purchase-requests", { suppressAutoLogout: true });
}
export function getUsers() { return request("/users", { suppressAutoLogout: true }); }
export function createUser(payload) { return request("/users", { method: "POST", body: JSON.stringify(payload) }); }
export function updateUser(id, payload) { return request(`/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) }); }
export function getAuditLogs() { return request("/audit-logs", { suppressAutoLogout: true }); }
export function getValidationFindings(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v) !== "") q.set(k, String(v));
  });
  return request(`/validation/findings?${q.toString()}`, { suppressAutoLogout: true });
}
export function approveApplyValidationFinding(findingId, runId) {
  return request(`/validation/findings/${encodeURIComponent(findingId)}/apply`, {
    method: "POST",
    body: JSON.stringify({ runId }),
  });
}
export function getAuditLogsFiltered(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v) !== "") q.set(k, String(v));
  });
  return request(`/audit-logs?${q.toString()}`, { suppressAutoLogout: true });
}
export async function exportAuditLogsCsv(params = {}) {
  const token = getToken();
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v) !== "") q.set(k, String(v));
  });
  const res = await fetch(`${API_BASE}/audit-logs/export.csv?${q.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to export audit logs");
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "audit-logs.csv";
  a.click();
  window.URL.revokeObjectURL(url);
}
export function getUsage() { return request("/usage", { suppressAutoLogout: true }); }
export function getApiKeys() { return request("/api-keys", { suppressAutoLogout: true }); }
export function createApiKey(name) { return request("/api-keys", { method: "POST", body: JSON.stringify({ name }) }); }
export function revokeApiKey(id) { return request(`/api-keys/${id}`, { method: "DELETE" }); }
export function requestPasswordReset(email) { return request("/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email }) }); }
export function confirmPasswordReset(token, newPassword) { return request("/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ token, newPassword }) }); }

function parseFileNameFromDisposition(value) {
  if (!value) return null;
  const utf8 = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) return decodeURIComponent(utf8[1]);
  const quoted = value.match(/filename="([^"]+)"/i);
  if (quoted?.[1]) return quoted[1];
  const plain = value.match(/filename=([^;\s]+)/i);
  return plain?.[1] || null;
}

/** Mirrors server `buildExportFilename` when Content-Disposition is not exposed (e.g. older CORS). */
function defaultTimetableExportFilename(type, scope) {
  const s = String(scope ?? "")
    .trim()
    .toUpperCase()
    .replace(/-/g, "_")
    .replace(/\s+/g, "_");
  const date = new Date().toISOString().slice(0, 10);
  const kind =
    s === "ALL_TEACHERS"
      ? "teacher-timetables"
      : s === "ALL_DIVISIONS"
        ? "class-timetables"
        : "summary-reports";
  const ext = String(type).trim().toUpperCase() === "PDF" ? "pdf" : "xlsx";
  return `SchoolTime-${kind}-${date}.${ext}`;
}

function bytesLookLikePdf(buf) {
  if (buf.byteLength < 4) return false;
  const head = new Uint8Array(buf, 0, 4);
  return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46; // "%PDF"
}

function bytesLookLikeZip(buf) {
  if (buf.byteLength < 4) return false;
  const head = new Uint8Array(buf, 0, 4);
  return head[0] === 0x50 && head[1] === 0x4b && (head[2] === 0x03 || head[2] === 0x05 || head[2] === 0x07) && (head[3] === 0x04 || head[3] === 0x06 || head[3] === 0x08);
}

function sniffWrongDocumentResponse(buf, contentType) {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("text/html") || ct.includes("application/json") || ct.includes("text/plain")) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buf.byteLength > 12000 ? buf.slice(0, 12000) : buf);
    let hint = "The download URL returned a web page or JSON instead of a file. Set VITE_API_BASE_URL to your API base (see .env.example), or use /api with npm run dev after starting the API server.";
    try {
      const j = JSON.parse(text);
      if (typeof j.error === "string" && j.error) hint = j.error;
      if (typeof j.detail === "string" && j.detail) hint = `${hint} — ${j.detail}`;
    } catch {
      if (text.trim().startsWith("<!") || text.trim().startsWith("<html")) {
        hint = "Received HTML instead of a spreadsheet or PDF. Your API base URL is probably pointing at the Vite dev server. Use http://localhost:8787/api or configure the dev proxy and set VITE_API_BASE_URL=/api.";
      }
    }
    return hint;
  }
  return null;
}

export async function downloadTimetableExport(type, scope, runId) {
  if (!getToken() && !getRefreshToken()) throw new Error("Not authenticated");
  const q = new URLSearchParams({ type, scope, t: String(Date.now()) });
  if (runId) q.set("runId", String(runId));
  const downloadUrl = `${API_BASE}/timetable/download?${q.toString()}`;
  const res = await fetchWithAuthRetry(downloadUrl, { method: "GET", cache: "no-store" });
  const contentType = res.headers.get("content-type") || "";
  const buf = await res.arrayBuffer();

  if (!res.ok) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buf.byteLength > 24000 ? buf.slice(0, 24000) : buf);
    let msg = "Failed to download export";
    try {
      const j = JSON.parse(text);
      if (typeof j.error === "string" && j.error) msg = j.error;
      if (typeof j.detail === "string" && j.detail) msg = `${msg} — ${j.detail}`;
    } catch {
      const t = text.trim();
      if (t) msg = t.length > 240 ? `${t.slice(0, 240)}…` : t;
    }
    if (msg === "Failed to download export") msg = `${msg} (HTTP ${res.status})`;
    throw new Error(msg);
  }

  const wrongDoc = sniffWrongDocumentResponse(buf, contentType);
  if (wrongDoc) throw new Error(wrongDoc);

  if (type === "PDF") {
    if (!bytesLookLikePdf(buf)) {
      throw new Error(
        "Downloaded data is not a valid PDF (wrong URL or API error). Check VITE_API_BASE_URL and that the API server is running.",
      );
    }
  } else if (!bytesLookLikeZip(buf)) {
    throw new Error(
      "Downloaded data is not a valid Excel file (.xlsx is a ZIP). Check VITE_API_BASE_URL and that the API server is running.",
    );
  }

  const mime =
    type === "PDF"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const blob = new Blob([buf], { type: mime });
  const name =
    parseFileNameFromDisposition(res.headers.get("content-disposition")) ||
    defaultTimetableExportFilename(type, scope);
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can abort the download in some browsers.
  window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);
  return { filename: name };
}

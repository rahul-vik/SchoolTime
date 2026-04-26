function resolveApiBase(value) {
  const fallback = "http://localhost:8787/api";
  const raw = String(value || fallback).trim();
  if (!raw) return fallback;

  // Relative API bases (e.g. "/api") are valid in local/proxy setups.
  if (raw.startsWith("/")) return raw.replace(/\/+$/, "") || "/api";

  try {
    const parsed = new URL(raw);
    const cleanPath = parsed.pathname.replace(/\/+$/, "");
    // Render/GitHub Pages setup often provides only origin; backend routes live under /api.
    if (!cleanPath || cleanPath === "/") parsed.pathname = "/api";
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    // Leave custom non-URL values untouched; request errors will surface clearly.
    return raw.replace(/\/+$/, "");
  }
}

const API_BASE = resolveApiBase(import.meta.env.VITE_API_BASE_URL);

function getToken() {
  return localStorage.getItem("tt_token");
}

function getRefreshToken() {
  return localStorage.getItem("tt_refresh_token");
}

function setTokens(accessToken, refreshToken) {
  localStorage.setItem("tt_token", accessToken);
  if (refreshToken) localStorage.setItem("tt_refresh_token", refreshToken);
}

export function clearToken() {
  localStorage.removeItem("tt_token");
  localStorage.removeItem("tt_refresh_token");
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
}

async function request(path, options = {}) {
  let { res, data } = await rawRequest(path, options);
  if (res.status === 401 && !path.startsWith("/auth/")) {
    const refreshed = await refreshSession();
    if (refreshed) ({ res, data } = await rawRequest(path, options));
  }
  if (!res.ok) throw new Error(data.error || "Request failed");
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

export function getMe() { return request("/me"); }
export function updateMe(payload) { return request("/me", { method: "PATCH", body: JSON.stringify(payload) }); }
export function loadState() { return request("/state"); }
export function saveState(state) { return request("/state", { method: "PUT", body: JSON.stringify(state) }); }
export function generateTimetable(state) {
  if (!getToken()) throw new Error("Your session is not available. Please sign in again.");
  return request("/timetable/generate", { method: "POST", body: JSON.stringify(state) });
}
export function purchasePack() { return request("/license/purchase-pack", { method: "POST", body: JSON.stringify({}) }); }
export function getUsers() { return request("/users"); }
export function createUser(payload) { return request("/users", { method: "POST", body: JSON.stringify(payload) }); }
export function updateUser(id, payload) { return request(`/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) }); }
export function getAuditLogs() { return request("/audit-logs"); }
export function getAuditLogsFiltered(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v) !== "") q.set(k, String(v));
  });
  return request(`/audit-logs?${q.toString()}`);
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
export function getUsage() { return request("/usage"); }
export function getApiKeys() { return request("/api-keys"); }
export function createApiKey(name) { return request("/api-keys", { method: "POST", body: JSON.stringify({ name }) }); }
export function revokeApiKey(id) { return request(`/api-keys/${id}`, { method: "DELETE" }); }
export function requestPasswordReset(email) { return request("/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email }) }); }
export function confirmPasswordReset(token, newPassword) { return request("/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ token, newPassword }) }); }

function parseFileNameFromDisposition(value) {
  if (!value) return null;
  const utf8 = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) return decodeURIComponent(utf8[1]);
  const plain = value.match(/filename="?([^";]+)"?/i);
  return plain?.[1] || null;
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

export async function downloadTimetableExport(type, scope) {
  if (!getToken() && !getRefreshToken()) throw new Error("Not authenticated");
  const q = new URLSearchParams({ type, scope });
  const downloadUrl = `${API_BASE}/timetable/download?${q.toString()}`;
  const res = await fetchWithAuthRetry(downloadUrl, { method: "GET" });
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
  const name = parseFileNameFromDisposition(res.headers.get("content-disposition")) || `schooltime-export.${type === "PDF" ? "pdf" : "xlsx"}`;
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

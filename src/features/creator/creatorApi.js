function resolveApiBase(value) {
  const fallback = "http://localhost:8787/api";
  const raw = String(value || fallback).trim();
  if (!raw) return fallback;
  if (raw.startsWith("/")) return raw.replace(/\/+$/, "") || "/api";
  try {
    const parsed = new URL(raw);
    const cleanPath = parsed.pathname.replace(/\/+$/, "");
    if (!cleanPath || cleanPath === "/") parsed.pathname = "/api";
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

const API_BASE = resolveApiBase(import.meta.env.VITE_API_BASE_URL);
const CREATOR_TOKEN_KEY = "st_creator_token";

export function getCreatorToken() {
  return localStorage.getItem(CREATOR_TOKEN_KEY);
}

export function setCreatorToken(token) {
  if (token) localStorage.setItem(CREATOR_TOKEN_KEY, token);
  else localStorage.removeItem(CREATOR_TOKEN_KEY);
}

export function clearCreatorToken() {
  localStorage.removeItem(CREATOR_TOKEN_KEY);
}

async function creatorRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const token = getCreatorToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${API_BASE}/creator${path}`, { ...options, headers });
  } catch {
    throw new Error("Cannot reach the API server. Check VITE_API_BASE_URL and that the backend is running.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function creatorLogin(password) {
  clearCreatorToken();
  const data = await creatorRequest("/login", { method: "POST", body: JSON.stringify({ password }) });
  if (data.token) setCreatorToken(data.token);
  return data;
}

export function creatorLogout() {
  clearCreatorToken();
}

export function creatorGetOverview() {
  return creatorRequest("/overview");
}

export function creatorListOrgs(params = {}) {
  const q = new URLSearchParams();
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.sortBy) q.set("sortBy", String(params.sortBy));
  if (params.sortDir) q.set("sortDir", String(params.sortDir));
  const s = q.toString();
  return creatorRequest(s ? `/orgs?${s}` : "/orgs");
}

export function creatorListUsers(params = {}) {
  const q = new URLSearchParams();
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.q) q.set("q", params.q);
  return creatorRequest(`/users?${q.toString()}`);
}

export function creatorSetUserActive(userId, isActive) {
  return creatorRequest(`/users/${encodeURIComponent(userId)}/active`, { method: "PATCH", body: JSON.stringify({ isActive }) });
}

export function creatorDeleteUser(userId) {
  return creatorRequest(`/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

export function creatorListCreditLedger(params = {}) {
  const q = new URLSearchParams();
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.orgId) q.set("orgId", params.orgId);
  return creatorRequest(`/credit-ledger?${q.toString()}`);
}

export function creatorListCreditPurchaseRequests(params = {}) {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  return creatorRequest(`/credit-purchase-requests?${q.toString()}`);
}

export function creatorApproveCreditPurchase(requestId) {
  return creatorRequest(`/credit-purchase-requests/${encodeURIComponent(requestId)}/approve`, { method: "POST", body: "{}" });
}

export function creatorRejectCreditPurchase(requestId, body = {}) {
  return creatorRequest(`/credit-purchase-requests/${encodeURIComponent(requestId)}/reject`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function creatorAdjustCredits(orgId, body) {
  return creatorRequest(`/orgs/${encodeURIComponent(orgId)}/credits`, { method: "POST", body: JSON.stringify(body) });
}

export function creatorListOrgPurges(params = {}) {
  const q = new URLSearchParams();
  if (params.limit != null) q.set("limit", String(params.limit));
  const s = q.toString();
  return creatorRequest(s ? `/org-purges?${s}` : "/org-purges");
}

export function creatorDeleteOrganization(orgId, body) {
  return creatorRequest(`/orgs/${encodeURIComponent(orgId)}`, {
    method: "DELETE",
    body: JSON.stringify(body || {}),
  });
}

export function creatorRegisterOrg(body) {
  return creatorRequest("/register-org", { method: "POST", body: JSON.stringify(body) });
}

export function creatorGetPlatformSettings() {
  return creatorRequest("/platform-settings");
}

export function creatorPatchPlatformSettings(body) {
  return creatorRequest("/platform-settings", { method: "PATCH", body: JSON.stringify(body) });
}

export function creatorListErrorLogs(params = {}) {
  const q = new URLSearchParams();
  if (params.limit != null) q.set("limit", String(params.limit));
  return creatorRequest(`/error-logs?${q.toString()}`);
}

export function creatorListAuditLogs(params = {}) {
  const q = new URLSearchParams();
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.orgId) q.set("orgId", params.orgId);
  if (params.q) q.set("q", params.q);
  return creatorRequest(`/audit-logs?${q.toString()}`);
}

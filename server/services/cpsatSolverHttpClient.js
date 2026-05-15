/**
 * POST JSON to CP-SAT sidecar with wall-clock timeout.
 * @param {string} url
 * @param {object} body
 * @param {number} timeoutMs
 * @param {string} [secret] - If set, sent as `Authorization: Bearer …`
 * @returns {Promise<object>}
 */
export async function postCpsatSolve(url, body, timeoutMs, secret) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (secret) headers.Authorization = `Bearer ${secret}`;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`CP_SAT_INVALID_JSON status=${res.status}`);
    }
    if (!res.ok) {
      throw new Error(`CP_SAT_HTTP_${res.status}`);
    }
    return json;
  } finally {
    clearTimeout(tid);
  }
}

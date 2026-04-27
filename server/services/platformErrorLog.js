import { randomUUID } from "node:crypto";
import { nowIso } from "./common.js";

const MAX_STACK = 12_000;
const MAX_MSG = 2_000;

export async function insertPlatformError(db, { level = "error", message, detail = null, stack = null, route = null, method = null, orgId = null, userId = null, metadata = null }) {
  const id = randomUUID();
  const msg = String(message || "Error").slice(0, MAX_MSG);
  const stackText = stack ? String(stack).slice(0, MAX_STACK) : null;
  const detailText = detail != null ? String(detail).slice(0, MAX_MSG) : null;
  await db.run(
    "INSERT INTO platform_error_logs (id, created_at, level, message, detail_text, stack_text, route, method, org_id, user_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    nowIso(),
    level,
    msg,
    detailText,
    stackText,
    route,
    method,
    orgId,
    userId,
    metadata ? JSON.stringify(metadata) : null,
  );
}

export async function listPlatformErrors(db, { limit = 100 } = {}) {
  const cap = Math.min(500, Math.max(1, Math.floor(Number(limit) || 100)));
  return db.all(
    "SELECT id, created_at, level, message, detail_text, stack_text, route, method, org_id, user_id, metadata_json FROM platform_error_logs ORDER BY created_at DESC LIMIT ?",
    cap,
  );
}

import { randomUUID } from "node:crypto";
import { getRefreshExpiryIso, hashOpaqueToken, makeOpaqueToken, signAuthToken } from "../auth.js";
import { nowIso } from "./common.js";

export function issueTokenPair(db, user) {
  const accessToken = signAuthToken({ userId: user.id, orgId: user.org_id, role: user.role, email: user.email });
  const refreshToken = makeOpaqueToken();
  const refreshHash = hashOpaqueToken(refreshToken);
  db.prepare("INSERT INTO refresh_tokens (id, user_id, org_id, token_hash, expires_at, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, NULL)")
    .run(randomUUID(), user.id, user.org_id, refreshHash, getRefreshExpiryIso(), nowIso());
  return { accessToken, refreshToken };
}

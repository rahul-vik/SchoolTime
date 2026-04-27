import crypto from "node:crypto";
import { comparePassword } from "../auth.js";
import { ENV } from "../config/env.js";

export function isCreatorPortalConfigured() {
  return Boolean(ENV.CREATOR_PORTAL_PASSWORD_HASH || ENV.CREATOR_PORTAL_PASSWORD);
}

export function verifyCreatorPortalPassword(plain) {
  const h = ENV.CREATOR_PORTAL_PASSWORD_HASH;
  if (h && h.startsWith("$2")) return comparePassword(String(plain), h);
  const expected = ENV.CREATOR_PORTAL_PASSWORD;
  if (!expected) return false;
  try {
    const a = Buffer.from(String(plain), "utf8");
    const b = Buffer.from(String(expected), "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

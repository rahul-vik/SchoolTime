import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { ENV } from "./config/env.js";

const JWT_SECRET = ENV.JWT_SECRET;
const JWT_EXPIRES_IN = ENV.JWT_EXPIRES_IN;
const REFRESH_DAYS = ENV.REFRESH_TOKEN_DAYS;
const CREATOR_JWT_EXPIRES_IN = ENV.CREATOR_JWT_EXPIRES_IN;

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

export function comparePassword(password, passwordHash) {
  return bcrypt.compareSync(password, passwordHash);
}

export function signAuthToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/** Platform (creator) portal — never use as a tenant session token. */
export function signCreatorToken() {
  return jwt.sign({ scope: "platform_creator", v: 1 }, JWT_SECRET, { expiresIn: CREATOR_JWT_EXPIRES_IN });
}

export function makeOpaqueToken() {
  return crypto.randomBytes(48).toString("hex");
}

export function hashOpaqueToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function getRefreshExpiryIso() {
  const ms = REFRESH_DAYS * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
}

export function verifyAuthToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing auth token" });
    return;
  }
  try {
    const decoded = verifyAuthToken(token);
    if (decoded?.scope === "platform_creator") {
      res.status(403).json({ error: "This token is for the platform portal only. Sign in from the school app for tenant APIs." });
      return;
    }
    if (!decoded.userId || !decoded.orgId) {
      res.status(401).json({ error: "Invalid auth token" });
      return;
    }
    req.auth = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid auth token" });
  }
}

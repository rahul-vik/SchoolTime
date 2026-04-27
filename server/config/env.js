const WEAK_JWT_SECRETS = new Set(["dev-secret-change-me", "change-me-in-production", "changeme", "secret"]);

function toPositiveInt(value, fallback) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) return Number(fallback);
  return parsed;
}

function parseCorsOrigins(value) {
  return String(value || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function buildEnv() {
  const NODE_ENV = process.env.NODE_ENV || "development";
  const isProduction = NODE_ENV === "production";
  const DB_CLIENT = String(process.env.DB_CLIENT || "sqlite").toLowerCase();
  const DATABASE_URL = process.env.DATABASE_URL || "";
  const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
  const PORT = toPositiveInt(process.env.PORT, 8787);
  const RATE_LIMIT_MAX = toPositiveInt(process.env.RATE_LIMIT_MAX, 120);
  const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "15m";
  const REFRESH_TOKEN_DAYS = toPositiveInt(process.env.REFRESH_TOKEN_DAYS, 30);
  const CORS_ORIGIN_RAW = process.env.CORS_ORIGIN || (isProduction ? "" : "http://localhost:5173");
  const CORS_ORIGINS = parseCorsOrigins(CORS_ORIGIN_RAW);
  const hasWildcardCors = CORS_ORIGINS.includes("*");
  const CREATOR_PORTAL_PASSWORD = String(process.env.CREATOR_PORTAL_PASSWORD || "").trim();
  const CREATOR_PORTAL_PASSWORD_HASH = String(process.env.CREATOR_PORTAL_PASSWORD_HASH || "").trim();
  const CREATOR_JWT_EXPIRES_IN = process.env.CREATOR_JWT_EXPIRES_IN || "8h";

  return {
    NODE_ENV,
    isProduction,
    DB_CLIENT,
    DATABASE_URL,
    JWT_SECRET,
    JWT_EXPIRES_IN,
    REFRESH_TOKEN_DAYS,
    PORT,
    RATE_LIMIT_MAX,
    CORS_ORIGIN_RAW,
    CORS_ORIGINS,
    hasWildcardCors,
    CREATOR_PORTAL_PASSWORD,
    CREATOR_PORTAL_PASSWORD_HASH,
    CREATOR_JWT_EXPIRES_IN,
  };
}

function validateEnv(env) {
  if (!["sqlite", "postgres"].includes(env.DB_CLIENT)) {
    throw new Error("Invalid DB_CLIENT. Supported values: sqlite, postgres.");
  }
  if (env.DB_CLIENT === "postgres" && !env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when DB_CLIENT=postgres.");
  }
  if (env.isProduction) {
    if (!env.JWT_SECRET || WEAK_JWT_SECRETS.has(env.JWT_SECRET.toLowerCase()) || env.JWT_SECRET.length < 32) {
      throw new Error("Invalid JWT_SECRET for production. Set a strong secret with at least 32 characters.");
    }
    if (env.CORS_ORIGINS.length === 0 || env.hasWildcardCors) {
      throw new Error("Invalid CORS_ORIGIN for production. Provide one or more explicit origins (comma-separated).");
    }
    const creatorConfigured = Boolean(env.CREATOR_PORTAL_PASSWORD_HASH || env.CREATOR_PORTAL_PASSWORD);
    if (creatorConfigured && !env.CREATOR_PORTAL_PASSWORD_HASH) {
      if (env.CREATOR_PORTAL_PASSWORD.length < 20) {
        throw new Error(
          "For production, set CREATOR_PORTAL_PASSWORD_HASH (bcrypt) for the platform portal, or use CREATOR_PORTAL_PASSWORD with at least 20 characters.",
        );
      }
    }
  }
}

export function getValidatedEnv() {
  const env = buildEnv();
  validateEnv(env);
  return env;
}

export const ENV = getValidatedEnv();

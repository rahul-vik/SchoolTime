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
  const SMTP_HOST = String(process.env.SMTP_HOST || "").trim();
  const SMTP_PORT = toPositiveInt(process.env.SMTP_PORT, 587);
  const SMTP_SECURE = String(process.env.SMTP_SECURE || "false").trim().toLowerCase() === "true";
  const SMTP_USER = String(process.env.SMTP_USER || "").trim();
  const SMTP_PASS = String(process.env.SMTP_PASS || "").trim();
  const SMTP_FROM = String(process.env.SMTP_FROM || "").trim();
  const SMTP_CONNECTION_TIMEOUT_MS = toPositiveInt(process.env.SMTP_CONNECTION_TIMEOUT_MS, 45_000);
  const SMTP_SOCKET_TIMEOUT_MS = toPositiveInt(process.env.SMTP_SOCKET_TIMEOUT_MS, 120_000);
  const SMTP_FORCE_IPV4 = ["1", "true", "yes"].includes(String(process.env.SMTP_FORCE_IPV4 || "").trim().toLowerCase());
  const smtpRt = String(process.env.SMTP_REQUIRE_TLS || "").trim().toLowerCase();
  /** off | on | auto — auto enables requireTLS for typical STARTTLS on 587. */
  const SMTP_REQUIRE_TLS_MODE =
    smtpRt === "false" || smtpRt === "0" ? "off" : smtpRt === "true" || smtpRt === "1" ? "on" : "auto";
  const APP_BASE_URL = String(process.env.APP_BASE_URL || "http://localhost:5173").trim().replace(/\/+$/, "");

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
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM,
    SMTP_CONNECTION_TIMEOUT_MS,
    SMTP_SOCKET_TIMEOUT_MS,
    SMTP_FORCE_IPV4,
    SMTP_REQUIRE_TLS_MODE,
    APP_BASE_URL,
  };
}

/** Read per-request (tests can override process.env between calls). */
export function getTimetableSolverRuntime() {
  const raw = String(process.env.TIMETABLE_SOLVER || "legacy").trim().toLowerCase();
  const mode = raw === "experimental" ? "experimental" : "legacy";
  const timeoutMs = Math.min(300_000, toPositiveInt(process.env.TIMETABLE_SOLVER_TIMEOUT_MS, 30_000));
  return { mode, timeoutMs };
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
    const smtpConfigured = Boolean(env.SMTP_HOST || env.SMTP_USER || env.SMTP_PASS || env.SMTP_FROM);
    if (smtpConfigured) {
      if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) {
        throw new Error("SMTP is partially configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM together.");
      }
      if (!/^https?:\/\//i.test(env.APP_BASE_URL)) {
        throw new Error("APP_BASE_URL must be an absolute http/https URL when SMTP is configured.");
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

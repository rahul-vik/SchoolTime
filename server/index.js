import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { db, initDb } from "./db.js";
import { authMiddleware } from "./auth.js";
import { creatorAuthMiddleware } from "./middleware/creatorAuth.js";
import { requirePermission } from "./middleware/requirePermission.js";
import { apiKeyAuthMiddleware } from "./middleware/apiKeyAuth.js";
import { createAuthRoutes } from "./routes/authRoutes.js";
import { createSessionRoutes } from "./routes/sessionRoutes.js";
import { createUserRoutes } from "./routes/userRoutes.js";
import { createLicenseRoutes } from "./routes/licenseRoutes.js";
import { createStateRoutes } from "./routes/stateRoutes.js";
import { createTimetableRoutes } from "./routes/timetableRoutes.js";
import { createAuditRoutes } from "./routes/auditRoutes.js";
import { createUsageRoutes } from "./routes/usageRoutes.js";
import { createApiKeyRoutes } from "./routes/apiKeyRoutes.js";
import { createB2BRoutes } from "./routes/b2bRoutes.js";
import { createCreatorAuthRoutes } from "./routes/creatorAuthRoutes.js";
import { createCreatorRoutes } from "./routes/creatorRoutes.js";
import { createValidationRoutes } from "./routes/validationRoutes.js";
import { insertPlatformError } from "./services/platformErrorLog.js";
import { ensurePlatformSettingsDefaults } from "./services/platformSettings.js";
import { migrateAllPersistedTenantStates } from "./services/tenantStateMigrationRunner.js";
import { backfillTimetableRunStateJson } from "./services/timetableRunStateBackfill.js";
import { ENV } from "./config/env.js";
import { getAppReleaseMeta } from "./services/appReleaseMeta.js";
import { getTimetableSolverRuntime } from "./config/env.js";
import { isLegacyQualityMaxRecommended } from "./legacyQualityProfile.js";

await initDb();
await ensurePlatformSettingsDefaults(db);
{
  const m = await migrateAllPersistedTenantStates(db);
  if (m.updated > 0) {
    console.log(`[tenant_state] startup migration persisted for ${m.updated}/${m.scanned} org(s) (invalid JSON rows skipped: ${m.invalid})`);
  }
  const runBackfill = await backfillTimetableRunStateJson(db);
  if (runBackfill.updated > 0) {
    console.log(
      `[timetable_runs] backfilled state_json on ${runBackfill.updated}/${runBackfill.scanned} run(s) (skipped: ${runBackfill.skipped})`,
    );
  }
}

const app = express();
const { NODE_ENV, PORT, RATE_LIMIT_MAX, CORS_ORIGINS, hasWildcardCors } = ENV;
const startedAt = Date.now();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: false, // CSP should be applied at reverse proxy/static host layer.
}));

app.use(cors({
  origin(origin, callback) {
    // Allow server-to-server requests with no Origin header.
    if (!origin) return callback(null, true);
    if (hasWildcardCors) return callback(null, true);
    if (CORS_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  exposedHeaders: ["Content-Disposition"],
}));
app.use(express.json({ limit: "32mb" }));
app.use(rateLimit({ windowMs: 60 * 1000, max: RATE_LIMIT_MAX, standardHeaders: true, legacyHeaders: false }));

app.get("/api/health", (_req, res) => {
  const release = getAppReleaseMeta();
  const solverRuntime = getTimetableSolverRuntime();
  const cpSatConfigured = Boolean(solverRuntime.cpSatUrl);
  const envDefault = solverRuntime.mode;
  const recommendedUiDefault =
    cpSatConfigured || envDefault === "hybrid" || envDefault === "cp_sat" ? "hybrid" : "legacy";
  res.json({
    ok: true,
    env: NODE_ENV,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    now: new Date().toISOString(),
    release: {
      version: release.version,
      buildNumber: release.buildNumber,
      buildSha: release.buildSha,
      releaseLabel: release.releaseLabel,
    },
    timetableSolver: {
      envDefault,
      cpSatConfigured,
      recommendedUiDefault,
      legacyQualityMaxRecommended: isLegacyQualityMaxRecommended(),
    },
  });
});

app.use("/api/auth", createAuthRoutes(db));
// Public creator login must mount on the same `/api/creator` prefix *before* the protected stack;
// otherwise `POST /api/creator/auth/login` can match `/api/creator` first and hit auth middleware (401 Missing auth token).
app.use("/api/creator", createCreatorAuthRoutes());
app.use("/api/creator", creatorAuthMiddleware, createCreatorRoutes(db));
// Never fall through to tenant `/api` stack for unrecognized `/api/creator/*` (would treat creator JWT as tenant token → 403).
app.use("/api/creator", (_req, res) => {
  res.status(404).json({ error: "Unknown platform portal path" });
});
app.use("/api/auth", authMiddleware, createSessionRoutes(db));
app.use("/api", authMiddleware, createUserRoutes(db));
app.use("/api", authMiddleware, createStateRoutes(db));
app.use("/api", authMiddleware, requirePermission(db, "canConfigureTimetable"), createTimetableRoutes(db));
app.use("/api", authMiddleware, createUsageRoutes(db));
app.use("/api", authMiddleware, requirePermission(db, "canManageCredits"), createLicenseRoutes(db));
app.use("/api", authMiddleware, requirePermission(db, "canManageApiKeys"), createApiKeyRoutes(db));
app.use("/api", authMiddleware, requirePermission(db, "canViewAudit"), createAuditRoutes(db));
app.use("/api", authMiddleware, createValidationRoutes(db));
// Unmatched tenant /api paths must not fall through to B2B API-key auth (returns misleading 401 "Missing API key").
app.use("/api", authMiddleware, (req, res, next) => {
  if (String(req.path || "").startsWith("/b2b")) return next();
  res.status(404).json({ error: "Unknown API path" });
});
app.use("/api", apiKeyAuthMiddleware(db), createB2BRoutes(db));

/** Client closed the socket while Express was reading the JSON body (debounced save, tab close, flaky network). Not an application bug. */
function isClientAbortBodyError(err) {
  const t = String(err?.type || "");
  if (t === "request.aborted") return true;
  const m = String(err?.message || "");
  if (/request aborted/i.test(m)) return true;
  return false;
}

app.use(async (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (isClientAbortBodyError(err)) {
    try {
      if (!req.aborted) res.status(400).json({ error: "Request aborted", detail: "The client closed the connection before the body finished uploading." });
    } catch {
      // ignore — client may already be gone
    }
    return;
  }
  try {
    await insertPlatformError(db, {
      message: err?.message || "Unhandled error",
      stack: err?.stack || null,
      route: String(req.originalUrl || req.url || "").slice(0, 500),
      method: req.method,
      orgId: req.auth?.orgId ?? null,
      userId: req.auth?.userId ?? null,
    });
  } catch (logErr) {
    console.error("[platform_error_log]", logErr);
  }
  const status = typeof err?.status === "number" && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(status).json({ error: err?.message || "Server error" });
});

const HOST = String(process.env.HOST || "0.0.0.0").trim() || "0.0.0.0";
app.listen(PORT, HOST, () => {
  console.log(`[config] env=${NODE_ENV} host=${HOST} port=${PORT} corsOrigins=${hasWildcardCors ? "wildcard" : CORS_ORIGINS.length}`);
  console.log(`API server running on http://${HOST}:${PORT}`);
});

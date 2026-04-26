import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { db, initDb } from "./db.js";
import { authMiddleware } from "./auth.js";
import { requireRole } from "./middleware/requireRole.js";
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
import { ENV } from "./config/env.js";

await initDb();

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
}));
app.use(express.json({ limit: "2mb" }));
app.use(rateLimit({ windowMs: 60 * 1000, max: RATE_LIMIT_MAX, standardHeaders: true, legacyHeaders: false }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    env: NODE_ENV,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    now: new Date().toISOString(),
  });
});

app.use("/api/auth", createAuthRoutes(db));
app.use("/api/auth", authMiddleware, createSessionRoutes(db));
app.use("/api", authMiddleware, createUserRoutes(db));
app.use("/api", authMiddleware, createStateRoutes(db));
app.use("/api", authMiddleware, createTimetableRoutes(db));
app.use("/api", authMiddleware, createUsageRoutes(db));
app.use("/api", authMiddleware, requireRole("owner", "admin"), createLicenseRoutes(db));
app.use("/api", authMiddleware, requireRole("owner", "admin"), createApiKeyRoutes(db));
app.use("/api", authMiddleware, requireRole("owner", "admin"), createAuditRoutes(db));
app.use("/api", apiKeyAuthMiddleware(db), createB2BRoutes(db));

app.listen(PORT, () => {
  console.log(`[config] env=${NODE_ENV} port=${PORT} corsOrigins=${hasWildcardCors ? "wildcard" : CORS_ORIGINS.length}`);
  console.log(`API server running on http://localhost:${PORT}`);
});

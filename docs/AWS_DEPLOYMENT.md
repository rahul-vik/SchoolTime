# AWS + GitHub deployment (production)

SchoolTime production uses **GitHub only** for code and the web app, and **AWS** for the API, database, and optional CP-SAT solver. **Render is not used.** This guide assumes a **new** RDS database (empty schema, then register schools in the app)—no legacy host migration.

| Component | Platform | Notes |
|-----------|----------|--------|
| **Repository** | GitHub | `main` = production, `develop` = staging |
| **Frontend (SPA)** | **GitHub Pages** | Built on push to `main`; see `.github/workflows/deploy-pages.yml` |
| **API (Node)** | **EC2 + Docker** (Free Tier) or App Runner / ECS | Root `Dockerfile`; `HOST=0.0.0.0` |
| **HTTPS** | **Caddy** on EC2 | Custom domain or **DuckDNS** → `127.0.0.1:8787` |
| **Database** | **Amazon RDS PostgreSQL** | `DB_CLIENT=postgres` + `DATABASE_URL` |
| **CP-SAT (optional)** | **Lambda** or second container | See `docs/AWS_LAMBDA_CPSAT.md`, `docs/AWS_CP_SAT.md` |

**Recommended first deploy:** **`docs/AWS_FREE_TIER_SETUP.md`** (EC2 `t3.micro` + RDS + Caddy/DuckDNS).

**Lowest cost (no free tier):** **Lightsail** — `docs/AWS_COST_OPTIMIZED.md`. Skip App Runner, ALB, NAT Gateway, and 24/7 CP-SAT when minimizing cost.

---

## Architecture

```text
Browser
  → https://<user>.github.io/<RepoName>/     (GitHub Pages, static dist/)
  → https://<api-host>/api/*                 (Caddy on EC2 → Docker API :8787)
       → RDS PostgreSQL (VPC; EC2↔RDS security group)
       → optional CP-SAT Lambda URL or sidecar (HTTP + secret)
```

The API does **not** serve the React app in production; GitHub Pages hosts `dist/`. The API only serves `/api/*`.

---

## Prerequisites

- AWS account (billing enabled)
- GitHub repo admin (Pages + Actions variables)
- Domain optional (GitHub Pages default URL is fine to start)
- Node 20+ locally for `npm run prod:preflight` before first deploy

---

## Phase 1 — RDS PostgreSQL

### 1.1 Create the database

1. **RDS** → **Create database** → **PostgreSQL** (15+ recommended).
2. **Templates:** Production (or Dev/Test for staging).
3. **DB identifier:** `schooltime-prod` (or `schooltime-staging`).
4. **Master username / password:** store in a password manager.
5. **DB name:** `schooltime`.
6. **Connectivity:**
   - Use a **VPC** you will attach App Runner / ECS to later.
   - For App Runner with **VPC connector**, RDS can stay **not publicly accessible** (preferred).
7. **Encryption** and **automated backups:** enable (7+ days for prod).
8. Create DB; note **endpoint**, **port**, **database name**.

### 1.2 Security group

1. Create or use RDS security group `schooltime-rds-sg`.
2. **Inbound:** PostgreSQL **5432** from the security group used by your API service (App Runner VPC connector SG or ECS task SG)—**not** `0.0.0.0/0` in production.

### 1.3 Connection string

```text
postgresql://schooltime:PASSWORD@endpoint.region.rds.amazonaws.com:5432/postgres
```

Use as `DATABASE_URL` on the API. **Docker / EC2:** omit `?sslmode=require` (Node `pg` v8+ + `server/db.js` configure TLS for RDS). Confirm **DB name** in RDS console (`postgres` on Easy Create vs `schooltime`). App Runner/ECS may use the same URL pattern.

### 1.4 Bootstrap schema (first time)

From your laptop (with network path to RDS, or a one-off bastion):

```bash
# .env — do not commit
DB_CLIENT=postgres
DATABASE_URL=postgresql://...

# Start API once; it runs postgres-schema.sql + postgresMigrations.js
node server/index.js
# Stop after logs show [db] using postgres
```

Or run `server/db/postgres-schema.sql` with `psql`, then start the API once.

---

## Phase 2 — Database content (fresh start)

**Default for AWS:** leave RDS **empty** after Phase 1.4 (schema only). Schools **register** through the app; setup data is stored in `tenant_state` as they configure the school.

**Optional — copy one org from local SQLite** (dev machine only, not a cloud cutover):

```bash
# .env: DATABASE_URL = RDS, DB_CLIENT=postgres for the target
npm run migrate:postgres          # copies all SQLite rows once
# or a single school:
npm run import:prod-org:local -- --school "Your School"
```

See `docs/POSTGRES_MIGRATION.md` and `docs/IMPORT_PRODUCTION_ORG_TO_LOCAL.md` (import script naming is historical; source can be any Postgres URL you control).

---

## Phase 3 — API on AWS App Runner (recommended)

App Runner runs the repo **`Dockerfile`** with minimal ops.

### 3.1 ECR (image registry)

1. **ECR** → **Create repository** → `schooltime-api`.
2. Authenticate Docker to ECR (CLI `aws ecr get-login-password` …).
3. Build and push:

```bash
docker build -t schooltime-api .
docker tag schooltime-api:latest <account>.dkr.ecr.<region>.amazonaws.com/schooltime-api:latest
docker push <account>.dkr.ecr.<region>.amazonaws.com/schooltime-api:latest
```

Repeat on each release (or wire CI later).

### 3.2 VPC connector (API → private RDS)

1. **VPC** → note subnets in the same region as RDS.
2. **App Runner** → **VPC connectors** → create connector into subnets that can reach RDS.
3. Attach connector to the App Runner service.

### 3.3 Create App Runner service

1. **App Runner** → **Create service** → **Container registry** → ECR `schooltime-api:latest`.
2. **Port:** `8787` (must match `PORT` env).
3. **Health check:** HTTP ` /api/health`.
4. **Environment variables** — use `infra/aws/env.production.template` as checklist (minimum):

| Variable | Example / notes |
|----------|-----------------|
| `NODE_ENV` | `production` |
| `PORT` | `8787` |
| `HOST` | `0.0.0.0` |
| `DB_CLIENT` | `postgres` |
| `DATABASE_URL` | RDS URL with `sslmode=require` |
| `JWT_SECRET` | long random string |
| `CORS_ORIGIN` | `https://<user>.github.io` (no trailing slash) |
| `APP_BASE_URL` | same as Pages URL (password-reset links) |
| `CREATOR_PORTAL_PASSWORD_HASH` | bcrypt hash (see `.env.example`) |
| SMTP_* | your mail provider |
| `GITHUB_SHA` | optional; set in CI for build metadata in `/api/health` |

5. Deploy; copy the **App Runner URL** (e.g. `https://xxxxx.region.awsapprunner.com`).

### 3.4 Smoke test API

```bash
curl https://xxxxx.region.awsapprunner.com/api/health
```

Expect JSON with `ok: true` and release metadata.

---

## Phase 4 — GitHub Pages (frontend)

### 4.1 GitHub repository settings

1. **Settings** → **Pages** → Source: **GitHub Actions**.
2. **Settings** → **Secrets and variables** → **Actions** → **Variables**:
   - `VITE_API_BASE_URL` = `https://<app-runner-host>/api`  
     (must include `/api`; no trailing slash after `api` is fine if your client normalizes—match existing Pages build.)

### 4.2 Deploy workflow

Push to **`main`** runs `.github/workflows/deploy-pages.yml`:

- Builds with `VITE_API_BASE_URL` from the variable above.
- Publishes `dist/` to GitHub Pages.
- SPA fallback: `404.html` copy of `index.html`.

### 4.3 CORS

On the API, `CORS_ORIGIN` must match the Pages origin exactly, e.g.:

```text
https://rahul-vik.github.io
```

If you use a custom domain for Pages, use that origin. Multiple origins: comma-separated (see `server/config/env.js`).

### 4.4 End-to-end test

1. Open Pages URL → register/login.
2. Load setup, generate timetable, export PDF.
3. Check browser network tab: API calls go to your App Runner URL under `/api`.

---

## Phase 5 — Optional CP-SAT on AWS

Only needed for **Hybrid** / **CP-SAT** solver modes.

1. **ECR** repository `schooltime-cpsat`.
2. Build from repo root:

```bash
docker build -f solver/cpsat/Dockerfile -t schooltime-cpsat .
docker push <account>.dkr.ecr.<region>.amazonaws.com/schooltime-cpsat:latest
```

3. **App Runner** (second service) or ECS task:
   - Port from image (sidecar reads `PORT`; default in Dockerfile).
   - Env: `HOST=0.0.0.0`, `CP_SAT_SOLVER_SECRET=<shared secret>`.
   - Health: `/health`.

4. On **API** service set:

```env
CP_SAT_SOLVER_URL=https://<cpsat-host>/solve
CP_SAT_SOLVER_SECRET=<same secret>
TIMETABLE_SOLVER_TIMEOUT_MS=90000
```

Details: `docs/AWS_CP_SAT.md`.

Without CP-SAT, leave `CP_SAT_SOLVER_URL` empty; legacy greedy engine runs.

---

## Phase 6 — Ongoing operations

| Task | Command / action |
|------|------------------|
| Pre-deploy checks | `npm run prod:preflight` |
| API image rebuild | `docker build` + push ECR + App Runner deploy |
| Frontend release | merge to `main` → Pages workflow |
| DB backup | RDS automated snapshots + manual `pg_dump` |
| Tenant JSON migrations | automatic on API startup; optional `npm run migrate:all:check` |
| Logs | App Runner logs → CloudWatch |
| Secrets rotation | rotate `JWT_SECRET` / DB password via AWS Secrets Manager |

---

## Alternative: ECS Fargate + ALB

Use when you need more control than App Runner:

1. **ECS cluster** + **Fargate** task definition (see `infra/aws/ecs-task-definition.example.json`).
2. **ALB** HTTPS listener → target group port 8787.
3. Task env same as App Runner table.
4. RDS in private subnets; task SG → RDS SG on 5432.
5. Point `VITE_API_BASE_URL` at ALB hostname.

Root `Dockerfile` and `HOST=0.0.0.0` apply unchanged.

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Pages load, API 401/CORS | `CORS_ORIGIN` matches Pages URL exactly |
| API 503 creator portal | `CREATOR_PORTAL_PASSWORD_HASH` set |
| DB `3D000` (database does not exist) | Use RDS **DB name** in URL (`/postgres` vs `/schooltime`) |
| DB `SELF_SIGNED_CERT_IN_CHAIN` | Remove `?sslmode=` from `DATABASE_URL` on EC2 Docker; set `NODE_ENV=production` |
| DB connection timeout | EC2↔RDS security group on 5432 / VPC connector for App Runner |
| Health OK, login fails | `JWT_SECRET` stable across deploys; DB has users |
| Generate always legacy | `CP_SAT_SOLVER_URL` empty or sidecar down |
| SMTP timeout on AWS | outbound 587/465 allowed; see `docs/DEPLOYMENT.md` SMTP section |

---

## Related docs

- `docs/AWS_COST_OPTIMIZED.md` — minimal monthly cost (Lightsail, what to avoid)
- `docs/DEPLOYMENT.md` — runtime, SMTP, SQLite upgrades (dev)
- `docs/POSTGRES_MIGRATION.md` — SQLite → Postgres
- `docs/PRODUCTION_READINESS.md` — release checklist
- `infra/aws/env.production.template` — env var list for AWS console
- `render.yaml` — deprecated stub (Render removed)
- `docs/RENDER_CP_SAT.md` — deprecated (points to AWS CP-SAT docs)

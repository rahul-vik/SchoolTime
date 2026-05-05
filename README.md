# SchoolTime - Smart Timetable Builder

SchoolTime is a full-stack timetable management app for schools. It helps admins configure standards, divisions, subjects, teachers, slots, and rules; generate conflict-aware timetables; review reports; and export polished PDF/Excel files.

## License And Ownership

This project is licensed under the MIT License.

Copyright (c) 2026 Rahul V

See `LICENSE` for full text.

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: SQLite (`better-sqlite3`) and Postgres (`pg`)
- Exports: PDFKit (PDF), ExcelJS (XLSX)
- Validation/Auth: Zod, JWT, refresh tokens

## Project Structure

- `src/` - React client app and feature modules
- `server/` - API server, timetable engine, DB bootstrap, routes, services
- `shared/` - tiny dependency-free modules shared by server + client (e.g. report hour labels)
- `logo/` - branding assets
- `Results/` - local output samples generated during development
- `docs/` - architecture and operational documentation

## Features

- Authentication (register/login/refresh/logout/password reset)
- Role-based access (`owner`, `admin`, etc.)
- School setup: mediums, standards, divisions
- Academic setup: subjects, teachers, teacher-division mapping, class-teacher assignment (single class teacher class)
- Subject applicability controls: class-level scope with optional division include/exclude overrides
- Scheduling setup: period slots, working days, subject preferences, class-teacher first-period weekday selection
- Scheduling diagnostics with top rejection reasons and actionable tuning suggestions
- Teacher session-aware free-period enforcement (separate morning/evening capacity checks in strict mode)
- New registrations start with demo-ready tenant data covering all subject categories and key scheduling options
- Timetable generation engine with completion score, unscheduled insights, and **flagged divisions with no class teacher** (shown after generate, on Dashboard and Timetable)
- Left sidebar release footer (`V<version> (<build-number>)`), with `LOCAL · DEV` tags shown only in local development mode
- Dashboard insights for below-100% completion
- Timetable reports:
  - Subject hours
  - Teacher workload
  - Division completion
- Automated post-generation validation findings with controlled low-risk auto-fix and approval workflow for higher-risk findings
- Export bundle:
  - Visual PDF timetable pages
  - Visual Excel timetable sheets
- Usage, licensing credits (schools **request** extra credits from the app; a platform operator **approves** them in `/creator`), API key management, audit logs
- Optional platform operator portal (`/creator`) for cross-tenant credits, purchase approvals, enrollment, settings, and error logs when server env is configured

## Prerequisites

- Node.js 18+ (recommended 20+)
- npm 9+

**Cursor / VS Code:** use **Terminal → Run Build Task** for a root `npm install`, or **Terminal → Run Task…** → **SchoolTime: Run dev stack (API + Web)** to start API + Vite in parallel (see `.vscode/tasks.json`).

## Quick Start (Local)

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create env file:

   - Copy `.env.example` to `.env`
   - Update secrets and host values as needed

3. Start frontend + backend together (default dev mode):

   ```bash
   npm start
   ```

   Alternative:

   ```bash
   npm run dev:all
   ```

4. Open:

- Frontend: `http://localhost:5173`
- API health: `http://localhost:8787/api/health`

### Platform portal (operator / creator)

Separate from the school tenant app: cross-tenant visibility, credit controls, and server diagnostics.

- **Open:** `http://localhost:5173/creator` (same Vite app; portal session uses `localStorage` key `st_creator_token`, the school app uses `tt_token` — do not copy one into the other). If the school app shows *“This token is for the platform portal only”*, the school session slot held a portal JWT; sign in again with your school email and password (the client clears that mismatch when it detects it).
- **Configure server:** set `CREATOR_PORTAL_PASSWORD` (local dev) or `CREATOR_PORTAL_PASSWORD_HASH` (bcrypt hash; recommended for production) in `.env`. Optional `CREATOR_JWT_EXPIRES_IN` (default `8h`).
- **What you can do:** list organizations and users, **approve or reject pending school credit purchase requests** (from the Organizations tab), browse credit ledger and audit logs across all tenants, **add org credits in multiples of 10** manually when needed (Organizations / Credit ledger), **remove an organization** (destructive; a **purge record** is retained), register a new organization, edit platform defaults (`signup_initial_credits`, `credit_pack_size`, `credit_pack_price_cents`), configure a dedicated **Role access** matrix (including custom roles), and review **platform error logs**.

See `docs/API.md` for route names. After pulling changes that add platform routes (for example org purge history), **restart the Node API process** so it loads the new handlers; an old process can otherwise mis-route `/api/creator/*` requests.

## Environment Variables

Based on `.env.example`:

- `PORT` - API port (default `8787`)
- `NODE_ENV` - `development` / `production`
- `JWT_SECRET` - required strong secret
- `JWT_EXPIRES_IN` - e.g. `15m`
- `REFRESH_TOKEN_DAYS` - refresh token validity
- `RATE_LIMIT_MAX` - requests/minute/IP
- `CORS_ORIGIN` - allowed frontend origin(s)
- `DB_CLIENT` - current runtime DB engine (`sqlite` default)
- `DATABASE_URL` - required for Postgres migration / Postgres runtime
- `VITE_API_BASE_URL` - frontend API base URL
- `CREATOR_PORTAL_PASSWORD` - optional; enables `/creator` portal login (use a long random value; for production prefer `CREATOR_PORTAL_PASSWORD_HASH`)
- `CREATOR_PORTAL_PASSWORD_HASH` - optional bcrypt hash for portal login (overrides plain password when set)
- `CREATOR_JWT_EXPIRES_IN` - portal session JWT lifetime (default `8h`)
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` - SMTP server config for password reset emails
- `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` - SMTP credentials and sender address
- `APP_BASE_URL` - app URL used to build password-reset links (e.g. `http://localhost:5173` in dev)

## Available Scripts

- `npm start` - default run mode (development, same as `dev:all`)
- `npm run dev` - Vite frontend only
- `npm run dev:server` - API server only
- `npm run dev:all` - run both frontend and backend
- `npm run start:dev` - switch to `develop` then run dev servers
- `npm run start:prod` - switch to `main`, build, then run preview + API server
- `npm run branch:dev` - switch git branch to `develop`
- `npm run branch:prod` - switch git branch to `main`
- `npm run build` - production frontend build
- `npm run preview` - preview built frontend
- `npm run smoke:prod` - smoke test engine + PDF/Excel export pipeline
- `npm run audit:security` - security audit for prod dependencies (high+)
- `npm run migrate:postgres` - migrate SQLite data into Postgres schema
- `npm run test:postgres:integration` - integration check for Postgres adapter + schema guard
- `npm run docs:auto` - auto-generate changelog + rules intelligence docs
- `npm run release:prepare` - pre-merge `origin/main` and `origin/develop` + regenerate auto docs on release/hotfix branches
- `npm run release:sync-develop` - merge `origin/main` into **`develop`** + `docs:auto` so **`develop` → `main`** PRs do not conflict on `docs/AUTO_*.md` (run before that PR)
- `npm run health:daily` - run build + smoke + security audit health suite
- `npm run check:release-governance` - enforce version + changelog rules for release/hotfix PRs
- `npm run check:versioning` - strict local SemVer + branch/version contract validation
- `npm run test:backend:validation` - rule-level backend unit tests for timetable validation + auto-fix safety
- `npm run verify:push` - runs the same checks as CI (build, smoke, security audit, versioning; on `release/*` and `hotfix/*` branches also simulates release governance vs `origin/main`). Invoked automatically before each `git push` via Husky after `npm install`

### Pre-push verification (Husky)

- On every `git push`, `npm run verify:push` runs so local failures match CI before the remote sees your commits.
- Skip once: `git push --no-verify`, or set environment variable `SKIP_VERIFY_PUSH=1` for that push.
- Disable hooks for a session: `HUSKY=0 git push` (Husky convention).
- Release/hotfix governance still requires a **SemVer bump above `origin/main`** and `CHANGELOG.md` updates on those branches; hooks cannot infer the next version for you—use `npm run release:prepare` on release/hotfix branches when merging latest main/develop.
- Auto-generated `docs/AUTO_*.md` files are updated on push to `develop`/`main` by GitHub Actions (`.github/workflows/auto-docs-rules.yml`), not on every local push, to avoid noisy timestamp-only diffs.
- **Merge conflicts on `docs/AUTO_CHANGELOG.md` or `docs/AUTO_RULES_INTELLIGENCE.md`:** both sides regenerated these files—do not resolve by hand. Run **`npm run docs:auto`**, **`git add`** both paths, then **`git commit`** (merge completion). Pre-push **`verify:push`** intentionally skips `docs:auto` so it does not leave uncommitted changes after a push hook.
- **Before merging `develop` → `main`:** prefer **`npm run release:sync-develop`** on `develop` first (see **`docs/VERSIONING.md`**).

## One-Click Dev Launcher (Windows)

- Run `open-dev.bat` from the project root.
- It will:
  - switch to `develop`
  - check local vs remote `develop` and ask before applying remote updates
  - try to open the folder in Cursor (if Cursor CLI is installed)
  - run `npm start` (development servers)

## One-Click Prod Launcher (Windows)

- Run `open-prod.bat` from the project root.
- It will:
  - switch to `main`
  - check local vs remote `main` and ask before applying remote updates
  - try to open the folder in Cursor (if Cursor CLI is installed)
  - run `npm run start:prod`

## Data And Persistence

- Default local DB file (SQLite): `server/data/app.db`
- Production-ready DB option: Postgres via `DB_CLIENT=postgres` + `DATABASE_URL`
- Tenant configuration state saved in `tenant_state`
- `tenant_state` persists `classTeacherPreferences`, `subjects` (including class/division applicability scope), `exportJobs` (latest 3), and `lastGeneratedTimetable` for post-login continuity
- Timetable run snapshots also persist `state_json` in `timetable_runs` so exports can reproduce the generated run accurately

## Exports

- PDF and Excel exports are downloaded through `/api/timetable/download` (filenames like `SchoolTime-class-timetables-YYYY-MM-DD.pdf`, `SchoolTime-teacher-timetables-YYYY-MM-DD.xlsx`, `SchoolTime-summary-reports-YYYY-MM-DD.xlsx`)
- Visual style includes:
  - Full slot grid (lesson + break + lunch)
  - Category legend
  - Subject accent cards
  - Free-period style
- **Print banner:** School **name**, **academic year**, and **logo** from setup appear top-left on timetable PDF/Excel pages, with a divider before the grid.
- **Class teacher:** In-app and visual exports (class and teacher timetables), when the slot teacher is that division’s class teacher, **CT** appears on the **right** side of the subject row with the subject code on the left (same layout in PDF and Excel). **CT** uses **black** text so it stays readable on tinted lesson cells.
- **Teacher timetable:** Below **`Std …-Div`** (in-app, PDF, Excel), the division’s **medium code** prints on its own line in **black** when the medium record has a **code** (see Setup → Mediums).
- **Summary reports** (`REPORTS_BUNDLE`): Excel has **Subject Hours**, **Teacher Workload**, and **Division Completion** sheets; PDF is portrait A4 with the same three sections and matching table styling. School banner on each sheet. **Weekly Subject Hours** uses short category labels (e.g. **Lang**) and **subject codes** for language subjects so rows stay compact; **Division Completion** prints **CT** inline after the subject name (black).
- If export download returns HTML/JSON, check `VITE_API_BASE_URL` and backend availability

## Deployment Notes

- Set `NODE_ENV=production`
- Use a secure `JWT_SECRET`
- Restrict CORS to trusted domains
- Persist `server/data/` if running in containers
- Recommended reverse proxy: Nginx/Caddy with TLS

## Documentation Index

- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `docs/DEPLOYMENT.md`
- `docs/BRANCH_POLICY.md`
- `docs/VERSIONING.md`
- `docs/PRODUCTION_READINESS.md`
- `docs/PROJECT_STANDARDS.md` (master handbook)
- `docs/POSTGRES_MIGRATION.md`
- `docs/AUTO_CHANGELOG.md` (generated)
- `docs/AUTO_RULES_INTELLIGENCE.md` (generated)
- `docs/AUTONOMOUS_AUTOFIX_POLICY.md`
- `docs/IMPLEMENTATION_BACKLOG.md`
- `CHANGELOG.md`

## Governance Templates

- PR template: `.github/pull_request_template.md`
- Release PR template: `.github/PULL_REQUEST_TEMPLATE/release.md`
- Hotfix PR template: `.github/PULL_REQUEST_TEMPLATE/hotfix.md`
- Issue templates:
  - `.github/ISSUE_TEMPLATE/bug_report.md`
  - `.github/ISSUE_TEMPLATE/feature_request.md`

## Troubleshooting

- Login/session issues:
  - Clear `tt_token` and `tt_refresh_token` from browser storage and login again
- Export file invalid:
  - Verify API URL and that API server is running on configured port
- Low completion score:
  - Use dashboard tips and Timetable reports to identify missing subject periods
  - Review teacher eligibility, rules, and available slots/days

## Production Hardening Quick Notes

- Backend sets secure headers using Helmet.
- Use PM2 (`ecosystem.config.cjs`) or systemd for process supervision.
- Use `.github/workflows/ci.yml` checks before merging to `main`.
- CI verifies build + smoke + security audit (`npm run build`, `npm run smoke:prod`, `npm run audit:security`) and release governance on PRs. The same suite runs locally before each push via `npm run verify:push` (see **Pre-push verification** above). CI also runs on pushes to `release/**` and `hotfix/**` branches.
- Daily automated checks: `.github/workflows/daily-health-autofix.yml` (scheduled health scan + safe dependency autofix PR + issue on failure).
- Manual release automation: `.github/workflows/release.yml` (version bump + changelog + tag + GitHub release).
- Run periodic DB backups with `scripts/backup-db.ps1`.
- Linux/macOS backup helpers:
  - `scripts/backup-db.sh`
  - `scripts/restore-db.sh`


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
- `shared/` - tiny dependency-free modules shared by server + client (report hour labels, period-slot weekday helpers, etc.)
- `logo/` - branding assets
- `Results/` - local output samples generated during development
- `docs/` - architecture and operational documentation

## Features

- Authentication (register/login/refresh/logout/password reset)
- Session resume activity is captured on token refresh so "Last activity" reflects reopen/resume usage too
- Role-based access (`owner`, `admin`, etc.)
- School **Settings → Users**: add team members with a temporary password; **owners** can set a **new password** for any teammate (non-owners cannot change the **owner** account password); platform portal (`/creator`) can set passwords across tenants
- School setup: mediums, standards, divisions (**standards** and **divisions** are kept in ascending standard order system-wide; **working days** are always Mon→Sun order in grids, engine, exports, and saved tenant state)
- Academic setup: subjects, teachers, teacher-division mapping, class-teacher assignment (single class teacher class)
- Subject applicability controls: class-level scope with optional division include/exclude overrides; per-division max/day and weekly limits in the subject wizard include a **copy-down** control to apply the current row to all divisions listed below
- Scheduling setup: period slots (each slot can run on a subset of school days; new slots default to all working days), working days, subject placement preferences (**multi-select subjects and divisions** in one editor; exclude slots/days; **optional fixed lesson period on chosen weekdays** for the selected divisions; the preference editor keeps excludes and fixed placement consistent; fixed-period choices only list slots active on every selected day), class-teacher first-period weekday selection
- Scheduling diagnostics with top rejection reasons and actionable tuning suggestions (rejection stats include **`NON_LESSON_SLOT`** when a placement would target a break/lunch row)
- Teacher session-aware free-period enforcement (separate morning/evening capacity checks in strict mode)
- Division-subject teacher consistency lock: optional persisted **`divisionSubjectTeacherLocks`** pre-seed the engine; otherwise once a teacher is chosen for a subject in a division during generation, subsequent placements for that same division-subject stay with the same teacher (single-teacher behavior when multiple `teacherSubjects` rows exist without team-teaching)
- Pre-generate **feasibility** report (`report.feasibility`): required weekly vs legally placeable cells per class–subject; blocks generate on ERROR-level infeasibility
- New registrations start with **clean demo tenant data**: standards **1–10** with one section **A** each (English medium), core subjects plus **Computer Lab** and **PE**, one class teacher per division plus shared subject teachers, a Mon–Fri period grid, and sample scheduling rules (**PE** avoids first morning / last lesson; **Computer Lab** not on Monday)
- After generate (division view): **Edit** timetable — **swap** two cells, **move** a lesson to a free period, or **add** a lesson to a free cell (subject + teacher). Placement uses the same engine-parity checks as generation (`shared/timetablePlacementValidator.js`). When a cell cannot accept a lesson, the UI may suggest **repair steps** (bounded move/swap sequences from `POST /timetable/valid-add-options`). **Undo last** (or **Ctrl+Z** / **⌘Z** when not typing) reverses the most recent swap from edit history. Reports, completion score, and unscheduled lists **recompute from live `entries`** after each edit (no full regenerate required); see `shared/recomputeTimetableReport.js` and `docs/API.md`.
- **Timetable view alignment:** the Timetable grid uses **`sourceState.periodSlots`** and **`sourceState.workingDays`** from the generation run when present so columns match **`entries`** slot numbers (avoids lessons appearing under Break/Lunch headers after Periods are edited). Unscheduled badges and Dashboard completion hints resolve class names from the same run snapshot with stable id matching (`src/features/shared/idLookups.js`).
- Timetable generation engine with completion score, unscheduled insights, and **flagged divisions with no class teacher** (shown after generate, on Dashboard and Timetable). Placement is **greedy constraint-satisfying** (not a proven global optimum). The built-in (**legacy**) engine uses **phased placement** (constrained → lab/practical → core → language → non-core → remaining, higher standard first), **multi-restart** search, **hardest-subject-first** ordering within each phase, **backtracking**, **lock repair**, post-placement optimizers, then **local search** (gap-fill / relocate / swap) under a lexicographic objective—see `shared/enginePlacementPhases.js`, `server/legacyEngineImprovements.js`, `server/legacyEngineLocalSearch.js`, and `docs/ARCHITECTURE.md`. On **Create**, a **pill selector** sends optional **`timetableSolver`** with each generate request (`hybrid` or `cp_sat`; hybrid is recommended) so you are not limited to server env alone; `report.solver.timetableSolverSource` records `request` vs `env`. Server env **`TIMETABLE_SOLVER`** still sets the default when using API without that field; **`experimental`** runs the same scheduling core inside a worker with timeout and **automatic fallback** to legacy on failure; **`cp_sat`** / **`hybrid`** add an OR-Tools sidecar path when `CP_SAT_SOLVER_URL` is set (see `docs/ARCHITECTURE.md`).
- Left sidebar release footer (`V<version> (<build-number>)`), with `LOCAL · DEV` tags shown only in local development mode
- Dashboard insights for below-100% completion
- Timetable reports:
  - Subject hours
  - Teacher workload
  - Division completion
- Automated post-generation validation findings with controlled low-risk auto-fix and approval workflow for higher-risk findings (includes **`LESSON_ON_INACTIVE_PERIOD_SLOT`**, **`INCLUDE_ONLY_VIOLATION`**, teacher daily/morning/evening caps, **`SUBJECT_PERIODS_SHORT`**, **`CLASS_FREE_WITH_TEACHER_HEADROOM`**)
- Export bundle:
  - Visual PDF timetable pages
  - Visual Excel timetable sheets
- Usage, licensing credits (schools **request** extra credits from the app; a platform operator **approves** them in `/creator`), API key management, audit logs
- Optional platform operator portal (`/creator`) for cross-tenant credits, purchase approvals, enrollment, settings, and error logs when server env is configured
- Platform portal user list includes activity-accurate **Last activity** (derived from user audit actions, not creation time)

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
- **What you can do:** list organizations and users, **approve or reject pending school credit purchase requests** (from the Organizations tab), browse credit ledger and audit logs across all tenants, **add org credits in multiples of 10** manually when needed (Organizations / Credit ledger), **remove an organization** (destructive; a **purge record** is retained), register a new organization, edit platform defaults (`signup_initial_credits`, `credit_pack_size`, `credit_pack_price_cents`), configure a dedicated **Role access** matrix (including custom roles), and review **platform error logs**. On the **Users** tab, passwords stay hidden by default; use the **eye** to show a value only when the portal already knows it (for example right after **Register org** or **Set new password** via the key icon). Passwords are stored as hashes in the database, so older passwords cannot be read back without resetting them.

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
- `TIMETABLE_SOLVER` - `legacy`, `experimental` (worker + timeout; delegates to greedy for isolation tests), `cp_sat` (CP-SAT sidecar when `CP_SAT_SOLVER_URL` is set; otherwise falls back to legacy with `report.solver.fallbackReason`), or **`hybrid`** (try CP-SAT first, then legacy — recommended when the sidecar is running)
- `LEGACY_ENGINE_RESTARTS` - optional override for greedy multi-restart count when legacy runs (default depends on `classTeacherPreferences.schedulingMode`: 4 STRICT, 5 BEST_FIT, 3 OPTIMAL)
- `LEGACY_ENGINE_BACKTRACK_DEPTH` - optional; unpinned lessons undone per backtrack step when a subject cannot finish (default `4`)
- `LEGACY_ENGINE_LOCAL_SEARCH_ITERATIONS` - optional; post-greedy local search passes (gap-fill, relocate, swap) using lexicographic objective (default `24`, `0` disables)
- `LEGACY_ENGINE_LOCAL_SEARCH_CANDIDATES` - optional cap on move candidates per iteration (default `48`)
- `TIMETABLE_SOLVER_TIMEOUT_MS` - wall-clock cap for the experimental / `cp_sat` worker before legacy fallback (default `30000`, max `300000`)
- `CP_SAT_SOLVER_URL` - optional; e.g. `http://127.0.0.1:8790/solve` (Python sidecar in `solver/cpsat/service.py`). Production AWS: **Lambda** (`docs/AWS_LAMBDA_CPSAT.md`) or a **second container** (`docs/AWS_CP_SAT.md`). The sidecar model enforces the same **hard** placement rules as the greedy engine for teacher/division packing, `INCLUDE_ONLY`, inactive period weekdays, `maxPerDay`, teacher morning/evening/weekly caps, continuity, and cross-division continuity (see `docs/ARCHITECTURE.md`). Day/slot “soft” excludes can be relaxed when `classTeacherPreferences.schedulingMode` is `BEST_FIT` / `OPTIMAL` or when the request uses `MATCH_LEGACY_BEST_FIT_OR_OPTIMAL` (see `planning/global-optimal-solver/JSON_CONTRACT.md`).
- `CP_SAT_SOLVER_SECRET` - optional shared secret; Node sends `Authorization: Bearer …` when set
- `CP_SAT_MAX_DECISION_VARS` - optional rough guard before calling the sidecar (default `5000000`); above this, the runner uses legacy greedy with `fallbackReason` `cp_sat_size_cap`
- `CP_SAT_FALLBACK_ON_VALIDATION` - when `true` (default), if the CP-SAT result passes the HTTP adapter but fails **post-solve** hard checks (`validateTimetableRun` ERROR severities), the runner **replaces** the result with legacy greedy and sets `report.solver.fallbackReason` to `cp_sat_validation` (codes in `report.solver.validationCodes`). Set to `false` to keep the CP-SAT grid and surface `report.cpsat.validationFailed` / `validationCodes` instead.
- `CP_SAT_RANDOM_SEED` / `CP_SAT_EMIT_IIS` / `CP_SAT_MAX_RESPONSE_ENTRIES` - optional advanced tuning (see `server/config/env.js` / request builder)
- **CP-SAT coverage (v1):** the sidecar enforces a **hard subset** aligned with `planning/global-optimal-solver/CONSTRAINT_MAP.md` (division slot uniqueness, teacher time conflicts, `INCLUDE_ONLY`, day/slot excludes, inactive period days, `freePeriodRules`, `fixedSlots`, one teacher per division+subject). It does **not** yet mirror every greedy heuristic (teacher morning/evening/weekly capacity curves, streak continuity, cross-division continuity, class-teacher auto-placement). Infeasible or rejected CP-SAT responses fall back to legacy.
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
- `npm run export:last-run` - write latest `timetable_runs` row to **`Results/SchoolTime-last-run.json`** (full bundle), **`Results/SchoolTime-last-run-summary.json`** (meta + report only), and a dated archive **`Results/SchoolTime-timetable-run-YYYY-MM-DD-<runId>.json`** (uses same `.env` / DB as the API)
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
- `npm run solver:cpsat` - start local CP-SAT JSON sidecar on port **8790** (requires Python 3 + `pip install -r solver/cpsat/requirements.txt`). In another terminal, set `CP_SAT_SOLVER_URL=http://127.0.0.1:8790/solve` and `TIMETABLE_SOLVER=hybrid` in `.env`, restart the API, then use **Hybrid** on Create (the app reads `GET /api/health` → `timetableSolver.recommendedUiDefault`).
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
- Tenant configuration state saved in `tenant_state` (`migrateTenantState` on load/save/generate/export, **plus full DB backfill on API startup** in all environments; optional `npm run migrate:tenant-state:backfill` — see `docs/DEPLOYMENT.md`)
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

**Production:** **GitHub Pages** (frontend) + **AWS EC2** (API in Docker) + **RDS PostgreSQL** + **Caddy HTTPS** (custom domain or free **DuckDNS**). **Render is not used.**

- **Step-by-step:** **`docs/AWS_FREE_TIER_SETUP.md`** (EC2 Free Tier) or **`docs/AWS_COMPLETE_SETUP.md`**
- Set `NODE_ENV=production`, `DB_CLIENT=postgres`, `DATABASE_URL` (RDS; often database **`postgres`** on Easy Create — no `?sslmode=` in URL for Docker)
- Use a secure `JWT_SECRET`; set `HOST=0.0.0.0` in containers
- `CORS_ORIGIN` = GitHub Pages origin (e.g. `https://rahul-vik.github.io`); Actions variable **`VITE_API_BASE_URL`** = `https://<api-host>/api` (e.g. DuckDNS)
- Root **`Dockerfile`** builds the API image; optional CP-SAT: **`docs/AWS_LAMBDA_CPSAT.md`**
- Local/dev SQLite: persist `server/data/`; production uses Postgres only

## Documentation Index

- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `docs/AWS_DEPLOYMENT.md` (production: GitHub Pages + AWS EC2/RDS)
- `docs/AWS_FREE_TIER_SETUP.md` (EC2 + RDS + Caddy/DuckDNS — primary deploy guide)
- `docs/DEPLOYMENT.md`
- `docs/AWS_LAMBDA_CPSAT.md` (CP-SAT on Lambda, generate-only)
- `docs/AWS_CP_SAT.md`
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

- Before deploy: **`npm run prod:preflight`** (build, smoke, engine tests, migration dry-run, audit). Full checklist: `docs/PRODUCTION_READINESS.md`. Existing-user DB upgrades run automatically on API startup; optional `npm run migrate:all` on a DB copy if you cannot restart the API.
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


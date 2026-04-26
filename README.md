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
- `logo/` - branding assets
- `Results/` - local output samples generated during development
- `docs/` - architecture and operational documentation

## Features

- Authentication (register/login/refresh/logout/password reset)
- Role-based access (`owner`, `admin`, etc.)
- School setup: mediums, standards, divisions
- Academic setup: subjects, teachers, teacher-division mapping
- Scheduling setup: period slots, working days, subject preferences
- Timetable generation engine with completion score and unscheduled insights
- Dashboard insights for below-100% completion
- Timetable reports:
  - Subject hours
  - Teacher workload
  - Division completion
- Export bundle:
  - Visual PDF timetable pages
  - Visual Excel timetable sheets
- Usage, licensing credits, API key management, audit logs

## Prerequisites

- Node.js 18+ (recommended 20+)
- npm 9+

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
- `npm run health:daily` - run build + smoke + security audit health suite

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
- Timetable run snapshots also persist `state_json` in `timetable_runs` so exports can reproduce the generated run accurately

## Exports

- PDF and Excel exports are downloaded through `/api/timetable/download`
- Visual style includes:
  - Full slot grid (lesson + break + lunch)
  - Category legend
  - Subject accent cards
  - Free-period style
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
- `docs/PRODUCTION_READINESS.md`
- `docs/PROJECT_STANDARDS.md` (master handbook)
- `docs/POSTGRES_MIGRATION.md`
- `docs/AUTO_CHANGELOG.md` (generated)
- `docs/AUTO_RULES_INTELLIGENCE.md` (generated)
- `docs/AUTONOMOUS_AUTOFIX_POLICY.md`
- `docs/IMPLEMENTATION_BACKLOG.md`

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
- CI verifies build + smoke + security audit (`npm run build`, `npm run smoke:prod`, `npm run audit:security`).
- Daily automated checks: `.github/workflows/daily-health-autofix.yml` (scheduled health scan + safe dependency autofix PR + issue on failure).
- Run periodic DB backups with `scripts/backup-db.ps1`.
- Linux/macOS backup helpers:
  - `scripts/backup-db.sh`
  - `scripts/restore-db.sh`


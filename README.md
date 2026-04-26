# SchoolTime - Smart Timetable Builder

SchoolTime is a full-stack timetable management app for schools. It helps admins configure standards, divisions, subjects, teachers, slots, and rules; generate conflict-aware timetables; review reports; and export polished PDF/Excel files.

## License And Ownership

This project is licensed under the MIT License.

Copyright (c) 2026 Rahul V

See `LICENSE` for full text.

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: SQLite (`better-sqlite3`)
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

3. Start frontend + backend together:

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
- `VITE_API_BASE_URL` - frontend API base URL

## Available Scripts

- `npm run dev` - Vite frontend only
- `npm run dev:server` - API server only
- `npm run dev:all` - run both frontend and backend
- `npm run build` - production frontend build
- `npm run preview` - preview built frontend

## Data And Persistence

- SQLite DB file: `server/data/app.db`
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

## Troubleshooting

- Login/session issues:
  - Clear `tt_token` and `tt_refresh_token` from browser storage and login again
- Export file invalid:
  - Verify API URL and that API server is running on configured port
- Low completion score:
  - Use dashboard tips and Timetable reports to identify missing subject periods
  - Review teacher eligibility, rules, and available slots/days


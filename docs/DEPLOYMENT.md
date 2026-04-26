# Deployment Guide

## 1) Build Requirements

- Node.js 18+ (20+ recommended)
- npm
- Writable storage for SQLite database (`server/data/`)

## 2) Environment Setup

Copy `.env.example` to `.env` and set at minimum:

- `NODE_ENV=production`
- `PORT=<your port>`
- `JWT_SECRET=<strong random secret>`
- `CORS_ORIGIN=<your frontend url>`
- `VITE_API_BASE_URL=<public api base>`
- `DB_CLIENT=sqlite` (current default runtime)
- `DATABASE_URL=<postgres connection string>` (required for Postgres migration/runtime)

If multiple CORS origins are supported in your config parser, provide them in the expected format.

If you are preparing Render Postgres, run Phase 1 migration first:

- `docs/POSTGRES_MIGRATION.md`

## 3) Install And Build

```bash
npm install
npm run build
```

## 4) Start Services

Backend:

```bash
node server/index.js
```

Recommended process manager:

```bash
npm i -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Frontend:

- Serve built `dist/` via static hosting or reverse proxy.

## 5) Reverse Proxy (Recommended)

Use Nginx/Caddy/Apache:

- Serve `dist/` for client routes
- Proxy `/api/*` to Node backend
- Enable HTTPS

## 6) Data Persistence

Persist these paths:

- `server/data/app.db`
- `server/data/*-wal` and `server/data/*-shm` (SQLite WAL mode)

## 7) Backup

Recommended backup targets:

- `server/data/`
- environment secrets (secure vault)

Windows backup/restore scripts:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup-db.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\restore-db.ps1 -BackupZip .\backups\appdb-backup-YYYYMMDD-HHMMSS.zip
```

Run restore drill at least once before go-live.

Linux/macOS backup/restore scripts:

```bash
chmod +x scripts/backup-db.sh scripts/restore-db.sh
./scripts/backup-db.sh
./scripts/restore-db.sh ./backups/appdb-backup-YYYYMMDD-HHMMSS.tar.gz
```

## 8) Operational Checks

- API health: `/api/health`
- Login and token refresh
- Generate timetable
- Export PDF and Excel
- Verify audit logs and usage endpoints
- Verify `npm run smoke:prod` passes
- Verify security audit with `npm run audit:security`

## Observability

- Health endpoint now reports uptime and timestamp: `/api/health`
- With PM2:
  - `pm2 status`
  - `pm2 logs schooltime-api`
  - configure external alerting if process is offline or restarts repeatedly

## 9) Security Checklist

- Use a long random `JWT_SECRET`
- Restrict CORS to trusted domains
- Run behind HTTPS
- Keep dependencies updated
- Protect backups and DB files

## 10) Move To Another PC (Cursor)

1. Copy project archive/folder.
2. Run `npm install`.
3. Configure `.env`.
4. Run `npm start` (default dev mode) or `open-dev.bat` on Windows.
5. Use `npm run dev:all` only if you explicitly want that command form.
6. Use production mode only when intentional (`npm run start:prod`) or deploy as above.


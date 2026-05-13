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

### Platform operator portal (`/creator`)

- The **creator** UI is the same SPA as the school app; entry is chosen in `src/main.jsx` from the path **after** the Vite `base` (so GitHub Pages builds with `--base "/YourRepo/"` still open the portal at `https://…/YourRepo/creator`).
- Backend: set **`CREATOR_PORTAL_PASSWORD`** (dev) and/or **`CREATOR_PORTAL_PASSWORD_HASH`** (production) in server `.env`. If neither is set, `POST /api/creator/login` returns **503** with a clear error — the portal “does not run” until this is configured.
- Frontend API calls use **`VITE_API_BASE_URL`** (see `.env.example`). For static hosting, that must point at a reachable **`/api`** (same host reverse-proxy, or full URL with CORS allowing the Pages origin).
- Deep link **`…/creator`**: ensure the host serves **`index.html`** for unknown paths (GitHub Actions workflow copies `dist/index.html` to `dist/404.html` for this).

### SMTP (password reset)

Nodemailer connects from the **API container** to **`SMTP_HOST:SMTP_PORT`**. A logged **`Connection timeout`** almost always means the TCP path or TLS mode is wrong for your provider, or the host blocks outbound SMTP.

- **Port vs TLS:** **`SMTP_PORT=587`** → set **`SMTP_SECURE=false`** (STARTTLS). **`SMTP_PORT=465`** → set **`SMTP_SECURE=true`** (implicit TLS). Mixing these is a common cause of hangs or timeouts.
- **Firewall / platform:** Some PaaS providers block outbound **25** or restrict SMTP; confirm your host allows outbound to your mail provider on the port you use.
- **IPv6:** If the provider resolves to IPv6 but your network cannot route it, set **`SMTP_FORCE_IPV4=1`**.
- **Timeouts:** Tune **`SMTP_CONNECTION_TIMEOUT_MS`** (default 45000) and **`SMTP_SOCKET_TIMEOUT_MS`** (default 120000) if the provider is slow; raising them does not fix a blocked port.
- **`SMTP_REQUIRE_TLS`:** default **`auto`** enables `requireTLS` for typical 587+STARTTLS. Set **`off`** only if your provider documents that requirement.

When SMTP send fails after a token is created, the API still returns **`{ ok: true }`** but logs **`[password-reset] SMTP send failed`** and records audit metadata (`emailSent: false`, `emailFailureReason`). Operators should check server logs and fix SMTP env; users may need a **new** reset request after SMTP is fixed.

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

### Tenant state upgrades (existing schools)

Tenant configuration is JSON in `tenant_state.state_json`. Newer fields (for example per-period `activeWeekdays`) do not require a separate SQL migration for SQLite; the API runs **`migrateTenantState`** when tenant state is loaded, on save, on generate/export paths, and **on every API process startup** (including production): all `tenant_state` rows are scanned and updated when migration changes the payload—same logic as the backfill script below.

Optional manual backfill (dry-run first, then apply)—for example if you need to migrate the DB file **without** starting the API, or to verify counts before deploy:

```bash
npm run migrate:tenant-state:backfill
npm run migrate:tenant-state:backfill:apply
```

Migration notes for scheduling rules:

- **INCLUDE_ONLY / CUSTOM:** cells that reference a period slot inactive on that weekday are dropped. If every cell would be removed, the rule is set **`isActive: false`** so timetable generation is not blocked by an impossible constraint.
- **INCLUDE_ONLY / PRESET_LAST_LESSON:** if `includeWeekday` is not in the school’s `workingDays`, or the computed last lesson slot is inactive on that weekday, the rule is set **`isActive: false`**.

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


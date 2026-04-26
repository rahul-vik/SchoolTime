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

If multiple CORS origins are supported in your config parser, provide them in the expected format.

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

## 8) Operational Checks

- API health: `/api/health`
- Login and token refresh
- Generate timetable
- Export PDF and Excel
- Verify audit logs and usage endpoints

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
4. Run `npm run dev:all` (dev) or deploy as above (prod).


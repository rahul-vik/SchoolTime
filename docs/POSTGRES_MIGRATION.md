# Postgres Migration Guide

This project supports both database engines:

- `sqlite` (default local/dev mode)
- `postgres` (Render/production mode)

Use `DB_CLIENT` to switch runtime engine.

## What Is Implemented

- Postgres runtime support in `server/db.js`
- Postgres schema bootstrap (`server/db/postgres-schema.sql`)
- SQLite -> Postgres migration script (`scripts/migrate-sqlite-to-postgres.mjs`)
- Environment support in `.env.example` (`DB_CLIENT`, `DATABASE_URL`)

## Prerequisites

- A working Postgres database URL (Render external DB URL).
- Existing SQLite DB at `server/data/app.db`.

## 1) Set environment (migration step)

In `.env`:

```env
DATABASE_URL=postgresql://...
```

## 2) Run migration

```bash
npm run migrate:postgres
```

This will:

1. create tables in Postgres (if missing)
2. copy rows from SQLite to Postgres
3. ignore duplicates with `ON CONFLICT DO NOTHING`

## 3) Verify data

Use Render psql (example):

```bash
render psql <your-db-id>
```

Then run checks:

```sql
SELECT COUNT(*) FROM organizations;
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM timetable_runs;
```

Compare counts with SQLite as needed.

## 4) Switch runtime to Postgres

After verifying data copy:

```env
DB_CLIENT=postgres
DATABASE_URL=postgresql://...
```

Then restart backend service.

## 5) Security note

- Rotate leaked DB credentials immediately.
- Never commit `DATABASE_URL` in git.

## Runtime Notes

- SQLite remains useful for local development.
- Postgres is recommended for hosted production.
- SQL differences are handled by the DB adapter (placeholder and `IFNULL` compatibility translation).


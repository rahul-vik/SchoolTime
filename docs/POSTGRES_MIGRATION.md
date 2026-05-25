# Postgres Migration Guide

This project supports both database engines:

- `sqlite` (default local/dev mode)
- `postgres` (AWS RDS / hosted production mode)

Use `DB_CLIENT` to switch runtime engine.

## What Is Implemented

- Postgres runtime support in `server/db.js`
- Postgres schema bootstrap (`server/db/postgres-schema.sql`)
- SQLite -> Postgres migration script (`scripts/migrate-sqlite-to-postgres.mjs`)
- Environment support in `.env.example` (`DB_CLIENT`, `DATABASE_URL`)

## Prerequisites

- A working Postgres database URL (e.g. Amazon RDS). **EC2 Docker API:** use `postgresql://user:pass@host:5432/postgres` without `?sslmode=` (see `docs/AWS_FREE_TIER_SETUP.md`). **psql / migration scripts** may use `?sslmode=require` if your client supports it.
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

Connect with any Postgres client, for example:

```bash
psql "$DATABASE_URL"
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


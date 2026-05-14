# Import one production organization into local SQLite

Use this when you need a **full copy** of a school’s rows from **production Postgres** into your **local** `server/data/app.db` (SQLite), for example to debug **Surana**’s timetable offline.

## Safety

- Use a **read-only** database role for `IMPORT_SOURCE_DATABASE_URL` when your host supports it.
- **Never commit** production URLs or passwords. Set variables only in a local shell or `.env` that is gitignored.
- The script **creates a new organization** with **new user IDs** so it does not overwrite an existing local org. Imported users get synthetic emails under `@local-import.invalid` and one shared temporary password you choose.

## What is copied

From the matched production `org_id`:

- `organizations`, `users`, `licenses`, `credit_ledger`, `tenant_state`, `timetable_runs`, `audit_logs`, `api_keys`, `credit_purchase_requests`
- Up to **500** rows of `platform_error_logs` for that org

Not copied (session / reset secrets):

- `refresh_tokens`, `password_reset_tokens`

## Prerequisites

- Local API uses **SQLite** (`DB_CLIENT=sqlite` or unset) and `server/data/app.db` exists (run the app once or touch DB).
- Production connection string available for **Postgres** (same schema as `server/db/postgres-schema.sql`).

## Commands (PowerShell)

```powershell
cd "path\to\SchoolTime"

$env:IMPORT_I_UNDERSTAND_COPY_TO_LOCAL = "YES"
$env:IMPORT_SOURCE_DATABASE_URL = "postgresql://USER:PASS@HOST:5432/DBNAME?sslmode=require"
$env:IMPORT_LOCAL_PLAINTEXT_PASSWORD = "YourLongTempPassword12+"

# Match organization name (case-insensitive substring). If several match, the script lists IDs — then set:
# $env:IMPORT_ORG_ID = "<uuid from list>"

npm run import:prod-org:local -- --school "Surana"
```

Or set `IMPORT_SCHOOL_NAME=Surana` instead of `--school`.

## After import

1. Start the stack: `npm run dev:all`.
2. Sign in with the printed **first user** email (first row by `created_at` in prod — usually owner) and `IMPORT_LOCAL_PLAINTEXT_PASSWORD`.
3. Organization display name will be the production name plus `IMPORT_ORG_NAME_SUFFIX` (default ` (local import)`).

## Creator portal (`/creator`) — why the school might “not show”

1. **Same API as SQLite** — The portal reads whatever API `VITE_API_BASE_URL` points to. Data you imported exists only in **local** `server/data/app.db`. Open **`http://localhost:5173/creator`** (or your dev origin) so the browser calls **`http://localhost:8787/api`**. A hosted creator that talks to **production** will never list a locally imported org.
2. **Sort order** — Organizations default to **newest `created_at` first**. The import script sets the **new** org’s `created_at` to **import time** (unless `IMPORT_PRESERVE_ORG_CREATED_AT=YES`) so the copy appears at the **top**. If you used an older script version, switch sort to **Created ↑** or scroll to the bottom of the table.
3. **Import not run** — If no `npm run import:prod-org:local` succeeded, nothing new exists in the DB.

## npm script

`package.json` defines:

`npm run import:prod-org:local -- --school "Surana"`

Implementation: `scripts/import-prod-org-to-local-sqlite.mjs`.

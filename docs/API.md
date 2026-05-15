# API Reference (Internal)

Base URL:

- Development default: `http://localhost:8787/api`

Auth:

- Most endpoints require `Authorization: Bearer <token>`
- Refresh endpoint uses refresh token in request body

## Health

- `GET /health` (mounted as **`GET /api/health`** under the app’s API prefix)

Response includes:

- `ok`, `env`, `uptimeSec`, `now`
- **`release`** — `{ version, buildNumber, buildSha, releaseLabel }` for the **deployed web bundle** (from `dist/schooltime-release.json` when present, else `package.json` + optional `APP_BUILD_NUMBER` / `RENDER_GIT_COMMIT`). The browser compares this to its baked-in build (`__APP_VERSION__` / `__APP_BUILD_NUMBER__` from Vite) to show an “update available” strip in production.

## Authentication

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/password-reset/request` — body `{ "email": string }`; creates token and sends reset link via SMTP when configured; always returns `{ "ok": true }` for privacy (even if SMTP fails or user is unknown). Audit metadata may include `emailSent` / `emailFailureReason` when SMTP is configured.
- `POST /auth/password-reset/confirm` — body `{ "token": string, "newPassword": string }`

## Session/User

- `GET /me` — includes `user.permissions` and `user.availableRoles` derived from platform role-access policy
- `PATCH /me`
- `GET /users` — requires `canManageUsers`
- `POST /users` — requires `canManageUsers`; role must exist in `availableRoles`
- `PATCH /users/:id` — requires `canManageUsers`; body may include **`role`**, **`isActive`**, and/or **`password`** (min 6 chars); at least one field required. **`password`** updates the hash and revokes that user’s refresh tokens. Only an **owner** may set the password for another **owner** account.

## Tenant State

- `GET /state`
- `PUT /state` — requires `canConfigureTimetable`
- If the **browser closes the connection** while the JSON body is still uploading (common with debounced autosave, navigation away, or weak networks), the API may respond with **400** and message **`Request aborted`**; that is not a validation failure and is **not** written to platform error logs.
- JSON body size limit is **2mb** (`express.json`); oversize payloads return a different parser error—trim large assets (e.g. school logo) if needed.
- State payload may include `classTeacherPreferences`, `exportJobs` (latest 3 retained by client), and `lastGeneratedTimetable`

### Period slots and scheduling rules

- Each `periodSlots[]` item may include **`activeWeekdays`**: a subset of the tenant’s working days. Empty or omitted means the slot runs on **all** working days (backward compatible).
- On load/persist, the server runs **`migrateTenantState`** (`server/services/tenantStateMigration.js`): normalizes `activeWeekdays` per slot, migrates **`periodSlots` before `schedulingRules`**, and prunes **`INCLUDE_ONLY` / `CUSTOM` / `allowedCells`** entries that reference a slot on a weekday when that slot is off—so stored rules stay consistent with the engine and `server/engine.js`. The same migration is applied to **every** `tenant_state` row **on API process startup** (including production) via `server/services/tenantStateMigrationRunner.js`, so the database stays upgraded without relying on the next `GET /state` per org.
- **`PUT /state`** should send coherent `periodSlots` + `schedulingRules`; clients that hydrate from `GET /state` receive already-migrated payloads.

## Timetable

- `POST /timetable/generate` — requires `canConfigureTimetable`; body is the tenant state object **plus an optional** string field **`timetableSolver`**: `legacy` (default greedy), `experimental`, `cp_sat`, or `hybrid`. When present, it **overrides** server env `TIMETABLE_SOLVER` for **that request only** (timeouts, `CP_SAT_SOLVER_URL`, and caps still come from env). The field is stripped before `migrateTenantState` / Zod validation. Response `report.solver` includes **`timetableSolverSource`**: `request` | `env`. See `TIMETABLE_SOLVER` / `CP_SAT_SOLVER_URL` in `docs/ARCHITECTURE.md`.
- `GET /timetable/latest` — requires auth; returns latest generated timetable snapshot for current org/user context
- **`POST /timetable/generate` response** — body includes `timetable` with `entries`, `report`, `score`, `status`, `runId`, `generatedAt`, and **`sourceState`**: the validated tenant payload the engine used for that run (same snapshot persisted as `timetable_runs.state_json` and merged into `tenant_state` in the generate transaction).
- **`GET /timetable/latest` response** — `{ run, timetable }` where `timetable` includes `entries`, `report`, `runId`, `generatedAt`, and **`sourceState`** parsed from the latest row’s `state_json` when present (older rows may omit it; clients fall back to live `GET /state` lists).
- `GET /timetable/download?type=PDF|EXCEL&scope=ALL_DIVISIONS|ALL_TEACHERS|REPORTS_BUNDLE` — requires `canConfigureTimetable`; duplicate query keys use the first value; summary-report aliases such as `reports-bundle`, `SUMMARY`, or `SUMMARY_REPORTS` normalize to `REPORTS_BUNDLE`. Binary PDF/XLSX from `server/services/exportService.js`; visual layout details (CT placement, teacher medium code line, report bundle labeling) are documented in `README.md` → **Exports** and `docs/ARCHITECTURE.md` → **Export Pipeline**. Export uses the run’s stored state when available so the period grid matches `entries`.

## Settings/Admin

- `GET /license/purchase-pack-info` — requires `canManageCredits`; returns `{ packSize, priceCents }` from platform settings
- `POST /license/purchase-request` — requires `canManageCredits`; body `{ "packCount": number, "note"?: string }`; **`packCount`** 1–500 whole packs; each pack is **`credit_pack_size`** credits. Creates a **pending** row; credits are **not** added until a creator approves (`POST /creator/credit-purchase-requests/:id/approve`)
- `GET /license/my-credit-purchase-requests` — requires `canManageCredits`; last 50 requests for the signed-in org
- `GET /usage`
- `GET /audit-logs` — requires `canViewAudit`
- `GET /audit-logs/export.csv` — requires `canViewAudit`
- `GET /api-keys` — requires `canManageApiKeys`
- `POST /api-keys` — requires `canManageApiKeys`
- `DELETE /api-keys/:id` — requires `canManageApiKeys`

## B2B (API Key Protected)

- Endpoints are mounted via `createB2BRoutes` and use API key middleware.
- Ensure API key is active and passed as expected by middleware.

## Platform portal (creator / operator)

Separate JWT: payload includes `scope: "platform_creator"`. These tokens are **rejected** by normal tenant routes (`/me`, `/timetable/*`, etc.).

Configure with `CREATOR_PORTAL_PASSWORD` or `CREATOR_PORTAL_PASSWORD_HASH`. If neither is set, `POST /creator/login` returns `503`.

### Auth

- `POST /creator/login` — body `{ "password": "..." }` → `{ token, tokenType }`

### Authenticated (`Authorization: Bearer <creator token>`)

Paths below are under the normal API base (e.g. `http://localhost:8787/api`) with prefix `/creator`.

- `GET /creator/overview` — org count, user count, sum of remaining credits, error-log count (last 24h)
- `GET /creator/orgs` — query: `limit`, `offset`
- `GET /creator/org-purges` — query: `limit` — recent **organization removals** (metadata snapshot written at purge time; org rows are gone)
- `DELETE /creator/orgs/:orgId` — body `{ "confirmationName": string, "notes"?: string }`; **`confirmationName` must exactly match** the organization name (trimmed). Deletes the org and all tenant data (users, `tenant_state`, `timetable_runs`, `credit_ledger`, `licenses`, `api_keys`, `audit_logs` and org-scoped `platform_error_logs` for that org, tokens, etc.) after inserting a row into `platform_org_purges`. **404** if org missing; **400** if name mismatch
- `GET /creator/users` — query: `limit`, `offset`, `q`
- `PATCH /creator/users/:userId/active` — body `{ "isActive": boolean }` — deactivate or reactivate; deactivating revokes refresh tokens
- `POST /creator/users/:userId/set-password` — body `{ "password"?: string }` — sets a new login password (bcrypt-hashed). If **`password`** is omitted or blank, the server generates a random one. **Revokes** the user’s refresh tokens. Response: `{ "ok": true, "userId", "newPassword" }` (**`newPassword`** is returned **once** here; it is not stored in plaintext in the database)
- `PATCH /creator/users/:userId` — partial body with at least one of `{ "fullName", "email", "role" }` — update user fields (**409** if email already in use)
- `DELETE /creator/users/:userId` — hard-delete user if the org has **another** user (reassigns `timetable_runs.created_by_user_id`); **409** if this is the only user in the org
- `GET /creator/credit-ledger` — query: `limit`, `orgId` (optional)
- `GET /creator/credit-purchase-requests` — query: `status` = `pending` | `approved` | `rejected` | `all` (default `pending`); joins org + requester
- `POST /creator/credit-purchase-requests/:requestId/approve` — grants `credits_total` to the org license, ledger reason `PURCHASE_APPROVED`, marks request approved (**409** if not pending)
- `POST /creator/credit-purchase-requests/:requestId/reject` — body `{ "note"?: string }`; marks rejected (**409** if not pending)
- `POST /creator/orgs/:orgId/credits` — body `{ "delta": number, "reason": string }`; **`delta` must be a non-zero multiple of 10** (e.g. +40, −10) (ledger + audit)
- `GET /creator/orgs/:orgId/export-bundle` — query: **`scope`** = `full` (default) | `timetable`. **`full`**: full-org **JSON** backup for migration/support: organization, license, credit ledger, `tenant_state`, `timetable_runs`, `api_keys`, audit rows, credit purchase requests, and a capped slice of org-scoped `platform_error_logs`. **`users`** rows export SQLite/Postgres columns as JSON objects: **`id`**, **`org_id`**, **`full_name`**, **`email`**, **`password_hash`** (bcrypt—treat as secret), **`role`**, **`created_at`**, **`is_active`**. **`timetable`**: small JSON with **`bundleKind`: `"timetable_setup"`**, organization **`id`/`name`**, and **`tenantState`** (parsed object from `tenant_state.state_json` only — no users, licenses, runs, audit, or keys). Filename suffix includes **`timetable-setup`** when `scope=timetable`. Returns `application/json` with `Content-Disposition: attachment`
- `POST /creator/orgs/:orgId/import-bundle` — (**large** JSON for `scope=full`) replaces data per scope in a transaction (**no** `platform_org_purges` row). Body includes optional **`scope`**: **`full`** (default) | **`timetable`**. **`200`** success body includes **`ok`**, **`message`**, **`scope`**, **`orgId`**, **`remapped`**, and **`userCount`** when `scope` is **`full`**. Responses may include machine-readable **`errorCode`** alongside **`error`** for operator toasts.

  **Default body:** `{ "confirmationName": string, "bundle": object, "scope"?: "full" | "timetable" }` (omit **`scope`** for full-org import). With **`"scope": "timetable"`** and a **`timetable_setup`** bundle, the server validates **`bundle.bundleKind === "timetable_setup"`**; updates **`tenant_state`** only for `:orgId` from **`bundle.tenantState`** (object serialized to `state_json`); **deletes all `timetable_runs`** for that org first so old generated timetables are not left referencing replaced setup. Does **not** insert users, change emails, or modify licenses or credit ledger — no **`EMAIL_IN_USE`**. Same **`confirmationName`** / remap name checks as full import; **`bundle.organization.id`** must match `:orgId` unless remap is enabled (remap rewrites only **`organization.id`** for setup bundles).

  **Full-org default:** **`bundle.organization.id` must equal `:orgId`**. **`confirmationName`** must exactly match **`bundle.organization.name`** (trimmed). **400** `errorCode`: `NAME_MISMATCH`, `ORG_ID_MISMATCH`, `INVALID_REQUEST`, `INVALID_BUNDLE` (e.g. Zod failures or duplicate user emails in the bundle—see **`details.duplicateEmails`**), **`EMAIL_IN_USE`** when any bundle **`email`** is already taken by a user in a **different** organization (response includes **`emails`**: string[]); import is aborted **before** deleting the target org so nothing is wiped when this happens.

  **Remap body (restore a backup from another org into this org row):** `{ "bundle": object, "remapBundleOrgIdToUrlOrg": true, "confirmationSourceOrganizationName": string, "confirmationTargetOrganizationName": string, "scope"?: "full" | "timetable" }` (omit `confirmationName`). For **`scope": "full"`**, the server checks **source** name equals **`bundle.organization.name`** and **target** name equals the **current DB** organization name for `:orgId`, then rewrites **`bundle.organization.id`** and every exported **`org_id`** in the bundle (`users`, `license`, `credit_ledger`, `tenant_state`, `timetable_runs`, `audit_logs`, `api_keys`, `credit_purchase_requests`, and non-null `org_id` on `platform_error_logs`) to `:orgId` before the same import as above. For **`scope": "timetable"`**, only **`bundle.organization.id`** is rewritten to `:orgId` before applying setup import. **Risk (full remap):** the URL org is fully replaced by bundle content; **organization name** in the database becomes the bundle’s name. **400** `errorCode` may include `SOURCE_NAME_MISMATCH`, `TARGET_NAME_MISMATCH`, `REMAP_ORG_ID_INCONSISTENT`, `TARGET_ORG_NOT_FOUND`.
- `POST /creator/register-org` — same fields as public register plus optional `initialCredits` (defaults to current `signup_initial_credits` setting)
- `GET /creator/platform-settings` — keyed settings (`signup_initial_credits`, `credit_pack_size`, `credit_pack_price_cents`)
- `PATCH /creator/platform-settings` — partial body with any of those keys (numbers)
- `GET /creator/role-access` — role access policy with permissions matrix
- `PUT /creator/role-access` — body `{ "roles": [{ "key": string, "canManageUsers": boolean, "canManageCredits": boolean, "canViewAudit": boolean, "canManageApiKeys": boolean, "canConfigureTimetable": boolean }] }`
- `GET /creator/error-logs` — query: `limit`
- `GET /creator/audit-logs` — cross-tenant audit; query: `limit`, `orgId`, `q`

Unhandled errors that reach the Express error handler are persisted to `platform_error_logs` (in addition to the HTTP response).

## Response Notes

- Errors usually include `error` and optional `detail`. Creator routes may also return **`errorCode`** (string) for stable client handling.
- Export downloads return binary streams with content-disposition filename.
- Timetable generation returns:
  - `entries`
  - `score`
  - `status`
  - `report` (`totalRequired`, `totalScheduled`, `unscheduled`, `divisionsMissingClassTeacher` — `{ divisionId, divisionName, standardId }[]` for classes with no teacher class-teacher assignment, `classTeacherRules`, `optimization`, `rejections`, `durationMs`, **`solver`** — `{ requested, applied, timetableSolverSource, timeoutMs, workerUsed, fallbackReason?, fallbackDetail?, hybridStage? }` — `timetableSolverSource` is `request` when the client sent `timetableSolver` on generate, else `env`; worker routing from `TIMETABLE_SOLVER` / per-request override (`hybridStage` when `requested` is `hybrid`), optional **`experimental`** prototype metadata when the experimental path runs, optional **`cpsat`** fields when the CP-SAT sidecar responded)

## Client Integration

Frontend API utility is implemented in `src/api.js`, including:

- token persistence
- automatic 401 refresh + retry
- safer download validation for PDF/XLSX responses


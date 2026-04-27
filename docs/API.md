# API Reference (Internal)

Base URL:

- Development default: `http://localhost:8787/api`

Auth:

- Most endpoints require `Authorization: Bearer <token>`
- Refresh endpoint uses refresh token in request body

## Health

- `GET /health`

## Authentication

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/password-reset/request`
- `POST /auth/password-reset/confirm`

## Session/User

- `GET /me` — includes `user.permissions` and `user.availableRoles` derived from platform role-access policy
- `PATCH /me`
- `GET /users` — requires `canManageUsers`
- `POST /users` — requires `canManageUsers`; role must exist in `availableRoles`
- `PATCH /users/:id` — requires `canManageUsers`; role must exist in `availableRoles`

## Tenant State

- `GET /state`
- `PUT /state` — requires `canConfigureTimetable`

## Timetable

- `POST /timetable/generate` — requires `canConfigureTimetable`
- `GET /timetable/download?type=PDF|EXCEL&scope=ALL_DIVISIONS|ALL_TEACHERS|REPORTS_BUNDLE` — requires `canConfigureTimetable`

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
- `DELETE /creator/users/:userId` — hard-delete user if the org has **another** user (reassigns `timetable_runs.created_by_user_id`); **409** if this is the only user in the org
- `GET /creator/credit-ledger` — query: `limit`, `orgId` (optional)
- `GET /creator/credit-purchase-requests` — query: `status` = `pending` | `approved` | `rejected` | `all` (default `pending`); joins org + requester
- `POST /creator/credit-purchase-requests/:requestId/approve` — grants `credits_total` to the org license, ledger reason `PURCHASE_APPROVED`, marks request approved (**409** if not pending)
- `POST /creator/credit-purchase-requests/:requestId/reject` — body `{ "note"?: string }`; marks rejected (**409** if not pending)
- `POST /creator/orgs/:orgId/credits` — body `{ "delta": number, "reason": string }`; **`delta` must be a non-zero multiple of 10** (e.g. +40, −10) (ledger + audit)
- `POST /creator/register-org` — same fields as public register plus optional `initialCredits` (defaults to current `signup_initial_credits` setting)
- `GET /creator/platform-settings` — keyed settings (`signup_initial_credits`, `credit_pack_size`, `credit_pack_price_cents`)
- `PATCH /creator/platform-settings` — partial body with any of those keys (numbers)
- `GET /creator/role-access` — role access policy with permissions matrix
- `PUT /creator/role-access` — body `{ "roles": [{ "key": string, "canManageUsers": boolean, "canManageCredits": boolean, "canViewAudit": boolean, "canManageApiKeys": boolean, "canConfigureTimetable": boolean }] }`
- `GET /creator/error-logs` — query: `limit`
- `GET /creator/audit-logs` — cross-tenant audit; query: `limit`, `orgId`, `q`

Unhandled errors that reach the Express error handler are persisted to `platform_error_logs` (in addition to the HTTP response).

## Response Notes

- Errors usually include `error` and optional `detail`.
- Export downloads return binary streams with content-disposition filename.
- Timetable generation returns:
  - `entries`
  - `score`
  - `status`
  - `report` (`totalRequired`, `totalScheduled`, `unscheduled`, `durationMs`)

## Client Integration

Frontend API utility is implemented in `src/api.js`, including:

- token persistence
- automatic 401 refresh + retry
- safer download validation for PDF/XLSX responses


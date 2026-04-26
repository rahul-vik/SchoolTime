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

- `GET /me`
- `PATCH /me`
- `GET /users`
- `POST /users`
- `PATCH /users/:id`

## Tenant State

- `GET /state`
- `PUT /state`

## Timetable

- `POST /timetable/generate`
- `GET /timetable/download?type=PDF|EXCEL&scope=ALL_DIVISIONS|ALL_TEACHERS|REPORTS_BUNDLE`

## Settings/Admin

- `POST /license/purchase-pack`
- `GET /usage`
- `GET /audit-logs`
- `GET /audit-logs/export.csv`
- `GET /api-keys`
- `POST /api-keys`
- `DELETE /api-keys/:id`

## B2B (API Key Protected)

- Endpoints are mounted via `createB2BRoutes` and use API key middleware.
- Ensure API key is active and passed as expected by middleware.

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


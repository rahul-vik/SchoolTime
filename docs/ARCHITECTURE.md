# Architecture Overview

## High-Level Components

1. React frontend (`src/`)
2. Express API server (`server/index.js`)
3. SQLite database (`server/data/app.db`)
4. Timetable scheduling engine (`server/engine.js`)
5. Export service (`server/services/exportService.js`)

## Frontend Design

- Root app: `src/App.jsx`
- Feature folders:
  - `features/auth`
  - `features/dashboard`
  - `features/setup`
  - `features/academics`
  - `features/scheduling`
  - `features/timetable`
  - `features/settings`
- Shared UI primitives and helpers are in `features/shared`

State is mostly managed in `App.jsx` and passed to feature pages as props.

## Backend Design

- API bootstrap: `server/index.js`
- Route modules:
  - `authRoutes`, `sessionRoutes`, `userRoutes`
  - `stateRoutes`, `timetableRoutes`, `b2bRoutes`
  - `usageRoutes`, `licenseRoutes`, `apiKeyRoutes`, `auditRoutes`
- Middleware:
  - JWT auth
  - role guard
  - API key auth for B2B endpoints

## Timetable Engine Flow

Located in `server/engine.js`.

Core sequence:

1. Normalize slot metadata (morning/after-lunch/boundaries).
2. Place fixed slots where possible.
3. Iterate divisions and subjects by priority.
4. For each needed period, find eligible teacher and available slot.
5. Fill remaining unassigned lesson slots with `isFreePeriod`.
6. Compute unscheduled requirements and score.

Scoring:

- `score = round(totalScheduled / totalRequired * 100)`
- Status mapping:
  - `FEASIBLE` (> 85)
  - `PARTIAL` (> 60)
  - `INFEASIBLE` (<= 60)

## Persistence Model

Core tables in `server/db.js`:

- `organizations`, `users`
- `licenses`, `credit_ledger`
- `tenant_state`
- `timetable_runs` (includes `report_json`, `entries_json`, `state_json`)
- `refresh_tokens`, `password_reset_tokens`
- `audit_logs`, `api_keys`

## Export Pipeline

Exports are generated server-side in `server/services/exportService.js`:

- PDF: PDFKit — visual timetable pages (class + teacher), summary reports bundle (subject hours, workload, division completion)
- Excel: ExcelJS — visual timetable sheets plus report worksheets for `REPORTS_BUNDLE`

Shared pure strings for report tables live in `shared/reportHoursLabels.js` (used by the export service and the React Reports UI).

Run-specific consistency uses `timetable_runs.state_json` when available (falls back to `tenant_state`).

**Timetable cells (visual exports):** Subject code left; **CT** (class-teacher period) right in black on one row; teacher view adds **`Std …-Div`** then medium **code** on the next line (black) when configured.

**Reports bundle:** Weekly Subject Hours uses short category labels and language subject **codes**; Division Completion prints **CT** inline after the subject name (black).

## Security Notes

- Access token + refresh token flow
- API routes protected by bearer auth
- Admin/owner routes protected by role middleware
- Rate limiting on API
- Configurable CORS policy


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

Shared weekday logic for period rows lives in **`shared/periodSlotDays.js`** (`slotActiveOnWeekday`, normalization helpers). The engine rejects placements on inactive **(day, slot)** pairs (`SLOT_INACTIVE_THIS_DAY`), skips those cells in placement loops, and applies the same notion to **`INCLUDE_ONLY`**: **CUSTOM** `allowedCells` and **PRESET_LAST_LESSON** matches only count when the underlying period slot is active that day (unknown slot numbers in `allowedCells` never match).

Core sequence:

1. Normalize slot metadata (morning/after-lunch/boundaries).
2. Place fixed slots where possible (respecting inactive slots per day).
3. Iterate divisions and subjects by priority.
4. For each needed period, find eligible teacher and available slot (lesson slots inactive that weekday are skipped).
5. Fill remaining unassigned lesson slots with `isFreePeriod`.
6. Compute unscheduled requirements and score.

## Post-run validation

`server/services/timetableValidationService.js` cross-checks generated **`entries`** against tenant **`periodSlots`** / limits / teacher caps. It emits findings such as **`LESSON_ON_INACTIVE_PERIOD_SLOT`** when a lesson sits on a period that is off for that weekday. Low-risk auto-fix is limited to an explicit allow-list in `server/services/timetableAutoFixService.js` (see `docs/AUTONOMOUS_AUTOFIX_POLICY.md`).

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

Shared pure strings for report tables live in `shared/reportHoursLabels.js` (used by the export service and the React Reports UI). Period-slot weekday helpers live in **`shared/periodSlotDays.js`** (server engine, exports, validation, client scheduling UI—keep behavior aligned).

Run-specific consistency uses `timetable_runs.state_json` when available (falls back to `tenant_state`).

**Timetable cells (visual exports):** Subject code left; **CT** (class-teacher period) right in black on one row; teacher view adds **`Std …-Div`** then medium **code** on the next line (black) when configured. Cells for **(day, slot)** where the period is inactive that weekday render like empty cells (no lesson content), matching the in-app grid.

**Reports bundle:** Weekly Subject Hours uses short category labels and language subject **codes**; Division Completion prints **CT** inline after the subject name (black).

## Security Notes

- Access token + refresh token flow
- API routes protected by bearer auth
- Admin/owner routes protected by role middleware
- Rate limiting on API
- Configurable CORS policy


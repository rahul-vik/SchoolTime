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

## Tenant state normalization

- **`migrateTenantState`** (`server/services/tenantStateMigration.js`) also orders **`workingDays`** (Monday→Sunday subset), **`standards`** (ascending by `sortOrder`, else numeric `name`, else name), and **`divisions`** (by standard order, then division name), and rewrites **`sortOrder`** on standards to `1..n` for a single canonical list used by the engine, exports, and UI. It also sets **`classTeacherPreferences.enabled`** to **`false`** when the field is omitted so generation matches explicit opt-in semantics.
- Client **`applyTenantStateWithFallback`** / **`buildTenantState`** (`src/features/timetable/tenantState.js`) apply the same ordering on load and before save. Shared helpers: **`shared/schoolDisplayOrder.js`**, **`shared/periodSlotDays.js`** (`sortWorkingDaysCanonical`, `WEEKDAY_CANONICAL_ORDER`).

## Settings vs generation (honesty matrix)

| Setting / data | Honored at generate? | Notes |
|----------------|---------------------|--------|
| Standards, divisions, mediums, working days | Yes | Canonical ordering via `migrateTenantState` / `normalizeTenantSchoolOrdering`. |
| Period slots (`slotType`, times, `activeWeekdays`) | Yes | Inactive **(day, slot)** pairs never receive lessons. |
| Subjects (limits, scope, priority) | Yes | Per-division limits from `divisionLimits` or legacy `subjectAllocations`. |
| Teachers (subjects, mediums, caps, continuity, division allow/exclude) | Yes | `teacherSubjects` narrows eligible teachers when present. |
| `freePeriodRules` | Yes | Blocks teacher on marked cells. |
| Placement preferences (`schedulingRules`) | Partial / mode-dependent | `EXCLUDE_DAY` / `EXCLUDE_SLOT` (incl. migrated `NOT_*`) and `INCLUDE_ONLY` are enforced in **STRICT**. **BEST_FIT** / **OPTIMAL** may relax **day/slot excludes only** in extra passes; `INCLUDE_ONLY`, inactive slots, teacher caps, continuity, and locks stay hard. |
| Class teacher: first-period days | Yes | Only when **`classTeacherPreferences.enabled === true`** (explicit toggle). |
| Class teacher: `dailyPrimaryMinPeriods` | No (stored only) | Validated in tenant state; engine does not place to satisfy it yet. |
| `fixedSlots` | Yes if present in payload | No first-party UI; API/B2B can supply rows. UI “fixed placement” uses **`INCLUDE_ONLY`** rules instead. |
| `TIMETABLE_SOLVER` | Routing only | **`legacy`** (default): `runTimetableEngine` in-process. **`experimental`**: worker + timeout; v0 delegates to the same greedy core and adds `report.experimental` metadata; on worker error/timeout, **fallback** runs legacy in-process. Not a global optimizer. |

## Timetable Engine Flow

Located in `server/engine.js`. HTTP generate uses `server/timetableSolverRunner.js` → `runTimetableGenerationEngine` (async) which defaults to the same `runTimetableEngine` implementation.

Shared weekday logic for period rows lives in **`shared/periodSlotDays.js`** (`slotActiveOnWeekday`, normalization helpers). The engine rejects placements on inactive **(day, slot)** pairs (`SLOT_INACTIVE_THIS_DAY`), skips those cells in placement loops, and applies the same notion to **`INCLUDE_ONLY`**: **CUSTOM** `allowedCells` and **PRESET_LAST_LESSON** matches only count when the underlying period slot is active that day (unknown slot numbers in `allowedCells` never match).

**Non-teaching rows:** `canPlaceAssignment` requires a matching `periodSlots` row for the target `slotNumber` with `slotType === "LESSON"` (or unset `slotType` for legacy rows). Rows typed **`BREAK`** or **`LUNCH`** never accept lesson placements (`NON_LESSON_SLOT` in rejection stats). Main placement loops still iterate only **`lessonSlots`** (`slotType === "LESSON"`).

Core sequence:

1. Normalize slot metadata (morning/after-lunch/boundaries).
2. **Pre-seed division+subject teacher locks** when **`teacherSubjects`** names exactly one teacher for that pair (avoids the first greedy placement locking the wrong teacher).
3. Place fixed slots where possible (respecting inactive slots per day and non-lesson slot guard).
4. Class-teacher first-period placements when enabled.
5. Main greedy placement: iterate divisions and subjects by priority; for each needed period, **`findEligibleTeacher`** prefers **division specialists** (`assignedDivisionIds` of length 1 for that class) before generalists when there is no explicit `teacherSubjects` list.
6. **BEST_FIT** / **OPTIMAL** soft passes (relax day/slot excludes only) when those modes are selected.
7. **Lock repair (up to two rounds):** any **(division, subject)** still short on weekly periods has its existing lessons for that pair removed, the per-pair lock cleared, and gap fill retried—reduces “wrong first teacher” deadlocks. Stats: `report.lockRepair`.
8. Fill remaining unassigned lesson slots with `isFreePeriod`.
9. Compute unscheduled requirements and score.

This remains **heuristic**, not CP-SAT global optimization; see `planning/global-optimal-solver/` for a future solver path.

**Scheduling rules vs optimization:** The engine is **constraint-satisfying and greedy**, not a global optimizer. **`STRICT`** never relaxes placement preferences. In **`BEST_FIT`** / **`OPTIMAL`**, only **day/slot exclusion** rules (`EXCLUDE_DAY`, `EXCLUDE_SLOT`, and legacy `NOT_*` / `BOTH_BOUNDARY`) are skipped when `ignoreSoftRules` is set during the extra search passes; **`INCLUDE_ONLY`**, inactive period days, teacher/division locks, continuity caps, free-period rules, and weekly/daily subject limits stay **hard** in every pass. **`OPTIMAL`** runs more rotated passes than **`BEST_FIT`** to improve fill rate, not to prove optimality.

**Rule activity:** Exclude rules treat `isActive` as **on** when the field is missing (`isActive !== false`), matching **`INCLUDE_ONLY`** and migrated tenant state.

**API-only inputs:** **`fixedSlots`** is honored by the engine if present in generate payload; there is no Rules UI for it yet. **`dailyPrimaryMinPeriods`** on class-teacher preferences is stored and validated in state but **not** applied by placement (first-period placement for class teachers is the supported preference block).

### Solver selection (`TIMETABLE_SOLVER`)

- **`legacy`** (default): synchronous `runTimetableEngine` in the API process.
- **`experimental`**: runs scheduling inside a **worker thread** with **`TIMETABLE_SOLVER_TIMEOUT_MS`** (default 30s, capped at 300s). Current prototype (`server/engineExperimental.js`) still delegates to the greedy engine so behavior matches legacy; this path exists for **timeout / isolation / future CP-SAT** integration. On timeout or worker failure, the runner **re-runs legacy** in-process and sets `report.solver.fallbackReason`.

**Global optimality:** Even **`OPTIMAL`** scheduling mode is only extra greedy passes (see above). True global optimization (e.g. CP-SAT) would need problem-size limits, time budgets, and a separate model layer—follow-ups after the experimental hook is stable.

## In-app timetable vs live tenant state

- Each run persists **`state_json`** on `timetable_runs` (returned to the client as **`timetable.sourceState`** on generate and `GET /timetable/latest`).
- The **Timetable** page grid reads **`sourceState.periodSlots`** and **`sourceState.workingDays`** when available so column headers and inactive-slot shading match the slot numbers stored in **`entries`**. Live `tenant_state` period edits apply after the next generate.
- **Reports** already preferred `sourceState` for report math; shortage/unscheduled labels use the same snapshot lists via `src/features/shared/idLookups.js` so division/standard names stay aligned with `report.unscheduled` ids.

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


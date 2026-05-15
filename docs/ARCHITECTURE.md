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
| Placement preferences (`schedulingRules`) | Stronger parity in `cp_sat` | `EXCLUDE_DAY` / `EXCLUDE_SLOT` (incl. migrated `NOT_*`), **`INCLUDE_ONLY`**, inactive **`activeWeekdays`**, **`freePeriodRules`**, **`fixedSlots`**, **`maxPerDay`** per division+subject, **teacher daily / morning / evening / weekly caps** (`freeMorningPeriods` / `freeEveningPeriods` / `maxPerDay` / `maxPerWeek`), **per-division+subject single teacher** (greedy lock parity), **continuity** (`maxContinuousSameSubjectPerDivision`, `maxContinuousAnySubjectPerDivision`), **cross-division continuity** (at most one division per teacher per day with adjacent same-teacher lessons). Soft day/slot rules relax when **`options.softRuleMode`** is `MATCH_LEGACY_BEST_FIT_OR_OPTIMAL` or **`classTeacherPreferences.schedulingMode`** is `BEST_FIT` / `OPTIMAL` (legacy-style). |
| Class teacher: first-period days | Yes | Only when **`classTeacherPreferences.enabled === true`** (explicit toggle). |
| Class teacher: `dailyPrimaryMinPeriods` | No (stored only) | Validated in tenant state; engine does not place to satisfy it yet. |
| `fixedSlots` | Yes if present in payload | No first-party UI; API/B2B can supply rows. UI “fixed placement” uses **`INCLUDE_ONLY`** rules instead. |
| `TIMETABLE_SOLVER` | Routing only | **`legacy`** (default): `runTimetableEngine` in-process. **`experimental`**: worker + timeout; delegates to greedy (`server/engineExperimental.js`). **`cp_sat`**: worker calls Python OR-Tools sidecar at **`CP_SAT_SOLVER_URL`** when set; honors **`CP_SAT_MAX_DECISION_VARS`** guard; on missing URL, size cap, transport/solve failure, or infeasible adapter rejection, **fallback** runs legacy in-process (`report.solver.fallbackReason`). **`hybrid`**: same CP-SAT pipeline and preflight as **`cp_sat`**, then **always** runs legacy if CP-SAT does not produce the final result; `report.solver.applied` is **`cp_sat`** when the sidecar wins, else **`legacy`** (with `report.solver.hybridStage` for diagnostics). |

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

This remains **heuristic** for the greedy path; the optional **`cp_sat`** sidecar uses OR-Tools on a model aligned with the same hard rules as `canPlaceAssignment` / `canAssignTeacherForSlot` where linearized (see the table above and `solver/cpsat/service.py`).

**Scheduling rules vs optimization:** The engine is **constraint-satisfying and greedy**, not a global optimizer. **`STRICT`** never relaxes placement preferences. In **`BEST_FIT`** / **`OPTIMAL`**, only **day/slot exclusion** rules (`EXCLUDE_DAY`, `EXCLUDE_SLOT`, and legacy `NOT_*` / `BOTH_BOUNDARY`) are skipped when `ignoreSoftRules` is set during the extra search passes; **`INCLUDE_ONLY`**, inactive period days, teacher/division locks, continuity caps, free-period rules, and weekly/daily subject limits stay **hard** in every pass. **`OPTIMAL`** runs more rotated passes than **`BEST_FIT`** to improve fill rate, not to prove optimality.

**Rule activity:** Exclude rules treat `isActive` as **on** when the field is missing (`isActive !== false`), matching **`INCLUDE_ONLY`** and migrated tenant state.

**API-only inputs:** **`fixedSlots`** is honored by the engine if present in generate payload; there is no Rules UI for it yet. **`dailyPrimaryMinPeriods`** on class-teacher preferences is stored and validated in state but **not** applied by placement (first-period placement for class teachers is the supported preference block).

### Solver selection (`TIMETABLE_SOLVER`)

- **`legacy`** (default): synchronous `runTimetableEngine` in the API process.
- **`experimental`**: runs scheduling inside a **worker thread** with **`TIMETABLE_SOLVER_TIMEOUT_MS`** (default 30s, capped at 300s). Current prototype (`server/engineExperimental.js`) still delegates to the greedy engine so behavior matches legacy; this path exists for **timeout / isolation** plumbing. On timeout or worker failure, the runner **re-runs legacy** in-process and sets `report.solver.fallbackReason`.
- **`cp_sat`**: same worker + timeout wiring, but the worker calls **`server/engineCpsat.js`**, which POSTs a versioned JSON payload to **`CP_SAT_SOLVER_URL`** (Python entry: `solver/cpsat/service.py`, contract in `planning/global-optimal-solver/JSON_CONTRACT.md`). The sidecar minimizes a **secondary** linear proxy for teacher day fragmentation (adjacent occupied lesson-slot churn) while keeping **full weekly demand** as hard constraints; `report.cpsat.demandSummary` / `report.cpsat.objectives` summarize demand weights and penalties. If the URL is unset, estimated model size exceeds **`CP_SAT_MAX_DECISION_VARS`**, the HTTP call fails, or the response is not adapter-valid, the runner **falls back to legacy** with a recorded reason. After a successful adapter pass, **`validateTimetableRun`** runs on the filled grid; ERROR-level findings trigger legacy fallback when **`CP_SAT_FALLBACK_ON_VALIDATION`** is true (default). Optional **`CP_SAT_SOLVER_SECRET`** is sent as a Bearer token.
- **`hybrid`**: **sequential hybrid** — identical CP-SAT attempt, preflight, timeout, validation, and fallback reasons as **`cp_sat`**, but the product intent is “try global solve first, still ship a greedy timetable when CP-SAT cannot.” `report.solver.requested` stays **`hybrid`**; `report.solver.applied` is **`cp_sat`** or **`legacy`**. When **`hybrid`** is selected, `report.solver.hybridStage` is set to **`cp_sat`** (sidecar result used), **`legacy_preflight`** (URL missing or size cap skipped the worker), or **`legacy_fallback`** (worker or post-solve validation failed and legacy ran).

**Global optimality:** The CP-SAT path searches within **`options.timeLimitSec`**; **`OPTIMAL`** status from OR-Tools means proven optimal for the encoded model, not that every SchoolTime soft rule is modeled. The greedy **`OPTIMAL`** scheduling mode remains extra passes only (see above).

**Sidecar:** Install with `pip install -r solver/cpsat/requirements.txt`, run `npm run solver:cpsat` (or `python solver/cpsat/service.py [port]`), set `CP_SAT_SOLVER_URL` and `TIMETABLE_SOLVER=cp_sat` or **`hybrid`**.

**Create page (web):** The app sends optional **`timetableSolver`** on each `POST /timetable/generate` (pill selector on Create). It overrides **`TIMETABLE_SOLVER` for that request only**; timeouts and sidecar URL still come from env. `report.solver.timetableSolverSource` is **`request`** or **`env`**.

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


# JSON contract — Node API ↔ solver service (proposed)

This document defines a **versioned** JSON contract between the Node process (SchoolTime API, ultimately via `server/timetableSolverRunner.js` and optionally `server/workers/timetableEngineWorker.mjs`) and a **solver sidecar** (recommended: Python OR-Tools CP-SAT). Bump **`contractVersion`** on any breaking change to required fields or semantics.

---

## Design principles

- **Stateless solver:** the request contains a full **normalized tenant snapshot**; the solver does not query SQLite.
- **Deterministic defaults:** every optional field has a documented default identical in Node and solver reference implementation.
- **Resilience:** on transport error, non-`FEASIBLE` status, or malformed body, Node continues to use **legacy fallback** as in `server/timetableSolverRunner.js`.
- **`entries` compatibility:** response lessons must match shapes consumed by the React grid and export pipeline (see `server/engine.js` return value).

---

## Envelope (request and response)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `contractVersion` | string | yes | Semver string, for example `"1.0.0"`. |
| `schema` | string | optional | Discriminator, for example `"schooltime.timetable.solve.v1"`. |

---

## Request: `SolveRequest`

### Top-level fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `contractVersion` | string | yes | Highest version the Node client implements. |
| `requestId` | string | yes | Correlation id (UUID) for logs. |
| `orgId` | string | recommended | Tenant id; never include secrets. |
| `snapshotAt` | string (ISO-8601) | recommended | When tenant JSON was captured. |
| `options` | object | yes | Time limits, objectives, flags. |
| `tenant` | object | yes | School data (see below). |

### `options`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `timeLimitSec` | number | derived from `TIMETABLE_SOLVER_TIMEOUT_MS` in `server/config/env.js` | Internal solver search limit (should be slightly below Node’s worker timeout). |
| `proveOptimality` | boolean | `false` | If `true`, allow solver to strive for proof within `timeLimitSec`. |
| `randomSeed` | integer | `1` | Reproducibility for tests. |
| `objectiveProfile` | string | `"MAX_SCHEDULED_THEN_MIN_SOFT"` | Named profile (extend enum in minor contract bumps). |
| `lexicographic` | string[] | optional | Ordered objective names when profile is `"LEXICOGRAPHIC"`. |
| `softRuleMode` | string | `"MATCH_LEGACY_STRICT"` | One of: `MATCH_LEGACY_STRICT`, `MATCH_LEGACY_BEST_FIT_OR_OPTIMAL`, `ALL_HARD` (see [CONSTRAINT_MAP.md](./CONSTRAINT_MAP.md)). |
| `emitInfeasibilityHints` | boolean | `false` | If true, populate `infeasibility` on `INFEASIBLE` when supported (IIS / tagged constraints). |
| `maxResponseEntries` | number | optional | Safety cap for response size during pilot. |

### `tenant` (minimum required shapes)

Align field names with **`runTimetableEngine`** input in `server/engine.js` (notably `schedulingRules`, not `rules`):

| Field | Type | Description |
|-------|------|-------------|
| `workingDays` | string[] | Canonical weekday codes. |
| `periodSlots` | object[] | `slotNumber`, `slotType`, optional `label`, optional `activeWeekdays`. |
| `divisions` | object[] | Includes `id`, `standardId`, `mediumId`, display `name`. |
| `subjects` | object[] | Includes `id`, `priorityWeight`, applicability arrays, default limits. |
| `teachers` | object[] | Includes ids, `subjectIds`, `mediumIds`, capacity fields, continuity integers, `classTeacherDivisionIds`, `primaryClassTeacherDivisionId`, `primarySubjectId`, etc. |
| `teacherSubjects` | array | Optional explicit teacher–subject (and optional division) assignments. |
| `subjectAllocations` | array | Per division/subject weekly requirements and caps. |
| `schedulingRules` | array | Objects with `ruleType`, `isActive`, `subjectId`, division scoping, INCLUDE_ONLY payloads. |
| `fixedSlots` | array | `{ divisionId, dayOfWeek, slotNumber, subjectId }` pre-placements. |
| `freePeriodRules` | array | Teacher reserved free cells. |
| `classTeacherPreferences` | object | Same structure as consumed in `server/engine.js` (see `shared/classTeacherPreferences.js`). |
| `standards` | array | optional if needed for reporting; ordering helper uses them. |

**Normalization:** Node should call the same migration path used before generate today (for example `migrateTenantState` where applicable) so `schedulingRules` and `allowedCells` cannot reference inactive slot–day pairs (see `server/services/tenantStateMigration.js`).

---

## Response: `SolveResponse`

### Top-level fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `contractVersion` | string | yes | Contract used to encode the response. |
| `requestId` | string | yes | Echo. |
| `solverStatus` | string | yes | One of: `OPTIMAL`, `FEASIBLE`, `PARTIAL`, `INFEASIBLE`, `ERROR` (definitions below). |
| `timing` | object | yes | Wall-clock and optional phase timings. |
| `entries` | array | conditional | Full grid rows for **FEASIBLE** / **OPTIMAL**; may be partial for **PARTIAL** (Node should normally reject or fall back). |
| `report` | object | yes | Augments engine-style report (`totalRequired`, `totalScheduled`, `unscheduled`, etc.). |
| `infeasibility` | object | optional | Structured hints when `solverStatus` is `INFEASIBLE`. |
| `warnings` | string[] | optional | Non-fatal notices (near timeout, symmetry-breaking skipped). |

### `solverStatus` definitions

| Value | Meaning |
|-------|---------|
| `OPTIMAL` | Best possible value for the primary objective proven within limits (rare in production). |
| `FEASIBLE` | All hard constraints satisfied; solution is **complete** (every division × active lesson cell has a row or explicit free/break handling per contract). |
| `PARTIAL` | Stopped early; may violate completeness—Node should **not** persist without policy. |
| `INFEASIBLE` | No assignment satisfies hard constraints. |
| `ERROR` | Solver failure; Node falls back to legacy. |

### `timing` object

| Field | Type | Description |
|-------|------|-------------|
| `wallMs` | number | Total time inside solver process for this request. |
| `modelBuildMs` | number | optional |
| `solveMs` | number | optional |

### `entries[]` element (lesson example)

```json
{
  "divisionId": "div-1",
  "teacherId": "t-1",
  "subjectId": "s-1",
  "dayOfWeek": "MONDAY",
  "slotNumber": 1,
  "isDouble": false,
  "isFreePeriod": false,
  "slotType": "LESSON"
}
```

Non-lesson and free rows must follow the same conventions as `server/engine.js` (including `label` where used).

### `report` extensions

Preserve compatibility with existing clients by nesting new fields:

```json
{
  "totalRequired": 120,
  "totalScheduled": 118,
  "unscheduled": [],
  "rejections": {},
  "solver": {
    "requested": "experimental",
    "applied": "experimental",
    "timeoutMs": 30000,
    "workerUsed": true,
    "fallbackReason": null
  },
  "cpsat": {
    "orToolsVersion": "9.x",
    "objectiveValue": -42,
    "bestBound": -43,
    "solutionCount": 3
  }
}
```

### `infeasibility` object (when hints requested)

| Field | Type | Description |
|-------|------|-------------|
| `summary` | string | Short human-readable explanation. |
| `codes` | string[] | Stable machine codes, for example `INCLUDE_ONLY_EMPTY_INTERSECTION`. |
| `constraintTags` | string[] | Optional references to `schedulingRules` ids or synthetic tags. |
| `iis` | object | Optional OR-Tools IIS payload mapped to tags. |

---

## Example request (minimal illustrative)

```json
{
  "contractVersion": "1.0.0",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "orgId": "org-123",
  "snapshotAt": "2026-05-14T12:00:00.000Z",
  "options": {
    "timeLimitSec": 45,
    "proveOptimality": false,
    "randomSeed": 42,
    "objectiveProfile": "LEXICOGRAPHIC",
    "lexicographic": ["MAX_TOTAL_SCHEDULED", "MIN_TEACHER_PEAK_DAY_LOAD"],
    "softRuleMode": "MATCH_LEGACY_STRICT",
    "emitInfeasibilityHints": true
  },
  "tenant": {
    "workingDays": ["MONDAY", "TUESDAY"],
    "periodSlots": [],
    "divisions": [],
    "subjects": [],
    "teachers": [],
    "teacherSubjects": [],
    "subjectAllocations": [],
    "schedulingRules": [],
    "fixedSlots": [],
    "freePeriodRules": [],
    "classTeacherPreferences": { "enabled": false }
  }
}
```

---

## Example responses

### Feasible incumbent

```json
{
  "contractVersion": "1.0.0",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "solverStatus": "FEASIBLE",
  "timing": { "wallMs": 1200 },
  "entries": [],
  "report": {
    "totalRequired": 40,
    "totalScheduled": 40,
    "unscheduled": [],
    "cpsat": { "objectiveValue": 0 }
  }
}
```

### Infeasible with hints

```json
{
  "contractVersion": "1.0.0",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "solverStatus": "INFEASIBLE",
  "timing": { "wallMs": 800 },
  "entries": [],
  "report": { "totalRequired": 40, "totalScheduled": 0, "unscheduled": [] },
  "infeasibility": {
    "summary": "No cell satisfies all INCLUDE_ONLY rules for subject S in division D.",
    "codes": ["INCLUDE_ONLY_OVERCONSTRAINED"],
    "constraintTags": ["rule:include-only:S:D:1"]
  }
}
```

---

## Transport and security

- **Recommended:** HTTP `POST` to a localhost sidecar from the worker thread, or a subprocess with **JSON on stdin / stdout** for dev simplicity.
- **Production:** authenticate sidecar (shared secret or mTLS); never expose without network isolation.
- **Timeouts:** align with `getTimetableSolverRuntime()`; worker already maps overrun to legacy (`server/timetableSolverRunner.js`).

---

## Versioning policy

- **Patch** (`1.0.x`): optional fields only; same semantics.
- **Minor** (`1.x.0`): new objective profiles or optional tenant fields.
- **Major** (`x.0.0`): changed meaning of `entries`, renamed required tenant fields, or new `solverStatus` values.

---

## Size caps (implementation guidance)

Node should reject or route to legacy before calling the solver when:

- The count of potential **lesson decision variables** (roughly: sum over divisions of required weekly periods × eligible teacher set × active cells) exceeds a configured threshold.
- Memory estimate for boolean arrays exceeds safe limits for the deployment tier.

Exact numbers belong in service config, not this doc.

# JSON contract — Node ↔ global solver service

Version: **1.0.0-draft** (bump `contractVersion` on any breaking field change).

## Principles

- Solver is **stateless**: full problem in one request; response contains full solution or error.
- Node remains **source of truth** for auth, quotas, and persistence; solver returns **`entries`-compatible** assignments only.
- **Oversize** requests are rejected by Node before spawn (caps configurable).

---

## Request (Node → solver)

```json
{
  "contractVersion": "1.0.0",
  "options": {
    "timeLimitSec": 60,
    "objective": "MAXIMIZE_SCHEDULED_WEIGHT",
    "lexicographic": ["MAX_SCHEDULED", "MIN_TEACHER_MAX_LOAD"],
    "proveOptimality": false,
    "randomSeed": 42
  },
  "tenant": {
    "workingDays": ["MONDAY", "TUESDAY"],
    "periodSlots": [],
    "divisions": [],
    "subjects": [],
    "teachers": [],
    "schedulingRules": [],
    "classTeacherPreferences": {},
    "teacherSubjects": [],
    "freePeriodRules": [],
    "fixedSlots": [],
    "subjectAllocations": []
  }
}
```

- **`tenant`** should match the **normalized** payload already passed to `runTimetableEngine` today (same shapes as `server/services/common.js` tenant validation where applicable).
- **`options.proveOptimality`:** if true, solver may run past first feasible until proof or time limit (usually false in prod).

---

## Response (solver → Node)

### Success (feasible incumbent or optimal)

```json
{
  "contractVersion": "1.0.0",
  "status": "FEASIBLE",
  "optimality": "INCUMBENT",
  "solveTimeMs": 1234,
  "entries": [
    {
      "divisionId": "…",
      "teacherId": "…",
      "subjectId": "…",
      "dayOfWeek": "MONDAY",
      "slotNumber": 1,
      "isDouble": false,
      "isFreePeriod": false,
      "slotType": "LESSON"
    }
  ],
  "report": {
    "solver": { "id": "cp_sat", "version": "0.1.0" },
    "objectiveValue": 0,
    "gap": null
  }
}
```

- Node fills **free periods** and **break/lunch rows** exactly as legacy does today if solver returns only lesson placements; prefer documenting one approach and testing it.

### Infeasible

```json
{
  "contractVersion": "1.0.0",
  "status": "INFEASIBLE",
  "solveTimeMs": 500,
  "reasonCodes": ["INCLUDE_ONLY_EMPTY", "TEACHER_CAPACITY"],
  "hint": "Human readable summary if available",
  "iis": {
    "constraintTags": ["INCLUDE_ONLY:sub1:div2", "MAX_WEEKLY:sub1:div2"]
  }
}
```

### Error (crash, timeout inside solver)

```json
{
  "contractVersion": "1.0.0",
  "status": "ERROR",
  "message": "…"
}
```

Node must treat non-`FEASIBLE` as **fallback to legacy** unless product explicitly surfaces failure.

---

## Transport

- Recommended: **HTTP POST** from Node to sidecar on private network, or **stdio** JSON lines for local dev.
- **mTLS** or shared secret header in production.

---

## Size caps (suggested defaults, tune with profiling)

- Max `entries` domain size: `divisions.length * lessonCellsPerWeek`; reject if over threshold.
- Max teachers × subjects cross product for explicit pairing tables.

# Testing and rollout — global optimal solver

This document complements [PROCEDURE.md](./PROCEDURE.md) with **test strategy**, **observability**, **feature flags**, and **customer communication**. It assumes the solver integrates through existing seams (`TIMETABLE_SOLVER`, `server/timetableSolverRunner.js`, `server/workers/timetableEngineWorker.mjs`) and uses the [JSON_CONTRACT.md](./JSON_CONTRACT.md) wire format.

---

## Fixture strategy

**Goals**

- Small, hand-editable JSON fixtures under `tests/fixtures/timetable-solver/` (path to be created during implementation) that represent **tenant snapshots** after migration.
- Each fixture includes: `meta.json` (expected outcomes, tags), `tenant.json` (input), optional `expected-entries.json` for golden compares.

**Fixture categories**

| Category | Purpose | Example scenario |
|----------|---------|------------------|
| **Smoke** | Solver starts and returns `FEASIBLE` under 1s | Two divisions, two teachers, no rules. |
| **Rule parity** | One rule type in isolation | Single `INCLUDE_ONLY` CUSTOM with two allowed cells. |
| **Inactive slots** | `activeWeekdays` pruning | Slot inactive on Friday; ensure no lesson on that cell (align `shared/periodSlotDays.js`). |
| **Capacity** | Teacher max per day/week | Forces reassignment or infeasibility. |
| **Continuity** | Streak limits | `maxContinuousSameSubjectPerDivision` at boundary. |
| **Cross-division** | Same teacher, two divisions | `CROSS_DIVISION_CONTINUITY_DAY` style conflict. |
| **Regression** | Mirrors bugs filed with anonymized data | One fixture per historic ticket id. |

**Fixture hygiene**

- Strip PII; use synthetic names.
- Version fixtures alongside `contractVersion` so CI fails loudly when the contract bumps.

---

## Parity tests

**Definition**

- **Structural parity:** same `totalRequired`, `totalScheduled`, and same set of `(divisionId, subjectId)` unscheduled counts for equivalent inputs when both solvers return complete schedules.
- **Exact parity** (lesson-by-lesson match with greedy) is **not** required unless explicitly promised; greedy is not unique.

**Tests to add (when solver exists)**

- **Dual run:** for selected fixtures, run legacy (`runTimetableEngine` from `server/engine.js`) and CP-SAT; assert both **FEASIBLE** or both **infeasible** where feasibility is decidable by a reference checker.
- **Constraint checker:** independent validator that takes `entries` + tenant and asserts all **hard** rules from [CONSTRAINT_MAP.md](./CONSTRAINT_MAP.md); use for CP-SAT output and optionally for legacy in CI.

**Existing harness**

- Extend patterns in `tests/backend/timetable-solver-runner.test.mjs` (timeout and fallback behavior).
- Keep `npm run test:backend:engine` green; that script already bundles engine and solver-runner tests per `package.json`.

---

## Load and size tests

- **Synthetic scaling:** scripts generate tenants at 10 / 50 / 100 divisions with proportional teachers and subjects; measure wall time and memory of the sidecar process.
- **Timeout behavior:** verify Node receives partial responses only when explicitly allowed; otherwise solver should return `ERROR` or `INFEASIBLE`, not hang.
- **Concurrency:** N parallel generates (different org ids) against one sidecar instance to find saturation point.

Document SLOs (for example: p95 under 20s for “medium” profile) before pilot.

---

## Observability

**Logs (structured)**

- `requestId`, `orgId`, `contractVersion`, `solverStatus`, `wallMs`, `fallbackReason` (from `report.solver` when applicable).
- Counts: divisions, teachers, subjects, `lessonSlots.length`, `schedulingRules.length`.
- Never log full tenant payloads in production unless scrubbed.

**Metrics**

- Counters: `solver_invocations_total`, `solver_feasible_total`, `solver_infeasible_total`, `solver_timeout_total`, `solver_fallback_total`.
- Histograms: `solver_wall_ms`, `generate_end_to_end_ms`.
- Gauges: sidecar queue depth if using a pool.

**Tracing**

- Propagate `requestId` from API handler through worker into sidecar HTTP headers for cross-service correlation.

---

## Feature flags and default-off behavior

- **Default remains `TIMETABLE_SOLVER=legacy`** until product explicitly changes README guidance (`server/config/env.js` defaults).
- **Experimental path stays non-default:** opt-in via env for whole deployment; finer control via **org allowlist** (implementation-specific) for pilot.
- **Kill switch:** operators can force legacy without redeploying solver artifacts (env only).

**Behavior matrix**

| Config | Expected behavior |
|--------|-------------------|
| `legacy` | In-process `runTimetableEngine`; no sidecar. |
| `experimental` + healthy sidecar | Worker/solver path; complete `FEASIBLE` result merged into `report.solver`. |
| `experimental` + timeout/error | Fallback legacy in `server/timetableSolverRunner.js` with `fallbackReason` populated. |

---

## Customer communication

- Use plain language: the system **searches for a high-quality timetable within a time limit**; it is not a guarantee of global optimality unless `proveOptimality` is true **and** the run completes with `OPTIMAL` (rare at scale).
- Explain **fallback:** “If the advanced solver cannot finish in time, SchoolTime uses the standard scheduler so you still get a timetable.”
- For **infeasible** setups, pair technical `codes` with actionable UI text (for example: “Two INCLUDE_ONLY rules leave no valid cell for Maths in 7A—edit rules or free a period.”).

---

## Rollout checklist (condensed)

1. **Internal dev** — sidecar on localhost; contract tests only.
2. **CI** — Docker image with ortools; nightly load job optional.
3. **Staging** — shadow or opt-in flag; compare metrics to legacy.
4. **Pilot** — written school agreement; support runbook.
5. **GA opt-in** — UI or org setting; docs updated in repo manual docs.
6. **Consider default flip** — only with sustained metrics and legal/comms review.

---

## Rollback

- Set `TIMETABLE_SOLVER=legacy` and restart API processes.
- Disable org feature flag if used.
- No DB rollback needed if only `entries_json` schema unchanged; if new columns were added for solver metadata, follow additive migration rollback policy.

---

## Documentation touchpoints (when implementing)

Update **manual** docs only (not `docs/AUTO_*` by hand): `README.md`, `docs/ARCHITECTURE.md`, `docs/API.md` for any new `report` fields. Regenerate auto docs via `npm run docs:auto` after code stabilizes.

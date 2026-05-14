# Testing and rollout — global solver

## Automated tests

| Layer | What to test |
|-------|----------------|
| **Unit** | Constraint map helpers: inactive day, INCLUDE_ONLY mask, teacher eligibility. |
| **Contract** | Request/response JSON Schema validation; unknown `contractVersion` rejected. |
| **Parity** | Small fixtures where greedy and CP-SAT must agree on feasibility and count. |
| **Regression** | Existing `npm run test:backend:engine` stays green; add `tests/backend/cp-sat-fixtures.test.mjs` when stub exists. |
| **Integration** | Docker compose: API + solver sidecar; one generate call with `TIMETABLE_SOLVER=cp_sat` (opt-in). |

## Load and limits

- Benchmark p50/p95 solve time vs `divisions × subjects × lessonSlots × workingDays`.
- Enforce **hard timeout** in Node (already pattern in `getTimetableSolverRuntime`); solver should honor same budget internally.

## Observability

- Structured logs: `solver_mode`, `contractVersion`, `status`, `solveTimeMs`, `entryCount`, `unscheduledCount` (no raw student names if multi-tenant logs aggregate).
- Metrics: fallback rate, timeout rate, infeasible rate.

## Rollout stages

1. **Dev only** — solver behind env; no customer data leaves dev machine unless allowed.
2. **Staging** — real-size anonymized snapshots.
3. **Shadow** — production traffic runs legacy only; async shadow compares counts (optional).
4. **Pilot opt-in** — named schools; support channel.
5. **GA opt-in** — UI toggle or org feature flag.
6. **Default change** — only after sustained SLO and executive sign-off.

## Customer communication

- Clarify: **“Optimizes within time limit”** not “mathematically perfect forever”.
- Explain unscheduled vs infeasible vs timeout fallback.

## Rollback

- Env flip to legacy; redeploy; no DB migration rollback for solver-only releases if `entries_json` schema unchanged.

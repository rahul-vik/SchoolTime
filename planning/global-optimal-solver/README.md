# Global optimal timetable solver — planning pack

This folder holds **design and delivery planning** for a future **global optimal** (or near-optimal) timetable solver for SchoolTime. It is intentionally separate from generated documentation under `docs/AUTO_*` and from product runtime code.

## Purpose

SchoolTime today schedules timetables with a **greedy, constraint-satisfying** engine in `server/engine.js`. The README and architecture docs describe this honestly as **not** a proven global optimum. This planning pack describes how a team could later add a **constraint programming** style solver (recommended: **OR-Tools CP-SAT** behind a **versioned JSON contract**) while reusing existing integration seams: `TIMETABLE_SOLVER`, `server/timetableSolverRunner.js`, the worker at `server/workers/timetableEngineWorker.mjs`, and legacy fallback.

The goal is to give an implementer enough context to estimate work, sequence delivery, and avoid silent mismatches with exports, validation, and UI expectations.

## Document index

| Document | Contents |
|----------|----------|
| [PROCEDURE.md](./PROCEDURE.md) | Phased delivery (objectives through GA), exit criteria, risks, integration with current solver routing. |
| [CONSTRAINT_MAP.md](./CONSTRAINT_MAP.md) | Each scheduling input mapped to hard/soft, relaxation, modeling difficulty, and notes tied to `server/engine.js`. |
| [JSON_CONTRACT.md](./JSON_CONTRACT.md) | Versioned request/response JSON between Node and a solver sidecar service. |
| [TESTING_AND_ROLLOUT.md](./TESTING_AND_ROLLOUT.md) | Fixtures, parity, load, observability, flags, customer messaging. |
| [OPEN_QUESTIONS.md](./OPEN_QUESTIONS.md) | Decisions still open before implementation. |

## When you are ready — team trigger phrase

Use this phrase in planning or stand-ups so everyone aligns on scope and sequencing:

> **“We are ready to implement the global optimal solver when objectives are signed off, the constraint map is frozen for v1, the JSON contract v1 is approved, and we have a default-off flag path with legacy fallback verified in CI.”**

## Quick glossary

- **CP-SAT** — *Constraint Programming / SAT hybrid* in Google OR-Tools: a finite-domain constraint solver that searches for feasible or optimal assignments using propagators and lazy clause generation. Typical for employee/student timetabling at modest scale with rich boolean and integer constraints.

- **Incumbent** — The **best feasible solution found so far** during search (may not be optimal until the solver proves optimality or stops on time limit).

- **IIS** — *Irreducible Inconsistent Subsystem*: a **minimal subset of constraints** that are jointly infeasible. Useful for explaining “why no timetable” to power users or support without dumping the whole model.

- **Lexicographic optimization** — Optimizing **multiple objectives in strict priority order**: first maximize (or minimize) objective A; among ties or after hitting a target, optimize B; then C. Avoids hand-tuning a single weighted sum when stakeholders disagree on trade-offs.

## Related code paths (verified in this repo)

- Greedy engine and constraint checks: `server/engine.js`
- Period-slot weekday activity helper: `shared/periodSlotDays.js` (must stay aligned with engine, exports, validation, migration)
- Solver env and timeout: `server/config/env.js` (`getTimetableSolverRuntime`)
- Runner (legacy vs experimental worker + fallback): `server/timetableSolverRunner.js`
- Worker entry: `server/workers/timetableEngineWorker.mjs` → `server/engineExperimental.js`
- Tenant normalization that prunes impossible rules vs inactive slots: `server/services/tenantStateMigration.js`

Do **not** hand-edit `docs/AUTO_CHANGELOG.md` or `docs/AUTO_RULES_INTELLIGENCE.md`; regenerate with `npm run docs:auto` when the product changes, per project governance.

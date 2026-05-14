# Phased procedure — global optimal timetable solver

This procedure assumes **default production behavior stays on the legacy greedy engine** until a CP-SAT (or equivalent) path is proven safe behind flags, timeouts, and automated tests.

---

## Phase 0 — Objectives and scope freeze

**Goals:** Define what “optimal” means for SchoolTime v1 of the solver.

**Deliverables:**

- Written objective hierarchy (lexicographic or weighted sum) agreed by product and at least one school pilot contact.
- Explicit **non-goals** (for example: “no sports block rotation in v1”).
- Maximum acceptable solve time per tenant size tier.

**Exit criteria:** Sign-off document linked from `README.md` in this folder or from internal wiki.

**Risks:** Scope creep (multi-objective + preferences + fairness); mitigate with v1 hard cap on features modeled.

---

## Phase 1 — Constraint inventory and parity baseline

**Goals:** Every input that affects generation is listed and classified.

**Deliverables:**

- Completed `CONSTRAINT_MAP.md` reviewed against `server/engine.js` and `server/services/timetableValidationService.js`.
- Golden **fixtures** (small JSON payloads) representing: minimal school, INCLUDE_ONLY, inactive period weekdays, teacher lock, BEST_FIT relaxation (document expected difference vs strict).

**Exit criteria:** No “unknown” row in the constraint map for inputs exposed in Settings or API.

**Risks:** Hidden coupling with `migrateTenantState`; run migration on fixtures before solving.

---

## Phase 2 — JSON contract v1 and sidecar skeleton

**Goals:** Stable wire format between Node and solver process.

**Deliverables:**

- Frozen `JSON_CONTRACT.md` v1 fields and versioning rules.
- Stub HTTP or stdio service (recommended: **Python + OR-Tools**) that echoes `contractVersion`, returns empty or trivial feasible solution for smoke tests only.

**Exit criteria:** Node can call stub with tenant snapshot; response validates against schema; **no change** to default `TIMETABLE_SOLVER=legacy` behavior.

**Risks:** Contract drift; mitigate with JSON Schema or zod shared tests and contract version bumps.

---

## Phase 3 — Model builder (read-only integration)

**Goals:** Map normalized tenant state to CP-SAT variables and hard constraints for a **subset** of rules (start with: divisions, subjects, teachers, lesson grid, weekly counts, max per day, no double booking, inactive slots, INCLUDE_ONLY).

**Deliverables:**

- Documented variable layout and constraint count estimates per fixture.
- Solver returns **feasible** incumbent for all Phase 3 fixtures or returns structured infeasibility.

**Exit criteria:** Parity tests: for small deterministic cases, CP-SAT schedule matches greedy when both feasible, or CP-SAT finds placement greedy missed.

**Risks:** Model too large; add caps in `JSON_CONTRACT` options and reject early with clear error.

---

## Phase 4 — Remaining constraints and soft objectives

**Goals:** Add continuity, free periods, class-teacher (either modeled or pre-pass), fixedSlots, explicit teacherSubjects, exclusions.

**Deliverables:**

- Updated constraint map with “implemented in model” checkboxes.
- Soft penalties (preference violations) if product requires relaxing some user prefs.

**Exit criteria:** Full engine constraint set either modeled or explicitly delegated to pre/post-processing with tests.

**Risks:** Class-teacher and continuity explode model size; consider **pre-placement** in Node then fix variables in CP-SAT.

---

## Phase 5 — Integration in SchoolTime API

**Goals:** Production-safe routing.

**Deliverables:**

- New `TIMETABLE_SOLVER` value (for example `cp_sat`) or separate env `CP_SAT_SOLVER_URL` behind default-off.
- Timeout, memory guard, and **mandatory fallback** to `server/engine.js` on failure, timeout, or oversize payload.
- `report.solver` metadata extended with mode, duration, optimality gap if available.

**Exit criteria:** CI runs stub or dockerized solver in integration test; prod default unchanged.

**Risks:** Worker process leaks; use process supervision and max concurrent solves.

---

## Phase 6 — Shadow mode and pilot

**Goals:** Real data without user impact.

**Deliverables:**

- Optional async job: run CP-SAT in shadow, log diff vs published run (metrics only).
- Pilot allow-list of org IDs.

**Exit criteria:** Error rate and p95 latency acceptable; no crashes on pilot traffic.

**Risks:** PII in logs; log counts and hashes only.

---

## Phase 7 — General availability (opt-in) and documentation

**Goals:** Schools can opt in with informed consent.

**Deliverables:**

- User-facing docs: time limits, “best incumbent”, not guaranteed optimum unless solver proves it.
- Support runbook: how to read infeasibility hints.

**Exit criteria:** Product and legal (if applicable) sign-off.

---

## Phase 8 — Default switch (optional, later)

**Goals:** Make CP-SAT default only if metrics warrant.

**Deliverables:** Version bump, changelog, migration notes.

**Exit criteria:** Executive approval; rollback plan tested (flip env, redeploy).

---

## Rollback (any phase)

- Set `TIMETABLE_SOLVER=legacy` (and disable any CP-SAT URL).
- Redeploy previous release artifact.
- No database schema rollback required if solver is stateless and run output remains in existing `timetable_runs` shape.

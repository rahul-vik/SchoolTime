# Open questions — decisions before implementation

Resolve these in **Phase 0–1** of [PROCEDURE.md](./PROCEDURE.md). Record outcomes in product docs (`README.md`, `docs/ARCHITECTURE.md`) and in code comments near `getTimetableSolverRuntime` / solver wiring when implementation starts. Do not hand-edit `docs/AUTO_*`; regenerate per project policy.

---

## 1. Objective weights and scoring

The greedy engine exposes a **`score`** (scheduled ÷ required) and **`report.optimization`** counters in `server/engine.js`, but it does not publish a single differentiable objective suitable for CP-SAT.

**Questions**

- Should the primary objective be **maximize total scheduled lesson slots**, **minimize unscheduled weighted by `priorityWeight`**, or a hybrid?
- Are **teacher load balance**, **morning/evening balance**, or **gap minimization** explicit objectives or post-solve metrics only?
- If using a **weighted sum**, who owns the default weights and how are they tuned per region or school type?

**Recommendation**

- Start with **lexicographic**: (1) maximize scheduled required periods, (2) minimize count of soft-rule violations, (3) minimize a simple load proxy. Document weights only after lexico tiers stabilize.

---

## 2. Multi-objective policy (lexicographic vs weighted sum)

**Questions**

- Will any customer-facing copy claim **“optimal”** without qualifying **time limit** and **objective scope**?
- For CP-SAT, is **lexicographic** multi-pass (solve, fix objective, re-solve) acceptable given wall-clock budgets (`TIMETABLE_SOLVER_TIMEOUT_MS` capped in `server/config/env.js`)?

**Risks**

- Lexicographic passes multiply runtime; weighted sum is one solve but obscures priorities.

---

## 3. Chunking very large schools

**Questions**

- What is the maximum supported **divisions × subjects × lesson slots × workingDays** for CP-SAT in production?
- If over limit: **fall back to legacy**, **partition by standard** (risk: cross-standard teacher conflicts), or **hierarchical** solve (master assigns teachers to blocks, sub-solver fills)?

**Dependencies**

- Requires profiling on target hardware and OR-Tools version pinned in the future solver package.

---

## 4. Class-teacher in CP-SAT versus a deterministic pre-pass

Today `server/engine.js` runs a **heuristic** pass for class-teacher first-period preferences when `classTeacherPreferences.enabled` is true, with statistics tracked in `report.classTeacherRules`.

**Questions**

- Should class-teacher constraints be **first-class boolean constraints** in CP-SAT (joint optimization with all subjects)?
- Or should Node **pre-assign** a subset of class-teacher lessons to fixed cells, then hand a reduced problem to CP-SAT?
- How do we preserve **`divisionsMissingClassTeacher`** reporting if preferences are soft?

**Recommendation**

- **v1:** Pre-pass or fixed literals for a minimal subset (first morning on selected days), then global solve for the remainder; iterate in v2 toward full integration.

---

## 5. Greedy “teacher lock” parity (`divisionSubjectTeacherLock`)

The greedy engine sets an implicit lock after the first placement per `(division, subject)` in `placeEntry` (`server/engine.js`). A CP-SAT model that allows multiple teachers for the same subject in one division unless otherwise constrained may **not** reproduce greedy outputs.

**Questions**

- Is multi-teacher per subject in one division **allowed by product** when `teacherSubjects` is ambiguous?
- Should persisted state gain an **explicit lock** field so CP-SAT and greedy read the same rule?

---

## 6. Soft scheduling rules vs `schedulingMode`

`STRICT` vs `BEST_FIT` / `OPTIMAL` changes whether day/slot/`INCLUDE_ONLY` checks can be skipped via `ignoreSoftRules` in later passes.

**Questions**

- Should CP-SAT encode soft rules as **slack variables** instead of multi-pass relaxation?
- If yes, how do we match legacy counts in `report.optimization.softRuleRelaxPlacements` for regression tests?

---

## 7. Continuity and cross-division continuity fidelity

`violatesContinuityLimits` and `violatesSingleClassContinuityPerDay` are **local along the slot order** and depend on `lessonSlots` ordering.

**Questions**

- Is an **exact** translation to CP-SAT mandatory for v1, or is a **stricter conservative** approximation acceptable temporarily?
- How do we test equivalence given greedy may find different feasible timetables?

---

## 8. `INCLUDE_ONLY` and infeasibility UX

**Questions**

- When `solverStatus` is `INFEASIBLE`, do we expose **IIS / constraint tags** to end users, or only to support/admin?
- Should the app offer **“relax this INCLUDE_ONLY rule”** guided by `infeasibility.codes` from [JSON_CONTRACT.md](./JSON_CONTRACT.md)?

---

## 9. Solver packaging and operations

**Questions**

- Python OR-Tools sidecar vs embedded WASM vs external SaaS solver?
- Who patches **OpenSSL / libc / ortools** in production images?
- Single-tenant vs shared solver fleet: concurrency and noisy-neighbor isolation.

---

## 10. Third mode naming (`TIMETABLE_SOLVER`)

Today `server/config/env.js` exposes `legacy` and `experimental`.

**Questions**

- Add `cp_sat` (or similar) as a third enum, or overload `experimental` with contract negotiation?
- Does marketing want **`experimental`** renamed before GA?

---

## 11. Daily minimum class-teacher periods

`server/engine.js` notes that a **daily minimum** placement rule is intentionally disabled while fields may still exist in preferences.

**Questions**

- Remove from persisted schema, implement in CP-SAT only, or keep dormant?

---

## 12. Export and validation parity

Exports and post-run validation assume **`entries`** align with `periodSlots` and inactive days (`shared/periodSlotDays.js`).

**Questions**

- Who owns golden PDF/Excel fixtures for solver-generated runs?
- Does `timetableValidationService` gain solver-specific finding codes, or only reuse existing codes?

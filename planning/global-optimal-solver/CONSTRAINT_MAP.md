# Constraint map — SchoolTime inputs vs solver modeling

This table maps **tenant and engine inputs** (as consumed by `runTimetableEngine` in `server/engine.js`) to how a future **CP-SAT** (or similar) solver should treat them. Line references are indicative; the engine file may shift—re-verify during implementation.

**Legend**

- **Hard** — Must hold in every accepted solution (or the solve is infeasible).
- **Soft** — May be violated with a penalty, or relaxed only in named engine modes today.
- **Relaxation policy** — What to do under pressure (penalty weight, lexicographic tier, or “never relax”).
- **Modeling notes** — Sketch of variables or constraints, not full mathematics.
- **Difficulty** — Relative implementation and performance risk for CP-SAT.

---

## Canonical data and ordering

| SchoolTime input | Hard / soft | Relaxation policy | Modeling notes | Known difficulty |
|------------------|-------------|---------------------|----------------|--------------------|
| `workingDays` (normalized Mon→Sun subset via `normalizeTenantSchoolOrdering` in `server/engine.js` using `shared/schoolDisplayOrder.js`) | Hard | Never | Defines day index set for all placement variables. | Low |
| `periodSlots` with `slotType` (`LESSON`, `LUNCH`, …) | Hard for slot usability | Never | Only `LESSON` rows accept subject placements; break/lunch produce structural rows. See `canPlaceAssignment` (`NON_LESSON_SLOT`). | Low |
| `periodSlots[].activeWeekdays` (optional) | Hard | Never | Restrict placement to active cells via `slotActiveOnWeekday` from `shared/periodSlotDays.js`. Migration prunes impossible rules in `server/services/tenantStateMigration.js`. | Medium (large cross product of masks) |
| `standards` / `divisions` ordering | Soft (UX) | N/A for feasibility | Affects greedy scan order only; CP-SAT can use fixed arbitrary order unless symmetry-breaking is needed. | Low |

---

## Teacher and division eligibility

| SchoolTime input | Hard / soft | Relaxation policy | Modeling notes | Known difficulty |
|------------------|-------------|---------------------|----------------|--------------------|
| `teacher.assignedDivisionIds` (empty = all) | Hard | Never | Boolean eligibility per `(teacher, division)`. | Low |
| `teacher.divisionSubjectExclusions` | Hard | Never | Forbidden `(teacher, division, subject)` triples. | Low |
| `teacher.subjectIds`, `teacher.mediumIds` | Hard | Never | Intersection with division medium and subject applicability. | Low |
| `teacherSubjects` explicit rows | Hard | Never | When non-empty for a subject/division, restricts eligible teachers (`findEligibleTeacher`). | Medium (sparse vs dense matrix) |
| `subjects.standardIds` / `subjects.mediumIds` vs division | Hard | Never | `subjectAppliesToDivision`. | Low |

---

## Scheduling rules (`schedulingRules` → `rules` in `server/engine.js`)

| Rule / behavior | Hard / soft | Relaxation policy | Modeling notes | Known difficulty |
|-----------------|-------------|---------------------|----------------|--------------------|
| `EXCLUDE_DAY` | Soft in **STRICT**; ignorable in **BEST_FIT / OPTIMAL** passes | In legacy, second pass uses `ignoreSoftRules: true` for day/slot INCLUDE checks only (see optimization loop). Match this **exactly** or declare a product change. | Per `(subject, day)` forbidden mask. | Low |
| `NOT_FIRST_MORNING`, `NOT_FIRST_AFTER_LUNCH`, `BOTH_BOUNDARY`, `EXCLUDE_SLOT` (targets / preset / `slotNumber`) | Soft under same policy as above | Same as `EXCLUDE_DAY` for relaxed passes. | Slot-level forbidden cells per subject. | Medium (many reified booleans) |
| `INCLUDE_ONLY` — `CUSTOM` (`allowedCells`) | Hard in **STRICT** | Product decision: either **always hard** (recommended for parity) or penalty for “distance outside allow-list.” | Intersection of allowed cells per `(subject, division)`; each rule must be satisfied (`isPlacementAllowedByIncludeOnly` uses **every** rule). | High (shrinks domain aggressively; infeasibility common) |
| `INCLUDE_ONLY` — `PRESET_LAST_LESSON` | Hard in **STRICT** | Same | Single allowed cell per rule if weekday matches `workingDays`. | Medium |
| Rule `isActive === false` | N/A | Ignored | Filter before building model. | Low |

---

## Capacity and occupancy

| SchoolTime input | Hard / soft | Relaxation policy | Modeling notes | Known difficulty |
|------------------|-------------|---------------------|----------------|--------------------|
| One lesson per `(division, day, slot)` among real lessons | Hard | Never | All-different / packing on division time lines. | Low |
| One teacher assignment per `(teacher, day, slot)` | Hard | Never | Teacher time conflict. | Low |
| `getTeacherCapacity` — free morning/evening, `maxPerDay`, `maxPerWeek` | Hard | Never | Count constraints per day/week; split morning/evening buckets using `firstAfterLunch` meta. | Medium |
| `freePeriodRules` | Hard | Never | Forbidden teacher cells. | Low |
| Subject `weeklyPeriods` / allocations (`subjectAllocations`, `getDivisionSubjectLimits`) | Hard (meet required count) | Optional soft slack variable with huge penalty if product allows partial schedules | Cardinality: exactly `required` assignments per `(division, subject)` over week. | Medium |
| `maxPerDay` per subject | Hard | Never | Daily cap per `(division, subject, day)`. | Low |

---

## Locks, fixed placements, continuity

| SchoolTime input | Hard / soft | Relaxation policy | Modeling notes | Known difficulty |
|------------------|-------------|---------------------|----------------|--------------------|
| `divisionSubjectTeacherLock` (implicit lock after first placement in greedy) | **Greedy artifact** — effectively “first teacher wins” | CP-SAT should treat **`teacherSubjects` + explicit product locks** as hard; if engine lock is only emergent, decide whether to **pre-lock** same teacher per `(division, subject)` for parity | For true parity with greedy output, model optional **fixed teacher per division+subject** for all lessons of that subject; this is stronger than “first placement” unless formalized in tenant state. | **High** — needs product decision |
| `fixedSlots` | Hard | Never | Pre-assign variables before search or fix literals. | Low |
| `teacher.maxContinuousSameSubjectPerDivision`, `maxContinuousAnySubjectPerDivision` | Hard | Never | Sequence constraints along ordered `lessonSlots` per `(division, day)`; count consecutive same teacher/subject. | High |
| `violatesSingleClassContinuityPerDay` (teacher continuity in at most one division per day) | Hard | Never | If teacher has adjacent lessons in two divisions same day, block. Global cardinality on “continuity segments” per teacher-day. | High |

---

## Class teacher and preferences (`classTeacherPreferences`)

| SchoolTime input | Hard / soft | Relaxation policy | Modeling notes | Known difficulty |
|------------------|-------------|---------------------|----------------|--------------------|
| `classTeacherPreferences.enabled` + first-period placement loop | Mixed — engine **tries** then counts skips | STRICT: best-effort; OPTIMAL/BEST_FIT: does not add new pass | Place class-teacher subject in `firstMorning` on selected `ctFirstPeriodDays` (`shared/classTeacherPreferences.js` semantics). | High if folded into global model (optional pre-pass). |
| `schedulingMode` (`STRICT` / `BEST_FIT` / `OPTIMAL`) | Controls soft-rule relaxation passes | Must mirror multi-pass behavior or explicitly diverge with versioning | Lexicographic “feasible with soft” then “maximize placements with soft ignored” approximates current two-phase behavior. | Medium |

---

## Free periods and reporting

| SchoolTime input | Hard / soft | Relaxation policy | Modeling notes | Known difficulty |
|------------------|-------------|---------------------|----------------|--------------------|
| Unfilled `LESSON` cells become `isFreePeriod: true` rows | Structural | N/A | Solver may output only placed lessons; Node fills free rows as today. | Low |
| `report.unscheduled`, `score`, `status` | Reporting | N/A | Derived from counts vs required. | Low |

---

## Summary for implementers

1. **Start** with hard constraints that already have clear rejection reasons in `canPlaceAssignment` and `canAssignTeacherForSlot` inside `server/engine.js`.
2. **Treat `INCLUDE_ONLY` and inactive slot days as hard** unless product explicitly replaces them with soft penalties; they dominate infeasibility and support tickets.
3. **Continuity and cross-division continuity** are the highest modeling cost; schedule them after basic packing works.
4. **Teacher-per-subject lock** as implemented by the greedy engine is subtle; resolve in [OPEN_QUESTIONS.md](./OPEN_QUESTIONS.md) before claiming parity.

# Constraint map — SchoolTime inputs vs solver

Source of truth for current greedy behavior: **`server/engine.js`** (`canPlaceAssignment`, placement loops), plus **`shared/periodSlotDays.js`** for inactive weekdays. Validation mirror: **`server/services/timetableValidationService.js`**.

Legend: **Hard** = must never be violated in a declared-feasible solution. **Soft** = may be relaxed in some product modes or mapped to penalty in CP-SAT. **Pre** = handled before CP-SAT (fixed variables).

| Input / rule | Today (greedy) | Hard / soft | CP-SAT v1 notes |
|--------------|----------------|--------------|-----------------|
| Period row `slotType` not `LESSON` | Blocked (`NON_LESSON_SLOT`) | Hard | Exclude non-lesson cells from domain. |
| `slotActiveOnWeekday(slot, day)` false | Blocked / skipped | Hard | Remove variable for that (division, day, slot) or forbid assignment. |
| `INCLUDE_ONLY` (CUSTOM / PRESET) | Hard in all modes | Hard | Allowed cell mask per (division, subject). |
| `EXCLUDE_DAY` / `EXCLUDE_SLOT` (and legacy NOT_*, BOTH_*) | Hard in STRICT; relaxable in BEST_FIT/OPTIMAL passes | Product choice: hard in CP-SAT v1 or penalty | Align UX copy with solver: if “always respect”, keep hard. |
| Subject weekly periods (`divisionLimits` / `subjectAllocations`) | Hard | Hard | Count == required per (division, subject). |
| `maxPerDay` | Hard | Hard | Daily count cap. |
| Teacher assigned to division (`assignedDivisionIds`) | Hard if non-empty | Hard | Filter eligible teachers. |
| `divisionSubjectExclusions` | Hard | Hard | Forbidden (teacher, division, subject) triples. |
| Teacher `subjectIds`, `mediumIds` | Hard | Hard | Eligibility filter. |
| `teacherSubjects` explicit rows | Hard (narrows candidates) | Hard | Domain restriction per (division, subject). |
| `divisionSubjectTeacherLock` (first teacher placed wins) | Hard after lock | Hard | Single teacher variable per (division, subject) or lock channel. |
| `freePeriodRules` | Hard when present | Hard | Teacher unavailable cell mask. |
| `fixedSlots` | Placed first if API sends them | Hard | Pre-assign variables or fixed constraints. |
| Class teacher first period (`classTeacherPreferences`, `enabled === true`) | Heuristic placement | Pre or Hard | Easiest as **pre-pass** in Node, then fix in model. |
| `dailyPrimaryMinPeriods` | Not enforced in engine | N/A | Decide: implement in CP-SAT v2 or remove from schema copy. |
| Continuity limits (`violatesContinuityLimits`) | Hard | Hard | Sequence constraints on teacher day—expensive; see OPEN_QUESTIONS. |
| `violatesSingleClassContinuityPerDay` | Hard | Hard | Same. |
| `schedulingMode` STRICT vs BEST_FIT/OPTIMAL | Affects exclude-rule relaxation only | Map to solver params | CP-SAT can keep all excludes hard; drop “relaxation” or use penalties. |
| Canonical ordering (standards, divisions, days) | Normalization before engine | Hard for determinism | Fix variable order and symmetry breaking. |

**Migration:** Always run **`migrateTenantState`** (or equivalent) on input so `INCLUDE_ONLY` impossible cells are pruned consistently with today’s engine.

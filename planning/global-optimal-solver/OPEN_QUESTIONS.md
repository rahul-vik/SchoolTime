# Open questions — before implementation

Decisions here should be resolved in Phase 0–1 of `PROCEDURE.md` and reflected in `CONSTRAINT_MAP.md` / `JSON_CONTRACT.md`.

1. **Objective function**  
   - Single weighted sum vs lexicographic (maximize scheduled periods first, then balance load)?  
   - How to weight “preference violations” if any rule becomes soft?

2. **BEST_FIT / OPTIMAL naming**  
   - Keep greedy modes as today and add `CP_SAT` as separate solver?  
   - Or reuse `schedulingMode` only inside legacy engine?

3. **Continuity constraints**  
   - Full CP-SAT model for `violatesContinuityLimits` and `violatesSingleClassContinuityPerDay`, or conservative pre-pass?  
   - Approximation acceptable for v1?

4. **Class teacher**  
   - Pre-place in Node (deterministic) then fix in solver, or full joint optimization?

5. **`dailyPrimaryMinPeriods`**  
   - Implement, remove from persisted schema, or hide in UI until implemented?

6. **`fixedSlots`**  
   - Promote to first-class UI or keep API-only with documentation?

7. **Solver stack**  
   - Python OR-Tools (recommended) vs Java vs WASM — who operates deploy artifacts?

8. **Multi-tenant isolation**  
   - Separate solver process per request vs pool; max concurrency per host.

9. **Optimality proof**  
   - Will any SKU claim “optimal” or only “best within time limit / incumbent”?

10. **Infeasibility UX**  
    - Surface IIS / constraint tags to end users or support-only?

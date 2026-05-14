import { runTimetableEngine } from "./engine.js";

/**
 * Experimental timetable solver entry point (TIMETABLE_SOLVER=experimental).
 * v0 runs the same greedy engine in an isolated worker with timeout/fallback wiring;
 * reserved for future CP-SAT / OR-Tools style passes without changing default behavior.
 */
export function runTimetableEngineExperimental(data) {
  const out = runTimetableEngine(data);
  return {
    ...out,
    report: {
      ...(out.report || {}),
      experimental: {
        prototype: "v0-legacy-delegate",
        note:
          "Output matches the legacy greedy engine. Global optimization (e.g. CP-SAT) is not enabled in this build; this flag exercises timeout/isolation plumbing only.",
      },
    },
  };
}

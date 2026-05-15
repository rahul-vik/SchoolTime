/** Rotating tips while timetable generation runs (Create page). */
export const GENERATION_TIPS = [
  "We respect teacher daily limits, morning/evening caps, and your placement preferences.",
  "Break and lunch slots stay clear — lessons only land on active teaching periods.",
  "Each class gets the weekly periods you configured per subject.",
  "If a slot cannot be filled, you will see it in the completion report after generate.",
  "You can swap lessons on the Timetable screen after generation (Ctrl+Z to undo).",
];

const HYBRID_TIPS = [
  "Hybrid mode tries the advanced solver first, then fills any gaps with the built-in engine.",
  "Large schools may take a little longer while we balance teachers and classes.",
];

export function tipForGeneration(solver, tipIndex) {
  const pool =
    solver === "hybrid" || solver === "cp_sat"
      ? [...HYBRID_TIPS, ...GENERATION_TIPS]
      : GENERATION_TIPS;
  return pool[tipIndex % pool.length];
}

/**
 * @param {number} progress 0–100 (UI estimate until API returns)
 * @param {string} [solver] hybrid | cp_sat | legacy
 */
export function getGenerationPhase(progress, solver) {
  const p = Math.max(0, Math.min(100, Number(progress) || 0));
  const advanced = solver === "hybrid" || solver === "cp_sat";

  if (p < 12) {
    return {
      title: "Reading your school setup",
      detail: "Loading classes, subjects, teachers, and period structure.",
    };
  }
  if (p < 28) {
    return {
      title: "Checking rules and capacities",
      detail: "Teacher limits, preferences, and inactive period days.",
    };
  }
  if (p < 45 && advanced) {
    return {
      title: "Running the advanced solver",
      detail: "Optimizing placements — this step can take longer on big timetables.",
    };
  }
  if (p < 62) {
    return {
      title: advanced ? "Placing lessons across the week" : "Placing lessons across the week",
      detail: advanced
        ? "Fitting subjects into open cells without clashes."
        : "Assigning teachers and subjects to open period slots.",
    };
  }
  if (p < 78) {
    return {
      title: "Balancing teacher workloads",
      detail: "Spreading periods across days and respecting continuity rules.",
    };
  }
  if (p < 92) {
    return {
      title: "Almost there",
      detail: "Wrapping up free periods and validating the grid.",
    };
  }
  return {
    title: "Finishing up",
    detail: "Saving your timetable and preparing the report.",
  };
}

export function solverLabel(solver) {
  if (solver === "hybrid") return "Hybrid engine";
  if (solver === "cp_sat") return "CP-SAT engine";
  return "Built-in engine";
}

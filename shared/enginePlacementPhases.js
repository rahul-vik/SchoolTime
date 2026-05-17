/**
 * Ideal-flow placement phases for the legacy timetable engine.
 * Order: constrained → lab/practical → core → language → non-core → remaining.
 * Across divisions, the engine uses higher-standard-first order (`sortDivisionsHigherStandardFirst`).
 */

export const PLACEMENT_PHASE_ORDER = [
  "CONSTRAINED",
  "LAB_PRACTICAL",
  "CORE",
  "LANGUAGE",
  "NON_CORE",
  "REMAINING",
];

function includeRuleDivisionIds(rule) {
  if (Array.isArray(rule?.divisionIds) && rule.divisionIds.length > 0) return rule.divisionIds;
  if (rule?.divisionId) return [rule.divisionId];
  return [];
}

/** Subject has an active INCLUDE_ONLY rule scoped to this division. */
export function subjectHasIncludeOnlyForDivision(subjectId, divisionId, rules) {
  return (rules || []).some(
    (r) =>
      r &&
      r.ruleType === "INCLUDE_ONLY" &&
      r.isActive !== false &&
      r.subjectId === subjectId &&
      includeRuleDivisionIds(r).includes(divisionId),
  );
}

/** Normalize tenant subject.category to a placement phase bucket (before constrained override). */
export function categoryToPlacementPhase(category) {
  const c = String(category || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (c === "PRACTICAL") return "LAB_PRACTICAL";
  if (c === "CORE") return "CORE";
  if (c === "LANGUAGE") return "LANGUAGE";
  if (c === "NON_CORE" || c === "NONCORE") return "NON_CORE";
  return "REMAINING";
}

/**
 * Classify one subject for a division into a placement phase.
 * @param {object} sub
 * @param {object} div
 * @param {{ rules?: object[] }} ctx
 */
export function classifySubjectPlacementPhase(sub, div, ctx = {}) {
  const rules = ctx.rules || [];
  if (subjectHasIncludeOnlyForDivision(sub.id, div.id, rules)) return "CONSTRAINED";
  return categoryToPlacementPhase(sub.category);
}

/**
 * Build ordered phase queues for one division (subjects sorted hardest-first within each phase).
 * @param {object[]} subjects
 * @param {object} div
 * @param {object} ctx - must include rules + sortSubjectsHardestFirst(subjects, div, ctx, seed)
 * @param {number} seed
 * @returns {Array<{ phase: string, subjects: object[] }>}
 */
export function buildPlacementPhaseQueues(subjects, div, ctx, seed = 0) {
  const { sortSubjectsHardestFirst, subjectAppliesToDivision } = ctx;
  const applicable = (subjects || []).filter((sub) => subjectAppliesToDivision(sub, div));
  const buckets = Object.fromEntries(PLACEMENT_PHASE_ORDER.map((p) => [p, []]));

  for (const sub of applicable) {
    const phase = classifySubjectPlacementPhase(sub, div, ctx);
    (buckets[phase] || buckets.REMAINING).push(sub);
  }

  const sortFn = typeof sortSubjectsHardestFirst === "function" ? sortSubjectsHardestFirst : (list) => list;

  return PLACEMENT_PHASE_ORDER.filter((phase) => buckets[phase].length > 0).map((phase) => ({
    phase,
    subjects: sortFn(buckets[phase], div, ctx, seed),
  }));
}

export function isPracticalCategory(subject) {
  return String(subject?.category || "")
    .trim()
    .toUpperCase() === "PRACTICAL";
}

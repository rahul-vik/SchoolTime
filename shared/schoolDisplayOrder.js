/**
 * Canonical ordering for tenant UI, engine, exports, and persisted state.
 * Standards: ascending by numeric name when the name is a number (1, 2, 10), else sortOrder, else name string.
 * Divisions: by standard order, then division name.
 * Working days: Monday → Sunday (subset keeps calendar order).
 */

import { sortWorkingDaysCanonical } from "./periodSlotDays.js";

/** Numeric sort key for a standard (lower = earlier). */
function standardRank(s) {
  const raw = String(s?.name ?? "").trim();
  if (raw !== "") {
    const asNum = Number(raw);
    if (Number.isFinite(asNum)) return { tier: 0, n: asNum, s: raw };
  }
  const so = Number(s?.sortOrder);
  if (Number.isFinite(so)) return { tier: 1, n: so, s: "" };
  if (raw === "") return { tier: 2, n: Number.POSITIVE_INFINITY, s: "" };
  return { tier: 2, n: Number.POSITIVE_INFINITY, s: raw };
}

export function sortStandardsAscending(standards) {
  if (!Array.isArray(standards) || standards.length === 0) return [];
  return [...standards].sort((a, b) => {
    const ra = standardRank(a);
    const rb = standardRank(b);
    if (ra.tier !== rb.tier) return ra.tier - rb.tier;
    if (ra.n !== rb.n) return ra.n - rb.n;
    const cmp = ra.s.localeCompare(rb.s, undefined, { numeric: true });
    if (cmp !== 0) return cmp;
    return String(a.id).localeCompare(String(b.id));
  });
}

/** Apply ascending order as explicit sortOrder 1..n (single source for lists + engine). */
export function withStandardsSortOrderReindexed(standards) {
  return sortStandardsAscending(standards).map((s, i) => ({ ...s, sortOrder: i + 1 }));
}

export function sortDivisionsByStandardOrder(divisions, standardsOrdered) {
  if (!Array.isArray(divisions) || divisions.length === 0) return [];
  const order = new Map((standardsOrdered || []).map((s, i) => [String(s.id), i]));
  return [...divisions].sort((a, b) => {
    const ia = order.has(String(a.standardId)) ? order.get(String(a.standardId)) : 9999;
    const ib = order.has(String(b.standardId)) ? order.get(String(b.standardId)) : 9999;
    if (ia !== ib) return ia - ib;
    return String(a.name || "").localeCompare(String(b.name || ""), undefined, { numeric: true });
  });
}

/** Order subject.standardIds in the same order as standards in school setup (ascending). */
export function orderSubjectStandardIds(standardIds, standardsOrdered) {
  if (!Array.isArray(standardIds) || standardIds.length === 0) return [];
  if (!Array.isArray(standardsOrdered) || standardsOrdered.length === 0) return [...standardIds];
  const rank = new Map(standardsOrdered.map((s, i) => [String(s.id), i]));
  return [...new Set(standardIds.map((id) => String(id)))].sort(
    (a, b) => (rank.get(String(a)) ?? 9999) - (rank.get(String(b)) ?? 9999),
  );
}

/**
 * @param {{ standards?: unknown[], divisions?: unknown[], workingDays?: unknown[] }} slice
 * @returns {{ standards: unknown[], divisions: unknown[], workingDays: string[] }}
 */
export function normalizeTenantSchoolOrdering(slice) {
  const wd = sortWorkingDaysCanonical(slice?.workingDays || []);
  const stds = withStandardsSortOrderReindexed(slice?.standards || []);
  const divs = sortDivisionsByStandardOrder(slice?.divisions || [], stds);
  return { standards: stds, divisions: divs, workingDays: wd };
}

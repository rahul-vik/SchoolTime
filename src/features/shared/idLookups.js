import {
  divisionsForScheduling,
  scopeTenantForScheduling,
  subjectAppliesToDivision,
  teachersForScheduling,
} from "../../../shared/divisionScheduling.js";
import { sortDivisionsByStandardOrder } from "../../../shared/schoolDisplayOrder.js";

/**
 * Match entities when ids may be string or number (JSON/SQLite vs client),
 * and when resolving timetable.report rows against a generation snapshot.
 */
export function findEntityById(list, id) {
  if (id === undefined || id === null) return null;
  const key = String(id);
  for (const item of list || []) {
    if (item != null && String(item.id) === key) return item;
  }
  return null;
}

/** Prefer lists from the run snapshot so report ids match (structure may change later in tenant_state). */
export function pickTimetableSnapshotLists(timetable, live) {
  const snap = timetable?.sourceState;
  const base = {
    divisions: snap?.divisions?.length ? snap.divisions : live?.divisions || [],
    standards: snap?.standards?.length ? snap.standards : live?.standards || [],
    subjects: snap?.subjects?.length ? snap.subjects : live?.subjects || [],
    teachers: snap?.teachers?.length ? snap.teachers : live?.teachers || [],
    schedulingRules: snap?.schedulingRules || [],
  };
  const scoped = scopeTenantForScheduling(base);
  return {
    divisions: scoped.divisions,
    standards: base.standards,
    subjects: scoped.subjects,
    teachers: scoped.teachers,
  };
}

export function isEntityIdInList(list, id) {
  if (id == null || id === "") return false;
  const key = String(id);
  return (list || []).some((item) => item != null && String(item.id) === key);
}

/**
 * Divisions/teachers visible in Timetable view (excludes paused / out-of-scope).
 * When a run exists, uses the generation snapshot so selection matches scheduled entries.
 */
export function resolveTimetableViewLists(timetable, live) {
  if (timetable?.entries?.length || timetable?.sourceState) {
    const snap = pickTimetableSnapshotLists(timetable, live);
    return {
      ...snap,
      divisions: sortDivisionsByStandardOrder(snap.divisions, snap.standards),
    };
  }
  const standards = live?.standards || [];
  const divisions = sortDivisionsByStandardOrder(divisionsForScheduling(live?.divisions || []), standards);
  return {
    divisions,
    standards,
    subjects: live?.subjects || [],
    teachers: teachersForScheduling(live?.teachers || []),
  };
}

/** First division/teacher to show when opening Timetable (active + in run scope). */
export function defaultTimetableViewSelection(timetable, live) {
  const lists = resolveTimetableViewLists(timetable, live);
  return {
    divisionId: lists.divisions[0]?.id ?? null,
    teacherId: lists.teachers[0]?.id ?? null,
    ...lists,
  };
}

/** Reports: active divisions, standards with live classes, subjects/teachers in scheduling scope. */
export function resolveReportLists(timetable, live) {
  const view = resolveTimetableViewLists(timetable, live);
  const activeStandardIds = new Set(view.divisions.map((d) => String(d.standardId)));
  const standards = (view.standards || []).filter((s) => activeStandardIds.has(String(s.id)));
  const subjects = (view.subjects || []).filter((sub) =>
    view.divisions.some((div) => subjectAppliesToDivision(sub, div)),
  );
  return { ...view, standards, subjects };
}

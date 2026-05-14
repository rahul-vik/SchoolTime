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
  return {
    divisions: snap?.divisions?.length ? snap.divisions : live?.divisions || [],
    standards: snap?.standards?.length ? snap.standards : live?.standards || [],
    subjects: snap?.subjects?.length ? snap.subjects : live?.subjects || [],
  };
}

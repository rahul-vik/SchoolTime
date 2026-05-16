/** Stable React key for timetable-scoped UI when a new run replaces the previous one. */
export function timetableRunKey(timetable) {
  if (!timetable) return "none";
  return String(timetable.runId || timetable.generatedAt || "legacy");
}

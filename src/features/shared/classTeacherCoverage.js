/**
 * Divisions with no teacher having that class in classTeacherDivisionIds.
 */
export function divisionsMissingClassTeacher(divisions, teachers) {
  const list = divisions || [];
  const tch = teachers || [];
  return list
    .filter((div) => !tch.some((t) => (t.classTeacherDivisionIds || []).includes(div.id)))
    .map((div) => ({
      divisionId: div.id,
      divisionName: div.name || "",
      standardId: div.standardId,
    }));
}

/** Prefer server report after generate; fall back to live division/teacher state (older saves). */
export function resolveDivisionsMissingClassTeacher(report, divisions, teachers) {
  const fromReport = report?.divisionsMissingClassTeacher;
  if (Array.isArray(fromReport)) {
    const ids = new Set((divisions || []).map((d) => d.id));
    return fromReport.filter((row) => row?.divisionId && ids.has(row.divisionId));
  }
  return divisionsMissingClassTeacher(divisions, teachers);
}

export function formatDivisionMissingLabel(row, standards) {
  const std = standards?.find((s) => s.id === row.standardId);
  const name = row.divisionName || "?";
  return std ? `Std ${std.name} — Div ${name}` : `Div ${name}`;
}

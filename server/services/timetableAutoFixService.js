import { nowIso } from "./common.js";

function lessonEntryComparator(a, b) {
  if (a.dayOfWeek !== b.dayOfWeek) return String(a.dayOfWeek).localeCompare(String(b.dayOfWeek));
  return Number(a.slotNumber) - Number(b.slotNumber);
}

export function applyLowRiskAutoFixes({ entries, findings }) {
  const working = [...(entries || [])];
  const applied = [];
  const skipped = [];

  const removableCodes = new Set(["SUBJECT_WEEKLY_OVERFLOW", "SUBJECT_DAILY_OVERFLOW", "SUBJECT_APPLICABILITY_MISMATCH"]);

  for (const finding of findings || []) {
    if (!(finding.autoFixable && finding.risk === "LOW" && removableCodes.has(finding.code))) {
      skipped.push(finding.findingId);
      continue;
    }
    if (finding.code === "SUBJECT_WEEKLY_OVERFLOW") {
      const { divisionId, subjectId, expected } = finding.context || {};
      const matches = working
        .filter((e) => e.slotType === "LESSON" && !e.isFreePeriod && e.divisionId === divisionId && e.subjectId === subjectId)
        .sort(lessonEntryComparator);
      const overflow = Math.max(0, matches.length - Number(expected || 0));
      if (overflow === 0) continue;
      const toRemove = matches.slice(-overflow);
      for (const r of toRemove) {
        const idx = working.findIndex((e) => e.divisionId === r.divisionId && e.dayOfWeek === r.dayOfWeek && e.slotNumber === r.slotNumber);
        if (idx >= 0) working[idx] = { ...working[idx], teacherId: null, subjectId: null, isFreePeriod: true, label: "Free" };
      }
      applied.push({ findingId: finding.findingId, action: "TRIM_WEEKLY_OVERFLOW", count: overflow });
      continue;
    }
    if (finding.code === "SUBJECT_DAILY_OVERFLOW") {
      const { divisionId, subjectId, dayOfWeek, expected } = finding.context || {};
      const matches = working
        .filter((e) => e.slotType === "LESSON" && !e.isFreePeriod && e.divisionId === divisionId && e.subjectId === subjectId && e.dayOfWeek === dayOfWeek)
        .sort(lessonEntryComparator);
      const overflow = Math.max(0, matches.length - Number(expected || 0));
      if (overflow === 0) continue;
      const toRemove = matches.slice(-overflow);
      for (const r of toRemove) {
        const idx = working.findIndex((e) => e.divisionId === r.divisionId && e.dayOfWeek === r.dayOfWeek && e.slotNumber === r.slotNumber);
        if (idx >= 0) working[idx] = { ...working[idx], teacherId: null, subjectId: null, isFreePeriod: true, label: "Free" };
      }
      applied.push({ findingId: finding.findingId, action: "TRIM_DAILY_OVERFLOW", count: overflow });
      continue;
    }
    if (finding.code === "SUBJECT_APPLICABILITY_MISMATCH") {
      const { divisionId, dayOfWeek, slotNumber } = finding.context || {};
      const idx = working.findIndex((e) => e.divisionId === divisionId && e.dayOfWeek === dayOfWeek && Number(e.slotNumber) === Number(slotNumber));
      if (idx >= 0) {
        working[idx] = { ...working[idx], teacherId: null, subjectId: null, isFreePeriod: true, label: "Free" };
        applied.push({ findingId: finding.findingId, action: "REMOVE_INAPPLICABLE_PLACEMENT", count: 1 });
      }
    }
  }

  const appliedAt = nowIso();
  const nextFindings = (findings || []).map((f) => {
    const fix = applied.find((a) => a.findingId === f.findingId);
    if (!fix) return f;
    return {
      ...f,
      status: "AUTO_APPLIED",
      autoApplied: true,
      resolvedAt: appliedAt,
      actionLog: [...(f.actionLog || []), { at: appliedAt, action: "AUTO_APPLIED", detail: fix.action, count: fix.count }],
    };
  });

  return {
    entries: working,
    findings: nextFindings,
    summary: {
      appliedCount: applied.length,
      skippedCount: skipped.length,
      applied,
    },
  };
}

export function applyApprovedFix({ finding, entries }) {
  return applyLowRiskAutoFixes({ entries, findings: [finding] });
}

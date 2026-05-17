import { withLiveTimetableReport } from "../../../shared/recomputeTimetableReport.js";
import { applyUndoLastManualEdit, entryAfterSwapPlacement } from "./appActions.js";

export function cellCoordKey(entry) {
  if (!entry) return "";
  return `${entry.divisionId}|${entry.dayOfWeek}|${Number(entry.slotNumber)}`;
}

export function buildEditTargetsMap(targets, divisionId) {
  const map = new Map();
  for (const t of targets || []) {
    if (divisionId && String(t.divisionId) !== String(divisionId)) continue;
    const key = `${t.dayOfWeek}|${Number(t.slotNumber)}`;
    map.set(key, t);
  }
  return map;
}

export async function loadValidEditTargets({
  timetable,
  sourceEntry,
  scopeDivisionId,
  getTenantState,
  fetchValidEditTargets,
}) {
  const sourceState = timetable?.sourceState || getTenantState?.();
  return fetchValidEditTargets({
    runId: timetable?.runId || null,
    entries: timetable?.entries || [],
    sourceState,
    source: {
      divisionId: sourceEntry.divisionId,
      dayOfWeek: sourceEntry.dayOfWeek,
      slotNumber: sourceEntry.slotNumber,
    },
    scopeDivisionId: scopeDivisionId || sourceEntry.divisionId,
  });
}

export async function loadValidAddOptions({
  timetable,
  targetEntry,
  getTenantState,
  fetchValidAddOptionsApi,
}) {
  const sourceState = timetable?.sourceState || getTenantState?.();
  return fetchValidAddOptionsApi({
    runId: timetable?.runId || null,
    entries: timetable?.entries || [],
    sourceState,
    divisionId: targetEntry.divisionId,
    dayOfWeek: targetEntry.dayOfWeek,
    slotNumber: targetEntry.slotNumber,
  });
}

export async function applyAddLessonRequest({
  timetable,
  targetEntry,
  subjectId,
  teacherId,
  getTenantState,
  applyTimetableEditApi,
}) {
  const sourceState = timetable?.sourceState || getTenantState?.();
  return applyTimetableEditApi({
    runId: timetable?.runId || null,
    entries: timetable?.entries || [],
    sourceState,
    operation: "ADD",
    target: {
      divisionId: targetEntry.divisionId,
      dayOfWeek: targetEntry.dayOfWeek,
      slotNumber: targetEntry.slotNumber,
    },
    subjectId,
    teacherId,
  });
}

export async function applyRepairPlanStep({
  timetable,
  plan,
  stepIndex = 0,
  getTenantState,
  applyTimetableEditApi,
}) {
  const step = plan?.steps?.[stepIndex];
  if (!step) throw new Error("Repair step not found");
  const sourceState = timetable?.sourceState || getTenantState?.();
  const sourceEntry = {
    divisionId: step.source.divisionId,
    dayOfWeek: step.source.dayOfWeek,
    slotNumber: step.source.slotNumber,
  };
  const targetEntry = {
    divisionId: step.target.divisionId,
    dayOfWeek: step.target.dayOfWeek,
    slotNumber: step.target.slotNumber,
  };
  return applyManualEditRequest({
    timetable,
    sourceEntry,
    targetEntry,
    operation: step.operation,
    getTenantState: () => sourceState,
    applyTimetableEditApi,
  });
}

export async function applyRepairPlanSteps({
  timetable,
  plan,
  getTenantState,
  applyTimetableEditApi,
  onStepApplied,
}) {
  let current = timetable;
  for (let i = 0; i < (plan?.steps || []).length; i += 1) {
    const resp = await applyRepairPlanStep({
      timetable: current,
      plan,
      stepIndex: i,
      getTenantState,
      applyTimetableEditApi,
    });
    current = mergeTimetableAfterEdit(current, resp);
    onStepApplied?.(current, i, resp);
  }
  return current;
}

export async function applyManualEditRequest({
  timetable,
  sourceEntry,
  targetEntry,
  operation,
  getTenantState,
  applyTimetableEditApi,
}) {
  const sourceState = timetable?.sourceState || getTenantState?.();
  const kind =
    operation ||
    (targetEntry?.isFreePeriod || (!targetEntry?.subjectId && !targetEntry?.teacherId)
      ? "MOVE"
      : "SWAP");
  return applyTimetableEditApi({
    runId: timetable?.runId || null,
    entries: timetable?.entries || [],
    sourceState,
    operation: kind === "MOVE_TO_FREE" ? "MOVE" : kind,
    source: {
      divisionId: sourceEntry.divisionId,
      dayOfWeek: sourceEntry.dayOfWeek,
      slotNumber: sourceEntry.slotNumber,
    },
    target: {
      divisionId: targetEntry.divisionId,
      dayOfWeek: targetEntry.dayOfWeek,
      slotNumber: targetEntry.slotNumber,
    },
  });
}

export function mergeTimetableAfterEdit(prev, apiResponse) {
  if (!prev) return prev;
  const nextEntries = apiResponse?.entries || apiResponse?.timetable?.entries || prev.entries;
  const manualEdits = apiResponse?.timetable?.manualEdits || prev.manualEdits || [];
  const report = apiResponse?.timetable?.report || {
    ...(prev.report || {}),
    manualEditCount: manualEdits.length,
    lastManualEditAt: manualEdits[manualEdits.length - 1]?.editedAt,
  };
  return withLiveTimetableReport({
    ...prev,
    entries: nextEntries,
    manualEdits,
    report,
    score: apiResponse?.timetable?.score ?? prev.score,
    status: apiResponse?.timetable?.status ?? prev.status,
  });
}

export { applyUndoLastManualEdit, entryAfterSwapPlacement };

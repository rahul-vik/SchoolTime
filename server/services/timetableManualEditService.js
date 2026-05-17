import { migrateTenantState } from "./tenantStateMigration.js";
import { nowIso } from "./common.js";
import {
  applyAddLessonToEntries,
  applyManualEditToEntries,
  createPlacementValidatorContext,
  findEntryAt,
  inferEditKind,
  listValidAddOptions,
  listValidEditTargets,
  validateAddLesson,
  validateManualEdit,
} from "../../shared/timetablePlacementValidator.js";
import {
  collectAddLessonDiagnostics,
  findRepairPlansForAdd,
} from "../../shared/timetableRepairSuggestions.js";

function normalizeCell(raw) {
  if (!raw || typeof raw !== "object") return null;
  const divisionId = String(raw.divisionId ?? "").trim();
  const dayOfWeek = String(raw.dayOfWeek ?? "").trim();
  const slotNumber = Number(raw.slotNumber);
  if (!divisionId || !dayOfWeek || !Number.isFinite(slotNumber)) return null;
  return { divisionId, dayOfWeek, slotNumber };
}

export function resolveTimetableEditPayload({ body, runRow, tenantStateRow }) {
  const runId = String(body?.runId ?? runRow?.id ?? "").trim() || null;
  let entries = Array.isArray(body?.entries) ? body.entries : null;
  let state = body?.sourceState && typeof body.sourceState === "object" ? body.sourceState : null;

  if (runRow) {
    if (!entries && runRow.entries_json) {
      try {
        entries = JSON.parse(runRow.entries_json);
      } catch {
        entries = null;
      }
    }
    if (!state && runRow.state_json) {
      try {
        state = migrateTenantState(JSON.parse(runRow.state_json)).state;
      } catch {
        state = null;
      }
    }
  }
  if (!state && tenantStateRow?.state_json) {
    try {
      state = migrateTenantState(JSON.parse(tenantStateRow.state_json)).state;
    } catch {
      state = null;
    }
  }
  if (!Array.isArray(entries)) entries = [];
  if (!state || typeof state !== "object") {
    return { error: "Timetable state snapshot is required (run state_json or sourceState)" };
  }
  return { runId, entries, state };
}

export function getValidAddOptions({ entries, state, divisionId, dayOfWeek, slotNumber }) {
  const cell = normalizeCell({ divisionId, dayOfWeek, slotNumber });
  if (!cell) return { error: "Invalid cell" };
  const ctx = createPlacementValidatorContext(state, entries);
  const result = listValidAddOptions(ctx, state, cell.divisionId, cell.dayOfWeek, cell.slotNumber);
  const diagnostics =
    !result.addable || (result.subjects || []).length === 0
      ? collectAddLessonDiagnostics(ctx, state, cell.divisionId, cell.dayOfWeek, cell.slotNumber)
      : null;
  const repairPlans =
    !result.addable || (result.subjects || []).length === 0
      ? findRepairPlansForAdd(ctx, state, cell.divisionId, cell.dayOfWeek, cell.slotNumber, diagnostics)
      : [];
  return {
    addable: result.addable,
    invalidReason: result.invalidReason || null,
    subjects: result.subjects,
    teachersBySubject: result.teachersBySubject,
    cell: result.cell || cell,
    diagnostics,
    repairPlans,
  };
}

export function getValidEditTargets({ entries, state, source, scopeDivisionId }) {
  const cell = normalizeCell(source);
  if (!cell) return { error: "Invalid source cell" };
  const ctx = createPlacementValidatorContext(state, entries);
  return listValidEditTargets(ctx, state, cell, scopeDivisionId || cell.divisionId);
}

export function applyTimetableEdit({ entries, state, source, target, operation, subjectId, teacherId }) {
  const op = String(operation || "").toUpperCase();
  if (op === "ADD") {
    const targetCell = normalizeCell(target);
    if (!targetCell) return { error: "Invalid target cell" };
    const sid = String(subjectId || "").trim();
    const tid = String(teacherId || "").trim();
    if (!sid || !tid) return { error: "Subject and teacher are required for ADD" };

    const ctx = createPlacementValidatorContext(state, entries);
    const validation = validateAddLesson(ctx, state, targetCell, sid, tid);
    if (!validation.valid) {
      return {
        error: validation.reasonMessage || "Add not allowed",
        reasons: [{ reasonCode: validation.reasonCode, reasonMessage: validation.reasonMessage }],
      };
    }
    const applied = applyAddLessonToEntries(entries, targetCell, sid, tid);
    if (!applied.changed) {
      return { error: "Target is not a free period" };
    }
    return {
      ok: true,
      operation: "ADD",
      kind: applied.kind,
      entries: applied.entries,
      validation: { valid: true, kind: validation.kind },
    };
  }

  const sourceCell = normalizeCell(source);
  const targetCell = normalizeCell(target);
  if (!sourceCell || !targetCell) return { error: "Invalid source or target cell" };

  const ctx = createPlacementValidatorContext(state, entries);
  const sourceEntry = ctx.entries.find(
    (e) =>
      String(e.divisionId) === String(sourceCell.divisionId) &&
      e.dayOfWeek === sourceCell.dayOfWeek &&
      Number(e.slotNumber) === Number(sourceCell.slotNumber),
  );
  const targetEntry = ctx.entries.find(
    (e) =>
      String(e.divisionId) === String(targetCell.divisionId) &&
      e.dayOfWeek === targetCell.dayOfWeek &&
      Number(e.slotNumber) === Number(targetCell.slotNumber),
  );
  const inferred = inferEditKind(sourceEntry, targetEntry);
  let resolvedOp = op;
  if (op === "MOVE" && inferred.kind !== "MOVE_TO_FREE") {
    return {
      error: "Target is not a valid free-period move",
      reasons: [{ reasonCode: inferred.reasonCode || "TARGET_NOT_FREE" }],
    };
  }
  if (op === "SWAP" && inferred.kind !== "SWAP") {
    return {
      error: "Target is not a valid swap",
      reasons: [{ reasonCode: inferred.reasonCode || "INVALID_OPERATION" }],
    };
  }
  if (!op) {
    resolvedOp = inferred.kind === "MOVE_TO_FREE" ? "MOVE" : inferred.kind === "SWAP" ? "SWAP" : null;
  }
  if (!resolvedOp) {
    return { error: "Operation could not be determined", reasons: [{ reasonCode: inferred.reasonCode }] };
  }

  const validation = validateManualEdit(
    ctx,
    state,
    sourceCell,
    targetCell,
    resolvedOp === "MOVE" ? "MOVE" : "SWAP",
  );
  if (!validation.valid) {
    return {
      error: validation.reasonMessage || "Edit not allowed",
      reasons: [
        {
          reasonCode: validation.reasonCode,
          reasonMessage: validation.reasonMessage,
        },
      ],
    };
  }

  const applied = applyManualEditToEntries(entries, resolvedOp, sourceCell, targetCell);
  if (!applied.changed) {
    return { error: "Edit could not be applied" };
  }

  return {
    ok: true,
    operation: resolvedOp,
    kind: applied.kind,
    entries: applied.entries,
    validation: { valid: true, kind: validation.kind },
  };
}

export function appendManualEditAudit(prevTimetable, { source, target, operation, kind, entriesBefore, subjectId, teacherId }) {
  const now = nowIso();
  const manualEdits = [...(prevTimetable?.manualEdits || [])];
  const op = String(operation || "").toUpperCase();
  let editRecord;
  if (op === "ADD") {
    const cell = target;
    const beforeEntry = findEntryAt(entriesBefore, cell.divisionId, cell.dayOfWeek, cell.slotNumber);
    editRecord = {
      id: `edit-${Date.now()}`,
      type: "ADD",
      kind,
      editedAt: now,
      from: {
        divisionId: cell.divisionId,
        dayOfWeek: cell.dayOfWeek,
        slotNumber: cell.slotNumber,
        subjectId: beforeEntry?.subjectId ?? null,
        teacherId: beforeEntry?.teacherId ?? null,
      },
      to: {
        divisionId: cell.divisionId,
        dayOfWeek: cell.dayOfWeek,
        slotNumber: cell.slotNumber,
        subjectId: subjectId ?? null,
        teacherId: teacherId ?? null,
      },
    };
  } else {
    const fromEntry = findEntryAt(entriesBefore, source.divisionId, source.dayOfWeek, source.slotNumber);
    const toEntry = findEntryAt(entriesBefore, target.divisionId, target.dayOfWeek, target.slotNumber);
    editRecord = {
      id: `edit-${Date.now()}`,
      type: operation === "MOVE" ? "MOVE" : "SWAP",
      kind,
      editedAt: now,
      from: {
        divisionId: source.divisionId,
        dayOfWeek: source.dayOfWeek,
        slotNumber: source.slotNumber,
        subjectId: fromEntry?.subjectId ?? null,
        teacherId: fromEntry?.teacherId ?? null,
      },
      to: {
        divisionId: target.divisionId,
        dayOfWeek: target.dayOfWeek,
        slotNumber: target.slotNumber,
        subjectId: toEntry?.subjectId ?? null,
        teacherId: toEntry?.teacherId ?? null,
      },
    };
  }
  manualEdits.push(editRecord);
  const report = {
    ...(prevTimetable?.report || {}),
    manualEditCount: manualEdits.length,
    lastManualEditAt: now,
  };
  return { manualEdits, report };
}

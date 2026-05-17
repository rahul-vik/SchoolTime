/**
 * Diagnostics and bounded repair plans when "Add on free period" has no options.
 * Uses validateManualEdit, listValidEditTargets, validateAddLesson — no invented rules.
 */

import {
  PLACEMENT_REASON_MESSAGES,
  applyManualEditToEntries,
  createPlacementValidatorContext,
  evaluatePlacement,
  findEntryAt,
  getDivisionSubjectLimits,
  listValidEditTargets,
  validateAddLesson,
  validateAddLessonCell,
} from "./timetablePlacementValidator.js";
import { subjectAppliesToDivision } from "./divisionScheduling.js";
import {
  isDayBlockedByRule,
  isPlacementAllowedByIncludeOnly,
  isSlotBlockedByRule,
} from "./schedulingRulePlacement.js";

const MAX_REPAIR_PLANS = 3;
const MAX_REPAIR_DEPTH = 2;
const MAX_BRANCH_TARGETS = 12;

function motionDivIdEq(a, b) {
  return String(a) === String(b);
}

function teacherDisplayName(teacher) {
  if (!teacher) return "";
  const name = `${teacher.firstName || ""} ${teacher.lastName || ""}`.trim();
  return name || teacher.employeeCode || teacher.id;
}

function subjectCode(sub) {
  return sub?.code || sub?.name || sub?.id || "";
}

function cellLabel(dayOfWeek, slotNumber) {
  const day = String(dayOfWeek || "").slice(0, 3);
  return `${day} P${slotNumber}`;
}

function entryLessonLabel(ctx, entry) {
  if (!entry || entry.isFreePeriod) return "Free period";
  const sub = ctx.subjects.find((s) => s.id === entry.subjectId);
  const tea = ctx.teachers.find((t) => t.id === entry.teacherId);
  const code = subjectCode(sub);
  const tName = teacherDisplayName(tea);
  return tName ? `${code} (${tName})` : code || "Lesson";
}

function divisionLabel(ctx, divisionId) {
  const div = ctx.divisions.find((d) => motionDivIdEq(d.id, divisionId));
  return div?.name ? String(div.name) : String(divisionId);
}

function teacherEligibleForDivisionSubject(ctx, teacher, subjectId, divisionId) {
  const div = ctx.divisions.find((d) => motionDivIdEq(d.id, divisionId));
  if (!div || !teacher) return false;
  const subject = ctx.subjects.find((s) => s.id === subjectId);
  if (!subject) return false;
  if (!(teacher.subjectIds || []).includes(subjectId)) return false;
  if (!(teacher.mediumIds || []).includes(div.mediumId)) return false;
  const assigned = teacher.assignedDivisionIds || [];
  if (assigned.length > 0 && !assigned.some((id) => motionDivIdEq(id, divisionId))) return false;
  const rows = teacher.divisionSubjectExclusions || [];
  const hit = rows.find((r) => motionDivIdEq(r.divisionId, divisionId));
  if (hit && (hit.subjectIds || []).includes(subjectId)) return false;
  const explicit = (ctx.teacherSubjects || []).filter(
    (ts) =>
      String(ts.subjectId) === String(subjectId) &&
      (!ts.divisionId || motionDivIdEq(ts.divisionId, divisionId)),
  );
  if (explicit.length > 0) {
    return explicit.some((ts) => String(ts.teacherId) === String(teacher.id));
  }
  return true;
}

function subjectQuotaRemaining(ctx, subject, divisionId) {
  const { weeklyPeriods: required } = getDivisionSubjectLimits(subject, divisionId, ctx.subjectAllocations);
  const scheduled = ctx.subjectWeeklyCount.get(`${divisionId}:${subject.id}`) || 0;
  return Math.max(0, (required || 0) - scheduled);
}

function findTeacherBlockingLessons(ctx, teacherId, dayOfWeek, slotNumber, excludeDivisionId) {
  const hits = [];
  for (const e of ctx.entries) {
    if (!e?.teacherId || e.isFreePeriod || e.slotType === "BREAK" || e.slotType === "LUNCH") continue;
    if (String(e.teacherId) !== String(teacherId)) continue;
    if (e.dayOfWeek !== dayOfWeek || Number(e.slotNumber) !== Number(slotNumber)) continue;
    if (motionDivIdEq(e.divisionId, excludeDivisionId)) continue;
    hits.push(e);
  }
  return hits;
}

function subjectPassesPreTeacherChecks(ctx, sub, div, divisionId, dayOfWeek, slotNumber) {
  if (!sub || sub.requiresDoublePeriod) return false;
  if (!subjectAppliesToDivision(sub, div)) return false;
  if (subjectQuotaRemaining(ctx, sub, divisionId) <= 0) return false;
  if (isDayBlockedByRule(sub.id, dayOfWeek, ctx.rules)) return false;
  if (isSlotBlockedByRule(sub.id, slotNumber, ctx.periodSlots, ctx.rules)) return false;
  const subDayCount = ctx.subjectDailyCount.get(`${divisionId}:${sub.id}:${dayOfWeek}`) || 0;
  const { maxPerDay } = getDivisionSubjectLimits(sub, divisionId, ctx.subjectAllocations);
  if (subDayCount >= (maxPerDay || 2)) return false;
  if (
    !isPlacementAllowedByIncludeOnly(
      sub.id,
      divisionId,
      dayOfWeek,
      slotNumber,
      ctx.periodSlots,
      ctx.workingDays,
      ctx.rules,
    )
  ) {
    return false;
  }
  return true;
}

/**
 * Phase 0: why add has no options (per subject / teacher blockers).
 */
export function collectAddLessonDiagnostics(ctx, state, divisionId, dayOfWeek, slotNumber) {
  const cellCheck = validateAddLessonCell(ctx, divisionId, dayOfWeek, slotNumber);
  if (!cellCheck.addable) {
    return {
      cellAddable: false,
      cellInvalidReason: cellCheck.invalidReason || null,
      subjectFailures: [],
      teacherSlotBlockers: [],
    };
  }

  const div = ctx.divisions.find((d) => motionDivIdEq(d.id, divisionId));
  const subjectFailures = [];
  const teacherSlotBlockers = [];
  const blockerKeys = new Set();

  for (const sub of ctx.subjects) {
    if (!subjectPassesPreTeacherChecks(ctx, sub, div, divisionId, dayOfWeek, slotNumber)) continue;

    const teacherFailures = [];
    let anyTeacherOk = false;

    for (const teacher of ctx.teachers) {
      if (!teacherEligibleForDivisionSubject(ctx, teacher, sub.id, divisionId)) continue;
      const ignoreCells = new Set([`${divisionId}:${dayOfWeek}:${slotNumber}`]);
      const check = evaluatePlacement(ctx, {
        teacher,
        divisionId,
        day: dayOfWeek,
        slotNumber,
        subjectId: sub.id,
        ignoreCells,
        relocatingExistingLesson: false,
      });
      if (check.ok) {
        anyTeacherOk = true;
        continue;
      }
      const reasonCode = check.reasonCode || check.reason || "INVALID_OPERATION";
      const reasonMessage =
        check.reasonMessage || PLACEMENT_REASON_MESSAGES[reasonCode] || PLACEMENT_REASON_MESSAGES.INVALID_OPERATION;
      teacherFailures.push({
        teacherId: teacher.id,
        teacherLabel: teacherDisplayName(teacher),
        reasonCode,
        reasonMessage,
      });

      if (reasonCode === "TEACHER_SLOT_TAKEN") {
        for (const blocker of findTeacherBlockingLessons(
          ctx,
          teacher.id,
          dayOfWeek,
          slotNumber,
          divisionId,
        )) {
          const key = `${blocker.divisionId}:${blocker.dayOfWeek}:${blocker.slotNumber}`;
          if (blockerKeys.has(key)) continue;
          blockerKeys.add(key);
          teacherSlotBlockers.push({
            teacherId: teacher.id,
            teacherLabel: teacherDisplayName(teacher),
            subjectId: sub.id,
            subjectLabel: subjectCode(sub),
            reasonCode: "TEACHER_SLOT_TAKEN",
            blockingCell: {
              divisionId: blocker.divisionId,
              dayOfWeek: blocker.dayOfWeek,
              slotNumber: Number(blocker.slotNumber),
            },
            blockingLessonLabel: entryLessonLabel(ctx, blocker),
            divisionLabel: divisionLabel(ctx, blocker.divisionId),
          });
        }
      }
    }

    if (!anyTeacherOk) {
      const reasons = [];
      const codes = new Set();
      for (const tf of teacherFailures) {
        if (codes.has(tf.reasonCode)) continue;
        codes.add(tf.reasonCode);
        reasons.push({ reasonCode: tf.reasonCode, reasonMessage: tf.reasonMessage });
      }
      subjectFailures.push({
        subjectId: sub.id,
        subjectLabel: subjectCode(sub),
        reasons,
        teacherFailures,
      });
    }
  }

  return {
    cellAddable: true,
    cellInvalidReason: null,
    subjectFailures,
    teacherSlotBlockers,
  };
}

function buildRepairStep(ctx, operation, source, target, kind) {
  const sourceEntry = findEntryAt(ctx.entries, source.divisionId, source.dayOfWeek, source.slotNumber);
  const targetEntry = findEntryAt(ctx.entries, target.divisionId, target.dayOfWeek, target.slotNumber);
  const op = operation === "MOVE" ? "MOVE" : "SWAP";
  const fromLabel = entryLessonLabel(ctx, sourceEntry);
  const toLabel =
    kind === "MOVE_TO_FREE"
      ? `free ${cellLabel(target.dayOfWeek, target.slotNumber)}`
      : entryLessonLabel(ctx, targetEntry);
  const divHint =
    !motionDivIdEq(source.divisionId, target.divisionId) ? ` (${divisionLabel(ctx, source.divisionId)})` : "";
  return {
    operation: op,
    kind,
    source: {
      divisionId: source.divisionId,
      dayOfWeek: source.dayOfWeek,
      slotNumber: Number(source.slotNumber),
    },
    target: {
      divisionId: target.divisionId,
      dayOfWeek: target.dayOfWeek,
      slotNumber: Number(target.slotNumber),
    },
    label:
      kind === "MOVE_TO_FREE"
        ? `Move ${fromLabel}${motionDivIdEq(source.divisionId, target.divisionId) ? "" : divHint} → ${toLabel}`
        : `Swap ${fromLabel} with ${toLabel}`,
  };
}

function pickAddCandidates(ctx, state, cell, diagnostics) {
  const { divisionId, dayOfWeek, slotNumber } = cell;
  const candidates = [];

  for (const sub of ctx.subjects) {
    const div = ctx.divisions.find((d) => motionDivIdEq(d.id, divisionId));
    if (!subjectPassesPreTeacherChecks(ctx, sub, div, divisionId, dayOfWeek, slotNumber)) continue;
    for (const teacher of ctx.teachers) {
      if (!teacherEligibleForDivisionSubject(ctx, teacher, sub.id, divisionId)) continue;
      const validation = validateAddLesson(ctx, state, cell, sub.id, teacher.id);
      if (validation.valid) continue;
      const blockers = findTeacherBlockingLessons(
        ctx,
        teacher.id,
        dayOfWeek,
        slotNumber,
        divisionId,
      );
      candidates.push({
        subjectId: sub.id,
        subjectLabel: subjectCode(sub),
        teacherId: teacher.id,
        teacherLabel: teacherDisplayName(teacher),
        reasonCode: validation.reasonCode,
        blockers,
        repairable: validation.reasonCode === "TEACHER_SLOT_TAKEN" && blockers.length > 0,
      });
    }
  }

  candidates.sort((a, b) => {
    if (a.repairable !== b.repairable) return a.repairable ? -1 : 1;
    if (a.blockers.length !== b.blockers.length) return a.blockers.length - b.blockers.length;
    return 0;
  });

  return candidates;
}

function planKey(steps, enablesAdd) {
  const stepPart = steps.map((s) => `${s.operation}:${s.source.divisionId}:${s.source.dayOfWeek}:${s.source.slotNumber}->${s.target.divisionId}:${s.target.dayOfWeek}:${s.target.slotNumber}`).join("|");
  return `${stepPart}::${enablesAdd.subjectId}:${enablesAdd.teacherId}`;
}

/**
 * Phase 1–2: bounded MOVE/SWAP sequences that unblock at least one add.
 */
export function findRepairPlansForAdd(ctx, state, divisionId, dayOfWeek, slotNumber, diagnostics = null) {
  const cell = { divisionId, dayOfWeek, slotNumber: Number(slotNumber) };
  const cellCheck = validateAddLessonCell(ctx, divisionId, dayOfWeek, slotNumber);
  if (!cellCheck.addable) return [];

  const diag = diagnostics || collectAddLessonDiagnostics(ctx, state, divisionId, dayOfWeek, slotNumber);
  const candidates = pickAddCandidates(ctx, state, cell, diag).filter((c) => c.repairable);
  if (candidates.length === 0) return [];

  const plans = [];
  const seenPlans = new Set();
  const seenBranches = new Set();

  function tryFinish(entries, steps) {
    const nextCtx = createPlacementValidatorContext(state, entries);
    for (const cand of candidates) {
      const validation = validateAddLesson(nextCtx, state, cell, cand.subjectId, cand.teacherId);
      if (!validation.valid) continue;
      const enablesAdd = {
        subjectId: cand.subjectId,
        subjectLabel: cand.subjectLabel,
        teacherId: cand.teacherId,
        teacherLabel: cand.teacherLabel,
      };
      const key = planKey(steps, enablesAdd);
      if (seenPlans.has(key)) return;
      seenPlans.add(key);
      const stepLabels = steps.map((s) => s.label).join("; then ");
      plans.push({
        id: `repair-${plans.length + 1}`,
        steps: [...steps],
        enablesAdd,
        summary:
          steps.length === 0
            ? `Add ${cand.subjectLabel} (${cand.teacherLabel})`
            : `${stepLabels}; then add ${cand.subjectLabel} (${cand.teacherLabel})`,
      });
    }
  }

  function search(entries, depth, steps) {
    if (plans.length >= MAX_REPAIR_PLANS) return;

    tryFinish(entries, steps);
    if (depth >= MAX_REPAIR_DEPTH || plans.length >= MAX_REPAIR_PLANS) return;

    const searchCtx = createPlacementValidatorContext(state, entries);
    const blockerSources = new Map();
    for (const cand of candidates) {
      for (const blocker of cand.blockers) {
        const srcKey = `${blocker.divisionId}:${blocker.dayOfWeek}:${blocker.slotNumber}`;
        if (!blockerSources.has(srcKey)) {
          blockerSources.set(srcKey, {
            divisionId: blocker.divisionId,
            dayOfWeek: blocker.dayOfWeek,
            slotNumber: Number(blocker.slotNumber),
          });
        }
      }
    }

    for (const source of blockerSources.values()) {
      const { targets } = listValidEditTargets(searchCtx, state, source, source.divisionId);
      const validTargets = (targets || [])
        .filter((t) => t.valid && (t.kind === "MOVE_TO_FREE" || t.kind === "SWAP"))
        .slice(0, MAX_BRANCH_TARGETS);

      for (const t of validTargets) {
        const operation = t.kind === "MOVE_TO_FREE" ? "MOVE" : "SWAP";
        const applied = applyManualEditToEntries(entries, operation, source, {
          divisionId: t.divisionId,
          dayOfWeek: t.dayOfWeek,
          slotNumber: t.slotNumber,
        });
        if (!applied.changed) continue;
        const step = buildRepairStep(searchCtx, operation, source, t, t.kind);
        const nextSteps = [...steps, step];
        const branchKey = nextSteps.map((s) => s.label).join("|");
        if (seenBranches.has(branchKey)) continue;
        seenBranches.add(branchKey);
        search(applied.entries, depth + 1, nextSteps);
        if (plans.length >= MAX_REPAIR_PLANS) return;
      }
    }
  }

  search(ctx.entries, 0, []);
  return plans.slice(0, MAX_REPAIR_PLANS);
}

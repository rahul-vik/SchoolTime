/**
 * Post-allocation optimizers for the legacy greedy engine (ideal flow steps 7–9).
 */

import { slotActiveOnWeekday } from "../shared/periodSlotDays.js";
import { isPracticalCategory } from "../shared/enginePlacementPhases.js";
import { buildSlotOrderForPlacement } from "../shared/engineSlotOrder.js";

/**
 * Fill empty division lesson cells using still-short subjects (before Free grid fill).
 * @param {object} ctx - engine placement API
 */
export function runGapUtilizationPass(ctx) {
  const stats = { attempts: 0, placed: 0 };
  const {
    divisions,
    workingDays,
    lessonSlots,
    subjects,
    subjectAppliesToDivision,
    getDivisionSubjectLimits,
    subjectAllocations,
    subjectWeeklyCount,
    subWKey,
    dSlotKey,
    divisionSlotMap,
    findEligibleTeacher,
    placeEntry,
    isDayBlockedByRule,
    isSlotBlockedByRule,
    isPlacementAllowedByIncludeOnly,
    periodSlots,
    rules,
    pinnedCells,
    cellKey,
  } = ctx;

  const shortages = [];
  for (const div of divisions) {
    for (const sub of subjects) {
      if (!subjectAppliesToDivision(sub, div)) continue;
      const { weeklyPeriods: required } = getDivisionSubjectLimits(sub, div.id, subjectAllocations);
      const scheduled = subjectWeeklyCount.get(subWKey(div.id, sub.id)) || 0;
      if (scheduled < required) {
        shortages.push({
          div,
          sub,
          required,
          scheduled,
          short: required - scheduled,
          priority: Number(sub.priorityWeight || 0) * 10 + (required - scheduled),
        });
      }
    }
  }
  shortages.sort((a, b) => b.priority - a.priority || b.short - a.short);

  for (const { div, sub } of shortages) {
    const { weeklyPeriods: required, maxPerDay } = getDivisionSubjectLimits(sub, div.id, subjectAllocations);
    let scheduled = subjectWeeklyCount.get(subWKey(div.id, sub.id)) || 0;
    if (scheduled >= required) continue;

    for (const day of workingDays) {
      if (scheduled >= required) break;
      if (isDayBlockedByRule(sub.id, day, rules)) continue;
      if ((ctx.subjectDailyCount.get(ctx.subDKey(div.id, sub.id, day)) || 0) >= (maxPerDay || 2)) continue;

      const dayIndex = Math.max(0, workingDays.indexOf(day));
      const slotScan = buildSlotOrderForPlacement(lessonSlots, {
        attemptSeed: ctx.attemptSeed ?? 0,
        dayIndex,
        subjectId: sub.id,
      });
      for (const slot of slotScan) {
        if (scheduled >= required) break;
        if (!slotActiveOnWeekday(slot, day)) continue;
        const key = dSlotKey(div.id, day, slot.slotNumber);
        if (divisionSlotMap.has(key)) continue;
        if (pinnedCells?.has(cellKey(div.id, day, slot.slotNumber))) continue;
        if (isSlotBlockedByRule(sub.id, slot.slotNumber, periodSlots, rules)) continue;
        if (!isPlacementAllowedByIncludeOnly(sub.id, div.id, day, slot.slotNumber, periodSlots, workingDays, rules)) continue;

        stats.attempts += 1;
        const t = findEligibleTeacher(sub.id, div.id, day, slot.slotNumber);
        if (!t) continue;
        placeEntry(div.id, t.id, sub.id, day, slot.slotNumber);
        scheduled += 1;
        stats.placed += 1;
      }
    }
  }

  return stats;
}

/**
 * Run gap utilization up to maxIterations times until no placements are made.
 */
export function runGapUtilizationPassIterative(ctx, options = {}) {
  const maxIterations = Math.max(1, Math.min(5, Number(options.maxIterations) || 3));
  const merged = { iterations: 0, attempts: 0, placed: 0 };
  for (let i = 0; i < maxIterations; i++) {
    const pass = runGapUtilizationPass(ctx);
    merged.iterations = i + 1;
    merged.attempts += pass.attempts;
    merged.placed += pass.placed;
    if (pass.placed === 0) break;
  }
  return merged;
}

/**
 * Per division: fill any empty lesson cell with a still-short subject for that class.
 */
export function runDivisionCentricFillPass(ctx) {
  const stats = { attempts: 0, placed: 0 };
  const {
    divisions,
    workingDays,
    lessonSlots,
    subjects,
    subjectAppliesToDivision,
    getDivisionSubjectLimits,
    subjectAllocations,
    subjectWeeklyCount,
    subWKey,
    dSlotKey,
    divisionSlotMap,
    findEligibleTeacher,
    placeEntry,
    isDayBlockedByRule,
    isSlotBlockedByRule,
    isPlacementAllowedByIncludeOnly,
    periodSlots,
    rules,
    pinnedCells,
    cellKey,
  } = ctx;

  for (const div of divisions) {
    const shortSubjects = subjects
      .filter((sub) => subjectAppliesToDivision(sub, div))
      .map((sub) => {
        const { weeklyPeriods: required } = getDivisionSubjectLimits(sub, div.id, subjectAllocations);
        const scheduled = subjectWeeklyCount.get(subWKey(div.id, sub.id)) || 0;
        return { sub, required, scheduled, short: required - scheduled };
      })
      .filter((x) => x.short > 0)
      .sort((a, b) => b.sub.priorityWeight - a.sub.priorityWeight || b.short - a.short);

    if (shortSubjects.length === 0) continue;

    for (const day of workingDays) {
      for (const slot of lessonSlots) {
        if (!slotActiveOnWeekday(slot, day)) continue;
        const key = dSlotKey(div.id, day, slot.slotNumber);
        if (divisionSlotMap.has(key)) continue;
        if (pinnedCells?.has(cellKey(div.id, day, slot.slotNumber))) continue;

        for (const { sub } of shortSubjects) {
          const { weeklyPeriods: required, maxPerDay } = getDivisionSubjectLimits(sub, div.id, subjectAllocations);
          const scheduled = subjectWeeklyCount.get(subWKey(div.id, sub.id)) || 0;
          if (scheduled >= required) continue;
          if (isDayBlockedByRule(sub.id, day, rules)) continue;
          if ((ctx.subjectDailyCount.get(ctx.subDKey(div.id, sub.id, day)) || 0) >= (maxPerDay || 2)) continue;
          if (isSlotBlockedByRule(sub.id, slot.slotNumber, periodSlots, rules)) continue;
          if (!isPlacementAllowedByIncludeOnly(sub.id, div.id, day, slot.slotNumber, periodSlots, workingDays, rules)) {
            continue;
          }
          stats.attempts += 1;
          const t = findEligibleTeacher(sub.id, div.id, day, slot.slotNumber);
          if (!t) continue;
          placeEntry(div.id, t.id, sub.id, day, slot.slotNumber);
          stats.placed += 1;
          break;
        }
      }
    }
  }

  return stats;
}

/**
 * Try moving a blocking teacher lesson to a free slot so a short subject can use the teacher's slot.
 */
export function tryCrossDivisionUnblockPass(ctx, options = {}) {
  const maxAttempts = Math.max(4, Math.min(80, Number(options.maxAttempts) || 24));
  const stats = { attempts: 0, unblocks: 0 };
  const shortages = [];
  for (const div of ctx.divisions) {
    for (const sub of ctx.subjects) {
      if (!ctx.subjectAppliesToDivision(sub, div)) continue;
      const { weeklyPeriods: required } = ctx.getDivisionSubjectLimits(sub, div.id, ctx.subjectAllocations);
      const scheduled = ctx.subjectWeeklyCount.get(ctx.subWKey(div.id, sub.id)) || 0;
      if (scheduled < required) {
        shortages.push({ div, sub, short: required - scheduled });
      }
    }
  }
  shortages.sort((a, b) => b.sub.priorityWeight - a.sub.priorityWeight || b.short - a.short);

  for (const { div, sub } of shortages) {
    if (stats.attempts >= maxAttempts) break;
    const { weeklyPeriods: required } = ctx.getDivisionSubjectLimits(sub, div.id, ctx.subjectAllocations);
    if ((ctx.subjectWeeklyCount.get(ctx.subWKey(div.id, sub.id)) || 0) >= required) continue;

    for (const day of ctx.workingDays) {
      if (stats.attempts >= maxAttempts) break;
      for (const slot of ctx.lessonSlots) {
        if (stats.attempts >= maxAttempts) break;
        if (!slotActiveOnWeekday(slot, day)) continue;
        if (!ctx.divisionSlotMap.has(ctx.dSlotKey(div.id, day, slot.slotNumber))) continue;
        stats.attempts += 1;
        const blocker = ctx.entries.find(
          (e) =>
            e.teacherId &&
            !e.isFreePeriod &&
            e.slotType === "LESSON" &&
            e.dayOfWeek === day &&
            Number(e.slotNumber) === Number(slot.slotNumber) &&
            e.divisionId !== div.id,
        );
        if (!blocker) continue;
        if (ctx.pinnedCells?.has(ctx.cellKey(blocker.divisionId, day, slot.slotNumber))) continue;

        for (const altDay of ctx.workingDays) {
          for (const altSlot of ctx.lessonSlots) {
            if (!slotActiveOnWeekday(altSlot, altDay)) continue;
            if (ctx.divisionSlotMap.has(ctx.dSlotKey(blocker.divisionId, altDay, altSlot.slotNumber))) continue;
            const snap = ctx.capturePlacementState?.();
            if (!snap || !ctx.removeLessonEntry(blocker)) continue;
            if (
              !ctx.placeLessonAt(blocker.divisionId, blocker.teacherId, blocker.subjectId, altDay, altSlot.slotNumber, {
                ignoreSoftRules: false,
              })
            ) {
              ctx.restorePlacementState?.(snap);
              continue;
            }
            const t = ctx.findEligibleTeacher(sub.id, div.id, day, slot.slotNumber);
            if (t && ctx.canPlaceAssignment({
              teacher: t,
              divisionId: div.id,
              day,
              slotNumber: slot.slotNumber,
              subjectId: sub.id,
              ignoreSoftRules: false,
            }).ok) {
              ctx.placeEntry(div.id, t.id, sub.id, day, slot.slotNumber);
              stats.unblocks += 1;
              break;
            }
            ctx.restorePlacementState?.(snap);
          }
          if (stats.unblocks > 0) break;
        }
        if (stats.unblocks > 0) break;
      }
    }
  }

  return stats;
}

/**
 * Place two consecutive lesson slots when subject.requiresDoublePeriod and weekly count allows pairs.
 */
export function tryAllocateSubjectDoubleBlock(ctx, div, sub) {
  if (!sub?.requiresDoublePeriod) return { placed: 0 };
  const { weeklyPeriods: required } = ctx.getDivisionSubjectLimits(sub, div.id, ctx.subjectAllocations);
  let scheduled = ctx.subjectWeeklyCount.get(ctx.subWKey(div.id, sub.id)) || 0;
  if (scheduled + 2 > required) return { placed: 0 };

  const stats = { placed: 0 };
  const pairs = [];
  const slots = ctx.lessonSlots;
  for (let i = 0; i < slots.length - 1; i++) {
    pairs.push([slots[i], slots[i + 1]]);
  }

  for (const day of ctx.workingDays) {
    if (scheduled >= required) break;
    if (ctx.isDayBlockedByRule(sub.id, day, ctx.rules)) continue;
    if (
      (ctx.subjectDailyCount.get(ctx.subDKey(div.id, sub.id, day)) || 0) >=
      (ctx.getDivisionSubjectLimits(sub, div.id, ctx.subjectAllocations).maxPerDay || 2)
    ) {
      continue;
    }

    for (const [a, b] of pairs) {
      if (scheduled + 2 > required) break;
      if (!slotActiveOnWeekday(a, day) || !slotActiveOnWeekday(b, day)) continue;
      const k1 = ctx.dSlotKey(div.id, day, a.slotNumber);
      const k2 = ctx.dSlotKey(div.id, day, b.slotNumber);
      if (ctx.divisionSlotMap.has(k1) || ctx.divisionSlotMap.has(k2)) continue;

      const t = ctx.findEligibleTeacher(sub.id, div.id, day, a.slotNumber);
      if (!t) continue;
      const check1 = ctx.canPlaceAssignment({
        teacher: t,
        divisionId: div.id,
        day,
        slotNumber: a.slotNumber,
        subjectId: sub.id,
        ignoreSoftRules: false,
      });
      const check2 = ctx.canPlaceAssignment({
        teacher: t,
        divisionId: div.id,
        day,
        slotNumber: b.slotNumber,
        subjectId: sub.id,
        ignoreSoftRules: false,
      });
      if (!check1.ok || !check2.ok) continue;

      ctx.placeEntry(div.id, t.id, sub.id, day, a.slotNumber, { isDouble: true });
      ctx.placeEntry(div.id, t.id, sub.id, day, b.slotNumber, { isDouble: true });
      scheduled += 2;
      stats.placed += 2;
    }
  }

  return stats;
}

/**
 * Spread subject lessons across weekdays when one day is overloaded vs fair share.
 */
export function runDistributionPass(ctx) {
  const stats = { relocations: 0, attempts: 0 };
  const {
    divisions,
    workingDays,
    lessonSlots,
    subjects,
    subjectAppliesToDivision,
    getDivisionSubjectLimits,
    subjectAllocations,
    subjectWeeklyCount,
    subjectDailyCount,
    subWKey,
    subDKey,
    listLessonEntries,
    removeLessonEntry,
    placeLessonAt,
    isDayBlockedByRule,
    rules,
    pinnedCells,
    cellKey,
  } = ctx;

  for (const div of divisions) {
    for (const sub of subjects) {
      if (!subjectAppliesToDivision(sub, div)) continue;
      const { weeklyPeriods: required, maxPerDay } = getDivisionSubjectLimits(sub, div.id, subjectAllocations);
      const scheduled = subjectWeeklyCount.get(subWKey(div.id, sub.id)) || 0;
      if (scheduled < 2) continue;

      const fairPerDay = Math.max(1, Math.ceil(required / Math.max(1, workingDays.length)));
      const dayLoads = workingDays.map((day) => ({
        day,
        count: subjectDailyCount.get(subDKey(div.id, sub.id, day)) || 0,
      }));
      const busiest = [...dayLoads].sort((a, b) => b.count - a.count)[0];
      const lightest = [...dayLoads].sort((a, b) => a.count - b.count)[0];
      if (!busiest || !lightest || busiest.count <= fairPerDay || lightest.count >= busiest.count - 1) continue;
      if (busiest.count <= (maxPerDay || 2) && busiest.count - lightest.count < 2) continue;

      const lessons = listLessonEntries().filter(
        (e) => e.divisionId === div.id && e.subjectId === sub.id && !e.isFreePeriod,
      );
      const movable = lessons.filter(
        (e) =>
          e.dayOfWeek === busiest.day &&
          !pinnedCells?.has(cellKey(e.divisionId, e.dayOfWeek, e.slotNumber)),
      );
      if (movable.length === 0) continue;

      const entry = movable[movable.length - 1];
      stats.attempts += 1;
      if (isDayBlockedByRule(sub.id, lightest.day, rules)) continue;
      if ((subjectDailyCount.get(subDKey(div.id, sub.id, lightest.day)) || 0) >= (maxPerDay || 2)) continue;

      for (const slot of lessonSlots) {
        if (!slotActiveOnWeekday(slot, lightest.day)) continue;
        const ck = cellKey(div.id, lightest.day, slot.slotNumber);
        if (pinnedCells?.has(ck)) continue;
        if (!removeLessonEntry(entry)) break;
        if (
          placeLessonAt(div.id, entry.teacherId, sub.id, lightest.day, slot.slotNumber, {
            ignoreSoftRules: false,
          })
        ) {
          stats.relocations += 1;
          break;
        }
        placeLessonAt(div.id, entry.teacherId, sub.id, entry.dayOfWeek, entry.slotNumber, {
          ignoreSoftRules: false,
        });
      }
    }
  }

  return stats;
}

/**
 * Break "same period every day" columns: relocate lessons to under-used slot numbers when rules allow.
 */
export function runPeriodSpreadPass(ctx, options = {}) {
  const stats = { attempts: 0, relocations: 0, subjectsAdjusted: 0 };
  const dominanceRatio = Number(options.dominanceRatio) > 0 ? Number(options.dominanceRatio) : 0.75;
  const minLessons = Number(options.minLessons) > 0 ? Number(options.minLessons) : 2;

  const {
    divisions,
    workingDays,
    lessonSlots,
    subjects,
    subjectAppliesToDivision,
    getDivisionSubjectLimits,
    subjectAllocations,
    subjectDailyCount,
    subDKey,
    listLessonEntries,
    removeLessonEntry,
    placeLessonAt,
    isDayBlockedByRule,
    isSlotBlockedByRule,
    isPlacementAllowedByIncludeOnly,
    periodSlots,
    rules,
    pinnedCells,
    cellKey,
  } = ctx;

  for (const div of divisions) {
    for (const sub of subjects) {
      if (!subjectAppliesToDivision(sub, div)) continue;

      const lessons = listLessonEntries().filter(
        (e) => e.divisionId === div.id && e.subjectId === sub.id && !e.isFreePeriod && e.slotType === "LESSON",
      );
      if (lessons.length < minLessons) continue;

      const bySlot = new Map();
      for (const e of lessons) {
        const sn = Number(e.slotNumber);
        bySlot.set(sn, (bySlot.get(sn) || 0) + 1);
      }
      const ranked = [...bySlot.entries()].sort((a, b) => b[1] - a[1]);
      const [dominantSlot, dominantCount] = ranked[0];
      if (dominantCount / lessons.length < dominanceRatio) continue;

      const movable = lessons.filter(
        (e) =>
          Number(e.slotNumber) === Number(dominantSlot) &&
          !pinnedCells?.has(cellKey(e.divisionId, e.dayOfWeek, e.slotNumber)),
      );
      if (movable.length === 0) continue;

      const altSlotNums = lessonSlots
        .map((s) => Number(s.slotNumber))
        .filter((sn) => sn !== Number(dominantSlot))
        .sort((a, b) => (bySlot.get(a) || 0) - (bySlot.get(b) || 0));

      let moved = false;
      for (const entry of movable.slice().reverse()) {
        if (moved) break;
        stats.attempts += 1;

        for (const slotNum of altSlotNums) {
          const slotRow = lessonSlots.find((s) => Number(s.slotNumber) === slotNum);
          if (!slotRow || !slotActiveOnWeekday(slotRow, entry.dayOfWeek)) continue;
          if (isDayBlockedByRule(sub.id, entry.dayOfWeek, rules)) continue;
          if (isSlotBlockedByRule(sub.id, slotNum, periodSlots, rules)) continue;
          if (
            !isPlacementAllowedByIncludeOnly(
              sub.id,
              div.id,
              entry.dayOfWeek,
              slotNum,
              periodSlots,
              workingDays,
              rules,
            )
          ) {
            continue;
          }
          if (!removeLessonEntry(entry)) break;
          if (
            placeLessonAt(div.id, entry.teacherId, sub.id, entry.dayOfWeek, slotNum, {
              ignoreSoftRules: false,
            })
          ) {
            stats.relocations += 1;
            moved = true;
            break;
          }
          placeLessonAt(div.id, entry.teacherId, sub.id, entry.dayOfWeek, entry.slotNumber, {
            ignoreSoftRules: false,
          });
        }

        if (moved) break;

        const { maxPerDay } = getDivisionSubjectLimits(sub, div.id, subjectAllocations);

        for (const day of workingDays) {
          if (day === entry.dayOfWeek) continue;
          if (isDayBlockedByRule(sub.id, day, rules)) continue;
          if ((subjectDailyCount.get(subDKey(div.id, sub.id, day)) || 0) >= (maxPerDay || 2)) continue;

          for (const slotNum of altSlotNums) {
            const slotRow = lessonSlots.find((s) => Number(s.slotNumber) === slotNum);
            if (!slotRow || !slotActiveOnWeekday(slotRow, day)) continue;
            if (isSlotBlockedByRule(sub.id, slotNum, periodSlots, rules)) continue;
            if (
              !isPlacementAllowedByIncludeOnly(sub.id, div.id, day, slotNum, periodSlots, workingDays, rules)
            ) {
              continue;
            }
            if (!removeLessonEntry(entry)) break;
            if (
              placeLessonAt(div.id, entry.teacherId, sub.id, day, slotNum, {
                ignoreSoftRules: false,
              })
            ) {
              stats.relocations += 1;
              stats.attempts += 1;
              moved = true;
              break;
            }
            placeLessonAt(div.id, entry.teacherId, sub.id, entry.dayOfWeek, entry.slotNumber, {
              ignoreSoftRules: false,
            });
          }
          if (moved) break;
        }
      }

      if (moved) stats.subjectsAdjusted += 1;
    }
  }

  return stats;
}

/**
 * Swap two lessons between teachers when locks allow and it reduces weekly load spread (same subject eligibility).
 */
export function runTeacherLoadBalancePass(ctx) {
  const stats = { swaps: 0, attempts: 0 };
  const { teachers, teacherWeeklyCount, tWeekKey, listLessonEntries, removeLessonEntry, placeLessonAt, canPlaceAssignment } =
    ctx;
  if (!teachers?.length || !teacherWeeklyCount || typeof tWeekKey !== "function") return stats;

  const loads = teachers.map((t) => ({
    t,
    load: teacherWeeklyCount.get(tWeekKey(t.id)) || 0,
    cap: ctx.getTeacherCapacity?.(t)?.effectiveWeeklyMax ?? 999,
  }));
  loads.sort((a, b) => b.load - a.load);
  const heavy = loads.filter((x) => x.load > 0).slice(0, 5);
  const light = [...loads].reverse().filter((x) => x.load < x.cap).slice(0, 5);
  if (heavy.length === 0 || light.length === 0) return stats;

  const lessons = listLessonEntries().filter((e) => !e.isFreePeriod && e.teacherId && e.subjectId);
  for (const hi of heavy) {
    for (const lo of light) {
      if (hi.t.id === lo.t.id) continue;
      const hiLessons = lessons.filter((e) => e.teacherId === hi.t.id);
      for (const entry of hiLessons.slice(0, 8)) {
        stats.attempts += 1;
        const sub = ctx.subjects.find((s) => s.id === entry.subjectId);
        if (!sub) continue;
        const check = canPlaceAssignment({
          teacher: lo.t,
          divisionId: entry.divisionId,
          day: entry.dayOfWeek,
          slotNumber: entry.slotNumber,
          subjectId: entry.subjectId,
          ignoreSoftRules: false,
        });
        if (!check.ok) continue;
        if (!removeLessonEntry(entry)) continue;
        if (placeLessonAt(entry.divisionId, lo.t.id, entry.subjectId, entry.dayOfWeek, entry.slotNumber, { ignoreSoftRules: false })) {
          stats.swaps += 1;
          break;
        }
        placeLessonAt(entry.divisionId, entry.teacherId, entry.subjectId, entry.dayOfWeek, entry.slotNumber, {
          ignoreSoftRules: false,
        });
      }
    }
  }

  return stats;
}

/**
 * Try to place PRACTICAL subjects as adjacent double blocks when weekly demand allows pairs.
 */
export function tryAllocatePracticalDoubleBlock(ctx, div, sub) {
  if (!isPracticalCategory(sub)) return { placed: 0 };
  const { weeklyPeriods: required } = ctx.getDivisionSubjectLimits(sub, div.id, ctx.subjectAllocations);
  let scheduled = ctx.subjectWeeklyCount.get(ctx.subWKey(div.id, sub.id)) || 0;
  if (scheduled >= required) return { placed: 0 };

  const stats = { placed: 0 };
  const pairs = [];
  const slots = ctx.lessonSlots;
  for (let i = 0; i < slots.length - 1; i++) {
    pairs.push([slots[i], slots[i + 1]]);
  }

  for (const day of ctx.workingDays) {
    if (scheduled >= required) break;
    if (ctx.isDayBlockedByRule(sub.id, day, ctx.rules)) continue;
    if ((ctx.subjectDailyCount.get(ctx.subDKey(div.id, sub.id, day)) || 0) >= (ctx.getDivisionSubjectLimits(sub, div.id, ctx.subjectAllocations).maxPerDay || 2)) {
      continue;
    }

    for (const [a, b] of pairs) {
      if (scheduled + 2 > required) break;
      if (!slotActiveOnWeekday(a, day) || !slotActiveOnWeekday(b, day)) continue;
      const k1 = ctx.dSlotKey(div.id, day, a.slotNumber);
      const k2 = ctx.dSlotKey(div.id, day, b.slotNumber);
      if (ctx.divisionSlotMap.has(k1) || ctx.divisionSlotMap.has(k2)) continue;

      const t = ctx.findEligibleTeacher(sub.id, div.id, day, a.slotNumber);
      if (!t) continue;
      const check1 = ctx.canPlaceAssignment({
        teacher: t,
        divisionId: div.id,
        day,
        slotNumber: a.slotNumber,
        subjectId: sub.id,
        ignoreSoftRules: false,
      });
      const check2 = ctx.canPlaceAssignment({
        teacher: t,
        divisionId: div.id,
        day,
        slotNumber: b.slotNumber,
        subjectId: sub.id,
        ignoreSoftRules: false,
      });
      if (!check1.ok || !check2.ok) continue;

      ctx.placeEntry(div.id, t.id, sub.id, day, a.slotNumber, { isDouble: true });
      ctx.placeEntry(div.id, t.id, sub.id, day, b.slotNumber, { isDouble: true });
      scheduled += 2;
      stats.placed += 2;
    }
  }

  return stats;
}

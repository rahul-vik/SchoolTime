/**
 * Lexicographic objective and local search for the legacy greedy engine.
 * Tier 1: maximize scheduled lesson periods.
 * Tier 2: minimize unscheduled period shorts.
 * Tier 3: minimize soft scheduling-rule violations (EXCLUDE_DAY / EXCLUDE_SLOT family).
 */

export function getLegacyLocalSearchIterations(data) {
  const override = data?.legacyEngineOptions?.localSearchIterations;
  if (override !== undefined && override !== null) {
    return Math.max(0, Math.min(80, Number(override) || 0));
  }
  const env = Number(process.env.LEGACY_ENGINE_LOCAL_SEARCH_ITERATIONS);
  if (Number.isFinite(env) && env >= 0) {
    return Math.max(0, Math.min(80, Math.floor(env)));
  }
  return 24;
}

export function getLegacyLocalSearchCandidateLimit(data) {
  const override = data?.legacyEngineOptions?.localSearchCandidates;
  if (override !== undefined && override !== null) {
    return Math.max(4, Math.min(200, Number(override) || 40));
  }
  const env = Number(process.env.LEGACY_ENGINE_LOCAL_SEARCH_CANDIDATES);
  if (Number.isFinite(env) && env > 0) {
    return Math.max(4, Math.min(200, Math.floor(env)));
  }
  return 48;
}

/**
 * @param {object} params
 * @param {Array} params.entries
 * @param {Array} params.divisions
 * @param {Array} params.subjects
 * @param {Function} params.subjectAppliesToDivision
 * @param {Function} params.getDivisionSubjectLimits
 * @param {object} params.subjectAllocations
 * @param {Function} params.countSoftViolations
 */
export function computeLegacyObjective(params) {
  const {
    entries,
    divisions,
    subjects,
    subjectAppliesToDivision,
    getDivisionSubjectLimits,
    subjectAllocations,
    countSoftViolations,
  } = params;

  const lessons = (entries || []).filter((e) => e?.subjectId && !e.isFreePeriod && e.slotType === "LESSON");
  const totalScheduled = lessons.length;

  let totalRequired = 0;
  let unscheduledShort = 0;
  for (const div of divisions || []) {
    for (const sub of subjects || []) {
      if (!subjectAppliesToDivision(sub, div)) continue;
      const { weeklyPeriods: required } = getDivisionSubjectLimits(sub, div.id, subjectAllocations);
      const req = Number(required) || 0;
      totalRequired += req;
      const sched = lessons.filter((e) => e.divisionId === div.id && e.subjectId === sub.id).length;
      if (sched < req) unscheduledShort += req - sched;
    }
  }

  const softViolations = typeof countSoftViolations === "function" ? countSoftViolations(lessons) : 0;
  const score = totalRequired > 0 ? Math.round((totalScheduled / totalRequired) * 100) : 100;

  return { totalScheduled, totalRequired, unscheduledShort, softViolations, score };
}

/** Returns positive if `a` is strictly better than `b`. */
export function compareLexicographicObjective(a, b) {
  if (!b) return 1;
  if (!a) return -1;
  const schedA = Number(a.totalScheduled) || 0;
  const schedB = Number(b.totalScheduled) || 0;
  if (schedA !== schedB) return schedA > schedB ? 1 : -1;
  const shortA = Number(a.unscheduledShort) || 0;
  const shortB = Number(b.unscheduledShort) || 0;
  if (shortA !== shortB) return shortA < shortB ? 1 : -1;
  const softA = Number(a.softViolations) || 0;
  const softB = Number(b.softViolations) || 0;
  if (softA !== softB) return softA < softB ? 1 : -1;
  return 0;
}

function cellKey(divisionId, day, slotNumber) {
  return `${divisionId}:${day}:${Number(slotNumber)}`;
}

/**
 * Local search: gap-fill, relocate movable lessons, same-division swaps.
 * @param {object} ctx — built inside server/engine.js (placement API + maps).
 */
export function runLegacyLocalSearch(ctx) {
  const {
    api,
    buildObjective,
    allowSoftRelaxedPlacement,
    maxIterations,
    maxCandidates,
    stats = {},
  } = ctx;

  const baseStats = {
    iterations: 0,
    gapFills: 0,
    relocations: 0,
    swaps: 0,
    candidatesTried: 0,
    ...stats,
  };

  if (!maxIterations || maxIterations <= 0) {
    return { stats: baseStats, objective: buildObjective() };
  }

  let bestObjective = buildObjective();
  let stagnant = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    baseStats.iterations = iter + 1;
    let improvedThisRound = false;

    const shortages = api.listShortages();
    shortages.sort(
      (a, b) =>
        (b.sub?.priorityWeight || 0) - (a.sub?.priorityWeight || 0) ||
        b.periodsShort - a.periodsShort,
    );

    for (const shortage of shortages) {
      if (shortage.periodsShort <= 0) continue;
      const placed = api.tryPlaceShortage(shortage, { ignoreSoftRules: false });
      baseStats.candidatesTried += 1;
      if (placed) {
        const next = buildObjective();
        if (compareLexicographicObjective(next, bestObjective) >= 0) {
          bestObjective = next;
          baseStats.gapFills += 1;
          improvedThisRound = true;
          stagnant = 0;
        } else {
          api.undoLastPlacement?.();
        }
      }
      if (allowSoftRelaxedPlacement && shortage.periodsShort > 0) {
        const placedSoft = api.tryPlaceShortage(shortage, { ignoreSoftRules: true });
        baseStats.candidatesTried += 1;
        if (placedSoft) {
          const next = buildObjective();
          if (compareLexicographicObjective(next, bestObjective) >= 0) {
            bestObjective = next;
            baseStats.gapFills += 1;
            improvedThisRound = true;
            stagnant = 0;
          } else {
            api.undoLastPlacement?.();
          }
        }
      }
    }

    const movable = api.listMovableLessons().slice(0, maxCandidates);
    for (const lesson of movable) {
      if (baseStats.candidatesTried >= maxCandidates * maxIterations) break;
      const targets = api.listEmptyLessonCells(lesson.divisionId);
      for (const target of targets) {
        if (baseStats.candidatesTried >= maxCandidates * maxIterations) break;
        baseStats.candidatesTried += 1;
        const snap = api.captureState();
        if (!api.removeLessonEntry(lesson)) continue;
        const ok = api.placeLessonAt(
          lesson.divisionId,
          lesson.teacherId,
          lesson.subjectId,
          target.day,
          target.slotNumber,
          { ignoreSoftRules: false, trackStack: false },
        );
        if (!ok) {
          api.restoreState(snap);
          continue;
        }
        const next = buildObjective();
        if (compareLexicographicObjective(next, bestObjective) > 0) {
          bestObjective = next;
          baseStats.relocations += 1;
          improvedThisRound = true;
          stagnant = 0;
          break;
        }
        api.restoreState(snap);
      }
    }

    const lessons = api.listLessonEntries().slice(0, maxCandidates);
    for (let i = 0; i < lessons.length; i++) {
      for (let j = i + 1; j < lessons.length; j++) {
        const a = lessons[i];
        const b = lessons[j];
        if (a.divisionId !== b.divisionId) continue;
        if (api.isCellPinned(a.divisionId, a.dayOfWeek, a.slotNumber)) continue;
        if (api.isCellPinned(b.divisionId, b.dayOfWeek, b.slotNumber)) continue;
        if (baseStats.candidatesTried >= maxCandidates * maxIterations) break;
        baseStats.candidatesTried += 1;
        const snap = api.captureState();
        if (!api.removeLessonEntry(a) || !api.removeLessonEntry(b)) {
          api.restoreState(snap);
          continue;
        }
        const okA = api.placeLessonAt(b.divisionId, b.teacherId, b.subjectId, a.dayOfWeek, a.slotNumber, {
          ignoreSoftRules: false,
          trackStack: false,
        });
        const okB = okA
          ? api.placeLessonAt(a.divisionId, a.teacherId, a.subjectId, b.dayOfWeek, b.slotNumber, {
              ignoreSoftRules: false,
              trackStack: false,
            })
          : false;
        if (!okB) {
          api.restoreState(snap);
          continue;
        }
        const next = buildObjective();
        if (compareLexicographicObjective(next, bestObjective) > 0) {
          bestObjective = next;
          baseStats.swaps += 1;
          improvedThisRound = true;
          stagnant = 0;
        } else {
          api.restoreState(snap);
        }
      }
    }

    if (!improvedThisRound) {
      stagnant += 1;
      if (stagnant >= 3) break;
    }
  }

  return { stats: baseStats, objective: bestObjective };
}

export { cellKey };

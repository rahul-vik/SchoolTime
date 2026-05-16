/**
 * Pre-generate tenant checks: scheduling-rule contradictions and impossible INCLUDE_ONLY rules.
 * Also enriches unscheduled gap rows with labels, teachers, and likely causes.
 */

import { slotActiveOnWeekday, defaultWorkingDaysFallback } from "./periodSlotDays.js";
import {
  subjectsForScheduling,
  teacherAllowedInDivision,
  teacherSubjectAllowedInDivision,
  scopeTenantForScheduling,
  isSubjectSchedulingPaused,
  isDivisionSchedulingPaused,
} from "./divisionScheduling.js";

export function getPeriodSlotMeta(periodSlots) {
  const slots = periodSlots || [];
  const ls = slots.filter((s) => s.slotType === "LESSON").sort((a, b) => a.slotNumber - b.slotNumber);
  if (!ls.length) {
    return { firstMorning: null, firstAfterLunch: null, lastLesson: null, lessonSlots: ls };
  }
  const firstMorning = ls[0].slotNumber;
  const lastLesson = ls[ls.length - 1].slotNumber;
  const lunchNums = slots.filter((s) => s.slotType === "LUNCH").map((s) => s.slotNumber);
  let firstAfterLunch = null;
  if (lunchNums.length > 0) {
    const maxL = Math.max(...lunchNums);
    const after = ls.filter((s) => s.slotNumber > maxL);
    if (after.length) firstAfterLunch = after[0].slotNumber;
  }
  return { firstMorning, firstAfterLunch, lastLesson, lessonSlots: ls };
}

function slotNumbersExcludedBySlotTargets(slotTargets, meta) {
  const s = new Set();
  if (!Array.isArray(slotTargets)) return s;
  for (const t of slotTargets) {
    if (t === "FIRST_MORNING" && meta.firstMorning != null) s.add(meta.firstMorning);
    if (t === "FIRST_AFTER_LUNCH" && meta.firstAfterLunch != null) s.add(meta.firstAfterLunch);
    if (t === "LAST_LESSON" && meta.lastLesson != null) s.add(meta.lastLesson);
  }
  return s;
}

function includeRuleDivisionIds(rule) {
  if (Array.isArray(rule?.divisionIds) && rule.divisionIds.length > 0) return rule.divisionIds;
  if (rule?.divisionId) return [rule.divisionId];
  return [];
}

function activeRulesForSubject(rules, subjectId) {
  return (rules || []).filter((r) => r && r.subjectId === subjectId && r.isActive !== false);
}

function divisionScopeLabel(divIds) {
  if (!divIds.length) return "all divisions";
  return `motionIds ${divIds.join(", ")}`.replace("motionIds", "divisions");
}

/** Same overlap checks as the scheduling UI (exclude day/slot vs fixed placement). */
export function findSubjectSchedulingContradictions(subjectId, rules, periodSlots, workingDays) {
  const rel = activeRulesForSubject(rules, subjectId);
  const meta = getPeriodSlotMeta(periodSlots);
  const issues = [];

  const excludeDay = rel.filter((r) => r.ruleType === "EXCLUDE_DAY");
  const excludeSlot = rel.filter((r) => r.ruleType === "EXCLUDE_SLOT");
  const includeOnly = rel.filter((r) => r.ruleType === "INCLUDE_ONLY");

  for (const inc of includeOnly) {
    const divIds = includeRuleDivisionIds(inc);
    const scope = divisionScopeLabel(divIds);

    if (inc.includeMode === "CUSTOM") {
      const cells = (inc.allowedCells || []).filter(Boolean);
      const exDays = new Set();
      for (const ex of excludeDay) {
        for (const d of ex.dayOfWeekList || (ex.dayOfWeek ? [ex.dayOfWeek] : [])) exDays.add(d);
      }
      for (const cell of cells) {
        if (exDays.has(cell.dayOfWeek)) {
          issues.push({
            code: "RULE_CONTRADICTION_EXCLUDE_DAY_INCLUDE",
            severity: "error",
            subjectId,
            ruleId: inc.id,
            message: `Fixed day & period (${cell.dayOfWeek} slot ${cell.slotNumber}) overlaps an excluded weekday for the same subject (${scope}).`,
          });
        }
      }
      const excludedSlots = new Set();
      for (const ex of excludeSlot) {
        for (const n of slotNumbersExcludedBySlotTargets(ex.slotTargets, meta)) excludedSlots.add(n);
        if (ex.slotNumber != null) excludedSlots.add(Number(ex.slotNumber));
      }
      for (const cell of cells) {
        if (excludedSlots.has(Number(cell.slotNumber))) {
          issues.push({
            code: "RULE_CONTRADICTION_EXCLUDE_SLOT_INCLUDE",
            severity: "error",
            subjectId,
            ruleId: inc.id,
            message: `Fixed day & period uses slot ${cell.slotNumber} which is also excluded for this subject (${scope}).`,
          });
        }
      }
    }

    if (inc.includeMode === "PRESET_LAST_LESSON") {
      const weekday = inc.includeWeekday || "FRIDAY";
      const wd = defaultWorkingDaysFallback(workingDays);
      if (!wd.includes(weekday)) {
        issues.push({
          code: "INCLUDE_ONLY_PRESET_NON_WORKING_DAY",
          severity: "error",
          subjectId,
          ruleId: inc.id,
          message: `Last-lesson fixed rule uses ${weekday}, which is not a working day (${scope}).`,
        });
        continue;
      }
      const slotRow = (periodSlots || []).find((s) => Number(s.slotNumber) === Number(meta.lastLesson));
      if (slotRow && !slotActiveOnWeekday(slotRow, weekday)) {
        issues.push({
          code: "INCLUDE_ONLY_PRESET_SLOT_INACTIVE",
          severity: "error",
          subjectId,
          ruleId: inc.id,
          message: `Last-lesson slot ${meta.lastLesson} is inactive on ${weekday} (${scope}).`,
        });
      }
    }
  }

  return issues;
}

function validIncludeOnlyCells(rule, periodSlots, workingDays) {
  if (rule.includeMode !== "CUSTOM") return [];
  const wd = defaultWorkingDaysFallback(workingDays);
  return (rule.allowedCells || []).filter((c) => {
    if (!c?.dayOfWeek || !wd.includes(c.dayOfWeek)) return false;
    const row = (periodSlots || []).find((s) => Number(s.slotNumber) === Number(c.slotNumber));
    return row && slotActiveOnWeekday(row, c.dayOfWeek);
  });
}

export function findImpossibleIncludeOnlyRules(rules, periodSlots, workingDays) {
  const issues = [];
  const meta = getPeriodSlotMeta(periodSlots);
  const wd = defaultWorkingDaysFallback(workingDays);

  for (const rule of rules || []) {
    if (!rule || rule.ruleType !== "INCLUDE_ONLY" || rule.isActive === false) continue;
    const divIds = includeRuleDivisionIds(rule);
    const scope = divisionScopeLabel(divIds);

    if (rule.includeMode === "CUSTOM") {
      const raw = (rule.allowedCells || []).filter(Boolean);
      const valid = validIncludeOnlyCells(rule, periodSlots, workingDays);
      if (raw.length > 0 && valid.length === 0) {
        issues.push({
          code: "INCLUDE_ONLY_CUSTOM_NO_VALID_CELLS",
          severity: "error",
          subjectId: rule.subjectId,
          ruleId: rule.id,
          message: `Fixed placement (CUSTOM) has no valid cells after period weekdays (${scope}).`,
        });
      } else if (raw.length === 0) {
        issues.push({
          code: "INCLUDE_ONLY_CUSTOM_EMPTY",
          severity: "error",
          subjectId: rule.subjectId,
          ruleId: rule.id,
          message: `Fixed placement (CUSTOM) is active but has no allowed cells (${scope}).`,
        });
      }
    }

    if (rule.includeMode === "PRESET_LAST_LESSON") {
      const weekday = rule.includeWeekday || "FRIDAY";
      if (!wd.includes(weekday)) {
        issues.push({
          code: "INCLUDE_ONLY_PRESET_NON_WORKING_DAY",
          severity: "error",
          subjectId: rule.subjectId,
          ruleId: rule.id,
          message: `Last-lesson fixed rule uses ${weekday}, not a working day (${scope}).`,
        });
      } else {
        const slotRow = (periodSlots || []).find((s) => Number(s.slotNumber) === Number(meta.lastLesson));
        if (slotRow && !slotActiveOnWeekday(slotRow, weekday)) {
          issues.push({
            code: "INCLUDE_ONLY_PRESET_SLOT_INACTIVE",
            severity: "error",
            subjectId: rule.subjectId,
            ruleId: rule.id,
            message: `Last-lesson slot ${meta.lastLesson} is inactive on ${weekday} (${scope}).`,
          });
        }
      }
    }
  }

  return issues;
}

export function runTenantPreflightCheck(state) {
  const rules = state?.schedulingRules || [];
  const periodSlots = state?.periodSlots || [];
  const workingDays = state?.workingDays || [];
  const subjects = subjectsForScheduling(state?.subjects || []);

  const issues = [];
  const seen = new Set();

  for (const sub of subjects) {
    for (const item of findSubjectSchedulingContradictions(sub.id, rules, periodSlots, workingDays)) {
      const key = `${item.code}:${item.subjectId}:${item.ruleId || ""}:${item.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push(item);
    }
  }

  for (const item of findImpossibleIncludeOnlyRules(rules, periodSlots, workingDays)) {
    const key = `${item.code}:${item.subjectId}:${item.ruleId || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push(item);
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return {
    ok: errors.length === 0,
    issueCount: issues.length,
    errorCount: errors.length,
    warningCount: warnings.length,
    issues,
    errors,
    warnings,
  };
}

function getDivisionRequiredWeekly(subject, divisionId, subjectAllocations) {
  const limit = (subject?.divisionLimits || []).find((dl) => String(dl.divisionId) === String(divisionId));
  if (limit && Number(limit.weeklyPeriods) > 0) return Number(limit.weeklyPeriods);
  const legacy = (subjectAllocations || []).find(
    (a) => String(a.divisionId) === String(divisionId) && String(a.subjectId) === String(subject?.id),
  );
  if (legacy && Number(legacy.weeklyPeriods) > 0) return Number(legacy.weeklyPeriods);
  return Math.max(0, Number(subject?.weeklyPeriods) || 0);
}

function teacherLabel(t) {
  if (!t) return "";
  return `${t.firstName || ""} ${t.lastName || ""}`.trim() || t.employeeCode || t.id;
}

export function listEligibleTeachersForDivisionSubject(state, subjectId, divisionId) {
  const scoped = scopeTenantForScheduling(state);
  const div = (scoped.divisions || []).find((d) => String(d.id) === String(divisionId));
  if (!div) return [];
  const subject = (scoped.subjects || []).find((s) => String(s.id) === String(subjectId));
  if (!subject) return [];

  let candidates = (scoped.teachers || []).filter(
    (t) =>
      (t.subjectIds || []).includes(subjectId) &&
      (t.mediumIds || []).includes(div.mediumId) &&
      teacherAllowedInDivision(t, divisionId) &&
      teacherSubjectAllowedInDivision(t, subjectId, divisionId),
  );

  const explicit = (state.teacherSubjects || [])
    .filter((ts) => String(ts.subjectId) === String(subjectId) && (!ts.divisionId || String(ts.divisionId) === String(divisionId)))
    .map((ts) => (scoped.teachers || []).find((t) => String(t.id) === String(ts.teacherId)))
    .filter(Boolean);

  if (explicit.length > 0) {
    candidates = explicit.filter(
      (t) =>
        (t.mediumIds || []).includes(div.mediumId) &&
        teacherAllowedInDivision(t, divisionId) &&
        teacherSubjectAllowedInDivision(t, subjectId, divisionId),
    );
  }

  return candidates;
}

function includeOnlyRulesFor(subjectId, divisionId, rules) {
  return (rules || []).filter(
    (r) =>
      r &&
      r.ruleType === "INCLUDE_ONLY" &&
      r.isActive !== false &&
      r.subjectId === subjectId &&
      includeRuleDivisionIds(r).includes(divisionId),
  );
}

function describeIncludeOnlyRules(rules, subjectId, divisionId, periodSlots, workingDays) {
  const rel = includeOnlyRulesFor(subjectId, divisionId, rules);
  return rel.map((r) => {
    if (r.includeMode === "CUSTOM") {
      const n = validIncludeOnlyCells(r, periodSlots, workingDays).length;
      return `CUSTOM (${n} valid cell${n === 1 ? "" : "s"})`;
    }
    if (r.includeMode === "PRESET_LAST_LESSON") {
      return `PRESET last lesson on ${r.includeWeekday || "FRIDAY"}`;
    }
    return String(r.includeMode || "INCLUDE_ONLY");
  });
}

function likelyCausesForGap({ row, state, eligibleTeachers, includeOnlyDesc, required, teachersScheduled = [] }) {
  const causes = [];
  const div = (state.divisions || []).find((d) => String(d.id) === String(row.divisionId));
  const sub = (state.subjects || []).find((s) => String(s.id) === String(row.subjectId));

  if (div && isDivisionSchedulingPaused(div)) causes.push("Division is paused for scheduling");
  if (sub && isSubjectSchedulingPaused(sub)) causes.push("Subject is paused for scheduling");
  if (eligibleTeachers.length === 0) {
    if (teachersScheduled.length > 0) {
      causes.push("Teachers on the timetable are not in the active scheduling scope for this class (division restrictions or paused divisions)");
    } else {
      causes.push("No active teacher in scope for this class–subject (check assignments, mediums, division restrictions)");
    }
  }

  if (includeOnlyDesc.length > 0) {
    const tight = includeOnlyDesc.some((d) => d.startsWith("CUSTOM"));
    if (tight && required > 1) causes.push("Fixed placement (CUSTOM) may allow fewer slots than weekly periods required");
    if (includeOnlyDesc.some((d) => d.startsWith("PRESET"))) causes.push("Fixed last-lesson rule limits when this subject can be placed");
  }

  if (row.periodsScheduled === 0) {
    causes.push("Nothing placed — often teacher capacity, strict rules, or no eligible teacher");
  } else if (row.periodsShort > 0) {
    causes.push("Partial fill — teacher weekly/daily caps, slot rules, or competition with other classes");
  }

  return causes;
}

/**
 * Enrich engine unscheduled rows with human labels and diagnostic hints.
 */
export function traceUnscheduledRows(state, unscheduled, options = {}) {
  const rules = state?.schedulingRules || [];
  const periodSlots = state?.periodSlots || [];
  const workingDays = state?.workingDays || [];
  const standards = state?.standards || [];
  const divisions = state?.divisions || [];
  const subjects = state?.subjects || [];
  const subjectAllocations = state?.subjectAllocations || [];
  const entries = options.entries || [];

  const stdById = new Map(standards.map((s) => [String(s.id), s]));
  const divById = new Map(divisions.map((d) => [String(d.id), d]));
  const subById = new Map(subjects.map((s) => [String(s.id), s]));

  function divisionLabel(divisionId) {
    const d = divById.get(String(divisionId));
    if (!d) return String(divisionId);
    const st = stdById.get(String(d.standardId));
    return `Std ${st?.name ?? "?"}-${d.name ?? "?"}`;
  }

  function subjectLabel(subjectId) {
    const s = subById.get(String(subjectId));
    if (!s) return String(subjectId);
    return s.code ? `${s.code} (${s.name})` : s.name || String(subjectId);
  }

  const rows = (unscheduled || []).filter((u) => Number(u.periodsShort) > 0);
  const traced = rows.map((row) => {
    const eligible = listEligibleTeachersForDivisionSubject(state, row.subjectId, row.divisionId);
    const includeOnly = describeIncludeOnlyRules(rules, row.subjectId, row.divisionId, periodSlots, workingDays);
    const sub = subById.get(String(row.subjectId));
    const required = sub ? getDivisionRequiredWeekly(sub, row.divisionId, subjectAllocations) : row.periodsRequired;

    const teachersScheduled = [
      ...new Set(
        entries
          .filter(
            (e) =>
              String(e.divisionId) === String(row.divisionId) &&
              String(e.subjectId) === String(row.subjectId) &&
              e.teacherId &&
              !e.isFreePeriod &&
              e.slotType !== "BREAK" &&
              e.slotType !== "LUNCH",
          )
          .map((e) => String(e.teacherId)),
      ),
    ].map((id) => {
      const t = (state.teachers || []).find((x) => String(x.id) === id);
      return teacherLabel(t) || id;
    });

    return {
      ...row,
      divisionLabel: divisionLabel(row.divisionId),
      subjectLabel: subjectLabel(row.subjectId),
      eligibleTeachers: eligible.map(teacherLabel),
      teachersScheduled,
      includeOnlyRules: includeOnly,
      likelyCauses: likelyCausesForGap({
        row,
        state,
        eligibleTeachers: eligible,
        includeOnlyDesc: includeOnly,
        required,
        teachersScheduled,
      }),
    };
  });

  traced.sort((a, b) => b.periodsShort - a.periodsShort || a.divisionLabel.localeCompare(b.divisionLabel));

  const bySubject = new Map();
  for (const r of traced) {
    const key = r.subjectLabel;
    if (!bySubject.has(key)) bySubject.set(key, { subjectLabel: key, periodsShort: 0, rows: [] });
    const g = bySubject.get(key);
    g.periodsShort += r.periodsShort;
    g.rows.push(r);
  }

  return {
    totalPeriodsShort: traced.reduce((n, r) => n + r.periodsShort, 0),
    rowCount: traced.length,
    rows: traced,
    bySubject: [...bySubject.values()].sort((a, b) => b.periodsShort - a.periodsShort),
  };
}
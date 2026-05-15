import { findEntityById, pickTimetableSnapshotLists } from "./idLookups.js";

/**
 * Plain-language summary and fix steps when a timetable did not place every required lesson.
 */
export function buildCompletionInsights({
  completionPct,
  timetable,
  subjects,
  divisions,
  standards,
  teachers,
  schedulingRules,
  restrictedTeachers,
}) {
  if (!timetable) return { summary: null, bullets: [] };

  const report = timetable.report || {};
  const unscheduled = [...(report.unscheduled || [])].sort((a, b) => (b.periodsShort || 0) - (a.periodsShort || 0));
  const required = report.totalRequired || 0;
  const scheduled = report.totalScheduled || 0;
  const shortfall = Math.max(0, required - scheduled);
  const activeRules = (schedulingRules || []).filter((r) => r.isActive).length;
  const mode = timetable?.sourceState?.classTeacherPreferences?.schedulingMode || report?.optimization?.mode || "STRICT";

  if (shortfall <= 0 && unscheduled.length === 0 && (completionPct || 0) >= 100) {
    return { summary: null, bullets: [] };
  }

  const { divisions: divList, standards: stdList, subjects: subList } = pickTimetableSnapshotLists(timetable, {
    divisions,
    standards,
    subjects,
  });

  const divisionLabel = (divisionId) => {
    const div = findEntityById(divList, divisionId);
    if (!div) return "A class";
    const std = findEntityById(stdList, div.standardId);
    return `Std ${std?.name ?? "?"} — Div ${div.name}`;
  };

  const summary =
    shortfall > 0
      ? `The timetable placed ${scheduled} of ${required} required weekly lessons. You still need ${shortfall} more slot${shortfall === 1 ? "" : "s"} to match your subject hours.`
      : `${unscheduled.length} class–subject row${unscheduled.length === 1 ? "" : "s"} still need more lessons. Adjust setup below, then create the timetable again.`;

  const bullets = [];

  bullets.push(
    "For each row listed below: open Teachers and confirm someone teaches that subject in the right medium and is allowed for that class.",
  );

  if (mode === "STRICT") {
    bullets.push(
      "Scheduling mode is Strict — day and period blocks are never skipped. On Create, try Best fit or Optimal if you can relax some “do not use this day/slot” rules.",
    );
  } else {
    bullets.push(
      "You already use a flexible scheduling mode. If gaps remain, loosen subject preferences (blocked days/slots) or add another teacher for busy subjects.",
    );
  }

  const topGaps = unscheduled.slice(0, 4);
  for (const u of topGaps) {
    const sub = findEntityById(subList, u.subjectId);
    const name = sub?.name || sub?.code || "that subject";
    const where = divisionLabel(u.divisionId);
    const n = u.periodsShort || 0;
    if (n <= 0) continue;
    const req = u.periodsRequired ?? "?";
    const got = u.periodsScheduled ?? "?";
    bullets.push(`${where}, ${name}: add ${n} more lesson${n === 1 ? "" : "s"} per week (${got} of ${req} placed so far).`);
  }
  if (unscheduled.length > topGaps.length) {
    bullets.push(
      `${unscheduled.length - topGaps.length} more class–subject row${unscheduled.length - topGaps.length === 1 ? "" : "s"} are short — see Reports → Division completion for the full list.`,
    );
  }

  if (activeRules > 0) {
    bullets.push(
      `You have ${activeRules} active placement preference${activeRules === 1 ? "" : "s"}. Turn off or soften rules that block days or periods for subjects that show gaps (Preferences screen).`,
    );
  }

  if (restrictedTeachers > 0) {
    bullets.push(
      `${restrictedTeachers} teacher${restrictedTeachers === 1 ? " is" : "s are"} limited to certain classes only. Allow more teachers for that subject, or remove the class limit.`,
    );
  }

  if ((teachers || []).length < 2 && (divisions || []).length > 0) {
    bullets.push("Very few teachers — add staff or reduce weekly periods on heavy subjects.");
  }

  bullets.push(
    "If the week is full: add a school day or lesson period under Periods, or lower weekly periods for that subject under Subjects.",
  );

  bullets.push("After changes, go to Create and generate the timetable again.");

  return { summary, bullets: bullets.slice(0, 9) };
}

/** One-line label for an unscheduled row (for chips / lists). */
export function formatUnscheduledGapLabel(u, { subjects, divisions, standards }) {
  const sub = findEntityById(subjects, u.subjectId);
  const div = findEntityById(divisions, u.divisionId);
  const std = div ? findEntityById(standards, div.standardId) : null;
  const code = sub?.code || sub?.name || "SUB";
  const n = u.periodsShort || 0;
  const req = u.periodsRequired;
  const got = u.periodsScheduled;
  const place =
    req != null && got != null
      ? ` — ${got} of ${req} placed, need ${n} more`
      : n > 0
        ? ` — need ${n} more`
        : "";
  return `Std ${std?.name || "?"} - Div ${div?.name || "?"} - ${code}${place}`;
}

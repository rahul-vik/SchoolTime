/**
 * Offline diagnosis: class free periods vs teacher headroom, unscheduled gaps, multi-teacher locks.
 * Usage: node scripts/diagnose-run-utilization.mjs [path-to-bundle.json]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { slotActiveOnWeekday } from "../shared/periodSlotDays.js";
import { getTeacherEffectiveCapacity } from "../shared/teacherCapacity.js";
import { traceUnscheduledRows } from "../shared/tenantPreflightCheck.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const bundlePath = process.argv[2] || path.join(ROOT, "Results", "SchoolTime-last-run.json");

const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
const { entries = [], sourceState: state = {}, report = {} } = bundle;
const pausedIds = new Set(report.schedulingScope?.pausedDivisionIds || []);
const divisions = (state.divisions || []).filter((d) => !pausedIds.has(d.id));
const teachers = (state.teachers || []).filter((t) => !(t.isPaused || t.paused));
const periodSlots = state.periodSlots || [];
const workingDays = state.workingDays || [];
const lessonSlots = periodSlots.filter((s) => s.slotType === "LESSON");
const subjectAllocations = state.subjectAllocations || [];

function teacherAllowedInDivision(teacher, divisionId) {
  const ad = teacher.assignedDivisionIds || [];
  if (ad.length > 0 && !ad.includes(divisionId)) return false;
  if ((teacher.blockedDivisionIds || []).includes(divisionId)) return false;
  return true;
}

function teachersAssignedToDivision(divId) {
  return teachers.filter((t) => teacherAllowedInDivision(t, divId));
}

function subjectAppliesToDivision(subject, division) {
  if (!(subject.standardIds || []).includes(division.standardId)) return false;
  if (!(subject.mediumIds || []).includes(division.mediumId)) return false;
  const mode = subject.divisionScopeMode === "CUSTOM_DIVISION_OVERRIDES" ? "CUSTOM_DIVISION_OVERRIDES" : "ALL_IN_SELECTED_CLASSES";
  if (mode === "ALL_IN_SELECTED_CLASSES") return true;
  const inc = subject.divisionIncludeIds || [];
  const exc = subject.divisionExcludeIds || [];
  if (inc.length) return inc.includes(division.id);
  if (exc.length) return !exc.includes(division.id);
  return true;
}

function getDivisionLimits(subject, divisionId) {
  const limit = (subject.divisionLimits || []).find((dl) => dl.divisionId === divisionId);
  return {
    weeklyPeriods:
      limit?.weeklyPeriods !== undefined
        ? Math.max(1, Number(limit.weeklyPeriods) || 1)
        : Math.max(1, Number(subject.weeklyPeriods) || 1),
  };
}

const lessons = entries.filter((e) => e.slotType === "LESSON" && !e.isFreePeriod && e.subjectId);
const freeSlots = entries.filter((e) => e.slotType === "LESSON" && e.isFreePeriod);
const teacherLoad = new Map();
const teacherSlotBusy = new Map();
for (const e of lessons) {
  if (!e.teacherId) continue;
  teacherLoad.set(e.teacherId, (teacherLoad.get(e.teacherId) || 0) + 1);
  teacherSlotBusy.set(`${e.teacherId}:${e.dayOfWeek}:${e.slotNumber}`, true);
}

const teacherCaps = new Map(
  teachers.map((t) => [t.id, getTeacherEffectiveCapacity(t, periodSlots, workingDays).effectiveWeekly]),
);

const unscheduledByDiv = new Map();
for (const u of report.unscheduled || []) {
  const k = u.divisionId;
  if (!unscheduledByDiv.has(k)) unscheduledByDiv.set(k, []);
  unscheduledByDiv.get(k).push(u);
}

const utilizationGaps = [];
for (const f of freeSlots) {
  const divId = f.divisionId;
  const day = f.dayOfWeek;
  const slot = Number(f.slotNumber);
  const slotRow = lessonSlots.find((s) => Number(s.slotNumber) === slot);
  if (slotRow && !slotActiveOnWeekday(slotRow, day)) continue;

  const shorts = unscheduledByDiv.get(divId) || [];
  const assignedTeachers = teachersAssignedToDivision(divId);
  const idleWithHeadroom = [];
  for (const t of assignedTeachers) {
    const load = teacherLoad.get(t.id) || 0;
    const cap = teacherCaps.get(t.id) || 0;
    const headroom = cap - load;
    const busyThisSlot = teacherSlotBusy.has(`${t.id}:${day}:${slot}`);
    if (headroom > 0 && !busyThisSlot) {
      idleWithHeadroom.push({ id: t.id, name: `${t.firstName} ${t.lastName}`, load, cap, headroom });
    }
  }
  if (idleWithHeadroom.length > 0 && shorts.length > 0) {
    utilizationGaps.push({
      divisionId: divId,
      day,
      slot,
      idleTeachers: idleWithHeadroom.slice(0, 5),
      unscheduledShorts: shorts.length,
      topShort: shorts.sort((a, b) => b.periodsShort - a.periodsShort)[0],
    });
  }
}

const multiTeacherLocks = [];
for (const div of divisions) {
  for (const sub of state.subjects || []) {
    if (!subjectAppliesToDivision(sub, div)) continue;
    const tids = [
      ...new Set(
        lessons
          .filter((e) => e.divisionId === div.id && e.subjectId === sub.id)
          .map((e) => e.teacherId)
          .filter(Boolean),
      ),
    ];
    if (tids.length > 1) {
      multiTeacherLocks.push({ divisionId: div.id, subjectId: sub.id, teachers: tids });
    }
  }
}

const traced = traceUnscheduledRows(state, report.unscheduled || [], { entries });

console.log("=== Timetable run diagnosis ===");
console.log(`Bundle: ${path.relative(ROOT, bundlePath)}`);
console.log(`Score: ${report.objective?.score ?? bundle.run?.score}% | Scheduled: ${report.objective?.totalScheduled}/${report.objective?.totalRequired}`);
console.log(`Unscheduled shorts: ${report.objective?.unscheduledShort ?? "?"}`);
console.log(`Class Free cells: ${freeSlots.length} | Actual lessons: ${lessons.length}`);
console.log("");

console.log("--- Top rejection reasons (engine) ---");
const rej = report.rejections || {};
Object.entries(rej)
  .filter(([, v]) => v > 0)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8)
  .forEach(([k, v]) => console.log(`  ${k}: ${v}`));
console.log("");

console.log(`--- Utilization gap: Free class slot + idle assigned teacher + unscheduled subject (${utilizationGaps.length} cells) ---`);
for (const g of utilizationGaps.slice(0, 12)) {
  console.log(
    `  Div ${g.divisionId} ${g.day} slot ${g.slot}: ${g.idleTeachers.length} teacher(s) with headroom; ${g.unscheduledShorts} short subject(s)`,
  );
}
if (utilizationGaps.length > 12) console.log(`  ... and ${utilizationGaps.length - 12} more`);
console.log("");

console.log(`--- Multi-teacher for same division+subject (${multiTeacherLocks.length}) ---`);
for (const m of multiTeacherLocks.slice(0, 8)) {
  console.log(`  ${m.divisionId} / ${m.subjectId}: ${m.teachers.join(", ")}`);
}
console.log("");

console.log("--- Unscheduled rows (traced, top 10 by shortfall) ---");
for (const row of traced.slice(0, 10)) {
  console.log(`  ${row.divisionLabel} · ${row.subjectLabel}: short ${row.periodsShort} | eligible: ${row.eligibleTeachers.join(", ") || "none"}`);
  if (row.likelyCauses?.length) console.log(`    → ${row.likelyCauses[0]}`);
}
console.log("");

const teachersUnderUtil = teachers
  .map((t) => {
    const load = teacherLoad.get(t.id) || 0;
    const cap = teacherCaps.get(t.id) || 0;
    return { name: `${t.firstName} ${t.lastName}`, load, cap, headroom: cap - load };
  })
  .filter((x) => x.headroom >= 5)
  .sort((a, b) => b.headroom - a.headroom)
  .slice(0, 10);

console.log("--- Teachers with ≥5 unused weekly periods (top 10) ---");
for (const t of teachersUnderUtil) {
  console.log(`  ${t.name}: ${t.load}/${t.cap} (${t.headroom} free)`);
}

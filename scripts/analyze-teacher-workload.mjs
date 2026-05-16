#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const runPath = process.argv[2] || path.join(root, "Results", "SchoolTime-last-run.json");
const data = JSON.parse(fs.readFileSync(runPath, "utf8"));
const state = data.state || data.timetable?.sourceState || data.sourceState || {};
const tt = data.timetable || data;
const entries = tt.entries || [];
const report = tt.report || data.report || {};
const teachers = state.teachers || [];
const subjects = state.subjects || [];
const divisions = state.divisions || [];
const standards = state.standards || [];

const TARGETS = [
  ["Varsha", "Sali"],
  ["Anil", "Kumar"],
  ["Eashita", "Umesh"],
  ["Lavanya", "K"],
  ["Krishnamoorthi", "KM"],
  ["Roopa", "M N"],
  ["Madhulatha", "Shankar"],
  ["Lakshmi", "S"],
];

const subLabel = (id) => {
  const s = subjects.find((x) => x.id === id);
  return s ? `${s.code || s.name}` : id;
};
const divLabel = (id) => {
  const d = divisions.find((x) => x.id === id);
  const std = standards.find((s) => s.id === d?.standardId);
  return d ? `Std ${std?.name || "?"}-${d.name}` : id;
};

function subjectAppliesToDivision(sub, div) {
  if (!sub || !div) return false;
  if (!(sub.standardIds || []).includes(div.standardId)) return false;
  if (!(sub.mediumIds || []).includes(div.mediumId)) return false;
  const scopeMode = sub.divisionScopeMode === "CUSTOM_DIVISION_OVERRIDES" ? "CUSTOM_DIVISION_OVERRIDES" : "ALL_IN_SELECTED_CLASSES";
  if (scopeMode === "ALL_IN_SELECTED_CLASSES") return true;
  const includeIds = sub.divisionIncludeIds || [];
  const excludeIds = sub.divisionExcludeIds || [];
  if (includeIds.length > 0) return includeIds.includes(div.id);
  if (excludeIds.length > 0) return !excludeIds.includes(div.id);
  return true;
}

function getDivisionRequiredWeekly(sub, divisionId) {
  const limit = (sub.divisionLimits || []).find((dl) => dl.divisionId === divisionId);
  return limit?.weeklyPeriods !== undefined ? Math.max(1, Number(limit.weeklyPeriods) || 1) : Math.max(1, Number(sub.weeklyPeriods) || 1);
}

function countTeaching(teacherId) {
  return entries.filter(
    (e) =>
      String(e.teacherId) === String(teacherId) &&
      !e.isFreePeriod &&
      e.subjectId &&
      e.slotType !== "BREAK" &&
      e.slotType !== "LUNCH",
  ).length;
}

function potentialDemand(teacher) {
  const subjIds = new Set((teacher.subjectIds || []).map(String));
  const mediums = teacher.mediumIds || [];
  const assignedDivIds = teacher.assignedDivisionIds || [];
  let demand = 0;
  const rows = [];
  for (const div of divisions) {
    if (div.schedulingPaused) continue;
    if (assignedDivIds.length > 0 && !assignedDivIds.includes(div.id)) continue;
    if (mediums.length > 0 && !mediums.includes(div.mediumId)) continue;
    for (const sub of subjects) {
      if (!subjIds.has(String(sub.id))) continue;
      if (!subjectAppliesToDivision(sub, div)) continue;
      const req = getDivisionRequiredWeekly(sub, div.id);
      const got = entries.filter((e) => e.divisionId === div.id && e.subjectId === sub.id && String(e.teacherId) === String(teacher.id)).length;
      demand += req;
      rows.push({ div: divLabel(div.id), subject: subLabel(sub.id), required: req, got });
    }
  }
  return { demand, rows };
}

console.log("Run:", data.run?.id, "status:", data.run?.status || tt.status, "score:", data.run?.score ?? tt.score);
console.log("Scheduled:", report.totalScheduled, "/", report.totalRequired, `(${Math.round((report.totalScheduled / report.totalRequired) * 100)}%)`);
console.log("Solver:", JSON.stringify(report.solver || {}));
console.log("Top rejections:", Object.entries(report.rejections || {}).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}=${v}`).join(", "));
console.log("");

for (const [fn, ln] of TARGETS) {
  const t = teachers.find((x) => x.firstName === fn && (ln ? x.lastName?.trim() === ln.trim() : true));
  if (!t) {
    console.log(`--- ${fn} ${ln}: NOT FOUND in state ---\n`);
    continue;
  }
  const assigned = countTeaching(t.id);
  const max = Number(t.maxPerWeek) || 0;
  const { demand, rows } = potentialDemand(t);
  const unsched = (report.unscheduled || []).filter((u) => (t.subjectIds || []).includes(u.subjectId));
  const unschedShort = unsched.reduce((a, u) => a + (u.periodsShort || 0), 0);
  console.log(`--- ${t.firstName} ${t.lastName} (${t.id}) ---`);
  console.log(`  Placed: ${assigned} / maxPerWeek ${max} / potential demand ${demand} periods`);
  console.log(`  Subjects: ${(t.subjectIds || []).map(subLabel).join(", ")}`);
  console.log(`  Division scope: ${(t.assignedDivisionIds || []).length ? t.assignedDivisionIds.map(divLabel).join("; ") : "all applicable classes"}`);
  console.log(`  Free morning/evening: ${t.freeMorningPeriods || 0} / ${t.freeEveningPeriods || 0}`);
  if (unsched.length) console.log(`  Unscheduled rows for their subjects: ${unsched.length} (short by ${unschedShort} periods total)`);
  const bySubject = {};
  for (const r of rows) {
    bySubject[r.subject] = (bySubject[r.subject] || 0) + r.required;
  }
  console.log(`  Demand by subject: ${Object.entries(bySubject).map(([s, n]) => `${s}:${n}`).join(", ") || "none"}`);
  const lowGot = rows.filter((r) => r.got < r.required).slice(0, 5);
  if (lowGot.length) {
    console.log(`  Sample gaps (req vs got for this teacher):`);
    for (const r of lowGot) console.log(`    ${r.div} ${r.subject}: ${r.got}/${r.required}`);
  }
  console.log("");
}

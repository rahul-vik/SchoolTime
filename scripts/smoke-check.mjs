import { runTimetableEngine } from "../server/engine.js";
import { generateExportFile } from "../server/services/exportService.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const state = {
  school: { name: "Smoke School", academicYear: "2026-27" },
  workingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
  mediums: [{ id: "m1", name: "English", code: "EN", isPrimary: 1 }],
  standards: [{ id: "st1", name: "4", sortOrder: 1 }],
  divisions: [{ id: "d1", standardId: "st1", mediumId: "m1", name: "A" }],
  subjects: [
    { id: "s1", name: "Mathematics", code: "MATH", category: "CORE", weeklyPeriods: 5, maxPerDay: 2, priorityWeight: 8, standardIds: ["st1"], mediumIds: ["m1"] },
    { id: "s2", name: "English", code: "ENG", category: "LANGUAGE", weeklyPeriods: 4, maxPerDay: 2, priorityWeight: 7, standardIds: ["st1"], mediumIds: ["m1"] },
  ],
  teachers: [
    { id: "t1", firstName: "R", lastName: "Kumar", employeeCode: "T01", subjectIds: ["s1"], mediumIds: ["m1"], maxPerDay: 6, maxPerWeek: 30 },
    { id: "t2", firstName: "P", lastName: "Sharma", employeeCode: "T02", subjectIds: ["s2"], mediumIds: ["m1"], maxPerDay: 6, maxPerWeek: 30 },
  ],
  periodSlots: [
    { slotNumber: 1, label: "Period 1", slotType: "LESSON", startTime: "09:00" },
    { slotNumber: 2, label: "Period 2", slotType: "LESSON", startTime: "09:45" },
    { slotNumber: 3, label: "Break", slotType: "BREAK", startTime: "10:30" },
    { slotNumber: 4, label: "Period 3", slotType: "LESSON", startTime: "10:45" },
    { slotNumber: 5, label: "Lunch", slotType: "LUNCH", startTime: "11:30" },
    { slotNumber: 6, label: "Period 4", slotType: "LESSON", startTime: "12:00" },
  ],
  teacherSubjects: [],
  freePeriodRules: [],
  fixedSlots: [],
  subjectAllocations: [],
  schedulingRules: [],
};

async function main() {
  const result = runTimetableEngine(state);
  assert(Array.isArray(result.entries), "Engine did not return entries");
  assert(result.report?.totalRequired >= 1, "Engine report missing totalRequired");

  const pdf = await generateExportFile({ type: "PDF", scope: "ALL_DIVISIONS", state, entries: result.entries });
  const xlsx = await generateExportFile({ type: "EXCEL", scope: "ALL_DIVISIONS", state, entries: result.entries });
  const reportPdf = await generateExportFile({ type: "PDF", scope: "REPORTS_BUNDLE", state, entries: result.entries });
  const reportXlsx = await generateExportFile({ type: "EXCEL", scope: "REPORTS_BUNDLE", state, entries: result.entries });
  assert(Buffer.isBuffer(pdf.buffer) && pdf.buffer.length > 512, "PDF export buffer invalid");
  assert(Buffer.isBuffer(xlsx.buffer) && xlsx.buffer.length > 512, "Excel export buffer invalid");
  assert(Buffer.isBuffer(reportPdf.buffer) && reportPdf.buffer.length > 512, "Reports PDF export buffer invalid");
  assert(Buffer.isBuffer(reportXlsx.buffer) && reportXlsx.buffer.length > 512, "Reports Excel export buffer invalid");

  console.log("Smoke checks passed.");
}

main().catch((err) => {
  console.error("Smoke checks failed:", err.message);
  process.exit(1);
});


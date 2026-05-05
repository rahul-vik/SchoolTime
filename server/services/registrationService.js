import { randomUUID } from "node:crypto";
import { hashPassword } from "../auth.js";
import { logAudit, nowIso, writeCreditLedger } from "./common.js";

function buildDemoTenantState(orgName) {
  const schoolName = String(orgName || "").trim() || "SchoolTime Demo School";
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startYear = month >= 5 ? year : year - 1;
  const endYear = startYear + 1;
  return {
    school: {
      id: "sch1",
      name: schoolName,
      code: "STDEMO",
      timeZone: "Asia/Kolkata",
      academicYear: `${startYear}-${String(endYear).slice(-2)}`,
      yearStart: `${startYear}-06-01`,
      yearEnd: `${endYear}-03-31`,
    },
    mediums: [
      { id: "m1", name: "English", code: "EN", isPrimary: true },
      { id: "m2", name: "Malayalam", code: "ML", isPrimary: false },
    ],
    standards: [
      { id: "s4", name: "4", sortOrder: 4 },
      { id: "s5", name: "5", sortOrder: 5 },
      { id: "s6", name: "6", sortOrder: 6 },
    ],
    divisions: [
      { id: "d1", standardId: "s4", mediumId: "m1", name: "A" },
      { id: "d2", standardId: "s4", mediumId: "m1", name: "B" },
      { id: "d3", standardId: "s5", mediumId: "m1", name: "A" },
      { id: "d4", standardId: "s5", mediumId: "m2", name: "B" },
      { id: "d5", standardId: "s6", mediumId: "m1", name: "A" },
    ],
    subjects: [
      { id: "sub1", name: "English", code: "ENG", category: "LANGUAGE", weeklyPeriods: 6, maxPerDay: 2, priorityWeight: 8, colorHex: "#7c3aed", mediumIds: ["m1", "m2"], standardIds: ["s4", "s5", "s6"], divisionScopeMode: "ALL_IN_SELECTED_CLASSES", divisionIncludeIds: [], divisionExcludeIds: [], divisionLimits: [] },
      { id: "sub2", name: "Mathematics", code: "MATH", category: "CORE", weeklyPeriods: 6, maxPerDay: 2, priorityWeight: 10, colorHex: "#0369a1", mediumIds: ["m1", "m2"], standardIds: ["s4", "s5", "s6"], divisionScopeMode: "ALL_IN_SELECTED_CLASSES", divisionIncludeIds: [], divisionExcludeIds: [], divisionLimits: [] },
      { id: "sub3", name: "Science", code: "SCI", category: "CORE", weeklyPeriods: 5, maxPerDay: 2, priorityWeight: 10, colorHex: "#0e7490", mediumIds: ["m1", "m2"], standardIds: ["s4", "s5", "s6"], divisionScopeMode: "ALL_IN_SELECTED_CLASSES", divisionIncludeIds: [], divisionExcludeIds: [], divisionLimits: [] },
      { id: "sub4", name: "Social Studies", code: "SS", category: "NON_CORE", weeklyPeriods: 4, maxPerDay: 1, priorityWeight: 6, colorHex: "#0891b2", mediumIds: ["m1", "m2"], standardIds: ["s4", "s5", "s6"], divisionScopeMode: "ALL_IN_SELECTED_CLASSES", divisionIncludeIds: [], divisionExcludeIds: [], divisionLimits: [] },
      { id: "sub5", name: "Computer Lab", code: "CS", category: "PRACTICAL", weeklyPeriods: 2, maxPerDay: 1, priorityWeight: 4, colorHex: "#059669", mediumIds: ["m1", "m2"], standardIds: ["s4", "s5", "s6"], divisionScopeMode: "ALL_IN_SELECTED_CLASSES", divisionIncludeIds: [], divisionExcludeIds: [], divisionLimits: [] },
      { id: "sub6", name: "Physical Education", code: "PE", category: "EXTRA_CURRICULAR", weeklyPeriods: 2, maxPerDay: 1, priorityWeight: 3, colorHex: "#d97706", mediumIds: ["m1", "m2"], standardIds: ["s4", "s5", "s6"], divisionScopeMode: "ALL_IN_SELECTED_CLASSES", divisionIncludeIds: [], divisionExcludeIds: [], divisionLimits: [] },
    ],
    teachers: [
      { id: "t1", firstName: "Priya", lastName: "Sharma", employeeCode: "T001", email: "priya@schooltime.demo", maxPerDay: 6, maxPerWeek: 30, mediumIds: ["m1"], subjectIds: ["sub1"], primarySubjectId: "sub1", freeMorningPeriods: 0, freeEveningPeriods: 0, maxContinuousSameSubjectPerDivision: 2, maxContinuousAnySubjectPerDivision: 3, assignedDivisionIds: ["d1", "d2", "d3"], classTeacherDivisionIds: ["d1"], primaryClassTeacherDivisionId: "d1", divisionSubjectExclusions: [] },
      { id: "t2", firstName: "Rajesh", lastName: "Kumar", employeeCode: "T002", email: "rajesh@schooltime.demo", maxPerDay: 6, maxPerWeek: 30, mediumIds: ["m1", "m2"], subjectIds: ["sub2"], primarySubjectId: "sub2", freeMorningPeriods: 1, freeEveningPeriods: 0, maxContinuousSameSubjectPerDivision: 2, maxContinuousAnySubjectPerDivision: 3, assignedDivisionIds: ["d1", "d2", "d3", "d4", "d5"], classTeacherDivisionIds: ["d3"], primaryClassTeacherDivisionId: "d3", divisionSubjectExclusions: [] },
      { id: "t3", firstName: "Meena", lastName: "Nair", employeeCode: "T003", email: "meena@schooltime.demo", maxPerDay: 6, maxPerWeek: 30, mediumIds: ["m1", "m2"], subjectIds: ["sub3"], primarySubjectId: "sub3", freeMorningPeriods: 0, freeEveningPeriods: 1, maxContinuousSameSubjectPerDivision: 2, maxContinuousAnySubjectPerDivision: 3, assignedDivisionIds: [], classTeacherDivisionIds: ["d4"], primaryClassTeacherDivisionId: "d4", divisionSubjectExclusions: [] },
      { id: "t4", firstName: "Anitha", lastName: "Thomas", employeeCode: "T004", email: "anitha@schooltime.demo", maxPerDay: 6, maxPerWeek: 30, mediumIds: ["m1", "m2"], subjectIds: ["sub4", "sub5"], primarySubjectId: "sub4", freeMorningPeriods: 0, freeEveningPeriods: 0, maxContinuousSameSubjectPerDivision: 2, maxContinuousAnySubjectPerDivision: 3, assignedDivisionIds: [], classTeacherDivisionIds: [], primaryClassTeacherDivisionId: null, divisionSubjectExclusions: [] },
      { id: "t5", firstName: "Deepa", lastName: "Raj", employeeCode: "T005", email: "deepa@schooltime.demo", maxPerDay: 5, maxPerWeek: 25, mediumIds: ["m1", "m2"], subjectIds: ["sub6"], primarySubjectId: "sub6", freeMorningPeriods: 0, freeEveningPeriods: 0, maxContinuousSameSubjectPerDivision: 1, maxContinuousAnySubjectPerDivision: 2, assignedDivisionIds: [], classTeacherDivisionIds: ["d5"], primaryClassTeacherDivisionId: "d5", divisionSubjectExclusions: [] },
    ],
    periodSlots: [
      { slotNumber: 1, startTime: "09:00", endTime: "09:45", slotType: "LESSON", label: "Period 1", durationMins: 45 },
      { slotNumber: 2, startTime: "09:45", endTime: "10:30", slotType: "LESSON", label: "Period 2", durationMins: 45 },
      { slotNumber: 3, startTime: "10:30", endTime: "10:45", slotType: "BREAK", label: "Break", durationMins: 15 },
      { slotNumber: 4, startTime: "10:45", endTime: "11:30", slotType: "LESSON", label: "Period 3", durationMins: 45 },
      { slotNumber: 5, startTime: "11:30", endTime: "12:15", slotType: "LESSON", label: "Period 4", durationMins: 45 },
      { slotNumber: 6, startTime: "12:15", endTime: "13:00", slotType: "LUNCH", label: "Lunch", durationMins: 45 },
      { slotNumber: 7, startTime: "13:00", endTime: "13:45", slotType: "LESSON", label: "Period 5", durationMins: 45 },
      { slotNumber: 8, startTime: "13:45", endTime: "14:30", slotType: "LESSON", label: "Period 6", durationMins: 45 },
    ],
    workingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
    schedulingRules: [
      { id: "r1", subjectId: "sub6", ruleType: "EXCLUDE_SLOT", isActive: true, note: "PE away from boundary slots", slotTargets: ["FIRST_MORNING", "LAST_LESSON"] },
      { id: "r2", subjectId: "sub5", ruleType: "EXCLUDE_DAY", isActive: true, dayOfWeekList: ["MONDAY"], note: "Lab not on Monday" },
    ],
    classTeacherPreferences: {
      enabled: true,
      ctFirstPeriodDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
      dailyPrimaryMinPeriods: 1,
    },
    teacherSubjects: [],
    freePeriodRules: [],
    subjectAllocations: [],
  };
}

/**
 * Creates organization, owner user, license row, optional credit ledger entry, and audit log.
 * Caller must run inside db.transaction.
 */
export async function createOrgWithOwnerUser(tx, {
  orgName,
  fullName,
  emailNorm,
  plainPassword,
  initialCredits,
  creditLedgerReason,
  creditLedgerMeta,
}) {
  const orgId = randomUUID();
  const userId = randomUUID();
  await tx.run("INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)", orgId, orgName.trim(), nowIso());
  await tx.run(
    "INSERT INTO users (id, org_id, full_name, email, password_hash, role, created_at, is_active) VALUES (?, ?, ?, ?, ?, 'owner', ?, 1)",
    userId,
    orgId,
    fullName.trim(),
    emailNorm,
    hashPassword(plainPassword),
    nowIso(),
  );
  await tx.run("INSERT INTO licenses (org_id, credits_remaining, updated_at) VALUES (?, ?, ?)", orgId, initialCredits, nowIso());
  const demoState = buildDemoTenantState(orgName);
  await tx.run(
    "INSERT INTO tenant_state (org_id, state_json, updated_at) VALUES (?, ?, ?)",
    orgId,
    JSON.stringify(demoState),
    nowIso(),
  );
  if (initialCredits !== 0) {
    await writeCreditLedger(tx, orgId, initialCredits, creditLedgerReason, creditLedgerMeta);
  }
  await logAudit(tx, orgId, userId, "ORG_REGISTERED", "organization", orgId, { ownerEmail: emailNorm });
  return { orgId, userId };
}

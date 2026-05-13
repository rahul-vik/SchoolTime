import { randomUUID } from "node:crypto";
import { hashPassword } from "../auth.js";
import { logAudit, nowIso, writeCreditLedger } from "./common.js";
import { migrateTenantState } from "./tenantStateMigration.js";

/** Standards 1–10, one section A each, minimal subjects/teachers so the first timetable run is easy to follow. */
function buildDemoTenantState(orgName) {
  const schoolName = String(orgName || "").trim() || "Demo School";
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startYear = month >= 5 ? year : year - 1;
  const endYear = startYear + 1;

  const n = 10;
  const standardIds = Array.from({ length: n }, (_, i) => `std${i + 1}`);
  const standards = standardIds.map((id, i) => ({
    id,
    name: String(i + 1),
    sortOrder: i + 1,
  }));
  const divisions = standardIds.map((standardId, i) => ({
    id: `div${i + 1}`,
    standardId,
    mediumId: "m1",
    name: "A",
  }));

  const subjects = [
    {
      id: "sub_eng",
      name: "English",
      code: "ENG",
      category: "LANGUAGE",
      weeklyPeriods: 5,
      maxPerDay: 2,
      priorityWeight: 8,
      colorHex: "#7c3aed",
      mediumIds: ["m1"],
      standardIds: [...standardIds],
      divisionScopeMode: "ALL_IN_SELECTED_CLASSES",
      divisionIncludeIds: [],
      divisionExcludeIds: [],
      divisionLimits: [],
    },
    {
      id: "sub_math",
      name: "Mathematics",
      code: "MATH",
      category: "CORE",
      weeklyPeriods: 3,
      maxPerDay: 2,
      priorityWeight: 10,
      colorHex: "#0369a1",
      mediumIds: ["m1"],
      standardIds: [...standardIds],
      divisionScopeMode: "ALL_IN_SELECTED_CLASSES",
      divisionIncludeIds: [],
      divisionExcludeIds: [],
      divisionLimits: [],
    },
    {
      id: "sub_sci",
      name: "Science",
      code: "SCI",
      category: "CORE",
      weeklyPeriods: 3,
      maxPerDay: 2,
      priorityWeight: 9,
      colorHex: "#0e7490",
      mediumIds: ["m1"],
      standardIds: [...standardIds],
      divisionScopeMode: "ALL_IN_SELECTED_CLASSES",
      divisionIncludeIds: [],
      divisionExcludeIds: [],
      divisionLimits: [],
    },
    {
      id: "sub_soc",
      name: "Social Studies",
      code: "SOC",
      category: "NON_CORE",
      weeklyPeriods: 2,
      maxPerDay: 1,
      priorityWeight: 6,
      colorHex: "#0891b2",
      mediumIds: ["m1"],
      standardIds: [...standardIds],
      divisionScopeMode: "ALL_IN_SELECTED_CLASSES",
      divisionIncludeIds: [],
      divisionExcludeIds: [],
      divisionLimits: [],
    },
    {
      id: "sub_lab",
      name: "Computer Lab",
      code: "CS",
      category: "PRACTICAL",
      weeklyPeriods: 2,
      maxPerDay: 1,
      priorityWeight: 4,
      colorHex: "#059669",
      mediumIds: ["m1"],
      standardIds: [...standardIds],
      divisionScopeMode: "ALL_IN_SELECTED_CLASSES",
      divisionIncludeIds: [],
      divisionExcludeIds: [],
      divisionLimits: [],
    },
    {
      id: "sub_pe",
      name: "Physical Education",
      code: "PE",
      category: "EXTRA_CURRICULAR",
      weeklyPeriods: 2,
      maxPerDay: 1,
      priorityWeight: 3,
      colorHex: "#d97706",
      mediumIds: ["m1"],
      standardIds: [...standardIds],
      divisionScopeMode: "ALL_IN_SELECTED_CLASSES",
      divisionIncludeIds: [],
      divisionExcludeIds: [],
      divisionLimits: [],
    },
  ];

  const teacherBase = {
    maxPerDay: 6,
    maxPerWeek: 30,
    mediumIds: ["m1"],
    freeMorningPeriods: 0,
    freeEveningPeriods: 0,
    maxContinuousSameSubjectPerDivision: 2,
    maxContinuousAnySubjectPerDivision: 3,
    divisionSubjectExclusions: [],
  };

  const classTeachers = divisions.map((div, i) => ({
    ...teacherBase,
    id: `t_ct_${i + 1}`,
    firstName: "Demo",
    lastName: `English teacher (Std ${i + 1}–A)`,
    employeeCode: `CT${String(i + 1).padStart(2, "0")}`,
    email: `english.ct${i + 1}@schooltime.demo`,
    subjectIds: ["sub_eng"],
    primarySubjectId: "sub_eng",
    assignedDivisionIds: [div.id],
    classTeacherDivisionIds: [div.id],
    primaryClassTeacherDivisionId: div.id,
  }));

  const specialists = [
    {
      ...teacherBase,
      id: "t_math",
      firstName: "Demo",
      lastName: "Mathematics (all classes)",
      employeeCode: "MATH01",
      email: "math@schooltime.demo",
      subjectIds: ["sub_math"],
      primarySubjectId: "sub_math",
      assignedDivisionIds: [],
      classTeacherDivisionIds: [],
      primaryClassTeacherDivisionId: null,
    },
    {
      ...teacherBase,
      id: "t_sci",
      firstName: "Demo",
      lastName: "Science (all classes)",
      employeeCode: "SCI01",
      email: "science@schooltime.demo",
      subjectIds: ["sub_sci"],
      primarySubjectId: "sub_sci",
      assignedDivisionIds: [],
      classTeacherDivisionIds: [],
      primaryClassTeacherDivisionId: null,
    },
    {
      ...teacherBase,
      id: "t_soc",
      firstName: "Demo",
      lastName: "Social studies (all classes)",
      employeeCode: "SOC01",
      email: "social@schooltime.demo",
      subjectIds: ["sub_soc"],
      primarySubjectId: "sub_soc",
      assignedDivisionIds: [],
      classTeacherDivisionIds: [],
      primaryClassTeacherDivisionId: null,
    },
    {
      ...teacherBase,
      id: "t_lab",
      firstName: "Demo",
      lastName: "Computer lab (all classes)",
      employeeCode: "LAB01",
      email: "computerlab@schooltime.demo",
      subjectIds: ["sub_lab"],
      primarySubjectId: "sub_lab",
      assignedDivisionIds: [],
      classTeacherDivisionIds: [],
      primaryClassTeacherDivisionId: null,
    },
    {
      ...teacherBase,
      id: "t_pe",
      firstName: "Demo",
      lastName: "Physical education (all classes)",
      employeeCode: "PE01",
      email: "pe@schooltime.demo",
      subjectIds: ["sub_pe"],
      primarySubjectId: "sub_pe",
      assignedDivisionIds: [],
      classTeacherDivisionIds: [],
      primaryClassTeacherDivisionId: null,
    },
  ];

  return {
    school: {
      id: "sch1",
      name: schoolName,
      code: "DEMO",
      timeZone: "Asia/Kolkata",
      academicYear: `${startYear}-${String(endYear).slice(-2)}`,
      yearStart: `${startYear}-06-01`,
      yearEnd: `${endYear}-03-31`,
    },
    mediums: [{ id: "m1", name: "English", code: "EN", isPrimary: true }],
    standards,
    divisions,
    subjects,
    teachers: [...classTeachers, ...specialists],
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
      {
        id: "demo_rule_pe",
        subjectId: "sub_pe",
        ruleType: "EXCLUDE_SLOT",
        isActive: true,
        note: "PE away from boundary slots",
        slotTargets: ["FIRST_MORNING", "LAST_LESSON"],
      },
      {
        id: "demo_rule_lab",
        subjectId: "sub_lab",
        ruleType: "EXCLUDE_DAY",
        isActive: true,
        dayOfWeekList: ["MONDAY"],
        note: "Lab not on Monday",
      },
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
  const demoState = migrateTenantState(buildDemoTenantState(orgName)).state;
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

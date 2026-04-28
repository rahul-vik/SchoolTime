// teacherDivisionMap: { teacherId → divisionId[] }
// Empty array = UNRESTRICTED (backward-compatible default for existing teachers)
// Non-empty array = teacher is restricted to those specific divisions only
export const SEED = {
  school: { id: "sch1", name: "St. Mary's School", code: "STMARY", timeZone: "Asia/Kolkata", academicYear: "2024-25", yearStart: "2024-06-01", yearEnd: "2025-03-31" },
  mediums: [
    { id: "m1", name: "English", code: "EN", isPrimary: true },
    { id: "m2", name: "Malayalam", code: "ML", isPrimary: false },
  ],
  standards: [
    { id: "s1", name: "1", sortOrder: 1 }, { id: "s2", name: "2", sortOrder: 2 },
    { id: "s3", name: "3", sortOrder: 3 }, { id: "s4", name: "4", sortOrder: 4 },
    { id: "s5", name: "5", sortOrder: 5 }, { id: "s6", name: "6", sortOrder: 6 },
    { id: "s7", name: "7", sortOrder: 7 }, { id: "s8", name: "8", sortOrder: 8 },
  ],
  divisions: [
    { id: "d1", standardId: "s4", mediumId: "m1", name: "A" },
    { id: "d2", standardId: "s4", mediumId: "m1", name: "B" },
    { id: "d3", standardId: "s4", mediumId: "m2", name: "C" },
    { id: "d4", standardId: "s5", mediumId: "m1", name: "A" },
    { id: "d5", standardId: "s5", mediumId: "m1", name: "B" },
    { id: "d6", standardId: "s6", mediumId: "m1", name: "A" },
    { id: "d7", standardId: "s7", mediumId: "m1", name: "A" },
    { id: "d8", standardId: "s8", mediumId: "m1", name: "A" },
  ],
  subjects: [
    { id: "sub1", name: "English", code: "ENG", category: "LANGUAGE", weeklyPeriods: 7, maxPerDay: 2, priorityWeight: 9, colorHex: "#7c3aed", mediumIds: ["m1"], standardIds: ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"] },
    { id: "sub2", name: "Mathematics", code: "MATH", category: "CORE", weeklyPeriods: 6, maxPerDay: 2, priorityWeight: 10, colorHex: "#0369a1", mediumIds: ["m1", "m2"], standardIds: ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"] },
    { id: "sub3", name: "Science", code: "SCI", category: "CORE", weeklyPeriods: 5, maxPerDay: 2, priorityWeight: 8, colorHex: "#0891b2", mediumIds: ["m1", "m2"], standardIds: ["s4", "s5", "s6", "s7", "s8"] },
    { id: "sub4", name: "Social Studies", code: "SS", category: "CORE", weeklyPeriods: 4, maxPerDay: 1, priorityWeight: 7, colorHex: "#0369a1", mediumIds: ["m1", "m2"], standardIds: ["s4", "s5", "s6", "s7", "s8"] },
    { id: "sub5", name: "Hindi", code: "HIN", category: "LANGUAGE", weeklyPeriods: 5, maxPerDay: 2, priorityWeight: 7, colorHex: "#9333ea", mediumIds: ["m1"], standardIds: ["s3", "s4", "s5", "s6", "s7", "s8"] },
    { id: "sub6", name: "Computer Science", code: "CS", category: "NON_CORE", weeklyPeriods: 3, maxPerDay: 1, priorityWeight: 5, colorHex: "#0891b2", mediumIds: ["m1", "m2"], standardIds: ["s4", "s5", "s6", "s7", "s8"] },
    { id: "sub7", name: "Physical Education", code: "PE", category: "EXTRA_CURRICULAR", weeklyPeriods: 2, maxPerDay: 1, priorityWeight: 3, colorHex: "#d97706", mediumIds: ["m1", "m2"], standardIds: ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"] },
    { id: "sub8", name: "Art & Craft", code: "ART", category: "EXTRA_CURRICULAR", weeklyPeriods: 2, maxPerDay: 1, priorityWeight: 3, colorHex: "#d97706", mediumIds: ["m1", "m2"], standardIds: ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"] },
    { id: "sub9", name: "Music", code: "MUS", category: "EXTRA_CURRICULAR", weeklyPeriods: 1, maxPerDay: 1, priorityWeight: 2, colorHex: "#d97706", mediumIds: ["m1", "m2"], standardIds: ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"] },
  ],
  teachers: [
    { id: "t1", firstName: "Priya", lastName: "Sharma", employeeCode: "T001", email: "priya@stmary.edu", maxPerDay: 6, maxPerWeek: 30, mediumIds: ["m1"], subjectIds: ["sub1"], primarySubjectId: "sub1", freeMorningPeriods: 0, freeEveningPeriods: 0, assignedDivisionIds: ["d1", "d2", "d4", "d5"] },
    { id: "t2", firstName: "Rajesh", lastName: "Kumar", employeeCode: "T002", email: "rajesh@stmary.edu", maxPerDay: 6, maxPerWeek: 30, mediumIds: ["m1", "m2"], subjectIds: ["sub2"], primarySubjectId: "sub2", freeMorningPeriods: 1, freeEveningPeriods: 0, assignedDivisionIds: [] },
    { id: "t3", firstName: "Meena", lastName: "Nair", employeeCode: "T003", email: "meena@stmary.edu", maxPerDay: 6, maxPerWeek: 30, mediumIds: ["m1", "m2"], subjectIds: ["sub3"], primarySubjectId: "sub3", freeMorningPeriods: 0, freeEveningPeriods: 1, assignedDivisionIds: ["d1", "d2", "d3", "d4", "d5"] },
    { id: "t4", firstName: "Suresh", lastName: "Pillai", employeeCode: "T004", email: "suresh@stmary.edu", maxPerDay: 6, maxPerWeek: 30, mediumIds: ["m1", "m2"], subjectIds: ["sub4"], primarySubjectId: "sub4", freeMorningPeriods: 0, freeEveningPeriods: 0, assignedDivisionIds: [] },
    { id: "t5", firstName: "Anitha", lastName: "Thomas", employeeCode: "T005", email: "anitha@stmary.edu", maxPerDay: 6, maxPerWeek: 30, mediumIds: ["m1"], subjectIds: ["sub5"], primarySubjectId: "sub5", freeMorningPeriods: 0, freeEveningPeriods: 0, assignedDivisionIds: ["d1", "d2", "d4", "d5", "d6"] },
    { id: "t6", firstName: "Vinod", lastName: "Menon", employeeCode: "T006", email: "vinod@stmary.edu", maxPerDay: 5, maxPerWeek: 25, mediumIds: ["m1", "m2"], subjectIds: ["sub6"], primarySubjectId: "sub6", freeMorningPeriods: 0, freeEveningPeriods: 0, assignedDivisionIds: [] },
    { id: "t7", firstName: "Deepa", lastName: "Raj", employeeCode: "T007", email: "deepa@stmary.edu", maxPerDay: 5, maxPerWeek: 25, mediumIds: ["m1", "m2"], subjectIds: ["sub7", "sub8"], primarySubjectId: "sub7", freeMorningPeriods: 0, freeEveningPeriods: 0, assignedDivisionIds: [] },
    { id: "t8", firstName: "Arun", lastName: "Joseph", employeeCode: "T008", email: "arun@stmary.edu", maxPerDay: 6, maxPerWeek: 30, mediumIds: ["m1"], subjectIds: ["sub1", "sub5", "sub9"], primarySubjectId: "sub1", freeMorningPeriods: 0, freeEveningPeriods: 0, assignedDivisionIds: ["d6", "d7", "d8"] },
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
    { slotNumber: 9, startTime: "14:30", endTime: "15:15", slotType: "LESSON", label: "Period 7", durationMins: 45 },
    { slotNumber: 10, startTime: "15:15", endTime: "16:00", slotType: "LESSON", label: "Period 8", durationMins: 45 },
  ],
  workingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
  schedulingRules: [
    { id: "r1", subjectId: "sub7", ruleType: "BOTH_BOUNDARY", isActive: true, note: "PE should not be first or last lesson period" },
    { id: "r2", subjectId: "sub8", ruleType: "BOTH_BOUNDARY", isActive: true, note: "Art & Craft should not be first or last lesson period" },
  ],
  classTeacherPreferences: {
    enabled: false,
    firstPeriodMode: "ALL_DAYS_PRIMARY_ONLY",
    dailyPrimaryMinPeriods: 0,
    schedulingMode: "STRICT", // STRICT | BEST_FIT | OPTIMAL
  },
  exportJobs: [],
  lastGeneratedTimetable: null,
};

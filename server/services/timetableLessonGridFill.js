import { slotActiveOnWeekday } from "../../shared/periodSlotDays.js";
import { normalizeTenantSchoolOrdering } from "../../shared/schoolDisplayOrder.js";

/**
 * Build full timetable `entries` (lessons + break/lunch/free rows) from lesson-only rows,
 * matching `server/engine.js` tail fill semantics.
 *
 * @param {object} data - Same shape as `runTimetableEngine` input (tenant slice).
 * @param {Array<{divisionId:string,teacherId:string|null,subjectId:string,dayOfWeek:string,slotNumber:number,isDouble?:boolean,isFreePeriod?:boolean,slotType?:string}>} lessonRows
 */
export function buildFullEntriesFromLessonRows(data, lessonRows) {
  const ord = normalizeTenantSchoolOrdering({
    standards: data.standards || [],
    divisions: data.divisions || [],
    workingDays: data.workingDays || [],
  });
  const divisions = ord.divisions;
  const workingDays =
    ord.workingDays.length > 0 ? ord.workingDays : ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  const periodSlots = data.periodSlots || [];
  const entries = [];
  const divisionSlotMap = new Map();

  for (const row of lessonRows || []) {
    if (!row || row.isFreePeriod || !row.subjectId || !row.teacherId) continue;
    const key = `${row.divisionId}:${row.dayOfWeek}:${Number(row.slotNumber)}`;
    divisionSlotMap.set(key, {
      divisionId: row.divisionId,
      teacherId: row.teacherId,
      subjectId: row.subjectId,
      dayOfWeek: row.dayOfWeek,
      slotNumber: Number(row.slotNumber),
      isDouble: Boolean(row.isDouble),
      isFreePeriod: false,
      slotType: "LESSON",
    });
  }

  for (const div of divisions) {
    for (const day of workingDays) {
      for (const slot of periodSlots) {
        if (!slotActiveOnWeekday(slot, day)) continue;
        const key = `${div.id}:${day}:${Number(slot.slotNumber)}`;
        if (divisionSlotMap.has(key)) {
          entries.push(divisionSlotMap.get(key));
        } else if (slot.slotType !== "LESSON") {
          entries.push({
            divisionId: div.id,
            teacherId: null,
            subjectId: null,
            dayOfWeek: day,
            slotNumber: slot.slotNumber,
            isFreePeriod: false,
            slotType: slot.slotType,
            label: slot.label,
          });
        } else {
          entries.push({
            divisionId: div.id,
            teacherId: null,
            subjectId: null,
            dayOfWeek: day,
            slotNumber: slot.slotNumber,
            isFreePeriod: true,
            slotType: "LESSON",
            label: "Free",
          });
        }
      }
    }
  }
  return entries;
}

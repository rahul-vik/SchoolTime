export function getSlotMeta(slots) {
  const ls = slots.filter((s) => s.slotType === "LESSON").sort((a, b) => a.slotNumber - b.slotNumber);
  if (!ls.length) return { firstMorning: null, firstAfterLunch: null, lastLesson: null, lessonSlots: ls };
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

export function parseDivisionInput(input) {
  const lines = (Array.isArray(input) ? input : input.split("\n")).map((l) => l.trim()).filter(Boolean);
  const results = [];
  const errors = [];
  lines.forEach((line, i) => {
    const parts = line.split(/\s+/);
    const standardName = parts[0];
    if (!standardName) { errors.push({ line, lineNumber: i + 1, message: "Missing standard name" }); return; }
    let divs = ["A"];
    if (parts[1]) {
      const spec = parts[1];
      if (spec.includes("-")) {
        const [s, e] = spec.split("-");
        if (s && e) divs = Array.from({ length: e.charCodeAt(0) - s.charCodeAt(0) + 1 }, (_, j) => String.fromCharCode(s.charCodeAt(0) + j));
      } else if (spec.includes(",")) {
        divs = spec.split(",").map((d) => d.trim()).filter(Boolean);
      } else {
        divs = [spec];
      }
    }
    results.push({ standardName, divisions: divs });
  });
  return { success: errors.length === 0, data: results, errors };
}

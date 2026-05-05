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
    const normalizedLine = String(line)
      .replace(/\s*-\s*/g, "-")
      .replace(/\s*,\s*/g, ",")
      .replace(/\s+/g, " ")
      .trim();
    let parts = normalizedLine.split(" ");
    let standardName = parts[0];
    let spec = parts.slice(1).join("");
    // Support compact forms like "4A-C" (standard + division spec without space).
    if (!spec) {
      const compact = standardName.match(/^(\d+)([A-Za-z].*)$/);
      if (compact) {
        standardName = compact[1];
        spec = compact[2];
      }
    }
    if (!standardName) { errors.push({ line, lineNumber: i + 1, message: "Missing standard name" }); return; }
    let divs = ["A"];
    if (spec) {
      const upperSpec = spec.toUpperCase();
      if (upperSpec.includes("-")) {
        const [s, e] = upperSpec.split("-");
        if (s && e) {
          const start = s.charCodeAt(0);
          const end = e.charCodeAt(0);
          if (end >= start) {
            divs = Array.from({ length: end - start + 1 }, (_, j) => String.fromCharCode(start + j));
          } else {
            errors.push({ line, lineNumber: i + 1, message: "Invalid division range" });
            return;
          }
        }
      } else if (upperSpec.includes(",")) {
        divs = upperSpec.split(",").map((d) => d.trim()).filter(Boolean);
      } else {
        divs = [upperSpec];
      }
    }
    results.push({ standardName, divisions: divs });
  });
  return { success: errors.length === 0, data: results, errors };
}

/**
 * Rotating lesson-slot scan order to avoid always filling the same period column across the week.
 */

/** Rotate lesson slot rows by k positions (stable sort by slotNumber assumed upstream). */
export function rotateLessonSlots(lessonSlots, rotation) {
  const slots = [...(lessonSlots || [])];
  if (slots.length <= 1) return slots;
  const k = ((Number(rotation) % slots.length) + slots.length) % slots.length;
  return [...slots.slice(k), ...slots.slice(0, k)];
}

/**
 * Build per-placement slot scan order from restart seed, weekday, and subject id.
 * Odd day indices reverse the rotated order for extra variety.
 */
export function buildSlotOrderForPlacement(lessonSlots, { attemptSeed = 0, dayIndex = 0, subjectId = "" } = {}) {
  const slots = lessonSlots || [];
  if (!slots.length) return slots;

  let hash = 0;
  const sid = String(subjectId || "");
  for (let i = 0; i < sid.length; i++) hash = (hash + sid.charCodeAt(i) * (i + 1)) % 997;
  const rotation =
    (Number(attemptSeed) || 0) + (Number(dayIndex) || 0) * 5 + (hash % slots.length);

  let order = rotateLessonSlots(slots, rotation);
  if ((Number(dayIndex) || 0) % 2 === 1) {
    order = [...order].reverse();
  }
  return order;
}

/**
 * Class-teacher rules use explicit `enabled: true` in the engine.
 * When `enabled` is omitted on persisted payloads, fall back to seed (e.g. demo signup) so legacy rows stay stable.
 * @param {object|undefined|null} raw
 * @param {object|undefined|null} seedRaw
 * @returns {boolean}
 */
export function resolveClassTeacherEnabled(raw, seedRaw) {
  const next = raw && typeof raw === "object" ? raw : {};
  const seed = seedRaw && typeof seedRaw === "object" ? seedRaw : {};
  if (next.enabled === true) return true;
  if (next.enabled === false) return false;
  return seed.enabled === true;
}

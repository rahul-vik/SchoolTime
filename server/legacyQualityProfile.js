/** @typedef {'auto' | 'always' | 'never'} LegacyQualityMaxMode */

/**
 * Parse LEGACY_QUALITY_MAX: auto (default) | true | false.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {LegacyQualityMaxMode}
 */
export function parseLegacyQualityMaxMode(env = process.env) {
  const raw = String(env.LEGACY_QUALITY_MAX ?? "auto").trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return "always";
  if (raw === "false" || raw === "0" || raw === "no") return "never";
  return "auto";
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isCpSatConfiguredFromEnv(env = process.env) {
  return Boolean(String(env.CP_SAT_SOLVER_URL || "").trim());
}

/**
 * Health/UI hint: legacy boost is recommended when CP-SAT is not configured (unless LEGACY_QUALITY_MAX=false).
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isLegacyQualityMaxRecommended(env = process.env) {
  if (parseLegacyQualityMaxMode(env) === "never") return false;
  return !isCpSatConfiguredFromEnv(env);
}

/**
 * @param {{ mode?: LegacyQualityMaxMode, cpSatConfigured: boolean, requestedMode: string }} ctx
 */
export function shouldApplyLegacyQualityMax(ctx) {
  const mode = ctx.mode ?? parseLegacyQualityMaxMode();
  const requested = String(ctx.requestedMode || "legacy").trim().toLowerCase();

  if (mode === "never") return false;
  if (mode === "always") return true;

  if (ctx.cpSatConfigured) return false;
  if (requested === "hybrid" || requested === "cp_sat") return true;
  if (requested === "legacy") return true;
  return false;
}

/**
 * @param {number} divisionCount
 */
export function buildLegacyQualityProfile(divisionCount) {
  const divisions = Math.max(1, Math.floor(Number(divisionCount) || 0) || 1);
  return {
    schedulingModeOverride: "OPTIMAL",
    legacyEngineOptions: {
      restarts: 8,
      localSearchIterations: Math.min(80, 24 + 2 * divisions),
      lockRepairRounds: 4,
      maxBacktrackRounds: 16,
    },
  };
}

/**
 * Run-only merge: OPTIMAL scheduling mode + boosted greedy knobs (not persisted to tenant DB).
 * @param {object} engineData
 * @param {ReturnType<typeof buildLegacyQualityProfile>} profile
 */
export function applyLegacyQualityProfile(engineData, profile) {
  const ctp = {
    ...(engineData.classTeacherPreferences && typeof engineData.classTeacherPreferences === "object"
      ? engineData.classTeacherPreferences
      : {}),
    schedulingMode: profile.schedulingModeOverride,
  };
  const existing =
    engineData.legacyEngineOptions && typeof engineData.legacyEngineOptions === "object"
      ? engineData.legacyEngineOptions
      : {};
  return {
    ...engineData,
    classTeacherPreferences: ctp,
    legacyEngineOptions: { ...existing, ...profile.legacyEngineOptions },
  };
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {{ cpSatConfigured?: boolean, requestedMode?: string, divisionCount?: number }} solverMeta
 */
export function getLegacyQualityProfile(env, solverMeta = {}) {
  const cpSatConfigured = solverMeta.cpSatConfigured ?? isCpSatConfiguredFromEnv(env);
  const requestedMode = solverMeta.requestedMode ?? "legacy";
  const active = shouldApplyLegacyQualityMax({
    mode: parseLegacyQualityMaxMode(env),
    cpSatConfigured,
    requestedMode,
  });
  if (!active) return { active: false };
  const built = buildLegacyQualityProfile(solverMeta.divisionCount ?? 1);
  return { active: true, ...built };
}

import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLegacyQualityProfile,
  buildLegacyQualityProfile,
  getLegacyQualityProfile,
  parseLegacyQualityMaxMode,
  shouldApplyLegacyQualityMax,
} from "../../server/legacyQualityProfile.js";

function withEnv(patch, fn) {
  const prev = {};
  for (const key of Object.keys(patch)) {
    prev[key] = process.env[key];
    if (patch[key] === undefined) delete process.env[key];
    else process.env[key] = patch[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(patch)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

test("parseLegacyQualityMaxMode defaults to auto", () => {
  withEnv({ LEGACY_QUALITY_MAX: undefined }, () => {
    assert.equal(parseLegacyQualityMaxMode(), "auto");
  });
});

test("auto enables when CP_SAT_SOLVER_URL missing and hybrid requested", () => {
  withEnv({ LEGACY_QUALITY_MAX: "auto", CP_SAT_SOLVER_URL: undefined, TIMETABLE_SOLVER: undefined }, () => {
    assert.equal(
      shouldApplyLegacyQualityMax({ mode: "auto", cpSatConfigured: false, requestedMode: "hybrid" }),
      true,
    );
    const profile = getLegacyQualityProfile(process.env, { requestedMode: "hybrid", divisionCount: 4 });
    assert.equal(profile.active, true);
    assert.equal(profile.schedulingModeOverride, "OPTIMAL");
    assert.equal(profile.legacyEngineOptions.restarts, 8);
    assert.equal(profile.legacyEngineOptions.localSearchIterations, 32);
    assert.equal(profile.legacyEngineOptions.lockRepairRounds, 4);
    assert.equal(profile.legacyEngineOptions.maxBacktrackRounds, 16);
  });
});

test("auto disabled when CP-SAT URL set and explicit legacy requested", () => {
  withEnv(
    {
      LEGACY_QUALITY_MAX: "auto",
      CP_SAT_SOLVER_URL: "http://127.0.0.1:8790/solve",
      TIMETABLE_SOLVER: "legacy",
    },
    () => {
      assert.equal(
        shouldApplyLegacyQualityMax({ mode: "auto", cpSatConfigured: true, requestedMode: "legacy" }),
        false,
      );
      const profile = getLegacyQualityProfile(process.env, { requestedMode: "legacy", divisionCount: 2 });
      assert.equal(profile.active, false);
    },
  );
});

test("false never enables", () => {
  withEnv({ LEGACY_QUALITY_MAX: "false", CP_SAT_SOLVER_URL: undefined }, () => {
    assert.equal(
      shouldApplyLegacyQualityMax({ mode: "never", cpSatConfigured: false, requestedMode: "hybrid" }),
      false,
    );
    const profile = getLegacyQualityProfile(process.env, { requestedMode: "hybrid" });
    assert.equal(profile.active, false);
  });
});

test("always enables even when CP-SAT configured", () => {
  withEnv({ LEGACY_QUALITY_MAX: "true", CP_SAT_SOLVER_URL: "http://127.0.0.1:8790/solve" }, () => {
    const profile = getLegacyQualityProfile(process.env, {
      cpSatConfigured: true,
      requestedMode: "legacy",
      divisionCount: 10,
    });
    assert.equal(profile.active, true);
    assert.equal(profile.legacyEngineOptions.localSearchIterations, 44);
  });
});

test("applyLegacyQualityProfile merges scheduling override and engine options", () => {
  const base = {
    classTeacherPreferences: { enabled: false, schedulingMode: "STRICT" },
    legacyEngineOptions: { restarts: 1 },
  };
  const profile = buildLegacyQualityProfile(3);
  const merged = applyLegacyQualityProfile(base, profile);
  assert.equal(merged.classTeacherPreferences.schedulingMode, "OPTIMAL");
  assert.equal(merged.classTeacherPreferences.enabled, false);
  assert.equal(merged.legacyEngineOptions.restarts, 8);
  assert.equal(merged.legacyEngineOptions.localSearchIterations, 30);
});

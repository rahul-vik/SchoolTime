import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { getTimetableSolverRuntime } from "./config/env.js";
import { applyLegacyQualityProfile, getLegacyQualityProfile } from "./legacyQualityProfile.js";
import { buildSchedulingScopeReport, scopeTenantForScheduling } from "../shared/divisionScheduling.js";
import { runTimetableEngine } from "./engine.js";
import { estimateCpSatLessonDecisionVars } from "./services/cpsatSolveRequestBuilder.js";

function prepareEnginePayload(data, options) {
  const scoped = scopeTenantForScheduling(withLegacyEngineOptions(data, options));
  const schedulingScope = buildSchedulingScopeReport(scoped);
  const engineData = { ...scoped };
  delete engineData._schedulingScope;
  return { engineData, schedulingScope };
}

function withSchedulingScopeReport(result, schedulingScope) {
  return {
    ...result,
    report: {
      ...(result.report || {}),
      schedulingScope,
    },
  };
}

function mergeSolverReport(result, solverMeta) {
  return {
    ...result,
    report: {
      ...(result.report || {}),
      solver: solverMeta,
    },
  };
}

function runExperimentalInWorker(data, timeoutMs) {
  return new Promise((resolve, reject) => {
    const workerPath = fileURLToPath(new URL("./workers/timetableEngineWorker.mjs", import.meta.url));
    const worker = new Worker(workerPath, { workerData: data });
    let settled = false;
    let tid;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      if (tid) clearTimeout(tid);
      worker
        .terminate()
        .catch(() => {})
        .finally(() => {
          fn(arg);
        });
    };
    tid = setTimeout(() => {
      finish(reject, Object.assign(new Error("TIMETABLE_SOLVER_TIMEOUT"), { code: "TIMEOUT" }));
    }, timeoutMs);
    worker.on("message", (msg) => {
      if (msg?.ok) finish(resolve, msg.out);
      else {
        const err = new Error(msg?.error || "WORKER_FAILED");
        if (msg?.cpSatValidation) err.cpSatValidation = msg.cpSatValidation;
        finish(reject, err);
      }
    });
    worker.on("error", (err) => finish(reject, err));
  });
}

/**
 * Runs the timetable engine with optional experimental / CP-SAT / hybrid solver (env-driven), timeout, and legacy fallback.
 * Default path is synchronous legacy `runTimetableEngine` (TIMETABLE_SOLVER=legacy).
 * `hybrid` attempts the CP-SAT worker pipeline first (same preflight and wiring as `cp_sat`), then runs legacy on failure.
 *
 * @param {object} data - tenant state payload for the engine
 * @param {{ timetableSolver?: string, legacyEngineOptions?: { restarts?: number, backtrackDepth?: number, maxBacktrackRounds?: number } }} [options] - optional per-request mode (UI / API `timetableSolver`); env used for URL, timeouts, caps; `legacyEngineOptions` tunes greedy multi-restart/backtrack when legacy runs
 */
function withLegacyEngineOptions(data, options) {
  if (options?.legacyEngineOptions && typeof options.legacyEngineOptions === "object" && !Array.isArray(options.legacyEngineOptions)) {
    return { ...data, legacyEngineOptions: options.legacyEngineOptions };
  }
  return data;
}

function prepareLegacyEnginePayload(engineData, { requested, cpSatUrl }) {
  const profile = getLegacyQualityProfile(process.env, {
    cpSatConfigured: Boolean(cpSatUrl),
    requestedMode: requested,
    divisionCount: engineData.divisions?.length ?? 0,
  });
  if (!profile.active) {
    return { engineData, legacyQualityMax: false };
  }
  return {
    engineData: applyLegacyQualityProfile(engineData, profile),
    legacyQualityMax: true,
  };
}

function runLegacyEngine(engineData, schedulingScope, solverMeta) {
  const { engineData: payload, legacyQualityMax } = prepareLegacyEnginePayload(engineData, {
    requested: solverMeta.requested,
    cpSatUrl: solverMeta.cpSatUrl,
  });
  const out = withSchedulingScopeReport(runTimetableEngine(payload), schedulingScope);
  return mergeSolverReport(out, {
    ...solverMeta,
    ...(legacyQualityMax ? { legacyQualityMax: true } : {}),
  });
}

export async function runTimetableGenerationEngine(data, options = {}) {
  const { engineData, schedulingScope } = prepareEnginePayload(data, options);
  const { mode: requested, timeoutMs, cpSatUrl, cpSatMaxDecisionVars } = getTimetableSolverRuntime(options.timetableSolver);
  const hybridRequested = requested === "hybrid";
  const wantsCpSatPipeline = requested === "cp_sat" || hybridRequested;

  const baseMeta = {
    requested,
    timetableSolverSource:
      options?.timetableSolver !== undefined && options?.timetableSolver !== null && String(options.timetableSolver).trim() !== ""
        ? "request"
        : "env",
    timeoutMs,
    applied: "legacy",
    workerUsed: false,
    fallbackReason: null,
    fallbackDetail: null,
  };

  const hybridMeta = (patch) => (hybridRequested ? patch : {});

  const legacyCtx = { requested, cpSatUrl };

  if (requested === "legacy") {
    return runLegacyEngine(engineData, schedulingScope, { ...baseMeta, applied: "legacy", ...legacyCtx });
  }

  if (wantsCpSatPipeline) {
    if (!cpSatUrl) {
      return runLegacyEngine(engineData, schedulingScope, {
        ...baseMeta,
        applied: "legacy",
        fallbackReason: "cp_sat_url_missing",
        fallbackDetail: "Set CP_SAT_SOLVER_URL (e.g. http://127.0.0.1:8790/solve) to run the CP-SAT sidecar.",
        ...hybridMeta({ hybridStage: "legacy_preflight" }),
        ...legacyCtx,
      });
    }
    const est = estimateCpSatLessonDecisionVars(engineData);
    if (est > cpSatMaxDecisionVars) {
      return runLegacyEngine(engineData, schedulingScope, {
        ...baseMeta,
        applied: "legacy",
        fallbackReason: "cp_sat_size_cap",
        fallbackDetail: String(est),
        ...hybridMeta({ hybridStage: "legacy_preflight" }),
        ...legacyCtx,
      });
    }
  }

  try {
    const out = withSchedulingScopeReport(
      await runExperimentalInWorker({ ...engineData, __timetableSolverRequestMode: requested }, timeoutMs),
      schedulingScope,
    );
    const applied = wantsCpSatPipeline ? "cp_sat" : "experimental";
    return mergeSolverReport(out, {
      ...baseMeta,
      applied,
      workerUsed: true,
      ...hybridMeta(applied === "cp_sat" ? { hybridStage: "cp_sat" } : {}),
    });
  } catch (e) {
    const isTimeout = e?.message === "TIMETABLE_SOLVER_TIMEOUT" || e?.code === "TIMEOUT";
    const isCpSatValidation = e?.message === "CP_SAT_VALIDATION_FAILED" && e?.cpSatValidation;
    return runLegacyEngine(engineData, schedulingScope, {
      ...baseMeta,
      applied: "legacy",
      fallbackReason: isTimeout ? "timeout" : isCpSatValidation ? "cp_sat_validation" : "error",
      fallbackDetail: isCpSatValidation ? JSON.stringify(e.cpSatValidation) : String(e?.message || e),
      ...(isCpSatValidation
        ? {
            validationFailed: true,
            validationCodes: e.cpSatValidation.codes,
          }
        : {}),
      ...hybridMeta(wantsCpSatPipeline ? { hybridStage: "legacy_fallback" } : {}),
      ...legacyCtx,
    });
  }
}

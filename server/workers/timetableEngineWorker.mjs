import { parentPort, workerData } from "node:worker_threads";
import { getTimetableSolverRuntime, normalizeTimetableSolverMode } from "../config/env.js";
import { runTimetableEngineCpsat } from "../engineCpsat.js";
import { runTimetableEngineExperimental } from "../engineExperimental.js";

(async () => {
  try {
    const raw = workerData || {};
    const reqMode = raw.__timetableSolverRequestMode;
    const { __timetableSolverRequestMode: _drop, ...tenantPayload } = raw;
    const envRt = getTimetableSolverRuntime();
    const mode =
      typeof reqMode === "string" && String(reqMode).trim() !== ""
        ? normalizeTimetableSolverMode(reqMode)
        : envRt.mode;
    const useCpsat = mode === "cp_sat" || mode === "hybrid";
    const out = useCpsat ? await runTimetableEngineCpsat(tenantPayload) : runTimetableEngineExperimental(tenantPayload);
    parentPort.postMessage({ ok: true, out });
  } catch (e) {
    parentPort.postMessage({
      ok: false,
      error: String(e?.message || e),
      cpSatValidation: e?.cpSatValidation || undefined,
    });
  }
})();

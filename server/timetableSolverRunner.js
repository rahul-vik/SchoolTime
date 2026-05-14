import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { getTimetableSolverRuntime } from "./config/env.js";
import { runTimetableEngine } from "./engine.js";

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
      else finish(reject, new Error(msg?.error || "WORKER_FAILED"));
    });
    worker.on("error", (err) => finish(reject, err));
  });
}

/**
 * Runs the timetable engine with optional experimental solver (env-driven), timeout, and legacy fallback.
 * Default path is synchronous legacy `runTimetableEngine` (TIMETABLE_SOLVER=legacy).
 */
export async function runTimetableGenerationEngine(data) {
  const { mode: requested, timeoutMs } = getTimetableSolverRuntime();
  const baseMeta = {
    requested,
    timeoutMs,
    applied: "legacy",
    workerUsed: false,
    fallbackReason: null,
    fallbackDetail: null,
  };

  if (requested !== "experimental") {
    const out = runTimetableEngine(data);
    return mergeSolverReport(out, { ...baseMeta, applied: "legacy" });
  }

  try {
    const out = await runExperimentalInWorker(data, timeoutMs);
    return mergeSolverReport(out, { ...baseMeta, applied: "experimental", workerUsed: true });
  } catch (e) {
    const isTimeout = e?.message === "TIMETABLE_SOLVER_TIMEOUT" || e?.code === "TIMEOUT";
    const out = runTimetableEngine(data);
    return mergeSolverReport(out, {
      ...baseMeta,
      applied: "legacy",
      fallbackReason: isTimeout ? "timeout" : "error",
      fallbackDetail: String(e?.message || e),
    });
  }
}

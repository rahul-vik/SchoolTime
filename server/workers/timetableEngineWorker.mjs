import { parentPort, workerData } from "node:worker_threads";
import { runTimetableEngineExperimental } from "../engineExperimental.js";

try {
  const out = runTimetableEngineExperimental(workerData);
  parentPort.postMessage({ ok: true, out });
} catch (e) {
  parentPort.postMessage({ ok: false, error: String(e?.message || e) });
}

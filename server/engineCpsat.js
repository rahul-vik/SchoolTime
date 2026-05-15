import { getTimetableSolverRuntime } from "./config/env.js";
import { buildCpsatSolveRequest, estimateCpSatLessonDecisionVars } from "./services/cpsatSolveRequestBuilder.js";
import { postCpsatSolve } from "./services/cpsatSolverHttpClient.js";
import { adaptCpsatSolveResponse } from "./services/cpsatSolveResponseAdapter.js";
import { validateTimetableRun } from "./services/timetableValidationService.js";

/**
 * CP-SAT global solver path (`TIMETABLE_SOLVER=cp_sat` or `hybrid` with `CP_SAT_SOLVER_URL` set).
 * On failure throws so `timetableSolverRunner` can fall back to the legacy greedy engine when configured.
 */
export async function runTimetableEngineCpsat(data) {
  const runtime = getTimetableSolverRuntime();
  const url = (runtime.cpSatUrl || "").trim();
  if (!url) {
    throw new Error("CP_SAT_URL_MISSING");
  }
  const est = estimateCpSatLessonDecisionVars(data);
  if (est > runtime.cpSatMaxDecisionVars) {
    throw new Error(`CP_SAT_SIZE_CAP:${est}`);
  }

  const req = buildCpsatSolveRequest({
    tenant: data,
    orgId: "",
    snapshotAt: new Date().toISOString(),
    runtime,
  });

  const bufferMs = Math.min(2000, Math.max(200, Math.floor(runtime.timeoutMs * 0.05)));
  const httpTimeout = Math.max(1500, runtime.timeoutMs - bufferMs);

  const raw = await postCpsatSolve(url, req, httpTimeout, runtime.cpSatSecret);
  const adapted = adaptCpsatSolveResponse(data, raw);
  if (!adapted.ok) {
    throw new Error(`CP_SAT_REJECT:${adapted.reason}`);
  }

  const base = adapted.result;
  const validation = validateTimetableRun({ state: data, entries: base.entries, runId: "" });
  const hardFindings = (validation.findings || []).filter((f) => f.severity === "ERROR");
  if (hardFindings.length > 0) {
    const codes = [...new Set(hardFindings.map((f) => f.code).filter(Boolean))];
    const err = new Error("CP_SAT_VALIDATION_FAILED");
    err.cpSatValidation = { validationFailed: true, codes, findingCount: hardFindings.length };
    if (runtime.cpSatFallbackOnValidation) {
      throw err;
    }
    return {
      ...base,
      report: {
        ...base.report,
        cpsat: {
          ...(base.report?.cpsat || {}),
          bridge: "node-http-v1",
          estimateDecisionVars: est,
          validationFailed: true,
          validationCodes: codes,
          validationFindingCount: hardFindings.length,
        },
      },
    };
  }

  return {
    ...base,
    report: {
      ...base.report,
      cpsat: {
        ...(base.report?.cpsat || {}),
        bridge: "node-http-v1",
        estimateDecisionVars: est,
        validationFailed: false,
        validationCodes: [],
      },
    },
  };
}

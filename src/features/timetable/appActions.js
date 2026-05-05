import { divisionsMissingClassTeacher } from "../shared/classTeacherCoverage";

export function generateTimetableFlow({
  payload,
  divisions,
  teachers,
  apiGenerateTimetable,
  setTimetableStatus,
  setGeneratingProgress,
  setTimetable,
  setCreditsRemaining,
  creditsRemaining,
  notify,
  navigate,
  onSuccess,
}) {
  setTimetable(null);
  setTimetableStatus("GENERATING");
  setGeneratingProgress(0);
  const iv = setInterval(
    () => setGeneratingProgress((p) => (p >= 88 ? p : p + Math.floor(Math.random() * 14) + 4)),
    280,
  );
  setTimeout(async () => {
    clearInterval(iv);
    try {
      const resp = await apiGenerateTimetable(payload);
      setGeneratingProgress(100);
      setTimetable({
        ...resp.timetable,
        runId: resp.timetable?.runId || resp.runId || null,
        generatedAt: resp.timetable?.generatedAt || resp.createdAt || null,
        sourceState: resp.timetable?.sourceState || payload,
        manualEdits: [],
      });
      setCreditsRemaining(resp.license?.creditsRemaining ?? creditsRemaining);
      setTimetableStatus("GENERATED");
      await onSuccess?.(resp);
      notify(`Timetable generated — Score: ${resp.timetable.score}/100`, "success");
      const missingCt = Array.isArray(resp.timetable.report?.divisionsMissingClassTeacher)
        ? resp.timetable.report.divisionsMissingClassTeacher
        : divisionsMissingClassTeacher(divisions, teachers);
      if (missingCt.length > 0) {
        notify(
          `${missingCt.length} class${missingCt.length === 1 ? " has" : "es have"} no class teacher assigned. Open Teachers and set Class teacher assignment.`,
          "warning",
        );
      }
      navigate("timetable");
    } catch (err) {
      setTimetableStatus("FAILED");
      notify(err.message || "Generation failed", "danger");
    }
  }, 1200);
}

export function swapTimetableCells({
  entry,
  isEditMode,
  pendingSwap,
  setPendingSwap,
  setTimetable,
  notify,
}) {
  if (!isEditMode) return;
  if (!pendingSwap) {
    setPendingSwap(entry);
    notify("Now tap another slot to swap", "info");
    return;
  }
  if (
    pendingSwap.divisionId === entry.divisionId &&
    pendingSwap.dayOfWeek === entry.dayOfWeek &&
    pendingSwap.slotNumber === entry.slotNumber
  ) {
    setPendingSwap(null);
    return;
  }
  setTimetable((prev) => {
    if (!prev?.entries) return prev;
    const fromEntry = pendingSwap;
    const toEntry = entry;
    const newEntries = prev.entries.map((e) => {
      if (
        e.divisionId === pendingSwap.divisionId &&
        e.dayOfWeek === pendingSwap.dayOfWeek &&
        e.slotNumber === pendingSwap.slotNumber
      ) return { ...e, subjectId: entry.subjectId, teacherId: entry.teacherId };
      if (
        e.divisionId === entry.divisionId &&
        e.dayOfWeek === entry.dayOfWeek &&
        e.slotNumber === entry.slotNumber
      ) return { ...e, subjectId: pendingSwap.subjectId, teacherId: pendingSwap.teacherId };
      return e;
    });
    const now = new Date().toISOString();
    const nextEdit = {
      id: `edit-${Date.now()}`,
      type: "SWAP",
      editedAt: now,
      from: {
        divisionId: fromEntry.divisionId,
        dayOfWeek: fromEntry.dayOfWeek,
        slotNumber: fromEntry.slotNumber,
        subjectId: fromEntry.subjectId || null,
        teacherId: fromEntry.teacherId || null,
      },
      to: {
        divisionId: toEntry.divisionId,
        dayOfWeek: toEntry.dayOfWeek,
        slotNumber: toEntry.slotNumber,
        subjectId: toEntry.subjectId || null,
        teacherId: toEntry.teacherId || null,
      },
    };
    const manualEdits = [...(prev.manualEdits || []), nextEdit];
    const nextReport = {
      ...(prev.report || {}),
      manualEditCount: manualEdits.length,
      lastManualEditAt: now,
    };
    return { ...prev, entries: newEntries, manualEdits, report: nextReport };
  });
  setPendingSwap(null);
  notify("Slots swapped and logged");
}

export async function queueExportFlow({ type, scope, setExportJobs, notify, downloadExport }) {
  const job = { id: `exp-${Date.now()}`, type, scope, status: "QUEUED", queuedAt: new Date().toISOString() };
  setExportJobs((prev) => [job, ...prev]);
  notify(`${type} export queued`);
  setExportJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: "PROCESSING" } : j)));
  try {
    await downloadExport(type, scope);
    setExportJobs((prev) => prev.map((j) => (
      j.id === job.id ? { ...j, status: "COMPLETED", completedAt: new Date().toISOString() } : j
    )));
    notify(`${type} export ready`);
  } catch (error) {
    setExportJobs((prev) => prev.map((j) => (
      j.id === job.id ? { ...j, status: "FAILED", error: error.message } : j
    )));
    notify(error.message || "Export failed", "danger");
  }
}

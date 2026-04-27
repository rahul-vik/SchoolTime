export function generateTimetableFlow({
  payload,
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
      setTimetable(resp.timetable);
      setCreditsRemaining(resp.license?.creditsRemaining ?? creditsRemaining);
      setTimetableStatus("GENERATED");
      await onSuccess?.(resp);
      notify(`Timetable generated — Score: ${resp.timetable.score}/100`, "success");
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
    return { ...prev, entries: newEntries };
  });
  setPendingSwap(null);
  notify("Slots swapped");
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

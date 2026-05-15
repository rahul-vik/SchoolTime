import { useState, useEffect } from "react";
import { UiIcon, useBreakpoint, ExpandableHelpSection } from "../shared/uiPrimitives";
import {
  findClassTeacherForDivision,
  teacherFullName,
  classTeacherDivisionLabels,
  classTeacherPrimarySubject,
  formatTeacherFreePeriodsShort,
  classTeacherCtBadgeStyle,
} from "../shared/timetableDisplayHelpers";
import { formatDateTimeIndian, formatTimeIndian } from "../shared/dateTimeFormat";
import { reportSubjectHoursCategoryShort, reportSubjectHoursSubjectLabel } from "../../../shared/reportHoursLabels.js";
import { sortWorkingDaysCanonical } from "../../../shared/periodSlotDays.js";
import { normalizeTenantSchoolOrdering, sortDivisionsByStandardOrder } from "../../../shared/schoolDisplayOrder.js";
import { resolveDivisionsMissingClassTeacher, formatDivisionMissingLabel } from "../shared/classTeacherCoverage";
import { findEntityById, pickTimetableSnapshotLists } from "../shared/idLookups";
import { buildCompletionInsights, formatUnscheduledGapLabel } from "../shared/timetableCompletionHints";
import { TimetableGeneratingPanel } from "./TimetableGeneratingPanel";

/** Timetable entries use slot numbers from the generation snapshot; grid columns must match or lessons appear under Break/Lunch headers. */
const TIMETABLE_SOLVER_PILLS = [
  {
    id: "hybrid",
    label: "Hybrid (recommended)",
    hint: "Tries the advanced solver first. If the Python helper is not running, the app still builds a timetable using the built-in method.",
  },
  {
    id: "cp_sat",
    label: "CP-SAT only",
    hint: "Uses only the Python helper (OR-Tools). Start it with npm run solver:cpsat and set CP_SAT_SOLVER_URL in .env — otherwise create may fail or fall back depending on server settings.",
  },
];

const SCHEDULING_MODE_PILLS = [
  { id: "STRICT", label: "Strict", hint: "Honor day and slot excludes on every pass." },
  { id: "BEST_FIT", label: "Best fit", hint: "May relax day and slot excludes to improve coverage (fixed-only placement stays hard)." },
  { id: "OPTIMAL", label: "Optimal", hint: "More search passes than best fit — still not a guaranteed global optimum." },
];

function periodGridForTimetableView(timetable, periodSlots, workingDays) {
  const snap = timetable?.sourceState;
  const rawWd = Array.isArray(snap?.workingDays) && snap.workingDays.length > 0 ? snap.workingDays : workingDays;
  const wdSorted = sortWorkingDaysCanonical(rawWd || []);
  const wd =
    wdSorted.length > 0 ? wdSorted : ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  return {
    periodSlots: Array.isArray(snap?.periodSlots) && snap.periodSlots.length > 0 ? snap.periodSlots : periodSlots,
    workingDays: wd,
  };
}

export function GeneratePage({
  timetableStatus,
  generatingProgress,
  onGenerate,
  timetable,
  divisions,
  subjects,
  teachers,
  standards,
  notify,
  navigate,
  schedulingRules,
  classTeacherPreferences,
  setClassTeacherPreferences,
  timetableSolver,
  setTimetableSolver,
  ui,
}) {
  const { T, css, Btn, ProgressBar, Modal, PillSelect } = ui;
  const { isMobile } = useBreakpoint();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const activeRules = schedulingRules.filter((r) => r.isActive);
  const restrictedCount = teachers.filter((t) => (t.assignedDivisionIds || []).length > 0).length;
  const schedulingMode = classTeacherPreferences?.schedulingMode || "STRICT";
  const missingClassTeachersAfterGen =
    timetable && timetableStatus === "GENERATED"
      ? resolveDivisionsMissingClassTeacher(timetable.report, divisions, teachers)
      : [];

  const readiness = [
    { label: "Classes added", ok: divisions.length > 0, count: divisions.length, nav: "standards" },
    { label: "Subjects added", ok: subjects.length > 0, count: subjects.length, nav: "subjects" },
    { label: "Teachers added", ok: teachers.length > 0, count: teachers.length, nav: "teachers" },
    { label: "Subjects assigned to teachers", ok: teachers.some((t) => (t.subjectIds || []).length > 0), count: teachers.filter((t) => (t.subjectIds || []).length > 0).length, nav: "teachers" },
  ];
  const isReady = readiness.every((r) => r.ok);

  useEffect(() => {
    if (!setTimetableSolver) return;
    const allowed = new Set(TIMETABLE_SOLVER_PILLS.map((p) => p.id));
    if (!allowed.has(timetableSolver)) setTimetableSolver("hybrid");
  }, [timetableSolver, setTimetableSolver]);

  const summaryCols = isMobile ? "1fr" : "1fr 1fr";

  return (
    <div style={{ width: "100%", maxWidth: 680, minWidth: 0, boxSizing: "border-box" }}>
      <h2 style={{ margin: "0 0 16px", fontSize: isMobile ? 18 : 20, fontWeight: 700 }}>Create timetable</h2>
      <div style={{ ...css.card, marginBottom: 16, padding: isMobile ? 16 : 20 }}>
        <h3 style={{ margin: "0 0 18px", fontSize: 15, fontWeight: 700 }}>Before You Create</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {readiness.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 14px", borderRadius: 10, background: r.ok ? T.success + "10" : T.danger + "08", border: `1px solid ${r.ok ? T.success + "30" : T.danger + "25"}`, flexWrap: "wrap" }}>
              <UiIcon name={r.ok ? "check" : "alert"} size={18} stroke={r.ok ? T.success : T.danger} />
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, color: r.ok ? T.success : T.danger }}>{r.label}</div><div style={{ fontSize: 11, color: T.textSoft }}>{r.count} configured</div></div>
              {!r.ok && <Btn onClick={() => navigate(r.nav)} variant="ghost" size="sm" style={{ flexShrink: 0 }}>Fix →</Btn>}
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...css.card, marginBottom: 16, padding: isMobile ? 16 : 20 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Timetable engine (this run)</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {TIMETABLE_SOLVER_PILLS.map((p) => {
            const active = timetableSolver === p.id;
            return (
              <button
                key={p.id}
                type="button"
                title={p.hint}
                disabled={timetableStatus === "GENERATING"}
                onClick={() => setTimetableSolver?.(p.id)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 999,
                  border: active ? "none" : `1px solid ${T.surfaceBorder}`,
                  cursor: timetableStatus === "GENERATING" ? "not-allowed" : "pointer",
                  fontSize: 12,
                  fontWeight: 700,
                  background: active ? T.brand : T.surfaceAlt,
                  color: active ? "#fff" : T.textMid,
                  opacity: timetableStatus === "GENERATING" ? 0.65 : 1,
                  transition: "all 0.15s",
                  maxWidth: "100%",
                  textAlign: "center",
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: T.textSoft, lineHeight: 1.45, padding: "10px 12px", background: T.surfaceAlt, borderRadius: 8, border: `1px solid ${T.surfaceBorder}` }}>
          <strong style={{ color: T.textMid }}>{TIMETABLE_SOLVER_PILLS.find((x) => x.id === timetableSolver)?.label || "Hybrid (recommended)"}</strong>
          {" — "}
          {TIMETABLE_SOLVER_PILLS.find((x) => x.id === timetableSolver)?.hint}
        </div>
      </div>

      <div style={{ ...css.card, marginBottom: 16, padding: isMobile ? 16 : 20 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Placement Preferences</h3>
        {activeRules.length === 0
          ? <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: T.warning + "10", borderRadius: 8, border: `1px solid ${T.warning + "30"}` }}><UiIcon name="alert" size={15} stroke={T.warning} /><span style={{ fontSize: 13, color: T.warning, flex: 1 }}>No placement preferences set yet.</span><Btn onClick={() => navigate("rules")} variant="ghost" size="sm">Set →</Btn></div>
          : <div><div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>{activeRules.map((r) => { const sub = subjects.find((s) => s.id === r.subjectId); return <span key={r.id} style={{ ...css.badge(sub?.colorHex || T.CORE), gap: 4 }}><UiIcon name="preferences" size={12} stroke="currentColor" />{sub?.code}</span>; })}</div><Btn onClick={() => navigate("rules")} variant="ghost" size="sm">Review Preferences →</Btn></div>}
        <div style={{ marginTop: 12 }}>
          <PillSelect
            label="Scheduling mode"
            value={schedulingMode}
            onChange={(v) => setClassTeacherPreferences?.((p) => ({ ...(p || {}), schedulingMode: v }))}
            options={SCHEDULING_MODE_PILLS}
            disabled={timetableStatus === "GENERATING"}
          />
        </div>
      </div>

      <div style={{ ...css.card, padding: isMobile ? 16 : 20 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Generation Summary</h3>
        <div style={{ display: "grid", gridTemplateColumns: summaryCols, gap: 10, marginBottom: 20 }}>
          {[
            { label: "Classes", value: divisions.length },
            { label: "Teachers", value: teachers.length },
            { label: "Preferences", value: `${activeRules.length} set` },
            { label: "Teacher class limits", value: `${restrictedCount} set` },
          ].map((item) => (
            <div key={item.label} style={{ padding: "11px 14px", background: T.surfaceAlt, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: T.textSoft, marginBottom: 3 }}>{item.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{item.value}</div>
            </div>
          ))}
        </div>

        {timetableStatus === "GENERATING" ? (
          <TimetableGeneratingPanel
            progress={generatingProgress}
            timetableSolver={timetableSolver}
            T={T}
            ProgressBar={ProgressBar}
          />
        ) : timetableStatus === "GENERATED" ? (
          <div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14, padding: 14, background: T.success + "10", borderRadius: 10, border: `1px solid ${T.success + "30"}` }}>
              <UiIcon name="check" size={20} stroke={T.success} />
              <div style={{ flex: 1 }}><div style={{ fontWeight: 700, color: T.success }}>Timetable Ready!</div><div style={{ fontSize: 12, color: T.textSoft }}>Quality score: {timetable?.score}/100</div></div>
              <Btn onClick={() => navigate("timetable")} size="sm">View →</Btn>
            </div>
            {missingClassTeachersAfterGen.length > 0 && (
              <div style={{ marginBottom: 14, padding: "12px 14px", background: T.warning + "10", borderRadius: 10, border: `1px solid ${T.warning}36`, fontSize: 12, color: T.textMid, lineHeight: 1.45 }}>
                <span style={{ fontWeight: 700, color: T.warning, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <UiIcon name="alert" size={14} stroke={T.warning} />
                  Class teachers missing
                </span>
                {missingClassTeachersAfterGen.length} class
                {missingClassTeachersAfterGen.length === 1 ? " has" : "es have"} no class teacher assigned. Open Teachers to fix before relying on class-teacher rules.
              </div>
            )}
            <Btn onClick={() => setConfirmOpen(true)} variant="ghost" fullWidth>Create Again</Btn>
          </div>
        ) : (
          <Btn onClick={() => isReady ? setConfirmOpen(true) : notify("Please complete the checklist first", "warning")} disabled={!isReady} fullWidth size="lg"><UiIcon name="create" size={14} stroke="currentColor" />Create Timetable</Btn>
        )}
      </div>

      {confirmOpen && (
        <Modal title="Confirm Timetable Creation" onClose={() => setConfirmOpen(false)} width={420}>
          <p style={{ fontSize: 14, color: T.textMid, margin: "0 0 8px" }}>This will create a timetable for:</p>
          <ul style={{ fontSize: 13, color: T.textMid, margin: "0 0 12px", paddingLeft: 20, lineHeight: 1.8 }}>
            <li>{divisions.length} divisions across {standards.length} standards</li>
            <li>{subjects.length} subjects · {teachers.length} teachers</li>
            <li>{restrictedCount} teachers with class limits</li>
            <li>{activeRules.length} placement preferences</li>
          </ul>
          {timetableStatus === "GENERATED" && <p style={{ fontSize: 13, color: T.warning, margin: "0 0 16px", display: "flex", alignItems: "center", gap: 6 }}><UiIcon name="alert" size={14} stroke={T.warning} />This will replace the current timetable.</p>}
          <div style={{ display: "flex", gap: 10 }}><Btn onClick={() => { setConfirmOpen(false); onGenerate(); }}>Create Now</Btn><Btn onClick={() => setConfirmOpen(false)} variant="ghost">Cancel</Btn></div>
        </Modal>
      )}
    </div>
  );
}

export function TimetablePage({ timetable, timetableStatus, divisions, teachers, subjects, schedulingRules, periodSlots, workingDays, standards, mediums, viewMode, setViewMode, selectedDivisionId, setSelectedDivisionId, selectedTeacherId, setSelectedTeacherId, isEditMode, setIsEditMode, pendingSwap, setPendingSwap, onCellClick, onUndoManualEdit, notify, navigate, helpers, ui }) {
  const { T, css, Btn, EmptyState } = ui;
  const { TimetableGrid } = helpers;
  const { isMobile, isDesktop } = useBreakpoint();
  const [expandedIssues, setExpandedIssues] = useState(() => new Set());
  const [optimizationHelpOpen, setOptimizationHelpOpen] = useState(false);

  const toggleIssueSection = (key) => {
    setExpandedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const manualEditCount = timetable
    ? Math.max(
        0,
        Number(timetable?.report?.manualEditCount || 0) || (Array.isArray(timetable?.manualEdits) ? timetable.manualEdits.length : 0),
      )
    : 0;
  const lastManualEditAt = timetable?.report?.lastManualEditAt;

  useEffect(() => {
    if (!onUndoManualEdit || manualEditCount <= 0) return undefined;
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || String(e.key).toLowerCase() !== "z" || e.shiftKey) return;
      const el = e.target;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      e.preventDefault();
      onUndoManualEdit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onUndoManualEdit, manualEditCount]);

  useEffect(() => {
    setExpandedIssues(new Set());
    setOptimizationHelpOpen(false);
  }, [timetable?.id, timetable?.generatedAt]);

  if (timetableStatus === "DRAFT" || !timetable) {
    return (
      <div style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}>
        <h2 style={{ margin: "0 0 14px", fontSize: isMobile ? 18 : 20, fontWeight: 700 }}>Timetable</h2>
        <EmptyState iconKey="create" title="No timetable yet" desc="Create a timetable to view it here" action={<Btn onClick={() => navigate("generate")}>Go to Create</Btn>} />
      </div>
    );
  }
  const selectedId = viewMode === "division" ? selectedDivisionId : selectedTeacherId;
  const currentDiv = divisions.find((d) => d.id === selectedDivisionId);
  const currentStd = currentDiv ? standards.find((s) => s.id === currentDiv.standardId) : null;
  const selTeacher = teachers.find((t) => t.id === selectedTeacherId);
  const classTeacherForDiv = currentDiv ? findClassTeacherForDivision(currentDiv.id, teachers) : null;
  const teacherCtLabels = selTeacher ? classTeacherDivisionLabels(selTeacher, divisions, standards) : [];
  const generatedLabel = timetable?.generatedAt ? formatDateTimeIndian(timetable.generatedAt, null) : null;
  const divisionsWithoutClassTeacher = resolveDivisionsMissingClassTeacher(timetable.report, divisions, teachers);
  const { divisions: reportDivisions, standards: reportStandards, subjects: reportSubjects } = pickTimetableSnapshotLists(timetable, {
    divisions,
    standards,
    subjects,
  });
  const { periodSlots: gridPeriodSlots, workingDays: gridWorkingDays } = periodGridForTimetableView(timetable, periodSlots, workingDays);
  const rulesForHints = (schedulingRules && schedulingRules.length > 0)
    ? schedulingRules
    : (timetable?.sourceState?.schedulingRules || []);
  const restrictedTeachers = teachers.filter((t) => (t.assignedDivisionIds || []).length > 0).length;
  const gapInsights = buildCompletionInsights({
    completionPct: timetable?.score || 0,
    timetable,
    subjects,
    divisions,
    standards,
    teachers,
    schedulingRules: rulesForHints,
    restrictedTeachers,
  });
  const unscheduledList = timetable.report?.unscheduled || [];
  const hasFreeConf = selTeacher && ((selTeacher.freeMorningPeriods || 0) > 0 || (selTeacher.freeEveningPeriods || 0) > 0);
  const topRejectionReasons = Object.entries(timetable.report?.rejections || {})
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 3);
  const formatRejectionReason = (reason) =>
    String(reason || "")
      .toLowerCase()
      .split("_")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  const recommendationByReason = {
    DIVISION_BLOCKED: {
      title: "Teacher not allowed for that class",
      detail: "In Teachers, assign the teacher to that division, or remove the “only these classes” limit.",
      nav: "teachers",
    },
    DIVISION_OCCUPIED: {
      title: "That class already has another lesson in the slot",
      detail: "In Preferences, reduce fixed “only this period” rules, or lower weekly hours for subjects fighting for the same slots.",
      nav: "rules",
    },
    DAY_RULE_BLOCKED: {
      title: "Subject blocked on that day",
      detail: "In Preferences, remove or soften “do not teach on this day” for subjects that still need periods.",
      nav: "rules",
    },
    SLOT_RULE_BLOCKED: {
      title: "Subject blocked in that period",
      detail: "In Preferences, remove “do not use first/last period” (or similar) for subjects with gaps.",
      nav: "rules",
    },
    SUBJECT_MAX_PER_DAY: {
      title: "Too many lessons for that subject on one day",
      detail: "In Subjects, raise “max per day” for that subject, or spread hours across more days.",
      nav: "subjects",
    },
    TEACHER_SLOT_TAKEN: {
      title: "Teacher already busy in that period",
      detail: "In Teachers, add another teacher for that subject, or reduce their load on other classes.",
      nav: "teachers",
    },
    TEACHER_FREE_PERIOD_RULE: {
      title: "Teacher must stay free in that period",
      detail: "In Preferences or Teachers, reduce reserved free periods, or move them to quieter slots.",
      nav: "rules",
    },
    TEACHER_DAILY_CAPACITY: {
      title: "Teacher hit daily lesson limit",
      detail: "In Teachers, raise max lessons per day, reduce free periods, or share the subject with another teacher.",
      nav: "teachers",
    },
    TEACHER_MORNING_CAPACITY: {
      title: "Teacher has too many morning free periods",
      detail: "In Teachers, lower “free morning periods” so more morning slots can be used.",
      nav: "teachers",
    },
    TEACHER_EVENING_CAPACITY: {
      title: "Teacher has too many end-of-day free periods",
      detail: "In Teachers, lower “free evening periods” so more last periods can be used.",
      nav: "teachers",
    },
    TEACHER_WEEKLY_CAPACITY: {
      title: "Teacher hit weekly lesson limit",
      detail: "In Teachers, raise max per week, or assign a second teacher for that subject.",
      nav: "teachers",
    },
    CONTINUITY_LIMIT: {
      title: "Too many back-to-back lessons",
      detail: "In Teachers, relax “max continuous periods” for that teacher or subject.",
      nav: "teachers",
    },
    CROSS_DIVISION_CONTINUITY_DAY: {
      title: "Teacher cannot teach two classes back-to-back across divisions",
      detail: "In Teachers, split classes across teachers or adjust continuity limits.",
      nav: "teachers",
    },
    NO_ELIGIBLE_SUBJECT: {
      title: "No teacher matched subject and medium",
      detail: "In Teachers, tick the subject and medium, and allow that class in teacher assignments.",
      nav: "teachers",
    },
    NON_LESSON_SLOT: {
      title: "Tried to place a lesson on break or lunch",
      detail: "In Periods, use lesson rows only for fixed placement; in Preferences, pick a teaching period.",
      nav: "periods",
    },
  };
  const recommendedFixes = topRejectionReasons.map(([reason, count]) => ({
    reason,
    count,
    ...(recommendationByReason[reason] || {
      title: formatRejectionReason(reason),
      detail: "Review related constraints and relax them slightly for better coverage.",
      nav: "rules",
    }),
  }));

  return (
    <div style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <h2 style={{ margin: "0 0 14px", fontSize: isMobile ? 18 : 20, fontWeight: 700 }}>Timetable</h2>
      <div style={{ display: "flex", gap: 10, alignItems: "stretch", marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", background: T.surfaceAlt, borderRadius: 8, padding: 3, border: `1px solid ${T.surfaceBorder}`, flex: isMobile ? "1 1 100%" : undefined, justifyContent: isMobile ? "stretch" : undefined }}>
          {["division", "teacher"].map((m) => (
            <button key={m} onClick={() => setViewMode(m)} style={{ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: viewMode === m ? T.brand : "transparent", color: viewMode === m ? "#fff" : T.textMid, transition: "all 0.15s", textTransform: "capitalize" }}>{m}</button>
          ))}
        </div>
        {viewMode === "division" ? (
          <select id="timetable-division" name="timetableDivision" aria-label="Select division" value={selectedDivisionId} onChange={(e) => setSelectedDivisionId(e.target.value)} style={{ ...css.input, width: isMobile ? "100%" : "auto", minWidth: isMobile ? 0 : 150, flex: isMobile ? "1 1 100%" : 1 }}>
            {sortDivisionsByStandardOrder(divisions, standards).map((d) => { const s = standards.find((x) => x.id === d.standardId); return <option key={d.id} value={d.id}>Std {s?.name} - Div {d.name}</option>; })}
          </select>
        ) : (
          <select id="timetable-teacher" name="timetableTeacher" aria-label="Select teacher" value={selectedTeacherId} onChange={(e) => setSelectedTeacherId(e.target.value)} style={{ ...css.input, width: isMobile ? "100%" : "auto", minWidth: isMobile ? 0 : 160, flex: isMobile ? "1 1 100%" : 1 }}>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>)}
          </select>
        )}
        <Btn onClick={() => { setIsEditMode((p) => !p); if (isEditMode) setPendingSwap(null); }} variant={isEditMode ? "primary" : "ghost"} size="sm" style={isMobile ? { alignSelf: "flex-start" } : undefined}>{isEditMode ? "Edit Mode On" : "Edit"}</Btn>
        {manualEditCount > 0 && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              title={lastManualEditAt ? `Last manual edit: ${formatDateTimeIndian(lastManualEditAt, "")}` : "Manual edits detected"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 10px",
                borderRadius: 999,
                border: `1px solid ${T.info}44`,
                background: T.info + "12",
                color: T.info,
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              <UiIcon name="check" size={12} stroke={T.info} />
              Manual edits: {manualEditCount}
            </span>
            {onUndoManualEdit ? (
              <Btn size="sm" variant="ghost" title="Undo last swap (Ctrl+Z or ⌘Z)" onClick={() => onUndoManualEdit()}>
                Undo last
              </Btn>
            ) : null}
          </div>
        )}
      </div>

      {isEditMode && (
        <div style={{ padding: "10px 14px", background: T.info + "14", borderRadius: 8, marginBottom: 14, fontSize: 13, color: T.info, fontWeight: 500 }}>
          {pendingSwap ? "Cell selected — tap another lesson or free period to swap." : "Tap one lesson or free period, then another to swap. Use Undo last or Ctrl+Z (⌘Z) to reverse the last swap."}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ ...css.card, display: "flex", flexDirection: "column", gap: 6, flex: "1 1 220px", padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "stretch", gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: (timetable.score > 85 ? T.success : T.warning) + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 900, color: timetable.score > 85 ? T.success : T.warning, flexShrink: 0 }}>{timetable.score}</div>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Timetable Quality</div>
              <div style={{ fontSize: 11, color: T.textSoft }}>{timetable.report?.totalScheduled}/{timetable.report?.totalRequired} placed</div>
            </div>
          </div>
          {generatedLabel ? <div style={{ fontSize: 11, color: T.textSoft, textAlign: "left", marginLeft: 0, marginTop: "auto" }}>Generated: <span style={{ color: T.textMid, fontWeight: 700 }}>{generatedLabel}</span></div> : null}
        </div>
        {(divisionsWithoutClassTeacher.length > 0 || unscheduledList.length > 0) && (
          <div style={{ ...css.card, flex: isMobile ? "1 1 100%" : "2 1 300px", minWidth: isMobile ? "min(100%, 320px)" : 280, padding: "10px 16px", border: `1px solid ${T.warning}40` }}>
            {isDesktop ? (
              <div style={{ fontSize: 13, fontWeight: 700, color: T.warning, marginBottom: 6 }}>Needs your attention</div>
            ) : null}
            {divisionsWithoutClassTeacher.length > 0 ? (
              <ExpandableHelpSection
                T={T}
                open={expandedIssues.has("classTeacher")}
                onToggle={() => toggleIssueSection("classTeacher")}
                heading={`${divisionsWithoutClassTeacher.length} class${divisionsWithoutClassTeacher.length === 1 ? "" : "es"} have no class teacher`}
              >
                <p style={{ fontSize: 11, color: T.textSoft, margin: "0 0 8px", lineHeight: 1.45 }}>
                  In Teachers, open <strong style={{ color: T.textMid }}>Class teacher assignment</strong> for each class below so reports and exports stay accurate.
                </p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {divisionsWithoutClassTeacher.slice(0, 8).map((row) => (
                    <span key={row.divisionId} style={css.badge(T.warning)}>
                      {formatDivisionMissingLabel(row, standards)}
                    </span>
                  ))}
                </div>
                <Btn onClick={() => navigate("teachers")} size="sm" variant="ghost">Teachers</Btn>
              </ExpandableHelpSection>
            ) : null}
            {divisionsWithoutClassTeacher.length > 0 && unscheduledList.length > 0 ? (
              <div style={{ height: 1, background: T.surfaceBorder, margin: "4px 0" }} aria-hidden="true" />
            ) : null}
            {unscheduledList.length > 0 ? (
              <ExpandableHelpSection
                T={T}
                open={expandedIssues.has("gaps")}
                onToggle={() => toggleIssueSection("gaps")}
                heading={`${unscheduledList.length} class–subject rows still need more lessons`}
              >
                {gapInsights.summary ? (
                  <p style={{ fontSize: 12, color: T.textMid, margin: "0 0 12px", lineHeight: 1.5 }}>{gapInsights.summary}</p>
                ) : null}
                {gapInsights.bullets.length > 0 ? (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.textMid, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      What to do
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, color: T.textMid, lineHeight: 1.5 }}>
                      {gapInsights.bullets.map((line, i) => (
                        <li key={i} style={{ marginBottom: 6 }}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div style={{ fontSize: 11, fontWeight: 700, color: T.textMid, marginBottom: 6 }}>Examples (largest gaps)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                  {[...unscheduledList]
                    .sort((a, b) => (b.periodsShort || 0) - (a.periodsShort || 0))
                    .slice(0, 8)
                    .map((u) => (
                      <div
                        key={`${u.divisionId}-${u.subjectId}`}
                        style={{ fontSize: 11, color: T.textMid, padding: "6px 10px", background: T.warning + "10", borderRadius: 6, border: `1px solid ${T.warning}30` }}
                      >
                        {formatUnscheduledGapLabel(u, { subjects: reportSubjects, divisions: reportDivisions, standards: reportStandards })}
                      </div>
                    ))}
                </div>
                {unscheduledList.length > 8 ? (
                  <p style={{ fontSize: 11, color: T.textSoft, margin: "0 0 10px" }}>
                    Plus {unscheduledList.length - 8} more — open Reports → Division completion for the full list.
                  </p>
                ) : null}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <Btn onClick={() => navigate("teachers")} size="sm" variant="ghost">Teachers</Btn>
                  <Btn onClick={() => navigate("rules")} size="sm" variant="ghost">Preferences</Btn>
                  <Btn onClick={() => navigate("subjects")} size="sm" variant="ghost">Subjects</Btn>
                  <Btn onClick={() => navigate("reports")} size="sm" variant="ghost">Reports</Btn>
                  <Btn onClick={() => navigate("generate")} size="sm">Create again</Btn>
                </div>
              </ExpandableHelpSection>
            ) : null}
          </div>
        )}
      </div>

      <div style={{ ...css.card, padding: isMobile ? 12 : 20, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ marginBottom: 12, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ minWidth: 0, flex: "1 1 200px" }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
              {viewMode === "division" && currentDiv ? `Std ${currentStd?.name} — Div ${currentDiv.name}` : viewMode === "teacher" && selTeacher ? `${selTeacher.firstName} ${selTeacher.lastName}` : ""}
            </h3>
            {viewMode === "division" && currentDiv && (
              <div style={{ fontSize: 11, color: T.textSoft, marginTop: 4, fontWeight: 500 }}>
                Class teacher: {classTeacherForDiv ? <span style={{ color: T.textMid, fontWeight: 700 }}>{teacherFullName(classTeacherForDiv)}</span> : <span style={{ fontStyle: "italic" }}>Not assigned</span>}
              </div>
            )}
            {viewMode === "teacher" && selTeacher && teacherCtLabels.length > 0 && (
              <div style={{ fontSize: 11, color: T.textSoft, marginTop: 4, fontWeight: 500 }}>
                Class teacher of: <span style={{ color: T.info, fontWeight: 700 }}>{teacherCtLabels.join(", ")}</span>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["LANGUAGE", "CORE", "NON_CORE", "EXTRA_CURRICULAR"].map((cat) => (
              <span key={cat} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: T.textSoft }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: T[cat], display: "inline-block" }} />{cat.replace(/_/g, " ")}</span>
            ))}
          </div>
        </div>
        <TimetableGrid timetable={timetable} divisions={divisions} teachers={teachers} subjects={subjects} periodSlots={gridPeriodSlots} workingDays={gridWorkingDays} viewMode={viewMode} selectedId={selectedId} onCellClick={onCellClick} isEditable={isEditMode} pendingSwap={pendingSwap} standards={standards} mediums={mediums || []} />
        {viewMode === "teacher" && hasFreeConf && (
          <div style={{ marginTop: 10, padding: "7px 12px", background: T.info + "10", borderRadius: 6, fontSize: 11, color: T.textMid, textAlign: "center", lineHeight: 1.4 }}>
            Free periods:{" "}
            <span style={{ color: T.info, fontWeight: 700 }}>{formatTeacherFreePeriodsShort(selTeacher.freeMorningPeriods, selTeacher.freeEveningPeriods)}</span>
          </div>
        )}
      </div>
      {timetable.report?.optimization && (
        <div style={{ ...css.card, marginTop: 12, padding: "10px 16px" }}>
          <ExpandableHelpSection
            T={T}
            tone="info"
            open={optimizationHelpOpen}
            onToggle={() => setOptimizationHelpOpen((v) => !v)}
            heading="Why some slots could not be filled"
          >
          <div style={{ fontSize: 11, color: T.textSoft, lineHeight: 1.5 }}>
            Scheduling mode:{" "}
            <strong>
              {(timetable.report.optimization.mode || "STRICT") === "STRICT"
                ? "Strict — never skips blocked days or periods"
                : (timetable.report.optimization.mode || "") === "OPTIMAL"
                  ? "Optimal — more attempts; may relax some day/slot blocks"
                  : "Best fit — may relax some day/slot blocks to place more lessons"}
            </strong>
            <br />
            Extra placement attempts: <strong>{timetable.report.optimization.searchPasses ?? 0}</strong>
            <br />
            Times a blocked day or period was ignored to place a lesson:{" "}
            <strong>{timetable.report.optimization.softRuleRelaxPlacements ?? 0}</strong>
          </div>
          {topRejectionReasons.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: T.textSoft }}>
              Most common blockers: {topRejectionReasons.map(([reason, count]) => `${formatRejectionReason(reason)} (${count})`).join(" · ")}
            </div>
          )}
          {recommendedFixes.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {recommendedFixes.map((fix) => (
                <div key={fix.reason} style={{ fontSize: 11, color: T.textSoft, lineHeight: 1.45, background: T.surfaceAlt, border: `1px solid ${T.surfaceBorder}`, borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 4 }}>
                    <strong style={{ color: T.textMid }}>{fix.title}</strong>
                    <span style={{ fontSize: 10, color: T.textSoft }}>{fix.count} hits</span>
                  </div>
                  <div>{fix.detail}</div>
                  <div style={{ marginTop: 6 }}>
                    <Btn size="sm" variant="ghost" onClick={() => navigate(fix.nav)}>Open {fix.nav === "teachers" ? "Teachers" : fix.nav === "subjects" ? "Subjects" : fix.nav === "periods" ? "Periods" : "Preferences"} →</Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
          </ExpandableHelpSection>
        </div>
      )}
    </div>
  );
}

export function ReportsPage({ timetable, divisions, subjects, teachers, standards, workingDays, periodSlots, navigate, ui }) {
  const { T, css, Btn, EmptyState, ProgressBar } = ui;
  const { isMobile } = useBreakpoint();
  const [activeReport, setActiveReport] = useState("subject-hours");
  const generatedLabel = timetable?.generatedAt ? formatDateTimeIndian(timetable.generatedAt, null) : null;
  const sourceState = timetable?.sourceState || {};
  const reportSlice = normalizeTenantSchoolOrdering({
    standards: sourceState.standards || standards || [],
    divisions: sourceState.divisions || divisions || [],
    workingDays: sourceState.workingDays || workingDays || [],
  });
  const reportDivisions = reportSlice.divisions;
  const reportStandards = reportSlice.standards;
  const reportWorkingDays =
    reportSlice.workingDays.length > 0
      ? reportSlice.workingDays
      : ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  const reportSubjects = sourceState.subjects || subjects || [];
  const reportTeachers = sourceState.teachers || teachers || [];
  const reportPeriodSlots = sourceState.periodSlots || periodSlots || [];
  if (!timetable) {
    return (
      <div style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: isMobile ? 18 : 20, fontWeight: 700 }}>Reports</h2>
        <EmptyState iconKey="reports" title="No timetable yet" desc="Create a timetable to view reports" action={<Btn onClick={() => navigate("generate")}>Create Now</Btn>} />
      </div>
    );
  }

  const subjectAppliesToDivision = (sub, div) => {
    if (!sub || !div) return false;
    if (!(sub.standardIds || []).includes(div.standardId)) return false;
    if (!(sub.mediumIds || []).includes(div.mediumId)) return false;
    const scopeMode = sub.divisionScopeMode === "CUSTOM_DIVISION_OVERRIDES" ? "CUSTOM_DIVISION_OVERRIDES" : "ALL_IN_SELECTED_CLASSES";
    if (scopeMode === "ALL_IN_SELECTED_CLASSES") return true;
    const includeIds = sub.divisionIncludeIds || [];
    const excludeIds = sub.divisionExcludeIds || [];
    if (includeIds.length > 0) return includeIds.includes(div.id);
    if (excludeIds.length > 0) return !excludeIds.includes(div.id);
    return true;
  };
  const getDivisionRequiredWeekly = (sub, divisionId) => {
    const limit = (sub.divisionLimits || []).find((dl) => dl.divisionId === divisionId);
    return limit?.weeklyPeriods !== undefined ? Math.max(1, Number(limit.weeklyPeriods) || 1) : Math.max(1, Number(sub.weeklyPeriods) || 1);
  };

  /** Lesson-like placements only (excludes free periods / break / lunch rows on the teacher grid). */
  const countTeacherTeachingPeriods = (teacherId) =>
    (timetable.entries || []).filter(
      (e) =>
        String(e.teacherId) === String(teacherId) &&
        !e.isFreePeriod &&
        e.subjectId &&
        e.slotType !== "BREAK" &&
        e.slotType !== "LUNCH",
    ).length;

  const teacherSubjectsExplicit = Array.isArray(sourceState.teacherSubjects) ? sourceState.teacherSubjects : [];

  /** Action hints when teaching load is clearly below the weekly ceiling (bar uses teaching periods only). */
  const buildTeacherUnderutilizationHints = (teacher, teachingAssigned, max) => {
    const pctTeaching = max > 0 ? (teachingAssigned / max) * 100 : 0;
    const shortfall = max - teachingAssigned;
    const underUtilized =
      max >= 4 && shortfall >= 2 && (pctTeaching < 45 || teachingAssigned === 0);
    if (!underUtilized) return [];

    const hints = [];
    const subjIds = teacher.subjectIds || [];
    const mediums = teacher.mediumIds || [];

    if (subjIds.length === 0) {
      hints.push({
        key: "no-subjects",
        text: "No subjects are assigned to this teacher, so the engine cannot place lessons with them.",
        nav: "teachers",
        navLabel: "Teachers",
      });
      return hints;
    }

    const subjectsForTeacher = subjIds
      .map((id) => reportSubjects.find((s) => String(s.id) === String(id)))
      .filter(Boolean);

    const assignedDivIds = teacher.assignedDivisionIds || [];
    if (assignedDivIds.length > 0) {
      let anyApplicability = false;
      for (const divId of assignedDivIds) {
        const div = reportDivisions.find((d) => String(d.id) === String(divId));
        if (!div) continue;
        if (mediums.length > 0 && !mediums.includes(div.mediumId)) continue;
        for (const sub of subjectsForTeacher) {
          if (subjectAppliesToDivision(sub, div)) {
            anyApplicability = true;
            break;
          }
        }
        if (anyApplicability) break;
      }
      if (!anyApplicability) {
        hints.push({
          key: "scoped-no-subject-fit",
          text: "They are limited to specific classes, but none of their subjects apply to the standard, medium, or division scope of those classes. Update each subject’s class selection (standards/mediums) or adjust which classes this teacher may teach.",
          nav: "subjects",
          navLabel: "Subjects",
        });
      }
      const mediumMismatch = assignedDivIds.some((id) => {
        const div = reportDivisions.find((d) => String(d.id) === String(id));
        return div && mediums.length > 0 && !mediums.includes(div.mediumId);
      });
      if (mediumMismatch) {
        hints.push({
          key: "medium-mismatch",
          text: "Their medium list does not include the medium of at least one class they are limited to. Add that medium on the teacher, or change the class limit list.",
          nav: "teachers",
          navLabel: "Teachers",
        });
      }
    }

    if (teacherSubjectsExplicit.some((ts) => String(ts.teacherId) === String(teacher.id))) {
      hints.push({
        key: "explicit-ts",
        text: "Teacher–subject assignment rows are in use: confirm each row includes the right divisions and that subjects still apply to those standards.",
        nav: "teachers",
        navLabel: "Teachers",
      });
    }

    const unscheduled = timetable?.report?.unscheduled || [];
    const shortSubjects = unscheduled.filter((u) => subjIds.includes(String(u.subjectId)));
    if (shortSubjects.length > 0) {
      hints.push({
        key: "unscheduled-demand",
        text: `Weekly periods are still short for ${shortSubjects.length} class–subject row(s) involving subjects this teacher teaches. Add alternate teachers, relax placement preferences, or review scheduling mode.`,
        nav: "rules",
        navLabel: "Preferences",
      });
    }

    if ((Number(teacher.freeMorningPeriods) || 0) + (Number(teacher.freeEveningPeriods) || 0) >= 3) {
      hints.push({
        key: "free-frac",
        text: "High morning/evening free-period counts shrink how many lessons can be assigned. Lower those numbers if you want a heavier teaching load on the timetable.",
        nav: "teachers",
        navLabel: "Teachers",
      });
    }

    const schedMode = sourceState.classTeacherPreferences?.schedulingMode || "STRICT";
    if (schedMode === "STRICT" && hints.length < 5) {
      hints.push({
        key: "best-fit",
        text: "Strict scheduling keeps day/slot rules tight. Try Best fit or Optimal on Create, then generate again if coverage is the priority.",
        nav: "generate",
        navLabel: "Create",
      });
    }

    if (Number(teacher.maxPerWeek || 0) > 0 && Number(teacher.maxPerWeek) <= 12 && teachingAssigned < max - 2) {
      hints.push({
        key: "max-week",
        text: `Weekly cap is set to ${Number(teacher.maxPerWeek)}. If you expect more lessons than this, raise Max periods / week (and Max / day if needed).`,
        nav: "teachers",
        navLabel: "Teachers",
      });
    }

    const seen = new Set();
    return hints.filter((h) => {
      if (seen.has(h.key)) return false;
      seen.add(h.key);
      return true;
    });
  };

  const subjectHours = reportSubjects.map((sub) => {
    const byStd = {};
    const reqByStd = {};
    let totalRequiredAll = 0;
    let eligibleDivCountAll = 0;
    reportStandards.forEach((std) => {
      const eligibleDivs = reportDivisions.filter((d) => d.standardId === std.id && subjectAppliesToDivision(sub, d));
      if (eligibleDivs.length === 0) return;
      const totalGot = eligibleDivs.reduce((acc, div) => acc + timetable.entries.filter((e) => e.divisionId === div.id && e.subjectId === sub.id).length, 0);
      const totalReq = eligibleDivs.reduce((acc, div) => acc + getDivisionRequiredWeekly(sub, div.id), 0);
      byStd[std.name] = Math.round(totalGot / Math.max(eligibleDivs.length, 1));
      reqByStd[std.name] = Math.round(totalReq / Math.max(eligibleDivs.length, 1));
      totalRequiredAll += totalReq;
      eligibleDivCountAll += eligibleDivs.length;
    });
    const requiredAvg = eligibleDivCountAll > 0 ? Math.round(totalRequiredAll / eligibleDivCountAll) : Math.max(1, Number(sub.weeklyPeriods) || 1);
    const requiredLabel = (sub.divisionLimits || []).length > 0 ? `${requiredAvg} avg` : `${requiredAvg}`;
    return { subject: sub, byStandard: byStd, requiredByStandard: reqByStd, requiredAvg, requiredLabel };
  });

  const teacherWorkload = reportTeachers.map((t) => {
    const teachingAssigned = countTeacherTeachingPeriods(t.id);
    const lessonSlots = (reportPeriodSlots || []).filter((s) => s.slotType === "LESSON");
    const lunchNums = (reportPeriodSlots || []).filter((s) => s.slotType === "LUNCH").map((s) => s.slotNumber);
    const firstAfterLunch = lunchNums.length > 0
      ? lessonSlots.filter((s) => s.slotNumber > Math.max(...lunchNums)).sort((a, b) => a.slotNumber - b.slotNumber)[0]?.slotNumber ?? null
      : null;
    const morningLessonCount = lessonSlots.filter((s) => (firstAfterLunch ? s.slotNumber < firstAfterLunch : s.slotNumber <= Math.ceil(lessonSlots.length / 2))).length;
    const eveningLessonCount = lessonSlots.length - morningLessonCount;
    const derivedMaxPerDay = Math.max(0, Math.min(lessonSlots.length, Math.max(0, morningLessonCount - Number(t.freeMorningPeriods || 0)) + Math.max(0, eveningLessonCount - Number(t.freeEveningPeriods || 0))));
    const derivedMaxPerWeek = Math.max(30, derivedMaxPerDay * (reportWorkingDays?.length || 0));
    const max = Math.max(1, Number(t.maxPerWeek || 0) > 0 ? Number(t.maxPerWeek) : derivedMaxPerWeek);
    const pct = Math.round((teachingAssigned / max) * 100);
    const workloadHints = buildTeacherUnderutilizationHints(t, teachingAssigned, max);
    return { teacher: t, assigned: teachingAssigned, max, pct, workloadHints };
  });

  const anyTeacherUnderutilized = teacherWorkload.some((tw) => (tw.workloadHints || []).length > 0);

  const divReportCols = isMobile ? "1fr" : "repeat(auto-fill,minmax(250px,1fr))";

  return (
    <div style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <h2 style={{ margin: "0 0 16px", fontSize: isMobile ? 18 : 20, fontWeight: 700 }}>Reports</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {[["subject-hours", "Subject Hours"], ["teacher-workload", "Teacher Workload"], ["division-completion", "Division Completion"]].map(([id, label]) => (
          <button key={id} onClick={() => setActiveReport(id)} style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${activeReport === id ? T.brand : T.surfaceBorder}`, background: activeReport === id ? T.brand : "transparent", color: activeReport === id ? "#fff" : T.textMid, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{label}</button>
        ))}
      </div>

      {activeReport === "subject-hours" && (
        <div style={{ ...css.card, overflowX: "auto" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700 }}>Weekly Subject Hours (Average per Division)</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 500 }}>
            <thead><tr style={{ background: T.surfaceAlt }}>{["Subject", "Cat.", "Required", ...reportStandards.map((s) => `Std ${s.name}`)].map((h) => <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: "uppercase", borderBottom: `1px solid ${T.surfaceBorder}` }}>{h}</th>)}</tr></thead>
            <tbody>
              {subjectHours.filter((sh) => Object.keys(sh.byStandard).length > 0).map((sh, i) => (
                <tr key={sh.subject.id} style={{ borderBottom: `1px solid ${T.surfaceBorder}`, background: i % 2 === 0 ? T.surface : T.surfaceAlt + "50" }}>
                  <td style={{ padding: "10px 14px" }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: sh.subject.colorHex }} /><span style={{ fontWeight: 700 }}>{reportSubjectHoursSubjectLabel(sh.subject)}</span></div></td>
                  <td style={{ padding: "10px 14px" }}><span style={css.badge(T[sh.subject.category] || T.CORE)}>{reportSubjectHoursCategoryShort(sh.subject.category)}</span></td>
                  <td style={{ padding: "10px 14px", fontWeight: 800, color: T.brand }}>{sh.requiredLabel}</td>
                  {reportStandards.map((s) => <td key={s.id} style={{ padding: "10px 14px", textAlign: "center" }}>{sh.byStandard[s.name] != null ? <span style={{ fontWeight: 700, color: sh.byStandard[s.name] >= (sh.requiredByStandard[s.name] ?? sh.requiredAvg) ? T.success : T.warning }}>{sh.byStandard[s.name]}</span> : <span style={{ color: T.textSoft }}>—</span>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeReport === "teacher-workload" && (
        <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 12 : 14 }}>
          {anyTeacherUnderutilized ? (
            <div
              style={{
                ...css.card,
                padding: "12px 14px",
                background: T.info + "0e",
                border: `1px solid ${T.info}38`,
                fontSize: 12,
                color: T.textMid,
                lineHeight: 1.45,
              }}
            >
              <strong style={{ color: T.info }}>Under-used teaching capacity</strong>
              <span style={{ display: "block", marginTop: 4, fontWeight: 500 }}>
                Some teachers are well below their weekly teaching ceiling. Suggestions appear only on those cards — follow the links to fix configuration, then create the timetable again.
              </span>
            </div>
          ) : null}
          {teacherWorkload.map((tw) => {
            const ctCount = (tw.teacher.classTeacherDivisionIds || []).length;
            const wlColor = tw.pct > 90 ? T.danger : tw.pct > 70 ? T.warning : T.success;
            const avatar = (
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: T.brand, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 14, flexShrink: 0 }}>
                {tw.teacher.firstName[0]}
                {tw.teacher.lastName[0]}
              </div>
            );
            const nameBlock = (
              <>
                <div style={{ fontWeight: 700, fontSize: isMobile ? 15 : undefined }}>{tw.teacher.firstName} {tw.teacher.lastName}</div>
                <div style={{ fontSize: 11, color: T.textSoft }}>{tw.teacher.employeeCode}</div>
              </>
            );
            const metaBlock = (
              <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 8 : 4 }}>
                {(tw.teacher.assignedDivisionIds || []).length > 0 && (
                  <div style={{ fontSize: isMobile ? 12 : 11, color: T.brand, display: "flex", alignItems: "flex-start", gap: 6, lineHeight: 1.35 }}>
                    <UiIcon name="pin" size={12} stroke={T.brand} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>Limited to teaching {tw.teacher.assignedDivisionIds.length} division{tw.teacher.assignedDivisionIds.length !== 1 ? "s" : ""}</span>
                  </div>
                )}
                {(tw.teacher.classTeacherDivisionIds || []).length > 0 && (
                  <div style={{ fontSize: isMobile ? 12 : 11, color: T.info, display: "flex", alignItems: "flex-start", gap: 6, lineHeight: 1.35 }}>
                    <UiIcon name="school" size={12} stroke={T.info} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>
                      Class teacher for {tw.teacher.classTeacherDivisionIds.length} class{tw.teacher.classTeacherDivisionIds.length !== 1 ? "es" : ""}
                    </span>
                  </div>
                )}
                {((tw.teacher.freeMorningPeriods || 0) > 0 || (tw.teacher.freeEveningPeriods || 0) > 0) && (
                  <div style={{ fontSize: isMobile ? 12 : 11, color: T.textMid, lineHeight: 1.35 }}>
                    Free periods:{" "}
                    <span style={{ color: T.info, fontWeight: 600 }}>{formatTeacherFreePeriodsShort(tw.teacher.freeMorningPeriods, tw.teacher.freeEveningPeriods)}</span>
                  </div>
                )}
              </div>
            );
            const statsFont = isMobile ? 20 : 18;
            return (
              <div key={tw.teacher.id} style={{ ...css.card, ...(isMobile ? { padding: "14px 14px 16px" } : {}) }}>
                <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 14, marginBottom: 10 }}>
                  {avatar}
                  <div style={{ flex: 1, minWidth: 0 }}>{nameBlock}</div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: statsFont, fontWeight: 900, color: wlColor, lineHeight: 1.2 }}>{tw.assigned}/{tw.max}</div>
                    <div style={{ fontSize: 11, color: T.textSoft, marginTop: 2 }}>periods/week</div>
                    {ctCount > 0 ? (
                      <div style={{ marginTop: 8 }} title="Class teacher roles — extra duty beyond teaching periods">
                        <span style={classTeacherCtBadgeStyle()}>CT ×{ctCount}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>{metaBlock}</div>
                <div style={{ marginTop: isMobile ? 14 : 12, width: "100%" }}>
                  <ProgressBar value={tw.assigned} max={tw.max} color={wlColor} />
                </div>
                <div style={{ fontSize: 11, color: T.textSoft, marginTop: isMobile ? 8 : 6 }}>
                  <strong style={{ color: T.textMid }}>{tw.pct}%</strong> teaching load (lesson periods only)
                  {ctCount === 0 ? "" : " · bar = teaching periods"}
                </div>
                {(tw.workloadHints || []).length > 0 ? (
                  <div
                    style={{
                      marginTop: 12,
                      padding: "10px 12px",
                      background: T.info + "0d",
                      borderRadius: 8,
                      border: `1px solid ${T.info}33`,
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 800, color: T.info, marginBottom: 8 }}>What to do next</div>
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: 18,
                        fontSize: 11,
                        color: T.textMid,
                        lineHeight: 1.5,
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                      }}
                    >
                      {tw.workloadHints.map((h) => (
                        <li key={h.key} style={{ listStyleType: "disc" }}>
                          <span>{h.text}</span>
                          {h.nav ? (
                            <div style={{ marginTop: 4 }}>
                              <Btn type="button" size="sm" variant="ghost" onClick={() => navigate(h.nav)}>
                                {h.navLabel} →
                              </Btn>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {ctCount === 1 ? (
                  <div style={{ fontSize: 10, color: T.warning, marginTop: 4, lineHeight: 1.35 }}>
                    Also class teacher — extra duty not included in the bar above.
                  </div>
                ) : null}
                {ctCount >= 2 ? (
                  <div style={{ fontSize: 10, color: T.danger, marginTop: 4, lineHeight: 1.35 }}>
                    Class teacher for {ctCount} classes — overall duty is higher than this teaching bar suggests.
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {activeReport === "division-completion" && (
        <div style={{ display: "grid", gridTemplateColumns: divReportCols, gap: 14 }}>
          {reportDivisions.map((div) => {
            const std = reportStandards.find((s) => s.id === div.standardId);
            const divSubjects = reportSubjects.filter((s) => subjectAppliesToDivision(s, div));
            const scheduled = divSubjects.map((sub) => ({ sub, required: getDivisionRequiredWeekly(sub, div.id), got: timetable.entries.filter((e) => e.divisionId === div.id && e.subjectId === sub.id).length }));
            const pct = Math.round(scheduled.reduce((a, s) => a + s.got, 0) / Math.max(scheduled.reduce((a, s) => a + s.required, 0), 1) * 100);
            const ctTeacher = findClassTeacherForDivision(div.id, reportTeachers);
            const ctSubject = classTeacherPrimarySubject(ctTeacher, reportSubjects);
            return (
              <div key={div.id} style={css.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Std {std?.name} — Div {div.name}</div>
                    <div style={{ fontSize: 11, color: T.textSoft }}>
                      {divSubjects.length} subject{divSubjects.length !== 1 ? "s" : ""}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.textSoft, letterSpacing: "0.03em", marginBottom: 3 }}>Class Teacher</div>
                      {ctTeacher ? (
                        <div style={{ fontSize: 12, color: T.textMid, fontWeight: 600 }}>
                          {teacherFullName(ctTeacher)}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: T.warning }}>Not assigned</div>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: pct > 90 ? T.success : T.warning, flexShrink: 0 }}>{pct}%</div>
                </div>
                <ProgressBar value={pct} max={100} color={pct > 90 ? T.success : T.warning} />
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 5 }}>
                  {scheduled.map((s) => {
                    const showCtTag = Boolean(ctTeacher && ctSubject?.id === s.sub.id);
                    return (
                      <div key={s.sub.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.sub.colorHex || T.CORE, flexShrink: 0 }} />
                        <span style={{ flex: 1, color: T.textMid, display: "flex", alignItems: "baseline", gap: 4, minWidth: 0 }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.sub.name}</span>
                          {showCtTag ? (
                            <span title={`${teacherFullName(ctTeacher)} — class teacher`} style={{ fontWeight: 800, color: "#000000", flexShrink: 0 }}>
                              CT
                            </span>
                          ) : null}
                        </span>
                        <span style={{ fontWeight: 700, color: s.got >= s.required ? T.success : T.danger, flexShrink: 0 }}>{s.got}/{s.required}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {generatedLabel ? (
        <div style={{ marginTop: 10, textAlign: "right", fontSize: 11, color: T.textSoft }}>
          Generated: <span style={{ color: T.textMid, fontWeight: 700 }}>{generatedLabel}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Segmented control aligned with app cards (soft track + raised active pill). */
function ExportFormatToggle({ value, onChange, T }) {
  const opts = [
    { id: "PDF", label: "PDF" },
    { id: "EXCEL", label: "Excel" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="File format"
      style={{
        display: "flex",
        gap: 3,
        padding: 3,
        borderRadius: 10,
        background: T.surfaceAlt,
        border: `1px solid ${T.surfaceBorder}`,
      }}
    >
      {opts.map((opt) => {
        const on = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(opt.id)}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: 8,
              border: on ? `1px solid ${T.surfaceBorder}` : "1px solid transparent",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: on ? 700 : 600,
              letterSpacing: "0.03em",
              color: on ? T.brand : T.textSoft,
              background: on ? T.surface : "transparent",
              boxShadow: on ? "0 1px 4px rgba(26, 26, 46, 0.07)" : "none",
              transition: "background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function ExportsPage({ exportJobs, onExport, onDownload, onRemoveExportJob, timetable, notify, navigate, helpers, ui }) {
  const { T, css, Btn, EmptyState } = ui;
  const { StatusBadge } = helpers;
  const { isMobile } = useBreakpoint();
  const [classFormat, setClassFormat] = useState("PDF");
  const [teacherFormat, setTeacherFormat] = useState("PDF");
  const [reportsFormat, setReportsFormat] = useState("PDF");
  if (!timetable) {
    return (
      <div style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: isMobile ? 18 : 20, fontWeight: 700 }}>Downloads</h2>
        <EmptyState iconKey="downloads" title="No timetable to download" desc="Create a timetable first" action={<Btn onClick={() => navigate("generate")}>Create Now</Btn>} />
      </div>
    );
  }
  const exportCols = isMobile ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))";

  const bundles = [
    {
      key: "classes",
      scope: "ALL_DIVISIONS",
      label: "All class timetables",
      desc: "Every class in one file.",
      icon: "downloads",
      format: classFormat,
      setFormat: setClassFormat,
      formats: ["PDF", "EXCEL"],
    },
    {
      key: "teachers",
      scope: "ALL_TEACHERS",
      label: "All teacher timetables",
      desc: "One sheet per teacher.",
      icon: "teacher",
      format: teacherFormat,
      setFormat: setTeacherFormat,
      formats: ["PDF", "EXCEL"],
    },
    {
      key: "reports",
      scope: "REPORTS_BUNDLE",
      label: "Summary reports",
      desc: "Subject hours, teacher workload, and division completion.",
      icon: "reports",
      format: reportsFormat,
      setFormat: setReportsFormat,
      formats: ["PDF", "EXCEL"],
    },
  ];

  return (
    <div style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <h2 style={{ margin: "0 0 16px", fontSize: isMobile ? 18 : 20, fontWeight: 700 }}>Downloads</h2>
      <div style={{ display: "grid", gridTemplateColumns: exportCols, gap: 12, marginBottom: 20, alignItems: "stretch" }}>
        {bundles.map((b) => (
          <div
            key={b.key}
            style={{
              ...css.card,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minHeight: 0,
            }}
          >
            <div style={{ display: "flex", gap: 10, flex: 1, minHeight: 0 }}>
              <UiIcon name={b.icon} size={20} stroke={T.textMid} style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{b.label}</div>
                <div style={{ fontSize: 11, color: T.textSoft, marginTop: 2, lineHeight: 1.35 }}>{b.desc}</div>
              </div>
            </div>
            {b.formats.length > 1 ? (
              <ExportFormatToggle value={b.format} onChange={b.setFormat} T={T} />
            ) : (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "6px 11px",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  color: T.success,
                  background: `${T.success}14`,
                  border: `1px solid ${T.success}33`,
                  width: "fit-content",
                }}
              >
                Excel workbook
              </div>
            )}
            <Btn
              onClick={() => onExport(b.format, b.scope)}
              variant="ghost"
              size="sm"
              fullWidth
              style={{ marginTop: "auto" }}
            >
              Download →
            </Btn>
          </div>
        ))}
      </div>
      <div style={css.card}>
        <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700 }}>Download History</h3>
        {exportJobs.length === 0
          ? <div style={{ textAlign: "center", padding: "28px 0", color: T.textSoft, fontSize: 13 }}>No downloads yet</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {exportJobs.map((job) => (
              <div key={job.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: T.surfaceAlt, borderRadius: 8 }}>
                <UiIcon name={job.type === "PDF" ? "downloads" : "reports"} size={16} stroke={T.textMid} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{job.type} — {job.scope.replace(/_/g, " ")}</div><div style={{ fontSize: 11, color: T.textSoft }}>{formatTimeIndian(job.queuedAt, "")}</div></div>
                <StatusBadge status={job.status} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, width: 96, justifyContent: "flex-end" }}>
                  <div style={{ width: 44, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {job.status === "COMPLETED" && (
                      <Btn
                        type="button"
                        onClick={() => onDownload(job.type, job.scope)}
                        variant="ghost"
                        size="sm"
                        aria-label={`Download ${job.type} file again`}
                        style={{
                          color: T.info,
                          minWidth: 40,
                          width: 40,
                          height: 36,
                          padding: 0,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 8,
                          borderColor: `${T.info}40`,
                        }}
                      >
                        <UiIcon name="downloads" size={20} stroke="currentColor" />
                      </Btn>
                    )}
                    {job.status === "PROCESSING" && <span style={{ width: 16, height: 16, border: `2px solid ${T.info}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />}
                  </div>
                  <Btn
                    type="button"
                    onClick={() => onRemoveExportJob(job.id)}
                    variant="ghost"
                    size="sm"
                    aria-label="Remove this item from download history"
                    style={{
                      color: T.textSoft,
                      width: 40,
                      height: 36,
                      padding: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 8,
                      borderColor: T.surfaceBorder,
                    }}
                  >
                    <UiIcon name="trash" size={18} stroke="currentColor" />
                  </Btn>
                </div>
              </div>
            ))}
          </div>}
      </div>
    </div>
  );
}

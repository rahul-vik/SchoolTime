import { useState, useEffect } from "react";
import { UiIcon, ExpandableHelpSection } from "../shared/uiPrimitives";
import { resolveDivisionsMissingClassTeacher, formatDivisionMissingLabel } from "../shared/classTeacherCoverage";
import { buildCompletionInsights } from "../shared/timetableCompletionHints";

export function DashboardPage({ school, subjects, divisions, teachers, standards, timetable, timetableStatus, schedulingRules, navigate, bp, ui }) {
  const { T, BRAND_FONT, css, Btn, ProgressBar, StatusBadge } = ui;
  const completionPct = timetable?.score || 0;
  const activeRules = schedulingRules.filter((r) => r.isActive).length;
  const restrictedTeachers = teachers.filter((t) => (t.assignedDivisionIds || []).length > 0).length;
  const completionInsights = buildCompletionInsights({
    completionPct,
    timetable,
    subjects,
    divisions,
    standards: standards || [],
    teachers,
    schedulingRules,
    restrictedTeachers,
  });
  const divisionsWithoutClassTeacher = timetable
    ? resolveDivisionsMissingClassTeacher(timetable.report, divisions, teachers)
    : [];
  const [expandedHelp, setExpandedHelp] = useState(() => new Set());
  const toggleHelp = (key) => {
    setExpandedHelp((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    setExpandedHelp(new Set());
  }, [timetable?.runId, timetable?.generatedAt]);

  const showStatusHelpHeading =
    !bp.isMobile &&
    (divisionsWithoutClassTeacher.length > 0 || (completionPct < 100 && !!completionInsights.summary));

  return (
    <div>
      <div style={{ background: `linear-gradient(135deg,${T.brand} 0%,${T.accent} 100%)`, borderRadius: 16, padding: bp.isMobile ? "22px 20px" : "28px 32px", marginBottom: 20, color: "#fff", position: "relative", overflow: "hidden" }}>
        <UiIcon name="timetable" size={94} stroke="rgba(255,255,255,0.18)" style={{ position: "absolute", right: 8, top: 8 }} />
        <h1 style={{ margin: "0 0 6px", fontSize: bp.isMobile ? 20 : 24, fontWeight: 700, fontFamily: BRAND_FONT, letterSpacing: "0.01em" }}>Welcome to SchoolTime</h1>
        <p style={{ margin: "0 0 18px", opacity: 0.7, fontSize: 13, maxWidth: "100%", whiteSpace: bp.isMobile ? "normal" : "nowrap" }}>{school.name} · {school.academicYear} · {divisions.length} Divisions · {teachers.length} Teachers</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {timetableStatus === "GENERATED"
            ? <><Btn onClick={() => navigate("timetable")} style={{ background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }} size="sm">View Timetable →</Btn><Btn onClick={() => navigate("exports")} style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }} size="sm">Download</Btn></>
            : <Btn onClick={() => navigate("generate")} style={{ background: T.gold, color: "#fff", border: "none" }} size="sm"><UiIcon name="create" size={14} stroke="currentColor" />Create Timetable</Btn>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Divisions", value: divisions.length, icon: "building", color: T.brand },
          { label: "Teachers", value: teachers.length, icon: "teacher", color: T.info },
          { label: "Subjects", value: subjects.length, icon: "subject", color: T.success },
          { label: "Active Preferences", value: activeRules, icon: "preferences", color: T.warning },
        ].map((card) => (
          <div key={card.label} style={{ ...css.card, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: card.color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <UiIcon name={card.icon} size={18} stroke={card.color} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: card.color, lineHeight: 1 }}>{card.value}</div>
              <div style={{ fontSize: 11, color: T.textSoft, marginTop: 2 }}>{card.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div style={css.card}>
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700 }}>Timetable Status</h3>
          {timetable ? (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}><span style={{ fontSize: 13, color: T.textMid }}>Completion</span><span style={{ fontSize: 13, fontWeight: 800, color: completionPct > 85 ? T.success : T.warning }}>{completionPct}%</span></div>
              <ProgressBar value={completionPct} max={100} color={completionPct > 85 ? T.success : T.warning} />
              <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", fontSize: 11, color: T.textSoft }}><span>{timetable.report.totalScheduled} scheduled</span><span>{timetable.report.totalRequired} required</span></div>
              <div style={{ marginTop: 10 }}><StatusBadge status={timetable.status} /></div>
              {showStatusHelpHeading ? (
                <div style={{ fontSize: 13, fontWeight: 700, color: T.warning, marginTop: 14, marginBottom: 6 }}>Needs your attention</div>
              ) : null}
              {divisionsWithoutClassTeacher.length > 0 && (
                <div
                  style={{
                    marginTop: showStatusHelpHeading ? 0 : 14,
                    padding: "8px 14px 12px",
                    borderRadius: 10,
                    background: `${T.warning}12`,
                    border: `1px solid ${T.warning}44`,
                  }}
                >
                  <ExpandableHelpSection
                    T={T}
                    open={expandedHelp.has("classTeacher")}
                    onToggle={() => toggleHelp("classTeacher")}
                    heading={`${divisionsWithoutClassTeacher.length} class${divisionsWithoutClassTeacher.length === 1 ? "" : "es"} without a class teacher`}
                  >
                    <p style={{ margin: "0 0 10px", fontSize: 12, color: T.textMid, lineHeight: 1.45 }}>
                      Assign a class teacher under Teachers → Class teacher assignment for each class below.
                    </p>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                      {divisionsWithoutClassTeacher.slice(0, 8).map((row) => (
                        <span key={row.divisionId} style={{ ...css.badge(T.warning), fontSize: 11 }}>
                          {formatDivisionMissingLabel(row, standards)}
                        </span>
                      ))}
                    </div>
                    <Btn onClick={() => navigate("teachers")} size="sm" variant="ghost">
                      Open Teachers →
                    </Btn>
                  </ExpandableHelpSection>
                </div>
              )}
              {completionPct < 100 && completionInsights.summary && (
                <div
                  style={{
                    marginTop: 16,
                    padding: "8px 16px 14px",
                    background: `${T.warning}14`,
                    borderRadius: 12,
                    border: `1px solid ${T.warning}40`,
                  }}
                >
                  <ExpandableHelpSection
                    T={T}
                    open={expandedHelp.has("completion")}
                    onToggle={() => toggleHelp("completion")}
                    heading="How to get closer to 100%"
                  >
                  <p style={{ margin: "0 0 12px", fontSize: 13, color: T.textMid, lineHeight: 1.5 }}>{completionInsights.summary}</p>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, color: T.textMid, lineHeight: 1.55 }}>
                    {completionInsights.bullets.map((line, i) => (
                      <li key={i} style={{ marginBottom: 8 }}>{line}</li>
                    ))}
                  </ul>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                    <Btn onClick={() => navigate("generate")} size="sm">Regenerate timetable</Btn>
                    <Btn onClick={() => navigate("timetable")} variant="ghost" size="sm">View timetable and reports</Btn>
                    <Btn onClick={() => navigate("teachers")} variant="ghost" size="sm">Teachers</Btn>
                    <Btn onClick={() => navigate("rules")} variant="ghost" size="sm">Subject preferences</Btn>
                  </div>
                  </ExpandableHelpSection>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <p style={{ fontSize: 13, color: T.textSoft, margin: "0 0 14px" }}>No timetable yet</p>
              <Btn onClick={() => navigate("generate")} size="sm">Create Now</Btn>
            </div>
          )}
        </div>
        <div style={css.card}>
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700 }}>Teacher Class Assignment</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: T.surfaceAlt, borderRadius: 8 }}>
              <span style={{ fontSize: 13, color: T.textMid }}>Teachers with class limits</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: T.brand }}>{restrictedTeachers}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: T.surfaceAlt, borderRadius: 8 }}>
              <span style={{ fontSize: 13, color: T.textMid }}>Teachers available for all classes</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: T.success }}>{teachers.length - restrictedTeachers}</span>
            </div>
            <Btn onClick={() => navigate("teachers")} variant="ghost" size="sm" fullWidth>Manage Teacher Assignments →</Btn>
          </div>
        </div>
      </div>

      <div style={css.card}>
        <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700 }}>Quick Actions</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[["teacher", "Teachers", "teachers"], ["subject", "Subjects", "subjects"], ["preferences", "Preferences", "rules"], ["period", "Periods", "periods"], ["reports", "Reports", "reports"]].map(([icon, label, p]) => (
            <Btn key={p} onClick={() => navigate(p)} variant="ghost" size="sm"><UiIcon name={icon} size={14} stroke="currentColor" />{label}</Btn>
          ))}
        </div>
      </div>
    </div>
  );
}

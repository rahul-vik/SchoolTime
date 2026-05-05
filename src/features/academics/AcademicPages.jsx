import { useMemo, useState } from "react";
import { UiIcon, useBreakpoint } from "../shared/uiPrimitives";
import { formatTeacherFreePeriodsShort } from "../shared/timetableDisplayHelpers";

export function SubjectsPage({ subjects, setSubjects, standards, divisions, mediums, notify, ui }) {
  const { T, css, Btn, ProgressBar, EmptyState, Modal, Input, Select, Field } = ui;
  const { isMobile } = useBreakpoint();
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [subjectStep, setSubjectStep] = useState(1);
  const cats = ["LANGUAGE", "CORE", "NON_CORE", "PRACTICAL", "EXTRA_CURRICULAR"];
  const catColors = { LANGUAGE: "#7c3aed", CORE: "#0369a1", NON_CORE: "#0891b2", PRACTICAL: "#059669", EXTRA_CURRICULAR: "#d97706" };
  const catPriorityDefaults = { CORE: 10, LANGUAGE: 8, NON_CORE: 6, PRACTICAL: 4, EXTRA_CURRICULAR: 3 };
  const formSectionGap = 14;
  const blank = {
    name: "",
    code: "",
    category: "CORE",
    priorityWeight: catPriorityDefaults.CORE,
    colorHex: "#0369a1",
    standardIds: standards.map((s) => s.id),
    mediumIds: mediums.map((m) => m.id),
    divisionScopeMode: "ALL_IN_SELECTED_CLASSES",
    divisionIncludeIds: [],
    divisionExcludeIds: [],
    divisionLimits: [],
  };
  const standardSet = new Set((form.standardIds || []).map((id) => String(id)));
  const eligibleDivisions = (divisions || []).filter((d) => standardSet.has(String(d.standardId)));
  const eligibleDivisionIdSet = new Set(eligibleDivisions.map((d) => d.id));
  const selectedIncludeIds = (form.divisionIncludeIds || []).filter((id) => eligibleDivisionIdSet.has(id));
  const selectedExcludeIds = (form.divisionExcludeIds || []).filter((id) => eligibleDivisionIdSet.has(id));
  const divisionCountByStandard = standards.reduce((acc, std) => {
    const count = eligibleDivisions.filter((d) => d.standardId === std.id).length;
    if (count > 0) acc[std.id] = count;
    return acc;
  }, {});

  const toggleStandard = (id) => {
    setForm((p) => {
      const current = p.standardIds || [];
      const nextStandardIds = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      const allowedDivisionIds = new Set((divisions || []).filter((d) => nextStandardIds.includes(d.standardId)).map((d) => d.id));
      const nextInclude = (p.divisionIncludeIds || []).filter((divId) => allowedDivisionIds.has(divId));
      const nextExclude = (p.divisionExcludeIds || []).filter((divId) => allowedDivisionIds.has(divId) && !nextInclude.includes(divId));
      const nextLimits = (p.divisionLimits || []).filter((dl) => allowedDivisionIds.has(dl.divisionId));
      return { ...p, standardIds: nextStandardIds, divisionIncludeIds: nextInclude, divisionExcludeIds: nextExclude, divisionLimits: nextLimits };
    });
  };
  const toggleMedium = (id) => setForm((p) => ({ ...p, mediumIds: (p.mediumIds || []).includes(id) ? (p.mediumIds || []).filter((m) => m !== id) : [...(p.mediumIds || []), id] }));
  const toggleDivisionOverride = (divisionId, mode) => {
    setForm((p) => {
      const includeIds = p.divisionIncludeIds || [];
      const excludeIds = p.divisionExcludeIds || [];
      if (mode === "include") {
        const nextInclude = includeIds.includes(divisionId) ? includeIds.filter((id) => id !== divisionId) : [...includeIds, divisionId];
        return { ...p, divisionIncludeIds: nextInclude, divisionExcludeIds: excludeIds.filter((id) => id !== divisionId) };
      }
      const nextExclude = excludeIds.includes(divisionId) ? excludeIds.filter((id) => id !== divisionId) : [...excludeIds, divisionId];
      return {
        ...p,
        divisionExcludeIds: nextExclude,
        divisionIncludeIds: includeIds.filter((id) => id !== divisionId),
        divisionLimits: (p.divisionLimits || []).filter((dl) => (nextExclude.includes(dl.divisionId) ? false : true)),
      };
    });
  };
  const upsertDivisionLimit = (divisionId, key, value) => {
    setForm((p) => {
      const limits = [...(p.divisionLimits || [])];
      const idx = limits.findIndex((dl) => dl.divisionId === divisionId);
      const current = idx >= 0 ? limits[idx] : { divisionId };
      const nextVal = value === "" ? undefined : Math.max(1, Number(value) || 1);
      const updated = { ...current, [key]: nextVal };
      const shouldKeep = updated.weeklyPeriods !== undefined || updated.maxPerDay !== undefined;
      if (idx >= 0) {
        if (shouldKeep) limits[idx] = updated;
        else limits.splice(idx, 1);
      } else if (shouldKeep) {
        limits.push(updated);
      }
      return { ...p, divisionLimits: limits };
    });
  };
  const canGoToStepTwo = () => {
    if (!form.name || !String(form.name).trim()) { notify("Subject name is required", "warning"); return false; }
    if (!form.code || !String(form.code).trim()) { notify("Subject code is required", "warning"); return false; }
    if ((form.mediumIds || []).length === 0) { notify("Select at least one medium", "warning"); return false; }
    if ((form.standardIds || []).length === 0) { notify("Select at least one class", "warning"); return false; }
    return true;
  };

  const save = () => {
    if (!form.name || !form.code) return;
    if ((form.standardIds || []).length === 0) { notify("Select at least one class", "warning"); return; }
    if ((form.mediumIds || []).length === 0) { notify("Select at least one medium", "warning"); return; }
    const allowedDivisionIds = new Set((divisions || []).filter((d) => (form.standardIds || []).includes(d.standardId)).map((d) => d.id));
    const cleanedInclude = [...new Set((form.divisionIncludeIds || []).filter((id) => allowedDivisionIds.has(id)))];
    const cleanedExclude = [...new Set((form.divisionExcludeIds || []).filter((id) => allowedDivisionIds.has(id) && !cleanedInclude.includes(id)))];
    const cleanedLimits = (form.divisionLimits || [])
      .filter((dl) => allowedDivisionIds.has(dl.divisionId))
      .map((dl) => ({
        divisionId: dl.divisionId,
        ...(dl.weeklyPeriods !== undefined ? { weeklyPeriods: Math.max(1, Number(dl.weeklyPeriods) || 1) } : {}),
        ...(dl.maxPerDay !== undefined ? { maxPerDay: Math.max(1, Number(dl.maxPerDay) || 1) } : {}),
      }))
      .filter((dl) => dl.weeklyPeriods !== undefined || dl.maxPerDay !== undefined);
    if (subjects.some((s) => s.code === form.code && s.id !== form.id)) { notify("Subject code already in use", "warning"); return; }
    const payload = {
      ...form,
      weeklyPeriods: Math.max(1, Number(form.weeklyPeriods || 5)),
      maxPerDay: Math.max(1, Number(form.maxPerDay || 2)),
      divisionScopeMode: "CUSTOM_DIVISION_OVERRIDES",
      divisionIncludeIds: cleanedInclude,
      divisionExcludeIds: cleanedExclude,
      divisionLimits: cleanedLimits,
    };
    if (modal === "add") setSubjects((p) => [...p, { ...payload, id: `sub${Date.now()}`, isActive: true }]);
    else setSubjects((p) => p.map((s) => s.id === form.id ? { ...s, ...payload } : s));
    setModal(null); notify(modal === "add" ? "Subject added" : "Subject updated");
  };

  return (
    <div style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 0, marginBottom: 18 }}>
        <div style={{ minWidth: 0 }}><h2 style={{ margin: 0, fontSize: isMobile ? 18 : 20, fontWeight: 700 }}>Subjects</h2><p style={{ margin: "3px 0 0", fontSize: 12, color: T.textSoft }}>{subjects.length} subjects</p></div>
        <Btn onClick={() => { setForm({ ...blank }); setSubjectStep(1); setModal("add"); }} size="sm" fullWidth={isMobile}>+ Add Subject</Btn>
      </div>
      <div style={{ ...css.card, padding: 0, overflow: "hidden" }}>
        {isMobile ? (
          <div style={{ display: "grid", gap: 10, padding: 10 }}>
            {subjects.map((sub) => (
              <div key={sub.id} style={{ border: `1px solid ${T.surfaceBorder}`, borderRadius: 10, padding: 10, background: T.surface }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 9, height: 9, borderRadius: "50%", background: sub.colorHex, flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{sub.name}</span>
                  </div>
                  <code style={{ background: T.surfaceAlt, padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>{sub.code}</code>
                </div>
                <div style={{ marginBottom: 8 }}><span style={css.badge(catColors[sub.category] || T.CORE)}>{sub.category.replace(/_/g, " ")}</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <ProgressBar value={sub.priorityWeight} max={10} color={T.brand} height={4} />
                  <span style={{ fontSize: 11, color: T.textSoft }}>{sub.priorityWeight}</span>
                </div>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <Btn onClick={() => { setForm({ ...blank, ...sub, standardIds: sub.standardIds || standards.map((s) => s.id), mediumIds: sub.mediumIds || mediums.map((m) => m.id), divisionScopeMode: sub.divisionScopeMode || "ALL_IN_SELECTED_CLASSES", divisionIncludeIds: sub.divisionIncludeIds || [], divisionExcludeIds: sub.divisionExcludeIds || [], divisionLimits: sub.divisionLimits || [] }); setSubjectStep(1); setModal("edit"); }} variant="ghost" size="sm">Edit</Btn>
                  <Btn onClick={() => { setSubjects((p) => p.filter((s) => s.id !== sub.id)); notify("Subject removed"); }} variant="ghost" size="sm" style={{ color: T.danger }}><UiIcon name="close" size={14} stroke="currentColor" /></Btn>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: T.surfaceAlt }}>
                {["Subject", "Code", "Category", "Applicability", "Division Rules", "Priority", ""].map((h) => <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${T.surfaceBorder}` }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {subjects.map((sub, i) => (
                  <tr key={sub.id} style={{ borderBottom: `1px solid ${T.surfaceBorder}`, background: i % 2 === 0 ? T.surface : T.surfaceAlt + "60" }}>
                    <td style={{ padding: "11px 14px" }}><div style={{ display: "flex", alignItems: "center", gap: 9 }}><div style={{ width: 9, height: 9, borderRadius: "50%", background: sub.colorHex, flexShrink: 0 }} /><span style={{ fontWeight: 700, fontSize: 13 }}>{sub.name}</span></div></td>
                    <td style={{ padding: "11px 14px" }}><code style={{ background: T.surfaceAlt, padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>{sub.code}</code></td>
                    <td style={{ padding: "11px 14px" }}><span style={css.badge(catColors[sub.category] || T.CORE)}>{sub.category.replace(/_/g, " ")}</span></td>
                    <td style={{ padding: "11px 14px", fontSize: 12, color: T.textMid }}>
                      <div>{(sub.standardIds || []).length} classes</div>
                      <div style={{ color: T.textSoft }}>{(sub.mediumIds || []).length} mediums</div>
                    </td>
                    <td style={{ padding: "11px 14px", fontSize: 12, color: T.textMid }}>
                      <div>{(sub.divisionExcludeIds || []).length} divisions excluded</div>
                      <div style={{ color: T.textSoft }}>{(sub.divisionLimits || []).length} custom limits</div>
                    </td>
                    <td style={{ padding: "11px 14px", minWidth: 80 }}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><ProgressBar value={sub.priorityWeight} max={10} color={T.brand} height={4} /><span style={{ fontSize: 11, color: T.textSoft }}>{sub.priorityWeight}</span></div></td>
                    <td style={{ padding: "11px 14px" }}><div style={{ display: "flex", gap: 6 }}><Btn onClick={() => { setForm({ ...blank, ...sub, standardIds: sub.standardIds || standards.map((s) => s.id), mediumIds: sub.mediumIds || mediums.map((m) => m.id), divisionScopeMode: sub.divisionScopeMode || "ALL_IN_SELECTED_CLASSES", divisionIncludeIds: sub.divisionIncludeIds || [], divisionExcludeIds: sub.divisionExcludeIds || [], divisionLimits: sub.divisionLimits || [] }); setSubjectStep(1); setModal("edit"); }} variant="ghost" size="sm">Edit</Btn><Btn onClick={() => { setSubjects((p) => p.filter((s) => s.id !== sub.id)); notify("Subject removed"); }} variant="ghost" size="sm" style={{ color: T.danger }}><UiIcon name="close" size={14} stroke="currentColor" /></Btn></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {subjects.length === 0 && <EmptyState iconKey="subject" title="No subjects yet" desc="Add subjects to configure your timetable" action={<Btn onClick={() => { setForm({ ...blank }); setModal("add"); }}>Add First Subject</Btn>} />}
      </div>

      {modal && (
        <Modal
          title={modal === "add" ? "Add Subject" : "Edit Subject"}
          onClose={() => setModal(null)}
          width={540}
          scrollToTopKey={subjectStep}
        >
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {[{ id: 1, label: "Basics & Classes" }, { id: 2, label: "Division Overrides" }].map((step) => (
              <button
                key={step.id}
                onClick={() => {
                  if (step.id === 2 && !canGoToStepTwo()) return;
                  setSubjectStep(step.id);
                }}
                style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${subjectStep === step.id ? T.brand : T.surfaceBorder}`, background: subjectStep === step.id ? T.brand + "12" : T.surface, color: subjectStep === step.id ? T.brand : T.textMid, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                {step.id}. {step.label}
              </button>
            ))}
          </div>
          {subjectStep === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: formSectionGap }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "0 12px" : "0 18px" }}>
                <Input label="Subject Name" value={form.name || ""} onChange={(v) => setForm((p) => ({ ...p, name: v }))} required />
                <Input label="Code" value={form.code || ""} onChange={(v) => setForm((p) => ({ ...p, code: v.toUpperCase() }))} required />
                <Select label="Category" value={form.category || ""} onChange={(v) => setForm((p) => ({ ...p, category: v, colorHex: catColors[v] || form.colorHex, priorityWeight: catPriorityDefaults[v] || p.priorityWeight || 5 }))} options={cats.map((c) => ({ value: c, label: c.replace(/_/g, " ") }))} />
                <Field label="Color"><input type="color" value={form.colorHex || "#0369a1"} onChange={(e) => setForm((p) => ({ ...p, colorHex: e.target.value }))} style={{ width: "100%", height: 42, borderRadius: 8, border: `1px solid ${T.surfaceBorder}`, padding: 4, cursor: "pointer" }} /></Field>
              </div>
              <Field label={`Priority Weight: ${form.priorityWeight || 5}/10`}><input type="range" min={1} max={10} value={form.priorityWeight || 5} onChange={(e) => setForm((p) => ({ ...p, priorityWeight: +e.target.value }))} style={{ width: "100%" }} /></Field>
              <Field label="Applicable Mediums">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {mediums.map((m) => {
                    const selected = (form.mediumIds || []).includes(m.id);
                    return (
                      <button key={m.id} onClick={() => toggleMedium(m.id)} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${selected ? T.info : T.surfaceBorder}`, background: selected ? T.info + "12" : T.surface, color: selected ? T.info : T.textMid, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        {m.name}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label="Applicable Classes">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {standards.map((std) => {
                    const selected = (form.standardIds || []).includes(std.id);
                    return (
                      <button key={std.id} onClick={() => toggleStandard(std.id)} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${selected ? T.info : T.surfaceBorder}`, background: selected ? T.info + "12" : T.surface, color: selected ? T.info : T.textMid, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        Std {std.name}{divisionCountByStandard[std.id] ? ` (${divisionCountByStandard[std.id]} div)` : ""}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>
          )}
          {subjectStep === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: formSectionGap }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 12, color: T.textMid }}>Division Applicability & Limits</h4>
              {eligibleDivisions.length === 0 ? (
                <div style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.warning + "40"}`, background: T.warning + "10", fontSize: 12, color: T.textMid }}>
                  No eligible divisions. Select at least one class in Step 1.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8, maxHeight: 280, overflow: "auto", border: `1px solid ${T.surfaceBorder}`, borderRadius: 8, padding: 10 }}>
                  {!isMobile && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 140px 140px", gap: 8, alignItems: "center", paddingBottom: 4, borderBottom: `1px solid ${T.surfaceBorder}` }}>
                      <span style={{ fontSize: 11, color: T.textSoft, fontWeight: 700 }}>Division</span>
                      <span style={{ fontSize: 11, color: T.textSoft, fontWeight: 700 }}>&nbsp;</span>
                      <span style={{ fontSize: 11, color: T.textSoft, fontWeight: 700 }}>Max per day</span>
                      <span style={{ fontSize: 11, color: T.textSoft, fontWeight: 700 }}>Total weekly</span>
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: T.textSoft }}>Excluded divisions will not get this subject.</div>
                  {eligibleDivisions.map((div) => {
                    const std = standards.find((s) => s.id === div.standardId);
                    const isExclude = selectedExcludeIds.includes(div.id);
                    const existing = (form.divisionLimits || []).find((dl) => dl.divisionId === div.id) || {};
                    return (
                      <div key={div.id} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr auto 140px 140px", gap: 8, alignItems: "center", borderBottom: `1px solid ${T.surfaceBorder}55`, paddingBottom: 8 }}>
                        <span style={{ fontSize: 12, color: T.textMid, fontWeight: 600 }}>Std {std?.name || "?"}-{div.name}</span>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => toggleDivisionOverride(div.id, "exclude")} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${isExclude ? T.danger : T.surfaceBorder}`, background: isExclude ? T.danger + "14" : T.surface, color: isExclude ? T.danger : T.textSoft, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Exclude</button>
                        </div>
                        {isMobile ? (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <Field label="Max per day">
                              <input type="number" min={1} max={10} disabled={isExclude} placeholder="Per day" value={existing.maxPerDay ?? ""} onChange={(e) => upsertDivisionLimit(div.id, "maxPerDay", e.target.value)} style={{ ...css.input, opacity: isExclude ? 0.55 : 1, cursor: isExclude ? "not-allowed" : "text" }} />
                            </Field>
                            <Field label="Total weekly">
                              <input type="number" min={1} max={20} disabled={isExclude} placeholder="Weekly" value={existing.weeklyPeriods ?? ""} onChange={(e) => upsertDivisionLimit(div.id, "weeklyPeriods", e.target.value)} style={{ ...css.input, opacity: isExclude ? 0.55 : 1, cursor: isExclude ? "not-allowed" : "text" }} />
                            </Field>
                          </div>
                        ) : (
                          <>
                            <input type="number" min={1} max={10} disabled={isExclude} placeholder="Per day" value={existing.maxPerDay ?? ""} onChange={(e) => upsertDivisionLimit(div.id, "maxPerDay", e.target.value)} style={{ ...css.input, opacity: isExclude ? 0.55 : 1, cursor: isExclude ? "not-allowed" : "text" }} />
                            <input type="number" min={1} max={20} disabled={isExclude} placeholder="Weekly" value={existing.weeklyPeriods ?? ""} onChange={(e) => upsertDivisionLimit(div.id, "weeklyPeriods", e.target.value)} style={{ ...css.input, opacity: isExclude ? 0.55 : 1, cursor: isExclude ? "not-allowed" : "text" }} />
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, justifyContent: subjectStep === 1 ? "flex-end" : "space-between" }}>
            {subjectStep === 1 ? (
              <>
                <Btn
                  onClick={() => {
                    if (!canGoToStepTwo()) return;
                    setSubjectStep(2);
                  }}
                >
                  Next
                </Btn>
              </>
            ) : (
              <>
                <Btn onClick={() => setSubjectStep(1)} variant="ghost">Back</Btn>
                <Btn onClick={save}>Save Subject</Btn>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

export function TeachersPage({ teachers, setTeachers, subjects, mediums, divisions, standards, periodSlots, workingDays, notify, helpers, ui }) {
  const { T, css, Btn, EmptyState, Modal, Input, Select, Field } = ui;
  const { isMobile } = useBreakpoint();
  const formSectionGap = 14;
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [teacherStep, setTeacherStep] = useState(1);
  const blank = { firstName: "", lastName: "", employeeCode: "", email: "", maxPerDay: 0, maxPerWeek: 0, mediumIds: mediums.length > 0 ? [mediums[0].id] : [], subjectIds: [], primarySubjectId: "", freeMorningPeriods: 0, freeEveningPeriods: 0, maxContinuousSameSubjectPerDivision: 1, maxContinuousAnySubjectPerDivision: 1, assignedDivisionIds: [], classTeacherDivisionIds: [], primaryClassTeacherDivisionId: null };

  const openAdd = () => { setForm({ ...blank, mediumIds: mediums.length > 0 ? [mediums[0].id] : [], divisionSubjectExclusions: [] }); setTeacherStep(1); setModal("add"); };
  const openEdit = (t) => {
    const singleClassTeacherDivisionId = (t.classTeacherDivisionIds || [])[0] || null;
    setForm({
      freeMorningPeriods: 0,
      freeEveningPeriods: 0,
      assignedDivisionIds: [],
      divisionSubjectExclusions: [],
      ...t,
      classTeacherDivisionIds: singleClassTeacherDivisionId ? [singleClassTeacherDivisionId] : [],
      primaryClassTeacherDivisionId: singleClassTeacherDivisionId,
    });
    setTeacherStep(1);
    setModal("edit");
  };

  const save = () => {
    if (!form.firstName || !form.lastName) return;
    if (!form.employeeCode) { notify("Employee code is required", "warning"); return; }
    if (teachers.some((t) => t.employeeCode === form.employeeCode && t.id !== form.id)) { notify("Employee code already exists", "warning"); return; }
    if ((form.freeMorningPeriods || 0) > 4 || (form.freeEveningPeriods || 0) > 4) { notify("Free period count cannot exceed 4 per session", "warning"); return; }
    const allowedClassTeacherDivisionIds = (form.assignedDivisionIds || []).length > 0
      ? (form.assignedDivisionIds || [])
      : divisions.map((d) => d.id);
    const cleanedClassTeacherDivisionIds = (form.classTeacherDivisionIds || []).filter((id) => allowedClassTeacherDivisionIds.includes(id)).slice(0, 1);
    const conflictDivisionId = cleanedClassTeacherDivisionIds.find((divId) => classTeacherOwnerByDivision.has(divId));
    if (conflictDivisionId) {
      const owner = classTeacherOwnerByDivision.get(conflictDivisionId);
      const div = divisions.find((d) => d.id === conflictDivisionId);
      const std = standards.find((s) => s.id === div?.standardId);
      notify(`Class teacher already assigned: Std ${std?.name || "?"}-${div?.name || "?"} is mapped to ${owner?.firstName || ""} ${owner?.lastName || ""}`.trim(), "warning");
      return;
    }
    const cleanedPrimaryClassTeacherDivisionId = cleanedClassTeacherDivisionIds[0] || null;
    const computedCapacity = getComputedCapacity(form);
    const configuredMaxPerDayRaw = Number(form.maxPerDay || 0);
    const configuredMaxPerWeekRaw = Number(form.maxPerWeek || 0);
    const configuredMaxPerDay = configuredMaxPerDayRaw > 0 ? configuredMaxPerDayRaw : computedCapacity.maxPerDay;
    const configuredMaxPerWeek = configuredMaxPerWeekRaw > 0 ? configuredMaxPerWeekRaw : computedCapacity.maxPerWeek;
    const nextForm = {
      ...form,
      maxPerDay: Math.max(1, Math.min(computedCapacity.maxPerDay, configuredMaxPerDay)),
      maxPerWeek: Math.max(1, Math.min(computedCapacity.maxPerWeek, configuredMaxPerWeek)),
      maxContinuousSameSubjectPerDivision: Math.max(1, Number(form.maxContinuousSameSubjectPerDivision || 2)),
      maxContinuousAnySubjectPerDivision: Math.max(1, Number(form.maxContinuousAnySubjectPerDivision || 3)),
      classTeacherDivisionIds: cleanedClassTeacherDivisionIds,
      primaryClassTeacherDivisionId: cleanedPrimaryClassTeacherDivisionId,
      divisionSubjectExclusions: (form.divisionSubjectExclusions || [])
        .filter((row) => allowedClassTeacherDivisionIds.includes(row.divisionId))
        .map((row) => ({
          divisionId: row.divisionId,
          subjectIds: (row.subjectIds || []).filter((id) => (form.subjectIds || []).includes(id)),
        }))
        .filter((row) => row.subjectIds.length > 0),
    };
    if (modal === "add") setTeachers((p) => [...p, { ...nextForm, id: `t${Date.now()}`, isActive: true }]);
    else setTeachers((p) => p.map((t) => t.id === form.id ? { ...t, ...nextForm } : t));
    setModal(null);
    notify(modal === "add" ? "Teacher added" : "Teacher updated");
  };

  const toggleSubject = (id) => setForm((p) => ({ ...p, subjectIds: (p.subjectIds || []).includes(id) ? (p.subjectIds || []).filter((s) => s !== id) : [...(p.subjectIds || []), id] }));
  const toggleMedium = (id) => setForm((p) => ({ ...p, mediumIds: (p.mediumIds || []).includes(id) ? (p.mediumIds || []).filter((m) => m !== id) : [...(p.mediumIds || []), id] }));
  const freePeriodErr = (v) => v > 4 ? "Max 4 per session" : v < 0 ? "Must be ≥ 0" : null;
  const canGoTeacherStepTwo = () => {
    if (!form.firstName || !String(form.firstName).trim()) { notify("First name is required", "warning"); return false; }
    if (!form.lastName || !String(form.lastName).trim()) { notify("Last name is required", "warning"); return false; }
    if (!form.employeeCode || !String(form.employeeCode).trim()) { notify("Employee code is required", "warning"); return false; }
    if ((form.mediumIds || []).length === 0) { notify("Select at least one medium", "warning"); return false; }
    if ((form.subjectIds || []).length === 0) { notify("Select at least one subject", "warning"); return false; }
    return true;
  };
  const lessonSlots = useMemo(() => (periodSlots || []).filter((s) => s.slotType === "LESSON").sort((a, b) => a.slotNumber - b.slotNumber), [periodSlots]);
  const firstAfterLunch = useMemo(() => {
    const lunchNums = (periodSlots || []).filter((s) => s.slotType === "LUNCH").map((s) => s.slotNumber);
    if (!lunchNums.length) return null;
    const maxLunch = Math.max(...lunchNums);
    return lessonSlots.find((s) => s.slotNumber > maxLunch)?.slotNumber ?? null;
  }, [periodSlots, lessonSlots]);
  const morningLessonCount = useMemo(() => lessonSlots.filter((s) => (firstAfterLunch ? s.slotNumber < firstAfterLunch : s.slotNumber <= Math.ceil(lessonSlots.length / 2))).length, [lessonSlots, firstAfterLunch]);
  const eveningLessonCount = lessonSlots.length - morningLessonCount;
  const getComputedCapacity = (teacherLike) => {
    const fm = Math.max(0, Number(teacherLike.freeMorningPeriods || 0));
    const fe = Math.max(0, Number(teacherLike.freeEveningPeriods || 0));
    const sessionAllowed = Math.max(0, morningLessonCount - fm) + Math.max(0, eveningLessonCount - fe);
    const maxPerDay = Math.max(0, Math.min(lessonSlots.length, sessionAllowed));
    const maxPerWeek = Math.max(30, maxPerDay * (workingDays?.length || 0));
    return { maxPerDay, maxPerWeek };
  };
  const formComputedCapacity = getComputedCapacity(form || {});
  const classTeacherOwnerByDivision = useMemo(() => {
    const map = new Map();
    for (const t of teachers || []) {
      if (form?.id && t.id === form.id) continue;
      for (const divId of (t.classTeacherDivisionIds || [])) {
        if (!map.has(divId)) map.set(divId, t);
      }
    }
    return map;
  }, [teachers, form?.id]);

  const teacherGrid = isMobile ? "1fr" : "repeat(auto-fill,minmax(300px,1fr))";
  const selectedDivisionIdsForUi = (form.assignedDivisionIds || []).length > 0 ? (form.assignedDivisionIds || []) : divisions.map((d) => d.id);
  const allowedDivisionIdsForStep2 = (form.assignedDivisionIds || []).length > 0 ? (form.assignedDivisionIds || []) : divisions.map((d) => d.id);
  const applyDivisionSelection = (p, nextSelected) => {
    const allDivisionIds = divisions.map((d) => d.id);
    const normalizedAssigned = nextSelected.length === allDivisionIds.length ? [] : nextSelected;
    const allowedDivisionIds = normalizedAssigned.length > 0 ? normalizedAssigned : allDivisionIds;
    const classTeacherDivisionIds = (p.classTeacherDivisionIds || []).filter((id) => allowedDivisionIds.includes(id));
    const primaryClassTeacherDivisionId = classTeacherDivisionIds.length === 1
      ? classTeacherDivisionIds[0]
      : classTeacherDivisionIds.includes(p.primaryClassTeacherDivisionId) ? p.primaryClassTeacherDivisionId : null;
    return { ...p, assignedDivisionIds: normalizedAssigned, classTeacherDivisionIds, primaryClassTeacherDivisionId };
  };
  const toggleDivisionAssignment = (divisionId) => {
    setForm((p) => {
      const allDivisionIds = divisions.map((d) => d.id);
      const currentSelected = (p.assignedDivisionIds || []).length > 0 ? (p.assignedDivisionIds || []) : allDivisionIds;
      const nextSelected = currentSelected.includes(divisionId)
        ? currentSelected.filter((id) => id !== divisionId)
        : [...currentSelected, divisionId];
      if (nextSelected.length === 0) {
        notify("Select at least one division", "warning");
        return p;
      }
      return applyDivisionSelection(p, nextSelected);
    });
  };
  const toggleStandardAssignment = (standardId) => {
    setForm((p) => {
      const allDivisionIds = divisions.map((d) => d.id);
      const currentSelected = (p.assignedDivisionIds || []).length > 0 ? (p.assignedDivisionIds || []) : allDivisionIds;
      const standardDivisionIds = divisions.filter((d) => d.standardId === standardId).map((d) => d.id);
      if (standardDivisionIds.length === 0) return p;
      const allSelectedForStandard = standardDivisionIds.every((id) => currentSelected.includes(id));
      const nextSelected = allSelectedForStandard
        ? currentSelected.filter((id) => !standardDivisionIds.includes(id))
        : [...new Set([...currentSelected, ...standardDivisionIds])];
      if (nextSelected.length === 0) {
        notify("Select at least one division", "warning");
        return p;
      }
      return applyDivisionSelection(p, nextSelected);
    });
  };
  const toggleExcludedSubjectForDivision = (divisionId, subjectId) => {
    setForm((p) => {
      const rows = [...(p.divisionSubjectExclusions || [])];
      const idx = rows.findIndex((r) => r.divisionId === divisionId);
      const current = idx >= 0 ? rows[idx] : { divisionId, subjectIds: [] };
      const subjectIds = current.subjectIds.includes(subjectId)
        ? current.subjectIds.filter((id) => id !== subjectId)
        : [...current.subjectIds, subjectId];
      if (subjectIds.length === 0) {
        if (idx >= 0) rows.splice(idx, 1);
      } else if (idx >= 0) {
        rows[idx] = { ...current, subjectIds };
      } else {
        rows.push({ divisionId, subjectIds });
      }
      return { ...p, divisionSubjectExclusions: rows };
    });
  };

  return (
    <div style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 0, marginBottom: 18 }}>
        <div style={{ minWidth: 0 }}><h2 style={{ margin: 0, fontSize: isMobile ? 18 : 20, fontWeight: 700 }}>Teachers</h2><p style={{ margin: "3px 0 0", fontSize: 12, color: T.textSoft }}>{teachers.length} teachers · {teachers.filter((t) => (t.assignedDivisionIds || []).length > 0).length} with division restrictions</p></div>
        <Btn onClick={openAdd} size="sm" fullWidth={isMobile}>+ Add Teacher</Btn>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: teacherGrid, gap: 14 }}>
        {teachers.map((t) => {
          const subs = subjects.filter((s) => (t.subjectIds || []).includes(s.id));
          const hasFree = (t.freeMorningPeriods || 0) > 0 || (t.freeEveningPeriods || 0) > 0;
          const computedCapacity = getComputedCapacity(t);
          const assigned = t.assignedDivisionIds || [];
          const isRestricted = assigned.length > 0;
          const classTeacherDivIds = t.classTeacherDivisionIds || [];
          const classTeacherDivLabels = classTeacherDivIds.map((dId) => {
            const div = divisions.find((d) => d.id === dId);
            if (!div) return null;
            const std = standards.find((s) => s.id === div.standardId);
            return `Std ${std?.name || "?"}-${div.name}`;
          }).filter(Boolean);
          const assignedDivSummary = (() => {
            if (!isRestricted) return null;
            const byStd = {};
            assigned.forEach((dId) => {
              const div = divisions.find((d) => d.id === dId);
              if (!div) return;
              const std = standards.find((s) => s.id === div.standardId);
              const key = std ? `Std ${std.name}` : "Unknown";
              if (!byStd[key]) byStd[key] = [];
              byStd[key].push(div.name);
            });
            return Object.entries(byStd).map(([std, divNames]) => `${std}: ${divNames.join(",")}`).join(" · ");
          })();

          return (
            <div key={t.id} style={{ ...css.card, padding: isMobile ? 16 : 20 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: `hsl(${(t.employeeCode?.charCodeAt(1) || 0) * 20},55%,45%)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 14, flexShrink: 0 }}>{t.firstName[0]}{t.lastName[0]}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{t.firstName} {t.lastName}</div>
                    <div style={{ fontSize: 11, color: T.textSoft }}>{t.employeeCode}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <Btn onClick={() => openEdit(t)} variant="ghost" size="sm">Edit</Btn>
                  <Btn onClick={() => { setTeachers((p) => p.filter((x) => x.id !== t.id)); notify("Teacher removed"); }} variant="ghost" size="sm" style={{ color: T.danger }}><UiIcon name="close" size={14} stroke="currentColor" /></Btn>
                </div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                {subs.map((s) => <span key={s.id} style={css.badge(s.colorHex || T.CORE)}>{s.code}</span>)}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.textSoft, marginBottom: 6 }}>
                <span>Auto max {computedCapacity.maxPerDay}/day · {computedCapacity.maxPerWeek}/wk</span>
                <span>{mediums.filter((m) => (t.mediumIds || []).includes(m.id)).map((m) => m.code).join(", ")}</span>
              </div>
              <div style={{ fontSize: 11, color: T.textSoft, marginBottom: 6 }}>
                Continuity: same subject ≤ {Math.max(1, Number(t.maxContinuousSameSubjectPerDivision || 2))}, combined ≤ {Math.max(1, Number(t.maxContinuousAnySubjectPerDivision || 3))} per division
              </div>

              <div style={{ padding: "7px 10px", borderRadius: 7, background: isRestricted ? T.brand + "0a" : T.success + "0a", border: `1px solid ${isRestricted ? T.brand + "25" : T.success + "25"}`, fontSize: 11 }}>
                {isRestricted
                  ? <><span style={{ color: T.brand, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}><UiIcon name="pin" size={12} stroke={T.brand} />Restricted:</span><span style={{ color: T.textMid }}> {assignedDivSummary}</span></>
                  : <span style={{ color: T.success, display: "inline-flex", alignItems: "center", gap: 4 }}><UiIcon name="check" size={12} stroke={T.success} />Unrestricted — all compatible divisions</span>}
              </div>

              {classTeacherDivLabels.length > 0 && (
                <div style={{ marginTop: 6, padding: "7px 10px", borderRadius: 7, background: T.info + "0c", border: `1px solid ${T.info + "25"}`, fontSize: 11, color: T.textMid }}>
                  <span style={{ color: T.info, fontWeight: 700 }}>Class teacher:</span> {classTeacherDivLabels.join(", ")}
                </div>
              )}

              {hasFree && (
                <div style={{ marginTop: 6, padding: "5px 8px", background: T.info + "12", borderRadius: 6, fontSize: 11, color: T.textMid, lineHeight: 1.35 }}>
                  Free periods:{" "}
                  <span style={{ color: T.info, fontWeight: 600 }}>{formatTeacherFreePeriodsShort(t.freeMorningPeriods, t.freeEveningPeriods)}</span>
                </div>
              )}
            </div>
          );
        })}
        {teachers.length === 0 && <EmptyState iconKey="teacher" title="No teachers yet" desc="Add teachers and assign them to divisions" action={<Btn onClick={openAdd}>Add First Teacher</Btn>} />}
      </div>

      {modal && (
        <Modal
          title={modal === "add" ? "Add Teacher" : "Edit Teacher"}
          onClose={() => setModal(null)}
          width={640}
          scrollToTopKey={teacherStep}
        >
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {[{ id: 1, label: "Teacher Details" }, { id: 2, label: "Divisions & Class Teacher" }].map((step) => (
              <button key={step.id} onClick={() => {
                if (step.id === 2 && !canGoTeacherStepTwo()) return;
                setTeacherStep(step.id);
              }} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${teacherStep === step.id ? T.brand : T.surfaceBorder}`, background: teacherStep === step.id ? T.brand + "12" : T.surface, color: teacherStep === step.id ? T.brand : T.textMid, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {step.id}. {step.label}
              </button>
            ))}
          </div>
          {teacherStep === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: formSectionGap }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "0 12px" : "0 18px" }}>
            <Input label="First Name" value={form.firstName || ""} onChange={(v) => setForm((p) => ({ ...p, firstName: v }))} required />
            <Input label="Last Name" value={form.lastName || ""} onChange={(v) => setForm((p) => ({ ...p, lastName: v }))} required />
            <Input label="Employee Code" value={form.employeeCode || ""} onChange={(v) => setForm((p) => ({ ...p, employeeCode: v.toUpperCase() }))} required />
            <Input label="Email" type="email" value={form.email || ""} onChange={(v) => setForm((p) => ({ ...p, email: v }))} />
          </div>

          <div style={{ padding: "14px 16px", background: T.info + "0a", borderRadius: 10, border: `1px solid ${T.info + "25"}`, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <UiIcon name="period" size={14} stroke={T.info} /><span style={{ fontSize: 13, fontWeight: 700, color: T.textMid }}>Free Period Configuration</span>
            </div>
            <p style={{ fontSize: 11, color: T.textSoft, margin: "0 0 12px" }}>Reserved free slots per session per day. Does not affect class timetables.</p>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "0 12px" : "0 18px" }}>
              <Field label="Morning Free Periods / Day" error={freePeriodErr(form.freeMorningPeriods || 0)} help="Slots reserved free in morning session (max 4)">
                <input type="number" min={0} max={4} value={form.freeMorningPeriods ?? 0} onChange={(e) => setForm((p) => ({ ...p, freeMorningPeriods: Math.max(0, Math.min(4, +e.target.value || 0)) }))} style={{ ...css.input, borderColor: freePeriodErr(form.freeMorningPeriods || 0) ? T.danger : T.surfaceBorder }} />
              </Field>
              <Field label="Evening Free Periods / Day" error={freePeriodErr(form.freeEveningPeriods || 0)} help="Slots reserved free in afternoon session (max 4)">
                <input type="number" min={0} max={4} value={form.freeEveningPeriods ?? 0} onChange={(e) => setForm((p) => ({ ...p, freeEveningPeriods: Math.max(0, Math.min(4, +e.target.value || 0)) }))} style={{ ...css.input, borderColor: freePeriodErr(form.freeEveningPeriods || 0) ? T.danger : T.surfaceBorder }} />
              </Field>
            </div>
          </div>

          <Field label="Max Periods / Week (Optional)" help={`Leave empty to auto-calculate from free periods and slot setup (current auto: ${formComputedCapacity.maxPerWeek}/week).`}>
            <input
              type="number"
              min={1}
              max={60}
              placeholder={`${formComputedCapacity.maxPerWeek}`}
              value={Number(form.maxPerWeek || 0) > 0 ? form.maxPerWeek : ""}
              onChange={(e) => setForm((p) => ({ ...p, maxPerWeek: e.target.value === "" ? 0 : Math.max(1, Number(e.target.value) || 1) }))}
              style={css.input}
            />
          </Field>

          <Field label="Medium Capability">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {mediums.map((m) => (
                <button key={m.id} onClick={() => toggleMedium(m.id)} style={{ padding: "7px 16px", borderRadius: 8, border: `2px solid ${(form.mediumIds || []).includes(m.id) ? T.brand : T.surfaceBorder}`, background: (form.mediumIds || []).includes(m.id) ? T.brand + "18" : "transparent", color: (form.mediumIds || []).includes(m.id) ? T.brand : T.textMid, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{m.name}{m.isPrimary && <UiIcon name="star" size={11} stroke="currentColor" />}</span>
                </button>
              ))}
            </div>
          </Field>

          <Field label="Subjects Taught">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {subjects.map((sub) => (
                <button key={sub.id} onClick={() => toggleSubject(sub.id)} style={{ padding: "6px 12px", borderRadius: 8, border: `2px solid ${(form.subjectIds || []).includes(sub.id) ? sub.colorHex || T.CORE : T.surfaceBorder}`, background: (form.subjectIds || []).includes(sub.id) ? (sub.colorHex || T.CORE) + "18" : "transparent", color: (form.subjectIds || []).includes(sub.id) ? sub.colorHex || T.CORE : T.textMid, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{(form.subjectIds || []).includes(sub.id) && <UiIcon name="check" size={11} stroke="currentColor" />}{sub.name}</span>
                </button>
              ))}
            </div>
          </Field>

          {(form.subjectIds || []).length > 0 && (
            <Select label="Primary Subject" value={form.primarySubjectId || ""} onChange={(v) => setForm((p) => ({ ...p, primarySubjectId: v }))} options={subjects.filter((s) => (form.subjectIds || []).includes(s.id)).map((s) => ({ value: s.id, label: s.name }))} placeholder="Select primary subject" />
          )}

          <div style={{ padding: "14px 16px", background: T.warning + "08", borderRadius: 10, border: `1px solid ${T.warning + "28"}`, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <UiIcon name="preferences" size={14} stroke={T.warning} />
              <span style={{ fontSize: 13, fontWeight: 700, color: T.textMid }}>Continuity Limits Per Division</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "0 12px" : "0 18px" }}>
              <Field label="Max Continuous Same Subject">
                <input type="number" min={1} max={8} value={form.maxContinuousSameSubjectPerDivision ?? 2} onChange={(e) => setForm((p) => ({ ...p, maxContinuousSameSubjectPerDivision: Math.max(1, Number(e.target.value) || 1) }))} style={css.input} />
              </Field>
              <Field label="Max Continuous Combined Subjects">
                <input type="number" min={1} max={8} value={form.maxContinuousAnySubjectPerDivision ?? 3} onChange={(e) => setForm((p) => ({ ...p, maxContinuousAnySubjectPerDivision: Math.max(1, Number(e.target.value) || 1) }))} style={css.input} />
              </Field>
            </div>
          </div>
            </div>
          )}

          {teacherStep === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: formSectionGap }}>
          <Field label="Division Assignment" help="Select a standard, then unselect divisions to avoid for this teacher.">
            <div style={{ display: "grid", gap: 8, maxHeight: 220, overflow: "auto", border: `1px solid ${T.surfaceBorder}`, borderRadius: 8, padding: 10 }}>
              {[...standards].sort((a, b) => a.sortOrder - b.sortOrder).map((std) => {
                const stdDivisions = divisions.filter((d) => d.standardId === std.id);
                if (stdDivisions.length === 0) return null;
                const allSelected = stdDivisions.every((d) => selectedDivisionIdsForUi.includes(d.id));
                return (
                  <div key={std.id} style={{ border: `1px solid ${T.surfaceBorder}`, borderRadius: 8, padding: 8 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, color: T.textMid, marginBottom: 8, cursor: "pointer" }}>
                      <input type="checkbox" checked={allSelected} onChange={() => toggleStandardAssignment(std.id)} />
                      Std {std.name}
                    </label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {stdDivisions.map((div) => {
                        const isSelected = selectedDivisionIdsForUi.includes(div.id);
                        return (
                          <button
                            key={div.id}
                            onClick={() => toggleDivisionAssignment(div.id)}
                            style={{
                              padding: "5px 9px",
                              borderRadius: 16,
                              border: `1px solid ${isSelected ? T.info : T.surfaceBorder}`,
                              background: isSelected ? T.info + "12" : T.surface,
                              color: isSelected ? T.info : T.textMid,
                              cursor: "pointer",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            {div.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Field>

          <div style={{ padding: "10px 12px", background: T.info + "08", borderRadius: 10, border: `1px solid ${T.info + "20"}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <UiIcon name="teacher" size={14} stroke={T.info} />
              <span style={{ fontSize: 13, fontWeight: 700, color: T.textMid }}>Class Teacher Assignment</span>
            </div>
            {(() => {
              const allowedDivisionIds = (form.assignedDivisionIds || []).length > 0
                ? (form.assignedDivisionIds || [])
                : divisions.map((d) => d.id);
              const classTeacherDivisionOptions = divisions.filter((d) => allowedDivisionIds.includes(d.id));
              return (
                <>
                  {(form.assignedDivisionIds || []).length > 0 && (
                    <p style={{ fontSize: 11, color: T.textSoft, margin: "0 0 8px" }}>
                      Showing only assigned divisions for this teacher.
                    </p>
                  )}
                  {classTeacherDivisionOptions.some((d) => classTeacherOwnerByDivision.has(d.id)) && (
                    <p style={{ fontSize: 11, color: T.warning, margin: "0 0 8px" }}>
                      Some divisions are already assigned to other class teachers and are locked.
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {classTeacherDivisionOptions.map((div) => {
                      const std = standards.find((s) => s.id === div.standardId);
                      const checked = (form.classTeacherDivisionIds || []).includes(div.id);
                      const owner = classTeacherOwnerByDivision.get(div.id);
                      const locked = Boolean(owner) && !checked;
                      return (
                        <button key={div.id} disabled={locked} title={locked ? `Already assigned to ${owner?.firstName || ""} ${owner?.lastName || ""}`.trim() : ""} onClick={() => setForm((p) => {
                          const next = checked ? [] : [div.id];
                          return { ...p, classTeacherDivisionIds: next, primaryClassTeacherDivisionId: next[0] || null };
                        })} style={{ padding: "7px 12px", borderRadius: 16, border: `2px solid ${checked ? T.brand : locked ? T.warning + "45" : T.surfaceBorder}`, background: checked ? T.brand + "18" : locked ? T.warning + "10" : T.surface, color: checked ? T.brand : locked ? T.warning : T.textSoft, boxShadow: checked ? `0 0 0 1px ${T.brand + "33"}` : "none", cursor: locked ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700, opacity: locked ? 0.72 : 1, display: "inline-flex", alignItems: "center", gap: 5 }}>
                          {checked ? <UiIcon name="check" size={11} stroke="currentColor" /> : null}
                          Std {std?.name || "?"}-{div.name}
                        </button>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
          <Field label="Subjects Taught by Division" help="By default all selected subjects are active. Click a subject to unselect it for that division.">
            <div style={{ display: "grid", gap: 8, maxHeight: 220, overflow: "auto", border: `1px solid ${T.surfaceBorder}`, borderRadius: 8, padding: 10 }}>
              {divisions.filter((d) => allowedDivisionIdsForStep2.includes(d.id)).map((div) => {
                const std = standards.find((s) => s.id === div.standardId);
                const excluded = (form.divisionSubjectExclusions || []).find((r) => r.divisionId === div.id)?.subjectIds || [];
                return (
                  <div key={div.id} style={{ borderBottom: `1px solid ${T.surfaceBorder}55`, paddingBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.textMid, marginBottom: 6 }}>Std {std?.name || "?"}-{div.name}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {subjects.filter((s) => (form.subjectIds || []).includes(s.id)).map((sub) => {
                        const isSelected = !excluded.includes(sub.id);
                        return (
                          <button key={sub.id} onClick={() => toggleExcludedSubjectForDivision(div.id, sub.id)} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${isSelected ? T.success : T.surfaceBorder}`, background: isSelected ? T.success + "14" : T.surface, color: isSelected ? T.success : T.textSoft, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            {sub.code}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Field>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: teacherStep === 1 ? "flex-end" : "space-between" }}>
            {teacherStep === 1 ? (
              <Btn onClick={() => {
                if (!canGoTeacherStepTwo()) return;
                setTeacherStep(2);
              }}>Next</Btn>
            ) : (
              <>
                <Btn onClick={() => setTeacherStep(1)} variant="ghost">Back</Btn>
                <Btn onClick={save}>Save Teacher</Btn>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

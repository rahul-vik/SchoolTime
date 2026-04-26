import { useState } from "react";
import { UiIcon, useBreakpoint } from "../shared/uiPrimitives";

export function SubjectsPage({ subjects, setSubjects, standards, mediums, notify, ui }) {
  const { T, css, Btn, ProgressBar, EmptyState, Modal, Input, Select, Field } = ui;
  const { isMobile } = useBreakpoint();
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const cats = ["LANGUAGE", "CORE", "NON_CORE", "PRACTICAL", "EXTRA_CURRICULAR"];
  const catColors = { LANGUAGE: "#7c3aed", CORE: "#0369a1", NON_CORE: "#0891b2", PRACTICAL: "#059669", EXTRA_CURRICULAR: "#d97706" };
  const blank = { name: "", code: "", category: "CORE", weeklyPeriods: 5, maxPerDay: 2, priorityWeight: 5, colorHex: "#0369a1" };

  const save = () => {
    if (!form.name || !form.code) return;
    if (subjects.some((s) => s.code === form.code && s.id !== form.id)) { notify("Subject code already in use", "warning"); return; }
    if (modal === "add") setSubjects((p) => [...p, { ...form, id: `sub${Date.now()}`, isActive: true, mediumIds: mediums.map((m) => m.id), standardIds: standards.map((s) => s.id) }]);
    else setSubjects((p) => p.map((s) => s.id === form.id ? { ...s, ...form } : s));
    setModal(null); notify(modal === "add" ? "Subject added" : "Subject updated");
  };

  return (
    <div style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 0, marginBottom: 18 }}>
        <div style={{ minWidth: 0 }}><h2 style={{ margin: 0, fontSize: isMobile ? 18 : 20, fontWeight: 700 }}>Subjects</h2><p style={{ margin: "3px 0 0", fontSize: 12, color: T.textSoft }}>{subjects.length} subjects</p></div>
        <Btn onClick={() => { setForm({ ...blank }); setModal("add"); }} size="sm" fullWidth={isMobile}>+ Add Subject</Btn>
      </div>
      <div style={{ ...css.card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 560 : undefined }}>
          <thead><tr style={{ background: T.surfaceAlt }}>
            {["Subject", "Code", "Category", "Wkly", "Max/Day", "Priority", ""].map((h) => <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${T.surfaceBorder}` }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {subjects.map((sub, i) => (
              <tr key={sub.id} style={{ borderBottom: `1px solid ${T.surfaceBorder}`, background: i % 2 === 0 ? T.surface : T.surfaceAlt + "60" }}>
                <td style={{ padding: "11px 14px" }}><div style={{ display: "flex", alignItems: "center", gap: 9 }}><div style={{ width: 9, height: 9, borderRadius: "50%", background: sub.colorHex, flexShrink: 0 }} /><span style={{ fontWeight: 700, fontSize: 13 }}>{sub.name}</span></div></td>
                <td style={{ padding: "11px 14px" }}><code style={{ background: T.surfaceAlt, padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>{sub.code}</code></td>
                <td style={{ padding: "11px 14px" }}><span style={css.badge(catColors[sub.category] || T.CORE)}>{sub.category.replace(/_/g, " ")}</span></td>
                <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 800, color: T.brand }}>{sub.weeklyPeriods}</td>
                <td style={{ padding: "11px 14px", fontSize: 13, color: T.textMid }}>{sub.maxPerDay || "—"}</td>
                <td style={{ padding: "11px 14px", minWidth: 80 }}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><ProgressBar value={sub.priorityWeight} max={10} color={T.brand} height={4} /><span style={{ fontSize: 11, color: T.textSoft }}>{sub.priorityWeight}</span></div></td>
                <td style={{ padding: "11px 14px" }}><div style={{ display: "flex", gap: 6 }}><Btn onClick={() => { setForm({ ...sub }); setModal("edit"); }} variant="ghost" size="sm">Edit</Btn><Btn onClick={() => { setSubjects((p) => p.filter((s) => s.id !== sub.id)); notify("Subject removed"); }} variant="ghost" size="sm" style={{ color: T.danger }}><UiIcon name="close" size={14} stroke="currentColor" /></Btn></div></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {subjects.length === 0 && <EmptyState iconKey="subject" title="No subjects yet" desc="Add subjects to configure your timetable" action={<Btn onClick={() => { setForm({ ...blank }); setModal("add"); }}>Add First Subject</Btn>} />}
      </div>

      {modal && (
        <Modal title={modal === "add" ? "Add Subject" : "Edit Subject"} onClose={() => setModal(null)} width={540}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "0 12px" : "0 18px" }}>
            <Input label="Subject Name" value={form.name || ""} onChange={(v) => setForm((p) => ({ ...p, name: v }))} required />
            <Input label="Code" value={form.code || ""} onChange={(v) => setForm((p) => ({ ...p, code: v.toUpperCase() }))} required />
            <Select label="Category" value={form.category || ""} onChange={(v) => setForm((p) => ({ ...p, category: v, colorHex: catColors[v] || form.colorHex }))} options={cats.map((c) => ({ value: c, label: c.replace(/_/g, " ") }))} />
            <Field label="Color"><input type="color" value={form.colorHex || "#0369a1"} onChange={(e) => setForm((p) => ({ ...p, colorHex: e.target.value }))} style={{ width: "100%", height: 42, borderRadius: 8, border: `1px solid ${T.surfaceBorder}`, padding: 4, cursor: "pointer" }} /></Field>
            <Field label="Weekly Periods"><input type="number" min={1} max={20} value={form.weeklyPeriods || 5} onChange={(e) => setForm((p) => ({ ...p, weeklyPeriods: +e.target.value }))} style={css.input} /></Field>
            <Field label="Max Per Day"><input type="number" min={1} max={10} value={form.maxPerDay || ""} onChange={(e) => setForm((p) => ({ ...p, maxPerDay: +e.target.value || null }))} placeholder="No limit" style={css.input} /></Field>
          </div>
          <Field label={`Priority Weight: ${form.priorityWeight || 5}/10`}><input type="range" min={1} max={10} value={form.priorityWeight || 5} onChange={(e) => setForm((p) => ({ ...p, priorityWeight: +e.target.value }))} style={{ width: "100%" }} /></Field>
          <div style={{ display: "flex", gap: 10 }}><Btn onClick={save}>Save Subject</Btn><Btn onClick={() => setModal(null)} variant="ghost">Cancel</Btn></div>
        </Modal>
      )}
    </div>
  );
}

export function TeachersPage({ teachers, setTeachers, subjects, mediums, divisions, standards, notify, helpers, ui }) {
  const { T, css, Btn, EmptyState, Modal, Input, Select, Field } = ui;
  const { TeacherDivisionMapper } = helpers;
  const { isMobile } = useBreakpoint();
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const blank = { firstName: "", lastName: "", employeeCode: "", email: "", maxPerDay: 6, maxPerWeek: 30, mediumIds: mediums.length > 0 ? [mediums[0].id] : [], subjectIds: [], primarySubjectId: "", freeMorningPeriods: 0, freeEveningPeriods: 0, assignedDivisionIds: [] };

  const openAdd = () => { setForm({ ...blank, mediumIds: mediums.length > 0 ? [mediums[0].id] : [] }); setModal("add"); };
  const openEdit = (t) => { setForm({ freeMorningPeriods: 0, freeEveningPeriods: 0, assignedDivisionIds: [], ...t }); setModal("edit"); };

  const save = () => {
    if (!form.firstName || !form.lastName) return;
    if (!form.employeeCode) { notify("Employee code is required", "warning"); return; }
    if (teachers.some((t) => t.employeeCode === form.employeeCode && t.id !== form.id)) { notify("Employee code already exists", "warning"); return; }
    if ((form.freeMorningPeriods || 0) > 4 || (form.freeEveningPeriods || 0) > 4) { notify("Free period count cannot exceed 4 per session", "warning"); return; }
    if (modal === "add") setTeachers((p) => [...p, { ...form, id: `t${Date.now()}`, isActive: true }]);
    else setTeachers((p) => p.map((t) => t.id === form.id ? { ...t, ...form } : t));
    setModal(null);
    notify(modal === "add" ? "Teacher added" : "Teacher updated");
  };

  const toggleSubject = (id) => setForm((p) => ({ ...p, subjectIds: (p.subjectIds || []).includes(id) ? (p.subjectIds || []).filter((s) => s !== id) : [...(p.subjectIds || []), id] }));
  const toggleMedium = (id) => setForm((p) => ({ ...p, mediumIds: (p.mediumIds || []).includes(id) ? (p.mediumIds || []).filter((m) => m !== id) : [...(p.mediumIds || []), id] }));
  const freePeriodErr = (v) => v > 4 ? "Max 4 per session" : v < 0 ? "Must be ≥ 0" : null;

  const teacherGrid = isMobile ? "1fr" : "repeat(auto-fill,minmax(300px,1fr))";

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
          const assigned = t.assignedDivisionIds || [];
          const isRestricted = assigned.length > 0;

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
                <span>Max {t.maxPerDay}/day · {t.maxPerWeek}/wk</span>
                <span>{mediums.filter((m) => (t.mediumIds || []).includes(m.id)).map((m) => m.code).join(", ")}</span>
              </div>

              <div style={{ padding: "7px 10px", borderRadius: 7, background: isRestricted ? T.brand + "0a" : T.success + "0a", border: `1px solid ${isRestricted ? T.brand + "25" : T.success + "25"}`, fontSize: 11 }}>
                {isRestricted
                  ? <><span style={{ color: T.brand, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}><UiIcon name="pin" size={12} stroke={T.brand} />Restricted:</span><span style={{ color: T.textMid }}> {assignedDivSummary}</span></>
                  : <span style={{ color: T.success, display: "inline-flex", alignItems: "center", gap: 4 }}><UiIcon name="check" size={12} stroke={T.success} />Unrestricted — all compatible divisions</span>}
              </div>

              {hasFree && (
                <div style={{ marginTop: 6, padding: "5px 8px", background: T.info + "12", borderRadius: 6, fontSize: 11, color: T.info, display: "flex", gap: 12 }}>
                  <span>Free: {t.freeMorningPeriods || 0} morning · {t.freeEveningPeriods || 0} evening /day</span>
                </div>
              )}
            </div>
          );
        })}
        {teachers.length === 0 && <EmptyState iconKey="teacher" title="No teachers yet" desc="Add teachers and assign them to divisions" action={<Btn onClick={openAdd}>Add First Teacher</Btn>} />}
      </div>

      {modal && (
        <Modal title={modal === "add" ? "Add Teacher" : "Edit Teacher"} onClose={() => setModal(null)} width={640}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "0 12px" : "0 18px" }}>
            <Input label="First Name" value={form.firstName || ""} onChange={(v) => setForm((p) => ({ ...p, firstName: v }))} required />
            <Input label="Last Name" value={form.lastName || ""} onChange={(v) => setForm((p) => ({ ...p, lastName: v }))} required />
            <Input label="Employee Code" value={form.employeeCode || ""} onChange={(v) => setForm((p) => ({ ...p, employeeCode: v.toUpperCase() }))} required />
            <Input label="Email" type="email" value={form.email || ""} onChange={(v) => setForm((p) => ({ ...p, email: v }))} />
            <Field label="Max Periods / Day"><input type="number" min={1} max={10} value={form.maxPerDay || 6} onChange={(e) => setForm((p) => ({ ...p, maxPerDay: +e.target.value }))} style={css.input} /></Field>
            <Field label="Max Periods / Week"><input type="number" min={1} max={50} value={form.maxPerWeek || 30} onChange={(e) => setForm((p) => ({ ...p, maxPerWeek: +e.target.value }))} style={css.input} /></Field>
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

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: T.textMid, textTransform: "uppercase", letterSpacing: "0.06em" }}>Division Assignment</label>
            </div>
            <TeacherDivisionMapper assignedDivisionIds={form.assignedDivisionIds || []} onChange={(ids) => setForm((p) => ({ ...p, assignedDivisionIds: ids }))} standards={standards} divisions={divisions} />
          </div>

          <div style={{ display: "flex", gap: 10 }}><Btn onClick={save}>Save Teacher</Btn><Btn onClick={() => setModal(null)} variant="ghost">Cancel</Btn></div>
        </Modal>
      )}
    </div>
  );
}

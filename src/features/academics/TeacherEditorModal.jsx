import { useEffect, useMemo, useState } from "react";
import { sortStandardsAscending } from "../../../shared/schoolDisplayOrder.js";
import { UiIcon, useBreakpoint } from "../shared/uiPrimitives";
import { getTeacherComputedCapacity, normalizeTeacherCapacityOnSave } from "./teacherCapacity.js";

export function formStateFromTeacher(teacher) {
  const singleClassTeacherDivisionId = (teacher.classTeacherDivisionIds || [])[0] || null;
  return {
    freeMorningPeriods: 0,
    freeEveningPeriods: 0,
    assignedDivisionIds: [],
    divisionSubjectExclusions: [],
    ...teacher,
    classTeacherDivisionIds: singleClassTeacherDivisionId ? [singleClassTeacherDivisionId] : [],
    primaryClassTeacherDivisionId: singleClassTeacherDivisionId,
  };
}

/** Full teacher add/edit modal (same as Teachers page). */
export function TeacherEditorModal({
  mode,
  teacherId,
  teachers,
  setTeachers,
  subjects,
  mediums,
  divisions,
  standards,
  periodSlots,
  workingDays,
  notify,
  onClose,
  onSaved,
  ui,
}) {
  const { T, css, Btn, Modal, Input, Select, Field } = ui;
  const { isMobile } = useBreakpoint();
  const formSectionGap = 14;
  const [form, setForm] = useState({});
  const [teacherStep, setTeacherStep] = useState(1);

  const teacher = mode === "edit" ? (teachers || []).find((t) => String(t.id) === String(teacherId)) : null;

  const blank = useMemo(
    () => ({
      firstName: "",
      lastName: "",
      employeeCode: "",
      email: "",
      maxPerDay: 0,
      maxPerWeek: 0,
      mediumIds: mediums.length > 0 ? [mediums[0].id] : [],
      subjectIds: [],
      primarySubjectId: "",
      freeMorningPeriods: 0,
      freeEveningPeriods: 0,
      maxContinuousSameSubjectPerDivision: 1,
      maxContinuousAnySubjectPerDivision: 1,
      assignedDivisionIds: [],
      classTeacherDivisionIds: [],
      primaryClassTeacherDivisionId: null,
      divisionSubjectExclusions: [],
    }),
    [mediums],
  );

  useEffect(() => {
    if (mode === "add") {
      setForm({ ...blank, mediumIds: mediums.length > 0 ? [mediums[0].id] : [], divisionSubjectExclusions: [] });
    } else if (teacher) {
      setForm(formStateFromTeacher(teacher));
    }
    setTeacherStep(1);
  }, [mode, teacherId, teacher, blank, mediums]);

  const save = () => {
    if (!form.firstName || !form.lastName) return;
    if (!form.employeeCode) {
      notify("Employee code is required", "warning");
      return;
    }
    if (teachers.some((t) => t.employeeCode === form.employeeCode && t.id !== form.id)) {
      notify("Employee code already exists", "warning");
      return;
    }
    if ((form.freeMorningPeriods || 0) > 4 || (form.freeEveningPeriods || 0) > 4) {
      notify("Free period count cannot exceed 4 per session", "warning");
      return;
    }
    const allowedClassTeacherDivisionIds =
      (form.assignedDivisionIds || []).length > 0 ? form.assignedDivisionIds || [] : divisions.map((d) => d.id);
    const cleanedClassTeacherDivisionIds = (form.classTeacherDivisionIds || [])
      .filter((id) => allowedClassTeacherDivisionIds.includes(id))
      .slice(0, 1);
    const conflictDivisionId = cleanedClassTeacherDivisionIds.find((divId) => classTeacherOwnerByDivision.has(divId));
    if (conflictDivisionId) {
      const owner = classTeacherOwnerByDivision.get(conflictDivisionId);
      const div = divisions.find((d) => d.id === conflictDivisionId);
      const std = standards.find((s) => s.id === div?.standardId);
      notify(
        `Class teacher already assigned: Std ${std?.name || "?"}-${div?.name || "?"} is mapped to ${owner?.firstName || ""} ${owner?.lastName || ""}`.trim(),
        "warning",
      );
      return;
    }
    const cleanedPrimaryClassTeacherDivisionId = cleanedClassTeacherDivisionIds[0] || null;
    const capacityFields = normalizeTeacherCapacityOnSave(form, periodSlots, workingDays);
    const nextForm = {
      ...form,
      ...capacityFields,
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
    if (mode === "add") setTeachers((p) => [...p, { ...nextForm, id: `t${Date.now()}`, isActive: true }]);
    else setTeachers((p) => p.map((t) => (t.id === form.id ? { ...t, ...nextForm } : t)));
    notify(mode === "add" ? "Teacher added" : "Teacher updated");
    onSaved?.();
    onClose();
  };

  const toggleSubject = (id) =>
    setForm((p) => ({
      ...p,
      subjectIds: (p.subjectIds || []).includes(id) ? (p.subjectIds || []).filter((s) => s !== id) : [...(p.subjectIds || []), id],
    }));
  const toggleMedium = (id) =>
    setForm((p) => ({
      ...p,
      mediumIds: (p.mediumIds || []).includes(id) ? (p.mediumIds || []).filter((m) => m !== id) : [...(p.mediumIds || []), id],
    }));
  const freePeriodErr = (v) => (v > 4 ? "Max 4 per session" : v < 0 ? "Must be ≥ 0" : null);
  const canGoTeacherStepTwo = () => {
    if (!form.firstName || !String(form.firstName).trim()) {
      notify("First name is required", "warning");
      return false;
    }
    if (!form.lastName || !String(form.lastName).trim()) {
      notify("Last name is required", "warning");
      return false;
    }
    if (!form.employeeCode || !String(form.employeeCode).trim()) {
      notify("Employee code is required", "warning");
      return false;
    }
    if ((form.mediumIds || []).length === 0) {
      notify("Select at least one medium", "warning");
      return false;
    }
    if ((form.subjectIds || []).length === 0) {
      notify("Select at least one subject", "warning");
      return false;
    }
    return true;
  };

  const formComputedCapacity = getTeacherComputedCapacity(form || {}, periodSlots, workingDays);
  const classTeacherOwnerByDivision = useMemo(() => {
    const map = new Map();
    for (const t of teachers || []) {
      if (form?.id && t.id === form.id) continue;
      for (const divId of t.classTeacherDivisionIds || []) {
        if (!map.has(divId)) map.set(divId, t);
      }
    }
    return map;
  }, [teachers, form?.id]);

  const selectedDivisionIdsForUi =
    (form.assignedDivisionIds || []).length > 0 ? form.assignedDivisionIds || [] : divisions.map((d) => d.id);
  const allowedDivisionIdsForStep2 =
    (form.assignedDivisionIds || []).length > 0 ? form.assignedDivisionIds || [] : divisions.map((d) => d.id);
  const applyDivisionSelection = (p, nextSelected) => {
    const allDivisionIds = divisions.map((d) => d.id);
    const normalizedAssigned = nextSelected.length === allDivisionIds.length ? [] : nextSelected;
    const allowedDivisionIds = normalizedAssigned.length > 0 ? normalizedAssigned : allDivisionIds;
    const classTeacherDivisionIds = (p.classTeacherDivisionIds || []).filter((id) => allowedDivisionIds.includes(id));
    const primaryClassTeacherDivisionId =
      classTeacherDivisionIds.length === 1
        ? classTeacherDivisionIds[0]
        : classTeacherDivisionIds.includes(p.primaryClassTeacherDivisionId)
          ? p.primaryClassTeacherDivisionId
          : null;
    return { ...p, assignedDivisionIds: normalizedAssigned, classTeacherDivisionIds, primaryClassTeacherDivisionId };
  };
  const toggleDivisionAssignment = (divisionId) => {
    setForm((p) => {
      const allDivisionIds = divisions.map((d) => d.id);
      const currentSelected = (p.assignedDivisionIds || []).length > 0 ? p.assignedDivisionIds || [] : allDivisionIds;
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
      const currentSelected = (p.assignedDivisionIds || []).length > 0 ? p.assignedDivisionIds || [] : allDivisionIds;
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

  if (mode === "edit" && !teacher) return null;

  return (
    <Modal
      title={mode === "add" ? "Add Teacher" : "Edit Teacher"}
      onClose={onClose}
      width={640}
      scrollToTopKey={teacherStep}
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {[
          { id: 1, label: "Teacher Details" },
          { id: 2, label: "Divisions & Class Teacher" },
        ].map((step) => (
          <button
            key={step.id}
            type="button"
            onClick={() => {
              if (step.id === 2 && !canGoTeacherStepTwo()) return;
              setTeacherStep(step.id);
            }}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: `1px solid ${teacherStep === step.id ? T.brand : T.surfaceBorder}`,
              background: teacherStep === step.id ? T.brand + "12" : T.surface,
              color: teacherStep === step.id ? T.brand : T.textMid,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
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
              <UiIcon name="period" size={14} stroke={T.info} />
              <span style={{ fontSize: 13, fontWeight: 700, color: T.textMid }}>Free Period Configuration</span>
            </div>
            <p style={{ fontSize: 11, color: T.textSoft, margin: "0 0 12px" }}>Reserved free slots per session per day. Does not affect class timetables.</p>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "0 12px" : "0 18px" }}>
              <Field label="Morning Free Periods / Day" error={freePeriodErr(form.freeMorningPeriods || 0)} help="Slots reserved free in morning session (max 4)">
                <input
                  type="number"
                  min={0}
                  max={4}
                  value={form.freeMorningPeriods ?? 0}
                  onChange={(e) => setForm((p) => ({ ...p, freeMorningPeriods: Math.max(0, Math.min(4, +e.target.value || 0)) }))}
                  style={{ ...css.input, borderColor: freePeriodErr(form.freeMorningPeriods || 0) ? T.danger : T.surfaceBorder }}
                />
              </Field>
              <Field label="Evening Free Periods / Day" error={freePeriodErr(form.freeEveningPeriods || 0)} help="Slots reserved free in afternoon session (max 4)">
                <input
                  type="number"
                  min={0}
                  max={4}
                  value={form.freeEveningPeriods ?? 0}
                  onChange={(e) => setForm((p) => ({ ...p, freeEveningPeriods: Math.max(0, Math.min(4, +e.target.value || 0)) }))}
                  style={{ ...css.input, borderColor: freePeriodErr(form.freeEveningPeriods || 0) ? T.danger : T.surfaceBorder }}
                />
              </Field>
            </div>
          </div>

          <Field
            label="Max Periods / Week (Optional)"
            help={`Leave empty to auto-calculate from free periods and slot setup (current auto: ${formComputedCapacity.maxPerWeek}/week).`}
          >
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
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleMedium(m.id)}
                  style={{
                    padding: "7px 16px",
                    borderRadius: 8,
                    border: `2px solid ${(form.mediumIds || []).includes(m.id) ? T.brand : T.surfaceBorder}`,
                    background: (form.mediumIds || []).includes(m.id) ? T.brand + "18" : "transparent",
                    color: (form.mediumIds || []).includes(m.id) ? T.brand : T.textMid,
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {m.name}
                    {m.isPrimary && <UiIcon name="star" size={11} stroke="currentColor" />}
                  </span>
                </button>
              ))}
            </div>
          </Field>

          <Field label="Subjects Taught">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {subjects.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => toggleSubject(sub.id)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: `2px solid ${(form.subjectIds || []).includes(sub.id) ? sub.colorHex || T.CORE : T.surfaceBorder}`,
                    background: (form.subjectIds || []).includes(sub.id) ? (sub.colorHex || T.CORE) + "18" : "transparent",
                    color: (form.subjectIds || []).includes(sub.id) ? sub.colorHex || T.CORE : T.textMid,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {(form.subjectIds || []).includes(sub.id) && <UiIcon name="check" size={11} stroke="currentColor" />}
                    {sub.name}
                  </span>
                </button>
              ))}
            </div>
          </Field>

          {(form.subjectIds || []).length > 0 && (
            <Select
              label="Primary Subject"
              value={form.primarySubjectId || ""}
              onChange={(v) => setForm((p) => ({ ...p, primarySubjectId: v }))}
              options={subjects.filter((s) => (form.subjectIds || []).includes(s.id)).map((s) => ({ value: s.id, label: s.name }))}
              placeholder="Select primary subject"
            />
          )}

          <div style={{ padding: "14px 16px", background: T.warning + "08", borderRadius: 10, border: `1px solid ${T.warning + "28"}`, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <UiIcon name="preferences" size={14} stroke={T.warning} />
              <span style={{ fontSize: 13, fontWeight: 700, color: T.textMid }}>Continuity Limits Per Division</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "0 12px" : "0 18px" }}>
              <Field label="Max Continuous Same Subject">
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={form.maxContinuousSameSubjectPerDivision ?? 2}
                  onChange={(e) => setForm((p) => ({ ...p, maxContinuousSameSubjectPerDivision: Math.max(1, Number(e.target.value) || 1) }))}
                  style={css.input}
                />
              </Field>
              <Field label="Max Continuous Combined Subjects">
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={form.maxContinuousAnySubjectPerDivision ?? 3}
                  onChange={(e) => setForm((p) => ({ ...p, maxContinuousAnySubjectPerDivision: Math.max(1, Number(e.target.value) || 1) }))}
                  style={css.input}
                />
              </Field>
            </div>
          </div>
        </div>
      )}

      {teacherStep === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: formSectionGap }}>
          <Field label="Division Assignment" help="Select a standard, then unselect divisions to avoid for this teacher.">
            <div style={{ display: "grid", gap: 8, maxHeight: 220, overflow: "auto", border: `1px solid ${T.surfaceBorder}`, borderRadius: 8, padding: 10 }}>
              {sortStandardsAscending(standards).map((std) => {
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
                            type="button"
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
              const allowedDivisionIds =
                (form.assignedDivisionIds || []).length > 0 ? form.assignedDivisionIds || [] : divisions.map((d) => d.id);
              const classTeacherDivisionOptions = divisions.filter((d) => allowedDivisionIds.includes(d.id));
              return (
                <>
                  {(form.assignedDivisionIds || []).length > 0 && (
                    <p style={{ fontSize: 11, color: T.textSoft, margin: "0 0 8px" }}>Showing only assigned divisions for this teacher.</p>
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
                        <button
                          key={div.id}
                          type="button"
                          disabled={locked}
                          title={locked ? `Already assigned to ${owner?.firstName || ""} ${owner?.lastName || ""}`.trim() : ""}
                          onClick={() =>
                            setForm((p) => {
                              const next = checked ? [] : [div.id];
                              return { ...p, classTeacherDivisionIds: next, primaryClassTeacherDivisionId: next[0] || null };
                            })
                          }
                          style={{
                            padding: "7px 12px",
                            borderRadius: 16,
                            border: `2px solid ${checked ? T.brand : locked ? T.warning + "45" : T.surfaceBorder}`,
                            background: checked ? T.brand + "18" : locked ? T.warning + "10" : T.surface,
                            color: checked ? T.brand : locked ? T.warning : T.textSoft,
                            boxShadow: checked ? `0 0 0 1px ${T.brand + "33"}` : "none",
                            cursor: locked ? "not-allowed" : "pointer",
                            fontSize: 12,
                            fontWeight: 700,
                            opacity: locked ? 0.72 : 1,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
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
              {divisions
                .filter((d) => allowedDivisionIdsForStep2.includes(d.id))
                .map((div) => {
                  const std = standards.find((s) => s.id === div.standardId);
                  const excluded = (form.divisionSubjectExclusions || []).find((r) => r.divisionId === div.id)?.subjectIds || [];
                  return (
                    <div key={div.id} style={{ borderBottom: `1px solid ${T.surfaceBorder}55`, paddingBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.textMid, marginBottom: 6 }}>
                        Std {std?.name || "?"}-{div.name}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {subjects
                          .filter((s) => (form.subjectIds || []).includes(s.id))
                          .map((sub) => {
                            const isSelected = !excluded.includes(sub.id);
                            return (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => toggleExcludedSubjectForDivision(div.id, sub.id)}
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: 6,
                                  border: `1px solid ${isSelected ? T.success : T.surfaceBorder}`,
                                  background: isSelected ? T.success + "14" : T.surface,
                                  color: isSelected ? T.success : T.textSoft,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
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
          <Btn
            type="button"
            onClick={() => {
              if (!canGoTeacherStepTwo()) return;
              setTeacherStep(2);
            }}
          >
            Next
          </Btn>
        ) : (
          <>
            <Btn type="button" onClick={() => setTeacherStep(1)} variant="ghost">
              Back
            </Btn>
            <Btn type="button" onClick={save}>
              Save Teacher
            </Btn>
          </>
        )}
      </div>
    </Modal>
  );
}

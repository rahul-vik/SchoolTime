import { useMemo, useState } from "react";
import { UiIcon, useBreakpoint } from "../shared/uiPrimitives";

export function PeriodsPage({ periodSlots, setPeriodSlots, notify, ui }) {
  const { T, css, Btn, Modal, Input, Select, Field } = ui;
  const { isMobile } = useBreakpoint();
  const [editIdx, setEditIdx] = useState(null);
  const [editSlot, setEditSlot] = useState(null);
  const typeColors = { LESSON: T.brand, BREAK: T.warning, LUNCH: T.success, ASSEMBLY: T.info };
  const typeOptions = [{ value: "LESSON", label: "Lesson" }, { value: "BREAK", label: "Break" }, { value: "LUNCH", label: "Lunch" }, { value: "ASSEMBLY", label: "Assembly" }];
  const lessonCount = periodSlots.filter((s) => s.slotType === "LESSON").length;
  const saveSlot = () => { if (!editSlot) return; setPeriodSlots((p) => p.map((s, i) => i === editIdx ? editSlot : s)); setEditIdx(null); setEditSlot(null); notify("Period slot updated"); };

  return (
    <div style={{ width: "100%", maxWidth: 680, minWidth: 0, boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 0, marginBottom: 18 }}>
        <div style={{ minWidth: 0 }}><h2 style={{ margin: 0, fontSize: isMobile ? 18 : 20, fontWeight: 700 }}>Period Structure</h2><p style={{ margin: "3px 0 0", fontSize: 12, color: T.textSoft }}>{lessonCount} lesson periods · {periodSlots.length} total slots</p></div>
        <Btn onClick={() => { setPeriodSlots((p) => [...p, { slotNumber: p.length + 1, startTime: "16:00", endTime: "16:45", slotType: "LESSON", label: `Period ${p.filter((s) => s.slotType === "LESSON").length + 1}`, durationMins: 45 }]); notify("Slot added"); }} size="sm" fullWidth={isMobile}>+ Add Slot</Btn>
      </div>
      <div style={{ ...css.card, padding: isMobile ? 16 : 20 }}>
        {periodSlots.map((slot, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 0", borderBottom: i < periodSlots.length - 1 ? `1px solid ${T.surfaceBorder}` : "none", flexWrap: "wrap" }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: (typeColors[slot.slotType] || T.brand) + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: typeColors[slot.slotType] || T.brand, flexShrink: 0 }}>{slot.slotNumber}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2, flexWrap: "wrap" }}><span style={{ fontSize: 13, fontWeight: 700 }}>{slot.label}</span><span style={css.badge(typeColors[slot.slotType] || T.brand)}>{slot.slotType}</span></div>
              <span style={{ fontSize: 11, color: T.textSoft }}>{slot.startTime} – {slot.endTime} · {slot.durationMins} min</span>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <Btn onClick={() => { setEditIdx(i); setEditSlot({ ...slot }); }} variant="ghost" size="sm">Edit</Btn>
              {lessonCount > 2 && <Btn onClick={() => { setPeriodSlots((p) => p.filter((_, j) => j !== i).map((s, j) => ({ ...s, slotNumber: j + 1 }))); notify("Slot removed"); }} variant="ghost" size="sm" style={{ color: T.danger }}><UiIcon name="close" size={14} stroke="currentColor" /></Btn>}
            </div>
          </div>
        ))}
      </div>
      {editIdx !== null && editSlot && (
        <Modal title="Edit Period Slot" onClose={() => { setEditIdx(null); setEditSlot(null); }} width={400}>
          <Input label="Label" value={editSlot.label} onChange={(v) => setEditSlot((p) => ({ ...p, label: v }))} />
          <Select label="Type" value={editSlot.slotType} onChange={(v) => setEditSlot((p) => ({ ...p, slotType: v }))} options={typeOptions} />
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: "0 12px" }}>
            <Input label="Start" type="time" value={editSlot.startTime} onChange={(v) => setEditSlot((p) => ({ ...p, startTime: v }))} />
            <Input label="End" type="time" value={editSlot.endTime} onChange={(v) => setEditSlot((p) => ({ ...p, endTime: v }))} />
            <Field label="Mins"><input type="number" value={editSlot.durationMins} onChange={(e) => setEditSlot((p) => ({ ...p, durationMins: +e.target.value }))} style={css.input} /></Field>
          </div>
          <div style={{ display: "flex", gap: 10 }}><Btn onClick={saveSlot}>Save</Btn><Btn onClick={() => { setEditIdx(null); setEditSlot(null); }} variant="ghost">Cancel</Btn></div>
        </Modal>
      )}
    </div>
  );
}

export function RulesPage({ schedulingRules, setSchedulingRules, classTeacherPreferences, setClassTeacherPreferences, subjects, periodSlots, workingDays, notify, helpers, ui }) {
  const { T, css, Btn, EmptyState, Modal, Input, Select, Field } = ui;
  const { getSlotMeta } = helpers;
  const { isMobile } = useBreakpoint();
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ subjectId: "", enableExcludeSlot: true, enableExcludeDay: false, isActive: true, note: "", slotTargets: [], dayTargets: [] });
  const { firstMorning, firstAfterLunch, lastLesson, lessonSlots } = useMemo(() => getSlotMeta(periodSlots), [periodSlots, getSlotMeta]);
  const ruleTypeOpts = [
    { value: "EXCLUDE_SLOT", label: "Excluded Slot Set" },
    { value: "EXCLUDE_DAY", label: "Exclude Day" },
  ];

  const ruleColors = { NOT_FIRST_MORNING: T.warning, NOT_FIRST_AFTER_LUNCH: T.info, BOTH_BOUNDARY: T.gold, EXCLUDE_SLOT: T.danger, EXCLUDE_DAY: "#8b5cf6" };

  const ruleDesc = (rule) => {
    const slotPresetLabel = {
      FIRST_MORNING: `Slot ${firstMorning} (first morning)`,
      FIRST_AFTER_LUNCH: firstAfterLunch ? `Slot ${firstAfterLunch} (first after lunch)` : "First after lunch (not available)",
      LAST_LESSON: `Slot ${lastLesson} (last lesson)`,
      FIRST_MORNING_AND_FIRST_AFTER_LUNCH: firstAfterLunch ? `Slot ${firstMorning} + Slot ${firstAfterLunch}` : `Slot ${firstMorning}`,
      FIRST_MORNING_AND_LAST_LESSON: `Slot ${firstMorning} + Slot ${lastLesson}`,
      FIRST_AFTER_LUNCH_AND_LAST_LESSON: firstAfterLunch ? `Slot ${firstAfterLunch} + Slot ${lastLesson}` : `Slot ${lastLesson}`,
      FIRST_MORNING_AND_FIRST_AFTER_LUNCH_AND_LAST_LESSON: firstAfterLunch ? `Slot ${firstMorning} + Slot ${firstAfterLunch} + Slot ${lastLesson}` : `Slot ${firstMorning} + Slot ${lastLesson}`,
    };
    const slotTargetLabel = {
      FIRST_MORNING: "First morning",
      FIRST_AFTER_LUNCH: "First after lunch",
      LAST_LESSON: "Last lesson",
    };
    switch (rule.ruleType) {
      case "NOT_FIRST_MORNING": return `Cannot be placed in slot ${firstMorning} (first morning)`;
      case "NOT_FIRST_AFTER_LUNCH": return firstAfterLunch ? `Cannot be placed in slot ${firstAfterLunch} (first after lunch)` : "No lunch break found";
      case "BOTH_BOUNDARY": {
        const p = [`Slot ${firstMorning} (first morning)`];
        if (firstAfterLunch) p.push(`Slot ${firstAfterLunch} (first after lunch)`);
        p.push(`Slot ${lastLesson} (last lesson)`);
        return `Excluded from: ${p.join(", ")}`;
      }
      case "EXCLUDE_SLOT":
        if (Array.isArray(rule.slotTargets) && rule.slotTargets.length > 0) {
          return `Excluded from: ${rule.slotTargets.map((s) => slotTargetLabel[s] || s).join(", ")}`;
        }
        if (rule.slotPreset) return `Excluded from: ${slotPresetLabel[rule.slotPreset] || rule.slotPreset}`;
        return rule.slotNumber ? `Excluded from slot number ${rule.slotNumber}` : "No slot specified";
      case "EXCLUDE_DAY":
        if (Array.isArray(rule.dayOfWeekList) && rule.dayOfWeekList.length > 0) return `Not scheduled on: ${rule.dayOfWeekList.join(", ")}`;
        return rule.dayOfWeek ? `Not scheduled on ${rule.dayOfWeek}` : "No day specified";
      default: return "";
    }
  };

  const suggested = [];
  const openCombinedPreferenceModal = (subjectId) => {
    const existingSlot = schedulingRules.find((r) => r.subjectId === subjectId && r.ruleType === "EXCLUDE_SLOT");
    const existingDay = schedulingRules.find((r) => r.subjectId === subjectId && r.ruleType === "EXCLUDE_DAY");
    setForm({
      subjectId: subjectId || subjects[0]?.id || "",
      enableExcludeSlot: Boolean(existingSlot),
      enableExcludeDay: Boolean(existingDay),
      isActive: (existingSlot?.isActive ?? existingDay?.isActive) !== false,
      note: existingSlot?.note || existingDay?.note || "",
      slotTargets: Array.isArray(existingSlot?.slotTargets)
        ? existingSlot.slotTargets
        : existingSlot?.slotPreset
          ? existingSlot.slotPreset.split("_AND_")
          : [],
      dayTargets: Array.isArray(existingDay?.dayOfWeekList)
        ? existingDay.dayOfWeekList
        : existingDay?.dayOfWeek
          ? [existingDay.dayOfWeek]
          : [],
    });
    setModal(existingSlot || existingDay ? "edit" : "add");
  };
  const addRule = () => {
    if (!form.subjectId) return;
    if (!form.enableExcludeSlot && !form.enableExcludeDay) { notify("Select at least one preference type", "warning"); return; }
    if (form.enableExcludeSlot && (!Array.isArray(form.slotTargets) || form.slotTargets.length === 0)) { notify("Select at least one slot", "warning"); return; }
    if (form.enableExcludeDay && (!Array.isArray(form.dayTargets) || form.dayTargets.length === 0)) { notify("Select at least one day", "warning"); return; }
    setSchedulingRules((prev) => {
      let next = [...prev];
      const upsert = (ruleType, payload) => {
        const idx = next.findIndex((r) => r.subjectId === form.subjectId && r.ruleType === ruleType);
        if (idx >= 0) next[idx] = { ...next[idx], ...payload, ruleType, subjectId: form.subjectId };
        else next.push({ id: `r${Date.now()}-${ruleType}`, subjectId: form.subjectId, ruleType, ...payload });
      };
      const remove = (ruleType) => {
        next = next.filter((r) => !(r.subjectId === form.subjectId && r.ruleType === ruleType));
      };
      if (form.enableExcludeSlot) upsert("EXCLUDE_SLOT", { isActive: form.isActive, note: form.note, slotTargets: form.slotTargets, slotPreset: undefined, dayOfWeek: undefined });
      else remove("EXCLUDE_SLOT");
      if (form.enableExcludeDay) upsert("EXCLUDE_DAY", { isActive: form.isActive, note: form.note, dayOfWeekList: form.dayTargets, dayOfWeek: undefined, slotPreset: undefined });
      else remove("EXCLUDE_DAY");
      return next;
    });
    notify("Preference updated");
    setModal(null);
  };
  const quickAdd = () => {};
  const toggleRule = (id) => setSchedulingRules((p) => p.map((r) => r.id === id ? { ...r, isActive: !r.isActive } : r));
  const deleteRule = (id) => { setSchedulingRules((p) => p.filter((r) => r.id !== id)); notify("Rule removed"); };
  const activeCount = schedulingRules.filter((r) => r.isActive).length;
  const classTeacherPrefs = classTeacherPreferences || { enabled: false, ctFirstPeriodDays: [], dailyPrimaryMinPeriods: 0, schedulingMode: "STRICT" };
  const classTeacherRulesEnabled = classTeacherPrefs.enabled !== false;
  const selectedCtDays = Array.isArray(classTeacherPrefs.ctFirstPeriodDays) ? classTeacherPrefs.ctFirstPeriodDays : [];
  const grouped = useMemo(() => { const m = new Map(); schedulingRules.forEach((r) => { if (!m.has(r.subjectId)) m.set(r.subjectId, []); m.get(r.subjectId).push(r); }); return m; }, [schedulingRules]);

  return (
    <div style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 0, marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}><h2 style={{ margin: 0, fontSize: isMobile ? 17 : 20, fontWeight: 700, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}><UiIcon name="preferences" size={18} stroke={T.text} />Placement Preferences<span style={{ ...css.badge(T.gold), fontSize: 12 }}>{activeCount} active</span></h2><p style={{ margin: "4px 0 0", fontSize: 12, color: T.textSoft }}>These are applied automatically when creating timetables</p></div>
        <Btn onClick={() => openCombinedPreferenceModal(subjects[0]?.id || "")} size="sm" fullWidth={isMobile}>+ Add Preference</Btn>
      </div>

      <div style={{ ...css.card, marginBottom: 18, background: T.brand + "08", border: `1px solid ${T.brand + "25"}` }}>
        <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: T.brand }}>Based on your period timings</h4>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[{ label: "First morning slot", value: firstMorning ? `Slot ${firstMorning} (${periodSlots.find((s) => s.slotNumber === firstMorning)?.startTime})` : "—", color: T.warning }, { label: "First after lunch", value: firstAfterLunch ? `Slot ${firstAfterLunch} (${periodSlots.find((s) => s.slotNumber === firstAfterLunch)?.startTime})` : "No lunch break", color: T.info }, { label: "Last lesson slot", value: lastLesson ? `Slot ${lastLesson} (${periodSlots.find((s) => s.slotNumber === lastLesson)?.endTime})` : "—", color: T.success }].map((item) => (
            <div key={item.label} style={{ flex: "1 1 160px", padding: "10px 14px", background: item.color + "12", borderRadius: 8, border: `1px solid ${item.color + "30"}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: item.color, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{item.value}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: T.textSoft, margin: "10px 0 0" }}>If you change your period structure or lunch time, these values update automatically.</p>
      </div>

      <div style={{ ...css.card, marginBottom: 18, border: `1px solid ${T.info + "30"}`, background: T.info + "08" }}>
        <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: T.info }}>Class Teacher Rules</h4>
        <p style={{ fontSize: 12, color: T.textMid, margin: "0 0 12px" }}>Apply homeroom-based placement for class teachers.</p>
        <Field label="">
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={classTeacherPrefs.enabled !== false}
              onChange={(e) => setClassTeacherPreferences((p) => ({ ...(p || {}), enabled: e.target.checked }))}
              style={{ width: 18, height: 18, cursor: "pointer" }}
            />
            <span style={{ fontSize: 14, color: T.textMid, fontWeight: 600 }}>Enable class teacher placement rules</span>
          </label>
        </Field>
        <Field label="First Period Priority Days">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {workingDays.map((day) => {
              const checked = selectedCtDays.includes(day);
              return (
                <button
                  key={day}
                  onClick={() => {
                    if (!classTeacherRulesEnabled) return;
                    setClassTeacherPreferences((p) => {
                      const current = Array.isArray(p?.ctFirstPeriodDays) ? p.ctFirstPeriodDays : [];
                      const next = checked ? current.filter((d) => d !== day) : [...current, day];
                      return { ...(p || {}), ctFirstPeriodDays: next };
                    });
                  }}
                  disabled={!classTeacherRulesEnabled}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: `1px solid ${checked ? T.info : T.surfaceBorder}`,
                    background: checked ? T.info + "12" : T.surface,
                    color: checked ? T.info : T.textMid,
                    opacity: classTeacherRulesEnabled ? 1 : 0.6,
                    cursor: classTeacherRulesEnabled ? "pointer" : "not-allowed",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </Field>
        <p style={{ fontSize: 11, color: T.textSoft, margin: "8px 0 0" }}>
          Selected days apply first-period class teacher priority for the assigned class teacher class.
        </p>
      </div>


      {schedulingRules.length === 0
        ? <EmptyState iconKey="preferences" title="No preferences added" desc="Add preferences to control when subjects are placed." action={<Btn onClick={() => openCombinedPreferenceModal(subjects[0]?.id || "")}>Add First Preference</Btn>} />
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[...grouped.entries()].map(([subjectId, rules]) => {
              const sub = subjects.find((s) => s.id === subjectId);
              if (!sub) return null;
              return (
                <div key={subjectId} style={css.card}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}><div style={{ width: 9, height: 9, borderRadius: "50%", background: sub.colorHex || T.CORE }} /><span style={{ fontWeight: 700, fontSize: 14 }}>{sub.name}</span><span style={css.badge(T[sub.category] || T.CORE)}>{sub.category.replace(/_/g, " ")}</span></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {rules.map((rule) => (
                      <div key={rule.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 14px", background: rule.isActive ? (ruleColors[rule.ruleType] + "0d") : T.surfaceBorder + "40", borderRadius: 8, border: `1px solid ${rule.isActive ? ruleColors[rule.ruleType] + "35" : T.surfaceBorder}`, opacity: rule.isActive ? 1 : 0.6, flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}><span style={css.badge(ruleColors[rule.ruleType] || T.brand)}>{ruleTypeOpts.find((o) => o.value === rule.ruleType)?.label || rule.ruleType}</span>{!rule.isActive && <span style={css.badge(T.textSoft)}>Inactive</span>}</div>
                          <div style={{ fontSize: 12, color: T.textMid }}>{ruleDesc(rule)}</div>
                          {rule.note && <div style={{ fontSize: 11, color: T.textSoft, marginTop: 3, fontStyle: "italic" }}>{rule.note}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", width: isMobile ? "100%" : undefined, justifyContent: isMobile ? "flex-end" : undefined }}>
                          <button onClick={() => toggleRule(rule.id)} style={{ background: rule.isActive ? T.success + "18" : T.surfaceAlt, border: `1px solid ${rule.isActive ? T.success + "40" : T.surfaceBorder}`, borderRadius: 6, cursor: "pointer", padding: "4px 10px", fontSize: 11, fontWeight: 700, color: rule.isActive ? T.success : T.textSoft }}>{rule.isActive ? "ON" : "OFF"}</button>
                          <Btn onClick={() => openCombinedPreferenceModal(rule.subjectId)} variant="ghost" size="sm">Edit</Btn>
                          <Btn onClick={() => deleteRule(rule.id)} variant="ghost" size="sm" style={{ color: T.danger }}><UiIcon name="close" size={14} stroke="currentColor" /></Btn>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {modal && (
        <Modal title={modal === "add" ? "Add Placement Preference" : "Edit Placement Preference"} onClose={() => setModal(null)} width={520}>
          <Select label="Subject" value={form.subjectId} onChange={(v) => setForm((p) => ({ ...p, subjectId: v }))} options={subjects.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))} placeholder="Select subject" />
          <Field label="">
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={form.enableExcludeSlot !== false} onChange={(e) => setForm((p) => ({ ...p, enableExcludeSlot: e.target.checked }))} style={{ width: 18, height: 18, cursor: "pointer" }} />
              <span style={{ fontSize: 14, color: T.textMid, fontWeight: 600 }}>Exclude Slot Set</span>
            </label>
          </Field>
          {form.enableExcludeSlot && (
            <Field label="Excluded Slots">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[{ id: "FIRST_MORNING", label: "First morning" }, { id: "FIRST_AFTER_LUNCH", label: "First after lunch" }, { id: "LAST_LESSON", label: "Last lesson" }]
                  .filter((s) => firstAfterLunch || s.id !== "FIRST_AFTER_LUNCH")
                  .map((slot) => {
                    const selected = (form.slotTargets || []).includes(slot.id);
                    return (
                      <button key={slot.id} onClick={() => setForm((p) => ({ ...p, slotTargets: selected ? (p.slotTargets || []).filter((x) => x !== slot.id) : [...(p.slotTargets || []), slot.id] }))} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${selected ? T.info : T.surfaceBorder}`, background: selected ? T.info + "12" : T.surface, color: selected ? T.info : T.textMid, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                        {slot.label}
                      </button>
                    );
                  })}
              </div>
            </Field>
          )}
          <Field label="">
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={form.enableExcludeDay === true} onChange={(e) => setForm((p) => ({ ...p, enableExcludeDay: e.target.checked }))} style={{ width: 18, height: 18, cursor: "pointer" }} />
              <span style={{ fontSize: 14, color: T.textMid, fontWeight: 600 }}>Exclude Day</span>
            </label>
          </Field>
          {form.enableExcludeDay && (
            <Field label="Excluded Days">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {workingDays.map((day) => {
                  const selected = (form.dayTargets || []).includes(day);
                  return (
                    <button key={day} onClick={() => setForm((p) => ({ ...p, dayTargets: selected ? (p.dayTargets || []).filter((x) => x !== day) : [...(p.dayTargets || []), day] }))} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${selected ? T.warning : T.surfaceBorder}`, background: selected ? T.warning + "12" : T.surface, color: selected ? T.warning : T.textMid, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                      {day}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}
          <Input label="Note (optional)" value={form.note || ""} onChange={(v) => setForm((p) => ({ ...p, note: v }))} placeholder="e.g. PE should not be right after assembly" />
          <Field label=""><label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}><input type="checkbox" checked={form.isActive !== false} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} style={{ width: 18, height: 18, cursor: "pointer" }} /><span style={{ fontSize: 14, color: T.textMid, fontWeight: 500 }}>Preference is active</span></label></Field>
          <div style={{ display: "flex", gap: 10 }}><Btn onClick={addRule}>Save Preference</Btn><Btn onClick={() => setModal(null)} variant="ghost">Cancel</Btn></div>
        </Modal>
      )}
    </div>
  );
}

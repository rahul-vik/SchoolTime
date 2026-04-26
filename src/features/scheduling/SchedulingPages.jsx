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

export function RulesPage({ schedulingRules, setSchedulingRules, subjects, periodSlots, workingDays, notify, helpers, ui }) {
  const { T, css, Btn, EmptyState, Modal, Input, Select, Field } = ui;
  const { getSlotMeta } = helpers;
  const { isMobile } = useBreakpoint();
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ subjectId: "", ruleType: "BOTH_BOUNDARY", isActive: true, note: "", slotNumber: "", dayOfWeek: "" });
  const { firstMorning, firstAfterLunch, lastLesson, lessonSlots } = useMemo(() => getSlotMeta(periodSlots), [periodSlots, getSlotMeta]);

  const ruleTypeOpts = [
    { value: "NOT_FIRST_MORNING", label: "Not first morning period" },
    { value: "NOT_FIRST_AFTER_LUNCH", label: "Not first period after lunch" },
    { value: "BOTH_BOUNDARY", label: "Both boundaries (not first / first-after-lunch / last)" },
    { value: "EXCLUDE_SLOT", label: "Exclude a specific slot number" },
    { value: "EXCLUDE_DAY", label: "Exclude a specific day" },
  ];
  const ruleColors = { NOT_FIRST_MORNING: T.warning, NOT_FIRST_AFTER_LUNCH: T.info, BOTH_BOUNDARY: T.gold, EXCLUDE_SLOT: T.danger, EXCLUDE_DAY: "#8b5cf6" };

  const ruleDesc = (rule) => {
    switch (rule.ruleType) {
      case "NOT_FIRST_MORNING": return `Cannot be placed in slot ${firstMorning} (first morning)`;
      case "NOT_FIRST_AFTER_LUNCH": return firstAfterLunch ? `Cannot be placed in slot ${firstAfterLunch} (first after lunch)` : "No lunch break found";
      case "BOTH_BOUNDARY": {
        const p = [`Slot ${firstMorning} (first morning)`];
        if (firstAfterLunch) p.push(`Slot ${firstAfterLunch} (first after lunch)`);
        p.push(`Slot ${lastLesson} (last lesson)`);
        return `Excluded from: ${p.join(", ")}`;
      }
      case "EXCLUDE_SLOT": return rule.slotNumber ? `Excluded from slot number ${rule.slotNumber}` : "No slot specified";
      case "EXCLUDE_DAY": return rule.dayOfWeek ? `Not scheduled on ${rule.dayOfWeek}` : "No day specified";
      default: return "";
    }
  };

  const suggested = useMemo(() => subjects.filter((sub) => sub.category === "EXTRA_CURRICULAR" && !schedulingRules.some((r) => r.subjectId === sub.id && (r.ruleType === "BOTH_BOUNDARY" || r.ruleType === "NOT_FIRST_MORNING") && r.isActive)), [subjects, schedulingRules]);
  const addRule = () => {
    if (!form.subjectId || !form.ruleType) return;
    if (modal === "add" && schedulingRules.some((r) => r.subjectId === form.subjectId && r.ruleType === form.ruleType)) { notify("A rule of this type already exists for this subject", "warning"); return; }
    const nr = { id: `r${Date.now()}`, subjectId: form.subjectId, ruleType: form.ruleType, isActive: form.isActive, note: form.note };
    if (form.ruleType === "EXCLUDE_SLOT" && form.slotNumber) nr.slotNumber = Number(form.slotNumber);
    if (form.ruleType === "EXCLUDE_DAY" && form.dayOfWeek) nr.dayOfWeek = form.dayOfWeek;
    if (modal === "edit") { setSchedulingRules((p) => p.map((r) => r.id === form.id ? { ...r, ...nr, id: r.id } : r)); notify("Rule updated"); }
    else { setSchedulingRules((p) => [...p, nr]); notify("Rule added"); }
    setModal(null);
  };
  const quickAdd = (sub) => { setSchedulingRules((p) => [...p, { id: `r${Date.now()}`, subjectId: sub.id, ruleType: "BOTH_BOUNDARY", isActive: true, note: `${sub.name} should not be at period boundaries` }]); notify(`Boundary rule added for ${sub.name}`); };
  const toggleRule = (id) => setSchedulingRules((p) => p.map((r) => r.id === id ? { ...r, isActive: !r.isActive } : r));
  const deleteRule = (id) => { setSchedulingRules((p) => p.filter((r) => r.id !== id)); notify("Rule removed"); };
  const activeCount = schedulingRules.filter((r) => r.isActive).length;
  const grouped = useMemo(() => { const m = new Map(); schedulingRules.forEach((r) => { if (!m.has(r.subjectId)) m.set(r.subjectId, []); m.get(r.subjectId).push(r); }); return m; }, [schedulingRules]);

  return (
    <div style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 0, marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}><h2 style={{ margin: 0, fontSize: isMobile ? 17 : 20, fontWeight: 700, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}><UiIcon name="preferences" size={18} stroke={T.text} />Placement Preferences<span style={{ ...css.badge(T.gold), fontSize: 12 }}>{activeCount} active</span></h2><p style={{ margin: "4px 0 0", fontSize: 12, color: T.textSoft }}>These are applied automatically when creating timetables</p></div>
        <Btn onClick={() => { setForm({ subjectId: subjects[0]?.id || "", ruleType: "BOTH_BOUNDARY", isActive: true, note: "", slotNumber: "", dayOfWeek: "" }); setModal("add"); }} size="sm" fullWidth={isMobile}>+ Add Preference</Btn>
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

      {suggested.length > 0 && (
        <div style={{ ...css.card, marginBottom: 18, border: `1px solid ${T.warning + "40"}`, background: T.warning + "06" }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: T.warning }}>Suggested Preferences</h4>
          <p style={{ fontSize: 12, color: T.textMid, margin: "0 0 12px" }}>These extra-curricular subjects don't have a boundary rule yet:</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {suggested.map((sub) => (
              <div key={sub.id} style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 10 : 0, padding: "10px 14px", background: T.surface, borderRadius: 8, border: `1px solid ${T.surfaceBorder}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: sub.colorHex || T.EXTRA_CURRICULAR }} /><span style={{ fontWeight: 700, fontSize: 13 }}>{sub.name}</span><span style={{ ...css.badge(T.EXTRA_CURRICULAR), fontSize: 11 }}>Extra Curricular</span></div>
                <Btn onClick={() => quickAdd(sub)} variant="warning" size="sm" fullWidth={isMobile}>+ Add Boundary Preference</Btn>
              </div>
            ))}
          </div>
        </div>
      )}

      {schedulingRules.length === 0
        ? <EmptyState iconKey="preferences" title="No preferences added" desc="Add preferences to control when subjects are placed." action={<Btn onClick={() => { setForm({ subjectId: subjects[0]?.id || "", ruleType: "BOTH_BOUNDARY", isActive: true, note: "", slotNumber: "", dayOfWeek: "" }); setModal("add"); }}>Add First Preference</Btn>} />
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
                          <Btn onClick={() => { setForm({ ...rule, slotNumber: rule.slotNumber || "", dayOfWeek: rule.dayOfWeek || "" }); setModal("edit"); }} variant="ghost" size="sm">Edit</Btn>
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
          <Select label="Preference Type" value={form.ruleType} onChange={(v) => setForm((p) => ({ ...p, ruleType: v }))} options={ruleTypeOpts} />
          <div style={{ padding: "10px 14px", background: (ruleColors[form.ruleType] || T.brand) + "10", borderRadius: 8, marginBottom: 16, border: `1px solid ${(ruleColors[form.ruleType] || T.brand) + "30"}`, fontSize: 12, color: T.textMid }}>
            {form.ruleType === "NOT_FIRST_MORNING" && `Won't be placed in slot ${firstMorning} (${periodSlots.find((s) => s.slotNumber === firstMorning)?.startTime}).`}
            {form.ruleType === "NOT_FIRST_AFTER_LUNCH" && (firstAfterLunch ? `Won't be placed in slot ${firstAfterLunch} (first after lunch).` : "No lunch break detected.")}
            {form.ruleType === "BOTH_BOUNDARY" && `Best for PE, Art & Craft — prevents slot ${firstMorning}${firstAfterLunch ? `, ${firstAfterLunch}` : ""},${lastLesson}.`}
            {form.ruleType === "EXCLUDE_SLOT" && "Subject will never be placed in the slot you choose below."}
            {form.ruleType === "EXCLUDE_DAY" && "Subject will not be scheduled on the day you choose below."}
          </div>
          {form.ruleType === "EXCLUDE_SLOT" && <Select label="Excluded Slot" value={form.slotNumber || ""} onChange={(v) => setForm((p) => ({ ...p, slotNumber: v }))} options={lessonSlots.map((s) => ({ value: String(s.slotNumber), label: `Slot ${s.slotNumber} — ${s.label} (${s.startTime})` }))} placeholder="Select slot" />}
          {form.ruleType === "EXCLUDE_DAY" && <Select label="Excluded Day" value={form.dayOfWeek || ""} onChange={(v) => setForm((p) => ({ ...p, dayOfWeek: v }))} options={workingDays.map((d) => ({ value: d, label: d }))} placeholder="Select day" />}
          <Input label="Note (optional)" value={form.note || ""} onChange={(v) => setForm((p) => ({ ...p, note: v }))} placeholder="e.g. PE should not be right after assembly" />
          <Field label=""><label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}><input type="checkbox" checked={form.isActive !== false} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} style={{ width: 18, height: 18, cursor: "pointer" }} /><span style={{ fontSize: 14, color: T.textMid, fontWeight: 500 }}>Preference is active</span></label></Field>
          <div style={{ display: "flex", gap: 10 }}><Btn onClick={addRule}>Save Preference</Btn><Btn onClick={() => setModal(null)} variant="ghost">Cancel</Btn></div>
        </Modal>
      )}
    </div>
  );
}

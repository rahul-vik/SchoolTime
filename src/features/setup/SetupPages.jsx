import { useEffect, useState } from "react";
import { UiIcon, useBreakpoint } from "../shared/uiPrimitives";

export function SetupPage({ school, setSchool, mediums, setMediums, workingDays, setWorkingDays, notify, ui }) {
  const { T, css, Btn, Input, Select } = ui;
  const { isMobile } = useBreakpoint();
  const [form, setForm] = useState(school);
  const [saved, setSaved] = useState(false);
  const [newMedium, setNewMedium] = useState({ name: "", code: "" });
  const allDays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  const previewLogo = form.logoDataUrl || "";

  useEffect(() => {
    setForm(school);
  }, [school]);

  const save = () => { setSchool(form); setSaved(true); setTimeout(() => setSaved(false), 2000); notify("School settings saved"); };
  const toggleDay = (d) => {
    if (workingDays.includes(d) && workingDays.length === 1) { notify("At least one working day is required", "warning"); return; }
    setWorkingDays((p) => p.includes(d) ? p.filter((x) => x !== d) : [...p, d]);
  };
  const addMedium = () => {
    if (!newMedium.name || !newMedium.code) return;
    if (mediums.some((m) => m.code === newMedium.code.toUpperCase())) { notify("A medium with this code already exists", "warning"); return; }
    setMediums((p) => [...p, { id: `m${Date.now()}`, name: newMedium.name, code: newMedium.code.toUpperCase(), isPrimary: p.length === 0 }]);
    setNewMedium({ name: "", code: "" });
    notify("Medium added");
  };
  const setPrimary = (id) => setMediums((p) => p.map((m) => ({ ...m, isPrimary: m.id === id })));
  const onLogoFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify("Please select an image file", "warning");
      return;
    }
    if (file.size > 1024 * 1024) {
      notify("Logo must be under 1 MB", "warning");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setForm((p) => ({ ...p, logoDataUrl: reader.result }));
      notify("Logo added");
    };
    reader.onerror = () => notify("Could not read logo file", "danger");
    reader.readAsDataURL(file);
  };
  const removeLogo = () => {
    setForm((p) => ({ ...p, logoDataUrl: "" }));
    notify("Logo removed");
  };

  const formGridCols = isMobile ? "1fr" : "1fr 1fr";

  return (
    <div style={{ width: "100%", maxWidth: 680, minWidth: 0, boxSizing: "border-box" }}>
      <h2 style={{ margin: "0 0 16px", fontSize: isMobile ? 18 : 20, fontWeight: 700 }}>School Setup</h2>
      <div style={{ ...css.card, padding: isMobile ? 16 : 20 }}>
        <h3 style={{ margin: "0 0 18px", fontSize: 15, fontWeight: 700 }}>School Information</h3>
        <div style={{ display: "grid", gridTemplateColumns: formGridCols, gap: isMobile ? "0 12px" : "0 18px" }}>
          <Input label="School Name" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} required />
          <Input label="School Code" value={form.code} onChange={(v) => setForm((p) => ({ ...p, code: v.toUpperCase() }))} help="Short unique identifier" />
          <Input label="Academic Year" value={form.academicYear} onChange={(v) => setForm((p) => ({ ...p, academicYear: v }))} placeholder="2024-25" />
          <Select label="Time Zone" value={form.timeZone} onChange={(v) => setForm((p) => ({ ...p, timeZone: v }))} options={[{ value: "Asia/Kolkata", label: "IST (Asia/Kolkata)" }, { value: "UTC", label: "UTC" }, { value: "America/New_York", label: "EST" }]} />
          <Input label="Year Start" type="date" value={form.yearStart} onChange={(v) => setForm((p) => ({ ...p, yearStart: v }))} />
          <Input label="Year End" type="date" value={form.yearEnd} onChange={(v) => setForm((p) => ({ ...p, yearEnd: v }))} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.textMid, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>School Logo</label>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
            <div style={{ width: 52, height: 52, borderRadius: 10, border: `1px solid ${T.surfaceBorder}`, background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
              {previewLogo ? <img src={previewLogo} alt="School logo preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <UiIcon name="school" size={18} stroke={T.textSoft} />}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
              <label style={{ ...css.btn("ghost", "sm"), margin: 0, flex: isMobile ? 1 : undefined, justifyContent: "center" }}>
                Upload Logo
                <input type="file" accept="image/*" onChange={onLogoFileChange} style={{ display: "none" }} />
              </label>
              {previewLogo && <Btn variant="ghost" size="sm" onClick={removeLogo} style={{ color: T.danger }}>Remove</Btn>}
            </div>
          </div>
          <p style={{ fontSize: 11, color: T.textSoft, margin: 0 }}>Use PNG or JPG. Recommended square image under 1 MB.</p>
        </div>
        <Btn onClick={save} fullWidth>{saved ? <><UiIcon name="check" size={14} stroke="currentColor" />Saved</> : "Save Settings"}</Btn>
      </div>

      <div style={{ ...css.card, marginTop: 16, padding: isMobile ? 16 : 20 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Working Days</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {allDays.map((d) => (
            <button key={d} onClick={() => toggleDay(d)} style={{ padding: "8px 14px", borderRadius: 8, border: `2px solid ${workingDays.includes(d) ? T.brand : T.surfaceBorder}`, background: workingDays.includes(d) ? T.brand : "transparent", color: workingDays.includes(d) ? "#fff" : T.textMid, cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "all 0.15s" }}>
              {d.slice(0, 3)}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: T.textSoft, marginTop: 10, marginBottom: 0 }}>{workingDays.length} working days selected</p>
      </div>

      <div style={{ ...css.card, marginTop: 16, padding: isMobile ? 16 : 20 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Mediums of Instruction</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {mediums.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 10 : 0, padding: "10px 14px", background: m.isPrimary ? T.brand + "08" : T.surfaceAlt, borderRadius: 8, border: `1px solid ${m.isPrimary ? T.brand + "30" : T.surfaceBorder}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{m.name}</span>
                <span style={css.badge(T.info)}>{m.code}</span>
                {m.isPrimary && <span style={{ ...css.badge(T.success), gap: 4 }}><UiIcon name="check" size={11} stroke="currentColor" />Default</span>}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", width: isMobile ? "100%" : undefined }}>
                {!m.isPrimary && <Btn onClick={() => setPrimary(m.id)} variant="ghost" size="sm" style={{ color: T.brand, flex: isMobile ? 1 : undefined }}>Set as Default</Btn>}
                {!m.isPrimary && <Btn onClick={() => { if (mediums.length <= 1) { notify("Cannot remove the only medium", "warning"); return; } setMediums((p) => p.filter((x) => x.id !== m.id)); notify("Medium removed"); }} variant="ghost" size="sm" style={{ color: T.danger, flex: isMobile ? 1 : undefined }}>Remove</Btn>}
                {m.isPrimary && <span style={{ fontSize: 11, color: T.textSoft }}>Used by default</span>}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center" }}>
          <input placeholder="Medium name" value={newMedium.name} onChange={(e) => setNewMedium((p) => ({ ...p, name: e.target.value }))} style={{ ...css.input, flex: 1, minWidth: 0, width: "100%" }} />
          <div style={{ display: "flex", gap: 8, alignItems: "stretch", flexDirection: isMobile ? "column" : "row" }}>
            <input placeholder="Code" value={newMedium.code} onChange={(e) => setNewMedium((p) => ({ ...p, code: e.target.value.toUpperCase() }))} style={{ ...css.input, width: isMobile ? "100%" : 80, minWidth: 0 }} />
            <Btn onClick={addMedium} fullWidth={isMobile}>Add</Btn>
          </div>
        </div>
        <p style={{ fontSize: 11, color: T.textSoft, margin: "8px 0 0" }}>The default medium is used first when adding classes. You can change it for each class.</p>
      </div>
    </div>
  );
}

export function StandardsPage({ standards, setStandards, divisions, setDivisions, mediums, notify, helpers, ui }) {
  const { T, css, Btn, Input, Select, Modal, EmptyState } = ui;
  const { parseDivisionInput, DivisionPill } = helpers;
  const { isMobile } = useBreakpoint();

  const [parserInput, setParserInput] = useState("4 A-C\n5 A-B\n6 A\n7 A\n8 A");
  const [parseResult, setParseResult] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [addDivModal, setAddDivModal] = useState(null);
  const [newDiv, setNewDiv] = useState({ name: "", mediumId: "" });
  const getPrimary = () => mediums.find((m) => m.isPrimary) || mediums[0];

  const applyParsed = () => {
    if (!parseResult?.data) return;
    const pm = getPrimary();
    const newStds = [];
    const newDivs = [];
    parseResult.data.forEach((item, i) => {
      const ex = standards.find((s) => s.name === item.standardName);
      const std = ex || { id: `s${Date.now()}-${i}`, name: item.standardName, sortOrder: standards.length + i + 1 };
      if (!ex) newStds.push(std);
      item.divisions.forEach((dn, j) => newDivs.push({ id: `d${Date.now()}-${i}-${j}`, standardId: std.id, mediumId: pm?.id || "m1", name: dn }));
    });
    setStandards((p) => [...p, ...newStds]);
    setDivisions((p) => [...p, ...newDivs]);
    setShowImport(false);
    notify(`Added ${newStds.length} standards, ${newDivs.length} divisions`);
  };

  const addDivision = () => {
    if (!newDiv.name || !addDivModal) return;
    const pm = getPrimary();
    setDivisions((p) => [...p, { id: `d${Date.now()}`, standardId: addDivModal, mediumId: newDiv.mediumId || pm?.id, name: newDiv.name.toUpperCase() }]);
    setNewDiv({ name: "", mediumId: "" });
    setAddDivModal(null);
    notify("Division added");
  };

  const stdGrid = isMobile ? "1fr" : "repeat(auto-fill, minmax(270px, 1fr))";

  return (
    <div style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 0, marginBottom: 18 }}>
        <div style={{ minWidth: 0 }}><h2 style={{ margin: 0, fontSize: isMobile ? 18 : 20, fontWeight: 700 }}>Standards & Divisions</h2><p style={{ margin: "3px 0 0", fontSize: 12, color: T.textSoft }}>{standards.length} standards · {divisions.length} divisions</p></div>
        <Btn onClick={() => setShowImport(true)} size="sm" fullWidth={isMobile}>+ Quick Add</Btn>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: stdGrid, gap: 14 }}>
        {[...standards].sort((a, b) => a.sortOrder - b.sortOrder).map((std) => {
          const divs = divisions.filter((d) => d.standardId === std.id);
          const mgMap = {};
          divs.forEach((d) => { const m = mediums.find((x) => x.id === d.mediumId); const k = m?.name || "?"; mgMap[k] = (mgMap[k] || 0) + 1; });
          return (
            <div key={std.id} style={css.card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: T.brand, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 13 }}>S{std.name}</div>
                  <div><div style={{ fontWeight: 700, fontSize: 14 }}>Standard {std.name}</div><div style={{ fontSize: 11, color: T.textSoft }}>{divs.length} division{divs.length !== 1 ? "s" : ""}</div></div>
                </div>
                <Btn onClick={() => { setStandards((p) => p.filter((s) => s.id !== std.id)); setDivisions((p) => p.filter((d) => d.standardId !== std.id)); notify("Standard removed"); }} variant="ghost" size="sm" style={{ color: T.danger }}><UiIcon name="close" size={14} stroke="currentColor" /></Btn>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {divs.map((div) => (
                  <DivisionPill key={div.id} div={div} mediums={mediums}
                    onRemove={() => setDivisions((p) => p.filter((d) => d.id !== div.id))}
                    onMediumChange={(mid) => setDivisions((p) => p.map((d) => d.id === div.id ? { ...d, mediumId: mid } : d))} />
                ))}
                <button onClick={() => setAddDivModal(std.id)} style={{ padding: "5px 10px", borderRadius: 20, border: `1px dashed ${T.surfaceBorder}`, background: "none", cursor: "pointer", fontSize: 12, color: T.textSoft }}>+ Add</button>
              </div>
              {Object.keys(mgMap).length > 1 && (
                <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {Object.entries(mgMap).map(([name, count]) => <span key={name} style={css.badge(T.info)}>{count} {name}</span>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {standards.length === 0 && <EmptyState iconKey="school" title="No standards yet" desc={'Use Quick Add. Try "4 A-C" format.'} action={<Btn onClick={() => setShowImport(true)}>Quick Add</Btn>} />}

      {showImport && (
        <Modal title="Quick Add — Standards & Divisions" onClose={() => setShowImport(false)} width={540}>
          <div style={{ background: T.surfaceAlt, padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 12, color: T.textMid, fontFamily: "monospace", lineHeight: 1.8 }}>
            <div>4 A-C → Standard 4, divisions A, B, C</div>
            <div>5 A-B → Standard 5, divisions A, B</div>
            <div>7 &nbsp;&nbsp;&nbsp;→ Standard 7, division A (default)</div>
          </div>
          <div style={{ padding: "8px 12px", background: T.brand + "08", borderRadius: 8, marginBottom: 12, fontSize: 12, color: T.textMid }}>Default medium: <strong>{getPrimary()?.name || "None"}</strong>. You can change it for each division later.</div>
          <textarea value={parserInput} onChange={(e) => setParserInput(e.target.value)} rows={7} style={{ ...css.input, fontFamily: "monospace", resize: "vertical" }} />
          {parseResult && (
            <div style={{ marginTop: 10, padding: 12, background: parseResult.success ? T.success + "14" : T.danger + "14", borderRadius: 8 }}>
              {parseResult.success
                ? <div><p style={{ margin: "0 0 6px", fontSize: 13, color: T.success, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }}><UiIcon name="check" size={12} stroke={T.success} />Preview</p>{parseResult.data.map((item, i) => <div key={i} style={{ fontSize: 12, color: T.textMid }}>Std {item.standardName}: {item.divisions.join(", ")}</div>)}</div>
                : <p style={{ margin: 0, fontSize: 13, color: T.danger }}>{parseResult.errors[0]?.message}</p>}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <Btn onClick={() => { if (!parserInput.trim()) { notify("Enter definitions first", "warning"); return; } setParseResult(parseDivisionInput(parserInput)); }} variant="ghost">Preview</Btn>
            {parseResult?.success && <Btn onClick={applyParsed}>Apply Import</Btn>}
          </div>
        </Modal>
      )}
      {addDivModal && (
        <Modal title="Add Division" onClose={() => setAddDivModal(null)} width={360}>
          <Input label="Division Name" value={newDiv.name} onChange={(v) => setNewDiv((p) => ({ ...p, name: v.toUpperCase() }))} placeholder="A" required />
          <Select label="Medium" value={newDiv.mediumId || getPrimary()?.id || ""} onChange={(v) => setNewDiv((p) => ({ ...p, mediumId: v }))} options={mediums.map((m) => ({ value: m.id, label: `${m.name}${m.isPrimary ? " (Default)" : ""}` }))} />
          <Btn onClick={addDivision} fullWidth>Add Division</Btn>
        </Modal>
      )}
    </div>
  );
}

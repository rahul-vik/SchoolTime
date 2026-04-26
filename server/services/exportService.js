import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

const SHORT_DAY = {
  MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu", FRIDAY: "Fri", SATURDAY: "Sat", SUNDAY: "Sun",
};

/** Uppercase 3-letter day labels to match in-app / reference timetable.png */
function excelDayHeader(day) {
  const s = SHORT_DAY[day] || (typeof day === "string" ? day.slice(0, 3) : String(day));
  return String(s).toUpperCase();
}

/** Data column for slot index when using gutter columns (col1=day, col2=gap, then slot,gap,...) */
function excelSlotDataCol(slotIndex0) {
  return 3 + 2 * slotIndex0;
}

/** Gutter column immediately before slot `slotIndex0` (between day and P1 when i=0). */
function excelGutterBeforeSlot(slotIndex0) {
  return 2 + 2 * slotIndex0;
}

function sanitizeSheetName(name) {
  return name.replace(/[:\\/?*\[\]]/g, "").slice(0, 31) || "Sheet";
}

function uniqueWorksheetName(workbook, base) {
  let candidate = sanitizeSheetName(base);
  let n = 2;
  while (workbook.getWorksheet(candidate)) {
    const suffix = ` ${n}`;
    const root = sanitizeSheetName(base).slice(0, Math.max(1, 31 - suffix.length));
    candidate = (root + suffix).slice(0, 31);
    n += 1;
  }
  return candidate;
}

function pdfToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

const CATEGORY_HEX = {
  LANGUAGE: "#7c3aed",
  CORE: "#0369a1",
  NON_CORE: "#0891b2",
  EXTRA_CURRICULAR: "#d97706",
};

const LEGEND_ITEMS = [
  ["LANGUAGE", CATEGORY_HEX.LANGUAGE],
  ["CORE", CATEGORY_HEX.CORE],
  ["NON CORE", CATEGORY_HEX.NON_CORE],
  ["EXTRA CURRICULAR", CATEGORY_HEX.EXTRA_CURRICULAR],
];

function hexToRgb(hex) {
  const h = String(hex || "#6b7280").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  return {
    r: parseInt(full.slice(0, 2), 16) || 100,
    g: parseInt(full.slice(2, 4), 16) || 100,
    b: parseInt(full.slice(4, 6), 16) || 100,
  };
}

function rgbToHex(r, g, b) {
  const x = (n) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, "0");
  return `#${x(r)}${x(g)}${x(b)}`;
}

function tintFromAccent(hex, whiteBlend = 0.9) {
  const { r, g, b } = hexToRgb(hex);
  const t = whiteBlend;
  return rgbToHex(Math.round(r * (1 - t) + 255 * t), Math.round(g * (1 - t) + 255 * t), Math.round(b * (1 - t) + 255 * t));
}

function borderTint(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(Math.round(r * 0.55 + 255 * 0.45), Math.round(g * 0.55 + 255 * 0.45), Math.round(b * 0.55 + 255 * 0.45));
}

function accentForSubject(sub) {
  if (!sub) return CATEGORY_HEX.CORE;
  if (sub.colorHex) return sub.colorHex;
  return CATEGORY_HEX[sub.category] || CATEGORY_HEX.CORE;
}

function periodHeaderLine1(slot) {
  if (slot.slotType === "BREAK" || slot.slotType === "LUNCH") return slot.label || (slot.slotType === "BREAK" ? "Break" : "Lunch");
  const lab = String(slot.label || "");
  return lab.replace(/Period\s+/i, "P").replace(/^period/i, "P") || `P${slot.slotNumber}`;
}

/** Full period grid (lessons + break + lunch) for visual PDF/Excel exports. */
function buildScheduleContext(state, entries) {
  const workingDays = state.workingDays || [];
  const allSlots = [...(state.periodSlots || [])].sort((a, b) => a.slotNumber - b.slotNumber);
  const subjectsById = new Map((state.subjects || []).map((s) => [s.id, s]));
  const teachersById = new Map((state.teachers || []).map((t) => [t.id, t]));
  const divisionsById = new Map((state.divisions || []).map((d) => [d.id, d]));
  const standardsById = new Map((state.standards || []).map((s) => [s.id, s]));
  return { workingDays, allSlots, subjectsById, teachersById, divisionsById, standardsById, entries };
}

function findScheduleEntry(schedCtx, viewMode, rowId, day, slotNumber) {
  const { entries } = schedCtx;
  if (viewMode === "division") {
    return entries.find((e) => e.divisionId === rowId && e.dayOfWeek === day && e.slotNumber === slotNumber) || null;
  }
  return entries.find((e) => e.teacherId === rowId && e.dayOfWeek === day && e.slotNumber === slotNumber) || null;
}

function teacherShortLine(t) {
  if (!t) return "";
  const fn = (t.firstName || "").trim();
  const ln = (t.lastName || "").trim();
  if (!ln && !fn) return t.employeeCode || "";
  const initial = fn ? `${fn.charAt(0)}.` : "";
  return `${initial} ${ln}`.trim();
}

function drawPdfLegend(doc, margin, top, pageW) {
  doc.font("Helvetica").fontSize(7.5);
  const lineH = 16;
  let right = pageW - margin;
  for (let i = LEGEND_ITEMS.length - 1; i >= 0; i -= 1) {
    const [label, color] = LEGEND_ITEMS[i];
    const text = label.replace(/_/g, " ");
    const tw = doc.widthOfString(text);
    const blockW = tw + 18;
    right -= blockW;
    const x = right;
    doc.save();
    doc.circle(x + 3.2, top + lineH / 2, 2.6).fill(color);
    doc.fillColor("#4a4a6a").text(text, x + 9, top + 1, { width: tw + 4, lineBreak: false });
    doc.restore();
    right -= 5;
  }
}

function drawPdfScheduleCell(doc, x, y, w, h, entry, schedCtx, viewMode) {
  const r = 4;
  const { subjectsById, teachersById, divisionsById, standardsById } = schedCtx;
  const greyFill = "#f1f2f6";
  const greyBorder = "#e8eaf0";
  const textMid = "#4a4a6a";

  if (!entry) {
    doc.save();
    doc.roundedRect(x, y, w, h, r).fillColor(greyFill).fill();
    doc.roundedRect(x, y, w, h, r).strokeColor(greyBorder).lineWidth(0.6).stroke();
    doc.font("Helvetica").fontSize(9).fillColor("#a0a0c0").text("—", x, y + h / 2 - 5, { width: w, align: "center" });
    doc.restore();
    return;
  }

  if (entry.slotType === "BREAK" || entry.slotType === "LUNCH") {
    doc.save();
    doc.roundedRect(x, y, w, h, r).fillColor(greyFill).fill();
    doc.roundedRect(x, y, w, h, r).strokeColor(greyBorder).lineWidth(0.6).stroke();
    doc.font("Helvetica-Bold").fontSize(9).fillColor(textMid).text(entry.label || entry.slotType, x, y + h / 2 - 5, { width: w, align: "center" });
    doc.restore();
    return;
  }

  if (entry.slotType === "LESSON" && entry.isFreePeriod) {
    doc.save();
    doc.roundedRect(x, y, w, h, r).fillColor("#f7f8fc").fill();
    doc.lineWidth(0.75).strokeColor("#c8cad8");
    doc.dash(3, { space: 2 });
    doc.roundedRect(x, y, w, h, r).stroke();
    doc.undash();
    doc.font("Helvetica").fontSize(9).fillColor("#8888aa").text("Free", x, y + h / 2 - 5, { width: w, align: "center" });
    doc.restore();
    return;
  }

  if (entry.slotType === "LESSON" || !entry.slotType) {
    const sub = subjectsById.get(entry.subjectId);
    const accent = accentForSubject(sub);
    const bg = tintFromAccent(accent, 0.91);
    const border = borderTint(accent);
    const code = (sub?.code || sub?.name || "?").toString().slice(0, 14).toUpperCase();

    doc.save();
    doc.roundedRect(x, y, w, h, r).fillColor(bg).fill();
    doc.roundedRect(x, y, w, h, r).strokeColor(border).lineWidth(0.75).stroke();
    doc.rect(x, y, 3, h).fillColor(accent).fill();

    doc.font("Helvetica-Bold").fontSize(10).fillColor(accent).text(code, x + 8, y + 5, { width: w - 11, ellipsis: true });

    if (viewMode === "division") {
      const tch = teachersById.get(entry.teacherId);
      const line = teacherShortLine(tch);
      if (line) doc.font("Helvetica").fontSize(8).fillColor(textMid).text(line, x + 8, y + 20, { width: w - 11, ellipsis: true });
    } else {
      const div = divisionsById.get(entry.divisionId);
      const std = div ? standardsById.get(div.standardId) : null;
      const line = div ? `Std ${std?.name || "?"}-${div.name}` : "";
      if (line) doc.font("Helvetica").fontSize(8).fillColor(textMid).text(line, x + 8, y + 20, { width: w - 11, ellipsis: true });
    }
    doc.restore();
    return;
  }

  doc.save();
  doc.roundedRect(x, y, w, h, r).fillColor(greyFill).fill();
  doc.roundedRect(x, y, w, h, r).strokeColor(greyBorder).lineWidth(0.6).stroke();
  doc.font("Helvetica").fontSize(9).fillColor("#a0a0c0").text("—", x, y + h / 2 - 5, { width: w, align: "center" });
  doc.restore();
}

function addPdfVisualTimetablePage(doc, schedCtx, { viewMode, rowId, title }) {
  doc.addPage();
  const margin = 28;
  const gap = 3;
  const footerBand = 40;
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const innerW = pageW - 2 * margin;

  let y = margin;
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#1a1a2e");
  doc.text(title, margin, y, { width: innerW * 0.48, ellipsis: true });
  drawPdfLegend(doc, margin, y + 1, pageW);

  y += 28;
  const { workingDays, allSlots } = schedCtx;
  const n = allSlots.length;
  if (n === 0) {
    doc.font("Helvetica").fontSize(11).fillColor("#666").text("No period slots configured.", margin, y);
    return;
  }

  const dayColW = 52;
  const slotColW = Math.max(32, (innerW - dayColW - gap * (n + 1)) / n);
  const headerH = 30;
  const tableTop = y + 6;
  const availRows = pageH - tableTop - footerBand - margin - 8;
  const dayCount = Math.max(workingDays.length, 1);
  const rowH = Math.max(36, Math.min(54, Math.floor((availRows - headerH - gap * (dayCount + 1)) / dayCount)));

  const tableH = headerH + gap + dayCount * (rowH + gap);
  const boxPad = 4;
  doc.roundedRect(margin - boxPad, tableTop - boxPad, innerW + boxPad * 2, tableH + boxPad * 2, 10).fillColor("#ffffff").fill();
  doc.roundedRect(margin - boxPad, tableTop - boxPad, innerW + boxPad * 2, tableH + boxPad * 2, 10).strokeColor("#e8eaf0").lineWidth(1).stroke();

  let cx = margin + gap;
  doc.roundedRect(cx, tableTop, dayColW, headerH, 4).fillColor("#f7f8fc").fill();
  doc.roundedRect(cx, tableTop, dayColW, headerH, 4).strokeColor("#e8eaf0").lineWidth(0.5).stroke();
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#8888aa").text("DAY", cx + 5, tableTop + 10, { width: dayColW - 10, align: "center" });
  cx += dayColW + gap;

  for (const slot of allSlots) {
    doc.roundedRect(cx, tableTop, slotColW, headerH, 4).fillColor("#f7f8fc").fill();
    doc.roundedRect(cx, tableTop, slotColW, headerH, 4).strokeColor("#e8eaf0").lineWidth(0.5).stroke();
    const l1 = periodHeaderLine1(slot);
    const l2 = slot.startTime || "";
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#4a4a6a").text(l1, cx + 2, tableTop + 5, { width: slotColW - 4, align: "center", lineBreak: false });
    doc.font("Helvetica").fontSize(7).fillColor("#8888aa").text(l2, cx + 2, tableTop + 16, { width: slotColW - 4, align: "center", lineBreak: false });
    cx += slotColW + gap;
  }

  let rowY = tableTop + headerH + gap;
  for (const day of workingDays) {
    cx = margin + gap;
    const dayShort = SHORT_DAY[day] || (typeof day === "string" ? day.slice(0, 3) : String(day));
    doc.roundedRect(cx, rowY, dayColW, rowH, 4).fillColor("#fafbfc").fill();
    doc.roundedRect(cx, rowY, dayColW, rowH, 4).strokeColor("#e8eaf0").lineWidth(0.5).stroke();
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#4a4a6a").text(dayShort, cx, rowY + rowH / 2 - 5, { width: dayColW, align: "center" });
    cx += dayColW + gap;

    for (const slot of allSlots) {
      const entry = findScheduleEntry(schedCtx, viewMode, rowId, day, slot.slotNumber);
      drawPdfScheduleCell(doc, cx, rowY, slotColW, rowH, entry, schedCtx, viewMode);
      cx += slotColW + gap;
    }
    rowY += rowH + gap;
  }
}

/** Footer on the current page only (avoids bufferPages/switchToPage blank or black pages in some viewers). */
function stampPdfPageFooter(doc, pageIndex1, totalPages) {
  doc.save();
  doc.font("Helvetica").fontSize(8).fillColor("#666666");
  const ml = doc.page.margins.left;
  const mr = doc.page.margins.right;
  const w = doc.page.width - ml - mr;
  const y = doc.page.height - doc.page.margins.bottom - 10;
  doc.text(`Page ${pageIndex1} of ${totalPages} · SchoolTime`, ml, y, { width: w, align: "center", lineBreak: false });
  doc.restore();
}

async function createPdfExport(scope, state, entries) {
  const entryList = Array.isArray(entries) ? entries : [];
  const schedCtx = buildScheduleContext(state, entryList);
  const pdfOpts = { margin: 36, autoFirstPage: false, size: "A4", layout: "landscape" };
  const doc = new PDFDocument(pdfOpts);

  const listLen = scope === "ALL_DIVISIONS" ? (state.divisions || []).length : (state.teachers || []).length;
  const totalPages = Math.max(listLen, 1);

  if (listLen === 0) {
    doc.addPage();
    doc.fillColor("#1a1a2e").fontSize(12).text(
      scope === "ALL_DIVISIONS"
        ? "No classes (divisions) to export. Add standards and divisions, generate a timetable, then try again."
        : "No teachers to export. Add teachers, generate a timetable, then try again.",
      40,
      40,
    );
    stampPdfPageFooter(doc, 1, 1);
  } else if (scope === "ALL_DIVISIONS") {
    let pageIdx = 0;
    for (const div of state.divisions || []) {
      pageIdx += 1;
      const std = schedCtx.standardsById.get(div.standardId);
      addPdfVisualTimetablePage(doc, schedCtx, {
        viewMode: "division",
        rowId: div.id,
        title: `Std ${std?.name || "?"} — Div ${div.name}`,
      });
      stampPdfPageFooter(doc, pageIdx, listLen);
    }
  } else if (scope === "ALL_TEACHERS") {
    let pageIdx = 0;
    for (const t of state.teachers || []) {
      pageIdx += 1;
      const name = `${t.firstName || ""} ${t.lastName || ""}`.trim();
      addPdfVisualTimetablePage(doc, schedCtx, {
        viewMode: "teacher",
        rowId: t.id,
        title: `Teacher · ${name || "Staff"}${t.employeeCode ? ` (${t.employeeCode})` : ""}`,
      });
      stampPdfPageFooter(doc, pageIdx, listLen);
    }
  } else {
    throw new Error("UNSUPPORTED_SCOPE");
  }

  const buffer = await pdfToBuffer(doc);
  const filename = scope === "ALL_TEACHERS" ? "teacher-timetables.pdf" : "division-timetables.pdf";
  return { buffer, filename, contentType: "application/pdf" };
}

function hexToExcelArgb(hex) {
  let h = String(hex || "#999999").replace("#", "").toUpperCase();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) h = "CCCCCC";
  return `FF${h}`;
}

function excelFill(hex) {
  return { type: "pattern", pattern: "solid", fgColor: { argb: hexToExcelArgb(hex) } };
}

function borderAllThin(hex) {
  const a = { argb: hexToExcelArgb(hex) };
  return { top: { style: "thin", color: a }, left: { style: "thin", color: a }, bottom: { style: "thin", color: a }, right: { style: "thin", color: a } };
}

function borderLesson(accent) {
  const b = { argb: hexToExcelArgb(borderTint(accent)) };
  const left = { argb: hexToExcelArgb(accent) };
  return {
    left: { style: "medium", color: left },
    top: { style: "thin", color: b },
    right: { style: "thin", color: b },
    bottom: { style: "thin", color: b },
  };
}

function borderFreeDashed() {
  const a = { argb: "FFC8CAD8" };
  return { top: { style: "dashed", color: a }, left: { style: "dashed", color: a }, bottom: { style: "dashed", color: a }, right: { style: "dashed", color: a } };
}

function applyExcelScheduleCell(sheet, row, col, entry, schedCtx, viewMode) {
  const cell = sheet.getCell(row, col);
  const { subjectsById, teachersById, divisionsById, standardsById } = schedCtx;
  const center = { vertical: "middle", horizontal: "center", wrapText: true };
  const lessonTop = { vertical: "top", horizontal: "left", wrapText: true, indent: 1 };
  const accentBody = { argb: "FF4A4A6A" };

  if (!entry) {
    cell.value = "—";
    cell.fill = excelFill("#f1f2f6");
    cell.border = borderAllThin("#e8eaf0");
    cell.font = { name: "Calibri", size: 10, color: { argb: "FFA0A0C0" } };
    cell.alignment = center;
    return;
  }
  if (entry.slotType === "BREAK" || entry.slotType === "LUNCH") {
    cell.value = entry.label || entry.slotType;
    cell.fill = excelFill("#f1f2f6");
    cell.border = borderAllThin("#e8eaf0");
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF4A4A6A" } };
    cell.alignment = center;
    return;
  }
  if (entry.slotType === "LESSON" && entry.isFreePeriod) {
    cell.value = "Free";
    cell.fill = excelFill("#ffffff");
    cell.border = borderFreeDashed();
    cell.font = { name: "Calibri", size: 10, color: { argb: "FF8888AA" } };
    cell.alignment = center;
    return;
  }
  if (entry.slotType === "LESSON" || !entry.slotType) {
    const sub = subjectsById.get(entry.subjectId);
    const accent = accentForSubject(sub);
    const bg = tintFromAccent(accent, 0.91);
    const code = (sub?.code || sub?.name || "?").toString().toUpperCase();
    let subline = "";
    if (viewMode === "division") subline = teacherShortLine(teachersById.get(entry.teacherId));
    else {
      const div = divisionsById.get(entry.divisionId);
      const std = div ? standardsById.get(div.standardId) : null;
      subline = div ? `Std ${std?.name || "?"}-${div.name}` : "";
    }
    const accentArgb = { argb: hexToExcelArgb(accent) };
    cell.value = subline
      ? {
          richText: [
            { font: { name: "Calibri", bold: true, size: 11, color: accentArgb }, text: `${code}\n` },
            { font: { name: "Calibri", size: 9, color: accentBody }, text: subline },
          ],
        }
      : { richText: [{ font: { name: "Calibri", bold: true, size: 11, color: accentArgb }, text: code }] };
    cell.fill = excelFill(bg);
    cell.border = borderLesson(accent);
    cell.alignment = lessonTop;
    return;
  }
  cell.value = "—";
  cell.fill = excelFill("#f1f2f6");
  cell.border = borderAllThin("#e8eaf0");
  cell.alignment = center;
}

function addExcelVisualTimetableSheet(workbook, sheetTitle, displayTitle, schedCtx, viewMode, rowId) {
  const sheet = workbook.addWorksheet(uniqueWorksheetName(workbook, sheetTitle));
  const { workingDays, allSlots } = schedCtx;
  const n = allSlots.length;
  if (n === 0) {
    sheet.mergeCells(1, 1, 1, 6);
    const only = sheet.getCell(1, 1);
    only.value = displayTitle;
    only.font = { name: "Calibri", bold: true, size: 14, color: { argb: "FF1A1A2E" } };
    sheet.getCell(2, 1).value = "No period slots configured.";
    return;
  }
  const totalDataCols = 2 * n + 1;
  const legendCount = LEGEND_ITEMS.length;
  const sameRowLegend = totalDataCols >= 1 + legendCount;
  const titleSpan = Math.max(1, totalDataCols - legendCount);
  const white = excelFill("#ffffff");
  const gapBorder = {
    top: { style: "thin", color: { argb: "FFFFFFFF" } },
    left: { style: "thin", color: { argb: "FFFFFFFF" } },
    bottom: { style: "thin", color: { argb: "FFFFFFFF" } },
    right: { style: "thin", color: { argb: "FFFFFFFF" } },
  };

  sheet.getRow(1).height = 28;
  if (sameRowLegend) {
    sheet.mergeCells(1, 1, 1, titleSpan);
    const tcell = sheet.getCell(1, 1);
    tcell.value = displayTitle;
    tcell.font = { name: "Calibri", bold: true, size: 14, color: { argb: "FF1A1A2E" } };
    tcell.alignment = { vertical: "middle", horizontal: "left" };
    tcell.fill = white;
    LEGEND_ITEMS.forEach(([label, color], idx) => {
      const col = titleSpan + 1 + idx;
      const lc = sheet.getCell(1, col);
      const text = label.replace(/_/g, " ");
      lc.value = {
        richText: [
          { font: { name: "Calibri", bold: true, size: 10, color: { argb: hexToExcelArgb(color) } }, text: "● " },
          { font: { name: "Calibri", bold: true, size: 8, color: { argb: "FF4A4A6A" } }, text },
        ],
      };
      lc.fill = white;
      lc.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });
  } else {
    sheet.mergeCells(1, 1, 1, totalDataCols);
    const tcell = sheet.getCell(1, 1);
    tcell.value = displayTitle;
    tcell.font = { name: "Calibri", bold: true, size: 14, color: { argb: "FF1A1A2E" } };
    tcell.alignment = { vertical: "middle", horizontal: "left" };
    tcell.fill = white;
    sheet.mergeCells(2, 1, 2, totalDataCols);
    const legendCell = sheet.getCell(2, 1);
    const pieces = [];
    LEGEND_ITEMS.forEach(([label, color], i) => {
      const text = label.replace(/_/g, " ");
      pieces.push({ font: { name: "Calibri", bold: true, size: 10, color: { argb: hexToExcelArgb(color) } }, text: "● " });
      pieces.push({ font: { name: "Calibri", bold: true, size: 8, color: { argb: "FF4A4A6A" } }, text });
      if (i < LEGEND_ITEMS.length - 1) {
        pieces.push({ font: { name: "Calibri", size: 8, color: { argb: "FFCCCCCC" } }, text: "     " });
      }
    });
    legendCell.value = { richText: pieces };
    legendCell.fill = white;
    legendCell.alignment = { vertical: "middle", horizontal: "right", wrapText: true };
    sheet.getRow(2).height = 22;
  }

  const spacerRow = sameRowLegend ? 2 : 3;
  sheet.getRow(spacerRow).height = 10;
  for (let c = 1; c <= totalDataCols; c += 1) {
    const sc = sheet.getCell(spacerRow, c);
    sc.fill = white;
    sc.border = gapBorder;
  }

  const hdrRow = spacerRow + 1;
  sheet.getRow(hdrRow).height = 34;
  const hFill = excelFill("#f7f8fc");
  const hBorder = borderAllThin("#e8eaf0");
  const hdrDay = sheet.getCell(hdrRow, 1);
  hdrDay.value = "DAY";
  hdrDay.font = { name: "Calibri", bold: true, size: 9, color: { argb: "FF8888AA" } };
  hdrDay.fill = hFill;
  hdrDay.border = hBorder;
  hdrDay.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

  for (let i = 0; i < n; i += 1) {
    const gcol = excelGutterBeforeSlot(i);
    const gcell = sheet.getCell(hdrRow, gcol);
    gcell.value = "";
    gcell.fill = white;
    gcell.border = gapBorder;

    const slot = allSlots[i];
    const c = excelSlotDataCol(i);
    const cell = sheet.getCell(hdrRow, c);
    const l1 = String(periodHeaderLine1(slot)).toUpperCase();
    const l2 = slot.startTime || "";
    cell.value = l2
      ? {
          richText: [
            { font: { name: "Calibri", bold: true, size: 8, color: { argb: "FF4A4A6A" } }, text: l1 },
            { font: { name: "Calibri", size: 7, color: { argb: "FF8888AA" } }, text: `\n${l2}` },
          ],
        }
      : { richText: [{ font: { name: "Calibri", bold: true, size: 8, color: { argb: "FF4A4A6A" } }, text: l1 }] };
    cell.fill = hFill;
    cell.border = hBorder;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  }

  const dayFill = excelFill("#fafbfc");
  const dayBorder = borderAllThin("#e8eaf0");
  let r = hdrRow + 1;
  for (const day of workingDays) {
    sheet.getRow(r).height = 52;
    const dayCell = sheet.getCell(r, 1);
    dayCell.value = excelDayHeader(day);
    dayCell.font = { name: "Calibri", bold: true, size: 10, color: { argb: "FF4A4A6A" } };
    dayCell.fill = dayFill;
    dayCell.border = dayBorder;
    dayCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

    for (let i = 0; i < n; i += 1) {
      const gcol = excelGutterBeforeSlot(i);
      const gcell = sheet.getCell(r, gcol);
      gcell.value = "";
      gcell.fill = white;
      gcell.border = gapBorder;

      const slot = allSlots[i];
      const col = excelSlotDataCol(i);
      const entry = findScheduleEntry(schedCtx, viewMode, rowId, day, slot.slotNumber);
      applyExcelScheduleCell(sheet, r, col, entry, schedCtx, viewMode);
    }
    r += 1;
  }

  sheet.getColumn(1).width = 8;
  for (let i = 0; i < n; i += 1) {
    sheet.getColumn(excelGutterBeforeSlot(i)).width = 0.45;
    sheet.getColumn(excelSlotDataCol(i)).width = 11;
  }

  sheet.views = [{ state: "frozen", ySplit: hdrRow }];
}

function buildReportRows(state, entries) {
  const subjects = state.subjects || [];
  const divisions = state.divisions || [];
  const standards = state.standards || [];
  const teachers = state.teachers || [];

  const subjectHours = subjects.map((sub) => {
    const byStd = {};
    standards.forEach((std) => {
      const divs = divisions.filter((d) => d.standardId === std.id);
      const total = divs.reduce((acc, div) => acc + entries.filter((e) => e.divisionId === div.id && e.subjectId === sub.id).length, 0);
      if (total > 0) byStd[std.name] = Math.round(total / Math.max(divs.length, 1));
    });
    return { sub, byStd };
  });

  const teacherWorkload = teachers.map((t) => {
    const assigned = entries.filter((e) => e.teacherId === t.id).length;
    const max = t.maxPerWeek || 30;
    const pct = Math.round((assigned / max) * 100);
    return { t, assigned, max, pct };
  });

  return { subjectHours, teacherWorkload };
}

async function createExcelExport(scope, state, entries) {
  const entryList = Array.isArray(entries) ? entries : [];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SchoolTime";
  workbook.created = new Date();

  if (scope === "ALL_DIVISIONS") {
    const schedCtx = buildScheduleContext(state, entryList);
    for (const div of state.divisions || []) {
      const std = schedCtx.standardsById.get(div.standardId);
      addExcelVisualTimetableSheet(
        workbook,
        `Std ${std?.name || "?"}-${div.name}-${div.id.slice(0, 6)}`,
        `Std ${std?.name || "?"} — Div ${div.name}`,
        schedCtx,
        "division",
        div.id,
      );
    }
    if (workbook.worksheets.length === 0) {
      workbook.addWorksheet("Info").addRow(["No divisions to export. Add standards and divisions, generate a timetable, then try again."]);
    }
    return {
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      filename: "division-timetables.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  if (scope === "ALL_TEACHERS") {
    const schedCtx = buildScheduleContext(state, entryList);
    for (const t of state.teachers || []) {
      const name = `${t.firstName || ""} ${t.lastName || ""}`.trim();
      addExcelVisualTimetableSheet(
        workbook,
        `${t.employeeCode}-${t.firstName}-${t.id.slice(0, 6)}`,
        `Teacher · ${name || "Staff"}${t.employeeCode ? ` (${t.employeeCode})` : ""}`,
        schedCtx,
        "teacher",
        t.id,
      );
    }
    if (workbook.worksheets.length === 0) {
      workbook.addWorksheet("Info").addRow(["No teachers to export. Add teachers, generate a timetable, then try again."]);
    }
    return {
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      filename: "teacher-timetables.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  if (scope === "REPORTS_BUNDLE") {
    const { subjectHours, teacherWorkload } = buildReportRows(state, entryList);
    const subjectSheet = workbook.addWorksheet("Subject Hours");
    const standards = state.standards || [];
    subjectSheet.addRow(["Subject", "Code", "Required", ...standards.map((s) => `Std ${s.name}`)]);
    subjectHours.forEach(({ sub, byStd }) => {
      subjectSheet.addRow([sub.name, sub.code, sub.weeklyPeriods, ...standards.map((s) => byStd[s.name] ?? "")]);
    });

    const teacherSheet = workbook.addWorksheet("Teacher Workload");
    teacherSheet.addRow(["Teacher", "Code", "Assigned", "Max", "Utilization %"]);
    teacherWorkload.forEach(({ t, assigned, max, pct }) => {
      teacherSheet.addRow([`${t.firstName} ${t.lastName}`, t.employeeCode, assigned, max, pct]);
    });

    subjectSheet.columns.forEach((col) => { col.width = 18; });
    teacherSheet.columns.forEach((col) => { col.width = 18; });
    return {
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      filename: "reports-bundle.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  throw new Error("UNSUPPORTED_SCOPE");
}

export async function generateExportFile({ type, scope, state, entries }) {
  const entryList = Array.isArray(entries) ? entries : [];
  if (type === "PDF") return createPdfExport(scope, state, entryList);
  if (type === "EXCEL") return createExcelExport(scope, state, entryList);
  throw new Error("UNSUPPORTED_TYPE");
}

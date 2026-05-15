import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { reportSubjectHoursCategoryShort, reportSubjectHoursSubjectLabel } from "../../shared/reportHoursLabels.js";
import { slotActiveOnWeekday, sortWorkingDaysCanonical } from "../../shared/periodSlotDays.js";
import { normalizeTenantSchoolOrdering } from "../../shared/schoolDisplayOrder.js";

function withExportSchoolOrdering(state) {
  if (!state || typeof state !== "object") return state;
  const ord = normalizeTenantSchoolOrdering({
    standards: state.standards || [],
    divisions: state.divisions || [],
    workingDays: state.workingDays || [],
  });
  const wd =
    ord.workingDays.length > 0
      ? ord.workingDays
      : sortWorkingDaysCanonical(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]);
  return { ...state, standards: ord.standards, divisions: ord.divisions, workingDays: wd };
}

/** Parse data URL from Settings → school logo for PDF/Excel embedding (PNG/JPEG only for Excel). */
function parseSchoolLogoImage(logoDataUrl) {
  if (!logoDataUrl || typeof logoDataUrl !== "string") return null;
  const m = logoDataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
  if (!m) return null;
  try {
    const extRaw = m[1].toLowerCase();
    const extension = extRaw === "jpg" ? "jpeg" : extRaw;
    return { buffer: Buffer.from(m[2], "base64"), extension };
  } catch {
    return null;
  }
}

function schoolBrandingLines(state) {
  const school = state?.school || {};
  const name = String(school.name || "").trim() || "School";
  const year = String(school.academicYear || "").trim();
  return { name, year };
}

const SHORT_DAY = {
  MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu", FRIDAY: "Fri", SATURDAY: "Sat", SUNDAY: "Sun",
};

/** Uppercase 3-letter day labels to match in-app visual timetable style. */
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

/** Local calendar date when the export is generated (YYYY-MM-DD). */
function buildReportDateSlug() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function buildExportFilename(scope, ext) {
  const kind =
    scope === "ALL_TEACHERS"
      ? "teacher-timetables"
      : scope === "ALL_DIVISIONS"
        ? "class-timetables"
        : "summary-reports";
  const date = buildReportDateSlug();
  return `SchoolTime-${kind}-${date}.${ext}`;
}

/** Query strings / bookmarks may use alternate labels; map to canonical scopes. */
const EXPORT_SCOPE_ALIASES = {
  REPORTS: "REPORTS_BUNDLE",
  SUMMARY: "REPORTS_BUNDLE",
  SUMMARY_REPORTS: "REPORTS_BUNDLE",
  REPORT_BUNDLE: "REPORTS_BUNDLE",
  SCHOOL_REPORTS: "REPORTS_BUNDLE",
};

/**
 * Align client/query spelling so PDF reports-bundle matches REPORTS_BUNDLE.
 * Exported so HTTP routes use the same rules as generateExportFile (no drift).
 */
export function normalizeExportScope(scope) {
  let s = String(scope ?? "")
    .trim()
    .toUpperCase()
    .replace(/-/g, "_")
    .replace(/\s+/g, "_");
  if (EXPORT_SCOPE_ALIASES[s]) s = EXPORT_SCOPE_ALIASES[s];
  return s;
}

function normalizeExportType(type) {
  return String(type ?? "").trim().toUpperCase();
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
  const workingDays =
    Array.isArray(state.workingDays) && state.workingDays.length > 0
      ? sortWorkingDaysCanonical(state.workingDays)
      : sortWorkingDaysCanonical(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]);
  const allSlots = [...(state.periodSlots || [])].sort((a, b) => a.slotNumber - b.slotNumber);
  const subjectsById = new Map((state.subjects || []).map((s) => [s.id, s]));
  const teachersById = new Map((state.teachers || []).map((t) => [t.id, t]));
  const divisionsById = new Map((state.divisions || []).map((d) => [d.id, d]));
  const standardsById = new Map((state.standards || []).map((s) => [s.id, s]));
  const mediumsById = new Map((state.mediums || []).map((m) => [m.id, m]));
  return { workingDays, allSlots, subjectsById, teachersById, divisionsById, standardsById, mediumsById, entries };
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

function teacherFullName(t) {
  if (!t) return "";
  const fn = (t.firstName || "").trim();
  const ln = (t.lastName || "").trim();
  const full = `${fn} ${ln}`.trim();
  return full || String(t.employeeCode || "").trim();
}

function classTeacherForDivision(state, divisionId) {
  if (!divisionId) return null;
  return (state.teachers || []).find((t) => (t.classTeacherDivisionIds || []).includes(divisionId)) || null;
}

/** Primary teaching subject for CT badge row (primarySubjectId, else first subjectIds). Mirrors app reports UI. */
function classTeacherPrimarySubject(teacher, subjects) {
  if (!teacher) return null;
  const list = subjects || [];
  const pid = teacher.primarySubjectId;
  if (pid) return list.find((s) => s.id === pid) || null;
  const sid = (teacher.subjectIds || [])[0];
  return sid ? list.find((s) => s.id === sid) || null : null;
}

function teacherIsClassTeacherForDivision(teacher, divisionId) {
  if (!teacher || !divisionId) return false;
  return (teacher.classTeacherDivisionIds || []).includes(divisionId);
}

/** Medium code/name for export banners (no decorative dot). */
function divisionMediumPlain(div, mediumsById) {
  if (!div?.mediumId || !mediumsById) return "";
  const m = mediumsById.get(div.mediumId);
  return String(m?.code || m?.name || "").trim();
}

/** Medium **code** only (teacher timetable cell line); omit if no code on record. */
function divisionMediumCodeOnly(div, mediumsById) {
  if (!div?.mediumId || !mediumsById) return "";
  const m = mediumsById.get(div.mediumId);
  return String(m?.code || "").trim();
}

function formatTeacherClassTeacherDivisions(state, teacherId) {
  const t = (state.teachers || []).find((x) => x.id === teacherId);
  const ids = t?.classTeacherDivisionIds || [];
  if (!ids.length) return "";
  const parts = ids.map((dId) => {
    const div = (state.divisions || []).find((d) => d.id === dId);
    const std = div ? (state.standards || []).find((s) => s.id === div.standardId) : null;
    return div ? `Std ${std?.name || "?"}-${div.name}` : "";
  }).filter(Boolean);
  return parts.join(", ");
}

/**
 * Logo + school name + academic year (left); optional subject-category legend (right) for visual timetables only.
 * Thin rule underneath. Returns Y below the rule.
 */
function drawPdfSchoolBrandingBand(doc, state, margin, pageW, y0, opts = {}) {
  const includeLegend = opts.includeLegend !== false;
  const { name, year } = schoolBrandingLines(state);
  const logo = parseSchoolLogoImage(state?.school?.logoDataUrl);
  const logoBox = 38;
  let textX = margin;
  const bandTop = y0;

  if (logo?.buffer) {
    try {
      doc.image(logo.buffer, margin, bandTop + 2, { fit: [logoBox, logoBox] });
      textX = margin + logoBox + 12;
    } catch {
      textX = margin;
    }
  }

  const legendReserve = includeLegend ? 200 : 0;
  const textMax = Math.max(120, pageW - textX - margin - legendReserve);
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#111827");
  doc.text(name, textX, bandTop + 6, { width: textMax, ellipsis: true });
  if (year) {
    doc.font("Helvetica").fontSize(9).fillColor("#64748b");
    doc.text(`Academic Year ${year}`, textX, bandTop + 24, { width: textMax, ellipsis: true });
  }

  if (includeLegend) drawPdfLegend(doc, margin, bandTop + 8, pageW);

  const textBlockH = year ? 30 : 18;
  const bandH = Math.max(logo?.buffer ? logoBox + 6 : 0, textBlockH + 12);
  const ruleY = bandTop + bandH;
  doc.moveTo(margin, ruleY).lineTo(pageW - margin, ruleY).strokeColor("#e2e8f0").lineWidth(0.85).stroke();
  return ruleY + 10;
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

/** Teacher workload export: `CT ×n` pill (matches in-app reports). */
function drawPdfWorkloadCtCountPill(doc, x, yTop, count) {
  const label = `CT ×${count}`;
  const fontSize = 7;
  doc.font("Helvetica").fontSize(fontSize);
  const tw = doc.widthOfString(label);
  const padX = 4;
  const pillW = Math.ceil(tw + padX * 2);
  const pillH = 11;
  const rad = pillH / 2;
  doc.save();
  doc.roundedRect(x, yTop, pillW, pillH, rad).fillColor("#eef2ff").fill();
  doc.roundedRect(x, yTop, pillW, pillH, rad).strokeColor("#c7d2fe").lineWidth(0.45).stroke();
  doc.fillColor("#4f46e5").text(label, x + padX, yTop + (pillH - fontSize) / 2 + 0.6, { lineBreak: false });
  doc.restore();
  return pillW;
}

function drawPdfScheduleCell(doc, x, y, w, h, entry, schedCtx, viewMode) {
  const r = 4;
  const { subjectsById, teachersById, divisionsById, standardsById, mediumsById } = schedCtx;
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
    const tch = teachersById.get(entry.teacherId);
    const isCt = teacherIsClassTeacherForDivision(tch, entry.divisionId);
    const px = x + 8;
    const py = y + 5;

    doc.save();
    doc.roundedRect(x, y, w, h, r).fillColor(bg).fill();
    doc.roundedRect(x, y, w, h, r).strokeColor(border).lineWidth(0.75).stroke();
    doc.rect(x, y, 3, h).fillColor(accent).fill();

    doc.font("Helvetica-Bold").fontSize(10);
    const ctLabel = "CT";
    const ctBlack = "#000000";
    let availCode;
    if (isCt) {
      const ctSlotW = doc.widthOfString(ctLabel);
      const gapBeforeCt = 4;
      availCode = Math.max(12, x + w - 8 - ctSlotW - gapBeforeCt - px);
    } else {
      availCode = Math.max(12, w - 16 - 4);
    }
    let drawCode = code;
    doc.fillColor(accent);
    while (drawCode.length > 1 && doc.widthOfString(drawCode) > availCode) {
      drawCode = drawCode.slice(0, -1);
    }
    if (drawCode.length < code.length) drawCode += "…";
    doc.text(drawCode, px, py, { lineBreak: false });
    if (isCt) {
      const ctW = doc.widthOfString(ctLabel);
      doc.font("Helvetica-Bold").fontSize(10).fillColor(ctBlack).text(ctLabel, x + w - 8 - ctW, py, { lineBreak: false });
    }

    const teacherRowY = y + 19;
    if (viewMode === "division") {
      const line = teacherFullName(tch);
      if (line) doc.font("Helvetica").fontSize(8).fillColor(textMid).text(line, x + 8, teacherRowY, { width: w - 11, ellipsis: true });
    } else {
      const div = divisionsById.get(entry.divisionId);
      const std = div ? standardsById.get(div.standardId) : null;
      const line = div ? `Std ${std?.name || "?"}-${div.name}` : "";
      if (line) doc.font("Helvetica").fontSize(8).fillColor(textMid).text(line, x + 8, teacherRowY, { width: w - 11, ellipsis: true });
      const medCode = div ? divisionMediumCodeOnly(div, mediumsById) : "";
      if (medCode) {
        doc.font("Helvetica").fontSize(7).fillColor("#000000").text(medCode, x + 8, teacherRowY + 11, { width: w - 11, ellipsis: true });
      }
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

function addPdfVisualTimetablePage(doc, schedCtx, state, { viewMode, rowId, title }) {
  doc.addPage();
  const margin = 28;
  const gap = 3;
  const footerBand = 40;
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const innerW = pageW - 2 * margin;

  let y = margin;
  y = drawPdfSchoolBrandingBand(doc, state, margin, pageW, y);

  doc.font("Helvetica-Bold").fontSize(11.5).fillColor("#334155");
  doc.text(title, margin, y, { width: innerW * 0.62, ellipsis: true });
  y += 16;

  if (viewMode === "division") {
    const ct = classTeacherForDivision(state, rowId);
    const ctLine = ct ? `Class teacher: ${teacherFullName(ct)}` : "Class teacher: Not assigned";
    doc.font("Helvetica").fontSize(9).fillColor("#64748b").text(ctLine, margin, y, { width: innerW - 8, ellipsis: true });
    y += 13;
    const divRow = schedCtx.divisionsById.get(rowId);
    const med = divisionMediumPlain(divRow, schedCtx.mediumsById);
    if (med) {
      doc.font("Helvetica").fontSize(9).fillColor("#64748b").text(`Medium: ${med}`, margin, y, { width: innerW - 8, ellipsis: true });
      y += 13;
    }
  } else {
    const ctLine = formatTeacherClassTeacherDivisions(state, rowId);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#64748b")
      .text(`Class teacher of: ${ctLine || "—"}`, margin, y, { width: innerW - 8, ellipsis: true });
    y += 13;
  }

  y += 6;
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
  const rowHMin = viewMode === "teacher" ? 42 : 36;
  const rowH = Math.max(rowHMin, Math.min(54, Math.floor((availRows - headerH - gap * (dayCount + 1)) / dayCount)));

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
      const entry =
        !slotActiveOnWeekday(slot, day) ? null : findScheduleEntry(schedCtx, viewMode, rowId, day, slot.slotNumber);
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

/** Summary-report PDF pages use a simple page counter (sections may span multiple pages). */
function stampPdfReportPageFooter(doc, pageIndex1) {
  doc.save();
  doc.font("Helvetica").fontSize(8).fillColor("#666666");
  const ml = doc.page.margins.left;
  const mr = doc.page.margins.right;
  const w = doc.page.width - ml - mr;
  const y = doc.page.height - doc.page.margins.bottom - 10;
  doc.text(`Page ${pageIndex1} · SchoolTime`, ml, y, { width: w, align: "center", lineBreak: false });
  doc.restore();
}

const REPORT_PDF_MARGIN = 36;
const REPORT_HDR_FILL = "#f7f8fc";
const REPORT_HDR_TEXT = "#8888aa";
const REPORT_BODY_TEXT = "#4a4a6a";
const REPORT_BORDER = "#e8eaf0";
const REPORT_CARD_FILL = "#ffffff";

async function createPdfReportsExport(state, entries) {
  const entryList = Array.isArray(entries) ? entries : [];
  const { subjectHours, teacherWorkload, divisionCompletion } = buildReportRows(state, entryList);
  const standards = state.standards || [];
  const subjectsFiltered = subjectHours.filter((sh) => Object.keys(sh.byStd).length > 0);

  const pdfOpts = { margin: REPORT_PDF_MARGIN, autoFirstPage: false, size: "A4", layout: "portrait" };
  const doc = new PDFDocument(pdfOpts);
  let pageNum = 0;
  const footerReserve = 40;

  function beginPage() {
    doc.addPage();
    pageNum += 1;
    const pw = doc.page.width;
    const ph = doc.page.height;
    const y0 = drawPdfSchoolBrandingBand(doc, state, REPORT_PDF_MARGIN, pw, REPORT_PDF_MARGIN, { includeLegend: false });
    return { y: y0, pw, ph, innerW: pw - 2 * REPORT_PDF_MARGIN, bottomLimit: ph - REPORT_PDF_MARGIN - footerReserve };
  }

  let { y, innerW, bottomLimit } = beginPage();

  function breakPage() {
    stampPdfReportPageFooter(doc, pageNum);
    const next = beginPage();
    y = next.y;
    innerW = next.innerW;
    bottomLimit = next.bottomLimit;
  }

  function ensureSpace(needH) {
    if (y + needH > bottomLimit) breakPage();
  }

  function sectionTitle(text) {
    ensureSpace(28);
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#111827").text(text, REPORT_PDF_MARGIN, y, { width: innerW });
    y += 20;
  }

  sectionTitle("Weekly Subject Hours (Average per Division)");
  const cols = ["Subject", "Cat.", "Req.", ...standards.map((s) => `Std ${s.name}`)];
  const baseColW = innerW / Math.max(cols.length, 1);
  const colWidths = cols.map((c, i) => {
    if (i === 0) return Math.min(140, baseColW * 1.4);
    if (i === 1) return Math.min(78, baseColW * 0.95);
    if (i === 2) return Math.min(44, baseColW * 0.65);
    return Math.max(36, (innerW - 140 - 78 - 44) / Math.max(standards.length, 1));
  });
  const scale = innerW / colWidths.reduce((a, w) => a + w, 0);
  const wAdj = colWidths.map((w) => w * scale);

  const headerH = 22;
  const rowH = 18;
  ensureSpace(headerH + subjectsFiltered.length * rowH + 16);

  let cx = REPORT_PDF_MARGIN;
  cols.forEach((h, i) => {
    doc.roundedRect(cx, y, wAdj[i], headerH, 3).fillColor(REPORT_HDR_FILL).fill();
    doc.roundedRect(cx, y, wAdj[i], headerH, 3).strokeColor(REPORT_BORDER).lineWidth(0.5).stroke();
    doc.font("Helvetica-Bold").fontSize(8).fillColor(REPORT_HDR_TEXT).text(String(h).toUpperCase(), cx + 4, y + 6, { width: wAdj[i] - 8, ellipsis: true });
    cx += wAdj[i];
  });
  y += headerH;

  subjectsFiltered.forEach((sh, ri) => {
    ensureSpace(rowH + 4);
    cx = REPORT_PDF_MARGIN;
    const fill = ri % 2 === 0 ? "#fafbfc" : "#ffffff";
    const cells = [
      reportSubjectHoursSubjectLabel(sh.sub),
      reportSubjectHoursCategoryShort(sh.sub.category),
      String(sh.requiredLabel ?? sh.sub.weeklyPeriods ?? ""),
      ...standards.map((s) => (sh.byStd[s.name] != null ? String(sh.byStd[s.name]) : "—")),
    ];
    cells.forEach((cell, i) => {
      doc.roundedRect(cx, y, wAdj[i], rowH, 2).fillColor(fill).fill();
      doc.roundedRect(cx, y, wAdj[i], rowH, 2).strokeColor(REPORT_BORDER).lineWidth(0.35).stroke();
      doc.font("Helvetica").fontSize(8).fillColor(REPORT_BODY_TEXT);
      doc.text(cell, cx + 4, y + 4, { width: wAdj[i] - 8, ellipsis: true });
      cx += wAdj[i];
    });
    y += rowH;
  });

  y += 24;
  sectionTitle("Teacher Workload");
  const twCols = ["Teacher", "Code", "Assigned", "Max", "CT", "%"];
  const twWFracs = [0.24, 0.11, 0.11, 0.11, 0.18, 0.25];
  const twW = twWFracs.map((f) => innerW * f);
  ensureSpace(headerH + teacherWorkload.length * rowH + 8);
  cx = REPORT_PDF_MARGIN;
  twCols.forEach((h, i) => {
    doc.roundedRect(cx, y, twW[i], headerH, 3).fillColor(REPORT_HDR_FILL).fill();
    doc.roundedRect(cx, y, twW[i], headerH, 3).strokeColor(REPORT_BORDER).lineWidth(0.5).stroke();
    doc.font("Helvetica-Bold").fontSize(8).fillColor(REPORT_HDR_TEXT).text(String(h).toUpperCase(), cx + 4, y + 6, { width: twW[i] - 8 });
    cx += twW[i];
  });
  y += headerH;

  teacherWorkload.forEach((tw, ri) => {
    ensureSpace(rowH + 4);
    cx = REPORT_PDF_MARGIN;
    const fill = ri % 2 === 0 ? "#fafbfc" : "#ffffff";
    const name = `${tw.t.firstName || ""} ${tw.t.lastName || ""}`.trim();
    const textCells = [name || "—", tw.t.employeeCode || "—", String(tw.assigned), String(tw.max)];
    for (let i = 0; i < 4; i += 1) {
      doc.roundedRect(cx, y, twW[i], rowH, 2).fillColor(fill).fill();
      doc.roundedRect(cx, y, twW[i], rowH, 2).strokeColor(REPORT_BORDER).lineWidth(0.35).stroke();
      doc.font("Helvetica").fontSize(8).fillColor(REPORT_BODY_TEXT).text(textCells[i], cx + 4, y + 4, { width: twW[i] - 8, ellipsis: true });
      cx += twW[i];
    }
    doc.roundedRect(cx, y, twW[4], rowH, 2).fillColor(fill).fill();
    doc.roundedRect(cx, y, twW[4], rowH, 2).strokeColor(REPORT_BORDER).lineWidth(0.35).stroke();
    if (tw.ctCount > 0) {
      doc.font("Helvetica").fontSize(7);
      const pillBodyW = doc.widthOfString(`CT ×${tw.ctCount}`) + 8;
      const px = cx + Math.max(4, (twW[4] - pillBodyW) / 2);
      const py = y + (rowH - 11) / 2;
      drawPdfWorkloadCtCountPill(doc, px, py, tw.ctCount);
    } else {
      doc.font("Helvetica").fontSize(8).fillColor("#c7c9d9").text("—", cx + 4, y + 4, { width: twW[4] - 8, align: "center" });
    }
    cx += twW[4];
    doc.roundedRect(cx, y, twW[5], rowH, 2).fillColor(fill).fill();
    doc.roundedRect(cx, y, twW[5], rowH, 2).strokeColor(REPORT_BORDER).lineWidth(0.35).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(REPORT_BODY_TEXT).text(`${tw.pct}%`, cx + 4, y + 4, { width: twW[5] - 8, ellipsis: true });
    y += rowH;
  });

  y += 24;
  sectionTitle("Division Completion");
  const cardW = innerW;
  const pad = 8;
  divisionCompletion.forEach((block) => {
    const lineCount = block.scheduled.length;
    const headerBlockH = 52;
    const cardH = headerBlockH + lineCount * 16 + pad * 2;
    ensureSpace(cardH + 14);
    const stdName = block.std?.name || "?";
    const x0 = REPORT_PDF_MARGIN + pad;
    const metricsW = 58;
    const nameColW = cardW - pad * 2 - metricsW - 6;
    doc.roundedRect(REPORT_PDF_MARGIN, y, cardW, cardH, 8).fillColor(REPORT_CARD_FILL).fill();
    doc.roundedRect(REPORT_PDF_MARGIN, y, cardW, cardH, 8).strokeColor(REPORT_BORDER).lineWidth(0.85).stroke();
    const topY = y + pad;
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827").text(`Std ${stdName} — Div ${block.div.name}`, x0, topY, { width: cardW - 80 });
    doc.font("Helvetica-Bold").fontSize(14).fillColor(block.pct > 90 ? "#059669" : "#d97706").text(`${block.pct}%`, REPORT_PDF_MARGIN + cardW - 52, topY, { width: 44, align: "right" });
    let cy = topY + 16;
    doc.font("Helvetica").fontSize(9).fillColor("#64748b").text(`${block.divSubjectsCount} subject${block.divSubjectsCount !== 1 ? "s" : ""}`, x0, cy, { width: cardW - 2 * pad });
    cy += 12;
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(REPORT_BODY_TEXT)
      .text(`Class teacher: ${block.ctTeacher ? teacherFullName(block.ctTeacher) : "Not assigned"}`, x0, cy, { width: cardW - 2 * pad });
    cy += 16;
    block.scheduled.forEach((s) => {
      const suffixCt = s.showCtBadge ? " CT" : "";
      doc.font("Helvetica-Bold").fontSize(9);
      const sufW = suffixCt ? doc.widthOfString(suffixCt) : 0;
      doc.font("Helvetica").fontSize(9).fillColor(REPORT_BODY_TEXT);
      const availName = Math.max(8, nameColW - sufW - 2);
      let drawName = s.sub.name;
      while (drawName.length > 1 && doc.widthOfString(drawName) > availName) {
        drawName = drawName.slice(0, -1);
      }
      if (drawName.length < s.sub.name.length) drawName += "…";
      const nameW = doc.widthOfString(drawName);
      doc.text(drawName, x0, cy, { lineBreak: false });
      if (suffixCt) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000").text(suffixCt, x0 + nameW, cy, { lineBreak: false });
      }
      const ok = s.got >= s.required;
      doc.font("Helvetica-Bold").fontSize(9).fillColor(ok ? "#059669" : "#dc2626").text(`${s.got}/${s.required}`, x0 + nameColW + 6, cy, { width: metricsW - 8, align: "right" });
      cy += 16;
    });
    y += cardH + 12;
  });

  stampPdfReportPageFooter(doc, pageNum);

  const buffer = await pdfToBuffer(doc);
  const filename = buildExportFilename("REPORTS_BUNDLE", "pdf");
  return { buffer, filename, contentType: "application/pdf" };
}

async function createPdfExport(scope, state, entries) {
  const entryList = Array.isArray(entries) ? entries : [];
  const s = normalizeExportScope(scope);
  if (s === "REPORTS_BUNDLE") {
    return createPdfReportsExport(state, entryList);
  }
  const schedCtx = buildScheduleContext(state, entryList);
  const pdfOpts = { margin: 36, autoFirstPage: false, size: "A4", layout: "landscape" };
  const doc = new PDFDocument(pdfOpts);

  const listLen = s === "ALL_DIVISIONS" ? (state.divisions || []).length : (state.teachers || []).length;
  const totalPages = Math.max(listLen, 1);

  if (listLen === 0) {
    doc.addPage();
    let yMsg = drawPdfSchoolBrandingBand(doc, state, 36, doc.page.width, 36);
    doc.fillColor("#1a1a2e").fontSize(12).text(
      s === "ALL_DIVISIONS"
        ? "No classes (divisions) to export. Add standards and divisions, generate a timetable, then try again."
        : "No teachers to export. Add teachers, generate a timetable, then try again.",
      36,
      yMsg,
    );
    stampPdfPageFooter(doc, 1, 1);
  } else if (s === "ALL_DIVISIONS") {
    let pageIdx = 0;
    for (const div of state.divisions || []) {
      pageIdx += 1;
      const std = schedCtx.standardsById.get(div.standardId);
      addPdfVisualTimetablePage(doc, schedCtx, state, {
        viewMode: "division",
        rowId: div.id,
        title: `Std ${std?.name || "?"} — Div ${div.name}`,
      });
      stampPdfPageFooter(doc, pageIdx, listLen);
    }
  } else if (s === "ALL_TEACHERS") {
    let pageIdx = 0;
    for (const t of state.teachers || []) {
      pageIdx += 1;
      const name = `${t.firstName || ""} ${t.lastName || ""}`.trim();
      addPdfVisualTimetablePage(doc, schedCtx, state, {
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
  const filename = buildExportFilename(s, "pdf");
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

/** Insert rows 1–3 (branding, subtitle, spacer) or variant when legend wraps; returns hdr row index for DAY header. */
function applyExcelSchoolBrandingHeader(workbook, sheet, state, totalDataCols, titleSpan, sameRowLegend, white, gapBorder, displayTitle) {
  const { name, year } = schoolBrandingLines(state);
  const logo = parseSchoolLogoImage(state?.school?.logoDataUrl);

  sheet.getRow(1).height = 48;
  const a1 = sheet.getCell(1, 1);
  a1.fill = white;

  const showLogo = Boolean(logo?.buffer && titleSpan >= 2 && (logo.extension === "png" || logo.extension === "jpeg"));
  if (showLogo) {
    try {
      const imageId = workbook.addImage({ buffer: logo.buffer, extension: logo.extension });
      sheet.addImage(imageId, {
        tl: { col: 0, row: 0 },
        ext: { width: 52, height: 52 },
      });
    } catch {
      /* ignore invalid image */
    }
  }

  if (titleSpan >= 2) {
    sheet.mergeCells(1, 2, 1, titleSpan);
  } else {
    sheet.mergeCells(1, 1, 1, 1);
  }
  const schoolCell = titleSpan >= 2 ? sheet.getCell(1, 2) : sheet.getCell(1, 1);
  schoolCell.value = year
    ? {
        richText: [
          { font: { name: "Calibri", bold: true, size: 14, color: { argb: "FF111827" } }, text: `${name}\n` },
          { font: { name: "Calibri", size: 10, color: { argb: "FF64748B" } }, text: `Academic Year ${year}` },
        ],
      }
    : name;
  schoolCell.fill = white;
  schoolCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };

  if (sameRowLegend) {
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

    sheet.mergeCells(2, 1, 2, titleSpan);
    const titleCell = sheet.getCell(2, 1);
    titleCell.value = displayTitle;
    titleCell.font = { name: "Calibri", bold: true, size: 13, color: { argb: "FF334155" } };
    titleCell.alignment = { vertical: "middle", horizontal: "left" };
    titleCell.fill = white;

    const spacerRow = 3;
    sheet.getRow(spacerRow).height = 10;
    for (let c = 1; c <= totalDataCols; c += 1) {
      const sc = sheet.getCell(spacerRow, c);
      sc.fill = white;
      sc.border = gapBorder;
    }
    return { hdrRow: 4, spacerRow };
  }

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
  sheet.getRow(2).height = 24;

  sheet.mergeCells(3, 1, 3, titleSpan);
  const titleCell = sheet.getCell(3, 1);
  titleCell.value = displayTitle;
  titleCell.font = { name: "Calibri", bold: true, size: 13, color: { argb: "FF334155" } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  titleCell.fill = white;

  const spacerRow = 4;
  sheet.getRow(spacerRow).height = 10;
  for (let c = 1; c <= totalDataCols; c += 1) {
    const sc = sheet.getCell(spacerRow, c);
    sc.fill = white;
    sc.border = gapBorder;
  }
  return { hdrRow: 5, spacerRow };
}

function applyExcelScheduleCell(sheet, row, col, entry, schedCtx, viewMode) {
  const cell = sheet.getCell(row, col);
  const { subjectsById, teachersById, divisionsById, standardsById, mediumsById = new Map() } = schedCtx;
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
    const tch = teachersById.get(entry.teacherId);
    const isCt = teacherIsClassTeacherForDivision(tch, entry.divisionId);
    let subline = "";
    if (viewMode === "division") subline = teacherFullName(tch);
    else {
      const div = divisionsById.get(entry.divisionId);
      const std = div ? standardsById.get(div.standardId) : null;
      subline = div ? `Std ${std?.name || "?"}-${div.name}` : "";
    }
    const accentArgb = { argb: hexToExcelArgb(accent) };
    const ctArgb = { argb: "FF000000" };
    const codeFont = { name: "Calibri", bold: true, size: 11, color: accentArgb };
    const ctInlineFont = { name: "Calibri", bold: true, size: 11, color: ctArgb };
    const richPieces = [{ font: codeFont, text: code }];
    if (isCt) {
      const cw = Number(sheet.getColumn(col).width);
      const colChars = Number.isFinite(cw) && cw > 0 ? cw : 14;
      const padSlots = Math.max(1, Math.floor(colChars) - String(code).length - 3);
      const padStr = "\u00A0".repeat(Math.min(padSlots, 64));
      richPieces.push({ font: codeFont, text: padStr });
      richPieces.push({ font: ctInlineFont, text: "CT" });
    }
    if (subline) {
      richPieces.push({ font: { name: "Calibri", size: 9, color: accentBody }, text: `\n${subline}` });
    }
    if (viewMode === "teacher") {
      const div = divisionsById.get(entry.divisionId);
      const medCode = div ? divisionMediumCodeOnly(div, mediumsById) : "";
      if (medCode) {
        richPieces.push({ font: { name: "Calibri", size: 8, color: { argb: "FF000000" } }, text: `\n${medCode}` });
      }
    }
    cell.value = { richText: richPieces };
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

function addExcelVisualTimetableSheet(workbook, sheetTitle, displayTitle, schedCtx, viewMode, rowId, state) {
  const sheet = workbook.addWorksheet(uniqueWorksheetName(workbook, sheetTitle));
  const st = state || {};
  const { workingDays, allSlots } = schedCtx;
  const n = allSlots.length;
  if (n === 0) {
    const gapBorder = {
      top: { style: "thin", color: { argb: "FFFFFFFF" } },
      left: { style: "thin", color: { argb: "FFFFFFFF" } },
      bottom: { style: "thin", color: { argb: "FFFFFFFF" } },
      right: { style: "thin", color: { argb: "FFFFFFFF" } },
    };
    applyExcelSchoolBrandingHeader(workbook, sheet, st, 6, 5, true, excelFill("#ffffff"), gapBorder, displayTitle);
    sheet.mergeCells(4, 1, 4, 6);
    const msg = sheet.getCell(4, 1);
    msg.value = "No period slots configured.";
    msg.font = { name: "Calibri", size: 11, color: { argb: "FF64748B" } };
    msg.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    msg.fill = excelFill("#ffffff");
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

  const { hdrRow } = applyExcelSchoolBrandingHeader(
    workbook,
    sheet,
    st,
    totalDataCols,
    titleSpan,
    sameRowLegend,
    white,
    gapBorder,
    displayTitle,
  );
  sheet.getRow(hdrRow).height = 34;
  if (String(displayTitle).includes("\n")) {
    const titleBannerRow = sameRowLegend ? 2 : 3;
    const lineCount = String(displayTitle).split("\n").filter(Boolean).length;
    sheet.getRow(titleBannerRow).height = Math.min(84, Math.round(28 + lineCount * 14));
    const tc = sheet.getCell(titleBannerRow, 1);
    tc.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  }
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

  sheet.getColumn(1).width =
    parseSchoolLogoImage(st?.school?.logoDataUrl) && titleSpan >= 2 ? 11 : 8;
  for (let i = 0; i < n; i += 1) {
    sheet.getColumn(excelGutterBeforeSlot(i)).width = 0.45;
    sheet.getColumn(excelSlotDataCol(i)).width = 14;
  }

  const dayFill = excelFill("#fafbfc");
  const dayBorder = borderAllThin("#e8eaf0");
  let r = hdrRow + 1;
  for (const day of workingDays) {
    sheet.getRow(r).height = 54;
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
      const entry =
        !slotActiveOnWeekday(slot, day) ? null : findScheduleEntry(schedCtx, viewMode, rowId, day, slot.slotNumber);
      const dataCol = excelSlotDataCol(i);
      applyExcelScheduleCell(sheet, r, dataCol, entry, schedCtx, viewMode);
    }
    r += 1;
  }

  sheet.views = [{ state: "frozen", ySplit: hdrRow }];
}

/** Row 1 banner for Subject Hours / Teacher Workload bundle sheets. */
function excelApplyReportSheetBanner(sheet, state, lastCol) {
  const { name, year } = schoolBrandingLines(state);
  sheet.mergeCells(1, 1, 1, lastCol);
  const c = sheet.getCell(1, 1);
  c.value = year
    ? {
        richText: [
          { font: { name: "Calibri", bold: true, size: 12, color: { argb: "FF111827" } }, text: `${name}\n` },
          { font: { name: "Calibri", size: 10, color: { argb: "FF64748B" } }, text: `Academic Year ${year}` },
        ],
      }
    : name;
  c.fill = excelFill("#fafafa");
  c.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  sheet.getRow(1).height = year ? 36 : 26;
}

function buildReportRows(state, entries) {
  const subjects = state.subjects || [];
  const divisions = state.divisions || [];
  const standards = state.standards || [];
  const teachers = state.teachers || [];
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

  const subjectHours = subjects.map((sub) => {
    const byStd = {};
    const reqByStd = {};
    let totalRequiredAll = 0;
    let eligibleDivCountAll = 0;
    standards.forEach((std) => {
      const eligibleDivs = divisions.filter((d) => d.standardId === std.id && subjectAppliesToDivision(sub, d));
      if (eligibleDivs.length === 0) return;
      const totalGot = eligibleDivs.reduce((acc, div) => acc + entries.filter((e) => e.divisionId === div.id && e.subjectId === sub.id).length, 0);
      const totalReq = eligibleDivs.reduce((acc, div) => acc + getDivisionRequiredWeekly(sub, div.id), 0);
      byStd[std.name] = Math.round(totalGot / Math.max(eligibleDivs.length, 1));
      reqByStd[std.name] = Math.round(totalReq / Math.max(eligibleDivs.length, 1));
      totalRequiredAll += totalReq;
      eligibleDivCountAll += eligibleDivs.length;
    });
    const requiredAvg = eligibleDivCountAll > 0 ? Math.round(totalRequiredAll / eligibleDivCountAll) : Math.max(1, Number(sub.weeklyPeriods) || 1);
    const requiredLabel = (sub.divisionLimits || []).length > 0 ? `${requiredAvg} avg` : String(requiredAvg);
    return { sub, byStd, reqByStd, requiredAvg, requiredLabel };
  });

  const teacherWorkload = teachers.map((t) => {
    const assigned = entries.filter((e) => e.teacherId === t.id).length;
    const lessonSlots = (state.periodSlots || []).filter((s) => s.slotType === "LESSON");
    const lunchNums = (state.periodSlots || []).filter((s) => s.slotType === "LUNCH").map((s) => s.slotNumber);
    const firstAfterLunch = lunchNums.length > 0
      ? lessonSlots.filter((s) => s.slotNumber > Math.max(...lunchNums)).sort((a, b) => a.slotNumber - b.slotNumber)[0]?.slotNumber ?? null
      : null;
    const morningLessonCount = lessonSlots.filter((s) => (firstAfterLunch ? s.slotNumber < firstAfterLunch : s.slotNumber <= Math.ceil(lessonSlots.length / 2))).length;
    const eveningLessonCount = lessonSlots.length - morningLessonCount;
    const derivedMaxPerDay = Math.max(0, Math.min(lessonSlots.length, Math.max(0, morningLessonCount - Number(t.freeMorningPeriods || 0)) + Math.max(0, eveningLessonCount - Number(t.freeEveningPeriods || 0))));
    const derivedMaxPerWeek = Math.max(30, derivedMaxPerDay * ((state.workingDays || []).length || 0));
    const max = Math.max(1, Number(t.maxPerWeek || 0) > 0 ? Number(t.maxPerWeek) : derivedMaxPerWeek);
    const pct = Math.round((assigned / max) * 100);
    const ctCount = (t.classTeacherDivisionIds || []).length;
    return { t, assigned, max, pct, ctCount };
  });

  const divisionCompletion = divisions.map((div) => {
    const std = standards.find((s) => s.id === div.standardId);
    const divSubjects = subjects.filter((s) => subjectAppliesToDivision(s, div));
    const ctTeacher = classTeacherForDivision(state, div.id);
    const ctSubject = classTeacherPrimarySubject(ctTeacher, subjects);
    const ctPrimaryId = ctSubject?.id ?? null;
    const scheduled = divSubjects.map((sub) => ({
      sub,
      required: getDivisionRequiredWeekly(sub, div.id),
      got: entries.filter((e) => e.divisionId === div.id && e.subjectId === sub.id).length,
      showCtBadge: Boolean(ctPrimaryId && ctPrimaryId === sub.id),
    }));
    const totalGot = scheduled.reduce((a, s) => a + s.got, 0);
    const totalReq = scheduled.reduce((a, s) => a + s.required, 0);
    const pct = Math.round(totalGot / Math.max(totalReq, 1) * 100);
    return { div, std, scheduled, pct, ctTeacher, divSubjectsCount: divSubjects.length };
  });

  return { subjectHours, teacherWorkload, divisionCompletion };
}

async function createExcelExport(scope, state, entries) {
  const entryList = Array.isArray(entries) ? entries : [];
  const s = normalizeExportScope(scope);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SchoolTime";
  workbook.created = new Date();

  if (s === "ALL_DIVISIONS") {
    const schedCtx = buildScheduleContext(state, entryList);
    for (const div of state.divisions || []) {
      const std = schedCtx.standardsById.get(div.standardId);
      const ct = classTeacherForDivision(state, div.id);
      const med = divisionMediumPlain(div, schedCtx.mediumsById);
      let bannerTitle = `Std ${std?.name || "?"} — Div ${div.name}`;
      bannerTitle += `\n${ct ? `Class teacher: ${teacherFullName(ct)}` : `Class teacher: Not assigned`}`;
      if (med) bannerTitle += `\nMedium: ${med}`;
      addExcelVisualTimetableSheet(
        workbook,
        `Std ${std?.name || "?"}-${div.name}-${div.id.slice(0, 6)}`,
        bannerTitle,
        schedCtx,
        "division",
        div.id,
        state,
      );
    }
    if (workbook.worksheets.length === 0) {
      workbook.addWorksheet("Info").addRow(["No divisions to export. Add standards and divisions, generate a timetable, then try again."]);
    }
    return {
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      filename: buildExportFilename(s, "xlsx"),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  if (s === "ALL_TEACHERS") {
    const schedCtx = buildScheduleContext(state, entryList);
    for (const t of state.teachers || []) {
      const name = `${t.firstName || ""} ${t.lastName || ""}`.trim();
      const ctLine = formatTeacherClassTeacherDivisions(state, t.id);
      const baseTitle = `Teacher · ${name || "Staff"}${t.employeeCode ? ` (${t.employeeCode})` : ""}`;
      const bannerTitle = `${baseTitle}\nClass teacher of: ${ctLine || "—"}`;
      addExcelVisualTimetableSheet(
        workbook,
        `${t.employeeCode}-${t.firstName}-${t.id.slice(0, 6)}`,
        bannerTitle,
        schedCtx,
        "teacher",
        t.id,
        state,
      );
    }
    if (workbook.worksheets.length === 0) {
      workbook.addWorksheet("Info").addRow(["No teachers to export. Add teachers, generate a timetable, then try again."]);
    }
    return {
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      filename: buildExportFilename(s, "xlsx"),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  if (s === "REPORTS_BUNDLE") {
    const { subjectHours, teacherWorkload, divisionCompletion } = buildReportRows(state, entryList);
    const standards = state.standards || [];
    const subFiltered = subjectHours.filter((sh) => Object.keys(sh.byStd).length > 0);
    const hFill = excelFill("#f7f8fc");
    const hBorder = borderAllThin("#e8eaf0");
    const cellBorder = borderAllThin("#e8eaf0");
    const zebra = [excelFill("#fafbfc"), excelFill("#ffffff")];

    const subjectLastCol = 3 + standards.length;
    const subjectSheet = workbook.addWorksheet("Subject Hours");
    excelApplyReportSheetBanner(subjectSheet, state, subjectLastCol);
    subjectSheet.mergeCells(2, 1, 2, subjectLastCol);
    const shSub = subjectSheet.getCell(2, 1);
    shSub.value = "Weekly Subject Hours (Average per Division)";
    shSub.font = { name: "Calibri", bold: true, size: 11, color: { argb: "FF334155" } };
    shSub.fill = excelFill("#ffffff");
    shSub.alignment = { vertical: "middle", horizontal: "left" };
    subjectSheet.getRow(3).values = ["Subject", "Cat.", "Required", ...standards.map((s) => `Std ${s.name}`)];
    subjectSheet.getRow(3).eachCell((cell) => {
      cell.font = { name: "Calibri", bold: true, size: 9, color: { argb: "FF8888AA" } };
      cell.fill = hFill;
      cell.border = hBorder;
      cell.alignment = { vertical: "middle", horizontal: "left" };
    });
    subFiltered.forEach(({ sub, byStd, reqByStd, requiredLabel, requiredAvg }, idx) => {
      const row = subjectSheet.getRow(4 + idx);
      row.values = [
        reportSubjectHoursSubjectLabel(sub),
        reportSubjectHoursCategoryShort(sub.category),
        requiredLabel,
        ...standards.map((s) => (byStd[s.name] != null ? byStd[s.name] : "")),
      ];
      const fill = zebra[idx % 2];
      row.eachCell((cell, colNumber) => {
        cell.fill = fill;
        cell.border = cellBorder;
        cell.font = { name: "Calibri", size: 10, color: { argb: "FF4A4A6A" } };
        if (colNumber >= 4) {
          const stdName = standards[colNumber - 4]?.name;
          const req = Number((stdName && reqByStd?.[stdName] != null) ? reqByStd[stdName] : requiredAvg) || 0;
          const v = cell.value;
          const n = v === "" || v == null ? null : Number(v);
          if (n != null && !Number.isNaN(n)) {
            cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: n >= req ? "FF059669" : "FFD97706" } };
          }
        }
      });
    });
    subjectSheet.columns.forEach((col, i) => {
      col.width = i === 0 ? 22 : i === 1 ? 14 : 12;
    });
    subjectSheet.views = [{ state: "frozen", ySplit: 3 }];

    const teacherSheet = workbook.addWorksheet("Teacher Workload");
    excelApplyReportSheetBanner(teacherSheet, state, 6);
    teacherSheet.mergeCells(2, 1, 2, 6);
    const twSub = teacherSheet.getCell(2, 1);
    twSub.value = "Teacher Workload";
    twSub.font = { name: "Calibri", bold: true, size: 11, color: { argb: "FF334155" } };
    twSub.fill = excelFill("#ffffff");
    twSub.alignment = { vertical: "middle", horizontal: "left" };
    teacherSheet.getRow(3).values = ["Teacher", "Code", "Assigned", "Max", "CT", "Utilization %"];
    teacherSheet.getRow(3).eachCell((cell) => {
      cell.font = { name: "Calibri", bold: true, size: 9, color: { argb: "FF8888AA" } };
      cell.fill = hFill;
      cell.border = hBorder;
    });
    const ctArgb = { argb: "FF4F46E5" };
    teacherWorkload.forEach(({ t, assigned, max, pct, ctCount }, idx) => {
      const row = teacherSheet.getRow(4 + idx);
      row.getCell(1).value = `${t.firstName} ${t.lastName}`;
      row.getCell(2).value = t.employeeCode;
      row.getCell(3).value = assigned;
      row.getCell(4).value = max;
      row.getCell(5).value =
        ctCount > 0
          ? {
              richText: [{ font: { name: "Calibri", size: 11, color: ctArgb }, text: `CT ×${ctCount}` }],
            }
          : "—";
      row.getCell(6).value = `${pct}%`;
      const fill = zebra[idx % 2];
      for (let c = 1; c <= 6; c += 1) {
        const cell = row.getCell(c);
        cell.fill = fill;
        cell.border = cellBorder;
        if (c === 5 && ctCount > 0) continue;
        cell.font = { name: "Calibri", size: 10, color: { argb: "FF4A4A6A" } };
      }
    });
    teacherSheet.columns.forEach((col, i) => {
      col.width = i === 5 ? 12 : 18;
    });
    teacherSheet.views = [{ state: "frozen", ySplit: 3 }];

    const divSheet = workbook.addWorksheet("Division Completion");
    excelApplyReportSheetBanner(divSheet, state, 3);
    divSheet.mergeCells(2, 1, 2, 3);
    const dcSub = divSheet.getCell(2, 1);
    dcSub.value = "Division Completion — scheduled vs required per subject";
    dcSub.font = { name: "Calibri", bold: true, size: 11, color: { argb: "FF334155" } };
    dcSub.fill = excelFill("#ffffff");
    dcSub.alignment = { vertical: "middle", horizontal: "left" };

    const dcCtArgb = { argb: "FF000000" };
    let dr = 3;
    divisionCompletion.forEach((block) => {
      divSheet.mergeCells(dr, 1, dr, 3);
      const head = divSheet.getCell(dr, 1);
      const pctColor = block.pct > 90 ? "FF059669" : "FFD97706";
      const ctLine = block.ctTeacher ? teacherFullName(block.ctTeacher) : "Not assigned";
      head.value = {
        richText: [
          {
            font: { name: "Calibri", bold: true, size: 11, color: { argb: pctColor } },
            text: `Std ${block.std?.name || "?"} — Div ${block.div.name}    ${block.pct}%\n`,
          },
          {
            font: { name: "Calibri", size: 9, color: { argb: "FF64748B" } },
            text: `${block.divSubjectsCount} subject${block.divSubjectsCount !== 1 ? "s" : ""}\n`,
          },
          { font: { name: "Calibri", size: 9, color: { argb: "FF4A4A6A" } }, text: `Class teacher: ${ctLine}` },
        ],
      };
      head.fill = excelFill("#ffffff");
      head.border = borderAllThin("#e8eaf0");
      head.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      divSheet.getRow(dr).height = 52;
      dr += 1;
      divSheet.getRow(dr).values = ["Subject", "Got", "Required"];
      divSheet.getRow(dr).eachCell((cell) => {
        cell.font = { name: "Calibri", bold: true, size: 9, color: { argb: "FF8888AA" } };
        cell.fill = hFill;
        cell.border = hBorder;
      });
      dr += 1;
      block.scheduled.forEach((s, si) => {
        const row = divSheet.getRow(dr);
        row.getCell(1).value = s.showCtBadge
          ? {
              richText: [
                { font: { name: "Calibri", size: 10, color: { argb: "FF4A4A6A" } }, text: s.sub.name },
                { font: { name: "Calibri", size: 10, bold: true, color: dcCtArgb }, text: "\u00A0CT" },
              ],
            }
          : s.sub.name;
        row.getCell(2).value = s.got;
        row.getCell(3).value = s.required;
        const fill = zebra[si % 2];
        row.getCell(1).fill = fill;
        row.getCell(1).border = cellBorder;
        if (!s.showCtBadge) {
          row.getCell(1).font = { name: "Calibri", size: 10, color: { argb: "FF4A4A6A" } };
        }
        const ok = s.got >= s.required;
        row.getCell(2).fill = fill;
        row.getCell(2).border = cellBorder;
        row.getCell(2).font = { name: "Calibri", size: 10, bold: true, color: { argb: ok ? "FF059669" : "FFDC2626" } };
        row.getCell(3).fill = fill;
        row.getCell(3).border = cellBorder;
        row.getCell(3).font = { name: "Calibri", size: 10, color: { argb: "FF4A4A6A" } };
        dr += 1;
      });
      dr += 1;
    });
    divSheet.getColumn(1).width = 28;
    divSheet.getColumn(2).width = 10;
    divSheet.getColumn(3).width = 10;
    divSheet.views = [{ state: "frozen", ySplit: 2 }];

    return {
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      filename: buildExportFilename(s, "xlsx"),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  throw new Error("UNSUPPORTED_SCOPE");
}

export async function generateExportFile({ type, scope, state, entries }) {
  const entryList = Array.isArray(entries) ? entries : [];
  const typeNorm = normalizeExportType(type);
  const scopeNorm = normalizeExportScope(scope);
  const stateNorm = withExportSchoolOrdering(state);
  if (typeNorm === "PDF") return createPdfExport(scopeNorm, stateNorm, entryList);
  if (typeNorm === "EXCEL") return createExcelExport(scopeNorm, stateNorm, entryList);
  throw new Error("UNSUPPORTED_TYPE");
}

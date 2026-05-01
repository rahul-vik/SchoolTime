/** Pure strings for Weekly Subject Hours (reports UI + PDF/Excel exports). */

export function reportSubjectHoursCategoryShort(category) {
  const c = String(category || "").trim().toUpperCase();
  const map = {
    LANGUAGE: "Lang",
    NON_CORE: "Non-core",
    EXTRA_CURRICULAR: "Extra",
    CORE: "Core",
    PRACTICAL: "Pract.",
  };
  return map[c] || String(category || "").replace(/_/g, " ");
}

export function reportSubjectHoursSubjectLabel(sub) {
  if (!sub) return "";
  if (String(sub.category || "").toUpperCase() === "LANGUAGE") {
    const code = String(sub.code || "").trim();
    return code ? code.toUpperCase() : String(sub.name || "");
  }
  return String(sub.name || "");
}

import { useEffect, useRef, useState } from "react";
import { T, UiIcon, useBreakpoint } from "../shared/uiPrimitives";
export {
  filterSubjectsList,
  filterTeachersList,
  subjectMatchesSearch,
  teacherMatchesSearch,
  teacherStandardIds,
} from "../../../shared/academicListFilters.js";

/** Multi-select pill filter (empty selection = no filter / show all). */
export function MultiSelectFilter({ label, options, selectedIds, onChange, isMobile = false }) {
  const selectedSet = new Set((selectedIds || []).map(String));
  const toggle = (id) => {
    const key = String(id);
    onChange((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      const set = new Set(current.map(String));
      if (set.has(key)) return current.filter((x) => String(x) !== key);
      return [...current, id];
    });
  };

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => onChange([])}
          style={{
            padding: isMobile ? "7px 11px" : "5px 10px",
            borderRadius: 999,
            border: `1px solid ${selectedSet.size === 0 ? T.brand : T.surfaceBorder}`,
            background: selectedSet.size === 0 ? T.brand + "14" : T.surfaceAlt,
            color: selectedSet.size === 0 ? T.brand : T.textMid,
            fontSize: isMobile ? 12 : 11,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            minHeight: isMobile ? 32 : "auto",
          }}
        >
          All
        </button>
        {options.map((opt) => {
          const on = selectedSet.has(String(opt.id));
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggle(opt.id)}
              style={{
                padding: isMobile ? "7px 11px" : "5px 10px",
                borderRadius: 999,
                border: `1px solid ${on ? T.brand : T.surfaceBorder}`,
                background: on ? T.brand : T.surfaceAlt,
                color: on ? "#fff" : T.textMid,
                fontSize: isMobile ? 12 : 11,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                minHeight: isMobile ? 32 : "auto",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ListSearchFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search by name or code…",
  searchInputId = "academic-list-search",
  searchMaxWidth = 400,
  filters = [],
  filteredCount,
  totalCount,
  onRefresh,
}) {
  const { isMobile } = useBreakpoint();
  const [panelOpen, setPanelOpen] = useState(false);
  const rootRef = useRef(null);
  const panelId = `${searchInputId}-filter-panel`;
  const hasFilters = filters.length > 0;
  const hasActiveFilters = filters.some((f) => (f.selectedIds || []).length > 0);
  const activeFilterCount = filters.reduce((n, f) => n + (f.selectedIds?.length || 0), 0);
  const hasSearch = Boolean(String(search || "").trim());
  const hasActiveQuery = hasSearch || hasActiveFilters;
  const inputPadRight = hasFilters ? 38 : 10;

  useEffect(() => {
    if (!panelOpen) return;
    const onOutsideClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setPanelOpen(false);
    };
    document.addEventListener("click", onOutsideClick);
    return () => document.removeEventListener("click", onOutsideClick);
  }, [panelOpen]);

  const clearAllFilters = () => {
    for (const f of filters) f.onChange([]);
  };

  const resetSearchAndFilters = () => {
    onSearchChange("");
    clearAllFilters();
    setPanelOpen(false);
    onRefresh?.();
  };

  const iconSize = isMobile ? 40 : 34;
  const iconButtonStyle = (active) => ({
    width: iconSize,
    height: iconSize,
    borderRadius: 8,
    border: `1px solid ${active ? T.brand : T.surfaceBorder}`,
    background: active ? T.brand + "14" : T.surfaceAlt,
    cursor: "pointer",
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  });

  const searchWidth = isMobile ? "100%" : `min(100%, ${searchMaxWidth}px)`;
  const controlsWidth = isMobile ? "100%" : `min(100%, calc(${searchMaxWidth}px + 42px))`;
  const showResultCount = hasActiveQuery && filteredCount != null && totalCount != null;

  return (
    <div ref={rootRef} style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: isMobile ? 8 : 10,
          alignItems: "center",
          justifyContent: "flex-start",
          width: "100%",
          maxWidth: controlsWidth,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: "1 1 100%",
            minWidth: 0,
            maxWidth: "100%",
          }}
        >
          <div style={{ position: "relative", width: searchWidth, flex: "1 1 auto", minWidth: 0 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", display: "flex", pointerEvents: "none", color: T.textSoft, zIndex: 1 }}>
              <UiIcon name="search" size={16} stroke={T.textSoft} />
            </span>
            <input
              id={searchInputId}
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              aria-expanded={hasFilters ? panelOpen : undefined}
              aria-controls={hasFilters ? panelId : undefined}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: `9px ${inputPadRight}px 9px 34px`,
                borderRadius: 8,
                border: `1px solid ${panelOpen || hasActiveQuery ? T.brand : T.surfaceBorder}`,
                fontSize: isMobile ? 16 : 13,
                fontFamily: "inherit",
                background: T.surface,
              }}
            />
            {hasFilters ? (
              <button
                type="button"
                aria-label={panelOpen ? "Close filter panel" : "Open filter panel"}
                aria-expanded={panelOpen}
                aria-controls={panelId}
                onClick={(e) => {
                  e.stopPropagation();
                  setPanelOpen((open) => !open);
                }}
                style={{
                  position: "absolute",
                  right: 4,
                  top: "50%",
                  transform: "translateY(-50%)",
                  ...iconButtonStyle(panelOpen || hasActiveFilters),
                  width: isMobile ? 32 : 28,
                  height: isMobile ? 32 : 28,
                  borderRadius: 6,
                  zIndex: 2,
                }}
              >
                <UiIcon name="filter" size={15} stroke={panelOpen || hasActiveFilters ? T.brand : T.textMid} />
                {hasActiveFilters ? (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      top: 3,
                      right: 3,
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: T.brand,
                      border: `1.5px solid ${T.surface}`,
                    }}
                  />
                ) : null}
              </button>
            ) : null}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              aria-label="Clear search and filters"
              title="Clear and refresh list"
              onClick={resetSearchAndFilters}
              style={iconButtonStyle(hasActiveQuery)}
            >
              <UiIcon name="refresh" size={isMobile ? 18 : 16} stroke={hasActiveQuery ? T.brand : T.textMid} />
            </button>
            {showResultCount ? (
              <div
                aria-live="polite"
                style={{
                  fontSize: isMobile ? 11 : 12,
                  color: T.textMid,
                  lineHeight: 1.3,
                  whiteSpace: "nowrap",
                }}
              >
                {isMobile ? (
                  <>
                    <strong>{filteredCount}</strong> / {totalCount}
                  </>
                ) : (
                  <>
                    Showing <strong>{filteredCount}</strong> of {totalCount}
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {panelOpen && hasFilters ? (
        <div
          id={panelId}
          role="region"
          aria-label="Filter panel"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            marginTop: 8,
            width: controlsWidth,
            padding: isMobile ? 12 : 14,
            background: T.surface,
            borderRadius: 10,
            border: `1px solid ${T.surfaceBorder}`,
            boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
              <UiIcon name="filter" size={16} stroke={T.brand} />
              <span style={{ fontSize: isMobile ? 12 : 13, fontWeight: 700, color: T.text }}>Filters</span>
              {activeFilterCount > 0 ? (
                <span style={{ fontSize: 11, fontWeight: 700, color: T.brand, background: T.brand + "14", padding: "2px 8px", borderRadius: 999 }}>
                  {activeFilterCount} selected
                </span>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Close filter panel"
              onClick={() => setPanelOpen(false)}
              style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: "transparent", color: T.textSoft, cursor: "pointer", display: "flex", alignItems: "center" }}
            >
              <UiIcon name="close" size={16} stroke={T.textSoft} />
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {filters.map((f) => (
              <MultiSelectFilter key={f.key} label={f.label} options={f.options} selectedIds={f.selectedIds} onChange={f.onChange} isMobile={isMobile} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

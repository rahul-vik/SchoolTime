import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  clearToken,
  getAuditLogs,
  getApiKeys,
  getUsage,
  getLatestTimetable,
  getUsers,
  generateTimetable as apiGenerateTimetable,
  getMe,
  hasStoredSession,
  loadState as apiLoadState,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  saveState as apiSaveState,
  downloadTimetableExport,
  getPublicHealth,
} from "./api";
import schoolTimeLogo from "../logo/SchoolTime_logo.png";
import { AuthScreen } from "./features/auth/AuthScreen";
import { authenticateUser, bootstrapSession, fetchAdminData } from "./features/auth/sessionService";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { SetupPage, StandardsPage } from "./features/setup/SetupPages";
import { SubjectsPage, TeachersPage } from "./features/academics/AcademicPages";
import { PeriodsPage, RulesPage } from "./features/scheduling/SchedulingPages";
import { ExportsPage, GeneratePage, ReportsPage, TimetablePage } from "./features/timetable/TimetablePages";
import { generateTimetableFlow, queueExportFlow, swapTimetableCells, applyUndoLastManualEdit } from "./features/timetable/appActions";
import { timetableRunKey } from "./features/timetable/timetableRunKey";
import { BRAND_FONT, Btn, EmptyState, Field, Input, Modal, PillSelect, ProgressBar, Select, StatusBadge, T, Toast, UiIcon, css, useBreakpoint } from "./features/shared/uiPrimitives";
import { DivisionPill, TeacherDivisionMapper } from "./features/shared/assignmentComponents";
import { TimetableGrid } from "./features/shared/TimetableGrid";
import { getSlotMeta, parseDivisionInput } from "./features/shared/schedulingHelpers";
import { defaultTimetableViewSelection, isEntityIdInList, resolveTimetableViewLists } from "./features/shared/idLookups";
import { SEED } from "./features/timetable/clientEngine";
import { applyTenantStateWithFallback, buildTenantState } from "./features/timetable/tenantState";
import { AppUpdateBanner } from "./features/shared/AppUpdateBanner";
import { getClientReleaseSnapshot, serverReleaseIsNewer } from "./features/shared/appUpdateUtils";

/** Sidebar app-title row and main top bar use the same height so they align edge-to-edge. */
const APP_HEADER_STRIP_HEIGHT = 76;
const APP_UPDATE_POLL_MS = 5 * 60 * 1000;
const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
const APP_BUILD_NUMBER = typeof __APP_BUILD_NUMBER__ !== "undefined" ? __APP_BUILD_NUMBER__ : "0";
const APP_RELEASE_LABEL = typeof __APP_RELEASE_LABEL__ !== "undefined" ? __APP_RELEASE_LABEL__ : `V${APP_VERSION} (${APP_BUILD_NUMBER})`;
const SHOW_ENV_TAGS = Boolean(import.meta.env?.DEV);

function buildSchoolCodeFromOrgName(name, fallback = "SCH") {
  const text = String(name || "").trim().toUpperCase();
  const words = text.replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  let code = words.slice(0, 3).map((w) => w[0]).join("");
  if (code.length < 4) {
    const compact = words.join("").replace(/[^A-Z0-9]/g, "");
    code = (code + compact).slice(0, 6);
  }
  return (code || fallback).slice(0, 8);
}

function getLiveAcademicDefaults(now = new Date()) {
  // School year follows June -> March pattern by default.
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const startYear = month >= 5 ? year : year - 1;
  const endYear = startYear + 1;
  return {
    academicYear: `${startYear}-${String(endYear).slice(-2)}`,
    yearStart: `${startYear}-06-01`,
    yearEnd: `${endYear}-03-31`,
  };
}

function NavIcon({ name, size = 18, stroke = "currentColor" }) {
  const common = { fill: "none", stroke, strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" };
  const icons = {
    dashboard: (<><rect x="3" y="3" width="7" height="7" rx="1.5" {...common} /><rect x="14" y="3" width="7" height="7" rx="1.5" {...common} /><rect x="3" y="14" width="7" height="7" rx="1.5" {...common} /><rect x="14" y="14" width="7" height="7" rx="1.5" {...common} /></>),
    school: (<><path d="M12 5L3 9l9 4 9-4-9-4z" {...common} /><path d="M6 10.5V16a6.5 3.5 0 0 0 12 0v-5.5" {...common} /></>),
    standards: (<><path d="M4 19.5V6.8A2.8 2.8 0 0 1 6.8 4H20" {...common} /><path d="M8 20V7.8A1.8 1.8 0 0 1 9.8 6H21v14H9.8A1.8 1.8 0 0 0 8 21.8" {...common} /></>),
    subjects: (<><path d="M6 4h10a3 3 0 0 1 3 3v13H6z" {...common} /><path d="M6 4h-1a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h1" {...common} /><path d="M9.5 9.5h6M9.5 13h6" {...common} /></>),
    teachers: (<><circle cx="12" cy="8" r="3.2" {...common} /><path d="M5 19.5a7 7 0 0 1 14 0" {...common} /><path d="M18 10.5a2.2 2.2 0 1 0 0 .01" {...common} /></>),
    periods: (<><circle cx="12" cy="12" r="8.2" {...common} /><path d="M12 7.5V12l3.5 2" {...common} /></>),
    preferences: (<><path d="M12 3.5l2.2 2.4 3.2-.2.8 3.1 2.9 1.4-1.4 2.9 1.4 2.9-2.9 1.4-.8 3.1-3.2-.2L12 20.5l-2.2 2.4-3.2-.2-.8-3.1-2.9-1.4 1.4-2.9-1.4-2.9 2.9-1.4.8-3.1 3.2.2L12 3.5z" {...common} /><circle cx="12" cy="12" r="2.8" {...common} /></>),
    create: (<><path d="M12 5v14M5 12h14" {...common} /></>),
    timetable: (<><rect x="3" y="5" width="18" height="16" rx="2.5" {...common} /><path d="M8 3.5v3M16 3.5v3M3 9.5h18M8 13h3M13 13h3M8 17h3" {...common} /></>),
    reports: (<><path d="M4 20h16" {...common} /><path d="M7 20v-5M12 20V9M17 20v-8" {...common} /></>),
    downloads: (<><path d="M12 4v10" {...common} /><path d="M8.5 10.5L12 14l3.5-3.5" {...common} /><rect x="4" y="17" width="16" height="3.5" rx="1.2" {...common} /></>),
    settings: (<><path d="M12 3.8l1.7 1.9 2.5-.2.6 2.4 2.3 1.1-1.1 2.3 1.1 2.3-2.3 1.1-.6 2.4-2.5-.2-1.7 1.9-1.7-1.9-2.5.2-.6-2.4-2.3-1.1 1.1-2.3-1.1-2.3 2.3-1.1.6-2.4 2.5.2L12 3.8z" {...common} /><circle cx="12" cy="12" r="2.5" {...common} /></>),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
      {icons[name] || icons.dashboard}
    </svg>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const bp = useBreakpoint();
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [user, setUser] = useState(null);
  const [creditsRemaining, setCreditsRemaining] = useState(0);
  const [orgUsers, setOrgUsers] = useState([]);
  const [usageData, setUsageData] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notification, setNotification] = useState(null);
  const notifyTimerRef = useRef(null);
  const [appUpdateAvailable, setAppUpdateAvailable] = useState(false);

  const [school, setSchool] = useState(SEED.school);
  const [mediums, setMediums] = useState(SEED.mediums);
  const [standards, setStandards] = useState(SEED.standards);
  const [divisions, setDivisions] = useState(SEED.divisions);
  const [subjects, setSubjects] = useState(SEED.subjects);
  const [teachers, setTeachers] = useState(SEED.teachers);
  const [periodSlots, setPeriodSlots] = useState(SEED.periodSlots);
  const [workingDays, setWorkingDays] = useState(SEED.workingDays);
  const [schedulingRules, setSchedulingRules] = useState(SEED.schedulingRules);
  const [classTeacherPreferences, setClassTeacherPreferences] = useState(SEED.classTeacherPreferences || { enabled: false, ctFirstPeriodDays: [], dailyPrimaryMinPeriods: 0, schedulingMode: "STRICT" });
  const [teacherSubjects] = useState([]);
  const [freePeriodRules] = useState([]);
  const [subjectAllocations] = useState([]);
  const [exportJobs, setExportJobs] = useState([]);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  const [timetable, setTimetable] = useState(null);
  const [timetableStatus, setTimetableStatus] = useState("DRAFT");
  const [viewMode, setViewMode] = useState("division");
  const [selectedDivisionId, setSelectedDivisionId] = useState(SEED.divisions[0]?.id);
  const [selectedTeacherId, setSelectedTeacherId] = useState(SEED.teachers[0]?.id);
  const [pendingSwap, setPendingSwap] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const timetableRef = useRef(null);
  const [generatingProgress, setGeneratingProgress] = useState(0);
  const [timetableSolver, setTimetableSolver] = useState("hybrid");
  const [stateHydrated, setStateHydrated] = useState(false);
  const [settingsTab, setSettingsTab] = useState("usage");
  const permissions = user?.permissions || {};
  const canManageConfig = Boolean(permissions.canConfigureTimetable);
  const canManageBilling = Boolean(permissions.canManageCredits);

  const dismissNotification = useCallback(() => {
    if (notifyTimerRef.current != null) {
      window.clearTimeout(notifyTimerRef.current);
      notifyTimerRef.current = null;
    }
    setNotification(null);
  }, []);

  const notify = useCallback((msg, type = "success") => {
    if (notifyTimerRef.current != null) {
      window.clearTimeout(notifyTimerRef.current);
      notifyTimerRef.current = null;
    }
    setNotification({ msg, type });
    const persistUntilDismiss = type === "danger";
    const delayMs = persistUntilDismiss ? null : type === "warning" ? 24000 : 4200;
    if (delayMs != null) {
      notifyTimerRef.current = window.setTimeout(() => {
        notifyTimerRef.current = null;
        setNotification(null);
      }, delayMs);
    }
  }, []);

  useEffect(() => {
    timetableRef.current = timetable;
  }, [timetable]);

  useEffect(() => () => {
    if (notifyTimerRef.current != null) window.clearTimeout(notifyTimerRef.current);
  }, []);

  useEffect(() => {
    const onAuthExpired = () => {
      setUser(null);
      setCreditsRemaining(0);
      setOrgUsers([]);
      setUsageData(null);
      setAuditLogs([]);
      setApiKeys([]);
      setTimetable(null);
      setTimetableStatus("DRAFT");
      setStateHydrated(true);
      setAuthLoading(false);
      setPage("dashboard");
      setSettingsTab("usage");
      notify("Session expired. Please sign in again.", "warning");
    };
    window.addEventListener("schooltime:auth-expired", onAuthExpired);
    return () => window.removeEventListener("schooltime:auth-expired", onAuthExpired);
  }, [notify]);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const client = getClientReleaseSnapshot();
    let cancelled = false;

    const tick = async () => {
      try {
        const data = await getPublicHealth();
        if (cancelled || !data?.release) return;
        setAppUpdateAvailable(serverReleaseIsNewer(data.release, client));
      } catch {
        if (!cancelled) setAppUpdateAvailable(false);
      }
    };

    tick();
    const interval = window.setInterval(tick, APP_UPDATE_POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onDoc = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [userMenuOpen]);

  const navigate = useCallback((p) => { setPage(p); setMobileMenuOpen(false); setUserMenuOpen(false); }, []);
  const applyOrgDefaultsToSchool = useCallback((u) => {
    const orgName = String(u?.orgName || "").trim();
    if (!orgName) return;
    const liveAcademic = getLiveAcademicDefaults();
    setSchool((prev) => ({
      ...prev,
      name: orgName,
      code: buildSchoolCodeFromOrgName(orgName, prev?.code || "SCH"),
      academicYear: liveAcademic.academicYear,
      yearStart: liveAcademic.yearStart,
      yearEnd: liveAcademic.yearEnd,
    }));
  }, []);

  const applyTenantState = useCallback((state) => {
    applyTenantStateWithFallback(state, SEED, {
      setSchool,
      setMediums,
      setStandards,
      setDivisions,
      setSubjects,
      setTeachers,
      setPeriodSlots,
      setWorkingDays,
      setSchedulingRules,
      setClassTeacherPreferences,
      setExportJobs,
      setTimetable,
      setTimetableStatus,
    });
  }, []);

  const getTenantState = useCallback(() => ({
    ...buildTenantState({
      school,
      mediums,
      standards,
      divisions,
      subjects,
      teachers,
      periodSlots,
      workingDays,
      schedulingRules,
      classTeacherPreferences,
      exportJobs: (exportJobs || []).slice(0, 3),
      lastGeneratedTimetable: timetableStatus === "GENERATED" ? timetable : null,
      teacherSubjects,
      freePeriodRules,
      subjectAllocations,
    }),
  }), [school, mediums, standards, divisions, subjects, teachers, periodSlots, workingDays, schedulingRules, classTeacherPreferences, exportJobs, timetable, timetableStatus, teacherSubjects, freePeriodRules, subjectAllocations]);

  const saveTenantStateNow = useCallback(async ({ schoolOverride, section } = {}) => {
    const payload = {
      ...getTenantState(),
      ...(schoolOverride ? { school: schoolOverride } : {}),
    };
    await apiSaveState(payload, section);
  }, [getTenantState]);

  useEffect(() => {
    let cancelled = false;
    bootstrapSession({
      hasStoredSession,
      getMe,
      loadState: apiLoadState,
      loadLatestTimetable: getLatestTimetable,
      clearToken,
      applyTenantState,
      onUser: setUser,
      onCredits: setCreditsRemaining,
      onTimetable: setTimetable,
      onTimetableStatus: setTimetableStatus,
      onHydrated: setStateHydrated,
      onLoading: setAuthLoading,
      onNoState: applyOrgDefaultsToSchool,
      isCancelled: () => cancelled,
    });
    return () => {
      cancelled = true;
    };
  }, [applyTenantState, applyOrgDefaultsToSchool]);

  useEffect(() => {
    if (!user || !stateHydrated) return;
    const handle = setTimeout(() => {
      apiSaveState(getTenantState()).catch(() => null);
    }, 500);
    return () => clearTimeout(handle);
  }, [user, stateHydrated, getTenantState]);

  // Clean up invalid division refs when divisions change
  useEffect(() => {
    const divIds = new Set(divisions.map(d => d.id));
    setTeachers(prev => prev.map(t => ({
      ...t,
      assignedDivisionIds: (t.assignedDivisionIds || []).filter(id => divIds.has(id)),
      classTeacherDivisionIds: (t.classTeacherDivisionIds || []).filter(id => divIds.has(id)),
      primaryClassTeacherDivisionId: divIds.has(t.primaryClassTeacherDivisionId) ? t.primaryClassTeacherDivisionId : null,
    })));
  }, [divisions]);

  // Keep timetable selection aligned with loaded entities.
  // Without this, the dropdown can start with an id that no longer exists in `divisions`/`teachers`,
  // causing the first timetable grid to render empty until the user changes the selection.
  useEffect(() => {
    const live = { divisions, standards, subjects, teachers };
    const { divisions: viewDivisions } = resolveTimetableViewLists(timetable, live);
    if (viewDivisions.length === 0) return;
    if (!isEntityIdInList(viewDivisions, selectedDivisionId)) {
      setSelectedDivisionId(viewDivisions[0]?.id ?? null);
    }
  }, [divisions, standards, subjects, teachers, timetable, selectedDivisionId]);

  useEffect(() => {
    const live = { divisions, standards, subjects, teachers };
    const { teachers: viewTeachers } = resolveTimetableViewLists(timetable, live);
    if (viewTeachers.length === 0) return;
    if (!isEntityIdInList(viewTeachers, selectedTeacherId)) {
      setSelectedTeacherId(viewTeachers[0]?.id ?? null);
    }
  }, [divisions, standards, subjects, teachers, timetable, selectedTeacherId]);

  const fetchAndApplyAdminData = useCallback(async (userInput) => {
    if (!userInput) return;
    try {
      const data = await fetchAdminData({
        permissions: userInput.permissions,
        getUsers,
        getUsage,
        getAuditLogs,
        getApiKeys,
      });
      setOrgUsers(data.users);
      setUsageData(data.usage);
      setAuditLogs(data.logs);
      setApiKeys(data.apiKeys);
    } catch {}
  }, []);

  const resetTimetableViewState = useCallback(() => {
    setPendingSwap(null);
    setIsEditMode(false);
    setExportJobs([]);
  }, []);

  const activeTimetableRunKey = useMemo(
    () => (timetableStatus === "GENERATING" ? "generating" : timetableRunKey(timetable)),
    [timetable, timetableStatus],
  );

  const generateTimetable = useCallback(() => {
    const payload = {
      school, mediums, standards, divisions, subjects, teachers, periodSlots, workingDays, schedulingRules,
      classTeacherPreferences,
      teacherSubjects, freePeriodRules, subjectAllocations,
      timetableSolver,
    };
    generateTimetableFlow({
      payload,
      divisions,
      teachers,
      apiGenerateTimetable,
      setTimetableStatus,
      setGeneratingProgress,
      setTimetable,
      setCreditsRemaining,
      creditsRemaining,
      notify,
      navigate,
      onGenerationStart: resetTimetableViewState,
      onSuccess: async (resp) => {
        resetTimetableViewState();
        const tt = resp?.timetable;
        if (tt) {
          const live = { divisions, standards, subjects, teachers };
          const next = defaultTimetableViewSelection(tt, live);
          if (next.divisionId) setSelectedDivisionId(next.divisionId);
          if (next.teacherId) setSelectedTeacherId(next.teacherId);
          setViewMode("division");
        }
        await fetchAndApplyAdminData(user);
      },
      onGenerationFailed: async () => {
        try {
          const latest = await getLatestTimetable();
          if (latest?.timetable) {
            setTimetable(latest.timetable);
            setTimetableStatus("GENERATED");
          }
        } catch {
          // keep FAILED with no timetable if restore fails
        }
      },
    });
  }, [school, mediums, standards, divisions, subjects, teachers, periodSlots, workingDays, schedulingRules, classTeacherPreferences, teacherSubjects, freePeriodRules, subjectAllocations, timetableSolver, creditsRemaining, notify, navigate, fetchAndApplyAdminData, user, resetTimetableViewState]);

  const refreshCreditsFromServer = useCallback(async () => {
    try {
      const m = await getMe();
      setCreditsRemaining(m.license?.creditsRemaining ?? 0);
    } catch {
      // ignore
    }
  }, []);

  const handleBuyPack = useCallback(() => {
    if (!canManageBilling) {
      notify("Your role cannot request credit purchases", "warning");
      return;
    }
    setSettingsTab("purchase-credits");
    navigate("settings");
  }, [canManageBilling, navigate, notify]);

  const handleAuth = useCallback(async (form) => {
    const resp = await authenticateUser({
      mode: authMode,
      form,
      login: apiLogin,
      register: apiRegister,
      loadState: apiLoadState,
      loadLatestTimetable: getLatestTimetable,
      applyTenantState,
      onUser: setUser,
      onCredits: setCreditsRemaining,
      onTimetable: setTimetable,
      onTimetableStatus: setTimetableStatus,
      onHydrated: setStateHydrated,
      onNoState: applyOrgDefaultsToSchool,
    });
    await fetchAndApplyAdminData(resp?.user);
  }, [authMode, applyTenantState, fetchAndApplyAdminData, applyOrgDefaultsToSchool]);

  const logout = useCallback(async () => {
    try {
      await apiSaveState(getTenantState());
    } catch {
      // best-effort state persistence before logout
    }
    await apiLogout();
    setUser(null);
    setCreditsRemaining(0);
    setOrgUsers([]);
    setUsageData(null);
    setAuditLogs([]);
    setApiKeys([]);
    setTimetable(null);
    setTimetableStatus("DRAFT");
    setSettingsTab("usage");
    setPage("dashboard");
  }, [getTenantState]);

  const refreshAdminData = useCallback(async () => {
    await fetchAndApplyAdminData(user);
  }, [user, fetchAndApplyAdminData]);

  useEffect(() => {
    if (!user) return;
    refreshAdminData();
  }, [user, refreshAdminData]);

  useEffect(() => {
    const restricted = new Set(["setup", "standards", "subjects", "teachers", "periods", "rules", "generate", "exports"]);
    if (!canManageConfig && restricted.has(page)) {
      setPage("dashboard");
    }
  }, [canManageConfig, page]);

  const handleCellClick = useCallback((entry) => {
    swapTimetableCells({
      entry,
      isEditMode,
      pendingSwap,
      setPendingSwap,
      setTimetable,
      notify,
    });
  }, [isEditMode, pendingSwap, notify]);

  const handleUndoManualEdit = useCallback(() => {
    setPendingSwap(null);
    const prev = timetableRef.current;
    if (!prev) return;
    const r = applyUndoLastManualEdit(prev);
    if (!r.changed) {
      notify(r.message, r.level);
      return;
    }
    setTimetable(r.timetable);
    timetableRef.current = r.timetable;
    notify(r.message, r.level);
  }, [notify]);

  const queueExport = useCallback((type, scope) => {
    queueExportFlow({
      type,
      scope,
      setExportJobs,
      notify,
      downloadExport: (exportType, exportScope) => downloadTimetableExport(exportType, exportScope, timetable?.runId),
    });
  }, [notify, timetable?.runId]);

  const downloadExportNow = useCallback(async (type, scope) => {
    try {
      await downloadTimetableExport(type, scope, timetable?.runId);
      notify(`${type} file downloaded`);
    } catch (error) {
      notify(error.message || "Download failed", "danger");
    }
  }, [notify, timetable?.runId]);

  const removeExportJob = useCallback((jobId) => {
    setExportJobs((prev) => prev.filter((j) => j.id !== jobId));
  }, []);

  const openProfileFromMenu = useCallback(() => {
    setUserMenuOpen(false);
    setSettingsTab("profile");
    setPage("settings");
  }, []);

  const appUpdateStrip = import.meta.env.PROD && appUpdateAvailable ? <AppUpdateBanner /> : null;

  if (authLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: T.surfaceAlt, color: T.text }}>
        {appUpdateStrip}
        <div style={{ flex: 1, minHeight: 0, display: "grid", placeItems: "center", color: T.textMid }}>Loading your school dashboard...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", minHeight: 0, background: T.surfaceAlt, color: T.text }}>
        {appUpdateStrip}
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <AuthScreen mode={authMode} setMode={setAuthMode} onSubmit={handleAuth} ui={{ T, Input, Btn, Field, css }} branding={{ BRAND_FONT, schoolTimeLogo }} />
        </div>
      </div>
    );
  }

  const activeRulesCount = schedulingRules.filter(r => r.isActive).length;
  const schoolDisplayLogo = school?.logoDataUrl || "";

  const navItems = [
    { id: "dashboard", label: "Dashboard", iconKey: "dashboard" },
    ...(canManageConfig ? [
      { id: "setup",     label: "School Setup", iconKey: "school" },
      { id: "standards", label: "Standards",   iconKey: "standards" },
      { id: "subjects",  label: "Subjects",    iconKey: "subjects" },
      { id: "periods",   label: "Periods",     iconKey: "periods" },
      { id: "teachers",  label: "Teachers",    iconKey: "teachers" },
      { id: "rules",     label: "Preferences", iconKey: "preferences", badge: activeRulesCount },
    ] : []),
    ...(canManageConfig ? [{ id: "generate", label: "Create", iconKey: "create" }] : []),
    { id: "timetable", label: "Timetable",   iconKey: "timetable" },
    { id: "reports",   label: "Reports",     iconKey: "reports" },
    ...(canManageConfig ? [{ id: "exports", label: "Downloads", iconKey: "downloads" }] : []),
    { id: "settings",  label: "Settings",    iconKey: "settings" },
  ];
  const renderPage = () => {
    switch (page) {
      case "dashboard":  return <DashboardPage key={`dashboard-${activeTimetableRunKey}`} school={school} subjects={subjects} divisions={divisions} teachers={teachers} standards={standards} timetable={timetable} timetableStatus={timetableStatus} schedulingRules={schedulingRules} navigate={navigate} bp={bp} ui={{ T, BRAND_FONT, css, Btn, ProgressBar, StatusBadge }} />;
      case "settings":   return <SettingsPage
        settingsTab={settingsTab}
        setSettingsTab={setSettingsTab}
        usageData={usageData}
        navigate={navigate}
        users={orgUsers}
        me={user}
        availableRoles={user?.availableRoles || ["owner", "admin", "staff"]}
        permissions={permissions}
        onRefresh={refreshAdminData}
        onUserUpdated={setUser}
        notify={notify}
        apiKeys={apiKeys}
        logs={auditLogs}
        setLogs={setAuditLogs}
        onCreditsUpdated={refreshCreditsFromServer}
        ui={{ T, css, Btn, Input, Select, Field, Modal }}
      />;
      case "setup":      return <SetupPage school={school} setSchool={setSchool} mediums={mediums} setMediums={setMediums} workingDays={workingDays} setWorkingDays={setWorkingDays} notify={notify} onConfirmSave={(nextSchool) => saveTenantStateNow({ schoolOverride: nextSchool, section: "setup" }).catch(() => null)} ui={{ T, css, Btn, Input, Select }} />;
      case "standards":  return <StandardsPage standards={standards} setStandards={setStandards} divisions={divisions} setDivisions={setDivisions} mediums={mediums} notify={notify} helpers={{ parseDivisionInput, DivisionPill }} ui={{ T, css, Btn, Input, Select, Modal, EmptyState }} />;
      case "subjects":   return <SubjectsPage subjects={subjects} setSubjects={setSubjects} standards={standards} divisions={divisions} mediums={mediums} notify={notify} ui={{ T, css, Btn, ProgressBar, EmptyState, Modal, Input, Select, Field }} />;
      case "teachers":   return <TeachersPage teachers={teachers} setTeachers={setTeachers} subjects={subjects} mediums={mediums} divisions={divisions} standards={standards} periodSlots={periodSlots} workingDays={workingDays} timetable={timetable} timetableStatus={timetableStatus} notify={notify} helpers={{ TeacherDivisionMapper }} ui={{ T, css, Btn, EmptyState, Modal, Input, Select, Field, ProgressBar }} />;
      case "periods":    return <PeriodsPage periodSlots={periodSlots} setPeriodSlots={setPeriodSlots} workingDays={workingDays} notify={notify} ui={{ T, css, Btn, Modal, Input, Select, Field }} />;
      case "rules":      return <RulesPage schedulingRules={schedulingRules} setSchedulingRules={setSchedulingRules} classTeacherPreferences={classTeacherPreferences} setClassTeacherPreferences={setClassTeacherPreferences} subjects={subjects} divisions={divisions} standards={standards} periodSlots={periodSlots} workingDays={workingDays} notify={notify} helpers={{ getSlotMeta }} ui={{ T, css, Btn, EmptyState, Modal, Input, PillSelect, Field }} />;
      case "generate":   return <GeneratePage timetableStatus={timetableStatus} generatingProgress={generatingProgress} onGenerate={generateTimetable} timetable={timetable} divisions={divisions} subjects={subjects} teachers={teachers} standards={standards} notify={notify} navigate={navigate} schedulingRules={schedulingRules} classTeacherPreferences={classTeacherPreferences} setClassTeacherPreferences={setClassTeacherPreferences} timetableSolver={timetableSolver} setTimetableSolver={setTimetableSolver} ui={{ T, css, Btn, ProgressBar, Modal, PillSelect }} />;
      case "timetable":  return <TimetablePage key={`timetable-${activeTimetableRunKey}`} timetable={timetable} timetableStatus={timetableStatus} divisions={divisions} teachers={teachers} subjects={subjects} schedulingRules={schedulingRules} periodSlots={periodSlots} workingDays={workingDays} standards={standards} mediums={mediums} viewMode={viewMode} setViewMode={setViewMode} selectedDivisionId={selectedDivisionId} setSelectedDivisionId={setSelectedDivisionId} selectedTeacherId={selectedTeacherId} setSelectedTeacherId={setSelectedTeacherId} isEditMode={isEditMode} setIsEditMode={setIsEditMode} pendingSwap={pendingSwap} setPendingSwap={setPendingSwap} onCellClick={handleCellClick} onUndoManualEdit={handleUndoManualEdit} notify={notify} navigate={navigate} helpers={{ TimetableGrid }} ui={{ T, css, Btn, EmptyState }} />;
      case "reports":    return <ReportsPage key={`reports-${activeTimetableRunKey}`} timetable={timetable} divisions={divisions} subjects={subjects} teachers={teachers} setTeachers={setTeachers} mediums={mediums} standards={standards} workingDays={workingDays} periodSlots={periodSlots} navigate={navigate} notify={notify} ui={{ T, css, Btn, EmptyState, ProgressBar, Modal, Input, Select, Field }} />;
      case "exports":    return <ExportsPage key={`exports-${activeTimetableRunKey}`} exportJobs={exportJobs} onExport={queueExport} onDownload={downloadExportNow} onRemoveExportJob={removeExportJob} timetable={timetable} notify={notify} navigate={navigate} helpers={{ StatusBadge }} ui={{ T, css, Btn, EmptyState }} />;
      default: return null;
    }
  };

  const SidebarNav = ({ collapsed }) => (
    <nav style={{ flex: 1, padding: "8px 0", overflowY: "auto" }}>
      {navItems.map(item => (
        <button key={item.id} onClick={() => navigate(item.id)}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: collapsed ? "11px 0" : "11px 18px", justifyContent: collapsed ? "center" : "flex-start", background: page === item.id ? "rgba(255,255,255,0.13)" : "transparent", border: "none", cursor: "pointer", color: page === item.id ? "#fff" : "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: page === item.id ? 700 : 400, borderLeft: page === item.id ? `3px solid ${T.gold}` : "3px solid transparent", transition: "all 0.15s", textAlign: "left", position: "relative" }}>
          <NavIcon name={item.iconKey} size={17} stroke={page === item.id ? "#fff" : "rgba(255,255,255,0.72)"} />
          {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
          {!collapsed && item.badge > 0 && <span style={{ background: T.gold, color: "#fff", borderRadius: 20, fontSize: 11, fontWeight: 800, padding: "1px 7px" }}>{item.badge}</span>}
          {collapsed && item.badge > 0 && <span style={{ position: "absolute", top: 6, right: 6, background: T.gold, color: "#fff", borderRadius: "50%", fontSize: 8, fontWeight: 800, width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>{item.badge}</span>}
        </button>
      ))}
    </nav>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: T.surfaceAlt, color: T.text }}>
      {appUpdateStrip}
      <div style={{ display: "flex", flex: 1, minHeight: 0, minWidth: 0 }}>
      {notification && <Toast msg={notification.msg} type={notification.type} onDismiss={dismissNotification} />}

      {/* Desktop Sidebar */}
      {!bp.isMobile && (
        <div style={{ width: sidebarOpen ? 220 : 62, background: T.brand, transition: "width 0.22s ease", flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden", zIndex: 100 }}>
          <div style={{ height: APP_HEADER_STRIP_HEIGHT, boxSizing: "border-box", padding: "0 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 12 }}>
            <img src={schoolTimeLogo} alt="SchoolTime logo" style={{ width: 34, height: 34, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
            {sidebarOpen && <div><div style={{ color: "#fff", fontSize: 16, fontWeight: 700, letterSpacing: "0.02em", fontFamily: BRAND_FONT }}>SchoolTime</div><div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>School Edition</div></div>}
          </div>
          <SidebarNav collapsed={!sidebarOpen} />
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: sidebarOpen ? "8px 10px 6px" : "8px 0 6px", textAlign: "center" }}>
            <div style={{ color: "rgba(255,255,255,0.48)", fontSize: 10, letterSpacing: "0.03em" }}>
              {APP_RELEASE_LABEL}
              {SHOW_ENV_TAGS ? " · LOCAL · DEV" : ""}
            </div>
          </div>
          <button onClick={() => setSidebarOpen(p => !p)} style={{ padding: "12px", background: "rgba(255,255,255,0.04)", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", fontSize: 12, textAlign: "center" }}>{sidebarOpen ? "◀" : "▶"}</button>
        </div>
      )}

      {/* Mobile overlay */}
      {bp.isMobile && mobileMenuOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1500, display: "flex" }}>
          <div style={{ flex: "none", width: 260, background: T.brand, display: "flex", flexDirection: "column", animation: "slideRight 0.22s ease" }}>
            <div style={{ height: APP_HEADER_STRIP_HEIGHT, boxSizing: "border-box", padding: "0 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <img src={schoolTimeLogo} alt="SchoolTime logo" style={{ width: 34, height: 34, borderRadius: 10, objectFit: "cover" }} />
                <div><div style={{ color: "#fff", fontSize: 16, fontWeight: 700, letterSpacing: "0.02em", fontFamily: BRAND_FONT }}>SchoolTime</div><div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>School Edition</div></div>
              </div>
              <button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", justifyContent: "center" }}><UiIcon name="close" size={18} stroke="rgba(255,255,255,0.55)" /></button>
            </div>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {schoolDisplayLogo ? (
                  <img src={schoolDisplayLogo} alt={`${school.name} logo`} style={{ width: 18, height: 18, borderRadius: 5, objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <span style={{ width: 18, height: 18, borderRadius: 5, background: T.surfaceAlt, border: `1px solid ${T.surfaceBorder}`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <UiIcon name="hat" size={12} stroke={T.textSoft} />
                  </span>
                )}
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{school.name}</div>
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{school.academicYear}</div>
            </div>
            <SidebarNav collapsed={false} />
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "8px 14px 10px", textAlign: "center", color: "rgba(255,255,255,0.48)", fontSize: 10, letterSpacing: "0.03em" }}>
              {APP_RELEASE_LABEL}
              {SHOW_ENV_TAGS ? " · LOCAL · DEV" : ""}
            </div>
          </div>
          <div style={{ flex: 1, background: "rgba(0,0,0,0.5)" }} onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", minWidth: 0, width: "100%" }}>
        {/* Topbar */}
        <div style={{ background: T.surface, borderBottom: `1px solid ${T.surfaceBorder}`, padding: bp.isMobile ? "0 10px" : "0 24px", height: APP_HEADER_STRIP_HEIGHT, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexShrink: 0, position: "sticky", top: 0, zIndex: 100 }}>
          <div style={{ display: "flex", alignItems: "center", gap: bp.isMobile ? 8 : 12, minWidth: 0, flex: 1 }}>
            {bp.isMobile && <button type="button" onClick={() => setMobileMenuOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, padding: 4, color: T.text }} aria-label="Open menu">☰</button>}
            {!bp.isMobile && (
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
                <p style={{ margin: 0, fontSize: 12, color: T.textMid, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, lineHeight: 1.25 }}>
                  {schoolDisplayLogo ? (
                    <img src={schoolDisplayLogo} alt="" style={{ width: 18, height: 18, borderRadius: 5, objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 18, height: 18, borderRadius: 5, background: T.surfaceAlt, border: `1px solid ${T.surfaceBorder}`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <UiIcon name="hat" size={12} stroke={T.textSoft} />
                    </span>
                  )}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{school.name} · {school.academicYear}</span>
                </p>
                {timetableStatus === "GENERATED" && (
                  <div style={{ display: "flex", alignItems: "center", paddingLeft: 26 }}>
                    <StatusBadge status="GENERATED" />
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: bp.isMobile ? 4 : 8, flexShrink: 0 }}>
            <button
              type="button"
              onClick={handleBuyPack}
              disabled={!canManageBilling}
              aria-label="Open credit purchase"
              title={canManageBilling ? "Open credit purchase" : "Your role cannot request credits"}
              style={{
                ...css.badge(T.brand),
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontWeight: 600,
                fontSize: bp.isMobile ? 11 : 12,
                whiteSpace: "nowrap",
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                height: bp.isMobile ? 31 : 36,
                padding: bp.isMobile ? "0 8px" : "0 10px",
                cursor: canManageBilling ? "pointer" : "not-allowed",
                opacity: canManageBilling ? 1 : 0.68,
                color: T.text,
                transition: "border-color 0.16s ease, opacity 0.16s ease",
                borderRadius: 999,
              }}
            >
              <span style={{ color: T.textMid, fontWeight: 600 }}>
                Credit
              </span>
              <span style={{ fontWeight: 700 }}>{creditsRemaining}</span>
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <circle cx="12" cy="12" r="8.5" fill="#22C55E" />
                <circle cx="12" cy="12" r="5.8" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
              </svg>
              <span
                style={{
                  border: "none",
                  background: "transparent",
                  color: canManageBilling ? T.textSoft : "rgba(26,26,46,0.4)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: bp.isMobile ? 12 : 13,
                  fontWeight: 600,
                  lineHeight: 1,
                  cursor: canManageBilling ? "pointer" : "not-allowed",
                  opacity: canManageBilling ? 0.85 : 0.55,
                  padding: 0,
                  textShadow: "none",
                  transition: "color 0.18s ease",
                }}
              >
                +
              </span>
            </button>
            {timetableStatus === "GENERATED" && bp.isMobile && <StatusBadge status="GENERATED" />}
            <div ref={userMenuRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                aria-label="Account menu"
                style={{
                  width: bp.isMobile ? 31 : 36,
                  height: bp.isMobile ? 31 : 36,
                  borderRadius: "50%",
                  background: "#0E3E5F",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 800,
                  border: userMenuOpen ? "2px solid rgba(255,255,255,0.45)" : "1px solid rgba(255,255,255,0.22)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.16)",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {(user.fullName || "A").charAt(0).toUpperCase()}
              </button>
              {userMenuOpen && (
                <div
                  role="menu"
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 6px)",
                    minWidth: 168,
                    background: T.surface,
                    border: `1px solid ${T.surfaceBorder}`,
                    borderRadius: 10,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    padding: 6,
                    zIndex: 400,
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={openProfileFromMenu}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      border: "none",
                      borderRadius: 8,
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                      color: T.text,
                      fontFamily: "inherit",
                    }}
                  >
                    Edit profile
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setUserMenuOpen(false); logout(); }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      border: "none",
                      borderRadius: 8,
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                      color: T.danger,
                      fontFamily: "inherit",
                    }}
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, padding: bp.isMobile ? "16px 12px" : "24px", overflow: "auto", overflowX: "hidden", paddingBottom: bp.isMobile ? 80 : 24, minWidth: 0, width: "100%", boxSizing: "border-box" }}>
          {renderPage()}
        </div>

        {bp.isMobile && (
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: T.surface, borderTop: `1px solid ${T.surfaceBorder}`, display: "flex", zIndex: 200, boxShadow: "0 -2px 12px rgba(0,0,0,0.08)" }}>
            {[{id:"dashboard",iconKey:"dashboard",label:"Home"},{id:"timetable",iconKey:"timetable",label:"View"},{id:"rules",iconKey:"preferences",label:"Prefs",badge:activeRulesCount},{id:"generate",iconKey:"create",label:"Create"},{id:"reports",iconKey:"reports",label:"Reports"}].map(item => (
              <button key={item.id} onClick={() => navigate(item.id)}
                style={{ flex: 1, padding: "8px 4px 6px", background: "transparent", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: page === item.id ? T.brand : T.textSoft, position: "relative" }}>
                <NavIcon name={item.iconKey} size={19} stroke={page === item.id ? T.brand : T.textSoft} />
                <span style={{ fontSize: 9, fontWeight: page === item.id ? 700 : 400 }}>{item.label}</span>
                {item.badge > 0 && <span style={{ position: "absolute", top: 4, right: "calc(50% - 16px)", background: T.gold, color: "#fff", borderRadius: 20, fontSize: 8, fontWeight: 800, padding: "1px 5px" }}>{item.badge}</span>}
                {page === item.id && <div style={{ position: "absolute", bottom: 0, left: "20%", right: "20%", height: 2, background: T.brand, borderRadius: 2 }} />}
              </button>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideUp { from { transform:translateY(30px);opacity:0 } to { transform:translateY(0);opacity:1 } }
        @keyframes slideRight { from { transform:translateX(-100%) } to { transform:translateX(0) } }
        @keyframes toastIn { from { transform:translateX(-50%) translateY(16px);opacity:0 } to { transform:translateX(-50%) translateY(0);opacity:1 } }
        @keyframes spin { to { transform:rotate(360deg) } }
        @keyframes coinPulse {
          0%, 100% { transform: scale(1); opacity: 0.95; }
          50% { transform: scale(1.08); opacity: 1; }
        }
        * { box-sizing:border-box; -webkit-tap-highlight-color:transparent }
        input,select,textarea,button { font-family:inherit }
        ::-webkit-scrollbar { width:5px;height:5px }
        ::-webkit-scrollbar-thumb { background:${T.surfaceBorder};border-radius:3px }
      `}</style>
      </div>
    </div>
  );
}


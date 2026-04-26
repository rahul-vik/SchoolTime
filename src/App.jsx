import { useState, useEffect, useCallback, useRef } from "react";
import {
  clearToken,
  getAuditLogs,
  getApiKeys,
  getUsage,
  getUsers,
  generateTimetable as apiGenerateTimetable,
  getMe,
  hasStoredSession,
  loadState as apiLoadState,
  login as apiLogin,
  logout as apiLogout,
  purchasePack as apiPurchasePack,
  register as apiRegister,
  saveState as apiSaveState,
  downloadTimetableExport,
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
import { generateTimetableFlow, purchasePackFlow, queueExportFlow, swapTimetableCells } from "./features/timetable/appActions";
import { BRAND_FONT, Btn, EmptyState, Field, Input, Modal, ProgressBar, Select, StatusBadge, T, Toast, UiIcon, css, useBreakpoint } from "./features/shared/uiPrimitives";
import { DivisionPill, TeacherDivisionMapper } from "./features/shared/assignmentComponents";
import { TimetableGrid } from "./features/shared/TimetableGrid";
import { getSlotMeta, parseDivisionInput } from "./features/shared/schedulingHelpers";
import { SEED } from "./features/timetable/clientEngine";
import { applyTenantStateWithFallback, buildTenantState } from "./features/timetable/tenantState";

/** Sidebar app-title row and main top bar use the same height so they align edge-to-edge. */
const APP_HEADER_STRIP_HEIGHT = 76;

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

  const [school, setSchool] = useState(SEED.school);
  const [mediums, setMediums] = useState(SEED.mediums);
  const [standards, setStandards] = useState(SEED.standards);
  const [divisions, setDivisions] = useState(SEED.divisions);
  const [subjects, setSubjects] = useState(SEED.subjects);
  const [teachers, setTeachers] = useState(SEED.teachers);
  const [periodSlots, setPeriodSlots] = useState(SEED.periodSlots);
  const [workingDays, setWorkingDays] = useState(SEED.workingDays);
  const [schedulingRules, setSchedulingRules] = useState(SEED.schedulingRules);
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
  const [generatingProgress, setGeneratingProgress] = useState(0);
  const [stateHydrated, setStateHydrated] = useState(false);
  const [settingsTab, setSettingsTab] = useState("usage");
  const isManager = user?.role === "owner" || user?.role === "admin";
  const canManageConfig = isManager;
  const canManageBilling = isManager;

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

  useEffect(() => () => {
    if (notifyTimerRef.current != null) window.clearTimeout(notifyTimerRef.current);
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
      teacherSubjects,
      freePeriodRules,
      subjectAllocations,
    }),
  }), [school, mediums, standards, divisions, subjects, teachers, periodSlots, workingDays, schedulingRules, teacherSubjects, freePeriodRules, subjectAllocations]);

  useEffect(() => {
    let cancelled = false;
    bootstrapSession({
      hasStoredSession,
      getMe,
      loadState: apiLoadState,
      clearToken,
      applyTenantState,
      onUser: setUser,
      onCredits: setCreditsRemaining,
      onHydrated: setStateHydrated,
      onLoading: setAuthLoading,
      isCancelled: () => cancelled,
    });
    return () => {
      cancelled = true;
    };
  }, [applyTenantState]);

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
    })));
  }, [divisions]);

  const fetchAndApplyAdminData = useCallback(async (role) => {
    if (!role) return;
    try {
      const data = await fetchAdminData({
        role,
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

  const generateTimetable = useCallback(() => {
    const payload = {
      school, mediums, standards, divisions, subjects, teachers, periodSlots, workingDays, schedulingRules,
      teacherSubjects, freePeriodRules, subjectAllocations,
    };
    generateTimetableFlow({
      payload,
      apiGenerateTimetable,
      setTimetableStatus,
      setGeneratingProgress,
      setTimetable,
      setCreditsRemaining,
      creditsRemaining,
      notify,
      navigate,
      onSuccess: async () => {
        await fetchAndApplyAdminData(user?.role);
      },
    });
  }, [school, mediums, standards, divisions, subjects, teachers, periodSlots, workingDays, schedulingRules, teacherSubjects, freePeriodRules, subjectAllocations, creditsRemaining, notify, navigate, fetchAndApplyAdminData, user?.role]);

  const handleBuyPack = useCallback(async () => {
    await purchasePackFlow({
      canManageBilling,
      apiPurchasePack,
      setCreditsRemaining,
      creditsRemaining,
      notify,
      onSuccess: async () => {
        await fetchAndApplyAdminData(user?.role);
      },
    });
  }, [canManageBilling, creditsRemaining, notify, fetchAndApplyAdminData, user?.role]);

  const handleAuth = useCallback(async (form) => {
    const resp = await authenticateUser({
      mode: authMode,
      form,
      login: apiLogin,
      register: apiRegister,
      loadState: apiLoadState,
      applyTenantState,
      onUser: setUser,
      onCredits: setCreditsRemaining,
      onHydrated: setStateHydrated,
    });
    await fetchAndApplyAdminData(resp?.user?.role);
  }, [authMode, applyTenantState, fetchAndApplyAdminData]);

  const logout = useCallback(async () => {
    await apiLogout();
    window.location.reload();
  }, []);

  const refreshAdminData = useCallback(async () => {
    await fetchAndApplyAdminData(user?.role);
  }, [user?.role, fetchAndApplyAdminData]);

  useEffect(() => {
    if (!user) return;
    refreshAdminData();
  }, [user, refreshAdminData]);

  useEffect(() => {
    const restricted = new Set(["setup", "standards", "subjects", "teachers", "periods", "rules"]);
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

  const queueExport = useCallback((type, scope) => {
    queueExportFlow({
      type,
      scope,
      setExportJobs,
      notify,
      downloadExport: downloadTimetableExport,
    });
  }, [notify]);

  const downloadExportNow = useCallback(async (type, scope) => {
    try {
      await downloadTimetableExport(type, scope);
      notify(`${type} file downloaded`);
    } catch (error) {
      notify(error.message || "Download failed", "danger");
    }
  }, [notify]);

  const removeExportJob = useCallback((jobId) => {
    setExportJobs((prev) => prev.filter((j) => j.id !== jobId));
  }, []);

  const openProfileFromMenu = useCallback(() => {
    setUserMenuOpen(false);
    setSettingsTab("profile");
    setPage("settings");
  }, []);

  if (authLoading) {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: T.textMid }}>Loading your school dashboard...</div>;
  }

  if (!user) {
    return <AuthScreen mode={authMode} setMode={setAuthMode} onSubmit={handleAuth} ui={{ T, Input, Btn }} branding={{ BRAND_FONT, schoolTimeLogo }} />;
  }

  const activeRulesCount = schedulingRules.filter(r => r.isActive).length;
  const schoolDisplayLogo = school?.logoDataUrl || schoolTimeLogo;

  const navItems = [
    { id: "dashboard", label: "Dashboard", iconKey: "dashboard" },
    ...(canManageConfig ? [
      { id: "setup",     label: "School Setup", iconKey: "school" },
      { id: "standards", label: "Standards",   iconKey: "standards" },
      { id: "subjects",  label: "Subjects",    iconKey: "subjects" },
      { id: "teachers",  label: "Teachers",    iconKey: "teachers" },
      { id: "periods",   label: "Periods",     iconKey: "periods" },
      { id: "rules",     label: "Preferences", iconKey: "preferences", badge: activeRulesCount },
    ] : []),
    { id: "generate",  label: "Create",      iconKey: "create" },
    { id: "timetable", label: "Timetable",   iconKey: "timetable" },
    { id: "reports",   label: "Reports",     iconKey: "reports" },
    { id: "exports",   label: "Downloads",   iconKey: "downloads" },
    { id: "settings",  label: "Settings",    iconKey: "settings" },
  ];
  const renderPage = () => {
    switch (page) {
      case "dashboard":  return <DashboardPage school={school} subjects={subjects} divisions={divisions} teachers={teachers} standards={standards} timetable={timetable} timetableStatus={timetableStatus} schedulingRules={schedulingRules} navigate={navigate} bp={bp} ui={{ T, BRAND_FONT, css, Btn, ProgressBar, StatusBadge }} />;
      case "settings":   return <SettingsPage
        settingsTab={settingsTab}
        setSettingsTab={setSettingsTab}
        usageData={usageData}
        navigate={navigate}
        users={orgUsers}
        me={user}
        onRefresh={refreshAdminData}
        onUserUpdated={setUser}
        notify={notify}
        apiKeys={apiKeys}
        logs={auditLogs}
        setLogs={setAuditLogs}
        ui={{ T, css, Btn, Input, Select, Field }}
      />;
      case "setup":      return <SetupPage school={school} setSchool={setSchool} mediums={mediums} setMediums={setMediums} workingDays={workingDays} setWorkingDays={setWorkingDays} notify={notify} ui={{ T, css, Btn, Input, Select }} />;
      case "standards":  return <StandardsPage standards={standards} setStandards={setStandards} divisions={divisions} setDivisions={setDivisions} mediums={mediums} notify={notify} helpers={{ parseDivisionInput, DivisionPill }} ui={{ T, css, Btn, Input, Select, Modal, EmptyState }} />;
      case "subjects":   return <SubjectsPage subjects={subjects} setSubjects={setSubjects} standards={standards} mediums={mediums} notify={notify} ui={{ T, css, Btn, ProgressBar, EmptyState, Modal, Input, Select, Field }} />;
      case "teachers":   return <TeachersPage teachers={teachers} setTeachers={setTeachers} subjects={subjects} mediums={mediums} divisions={divisions} standards={standards} notify={notify} helpers={{ TeacherDivisionMapper }} ui={{ T, css, Btn, EmptyState, Modal, Input, Select, Field }} />;
      case "periods":    return <PeriodsPage periodSlots={periodSlots} setPeriodSlots={setPeriodSlots} notify={notify} ui={{ T, css, Btn, Modal, Input, Select, Field }} />;
      case "rules":      return <RulesPage schedulingRules={schedulingRules} setSchedulingRules={setSchedulingRules} subjects={subjects} periodSlots={periodSlots} workingDays={workingDays} notify={notify} helpers={{ getSlotMeta }} ui={{ T, css, Btn, EmptyState, Modal, Input, Select, Field }} />;
      case "generate":   return <GeneratePage timetableStatus={timetableStatus} generatingProgress={generatingProgress} onGenerate={generateTimetable} timetable={timetable} divisions={divisions} subjects={subjects} teachers={teachers} standards={standards} notify={notify} navigate={navigate} schedulingRules={schedulingRules} ui={{ T, css, Btn, ProgressBar, Modal }} />;
      case "timetable":  return <TimetablePage timetable={timetable} timetableStatus={timetableStatus} divisions={divisions} teachers={teachers} subjects={subjects} periodSlots={periodSlots} workingDays={workingDays} standards={standards} viewMode={viewMode} setViewMode={setViewMode} selectedDivisionId={selectedDivisionId} setSelectedDivisionId={setSelectedDivisionId} selectedTeacherId={selectedTeacherId} setSelectedTeacherId={setSelectedTeacherId} isEditMode={isEditMode} setIsEditMode={setIsEditMode} pendingSwap={pendingSwap} setPendingSwap={setPendingSwap} onCellClick={handleCellClick} notify={notify} navigate={navigate} helpers={{ TimetableGrid }} ui={{ T, css, Btn, EmptyState }} />;
      case "reports":    return <ReportsPage timetable={timetable} divisions={divisions} subjects={subjects} teachers={teachers} standards={standards} workingDays={workingDays} periodSlots={periodSlots} navigate={navigate} ui={{ T, css, Btn, EmptyState, ProgressBar }} />;
      case "exports":    return <ExportsPage exportJobs={exportJobs} onExport={queueExport} onDownload={downloadExportNow} onRemoveExportJob={removeExportJob} timetable={timetable} notify={notify} navigate={navigate} helpers={{ StatusBadge }} ui={{ T, css, Btn, EmptyState }} />;
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
    <div style={{ display: "flex", height: "100vh", background: T.surfaceAlt, color: T.text }}>
      {notification && <Toast msg={notification.msg} type={notification.type} onDismiss={dismissNotification} />}

      {/* Desktop Sidebar */}
      {!bp.isMobile && (
        <div style={{ width: sidebarOpen ? 220 : 62, background: T.brand, transition: "width 0.22s ease", flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden", zIndex: 100 }}>
          <div style={{ height: APP_HEADER_STRIP_HEIGHT, boxSizing: "border-box", padding: "0 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 12 }}>
            <img src={schoolTimeLogo} alt="SchoolTime logo" style={{ width: 34, height: 34, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
            {sidebarOpen && <div><div style={{ color: "#fff", fontSize: 16, fontWeight: 700, letterSpacing: "0.02em", fontFamily: BRAND_FONT }}>SchoolTime</div><div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>School Edition</div></div>}
          </div>
          <SidebarNav collapsed={!sidebarOpen} />
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
                <img src={schoolDisplayLogo} alt={`${school.name} logo`} style={{ width: 18, height: 18, borderRadius: 5, objectFit: "cover", flexShrink: 0 }} />
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{school.name}</div>
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{school.academicYear}</div>
            </div>
            <SidebarNav collapsed={false} />
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
                  <img src={schoolDisplayLogo} alt="" style={{ width: 18, height: 18, borderRadius: 5, objectFit: "cover", flexShrink: 0 }} />
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
            <span style={{ ...css.badge(T.brand), maxWidth: bp.isMobile ? 84 : undefined, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bp.isMobile ? creditsRemaining : `Balance: ${creditsRemaining}`}</span>
            <Btn variant="ghost" size="sm" onClick={handleBuyPack} disabled={!canManageBilling} style={bp.isMobile ? { padding: "5px 8px", minWidth: 34 } : undefined}>+10</Btn>
            {timetableStatus === "GENERATED" && bp.isMobile && <StatusBadge status="GENERATED" />}
            <div ref={userMenuRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                aria-label="Account menu"
                style={{
                  width: bp.isMobile ? 28 : 32,
                  height: bp.isMobile ? 28 : 32,
                  borderRadius: "50%",
                  background: T.brand,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 800,
                  border: userMenuOpen ? `2px solid ${T.gold}` : "2px solid transparent",
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
        * { box-sizing:border-box; -webkit-tap-highlight-color:transparent }
        input,select,textarea,button { font-family:inherit }
        ::-webkit-scrollbar { width:5px;height:5px }
        ::-webkit-scrollbar-thumb { background:${T.surfaceBorder};border-radius:3px }
      `}</style>
    </div>
  );
}


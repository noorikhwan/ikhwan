import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  Box,
  BrainCircuit,
  Building,
  Building2,
  Cable,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Cloud,
  Command,
  FileSpreadsheet,
  Globe,
  IdCard,
  Layers,
  LayoutGrid,
  Leaf,
  LogOut,
  MapPin,
  Menu,
  Moon,
  OctagonAlert,
  PanelLeftClose,
  PanelLeftOpen,
  QrCode,
  Radio,
  RotateCcw,
  Search,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Sun,
  Ticket,
  Tv,
  Users,
  Volume2,
  VolumeX,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { AlertsView } from './components/AlertsView';
import { BmsView } from './components/BmsView';
import { CommandPaletteItem, CommandPaletteModal } from './components/CommandPaletteModal';
import { IncidentWarRoomModal } from './components/IncidentWarRoomModal';
import { NocWallboardModal } from './components/NocWallboardModal';
import { OverviewView } from './components/OverviewView';
import { PuteriRanniaChatBox, PuteriRanniaSiteContext } from './components/PuteriRanniaChatBox';
import { QrAssetScannerModal } from './components/QrAssetScannerModal';
import { RackMapView } from './components/RackMapView';
import { RulesView } from './components/RulesView';
import { ServerDetailDrawer } from './components/ServerDetailDrawer';
import { ServersView } from './components/ServersView';
import { OperatorAvatar, ShiftsTeamView } from './components/ShiftsTeamView';
import { FacilityChartMetric } from './components/TelemetryChart';
import { TicketingView } from './components/TicketingView';
import { NotificationToast, ToastStack } from './components/ToastStack';
import { VisitorManagementView } from './components/VisitorManagementView';

// Route-level code splitting for heavy 3D, analytics, and enterprise views
const AiPredictiveView = lazy(() =>
  import('./components/AiPredictiveView').then((m) => ({ default: m.AiPredictiveView }))
);
const CableConnectivityView = lazy(() =>
  import('./components/CableConnectivityView').then((m) => ({ default: m.CableConnectivityView }))
);
const CapacityPlannerView = lazy(() =>
  import('./components/CapacityPlannerView').then((m) => ({ default: m.CapacityPlannerView }))
);
const CmmsMopView = lazy(() =>
  import('./components/CmmsMopView').then((m) => ({ default: m.CmmsMopView }))
);
const DigitalTwin3DView = lazy(() =>
  import('./components/DigitalTwin3DView').then((m) => ({ default: m.DigitalTwin3DView }))
);
const EsgSustainabilityView = lazy(() =>
  import('./components/EsgSustainabilityView').then((m) => ({ default: m.EsgSustainabilityView }))
);
const GlobalNocView = lazy(() =>
  import('./components/GlobalNocView').then((m) => ({ default: m.GlobalNocView }))
);
const PhysicalSecurityView = lazy(() =>
  import('./components/PhysicalSecurityView').then((m) => ({ default: m.PhysicalSecurityView }))
);
const PowerChainSldView = lazy(() =>
  import('./components/PowerChainSldView').then((m) => ({ default: m.PowerChainSldView }))
);
const ProtocolsAuditView = lazy(() =>
  import('./components/ProtocolsAuditView').then((m) => ({ default: m.ProtocolsAuditView }))
);
const ReportsView = lazy(() =>
  import('./components/ReportsView').then((m) => ({ default: m.ReportsView }))
);
const TenantBillingView = lazy(() =>
  import('./components/TenantBillingView').then((m) => ({ default: m.TenantBillingView }))
);
import {
  bulkAcknowledgeAlerts,
  bulkClearAlerts,
  bulkIgnoreAlerts,
  isAlertOpen,
  restoreIgnoredAlert,
} from './engine/alertBulkActions';
import {
  evaluateBmsAlerts,
  refillDieselTank,
  restoreUtilityPower,
  setCracMode,
  setCracSetpoint,
  stepBmsAndCoupling,
  toggleChillerFault,
  toggleChwPumpSetMode,
  toggleColdAisleSlaExcursion,
  toggleDieselTankPump,
  toggleGatewayConnection,
  toggleLeakSensorFault,
  toggleUpsFault,
  triggerUtilityOutageDrill,
} from './engine/bmsEngine';
import { BmsState, CracMode } from './engine/bmsTypes';
import {
  computePredictiveMaintenance,
  createInitialWorkOrders,
  MaintenanceWorkOrder,
  WorkOrderStatus,
} from './engine/predictiveMaintenance';
import { createInitialReportArchive, GeneratedReport } from './engine/reportEngine';
import { INITIAL_RACKS } from './engine/seedData';
import {
  SITES,
  SITE_META_MAP,
  SiteId,
  SiteWorkspaceState,
  createAllSitesInitialState,
} from './engine/sites';
import {
  applyRackPowerRebalance,
  computeBmsRackPowerStats,
  computeRackRebalancePlan,
  createDefaultHallPowerPolicies,
  sanitizeHallPowerPolicy,
} from './engine/rackPowerEngine';
import {
  createDefaultHallThermalPolicies,
  sanitizeHallThermalPolicy,
} from './engine/hallThermalPolicyEngine';
import {
  applyFaultToServer,
  computeFacilitySummary,
  deriveNodeStatus,
  evaluateAlertRules,
  evaluateRackPowerCapacityAlerts,
  RACK_CRITICAL_POWER_RULE_ID,
  RACK_THERMAL_VIOLATION_RULE_ID,
  stepTelemetryTick,
} from './engine/telemetryEngine';
import {
  ActiveAlert,
  AlertRule,
  DispatchLogEntry,
  FacilityTelemetryPoint,
  FaultType,
  HallId,
  HallPowerCapacityPolicy,
  HallPowerPolicyMap,
  HallThermalPolicy,
  HallThermalPolicyMap,
  NotificationChannel,
  ServerNode,
} from './engine/types';

import {
  DutyOverrideStatus,
  NewProfileDraft,
  OperatorProfile,
  ShiftCycleState,
  ShiftPatternId,
  computeEffectiveDutyStatus,
  createInitialProfiles,
  createInitialShiftState,
  createOperatorProfile,
  executeShiftHandover,
  getActiveShiftSnapshot,
  isValidAvatarUrl,
  switchShiftPattern,
  updateProfileAvatar,
} from './engine/shiftEngine';
import {
  AlarmAudioController,
  computeAlarmSoundDecision,
  detectNewAlarmBurstLevel,
  readSavedAlarmMuted,
  saveAlarmMuted,
} from './engine/alarmAudio';
import {
  NewTicketDraft,
  OpsTicket,
  TicketStatus,
  addTicketComment,
  assignOpsTicket,
  createInitialTickets,
  createOpsTicket,
  createTicketFromAlert,
  transitionTicketStatus,
} from './engine/ticketEngine';
import { getSiteBuildingLayout } from './engine/twin3dLayout';
import {
  CheckInResult,
  VisitorDraft,
  VisitorRecord,
  checkInVisitor,
  checkOutVisitor,
  createInitialVisitors,
  registerVisitor,
  revokeVisitorAccess,
  updateVisitorCompliance,
} from './engine/visitorEngine';
import {
  ImmutableAuditEntry,
  SmartRackLock,
  appendImmutableAudit,
  createInitialAuditTrail,
  createInitialRackLocks,
} from './engine/enterpriseOpsEngine';
import {
  buildUrlWorkspaceSearch,
  clearAllPersistedWorkspaceState,
  computeSecurityThermalCorrelations,
  getWorkspaceRoleConfig,
  parseUrlWorkspaceParams,
  readPersistedJson,
  SldBlastHighlight,
  WORKSPACE_ROLES,
  WorkspaceRole,
  writePersistedJson,
} from './engine/opsEnhancementsEngine';
import {
  computeBmsSensorRackStats,
  computeRackThermalStats,
} from './engine/rackHeatmapEngine';
import {
  createInitialMaintenanceWindows,
  isAlertSilencedByMaintenance,
  MaintenanceWindow,
} from './engine/alertIntelligenceEngine';
import { moveServerInRack } from './engine/changeComplianceEngine';
import {
  applyBmcAction,
  BmcActionType,
  createInitialServerBmcState,
  ServerBmcState,
} from './engine/bmcRedfishEngine';
import { FailoverStressMode } from './engine/failoverStressEngine';
import {
  createIncidentWarRoomRecord,
  formatIncidentForShiftHandover,
  IncidentWarRoomRecord,
  toggleRunbookStep,
} from './engine/incidentRunbookEngine';
import {
  createDeployedServerNode,
  decommissionServerFromRack,
  moveServerAcrossRacks,
  NewServerDeploymentDraft,
  RackUReservation,
  validateRackSlotAvailability,
  validateServerDeployment,
} from './engine/rackElevationEngine';
import { useFirebase } from './context/FirebaseContext';

type NavTab =
  | 'global-noc'
  | 'overview'
  | 'servers'
  | 'racks'
  | 'twin3d'
  | 'bms'
  | 'ai'
  | 'sld'
  | 'capacity'
  | 'cabling'
  | 'esg'
  | 'shifts'
  | 'tickets'
  | 'visitors'
  | 'cmms'
  | 'tenants'
  | 'security'
  | 'system'
  | 'alerts'
  | 'rules'
  | 'reports';

const PRIMARY_NAV_ITEMS: Array<{ id: NavTab; label: string; breadcrumb: string; icon: typeof Activity }> = [
  { id: 'global-noc', label: 'Global NOC', breadcrumb: 'Multi-Site Command Wall', icon: Globe },
  { id: 'overview', label: 'Overview', breadcrumb: 'Live Operations', icon: Activity },
  { id: 'servers', label: 'Servers', breadcrumb: 'Server Inventory', icon: Server },
  { id: 'racks', label: 'Rack Map', breadcrumb: 'Rack Elevations', icon: LayoutGrid },
  { id: 'twin3d', label: '3D View', breadcrumb: '3D Building & Data Hall', icon: Box },
  { id: 'bms', label: 'BMS / Facilities', breadcrumb: 'Building Management System', icon: Building2 },
  { id: 'ai', label: 'AI Predictive', breadcrumb: 'AI Predictive Maintenance', icon: BrainCircuit },
  { id: 'alerts', label: 'Alerts', breadcrumb: 'Alerts & Incidents', icon: Bell },
  { id: 'rules', label: 'Alert Rules', breadcrumb: 'Automation & Channels', icon: SlidersHorizontal },
  { id: 'reports', label: 'Reports', breadcrumb: 'Reports & CSV Export', icon: FileSpreadsheet },
];

const INFRA_NAV_ITEMS: Array<{ id: NavTab; label: string; breadcrumb: string; icon: typeof Activity }> = [
  { id: 'sld', label: 'Power Chain (SLD)', breadcrumb: 'Single Line Diagram & Blast Radius', icon: Zap },
  { id: 'capacity', label: 'Capacity Planner', breadcrumb: 'What-If Space, Power & Cooling', icon: Layers },
  { id: 'cabling', label: 'Cable & MMR', breadcrumb: 'Physical Layer & Cross-Connects', icon: Cable },
  { id: 'esg', label: 'ESG & Carbon', breadcrumb: 'WUE, CUE & Scope 2 Sustainability', icon: Leaf },
];

const OPERATION_NAV_ITEMS: Array<{ id: NavTab; label: string; breadcrumb: string; icon: typeof Activity }> = [
  { id: 'shifts', label: 'Shifts & Team', breadcrumb: 'Profiles & 24/7 Shift Cycle', icon: Users },
  { id: 'tickets', label: 'Ticketing System', breadcrumb: 'Operations Ticketing & SLA', icon: Ticket },
  { id: 'visitors', label: 'Visitor Management', breadcrumb: 'Physical Access & Visitors', icon: IdCard },
  { id: 'cmms', label: 'CMMS & MOPs', breadcrumb: 'Asset Lifecycle, PM & Playbooks', icon: Wrench },
  { id: 'tenants', label: 'Tenants & Billing', breadcrumb: 'Colocation Cages & Metered kWh', icon: Building },
  { id: 'security', label: 'Access & Locks', breadcrumb: 'Cabinet Security & Door Sensors', icon: ShieldCheck },
  { id: 'system', label: 'Protocols & Audit', breadcrumb: 'Connectors & Immutable Audit Trail', icon: Radio },
];

const NAV_ITEMS = [...PRIMARY_NAV_ITEMS, ...INFRA_NAV_ITEMS, ...OPERATION_NAV_ITEMS];

const SITE_HALLS: Array<{ id: HallId; label: string; short: string }> = [
  { id: 'hall-a', label: 'Hall A · Core Compute', short: 'Hall A' },
  { id: 'hall-b', label: 'Hall B · AI & GPU', short: 'Hall B' },
  { id: 'hall-c', label: 'Hall C · Storage & Edge', short: 'Hall C' },
  { id: 'hall-d', label: 'Hall D · Cloud & Interconnect', short: 'Hall D' },
];

export default function App() {
  const {
    user: firebaseUser,
    signingIn: firebaseSigningIn,
    authError: firebaseAuthError,
    cloudSyncedCount,
    cloudSyncBreakdown,
    cloudHandovers,
    cloudMaintenanceWindows,
    cloudHallPolicies,
    cloudHallThermalPolicies,
    cloudAlertStates,
    cloudCustomRules,
    cloudVisitors,
    cloudRunbooks,
    signInWithGoogle,
    signOutUser,
    saveShiftHandoverCloud,
    saveMaintenanceWindowCloud,
    endMaintenanceWindowCloud,
    deleteMaintenanceWindowCloud,
    syncTicketCloud,
    syncAuditEventCloud,
    saveHallPowerPolicyCloud,
    saveHallThermalPolicyCloud,
    syncAlertStateCloud,
    syncCustomAlertRuleCloud,
    deleteCustomAlertRuleCloud,
    syncVisitorCloud,
    syncIncidentRunbookCloud,
  } = useFirebase();

  const initialUrlParams = useMemo(
    () =>
      parseUrlWorkspaceParams(
        typeof window !== 'undefined' ? window.location.search : ''
      ),
    []
  );

  const [activeSiteId, setActiveSiteId] = useState<SiteId>(
    initialUrlParams.siteId ?? 'kl1'
  );
  const [expandedSites, setExpandedSites] = useState<Record<SiteId, boolean>>({
    kl1: true,
    kl2: false,
    kl3: false,
  });
  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    const candidate = initialUrlParams.tab as NavTab | undefined;
    return candidate && NAV_ITEMS.some((n) => n.id === candidate) ? candidate : 'overview';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [infraSectionOpen, setInfraSectionOpen] = useState(true);
  const [opsSectionOpen, setOpsSectionOpen] = useState(true);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [wallboardOpen, setWallboardOpen] = useState(false);
  const [cloudSyncPanelOpen, setCloudSyncPanelOpen] = useState(false);
  const [failoverStressMode, setFailoverStressMode] = useState<FailoverStressMode>('none');
  const [rackReservationsBySite, setRackReservationsBySite] = useState<
    Record<SiteId, RackUReservation[]>
  >(() =>
    readPersistedJson<Record<SiteId, RackUReservation[]>>('rack_u_reservations_by_site', {
      kl1: [],
      kl2: [],
      kl3: [],
    })
  );
  const [bmcStatesBySite, setBmcStatesBySite] = useState<
    Record<SiteId, Record<string, ServerBmcState>>
  >({
    kl1: {},
    kl2: {},
    kl3: {},
  });
  const [warRoomAlertId, setWarRoomAlertId] = useState<string | null>(null);
  const [warRoomsBySite, setWarRoomsBySite] = useState<
    Record<SiteId, Record<string, IncidentWarRoomRecord>>
  >({
    kl1: {},
    kl2: {},
    kl3: {},
  });
  const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRole>(() =>
    readPersistedJson<WorkspaceRole>('workspace_role', 'noc_operator')
  );
  const [favoriteTabs, setFavoriteTabs] = useState<NavTab[]>(() =>
    readPersistedJson<NavTab[]>('favorite_tabs', ['overview', 'racks', 'alerts', 'bms'])
  );
  const [pinnedRackIds, setPinnedRackIds] = useState<string[]>(() =>
    readPersistedJson<string[]>('pinned_racks', [])
  );
  const [rackDeepLink, setRackDeepLink] = useState<{
    hallId: HallId | null;
    rackId: string | null;
    sensorHeatmap: boolean | null;
  }>({
    hallId: initialUrlParams.hallId ?? null,
    rackId: initialUrlParams.rackId ?? null,
    sensorHeatmap:
      typeof initialUrlParams.sensorHeatmap === 'boolean'
        ? initialUrlParams.sensorHeatmap
        : null,
  });
  const [sldBlastHighlight, setSldBlastHighlight] = useState<SldBlastHighlight | null>(null);
  const [serverHallFilter, setServerHallFilter] = useState<HallId | 'all'>('all');
  const [globalQuery, setGlobalQuery] = useState('');
  const [darkMode, setDarkMode] = useState<boolean>(() =>
    readPersistedJson<boolean>('dark_mode', false)
  );
  const [isLive, setIsLive] = useState(true);
  const [chartMetric, setChartMetric] = useState<FacilityChartMetric>('totalPowerKw');
  const [selectedServerId, setSelectedServerId] = useState<string | null>(
    initialUrlParams.serverId ?? null
  );
  const [focusedBmsEquipmentId, setFocusedBmsEquipmentId] = useState<string>('chw-01');
  const [profiles, setProfiles] = useState<OperatorProfile[]>(() => {
    const initial = createInitialProfiles();
    const overrides = readPersistedJson<Record<string, string>>('operator_avatar_overrides', {});
    return initial.map((p) => {
      const custom = overrides[p.id];
      return custom && isValidAvatarUrl(custom) ? { ...p, avatarUrl: custom } : p;
    });
  });
  const [activeProfileId, setActiveProfileId] = useState<string>('op-elena');
  const [shiftState, setShiftState] = useState<ShiftCycleState>(() =>
    createInitialShiftState(Date.now())
  );
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const [sitesMap, setSitesMap] = useState<Record<SiteId, SiteWorkspaceState>>(() => {
    const base = createAllSitesInitialState(Date.now());
    const savedPolicies = readPersistedJson<Partial<Record<SiteId, Partial<HallPowerPolicyMap>>>>(
      'hall_power_policies_by_site',
      {}
    );
    const savedThermalPolicies = readPersistedJson<
      Partial<Record<SiteId, Partial<HallThermalPolicyMap>>>
    >('hall_thermal_policies_by_site', {});
    (['kl1', 'kl2', 'kl3'] as SiteId[]).forEach((sid) => {
      const siteSaved = savedPolicies[sid];
      if (siteSaved) {
        const merged = createDefaultHallPowerPolicies();
        (['hall-a', 'hall-b', 'hall-c', 'hall-d'] as HallId[]).forEach((hid) => {
          if (siteSaved[hid]) {
            merged[hid] = sanitizeHallPowerPolicy(hid, siteSaved[hid]);
          }
        });
        base[sid] = { ...base[sid], hallPowerPolicies: merged };
      }
      const siteThermalSaved = savedThermalPolicies[sid];
      if (siteThermalSaved) {
        const mergedThermal = createDefaultHallThermalPolicies();
        (['hall-a', 'hall-b', 'hall-c', 'hall-d'] as HallId[]).forEach((hid) => {
          if (siteThermalSaved[hid]) {
            mergedThermal[hid] = sanitizeHallThermalPolicy(hid, siteThermalSaved[hid]);
          }
        });
        base[sid] = { ...base[sid], hallThermalPolicies: mergedThermal };
      }
    });
    return base;
  });
  const [locksBySite, setLocksBySite] = useState<Record<SiteId, SmartRackLock[]>>(() => {
    const now = Date.now();
    return {
      kl1: createInitialRackLocks('kl1', now),
      kl2: createInitialRackLocks('kl2', now),
      kl3: createInitialRackLocks('kl3', now),
    };
  });
  const [reportHistory, setReportHistory] = useState<GeneratedReport[]>(() =>
    createInitialReportArchive(createAllSitesInitialState(Date.now()), INITIAL_RACKS, Date.now())
  );
  const [workOrders, setWorkOrders] = useState<MaintenanceWorkOrder[]>(() => {
    const now = Date.now();
    const initialSites = createAllSitesInitialState(now);
    return (['kl1', 'kl2', 'kl3'] as SiteId[]).flatMap((sid) => {
      const { risks } = computePredictiveMaintenance(initialSites[sid], INITIAL_RACKS, sid);
      return createInitialWorkOrders(risks, sid, now);
    });
  });
  const [tickets, setTickets] = useState<OpsTicket[]>(() =>
    readPersistedJson<OpsTicket[]>(
      'ops_tickets',
      createInitialTickets(createInitialProfiles(), Date.now())
    )
  );
  const [visitors, setVisitors] = useState<VisitorRecord[]>(() =>
    readPersistedJson<VisitorRecord[]>(
      'ops_visitors',
      createInitialVisitors(createInitialProfiles(), Date.now())
    )
  );
  const visitorsRef = useRef<VisitorRecord[]>(visitors);
  visitorsRef.current = visitors;
  const [auditTrail, setAuditTrail] = useState<ImmutableAuditEntry[]>(() =>
    readPersistedJson<ImmutableAuditEntry[]>(
      'ops_audit_trail',
      createInitialAuditTrail(Date.now())
    )
  );
  const [localMaintenanceWindows, setLocalMaintenanceWindows] = useState<MaintenanceWindow[]>(() =>
    readPersistedJson<MaintenanceWindow[]>(
      'ops_maintenance_windows',
      createInitialMaintenanceWindows(Date.now())
    )
  );
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<NotificationToast[]>([]);
  const [alarmMuted, setAlarmMuted] = useState<boolean>(() => readSavedAlarmMuted());

  const alarmAudioRef = useRef<AlarmAudioController | null>(null);
  const alarmMutedRef = useRef<boolean>(alarmMuted);
  alarmMutedRef.current = alarmMuted;

  useEffect(() => {
    const controller = new AlarmAudioController();
    alarmAudioRef.current = controller;
    return () => {
      controller.dispose();
      alarmAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    saveAlarmMuted(alarmMuted);
  }, [alarmMuted]);

  const activeSite = sitesMap[activeSiteId];
  const activeSiteMeta = SITE_META_MAP[activeSiteId];
  const { servers, bms, rules, channels, alerts, dispatchLogs, facilityHistory } = activeSite;

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? profiles[0],
    [profiles, activeProfileId]
  );
  const activeShiftSnapshot = useMemo(() => getActiveShiftSnapshot(shiftState), [shiftState]);
  const activeProfileNameRef = useRef<string>(activeProfile.name);
  activeProfileNameRef.current = activeProfile.name;

  const tickRef = useRef(1);
  const activeSiteIdRef = useRef<SiteId>(activeSiteId);
  activeSiteIdRef.current = activeSiteId;
  const sitesMapRef = useRef(sitesMap);
  sitesMapRef.current = sitesMap;

  const updateActiveSite = useCallback(
    (updater: (site: SiteWorkspaceState) => SiteWorkspaceState) => {
      const targetId = activeSiteIdRef.current;
      setSitesMap((prev) => ({
        ...prev,
        [targetId]: updater(prev[targetId]),
      }));
    },
    []
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // Sync cloud-persisted Hall Power Capacity Policies from Firestore when signed in
  useEffect(() => {
    if (!firebaseUser || cloudHallPolicies.length === 0) return;
    setSitesMap((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const rec of cloudHallPolicies) {
        const site = next[rec.siteId];
        if (!site) continue;
        const sanitized = sanitizeHallPowerPolicy(rec.hallId, {
          hallId: rec.hallId,
          thresholdPct: rec.thresholdPct,
          hysteresisKw: rec.hysteresisKw,
          enabled: rec.enabled,
        });
        const existing = site.hallPowerPolicies[rec.hallId];
        if (
          !existing ||
          existing.thresholdPct !== sanitized.thresholdPct ||
          existing.hysteresisKw !== sanitized.hysteresisKw ||
          existing.enabled !== sanitized.enabled
        ) {
          changed = true;
          next[rec.siteId] = {
            ...site,
            hallPowerPolicies: {
              ...site.hallPowerPolicies,
              [rec.hallId]: sanitized,
            },
          };
        }
      }
      return changed ? next : prev;
    });
  }, [firebaseUser, cloudHallPolicies]);

  // Sync cloud-persisted Hall Thermal Sensor Policies from Firestore when signed in
  useEffect(() => {
    if (!firebaseUser || cloudHallThermalPolicies.length === 0) return;
    setSitesMap((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const rec of cloudHallThermalPolicies) {
        const site = next[rec.siteId];
        if (!site) continue;
        const sanitized = sanitizeHallThermalPolicy(rec.hallId, {
          hallId: rec.hallId,
          warningTempC: rec.warningTempC,
          criticalTempC: rec.criticalTempC,
          hysteresisC: rec.hysteresisC,
          enabled: rec.enabled,
        });
        const existing = site.hallThermalPolicies[rec.hallId];
        if (
          !existing ||
          existing.warningTempC !== sanitized.warningTempC ||
          existing.criticalTempC !== sanitized.criticalTempC ||
          existing.hysteresisC !== sanitized.hysteresisC ||
          existing.enabled !== sanitized.enabled
        ) {
          changed = true;
          next[rec.siteId] = {
            ...site,
            hallThermalPolicies: {
              ...site.hallThermalPolicies,
              [rec.hallId]: sanitized,
            },
          };
        }
      }
      return changed ? next : prev;
    });
  }, [firebaseUser, cloudHallThermalPolicies]);

  useEffect(() => {
    setToasts([]);
  }, [activeSiteId]);

  const enqueueToasts = useCallback((incoming: NotificationToast[]) => {
    if (incoming.length === 0) return;
    setToasts((prev) => [...incoming, ...prev].slice(0, 2));
    const ids = incoming.map((t) => t.id);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => !ids.includes(t.id)));
    }, 8500);
  }, []);

  const pushToastsForNewAlerts = useCallback(
    (newAlerts: ActiveAlert[]) => {
      if (newAlerts.length === 0) return;
      const incoming: NotificationToast[] = newAlerts.slice(0, 2).map((a) => ({
        id: `toast-${a.id}`,
        alertId: a.id,
        serverId: a.serverId,
        title: `${a.ruleName} — ${a.serverHostname}`,
        body: a.message,
        channelsText: a.dispatchedChannelNames.join(' · '),
        severity: a.severity,
      }));
      enqueueToasts(incoming);
      if (!alarmMutedRef.current) {
        const burstLevel = detectNewAlarmBurstLevel(newAlerts);
        if (burstLevel !== 'none') {
          alarmAudioRef.current?.playBurst(burstLevel);
        }
      }
    },
    [enqueueToasts]
  );

  // Real-time 3-second telemetry & closed-loop BMS + alert evaluation loop across KL1, KL2, KL3
  useEffect(() => {
    if (!isLive) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      const tick = tickRef.current++;
      const currentActiveId = activeSiteIdRef.current;
      let activeNewAlerts: ActiveAlert[] = [];

      setSitesMap((prev) => {
        const nextMap = { ...prev };
        for (const siteMeta of SITES) {
          const cur = prev[siteMeta.id];
          const result = stepTelemetryTick({
            servers: cur.servers,
            rules: cur.rules,
            alerts: cur.alerts,
            dispatchLogs: cur.dispatchLogs,
            channels: cur.channels,
            racks: INITIAL_RACKS,
            bms: cur.bms,
            facilityHistory: cur.facilityHistory,
            siteCode: siteMeta.code,
            tickCount: tick + siteMeta.ipPrefix,
            now,
            rackPowerAdjustmentsKw: cur.rackPowerAdjustmentsKw,
            hallPowerPolicies: cur.hallPowerPolicies,
            hallThermalPolicies: cur.hallThermalPolicies,
          });

          const bmsStep = stepBmsAndCoupling({
            bms: cur.bms,
            servers: result.servers,
            alerts: result.alerts,
            channels: result.channels,
            tickCount: tick + siteMeta.ipPrefix,
            now,
          });

          const rackCapStep = evaluateRackPowerCapacityAlerts({
            racks: INITIAL_RACKS,
            bms: bmsStep.bms,
            servers: bmsStep.adjustedServers,
            existingAlerts: bmsStep.alerts,
            channels: bmsStep.updatedChannels,
            now,
            siteCode: siteMeta.code,
            rackPowerAdjustmentsKw: cur.rackPowerAdjustmentsKw,
            hallPowerPolicies: cur.hallPowerPolicies,
            hallThermalPolicies: cur.hallThermalPolicies,
          });

          const finalizedServers = bmsStep.adjustedServers.map((s) => ({
            ...s,
            status: deriveNodeStatus(s, rackCapStep.alerts),
          }));

          nextMap[siteMeta.id] = {
            ...cur,
            servers: finalizedServers,
            rules: result.rules,
            bms: bmsStep.bms,
            alerts: rackCapStep.alerts,
            dispatchLogs: [
              ...rackCapStep.newDispatches,
              ...bmsStep.newDispatches,
              ...result.dispatchLogs,
            ].slice(0, 120),
            channels: rackCapStep.updatedChannels,
            facilityHistory: [...cur.facilityHistory.slice(-23), result.facilityPoint],
          };

          if (siteMeta.id === currentActiveId) {
            activeNewAlerts = [...rackCapStep.newAlerts, ...bmsStep.newAlerts, ...result.newAlerts];
          }
        }
        return nextMap;
      });

      if (activeNewAlerts.length > 0) {
        pushToastsForNewAlerts(activeNewAlerts);
      }
    }, 3000);

    return () => window.clearInterval(timer);
  }, [isLive, pushToastsForNewAlerts]);

  const commitBmsMutation = useCallback(
    (nextBms: BmsState) => {
      const cur = sitesMapRef.current[activeSiteIdRef.current];
      const activeCode = SITE_META_MAP[activeSiteIdRef.current]?.code;
      const now = Date.now();
      const evalRes = evaluateBmsAlerts(nextBms, cur.alerts, cur.channels, now);
      const rackCapRes = evaluateRackPowerCapacityAlerts({
        racks: INITIAL_RACKS,
        bms: nextBms,
        servers: cur.servers,
        existingAlerts: evalRes.alerts,
        channels: evalRes.updatedChannels,
        now,
        siteCode: activeCode,
        rackPowerAdjustmentsKw: cur.rackPowerAdjustmentsKw,
        hallPowerPolicies: cur.hallPowerPolicies,
        hallThermalPolicies: cur.hallThermalPolicies,
      });
      const combinedNewDispatches = [...rackCapRes.newDispatches, ...evalRes.newDispatches];
      const combinedNewAlerts = [...rackCapRes.newAlerts, ...evalRes.newAlerts];
      updateActiveSite((site) => ({
        ...site,
        bms: nextBms,
        alerts: rackCapRes.alerts,
        channels: rackCapRes.updatedChannels,
        dispatchLogs:
          combinedNewDispatches.length > 0
            ? [...combinedNewDispatches, ...site.dispatchLogs].slice(0, 120)
            : site.dispatchLogs,
      }));
      if (combinedNewAlerts.length > 0) {
        pushToastsForNewAlerts(combinedNewAlerts);
      }
    },
    [pushToastsForNewAlerts, updateActiveSite]
  );

  const handleAdjustSetpoint = useCallback(
    (cracId: string, nextSetpointC: number) => {
      const curBms = sitesMapRef.current[activeSiteIdRef.current].bms;
      commitBmsMutation(setCracSetpoint(curBms, cracId, nextSetpointC, 'Operator', Date.now()));
    },
    [commitBmsMutation]
  );

  const handleSetCracMode = useCallback(
    (cracId: string, mode: CracMode) => {
      const curBms = sitesMapRef.current[activeSiteIdRef.current].bms;
      commitBmsMutation(setCracMode(curBms, cracId, mode, 'Operator', Date.now()));
    },
    [commitBmsMutation]
  );

  const handleToggleClosedLoop = useCallback(() => {
    updateActiveSite((site) => ({
      ...site,
      bms: { ...site.bms, closedLoopCoolingEnabled: !site.bms.closedLoopCoolingEnabled },
    }));
  }, [updateActiveSite]);

  const handleTriggerOutage = useCallback(() => {
    const curBms = sitesMapRef.current[activeSiteIdRef.current].bms;
    commitBmsMutation(triggerUtilityOutageDrill(curBms, Date.now()));
  }, [commitBmsMutation]);

  const handleRestoreUtility = useCallback(() => {
    const curBms = sitesMapRef.current[activeSiteIdRef.current].bms;
    commitBmsMutation(restoreUtilityPower(curBms, Date.now()));
  }, [commitBmsMutation]);

  const handleToggleLeakFault = useCallback(
    (hallId: HallId) => {
      const curBms = sitesMapRef.current[activeSiteIdRef.current].bms;
      commitBmsMutation(toggleLeakSensorFault(curBms, hallId, Date.now()));
    },
    [commitBmsMutation]
  );

  const handleToggleColdAisleSla = useCallback(
    (hallId: HallId) => {
      const curBms = sitesMapRef.current[activeSiteIdRef.current].bms;
      commitBmsMutation(toggleColdAisleSlaExcursion(curBms, hallId, Date.now()));
    },
    [commitBmsMutation]
  );

  const handleToggleUpsFault = useCallback(
    (upsId: string) => {
      const curBms = sitesMapRef.current[activeSiteIdRef.current].bms;
      commitBmsMutation(toggleUpsFault(curBms, upsId, Date.now()));
    },
    [commitBmsMutation]
  );

  const handleToggleChillerFault = useCallback(
    (chillerId: string) => {
      const curBms = sitesMapRef.current[activeSiteIdRef.current].bms;
      commitBmsMutation(toggleChillerFault(curBms, chillerId, Date.now()));
    },
    [commitBmsMutation]
  );

  const handleToggleChwPumpSetMode = useCallback(
    (pumpSetId: string) => {
      const curBms = sitesMapRef.current[activeSiteIdRef.current].bms;
      commitBmsMutation(toggleChwPumpSetMode(curBms, pumpSetId, Date.now()));
    },
    [commitBmsMutation]
  );

  const handleToggleDieselTankPump = useCallback(
    (tankId: string) => {
      const curBms = sitesMapRef.current[activeSiteIdRef.current].bms;
      commitBmsMutation(toggleDieselTankPump(curBms, tankId, Date.now()));
    },
    [commitBmsMutation]
  );

  const handleRefillDieselTank = useCallback(
    (tankId: string) => {
      const curBms = sitesMapRef.current[activeSiteIdRef.current].bms;
      commitBmsMutation(refillDieselTank(curBms, tankId, Date.now()));
    },
    [commitBmsMutation]
  );

  const handleReportGenerated = useCallback((report: GeneratedReport) => {
    setReportHistory((prev) => [report, ...prev].slice(0, 20));
    setActiveReportId(report.id);
  }, []);

  const handleDeleteReport = useCallback((reportId: string) => {
    setReportHistory((prev) => {
      const next = prev.filter((r) => r.id !== reportId);
      setActiveReportId((cur) => (cur === reportId ? next[0]?.id ?? null : cur));
      return next;
    });
  }, []);

  const handleToggleGateway = useCallback(
    (gatewayId: string) => {
      updateActiveSite((site) => ({
        ...site,
        bms: toggleGatewayConnection(site.bms, gatewayId, Date.now()),
      }));
    },
    [updateActiveSite]
  );

  const handleInspectEntity = useCallback((entityId: string) => {
    const cur = sitesMapRef.current[activeSiteIdRef.current];
    const matchedServer = cur.servers.find((s) => s.id === entityId);
    if (matchedServer) {
      setSelectedServerId(matchedServer.id);
      return;
    }
    const rackLookupId = entityId.startsWith('rack-') ? entityId.slice(5) : entityId;
    const matchedRack = INITIAL_RACKS.find((r) => r.id === rackLookupId);
    if (matchedRack) {
      setRackDeepLink({
        hallId: matchedRack.hallId,
        rackId: matchedRack.id,
        sensorHeatmap: false,
      });
      setActiveTab('racks');
      setSelectedServerId(null);
      return;
    }
    const bmsMatch =
      cur.bms.chillers.some((c) => c.id === entityId) ||
      cur.bms.chwTankPumpSets.some((p) => p.id === entityId) ||
      cur.bms.cracUnits.some((c) => c.id === entityId) ||
      cur.bms.electricalSwitchgear.some((sw) => sw.id === entityId) ||
      cur.bms.upsSystems.some((u) => u.id === entityId) ||
      cur.bms.generators.some((g) => g.id === entityId) ||
      cur.bms.dieselTanks.some((d) => d.id === entityId) ||
      cur.bms.gateways.some((g) => g.id === entityId);
    if (entityId === 'facility-power-plant') {
      setFocusedBmsEquipmentId('hv-a');
    } else if (bmsMatch) {
      setFocusedBmsEquipmentId(entityId);
    }
    setActiveTab('bms');
    setSelectedServerId(null);
  }, []);

  const runImmediateEvaluation = useCallback(
    (nextServers: ServerNode[], nextRules: AlertRule[], nextChannels: NotificationChannel[]) => {
      const cur = sitesMapRef.current[activeSiteIdRef.current];
      const siteCode = SITE_META_MAP[activeSiteIdRef.current].code;
      const now = Date.now();
      const evalRes = evaluateAlertRules(nextServers, nextRules, cur.alerts, nextChannels, now, {
        facilityHistory: cur.facilityHistory,
        siteCode,
      });
      const rackEvalRes = evaluateRackPowerCapacityAlerts({
        racks: INITIAL_RACKS,
        bms: cur.bms,
        servers: nextServers,
        existingAlerts: evalRes.alerts,
        channels: evalRes.updatedChannels,
        now,
        siteCode,
        rackPowerAdjustmentsKw: cur.rackPowerAdjustmentsKw,
        hallPowerPolicies: cur.hallPowerPolicies,
        hallThermalPolicies: cur.hallThermalPolicies,
      });
      const combinedNewDispatches = [...rackEvalRes.newDispatches, ...evalRes.newDispatches];
      const combinedNewAlerts = [...rackEvalRes.newAlerts, ...evalRes.newAlerts];
      const finalized = nextServers.map((s) => ({
        ...s,
        status: deriveNodeStatus(s, rackEvalRes.alerts),
      }));
      updateActiveSite((site) => ({
        ...site,
        servers: finalized,
        rules: evalRes.updatedRules,
        alerts: rackEvalRes.alerts,
        channels: rackEvalRes.updatedChannels,
        dispatchLogs:
          combinedNewDispatches.length > 0
            ? [...combinedNewDispatches, ...site.dispatchLogs].slice(0, 120)
            : site.dispatchLogs,
      }));
      if (combinedNewAlerts.length > 0) {
        pushToastsForNewAlerts(combinedNewAlerts);
      }
    },
    [pushToastsForNewAlerts, updateActiveSite]
  );

  const handleInjectFault = useCallback(
    (serverId: string, fault: FaultType | null) => {
      const cur = sitesMapRef.current[activeSiteIdRef.current];
      const nextServers = cur.servers.map((s) =>
        s.id === serverId ? applyFaultToServer(s, fault) : s
      );
      runImmediateEvaluation(nextServers, cur.rules, cur.channels);
      // Immediately trigger closed-loop BMS CRAC response if thermal spike occurred
      if (fault === 'thermal_spike' && cur.bms.closedLoopCoolingEnabled) {
        const srv = nextServers.find((s) => s.id === serverId);
        const hallCrac = srv ? cur.bms.cracUnits.find((c) => c.hallId === srv.hallId) : null;
        if (hallCrac && hallCrac.mode !== 'Boost' && hallCrac.mode !== 'Fault') {
          updateActiveSite((site) => ({
            ...site,
            bms: setCracMode(
              site.bms,
              hallCrac.id,
              'Boost',
              'Closed-Loop Automation',
              Date.now(),
              `Hotspot on ${srv?.hostname}`
            ),
          }));
        }
      }
    },
    [runImmediateEvaluation, updateActiveSite]
  );

  const handleSimulateFacilityFault = useCallback(() => {
    const curServers = sitesMapRef.current[activeSiteIdRef.current].servers;
    const candidate =
      curServers.find((s) => s.status === 'nominal' && s.role === 'GPU Inference') ??
      curServers.find((s) => s.status === 'nominal') ??
      curServers[0];
    if (candidate) {
      handleInjectFault(candidate.id, 'thermal_spike');
    }
  }, [handleInjectFault]);

  const handleToggleMaintenance = useCallback(
    (serverId: string) => {
      updateActiveSite((site) => ({
        ...site,
        servers: site.servers.map((s) => {
          if (s.id !== serverId) return s;
          if (s.status === 'maintenance') {
            return { ...s, status: 'nominal', activeFault: null };
          }
          return { ...s, status: 'maintenance', activeFault: null, cpu: 10, tempC: 34.0, powerW: 360 };
        }),
      }));
    },
    [updateActiveSite]
  );

  const handleAcknowledgeAlert = useCallback(
    (alertId: string) => {
      const now = Date.now();
      const operatorName = activeProfileNameRef.current;
      updateActiveSite((site) => ({
        ...site,
        alerts: site.alerts.map((a) =>
          a.id === alertId
            ? { ...a, state: 'acknowledged', acknowledgedAt: now, acknowledgedBy: operatorName }
            : a
        ),
      }));
      if (firebaseUser) {
        void syncAlertStateCloud({
          siteId: activeSiteIdRef.current,
          alertId,
          state: 'acknowledged',
          actorName: operatorName,
        });
      }
    },
    [firebaseUser, syncAlertStateCloud, updateActiveSite]
  );

  const handleAcknowledgeAll = useCallback(() => {
    const now = Date.now();
    const operatorName = activeProfileNameRef.current;
    const activeIds = sitesMapRef.current[activeSiteIdRef.current].alerts
      .filter((a) => a.state === 'active')
      .map((a) => a.id);
    updateActiveSite((site) => ({
      ...site,
      alerts: site.alerts.map((a) =>
        a.state === 'active'
          ? { ...a, state: 'acknowledged', acknowledgedAt: now, acknowledgedBy: operatorName }
          : a
      ),
    }));
    if (firebaseUser) {
      activeIds.slice(0, 15).forEach((aid) => {
        void syncAlertStateCloud({
          siteId: activeSiteIdRef.current,
          alertId: aid,
          state: 'acknowledged',
          actorName: operatorName,
        });
      });
    }
  }, [firebaseUser, syncAlertStateCloud, updateActiveSite]);

  const handleResolveAlert = useCallback(
    (alertId: string) => {
      const now = Date.now();
      const operatorName = activeProfileNameRef.current;
      updateActiveSite((site) => {
        const updatedAlerts = site.alerts.map((a) =>
          a.id === alertId ? { ...a, state: 'resolved' as const, resolvedAt: now } : a
        );
        return {
          ...site,
          alerts: updatedAlerts,
          servers: site.servers.map((s) => ({ ...s, status: deriveNodeStatus(s, updatedAlerts) })),
        };
      });
      setWarRoomsBySite((prev) => {
        const sid = activeSiteIdRef.current;
        const existing = prev[sid]?.[alertId];
        if (!existing) return prev;
        return {
          ...prev,
          [sid]: {
            ...prev[sid],
            [alertId]: { ...existing, resolvedAt: now },
          },
        };
      });
      if (firebaseUser) {
        void syncAlertStateCloud({
          siteId: activeSiteIdRef.current,
          alertId,
          state: 'resolved',
          actorName: operatorName,
        });
      }
    },
    [firebaseUser, syncAlertStateCloud, updateActiveSite]
  );

  const handleBulkAcknowledgeAlerts = useCallback(
    (alertIds: string[]) => {
      if (alertIds.length === 0) return;
      const now = Date.now();
      const operatorName = activeProfileNameRef.current;
      updateActiveSite((site) => {
        const { alerts: updatedAlerts, affectedCount } = bulkAcknowledgeAlerts(
          site.alerts,
          alertIds,
          operatorName,
          now
        );
        if (affectedCount === 0) return site;
        return {
          ...site,
          alerts: updatedAlerts,
        };
      });
      if (firebaseUser) {
        alertIds.slice(0, 15).forEach((aid) => {
          void syncAlertStateCloud({
            siteId: activeSiteIdRef.current,
            alertId: aid,
            state: 'acknowledged',
            actorName: operatorName,
          });
        });
      }
    },
    [firebaseUser, syncAlertStateCloud, updateActiveSite]
  );

  const handleBulkIgnoreAlerts = useCallback(
    (alertIds: string[]) => {
      if (alertIds.length === 0) return;
      const now = Date.now();
      const operatorName = activeProfileNameRef.current;
      updateActiveSite((site) => {
        const { alerts: updatedAlerts, affectedCount } = bulkIgnoreAlerts(
          site.alerts,
          alertIds,
          operatorName,
          now
        );
        if (affectedCount === 0) return site;
        return {
          ...site,
          alerts: updatedAlerts,
          servers: site.servers.map((s) => ({ ...s, status: deriveNodeStatus(s, updatedAlerts) })),
        };
      });
      if (firebaseUser) {
        alertIds.slice(0, 15).forEach((aid) => {
          void syncAlertStateCloud({
            siteId: activeSiteIdRef.current,
            alertId: aid,
            state: 'ignored',
            actorName: operatorName,
          });
        });
      }
    },
    [firebaseUser, syncAlertStateCloud, updateActiveSite]
  );

  const handleBulkClearAlerts = useCallback(
    (alertIds: string[]) => {
      if (alertIds.length === 0) return;
      const now = Date.now();
      const operatorName = activeProfileNameRef.current;
      updateActiveSite((site) => {
        const { alerts: updatedAlerts, affectedCount } = bulkClearAlerts(
          site.alerts,
          alertIds,
          now
        );
        if (affectedCount === 0) return site;
        return {
          ...site,
          alerts: updatedAlerts,
          servers: site.servers.map((s) => ({ ...s, status: deriveNodeStatus(s, updatedAlerts) })),
        };
      });
      if (firebaseUser) {
        alertIds.slice(0, 15).forEach((aid) => {
          void syncAlertStateCloud({
            siteId: activeSiteIdRef.current,
            alertId: aid,
            state: 'resolved',
            actorName: operatorName,
          });
        });
      }
    },
    [firebaseUser, syncAlertStateCloud, updateActiveSite]
  );

  const handleRestoreIgnoredAlert = useCallback(
    (alertId: string) => {
      const operatorName = activeProfileNameRef.current;
      updateActiveSite((site) => {
        const updatedAlerts = restoreIgnoredAlert(site.alerts, alertId);
        if (updatedAlerts === site.alerts) return site;
        return {
          ...site,
          alerts: updatedAlerts,
          servers: site.servers.map((s) => ({ ...s, status: deriveNodeStatus(s, updatedAlerts) })),
        };
      });
      if (firebaseUser) {
        void syncAlertStateCloud({
          siteId: activeSiteIdRef.current,
          alertId,
          state: 'active',
          actorName: operatorName,
        });
      }
    },
    [firebaseUser, syncAlertStateCloud, updateActiveSite]
  );

  const handleToggleRule = useCallback(
    (ruleId: string) => {
      const target = sitesMapRef.current[activeSiteIdRef.current].rules.find((r) => r.id === ruleId);
      updateActiveSite((site) => ({
        ...site,
        rules: site.rules.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r)),
      }));
      if (firebaseUser && target) {
        void syncCustomAlertRuleCloud({
          siteId: activeSiteIdRef.current,
          ruleId: target.id,
          name: target.name,
          metric: target.metric,
          operator: target.operator,
          threshold: target.threshold,
          severity: target.severity,
          scopeHall: target.scopeHall,
          enabled: !target.enabled,
        });
      }
    },
    [firebaseUser, syncCustomAlertRuleCloud, updateActiveSite]
  );

  const handleDeleteRule = useCallback(
    (ruleId: string) => {
      updateActiveSite((site) => ({
        ...site,
        rules: site.rules.filter((r) => r.id !== ruleId),
      }));
      if (firebaseUser) {
        void deleteCustomAlertRuleCloud(activeSiteIdRef.current, ruleId);
      }
    },
    [deleteCustomAlertRuleCloud, firebaseUser, updateActiveSite]
  );

  const handleCreateRule = useCallback(
    (newRule: Omit<AlertRule, 'id'>) => {
      const cur = sitesMapRef.current[activeSiteIdRef.current];
      const created: AlertRule = {
        ...newRule,
        id: `rule-${Date.now().toString(36)}`,
      };
      const nextRules = [created, ...cur.rules];
      runImmediateEvaluation(cur.servers, nextRules, cur.channels);
      if (firebaseUser) {
        void syncCustomAlertRuleCloud({
          siteId: activeSiteIdRef.current,
          ruleId: created.id,
          name: created.name,
          metric: created.metric,
          operator: created.operator,
          threshold: created.threshold,
          severity: created.severity,
          scopeHall: created.scopeHall,
          enabled: created.enabled,
        });
      }
    },
    [firebaseUser, runImmediateEvaluation, syncCustomAlertRuleCloud]
  );

  const handleToggleChannel = useCallback(
    (channelId: string) => {
      updateActiveSite((site) => ({
        ...site,
        channels: site.channels.map((c) => (c.id === channelId ? { ...c, enabled: !c.enabled } : c)),
      }));
    },
    [updateActiveSite]
  );

  const handleTestChannel = useCallback(
    (channelId: string) => {
      const cur = sitesMapRef.current[activeSiteIdRef.current];
      const siteCode = SITE_META_MAP[activeSiteIdRef.current].code;
      const ch = cur.channels.find((c) => c.id === channelId);
      if (!ch) return;
      const now = Date.now();
      const logEntry: DispatchLogEntry = {
        id: `dsp-test-${now.toString(36)}`,
        timestamp: now,
        alertId: 'manual-test',
        serverHostname: `orise-${activeSiteIdRef.current}-controller`,
        channelId: ch.id,
        channelName: ch.name,
        channelType: ch.type,
        target: ch.target,
        severity: 'info',
        status: 'Delivered',
        summary: `[${siteCode}] Test notification delivered to ${ch.name} (${ch.target})`,
      };
      updateActiveSite((site) => ({
        ...site,
        dispatchLogs: [logEntry, ...site.dispatchLogs].slice(0, 120),
        channels: site.channels.map((c) =>
          c.id === channelId ? { ...c, lastDispatchedAt: now, deliveryCount: c.deliveryCount + 1 } : c
        ),
      }));
      enqueueToasts([
        {
          id: `toast-test-${now}`,
          title: `[${siteCode}] Test Dispatch Delivered`,
          body: `Verified connectivity to ${ch.name} (${ch.target}).`,
          severity: 'info',
        },
      ]);
    },
    [enqueueToasts, updateActiveSite]
  );

  const effectiveMaintenanceWindows = useMemo<MaintenanceWindow[]>(() => {
    const cloudMapped: MaintenanceWindow[] = cloudMaintenanceWindows.map((cw) => ({
      id: `cloud-${cw.id}`,
      siteId: cw.siteId,
      title: cw.title,
      scopeType: cw.scopeType,
      scopeValue: cw.scopeValue,
      reason: cw.reason,
      createdBy: cw.createdBy,
      status: cw.status,
      startAtMs: cw.startAtMs,
      endAtMs: cw.endAtMs,
      cloudSynced: true,
    }));
    const cloudIds = new Set(cloudMapped.map((w) => w.id));
    return [
      ...cloudMapped,
      ...localMaintenanceWindows.filter((w) => !cloudIds.has(w.id)),
    ].sort((a, b) => b.startAtMs - a.startAtMs);
  }, [cloudMaintenanceWindows, localMaintenanceWindows]);

  const summary = useMemo(
    () => computeFacilitySummary(servers, INITIAL_RACKS, alerts),
    [servers, alerts]
  );

  const audibleAlerts = useMemo(
    () =>
      alerts.filter(
        (a) => !isAlertSilencedByMaintenance(a, activeSiteId, effectiveMaintenanceWindows)
      ),
    [alerts, activeSiteId, effectiveMaintenanceWindows]
  );

  const alarmSoundDecision = useMemo(
    () => computeAlarmSoundDecision(audibleAlerts, alarmMuted),
    [audibleAlerts, alarmMuted]
  );

  useEffect(() => {
    alarmAudioRef.current?.sync(alarmSoundDecision);
  }, [alarmSoundDecision]);

  const handleToggleAlarmMute = useCallback(() => {
    setAlarmMuted((prev) => {
      const next = !prev;
      if (!next) {
        alarmAudioRef.current?.unlock();
      }
      return next;
    });
  }, []);

  const handleTestAlarmSound = useCallback(() => {
    const level = alarmSoundDecision.level === 'warning' ? 'warning' : 'critical';
    alarmAudioRef.current?.playBurst(level, true);
  }, [alarmSoundDecision.level]);

  const selectedServer = useMemo(
    () => servers.find((s) => s.id === selectedServerId) ?? null,
    [servers, selectedServerId]
  );

  const activeNavMeta = NAV_ITEMS.find((n) => n.id === activeTab) ?? NAV_ITEMS[0];

  const globalMatches = useMemo(() => {
    const q = globalQuery.trim().toLowerCase();
    if (!q) return [];
    const srvMatches = servers
      .filter(
        (s) =>
          s.hostname.toLowerCase().includes(q) ||
          s.rackId.toLowerCase().includes(q) ||
          s.ip.toLowerCase().includes(q) ||
          s.role.toLowerCase().includes(q)
      )
      .slice(0, 4)
      .map((s) => ({
        id: s.id,
        title: s.hostname,
        subtitle: `${s.rackId} · ${s.role} · ${s.tempC.toFixed(1)}°C`,
        kind: 'server' as const,
      }));
    const bmsMatches = [
      ...bms.chillers
        .filter((ch) => ch.name.toLowerCase().includes(q) || ch.chillerType.toLowerCase().includes(q))
        .map((ch) => ({
          id: ch.id,
          title: ch.name,
          subtitle: `${ch.chillerType} Chiller · ${ch.chilledLoop} · ${(ch.coolingOutputKw / 1000).toFixed(2)} MW`,
          kind: 'bms' as const,
        })),
      ...bms.chwTankPumpSets
        .filter((p) => p.name.toLowerCase().includes(q) || p.chilledLoop.toLowerCase().includes(q) || 'tank'.includes(q) || 'pump'.includes(q))
        .map((p) => ({
          id: p.id,
          title: p.name,
          subtitle: `Rooftop 180kL Buffer Tank & Pump Set · ${p.flowRateLps} L/s`,
          kind: 'bms' as const,
        })),
      ...bms.cracUnits
        .filter((c) => c.name.toLowerCase().includes(q) || c.hallLabel.toLowerCase().includes(q) || c.coolingType.toLowerCase().includes(q))
        .map((c) => ({
          id: c.id,
          title: c.name,
          subtitle: `BMS ${c.coolingType} · ${c.hallLabel} · ${c.supplyTempC.toFixed(1)}°C`,
          kind: 'bms' as const,
        })),
      ...bms.electricalSwitchgear
        .filter((sw) => sw.name.toLowerCase().includes(q) || sw.stage.toLowerCase().includes(q) || sw.voltageLabel.toLowerCase().includes(q))
        .map((sw) => ({
          id: sw.id,
          title: sw.name,
          subtitle: `${sw.stage} Switchgear · ${sw.voltageLabel} · ${(sw.activeLoadKw / 1000).toFixed(2)} MW`,
          kind: 'bms' as const,
        })),
      ...bms.upsSystems
        .filter((u) => u.name.toLowerCase().includes(q) || u.feedBus.toLowerCase().includes(q))
        .map((u) => ({
          id: u.id,
          title: u.name,
          subtitle: `BMS 2N UPS · ${u.mode} · ${u.batterySocPct.toFixed(0)}% SoC`,
          kind: 'bms' as const,
        })),
      ...bms.dieselTanks
        .filter((t) => t.name.toLowerCase().includes(q) || 'diesel'.includes(q) || 'fuel'.includes(q) || 'basement'.includes(q))
        .map((t) => ({
          id: t.id,
          title: t.name,
          subtitle: `${t.vaultZone} · ${t.currentLiters.toLocaleString()} L (${t.levelPct.toFixed(0)}%)`,
          kind: 'bms' as const,
        })),
    ].slice(0, 4);
    return [...srvMatches, ...bmsMatches].slice(0, 6);
  }, [globalQuery, servers, bms]);

  const handleSelectNav = (tab: NavTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    setProfileMenuOpen(false);
  };

  const handleSelectSite = (siteId: SiteId) => {
    setActiveSiteId(siteId);
    setSelectedServerId(null);
    setExpandedSites((prev) => ({ ...prev, [siteId]: true }));
  };

  const handleAddProfile = useCallback((draft: NewProfileDraft) => {
    const created = createOperatorProfile(draft, Date.now());
    setProfiles((prev) => [...prev, created]);
  }, []);

  const handleUpdateDutyOverride = useCallback(
    (profileId: string, override: DutyOverrideStatus) => {
      setProfiles((prev) =>
        prev.map((p) => (p.id === profileId ? { ...p, dutyOverride: override } : p))
      );
    },
    []
  );

  const handleUpdateProfileAvatar = useCallback(
    (profileId: string, avatarUrl: string | undefined) => {
      setProfiles((prev) => updateProfileAvatar(prev, profileId, avatarUrl));
      const existing = readPersistedJson<Record<string, string>>('operator_avatar_overrides', {});
      const nextOverrides = { ...existing };
      if (avatarUrl && isValidAvatarUrl(avatarUrl)) {
        nextOverrides[profileId] = avatarUrl;
      } else {
        delete nextOverrides[profileId];
      }
      writePersistedJson('operator_avatar_overrides', nextOverrides);
    },
    []
  );

  const handleSwitchShiftPattern = useCallback((patternId: ShiftPatternId) => {
    setShiftState((prev) => switchShiftPattern(prev, patternId));
  }, []);

  const handleExecuteHandover = useCallback(
    (params: { notes: string; checklistVerified: boolean; switchToIncomingLead: boolean }) => {
      const now = Date.now();
      const siteData = sitesMapRef.current[activeSiteIdRef.current];
      const critCount = siteData.alerts.filter(
        (a) => isAlertOpen(a) && a.severity === 'critical'
      ).length;
      const warnCount = siteData.alerts.filter(
        (a) => isAlertOpen(a) && a.severity === 'warning'
      ).length;
      const avgSlaPct =
        siteData.bms.envSensors.length > 0
          ? siteData.bms.envSensors.reduce((acc, s) => acc + s.slaCompliancePct, 0) /
            siteData.bms.envSensors.length
          : 100;
      const livePue =
        siteData.facilityHistory[siteData.facilityHistory.length - 1]?.pue ?? 1.32;

      const result = executeShiftHandover({
        state: shiftState,
        profiles,
        activeOperator: activeProfile,
        siteId: activeSiteIdRef.current,
        openCriticalCount: critCount,
        openWarningCount: warnCount,
        sitePue: livePue,
        slaCompliancePct: avgSlaPct,
        notes: params.notes,
        checklistVerified: params.checklistVerified,
        now,
      });

      setShiftState(result.nextState);
      if (params.switchToIncomingLead && result.incomingLead) {
        setActiveProfileId(result.incomingLead.id);
      }
      if (firebaseUser) {
        const openTkts = tickets.filter(
          (t) => t.siteId === activeSiteIdRef.current && t.status !== 'Resolved' && t.status !== 'Closed'
        ).length;
        const onSiteVis = visitorsRef.current.filter(
          (v) => v.siteId === activeSiteIdRef.current && v.status === 'Checked In'
        ).length;
        void saveShiftHandoverCloud({
          siteId: activeSiteIdRef.current,
          shiftLabel: `${result.entry.outgoingTeam} → ${result.entry.incomingTeam} (${result.entry.incomingSlot})`,
          operatorName: activeProfile.name,
          summary: params.notes || `${result.entry.incomingLeadName} assumed watch on ${result.entry.siteId.toUpperCase()}.`,
          openCriticalCount: critCount,
          openTicketsCount: openTkts,
          activeVisitorsCount: onSiteVis,
          signedOff: params.checklistVerified,
        });
      }
      enqueueToasts([
        {
          id: `toast-ho-${now}`,
          title: `Shift Handover Logged (${result.entry.outgoingTeam} → ${result.entry.incomingTeam})`,
          body: `${result.entry.incomingLeadName} assumed ${result.entry.incomingSlot} watch on ${result.entry.siteId.toUpperCase()}.`,
          severity: 'info',
        },
      ]);
    },
    [activeProfile, enqueueToasts, firebaseUser, profiles, saveShiftHandoverCloud, shiftState, tickets]
  );

  const handleSelectHallFromTree = (siteId: SiteId, hallId: HallId) => {
    setActiveSiteId(siteId);
    setSelectedServerId(null);
    setServerHallFilter(hallId);
    setActiveTab('servers');
    setMobileMenuOpen(false);
  };

  const handleSelectGlobalResult = (item: { id: string; kind: 'server' | 'bms' }) => {
    setGlobalQuery('');
    if (item.kind === 'server') {
      setSelectedServerId(item.id);
    } else {
      setFocusedBmsEquipmentId(item.id);
      setActiveTab('bms');
      setSelectedServerId(null);
    }
  };

  const handleCreateTicket = useCallback(
    (draft: NewTicketDraft): OpsTicket => {
      const now = Date.now();
      const created = createOpsTicket(tickets, draft, now);
      setTickets((prev) => [created, ...prev]);
      if (firebaseUser) {
        void syncTicketCloud({
          ticketId: created.id,
          siteId: created.siteId,
          title: created.title,
          priority: created.priority,
          status: created.status,
          assetLabel: created.affectedAssetLabel,
          assigneeName: created.assigneeName,
        });
      }
      enqueueToasts([
        {
          id: `toast-tkt-${created.id}`,
          title: `Ticket ${created.id} Created (${created.priority})`,
          body: `${created.title} assigned to ${created.assigneeName}.`,
          severity: created.priority === 'P1 - Critical' ? 'critical' : 'info',
        },
      ]);
      return created;
    },
    [enqueueToasts, firebaseUser, syncTicketCloud, tickets]
  );

  const handleCreateTicketFromAlert = useCallback(
    (alert: ActiveAlert) => {
      const existing = tickets.find(
        (t) => t.linkedAlertId === alert.id && t.status !== 'Closed'
      );
      if (existing) {
        setActiveTab('tickets');
        enqueueToasts([
          {
            id: `toast-tkt-exist-${Date.now()}`,
            title: `Existing Ticket ${existing.id}`,
            body: `Alert already linked to ${existing.id} (${existing.status}).`,
            severity: 'info',
          },
        ]);
        return;
      }
      const defaultAssignee =
        profiles.find((p) => p.primarySite === activeSiteIdRef.current) ??
        profiles[0] ??
        activeProfile;
      const created = createTicketFromAlert(
        tickets,
        alert,
        activeSiteIdRef.current,
        activeProfile,
        defaultAssignee,
        Date.now()
      );
      setTickets((prev) => [created, ...prev]);
      if (firebaseUser) {
        void syncTicketCloud({
          ticketId: created.id,
          siteId: created.siteId,
          title: created.title,
          priority: created.priority,
          status: created.status,
          assetLabel: created.affectedAssetLabel,
          assigneeName: created.assigneeName,
        });
      }
      setActiveTab('tickets');
      enqueueToasts([
        {
          id: `toast-tkt-alert-${created.id}`,
          title: `Escalated to ${created.id} (${created.priority})`,
          body: `${created.title} assigned to ${created.assigneeName}.`,
          severity: alert.severity === 'critical' ? 'critical' : 'warning',
        },
      ]);
    },
    [activeProfile, enqueueToasts, firebaseUser, profiles, syncTicketCloud, tickets]
  );

  const handleTransitionTicketStatus = useCallback(
    (ticketId: string, nextStatus: TicketStatus, note?: string) => {
      const now = Date.now();
      setTickets((prev) => {
        const nextList = transitionTicketStatus(
          prev,
          ticketId,
          nextStatus,
          { name: activeProfile.name, role: activeProfile.role },
          note,
          now
        );
        if (firebaseUser) {
          const updated = nextList.find((t) => t.id === ticketId);
          if (updated) {
            void syncTicketCloud({
              ticketId: updated.id,
              siteId: updated.siteId,
              title: updated.title,
              priority: updated.priority,
              status: updated.status,
              assetLabel: updated.affectedAssetLabel,
              assigneeName: updated.assigneeName,
            });
          }
        }
        return nextList;
      });
    },
    [activeProfile.name, activeProfile.role, firebaseUser, syncTicketCloud]
  );

  const handleAssignTicket = useCallback(
    (ticketId: string, assigneeId: string) => {
      const assignee = profiles.find((p) => p.id === assigneeId);
      if (!assignee) return;
      const now = Date.now();
      setTickets((prev) => {
        const nextList = assignOpsTicket(
          prev,
          ticketId,
          { id: assignee.id, name: assignee.name },
          { name: activeProfile.name, role: activeProfile.role },
          now
        );
        if (firebaseUser) {
          const updated = nextList.find((t) => t.id === ticketId);
          if (updated) {
            void syncTicketCloud({
              ticketId: updated.id,
              siteId: updated.siteId,
              title: updated.title,
              priority: updated.priority,
              status: updated.status,
              assetLabel: updated.affectedAssetLabel,
              assigneeName: updated.assigneeName,
            });
          }
        }
        return nextList;
      });
    },
    [activeProfile.name, activeProfile.role, firebaseUser, profiles, syncTicketCloud]
  );

  const handleAddTicketComment = useCallback(
    (ticketId: string, body: string) => {
      const now = Date.now();
      setTickets((prev) =>
        addTicketComment(
          prev,
          ticketId,
          body,
          { name: activeProfile.name, role: activeProfile.role },
          now
        )
      );
    },
    [activeProfile.name, activeProfile.role]
  );

  const activeSiteOpenTicketCount = useMemo(
    () =>
      tickets.filter(
        (t) => t.siteId === activeSiteId && t.status !== 'Resolved' && t.status !== 'Closed'
      ).length,
    [tickets, activeSiteId]
  );

  const toCloudVisitorStatus = (
    status: VisitorRecord['status']
  ): 'Pre-Registered' | 'Checked In' | 'Checked Out' | 'Revoked' => {
    if (status === 'Pre-Approved') return 'Pre-Registered';
    if (status === 'Denied / Revoked') return 'Revoked';
    return status;
  };

  const fromCloudVisitorStatus = (
    status: 'Pre-Registered' | 'Checked In' | 'Checked Out' | 'Revoked'
  ): VisitorRecord['status'] => {
    if (status === 'Pre-Registered') return 'Pre-Approved';
    if (status === 'Revoked') return 'Denied / Revoked';
    return status;
  };

  const handleRegisterVisitor = useCallback(
    (draft: VisitorDraft): VisitorRecord => {
      const now = Date.now();
      const created = registerVisitor(visitorsRef.current, draft, activeProfile.name, now);
      const next = [created, ...visitorsRef.current];
      visitorsRef.current = next;
      setVisitors(next);
      if (firebaseUser) {
        void syncVisitorCloud({
          visitorId: created.id,
          siteId: created.siteId,
          fullName: created.fullName,
          company: created.company,
          status: toCloudVisitorStatus(created.status),
          escortName: created.escortName,
          badgeNumber: created.badgeNumber ?? 'PENDING',
        });
      }
      enqueueToasts([
        {
          id: `toast-vis-reg-${created.id}`,
          title: `Visitor ${created.id} Pre-Approved`,
          body: `${created.fullName} (${created.company}) registered for ${created.siteId.toUpperCase()}.`,
          severity: 'info',
        },
      ]);
      return created;
    },
    [activeProfile.name, enqueueToasts, firebaseUser, syncVisitorCloud]
  );

  const handleUpdateVisitorCompliance = useCallback(
    (
      visitorId: string,
      patch: Partial<Pick<VisitorRecord, 'ndaSigned' | 'safetyBriefed' | 'biometricVerified' | 'parkingBay'>>
    ) => {
      const now = Date.now();
      const next = updateVisitorCompliance(visitorsRef.current, visitorId, patch, activeProfile.name, now);
      visitorsRef.current = next;
      setVisitors(next);
    },
    [activeProfile.name]
  );

  const handleLogAudit = useCallback(
    (category: ImmutableAuditEntry['category'], action: string, target: string) => {
      const siteCode = SITE_META_MAP[activeSiteIdRef.current].code;
      const actor = activeProfileNameRef.current;
      setAuditTrail((prev) => {
        const next = appendImmutableAudit(prev, {
          timestamp: Date.now(),
          siteCode,
          actor,
          category,
          action,
          target,
        });
        const newest = next[0];
        if (firebaseUser && newest) {
          void syncAuditEventCloud({
            auditId: newest.id,
            siteCode: newest.siteCode,
            actor: newest.actor,
            category: newest.category,
            action: newest.action,
            target: newest.target,
            hash: newest.hash,
            prevHash: newest.prevHash,
          });
        }
        return next;
      });
    },
    [firebaseUser, syncAuditEventCloud]
  );

  const handleCheckInVisitor = useCallback(
    (visitorId: string): CheckInResult => {
      const now = Date.now();
      const result = checkInVisitor(visitorsRef.current, visitorId, activeProfile.name, now);
      if (result.ok) {
        visitorsRef.current = result.visitors;
        setVisitors(result.visitors);
        const target = result.visitors.find((v) => v.id === visitorId);
        if (firebaseUser && target) {
          void syncVisitorCloud({
            visitorId: target.id,
            siteId: target.siteId,
            fullName: target.fullName,
            company: target.company,
            status: toCloudVisitorStatus(target.status),
            escortName: target.escortName,
            badgeNumber: target.badgeNumber ?? result.badgeNumber ?? 'ISSUED',
          });
        }
        handleLogAudit(
          'Security',
          `Visitor checked in (${result.badgeNumber ?? 'Badge Issued'})`,
          target ? `${target.fullName} · ${target.company}` : visitorId
        );
        enqueueToasts([
          {
            id: `toast-vis-in-${visitorId}-${now}`,
            title: `Visitor Checked In · Badge ${result.badgeNumber ?? 'Issued'}`,
            body: target
              ? `${target.fullName} (${target.company}) granted mantrap access.`
              : `Visitor ${visitorId} checked in.`,
            severity: 'info',
          },
        ]);
      }
      return result;
    },
    [activeProfile.name, enqueueToasts, firebaseUser, handleLogAudit, syncVisitorCloud]
  );

  const handleCheckOutVisitor = useCallback(
    (visitorId: string, note?: string) => {
      const now = Date.now();
      const prevTarget = visitorsRef.current.find((v) => v.id === visitorId);
      const next = checkOutVisitor(visitorsRef.current, visitorId, activeProfile.name, now, note);
      visitorsRef.current = next;
      setVisitors(next);
      const updatedTarget = next.find((v) => v.id === visitorId);
      if (firebaseUser && updatedTarget) {
        void syncVisitorCloud({
          visitorId: updatedTarget.id,
          siteId: updatedTarget.siteId,
          fullName: updatedTarget.fullName,
          company: updatedTarget.company,
          status: toCloudVisitorStatus(updatedTarget.status),
          escortName: updatedTarget.escortName,
          badgeNumber: updatedTarget.badgeNumber ?? 'RETURNED',
        });
      }
      if (prevTarget) {
        enqueueToasts([
          {
            id: `toast-vis-out-${visitorId}-${now}`,
            title: `Visitor Checked Out · ${prevTarget.badgeNumber ?? prevTarget.id}`,
            body: `${prevTarget.fullName} departed and RFID badge deactivated.`,
            severity: 'info',
          },
        ]);
      }
    },
    [activeProfile.name, enqueueToasts, firebaseUser, syncVisitorCloud]
  );

  const handleRevokeVisitor = useCallback(
    (visitorId: string, reason: string) => {
      const now = Date.now();
      const prevTarget = visitorsRef.current.find((v) => v.id === visitorId);
      const next = revokeVisitorAccess(visitorsRef.current, visitorId, reason, activeProfile.name, now);
      visitorsRef.current = next;
      setVisitors(next);
      const updatedTarget = next.find((v) => v.id === visitorId);
      if (firebaseUser && updatedTarget) {
        void syncVisitorCloud({
          visitorId: updatedTarget.id,
          siteId: updatedTarget.siteId,
          fullName: updatedTarget.fullName,
          company: updatedTarget.company,
          status: toCloudVisitorStatus(updatedTarget.status),
          escortName: updatedTarget.escortName,
          badgeNumber: updatedTarget.badgeNumber ?? 'REVOKED',
        });
      }
      if (prevTarget) {
        handleLogAudit(
          'Security',
          `Revoked visitor access: ${reason.trim() || 'NOC security hold'}`,
          `${prevTarget.fullName} (${prevTarget.id})`
        );
        enqueueToasts([
          {
            id: `toast-vis-rev-${visitorId}-${now}`,
            title: `Visitor Access Revoked · ${prevTarget.id}`,
            body: `${prevTarget.fullName}: ${reason.trim() || 'Access revoked by NOC security'}.`,
            severity: 'warning',
          },
        ]);
      }
    },
    [activeProfile.name, enqueueToasts, firebaseUser, handleLogAudit, syncVisitorCloud]
  );

  const activeSiteOnSiteVisitorCount = useMemo(
    () => visitors.filter((v) => v.siteId === activeSiteId && v.status === 'Checked In').length,
    [visitors, activeSiteId]
  );

  // Persist operational workspace records across refreshes
  useEffect(() => {
    writePersistedJson('ops_tickets', tickets.slice(0, 120));
  }, [tickets]);
  useEffect(() => {
    writePersistedJson('ops_visitors', visitors.slice(0, 120));
  }, [visitors]);
  useEffect(() => {
    writePersistedJson('ops_audit_trail', auditTrail.slice(0, 180));
  }, [auditTrail]);
  useEffect(() => {
    writePersistedJson('ops_maintenance_windows', localMaintenanceWindows.slice(0, 40));
  }, [localMaintenanceWindows]);
  useEffect(() => {
    writePersistedJson('rack_u_reservations_by_site', rackReservationsBySite);
  }, [rackReservationsBySite]);
  useEffect(() => {
    writePersistedJson('pinned_racks', pinnedRackIds);
  }, [pinnedRackIds]);
  useEffect(() => {
    writePersistedJson('favorite_tabs', favoriteTabs);
  }, [favoriteTabs]);
  useEffect(() => {
    writePersistedJson('workspace_role', workspaceRole);
  }, [workspaceRole]);
  useEffect(() => {
    writePersistedJson('dark_mode', darkMode);
  }, [darkMode]);

  // Hydrate cloud-synced Alert States, Custom Rules, Visitors, and Runbooks on sign-in
  useEffect(() => {
    if (!firebaseUser || cloudAlertStates.length === 0) return;
    setSitesMap((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const rec of cloudAlertStates) {
        const site = next[rec.siteId];
        if (!site) continue;
        const idx = site.alerts.findIndex((a) => a.id === rec.alertId);
        if (idx >= 0 && site.alerts[idx].state !== rec.state) {
          const updatedAlerts = site.alerts.map((a) =>
            a.id === rec.alertId
              ? {
                  ...a,
                  state: rec.state,
                  acknowledgedBy: rec.state === 'acknowledged' ? rec.actorName : a.acknowledgedBy,
                  acknowledgedAt: rec.state === 'acknowledged' ? rec.updatedAtMs : a.acknowledgedAt,
                  resolvedAt: rec.state === 'resolved' ? rec.updatedAtMs : a.resolvedAt,
                }
              : a
          );
          next[rec.siteId] = { ...site, alerts: updatedAlerts };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [firebaseUser, cloudAlertStates]);

  useEffect(() => {
    if (!firebaseUser || cloudCustomRules.length === 0) return;
    setSitesMap((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const rec of cloudCustomRules) {
        const site = next[rec.siteId];
        if (!site) continue;
        const existingIdx = site.rules.findIndex((r) => r.id === rec.ruleId);
        if (existingIdx >= 0) {
          if (site.rules[existingIdx].enabled !== rec.enabled) {
            next[rec.siteId] = {
              ...site,
              rules: site.rules.map((r) =>
                r.id === rec.ruleId ? { ...r, enabled: rec.enabled } : r
              ),
            };
            changed = true;
          }
        } else {
          const hydrated: AlertRule = {
            id: rec.ruleId,
            name: rec.name,
            metric: rec.metric as AlertRule['metric'],
            operator: rec.operator,
            threshold: rec.threshold,
            severity: rec.severity,
            scopeHall: rec.scopeHall,
            channelIds: [],
            enabled: rec.enabled,
            autoResolve: true,
            cooldownSec: 120,
          };
          next[rec.siteId] = { ...site, rules: [hydrated, ...site.rules] };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [firebaseUser, cloudCustomRules]);

  useEffect(() => {
    if (!firebaseUser || cloudVisitors.length === 0) return;
    setVisitors((prev) => {
      let changed = false;
      const next = prev.map((v) => {
        const remote = cloudVisitors.find((cv) => cv.visitorId === v.id);
        const mappedStatus = remote ? fromCloudVisitorStatus(remote.status) : null;
        if (remote && mappedStatus && mappedStatus !== v.status) {
          changed = true;
          return { ...v, status: mappedStatus, badgeNumber: remote.badgeNumber || v.badgeNumber };
        }
        return v;
      });
      if (changed) {
        visitorsRef.current = next;
        return next;
      }
      return prev;
    });
  }, [firebaseUser, cloudVisitors]);

  useEffect(() => {
    if (!firebaseUser || cloudRunbooks.length === 0) return;
    setWarRoomsBySite((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const rb of cloudRunbooks) {
        const existing = next[rb.siteId]?.[rb.alertId];
        if (
          existing &&
          (existing.notes !== rb.notes ||
            existing.assignedEngineerName !== rb.assignedEngineerName ||
            existing.appendedToHandover !== rb.appendedToHandover)
        ) {
          next[rb.siteId] = {
            ...next[rb.siteId],
            [rb.alertId]: {
              ...existing,
              notes: rb.notes,
              assignedEngineerName: rb.assignedEngineerName,
              appendedToHandover: rb.appendedToHandover,
            },
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [firebaseUser, cloudRunbooks]);

  const handleCreateMaintenanceWindow = useCallback(
    (draft: Omit<MaintenanceWindow, 'id' | 'status' | 'createdBy'>) => {
      const now = Date.now();
      const status: MaintenanceWindow['status'] =
        now >= draft.startAtMs && now <= draft.endAtMs ? 'active' : 'scheduled';
      if (firebaseUser) {
        void saveMaintenanceWindowCloud({
          siteId: draft.siteId,
          title: draft.title,
          scopeType: draft.scopeType,
          scopeValue: draft.scopeValue,
          reason: draft.reason,
          createdBy: activeProfile.name,
          status,
          startAtMs: draft.startAtMs,
          endAtMs: draft.endAtMs,
        });
      } else {
        const created: MaintenanceWindow = {
          ...draft,
          id: `mw-${now.toString(36)}`,
          status,
          createdBy: activeProfile.name,
          cloudSynced: false,
        };
        setLocalMaintenanceWindows((prev) => [created, ...prev]);
      }
      handleLogAudit(
        'Alert',
        `Scheduled ${status} maintenance window (${draft.scopeType}:${draft.scopeValue})`,
        draft.title
      );
      enqueueToasts([
        {
          id: `toast-mw-${now}`,
          title: `Maintenance Window ${status === 'active' ? 'Active' : 'Scheduled'}`,
          body: `${draft.title} (${draft.scopeType}: ${draft.scopeValue})${firebaseUser ? ' · Synced to cloud' : ''}.`,
          severity: 'info',
        },
      ]);
    },
    [activeProfile.name, enqueueToasts, firebaseUser, handleLogAudit, saveMaintenanceWindowCloud]
  );

  const handleEndMaintenanceWindow = useCallback(
    (windowId: string) => {
      if (windowId.startsWith('cloud-') && firebaseUser) {
        void endMaintenanceWindowCloud(windowId.slice('cloud-'.length));
      } else {
        setLocalMaintenanceWindows((prev) =>
          prev.map((w) => (w.id === windowId ? { ...w, status: 'ended' } : w))
        );
      }
      handleLogAudit('Alert', 'Ended maintenance silence window early', windowId);
    },
    [endMaintenanceWindowCloud, firebaseUser, handleLogAudit]
  );

  const handleDeleteMaintenanceWindow = useCallback(
    (windowId: string) => {
      if (windowId.startsWith('cloud-') && firebaseUser) {
        void deleteMaintenanceWindowCloud(windowId.slice('cloud-'.length));
      } else {
        setLocalMaintenanceWindows((prev) => prev.filter((w) => w.id !== windowId));
      }
      handleLogAudit('Alert', 'Removed maintenance silence window record', windowId);
    },
    [deleteMaintenanceWindowCloud, firebaseUser, handleLogAudit]
  );

  const handleMoveServerInRack = useCallback(
    (rackId: string, serverId: string, targetUStart: number): { ok: boolean; error?: string } => {
      const rack = INITIAL_RACKS.find((r) => r.id === rackId);
      if (!rack) return { ok: false, error: `Cabinet ${rackId} not found.` };
      const currentServers = sitesMapRef.current[activeSiteIdRef.current].servers;
      const reservations = rackReservationsBySite[activeSiteIdRef.current] ?? [];
      const targetSrv = currentServers.find((s) => s.id === serverId);
      if (targetSrv) {
        const resCheck = validateRackSlotAvailability(
          rack,
          currentServers.filter((s) => s.rackId === rackId),
          reservations,
          targetUStart,
          targetSrv.uHeight,
          serverId
        );
        if (!resCheck.valid) {
          return { ok: false, error: resCheck.reason };
        }
      }
      const result = moveServerInRack(currentServers, rack, serverId, targetUStart);
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      const movedNode = result.servers.find((s) => s.id === serverId);
      updateActiveSite((site) => ({
        ...site,
        servers: result.servers,
      }));
      handleLogAudit(
        'CMMS',
        `MAC elevation move: ${movedNode?.hostname ?? serverId} relocated to U${Math.round(targetUStart)} in ${rackId} (${result.metrics.estimatedWeightKg} kg · 2N Δ${result.metrics.feedImbalancePct.toFixed(1)}%)`,
        rackId
      );
      enqueueToasts([
        {
          id: `toast-mac-${serverId}-${Date.now()}`,
          title: `42U MAC Applied · ${rackId}`,
          body: `${movedNode?.hostname ?? serverId} moved to U${Math.round(targetUStart)}. 2N Feed A/B Δ ${result.metrics.feedImbalancePct.toFixed(1)}%.`,
          severity: 'info',
        },
      ]);
      return { ok: true };
    },
    [enqueueToasts, handleLogAudit, rackReservationsBySite, updateActiveSite]
  );

  // 1. QR Scanner Resolution across KL1 / KL2 / KL3
  const handleResolveQrServer = useCallback(
    (targetSiteId: SiteId, serverId: string) => {
      const siteCode = SITE_META_MAP[targetSiteId].code;
      const srv = sitesMapRef.current[targetSiteId]?.servers.find((s) => s.id === serverId);
      setActiveSiteId(targetSiteId);
      setExpandedSites((prev) => ({ ...prev, [targetSiteId]: true }));
      setActiveTab('servers');
      setSelectedServerId(serverId);
      setQrScannerOpen(false);
      handleLogAudit(
        'CMMS',
        `QR Asset Tag scanned & resolved (${srv?.hostname ?? serverId})`,
        `${siteCode} · ${srv?.rackId ?? 'Inventory'}`
      );
      enqueueToasts([
        {
          id: `toast-qr-scan-${Date.now()}`,
          title: `Asset QR Resolved · ${siteCode}`,
          body: srv
            ? `Opened ${srv.hostname} (${srv.rackId} · U${srv.uStart}).`
            : `Opened server ${serverId}.`,
          severity: 'info',
        },
      ]);
    },
    [enqueueToasts, handleLogAudit]
  );

  // 2. Interactive 42U Elevation Editor (Deploy, Cross-Rack Move, Decommission, Reserve U)
  const handleDeployServerInRack = useCallback(
    (
      rackId: string,
      draft: NewServerDeploymentDraft
    ): { ok: boolean; error?: string; server?: ServerNode } => {
      const rack = INITIAL_RACKS.find((r) => r.id === rackId);
      if (!rack) return { ok: false, error: `Cabinet ${rackId} not found.` };
      const sid = activeSiteIdRef.current;
      const curServers = sitesMapRef.current[sid].servers;
      const reservations = rackReservationsBySite[sid] ?? [];
      const check = validateServerDeployment(rack, curServers, reservations, draft);
      if (!check.valid) return { ok: false, error: check.reason };
      const ipPrefix = sid === 'kl1' ? 40 : sid === 'kl2' ? 42 : 44;
      const created = createDeployedServerNode(rack, draft, ipPrefix, Date.now());
      updateActiveSite((site) => ({
        ...site,
        servers: [created, ...site.servers],
      }));
      handleLogAudit(
        'CMMS',
        `Deployed ${created.hostname} (${created.role}, ${created.uHeight}U, ${created.ratedPowerW}W) at U${created.uStart}`,
        rackId
      );
      enqueueToasts([
        {
          id: `toast-deploy-${created.id}`,
          title: `Server Deployed · ${rackId}`,
          body: `${created.hostname} mounted at U${created.uStart} (${created.uHeight}U · ${created.powerW}W live).`,
          severity: 'info',
        },
      ]);
      return { ok: true, server: created };
    },
    [enqueueToasts, handleLogAudit, rackReservationsBySite, updateActiveSite]
  );

  const handleMoveServerAcrossRacks = useCallback(
    (
      serverId: string,
      targetRackId: string,
      targetUStart: number
    ): { ok: boolean; error?: string } => {
      const sid = activeSiteIdRef.current;
      const curServers = sitesMapRef.current[sid].servers;
      const reservations = rackReservationsBySite[sid] ?? [];
      const result = moveServerAcrossRacks(
        curServers,
        INITIAL_RACKS,
        reservations,
        serverId,
        targetRackId,
        targetUStart
      );
      if (!result.ok) return { ok: false, error: result.error };
      const moved = result.servers.find((s) => s.id === serverId);
      updateActiveSite((site) => ({ ...site, servers: result.servers }));
      handleLogAudit(
        'CMMS',
        `Cross-rack MAC move: ${moved?.hostname ?? serverId} relocated to ${targetRackId} U${Math.round(targetUStart)}`,
        targetRackId
      );
      enqueueToasts([
        {
          id: `toast-xmove-${serverId}-${Date.now()}`,
          title: `Cross-Rack Relocation · ${targetRackId}`,
          body: `${moved?.hostname ?? serverId} moved to ${targetRackId} U${Math.round(targetUStart)}.`,
          severity: 'info',
        },
      ]);
      return { ok: true };
    },
    [enqueueToasts, handleLogAudit, rackReservationsBySite, updateActiveSite]
  );

  const handleDecommissionServer = useCallback(
    (serverId: string): { ok: boolean; error?: string } => {
      const sid = activeSiteIdRef.current;
      const curServers = sitesMapRef.current[sid].servers;
      const result = decommissionServerFromRack(curServers, serverId);
      if (!result.ok || !result.removed) {
        return { ok: false, error: 'Server chassis not found.' };
      }
      updateActiveSite((site) => ({
        ...site,
        servers: result.servers,
        alerts: site.alerts.filter((a) => a.serverId !== serverId),
      }));
      if (selectedServerId === serverId) setSelectedServerId(null);
      handleLogAudit(
        'CMMS',
        `Decommissioned ${result.removed.hostname} (${result.removed.uHeight}U, ${result.removed.powerW}W reclaimed)`,
        result.removed.rackId
      );
      enqueueToasts([
        {
          id: `toast-decom-${serverId}-${Date.now()}`,
          title: `Chassis Decommissioned · ${result.removed.rackId}`,
          body: `${result.removed.hostname} removed from 42U elevation; power & U-space reclaimed.`,
          severity: 'warning',
        },
      ]);
      return { ok: true };
    },
    [enqueueToasts, handleLogAudit, selectedServerId, updateActiveSite]
  );

  const handleAddRackReservation = useCallback(
    (
      rackId: string,
      uStart: number,
      uHeight: number,
      label: string
    ): { ok: boolean; error?: string } => {
      const rack = INITIAL_RACKS.find((r) => r.id === rackId);
      if (!rack) return { ok: false, error: `Cabinet ${rackId} not found.` };
      const sid = activeSiteIdRef.current;
      const rackServers = sitesMapRef.current[sid].servers.filter((s) => s.rackId === rackId);
      const existing = rackReservationsBySite[sid] ?? [];
      const check = validateRackSlotAvailability(rack, rackServers, existing, uStart, uHeight);
      if (!check.valid) return { ok: false, error: check.reason };
      const created: RackUReservation = {
        id: `res-${Date.now().toString(36)}`,
        rackId,
        uStart: Math.round(uStart),
        uHeight: Math.round(uHeight),
        label: label.trim() || 'Reserved U-Space',
        reservedBy: activeProfileNameRef.current,
        createdAt: Date.now(),
      };
      setRackReservationsBySite((prev) => ({
        ...prev,
        [sid]: [created, ...(prev[sid] ?? [])],
      }));
      handleLogAudit(
        'CMMS',
        `Reserved U${created.uStart}–U${created.uStart + created.uHeight - 1} (${created.label})`,
        rackId
      );
      return { ok: true };
    },
    [handleLogAudit, rackReservationsBySite]
  );

  const handleRemoveRackReservation = useCallback(
    (reservationId: string) => {
      const sid = activeSiteIdRef.current;
      setRackReservationsBySite((prev) => ({
        ...prev,
        [sid]: (prev[sid] ?? []).filter((r) => r.id !== reservationId),
      }));
      handleLogAudit('CMMS', 'Released reserved cabinet U-space block', reservationId);
    },
    [handleLogAudit]
  );

  // 3. Out-of-Band BMC Redfish Controls & Firmware Window Scheduling
  const handleExecuteBmcAction = useCallback(
    (serverId: string, action: BmcActionType) => {
      const sid = activeSiteIdRef.current;
      const srv = sitesMapRef.current[sid].servers.find((s) => s.id === serverId);
      if (!srv) return;
      const actor = activeProfileNameRef.current;
      const now = Date.now();
      setBmcStatesBySite((prev) => {
        const siteMap = prev[sid] ?? {};
        const current = siteMap[serverId] ?? createInitialServerBmcState(srv, now);
        const updated = applyBmcAction(current, action, actor, now);
        return {
          ...prev,
          [sid]: { ...siteMap, [serverId]: updated },
        };
      });

      if (action === 'graceful_shutdown') {
        updateActiveSite((site) => ({
          ...site,
          servers: site.servers.map((s) =>
            s.id === serverId ? { ...s, status: 'maintenance', powerW: 25, cpu: 0 } : s
          ),
        }));
      } else if (action === 'power_on') {
        updateActiveSite((site) => ({
          ...site,
          servers: site.servers.map((s) =>
            s.id === serverId
              ? { ...s, status: 'nominal', powerW: Math.round(s.ratedPowerW * 0.7), cpu: 38 }
              : s
          ),
        }));
      } else if (action === 'graceful_restart' || action === 'power_cycle') {
        window.setTimeout(() => {
          setBmcStatesBySite((prev) => {
            const siteMap = prev[sid] ?? {};
            const curBmc = siteMap[serverId];
            if (!curBmc) return prev;
            if (curBmc.powerState !== 'GracefulRestarting' && curBmc.powerState !== 'PowerCycling') {
              return prev;
            }
            return {
              ...prev,
              [sid]: {
                ...siteMap,
                [serverId]: {
                  ...curBmc,
                  powerState: 'On',
                  selLog: [
                    {
                      id: `sel-post-${Date.now().toString(36)}`,
                      timestamp: Date.now(),
                      severity: 'OK',
                      sensor: 'Redfish POST',
                      message: 'OS boot completed and telemetry heartbeats restored',
                      actor: 'BMC',
                    },
                    ...curBmc.selLog,
                  ].slice(0, 12),
                },
              },
            };
          });
        }, 2200);
      }

      handleLogAudit('CMMS', `BMC Redfish command: ${action} on ${srv.hostname}`, srv.rackId);
      enqueueToasts([
        {
          id: `toast-bmc-${serverId}-${now}`,
          title: `BMC Redfish · ${srv.hostname}`,
          body:
            action === 'toggle_locate_led'
              ? `Toggled Blue Locate LED on ${srv.hostname} (${srv.rackId} synced on Rack Map & 3D Twin).`
              : `Executed ${action.replace('_', ' ')} via out-of-band Redfish API.`,
          severity: action === 'power_cycle' || action === 'graceful_shutdown' ? 'warning' : 'info',
        },
      ]);
    },
    [enqueueToasts, handleLogAudit, updateActiveSite]
  );

  const handleScheduleFirmwareWindow = useCallback(
    (server: ServerNode, driftedComponents: string[]) => {
      const sid = activeSiteIdRef.current;
      const now = Date.now();
      const startAtMs = now + 60 * 60 * 1000;
      const endAtMs = startAtMs + 2 * 60 * 60 * 1000;
      const winId = `FW-${now.toString(36).toUpperCase().slice(-5)}`;
      handleCreateMaintenanceWindow({
        siteId: sid,
        title: `Firmware Compliance Patch · ${server.hostname}`,
        scopeType: 'rack',
        scopeValue: server.rackId,
        reason: `Redfish out-of-band update for ${driftedComponents.join(', ')}`,
        startAtMs,
        endAtMs,
      });
      setBmcStatesBySite((prev) => {
        const siteMap = prev[sid] ?? {};
        const curBmc = siteMap[server.id] ?? createInitialServerBmcState(server, now);
        return {
          ...prev,
          [sid]: {
            ...siteMap,
            [server.id]: {
              ...curBmc,
              scheduledFirmwareWindowId: winId,
              selLog: [
                {
                  id: `sel-fw-${now.toString(36)}`,
                  timestamp: now,
                  severity: 'OK',
                  sensor: 'Firmware Lifecycle',
                  message: `Scheduled maintenance window ${winId} for ${driftedComponents.join(', ')}`,
                  actor: activeProfileNameRef.current,
                },
                ...curBmc.selLog,
              ].slice(0, 12),
            },
          },
        };
      });
    },
    [handleCreateMaintenanceWindow]
  );

  // 4. Incident War Room & Interactive Runbooks
  const activeSiteEngineers = useMemo(
    () => profiles.filter((p) => p.primarySite === activeSiteId),
    [profiles, activeSiteId]
  );

  const syncWarRoomRecordToCloud = useCallback(
    (record: IncidentWarRoomRecord) => {
      if (!firebaseUser) return;
      const completedSteps = record.steps.filter((s) => s.completed).length;
      void syncIncidentRunbookCloud({
        runbookId: record.id,
        alertId: record.alertId,
        siteId: record.siteId,
        title: record.title,
        assignedEngineerName: record.assignedEngineerName,
        completedSteps,
        totalSteps: record.steps.length,
        appendedToHandover: record.appendedToHandover,
        notes: record.notes,
      });
    },
    [firebaseUser, syncIncidentRunbookCloud]
  );

  const handleOpenWarRoom = useCallback(
    (alert: ActiveAlert) => {
      const sid = activeSiteIdRef.current;
      const siteCode = SITE_META_MAP[sid].code;
      const defaultEngineer =
        profiles.find((p) => p.primarySite === sid && p.id === activeProfileId) ??
        profiles.find((p) => p.primarySite === sid) ??
        activeProfile;

      if (alert.state === 'active') {
        handleAcknowledgeAlert(alert.id);
      }

      setWarRoomsBySite((prev) => {
        const siteMap = prev[sid] ?? {};
        if (siteMap[alert.id]) return prev;
        const created = createIncidentWarRoomRecord({
          alert,
          siteId: sid,
          siteCode,
          assignedEngineerId: defaultEngineer.id,
          assignedEngineerName: defaultEngineer.name,
        });
        syncWarRoomRecordToCloud(created);
        return {
          ...prev,
          [sid]: { ...siteMap, [alert.id]: created },
        };
      });
      setWarRoomAlertId(alert.id);
      handleLogAudit('Alert', `Opened Incident War Room runbook for ${alert.ruleName}`, alert.rackId);
    },
    [
      activeProfile,
      activeProfileId,
      handleAcknowledgeAlert,
      handleLogAudit,
      profiles,
      syncWarRoomRecordToCloud,
    ]
  );

  const handleToggleWarRoomStep = useCallback(
    (alertId: string, stepId: string) => {
      const sid = activeSiteIdRef.current;
      setWarRoomsBySite((prev) => {
        const current = prev[sid]?.[alertId];
        if (!current) return prev;
        const updated = toggleRunbookStep(current, stepId, activeProfileNameRef.current, Date.now());
        syncWarRoomRecordToCloud(updated);
        return {
          ...prev,
          [sid]: { ...prev[sid], [alertId]: updated },
        };
      });
    },
    [syncWarRoomRecordToCloud]
  );

  const handleAssignWarRoomEngineer = useCallback(
    (alertId: string, engineerId: string, engineerName: string) => {
      const sid = activeSiteIdRef.current;
      setWarRoomsBySite((prev) => {
        const current = prev[sid]?.[alertId];
        if (!current) return prev;
        const updated: IncidentWarRoomRecord = {
          ...current,
          assignedEngineerId: engineerId,
          assignedEngineerName: engineerName,
        };
        syncWarRoomRecordToCloud(updated);
        return {
          ...prev,
          [sid]: { ...prev[sid], [alertId]: updated },
        };
      });
      handleLogAudit('Alert', `Assigned War Room incident lead to ${engineerName}`, alertId);
    },
    [handleLogAudit, syncWarRoomRecordToCloud]
  );

  const handleUpdateWarRoomNotes = useCallback(
    (alertId: string, notes: string) => {
      const sid = activeSiteIdRef.current;
      setWarRoomsBySite((prev) => {
        const current = prev[sid]?.[alertId];
        if (!current) return prev;
        const updated: IncidentWarRoomRecord = { ...current, notes };
        syncWarRoomRecordToCloud(updated);
        return {
          ...prev,
          [sid]: { ...prev[sid], [alertId]: updated },
        };
      });
    },
    [syncWarRoomRecordToCloud]
  );

  const handleAppendWarRoomToHandover = useCallback(
    (record: IncidentWarRoomRecord) => {
      const sid = activeSiteIdRef.current;
      const summaryLine = formatIncidentForShiftHandover(record, Date.now());
      handleExecuteHandover({
        notes: summaryLine,
        checklistVerified: true,
        switchToIncomingLead: false,
      });
      setWarRoomsBySite((prev) => {
        const current = prev[sid]?.[record.alertId];
        if (!current) return prev;
        const updated: IncidentWarRoomRecord = { ...current, appendedToHandover: true };
        syncWarRoomRecordToCloud(updated);
        return {
          ...prev,
          [sid]: { ...prev[sid], [record.alertId]: updated },
        };
      });
      handleLogAudit('Alert', 'Appended Incident War Room summary to Shift Handover log', record.rackId);
    },
    [handleExecuteHandover, handleLogAudit, syncWarRoomRecordToCloud]
  );

  const activeSiteBmcMap = bmcStatesBySite[activeSiteId] ?? {};
  const selectedServerBmcState = useMemo(() => {
    if (!selectedServer) return null;
    return activeSiteBmcMap[selectedServer.id] ?? createInitialServerBmcState(selectedServer);
  }, [activeSiteBmcMap, selectedServer]);

  const activeSiteLocateLedServerIds = useMemo(
    () =>
      Object.values(activeSiteBmcMap)
        .filter((s) => s.locateLedOn)
        .map((s) => s.serverId),
    [activeSiteBmcMap]
  );

  const activeSiteLocateLedRackIds = useMemo(() => {
    const idSet = new Set(activeSiteLocateLedServerIds);
    const racksWithLed = new Set<string>();
    for (const s of servers) {
      if (idSet.has(s.id)) racksWithLed.add(s.rackId);
    }
    return Array.from(racksWithLed);
  }, [activeSiteLocateLedServerIds, servers]);

  const activeSiteWarRooms = warRoomsBySite[activeSiteId] ?? {};
  const activeWarRoomAlert = useMemo(
    () => (warRoomAlertId ? alerts.find((a) => a.id === warRoomAlertId) ?? null : null),
    [alerts, warRoomAlertId]
  );
  const activeWarRoomRecord = warRoomAlertId ? activeSiteWarRooms[warRoomAlertId] ?? null : null;

  // URL Deep-Link Synchronization (?site=...&tab=...&hall=...&rack=...&sensor=1&server=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const qs = buildUrlWorkspaceSearch({
      siteId: activeSiteId,
      tab: activeTab,
      hallId: rackDeepLink.hallId ?? undefined,
      rackId: rackDeepLink.rackId ?? undefined,
      sensorHeatmap: rackDeepLink.sensorHeatmap ?? undefined,
      serverId: selectedServerId ?? undefined,
    });
    const nextUrl = `${window.location.pathname}${qs}`;
    if (nextUrl !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', nextUrl);
    }
  }, [activeSiteId, activeTab, rackDeepLink, selectedServerId]);

  // Global Cmd+K / Ctrl+K shortcut for Command Palette
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const activeRoleConfig = useMemo(
    () => getWorkspaceRoleConfig(workspaceRole),
    [workspaceRole]
  );

  const isTabAllowedForRole = useCallback(
    (tabId: NavTab) => {
      if (activeRoleConfig.allowedTabs === 'all') return true;
      return activeRoleConfig.allowedTabs.includes(tabId);
    },
    [activeRoleConfig]
  );

  const handleSelectWorkspaceRole = useCallback(
    (nextRole: WorkspaceRole) => {
      const cfg = getWorkspaceRoleConfig(nextRole);
      setWorkspaceRole(nextRole);
      handleLogAudit('Security', `Switched workspace RBAC role to ${cfg.label}`, cfg.shortLabel);
      if (cfg.allowedTabs !== 'all' && !cfg.allowedTabs.includes(activeTab)) {
        setActiveTab(cfg.allowedTabs[0] as NavTab);
      }
      enqueueToasts([
        {
          id: `toast-role-${Date.now()}`,
          title: `Workspace Role · ${cfg.label}`,
          body: cfg.description,
          severity: 'info',
        },
      ]);
    },
    [activeTab, enqueueToasts, handleLogAudit]
  );

  const handleToggleFavoriteTab = useCallback((tabId: NavTab) => {
    setFavoriteTabs((prev) =>
      prev.includes(tabId) ? prev.filter((id) => id !== tabId) : [...prev, tabId].slice(0, 6)
    );
  }, []);

  const handleTogglePinRack = useCallback((rackId: string) => {
    setPinnedRackIds((prev) => {
      if (prev.includes(rackId)) return prev.filter((id) => id !== rackId);
      return [...prev, rackId].slice(-4);
    });
  }, []);

  const handleSyncRackSelection = useCallback(
    (hallId: HallId, rackId: string, sensorHeatmap: boolean) => {
      setRackDeepLink((prev) =>
        prev.hallId === hallId &&
        prev.rackId === rackId &&
        prev.sensorHeatmap === sensorHeatmap
          ? prev
          : { hallId, rackId, sensorHeatmap }
      );
    },
    []
  );

  const handleFocusRackOnMap = useCallback(
    (hallId: HallId, rackId: string, enableSensorHeatmap?: boolean) => {
      setRackDeepLink((prev) => ({
        hallId,
        rackId,
        sensorHeatmap:
          typeof enableSensorHeatmap === 'boolean' ? enableSensorHeatmap : prev.sensorHeatmap,
      }));
      setActiveTab('racks');
      setMobileMenuOpen(false);
    },
    []
  );

  // Live BMS Rack Power Stats for RulesView threshold preview & rebalance workflows
  const activeSiteRackPowerStats = useMemo(
    () =>
      computeBmsRackPowerStats(INITIAL_RACKS, bms, servers, {
        rackPowerAdjustmentsKw: activeSite.rackPowerAdjustmentsKw,
        hallPowerPolicies: activeSite.hallPowerPolicies,
      }),
    [bms, servers, activeSite.rackPowerAdjustmentsKw, activeSite.hallPowerPolicies]
  );

  const activeSiteRackThermalStats = useMemo(
    () => computeRackThermalStats(INITIAL_RACKS, servers, bms),
    [servers, bms]
  );

  const persistAllSiteHallPolicies = useCallback((nextMap: Record<SiteId, SiteWorkspaceState>) => {
    writePersistedJson('hall_power_policies_by_site', {
      kl1: nextMap.kl1.hallPowerPolicies,
      kl2: nextMap.kl2.hallPowerPolicies,
      kl3: nextMap.kl3.hallPowerPolicies,
    });
  }, []);

  const persistAllSiteHallThermalPolicies = useCallback(
    (nextMap: Record<SiteId, SiteWorkspaceState>) => {
      writePersistedJson('hall_thermal_policies_by_site', {
        kl1: nextMap.kl1.hallThermalPolicies,
        kl2: nextMap.kl2.hallThermalPolicies,
        kl3: nextMap.kl3.hallThermalPolicies,
      });
    },
    []
  );

  const handleRebalanceRack = useCallback(
    (sourceRackId: string, targetRackId: string, shiftKw: number) => {
      const targetSiteId = activeSiteIdRef.current;
      const cur = sitesMapRef.current[targetSiteId];
      const siteCode = SITE_META_MAP[targetSiteId].code;
      const now = Date.now();
      const nextAdjustments = applyRackPowerRebalance(
        cur.rackPowerAdjustmentsKw,
        sourceRackId,
        targetRackId,
        shiftKw
      );
      const rackCapRes = evaluateRackPowerCapacityAlerts({
        racks: INITIAL_RACKS,
        bms: cur.bms,
        servers: cur.servers,
        existingAlerts: cur.alerts,
        channels: cur.channels,
        now,
        siteCode,
        rackPowerAdjustmentsKw: nextAdjustments,
        hallPowerPolicies: cur.hallPowerPolicies,
        hallThermalPolicies: cur.hallThermalPolicies,
      });
      updateActiveSite((site) => ({
        ...site,
        rackPowerAdjustmentsKw: nextAdjustments,
        alerts: rackCapRes.alerts,
        channels: rackCapRes.updatedChannels,
        dispatchLogs:
          rackCapRes.newDispatches.length > 0
            ? [...rackCapRes.newDispatches, ...site.dispatchLogs].slice(0, 120)
            : site.dispatchLogs,
      }));
      handleLogAudit(
        'Power / SLD',
        `Live load rebalance: shifted ${shiftKw.toFixed(2)} kW from ${sourceRackId} → ${targetRackId}`,
        sourceRackId
      );
      enqueueToasts([
        {
          id: `toast-rebal-${sourceRackId}-${now}`,
          title: `Load Rebalanced · ${sourceRackId} → ${targetRackId}`,
          body: `Shifted ${shiftKw.toFixed(2)} kW across hall PDU bus; Critical Power Capacity alerts re-evaluated.`,
          severity: 'info',
        },
      ]);
    },
    [enqueueToasts, handleLogAudit, updateActiveSite]
  );

  const handleUpdateHallPowerPolicy = useCallback(
    (hallId: HallId, patch: Partial<HallPowerCapacityPolicy>) => {
      const targetSiteId = activeSiteIdRef.current;
      const cur = sitesMapRef.current[targetSiteId];
      const siteCode = SITE_META_MAP[targetSiteId].code;
      const now = Date.now();
      const updatedPolicy = sanitizeHallPowerPolicy(hallId, {
        ...cur.hallPowerPolicies[hallId],
        ...patch,
      });
      const nextPolicies: HallPowerPolicyMap = {
        ...cur.hallPowerPolicies,
        [hallId]: updatedPolicy,
      };
      const rackCapRes = evaluateRackPowerCapacityAlerts({
        racks: INITIAL_RACKS,
        bms: cur.bms,
        servers: cur.servers,
        existingAlerts: cur.alerts,
        channels: cur.channels,
        now,
        siteCode,
        rackPowerAdjustmentsKw: cur.rackPowerAdjustmentsKw,
        hallPowerPolicies: nextPolicies,
        hallThermalPolicies: cur.hallThermalPolicies,
      });
      setSitesMap((prev) => {
        const nextMap: Record<SiteId, SiteWorkspaceState> = {
          ...prev,
          [targetSiteId]: {
            ...prev[targetSiteId],
            hallPowerPolicies: nextPolicies,
            alerts: rackCapRes.alerts,
            channels: rackCapRes.updatedChannels,
            dispatchLogs:
              rackCapRes.newDispatches.length > 0
                ? [...rackCapRes.newDispatches, ...prev[targetSiteId].dispatchLogs].slice(0, 120)
                : prev[targetSiteId].dispatchLogs,
          },
        };
        persistAllSiteHallPolicies(nextMap);
        return nextMap;
      });
      if (firebaseUser) {
        void saveHallPowerPolicyCloud(targetSiteId, updatedPolicy, activeProfileNameRef.current);
      }
      handleLogAudit(
        'Setpoint',
        `Updated ${hallId.toUpperCase()} power capacity policy (${updatedPolicy.thresholdPct}% limit, ${updatedPolicy.hysteresisKw.toFixed(2)} kW hysteresis, ${updatedPolicy.enabled ? 'Enabled' : 'Disabled'})`,
        `${siteCode} ${hallId.toUpperCase()}`
      );
      if (rackCapRes.newAlerts.length > 0) {
        pushToastsForNewAlerts(rackCapRes.newAlerts);
      }
    },
    [
      firebaseUser,
      handleLogAudit,
      persistAllSiteHallPolicies,
      pushToastsForNewAlerts,
      saveHallPowerPolicyCloud,
    ]
  );

  const handleResetHallPowerPolicies = useCallback(() => {
    const targetSiteId = activeSiteIdRef.current;
    const cur = sitesMapRef.current[targetSiteId];
    const siteCode = SITE_META_MAP[targetSiteId].code;
    const now = Date.now();
    const defaults = createDefaultHallPowerPolicies();
    const rackCapRes = evaluateRackPowerCapacityAlerts({
      racks: INITIAL_RACKS,
      bms: cur.bms,
      servers: cur.servers,
      existingAlerts: cur.alerts,
      channels: cur.channels,
      now,
      siteCode,
      rackPowerAdjustmentsKw: cur.rackPowerAdjustmentsKw,
      hallPowerPolicies: defaults,
      hallThermalPolicies: cur.hallThermalPolicies,
    });
    setSitesMap((prev) => {
      const nextMap: Record<SiteId, SiteWorkspaceState> = {
        ...prev,
        [targetSiteId]: {
          ...prev[targetSiteId],
          hallPowerPolicies: defaults,
          alerts: rackCapRes.alerts,
          channels: rackCapRes.updatedChannels,
        },
      };
      persistAllSiteHallPolicies(nextMap);
      return nextMap;
    });
    if (firebaseUser) {
      (['hall-a', 'hall-b', 'hall-c', 'hall-d'] as HallId[]).forEach((hid) => {
        void saveHallPowerPolicyCloud(targetSiteId, defaults[hid], activeProfileNameRef.current);
      });
    }
    handleLogAudit('Setpoint', 'Reset per-hall rack power capacity policies to 100% rated defaults', siteCode);
    enqueueToasts([
      {
        id: `toast-policy-reset-${now}`,
        title: `Hall Power Policies Reset · ${siteCode}`,
        body: 'All 4 data halls restored to 100% rated cabinet capacity with 0.20 kW hysteresis.',
        severity: 'info',
      },
    ]);
  }, [enqueueToasts, firebaseUser, handleLogAudit, persistAllSiteHallPolicies, saveHallPowerPolicyCloud]);

  const handleUpdateHallThermalPolicy = useCallback(
    (hallId: HallId, patch: Partial<HallThermalPolicy>) => {
      const targetSiteId = activeSiteIdRef.current;
      const cur = sitesMapRef.current[targetSiteId];
      const siteCode = SITE_META_MAP[targetSiteId].code;
      const now = Date.now();
      const updatedPolicy = sanitizeHallThermalPolicy(hallId, {
        ...cur.hallThermalPolicies[hallId],
        ...patch,
      });
      const nextPolicies: HallThermalPolicyMap = {
        ...cur.hallThermalPolicies,
        [hallId]: updatedPolicy,
      };
      const rackCapRes = evaluateRackPowerCapacityAlerts({
        racks: INITIAL_RACKS,
        bms: cur.bms,
        servers: cur.servers,
        existingAlerts: cur.alerts,
        channels: cur.channels,
        now,
        siteCode,
        rackPowerAdjustmentsKw: cur.rackPowerAdjustmentsKw,
        hallPowerPolicies: cur.hallPowerPolicies,
        hallThermalPolicies: nextPolicies,
      });
      setSitesMap((prev) => {
        const nextMap: Record<SiteId, SiteWorkspaceState> = {
          ...prev,
          [targetSiteId]: {
            ...prev[targetSiteId],
            hallThermalPolicies: nextPolicies,
            alerts: rackCapRes.alerts,
            channels: rackCapRes.updatedChannels,
            dispatchLogs:
              rackCapRes.newDispatches.length > 0
                ? [...rackCapRes.newDispatches, ...prev[targetSiteId].dispatchLogs].slice(0, 120)
                : prev[targetSiteId].dispatchLogs,
          },
        };
        persistAllSiteHallThermalPolicies(nextMap);
        return nextMap;
      });
      if (firebaseUser) {
        void saveHallThermalPolicyCloud(targetSiteId, updatedPolicy, activeProfileNameRef.current);
      }
      handleLogAudit(
        'Setpoint',
        `Updated ${hallId.toUpperCase()} thermal threshold policy (Warn ${updatedPolicy.warningTempC}°C / Crit ${updatedPolicy.criticalTempC}°C / Hyst ${updatedPolicy.hysteresisC.toFixed(1)}°C, ${updatedPolicy.enabled ? 'Enabled' : 'Disabled'})`,
        `${siteCode} ${hallId.toUpperCase()}`
      );
      if (rackCapRes.newAlerts.length > 0) {
        pushToastsForNewAlerts(rackCapRes.newAlerts);
      }
    },
    [
      firebaseUser,
      handleLogAudit,
      persistAllSiteHallThermalPolicies,
      pushToastsForNewAlerts,
      saveHallThermalPolicyCloud,
    ]
  );

  const handleResetHallThermalPolicies = useCallback(() => {
    const targetSiteId = activeSiteIdRef.current;
    const cur = sitesMapRef.current[targetSiteId];
    const siteCode = SITE_META_MAP[targetSiteId].code;
    const now = Date.now();
    const defaults = createDefaultHallThermalPolicies();
    const rackCapRes = evaluateRackPowerCapacityAlerts({
      racks: INITIAL_RACKS,
      bms: cur.bms,
      servers: cur.servers,
      existingAlerts: cur.alerts,
      channels: cur.channels,
      now,
      siteCode,
      rackPowerAdjustmentsKw: cur.rackPowerAdjustmentsKw,
      hallPowerPolicies: cur.hallPowerPolicies,
      hallThermalPolicies: defaults,
    });
    setSitesMap((prev) => {
      const nextMap: Record<SiteId, SiteWorkspaceState> = {
        ...prev,
        [targetSiteId]: {
          ...prev[targetSiteId],
          hallThermalPolicies: defaults,
          alerts: rackCapRes.alerts,
          channels: rackCapRes.updatedChannels,
        },
      };
      persistAllSiteHallThermalPolicies(nextMap);
      return nextMap;
    });
    if (firebaseUser) {
      (['hall-a', 'hall-b', 'hall-c', 'hall-d'] as HallId[]).forEach((hid) => {
        void saveHallThermalPolicyCloud(targetSiteId, defaults[hid], activeProfileNameRef.current);
      });
    }
    handleLogAudit(
      'Setpoint',
      'Reset per-hall rack thermal policies to default thresholds (65°C warn / 72°C crit)',
      siteCode
    );
    enqueueToasts([
      {
        id: `toast-thermal-policy-reset-${now}`,
        title: `Hall Thermal Policies Reset · ${siteCode}`,
        body: 'All 4 data halls restored to default rack thermal thresholds (65°C warn / 72°C crit; Hall C 62°C / 69°C).',
        severity: 'info',
      },
    ]);
  }, [
    enqueueToasts,
    firebaseUser,
    handleLogAudit,
    persistAllSiteHallThermalPolicies,
    saveHallThermalPolicyCloud,
  ]);

  const handleRemediateAlert = useCallback(
    (alert: ActiveAlert): { ok: boolean; summary: string } => {
      const targetSiteId = activeSiteIdRef.current;
      const cur = sitesMapRef.current[targetSiteId];
      const now = Date.now();

      // 1. Critical Power Capacity -> Auto-rebalance excess kW to best same-hall rack
      if (alert.ruleId === RACK_CRITICAL_POWER_RULE_ID) {
        const powerStats = computeBmsRackPowerStats(INITIAL_RACKS, cur.bms, cur.servers, {
          rackPowerAdjustmentsKw: cur.rackPowerAdjustmentsKw,
          hallPowerPolicies: cur.hallPowerPolicies,
        });
        const plan = computeRackRebalancePlan(alert.rackId, INITIAL_RACKS, powerStats, 1);
        const top = plan?.candidates[0];
        if (!plan || !top) {
          return {
            ok: false,
            summary: `No under-utilized target rack available in same hall for ${alert.rackId}.`,
          };
        }
        handleRebalanceRack(plan.sourceRackId, top.targetRackId, top.shiftKw);
        return {
          ok: true,
          summary: `Shifted ${top.shiftKw.toFixed(2)} kW from ${plan.sourceRackId} → ${top.targetRackId}; alert re-evaluated.`,
        };
      }

      // 2. Thermal / Cold Aisle SLA / CRAC alert -> Boost hall CRAC & lower setpoint if needed
      const ruleLower = `${alert.ruleName} ${alert.metric}`.toLowerCase();
      if (
        ruleLower.includes('thermal') ||
        ruleLower.includes('temp') ||
        ruleLower.includes('sla') ||
        ruleLower.includes('crac') ||
        ruleLower.includes('chiller')
      ) {
        const matchedRack = INITIAL_RACKS.find((r) => r.id === alert.rackId);
        const hallId: HallId = matchedRack?.hallId ?? 'hall-b';
        const hallCrac =
          cur.bms.cracUnits.find((c) => c.hallId === hallId && c.mode !== 'Fault') ??
          cur.bms.cracUnits[0];
        if (hallCrac) {
          let nextBms = setCracMode(
            cur.bms,
            hallCrac.id,
            'Boost',
            'Operator',
            now,
            `One-click remediation for ${alert.ruleName}`
          );
          if (hallCrac.setpointC > 18.5) {
            nextBms = setCracSetpoint(nextBms, hallCrac.id, 18.5, 'Operator', now);
          }
          commitBmsMutation(nextBms);
          // Clear thermal faults on targeted server or all hot servers inside an overheating rack
          if (alert.ruleId === RACK_THERMAL_VIOLATION_RULE_ID) {
            const nextServers = cur.servers.map((s) => {
              if (s.rackId !== alert.rackId) return s;
              const base = s.activeFault === 'thermal_spike' ? applyFaultToServer(s, null) : s;
              const cooledTemp = Number(Math.max(42, Math.min(base.tempC, 61.5)).toFixed(1));
              return { ...base, tempC: cooledTemp };
            });
            runImmediateEvaluation(nextServers, cur.rules, cur.channels);
          } else {
            const targetSrv = cur.servers.find((s) => s.id === alert.serverId);
            if (targetSrv?.activeFault) {
              const nextServers = cur.servers.map((s) =>
                s.id === targetSrv.id ? applyFaultToServer(s, null) : s
              );
              runImmediateEvaluation(nextServers, cur.rules, cur.channels);
            }
          }
          handleLogAudit(
            'Setpoint',
            `One-click cooling boost on ${hallCrac.name} (${hallCrac.hallId.toUpperCase()}) for ${alert.ruleName}`,
            alert.serverHostname
          );
          return {
            ok: true,
            summary: `Engaged ${hallCrac.name} Boost (18.5°C setpoint) for ${alert.serverHostname}.`,
          };
        }
      }

      // 3. Server telemetry fault -> Recover node & re-evaluate alerts
      const targetSrv = cur.servers.find((s) => s.id === alert.serverId);
      if (targetSrv) {
        const nextServers = cur.servers.map((s) =>
          s.id === targetSrv.id ? applyFaultToServer(s, null) : s
        );
        runImmediateEvaluation(nextServers, cur.rules, cur.channels);
        handleLogAudit(
          'Alert',
          `One-click node recovery cleared fault on ${targetSrv.hostname} (${alert.ruleName})`,
          targetSrv.hostname
        );
        return {
          ok: true,
          summary: `Recovered ${targetSrv.hostname} to nominal telemetry; alert re-evaluated.`,
        };
      }

      // Fallback: mark alert resolved
      updateActiveSite((site) => ({
        ...site,
        alerts: site.alerts.map((a) =>
          a.id === alert.id ? { ...a, state: 'resolved', resolvedAt: now } : a
        ),
      }));
      handleLogAudit('Alert', `One-click remediation resolved ${alert.ruleName}`, alert.serverHostname);
      return {
        ok: true,
        summary: `Remediation applied and ${alert.ruleName} marked resolved.`,
      };
    },
    [commitBmsMutation, handleLogAudit, handleRebalanceRack, runImmediateEvaluation, updateActiveSite]
  );

  const handleJumpToSiteRackMap = useCallback(
    (siteId: SiteId, rackId?: string) => {
      setActiveSiteId(siteId);
      setExpandedSites((prev) => ({ ...prev, [siteId]: true }));
      const matched = rackId ? INITIAL_RACKS.find((r) => r.id === rackId) : undefined;
      setRackDeepLink({
        hallId: matched?.hallId ?? 'hall-b',
        rackId: matched?.id ?? null,
        sensorHeatmap: false,
      });
      setActiveTab('racks');
      setSelectedServerId(null);
      setMobileMenuOpen(false);
    },
    []
  );

  const handleSyncExecutiveHandover = useCallback(
    (notes: string) => {
      handleExecuteHandover({
        notes,
        checklistVerified: true,
        switchToIncomingLead: false,
      });
    },
    [handleExecuteHandover]
  );

  // Live Physical Security <-> Thermal Correlations across active site
  const activeSiteSecurityCorrelations = useMemo(() => {
    const thermalStats = computeRackThermalStats(INITIAL_RACKS, servers, bms);
    const sensorStats = computeBmsSensorRackStats(INITIAL_RACKS, bms, servers);
    return computeSecurityThermalCorrelations(
      locksBySite[activeSiteId] ?? [],
      visitors,
      activeSiteId,
      thermalStats,
      sensorStats
    );
  }, [locksBySite, activeSiteId, visitors, servers, bms]);

  // Closed-Loop Cross-Module Handlers
  const handleLaunchMopFromAlert = useCallback(
    (alert: ActiveAlert) => {
      handleLogAudit(
        'CMMS',
        `Launched approved SOP/MOP playbook from alert ${alert.ruleName}`,
        alert.serverHostname
      );
      setActiveTab('cmms');
      enqueueToasts([
        {
          id: `toast-mop-${alert.id}-${Date.now()}`,
          title: 'MOP Playbook Launched',
          body: `Opened CMMS & MOPs for ${alert.serverHostname} (${alert.ruleName}) and logged audit entry.`,
          severity: 'info',
        },
      ]);
    },
    [enqueueToasts, handleLogAudit]
  );

  const handleLaunchMopForRack = useCallback(
    (rackId: string) => {
      handleLogAudit('CMMS', `Launched cabinet thermal MOP from Rack Map`, rackId);
      setActiveTab('cmms');
      enqueueToasts([
        {
          id: `toast-rack-mop-${rackId}-${Date.now()}`,
          title: `MOP Launched · ${rackId}`,
          body: `Opened approved maintenance procedures for ${rackId} and recorded immutable audit log.`,
          severity: 'info',
        },
      ]);
    },
    [enqueueToasts, handleLogAudit]
  );

  const handleCreateTicketForRack = useCallback(
    (rackId: string, summaryText: string, severity: 'critical' | 'warning') => {
      const now = Date.now();
      const hallChar = rackId.charAt(0).toLowerCase();
      const hallId: HallId =
        hallChar === 'a'
          ? 'hall-a'
          : hallChar === 'b'
          ? 'hall-b'
          : hallChar === 'c'
          ? 'hall-c'
          : 'hall-d';
      const draft: NewTicketDraft = {
        siteId: activeSiteId,
        title: summaryText,
        description: `Escalated directly from Rack Topology & Thermal Matrix for cabinet ${rackId}.`,
        category: 'Cooling & Power',
        priority: severity === 'critical' ? 'P1 - Critical' : 'P2 - High',
        affectedAssetId: rackId,
        affectedAssetLabel: `${activeSiteMeta.code} · ${rackId}`,
        hallId,
        requesterName: activeProfile.name,
        assigneeProfileId: activeProfile.id,
        assigneeName: activeProfile.name,
      };
      const created = createOpsTicket(tickets, draft, now);
      setTickets((prev) => [created, ...prev]);
      handleLogAudit('Alert', `Created ${created.id} directly from Rack Map`, rackId);
      enqueueToasts([
        {
          id: `toast-rack-tck-${created.id}`,
          title: `Ticket Created · ${created.id}`,
          body: `${rackId}: ${summaryText}`,
          severity: severity === 'critical' ? 'critical' : 'warning',
        },
      ]);
    },
    [activeSiteId, activeSiteMeta.code, activeProfile, tickets, enqueueToasts, handleLogAudit]
  );

  const handleHighlightBlastOnRackMap = useCallback(
    (highlight: SldBlastHighlight) => {
      setSldBlastHighlight(highlight);
      setRackDeepLink((prev) => ({
        hallId: highlight.hallIds[0] ?? 'hall-b',
        rackId: prev.rackId,
        sensorHeatmap: prev.sensorHeatmap,
      }));
      setActiveTab('racks');
      handleLogAudit(
        'Power / SLD',
        `Highlighted SLD blast radius (${highlight.busLabel}) on Rack Map`,
        highlight.sourceLabel
      );
    },
    [handleLogAudit]
  );

  const handleBoostHallCrac = useCallback(
    (hallId: HallId) => {
      const targetCrac = bms.cracUnits.find((c) => c.hallId === hallId);
      if (!targetCrac) return;
      const nextMode: CracMode = targetCrac.mode === 'Boost' ? 'Auto' : 'Boost';
      handleSetCracMode(targetCrac.id, nextMode);
      handleLogAudit(
        'Setpoint',
        `Toggled ${targetCrac.name} to ${nextMode} mode from Rack Map Sensor Heatmap`,
        targetCrac.name
      );
    },
    [bms.cracUnits, handleSetCracMode, handleLogAudit]
  );

  const handleToggleHallExcursion = useCallback(
    (hallId: HallId) => {
      handleToggleColdAisleSla(hallId);
      handleLogAudit(
        'Setpoint',
        `Toggled cold-aisle SLA thermal excursion test from Rack Map`,
        hallId.toUpperCase()
      );
    },
    [handleToggleColdAisleSla, handleLogAudit]
  );

  const handleResetSavedWorkspace = useCallback(() => {
    clearAllPersistedWorkspaceState();
    const now = Date.now();
    const defaultProfiles = createInitialProfiles();
    setTickets(createInitialTickets(defaultProfiles, now));
    setVisitors(createInitialVisitors(defaultProfiles, now));
    setAuditTrail(createInitialAuditTrail(now));
    setPinnedRackIds([]);
    setFavoriteTabs(['overview', 'racks', 'alerts', 'bms']);
    setWorkspaceRole('noc_operator');
    setProfileMenuOpen(false);
    enqueueToasts([
      {
        id: `toast-reset-${now}`,
        title: 'Workspace State Reset',
        body: 'Restored default tickets, visitors, audit log, favorites, and NOC role.',
        severity: 'info',
      },
    ]);
  }, [enqueueToasts]);

  // Unified Cmd+K Command Palette Index
  const commandPaletteItems = useMemo<CommandPaletteItem[]>(() => {
    const items: CommandPaletteItem[] = [
      {
        id: 'act-scan-asset-qr',
        group: 'Quick Actions',
        title: 'Scan Server Asset QR Code',
        subtitle: 'Resolve a server asset QR sticker across KL1, KL2, or KL3 via camera or tag paste',
        keywords: 'qr code scan asset tag barcode camera sticker',
        onSelect: () => setQrScannerOpen(true),
      },
      {
        id: 'act-sensor-heatmap',
        group: 'Quick Actions',
        title: 'Open BMS Environment Sensor Heatmap',
        subtitle: `Jump to ${activeSiteMeta.code} Rack Map with live BMS probe telemetry enabled`,
        keywords: 'bms sensor heatmap rack temperature ashrae',
        onSelect: () => handleFocusRackOnMap('hall-b', 'B-R04-05', true),
      },
      {
        id: 'act-toggle-theme',
        group: 'Quick Actions',
        title: darkMode ? 'Switch to Light Operations Theme' : 'Switch to Dark Operations Theme',
        subtitle: 'Toggle light / dark color mode across all DCIM views',
        keywords: 'dark light theme mode',
        onSelect: () => setDarkMode((prev) => !prev),
      },
      {
        id: 'act-role-tenant',
        group: 'Quick Actions',
        title:
          workspaceRole === 'colocation_tenant'
            ? 'Return to Full NOC Shift Operator Role'
            : 'Switch to Colocation Tenant Portal (Read-Only)',
        subtitle: 'Toggle multi-tenant RBAC isolation scope',
        keywords: 'rbac role tenant portal colocation permissions',
        onSelect: () =>
          handleSelectWorkspaceRole(
            workspaceRole === 'colocation_tenant' ? 'noc_operator' : 'colocation_tenant'
          ),
      },
      ...SITES.map((s) => ({
        id: `act-site-${s.id}`,
        group: 'Quick Actions' as const,
        title: `Switch Active Site to ${s.code} · ${s.label}`,
        subtitle: `${s.location} · Switch live telemetry & BMS context`,
        keywords: `site switch ${s.code} ${s.location}`,
        onSelect: () => handleSelectSite(s.id),
      })),
    ];

    for (const nav of NAV_ITEMS) {
      if (!isTabAllowedForRole(nav.id)) continue;
      items.push({
        id: `nav-${nav.id}`,
        group: 'Modules',
        title: nav.label,
        subtitle: nav.breadcrumb,
        keywords: `${nav.id} ${nav.label} ${nav.breadcrumb}`,
        onSelect: () => handleSelectNav(nav.id),
      });
    }

    for (const srv of servers.slice(0, 24)) {
      items.push({
        id: `srv-${srv.id}`,
        group: 'Servers',
        title: srv.hostname,
        subtitle: `${srv.rackId} · ${srv.role} · ${srv.tempC.toFixed(1)}°C · ${srv.status}`,
        keywords: `${srv.id} ${srv.rackId} ${srv.hallId}`,
        onSelect: () => {
          setSelectedServerId(srv.id);
        },
      });
    }

    // Index featured racks & BMS cold-aisle probe mounts across all 4 halls
    for (const hall of SITE_HALLS) {
      const prefix = hall.id.slice(-1).toUpperCase();
      items.push(
        {
          id: `rack-${prefix}-R01-01`,
          group: 'Racks & BMS Probes',
          title: `Rack ${prefix}-R01-01 (${hall.short})`,
          subtitle: 'Inspect 42U elevation & average server thermal heatmap',
          keywords: `${prefix}-R01-01 rack map ${hall.label}`,
          onSelect: () => handleFocusRackOnMap(hall.id, `${prefix}-R01-01`, false),
        },
        {
          id: `probe-${prefix}-R04-05`,
          group: 'Racks & BMS Probes',
          title: `BMS Probe SLA-${prefix}-R04-A · Rack ${prefix}-R04-05`,
          subtitle: `${hall.short} West Cold-Aisle Sensor (Path A · ASHRAE Class A1)`,
          keywords: `probe bms sensor ${prefix}-R04-05 SLA-${prefix}-R04-A`,
          onSelect: () => handleFocusRackOnMap(hall.id, `${prefix}-R04-05`, true),
        }
      );
    }

    for (const t of tickets.filter((tk) => tk.siteId === activeSiteId).slice(0, 6)) {
      items.push({
        id: `tck-${t.id}`,
        group: 'Tickets & Visitors',
        title: `${t.id} · ${t.title}`,
        subtitle: `${t.priority} · ${t.status} · ${t.affectedAssetLabel}`,
        keywords: `ticket ${t.id} ${t.affectedAssetLabel}`,
        onSelect: () => handleSelectNav('tickets'),
      });
    }

    for (const v of visitors.filter((vis) => vis.siteId === activeSiteId).slice(0, 4)) {
      items.push({
        id: `vis-${v.id}`,
        group: 'Tickets & Visitors',
        title: `${v.fullName} (${v.company})`,
        subtitle: `Visitor ${v.status} · Badge ${v.badgeNumber ?? 'Pending'}`,
        keywords: `visitor badge ${v.fullName} ${v.company}`,
        onSelect: () => handleSelectNav('visitors'),
      });
    }

    return items;
  }, [
    activeSiteId,
    activeSiteMeta.code,
    darkMode,
    workspaceRole,
    servers,
    tickets,
    visitors,
    isTabAllowedForRole,
    handleFocusRackOnMap,
    handleSelectWorkspaceRole,
    handleSelectSite,
    handleSelectNav,
  ]);

  const puteriRanniaContext = useMemo<PuteriRanniaSiteContext>(() => {
    const layout = getSiteBuildingLayout(activeSiteId);
    const airChillers = bms.chillers.filter((c) => c.chillerType === 'Air-Cooled');
    const waterChillers = bms.chillers.filter((c) => c.chillerType === 'Water-Cooled');
    const activeAlerts = alerts.filter((a) => isAlertOpen(a));
    const siteOpenTickets = tickets.filter(
      (t) => t.siteId === activeSiteId && t.status !== 'Resolved' && t.status !== 'Closed'
    );
    const surgeRules = rules.filter(
      (r) => r.ruleType === 'facility_power_surge' || r.metric === 'facilityPowerMw'
    );
    return {
      siteId: activeSiteId,
      siteCode: activeSiteMeta.code,
      siteName: activeSiteMeta.label,
      architectureName: layout.architectureName,
      adminWingSide: layout.adminWingSide,
      totalFacilityPowerMw: Number(((summary.totalItLoadKw * summary.pue) / 1000).toFixed(2)),
      totalItLoadMw: Number((summary.totalItLoadKw / 1000).toFixed(2)),
      pue: Number(summary.pue.toFixed(2)),
      serverSummary: {
        total: summary.totalServers,
        nominal: summary.nominalCount,
        warning: summary.warningCount,
        critical: summary.criticalCount,
        maintenance: summary.maintenanceCount,
      },
      plantSummary: {
        waterChillersOnline: waterChillers.filter((c) => c.mode === 'Running' || c.mode === 'Boost').length,
        waterChillersTotal: waterChillers.length,
        airChillersRunning: airChillers.filter((c) => c.mode === 'Running' || c.mode === 'Boost').length,
        airChillersStandby: airChillers.filter((c) => c.mode === 'Standby').length,
        airChillersTotal: airChillers.length,
        squareBufferTanksCount: bms.chwTankPumpSets.length,
        generatorsTotal: bms.generators.length,
        generatorsRunning: bms.generators.filter((g) => g.state === 'Running · On Load').length,
        dieselTanksCount: bms.dieselTanks.length,
        upsTotal: bms.upsSystems.length,
        utilityFeed: bms.utilityFeed,
      },
      openAlertsCount: activeAlerts.length,
      criticalAlertsCount: summary.activeCriticalCount,
      topOpenAlerts: activeAlerts.slice(0, 5).map((a) => ({
        ruleName: a.ruleName,
        severity: a.severity,
        target: a.serverHostname,
        message: a.message,
      })),
      powerSurgeRules: surgeRules.map((r) => ({
        name: r.name,
        thresholdMw: r.threshold,
        durationSec: r.sustainedDurationSec ?? 30,
        enabled: r.enabled,
      })),
      openTicketsCount: siteOpenTickets.length,
      p1TicketsCount: siteOpenTickets.filter((t) => t.priority === 'P1 - Critical').length,
    };
  }, [activeSiteId, activeSiteMeta, alerts, bms, rules, summary, tickets]);

  const openWarningCount = Math.max(0, summary.activeAlertCount - summary.activeCriticalCount);

  return (
    <div className="min-h-screen bg-[#F2F4F7] dark:bg-[#111418] text-slate-900 dark:text-slate-100 flex">
      {/* Desktop EcoStruxure Dark Graphite Sidebar */}
      <aside
        aria-label="Primary navigation"
        className={`hidden lg:flex lg:flex-col lg:shrink-0 bg-[#252A30] text-slate-200 border-r border-[#1A1E23] sticky top-0 h-screen transition-[width] duration-200 ${
          sidebarCollapsed ? 'lg:w-[68px]' : 'lg:w-[252px]'
        }`}
      >
        {/* Top 3px EcoStruxure Green Brand Stripe */}
        <div className="h-[3px] w-full bg-[#3DCD58] shrink-0" aria-hidden="true" />

        {/* Sidebar Brand Header */}
        <div className="h-14 px-3.5 flex items-center justify-between bg-[#1D2126] border-b border-white/10">
          <div className="flex items-center gap-2.5 min-w-0">
            <svg
              viewBox="0 0 24 24"
              className="w-6 h-6 shrink-0"
              aria-hidden="true"
            >
              <rect x="2" y="2" width="20" height="20" rx="3" fill="#3DCD58" />
              <path
                d="M6 12h3l2-4.5 2.5 9 2-4.5H18"
                fill="none"
                stroke="#1D2126"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {!sidebarCollapsed && (
              <span className="font-display text-[15px] font-bold tracking-tight text-white whitespace-nowrap truncate">
                Orise DCIM
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            aria-label={sidebarCollapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
            className="p-1.5 text-slate-400 hover:text-white rounded-sm hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Main Module Navigation (Favorites + Primary + Collapsible Infra & Operations) */}
        <div className="flex-1 overflow-y-auto py-3 px-2.5 flex flex-col gap-4">
          {!sidebarCollapsed && favoriteTabs.length > 0 && (
            <div data-testid="sidebar-favorites-section" className="space-y-0.5">
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Favorites
              </div>
              <nav aria-label="Favorite modules" className="space-y-0.5">
                {favoriteTabs
                  .map((fid) => NAV_ITEMS.find((n) => n.id === fid))
                  .filter((item): item is (typeof NAV_ITEMS)[number] =>
                    Boolean(item && isTabAllowedForRole(item.id))
                  )
                  .map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={`fav-${item.id}`}
                        type="button"
                        onClick={() => handleSelectNav(item.id)}
                        className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs font-medium rounded-sm transition-colors whitespace-nowrap cursor-pointer ${
                          active
                            ? 'bg-[#323840] text-white'
                            : 'text-slate-300 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2 min-w-0">
                          <Icon
                            className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-[#3DCD58]' : 'text-slate-400'}`}
                            aria-hidden="true"
                          />
                          <span className="truncate">{item.label}</span>
                        </span>
                        <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" aria-hidden="true" />
                      </button>
                    );
                  })}
              </nav>
            </div>
          )}

          <nav className="space-y-0.5">
            {PRIMARY_NAV_ITEMS.filter((item) => isTabAllowedForRole(item.id)).map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              const isFav = favoriteTabs.includes(item.id);
              return (
                <div key={item.id} className="group relative flex items-center">
                  <button
                    type="button"
                    data-testid={`nav-tab-${item.id}`}
                    title={sidebarCollapsed ? item.label : undefined}
                    onClick={() => handleSelectNav(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 text-sm font-medium rounded-sm transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-[#323840] text-white'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${active ? 'text-[#3DCD58]' : 'text-slate-400'}`}
                        aria-hidden="true"
                      />
                      {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                    </span>
                    {!sidebarCollapsed && item.id === 'alerts' && summary.unacknowledgedCount > 0 && (
                      <span className="font-mono text-xs font-semibold text-red-400 tabular-nums mr-4">
                        {summary.unacknowledgedCount}
                      </span>
                    )}
                  </button>
                  {!sidebarCollapsed && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFavoriteTab(item.id);
                      }}
                      aria-label={isFav ? `Unpin ${item.label} from favorites` : `Pin ${item.label} to favorites`}
                      className={`absolute right-1.5 p-1 rounded transition-opacity cursor-pointer ${
                        isFav
                          ? 'opacity-80 text-amber-400 hover:opacity-100'
                          : 'opacity-0 group-hover:opacity-70 text-slate-400 hover:text-white'
                      }`}
                    >
                      <Star className={`w-3 h-3 ${isFav ? 'fill-amber-400' : ''}`} aria-hidden="true" />
                    </button>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Collapsible Infrastructure Engineering & ESG Modules */}
          {INFRA_NAV_ITEMS.some((item) => isTabAllowedForRole(item.id)) && (
            <div className="pt-3 border-t border-white/10 space-y-1">
              {!sidebarCollapsed && (
                <button
                  type="button"
                  onClick={() => setInfraSectionOpen((prev) => !prev)}
                  aria-expanded={infraSectionOpen}
                  className="w-full px-2 pb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  <span>Infrastructure &amp; ESG</span>
                  {infraSectionOpen ? (
                    <ChevronDown className="w-3 h-3" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="w-3 h-3" aria-hidden="true" />
                  )}
                </button>
              )}
              {(sidebarCollapsed || infraSectionOpen) && (
                <nav aria-label="Infrastructure and ESG" className="space-y-0.5">
                  {INFRA_NAV_ITEMS.filter((item) => isTabAllowedForRole(item.id)).map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-testid={`nav-tab-${item.id}`}
                        title={sidebarCollapsed ? item.label : undefined}
                        onClick={() => handleSelectNav(item.id)}
                        aria-current={active ? 'page' : undefined}
                        className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 text-sm font-medium rounded-sm transition-colors whitespace-nowrap cursor-pointer ${
                          active
                            ? 'bg-[#323840] text-white'
                            : 'text-slate-300 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2.5 min-w-0">
                          <Icon
                            className={`w-4 h-4 shrink-0 ${active ? 'text-[#3DCD58]' : 'text-slate-400'}`}
                            aria-hidden="true"
                          />
                          {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                        </span>
                      </button>
                    );
                  })}
                </nav>
              )}
            </div>
          )}

          {/* EcoStruxure Multi-Site & Data Hall Location Tree (KL1, KL2, KL3) */}
          {!sidebarCollapsed && (
            <div className="pt-3 border-t border-white/10 space-y-1">
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Data Center Sites
              </div>
              {SITES.map((site) => {
                const siteData = sitesMap[site.id];
                const isSelectedSite = activeSiteId === site.id;
                const isExpanded = expandedSites[site.id];
                const siteHasCrit = siteData.servers.some((s) => s.status === 'critical');
                const siteHasWarn = siteData.servers.some((s) => s.status === 'warning');
                return (
                  <div key={site.id}>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedSites((prev) => ({ ...prev, [site.id]: !prev[site.id] }))
                        }
                        aria-label={`Toggle ${site.code} halls`}
                        aria-expanded={isExpanded}
                        className="p-1 text-slate-400 hover:text-white rounded-sm cursor-pointer shrink-0"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectSite(site.id)}
                        className={`flex-1 min-w-0 px-2 py-1.5 flex items-center justify-between gap-2 text-xs rounded-sm transition-colors cursor-pointer ${
                          isSelectedSite
                            ? 'bg-[#323840] text-white font-semibold'
                            : 'text-slate-300 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
                          <MapPin
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isSelectedSite ? 'text-[#3DCD58]' : 'text-slate-400'
                            }`}
                            aria-hidden="true"
                          />
                          <span className="truncate">{site.label}</span>
                        </span>
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            siteHasCrit
                              ? 'bg-red-400'
                              : siteHasWarn
                              ? 'bg-amber-400'
                              : 'bg-[#3DCD58]'
                          }`}
                          aria-hidden="true"
                        />
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="mt-0.5 space-y-0.5 pl-6">
                        {SITE_HALLS.map((hall) => {
                          const hallNodes = siteData.servers.filter((s) => s.hallId === hall.id);
                          const hasCrit = hallNodes.some((s) => s.status === 'critical');
                          const hasWarn = hallNodes.some((s) => s.status === 'warning');
                          const isFocusedHall =
                            isSelectedSite &&
                            activeTab === 'servers' &&
                            serverHallFilter === hall.id;
                          return (
                            <button
                              key={`${site.id}-${hall.id}`}
                              type="button"
                              onClick={() => handleSelectHallFromTree(site.id, hall.id)}
                              className={`w-full flex items-center justify-between gap-2 px-2 py-1 text-[11px] rounded-sm transition-colors cursor-pointer ${
                                isFocusedHall
                                  ? 'bg-[#323840] text-[#3DCD58] font-medium'
                                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
                              }`}
                            >
                              <span className="truncate">{hall.label}</span>
                              <span
                                className={`font-mono text-[11px] tabular-nums shrink-0 ${
                                  hasCrit
                                    ? 'text-red-400 font-semibold'
                                    : hasWarn
                                    ? 'text-amber-400'
                                    : 'text-[#3DCD58]'
                                }`}
                              >
                                {hallNodes.length}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Collapsible Data Center Operation Category */}
          <div
            data-testid="sidebar-category-dc-operation"
            className="mt-auto pt-3 border-t border-white/10 space-y-1"
          >
            {!sidebarCollapsed && (
              <button
                type="button"
                onClick={() => setOpsSectionOpen((prev) => !prev)}
                aria-expanded={opsSectionOpen}
                className="w-full px-2 pb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <span>Data Center Operation</span>
                {opsSectionOpen ? (
                  <ChevronDown className="w-3 h-3" aria-hidden="true" />
                ) : (
                  <ChevronRight className="w-3 h-3" aria-hidden="true" />
                )}
              </button>
            )}
            {(sidebarCollapsed || opsSectionOpen) && (
              <nav aria-label="Data Center Operation" className="space-y-0.5">
                {OPERATION_NAV_ITEMS.filter((item) => isTabAllowedForRole(item.id)).map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`nav-tab-${item.id}`}
                      title={sidebarCollapsed ? `${item.label} · Data Center Operation` : undefined}
                      onClick={() => handleSelectNav(item.id)}
                      aria-current={active ? 'page' : undefined}
                      className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 text-sm font-medium rounded-sm transition-colors whitespace-nowrap cursor-pointer ${
                        active
                          ? 'bg-[#323840] text-white'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={`w-4 h-4 shrink-0 ${active ? 'text-[#3DCD58]' : 'text-slate-400'}`}
                          aria-hidden="true"
                        />
                        {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                      </span>
                      {!sidebarCollapsed && item.id === 'tickets' && activeSiteOpenTicketCount > 0 && (
                        <span className="font-mono text-xs font-semibold text-[#3DCD58] tabular-nums">
                          {activeSiteOpenTicketCount}
                        </span>
                      )}
                      {!sidebarCollapsed && item.id === 'visitors' && activeSiteOnSiteVisitorCount > 0 && (
                        <span
                          data-testid="nav-visitors-onsite-badge"
                          className="font-mono text-xs font-semibold text-[#3DCD58] tabular-nums"
                        >
                          {activeSiteOnSiteVisitorCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            )}
          </div>
        </div>

        {/* Interactive Operator Profile & Shift Switcher Footer */}
        <div className="relative border-t border-white/10 bg-[#1D2126]">
          {profileMenuOpen && (
            <div
              role="dialog"
              aria-label="Switch active operator profile"
              className={`absolute bottom-full mb-2 z-50 bg-[#1B2026] border border-white/15 rounded-md shadow-xl overflow-hidden ${
                sidebarCollapsed ? 'left-2 w-72' : 'left-2 right-2'
              }`}
            >
              <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold text-white">
                    Switch Operator Profile
                  </div>
                  <div className="text-[10px] font-mono text-[#3DCD58]">
                    Live: {activeShiftSnapshot.onDutyTeam} · {activeShiftSnapshot.activeSlot.slot}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen(false)}
                  aria-label="Close profile switcher"
                  className="p-1 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto divide-y divide-white/5">
                {profiles.map((op) => {
                  const selected = op.id === activeProfile.id;
                  const duty = computeEffectiveDutyStatus(op, shiftState);
                  return (
                    <button
                      key={op.id}
                      type="button"
                      onClick={() => {
                        setActiveProfileId(op.id);
                        setProfileMenuOpen(false);
                      }}
                      className={`w-full px-3 py-2 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
                        selected ? 'bg-[#323840]' : 'hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <OperatorAvatar profile={op} size="sm" />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-white truncate">{op.name}</div>
                          <div className="text-[10px] text-slate-400 truncate font-mono">
                            {op.shiftTeam} · {op.primarySite.toUpperCase()} ·{' '}
                            <span
                              className={
                                duty === 'On Duty'
                                  ? 'text-[#3DCD58]'
                                  : duty === 'Standby'
                                  ? 'text-amber-400'
                                  : 'text-slate-400'
                              }
                            >
                              {duty}
                            </span>
                          </div>
                        </div>
                      </div>
                      {selected && (
                        <Check className="w-3.5 h-3.5 text-[#3DCD58] shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Workspace Role & Tenant Isolation Selector */}
              <div className="px-3 py-2 border-t border-white/10 bg-[#181C21] space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Workspace RBAC Scope
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {WORKSPACE_ROLES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      data-testid={`role-switch-${r.id}`}
                      onClick={() => {
                        handleSelectWorkspaceRole(r.id);
                        setProfileMenuOpen(false);
                      }}
                      className={`px-2 py-1 text-[10px] font-medium rounded-xs text-left truncate cursor-pointer transition-colors ${
                        workspaceRole === r.id
                          ? 'bg-[#009530] text-white'
                          : 'bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {r.shortLabel}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cloud Sync Account Status */}
              <div className="px-3 py-2 border-t border-white/10 bg-[#161A1F] flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Cloud Sync Workspace
                  </div>
                  <div className="text-[11px] font-mono text-slate-200 truncate">
                    {firebaseUser
                      ? `${firebaseUser.displayName || firebaseUser.email} (${cloudSyncedCount} synced)`
                      : 'Local session only'}
                  </div>
                </div>
                {firebaseUser ? (
                  <button
                    type="button"
                    data-testid="profile-signout-btn"
                    onClick={() => {
                      void signOutUser();
                      setProfileMenuOpen(false);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-xs bg-white/10 text-slate-200 hover:bg-red-600/80 hover:text-white cursor-pointer shrink-0"
                  >
                    <LogOut className="w-3 h-3" aria-hidden="true" />
                    Sign Out
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid="profile-signin-btn"
                    disabled={firebaseSigningIn}
                    onClick={() => {
                      void signInWithGoogle();
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-xs bg-[#009530] text-white hover:bg-[#007a27] disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    <Cloud className="w-3 h-3" aria-hidden="true" />
                    {firebaseSigningIn ? 'Signing in...' : 'Sign In'}
                  </button>
                )}
              </div>

              <div className="p-2 border-t border-white/10 bg-[#14181D] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    handleSelectNav('shifts');
                  }}
                  className="flex-1 py-1.5 px-2 text-[11px] font-semibold text-[#3DCD58] hover:bg-white/5 rounded-sm text-left cursor-pointer"
                >
                  Profiles &amp; Shifts
                </button>
                <button
                  type="button"
                  data-testid="reset-saved-workspace-btn"
                  onClick={handleResetSavedWorkspace}
                  title="Clear locally persisted tickets, visitors, and preferences"
                  className="inline-flex items-center gap-1 py-1.5 px-2 text-[11px] text-slate-400 hover:text-white hover:bg-white/5 rounded-sm cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  Reset
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setProfileMenuOpen((prev) => !prev)}
            aria-expanded={profileMenuOpen}
            aria-label={`Active operator ${activeProfile.name}, ${activeProfile.shiftTeam}. Click to switch profile.`}
            className="w-full p-3 flex items-center justify-between gap-2 hover:bg-white/5 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <OperatorAvatar profile={activeProfile} size="md" />
              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">
                    {activeProfile.name}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate font-mono">
                    {activeProfile.shiftTeam} · {activeShiftSnapshot.activeSlot.slot} ·{' '}
                    {activeProfile.primarySite.toUpperCase()}
                  </div>
                </div>
              )}
            </div>
            {!sidebarCollapsed && (
              <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
            )}
          </button>
        </div>
      </aside>

      {/* Mobile Navigation Drawer (Dark Graphite) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-64 max-w-[82vw] bg-[#252A30] text-slate-200 border-r border-[#1A1E23] h-full flex flex-col z-10">
            <div className="h-[3px] w-full bg-[#3DCD58] shrink-0" aria-hidden="true" />
            <div className="h-14 px-4 flex items-center justify-between bg-[#1D2126] border-b border-white/10">
              <span className="font-display text-base font-bold tracking-tight text-white">
                Orise DCIM
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-5">
              <nav className="space-y-1">
                {PRIMARY_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectNav(item.id)}
                      aria-current={active ? 'page' : undefined}
                      className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 text-sm font-medium rounded-sm transition-colors cursor-pointer ${
                        active ? 'bg-[#323840] text-white' : 'text-slate-300'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2.5">
                        <Icon
                          className={`w-4 h-4 shrink-0 ${active ? 'text-[#3DCD58]' : 'text-slate-400'}`}
                          aria-hidden="true"
                        />
                        {item.label}
                      </span>
                      {item.id === 'alerts' && summary.unacknowledgedCount > 0 && (
                        <span className="font-mono text-xs font-semibold text-red-400 tabular-nums">
                          {summary.unacknowledgedCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>

              <div className="pt-3 border-t border-white/10 space-y-1.5">
                <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Infrastructure &amp; ESG
                </div>
                <nav aria-label="Infrastructure and ESG" className="space-y-1">
                  {INFRA_NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={`mobile-${item.id}`}
                        type="button"
                        onClick={() => handleSelectNav(item.id)}
                        aria-current={active ? 'page' : undefined}
                        className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 text-sm font-medium rounded-sm transition-colors cursor-pointer ${
                          active ? 'bg-[#323840] text-white' : 'text-slate-300'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2.5">
                          <Icon
                            className={`w-4 h-4 shrink-0 ${active ? 'text-[#3DCD58]' : 'text-slate-400'}`}
                            aria-hidden="true"
                          />
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </nav>
              </div>

              <div className="pt-3 border-t border-white/10 space-y-2">
                <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Data Center Sites
                </div>
                {SITES.map((site) => {
                  const isSelectedSite = activeSiteId === site.id;
                  return (
                    <div key={`mobile-${site.id}`} className="space-y-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          handleSelectSite(site.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full px-2.5 py-1.5 flex items-center justify-between text-xs rounded-sm cursor-pointer ${
                          isSelectedSite
                            ? 'bg-[#323840] text-[#3DCD58] font-semibold'
                            : 'text-slate-300 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5 truncate">
                          <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          {site.label}
                        </span>
                      </button>
                      {isSelectedSite && (
                        <div className="pl-5 space-y-0.5">
                          {SITE_HALLS.map((hall) => (
                            <button
                              key={`mobile-${site.id}-${hall.id}`}
                              type="button"
                              onClick={() => handleSelectHallFromTree(site.id, hall.id)}
                              className="w-full flex items-center justify-between gap-2 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/5 hover:text-white rounded-sm cursor-pointer"
                            >
                              <span className="truncate">{hall.label}</span>
                              <span className="font-mono text-[11px] tabular-nums text-[#3DCD58]">
                                {sitesMap[site.id].servers.filter((s) => s.hallId === hall.id).length}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Lowest Mobile Drawer Category: Data Center Operation */}
              <div className="mt-auto pt-3 border-t border-white/10 space-y-1.5">
                <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Data Center Operation
                </div>
                <nav aria-label="Data Center Operation" className="space-y-1">
                  {OPERATION_NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={`mobile-${item.id}`}
                        type="button"
                        onClick={() => handleSelectNav(item.id)}
                        aria-current={active ? 'page' : undefined}
                        className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 text-sm font-medium rounded-sm transition-colors cursor-pointer ${
                          active ? 'bg-[#323840] text-white' : 'text-slate-300'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2.5">
                          <Icon
                            className={`w-4 h-4 shrink-0 ${active ? 'text-[#3DCD58]' : 'text-slate-400'}`}
                            aria-hidden="true"
                          />
                          {item.label}
                        </span>
                        {item.id === 'tickets' && activeSiteOpenTicketCount > 0 && (
                          <span className="font-mono text-xs font-semibold text-[#3DCD58] tabular-nums">
                            {activeSiteOpenTicketCount}
                          </span>
                        )}
                        {item.id === 'visitors' && activeSiteOnSiteVisitorCount > 0 && (
                          <span className="font-mono text-xs font-semibold text-[#3DCD58] tabular-nums">
                            {activeSiteOnSiteVisitorCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleSelectNav('shifts')}
              className="p-3 border-t border-white/10 bg-[#1D2126] flex items-center justify-between gap-2 text-left hover:bg-white/5 cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <OperatorAvatar profile={activeProfile} size="md" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">
                    {activeProfile.name}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate font-mono">
                    {activeProfile.shiftTeam} · {activeShiftSnapshot.activeSlot.slot}
                  </div>
                </div>
              </div>
              <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
            </button>
          </aside>
        </div>
      )}

      {/* Main Viewport Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top 3px EcoStruxure Green Bar on Main Viewport */}
        <div className="h-[3px] w-full bg-[#3DCD58] sticky top-0 z-40 shrink-0" aria-hidden="true" />

        {/* EcoStruxure Global Top Header */}
        <header className="h-14 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1B2026] sticky top-[3px] z-[45] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-50 rounded-md cursor-pointer"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>

            {/* Quick Multi-Site Switcher (KL1 | KL2 | KL3) */}
            <div
              role="group"
              aria-label="Select data center site"
              className="inline-flex items-center p-0.5 rounded-md bg-slate-100 dark:bg-[#111418] border border-slate-200 dark:border-slate-700 shrink-0"
            >
              {SITES.map((site) => {
                const active = activeSiteId === site.id;
                return (
                  <button
                    key={site.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handleSelectSite(site.id)}
                    className={`px-2 py-1 text-xs font-mono font-semibold rounded-sm transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#009530] text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    {site.code}
                  </button>
                );
              })}
            </div>

            <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-2 text-sm min-w-0 truncate">
              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                {activeNavMeta.breadcrumb}
              </span>
            </nav>
          </div>

          {/* Global Asset Quick-Search + Unified Cmd+K Command Palette Trigger */}
          <div className="hidden md:flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <label htmlFor="global-asset-search" className="sr-only">
                Quick search servers, racks, CRAC, or UPS
              </label>
              <input
                id="global-asset-search"
                type="search"
                value={globalQuery}
                onChange={(e) => setGlobalQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && globalMatches.length > 0) {
                    handleSelectGlobalResult(globalMatches[0]);
                  } else if (e.key === 'Escape') {
                    setGlobalQuery('');
                  }
                }}
                placeholder="Search servers, racks, CRAC, UPS..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
              />
              {globalMatches.length > 0 && (
                <div
                  role="listbox"
                  aria-label="Asset search results"
                  className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-700 rounded-md shadow-lg overflow-hidden z-50"
                >
                  {globalMatches.map((m) => (
                    <button
                      key={`${m.kind}-${m.id}`}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => handleSelectGlobalResult(m)}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 border-b last:border-b-0 border-slate-100 dark:border-slate-800 cursor-pointer"
                    >
                      <div className="font-mono text-xs font-medium text-slate-900 dark:text-slate-100">
                        {m.title}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{m.subtitle}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              data-testid="open-command-palette-btn"
              onClick={() => setCommandPaletteOpen(true)}
              title="Open Command Palette (Ctrl+K / ⌘K)"
              className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-mono font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Command className="w-3 h-3" aria-hidden="true" />
              <span>K</span>
            </button>
            <button
              type="button"
              data-testid="header-scan-qr-btn"
              onClick={() => setQrScannerOpen(true)}
              title="Scan or paste a Server Asset QR Code to jump straight to its drawer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <QrCode className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
              <span className="hidden lg:inline">Scan QR</span>
            </button>
            <button
              type="button"
              data-testid="open-wallboard-btn"
              onClick={() => setWallboardOpen(true)}
              title="Launch full-screen NOC Control-Room Wallboard Kiosk (auto-rotating KL1 · KL2 · KL3)"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Tv className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              <span className="hidden xl:inline">Wallboard</span>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <button
                type="button"
                data-testid="header-cloud-sync-btn"
                aria-expanded={cloudSyncPanelOpen}
                onClick={() => setCloudSyncPanelOpen((prev) => !prev)}
                title={
                  firebaseAuthError
                    ? `Cloud Sync: ${firebaseAuthError}`
                    : firebaseUser
                    ? `Cloud Sync active as ${firebaseUser.displayName || firebaseUser.email} (${cloudSyncedCount} synced records)`
                    : 'View Firestore Cloud Sync collections & sign in with Google'
                }
                className={`hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  firebaseUser
                    ? 'border-emerald-300 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/70'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Cloud className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {firebaseSigningIn
                    ? 'Signing in...'
                    : firebaseUser
                    ? `Cloud Sync (${cloudSyncedCount})`
                    : 'Cloud Sync'}
                </span>
              </button>

              {cloudSyncPanelOpen && (
                <div
                  data-testid="cloud-sync-popover"
                  className="absolute right-0 top-full mt-1.5 w-80 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] shadow-2xl z-[70] p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        Firestore Multi-Engineer Sync
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {firebaseUser
                          ? `Signed in as ${firebaseUser.displayName || firebaseUser.email}`
                          : 'Local workspace · Sign in to sync live across engineers'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCloudSyncPanelOpen(false)}
                      aria-label="Close Cloud Sync panel"
                      className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    {[
                      { label: 'Tickets', count: cloudSyncBreakdown.tickets },
                      { label: 'Handovers', count: cloudSyncBreakdown.handovers },
                      { label: 'Maint. Windows', count: cloudSyncBreakdown.maintenanceWindows },
                      { label: 'Power Policies', count: cloudSyncBreakdown.hallPolicies },
                      { label: 'Thermal Policies', count: cloudSyncBreakdown.hallThermalPolicies },
                      { label: 'Alert States', count: cloudSyncBreakdown.alertStates },
                      { label: 'Custom Rules', count: cloudSyncBreakdown.customRules },
                      { label: 'Visitors', count: cloudSyncBreakdown.visitors },
                      { label: 'War Runbooks', count: cloudSyncBreakdown.runbooks },
                    ].map((col) => (
                      <div
                        key={col.label}
                        className="flex items-center justify-between px-2 py-1 rounded bg-slate-50 dark:bg-[#14181D] border border-slate-200/70 dark:border-slate-800"
                      >
                        <span className="text-slate-600 dark:text-slate-300">{col.label}</span>
                        <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {col.count}
                        </span>
                      </div>
                    ))}
                  </div>

                  {firebaseAuthError && (
                    <div className="text-[11px] text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded px-2 py-1">
                      {firebaseAuthError}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                      {firebaseUser ? 'Live onSnapshot active' : '9 collections ready'}
                    </span>
                    {firebaseUser ? (
                      <button
                        type="button"
                        onClick={() => {
                          void signOutUser();
                          setCloudSyncPanelOpen(false);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <LogOut className="w-3 h-3" aria-hidden="true" />
                        Sign Out
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={firebaseSigningIn}
                        onClick={() => void signInWithGoogle()}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded bg-[#009530] hover:bg-[#007A27] text-white cursor-pointer disabled:opacity-60"
                      >
                        <Cloud className="w-3 h-3" aria-hidden="true" />
                        {firebaseSigningIn ? 'Signing in...' : 'Sign In with Google'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              data-testid="header-alarm-mute-btn"
              data-alarm-muted={alarmMuted ? 'true' : 'false'}
              data-alarm-sounding={alarmSoundDecision.shouldSound ? 'true' : 'false'}
              data-alarm-level={alarmSoundDecision.level}
              onClick={handleToggleAlarmMute}
              aria-pressed={alarmMuted}
              aria-label={
                alarmMuted
                  ? 'Unmute alarm sound'
                  : alarmSoundDecision.shouldSound
                  ? `Mute alarm sound (${alarmSoundDecision.level} alarm sounding)`
                  : 'Mute alarm sound'
              }
              title={alarmSoundDecision.statusLabel}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                alarmMuted
                  ? 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  : alarmSoundDecision.level === 'critical'
                  ? 'border-red-300 dark:border-red-800/80 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/80'
                  : alarmSoundDecision.level === 'warning'
                  ? 'border-amber-300 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/70'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {alarmMuted ? (
                <VolumeX className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Volume2
                  className={`w-3.5 h-3.5 shrink-0 ${
                    alarmSoundDecision.shouldSound ? 'animate-pulse' : ''
                  }`}
                  aria-hidden="true"
                />
              )}
              <span className="hidden sm:inline">
                {alarmMuted ? 'Muted' : alarmSoundDecision.shouldSound ? 'Mute' : 'Sound'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setDarkMode((prev) => !prev)}
              aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark ops theme'}
              className="p-2 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {darkMode ? <Sun className="w-4 h-4" aria-hidden="true" /> : <Moon className="w-4 h-4" aria-hidden="true" />}
            </button>
            <button
              type="button"
              onClick={() => handleSelectNav('alerts')}
              aria-label={`Open alerts (${summary.activeCriticalCount} critical, ${openWarningCount} warning)`}
              className="inline-flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400 font-mono font-semibold tabular-nums">
                <OctagonAlert className="w-3.5 h-3.5" aria-hidden="true" />
                {summary.activeCriticalCount}
              </span>
              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">|</span>
              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-mono font-semibold tabular-nums">
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                {openWarningCount}
              </span>
            </button>
          </div>
        </header>

        {/* Active Workspace Main Content (Suspense boundary for lazy-loaded modules) */}
        <main
          className={`flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto ${
            activeTab === 'twin3d' ? '' : 'pb-20 sm:pb-24'
          }`}
        >
          <Suspense
            fallback={
              <div className="py-16 text-center text-xs font-mono text-slate-500 dark:text-slate-400">
                Loading {activeNavMeta.label} workspace module...
              </div>
            }
          >
            {activeTab === 'global-noc' && (
              <GlobalNocView
                sitesMap={sitesMap}
                racks={INITIAL_RACKS}
                activeSiteId={activeSiteId}
                onJumpToSite={(siteId) => {
                  handleSelectSite(siteId);
                  setActiveTab('overview');
                }}
                onJumpToSiteRackMap={handleJumpToSiteRackMap}
                onLogAudit={handleLogAudit}
              />
            )}

            {activeTab === 'overview' && (
              <OverviewView
                siteLabel={activeSiteMeta.label}
                summary={summary}
                bms={bms}
                facilityHistory={facilityHistory}
                chartMetric={chartMetric}
                onChartMetricChange={setChartMetric}
                servers={servers}
                alerts={alerts}
                isLive={isLive}
                onToggleLive={() => setIsLive((prev) => !prev)}
                onSimulateFault={handleSimulateFacilityFault}
                onInspectServer={handleInspectEntity}
                onAcknowledgeAlert={handleAcknowledgeAlert}
                onResolveAlert={handleResolveAlert}
                onNavigateTab={(tab) => handleSelectNav(tab)}
              />
            )}

            {activeTab === 'servers' && (
              <ServersView
                servers={servers}
                racks={INITIAL_RACKS}
                hallFilter={serverHallFilter}
                onHallFilterChange={setServerHallFilter}
                onInspectServer={handleInspectEntity}
                onOpenQrScanner={() => setQrScannerOpen(true)}
              />
            )}

            {activeTab === 'racks' && (
              <RackMapView
                siteId={activeSiteId}
                siteCode={activeSiteMeta.code}
                racks={INITIAL_RACKS}
                servers={servers}
                bms={bms}
                alerts={alerts}
                rackPowerAdjustmentsKw={activeSite.rackPowerAdjustmentsKw}
                hallPowerPolicies={activeSite.hallPowerPolicies}
                onRebalanceRack={handleRebalanceRack}
                onOpenAlerts={() => handleSelectNav('alerts')}
                onInspectServer={handleInspectEntity}
                externalHallId={rackDeepLink.hallId}
                externalRackId={rackDeepLink.rackId}
                externalSensorHeatmap={rackDeepLink.sensorHeatmap}
                onSyncRackSelection={handleSyncRackSelection}
                sldBlastHighlight={sldBlastHighlight}
                onClearSldBlast={() => setSldBlastHighlight(null)}
                securityCorrelations={activeSiteSecurityCorrelations}
                pinnedRackIds={pinnedRackIds}
                onTogglePinRack={handleTogglePinRack}
                onClearPinnedRacks={() => setPinnedRackIds([])}
                canControlBms={activeRoleConfig.canControlBms}
                onBoostHallCrac={handleBoostHallCrac}
                onToggleHallExcursion={handleToggleHallExcursion}
                onCreateTicketForRack={handleCreateTicketForRack}
                onLaunchMopForRack={handleLaunchMopForRack}
                onMoveServerInRack={handleMoveServerInRack}
                rackReservations={rackReservationsBySite[activeSiteId] ?? []}
                onDeployServerInRack={handleDeployServerInRack}
                onMoveServerAcrossRacks={handleMoveServerAcrossRacks}
                onDecommissionServer={handleDecommissionServer}
                onAddRackReservation={handleAddRackReservation}
                onRemoveRackReservation={handleRemoveRackReservation}
                failoverMode={failoverStressMode}
                onFailoverModeChange={setFailoverStressMode}
                locateLedServerIds={activeSiteLocateLedServerIds}
                onPrintRackQrSheet={(rackId, count) => {
                  handleLogAudit('CMMS', `Printed ${count}-label QR asset sheet for cabinet ${rackId}`, rackId);
                }}
                onLogAudit={handleLogAudit}
              />
            )}

            {activeTab === 'twin3d' && (
              <DigitalTwin3DView
                siteMeta={activeSiteMeta}
                servers={servers}
                racks={INITIAL_RACKS}
                bms={bms}
                summary={summary}
                darkMode={darkMode}
                rackPowerAdjustmentsKw={activeSite.rackPowerAdjustmentsKw}
                hallPowerPolicies={activeSite.hallPowerPolicies}
                locateLedRackIds={activeSiteLocateLedRackIds}
                onInspectServer={handleInspectEntity}
                onOpenBms={(equipmentId) => {
                  if (equipmentId) setFocusedBmsEquipmentId(equipmentId);
                  handleSelectNav('bms');
                }}
                onFocusRackOnMap={(hallId, rackId) => handleFocusRackOnMap(hallId, rackId)}
              />
            )}

            {activeTab === 'bms' && (
              <BmsView
                bms={bms}
                servers={servers}
                racks={INITIAL_RACKS}
                rackPowerAdjustmentsKw={activeSite.rackPowerAdjustmentsKw}
                hallPowerPolicies={activeSite.hallPowerPolicies}
                onLogAudit={handleLogAudit}
                darkMode={darkMode}
                focusedEquipmentId={focusedBmsEquipmentId}
                onSelectFocusedEquipmentId={setFocusedBmsEquipmentId}
                onAdjustSetpoint={handleAdjustSetpoint}
                onSetCracMode={handleSetCracMode}
                onToggleClosedLoop={handleToggleClosedLoop}
                onToggleChillerFault={handleToggleChillerFault}
                onToggleChwPumpSetMode={handleToggleChwPumpSetMode}
                onTriggerOutage={handleTriggerOutage}
                onRestoreUtility={handleRestoreUtility}
                onToggleUpsFault={handleToggleUpsFault}
                onToggleDieselTankPump={handleToggleDieselTankPump}
                onRefillDieselTank={handleRefillDieselTank}
                onToggleLeakFault={handleToggleLeakFault}
                onToggleColdAisleSla={handleToggleColdAisleSla}
                onToggleGateway={handleToggleGateway}
              />
            )}

            {activeTab === 'alerts' && (
              <AlertsView
                alerts={alerts}
                dispatchLogs={dispatchLogs}
                facilityHistory={facilityHistory}
                alarmMuted={alarmMuted}
                alarmSoundDecision={alarmSoundDecision}
                onToggleAlarmMute={handleToggleAlarmMute}
                onTestAlarmSound={handleTestAlarmSound}
                onInspectServer={handleInspectEntity}
                onAcknowledgeAlert={handleAcknowledgeAlert}
                onResolveAlert={handleResolveAlert}
                onAcknowledgeAll={handleAcknowledgeAll}
                onBulkAcknowledge={handleBulkAcknowledgeAlerts}
                onBulkIgnore={handleBulkIgnoreAlerts}
                onBulkClear={handleBulkClearAlerts}
                onRestoreIgnoredAlert={handleRestoreIgnoredAlert}
                onCreateTicketFromAlert={handleCreateTicketFromAlert}
                onLaunchMopFromAlert={handleLaunchMopFromAlert}
                onRemediateAlert={handleRemediateAlert}
                onFocusRack={(rackId) => {
                  const matched = INITIAL_RACKS.find((r) => r.id === rackId);
                  if (matched) handleFocusRackOnMap(matched.hallId, matched.id);
                }}
                siteCode={activeSiteMeta.code}
                siteId={activeSiteId}
                activeOperatorName={activeProfile.name}
                maintenanceWindows={effectiveMaintenanceWindows}
                onCreateMaintenanceWindow={handleCreateMaintenanceWindow}
                onEndMaintenanceWindow={handleEndMaintenanceWindow}
                onDeleteMaintenanceWindow={handleDeleteMaintenanceWindow}
                onExportAlertsCsv={(exportedCount, filename) => {
                  handleLogAudit(
                    'Alert',
                    `Exported ${exportedCount} filtered alert${exportedCount === 1 ? '' : 's'} to CSV (${filename})`,
                    `${activeSiteMeta.code} Alerts`
                  );
                }}
                onOpenWarRoom={handleOpenWarRoom}
                warRoomRecords={activeSiteWarRooms}
              />
            )}

            {activeTab === 'rules' && (
              <RulesView
                rules={rules}
                channels={channels}
                liveFacilityPowerMw={Number(((summary.totalItLoadKw * summary.pue) / 1000).toFixed(2))}
                siteCode={activeSiteMeta.code}
                hallPowerPolicies={activeSite.hallPowerPolicies}
                hallThermalPolicies={activeSite.hallThermalPolicies}
                racks={INITIAL_RACKS}
                rackPowerStats={activeSiteRackPowerStats}
                rackThermalStats={activeSiteRackThermalStats}
                cloudSynced={Boolean(firebaseUser)}
                onUpdateHallPowerPolicy={handleUpdateHallPowerPolicy}
                onResetHallPowerPolicies={handleResetHallPowerPolicies}
                onUpdateHallThermalPolicy={handleUpdateHallThermalPolicy}
                onResetHallThermalPolicies={handleResetHallThermalPolicies}
                onToggleRule={handleToggleRule}
                onDeleteRule={handleDeleteRule}
                onCreateRule={handleCreateRule}
                onToggleChannel={handleToggleChannel}
                onTestChannel={handleTestChannel}
              />
            )}

            {activeTab === 'ai' && (
              <AiPredictiveView
                activeSiteId={activeSiteId}
                sitesMap={sitesMap}
                racks={INITIAL_RACKS}
                workOrders={workOrders}
                onAddWorkOrder={(wo) => setWorkOrders((prev) => [wo, ...prev])}
                onUpdateWorkOrderStatus={(woId, status: WorkOrderStatus) =>
                  setWorkOrders((prev) =>
                    prev.map((w) => (w.id === woId ? { ...w, status } : w))
                  )
                }
              />
            )}

            {activeTab === 'shifts' && (
              <ShiftsTeamView
                activeSiteId={activeSiteId}
                profiles={profiles}
                activeProfileId={activeProfile.id}
                shiftState={shiftState}
                openCriticalCount={summary.activeCriticalCount}
                openWarningCount={openWarningCount}
                sitePue={summary.pue}
                slaCompliancePct={
                  bms.envSensors.length > 0
                    ? bms.envSensors.reduce((acc, s) => acc + s.slaCompliancePct, 0) /
                      bms.envSensors.length
                    : 100
                }
                alerts={alerts}
                tickets={tickets}
                visitors={visitors}
                bms={bms}
                workOrders={workOrders}
                cloudSynced={Boolean(firebaseUser)}
                cloudHandoversCount={cloudHandovers.length}
                onSelectActiveProfile={setActiveProfileId}
                onAddProfile={handleAddProfile}
                onUpdateDutyOverride={handleUpdateDutyOverride}
                onUpdateProfileAvatar={handleUpdateProfileAvatar}
                onSwitchPattern={handleSwitchShiftPattern}
                onExecuteHandover={handleExecuteHandover}
              />
            )}

            {activeTab === 'tickets' && (
              <TicketingView
                activeSiteId={activeSiteId}
                tickets={tickets}
                profiles={profiles}
                activeProfile={activeProfile}
                servers={servers}
                bms={bms}
                onCreateTicket={handleCreateTicket}
                onTransitionStatus={handleTransitionTicketStatus}
                onAssignTicket={handleAssignTicket}
                onAddComment={handleAddTicketComment}
                onInspectAsset={handleInspectEntity}
              />
            )}

            {activeTab === 'visitors' && (
              <VisitorManagementView
                activeSiteId={activeSiteId}
                visitors={visitors}
                profiles={profiles}
                activeProfile={activeProfile}
                onRegisterVisitor={handleRegisterVisitor}
                onUpdateCompliance={handleUpdateVisitorCompliance}
                onCheckInVisitor={handleCheckInVisitor}
                onCheckOutVisitor={handleCheckOutVisitor}
                onRevokeVisitor={handleRevokeVisitor}
              />
            )}

            {activeTab === 'reports' && (
              <ReportsView
                activeSiteId={activeSiteId}
                sitesMap={sitesMap}
                racks={INITIAL_RACKS}
                reportHistory={reportHistory}
                activeReportId={activeReportId}
                onReportGenerated={handleReportGenerated}
                onSelectReport={setActiveReportId}
                onDeleteReport={handleDeleteReport}
                operatorName={activeProfile.name}
                shiftTeam={activeShiftSnapshot.onDutyTeam}
                shiftSlot={`${activeShiftSnapshot.activeSlot.label} (${activeShiftSnapshot.activeSlot.timeRange})`}
                auditTrail={auditTrail}
                handoverLog={shiftState.handoverLog}
                visitors={visitors}
                maintenanceWindows={effectiveMaintenanceWindows}
                cloudSynced={Boolean(firebaseUser)}
                cloudSyncedHandoversCount={cloudHandovers.length}
                onSyncExecutiveHandover={handleSyncExecutiveHandover}
                onLogAudit={handleLogAudit}
              />
            )}

            {activeTab === 'sld' && (
              <PowerChainSldView
                activeSiteId={activeSiteId}
                bms={bms}
                servers={servers}
                racks={INITIAL_RACKS}
                rackPowerAdjustmentsKw={activeSite.rackPowerAdjustmentsKw}
                hallPowerPolicies={activeSite.hallPowerPolicies}
                failoverMode={failoverStressMode}
                onSetFailoverMode={setFailoverStressMode}
                onOpenFailoverOnRackMap={(mode) => {
                  setFailoverStressMode(mode);
                  handleSelectNav('racks');
                }}
                onLogAudit={handleLogAudit}
                onHighlightBlastOnRackMap={handleHighlightBlastOnRackMap}
              />
            )}

            {activeTab === 'capacity' && (
              <CapacityPlannerView
                activeSiteId={activeSiteId}
                site={activeSite}
                racks={INITIAL_RACKS}
                onLogAudit={handleLogAudit}
              />
            )}

            {activeTab === 'cabling' && (
              <CableConnectivityView
                activeSiteId={activeSiteId}
                servers={servers}
                onLogAudit={handleLogAudit}
              />
            )}

            {activeTab === 'esg' && (
              <EsgSustainabilityView
                activeSiteId={activeSiteId}
                bms={bms}
                itLoadKw={summary.totalItLoadKw}
                pue={summary.pue}
              />
            )}

            {activeTab === 'cmms' && (
              <CmmsMopView
                activeSiteId={activeSiteId}
                tickets={tickets}
                activeOperatorName={activeProfile.name}
                onLogAudit={handleLogAudit}
              />
            )}

            {activeTab === 'tenants' && (
              <TenantBillingView
                activeSiteId={activeSiteId}
                scopedTenantName={activeRoleConfig.defaultTenantName}
              />
            )}

            {activeTab === 'security' && (
              <PhysicalSecurityView
                activeSiteId={activeSiteId}
                visitors={visitors}
                activeOperatorName={activeProfile.name}
                locksBySite={locksBySite}
                onUpdateLocksBySite={setLocksBySite}
                securityCorrelations={activeSiteSecurityCorrelations}
                onFocusRackOnMap={(hallId, rackId) => handleFocusRackOnMap(hallId, rackId, true)}
                onOpenVisitorTab={() => handleSelectNav('visitors')}
                onLogAudit={handleLogAudit}
              />
            )}

            {activeTab === 'system' && (
              <ProtocolsAuditView
                activeSiteId={activeSiteId}
                auditTrail={auditTrail}
                visitors={visitors}
                rackLocks={locksBySite[activeSiteId] ?? []}
                slaCompliancePct={
                  bms.envSensors.length > 0
                    ? bms.envSensors.reduce((acc, s) => acc + s.slaCompliancePct, 0) /
                      bms.envSensors.length
                    : 100
                }
                pue={summary.pue}
                onLogAudit={handleLogAudit}
              />
            )}
          </Suspense>
        </main>
      </div>

      {/* Unified Cmd+K Command Palette */}
      <CommandPaletteModal
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        items={commandPaletteItems}
        siteCode={activeSiteMeta.code}
      />

      {/* In-App Server Asset QR Scanner Modal */}
      <QrAssetScannerModal
        open={qrScannerOpen}
        onClose={() => setQrScannerOpen(false)}
        activeSiteId={activeSiteId}
        sitesMap={sitesMap}
        onResolveServer={handleResolveQrServer}
      />

      {/* Full-Screen NOC Control-Room Wallboard Kiosk */}
      <NocWallboardModal
        open={wallboardOpen}
        initialSiteId={activeSiteId}
        sitesMap={sitesMap}
        racks={INITIAL_RACKS}
        operators={profiles}
        onClose={() => setWallboardOpen(false)}
        onFocusRack={(siteId, rackId) => {
          setWallboardOpen(false);
          setActiveSiteId(siteId);
          const matched = INITIAL_RACKS.find((r) => r.id === rackId);
          if (matched) {
            handleFocusRackOnMap(matched.hallId, matched.id);
          }
        }}
      />

      {/* Closed-Loop Incident War Room & Guided Runbook Modal */}
      <IncidentWarRoomModal
        open={Boolean(warRoomAlertId && activeWarRoomAlert && activeWarRoomRecord)}
        alert={activeWarRoomAlert}
        record={activeWarRoomRecord}
        siteEngineers={activeSiteEngineers}
        activeOperatorName={activeProfile.name}
        onClose={() => setWarRoomAlertId(null)}
        onToggleStep={handleToggleWarRoomStep}
        onAssignEngineer={handleAssignWarRoomEngineer}
        onUpdateNotes={handleUpdateWarRoomNotes}
        onCreateLinkedTicket={(alert) => {
          handleCreateTicketFromAlert(alert);
          setWarRoomsBySite((prev) => {
            const sid = activeSiteIdRef.current;
            const cur = prev[sid]?.[alert.id];
            if (!cur) return prev;
            const updated: IncidentWarRoomRecord = {
              ...cur,
              linkedTicketId: `INC-${Date.now().toString().slice(-4)}`,
            };
            syncWarRoomRecordToCloud(updated);
            return { ...prev, [sid]: { ...prev[sid], [alert.id]: updated } };
          });
        }}
        onRunRemediation={handleRemediateAlert}
        onResolveAlert={handleResolveAlert}
        onAppendToShiftHandover={handleAppendWarRoomToHandover}
      />

      {/* Server Detail Slide-Over Inspector */}
      <ServerDetailDrawer
        server={selectedServer}
        siteId={activeSiteId}
        siteCode={activeSiteMeta.code}
        alerts={alerts}
        bmcState={selectedServerBmcState}
        onExecuteBmcAction={handleExecuteBmcAction}
        onScheduleFirmwareWindow={handleScheduleFirmwareWindow}
        onClose={() => setSelectedServerId(null)}
        onInjectFault={handleInjectFault}
        onToggleMaintenance={handleToggleMaintenance}
        onAcknowledgeAlert={handleAcknowledgeAlert}
        onResolveAlert={handleResolveAlert}
      />

      {/* Automated Alert Notification Toast Stack */}
      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
        onDismissAll={() => setToasts([])}
        onInspectServer={handleInspectEntity}
        onAcknowledgeAlert={handleAcknowledgeAlert}
      />

      {/* Floating AI Operations Assistant — Rannia */}
      <PuteriRanniaChatBox siteContext={puteriRanniaContext} />
    </div>
  );
}

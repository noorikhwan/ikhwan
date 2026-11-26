import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  BellOff,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  EyeOff,
  FileText,
  Layers,
  MapPin,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Ticket,
  Trash2,
  Volume2,
  VolumeX,
  Wind,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { AlarmSoundDecision } from '../engine/alarmAudio';
import { isAlertOpen, pruneSelectedAlertIds } from '../engine/alertBulkActions';
import { buildAlertsCsv, buildAlertsCsvFilename } from '../engine/alertCsvExport';
import {
  correlateAlertStorms,
  findMatchingMaintenanceWindow,
  generatePostIncidentReview,
  isMaintenanceWindowLive,
  MaintenanceScopeType,
  MaintenanceWindow,
  PostIncidentReview,
} from '../engine/alertIntelligenceEngine';
import { IncidentWarRoomRecord } from '../engine/incidentRunbookEngine';
import { SiteId } from '../engine/sites';
import {
  RACK_CRITICAL_POWER_RULE_ID,
  RACK_THERMAL_VIOLATION_RULE_ID,
} from '../engine/telemetryEngine';
import {
  ActiveAlert,
  AlertState,
  DispatchLogEntry,
  FacilityTelemetryPoint,
  Severity,
} from '../engine/types';
import { AlertFrequencyChart } from './AlertFrequencyChart';
import { AlertStateText, formatClockTime, formatRelativeTime, SeverityLabel } from './StatusIndicator';

interface AlertsViewProps {
  alerts: ActiveAlert[];
  dispatchLogs: DispatchLogEntry[];
  facilityHistory?: FacilityTelemetryPoint[];
  alarmMuted: boolean;
  alarmSoundDecision: AlarmSoundDecision;
  onToggleAlarmMute: () => void;
  onTestAlarmSound: () => void;
  onInspectServer: (serverId: string) => void;
  onAcknowledgeAlert: (alertId: string) => void;
  onResolveAlert: (alertId: string) => void;
  onAcknowledgeAll: () => void;
  onBulkAcknowledge: (alertIds: string[]) => void;
  onBulkIgnore: (alertIds: string[]) => void;
  onBulkClear: (alertIds: string[]) => void;
  onRestoreIgnoredAlert: (alertId: string) => void;
  onCreateTicketFromAlert?: (alert: ActiveAlert) => void;
  onLaunchMopFromAlert?: (alert: ActiveAlert) => void;
  siteCode?: string;
  siteId?: SiteId;
  activeOperatorName?: string;
  maintenanceWindows?: MaintenanceWindow[];
  onCreateMaintenanceWindow?: (draft: Omit<MaintenanceWindow, 'id' | 'status' | 'createdBy'>) => void;
  onEndMaintenanceWindow?: (windowId: string) => void;
  onDeleteMaintenanceWindow?: (windowId: string) => void;
  onExportAlertsCsv?: (exportedCount: number, filename: string) => void;
  onRemediateAlert?: (alert: ActiveAlert) => { ok: boolean; summary: string };
  onFocusRack?: (rackId: string) => void;
  onOpenWarRoom?: (alert: ActiveAlert) => void;
  warRoomRecords?: Record<string, IncidentWarRoomRecord>;
}

export function AlertsView({
  alerts,
  dispatchLogs,
  facilityHistory = [],
  alarmMuted,
  alarmSoundDecision,
  onToggleAlarmMute,
  onTestAlarmSound,
  onInspectServer,
  onAcknowledgeAlert,
  onResolveAlert,
  onAcknowledgeAll,
  onBulkAcknowledge,
  onBulkIgnore,
  onBulkClear,
  onRestoreIgnoredAlert,
  onCreateTicketFromAlert,
  onLaunchMopFromAlert,
  siteCode = 'DCIM',
  siteId = 'kl1',
  activeOperatorName = 'NOC Operator',
  maintenanceWindows = [],
  onCreateMaintenanceWindow,
  onEndMaintenanceWindow,
  onDeleteMaintenanceWindow,
  onExportAlertsCsv,
  onRemediateAlert,
  onFocusRack,
  onOpenWarRoom,
  warRoomRecords = {},
}: AlertsViewProps) {
  const [subTab, setSubTab] = useState<'incidents' | 'dispatches'>('incidents');
  const [viewMode, setViewMode] = useState<'table' | 'correlated'>('table');
  const [stateFilter, setStateFilter] = useState<AlertState | 'all' | 'open'>('open');
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);
  const [maintPanelOpen, setMaintPanelOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [activePir, setActivePir] = useState<PostIncidentReview | null>(null);
  const [pirCopied, setPirCopied] = useState(false);

  // Maintenance window form state
  const [mwTitle, setMwTitle] = useState('');
  const [mwScopeType, setMwScopeType] = useState<MaintenanceScopeType>('hall');
  const [mwScopeValue, setMwScopeValue] = useState('hall-b');
  const [mwDurationHrs, setMwDurationHrs] = useState<number>(2);
  const [mwReason, setMwReason] = useState('');

  const selectAllRef = useRef<HTMLInputElement | null>(null);

  const unackedCount = useMemo(() => alerts.filter((a) => a.state === 'active').length, [alerts]);
  const openCount = useMemo(() => alerts.filter((a) => isAlertOpen(a)).length, [alerts]);
  const ignoredCount = useMemo(() => alerts.filter((a) => a.state === 'ignored').length, [alerts]);

  const siteMaintenanceWindows = useMemo(
    () => maintenanceWindows.filter((w) => w.siteId === siteId),
    [maintenanceWindows, siteId]
  );

  const activeWindowCount = useMemo(
    () => siteMaintenanceWindows.filter((w) => isMaintenanceWindowLive(w)).length,
    [siteMaintenanceWindows]
  );

  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      if (stateFilter === 'open' && !isAlertOpen(a)) return false;
      if (stateFilter !== 'all' && stateFilter !== 'open' && a.state !== stateFilter) return false;
      if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
      return true;
    });
  }, [alerts, stateFilter, severityFilter]);

  const correlatedGroups = useMemo(
    () => correlateAlertStorms(filteredAlerts, siteMaintenanceWindows, siteId),
    [filteredAlerts, siteMaintenanceWindows, siteId]
  );

  // Keep active selection aligned with visible rows after filter/state transitions
  const effectiveSelectedIds = useMemo(
    () => pruneSelectedAlertIds(selectedIds, filteredAlerts),
    [selectedIds, filteredAlerts]
  );

  const selectedAlerts = useMemo(
    () => filteredAlerts.filter((a) => effectiveSelectedIds.has(a.id)),
    [filteredAlerts, effectiveSelectedIds]
  );

  const selectedCount = selectedAlerts.length;
  const allVisibleSelected = filteredAlerts.length > 0 && selectedCount === filteredAlerts.length;
  const someVisibleSelected = selectedCount > 0 && selectedCount < filteredAlerts.length;

  const selectedActiveCount = useMemo(
    () => selectedAlerts.filter((a) => a.state === 'active').length,
    [selectedAlerts]
  );
  const selectedIgnorableCount = useMemo(
    () => selectedAlerts.filter((a) => isAlertOpen(a)).length,
    [selectedAlerts]
  );
  const selectedResolvedOnly =
    selectedCount > 0 && selectedAlerts.every((a) => a.state === 'resolved');

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  useEffect(() => {
    if (!bulkFeedback) return;
    const timer = window.setTimeout(() => setBulkFeedback(null), 5000);
    return () => window.clearTimeout(timer);
  }, [bulkFeedback]);

  useEffect(() => {
    if (!activePir) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActivePir(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activePir]);

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAlerts.map((a) => a.id)));
    }
  };

  const toggleSelectOne = (alertId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(alertId)) {
        next.delete(alertId);
      } else {
        next.add(alertId);
      }
      return next;
    });
  };

  const handleTriggerBulkAcknowledge = () => {
    const ids = selectedAlerts.filter((a) => a.state === 'active').map((a) => a.id);
    if (ids.length === 0) return;
    onBulkAcknowledge(ids);
    setSelectedIds(new Set());
    setBulkFeedback(`Acknowledged ${ids.length} selected ${ids.length === 1 ? 'alert' : 'alerts'}.`);
  };

  const handleTriggerBulkIgnore = () => {
    const ids = selectedAlerts.filter((a) => isAlertOpen(a)).map((a) => a.id);
    if (ids.length === 0) return;
    onBulkIgnore(ids);
    setSelectedIds(new Set());
    setBulkFeedback(
      `Ignored ${ids.length} ${ids.length === 1 ? 'alert' : 'alerts'} — suppressed from active queue & alarm horn.`
    );
  };

  const handleTriggerBulkClear = () => {
    const ids = selectedAlerts.map((a) => a.id);
    if (ids.length === 0) return;
    const openOrIgnored = selectedAlerts.filter((a) => a.state !== 'resolved').length;
    const alreadyResolved = selectedAlerts.length - openOrIgnored;
    onBulkClear(ids);
    setSelectedIds(new Set());
    if (openOrIgnored > 0 && alreadyResolved > 0) {
      setBulkFeedback(
        `Cleared ${openOrIgnored} active/ignored and removed ${alreadyResolved} resolved ${
          alreadyResolved === 1 ? 'alert' : 'alerts'
        }.`
      );
    } else if (alreadyResolved > 0) {
      setBulkFeedback(
        `Removed ${alreadyResolved} resolved ${alreadyResolved === 1 ? 'alert' : 'alerts'} from history.`
      );
    } else {
      setBulkFeedback(`Cleared ${openOrIgnored} ${openOrIgnored === 1 ? 'alert' : 'alerts'} to Resolved.`);
    }
  };

  const handleExportCurrentAlertsCsv = () => {
    if (filteredAlerts.length === 0) return;
    const csv = buildAlertsCsv(filteredAlerts, { siteCode });
    const filename = buildAlertsCsvFilename({
      siteCode,
      stateFilter,
      severityFilter,
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setBulkFeedback(
      `Exported ${filteredAlerts.length} ${
        filteredAlerts.length === 1 ? 'alert' : 'alerts'
      } (${stateFilter} · ${severityFilter}) to ${filename}.`
    );
    onExportAlertsCsv?.(filteredAlerts.length, filename);
  };

  const handleOpenPir = (alert: ActiveAlert, correlatedChildren: ActiveAlert[] = []) => {
    const pir = generatePostIncidentReview({
      alert,
      correlatedChildren,
      siteCode,
      facilityHistory,
      operatorName: activeOperatorName,
    });
    setPirCopied(false);
    setActivePir(pir);
  };

  const handleCopyPirMarkdown = async () => {
    if (!activePir) return;
    try {
      await navigator.clipboard.writeText(activePir.markdown);
      setPirCopied(true);
      window.setTimeout(() => setPirCopied(false), 2500);
    } catch {
      setBulkFeedback('Clipboard unavailable — use Download .md instead.');
    }
  };

  const handleDownloadPirMarkdown = () => {
    if (!activePir) return;
    const blob = new Blob([activePir.markdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activePir.incidentId.toLowerCase()}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setBulkFeedback(`Downloaded ${activePir.incidentId}.md post-incident review.`);
  };

  const handleCreateMaintenanceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateMaintenanceWindow) return;
    const title = mwTitle.trim() || `Planned Maintenance (${mwScopeType === 'all' ? siteCode : mwScopeValue})`;
    const now = Date.now();
    onCreateMaintenanceWindow({
      siteId,
      title,
      scopeType: mwScopeType,
      scopeValue: mwScopeType === 'all' ? 'all' : mwScopeValue.trim() || 'all',
      reason: mwReason.trim() || 'Authorized preventive maintenance — alert horn & storm escalation silenced.',
      startAtMs: now - 5_000,
      endAtMs: now + mwDurationHrs * 3600_000,
    });
    setMwTitle('');
    setMwReason('');
    setBulkFeedback(`Activated ${mwDurationHrs}h maintenance silence window: "${title}".`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Alerts &amp; Automated Notifications
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Real-time threshold breach triage, bulk clear &amp; ignore controls, audible NOC alarm horn, and dispatch trail
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="alerts-mute-toggle-btn"
            onClick={onToggleAlarmMute}
            aria-pressed={alarmMuted}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
              alarmMuted
                ? 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
                : alarmSoundDecision.level === 'critical'
                ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/80'
                : alarmSoundDecision.level === 'warning'
                ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/70'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {alarmMuted ? (
              <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <Volume2
                className={`w-3.5 h-3.5 ${alarmSoundDecision.shouldSound ? 'animate-pulse' : ''}`}
                aria-hidden="true"
              />
            )}
            <span>{alarmSoundDecision.statusLabel}</span>
          </button>

          <button
            type="button"
            data-testid="alerts-test-sound-btn"
            onClick={onTestAlarmSound}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            Test Sound
          </button>

          {subTab === 'incidents' && (
            <>
              <button
                type="button"
                data-testid="alerts-maintenance-btn"
                onClick={() => setMaintPanelOpen((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                  activeWindowCount > 0 || maintPanelOpen
                    ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <BellOff className="w-3.5 h-3.5" aria-hidden="true" />
                Maintenance ({activeWindowCount})
              </button>

              <button
                type="button"
                data-testid="alerts-export-csv-btn"
                onClick={handleExportCurrentAlertsCsv}
                disabled={filteredAlerts.length === 0}
                title={
                  filteredAlerts.length === 0
                    ? 'No alerts in current filter to export'
                    : `Export ${filteredAlerts.length} visible alert(s) and resolution status to CSV`
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#007A27] dark:text-[#3DCD58]" aria-hidden="true" />
                Export CSV ({filteredAlerts.length})
              </button>
            </>
          )}

          {subTab === 'incidents' && unackedCount > 0 && (
            <button
              type="button"
              onClick={onAcknowledgeAll}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
              Acknowledge All ({unackedCount})
            </button>
          )}
        </div>
      </div>

      {/* Sub-navigation & Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-3">
        <div
          role="tablist"
          aria-label="Alerts view mode"
          className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#111418] rounded-md self-start"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'incidents'}
            onClick={() => setSubTab('incidents')}
            className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'incidents'
                ? 'bg-white dark:bg-[#252A30] text-[#007A27] dark:text-[#3DCD58] shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Incidents ({openCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'dispatches'}
            onClick={() => setSubTab('dispatches')}
            className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'dispatches'
                ? 'bg-white dark:bg-[#252A30] text-[#007A27] dark:text-[#3DCD58] shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Notification Dispatch Log ({dispatchLogs.length})
          </button>
        </div>

        {subTab === 'incidents' && (
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Filter alerts by state"
              className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg"
            >
              {(
                [
                  ['open', 'Open'],
                  ['active', 'Unacked'],
                  ['acknowledged', 'Acknowledged'],
                  ['ignored', ignoredCount > 0 ? `Ignored (${ignoredCount})` : 'Ignored'],
                  ['resolved', 'Resolved'],
                  ['all', 'All'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  data-testid={`alerts-filter-state-${val}`}
                  onClick={() => {
                    setStateFilter(val);
                    setSelectedIds(new Set());
                  }}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    stateFilter === val
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div
              role="group"
              aria-label="Filter alerts by severity"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg"
            >
              {(
                [
                  ['all', 'All Severity'],
                  ['critical', 'Critical'],
                  ['warning', 'Warning'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    setSeverityFilter(val);
                    setSelectedIds(new Set());
                  }}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    severityFilter === val
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              role="group"
              aria-label="Alert grouping mode"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg"
            >
              <button
                type="button"
                data-testid="alerts-view-table-btn"
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Flat Queue
              </button>
              <button
                type="button"
                data-testid="alerts-view-correlated-btn"
                onClick={() => setViewMode('correlated')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  viewMode === 'correlated'
                    ? 'bg-white dark:bg-slate-900 text-[#007A27] dark:text-[#3DCD58] shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                Correlated ({correlatedGroups.length})
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Maintenance Windows & Alert Silencing Drawer */}
      {subTab === 'incidents' && maintPanelOpen && (
        <section
          aria-label="Maintenance Windows and Alert Silencing"
          data-testid="alerts-maintenance-panel"
          className="bg-white dark:bg-[#1B2026] border border-amber-300/80 dark:border-amber-800/70 rounded-md p-4 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <BellOff className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                Maintenance Windows &amp; Horn Silencing ({siteCode})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Active windows tag matching alarms as Maintenance-Silenced and suppress the audible NOC alarm horn without losing telemetry records.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMaintPanelOpen(false)}
              className="self-start sm:self-center p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              aria-label="Close maintenance windows panel"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {onCreateMaintenanceWindow && (
            <form onSubmit={handleCreateMaintenanceSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end bg-slate-50 dark:bg-[#151A20] border border-slate-200 dark:border-slate-800 rounded-md p-3">
              <div className="md:col-span-3">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Window Title
                </label>
                <input
                  type="text"
                  data-testid="mw-title-input"
                  value={mwTitle}
                  onChange={(e) => setMwTitle(e.target.value)}
                  placeholder="e.g., Hall B CDU Filter Swap"
                  className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Scope Type
                </label>
                <select
                  data-testid="mw-scope-type"
                  value={mwScopeType}
                  onChange={(e) => {
                    const next = e.target.value as MaintenanceScopeType;
                    setMwScopeType(next);
                    if (next === 'hall') setMwScopeValue('hall-b');
                    else if (next === 'subsystem') setMwScopeValue('cooling');
                    else if (next === 'rack') setMwScopeValue('B-R01-01');
                    else setMwScopeValue('all');
                  }}
                  className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-900 dark:text-slate-100"
                >
                  <option value="all">Entire Campus</option>
                  <option value="hall">Data Hall</option>
                  <option value="rack">Specific Rack</option>
                  <option value="subsystem">Subsystem</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Target Scope
                </label>
                {mwScopeType === 'hall' ? (
                  <select
                    value={mwScopeValue}
                    onChange={(e) => setMwScopeValue(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-900 dark:text-slate-100"
                  >
                    <option value="hall-a">Hall A · Compute</option>
                    <option value="hall-b">Hall B · AI GPU</option>
                    <option value="hall-c">Hall C · Storage</option>
                    <option value="hall-d">Hall D · Cloud</option>
                  </select>
                ) : mwScopeType === 'subsystem' ? (
                  <select
                    value={mwScopeValue}
                    onChange={(e) => setMwScopeValue(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-900 dark:text-slate-100"
                  >
                    <option value="cooling">Cooling / Thermal</option>
                    <option value="power">Power / UPS</option>
                    <option value="compute">Compute / Network</option>
                  </select>
                ) : mwScopeType === 'rack' ? (
                  <input
                    type="text"
                    value={mwScopeValue}
                    onChange={(e) => setMwScopeValue(e.target.value)}
                    placeholder="B-R01-01"
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-900 dark:text-slate-100"
                  />
                ) : (
                  <input
                    type="text"
                    value="All Campus Assets"
                    disabled
                    className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500"
                  />
                )}
              </div>
              <div className="md:col-span-1">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Duration
                </label>
                <select
                  value={mwDurationHrs}
                  onChange={(e) => setMwDurationHrs(Number(e.target.value))}
                  className="w-full px-2 py-1.5 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-900 dark:text-slate-100"
                >
                  <option value={1}>1h</option>
                  <option value={2}>2h</option>
                  <option value={4}>4h</option>
                  <option value={8}>8h</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Change Reason
                </label>
                <input
                  type="text"
                  value={mwReason}
                  onChange={(e) => setMwReason(e.target.value)}
                  placeholder="CRQ / PM ticket ref"
                  className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="md:col-span-2">
                <button
                  type="submit"
                  data-testid="mw-activate-btn"
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-amber-600 hover:bg-amber-700 text-white transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  Activate Window
                </button>
              </div>
            </form>
          )}

          {siteMaintenanceWindows.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No maintenance windows recorded for {siteCode}.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
              {siteMaintenanceWindows.map((win) => {
                const live = isMaintenanceWindowLive(win);
                return (
                  <div
                    key={win.id}
                    className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white dark:bg-[#1B2026]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {win.title}
                        </span>
                        <span
                          className={`text-[11px] font-medium px-1.5 py-0.5 rounded border ${
                            live
                              ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                              : win.status === 'ended'
                              ? 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                              : 'border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300'
                          }`}
                        >
                          {live ? 'Active · Silencing' : win.status === 'ended' ? 'Ended' : 'Scheduled'}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {win.scopeType}:{win.scopeValue}
                        </span>
                        {win.cloudSynced && (
                          <span className="text-[11px] text-[#007A27] dark:text-[#3DCD58] inline-flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                            Synced
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {win.reason} · By {win.createdBy} · Until {formatClockTime(win.endAtMs)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {live && onEndMaintenanceWindow && (
                        <button
                          type="button"
                          onClick={() => onEndMaintenanceWindow(win.id)}
                          className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          End Now
                        </button>
                      )}
                      {onDeleteMaintenanceWindow && (
                        <button
                          type="button"
                          onClick={() => onDeleteMaintenanceWindow(win.id)}
                          aria-label={`Delete maintenance window ${win.title}`}
                          className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 24-Hour Alert Frequency by Severity Visualization (Telemetry-Correlated) */}
      {subTab === 'incidents' && (
        <AlertFrequencyChart
          alerts={alerts}
          dispatchLogs={dispatchLogs}
          facilityHistory={facilityHistory}
          siteCode={siteCode}
          severityFilter={severityFilter}
          onSelectSeverityFilter={(nextSev) => {
            setSeverityFilter(nextSev);
            setSelectedIds(new Set());
          }}
        />
      )}

      {/* Inline Bulk Action Confirmation Banner */}
      {subTab === 'incidents' && bulkFeedback && (
        <div
          role="status"
          data-testid="alerts-bulk-feedback"
          className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-md border border-[#009530]/30 bg-[#009530]/[0.08] dark:bg-[#3DCD58]/10 text-xs font-medium text-[#006B22] dark:text-[#6EE787]"
        >
          <span>{bulkFeedback}</span>
          <button
            type="button"
            onClick={() => setBulkFeedback(null)}
            aria-label="Dismiss bulk action confirmation"
            className="p-0.5 text-[#007A27] dark:text-[#6EE787] hover:opacity-75 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {subTab === 'incidents' ? (
        <div className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
          {/* Contextual Bulk Actions Toolbar */}
          {selectedCount > 0 && (
            <div
              role="region"
              aria-label="Bulk alert actions"
              data-testid="alerts-bulk-toolbar"
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#151A20]"
            >
              <div className="flex items-center gap-3 text-xs">
                <span
                  data-testid="alerts-selected-count"
                  className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums"
                >
                  {selectedCount} {selectedCount === 1 ? 'alert' : 'alerts'} selected
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 underline underline-offset-2 cursor-pointer"
                >
                  Clear selection
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedActiveCount > 0 && (
                  <button
                    type="button"
                    data-testid="bulk-acknowledge-btn"
                    onClick={handleTriggerBulkAcknowledge}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
                    Acknowledge ({selectedActiveCount})
                  </button>
                )}

                {selectedIgnorableCount > 0 && (
                  <button
                    type="button"
                    data-testid="bulk-ignore-btn"
                    onClick={handleTriggerBulkIgnore}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-amber-300 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/70 transition-colors cursor-pointer"
                  >
                    <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                    Ignore ({selectedIgnorableCount})
                  </button>
                )}

                <button
                  type="button"
                  data-testid="bulk-clear-btn"
                  onClick={handleTriggerBulkClear}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-red-300 dark:border-red-800/80 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/70 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  {selectedResolvedOnly ? `Remove (${selectedCount})` : `Clear (${selectedCount})`}
                </button>
              </div>
            </div>
          )}

          {filteredAlerts.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                No alerts match the selected filter
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Switch to Ignored, Resolved, or All alerts to review suppressed and historical incidents.
              </p>
            </div>
          ) : viewMode === 'correlated' ? (
            <div data-testid="alerts-correlated-list" className="divide-y divide-slate-200 dark:divide-slate-800">
              {correlatedGroups.map((group) => {
                const isExpanded = expandedGroups[group.id] ?? group.childAlerts.length > 0;
                const root = group.rootCauseAlert;
                return (
                  <div key={group.id} className="p-4 space-y-3 bg-white dark:bg-[#1B2026]">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <SeverityLabel severity={group.highestSeverity} />
                          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {group.category} · {group.affectedHall}
                          </span>
                          <span className="font-mono text-[11px] tabular-nums px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {group.totalAlerts} {group.totalAlerts === 1 ? 'alert' : 'correlated alerts'}
                          </span>
                          {group.silencedByWindow && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300">
                              <BellOff className="w-3 h-3" aria-hidden="true" />
                              Silenced · {group.silencedByWindow.title}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                          {group.probableRootCause}
                        </p>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                          Root anchor: {root.serverHostname} ({root.rackId}) · {root.message} · {formatRelativeTime(root.triggeredAt)}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {isAlertOpen(root) && onOpenWarRoom && (
                          <button
                            type="button"
                            onClick={() => onOpenWarRoom(root)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-red-300 dark:border-red-800/80 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/70 cursor-pointer"
                          >
                            <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
                            War Room
                          </button>
                        )}
                        <button
                          type="button"
                          data-testid={`correlated-pir-btn-${group.id}`}
                          onClick={() => handleOpenPir(root, group.childAlerts)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 text-[#007A27] dark:text-[#3DCD58]" aria-hidden="true" />
                          Generate PIR
                        </button>
                        {root.state === 'active' && (
                          <button
                            type="button"
                            onClick={() =>
                              onBulkAcknowledge([
                                root.id,
                                ...group.childAlerts.filter((c) => c.state === 'active').map((c) => c.id),
                              ])
                            }
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white cursor-pointer"
                          >
                            <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
                            Ack Group
                          </button>
                        )}
                        {group.childAlerts.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedGroups((prev) => ({ ...prev, [group.id]: !isExpanded }))
                            }
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                            {group.childAlerts.length} suppressed symptom{group.childAlerts.length === 1 ? '' : 's'}
                          </button>
                        )}
                      </div>
                    </div>

                    {isExpanded && group.childAlerts.length > 0 && (
                      <div className="pl-4 border-l border-slate-200 dark:border-slate-700 space-y-1.5">
                        {group.childAlerts.map((child) => (
                          <div
                            key={child.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 rounded-md bg-slate-50 dark:bg-[#151A20] border border-slate-200/70 dark:border-slate-800 text-xs"
                          >
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              <SeverityLabel severity={child.severity} />
                              <button
                                type="button"
                                onClick={() => onInspectServer(child.serverId)}
                                className="font-mono font-medium text-[#007A27] dark:text-[#3DCD58] hover:underline cursor-pointer"
                              >
                                {child.serverHostname}
                              </button>
                              <span className="text-slate-500 dark:text-slate-400 font-mono">{child.rackId}</span>
                              <span className="text-slate-700 dark:text-slate-300 truncate">{child.message}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <AlertStateText state={child.state} />
                              <button
                                type="button"
                                onClick={() => handleOpenPir(child)}
                                className="text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white underline cursor-pointer"
                              >
                                PIR
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-3 pl-4 pr-2 w-10">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        data-testid="alerts-select-all"
                        aria-label="Select all visible alerts"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 accent-[#009530] cursor-pointer align-middle"
                      />
                    </th>
                    <th className="py-3 px-3">Severity</th>
                    <th className="py-3 px-3">Rule &amp; Telemetry Condition</th>
                    <th className="py-3 px-3">Affected Node</th>
                    <th className="py-3 px-3">State</th>
                    <th className="py-3 px-3">Dispatched To</th>
                    <th className="py-3 px-3 text-right">Triggered</th>
                    <th className="py-3 pl-3 pr-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                  {filteredAlerts.map((alert) => {
                    const isSelected = effectiveSelectedIds.has(alert.id);
                    return (
                      <tr
                        key={alert.id}
                        data-testid={`alert-row-${alert.id}`}
                        className={`transition-colors ${
                          isSelected
                            ? 'bg-[#009530]/[0.05] dark:bg-[#3DCD58]/[0.08]'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-3.5 pl-4 pr-2 align-top">
                          <input
                            type="checkbox"
                            data-testid={`alert-checkbox-${alert.id}`}
                            aria-label={`Select ${alert.ruleName} on ${alert.serverHostname}`}
                            checked={isSelected}
                            onChange={() => toggleSelectOne(alert.id)}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 accent-[#009530] cursor-pointer"
                          />
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          <SeverityLabel severity={alert.severity} />
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {alert.ruleName}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                            {alert.message}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 align-top whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onInspectServer(alert.serverId)}
                            className="font-mono text-xs font-medium text-[#007A27] dark:text-[#3DCD58] hover:underline cursor-pointer"
                          >
                            {alert.serverHostname}
                          </button>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                            {alert.rackId}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          <AlertStateText state={alert.state} />
                          {(() => {
                            const mw = findMatchingMaintenanceWindow(alert, siteId, siteMaintenanceWindows);
                            return mw ? (
                              <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                                <BellOff className="w-3 h-3" aria-hidden="true" />
                                Silenced · Maint
                              </div>
                            ) : null;
                          })()}
                          {alert.state === 'ignored' && alert.ignoredBy && (
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              by {alert.ignoredBy}
                            </div>
                          )}
                          {alert.state !== 'ignored' && alert.acknowledgedBy && (
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              by {alert.acknowledgedBy}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-3 align-top text-xs text-slate-600 dark:text-slate-400 max-w-[220px]">
                          {alert.dispatchedChannelNames.length > 0
                            ? alert.dispatchedChannelNames.join(' · ')
                            : 'No active channel'}
                        </td>
                        <td className="py-3.5 px-3 align-top text-right font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          <div>{formatRelativeTime(alert.triggeredAt)}</div>
                          <div className="text-[11px]">{formatClockTime(alert.triggeredAt)}</div>
                        </td>
                        <td className="py-3.5 pl-3 pr-4 align-top text-right">
                          <div className="inline-flex flex-wrap justify-end items-center gap-1.5 max-w-[290px]">
                            {isAlertOpen(alert) && onRemediateAlert && (() => {
                              const isOverCap = alert.ruleId === RACK_CRITICAL_POWER_RULE_ID;
                              const isThermal =
                                !isOverCap &&
                                (alert.metric === 'tempC' ||
                                  alert.metric === 'rackAvgTempC' ||
                                  alert.ruleId === RACK_THERMAL_VIOLATION_RULE_ID ||
                                  /temp|thermal|sla|crac|cooling/i.test(alert.ruleName));
                              return (
                                <button
                                  type="button"
                                  data-testid={`alert-remediate-btn-${alert.id}`}
                                  onClick={() => {
                                    const res = onRemediateAlert(alert);
                                    setBulkFeedback(res.summary);
                                  }}
                                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                                    isOverCap
                                      ? 'border-[#009530] bg-[#009530] hover:bg-[#007A27] text-white'
                                      : isThermal
                                      ? 'border-sky-600 bg-sky-600 hover:bg-sky-700 text-white'
                                      : 'border-indigo-600 bg-indigo-600 hover:bg-indigo-700 text-white'
                                  }`}
                                >
                                  {isOverCap ? (
                                    <ArrowLeftRight className="w-3 h-3" aria-hidden="true" />
                                  ) : isThermal ? (
                                    <Wind className="w-3 h-3" aria-hidden="true" />
                                  ) : (
                                    <Zap className="w-3 h-3" aria-hidden="true" />
                                  )}
                                  {isOverCap
                                    ? 'Auto-Rebalance'
                                    : isThermal
                                    ? 'Boost Cooling'
                                    : 'Recover Node'}
                                </button>
                              );
                            })()}
                            {(alert.ruleId === RACK_CRITICAL_POWER_RULE_ID ||
                              alert.ruleId === RACK_THERMAL_VIOLATION_RULE_ID) &&
                              onFocusRack && (
                                <button
                                  type="button"
                                  data-testid={`alert-focus-rack-${alert.id}`}
                                  onClick={() => onFocusRack(alert.rackId)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  <MapPin className="w-3 h-3 text-[#007A27] dark:text-[#3DCD58]" aria-hidden="true" />
                                  Map
                                </button>
                              )}
                            {isAlertOpen(alert) && onOpenWarRoom && (() => {
                              const wr = warRoomRecords[alert.id];
                              const doneCount = wr ? wr.steps.filter((s) => s.completed).length : 0;
                              const totalCount = wr ? wr.steps.length : 0;
                              return (
                                <button
                                  type="button"
                                  data-testid={`open-war-room-btn-${alert.id}`}
                                  onClick={() => onOpenWarRoom(alert)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-red-300 dark:border-red-800/80 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/70 transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  <ShieldAlert className="w-3 h-3" aria-hidden="true" />
                                  {wr ? `War Room (${doneCount}/${totalCount})` : 'War Room'}
                                </button>
                              );
                            })()}
                            <button
                              type="button"
                              data-testid={`alert-pir-btn-${alert.id}`}
                              onClick={() => handleOpenPir(alert)}
                              aria-label={`Generate Post-Incident Review for ${alert.ruleName} on ${alert.serverHostname}`}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                            >
                              <FileText className="w-3 h-3 text-[#007A27] dark:text-[#3DCD58]" aria-hidden="true" />
                              PIR
                            </button>
                            {alert.state === 'active' && (
                              <button
                                type="button"
                                onClick={() => onAcknowledgeAlert(alert.id)}
                                aria-label={`Acknowledge ${alert.ruleName} on ${alert.serverHostname}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                              >
                                <Check className="w-3 h-3" aria-hidden="true" />
                                Acknowledge
                              </button>
                            )}
                            {isAlertOpen(alert) && onCreateTicketFromAlert && (
                              <button
                                type="button"
                                onClick={() => onCreateTicketFromAlert(alert)}
                                aria-label={`Create ticket for ${alert.ruleName} on ${alert.serverHostname}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-[#009530]/40 bg-[#009530]/10 text-[#007A27] dark:text-[#3DCD58] hover:bg-[#009530]/20 transition-colors cursor-pointer"
                              >
                                <Ticket className="w-3 h-3" aria-hidden="true" />
                                Ticket
                              </button>
                            )}
                            {isAlertOpen(alert) && onLaunchMopFromAlert && (
                              <button
                                type="button"
                                data-testid={`alert-launch-mop-${alert.id}`}
                                onClick={() => onLaunchMopFromAlert(alert)}
                                aria-label={`Launch MOP for ${alert.ruleName} on ${alert.serverHostname}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-amber-300 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/35 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/60 transition-colors cursor-pointer"
                              >
                                <Wrench className="w-3 h-3" aria-hidden="true" />
                                MOP
                              </button>
                            )}
                            {isAlertOpen(alert) && (
                              <button
                                type="button"
                                onClick={() => onBulkIgnore([alert.id])}
                                aria-label={`Ignore ${alert.ruleName} on ${alert.serverHostname}`}
                                className="px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 transition-colors cursor-pointer"
                              >
                                Ignore
                              </button>
                            )}
                            {alert.state === 'ignored' && (
                              <button
                                type="button"
                                onClick={() => onRestoreIgnoredAlert(alert.id)}
                                aria-label={`Restore ${alert.ruleName} on ${alert.serverHostname}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                                Restore
                              </button>
                            )}
                            {alert.state !== 'resolved' && (
                              <button
                                type="button"
                                onClick={() => onResolveAlert(alert.id)}
                                aria-label={`Clear ${alert.ruleName} on ${alert.serverHostname}`}
                                className="px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
                              >
                                Clear
                              </button>
                            )}
                            {alert.state === 'resolved' && (
                              <span className="text-xs text-slate-400 dark:text-slate-500">Closed</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 pl-5 pr-3">Timestamp</th>
                  <th className="py-3 px-3">Channel</th>
                  <th className="py-3 px-3">Target Endpoint</th>
                  <th className="py-3 px-3">Severity</th>
                  <th className="py-3 px-3">Notification Payload</th>
                  <th className="py-3 pl-3 pr-5 text-right">Delivery</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                {dispatchLogs.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 pl-5 pr-3 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {formatClockTime(entry.timestamp)}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                        {entry.channelName}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {entry.channelType}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono text-xs text-slate-600 dark:text-slate-400 max-w-[220px] truncate">
                      {entry.target}
                    </td>
                    <td className="py-3 px-3">
                      <SeverityLabel severity={entry.severity} />
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-700 dark:text-slate-300">
                      {entry.summary}
                    </td>
                    <td className="py-3 pl-3 pr-5 text-right text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                      {entry.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* Post-Incident Review (PIR) Modal */}
      {activePir && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pir-modal-title"
          data-testid="alert-pir-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60"
        >
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-[#007A27] dark:text-[#3DCD58]">
                    {activePir.incidentId}
                  </span>
                  <SeverityLabel severity={activePir.severity} />
                  <span className="text-xs text-slate-500 dark:text-slate-400">{activePir.stateLabel}</span>
                </div>
                <h2 id="pir-modal-title" className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                  Post-Incident Review — {activePir.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActivePir(null)}
                aria-label="Close Post-Incident Review"
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-md bg-slate-50 dark:bg-[#151A20] border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Site</div>
                  <div className="mt-0.5 text-sm font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {activePir.siteCode}
                  </div>
                </div>
                <div className="p-3 rounded-md bg-slate-50 dark:bg-[#151A20] border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Elapsed / MTTR</div>
                  <div className="mt-0.5 text-sm font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {activePir.mttrMinutes ?? 1} min
                  </div>
                </div>
                <div className="p-3 rounded-md bg-slate-50 dark:bg-[#151A20] border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Observed Telemetry</div>
                  <div className="mt-0.5 text-sm font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {activePir.telemetrySnapshot.observedValue} ({activePir.telemetrySnapshot.threshold})
                  </div>
                </div>
                <div className="p-3 rounded-md bg-slate-50 dark:bg-[#151A20] border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Campus Load / PUE</div>
                  <div className="mt-0.5 text-sm font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {activePir.telemetrySnapshot.facilityPowerMw} · {activePir.telemetrySnapshot.pue}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Root Cause Summary
                </h3>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-[#151A20] border border-slate-200 dark:border-slate-800 rounded-md p-3">
                  {activePir.rootCauseSummary}
                </p>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Incident Timeline
                </h3>
                <div className="space-y-1.5">
                  {activePir.timeline.map((step, idx) => (
                    <div
                      key={`${step.stage}-${idx}`}
                      className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 text-xs bg-slate-50 dark:bg-[#151A20] border border-slate-200/80 dark:border-slate-800 rounded-md px-3 py-2"
                    >
                      <span className="font-semibold text-slate-900 dark:text-slate-100 w-24 shrink-0">
                        {step.stage}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                        {step.timestampIso.slice(11, 19)}Z
                      </span>
                      <span className="text-slate-700 dark:text-slate-300">{step.detail}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Follow-Up Action Items
                </h3>
                <ol className="list-decimal list-inside space-y-1 text-xs text-slate-700 dark:text-slate-300">
                  {activePir.actionItems.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-[#151A20]">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Ready for ISO 27001 / Tier IV incident archive
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="pir-copy-md-btn"
                  onClick={handleCopyPirMarkdown}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  {pirCopied ? 'Copied!' : 'Copy Markdown'}
                </button>
                <button
                  type="button"
                  data-testid="pir-download-md-btn"
                  onClick={handleDownloadPirMarkdown}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  Download .md
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


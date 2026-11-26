import { FormEvent, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardList,
  Download,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import {
  AiPredictiveAuditResult,
  AiWorkOrderRunbook,
  AssetRiskCategory,
  buildSiteAiContext,
  computePredictiveMaintenance,
  createWorkOrderFromRisk,
  MaintenanceWorkOrder,
  PredictiveAssetRisk,
  WorkOrderStatus,
} from '../engine/predictiveMaintenance';
import { escapeCsvCell } from '../engine/reportEngine';
import { SITE_META_MAP, SiteId, SiteWorkspaceState } from '../engine/sites';
import { RackDefinition } from '../engine/types';

interface AiPredictiveViewProps {
  activeSiteId: SiteId;
  sitesMap: Record<SiteId, SiteWorkspaceState>;
  racks: RackDefinition[];
  workOrders: MaintenanceWorkOrder[];
  onAddWorkOrder: (wo: MaintenanceWorkOrder) => void;
  onUpdateWorkOrderStatus: (woId: string, status: WorkOrderStatus) => void;
}

type AiSubTab = 'predictive' | 'copilot' | 'schedule';
type CategoryFilter = 'all' | AssetRiskCategory;

interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

const CATEGORY_FILTERS: Array<{ id: CategoryFilter; label: string }> = [
  { id: 'all', label: 'All Assets' },
  { id: 'chiller', label: 'Chillers (2W+6A)' },
  { id: 'crac', label: 'CRAC (2N)' },
  { id: 'ups', label: 'UPS (2(N+1))' },
  { id: 'generator', label: 'Generators' },
  { id: 'sla_sensor', label: 'Cold Aisle SLA' },
  { id: 'server', label: 'Compute Hosts' },
];

function triggerWorkOrderCsvDownload(siteCode: string, workOrders: MaintenanceWorkOrder[]) {
  const headers = [
    'Work Order ID',
    'Site',
    'Asset ID',
    'Asset Name',
    'Subsystem',
    'Priority',
    'Status',
    'Predicted Failure Mode',
    'Recommended Action',
    'Target Window',
    'Tier IV Safety Note',
    'Source',
  ];
  const rows = workOrders.map((wo) => [
    wo.id,
    wo.siteId.toUpperCase(),
    wo.assetId,
    wo.assetName,
    wo.categoryLabel,
    wo.priority,
    wo.status,
    wo.predictedFailureMode,
    wo.recommendedAction,
    wo.estimatedWindow,
    wo.tier4SafetyNote,
    wo.source,
  ]);

  const csv =
    '\uFEFF' +
    [headers, ...rows].map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\r\n') +
    '\r\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `orise-dcim-${siteCode.toLowerCase()}-predictive-maintenance-schedule.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-slate-900 dark:text-slate-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={idx}
          className="px-1 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 font-mono text-[11px] text-slate-900 dark:text-slate-100"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function FormattedAiMessage({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="space-y-1.5">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) return <div key={idx} className="h-1" />;
        if (/^#{1,4}\s+/.test(line)) {
          const title = line.replace(/^#{1,4}\s+/, '');
          return (
            <div
              key={idx}
              className="pt-1 text-xs font-semibold text-slate-900 dark:text-slate-100"
            >
              {renderInlineMarkdown(title)}
            </div>
          );
        }
        if (line.startsWith('* ') || line.startsWith('- ')) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="mt-1.5 w-1 h-1 rounded-full bg-[#009530] dark:bg-[#3DCD58] shrink-0" />
              <span className="leading-relaxed">{renderInlineMarkdown(line.slice(2))}</span>
            </div>
          );
        }
        return (
          <p key={idx} className="leading-relaxed">
            {renderInlineMarkdown(line)}
          </p>
        );
      })}
    </div>
  );
}

export function AiPredictiveView({
  activeSiteId,
  sitesMap,
  racks,
  workOrders,
  onAddWorkOrder,
  onUpdateWorkOrderStatus,
}: AiPredictiveViewProps) {
  const site = sitesMap[activeSiteId];
  const siteMeta = SITE_META_MAP[activeSiteId];

  const [subTab, setSubTab] = useState<AiSubTab>('predictive');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [assetQuery, setAssetQuery] = useState('');

  // Gemini AI Predictive Audit state (keyed per site so switching KL1/KL2/KL3 preserves context)
  const [auditBySite, setAuditBySite] = useState<Partial<Record<SiteId, AiPredictiveAuditResult>>>({});
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  // Asset Runbook Drawer state
  const [selectedRiskForRunbook, setSelectedRiskForRunbook] = useState<PredictiveAssetRisk | null>(null);
  const [activeRunbook, setActiveRunbook] = useState<AiWorkOrderRunbook | null>(null);
  const [runbookLoading, setRunbookLoading] = useState(false);
  const [runbookError, setRunbookError] = useState<string | null>(null);

  // AI Operations Copilot state
  const [copilotMessages, setCopilotMessages] = useState<CopilotMessage[]>([]);
  const [copilotInput, setCopilotInput] = useState('');
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotError, setCopilotError] = useState<string | null>(null);

  // Recently scheduled feedback
  const [scheduledToast, setScheduledToast] = useState<string | null>(null);

  const { risks, summary } = useMemo(
    () => computePredictiveMaintenance(site, racks, activeSiteId),
    [site, racks, activeSiteId]
  );

  const siteWorkOrders = useMemo(
    () => workOrders.filter((w) => w.siteId === activeSiteId),
    [workOrders, activeSiteId]
  );

  const scheduledAssetIds = useMemo(
    () => new Set(siteWorkOrders.filter((w) => w.status !== 'Completed').map((w) => w.assetId)),
    [siteWorkOrders]
  );

  const filteredRisks = useMemo(() => {
    const q = assetQuery.trim().toLowerCase();
    return risks.filter((r) => {
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        r.assetId.toLowerCase().includes(q) ||
        r.assetName.toLowerCase().includes(q) ||
        r.location.toLowerCase().includes(q) ||
        r.predictedFailureMode.toLowerCase().includes(q) ||
        r.anomalySignals.some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [risks, categoryFilter, assetQuery]);

  const currentAudit = auditBySite[activeSiteId] ?? null;

  const notifyScheduled = (label: string) => {
    setScheduledToast(label);
    window.setTimeout(() => setScheduledToast((cur) => (cur === label ? null : cur)), 3200);
  };

  const handleScheduleFromRisk = (risk: PredictiveAssetRisk) => {
    const wo = createWorkOrderFromRisk(risk, activeSiteId, Date.now());
    onAddWorkOrder(wo);
    notifyScheduled(`${wo.id} scheduled for ${risk.assetId}`);
  };

  const handleScheduleFromAuditWo = (
    item: AiPredictiveAuditResult['recommendedWorkOrders'][number]
  ) => {
    const wo: MaintenanceWorkOrder = {
      id: `WO-${siteMeta.code}-AI${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
      siteId: activeSiteId,
      assetId: item.assetId,
      assetName: item.assetName,
      categoryLabel: 'AI Audit Action',
      priority:
        item.priority === 'P1 - Urgent' || item.priority === 'P2 - High'
          ? item.priority
          : 'P3 - Preventive',
      predictedFailureMode: item.predictedFailureMode,
      recommendedAction: item.recommendedAction,
      estimatedWindow: item.estimatedWindow,
      tier4SafetyNote: item.tier4SafetyNote,
      status: 'Scheduled',
      source: 'Gemini AI Audit',
      createdAt: Date.now(),
    };
    onAddWorkOrder(wo);
    notifyScheduled(`${wo.id} scheduled from AI Diagnostic Audit`);
  };

  const handleRunPredictiveAudit = async () => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const siteContext = buildSiteAiContext({ siteId: activeSiteId, sitesMap, racks });
      const res = await fetch('/api/ai/predictive-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteContext }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `AI audit request failed (${res.status})`);
      }
      setAuditBySite((prev) => ({ ...prev, [activeSiteId]: data as AiPredictiveAuditResult }));
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'Unable to complete AI predictive audit.');
    } finally {
      setAuditLoading(false);
    }
  };

  const handleGenerateRunbook = async (risk: PredictiveAssetRisk) => {
    setSelectedRiskForRunbook(risk);
    setActiveRunbook(null);
    setRunbookError(null);
    setRunbookLoading(true);
    try {
      const siteContext = buildSiteAiContext({ siteId: activeSiteId, sitesMap, racks });
      const res = await fetch('/api/ai/work-order-runbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetRisk: risk, siteContext }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Runbook request failed (${res.status})`);
      }
      setActiveRunbook(data as AiWorkOrderRunbook);
    } catch (err) {
      setRunbookError(err instanceof Error ? err.message : 'Unable to generate maintenance runbook.');
    } finally {
      setRunbookLoading(false);
    }
  };

  const sendCopilotPrompt = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || copilotLoading) return;

    const userMsg: CopilotMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    const nextHistory = [...copilotMessages, userMsg];
    setCopilotMessages(nextHistory);
    setCopilotInput('');
    setCopilotError(null);
    setCopilotLoading(true);

    try {
      const siteContext = buildSiteAiContext({ siteId: activeSiteId, sitesMap, racks });
      const res = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: copilotMessages.map((m) => ({ role: m.role, content: m.content })),
          siteContext,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `AI Copilot failed (${res.status})`);
      }
      const aiMsg: CopilotMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.reply,
        timestamp: data.generatedAt ?? Date.now(),
      };
      setCopilotMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      setCopilotError(err instanceof Error ? err.message : 'Unable to reach AI Copilot.');
    } finally {
      setCopilotLoading(false);
    }
  };

  const handleCopilotSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendCopilotPrompt(copilotInput);
  };

  const copilotPrompts = [
    `Which equipment at ${siteMeta.code} is closest to failure right now and what is the zero-downtime service order?`,
    `Analyze Hall B AI & GPU thermal load at ${siteMeta.code} and how it impacts CRAC boost and chiller plant COP.`,
    `Review ${siteMeta.code}'s 2-year IT load and PUE trajectory and recommend next-quarter capacity actions.`,
    `Audit Cold Aisle ASHRAE A1 SLA margins across all 4 halls and 160 row probes at ${siteMeta.code}.`,
  ];

  const severityTextClass = (sev: PredictiveAssetRisk['severity']) => {
    if (sev === 'critical') return 'text-red-700 dark:text-red-400 font-semibold';
    if (sev === 'high') return 'text-amber-700 dark:text-amber-400 font-semibold';
    if (sev === 'moderate') return 'text-sky-700 dark:text-sky-400 font-medium';
    return 'text-[#009530] dark:text-[#3DCD58] font-medium';
  };

  const barBgClass = (sev: PredictiveAssetRisk['severity']) => {
    if (sev === 'critical') return 'bg-red-600 dark:bg-red-500';
    if (sev === 'high') return 'bg-amber-500';
    if (sev === 'moderate') return 'bg-sky-500';
    return 'bg-[#009530] dark:bg-[#3DCD58]';
  };

  const openWoCount = siteWorkOrders.filter((w) => w.status !== 'Completed').length;

  return (
    <div className="space-y-5">
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            AI Predictive Maintenance & Operations
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {siteMeta.label} · Continuous RUL anomaly scoring, Tier IV zero-downtime runbooks, and grounded AI diagnostics
          </p>
        </div>

        {/* Sub-view Switcher */}
        <div
          className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-[#13171B] p-0.5 self-start lg:self-auto"
          role="tablist"
          aria-label="AI predictive workspace views"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'predictive'}
            onClick={() => setSubTab('predictive')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'predictive'
                ? 'bg-white dark:bg-[#232A32] text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <BrainCircuit className="w-3.5 h-3.5" aria-hidden="true" />
            Predictive Maintenance
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'copilot'}
            onClick={() => setSubTab('copilot')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'copilot'
                ? 'bg-white dark:bg-[#232A32] text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
            AI Operations Copilot
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'schedule'}
            onClick={() => setSubTab('schedule')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'schedule'
                ? 'bg-white dark:bg-[#232A32] text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
            Work Orders ({openWoCount})
          </button>
        </div>
      </div>

      {/* Inline Scheduling Feedback */}
      {scheduledToast && (
        <div
          role="status"
          className="px-4 py-2.5 rounded-md bg-[#009530]/[0.07] dark:bg-[#3DCD58]/[0.1] border border-[#009530]/25 dark:border-[#3DCD58]/25 flex items-center justify-between gap-2 text-xs text-slate-800 dark:text-slate-100"
        >
          <div className="flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
            <span className="font-mono">{scheduledToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setSubTab('schedule')}
            className="text-xs font-medium text-[#009530] dark:text-[#3DCD58] hover:underline cursor-pointer"
          >
            View Schedule
          </button>
        </div>
      )}

      {/* 4-Column Predictive Maintenance KPI Strip */}
      <section
        aria-label="Predictive maintenance summary"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800"
      >
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Fleet Predictive Health</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
              {summary.fleetHealthScore}
            </span>
            <span className="font-mono text-xs text-slate-400">/ 100</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs font-mono tabular-nums">
            <span className={summary.criticalCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-500'}>
              {summary.criticalCount} Crit
            </span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className={summary.highCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}>
              {summary.highCount} High
            </span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="text-slate-500 dark:text-slate-400">{summary.moderateCount} Watch</span>
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Nearest Predicted Failure (RUL)</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`font-mono text-xl font-semibold tabular-nums ${
                summary.nearestRulDays <= 10
                  ? 'text-red-700 dark:text-red-400'
                  : summary.nearestRulDays <= 30
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-[#009530] dark:text-[#3DCD58]'
              }`}
            >
              {summary.nearestRulDays}d
            </span>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400 truncate">
              {summary.nearestAssetName}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Across {summary.totalMonitoredAssets} tracked MEP & compute assets
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Tier IV Service Readiness</div>
          <div className="mt-1 flex items-center gap-1.5">
            <ShieldCheck
              className={`w-4 h-4 ${
                summary.tier4SafeWindowsReady
                  ? 'text-[#009530] dark:text-[#3DCD58]'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
              aria-hidden="true"
            />
            <span
              className={`text-base font-semibold ${
                summary.tier4SafeWindowsReady
                  ? 'text-[#009530] dark:text-[#3DCD58]'
                  : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {summary.tier4SafeWindowsReady ? 'Zero-SPOF Safe' : 'Failover Active'}
            </span>
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            2N & 2(N+1) isolation · {openWoCount} open work order{openWoCount === 1 ? '' : 's'}
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Projected Preventive Gain</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-xl font-semibold tabular-nums text-[#009530] dark:text-[#3DCD58]">
              -{summary.projectedPueReduction.toFixed(3)} PUE
            </span>
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            ~{summary.projectedAnnualMwhSaved.toLocaleString()} MWh/yr est. savings
          </div>
        </div>
      </section>

      {subTab === 'predictive' && (
        <div className="space-y-5">
          {/* Live AI Diagnostic Audit Panel */}
          <section
            aria-label="AI predictive diagnostic audit"
            className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden"
          >
            <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-[#009530] dark:text-[#3DCD58] mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    AI Diagnostic Audit & Cross-System Correlation
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Synthesizes live {siteMeta.code} chiller COPs, 2N CRAC boost load, Cold Aisle SLA sensors, server exhaust thermal drift, and 2-year trends
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRunPredictiveAudit}
                disabled={auditLoading}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] disabled:opacity-60 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {auditLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                {auditLoading
                  ? 'Analyzing Telemetry...'
                  : currentAudit
                  ? 'Re-Run AI Predictive Audit'
                  : 'Run AI Predictive Audit'}
              </button>
            </div>

            {auditError && (
              <div
                role="alert"
                className="px-4 py-3 bg-red-50/80 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900/50 flex items-start gap-2.5 text-xs text-red-800 dark:text-red-300"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{auditError}</span>
              </div>
            )}

            {currentAudit ? (
              <div className="p-4 sm:p-5 space-y-5">
                {/* Executive Brief + PUE Optimization */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2 space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        Executive Reliability Brief
                      </span>
                      <span className="text-slate-300 dark:text-slate-700">·</span>
                      <span
                        className={`font-mono font-semibold ${
                          currentAudit.riskPosture === 'Critical'
                            ? 'text-red-700 dark:text-red-400'
                            : currentAudit.riskPosture === 'Elevated'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-[#009530] dark:text-[#3DCD58]'
                        }`}
                      >
                        Posture: {currentAudit.riskPosture}
                      </span>
                      <span className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="font-mono text-slate-500 dark:text-slate-400">
                        {new Date(currentAudit.generatedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                      {currentAudit.executiveBrief}
                    </p>

                    {/* Root-Cause Correlations */}
                    {currentAudit.rootCauseCorrelations.length > 0 && (
                      <div className="pt-2 space-y-2">
                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          Cross-System Root-Cause Correlations
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-md">
                          {currentAudit.rootCauseCorrelations.map((corr, idx) => (
                            <div key={idx} className="p-3 space-y-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                                  {corr.title}
                                </span>
                                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                  {corr.affectedAssets.join(' · ')}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                {corr.explanation}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* PUE Optimization Card */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-md p-3.5 bg-slate-50/60 dark:bg-[#15191E] space-y-2.5">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      PUE & Cooling Optimization
                    </div>
                    <div className="font-mono text-sm font-semibold text-[#009530] dark:text-[#3DCD58]">
                      {currentAudit.pueOptimization.estimatedPueGain}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {currentAudit.pueOptimization.summary}
                    </p>
                    <ul className="space-y-1.5 pt-1 text-xs text-slate-700 dark:text-slate-300">
                      {currentAudit.pueOptimization.actions.map((act, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <CheckCircle2
                            className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58] shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                          <span>{act}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* AI Recommended Preventive Work Orders */}
                {currentAudit.recommendedWorkOrders.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      AI-Prioritized Preventive Actions
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {currentAudit.recommendedWorkOrders.map((wo, idx) => {
                        const alreadyScheduled = scheduledAssetIds.has(wo.assetId);
                        return (
                          <div
                            key={`${wo.assetId}-${idx}`}
                            className="border border-slate-200 dark:border-slate-800 rounded-md p-3.5 flex flex-col justify-between gap-2.5"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                                  {wo.assetId} · {wo.assetName}
                                </span>
                                <span
                                  className={`font-mono text-[11px] font-semibold shrink-0 ${
                                    wo.priority === 'P1 - Urgent'
                                      ? 'text-red-700 dark:text-red-400'
                                      : wo.priority === 'P2 - High'
                                      ? 'text-amber-700 dark:text-amber-400'
                                      : 'text-[#009530] dark:text-[#3DCD58]'
                                  }`}
                                >
                                  {wo.priority}
                                </span>
                              </div>
                              <div className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                                {wo.predictedFailureMode}
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                {wo.recommendedAction}
                              </p>
                            </div>
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 text-[11px]">
                              <span className="font-mono text-slate-500 dark:text-slate-400 truncate">
                                {wo.estimatedWindow} · {wo.expectedImpact}
                              </span>
                              <button
                                type="button"
                                disabled={alreadyScheduled}
                                onClick={() => handleScheduleFromAuditWo(wo)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 shrink-0 cursor-pointer disabled:cursor-default"
                              >
                                <Plus className="w-3 h-3" aria-hidden="true" />
                                {alreadyScheduled ? 'Scheduled' : 'Schedule WO'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="px-4 py-5 text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/50 dark:bg-[#15191E]">
                <span>
                  Click <strong className="text-slate-800 dark:text-slate-200">Run AI Predictive Audit</strong> to correlate live {siteMeta.code} chiller, CRAC, Cold Aisle SLA, and compute telemetry into an AI reliability brief and prioritized preventive schedule.
                </span>
                <span className="font-mono tabular-nums text-[11px] text-slate-400 whitespace-nowrap">
                  2W+6A Chillers · 8 CRACs · 160 SLA Probes · 24 Hosts
                </span>
              </div>
            )}
          </section>

          {/* Real-Time Asset Failure Risk & RUL Matrix */}
          <section
            aria-label="Predictive asset failure risk matrix"
            className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Real-Time Asset Failure Risk & Remaining Useful Life (RUL)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Continuous predictive scoring across {siteMeta.code} mechanical, electrical, SLA sensor, and server assets
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative w-52">
                  <Search
                    className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <label htmlFor="pm-asset-search" className="sr-only">
                    Filter predictive assets
                  </label>
                  <input
                    id="pm-asset-search"
                    type="search"
                    value={assetQuery}
                    onChange={(e) => setAssetQuery(e.target.value)}
                    placeholder="Filter asset, mode, hall..."
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
                  />
                </div>
              </div>
            </div>

            {/* Subsystem Filter Strip */}
            <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#15191E] flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by subsystem">
                {CATEGORY_FILTERS.map((f) => {
                  const active = categoryFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setCategoryFilter(f.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-sm transition-colors cursor-pointer ${
                        active
                          ? 'bg-white dark:bg-[#232A32] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {filteredRisks.length} asset{filteredRisks.length === 1 ? '' : 's'}
              </span>
            </div>

            {/* Matrix Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-[#15191E] border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                    <th scope="col" className="px-3.5 py-2.5 font-semibold whitespace-nowrap">Asset & Location</th>
                    <th scope="col" className="px-3.5 py-2.5 font-semibold whitespace-nowrap">Subsystem</th>
                    <th scope="col" className="px-3.5 py-2.5 font-semibold whitespace-nowrap">Failure Risk</th>
                    <th scope="col" className="px-3.5 py-2.5 font-semibold text-right whitespace-nowrap">Est. RUL</th>
                    <th scope="col" className="px-3.5 py-2.5 font-semibold">Predicted Failure Mode & Live Signals</th>
                    <th scope="col" className="px-3.5 py-2.5 font-semibold text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredRisks.map((risk) => {
                    const isScheduled = scheduledAssetIds.has(risk.assetId);
                    return (
                      <tr
                        key={risk.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                            {risk.assetId}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {risk.location} · {risk.redundancyTopology}
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-700 dark:text-slate-300">
                          {risk.categoryLabel}
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-2 font-mono tabular-nums">
                            <span className={`w-8 text-right ${severityTextClass(risk.severity)}`}>
                              {risk.failureRiskPct}%
                            </span>
                            <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${barBgClass(risk.severity)}`}
                                style={{ width: `${risk.failureRiskPct}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 text-right whitespace-nowrap font-mono tabular-nums">
                          <div className={severityTextClass(risk.severity)}>{risk.estimatedRulDays}d</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {risk.predictedFailureWindow}
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 min-w-[260px]">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {risk.predictedFailureMode}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                            {risk.anomalySignals.join(' · ')}
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleGenerateRunbook(risk)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Wrench className="w-3 h-3" aria-hidden="true" />
                              AI Runbook
                            </button>
                            <button
                              type="button"
                              disabled={isScheduled}
                              onClick={() => handleScheduleFromRisk(risk)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-[#009530] hover:bg-[#007A27] disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white transition-colors cursor-pointer disabled:cursor-default"
                            >
                              {isScheduled ? 'Scheduled' : 'Schedule'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {subTab === 'copilot' && (
        <section
          aria-label="Orise AI Operations Copilot"
          className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden flex flex-col"
        >
          {/* Copilot Header */}
          <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Orise AI Operations Copilot
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Grounded in live {siteMeta.code} telemetry · 24 servers · 2 Water + 6 Air Chillers · 8 CRACs · 160 Cold Aisle SLA probes · 24M trends
              </p>
            </div>
            {copilotMessages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setCopilotMessages([]);
                  setCopilotError(null);
                }}
                className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer self-start sm:self-auto"
              >
                Clear Conversation
              </button>
            )}
          </div>

          {/* Conversation Body */}
          <div className="p-4 sm:p-5 min-h-[380px] max-h-[520px] overflow-y-auto space-y-4">
            {copilotMessages.length === 0 ? (
              <div className="space-y-4 py-4">
                <div className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
                  Ask operational, reliability, cooling optimization, Tier IV failover, or multi-year capacity questions. Every answer is generated directly against <strong className="text-slate-900 dark:text-slate-100">{siteMeta.label}</strong>&apos;s live telemetry snapshot.
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {copilotPrompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => void sendCopilotPrompt(prompt)}
                      className="text-left p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#15191E] hover:border-[#009530] dark:hover:border-[#3DCD58] transition-colors text-xs text-slate-700 dark:text-slate-200 leading-relaxed cursor-pointer"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              copilotMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col gap-1 ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div className="text-[11px] font-mono text-slate-400">
                    {msg.role === 'user' ? 'Operator' : 'Orise AI Copilot'} ·{' '}
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                  <div
                    className={`max-w-3xl rounded-md px-3.5 py-2.5 text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-[#009530] text-white whitespace-pre-wrap'
                        : 'bg-slate-50 dark:bg-[#15191E] border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <FormattedAiMessage content={msg.content} />
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))
            )}

            {copilotLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#009530]" aria-hidden="true" />
                <span>Evaluating live {siteMeta.code} telemetry and predictive scores...</span>
              </div>
            )}

            {copilotError && (
              <div
                role="alert"
                className="p-3 rounded-md bg-red-50/80 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs text-red-800 dark:text-red-300 flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{copilotError}</span>
              </div>
            )}
          </div>

          {/* Prompt Input Bar */}
          <form
            onSubmit={handleCopilotSubmit}
            className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#15191E] flex items-center gap-2.5"
          >
            <label htmlFor="ai-copilot-input" className="sr-only">
              Ask Orise AI Copilot
            </label>
            <input
              id="ai-copilot-input"
              type="text"
              value={copilotInput}
              onChange={(e) => setCopilotInput(e.target.value)}
              disabled={copilotLoading}
              placeholder={`Ask about ${siteMeta.code} predictive risks, chiller COP, Tier IV failover, or 2-year trends...`}
              className="flex-1 px-3 py-2 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
            />
            <button
              type="submit"
              disabled={copilotLoading || !copilotInput.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] disabled:opacity-50 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              Send
            </button>
          </form>
        </section>
      )}

      {subTab === 'schedule' && (
        <section
          aria-label="Preventive maintenance work orders"
          className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden"
        >
          <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <ClipboardList className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Preventive Maintenance Schedule — {siteMeta.code}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tier IV zero-downtime service queue sourced from predictive RUL alerts and AI diagnostic audits
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => triggerWorkOrderCsvDownload(siteMeta.code, siteWorkOrders)}
              disabled={siteWorkOrders.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] disabled:opacity-50 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Export Schedule CSV
            </button>
          </div>

          {siteWorkOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-[#15191E] border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                    <th scope="col" className="px-4 py-2.5 font-semibold whitespace-nowrap">WO ID</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold whitespace-nowrap">Asset</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold whitespace-nowrap">Priority</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Failure Mode & Action</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold whitespace-nowrap">Window</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {siteWorkOrders.map((wo) => (
                    <tr
                      key={wo.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-2.5 font-mono font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        <div>{wo.id}</div>
                        <div className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                          {wo.source}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="font-mono font-medium text-slate-900 dark:text-slate-100">
                          {wo.assetId}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {wo.categoryLabel}
                        </div>
                      </td>
                      <td
                        className={`px-4 py-2.5 font-mono font-semibold whitespace-nowrap ${
                          wo.priority === 'P1 - Urgent'
                            ? 'text-red-700 dark:text-red-400'
                            : wo.priority === 'P2 - High'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-[#009530] dark:text-[#3DCD58]'
                        }`}
                      >
                        {wo.priority}
                      </td>
                      <td className="px-4 py-2.5 min-w-[280px]">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {wo.predictedFailureMode}
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                          {wo.recommendedAction}
                        </div>
                        <div className="text-[11px] text-[#009530] dark:text-[#3DCD58] mt-0.5">
                          {wo.tier4SafetyNote}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {wo.estimatedWindow}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <select
                          aria-label={`Status for ${wo.id}`}
                          value={wo.status}
                          onChange={(e) =>
                            onUpdateWorkOrderStatus(wo.id, e.target.value as WorkOrderStatus)
                          }
                          className="px-2.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#009530]/30"
                        >
                          <option value="Scheduled">Scheduled</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Completed">Completed</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400">
              No work orders scheduled for {siteMeta.code}. Schedule preventive tasks from the Predictive Maintenance matrix or AI Diagnostic Audit.
            </div>
          )}
        </section>
      )}

      {/* Tier IV Zero-Downtime AI Runbook Slide-Over Drawer */}
      {selectedRiskForRunbook && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/45 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="Tier IV AI Maintenance Runbook"
        >
          <div className="w-full max-w-xl bg-white dark:bg-[#1B2026] h-full border-l border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-[11px] uppercase tracking-wider text-[#009530] dark:text-[#3DCD58]">
                  AI Tier IV Method of Procedure (MOP)
                </div>
                <h3 className="mt-0.5 text-base font-semibold text-slate-900 dark:text-slate-100">
                  {selectedRiskForRunbook.assetId} · {selectedRiskForRunbook.categoryLabel}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedRiskForRunbook.location} · Risk {selectedRiskForRunbook.failureRiskPct}% · Est. RUL{' '}
                  {selectedRiskForRunbook.estimatedRulDays}d
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRiskForRunbook(null)}
                aria-label="Close runbook drawer"
                className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {runbookLoading && (
                <div className="py-12 flex flex-col items-center justify-center gap-2.5 text-slate-500 dark:text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin text-[#009530]" />
                  <span>Drafting zero-downtime Tier IV maintenance procedure...</span>
                </div>
              )}

              {runbookError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-md bg-red-50/80 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-300 flex items-start gap-2"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{runbookError}</span>
                </div>
              )}

              {activeRunbook && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-md bg-slate-50 dark:bg-[#15191E] border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {activeRunbook.title}
                    </div>
                    <div className="font-mono text-[11px] text-[#009530] dark:text-[#3DCD58]">
                      Est. Duration: {activeRunbook.estimatedDuration}
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      {activeRunbook.tier4IsolationStrategy}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
                      Required Tools & Spares
                    </h4>
                    <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-300">
                      {activeRunbook.requiredTools.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
                      1. Pre-Service Checks
                    </h4>
                    <ol className="list-decimal pl-4 space-y-1 text-slate-600 dark:text-slate-300">
                      {activeRunbook.preChecks.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  </div>

                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
                      2. Service Procedure
                    </h4>
                    <ol className="list-decimal pl-4 space-y-1 text-slate-600 dark:text-slate-300">
                      {activeRunbook.serviceProcedure.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  </div>

                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
                      3. Post-Service Verification
                    </h4>
                    <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-300">
                      {activeRunbook.verificationChecks.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-red-700 dark:text-red-400 mb-1.5">
                      Rollback & Abort Criteria
                    </h4>
                    <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-300">
                      {activeRunbook.rollbackCriteria.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-[#15191E]">
              <button
                type="button"
                onClick={() => setSelectedRiskForRunbook(null)}
                className="px-3 py-1.5 text-xs font-medium rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                disabled={scheduledAssetIds.has(selectedRiskForRunbook.assetId)}
                onClick={() => handleScheduleFromRisk(selectedRiskForRunbook)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded bg-[#009530] hover:bg-[#007A27] disabled:opacity-50 text-white cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                {scheduledAssetIds.has(selectedRiskForRunbook.assetId)
                  ? 'Already Scheduled'
                  : 'Schedule Work Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

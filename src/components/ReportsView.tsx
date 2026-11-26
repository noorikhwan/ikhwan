import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  Filter,
  History,
  Printer,
  Search,
  ShieldCheck,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import {
  buildHistoricalTrendSeries,
  computeHistoricalTrendSummary,
  formatSignedDelta,
  formatTrendValue,
  HISTORY_HORIZON_MAP,
  HISTORY_HORIZONS,
  HistoryHorizonId,
  TrendMetricId,
} from '../engine/historicalTrends';
import {
  formatByteSize,
  formatIsoTimestamp,
  generateDcimReport,
  GeneratedReport,
  getHallScopeLabel,
  getSiteScopeLabel,
  REPORT_TEMPLATE_MAP,
  REPORT_TEMPLATES,
  ReportHallScope,
  ReportRecordFilter,
  ReportSiteScope,
  ReportTypeId,
} from '../engine/reportEngine';
import { MaintenanceWindow } from '../engine/alertIntelligenceEngine';
import { ImmutableAuditEntry } from '../engine/enterpriseOpsEngine';
import { ShiftHandoverEntry } from '../engine/shiftEngine';
import { SITES, SiteId, SiteWorkspaceState } from '../engine/sites';
import { RackDefinition } from '../engine/types';
import { VisitorRecord } from '../engine/visitorEngine';
import { CompliancePackPanel } from './CompliancePackPanel';
import { EquipmentPointExtractorPanel } from './EquipmentPointExtractorPanel';
import { ExecutiveHandoverReportPanel } from './ExecutiveHandoverReportPanel';
import { HistoricalTrendChart } from './HistoricalTrendChart';
import { ReportTrendPanel } from './ReportTrendPanel';

interface ReportsViewProps {
  activeSiteId: SiteId;
  sitesMap: Record<SiteId, SiteWorkspaceState>;
  racks: RackDefinition[];
  reportHistory: GeneratedReport[];
  activeReportId: string | null;
  onReportGenerated: (report: GeneratedReport) => void;
  onSelectReport: (reportId: string) => void;
  onDeleteReport: (reportId: string) => void;
  operatorName?: string;
  shiftTeam?: string;
  shiftSlot?: string;
  auditTrail?: ImmutableAuditEntry[];
  handoverLog?: ShiftHandoverEntry[];
  visitors?: VisitorRecord[];
  maintenanceWindows?: MaintenanceWindow[];
  cloudSynced?: boolean;
  cloudSyncedHandoversCount?: number;
  onSyncExecutiveHandover?: (notes: string) => void;
  onLogAudit?: (category: ImmutableAuditEntry['category'], action: string, target: string) => void;
}

type ReportsSubTab = 'trends' | 'points' | 'builder' | 'handover' | 'compliance';

const PAGE_SIZE = 20;

function triggerCsvDownload(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ReportsView({
  activeSiteId,
  sitesMap,
  racks,
  reportHistory,
  activeReportId,
  onReportGenerated,
  onSelectReport,
  onDeleteReport,
  operatorName = 'Shift Lead',
  shiftTeam = 'Team A',
  shiftSlot = 'Day Watch',
  auditTrail = [],
  handoverLog = [],
  visitors = [],
  maintenanceWindows = [],
  cloudSynced = false,
  cloudSyncedHandoversCount = 0,
  onSyncExecutiveHandover,
  onLogAudit,
}: ReportsViewProps) {
  const [subTab, setSubTab] = useState<ReportsSubTab>('trends');

  // History & Multi-Year Trends state (defaults to 2Y = 24 months, well past 1 year)
  const [trendHorizon, setTrendHorizon] = useState<HistoryHorizonId>('2y');
  const [trendSiteScope, setTrendSiteScope] = useState<ReportSiteScope>(activeSiteId);
  const [trendHallScope, setTrendHallScope] = useState<ReportHallScope>('all');
  const [trendMetric, setTrendMetric] = useState<TrendMetricId>('itLoadMw');
  const [ledgerSearch, setLedgerSearch] = useState('');

  // Report Builder & CSV state
  const [selectedType, setSelectedType] = useState<ReportTypeId>('historical_trends');
  const [siteScope, setSiteScope] = useState<ReportSiteScope>(activeSiteId);
  const [hallScope, setHallScope] = useState<ReportHallScope>('all');
  const [recordFilter, setRecordFilter] = useState<ReportRecordFilter>('all');
  const [builderHorizon, setBuilderHorizon] = useState<HistoryHorizonId>('2y');
  const [customTitle, setCustomTitle] = useState('');
  const [includeBom, setIncludeBom] = useState(true);
  const [includeMetadataComments, setIncludeMetadataComments] = useState(false);

  const [previewSearch, setPreviewSearch] = useState('');
  const [reportPreviewMode, setReportPreviewMode] = useState<'both' | 'trend' | 'table'>('both');
  const [page, setPage] = useState(1);
  const [exportNotice, setExportNotice] = useState<{ filename: string; rows: number } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeTemplate = REPORT_TEMPLATE_MAP[selectedType];

  const activeReport = useMemo(() => {
    if (reportHistory.length === 0) return null;
    return reportHistory.find((r) => r.id === activeReportId) ?? reportHistory[0];
  }, [reportHistory, activeReportId]);

  useEffect(() => {
    setPage(1);
    setPreviewSearch('');
  }, [activeReport?.id]);

  // Keep trend & builder default site aligned when user switches site from left nav (unless they chose 'all')
  useEffect(() => {
    setTrendSiteScope((prev) => (prev === 'all' ? 'all' : activeSiteId));
    setSiteScope((prev) => (prev === 'all' ? 'all' : activeSiteId));
  }, [activeSiteId]);

  // Multi-year trend series (deterministic & anchored to live site/hall state)
  const trendPoints = useMemo(
    () =>
      buildHistoricalTrendSeries({
        sitesMap,
        racks,
        siteScope: trendSiteScope,
        hallScope: trendHallScope,
        horizon: trendHorizon,
      }),
    [sitesMap, racks, trendSiteScope, trendHallScope, trendHorizon]
  );

  const trendSummary = useMemo(
    () => computeHistoricalTrendSummary(trendPoints, trendMetric),
    [trendPoints, trendMetric]
  );

  // Reverse chronological monthly ledger for table readability (newest month at top)
  const filteredLedgerPoints = useMemo(() => {
    const newestFirst = [...trendPoints].reverse();
    const q = ledgerSearch.trim().toLowerCase();
    if (!q) return newestFirst;
    return newestFirst.filter(
      (pt) => pt.label.toLowerCase().includes(q) || pt.monthKey.includes(q) || String(pt.year).includes(q)
    );
  }, [trendPoints, ledgerSearch]);

  const trendScopeCaption = `${getSiteScopeLabel(trendSiteScope)} · ${getHallScopeLabel(trendHallScope)}`;

  const handleExportTrendCsv = () => {
    const horizonMeta = HISTORY_HORIZON_MAP[trendHorizon];
    const generated = generateDcimReport({
      config: {
        typeId: 'historical_trends',
        siteScope: trendSiteScope,
        hallScope: trendHallScope,
        recordFilter: 'all',
        historyHorizon: trendHorizon,
        customTitle: `${horizonMeta.label} Historical Trend Ledger — ${
          trendSiteScope === 'all' ? 'All Sites' : trendSiteScope.toUpperCase()
        }`,
        includeBom: true,
      },
      sitesMap,
      racks,
      now: Date.now(),
    });
    onReportGenerated(generated);
    triggerCsvDownload(generated.filename, generated.csvContent);
    setExportNotice({ filename: generated.filename, rows: generated.rows.length });
  };

  const handleGenerate = () => {
    const generated = generateDcimReport({
      config: {
        typeId: selectedType,
        siteScope,
        hallScope,
        recordFilter,
        historyHorizon: selectedType === 'historical_trends' ? builderHorizon : undefined,
        customTitle: customTitle.trim() || undefined,
        includeBom,
        includeMetadataComments,
      },
      sitesMap,
      racks,
      now: Date.now(),
    });
    onReportGenerated(generated);
    setExportNotice(null);
  };

  const handleExportCsv = (report: GeneratedReport) => {
    triggerCsvDownload(report.filename, report.csvContent);
    setExportNotice({ filename: report.filename, rows: report.rows.length });
  };

  const handleCopyCsv = async (report: GeneratedReport) => {
    try {
      await navigator.clipboard.writeText(report.csvContent);
      setCopiedId(report.id);
      window.setTimeout(() => setCopiedId((cur) => (cur === report.id ? null : cur)), 2500);
    } catch {
      handleExportCsv(report);
    }
  };

  const filteredRows = useMemo(() => {
    if (!activeReport) return [];
    const q = previewSearch.trim().toLowerCase();
    if (!q) return activeReport.rows;
    return activeReport.rows.filter((row) =>
      Object.values(row).some((val) => val !== null && val !== undefined && String(val).toLowerCase().includes(q))
    );
  }, [activeReport, previewSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, safePage]);

  const metricToneClass = (tone?: 'neutral' | 'positive' | 'warning' | 'critical') => {
    if (tone === 'positive') return 'text-[#009530] dark:text-[#3DCD58]';
    if (tone === 'warning') return 'text-amber-700 dark:text-amber-400';
    if (tone === 'critical') return 'text-red-700 dark:text-red-400';
    return 'text-slate-900 dark:text-slate-50';
  };

  const deltaIsGood = trendSummary.metric.lowerIsBetter
    ? trendSummary.delta <= 0
    : trendSummary.metric.id === 'slaCompliancePct'
    ? trendSummary.delta >= 0
    : true;

  return (
    <div className="space-y-5 pb-16">
      {/* Header Row with Segmented Sub-Tab Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Reports, Multi-Year History & CSV Export
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Analyze 6-month to 3-year capacity, PUE, chiller plant, and Cold Aisle SLA trends or generate RFC 4180 CSV audits across KL1–KL3
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Sub-view Switcher */}
          <div
            className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-[#13171B] p-0.5"
            role="tablist"
            aria-label="Reports workspace views"
          >
            <button
              type="button"
              role="tab"
              data-testid="reports-tab-trends"
              aria-selected={subTab === 'trends'}
              onClick={() => setSubTab('trends')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm transition-colors cursor-pointer whitespace-nowrap ${
                subTab === 'trends'
                  ? 'bg-white dark:bg-[#232A32] text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
              History &amp; Trends (1Y–3Y)
            </button>
            <button
              type="button"
              role="tab"
              data-testid="reports-tab-points"
              aria-selected={subTab === 'points'}
              onClick={() => setSubTab('points')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm transition-colors cursor-pointer whitespace-nowrap ${
                subTab === 'points'
                  ? 'bg-white dark:bg-[#232A32] text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Database className="w-3.5 h-3.5" aria-hidden="true" />
              Equipment Point Data
            </button>
            <button
              type="button"
              role="tab"
              data-testid="reports-tab-builder"
              aria-selected={subTab === 'builder'}
              onClick={() => setSubTab('builder')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm transition-colors cursor-pointer whitespace-nowrap ${
                subTab === 'builder'
                  ? 'bg-white dark:bg-[#232A32] text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
              Report Builder &amp; CSV ({reportHistory.length})
            </button>
            <button
              type="button"
              role="tab"
              data-testid="reports-tab-handover"
              aria-selected={subTab === 'handover'}
              onClick={() => setSubTab('handover')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm transition-colors cursor-pointer whitespace-nowrap ${
                subTab === 'handover'
                  ? 'bg-white dark:bg-[#232A32] text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Printer className="w-3.5 h-3.5" aria-hidden="true" />
              Shift Handover (PDF)
            </button>
            <button
              type="button"
              role="tab"
              data-testid="reports-tab-compliance"
              aria-selected={subTab === 'compliance'}
              onClick={() => setSubTab('compliance')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm transition-colors cursor-pointer whitespace-nowrap ${
                subTab === 'compliance'
                  ? 'bg-white dark:bg-[#232A32] text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              Compliance &amp; SLA Pack
            </button>
          </div>
        </div>
      </div>

      {/* Global Export Confirmation Banner */}
      {exportNotice && (
        <div
          role="status"
          className="px-4 py-2.5 rounded-md bg-[#009530]/[0.07] dark:bg-[#3DCD58]/[0.1] border border-[#009530]/25 dark:border-[#3DCD58]/25 flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
            <Check className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58] shrink-0" aria-hidden="true" />
            <span>
              Exported <span className="font-mono font-semibold">{exportNotice.filename}</span> (
              {exportNotice.rows.toLocaleString()} data rows)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setExportNotice(null)}
            className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {subTab === 'trends' ? (
        <div className="space-y-5">
          {/* Multi-Year Horizon & Scope Filter Bar */}
          <section
            aria-label="Historical trend controls"
            className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-3.5 sm:p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3"
          >
            <div className="flex flex-wrap items-center gap-3">
              {/* Horizon Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                  History Window
                </span>
                <div
                  className="inline-flex items-center rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#13171B] p-0.5"
                  role="group"
                  aria-label="Historical time window"
                >
                  {HISTORY_HORIZONS.map((h) => {
                    const active = trendHorizon === h.id;
                    return (
                      <button
                        key={h.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setTrendHorizon(h.id)}
                        title={h.description}
                        className={`px-2.5 py-1 text-xs font-mono font-medium rounded-sm transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#009530] text-white'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                        }`}
                      >
                        {h.shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Site Scope */}
              <div className="flex items-center gap-1.5">
                <label htmlFor="trend-site-scope" className="sr-only">
                  Trend Site Scope
                </label>
                <select
                  id="trend-site-scope"
                  value={trendSiteScope}
                  onChange={(e) => setTrendSiteScope(e.target.value as ReportSiteScope)}
                  className="px-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
                >
                  <option value="all">All Sites (KL1 · KL2 · KL3)</option>
                  {SITES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Data Hall Scope */}
              <div className="flex items-center gap-1.5">
                <label htmlFor="trend-hall-scope" className="sr-only">
                  Trend Data Hall Scope
                </label>
                <select
                  id="trend-hall-scope"
                  value={trendHallScope}
                  onChange={(e) => setTrendHallScope(e.target.value as ReportHallScope)}
                  className="px-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
                >
                  <option value="all">All 4 Data Halls</option>
                  <option value="hall-a">Hall A · Core Compute</option>
                  <option value="hall-b">Hall B · AI & GPU</option>
                  <option value="hall-c">Hall C · Storage & Edge</option>
                  <option value="hall-d">Hall D · Cloud & Interconnect</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between xl:justify-end gap-3">
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {trendSummary.horizonMonths} months · {trendSummary.yearSpanLabel}
              </span>
              <button
                type="button"
                onClick={handleExportTrendCsv}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Export Trend CSV
              </button>
            </div>
          </section>

          {/* 4-Column Multi-Year Historical KPI Strip */}
          <section
            aria-label="Multi-year trend summary metrics"
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800"
          >
            {/* Current & Period Delta + YoY */}
            <div className="p-4">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>Current ({trendSummary.currentLabel})</span>
                <span className="font-mono tabular-nums">
                  {HISTORY_HORIZON_MAP[trendHorizon].shortLabel} Delta
                </span>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                  {formatTrendValue(trendSummary.currentValue, trendSummary.metric)}
                </span>
                <span
                  className={`font-mono text-xs font-medium tabular-nums ${
                    deltaIsGood
                      ? 'text-[#009530] dark:text-[#3DCD58]'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {formatSignedDelta(trendSummary.delta, trendSummary.metric)} (
                  {trendSummary.deltaPct >= 0 ? '+' : ''}
                  {trendSummary.deltaPct.toFixed(1)}%)
                </span>
              </div>
              <div className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {trendSummary.yoyDelta !== null && trendSummary.yoyReferenceLabel ? (
                  <>
                    YoY vs {trendSummary.yoyReferenceLabel}:{' '}
                    <span className="text-slate-700 dark:text-slate-300">
                      {formatSignedDelta(trendSummary.yoyDelta, trendSummary.metric)}
                    </span>
                  </>
                ) : (
                  <>Baseline {trendSummary.startLabel}: {formatTrendValue(trendSummary.startValue, trendSummary.metric)}</>
                )}
              </div>
            </div>

            {/* Period Average & Range */}
            <div className="p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {trendSummary.horizonMonths}-Month Average
              </div>
              <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                {formatTrendValue(trendSummary.average, trendSummary.metric)}
              </div>
              <div className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                Range {formatTrendValue(trendSummary.minValue, trendSummary.metric)} –{' '}
                {formatTrendValue(trendSummary.maxValue, trendSummary.metric)}
              </div>
            </div>

            {/* Peak Recorded */}
            <div className="p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Peak Recorded</div>
              <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                {formatTrendValue(trendSummary.maxValue, trendSummary.metric)}
              </div>
              <div className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                Peak {trendSummary.maxLabel} · Low {trendSummary.minLabel}
              </div>
            </div>

            {/* 3-Month Forecast & SLA Compliance */}
            <div className="p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Next-Quarter Projection & SLA
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-xl font-semibold tabular-nums text-[#009530] dark:text-[#3DCD58]">
                  {formatTrendValue(trendSummary.forecastNextQuarter, trendSummary.metric)}
                </span>
                <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  ({formatSignedDelta(trendSummary.forecastDelta, trendSummary.metric)})
                </span>
              </div>
              <div className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                SLA {trendSummary.avgSlaCompliancePct.toFixed(2)}% · Tier IV{' '}
                {trendSummary.avgTier4AvailabilityPct.toFixed(3)}%
              </div>
            </div>
          </section>

          {/* Interactive Multi-Year Trend Chart */}
          <HistoricalTrendChart
            points={trendPoints}
            metricId={trendMetric}
            onMetricChange={setTrendMetric}
            summary={trendSummary}
            scopeCaption={trendScopeCaption}
          />

          {/* Monthly Historical Ledger Table (All Months in Horizon, Newest First) */}
          <section
            aria-label="Monthly historical telemetry ledger"
            className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Monthly Historical Ledger ({HISTORY_HORIZON_MAP[trendHorizon].label})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Archived monthly rollups across {trendScopeCaption} — newest period first
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative w-48 sm:w-56">
                  <Search
                    className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <label htmlFor="historical-ledger-search" className="sr-only">
                    Filter historical months
                  </label>
                  <input
                    id="historical-ledger-search"
                    type="search"
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    placeholder="Filter year or month (e.g. 2024)..."
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
                  />
                </div>
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                  {filteredLedgerPoints.length} / {trendPoints.length} months
                </span>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[420px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 dark:bg-[#15191E] border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                    <th scope="col" className="px-3.5 py-2.5 font-semibold whitespace-nowrap">Period</th>
                    <th scope="col" className="px-3.5 py-2.5 font-semibold text-right whitespace-nowrap">Avg IT Load</th>
                    <th scope="col" className="px-3.5 py-2.5 font-semibold text-right whitespace-nowrap">Peak Load</th>
                    <th scope="col" className="px-3.5 py-2.5 font-semibold text-right whitespace-nowrap">PUE</th>
                    <th scope="col" className="px-3.5 py-2.5 font-semibold text-right whitespace-nowrap">Cooling</th>
                    <th scope="col" className="px-3.5 py-2.5 font-semibold text-right whitespace-nowrap">Cold Aisle</th>
                    <th scope="col" className="px-3.5 py-2.5 font-semibold text-right whitespace-nowrap">Peak Temp</th>
                    <th scope="col" className="px-3.5 py-2.5 font-semibold text-right whitespace-nowrap">Humidity</th>
                    <th scope="col" className="px-3.5 py-2.5 font-semibold text-right whitespace-nowrap">SLA %</th>
                    <th scope="col" className="px-3.5 py-2.5 font-semibold text-right whitespace-nowrap">Tier IV %</th>
                    <th scope="col" className="px-3.5 py-2.5 font-semibold text-right whitespace-nowrap">Rack Util</th>
                    <th scope="col" className="px-3.5 py-2.5 font-semibold text-right whitespace-nowrap">Alerts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono tabular-nums">
                  {filteredLedgerPoints.map((pt, idx) => (
                    <tr
                      key={pt.monthKey}
                      className={`${
                        idx === 0 && !ledgerSearch
                          ? 'bg-[#009530]/[0.04] dark:bg-[#3DCD58]/[0.06]'
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                      } transition-colors`}
                    >
                      <td className="px-3.5 py-2 whitespace-nowrap font-sans font-medium text-slate-900 dark:text-slate-100">
                        {pt.label}
                        {idx === 0 && !ledgerSearch && (
                          <span className="ml-2 text-[10px] font-mono uppercase tracking-wide text-[#009530] dark:text-[#3DCD58]">
                            Live
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-2 text-right whitespace-nowrap text-slate-800 dark:text-slate-200">
                        {pt.itLoadMw.toFixed(2)} MW
                      </td>
                      <td className="px-3.5 py-2 text-right whitespace-nowrap text-slate-600 dark:text-slate-400">
                        {pt.peakItLoadMw.toFixed(2)} MW
                      </td>
                      <td
                        className={`px-3.5 py-2 text-right whitespace-nowrap font-medium ${
                          pt.pue <= 1.3
                            ? 'text-[#009530] dark:text-[#3DCD58]'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {pt.pue.toFixed(3)}
                      </td>
                      <td className="px-3.5 py-2 text-right whitespace-nowrap text-slate-700 dark:text-slate-300">
                        {pt.coolingOutputMw.toFixed(2)} MW
                      </td>
                      <td className="px-3.5 py-2 text-right whitespace-nowrap text-slate-800 dark:text-slate-200">
                        {pt.coldAisleTempC.toFixed(1)}°C
                      </td>
                      <td
                        className={`px-3.5 py-2 text-right whitespace-nowrap ${
                          pt.coldAislePeakTempC >= 25.5
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {pt.coldAislePeakTempC.toFixed(1)}°C
                      </td>
                      <td className="px-3.5 py-2 text-right whitespace-nowrap text-slate-700 dark:text-slate-300">
                        {pt.coldAisleHumidityPct.toFixed(1)}%
                      </td>
                      <td
                        className={`px-3.5 py-2 text-right whitespace-nowrap font-medium ${
                          pt.slaCompliancePct >= 99.9
                            ? 'text-[#009530] dark:text-[#3DCD58]'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {pt.slaCompliancePct.toFixed(2)}%
                      </td>
                      <td className="px-3.5 py-2 text-right whitespace-nowrap text-slate-700 dark:text-slate-300">
                        {pt.tier4AvailabilityPct.toFixed(3)}%
                      </td>
                      <td className="px-3.5 py-2 text-right whitespace-nowrap text-slate-700 dark:text-slate-300">
                        {pt.rackUtilizationPct.toFixed(1)}%
                      </td>
                      <td className="px-3.5 py-2 text-right whitespace-nowrap text-slate-600 dark:text-slate-400">
                        {pt.alertCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : subTab === 'points' ? (
        <EquipmentPointExtractorPanel
          activeSiteId={activeSiteId}
          sitesMap={sitesMap}
          onReportGenerated={onReportGenerated}
          onExportCsv={handleExportCsv}
          onCopyCsv={handleCopyCsv}
          copiedId={copiedId}
        />
      ) : subTab === 'handover' ? (
        <ExecutiveHandoverReportPanel
          activeSiteId={activeSiteId}
          site={sitesMap[activeSiteId]}
          racks={racks}
          operatorName={operatorName}
          shiftTeam={shiftTeam}
          shiftSlot={shiftSlot}
          auditTrail={auditTrail}
          handoverLog={handoverLog}
          cloudSynced={cloudSynced}
          cloudSyncedHandoversCount={cloudSyncedHandoversCount}
          onSyncExecutiveHandover={onSyncExecutiveHandover}
        />
      ) : subTab === 'compliance' ? (
        <CompliancePackPanel
          activeSiteId={activeSiteId}
          sitesMap={sitesMap}
          racks={racks}
          visitors={visitors}
          maintenanceWindows={maintenanceWindows}
          auditTrail={auditTrail}
          auditorName={operatorName}
          onLogAudit={onLogAudit}
        />
      ) : (
        <div className="space-y-5">
          {/* Report Builder Panel */}
          <section
            aria-label="Report generator configuration"
            className="bg-white dark:bg-[#1B2026] border border-slate-200/90 dark:border-slate-800 rounded-md p-4 sm:p-5 space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  1. Select Report Template
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Choose a multi-year historical ledger or live point-in-time snapshot from Orise DCIM & BMS telemetry
                </p>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {REPORT_TEMPLATES.length} Templates · RFC 4180 CSV
              </span>
            </div>

            {/* Template Selector Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {REPORT_TEMPLATES.map((tpl) => {
                const active = selectedType === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedType(tpl.id)}
                    className={`text-left p-3.5 rounded-md border transition-colors cursor-pointer flex flex-col justify-between gap-1.5 ${
                      active
                        ? 'border-[#009530] bg-[#009530]/[0.05] dark:bg-[#3DCD58]/[0.08]'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {tpl.label}
                      </span>
                      <span
                        className={`text-[11px] font-medium shrink-0 ${
                          active ? 'text-[#009530] dark:text-[#3DCD58]' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {tpl.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {tpl.description}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Scope, Filters & CSV Settings */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div>
                  <label
                    htmlFor="report-site-scope"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Site Scope
                  </label>
                  <select
                    id="report-site-scope"
                    value={siteScope}
                    onChange={(e) => setSiteScope(e.target.value as ReportSiteScope)}
                    className="w-full px-3 py-2 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
                  >
                    <option value="all">All Sites (KL1 · KL2 · KL3)</option>
                    {SITES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="report-hall-scope"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Data Hall Scope
                  </label>
                  <select
                    id="report-hall-scope"
                    value={activeTemplate.supportsHallFilter ? hallScope : 'all'}
                    disabled={!activeTemplate.supportsHallFilter}
                    onChange={(e) => setHallScope(e.target.value as ReportHallScope)}
                    className="w-full px-3 py-2 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
                  >
                    <option value="all">All 4 Data Halls</option>
                    <option value="hall-a">Hall A · Core Compute</option>
                    <option value="hall-b">Hall B · AI & GPU</option>
                    <option value="hall-c">Hall C · Storage & Edge</option>
                    <option value="hall-d">Hall D · Cloud & Interconnect</option>
                  </select>
                </div>

                {selectedType === 'historical_trends' ? (
                  <div>
                    <label
                      htmlFor="report-history-horizon"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      History Horizon (Past 1Y)
                    </label>
                    <select
                      id="report-history-horizon"
                      value={builderHorizon}
                      onChange={(e) => setBuilderHorizon(e.target.value as HistoryHorizonId)}
                      className="w-full px-3 py-2 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
                    >
                      {HISTORY_HORIZONS.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.label} ({h.months} Months)
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label
                      htmlFor="report-record-filter"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Record Filter
                    </label>
                    <select
                      id="report-record-filter"
                      value={activeTemplate.supportsIssuesFilter ? recordFilter : 'all'}
                      disabled={!activeTemplate.supportsIssuesFilter}
                      onChange={(e) => setRecordFilter(e.target.value as ReportRecordFilter)}
                      className="w-full px-3 py-2 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
                    >
                      <option value="all">All Records</option>
                      <option value="issues_only">Issues / Breaches Only</option>
                    </select>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="report-custom-title"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Report Title (Optional)
                  </label>
                  <input
                    id="report-custom-title"
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder={`${activeTemplate.shortLabel} — ${siteScope === 'all' ? 'All Sites' : siteScope.toUpperCase()}`}
                    className="w-full px-3 py-2 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600 dark:text-slate-300">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeBom}
                      onChange={(e) => setIncludeBom(e.target.checked)}
                      className="rounded-xs border-slate-300 text-[#009530] focus:ring-[#009530]"
                    />
                    <span>UTF-8 BOM (Excel compatible)</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeMetadataComments}
                      onChange={(e) => setIncludeMetadataComments(e.target.checked)}
                      className="rounded-xs border-slate-300 text-[#009530] focus:ring-[#009530]"
                    />
                    <span>Include metadata header lines</span>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleGenerate}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
                  Generate Report
                </button>
              </div>
            </div>
          </section>

          {/* Active Report Preview & CSV Export */}
          {activeReport && (
            <section
              aria-label="Generated report preview"
              className="bg-white dark:bg-[#1B2026] border border-slate-200/90 dark:border-slate-800 rounded-md overflow-hidden"
            >
              {/* Preview Header */}
              <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50 truncate">
                    {activeReport.title}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                    <span>{activeReport.siteScopeLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeReport.hallScopeLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {activeReport.rows.length.toLocaleString()} rows ({formatByteSize(activeReport.byteSize)})
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{formatIsoTimestamp(activeReport.generatedAt)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <div
                    role="group"
                    aria-label="Report preview layout"
                    className="inline-flex items-center p-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-[#13171B]"
                  >
                    {(
                      [
                        { id: 'both', label: 'Trend + Table' },
                        { id: 'trend', label: 'Trend Only' },
                        { id: 'table', label: 'Table Only' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        data-testid={`report-view-${m.id}-btn`}
                        onClick={() => setReportPreviewMode(m.id)}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded-sm transition-colors whitespace-nowrap cursor-pointer ${
                          reportPreviewMode === m.id
                            ? 'bg-white dark:bg-[#232A32] text-slate-900 dark:text-slate-100 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyCsv(activeReport)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedId === activeReport.id ? (
                      <Check className="w-3.5 h-3.5 text-[#009530]" aria-hidden="true" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    {copiedId === activeReport.id ? 'Copied CSV' : 'Copy CSV'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportCsv(activeReport)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    Export CSV
                  </button>
                </div>
              </div>

              {/* 4-Column Snapshot Summary Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                {activeReport.summaryMetrics.map((m) => (
                  <div key={m.label} className="p-4">
                    <div className="text-xs text-slate-500 dark:text-slate-400">{m.label}</div>
                    <div className={`mt-1 font-mono text-lg font-semibold tabular-nums ${metricToneClass(m.tone)}`}>
                      {m.value}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{m.detail}</div>
                  </div>
                ))}
              </div>

              {/* Per-Report Interactive Visual Trend Panel */}
              {reportPreviewMode !== 'table' && <ReportTrendPanel report={activeReport} />}

              {/* Preview Filter & Filename Strip */}
              {reportPreviewMode !== 'trend' && (
              <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search
                    className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <label htmlFor="report-preview-filter" className="sr-only">
                    Filter preview rows
                  </label>
                  <input
                    id="report-preview-filter"
                    type="search"
                    value={previewSearch}
                    onChange={(e) => {
                      setPreviewSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Filter preview rows..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
                  />
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <span className="truncate max-w-[280px]" title={activeReport.filename}>
                    {activeReport.filename}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {filteredRows.length.toLocaleString()} / {activeReport.rows.length.toLocaleString()} shown
                  </span>
                </div>
              </div>
              )}

              {/* Data Table */}
              {reportPreviewMode !== 'trend' && (paginatedRows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                        {activeReport.columns.map((col) => (
                          <th
                            key={col.key}
                            scope="col"
                            className={`px-3.5 py-2.5 font-semibold whitespace-nowrap ${
                              col.align === 'right' ? 'text-right' : 'text-left'
                            }`}
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {paginatedRows.map((row, idx) => (
                        <tr
                          key={`${activeReport.id}-r-${safePage}-${idx}`}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          {activeReport.columns.map((col) => {
                            const raw = row[col.key];
                            const text = raw === null || raw === undefined ? '—' : String(raw);
                            const isCrit =
                              text === 'Breached' ||
                              text === 'CRITICAL' ||
                              text === 'Critical' ||
                              text === 'Fault' ||
                              text === 'ALARM' ||
                              text === 'At Risk';
                            const isWarn =
                              text === 'Warning' ||
                              text === 'WARNING' ||
                              text === 'Boost' ||
                              text === 'Failover Active';
                            const isOk =
                              text === 'Compliant' ||
                              text === 'Nominal' ||
                              text === 'NOMINAL' ||
                              text === 'Verified' ||
                              text === 'Fault-Tolerant' ||
                              text === 'Running';
                            return (
                              <td
                                key={col.key}
                                className={`px-3.5 py-2 whitespace-nowrap ${
                                  col.align === 'right' ? 'text-right font-mono tabular-nums' : 'text-left'
                                } ${
                                  isCrit
                                    ? 'text-red-700 dark:text-red-400 font-semibold'
                                    : isWarn
                                    ? 'text-amber-700 dark:text-amber-400 font-medium'
                                    : isOk
                                    ? 'text-[#009530] dark:text-[#3DCD58] font-medium'
                                    : 'text-slate-800 dark:text-slate-200'
                                }`}
                              >
                                {text}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-10 text-center space-y-2">
                  <Filter className="w-5 h-5 text-slate-400 mx-auto" aria-hidden="true" />
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    No rows matched the current filter
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    {previewSearch
                      ? 'Try clearing the preview search query to view all generated records.'
                      : 'All monitored assets in this scope are nominal. Switch Record Filter to "All Records" and regenerate to export the full dataset.'}
                  </p>
                </div>
              ))}

              {/* Pagination Footer */}
              {reportPreviewMode !== 'trend' && totalPages > 1 && (
                <div className="px-4 sm:px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
                  <span className="font-mono tabular-nums">
                    Page {safePage} of {totalPages} · Showing {(safePage - 1) * PAGE_SIZE + 1}–
                    {Math.min(safePage * PAGE_SIZE, filteredRows.length)} of {filteredRows.length.toLocaleString()}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    >
                      Next
                      <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Historical & Session Report Archive */}
          <section
            aria-label="Historical report archive"
            className="bg-white dark:bg-[#1B2026] border border-slate-200/90 dark:border-slate-800 rounded-md overflow-hidden"
          >
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-start gap-2.5">
                <History className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Historical & Session Report Archive
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Multi-year compliance snapshots (spanning &gt;1 year) and newly generated reports — preview or export any snapshot to CSV
                  </p>
                </div>
              </div>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                {reportHistory.length} snapshot{reportHistory.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                    <th scope="col" className="px-4 py-2.5 font-semibold">Report Title</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Scope</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold text-right">Rows</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold text-right">Size</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Generated (UTC)</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {reportHistory.map((rpt) => {
                    const isSelected = activeReport?.id === rpt.id;
                    return (
                      <tr
                        key={rpt.id}
                        className={`${
                          isSelected
                            ? 'bg-[#009530]/[0.04] dark:bg-[#3DCD58]/[0.06]'
                            : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                        } transition-colors`}
                      >
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{rpt.title}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                            {rpt.filename}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {rpt.siteScopeLabel} · {rpt.hallScopeLabel}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                          {rpt.rows.length.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {formatByteSize(rpt.byteSize)}
                        </td>
                        <td className="px-4 py-2.5 font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {formatIsoTimestamp(rpt.generatedAt)}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              data-testid={`archive-trend-btn-${rpt.id}`}
                              onClick={() => {
                                onSelectReport(rpt.id);
                                setReportPreviewMode('trend');
                                window.requestAnimationFrame(() => {
                                  document
                                    .querySelector('[data-testid="report-trend-panel"]')
                                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                });
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-[#009530]/40 bg-[#009530]/[0.06] text-[#007A27] dark:text-[#3DCD58] hover:bg-[#009530]/15 transition-colors cursor-pointer"
                            >
                              <TrendingUp className="w-3 h-3" aria-hidden="true" />
                              View Trend
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onSelectReport(rpt.id);
                                setReportPreviewMode('both');
                              }}
                              disabled={isSelected && reportPreviewMode !== 'trend'}
                              className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer disabled:cursor-default"
                            >
                              {isSelected ? 'Viewing' : 'Preview'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExportCsv(rpt)}
                              aria-label={`Export ${rpt.title} as CSV`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white transition-colors cursor-pointer"
                            >
                              <Download className="w-3 h-3" aria-hidden="true" />
                              CSV
                            </button>
                            {reportHistory.length > 1 && (
                              <button
                                type="button"
                                onClick={() => onDeleteReport(rpt.id)}
                                aria-label={`Remove ${rpt.title}`}
                                className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-md cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            )}
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
    </div>
  );
}

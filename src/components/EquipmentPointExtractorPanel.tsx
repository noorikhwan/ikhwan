import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Database,
  Download,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import {
  buildExtractableEquipmentCatalog,
  buildIntervalTimestamps,
  CustomIntervalSetting,
  EQUIPMENT_CATEGORIES,
  EquipmentCategoryId,
  formatIntervalLabel,
  generateEquipmentPointReport,
  INTERVAL_PRESETS,
  IntervalUnit,
  MAX_EXTRACTION_INTERVALS,
  PointAggregationMode,
  PointExportLayout,
  PointWindowPresetId,
  resolveExtractionTimeRange,
  WINDOW_PRESETS,
} from '../engine/equipmentPointExtractor';
import { formatByteSize, formatIsoTimestamp, GeneratedReport, ReportSiteScope } from '../engine/reportEngine';
import { SITES, SiteId, SiteWorkspaceState } from '../engine/sites';
import { ReportTrendPanel } from './ReportTrendPanel';

interface EquipmentPointExtractorPanelProps {
  activeSiteId: SiteId;
  sitesMap: Record<SiteId, SiteWorkspaceState>;
  onReportGenerated: (report: GeneratedReport) => void;
  onExportCsv: (report: GeneratedReport) => void;
  onCopyCsv: (report: GeneratedReport) => void;
  copiedId: string | null;
}

const PREVIEW_PAGE_SIZE = 20;

function toDatetimeLocalValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export function EquipmentPointExtractorPanel({
  activeSiteId,
  sitesMap,
  onReportGenerated,
  onExportCsv,
  onCopyCsv,
  copiedId,
}: EquipmentPointExtractorPanelProps) {
  const [siteScope, setSiteScope] = useState<ReportSiteScope>(activeSiteId);
  const [categoryFilter, setCategoryFilter] = useState<EquipmentCategoryId | 'all'>('chiller');
  const [equipmentSearch, setEquipmentSearch] = useState('');

  // Selected equipment UIDs and point keys
  const [selectedEquipmentUids, setSelectedEquipmentUids] = useState<string[]>([
    `${activeSiteId}::chw-01`,
    `${activeSiteId}::cha-a1`,
  ]);
  const [selectedPointKeys, setSelectedPointKeys] = useState<string[]>([
    'chw_supply_temp_c',
    'cooling_output_kw',
    'compressor_load_pct',
  ]);

  // Custom Interval & Time Window settings
  const [intervalValue, setIntervalValue] = useState<number>(15);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>('minutes');
  const [windowPreset, setWindowPreset] = useState<PointWindowPresetId>('6h');
  const [customStartInput, setCustomStartInput] = useState<string>(() =>
    toDatetimeLocalValue(Date.now() - 6 * 60 * 60 * 1000)
  );
  const [customEndInput, setCustomEndInput] = useState<string>(() => toDatetimeLocalValue(Date.now()));
  const [aggregation, setAggregation] = useState<PointAggregationMode>('avg');
  const [layout, setLayout] = useState<PointExportLayout>('long');
  const [customTitle, setCustomTitle] = useState('');
  const [includeBom, setIncludeBom] = useState(true);
  const [includeMetadataComments, setIncludeMetadataComments] = useState(true);

  const [validationError, setValidationError] = useState<string | null>(null);
  const [extractedReport, setExtractedReport] = useState<GeneratedReport | null>(null);
  const [previewMode, setPreviewMode] = useState<'both' | 'trend' | 'table'>('both');
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewPage, setPreviewPage] = useState(1);

  // Sync default site when user switches site from left navigation (unless 'all' selected)
  useEffect(() => {
    setSiteScope((prev) => (prev === 'all' ? 'all' : activeSiteId));
  }, [activeSiteId]);

  const fullCatalog = useMemo(
    () => buildExtractableEquipmentCatalog(sitesMap, siteScope),
    [sitesMap, siteScope]
  );

  // Keep selections valid whenever siteScope changes
  useEffect(() => {
    const validUids = new Set(fullCatalog.map((e) => e.uid));
    setSelectedEquipmentUids((prev) => {
      const kept = prev.filter((uid) => validUids.has(uid));
      if (kept.length > 0) return kept;
      const defaultUnits = fullCatalog
        .filter((e) => categoryFilter === 'all' || e.category === categoryFilter)
        .slice(0, 2)
        .map((e) => e.uid);
      return defaultUnits.length > 0 ? defaultUnits : fullCatalog.slice(0, 2).map((e) => e.uid);
    });
  }, [fullCatalog, categoryFilter]);

  const visibleEquipment = useMemo(() => {
    const q = equipmentSearch.trim().toLowerCase();
    return fullCatalog.filter((eq) => {
      if (categoryFilter !== 'all' && eq.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        eq.name.toLowerCase().includes(q) ||
        eq.equipmentId.toLowerCase().includes(q) ||
        eq.location.toLowerCase().includes(q) ||
        eq.siteCode.toLowerCase().includes(q)
      );
    });
  }, [fullCatalog, categoryFilter, equipmentSearch]);

  const selectedEquipmentItems = useMemo(() => {
    const uidSet = new Set(selectedEquipmentUids);
    return fullCatalog.filter((eq) => uidSet.has(eq.uid));
  }, [fullCatalog, selectedEquipmentUids]);

  // Unique available telemetry points across currently selected equipment
  const availablePoints = useMemo(() => {
    const map = new Map<
      string,
      {
        pointKey: string;
        label: string;
        unit: string;
        sampleCode: string;
        equipmentCount: number;
      }
    >();
    for (const eq of selectedEquipmentItems) {
      for (const pt of eq.points) {
        const existing = map.get(pt.pointKey);
        if (existing) {
          existing.equipmentCount += 1;
        } else {
          map.set(pt.pointKey, {
            pointKey: pt.pointKey,
            label: pt.label,
            unit: pt.unit,
            sampleCode: pt.pointCode,
            equipmentCount: 1,
          });
        }
      }
    }
    return Array.from(map.values());
  }, [selectedEquipmentItems]);

  // Ensure at least one valid point is checked when selected equipment changes
  useEffect(() => {
    const validKeys = new Set(availablePoints.map((p) => p.pointKey));
    setSelectedPointKeys((prev) => {
      const kept = prev.filter((k) => validKeys.has(k));
      if (kept.length > 0) return kept;
      return availablePoints.slice(0, 3).map((p) => p.pointKey);
    });
  }, [availablePoints]);

  const activeIntervalSetting: CustomIntervalSetting = useMemo(
    () => ({
      value: Math.max(1, Math.min(1440, Math.round(intervalValue || 1))),
      unit: intervalUnit,
    }),
    [intervalValue, intervalUnit]
  );

  // Live extraction preview estimator
  const extractionEstimate = useMemo(() => {
    const now = Date.now();
    const customStartMs = customStartInput ? Date.parse(customStartInput) : undefined;
    const customEndMs = customEndInput ? Date.parse(customEndInput) : undefined;
    const range = resolveExtractionTimeRange(
      { windowPreset, customStartMs, customEndMs },
      now
    );
    const plan = buildIntervalTimestamps({
      startMs: range.startMs,
      endMs: range.endMs,
      interval: activeIntervalSetting,
    });
    const ptSet = new Set(selectedPointKeys);
    let pairCount = 0;
    for (const eq of selectedEquipmentItems) {
      for (const pt of eq.points) {
        if (ptSet.has(pt.pointKey)) pairCount++;
      }
    }
    const totalRows = layout === 'wide' ? plan.timestamps.length : plan.timestamps.length * pairCount;
    return {
      bucketCount: plan.timestamps.length,
      wasCapped: plan.wasCapped,
      rawBucketCount: plan.rawBucketCount,
      pairCount,
      totalRows,
    };
  }, [
    activeIntervalSetting,
    customEndInput,
    customStartInput,
    layout,
    selectedEquipmentItems,
    selectedPointKeys,
    windowPreset,
  ]);

  const toggleEquipmentUid = (uid: string) => {
    setSelectedEquipmentUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
    setValidationError(null);
  };

  const togglePointKey = (pointKey: string) => {
    setSelectedPointKeys((prev) =>
      prev.includes(pointKey) ? prev.filter((k) => k !== pointKey) : [...prev, pointKey]
    );
    setValidationError(null);
  };

  const handleSelectAllVisibleEquipment = () => {
    const merged = new Set(selectedEquipmentUids);
    for (const eq of visibleEquipment) merged.add(eq.uid);
    setSelectedEquipmentUids(Array.from(merged));
    setValidationError(null);
  };

  const handleClearVisibleEquipment = () => {
    const visibleSet = new Set(visibleEquipment.map((e) => e.uid));
    setSelectedEquipmentUids((prev) => prev.filter((uid) => !visibleSet.has(uid)));
  };

  const handleSelectAllPoints = () => {
    setSelectedPointKeys(availablePoints.map((p) => p.pointKey));
    setValidationError(null);
  };

  const handleClearPoints = () => {
    setSelectedPointKeys([]);
  };

  const handleApplyIntervalPreset = (setting: CustomIntervalSetting) => {
    setIntervalValue(setting.value);
    setIntervalUnit(setting.unit);
    setValidationError(null);
  };

  const handleExtract = () => {
    if (selectedEquipmentUids.length === 0) {
      setValidationError('Select at least one equipment unit to extract point data.');
      return;
    }
    if (selectedPointKeys.length === 0) {
      setValidationError('Select at least one telemetry point to include in the extraction.');
      return;
    }
    if (!Number.isFinite(intervalValue) || intervalValue < 1) {
      setValidationError('Custom interval must be a positive number (minimum 1).');
      return;
    }
    if (intervalUnit === 'seconds' && intervalValue < 5) {
      setValidationError('Minimum sampling interval is 5 seconds to match BMS poll rate.');
      return;
    }

    let customStartMs: number | undefined;
    let customEndMs: number | undefined;
    if (windowPreset === 'custom') {
      customStartMs = Date.parse(customStartInput);
      customEndMs = Date.parse(customEndInput);
      if (!Number.isFinite(customStartMs) || !Number.isFinite(customEndMs) || customEndMs <= customStartMs) {
        setValidationError('Custom End Date/Time must be later than Start Date/Time.');
        return;
      }
    }

    setValidationError(null);
    const report = generateEquipmentPointReport({
      config: {
        siteScope,
        categoryFilter,
        selectedEquipmentUids,
        selectedPointKeys,
        interval: activeIntervalSetting,
        windowPreset,
        customStartMs,
        customEndMs,
        aggregation,
        layout,
        customTitle: customTitle.trim() || undefined,
        includeBom,
        includeMetadataComments,
      },
      sitesMap,
      now: Date.now(),
    });

    setExtractedReport(report);
    setPreviewSearch('');
    setPreviewPage(1);
    onReportGenerated(report);
  };

  const filteredPreviewRows = useMemo(() => {
    if (!extractedReport) return [];
    const q = previewSearch.trim().toLowerCase();
    if (!q) return extractedReport.rows;
    return extractedReport.rows.filter((row) =>
      Object.values(row).some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(q))
    );
  }, [extractedReport, previewSearch]);

  const totalPreviewPages = Math.max(1, Math.ceil(filteredPreviewRows.length / PREVIEW_PAGE_SIZE));
  const safePreviewPage = Math.min(previewPage, totalPreviewPages);
  const paginatedPreviewRows = useMemo(() => {
    const start = (safePreviewPage - 1) * PREVIEW_PAGE_SIZE;
    return filteredPreviewRows.slice(start, start + PREVIEW_PAGE_SIZE);
  }, [filteredPreviewRows, safePreviewPage]);

  return (
    <div data-testid="equipment-point-extractor" className="space-y-5">
      {/* Main Configuration Workspace */}
      <section
        aria-label="Equipment point extraction configuration"
        className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-4 sm:p-5 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-start gap-2.5">
            <Database className="w-4 h-4 text-[#009530] dark:text-[#3DCD58] mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Equipment Point-Level Historian Extractor
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select specific equipment units and individual BACnet/Modbus/Redfish telemetry points, then extract time-series CSV data at any custom interval
              </p>
            </div>
          </div>
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
            {fullCatalog.length} Equipment Units Available
          </span>
        </div>

        {/* Step 1 & 2: Equipment & Point Picker Two-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column: Site, Category & Equipment Picker */}
          <div className="lg:col-span-7 border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden flex flex-col">
            <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-[#15191E] border-b border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  1. Select Equipment ({selectedEquipmentUids.length} selected)
                </span>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={handleSelectAllVisibleEquipment}
                    className="text-[#007A27] dark:text-[#3DCD58] hover:underline font-medium cursor-pointer"
                  >
                    Select Visible ({visibleEquipment.length})
                  </button>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <button
                    type="button"
                    onClick={handleClearVisibleEquipment}
                    className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                  >
                    Clear Visible
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label htmlFor="pt-site-scope" className="sr-only">
                    Site Scope
                  </label>
                  <select
                    id="pt-site-scope"
                    value={siteScope}
                    onChange={(e) => setSiteScope(e.target.value as ReportSiteScope)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  >
                    <option value="all">All Sites (KL1–KL3)</option>
                    {SITES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="pt-category-filter" className="sr-only">
                    Equipment Category
                  </label>
                  <select
                    id="pt-category-filter"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value as EquipmentCategoryId | 'all')}
                    className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  >
                    <option value="all">All Equipment Classes</option>
                    {EQUIPMENT_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="relative">
                  <Search
                    className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <label htmlFor="pt-equipment-search" className="sr-only">
                    Search equipment
                  </label>
                  <input
                    id="pt-equipment-search"
                    type="search"
                    value={equipmentSearch}
                    onChange={(e) => setEquipmentSearch(e.target.value)}
                    placeholder="Filter ID or name..."
                    className="w-full pl-7 pr-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                  />
                </div>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
              {visibleEquipment.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  No equipment matches your filter.
                </div>
              ) : (
                visibleEquipment.map((eq) => {
                  const checked = selectedEquipmentUids.includes(eq.uid);
                  return (
                    <label
                      key={eq.uid}
                      className={`flex items-center justify-between gap-2.5 px-3.5 py-2 text-xs cursor-pointer transition-colors ${
                        checked
                          ? 'bg-[#009530]/[0.06] dark:bg-[#3DCD58]/[0.08]'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleEquipmentUid(eq.uid)}
                          className="rounded-xs border-slate-300 text-[#009530] focus:ring-[#009530] shrink-0"
                        />
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-900 dark:text-slate-100 truncate">
                            <span className="font-mono text-[#007A27] dark:text-[#3DCD58] mr-1.5">
                              {eq.siteCode}
                            </span>
                            {eq.name}
                          </span>
                          <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {eq.location} · {eq.protocol} · {eq.statusLabel}
                          </span>
                        </span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                        {eq.points.length} pts
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Telemetry Point Picker */}
          <div className="lg:col-span-5 border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden flex flex-col">
            <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-[#15191E] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  2. Select Telemetry Points ({selectedPointKeys.length}/{availablePoints.length})
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Points exposed by selected equipment
                </div>
              </div>
              <div className="flex items-center gap-2 text-[11px] shrink-0">
                <button
                  type="button"
                  onClick={handleSelectAllPoints}
                  className="text-[#007A27] dark:text-[#3DCD58] hover:underline font-medium cursor-pointer"
                >
                  All
                </button>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <button
                  type="button"
                  onClick={handleClearPoints}
                  className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                >
                  None
                </button>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 flex-1">
              {availablePoints.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  Check one or more equipment units on the left to choose telemetry points.
                </div>
              ) : (
                availablePoints.map((pt) => {
                  const checked = selectedPointKeys.includes(pt.pointKey);
                  return (
                    <label
                      key={pt.pointKey}
                      className={`flex items-center justify-between gap-2.5 px-3.5 py-2 text-xs cursor-pointer transition-colors ${
                        checked
                          ? 'bg-[#009530]/[0.06] dark:bg-[#3DCD58]/[0.08]'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePointKey(pt.pointKey)}
                          className="rounded-xs border-slate-300 text-[#009530] focus:ring-[#009530] shrink-0"
                        />
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-900 dark:text-slate-100 truncate">
                            {pt.label}{' '}
                            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              ({pt.unit})
                            </span>
                          </span>
                          <span className="block font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {pt.sampleCode}
                          </span>
                        </span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                        {pt.equipmentCount}u
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Step 3: Custom Interval & Time Window Configuration */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                3. Custom Interval, Time Window &amp; CSV Format
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mr-1">Quick Presets:</span>
              {INTERVAL_PRESETS.map((preset) => {
                const isActive =
                  intervalValue === preset.setting.value && intervalUnit === preset.setting.unit;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => handleApplyIntervalPreset(preset.setting)}
                    className={`px-2 py-1 text-[11px] font-mono rounded-sm border transition-colors cursor-pointer ${
                      isActive
                        ? 'border-[#009530] bg-[#009530] text-white font-semibold'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Custom Interval Value + Unit */}
            <div className="sm:col-span-2 lg:col-span-2">
              <label
                htmlFor="custom-interval-value"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Custom Sampling Interval
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="custom-interval-value"
                  data-testid="custom-interval-value"
                  type="number"
                  min={1}
                  max={1440}
                  step={1}
                  value={intervalValue}
                  onChange={(e) => setIntervalValue(Number(e.target.value))}
                  className="w-24 px-3 py-2 text-xs font-mono tabular-nums rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
                />
                <label htmlFor="custom-interval-unit" className="sr-only">
                  Custom Interval Unit
                </label>
                <select
                  id="custom-interval-unit"
                  data-testid="custom-interval-unit"
                  value={intervalUnit}
                  onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}
                  className="flex-1 px-3 py-2 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
                >
                  <option value="seconds">Seconds (min 5s)</option>
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              </div>
            </div>

            {/* Time Window Preset */}
            <div>
              <label
                htmlFor="pt-window-preset"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Extraction Window
              </label>
              <select
                id="pt-window-preset"
                data-testid="pt-window-preset"
                value={windowPreset}
                onChange={(e) => setWindowPreset(e.target.value as PointWindowPresetId)}
                className="w-full px-3 py-2 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
              >
                {WINDOW_PRESETS.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
                <option value="custom">Custom Start / End Range</option>
              </select>
            </div>

            {/* Aggregation */}
            <div>
              <label
                htmlFor="pt-aggregation"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Interval Aggregation
              </label>
              <select
                id="pt-aggregation"
                data-testid="pt-aggregation"
                value={aggregation}
                onChange={(e) => setAggregation(e.target.value as PointAggregationMode)}
                className="w-full px-3 py-2 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
              >
                <option value="sample">Instantaneous Sample</option>
                <option value="avg">Interval Average</option>
                <option value="max">Interval Peak (Max)</option>
                <option value="min">Interval Minimum</option>
              </select>
            </div>

            {/* Layout */}
            <div>
              <label
                htmlFor="pt-export-layout"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                CSV Table Layout
              </label>
              <select
                id="pt-export-layout"
                data-testid="pt-export-layout"
                value={layout}
                onChange={(e) => setLayout(e.target.value as PointExportLayout)}
                className="w-full px-3 py-2 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
              >
                <option value="long">Long Format (1 Row / Point)</option>
                <option value="wide">Wide Matrix (1 Col / Point)</option>
              </select>
            </div>
          </div>

          {/* Custom Date/Time Range Inputs when windowPreset === 'custom' */}
          {windowPreset === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3 rounded-md bg-slate-50 dark:bg-[#15191E] border border-slate-200 dark:border-slate-800">
              <div>
                <label
                  htmlFor="pt-custom-start"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Start Date &amp; Time
                </label>
                <input
                  id="pt-custom-start"
                  type="datetime-local"
                  value={customStartInput}
                  onChange={(e) => setCustomStartInput(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label
                  htmlFor="pt-custom-end"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  End Date &amp; Time
                </label>
                <input
                  id="pt-custom-end"
                  type="datetime-local"
                  value={customEndInput}
                  onChange={(e) => setCustomEndInput(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="flex items-end">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Max {MAX_EXTRACTION_INTERVALS} interval buckets per extraction (auto-anchors to latest window).
                </p>
              </div>
            </div>
          )}

          {/* Optional Title, CSV Flags & Extract CTA */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
            <div className="lg:col-span-5">
              <label
                htmlFor="pt-custom-title"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Extraction Report Title (Optional)
              </label>
              <input
                id="pt-custom-title"
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder={`Equipment Point Data (${formatIntervalLabel(activeIntervalSetting)})`}
                className="w-full px-3 py-2 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
              />
            </div>

            <div className="lg:col-span-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600 dark:text-slate-300 pb-1.5">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeBom}
                  onChange={(e) => setIncludeBom(e.target.checked)}
                  className="rounded-xs border-slate-300 text-[#009530] focus:ring-[#009530]"
                />
                <span>UTF-8 BOM</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeMetadataComments}
                  onChange={(e) => setIncludeMetadataComments(e.target.checked)}
                  className="rounded-xs border-slate-300 text-[#009530] focus:ring-[#009530]"
                />
                <span>Metadata headers</span>
              </label>
            </div>

            <div className="lg:col-span-3 flex items-center justify-end">
              <button
                type="button"
                data-testid="extract-points-btn"
                onClick={handleExtract}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-md bg-[#009530] hover:bg-[#007A27] text-white transition-colors whitespace-nowrap cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                Extract Point Data
              </button>
            </div>
          </div>

          {/* Live Estimation Strip */}
          <div className="px-3.5 py-2 rounded-md bg-slate-50 dark:bg-[#15191E] border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono tabular-nums text-slate-700 dark:text-slate-300">
              <span>
                Interval: <strong className="text-[#007A27] dark:text-[#3DCD58]">{formatIntervalLabel(activeIntervalSetting)}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>{extractionEstimate.bucketCount} buckets</span>
              <span aria-hidden="true">·</span>
              <span>{extractionEstimate.pairCount} active equipment-point pairs</span>
              <span aria-hidden="true">·</span>
              <span>Est. {extractionEstimate.totalRows.toLocaleString()} CSV rows</span>
            </div>
            {extractionEstimate.wasCapped && (
              <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                Capped to latest {MAX_EXTRACTION_INTERVALS} intervals (of {extractionEstimate.rawBucketCount.toLocaleString()})
              </span>
            )}
          </div>

          {validationError && (
            <div
              role="alert"
              className="px-3.5 py-2 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300"
            >
              {validationError}
            </div>
          )}
        </div>
      </section>

      {/* Extracted Point Data Preview & Export */}
      {extractedReport && (
        <section
          data-testid="extracted-points-preview"
          aria-label="Extracted equipment point data preview"
          className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden"
        >
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50 truncate">
                {extractedReport.title}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                <span>{extractedReport.siteScopeLabel}</span>
                <span aria-hidden="true">·</span>
                <span>{extractedReport.hallScopeLabel}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {extractedReport.rows.length.toLocaleString()} rows ({formatByteSize(extractedReport.byteSize)})
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {formatIsoTimestamp(extractedReport.generatedAt)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div
                role="group"
                aria-label="Extracted point data preview layout"
                className="inline-flex items-center p-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-[#13171B]"
              >
                {(
                  [
                    { id: 'both', label: 'Trend + Table' },
                    { id: 'trend', label: 'Trend' },
                    { id: 'table', label: 'Table' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    data-testid={`points-view-${m.id}-btn`}
                    onClick={() => setPreviewMode(m.id)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-sm transition-colors whitespace-nowrap cursor-pointer ${
                      previewMode === m.id
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
                onClick={() => onCopyCsv(extractedReport)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
              >
                {copiedId === extractedReport.id ? (
                  <Check className="w-3.5 h-3.5 text-[#009530]" aria-hidden="true" />
                ) : (
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                {copiedId === extractedReport.id ? 'Copied CSV' : 'Copy CSV'}
              </button>
              <button
                type="button"
                data-testid="export-points-csv-btn"
                onClick={() => onExportCsv(extractedReport)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white transition-colors whitespace-nowrap cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Export Point CSV
              </button>
            </div>
          </div>

          {/* 4-Column Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
            {extractedReport.summaryMetrics.map((m) => (
              <div key={m.label} className="p-3.5">
                <div className="text-xs text-slate-500 dark:text-slate-400">{m.label}</div>
                <div className="mt-1 font-mono text-base font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                  {m.value}
                </div>
                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{m.detail}</div>
              </div>
            ))}
          </div>

          {/* Extracted Point Data Visual Trend Chart */}
          {previewMode !== 'table' && <ReportTrendPanel report={extractedReport} />}

          {/* Search Bar */}
          {previewMode !== 'trend' && (
          <div className="px-4 sm:px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <label htmlFor="pt-preview-search" className="sr-only">
                Filter extracted point rows
              </label>
              <input
                id="pt-preview-search"
                type="search"
                value={previewSearch}
                onChange={(e) => {
                  setPreviewSearch(e.target.value);
                  setPreviewPage(1);
                }}
                placeholder="Search equipment, point tag, or timestamp..."
                className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              />
            </div>
            <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {filteredPreviewRows.length.toLocaleString()} / {extractedReport.rows.length.toLocaleString()} rows
            </span>
          </div>
          )}

          {/* Preview Data Table */}
          {previewMode !== 'trend' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                  {extractedReport.columns.map((col) => (
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
                {paginatedPreviewRows.map((row, idx) => (
                  <tr
                    key={`${extractedReport.id}-p-${safePreviewPage}-${idx}`}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    {extractedReport.columns.map((col) => {
                      const raw = row[col.key];
                      const text = raw === null || raw === undefined ? '—' : String(raw);
                      return (
                        <td
                          key={col.key}
                          className={`px-3.5 py-2 whitespace-nowrap ${
                            col.align === 'right' || col.key === 'timestamp' || col.key === 'pointCode'
                              ? 'font-mono tabular-nums'
                              : ''
                          } ${col.align === 'right' ? 'text-right font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'}`}
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
          )}

          {/* Pagination */}
          {previewMode !== 'trend' && totalPreviewPages > 1 && (
            <div className="px-4 sm:px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
              <span className="font-mono tabular-nums">
                Page {safePreviewPage} of {totalPreviewPages}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safePreviewPage <= 1}
                  onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  Prev
                </button>
                <button
                  type="button"
                  disabled={safePreviewPage >= totalPreviewPages}
                  onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages, p + 1))}
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
    </div>
  );
}

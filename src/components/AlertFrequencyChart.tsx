import { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, BarChart3, ChevronDown, ChevronUp, Flame } from 'lucide-react';
import {
  AlertFrequencyBucket,
  buildAlertFrequency24h,
  getFilteredSeriesVisibility,
} from '../engine/alertFrequencyEngine';
import { ActiveAlert, DispatchLogEntry, FacilityTelemetryPoint, Severity } from '../engine/types';

interface AlertFrequencyChartProps {
  alerts: readonly ActiveAlert[];
  dispatchLogs: readonly DispatchLogEntry[];
  facilityHistory: readonly FacilityTelemetryPoint[];
  siteCode?: string;
  severityFilter: Severity | 'all';
  onSelectSeverityFilter?: (severity: Severity | 'all') => void;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload?: AlertFrequencyBucket;
  }>;
}

function AlertFrequencyTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const bucket = payload[0]?.payload;
  if (!bucket) return null;

  return (
    <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-[#14181D]/95 px-3 py-2.5 shadow-md text-xs space-y-1.5 backdrop-blur-xs">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-1">
        <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
          {bucket.windowLabel}
        </span>
        <span className="font-mono tabular-nums text-[11px] font-semibold text-slate-700 dark:text-slate-300">
          {bucket.total} {bucket.total === 1 ? 'alert' : 'alerts'}
        </span>
      </div>
      <div className="space-y-1 font-mono tabular-nums text-[11px]">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-red-700 dark:text-red-400">
            <span className="w-2 h-2 rounded-[2px] bg-red-600" />
            Critical
          </span>
          <strong className="text-slate-900 dark:text-slate-100">{bucket.critical}</strong>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
            <span className="w-2 h-2 rounded-[2px] bg-amber-500" />
            Warning
          </span>
          <strong className="text-slate-900 dark:text-slate-100">{bucket.warning}</strong>
        </div>
      </div>
      <div className="pt-1 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
        <span>Avg Exhaust {bucket.telemetryAvgTempC.toFixed(1)}°C</span>
        <span>CPU {bucket.telemetryAvgCpuPct.toFixed(0)}%</span>
      </div>
    </div>
  );
}

export function AlertFrequencyChart({
  alerts,
  dispatchLogs,
  facilityHistory,
  siteCode = 'KL1',
  severityFilter,
  onSelectSeverityFilter,
}: AlertFrequencyChartProps) {
  const [showThermalOverlay, setShowThermalOverlay] = useState<boolean>(true);
  const [collapsed, setCollapsed] = useState<boolean>(false);

  const summary = useMemo(
    () =>
      buildAlertFrequency24h({
        alerts,
        dispatchLogs,
        facilityHistory,
        siteCode,
      }),
    [alerts, dispatchLogs, facilityHistory, siteCode]
  );

  const { showCritical, showWarning } = useMemo(
    () => getFilteredSeriesVisibility(severityFilter),
    [severityFilter]
  );

  return (
    <section
      aria-label="24-Hour Alert Frequency by Severity"
      data-testid="alerts-frequency-chart"
      className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden"
    >
      {/* Header & KPI Readout Strip */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800/80 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#009530] dark:text-[#3DCD58] shrink-0" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              24-Hour Alert Frequency by Severity
            </h2>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              · {siteCode} Telemetry
            </span>
          </div>

          <div
            data-testid="alerts-frequency-summary"
            className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400"
          >
            <span>
              24h Total:{' '}
              <strong className="text-slate-900 dark:text-slate-100">{summary.totalAlerts}</strong>
            </span>
            <button
              type="button"
              onClick={() =>
                onSelectSeverityFilter?.(severityFilter === 'critical' ? 'all' : 'critical')
              }
              className={`inline-flex items-center gap-1 hover:underline cursor-pointer ${
                severityFilter === 'critical'
                  ? 'font-semibold text-red-700 dark:text-red-400'
                  : 'text-red-700/90 dark:text-red-400/90'
              }`}
            >
              <span className="w-2 h-2 rounded-[2px] bg-red-600 inline-block" aria-hidden="true" />
              Critical: <strong>{summary.totalCritical}</strong> ({summary.criticalSharePct}%)
            </button>
            <button
              type="button"
              onClick={() =>
                onSelectSeverityFilter?.(severityFilter === 'warning' ? 'all' : 'warning')
              }
              className={`inline-flex items-center gap-1 hover:underline cursor-pointer ${
                severityFilter === 'warning'
                  ? 'font-semibold text-amber-700 dark:text-amber-400'
                  : 'text-amber-700/90 dark:text-amber-400/90'
              }`}
            >
              <span className="w-2 h-2 rounded-[2px] bg-amber-500 inline-block" aria-hidden="true" />
              Warning: <strong>{summary.totalWarning}</strong>
            </button>
            <span>
              Peak:{' '}
              <strong className="text-slate-900 dark:text-slate-100">
                {summary.peakHourLabel} ({summary.peakHourCount})
              </strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="alerts-chart-thermal-toggle"
            aria-pressed={showThermalOverlay}
            onClick={() => setShowThermalOverlay((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap cursor-pointer ${
              showThermalOverlay
                ? 'border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14181D] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Flame className="w-3.5 h-3.5" aria-hidden="true" />
            Exhaust Temp Overlay
          </button>

          <button
            type="button"
            data-testid="alerts-chart-collapse-btn"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((prev) => !prev)}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14181D] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            {collapsed ? (
              <>
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                Expand
              </>
            ) : (
              <>
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                Hide
              </>
            )}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="px-4 pt-3 pb-3">
          <div className="h-[188px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={summary.buckets}
                margin={{ top: 6, right: showThermalOverlay ? 10 : 6, left: -18, bottom: 0 }}
                barCategoryGap="22%"
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="currentColor"
                  className="text-slate-200/80 dark:text-slate-800"
                />
                <XAxis
                  dataKey="hourLabel"
                  ticks={summary.buckets
                    .filter((_, idx) => idx % 3 === 0 || idx === 23)
                    .map((b) => b.hourLabel)}
                  tick={{ fontSize: 10, fill: '#64748B' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  yAxisId="count"
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: '#64748B' }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                {showThermalOverlay && (
                  <YAxis
                    yAxisId="temp"
                    orientation="right"
                    domain={['dataMin - 3', 'dataMax + 3']}
                    tick={{ fontSize: 10, fill: '#0284C7' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `${Math.round(v)}°`}
                    width={34}
                  />
                )}
                <Tooltip
                  cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                  content={<AlertFrequencyTooltip />}
                />
                {showCritical && (
                  <Bar
                    yAxisId="count"
                    dataKey="critical"
                    name="Critical Alerts"
                    stackId="severity"
                    fill="#DC2626"
                    radius={showWarning ? [0, 0, 2, 2] : [3, 3, 0, 0]}
                    maxBarSize={22}
                    isAnimationActive={false}
                  />
                )}
                {showWarning && (
                  <Bar
                    yAxisId="count"
                    dataKey="warning"
                    name="Warning Alerts"
                    stackId="severity"
                    fill="#F59E0B"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={22}
                    isAnimationActive={false}
                  />
                )}
                {showThermalOverlay && (
                  <Line
                    yAxisId="temp"
                    type="monotone"
                    dataKey="telemetryAvgTempC"
                    name="Avg Exhaust Temp (°C)"
                    stroke="#0284C7"
                    strokeWidth={1.75}
                    strokeDasharray="4 3"
                    dot={false}
                    activeDot={{ r: 3.5, fill: '#0284C7', strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            <div className="inline-flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
              <span>
                Live Telemetry Baseline: Avg Exhaust{' '}
                <strong className="text-slate-700 dark:text-slate-200">
                  {summary.latestTempC.toFixed(1)}°C
                </strong>{' '}
                · CPU{' '}
                <strong className="text-slate-700 dark:text-slate-200">
                  {summary.latestCpuPct.toFixed(1)}%
                </strong>{' '}
                · Current Hour:{' '}
                <strong className="text-slate-700 dark:text-slate-200">
                  {summary.currentHourCount} live
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-3">
              {showCritical && (
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2 rounded-[2px] bg-red-600 inline-block" aria-hidden="true" />
                  Critical
                </span>
              )}
              {showWarning && (
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2 rounded-[2px] bg-amber-500 inline-block" aria-hidden="true" />
                  Warning
                </span>
              )}
              {showThermalOverlay && (
                <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-400">
                  <span className="w-3 h-0.5 bg-sky-600 inline-block" aria-hidden="true" />
                  Avg Exhaust (°C)
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { GeneratedReport } from '../engine/reportEngine';
import { buildReportTrendModel } from '../engine/reportTrendEngine';

interface ReportTrendPanelProps {
  report: GeneratedReport;
}

export function ReportTrendPanel({ report }: ReportTrendPanelProps) {
  const model = useMemo(() => buildReportTrendModel(report), [report]);
  const [selectedMetricId, setSelectedMetricId] = useState<string>('');

  useEffect(() => {
    setSelectedMetricId(model.metrics[0]?.id ?? '');
  }, [model.reportId, model.metrics]);

  const activeMetric = useMemo(() => {
    if (model.metrics.length === 0) return null;
    return model.metrics.find((m) => m.id === selectedMetricId) ?? model.metrics[0];
  }, [model.metrics, selectedMetricId]);

  if (!activeMetric || activeMetric.data.length === 0) {
    return (
      <div
        data-testid="report-trend-panel"
        className="p-8 text-center border-b border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#15191E]"
      >
        <TrendingUp className="w-5 h-5 text-slate-400 mx-auto mb-1.5" aria-hidden="true" />
        <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
          No numeric rows available in this report snapshot to plot a trend chart.
        </p>
      </div>
    );
  }

  const unitSuffix = activeMetric.unit ? ` ${activeMetric.unit}` : '';

  return (
    <div
      data-testid="report-trend-panel"
      className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1B2026]"
    >
      {/* Trend Header & Metric Switcher */}
      <div className="px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-800/80 flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 bg-slate-50/60 dark:bg-[#15191E]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#009530] dark:text-[#3DCD58] shrink-0" aria-hidden="true" />
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              Report Visual Trend — {activeMetric.label}
            </h3>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            <span>
              Latest ({activeMetric.stats.latestLabel}):{' '}
              <strong className="text-slate-900 dark:text-slate-100">
                {activeMetric.stats.latestValue.toFixed(activeMetric.decimals)}
                {unitSuffix}
              </strong>
            </span>
            <span>
              Avg:{' '}
              <strong className="text-slate-700 dark:text-slate-200">
                {activeMetric.stats.average.toFixed(activeMetric.decimals)}
                {unitSuffix}
              </strong>
            </span>
            <span>
              Range: {activeMetric.stats.min.toFixed(activeMetric.decimals)}–
              {activeMetric.stats.max.toFixed(activeMetric.decimals)}
              {unitSuffix}
            </span>
            {activeMetric.stats.delta !== null && (
              <span
                className={
                  activeMetric.stats.delta >= 0
                    ? 'text-[#007A27] dark:text-[#3DCD58]'
                    : 'text-amber-700 dark:text-amber-400'
                }
              >
                Δ {activeMetric.stats.delta >= 0 ? '+' : ''}
                {activeMetric.stats.delta.toFixed(activeMetric.decimals)}
                {unitSuffix}
                {activeMetric.stats.deltaPct !== null ? ` (${activeMetric.stats.deltaPct >= 0 ? '+' : ''}${activeMetric.stats.deltaPct}%)` : ''}
              </span>
            )}
          </div>
        </div>

        {/* Metric Switcher */}
        {model.metrics.length > 1 && (
          <div
            data-testid="report-trend-metric-selector"
            role="tablist"
            aria-label="Report trend metric selector"
            className="inline-flex flex-wrap items-center gap-0.5 p-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111418] self-start xl:self-auto"
          >
            {model.metrics.map((m) => {
              const active = m.id === activeMetric.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedMetricId(m.id)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-sm transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-[#009530] text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {m.shortLabel}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Recharts Plot Canvas */}
      <div className="px-3 sm:px-5 py-4 h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {activeMetric.chartKind === 'area' ? (
            <AreaChart data={activeMetric.data} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
              <defs>
                {activeMetric.series.map((s) => (
                  <linearGradient key={s.key} id={`rpt-grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={s.color} stopOpacity={0.24} />
                    <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.22} />
              <XAxis
                dataKey="xLabel"
                tick={{ fontSize: 10, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
                minTickGap={22}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                width={52}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1D2126',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  fontSize: '11px',
                  color: '#f8fafc',
                }}
              />
              {activeMetric.series.length > 1 && <Legend wrapperStyle={{ fontSize: '11px' }} />}
              {activeMetric.referenceLines?.map((ref) => (
                <ReferenceLine
                  key={ref.label}
                  y={ref.value}
                  stroke={ref.color}
                  strokeDasharray="4 4"
                  label={{ value: ref.label, fill: ref.color, fontSize: 10, position: 'insideTopRight' }}
                />
              ))}
              {activeMetric.series.map((s, idx) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={idx === 0 ? 2 : 1.5}
                  strokeDasharray={idx > 0 ? '4 3' : undefined}
                  fill={idx === 0 ? `url(#rpt-grad-${s.key})` : 'none'}
                  dot={activeMetric.data.length <= 16 ? { r: 2.5 } : false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          ) : activeMetric.chartKind === 'line' ? (
            <LineChart data={activeMetric.data} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.22} />
              <XAxis
                dataKey="xLabel"
                tick={{ fontSize: 10, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                width={52}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1D2126',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  fontSize: '11px',
                  color: '#f8fafc',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              {activeMetric.referenceLines?.map((ref) => (
                <ReferenceLine
                  key={ref.label}
                  y={ref.value}
                  stroke={ref.color}
                  strokeDasharray="4 4"
                  label={{ value: ref.label, fill: ref.color, fontSize: 10, position: 'insideTopRight' }}
                />
              ))}
              {activeMetric.series.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={activeMetric.data.length <= 18 ? { r: 2.5 } : false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          ) : (
            <BarChart data={activeMetric.data} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.22} />
              <XAxis
                dataKey="xLabel"
                tick={{ fontSize: 10, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
                interval={0}
                angle={activeMetric.data.length > 8 ? -20 : 0}
                textAnchor={activeMetric.data.length > 8 ? 'end' : 'middle'}
                height={activeMetric.data.length > 8 ? 50 : 28}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1D2126',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  fontSize: '11px',
                  color: '#f8fafc',
                }}
              />
              {activeMetric.series.length > 1 && <Legend wrapperStyle={{ fontSize: '11px' }} />}
              {activeMetric.referenceLines?.map((ref) => (
                <ReferenceLine
                  key={ref.label}
                  y={ref.value}
                  stroke={ref.color}
                  strokeDasharray="4 4"
                  label={{ value: ref.label, fill: ref.color, fontSize: 10, position: 'insideTopRight' }}
                />
              ))}
              {activeMetric.series.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={s.color}
                  stackId={activeMetric.chartKind === 'stacked_bar' ? 'stack' : undefined}
                  radius={activeMetric.chartKind === 'stacked_bar' ? [0, 0, 0, 0] : [3, 3, 0, 0]}
                  maxBarSize={44}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

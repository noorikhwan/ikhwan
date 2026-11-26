import { useMemo, useState } from 'react';
import { FacilityTelemetryPoint } from '../engine/types';

export type FacilityChartMetric = 'totalPowerKw' | 'avgCpu' | 'avgTempC' | 'totalNetworkGbps';

const CHART_SERIES_META: Record<
  FacilityChartMetric,
  {
    label: string;
    shortLabel: string;
    unit: string;
    stroke: string;
    fillId: string;
    threshold?: number;
    thresholdLabel?: string;
    minFloor: number;
  }
> = {
  totalPowerKw: {
    label: 'IT Power Load',
    shortLabel: 'Power (kW)',
    unit: ' kW',
    stroke: '#009530',
    fillId: 'grad-power',
    threshold: 18000,
    thresholdLabel: 'Target Cap 18,000 kW',
    minFloor: 0,
  },
  avgCpu: {
    label: 'Fleet CPU Utilization',
    shortLabel: 'CPU (%)',
    unit: '%',
    stroke: '#0284C7',
    fillId: 'grad-cpu',
    threshold: 80,
    thresholdLabel: 'Warn 80%',
    minFloor: 0,
  },
  avgTempC: {
    label: 'Average Exhaust Thermal',
    shortLabel: 'Thermal (°C)',
    unit: '°C',
    stroke: '#D97706',
    fillId: 'grad-temp',
    threshold: 65,
    thresholdLabel: 'Advisory 65°C',
    minFloor: 20,
  },
  totalNetworkGbps: {
    label: 'Aggregate Fabric Throughput',
    shortLabel: 'Network (Gbps)',
    unit: ' Gbps',
    stroke: '#475569',
    fillId: 'grad-net',
    minFloor: 0,
  },
};

interface TelemetryChartProps {
  data: FacilityTelemetryPoint[];
  metric: FacilityChartMetric;
  onMetricChange: (metric: FacilityChartMetric) => void;
  isLive: boolean;
}

export function TelemetryChart({ data, metric, onMetricChange, isLive }: TelemetryChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const meta = CHART_SERIES_META[metric];

  const { points, yTicks, minY, maxY, width, height, padLeft, padRight, padTop, padBottom } =
    useMemo(() => {
      const w = 1080;
      const h = 228;
      const pL = 58;
      const pR = 14;
      const pT = 18;
      const pB = 28;
      const values = data.map((d) => d[metric]);
      const rawMin = Math.min(...values, meta.threshold ?? Infinity);
      const rawMax = Math.max(...values, meta.threshold ?? -Infinity);
      const span = Math.max(4, rawMax - rawMin);
      const lo = Math.max(meta.minFloor, Math.floor(rawMin - span * 0.2));
      const hi = Math.ceil(rawMax + span * 0.18);
      const plotW = w - pL - pR;
      const plotH = h - pT - pB;

      const coords = data.map((d, i) => {
        const x = pL + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2);
        const norm = (d[metric] - lo) / Math.max(1, hi - lo);
        const y = pT + plotH - norm * plotH;
        return { x, y, value: d[metric], label: d.label, point: d };
      });

      const ticks = [0, 0.33, 0.66, 1].map((t) => {
        const val = lo + (hi - lo) * t;
        const y = pT + plotH - t * plotH;
        return { val: Number(val.toFixed(1)), y };
      });

      return {
        points: coords,
        yTicks: ticks,
        minY: lo,
        maxY: hi,
        width: w,
        height: h,
        padLeft: pL,
        padRight: pR,
        padTop: pT,
        padBottom: pB,
      };
    }, [data, metric, meta.minFloor, meta.threshold]);

  const linePath = useMemo(() => {
    if (points.length === 0) return '';
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return '';
    const baseY = height - padBottom;
    return `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${baseY} L ${points[0].x.toFixed(
      1
    )} ${baseY} Z`;
  }, [linePath, points, height, padBottom]);

  const activePoint = hoveredIdx !== null && points[hoveredIdx] ? points[hoveredIdx] : points[points.length - 1];

  const thresholdY =
    meta.threshold !== undefined
      ? padTop +
        (height - padTop - padBottom) -
        ((meta.threshold - minY) / Math.max(1, maxY - minY)) * (height - padTop - padBottom)
      : null;

  return (
    <section
      aria-label="Live Facility Telemetry"
      className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {meta.label}
            </h2>
            {isLive && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#007A27] dark:text-[#3DCD58]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#009530] dark:bg-[#3DCD58]" aria-hidden="true" />
                Streaming
              </span>
            )}
          </div>
          <div className="mt-1 flex items-baseline gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-mono text-xl font-semibold text-slate-900 dark:text-slate-50 tabular-nums">
              {activePoint ? `${activePoint.value}${meta.unit}` : '—'}
            </span>
            <span>Sample {activePoint?.label ?? '—'}</span>
            <span aria-hidden="true">·</span>
            <span>3s polling interval</span>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Telemetry metric selector"
          className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#111418] rounded-md self-start sm:self-auto max-w-full overflow-x-auto"
        >
          {(Object.keys(CHART_SERIES_META) as FacilityChartMetric[]).map((key) => {
            const selected = metric === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onMetricChange(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selected
                    ? 'bg-white dark:bg-[#252A30] text-[#007A27] dark:text-[#3DCD58] shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {CHART_SERIES_META[key].shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto min-h-[168px] max-h-[240px] select-none block"
          role="img"
          aria-label={`${meta.label} time-series chart`}
          onMouseLeave={() => setHoveredIdx(null)}
        >
          <defs>
            <linearGradient id={meta.fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={meta.stroke} stopOpacity="0.16" />
              <stop offset="100%" stopColor={meta.stroke} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Horizontal gridlines */}
          {yTicks.map((tick, idx) => (
            <g key={idx}>
              <line
                x1={padLeft}
                y1={tick.y}
                x2={width - padRight}
                y2={tick.y}
                className="stroke-slate-200 dark:stroke-slate-800"
                strokeWidth="1"
              />
              <text
                x={padLeft - 8}
                y={tick.y + 4}
                textAnchor="end"
                className="fill-slate-500 dark:fill-slate-400 font-mono text-[10px]"
              >
                {tick.val}
              </text>
            </g>
          ))}

          {/* Threshold reference line */}
          {thresholdY !== null && thresholdY >= padTop && thresholdY <= height - padBottom && (
            <g>
              <line
                x1={padLeft}
                y1={thresholdY}
                x2={width - padRight}
                y2={thresholdY}
                stroke="#DC2626"
                strokeOpacity="0.45"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <text
                x={width - padRight - 4}
                y={thresholdY - 5}
                textAnchor="end"
                className="fill-red-600 dark:fill-red-400 font-mono text-[10px]"
              >
                {meta.thresholdLabel}
              </text>
            </g>
          )}

          {/* Area fill and stroke */}
          <path d={areaPath} fill={`url(#${meta.fillId})`} />
          <path d={linePath} fill="none" stroke={meta.stroke} strokeWidth="2" strokeLinejoin="round" />

          {/* Active point marker */}
          {activePoint && (
            <g>
              <line
                x1={activePoint.x}
                y1={padTop}
                x2={activePoint.x}
                y2={height - padBottom}
                className="stroke-slate-300 dark:stroke-slate-700"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r="4"
                fill={meta.stroke}
                className="stroke-white dark:stroke-slate-900"
                strokeWidth="2"
              />
            </g>
          )}

          {/* X-axis sparse labels */}
          {points
            .filter((_, i) => i === 0 || i === Math.floor(points.length / 2) || i === points.length - 1)
            .map((pt, idx) => (
              <text
                key={idx}
                x={pt.x}
                y={height - 8}
                textAnchor={idx === 0 ? 'start' : idx === 2 ? 'end' : 'middle'}
                className="fill-slate-500 dark:fill-slate-400 font-mono text-[10px]"
              >
                {pt.label}
              </text>
            ))}

          {/* Invisible hit columns for smooth pointer inspection */}
          {points.map((pt, idx) => {
            const stepW = (width - padLeft - padRight) / Math.max(1, points.length - 1);
            return (
              <rect
                key={idx}
                x={pt.x - stepW / 2}
                y={padTop}
                width={stepW}
                height={height - padTop - padBottom}
                fill="transparent"
                onMouseEnter={() => setHoveredIdx(idx)}
              />
            );
          })}
        </svg>
      </div>
    </section>
  );
}

export function MiniSparkline({
  values,
  stroke = '#009530',
}: {
  values: number[];
  stroke?: string;
  minVal?: number;
  maxVal?: number;
}) {
  const w = 180;
  const h = 42;
  const padX = 4;
  const padY = 5;
  const rawMin = values.length > 0 ? Math.min(...values) : 0;
  const rawMax = values.length > 0 ? Math.max(...values) : 100;
  const span = Math.max(4, rawMax - rawMin);
  const lo = rawMin - span * 0.25;
  const hi = rawMax + span * 0.25;

  const coords = values.map((v, i) => {
    const x =
      padX + (values.length > 1 ? (i / (values.length - 1)) * (w - padX * 2) : (w - padX * 2) / 2);
    const y = h - padY - ((v - lo) / Math.max(0.01, hi - lo)) * (h - padY * 2);
    return { x, y };
  });

  const line = coords
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(' ');
  const area =
    coords.length > 0
      ? `${line} L ${coords[coords.length - 1].x.toFixed(1)} ${h - padY} L ${coords[0].x.toFixed(
          1
        )} ${h - padY} Z`
      : '';
  const last = coords[coords.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10 block" aria-hidden="true">
      {area && <path d={area} fill={stroke} fillOpacity="0.1" />}
      {line && <path d={line} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinejoin="round" />}
      {last && <circle cx={last.x} cy={last.y} r="2.5" fill={stroke} />}
    </svg>
  );
}

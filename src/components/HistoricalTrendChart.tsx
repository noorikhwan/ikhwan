import { useMemo, useState } from 'react';
import {
  formatSignedDelta,
  formatTrendValue,
  getPointMetricValue,
  getPointSecondaryValue,
  HistoricalTrendPoint,
  HistoricalTrendSummary,
  TREND_METRIC_MAP,
  TREND_METRICS,
  TrendMetricId,
} from '../engine/historicalTrends';

interface HistoricalTrendChartProps {
  points: HistoricalTrendPoint[];
  metricId: TrendMetricId;
  onMetricChange: (metric: TrendMetricId) => void;
  summary: HistoricalTrendSummary;
  scopeCaption: string;
}

const SVG_W = 1080;
const SVG_H = 264;
const PAD_LEFT = 56;
const PAD_RIGHT = 20;
const PAD_TOP = 24;
const PAD_BOTTOM = 34;
const PLOT_W = SVG_W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = SVG_H - PAD_TOP - PAD_BOTTOM;

export function HistoricalTrendChart({
  points,
  metricId,
  onMetricChange,
  summary,
  scopeCaption,
}: HistoricalTrendChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const meta = TREND_METRIC_MAP[metricId];

  const chartModel = useMemo(() => {
    if (points.length === 0) return null;

    const primaryVals = points.map((p) => getPointMetricValue(p, metricId));
    const secondaryVals = points
      .map((p) => getPointSecondaryValue(p, metricId))
      .filter((v): v is number => v !== null);

    const allVals = [...primaryVals, ...secondaryVals];
    if (meta.benchmark) allVals.push(meta.benchmark.value);

    let rawMin = Math.min(...allVals);
    let rawMax = Math.max(...allVals);

    // Ensure SLA band or comfortable visual padding is visible
    if (metricId === 'coldAisleTempC') {
      rawMin = Math.min(rawMin, 17.5);
      rawMax = Math.max(rawMax, 27.5);
    } else if (metricId === 'coldAisleHumidityPct') {
      rawMin = Math.min(rawMin, 38);
      rawMax = Math.max(rawMax, 62);
    } else if (metricId === 'slaCompliancePct') {
      rawMin = Math.min(rawMin, 99.65);
      rawMax = 100.02;
    } else if (metricId === 'pue') {
      rawMin = Math.min(rawMin, 1.15);
      rawMax = Math.max(rawMax, 1.38);
    } else {
      const span = Math.max(0.2, rawMax - rawMin);
      rawMin = Math.max(0, rawMin - span * 0.18);
      rawMax = rawMax + span * 0.14;
    }

    const yRange = Math.max(0.01, rawMax - rawMin);
    const xFor = (idx: number) =>
      points.length === 1
        ? PAD_LEFT + PLOT_W / 2
        : PAD_LEFT + (idx / (points.length - 1)) * PLOT_W;
    const yFor = (val: number) =>
      PAD_TOP + PLOT_H - ((val - rawMin) / yRange) * PLOT_H;

    const primaryCoords = points.map((p, i) => ({
      x: xFor(i),
      y: yFor(primaryVals[i]),
      val: primaryVals[i],
      point: p,
    }));

    const primaryPath = primaryCoords
      .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(' ');

    const areaPath =
      primaryCoords.length > 0
        ? `${primaryPath} L ${primaryCoords[primaryCoords.length - 1].x.toFixed(1)} ${(
            PAD_TOP + PLOT_H
          ).toFixed(1)} L ${primaryCoords[0].x.toFixed(1)} ${(PAD_TOP + PLOT_H).toFixed(1)} Z`
        : '';

    const secondaryCoords =
      secondaryVals.length === points.length
        ? points.map((p, i) => {
            const sv = getPointSecondaryValue(p, metricId) ?? primaryVals[i];
            return { x: xFor(i), y: yFor(sv), val: sv };
          })
        : null;

    const secondaryPath = secondaryCoords
      ? secondaryCoords
          .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
          .join(' ')
      : null;

    // 4 horizontal grid ticks
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const val = rawMin + (1 - t) * yRange;
      return { y: PAD_TOP + t * PLOT_H, val };
    });

    // Year boundaries (every Jan after index 0, plus the first year label if it has >= 44px clearance)
    const yearBoundaries: Array<{ x: number; year: number; isStart: boolean }> = [];
    const firstJanIdx = points.findIndex((p, idx) => idx > 0 && p.monthIndex === 0);
    const hasStartClearance = firstJanIdx === -1 || xFor(firstJanIdx) - xFor(0) >= 44;

    points.forEach((p, idx) => {
      if (idx === 0 && hasStartClearance) {
        yearBoundaries.push({ x: xFor(idx), year: p.year, isStart: true });
      } else if (idx > 0 && p.monthIndex === 0) {
        yearBoundaries.push({ x: xFor(idx), year: p.year, isStart: false });
      }
    });

    // Evenly spaced X-axis labels without overlap
    const labelStep = points.length <= 12 ? 1 : points.length <= 18 ? 2 : points.length <= 24 ? 3 : 4;
    const xLabels = points
      .map((p, idx) => ({ idx, x: xFor(idx), text: p.shortLabel }))
      .filter((item) => item.idx === 0 || item.idx === points.length - 1 || item.idx % labelStep === 0);

    // Filter out penultimate label if too close to final label
    const cleanedXLabels = xLabels.filter((item, i) => {
      if (i === xLabels.length - 2) {
        const last = xLabels[xLabels.length - 1];
        return last.x - item.x > 46;
      }
      return true;
    });

    return {
      rawMin,
      rawMax,
      yFor,
      xFor,
      primaryCoords,
      primaryPath,
      areaPath,
      secondaryCoords,
      secondaryPath,
      yTicks,
      yearBoundaries,
      xLabels: cleanedXLabels,
    };
  }, [points, metricId, meta.benchmark]);

  const activeIdx =
    hoverIndex !== null && hoverIndex >= 0 && hoverIndex < points.length
      ? hoverIndex
      : points.length - 1;
  const activePoint = points[activeIdx];
  const activePrimaryVal = activePoint ? getPointMetricValue(activePoint, metricId) : 0;
  const activeSecondaryVal = activePoint ? getPointSecondaryValue(activePoint, metricId) : null;

  // YoY comparison for the hovered/active point (12 months prior)
  const yoyPriorPoint = activeIdx >= 12 ? points[activeIdx - 12] : null;
  const activeYoyDelta =
    yoyPriorPoint && activePoint
      ? Number((activePrimaryVal - getPointMetricValue(yoyPriorPoint, metricId)).toFixed(meta.decimals))
      : null;

  const gradId = `hist-grad-${metricId}`;

  return (
    <div className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
      {/* Header Row: Active Readout + Metric Switcher */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
              {meta.label} History
            </h3>
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              {summary.yearSpanLabel} · {scopeCaption}
            </span>
          </div>
          {activePoint && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums">
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {activePoint.label}:{' '}
                <span style={{ color: meta.stroke }}>
                  {formatTrendValue(activePrimaryVal, meta)}
                </span>
              </span>
              {activeSecondaryVal !== null && meta.secondaryLabel && (
                <span className="text-slate-500 dark:text-slate-400">
                  Peak:{' '}
                  <span className="text-slate-800 dark:text-slate-200 font-medium">
                    {formatTrendValue(activeSecondaryVal, meta)}
                  </span>
                </span>
              )}
              {activeYoyDelta !== null && yoyPriorPoint ? (
                <span
                  className={
                    meta.lowerIsBetter
                      ? activeYoyDelta <= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-600 dark:text-slate-300'
                  }
                >
                  YoY vs {yoyPriorPoint.shortLabel}: {formatSignedDelta(activeYoyDelta, meta)}
                </span>
              ) : (
                <span className="text-slate-400 dark:text-slate-500">
                  Hover months to inspect YoY variance
                </span>
              )}
            </div>
          )}
        </div>

        {/* Segmented Metric Tabs */}
        <div
          className="inline-flex flex-wrap items-center rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#13171B] p-0.5 self-start lg:self-auto"
          role="tablist"
          aria-label="Historical trend metric selector"
        >
          {TREND_METRICS.map((m) => {
            const active = m.id === metricId;
            return (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onMetricChange(m.id)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-sm transition-colors cursor-pointer ${
                  active
                    ? 'bg-white dark:bg-[#232A32] text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {m.shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* SVG Plot Area */}
      <div className="px-2 pt-2 pb-1">
        {chartModel ? (
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="w-full h-[240px] sm:h-[268px] select-none overflow-visible"
            onMouseLeave={() => setHoverIndex(null)}
            role="img"
            aria-label={`${meta.label} historical trend chart from ${summary.startLabel} to ${summary.currentLabel}`}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={meta.stroke} stopOpacity="0.22" />
                <stop offset="100%" stopColor={meta.stroke} stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* Optional ASHRAE SLA Envelope Band */}
            {meta.slaBand && (
              <g>
                <rect
                  x={PAD_LEFT}
                  y={Math.max(PAD_TOP, chartModel.yFor(meta.slaBand.max))}
                  width={PLOT_W}
                  height={Math.max(
                    0,
                    Math.min(PAD_TOP + PLOT_H, chartModel.yFor(meta.slaBand.min)) -
                      Math.max(PAD_TOP, chartModel.yFor(meta.slaBand.max))
                  )}
                  className="fill-emerald-500/[0.06] dark:fill-emerald-400/[0.07]"
                />
                <line
                  x1={PAD_LEFT}
                  x2={PAD_LEFT + PLOT_W}
                  y1={chartModel.yFor(meta.slaBand.max)}
                  y2={chartModel.yFor(meta.slaBand.max)}
                  stroke="#10b981"
                  strokeOpacity="0.45"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <line
                  x1={PAD_LEFT}
                  x2={PAD_LEFT + PLOT_W}
                  y1={chartModel.yFor(meta.slaBand.min)}
                  y2={chartModel.yFor(meta.slaBand.min)}
                  stroke="#10b981"
                  strokeOpacity="0.45"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
              </g>
            )}

            {/* Horizontal Y-Axis Gridlines & Labels */}
            {chartModel.yTicks.map((tick, idx) => (
              <g key={idx}>
                <line
                  x1={PAD_LEFT}
                  x2={PAD_LEFT + PLOT_W}
                  y1={tick.y}
                  y2={tick.y}
                  className="stroke-slate-200 dark:stroke-slate-800"
                  strokeWidth="1"
                />
                <text
                  x={PAD_LEFT - 8}
                  y={tick.y + 3.5}
                  textAnchor="end"
                  className="fill-slate-400 dark:fill-slate-500 font-mono text-[10px]"
                >
                  {tick.val.toFixed(meta.decimals === 3 ? 2 : meta.decimals)}
                </text>
              </g>
            ))}

            {/* Vertical Year Boundary Dividers */}
            {chartModel.yearBoundaries.map((yb) => (
              <g key={`${yb.year}-${yb.isStart ? 's' : 'b'}`}>
                {!yb.isStart && (
                  <line
                    x1={yb.x}
                    x2={yb.x}
                    y1={PAD_TOP}
                    y2={PAD_TOP + PLOT_H}
                    className="stroke-slate-300 dark:stroke-slate-700"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                )}
                <text
                  x={yb.x + 4}
                  y={PAD_TOP - 8}
                  className="fill-slate-500 dark:fill-slate-400 font-mono text-[10px] font-semibold"
                >
                  {yb.year}
                </text>
              </g>
            ))}

            {/* Optional Benchmark Line */}
            {meta.benchmark && (
              <g>
                <line
                  x1={PAD_LEFT}
                  x2={PAD_LEFT + PLOT_W}
                  y1={chartModel.yFor(meta.benchmark.value)}
                  y2={chartModel.yFor(meta.benchmark.value)}
                  stroke="#64748b"
                  strokeOpacity="0.65"
                  strokeDasharray="5 4"
                  strokeWidth="1.2"
                />
                <text
                  x={PAD_LEFT + PLOT_W - 4}
                  y={chartModel.yFor(meta.benchmark.value) - 5}
                  textAnchor="end"
                  className="fill-slate-500 dark:fill-slate-400 font-mono text-[10px]"
                >
                  {meta.benchmark.label}
                </text>
              </g>
            )}

            {/* Area Fill & Primary Line */}
            <path d={chartModel.areaPath} fill={`url(#${gradId})`} />
            <path
              d={chartModel.primaryPath}
              fill="none"
              stroke={meta.stroke}
              strokeWidth="2.1"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Secondary Peak Line */}
            {chartModel.secondaryPath && meta.secondaryStroke && (
              <path
                d={chartModel.secondaryPath}
                fill="none"
                stroke={meta.secondaryStroke}
                strokeWidth="1.4"
                strokeDasharray="4 3"
                strokeLinejoin="round"
                strokeOpacity="0.85"
              />
            )}

            {/* Active / Hovered Crosshair & Dots */}
            {chartModel.primaryCoords[activeIdx] && (
              <g>
                <line
                  x1={chartModel.primaryCoords[activeIdx].x}
                  x2={chartModel.primaryCoords[activeIdx].x}
                  y1={PAD_TOP}
                  y2={PAD_TOP + PLOT_H}
                  className="stroke-slate-400 dark:stroke-slate-500"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                {chartModel.secondaryCoords && chartModel.secondaryCoords[activeIdx] && meta.secondaryStroke && (
                  <circle
                    cx={chartModel.secondaryCoords[activeIdx].x}
                    cy={chartModel.secondaryCoords[activeIdx].y}
                    r="3.5"
                    fill={meta.secondaryStroke}
                    className="stroke-white dark:stroke-[#1B2026]"
                    strokeWidth="1.5"
                  />
                )}
                <circle
                  cx={chartModel.primaryCoords[activeIdx].x}
                  cy={chartModel.primaryCoords[activeIdx].y}
                  r="4.5"
                  fill={meta.stroke}
                  className="stroke-white dark:stroke-[#1B2026]"
                  strokeWidth="2"
                />
              </g>
            )}

            {/* X-Axis Month Labels */}
            {chartModel.xLabels.map((lbl) => (
              <text
                key={lbl.idx}
                x={lbl.x}
                y={SVG_H - 10}
                textAnchor={
                  lbl.idx === 0 ? 'start' : lbl.idx === points.length - 1 ? 'end' : 'middle'
                }
                className="fill-slate-400 dark:fill-slate-500 font-mono text-[10px]"
              >
                {lbl.text}
              </text>
            ))}

            {/* Interactive Hover Targets per Month */}
            {chartModel.primaryCoords.map((coord, idx) => {
              const colW = PLOT_W / Math.max(1, points.length);
              return (
                <rect
                  key={coord.point.monthKey}
                  x={Math.max(PAD_LEFT, coord.x - colW / 2)}
                  y={PAD_TOP}
                  width={colW}
                  height={PLOT_H}
                  fill="transparent"
                  className="cursor-crosshair"
                  onMouseEnter={() => setHoverIndex(idx)}
                />
              );
            })}
          </svg>
        ) : (
          <div className="h-[240px] flex items-center justify-center text-[12px] text-slate-400">
            No historical samples available for this scope.
          </div>
        )}
      </div>

      {/* Footer Legend Strip (flat unboxed inline metadata) */}
      <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#15191E] flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 rounded-full" style={{ backgroundColor: meta.stroke }} />
            <span>{meta.label} (Monthly Mean)</span>
          </span>
          {meta.secondaryLabel && meta.secondaryStroke && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-0 border-t border-dashed"
                style={{ borderColor: meta.secondaryStroke }}
              />
              <span>{meta.secondaryLabel}</span>
            </span>
          )}
          {meta.slaBand && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2 bg-emerald-500/20 border border-emerald-500/50 rounded-[1px]" />
              <span>{meta.slaBand.label}</span>
            </span>
          )}
          {meta.benchmark && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-0 border-t border-dashed border-slate-500" />
              <span>{meta.benchmark.label}</span>
            </span>
          )}
        </div>
        <div className="font-mono tabular-nums text-[11px] text-slate-600 dark:text-slate-300">
          3M Linear Projection:{' '}
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {formatTrendValue(summary.forecastNextQuarter, meta)}
          </span>{' '}
          <span className="text-slate-400">({formatSignedDelta(summary.forecastDelta, meta)})</span>
        </div>
      </div>
    </div>
  );
}

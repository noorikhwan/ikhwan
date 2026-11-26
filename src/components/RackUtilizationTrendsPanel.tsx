import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { TrendingUp } from 'lucide-react';
import {
  CapacityGrowthPattern,
  RackUtilizationTrendsSummary,
  UtilizationTrendPoint,
} from '../engine/rackUtilizationTrendEngine';
import { HallId } from '../engine/types';

interface RackUtilizationTrendsPanelProps {
  trends: RackUtilizationTrendsSummary;
  onSelectHall: (hallId: HallId) => void;
}

type TrendScope = 'active' | 'all-halls';

const X_TICKS = [0, 6, 12, 18, 24];
const Y_PCT_TICKS = [0, 25, 50, 75, 100];

function formatSignedPct(val: number): string {
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(1)} pp`;
}

function patternTextColor(pattern: CapacityGrowthPattern): string {
  if (pattern === 'Accelerating Growth') return 'text-amber-700 dark:text-amber-400 font-semibold';
  if (pattern === 'Steady Growth') return 'text-[#007A27] dark:text-[#3DCD58] font-medium';
  if (pattern === 'Load Easing') return 'text-sky-700 dark:text-sky-400 font-medium';
  return 'text-slate-600 dark:text-slate-400 font-medium';
}

function useContainerWidth(initialWidth: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number>(initialWidth);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      if (w > 120) setWidth(w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}

export function RackUtilizationTrendsPanel({
  trends,
  onSelectHall,
}: RackUtilizationTrendsPanelProps) {
  const [scope, setScope] = useState<TrendScope>('active');
  const [showTrendline, setShowTrendline] = useState<boolean>(true);
  const [hoveredHourIndex, setHoveredHourIndex] = useState<number | null>(null);

  const primaryChartBox = useContainerWidth(640);
  const secondaryChartBox = useContainerWidth(420);

  const { activeHall, allHalls } = trends;
  const { analytics, points } = activeHall;

  const inspectedIndex = hoveredHourIndex ?? 24;
  const inspectedPoint: UtilizationTrendPoint =
    points[inspectedIndex] ?? points[points.length - 1];

  // --- Chart 1 (Primary D3 Line Chart): Power Util %, U-Space %, Linear Trendline OR All 4 Halls ---
  const chart1Height = 224;
  const chart1Margin = { top: 14, right: 16, bottom: 26, left: 38 };
  const chart1InnerW = Math.max(180, primaryChartBox.width - chart1Margin.left - chart1Margin.right);
  const chart1InnerH = chart1Height - chart1Margin.top - chart1Margin.bottom;

  const chart1 = useMemo(() => {
    const xScale = d3.scaleLinear().domain([0, 24]).range([0, chart1InnerW]);
    const yScale = d3.scaleLinear().domain([0, 100]).range([chart1InnerH, 0]);

    const powerLineGen = d3
      .line<UtilizationTrendPoint>()
      .x((d) => xScale(d.hourIndex))
      .y((d) => yScale(d.powerUtilPct))
      .curve(d3.curveMonotoneX);

    const powerAreaGen = d3
      .area<UtilizationTrendPoint>()
      .x((d) => xScale(d.hourIndex))
      .y0(chart1InnerH)
      .y1((d) => yScale(d.powerUtilPct))
      .curve(d3.curveMonotoneX);

    const uSpaceLineGen = d3
      .line<UtilizationTrendPoint>()
      .x((d) => xScale(d.hourIndex))
      .y((d) => yScale(d.uSpaceUtilPct))
      .curve(d3.curveMonotoneX);

    const hallLines = allHalls.map((h) => ({
      hallId: h.hallId,
      label: h.hallShortLabel,
      color: h.color,
      path: powerLineGen(h.points) ?? '',
      currentPct: h.analytics.currentPowerUtilPct,
      delta24hPct: h.analytics.delta24hPct,
      points: h.points,
    }));

    return {
      xScale,
      yScale,
      powerPath: powerLineGen(points) ?? '',
      powerAreaPath: powerAreaGen(points) ?? '',
      uSpacePath: uSpaceLineGen(points) ?? '',
      thresholdY: yScale(85),
      trendStartY: yScale(analytics.trendLineStartPct),
      trendEndY: yScale(analytics.trendLineEndPct),
      hallLines,
    };
  }, [chart1InnerW, chart1InnerH, points, allHalls, analytics]);

  // --- Chart 2 (Secondary D3 Dual-Axis Line Chart): High-Load Cabinet % + Cumulative 24h Growth Delta (pp) ---
  const chart2Height = 224;
  const chart2Margin = { top: 14, right: 40, bottom: 26, left: 38 };
  const chart2InnerW = Math.max(160, secondaryChartBox.width - chart2Margin.left - chart2Margin.right);
  const chart2InnerH = chart2Height - chart2Margin.top - chart2Margin.bottom;

  const chart2 = useMemo(() => {
    const xScale = d3.scaleLinear().domain([0, 24]).range([0, chart2InnerW]);

    const maxHighLoad = Math.max(25, d3.max(points, (d) => d.highLoadRacksPct) ?? 30);
    const yLeftMax = Math.min(100, Math.ceil(maxHighLoad / 10) * 10 + 10);
    const yLeftScale = d3.scaleLinear().domain([0, yLeftMax]).range([chart2InnerH, 0]);

    const minDelta = Math.min(-2, d3.min(points, (d) => d.deltaFromStartPct) ?? -2);
    const maxDelta = Math.max(4, d3.max(points, (d) => d.deltaFromStartPct) ?? 6);
    const padMin = Math.floor(minDelta / 2) * 2;
    const padMax = Math.ceil(maxDelta / 2) * 2;
    const yRightScale = d3.scaleLinear().domain([padMin, padMax]).range([chart2InnerH, 0]);

    const highLoadLineGen = d3
      .line<UtilizationTrendPoint>()
      .x((d) => xScale(d.hourIndex))
      .y((d) => yLeftScale(d.highLoadRacksPct))
      .curve(d3.curveMonotoneX);

    const highLoadAreaGen = d3
      .area<UtilizationTrendPoint>()
      .x((d) => xScale(d.hourIndex))
      .y0(chart2InnerH)
      .y1((d) => yLeftScale(d.highLoadRacksPct))
      .curve(d3.curveMonotoneX);

    const deltaLineGen = d3
      .line<UtilizationTrendPoint>()
      .x((d) => xScale(d.hourIndex))
      .y((d) => yRightScale(d.deltaFromStartPct))
      .curve(d3.curveMonotoneX);

    return {
      xScale,
      yLeftScale,
      yRightScale,
      yLeftTicks: yLeftScale.ticks(4),
      yRightTicks: yRightScale.ticks(4),
      zeroDeltaY: yRightScale(0),
      highLoadPath: highLoadLineGen(points) ?? '',
      highLoadAreaPath: highLoadAreaGen(points) ?? '',
      deltaPath: deltaLineGen(points) ?? '',
    };
  }, [chart2InnerW, chart2InnerH, points]);

  const handlePointerScrub = (
    clientX: number,
    svgEl: SVGSVGElement,
    marginLeft: number,
    innerW: number
  ) => {
    const rect = svgEl.getBoundingClientRect();
    const relX = clientX - rect.left - marginLeft;
    const clampedX = Math.max(0, Math.min(innerW, relX));
    const exactHour = (clampedX / Math.max(1, innerW)) * 24;
    const nearest = Math.max(0, Math.min(24, Math.round(exactHour)));
    setHoveredHourIndex(nearest);
  };

  const handleKeyScrub = (key: string) => {
    if (key === 'ArrowLeft') {
      setHoveredHourIndex((prev) => Math.max(0, (prev ?? 24) - 1));
    } else if (key === 'ArrowRight') {
      setHoveredHourIndex((prev) => Math.min(24, (prev ?? 24) + 1));
    } else if (key === 'Escape') {
      setHoveredHourIndex(null);
    }
  };

  return (
    <section
      aria-label="24-hour rack utilization trends and capacity growth summary"
      data-testid="rack-utilization-trends-panel"
      data-scope={scope}
      data-hall={activeHall.hallId}
      data-trendline={showTrendline ? 'true' : 'false'}
      className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-4 space-y-4"
    >
      {/* Header + Scope / Trendline Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            24-Hour Rack Utilization Trends &amp; Capacity Growth
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {scope === 'active'
              ? `${activeHall.hallLabel} · Rolling 24h power & U-space occupancy with OLS capacity growth trend`
              : `Campus comparison (Halls A–D) · Avg ${trends.campusAvgPowerUtilPct.toFixed(1)}% · Fastest growth: ${trends.fastestGrowingHallLabel} (${formatSignedPct(trends.fastestGrowingDelta24hPct)})`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label="Utilization trend chart scope"
            className="inline-flex items-center gap-0.5 p-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#14181D]"
          >
            <button
              type="button"
              data-testid="trend-scope-active"
              aria-pressed={scope === 'active'}
              onClick={() => setScope('active')}
              className={`px-2.5 py-1 text-xs font-medium rounded-xs cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                scope === 'active'
                  ? 'bg-white dark:bg-[#252A30] text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {activeHall.hallShortLabel}
            </button>
            <button
              type="button"
              data-testid="trend-scope-all-halls"
              aria-pressed={scope === 'all-halls'}
              onClick={() => setScope('all-halls')}
              className={`px-2.5 py-1 text-xs font-medium rounded-xs cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                scope === 'all-halls'
                  ? 'bg-white dark:bg-[#252A30] text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              All 4 Halls
            </button>
          </div>

          {scope === 'active' && (
            <button
              type="button"
              data-testid="trend-toggle-regression-btn"
              aria-pressed={showTrendline}
              onClick={() => setShowTrendline((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                showTrendline
                  ? 'bg-slate-900 dark:bg-slate-100 border-slate-900 dark:border-slate-100 text-white dark:text-slate-900'
                  : 'bg-white dark:bg-[#14181D] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
              Growth Trendline
            </button>
          )}
        </div>
      </div>

      {/* 4-Column Unboxed Summary KPI Strip */}
      <div
        data-testid="rack-trends-kpi-strip"
        className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-slate-800 pb-3 border-b border-slate-100 dark:border-slate-800"
      >
        <div className="pr-4 py-1">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Current Power Utilization
          </div>
          <div className="mt-0.5 flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              {analytics.currentPowerUtilPct.toFixed(1)}%
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {analytics.currentPowerMw.toFixed(2)} / {analytics.capacityMw.toFixed(1)} MW
            </span>
          </div>
        </div>

        <div className="sm:px-4 py-1">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            24h Capacity Growth Pattern
          </div>
          <div className="mt-0.5 flex items-baseline gap-2 font-mono tabular-nums">
            <span
              className={`text-lg font-semibold ${
                analytics.delta24hPct > 0
                  ? 'text-amber-700 dark:text-amber-400'
                  : analytics.delta24hPct < 0
                  ? 'text-sky-700 dark:text-sky-400'
                  : 'text-slate-800 dark:text-slate-200'
              }`}
            >
              {formatSignedPct(analytics.delta24hPct)}
            </span>
            <span className={`text-[11px] font-sans ${patternTextColor(analytics.patternLabel)}`}>
              {analytics.patternLabel}
            </span>
          </div>
        </div>

        <div className="sm:px-4 py-1">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            24h Peak &amp; Headroom
          </div>
          <div className="mt-0.5 flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              {analytics.peakPowerUtilPct.toFixed(1)}%
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              at {analytics.peakHourLabel} · {(analytics.headroomKw / 1000).toFixed(2)} MW free
            </span>
          </div>
        </div>

        <div className="sm:pl-4 py-1">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            U-Space &amp; 85% SLA Runway
          </div>
          <div className="mt-0.5 flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-lg font-semibold text-indigo-700 dark:text-indigo-300">
              {analytics.currentUSpacePct.toFixed(1)}%
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {analytics.daysToThreshold85 === 0
                ? 'At 85% SLA'
                : analytics.daysToThreshold85 !== null
                ? `~${analytics.daysToThreshold85}d to 85% cap`
                : 'Within 85% SLA'}
            </span>
          </div>
        </div>
      </div>

      {/* Synchronized Interactive Telemetry Readout Strip */}
      <div
        data-testid="d3-trend-hover-readout"
        className="px-3 py-1.5 rounded-sm bg-slate-50 dark:bg-[#14181D] border border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums"
      >
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-slate-700 dark:text-slate-300">
          <span className="font-semibold text-slate-900 dark:text-white">
            {inspectedPoint.hourLabel === 'Now'
              ? 'Now (Live BMS)'
              : `${inspectedPoint.hourLabel} (${inspectedPoint.clockLabel})`}
          </span>
          <span aria-hidden="true" className="text-slate-400">·</span>
          <span>
            Power{' '}
            <strong className="text-[#007A27] dark:text-[#3DCD58]">
              {inspectedPoint.powerUtilPct.toFixed(1)}%
            </strong>{' '}
            ({inspectedPoint.totalPowerMw.toFixed(2)} MW)
          </span>
          <span aria-hidden="true" className="text-slate-400">·</span>
          <span>
            U-Space{' '}
            <strong className="text-indigo-700 dark:text-indigo-300">
              {inspectedPoint.uSpaceUtilPct.toFixed(1)}%
            </strong>
          </span>
          <span aria-hidden="true" className="text-slate-400">·</span>
          <span>
            High-Load ≥75%:{' '}
            <strong className="text-orange-700 dark:text-orange-400">
              {inspectedPoint.highLoadRackCount} racks ({inspectedPoint.highLoadRacksPct.toFixed(1)}%)
            </strong>
          </span>
        </div>
        <div className="text-slate-600 dark:text-slate-400 whitespace-nowrap">
          vs -24h:{' '}
          <strong className="text-cyan-700 dark:text-cyan-400">
            {formatSignedPct(inspectedPoint.deltaFromStartPct)}
          </strong>{' '}
          · 7d Proj {analytics.projected7dPct.toFixed(1)}%
        </div>
      </div>

      {/* Dual D3 Line Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Primary D3 Chart: 24h Utilization Trend & Capacity Growth */}
        <div className="lg:col-span-7 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {scope === 'active'
                ? `${activeHall.hallShortLabel} Power & U-Space Utilization (24h)`
                : 'All Data Halls Power Utilization Comparison (24h)'}
            </span>
            {scope === 'active' ? (
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span className="w-3 h-0.5 bg-[#009530] dark:bg-[#3DCD58]" aria-hidden="true" />
                  Power Util %
                </span>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span className="w-3 h-0.5 bg-indigo-600 dark:bg-indigo-400" aria-hidden="true" />
                  U-Space %
                </span>
                {showTrendline && (
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <span
                      className="w-3 h-0 border-t border-dashed border-slate-700 dark:border-slate-300"
                      aria-hidden="true"
                    />
                    Linear Trend ({analytics.growthSlopePctPerHour >= 0 ? '+' : ''}
                    {analytics.growthSlopePctPerHour.toFixed(2)}%/h)
                  </span>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2.5 text-[11px]">
                {chart1.hallLines.map((hl) => (
                  <button
                    key={hl.hallId}
                    type="button"
                    onClick={() => onSelectHall(hl.hallId)}
                    className={`inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-opacity ${
                      hl.hallId === activeHall.hallId
                        ? 'font-semibold text-slate-900 dark:text-white'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <span
                      className="w-2.5 h-0.5 shrink-0"
                      style={{ backgroundColor: hl.color }}
                      aria-hidden="true"
                    />
                    {hl.label}{' '}
                    <span className="font-mono tabular-nums">
                      ({formatSignedPct(hl.delta24hPct)})
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div ref={primaryChartBox.ref} className="w-full">
            <svg
              role="img"
              tabIndex={0}
              aria-label="D3 line chart of 24-hour rack power and U-space utilization trends"
              data-testid="d3-utilization-trend-chart"
              width={primaryChartBox.width}
              height={chart1Height}
              className="block w-full overflow-visible focus:outline-none focus-visible:ring-2 focus-visible:ring-[#009530]/40 rounded-xs"
              onMouseMove={(e) =>
                handlePointerScrub(
                  e.clientX,
                  e.currentTarget,
                  chart1Margin.left,
                  chart1InnerW
                )
              }
              onMouseLeave={() => setHoveredHourIndex(null)}
              onKeyDown={(e) => handleKeyScrub(e.key)}
            >
              <defs>
                <linearGradient id="rackUtilPowerAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#009530" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#009530" stopOpacity={0.01} />
                </linearGradient>
              </defs>

              <g transform={`translate(${chart1Margin.left},${chart1Margin.top})`}>
                {/* Horizontal gridlines & Y ticks */}
                {Y_PCT_TICKS.map((tick) => {
                  const y = chart1.yScale(tick);
                  return (
                    <g key={tick}>
                      <line
                        x1={0}
                        x2={chart1InnerW}
                        y1={y}
                        y2={y}
                        className="stroke-slate-100 dark:stroke-slate-800"
                        strokeWidth={1}
                      />
                      <text
                        x={-8}
                        y={y + 3.5}
                        textAnchor="end"
                        className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono"
                      >
                        {tick}%
                      </text>
                    </g>
                  );
                })}

                {/* 85% Capacity SLA Reference Line */}
                <line
                  x1={0}
                  x2={chart1InnerW}
                  y1={chart1.thresholdY}
                  y2={chart1.thresholdY}
                  stroke="#DC2626"
                  strokeOpacity={0.65}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <text
                  x={chart1InnerW - 2}
                  y={chart1.thresholdY - 4}
                  textAnchor="end"
                  className="fill-red-600 dark:fill-red-400 text-[10px] font-mono"
                >
                  85% Cap Threshold
                </text>

                {/* X Axis Ticks */}
                {X_TICKS.map((tick) => {
                  const x = chart1.xScale(tick);
                  const pt = points[tick];
                  return (
                    <g key={tick} transform={`translate(${x},${chart1InnerH})`}>
                      <line
                        y1={0}
                        y2={4}
                        className="stroke-slate-300 dark:stroke-slate-700"
                      />
                      <text
                        y={16}
                        textAnchor={tick === 0 ? 'start' : tick === 24 ? 'end' : 'middle'}
                        className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
                      >
                        {pt?.hourLabel ?? (tick === 24 ? 'Now' : `-${24 - tick}h`)}
                      </text>
                    </g>
                  );
                })}

                {scope === 'active' ? (
                  <>
                    {/* Soft power utilization area */}
                    <path d={chart1.powerAreaPath} fill="url(#rackUtilPowerAreaGrad)" />

                    {/* Rack U-Space Utilization Line */}
                    <path
                      data-testid="d3-uspace-line"
                      d={chart1.uSpacePath}
                      fill="none"
                      stroke="#4F46E5"
                      strokeWidth={1.75}
                      strokeLinecap="round"
                    />

                    {/* Power Capacity Utilization Line */}
                    <path
                      data-testid="d3-power-util-line"
                      d={chart1.powerPath}
                      fill="none"
                      stroke="#009530"
                      strokeWidth={2.25}
                      strokeLinecap="round"
                    />

                    {/* Linear Regression Capacity Growth Trendline */}
                    {showTrendline && (
                      <line
                        data-testid="d3-regression-trendline"
                        x1={0}
                        y1={chart1.trendStartY}
                        x2={chart1InnerW}
                        y2={chart1.trendEndY}
                        className="stroke-slate-800 dark:stroke-slate-200"
                        strokeWidth={1.5}
                        strokeDasharray="5 4"
                      />
                    )}
                  </>
                ) : (
                  chart1.hallLines.map((hl) => {
                    const isActive = hl.hallId === activeHall.hallId;
                    return (
                      <path
                        key={hl.hallId}
                        data-testid={`d3-hall-line-${hl.hallId}`}
                        d={hl.path}
                        fill="none"
                        stroke={hl.color}
                        strokeWidth={isActive ? 2.6 : 1.6}
                        strokeOpacity={isActive ? 1 : 0.72}
                        strokeLinecap="round"
                      />
                    );
                  })
                )}

                {/* Interactive Hover Crosshair & Active Markers */}
                <line
                  data-testid="d3-chart1-crosshair"
                  x1={chart1.xScale(inspectedIndex)}
                  x2={chart1.xScale(inspectedIndex)}
                  y1={0}
                  y2={chart1InnerH}
                  className="stroke-slate-400 dark:stroke-slate-500"
                  strokeWidth={1}
                  strokeDasharray={hoveredHourIndex === null ? '2 2' : undefined}
                  strokeOpacity={hoveredHourIndex === null ? 0.45 : 0.85}
                />

                {scope === 'active' ? (
                  <>
                    <circle
                      cx={chart1.xScale(inspectedIndex)}
                      cy={chart1.yScale(inspectedPoint.powerUtilPct)}
                      r={4}
                      fill="#009530"
                      stroke="#FFFFFF"
                      strokeWidth={1.5}
                    />
                    <circle
                      cx={chart1.xScale(inspectedIndex)}
                      cy={chart1.yScale(inspectedPoint.uSpaceUtilPct)}
                      r={3.5}
                      fill="#4F46E5"
                      stroke="#FFFFFF"
                      strokeWidth={1.5}
                    />
                  </>
                ) : (
                  chart1.hallLines.map((hl) => {
                    const pt = hl.points[inspectedIndex];
                    if (!pt) return null;
                    return (
                      <circle
                        key={hl.hallId}
                        cx={chart1.xScale(inspectedIndex)}
                        cy={chart1.yScale(pt.powerUtilPct)}
                        r={hl.hallId === activeHall.hallId ? 4 : 3}
                        fill={hl.color}
                        stroke="#FFFFFF"
                        strokeWidth={1.5}
                      />
                    );
                  })
                )}

                {/* Transparent interactive overlay for smooth pointer scrubbing */}
                <rect
                  x={0}
                  y={0}
                  width={chart1InnerW}
                  height={chart1InnerH}
                  fill="transparent"
                  className="cursor-crosshair"
                />
              </g>
            </svg>
          </div>
        </div>

        {/* Secondary D3 Chart: High-Load Cabinet Share & Cumulative 24h Growth Delta */}
        <div className="lg:col-span-5 space-y-2 lg:pl-5 lg:border-l lg:border-slate-100 lg:dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-slate-800 dark:text-slate-200">
              High-Load Cabinets &amp; 24h Growth Delta
            </span>
            <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-3 h-0.5 bg-orange-600 dark:bg-orange-400" aria-hidden="true" />
                ≥75% Cap Racks (%)
              </span>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-3 h-0.5 bg-cyan-600 dark:bg-cyan-400" aria-hidden="true" />
                Δ vs -24h (pp)
              </span>
            </div>
          </div>

          <div ref={secondaryChartBox.ref} className="w-full">
            <svg
              role="img"
              tabIndex={0}
              aria-label="D3 dual-axis line chart of high-load cabinet share and 24-hour capacity growth delta"
              data-testid="d3-growth-velocity-chart"
              width={secondaryChartBox.width}
              height={chart2Height}
              className="block w-full overflow-visible focus:outline-none focus-visible:ring-2 focus-visible:ring-[#009530]/40 rounded-xs"
              onMouseMove={(e) =>
                handlePointerScrub(
                  e.clientX,
                  e.currentTarget,
                  chart2Margin.left,
                  chart2InnerW
                )
              }
              onMouseLeave={() => setHoveredHourIndex(null)}
              onKeyDown={(e) => handleKeyScrub(e.key)}
            >
              <defs>
                <linearGradient id="rackHighLoadAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EA580C" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#EA580C" stopOpacity={0.01} />
                </linearGradient>
              </defs>

              <g transform={`translate(${chart2Margin.left},${chart2Margin.top})`}>
                {/* Left Y Axis Gridlines (High-Load Cabinet %) */}
                {chart2.yLeftTicks.map((tick) => {
                  const y = chart2.yLeftScale(tick);
                  return (
                    <g key={tick}>
                      <line
                        x1={0}
                        x2={chart2InnerW}
                        y1={y}
                        y2={y}
                        className="stroke-slate-100 dark:stroke-slate-800"
                        strokeWidth={1}
                      />
                      <text
                        x={-8}
                        y={y + 3.5}
                        textAnchor="end"
                        className="fill-orange-700/80 dark:fill-orange-400/80 text-[10px] font-mono"
                      >
                        {tick}%
                      </text>
                    </g>
                  );
                })}

                {/* Right Y Axis Ticks (Cumulative Growth Delta pp) */}
                {chart2.yRightTicks.map((tick) => {
                  const y = chart2.yRightScale(tick);
                  return (
                    <text
                      key={tick}
                      x={chart2InnerW + 8}
                      y={y + 3.5}
                      textAnchor="start"
                      className="fill-cyan-700/80 dark:fill-cyan-400/80 text-[10px] font-mono"
                    >
                      {tick > 0 ? `+${tick}` : tick}pp
                    </text>
                  );
                })}

                {/* 0 pp Delta Baseline */}
                <line
                  x1={0}
                  x2={chart2InnerW}
                  y1={chart2.zeroDeltaY}
                  y2={chart2.zeroDeltaY}
                  className="stroke-cyan-600/40 dark:stroke-cyan-400/40"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />

                {/* X Axis Ticks */}
                {X_TICKS.map((tick) => {
                  const x = chart2.xScale(tick);
                  const pt = points[tick];
                  return (
                    <g key={tick} transform={`translate(${x},${chart2InnerH})`}>
                      <line
                        y1={0}
                        y2={4}
                        className="stroke-slate-300 dark:stroke-slate-700"
                      />
                      <text
                        y={16}
                        textAnchor={tick === 0 ? 'start' : tick === 24 ? 'end' : 'middle'}
                        className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
                      >
                        {pt?.hourLabel ?? (tick === 24 ? 'Now' : `-${24 - tick}h`)}
                      </text>
                    </g>
                  );
                })}

                {/* High-Load Cabinet Share Area & Line */}
                <path d={chart2.highLoadAreaPath} fill="url(#rackHighLoadAreaGrad)" />
                <path
                  data-testid="d3-highload-line"
                  d={chart2.highLoadPath}
                  fill="none"
                  stroke="#EA580C"
                  strokeWidth={2}
                  strokeLinecap="round"
                />

                {/* Cumulative 24h Growth Delta Line */}
                <path
                  data-testid="d3-delta-line"
                  d={chart2.deltaPath}
                  fill="none"
                  stroke="#0891B2"
                  strokeWidth={2}
                  strokeLinecap="round"
                />

                {/* Synchronized Crosshair & Active Markers */}
                <line
                  x1={chart2.xScale(inspectedIndex)}
                  x2={chart2.xScale(inspectedIndex)}
                  y1={0}
                  y2={chart2InnerH}
                  className="stroke-slate-400 dark:stroke-slate-500"
                  strokeWidth={1}
                  strokeDasharray={hoveredHourIndex === null ? '2 2' : undefined}
                  strokeOpacity={hoveredHourIndex === null ? 0.45 : 0.85}
                />
                <circle
                  cx={chart2.xScale(inspectedIndex)}
                  cy={chart2.yLeftScale(inspectedPoint.highLoadRacksPct)}
                  r={3.5}
                  fill="#EA580C"
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                />
                <circle
                  cx={chart2.xScale(inspectedIndex)}
                  cy={chart2.yRightScale(inspectedPoint.deltaFromStartPct)}
                  r={3.5}
                  fill="#0891B2"
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                />

                <rect
                  x={0}
                  y={0}
                  width={chart2InnerW}
                  height={chart2InnerH}
                  fill="transparent"
                  className="cursor-crosshair"
                />
              </g>
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}

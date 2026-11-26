import { useMemo } from 'react';
import {
  computeTemperatureMarkerPercent,
  getHeatmapTemperatureScaleGradientCss,
  getTemperatureScaleZones,
  HEATMAP_SCALE_LEGEND_MAX_C,
  HEATMAP_SCALE_LEGEND_MIN_C,
} from '../engine/rackHeatmapEngine';

export interface RackHeatmapTemperatureLegendProps {
  /** Minimum temperature bound of the rendered scale (defaults to 20°C). */
  minC?: number;
  /** Maximum temperature bound of the rendered scale (defaults to 45°C). */
  maxC?: number;
  /** Explicit tick marks to render along the gradient bar. */
  ticks?: readonly number[];
  /** Scale mode label for operator clarity (e.g. Fixed 20–45°C or Auto-Range). */
  scaleLabel?: string;
  /** Active data hall average temperature to project onto the scale bar. */
  hallAvgTempC?: number;
  /** Currently hovered or selected rack identifier. */
  activeRackId?: string;
  /** Currently hovered or selected rack temperature to project onto the scale bar. */
  activeRackTempC?: number;
  /** Short descriptor of the metric currently mapped onto the overlay. */
  metricLabel?: string;
  /** Whether the active rack marker reflects a live hover vs. selected cabinet. */
  isHovering?: boolean;
}

/**
 * Calibrated continuous temperature scale legend (20°C to 45°C default) for the Rack Map thermal heatmap.
 * Displays the exact thermal gradient ramp, 5°C interval ticks, operational zone interpretation bands,
 * and live Hall Average + Focused/Hovered Rack markers along the gradient bar.
 */
export function RackHeatmapTemperatureLegend({
  minC = HEATMAP_SCALE_LEGEND_MIN_C,
  maxC = HEATMAP_SCALE_LEGEND_MAX_C,
  ticks,
  scaleLabel,
  hallAvgTempC,
  activeRackId,
  activeRackTempC,
  metricLabel = 'Thermal Overlay',
  isHovering = false,
}: RackHeatmapTemperatureLegendProps) {
  const gradientCss = useMemo(() => getHeatmapTemperatureScaleGradientCss(), []);

  const resolvedTicks = useMemo(() => {
    if (ticks && ticks.length >= 2) return ticks;
    const step = (maxC - minC) / 5;
    return [0, 1, 2, 3, 4, 5].map((i) => Math.round((minC + step * i) * 10) / 10);
  }, [ticks, minC, maxC]);

  const zones = useMemo(() => getTemperatureScaleZones(minC, maxC), [minC, maxC]);

  const hallMarker = useMemo(
    () =>
      hallAvgTempC !== undefined
        ? computeTemperatureMarkerPercent(hallAvgTempC, minC, maxC)
        : null,
    [hallAvgTempC, minC, maxC]
  );

  const rackMarker = useMemo(
    () =>
      activeRackTempC !== undefined
        ? computeTemperatureMarkerPercent(activeRackTempC, minC, maxC)
        : null,
    [activeRackTempC, minC, maxC]
  );

  const formatTick = (t: number) => (Number.isInteger(t) ? `${t}°C` : `${t.toFixed(1)}°C`);

  return (
    <div
      data-testid="rack-temperature-scale-legend"
      data-scale-min={minC}
      data-scale-max={maxC}
      role="region"
      aria-label={`Rack Map heatmap temperature scale legend from ${minC} to ${maxC} degrees Celsius`}
      className="overflow-x-clip rounded-sm border border-slate-200/90 dark:border-slate-700/80 bg-slate-50/75 dark:bg-[#14181D] px-3 py-2.5 space-y-2"
    >
      {/* Header Row: Scale Title + Range + Live Markers Readout */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
          <span className="font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
            Temperature Scale
          </span>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
            ·
          </span>
          <span
            data-testid="rack-temperature-scale-range"
            className="font-mono text-[11px] font-medium tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap"
          >
            {formatTick(minC)} – {formatTick(maxC)}
          </span>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
            ·
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
            {scaleLabel ?? metricLabel}
          </span>
        </div>

        {/* Live Hall Avg & Active Rack Scale Readout */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] tabular-nums">
          {hallMarker && (
            <span
              data-testid="rack-legend-hall-avg-readout"
              className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 whitespace-nowrap"
            >
              <span
                className="w-0.5 h-3 bg-slate-700 dark:bg-slate-200 rounded-full shrink-0"
                aria-hidden="true"
              />
              <span>
                Hall Avg{' '}
                <strong className="text-slate-900 dark:text-white">
                  {hallMarker.tempC.toFixed(1)}°C
                </strong>
              </span>
            </span>
          )}
          {rackMarker && activeRackId && (
            <span
              data-testid="rack-legend-active-rack-readout"
              className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200 whitespace-nowrap"
            >
              <span
                className="w-2 h-2 rotate-45 border border-slate-900 dark:border-white shrink-0"
                style={{ backgroundColor: rackMarker.colorHex }}
                aria-hidden="true"
              />
              <span>
                {isHovering ? 'Hover' : 'Selected'} {activeRackId}{' '}
                <strong className="text-slate-900 dark:text-white">
                  {rackMarker.tempC.toFixed(1)}°C
                  {rackMarker.clampedHigh ? '+' : ''}
                </strong>
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Continuous Gradient Bar (20°C -> 45°C) with Live Position Markers & 5°C Ticks */}
      <div className="pt-1">
        <div className="relative">
          <div
            data-testid="rack-temperature-scale-bar"
            className="h-3.5 w-full rounded-[3px] border border-slate-300/80 dark:border-slate-600/80 shadow-2xs"
            style={{ backgroundImage: gradientCss }}
            aria-hidden="true"
          />

          {/* Subtle vertical tick hairlines inside the gradient bar */}
          <div
            className="pointer-events-none absolute inset-0 flex justify-between px-px"
            aria-hidden="true"
          >
            {resolvedTicks.map((tick, idx) => (
              <span
                key={`hairline-${tick}`}
                className={`h-full w-px ${
                  idx === 0 || idx === resolvedTicks.length - 1
                    ? 'bg-transparent'
                    : 'bg-white/45 dark:bg-slate-950/35'
                }`}
              />
            ))}
          </div>

          {/* Live Hall Average Vertical Marker (compositor-only transform) */}
          {hallMarker && (
            <div
              data-testid="rack-legend-hall-marker"
              data-marker-pct={hallMarker.percent.toFixed(1)}
              title={`Hall Average: ${hallMarker.tempC.toFixed(1)}°C`}
              className="pointer-events-none absolute top-[-2px] bottom-[-2px] inset-x-0 transition-transform duration-150 ease-out"
              style={{ transform: `translateX(${hallMarker.percent}%)` }}
              aria-hidden="true"
            >
              <span className="block -ml-[1px] h-full w-0.5 bg-slate-900 dark:bg-white ring-1 ring-white/80 dark:ring-slate-900/80" />
            </div>
          )}

          {/* Live Focused / Hovered Rack Diamond Marker (compositor-only transform) */}
          {rackMarker && activeRackId && (
            <div
              data-testid="rack-legend-rack-marker"
              data-marker-pct={rackMarker.percent.toFixed(1)}
              title={`${activeRackId}: ${rackMarker.tempC.toFixed(1)}°C`}
              className="pointer-events-none absolute top-1/2 inset-x-0 -translate-y-1/2 transition-transform duration-150 ease-out"
              style={{ transform: `translateX(${rackMarker.percent}%)` }}
              aria-hidden="true"
            >
              <span
                className="block -ml-1.5 w-3 h-3 rotate-45 rounded-[1.5px] border-2 border-slate-950 dark:border-white shadow-xs"
                style={{ backgroundColor: rackMarker.colorHex }}
              />
            </div>
          )}
        </div>

        {/* Numeric Degree Ticks (20°C, 25°C, 30°C, 35°C, 40°C, 45°C) */}
        <div
          data-testid="rack-temperature-scale-ticks"
          className="mt-1.5 flex items-center justify-between font-mono text-[11px] font-medium tabular-nums text-slate-600 dark:text-slate-300"
        >
          {resolvedTicks.map((tick, idx) => (
            <span
              key={tick}
              className={
                idx === 0
                  ? 'text-sky-700 dark:text-sky-400 font-semibold'
                  : idx === resolvedTicks.length - 1
                  ? 'text-red-700 dark:text-red-400 font-semibold'
                  : ''
              }
            >
              {formatTick(tick)}
            </span>
          ))}
        </div>
      </div>

      {/* Operator Thermal Band Interpretation Guide (unboxed typographic row) */}
      <div
        data-testid="rack-temperature-scale-zones"
        className="pt-1 border-t border-slate-200/70 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400"
      >
        {zones.map((zone) => (
          <div
            key={zone.id}
            title={zone.description}
            className="inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <span
              className="w-2 h-2 rounded-[2px] shrink-0"
              style={{ backgroundColor: zone.colorHex }}
              aria-hidden="true"
            />
            <span className="font-medium text-slate-800 dark:text-slate-200">{zone.label}</span>
            <span className="font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
              {zone.minC}–{zone.maxC}°C
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

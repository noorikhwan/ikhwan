import { useEffect, useRef } from 'react';
import { interpolateDeltaThermalColor } from '../engine/opsEnhancementsEngine';
import {
  interpolateInletThermalColor,
  interpolateSensorThermalColor,
  interpolateThermalColor,
  RackThermalStat,
} from '../engine/rackHeatmapEngine';
import { interpolatePowerColor } from '../engine/rackPowerEngine';
import { RackDefinition } from '../engine/types';

export type HeatmapDataSource = 'server' | 'inlet' | 'bms-sensor' | 'delta' | 'power';

interface RackThermalHeatmapCanvasProps {
  rows: RackDefinition[][];
  thermalStats: Record<string, RackThermalStat>;
  valuesByRackId?: Record<string, number>;
  sensorTempsByRackId?: Record<string, number>;
  sourceMode?: HeatmapDataSource;
  rangeMinC: number;
  rangeMaxC: number;
  opacity: number;
  hallAvgTempC: number;
}

const GRID_ROWS = 20;
const GRID_COLS = 20;
const CANVAS_W = 240;
const CANVAS_H = 240;

/**
 * Renders a smooth bilinear-interpolated thermal or real-time BMS power (kW) heatmap overlay directly over the 20x20 rack matrix.
 * Supports per-rack average server temperatures, live BMS environment sensor telemetry, Δ vs 1h drift, and live BMS power draw (kW).
 */
export function RackThermalHeatmapCanvas({
  rows,
  thermalStats,
  valuesByRackId,
  sensorTempsByRackId,
  sourceMode = 'server',
  rangeMinC,
  rangeMaxC,
  opacity,
  hallAvgTempC,
}: RackThermalHeatmapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const customValues = valuesByRackId ?? (sourceMode === 'bms-sensor' ? sensorTempsByRackId : undefined);
    const colorFn =
      sourceMode === 'delta'
        ? interpolateDeltaThermalColor
        : sourceMode === 'inlet'
        ? interpolateInletThermalColor
        : sourceMode === 'bms-sensor'
        ? interpolateSensorThermalColor
        : sourceMode === 'power'
        ? interpolatePowerColor
        : interpolateThermalColor;
    const fallbackTemp =
      sourceMode === 'delta'
        ? 0
        : hallAvgTempC ||
          (sourceMode === 'inlet' || sourceMode === 'bms-sensor'
            ? 21
            : sourceMode === 'power'
            ? 10
            : 48);

    const grid = new Float32Array(GRID_ROWS * GRID_COLS);
    for (let r = 0; r < GRID_ROWS; r++) {
      const rowList = rows[r] ?? [];
      for (let c = 0; c < GRID_COLS; c++) {
        const rack = rowList[c];
        if (!rack) {
          grid[r * GRID_COLS + c] = fallbackTemp;
        } else if (customValues && customValues[rack.id] !== undefined) {
          grid[r * GRID_COLS + c] = customValues[rack.id];
        } else {
          const stat = thermalStats[rack.id];
          grid[r * GRID_COLS + c] = stat ? stat.avgTempC : fallbackTemp;
        }
      }
    }

    const img = ctx.createImageData(CANVAS_W, CANVAS_H);
    const data = img.data;

    for (let py = 0; py < CANVAS_H; py++) {
      const gy = (py / (CANVAS_H - 1)) * (GRID_ROWS - 1);
      const y0 = Math.floor(gy);
      const y1 = Math.min(GRID_ROWS - 1, y0 + 1);
      const fy = gy - y0;
      const sy = fy * fy * (3 - 2 * fy);

      for (let px = 0; px < CANVAS_W; px++) {
        const gx = (px / (CANVAS_W - 1)) * (GRID_COLS - 1);
        const x0 = Math.floor(gx);
        const x1 = Math.min(GRID_COLS - 1, x0 + 1);
        const fx = gx - x0;
        const sx = fx * fx * (3 - 2 * fx);

        const t00 = grid[y0 * GRID_COLS + x0];
        const t10 = grid[y0 * GRID_COLS + x1];
        const t01 = grid[y1 * GRID_COLS + x0];
        const t11 = grid[y1 * GRID_COLS + x1];

        const top = t00 + (t10 - t00) * sx;
        const bottom = t01 + (t11 - t01) * sx;
        const tempC = top + (bottom - top) * sy;

        const color = colorFn(tempC, rangeMinC, rangeMaxC);
        const idx = (py * CANVAS_W + px) * 4;
        data[idx] = color.r;
        data[idx + 1] = color.g;
        data[idx + 2] = color.b;
        const intensity =
          sourceMode === 'delta'
            ? 0.55 + Math.abs(color.normalized - 0.5) * 0.9
            : 0.68 + color.normalized * 0.32;
        data[idx + 3] = Math.round(255 * Math.min(1, intensity));
      }
    }

    ctx.putImageData(img, 0, 0);
  }, [rows, thermalStats, valuesByRackId, sensorTempsByRackId, sourceMode, rangeMinC, rangeMaxC, hallAvgTempC]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      data-testid="rack-heatmap-canvas"
      data-heatmap-mode={sourceMode}
      data-avg-temp={hallAvgTempC.toFixed(1)}
      data-min-c={rangeMinC}
      data-max-c={rangeMaxC}
      data-opacity={Math.round(opacity * 100)}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 w-full h-full rounded-[4px] transition-opacity duration-200"
      style={{ opacity }}
    />
  );
}



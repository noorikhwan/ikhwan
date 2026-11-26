import { BmsState } from './bmsTypes';
import {
  BUILDING_BOUNDS,
  CRAC_3D_PLACEMENTS,
  HALL_ZONE_BOUNDS,
  RACK_3D_PLACEMENTS,
  Rack3DMetric,
  computeColdAisleSlaSensorMetrics,
  computeRack3DMetrics,
} from './twin3dLayout';
import { HallId, RackDefinition, ServerNode } from './types';

export const HEATMAP_GRID_COLS = 96;
export const HEATMAP_GRID_ROWS = 148;
export const HEATMAP_MIN_SLICE_M = 0.3;
export const HEATMAP_MAX_SLICE_M = 3.6;
export const HEATMAP_DEFAULT_SLICE_M = 1.6;

export const HEATMAP_PLANE_WIDTH = BUILDING_BOUNDS.mainWidth - 1.2; // 58.8m
export const HEATMAP_PLANE_DEPTH = BUILDING_BOUNDS.mainDepth - 1.2; // 92.8m

export interface ThermalHeatmapGrid {
  cols: number;
  rows: number;
  widthMeters: number;
  depthMeters: number;
  sliceHeightM: number;
  tempsC: Float32Array;
  minTempC: number;
  avgTempC: number;
  maxTempC: number;
  coldAisleAvgC: number;
  hottestRackId: string;
  hottestRackTempC: number;
  hotspotCount: number;
}

export interface ThermalPlumePoint {
  rackId: string;
  hallId: HallId;
  x: number;
  z: number;
  tempC: number;
  intensity: number; // 0..1
  heightM: number;
  radiusM: number;
  colorHex: number;
}

export interface ThermalHeatmapOptions {
  sliceHeightM: number;
  showContours: boolean;
  opacity: number; // 0..1
}

export function getSliceHeightLabel(sliceHeightM: number): string {
  if (sliceHeightM <= 0.7) return 'Floor Plenum';
  if (sliceHeightM <= 1.5) return 'Cold Aisle Intake';
  if (sliceHeightM <= 2.55) return 'Rack Exhaust';
  return 'Ceiling Return';
}

interface ColorStop {
  tempC: number;
  r: number;
  g: number;
  b: number;
}

/**
 * Perceptual CFD thermal spectrum tuned for Data Center engineering:
 * 18°C Cryo Blue -> 24°C Cool Cyan -> 34°C Emerald -> 48°C Solar Yellow -> 64°C Amber-Orange -> 80°C+ Crimson-Hot
 */
const THERMAL_STOPS: ColorStop[] = [
  { tempC: 17, r: 29, g: 78, b: 216 }, // Deep Blue (#1D4ED8)
  { tempC: 22, r: 6, g: 182, b: 212 }, // Cool Cyan (#06B6D4)
  { tempC: 31, r: 16, g: 185, b: 129 }, // Emerald (#10B981)
  { tempC: 44, r: 163, g: 230, b: 53 }, // Lime-Yellow (#A3E635)
  { tempC: 54, r: 250, g: 204, b: 21 }, // Solar Yellow (#FACC15)
  { tempC: 66, r: 249, g: 115, b: 22 }, // Hot Orange (#F97316)
  { tempC: 75, r: 220, g: 38, b: 38 }, // Critical Crimson (#DC2626)
  { tempC: 86, r: 185, g: 20, b: 32 }, // Extreme Critical Deep Crimson (#B91420)
];

export function temperatureToHeatMapRgb(tempC: number): [number, number, number] {
  if (tempC <= THERMAL_STOPS[0].tempC) {
    const s = THERMAL_STOPS[0];
    return [s.r, s.g, s.b];
  }
  const last = THERMAL_STOPS[THERMAL_STOPS.length - 1];
  if (tempC >= last.tempC) {
    return [last.r, last.g, last.b];
  }
  for (let i = 0; i < THERMAL_STOPS.length - 1; i++) {
    const a = THERMAL_STOPS[i];
    const b = THERMAL_STOPS[i + 1];
    if (tempC >= a.tempC && tempC <= b.tempC) {
      const t = (tempC - a.tempC) / Math.max(0.001, b.tempC - a.tempC);
      return [
        Math.round(a.r + (b.r - a.r) * t),
        Math.round(a.g + (b.g - a.g) * t),
        Math.round(a.b + (b.b - a.b) * t),
      ];
    }
  }
  return [last.r, last.g, last.b];
}

export function temperatureToHeatMapHex(tempC: number): number {
  const [r, g, b] = temperatureToHeatMapRgb(tempC);
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

/**
 * Separable box blur pass (3 passes approximates a smooth Gaussian thermal diffusion kernel in O(W*H)).
 */
function diffuseField(
  src: Float32Array,
  scratch: Float32Array,
  cols: number,
  rows: number,
  radius: number
): void {
  if (radius <= 0) return;

  // Horizontal pass: src -> scratch
  for (let y = 0; y < rows; y++) {
    const rowOff = y * cols;
    for (let x = 0; x < cols; x++) {
      let sum = 0;
      let count = 0;
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(cols - 1, x + radius);
      for (let ix = x0; ix <= x1; ix++) {
        sum += src[rowOff + ix];
        count += 1;
      }
      scratch[rowOff + x] = sum / count;
    }
  }

  // Vertical pass: scratch -> src
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      let sum = 0;
      let count = 0;
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(rows - 1, y + radius);
      for (let iy = y0; iy <= y1; iy++) {
        sum += scratch[iy * cols + x];
        count += 1;
      }
      src[y * cols + x] = sum / count;
    }
  }
}

/**
 * Computes a physically grounded 2D CFD-style thermal slice field across all 4 Data Halls (58.8m x 92.8m)
 * at a given vertical height `sliceHeightM` (0.3m floor plenum up to 3.6m ceiling return plenum).
 *
 * Couples live rack exhaust heat, cold-aisle SLA sensor temperatures, CRAC supply jets,
 * hot-aisle containment convection, and vertical thermal buoyancy stratification.
 */
export function computeThermalHeatmapGrid(
  racks: RackDefinition[],
  servers: ServerNode[],
  bms: BmsState,
  sliceHeightM = HEATMAP_DEFAULT_SLICE_M,
  precomputedRackMetrics?: Record<string, Rack3DMetric>
): ThermalHeatmapGrid {
  const cols = HEATMAP_GRID_COLS;
  const rows = HEATMAP_GRID_ROWS;
  const clampedH = Math.max(HEATMAP_MIN_SLICE_M, Math.min(HEATMAP_MAX_SLICE_M, sliceHeightM));
  // Vertical elevation ratio 0 (0.3m raised floor) -> 1 (3.6m ceiling return)
  const heightNorm = (clampedH - HEATMAP_MIN_SLICE_M) / (HEATMAP_MAX_SLICE_M - HEATMAP_MIN_SLICE_M);

  const rackMetrics = precomputedRackMetrics ?? computeRack3DMetrics(racks, servers, bms);
  const slaMetrics = computeColdAisleSlaSensorMetrics(bms, servers);

  // Per-hall baseline cold aisle temperature from live SLA sensors
  const hallColdTemp = new Map<HallId, number>();
  let slaTempSum = 0;
  let slaCount = 0;
  for (const s of bms.envSensors) {
    hallColdTemp.set(s.hallId, s.coldAisleTempC);
    slaTempSum += s.coldAisleTempC;
    slaCount += 1;
  }
  const coldAisleAvgC = slaCount > 0 ? Number((slaTempSum / slaCount).toFixed(1)) : 21.5;

  // Per-row cold aisle intake temp (averaged across 2 SLA probes per row)
  const rowColdMap = new Map<string, number>();
  const rowColdCount = new Map<string, number>();
  for (const m of Object.values(slaMetrics)) {
    const key = `${m.hallId}:${m.rowNumber}`;
    rowColdMap.set(key, (rowColdMap.get(key) ?? 0) + m.tempC);
    rowColdCount.set(key, (rowColdCount.get(key) ?? 0) + 1);
  }

  const totalCells = cols * rows;
  const tempSum = new Float32Array(totalCells);
  const weightSum = new Float32Array(totalCells);
  const tempsC = new Float32Array(totalCells);
  const scratch = new Float32Array(totalCells);

  const halfW = HEATMAP_PLANE_WIDTH / 2;
  const halfD = HEATMAP_PLANE_DEPTH / 2;
  const worldToCol = (x: number) =>
    Math.max(0, Math.min(cols - 1, Math.round(((x + halfW) / HEATMAP_PLANE_WIDTH) * (cols - 1))));
  const worldToRow = (z: number) =>
    Math.max(0, Math.min(rows - 1, Math.round(((z + halfD) / HEATMAP_PLANE_DEPTH) * (rows - 1))));

  // Base ambient room field (central corridors + hall floor baseline stratified with height)
  const ambientStratification = heightNorm * 5.2;
  for (let r = 0; r < rows; r++) {
    const wz = -halfD + (r / (rows - 1)) * HEATMAP_PLANE_DEPTH;
    for (let c = 0; c < cols; c++) {
      const wx = -halfW + (c / (cols - 1)) * HEATMAP_PLANE_WIDTH;
      // Determine nearest hall cold baseline
      let baseT = coldAisleAvgC + 1.0 + ambientStratification;
      for (const h of HALL_ZONE_BOUNDS) {
        if (
          Math.abs(wx - h.centerX) <= h.width / 2 + 2.0 &&
          Math.abs(wz - h.centerZ) <= h.depth / 2 + 2.0
        ) {
          baseT = (hallColdTemp.get(h.hallId) ?? coldAisleAvgC) + ambientStratification;
          break;
        }
      }
      const idx = r * cols + c;
      tempSum[idx] = baseT * 0.45;
      weightSum[idx] = 0.45;
    }
  }

  // Stamp CRAC cooling supply jets along West & East galleries (strongest near raised floor plenum)
  const cracWeight = 2.4 * (1 - heightNorm * 0.55);
  for (const cp of CRAC_3D_PLACEMENTS) {
    const unit = bms.cracUnits.find((u) => u.id === cp.cracId);
    if (!unit) continue;
    const supplyT = unit.mode === 'Fault' ? unit.returnTempC + 2.5 : unit.supplyTempC;
    // Project supply air slightly inward into the hall
    const jetX = cp.x + (cp.x < 0 ? 2.4 : -2.4);
    const cx = worldToCol(jetX);
    const cz = worldToRow(cp.z);
    for (let dz = -5; dz <= 5; dz++) {
      const rz = cz + dz;
      if (rz < 0 || rz >= rows) continue;
      for (let dx = -3; dx <= 3; dx++) {
        const rx = cx + dx;
        if (rx < 0 || rx >= cols) continue;
        const falloff = Math.exp(-(dx * dx * 0.28 + dz * dz * 0.14));
        const idx = rz * cols + rx;
        tempSum[idx] += supplyT * cracWeight * falloff;
        weightSum[idx] += cracWeight * falloff;
      }
    }
  }

  // Stamp all 1,600 racks: cold aisle intake side vs. hot aisle exhaust side + vertical stratification
  let hottestRackId = 'B-R01-01';
  let hottestRackTempC = 0;
  let hotspotCount = 0;

  // Height factors: at floor (0.3m), cold intake dominates; at exhaust/ceiling (2.2-3.6m), hot exhaust dominates
  const intakeInfluence = 1.65 - heightNorm * 1.1; // strong at floor, weaker at ceiling
  const exhaustInfluence = 0.55 + heightNorm * 1.65; // ramps strongly upward with buoyancy

  for (const p of RACK_3D_PLACEMENTS) {
    const m = rackMetrics[p.rackId];
    if (!m) continue;

    if (m.peakTempC > hottestRackTempC) {
      hottestRackTempC = m.peakTempC;
      hottestRackId = p.rackId;
    }
    if (m.peakTempC >= 64) {
      hotspotCount += 1;
    }

    const rowKey = `${p.hallId}:${p.rowNumber}`;
    const rowColdSum = rowColdMap.get(rowKey);
    const rowColdCnt = rowColdCount.get(rowKey) ?? 1;
    const intakeT =
      (rowColdSum !== undefined ? rowColdSum / rowColdCnt : hallColdTemp.get(p.hallId) ?? coldAisleAvgC) +
      heightNorm * 4.5;

    // Effective rack exhaust temperature scales subtly with height (coolest near base, peak at top-of-rack exhaust)
    const rackThermalProfile =
      clampedH < 1.1
        ? intakeT + (m.peakTempC - intakeT) * (0.45 + heightNorm * 0.4)
        : clampedH <= 2.6
        ? m.peakTempC
        : m.peakTempC - (clampedH - 2.6) * 2.2;

    // Front face direction (toward cold aisle) vs. Rear exhaust direction (toward hot aisle)
    const frontDirZ = p.rotationY === 0 ? 1 : -1;
    const rearDirZ = -frontDirZ;

    // 1. Stamp rack core footprint
    const rc = worldToCol(p.x);
    const rr = worldToRow(p.z);
    const coreIdx = rr * cols + rc;
    const coreW = 1.45 + (m.peakTempC >= 68 ? 1.8 : 0);
    tempSum[coreIdx] += rackThermalProfile * coreW;
    weightSum[coreIdx] += coreW;

    // 2. Stamp cold aisle intake strip in front of rack
    const coldZ = p.z + frontDirZ * 0.85;
    const cr = worldToRow(coldZ);
    const coldIdx = cr * cols + rc;
    tempSum[coldIdx] += intakeT * intakeInfluence;
    weightSum[coldIdx] += intakeInfluence;

    // 3. Stamp hot aisle exhaust plume behind rack
    const hotZ = p.z + rearDirZ * 0.85;
    const hr = worldToRow(hotZ);
    const hotIdx = hr * cols + rc;
    const hotBoost = m.peakTempC >= 70 ? 2.4 : 1.0;
    tempSum[hotIdx] += rackThermalProfile * exhaustInfluence * hotBoost;
    weightSum[hotIdx] += exhaustInfluence * hotBoost;

    // Extra radial thermal bloom for critical hotspots (> 68°C) so hotspots clearly stand out in 3D
    if (m.peakTempC >= 68) {
      const bloomR = Math.round(2 + heightNorm * 2);
      for (let dz = -bloomR; dz <= bloomR; dz++) {
        const tz = hr + dz;
        if (tz < 0 || tz >= rows) continue;
        for (let dx = -bloomR; dx <= bloomR; dx++) {
          const tx = rc + dx;
          if (tx < 0 || tx >= cols) continue;
          const dist2 = dx * dx + dz * dz;
          const falloff = Math.exp(-dist2 / (bloomR * bloomR * 0.55));
          const w = 1.8 * falloff;
          const idx = tz * cols + tx;
          tempSum[idx] += rackThermalProfile * w;
          weightSum[idx] += w;
        }
      }
    }
  }

  // Normalize weighted field
  for (let i = 0; i < totalCells; i++) {
    tempsC[i] = weightSum[i] > 0 ? tempSum[i] / weightSum[i] : coldAisleAvgC;
  }

  // Smooth thermal convection diffusion: tighter at floor/intake, broader rising plume diffusion at ceiling
  const blurRadius = heightNorm < 0.35 ? 1 : heightNorm < 0.72 ? 2 : 3;
  diffuseField(tempsC, scratch, cols, rows, blurRadius);
  diffuseField(tempsC, scratch, cols, rows, 1);

  // Re-pin extreme peak hotspot cells slightly so smoothing never washes out critical alarms
  for (const p of RACK_3D_PLACEMENTS) {
    const m = rackMetrics[p.rackId];
    if (!m || m.peakTempC < 72) continue;
    const rc = worldToCol(p.x);
    const rr = worldToRow(p.z);
    const idx = rr * cols + rc;
    const peakFloor = clampedH < 0.9 ? m.peakTempC - 6 : m.peakTempC - 1.5;
    if (tempsC[idx] < peakFloor) {
      tempsC[idx] = peakFloor;
    }
  }

  // Compute grid statistics
  let minTempC = Infinity;
  let maxTempC = -Infinity;
  let sumTemp = 0;
  for (let i = 0; i < totalCells; i++) {
    const t = tempsC[i];
    if (t < minTempC) minTempC = t;
    if (t > maxTempC) maxTempC = t;
    sumTemp += t;
  }

  return {
    cols,
    rows,
    widthMeters: HEATMAP_PLANE_WIDTH,
    depthMeters: HEATMAP_PLANE_DEPTH,
    sliceHeightM: Number(clampedH.toFixed(2)),
    tempsC,
    minTempC: Number(minTempC.toFixed(1)),
    avgTempC: Number((sumTemp / totalCells).toFixed(1)),
    maxTempC: Number(maxTempC.toFixed(1)),
    coldAisleAvgC,
    hottestRackId,
    hottestRackTempC: Number(hottestRackTempC.toFixed(1)),
    hotspotCount,
  };
}

/**
 * Rasterizes the thermal temperature grid into an RGBA Uint8Array ready for `THREE.DataTexture`.
 * Includes optional crisp 10°C CFD isotherm contour lines and soft outer perimeter feathering.
 */
export function renderHeatmapToRgba(
  grid: ThermalHeatmapGrid,
  options: { showContours: boolean; opacity: number },
  targetBuffer?: Uint8Array
): Uint8Array {
  const { cols, rows, tempsC } = grid;
  const out = targetBuffer && targetBuffer.length === cols * rows * 4
    ? targetBuffer
    : new Uint8Array(cols * rows * 4);

  const clampedOpacity = Math.max(0.15, Math.min(1, options.opacity));
  const contourStepC = 10; // Isotherms at 20°C, 30°C, 40°C, 50°C, 60°C, 70°C, 80°C

  for (let y = 0; y < rows; y++) {
    // Three.js PlaneGeometry rotated -PI/2 around X maps v=1 to -Z (North) and v=0 to +Z (South).
    // DataTexture row 0 is at v=0 (South, +halfD), so flip Y index when writing so North (-Z) aligns with row 0 of grid.
    const texY = rows - 1 - y;
    const edgeV = Math.min(y, rows - 1 - y) / 4;
    const fadeV = Math.min(1, edgeV);

    for (let x = 0; x < cols; x++) {
      const idx = y * cols + x;
      const t = tempsC[idx];
      let [r, g, b] = temperatureToHeatMapRgb(t);

      // Optional crisp CFD isotherm contour line detection via neighbor threshold crossing
      let isContour = false;
      if (options.showContours && x < cols - 1 && y < rows - 1) {
        const band = Math.floor(t / contourStepC);
        const bandRight = Math.floor(tempsC[idx + 1] / contourStepC);
        const bandDown = Math.floor(tempsC[idx + cols] / contourStepC);
        if (band !== bandRight || band !== bandDown) {
          isContour = true;
        }
      }

      if (isContour) {
        // Subtle crisp white/light-ink contour highlight for readability
        r = Math.min(255, Math.round(r * 0.65 + 255 * 0.35));
        g = Math.min(255, Math.round(g * 0.65 + 255 * 0.35));
        b = Math.min(255, Math.round(b * 0.65 + 255 * 0.35));
      }

      const edgeU = Math.min(x, cols - 1 - x) / 3;
      const fadeU = Math.min(1, edgeU);
      const edgeFade = fadeU * fadeV;

      // Keep cool ambient translucent so 3D heatmapped racks underneath remain crisp while hotspots & isotherms pop
      const thermalWeight = Math.max(0, Math.min(1, (t - 20) / 52));
      const baseAlpha = (0.30 + thermalWeight * 0.56 + (isContour ? 0.22 : 0)) * clampedOpacity;
      const alphaByte = Math.round(Math.max(0, Math.min(1, baseAlpha * edgeFade)) * 255);

      const p = (texY * cols + x) * 4;
      out[p] = r;
      out[p + 1] = g;
      out[p + 2] = b;
      out[p + 3] = alphaByte;
    }
  }

  return out;
}

/**
 * Extracts top elevated thermal exhaust hotspots for volumetric 3D rising heat plumes.
 */
export function extractHotspotPlumes(
  racks: RackDefinition[],
  servers: ServerNode[],
  bms: BmsState,
  maxPlumes = 72,
  precomputedRackMetrics?: Record<string, Rack3DMetric>
): ThermalPlumePoint[] {
  const metrics = precomputedRackMetrics ?? computeRack3DMetrics(racks, servers, bms);
  const candidates: ThermalPlumePoint[] = [];

  for (const p of RACK_3D_PLACEMENTS) {
    const m = metrics[p.rackId];
    if (!m || m.peakTempC < 56) continue;

    const intensity = Math.max(0, Math.min(1, (m.peakTempC - 54) / 28));
    const rearDirZ = p.rotationY === 0 ? -1 : 1;
    candidates.push({
      rackId: p.rackId,
      hallId: p.hallId,
      x: p.x,
      z: p.z + rearDirZ * 0.25,
      tempC: m.peakTempC,
      intensity,
      heightM: Number((1.4 + intensity * 2.8).toFixed(2)),
      radiusM: Number((0.46 + intensity * 0.58).toFixed(2)),
      colorHex: temperatureToHeatMapHex(m.peakTempC),
    });
  }

  candidates.sort((a, b) => b.tempC - a.tempC);
  return candidates.slice(0, maxPlumes);
}

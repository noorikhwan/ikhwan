import { BmsState, ColdAisleRowSensorMetric, RedundancyPath, SlaComplianceStatus } from './bmsTypes';
import { computeColdAisleSlaSensorMetrics, computeRack3DMetrics } from './twin3dLayout';
import { HallId, RackDefinition, ServerNode } from './types';

export type ThermalBand = 'Cool' | 'Nominal' | 'Warm' | 'Hot' | 'Critical';
export type SensorThermalBand = 'Sub-SLA' | 'Optimal' | 'Elevated' | 'Warning' | 'Breached';
export type HeatmapScaleMode = 'fixed' | 'dynamic';

export interface RackThermalStat {
  rackId: string;
  hallId: HallId;
  rowNumber: number;
  rackIndex: number;
  avgTempC: number;
  minTempC: number;
  maxTempC: number;
  spreadTempC: number;
  serverCount: number;
  hasLiveServers: boolean;
  band: ThermalBand;
}

export interface HallThermalSummary {
  hallId: HallId;
  avgTempC: number;
  minTempC: number;
  maxTempC: number;
  hotspotCount: number; // avgTempC >= 65°C
  criticalCount: number; // avgTempC >= 72°C
  hottestRackId: string | null;
  hottestAvgTempC: number;
}

export interface RackBmsSensorStat {
  rackId: string;
  hallId: HallId;
  rowNumber: number;
  rackIndex: number;
  sensorTempC: number;
  humidityPct: number;
  dewPointC: number;
  slaTempMinC: number;
  slaTempMaxC: number;
  slaStatus: SlaComplianceStatus;
  sensorBand: SensorThermalBand;
  nearestProbeId: string;
  nearestProbeSlot: 'A' | 'B';
  redundancyPath: RedundancyPath;
  probeMountSlot: 'A' | 'B' | null; // Rack 05 = West Probe A, Rack 16 = East Probe B
  westProbeTempC: number;
  eastProbeTempC: number;
}

export interface HallBmsSensorSummary {
  hallId: HallId;
  avgTempC: number;
  minTempC: number;
  maxTempC: number;
  avgHumidityPct: number;
  dewPointC: number;
  differentialPressurePa: number;
  slaTempMinC: number;
  slaTempMaxC: number;
  slaProbeAId: string;
  slaProbeBId: string;
  dualProbeStatus: '2N Dual Verified' | 'Single Probe Degraded';
  compliantCount: number;
  warningCount: number;
  breachedCount: number;
  probeCount: number;
  warmestRackId: string | null;
  warmestTempC: number;
}

export interface ThermalColorSample {
  r: number;
  g: number;
  b: number;
  hex: string;
  rgb: string;
  rgba: (alpha: number) => string;
  normalized: number; // 0..1
  band: ThermalBand;
  contrastText: 'text-white' | 'text-slate-950';
}

export type RackInletFacing = 'south' | 'north';

export interface RackInletThermalStat {
  rackId: string;
  hallId: HallId;
  rowNumber: number;
  rackIndex: number;
  frontFacing: RackInletFacing;
  avgInletTempC: number;
  minInletTempC: number;
  maxInletTempC: number;
  inletSpreadC: number;
  deltaTExhaustToInletC: number;
  serverCount: number;
  hasLiveServers: boolean;
  band: SensorThermalBand;
}

export interface HallInletThermalSummary {
  hallId: HallId;
  avgInletTempC: number;
  minInletTempC: number;
  maxInletTempC: number;
  elevatedCount: number; // avgInletTempC >= 24.0°C
  breachedCount: number; // avgInletTempC > 27.0°C (ASHRAE A1 max)
  warmestRackId: string | null;
  warmestInletTempC: number;
}

export interface RackFrontGradientStyle {
  frontFacing: RackInletFacing;
  backgroundImage: string;
  frontEdgeColor: string;
  borderGlowColor: string;
  sample: ThermalColorSample;
}

export const FIXED_HEATMAP_MIN_C = 35;
export const FIXED_HEATMAP_MAX_C = 80;
export const FIXED_SENSOR_MIN_C = 16;
export const FIXED_SENSOR_MAX_C = 29;
export const FIXED_INLET_MIN_C = 17;
export const FIXED_INLET_MAX_C = 30;
export const HEATMAP_SCALE_LEGEND_MIN_C = 20;
export const HEATMAP_SCALE_LEGEND_MAX_C = 45;
export const HEATMAP_SCALE_LEGEND_TICKS: readonly number[] = [20, 25, 30, 35, 40, 45];

export interface TemperatureScaleZone {
  id: 'cool' | 'nominal' | 'elevated' | 'warning' | 'critical';
  label: string;
  minC: number;
  maxC: number;
  colorHex: string;
  description: string;
}

export interface TemperatureMarkerProjection {
  tempC: number;
  percent: number; // 0..100 clamped along legend bar
  clampedLow: boolean;
  clampedHigh: boolean;
  colorHex: string;
}

interface ColorStop {
  t: number;
  r: number;
  g: number;
  b: number;
}

// Perceptually calibrated engineering thermal ramp (server chassis temperatures):
// Cool Blue -> Cyan -> Emerald -> Amber -> High Orange -> Critical Crimson
const THERMAL_STOPS: ColorStop[] = [
  { t: 0.0, r: 2, g: 132, b: 199 },   // #0284C7 Cool Blue
  { t: 0.24, r: 6, g: 182, b: 212 },  // #06B6D4 Cyan
  { t: 0.46, r: 22, g: 163, b: 74 },  // #16A34A Balanced Green
  { t: 0.68, r: 245, g: 158, b: 11 }, // #F59E0B Warm Amber
  { t: 0.85, r: 234, g: 88, b: 12 },  // #EA580C High Orange
  { t: 1.0, r: 220, g: 38, b: 38 },   // #DC2626 Critical Red
];

// Calibrated ASHRAE Class A1 Cold-Aisle BMS Environment Sensor ramp (16°C -> 29°C):
// Deep Chilled Blue -> Cyan -> Optimal Teal/Emerald -> Elevated Amber -> Excursion Orange -> SLA Breach Crimson
const SENSOR_THERMAL_STOPS: ColorStop[] = [
  { t: 0.0, r: 3, g: 105, b: 161 },   // #0369A1 Sub-SLA Chilled Blue (16°C)
  { t: 0.22, r: 6, g: 182, b: 212 },  // #06B6D4 Cold Supply Cyan (~18.8°C)
  { t: 0.48, r: 16, g: 185, b: 129 }, // #10B981 ASHRAE Optimal Emerald (~22.2°C)
  { t: 0.72, r: 245, g: 158, b: 11 }, // #F59E0B SLA Warning Amber (~25.4°C)
  { t: 0.86, r: 234, g: 88, b: 12 },  // #EA580C High Excursion Orange (~27.2°C)
  { t: 1.0, r: 220, g: 38, b: 38 },   // #DC2626 SLA Breach Crimson (29°C+)
];

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function toHexByte(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
}

function computeDewPointApprox(tempC: number, rhPct: number): number {
  const rh = Math.max(10, Math.min(99, rhPct));
  const a = 17.625;
  const b = 243.04;
  const gamma = Math.log(rh / 100) + (a * tempC) / (b + tempC);
  return round1((b * gamma) / (a - gamma));
}

export function classifyThermalBand(avgTempC: number): ThermalBand {
  if (avgTempC >= 72) return 'Critical';
  if (avgTempC >= 65) return 'Hot';
  if (avgTempC >= 56) return 'Warm';
  if (avgTempC >= 44) return 'Nominal';
  return 'Cool';
}

export function classifySensorThermalBand(
  tempC: number,
  slaMinC: number = 18.0,
  slaMaxC: number = 27.0
): SensorThermalBand {
  if (tempC > slaMaxC) return 'Breached';
  if (tempC >= slaMaxC - 1.5) return 'Warning';
  if (tempC >= 22.8) return 'Elevated';
  if (tempC < slaMinC) return 'Sub-SLA';
  return 'Optimal';
}

function sampleColorStops(
  tempC: number,
  rangeMinC: number,
  rangeMaxC: number,
  stops: ColorStop[],
  bandResolver: (t: number) => ThermalBand
): ThermalColorSample {
  const span = Math.max(2, rangeMaxC - rangeMinC);
  const normalized = Math.max(0, Math.min(1, (tempC - rangeMinC) / span));

  let lower = stops[0];
  let upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (normalized >= a.t && normalized <= b.t) {
      lower = a;
      upper = b;
      break;
    }
  }

  const localSpan = Math.max(0.0001, upper.t - lower.t);
  const f = Math.max(0, Math.min(1, (normalized - lower.t) / localSpan));
  const r = Math.round(lower.r + (upper.r - lower.r) * f);
  const g = Math.round(lower.g + (upper.g - lower.g) * f);
  const b = Math.round(lower.b + (upper.b - lower.b) * f);

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const contrastText: 'text-white' | 'text-slate-950' =
    luminance > 0.62 ? 'text-slate-950' : 'text-white';

  return {
    r,
    g,
    b,
    hex: `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`,
    rgb: `rgb(${r}, ${g}, ${b})`,
    rgba: (alpha: number) => `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`,
    normalized,
    band: bandResolver(tempC),
    contrastText,
  };
}

/**
 * Smoothly interpolates an engineering thermal RGB color for a rack's average server temperature.
 */
export function interpolateThermalColor(
  avgTempC: number,
  rangeMinC: number = FIXED_HEATMAP_MIN_C,
  rangeMaxC: number = FIXED_HEATMAP_MAX_C
): ThermalColorSample {
  return sampleColorStops(avgTempC, rangeMinC, rangeMaxC, THERMAL_STOPS, classifyThermalBand);
}

/**
 * Smoothly interpolates an ASHRAE Class A1 environmental sensor RGB color for BMS rack intake temperatures.
 */
export function interpolateSensorThermalColor(
  sensorTempC: number,
  rangeMinC: number = FIXED_SENSOR_MIN_C,
  rangeMaxC: number = FIXED_SENSOR_MAX_C
): ThermalColorSample {
  return sampleColorStops(
    sensorTempC,
    rangeMinC,
    rangeMaxC,
    SENSOR_THERMAL_STOPS,
    (t) => {
      if (t > 27) return 'Critical';
      if (t >= 25.5) return 'Hot';
      if (t >= 22.8) return 'Warm';
      if (t < 18) return 'Cool';
      return 'Nominal';
    }
  );
}

/**
 * Computes per-rack average server temperature statistics across all racks.
 * - Racks with live server nodes compute the exact mean of mounted server temperatures.
 * - Standard production racks derive a CRAC-coupled mean cabinet temperature from live BMS airflow.
 */
export function computeRackThermalStats(
  racks: RackDefinition[],
  servers: ServerNode[],
  bms?: BmsState
): Record<string, RackThermalStat> {
  const serversByRack = new Map<string, ServerNode[]>();
  for (const srv of servers) {
    const arr = serversByRack.get(srv.rackId);
    if (arr) arr.push(srv);
    else serversByRack.set(srv.rackId, [srv]);
  }

  const rack3DMetrics = computeRack3DMetrics(racks, servers, bms);
  const result: Record<string, RackThermalStat> = {};

  for (const rack of racks) {
    const nodes = serversByRack.get(rack.id);
    const metric = rack3DMetrics[rack.id];

    if (nodes && nodes.length > 0) {
      let sum = 0;
      let minT = Infinity;
      let maxT = -Infinity;
      for (const node of nodes) {
        sum += node.tempC;
        if (node.tempC < minT) minT = node.tempC;
        if (node.tempC > maxT) maxT = node.tempC;
      }
      const avgTempC = round1(sum / nodes.length);
      const minTempC = round1(minT);
      const maxTempC = round1(maxT);
      result[rack.id] = {
        rackId: rack.id,
        hallId: rack.hallId,
        rowNumber: rack.rowNumber,
        rackIndex: rack.rackIndex,
        avgTempC,
        minTempC,
        maxTempC,
        spreadTempC: round1(maxTempC - minTempC),
        serverCount: nodes.length,
        hasLiveServers: true,
        band: classifyThermalBand(avgTempC),
      };
    } else {
      const peak = metric?.peakTempC ?? rack.basePeakTempC;
      // Realistic mean chassis temperature across blades in a cabinet is ~3.4–4.6°C below top-of-rack exhaust peak
      const offset = 3.2 + ((rack.rowNumber * 7 + rack.rackIndex * 3) % 15) * 0.1;
      const avgTempC = round1(Math.max(28, peak - offset));
      const minTempC = round1(Math.max(24, avgTempC - 3.8));
      const maxTempC = round1(peak);
      result[rack.id] = {
        rackId: rack.id,
        hallId: rack.hallId,
        rowNumber: rack.rowNumber,
        rackIndex: rack.rackIndex,
        avgTempC,
        minTempC,
        maxTempC,
        spreadTempC: round1(maxTempC - minTempC),
        serverCount: metric?.serverCount ?? Math.max(6, Math.round(rack.baseUsedU / 2)),
        hasLiveServers: false,
        band: classifyThermalBand(avgTempC),
      };
    }
  }

  return result;
}

/**
 * Computes real-time per-rack intake temperature & humidity from the 160 live BMS cold-aisle
 * environment sensors (West Probe A at Rack 05 and East Probe B at Rack 16 per row) coupled
 * with hall environmental zone SLA bounds and local cabinet thermal load dispersion.
 */
export function computeBmsSensorRackStats(
  racks: RackDefinition[],
  bms: BmsState,
  servers: ServerNode[]
): Record<string, RackBmsSensorStat> {
  const rowSensors = computeColdAisleSlaSensorMetrics(bms, servers);
  const envByHall = new Map(bms.envSensors.map((e) => [e.hallId, e]));
  const rackMetrics = computeRack3DMetrics(racks, servers, bms);

  // Index row sensors by hallId + rowNumber + slot ('A' | 'B')
  const probeLookup = new Map<string, ColdAisleRowSensorMetric>();
  for (const metric of Object.values(rowSensors)) {
    probeLookup.set(`${metric.hallId}-${metric.rowNumber}-${metric.slot}`, metric);
  }

  const result: Record<string, RackBmsSensorStat> = {};

  for (const rack of racks) {
    const env = envByHall.get(rack.hallId);
    const slaTempMinC = env?.slaTempMinC ?? 18.0;
    const slaTempMaxC = env?.slaTempMaxC ?? 27.0;

    const probeA = probeLookup.get(`${rack.hallId}-${rack.rowNumber}-A`);
    const probeB = probeLookup.get(`${rack.hallId}-${rack.rowNumber}-B`);

    const westTemp = probeA?.tempC ?? env?.probeATempC ?? env?.coldAisleTempC ?? 20.5;
    const eastTemp = probeB?.tempC ?? env?.probeBTempC ?? env?.coldAisleTempC ?? 20.8;
    const westHum = probeA?.humidityPct ?? env?.probeAHumidityPct ?? env?.humidityPct ?? 46.0;
    const eastHum = probeB?.humidityPct ?? env?.probeBHumidityPct ?? env?.humidityPct ?? 46.0;

    const probeMountSlot: 'A' | 'B' | null =
      rack.rackIndex === 5 ? 'A' : rack.rackIndex === 16 ? 'B' : null;
    const nearestProbe = rack.rackIndex <= 10 ? probeA : probeB;
    const nearestProbeSlot: 'A' | 'B' = rack.rackIndex <= 10 ? 'A' : 'B';

    let sensorTempC: number;
    let humidityPct: number;

    if (probeMountSlot === 'A') {
      // Exact mounted West BMS environment sensor reading at Rack 05
      sensorTempC = round1(westTemp);
      humidityPct = round1(westHum);
    } else if (probeMountSlot === 'B') {
      // Exact mounted East BMS environment sensor reading at Rack 16
      sensorTempC = round1(eastTemp);
      humidityPct = round1(eastHum);
    } else {
      // Horizontal interpolation between West Probe A (Rack 05) and East Probe B (Rack 16)
      const w = Math.max(0, Math.min(1, (rack.rackIndex - 5) / (16 - 5)));
      const interpTemp = westTemp + (eastTemp - westTemp) * w;
      const interpHum = westHum + (eastHum - westHum) * w;

      // Subtle mid-aisle thermal build-up vs cooler perimeter CRAC supply air plenums
      const distFromCenter = Math.abs(rack.rackIndex - 10.5) / 9.5; // 0 at center, 1 at ends
      const airflowGradient = (0.5 - distFromCenter) * 0.55;

      // Localized cabinet heat-recirculation lift proportional to rack power utilization & hot alerts
      const met = rackMetrics[rack.id];
      const utilRatio = (met?.utilizationPct ?? 45) / 100;
      const loadLift = Math.max(0, (utilRatio - 0.4) * 1.35);
      const alertLift =
        met?.status === 'critical' ? 1.1 : met?.status === 'warning' ? 0.45 : 0;

      sensorTempC = round1(interpTemp + airflowGradient + loadLift + alertLift);
      humidityPct = round1(
        Math.max(25, Math.min(75, interpHum - (loadLift + alertLift) * 0.8))
      );
    }

    const dewPointC = computeDewPointApprox(sensorTempC, humidityPct);
    const slaStatus: SlaComplianceStatus =
      sensorTempC < slaTempMinC || sensorTempC > slaTempMaxC
        ? 'Breached'
        : sensorTempC < slaTempMinC + 0.8 || sensorTempC > slaTempMaxC - 1.5
        ? 'Warning'
        : 'Compliant';

    result[rack.id] = {
      rackId: rack.id,
      hallId: rack.hallId,
      rowNumber: rack.rowNumber,
      rackIndex: rack.rackIndex,
      sensorTempC,
      humidityPct,
      dewPointC,
      slaTempMinC,
      slaTempMaxC,
      slaStatus,
      sensorBand: classifySensorThermalBand(sensorTempC, slaTempMinC, slaTempMaxC),
      nearestProbeId:
        nearestProbe?.sensorId ??
        (nearestProbeSlot === 'A'
          ? env?.slaProbeAId ?? 'SLA-CA-A1'
          : env?.slaProbeBId ?? 'SLA-CA-A2'),
      nearestProbeSlot,
      redundancyPath: nearestProbeSlot === 'A' ? 'Path A' : 'Path B',
      probeMountSlot,
      westProbeTempC: round1(westTemp),
      eastProbeTempC: round1(eastTemp),
    };
  }

  return result;
}

/**
 * Computes hall-level BMS environment sensor telemetry aggregates across all 400 racks and 40 row probes.
 */
export function computeHallBmsSensorSummary(
  hallId: HallId,
  racks: RackDefinition[],
  sensorMap: Record<string, RackBmsSensorStat>,
  bms: BmsState
): HallBmsSensorSummary {
  const env = bms.envSensors.find((e) => e.hallId === hallId);
  const hallRacks = racks.filter((r) => r.hallId === hallId);

  if (hallRacks.length === 0) {
    return {
      hallId,
      avgTempC: env?.coldAisleTempC ?? 20.5,
      minTempC: env?.coldAisleTempC ?? 20.5,
      maxTempC: env?.coldAisleTempC ?? 20.5,
      avgHumidityPct: env?.humidityPct ?? 46.0,
      dewPointC: env?.dewPointC ?? 9.2,
      differentialPressurePa: env?.differentialPressurePa ?? 14.0,
      slaTempMinC: env?.slaTempMinC ?? 18.0,
      slaTempMaxC: env?.slaTempMaxC ?? 27.0,
      slaProbeAId: env?.slaProbeAId ?? 'SLA-CA-A1',
      slaProbeBId: env?.slaProbeBId ?? 'SLA-CA-A2',
      dualProbeStatus: env?.dualProbeStatus ?? '2N Dual Verified',
      compliantCount: 0,
      warningCount: 0,
      breachedCount: 0,
      probeCount: 40,
      warmestRackId: null,
      warmestTempC: 0,
    };
  }

  let tempSum = 0;
  let humSum = 0;
  let minT = Infinity;
  let maxT = -Infinity;
  let compliantCount = 0;
  let warningCount = 0;
  let breachedCount = 0;
  let probeCount = 0;
  let warmestRackId: string | null = null;

  for (const rack of hallRacks) {
    const st = sensorMap[rack.id];
    if (!st) continue;
    tempSum += st.sensorTempC;
    humSum += st.humidityPct;
    if (st.sensorTempC < minT) minT = st.sensorTempC;
    if (st.sensorTempC > maxT) {
      maxT = st.sensorTempC;
      warmestRackId = rack.id;
    }
    if (st.slaStatus === 'Breached') breachedCount += 1;
    else if (st.slaStatus === 'Warning') warningCount += 1;
    else compliantCount += 1;
    if (st.probeMountSlot !== null) probeCount += 1;
  }

  const avgTempC = round1(tempSum / hallRacks.length);
  const avgHumidityPct = round1(humSum / hallRacks.length);

  return {
    hallId,
    avgTempC,
    minTempC: round1(minT === Infinity ? 0 : minT),
    maxTempC: round1(maxT === -Infinity ? 0 : maxT),
    avgHumidityPct,
    dewPointC: env?.dewPointC ?? computeDewPointApprox(avgTempC, avgHumidityPct),
    differentialPressurePa: env?.differentialPressurePa ?? 14.0,
    slaTempMinC: env?.slaTempMinC ?? 18.0,
    slaTempMaxC: env?.slaTempMaxC ?? 27.0,
    slaProbeAId: env?.slaProbeAId ?? 'SLA-CA-A1',
    slaProbeBId: env?.slaProbeBId ?? 'SLA-CA-A2',
    dualProbeStatus: env?.dualProbeStatus ?? '2N Dual Verified',
    compliantCount,
    warningCount,
    breachedCount,
    probeCount,
    warmestRackId,
    warmestTempC: round1(maxT === -Infinity ? 0 : maxT),
  };
}

/**
 * Computes hall-level average thermal aggregates and hotspot counts.
 */
export function computeHallThermalSummary(
  hallId: HallId,
  racks: RackDefinition[],
  thermalMap: Record<string, RackThermalStat>
): HallThermalSummary {
  const hallRacks = racks.filter((r) => r.hallId === hallId);
  if (hallRacks.length === 0) {
    return {
      hallId,
      avgTempC: 0,
      minTempC: 0,
      maxTempC: 0,
      hotspotCount: 0,
      criticalCount: 0,
      hottestRackId: null,
      hottestAvgTempC: 0,
    };
  }

  let sum = 0;
  let minT = Infinity;
  let maxT = -Infinity;
  let hotspotCount = 0;
  let criticalCount = 0;
  let hottestRackId: string | null = null;

  for (const rack of hallRacks) {
    const stat = thermalMap[rack.id];
    if (!stat) continue;
    sum += stat.avgTempC;
    if (stat.avgTempC < minT) minT = stat.avgTempC;
    if (stat.avgTempC > maxT) {
      maxT = stat.avgTempC;
      hottestRackId = rack.id;
    }
    if (stat.avgTempC >= 65) hotspotCount += 1;
    if (stat.avgTempC >= 72) criticalCount += 1;
  }

  return {
    hallId,
    avgTempC: round1(sum / hallRacks.length),
    minTempC: round1(minT === Infinity ? 0 : minT),
    maxTempC: round1(maxT === -Infinity ? 0 : maxT),
    hotspotCount,
    criticalCount,
    hottestRackId,
    hottestAvgTempC: round1(maxT === -Infinity ? 0 : maxT),
  };
}

/**
 * Resolves active legend bounds for either fixed server thermal scale (35–80°C)
 * or dynamic hall auto-scaling with a minimum 10°C spread so gradients remain meaningful.
 */
export function resolveHeatmapScaleBounds(
  mode: HeatmapScaleMode,
  hallSummary: HallThermalSummary
): { minC: number; maxC: number; ticks: number[] } {
  let minC = FIXED_HEATMAP_MIN_C;
  let maxC = FIXED_HEATMAP_MAX_C;

  if (mode === 'dynamic' && hallSummary.maxTempC > 0) {
    minC = Math.floor(Math.max(25, hallSummary.minTempC - 2));
    maxC = Math.ceil(Math.max(minC + 10, hallSummary.maxTempC + 2));
  }

  const step = (maxC - minC) / 3;
  return {
    minC,
    maxC,
    ticks: [
      round1(minC),
      round1(minC + step),
      round1(minC + step * 2),
      round1(maxC),
    ],
  };
}

/**
 * Resolves active legend bounds for BMS environment sensor heatmap:
 * - Fixed ASHRAE Class A1 scale: 16°C – 29°C
 * - Dynamic Auto-Range: tightly wraps live hall sensor spread (minimum 4°C window)
 */
export function resolveSensorHeatmapScaleBounds(
  mode: HeatmapScaleMode,
  sensorSummary: HallBmsSensorSummary
): { minC: number; maxC: number; ticks: number[] } {
  let minC = FIXED_SENSOR_MIN_C;
  let maxC = FIXED_SENSOR_MAX_C;

  if (mode === 'dynamic' && sensorSummary.maxTempC > 0) {
    minC = Math.floor(Math.max(12, sensorSummary.minTempC - 1));
    maxC = Math.ceil(Math.max(minC + 4, sensorSummary.maxTempC + 1));
  }

  const step = (maxC - minC) / 3;
  return {
    minC,
    maxC,
    ticks: [
      round1(minC),
      round1(minC + step),
      round1(minC + step * 2),
      round1(maxC),
    ],
  };
}

/**
 * Generates CSS linear-gradient string matching the exact server thermal ramp stops.
 */
export function getThermalLegendGradientCss(): string {
  const parts = THERMAL_STOPS.map(
    (s) => `rgb(${s.r}, ${s.g}, ${s.b}) ${Math.round(s.t * 100)}%`
  );
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}

/**
 * Generates CSS linear-gradient string matching the ASHRAE BMS environment sensor ramp stops.
 */
export function getSensorLegendGradientCss(): string {
  const parts = SENSOR_THERMAL_STOPS.map(
    (s) => `rgb(${s.r}, ${s.g}, ${s.b}) ${Math.round(s.t * 100)}%`
  );
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}

export interface BmsThermalOverlaySample {
  tempC: number;
  tempLabel: string;
  band: SensorThermalBand;
  slaStatus: SlaComplianceStatus;
  statusBarClass: string;
  isThermalAlert: boolean;
}

/**
 * Formats a cabinet's live BMS sensor array telemetry into a compact cell overlay
 * readout (°C) and non-hue-only ASHRAE Class A1 thermal status indicator.
 */
export function buildBmsThermalOverlaySample(
  sensor: Pick<RackBmsSensorStat, 'sensorTempC' | 'sensorBand' | 'slaStatus'> | undefined,
  fallbackTempC: number = 21.0
): BmsThermalOverlaySample {
  const tempC = round1(sensor?.sensorTempC ?? fallbackTempC);
  const band: SensorThermalBand = sensor?.sensorBand ?? classifySensorThermalBand(tempC);
  const slaStatus: SlaComplianceStatus =
    sensor?.slaStatus ?? (band === 'Breached' ? 'Breached' : band === 'Warning' ? 'Warning' : 'Compliant');

  let statusBarClass = 'bg-emerald-300/95';
  if (band === 'Breached') {
    statusBarClass = 'bg-red-500';
  } else if (band === 'Warning') {
    statusBarClass = 'bg-orange-400';
  } else if (band === 'Elevated') {
    statusBarClass = 'bg-amber-300';
  } else if (band === 'Sub-SLA') {
    statusBarClass = 'bg-sky-300';
  }

  return {
    tempC,
    tempLabel: `${tempC.toFixed(1)}°`,
    band,
    slaStatus,
    statusBarClass,
    isThermalAlert: slaStatus === 'Breached' || slaStatus === 'Warning',
  };
}

/**
 * Matches the Tier IV paired cold-aisle floorplan orientation from twin3dLayout.ts:
 * - Odd rows (R01, R03, ..., R19) have their rack fronts facing South (bottom edge toward paired cold aisle).
 * - Even rows (R02, R04, ..., R20) have their rack fronts facing North (top edge toward paired cold aisle).
 */
export function getRackFrontFacing(rowNumber: number): RackInletFacing {
  return rowNumber % 2 === 1 ? 'south' : 'north';
}

/**
 * Smoothly interpolates an ASHRAE Class A1 intake thermal RGB color for a rack's
 * average server inlet temperature (default 17°C–30°C).
 */
export function interpolateInletThermalColor(
  avgInletTempC: number,
  rangeMinC: number = FIXED_INLET_MIN_C,
  rangeMaxC: number = FIXED_INLET_MAX_C
): ThermalColorSample {
  return interpolateSensorThermalColor(avgInletTempC, rangeMinC, rangeMaxC);
}

/**
 * Computes real-time per-rack average server inlet temperature statistics across all racks.
 * - Racks with live ServerNode records compute the exact arithmetic mean of mounted server `inletTempC`.
 * - Standard production racks derive a live BMS cold-aisle coupled server inlet temperature with
 *   subtle cabinet heat-recirculation lift so all 1,600 rack fronts update in real time.
 */
export function computeRackInletThermalStats(
  racks: RackDefinition[],
  servers: ServerNode[],
  bms?: BmsState
): Record<string, RackInletThermalStat> {
  const serversByRack = new Map<string, ServerNode[]>();
  for (const srv of servers) {
    const arr = serversByRack.get(srv.rackId);
    if (arr) arr.push(srv);
    else serversByRack.set(srv.rackId, [srv]);
  }

  const rack3DMetrics = computeRack3DMetrics(racks, servers, bms);
  const bmsSensorMap = bms ? computeBmsSensorRackStats(racks, bms, servers) : null;
  const envByHall = bms ? new Map(bms.envSensors.map((e) => [e.hallId, e])) : null;
  const result: Record<string, RackInletThermalStat> = {};

  for (const rack of racks) {
    const nodes = serversByRack.get(rack.id);
    const metric = rack3DMetrics[rack.id];
    const sensor = bmsSensorMap?.[rack.id];
    const env = envByHall?.get(rack.hallId);
    const slaMinC = env?.slaTempMinC ?? 18.0;
    const slaMaxC = env?.slaTempMaxC ?? 27.0;
    const frontFacing = getRackFrontFacing(rack.rowNumber);

    if (nodes && nodes.length > 0) {
      let inletSum = 0;
      let exhaustSum = 0;
      let minInlet = Infinity;
      let maxInlet = -Infinity;
      for (const node of nodes) {
        const inlet = node.inletTempC;
        inletSum += inlet;
        exhaustSum += node.tempC;
        if (inlet < minInlet) minInlet = inlet;
        if (inlet > maxInlet) maxInlet = inlet;
      }
      const avgInletTempC = round1(inletSum / nodes.length);
      const avgExhaustTempC = round1(exhaustSum / nodes.length);
      const minInletTempC = round1(minInlet);
      const maxInletTempC = round1(maxInlet);

      result[rack.id] = {
        rackId: rack.id,
        hallId: rack.hallId,
        rowNumber: rack.rowNumber,
        rackIndex: rack.rackIndex,
        frontFacing,
        avgInletTempC,
        minInletTempC,
        maxInletTempC,
        inletSpreadC: round1(maxInletTempC - minInletTempC),
        deltaTExhaustToInletC: round1(Math.max(0, avgExhaustTempC - avgInletTempC)),
        serverCount: nodes.length,
        hasLiveServers: true,
        band: classifySensorThermalBand(avgInletTempC, slaMinC, slaMaxC),
      };
    } else {
      const baseColdAisle = sensor?.sensorTempC ?? env?.coldAisleTempC ?? rack.ambientTempC;
      const utilRatio = (metric?.utilizationPct ?? 45) / 100;
      const exhaustEstimate = metric?.peakTempC ? metric.peakTempC - 3.5 : rack.basePeakTempC - 3.5;
      // Cabinet front-door recirculation lift driven by power density, exhaust heat, and critical load
      const bayVariance = (((rack.rowNumber * 11 + rack.rackIndex * 5) % 13) - 6) * 0.1;
      const exhaustRecirc = Math.max(0, (exhaustEstimate - 50) * 0.13);
      const highLoadLift = utilRatio > 0.72 ? (utilRatio - 0.72) * 8.5 : 0;
      const statusLift = metric?.status === 'critical' ? 2.2 : metric?.status === 'warning' ? 0.85 : 0;
      const recircLift = Math.max(0, (utilRatio - 0.35) * 1.8) + exhaustRecirc + highLoadLift + statusLift;
      const avgInletTempC = round1(Math.max(16.0, Math.min(32.0, baseColdAisle + 0.35 + recircLift + bayVariance)));
      const minInletTempC = round1(Math.max(15.5, avgInletTempC - 1.1));
      const maxInletTempC = round1(avgInletTempC + 1.3);

      result[rack.id] = {
        rackId: rack.id,
        hallId: rack.hallId,
        rowNumber: rack.rowNumber,
        rackIndex: rack.rackIndex,
        frontFacing,
        avgInletTempC,
        minInletTempC,
        maxInletTempC,
        inletSpreadC: round1(maxInletTempC - minInletTempC),
        deltaTExhaustToInletC: round1(Math.max(0, exhaustEstimate - avgInletTempC)),
        serverCount: metric?.serverCount ?? Math.max(6, Math.round(rack.baseUsedU / 2)),
        hasLiveServers: false,
        band: classifySensorThermalBand(avgInletTempC, slaMinC, slaMaxC),
      };
    }
  }

  return result;
}

/**
 * Computes hall-level average server inlet temperature summary for the rack-front gradient legend.
 */
export function computeHallInletThermalSummary(
  hallId: HallId,
  racks: RackDefinition[],
  inletMap: Record<string, RackInletThermalStat>
): HallInletThermalSummary {
  const hallRacks = racks.filter((r) => r.hallId === hallId);
  if (hallRacks.length === 0) {
    return {
      hallId,
      avgInletTempC: 20.5,
      minInletTempC: 20.5,
      maxInletTempC: 20.5,
      elevatedCount: 0,
      breachedCount: 0,
      warmestRackId: null,
      warmestInletTempC: 0,
    };
  }

  let sum = 0;
  let minT = Infinity;
  let maxT = -Infinity;
  let elevatedCount = 0;
  let breachedCount = 0;
  let warmestRackId: string | null = null;

  for (const rack of hallRacks) {
    const stat = inletMap[rack.id];
    if (!stat) continue;
    sum += stat.avgInletTempC;
    if (stat.avgInletTempC < minT) minT = stat.avgInletTempC;
    if (stat.avgInletTempC > maxT) {
      maxT = stat.avgInletTempC;
      warmestRackId = rack.id;
    }
    if (stat.avgInletTempC >= 24.0) elevatedCount += 1;
    if (stat.avgInletTempC > 27.0) breachedCount += 1;
  }

  return {
    hallId,
    avgInletTempC: round1(sum / hallRacks.length),
    minInletTempC: round1(minT === Infinity ? 0 : minT),
    maxInletTempC: round1(maxT === -Infinity ? 0 : maxT),
    elevatedCount,
    breachedCount,
    warmestRackId,
    warmestInletTempC: round1(maxT === -Infinity ? 0 : maxT),
  };
}

/**
 * Resolves legend bounds for the Rack Front Average Server Inlet thermal gradient overlay.
 * - Fixed ASHRAE Class A1 intake range: 17°C – 30°C
 * - Dynamic Auto-Range: tightly wraps the hall's live inlet spread (minimum 4°C span)
 */
export function resolveInletHeatmapScaleBounds(
  mode: HeatmapScaleMode,
  summary: HallInletThermalSummary
): { minC: number; maxC: number; ticks: number[] } {
  let minC = FIXED_INLET_MIN_C;
  let maxC = FIXED_INLET_MAX_C;

  if (mode === 'dynamic' && summary.maxInletTempC > 0) {
    minC = Math.floor(Math.max(14, summary.minInletTempC - 1));
    maxC = Math.ceil(Math.max(minC + 4, summary.maxInletTempC + 1));
  }

  const step = (maxC - minC) / 3;
  return {
    minC,
    maxC,
    ticks: [
      round1(minC),
      round1(minC + step),
      round1(minC + step * 2),
      round1(maxC),
    ],
  };
}

/**
 * Generates CSS linear-gradient string matching the ASHRAE server inlet intake ramp.
 */
export function getInletLegendGradientCss(): string {
  return getSensorLegendGradientCss();
}

/**
 * Generates a directional CSS thermal gradient anchored to the rack's cold-aisle-facing front edge:
 * - South-facing rack fronts (odd rows) emit gradient from bottom -> top (`to top`).
 * - North-facing rack fronts (even rows) emit gradient from top -> bottom (`to bottom`).
 */
export function buildRackFrontThermalGradientCss(
  inletStat: Pick<RackInletThermalStat, 'avgInletTempC' | 'frontFacing'>,
  rangeMinC: number = FIXED_INLET_MIN_C,
  rangeMaxC: number = FIXED_INLET_MAX_C,
  intensity: number = 0.92
): RackFrontGradientStyle {
  const sample = interpolateInletThermalColor(inletStat.avgInletTempC, rangeMinC, rangeMaxC);
  const clamped = Math.max(0.25, Math.min(1, intensity));
  const direction = inletStat.frontFacing === 'south' ? 'to top' : 'to bottom';

  const backgroundImage = `linear-gradient(${direction}, ${sample.rgba(clamped)} 0%, ${sample.rgba(
    clamped * 0.72
  )} 34%, ${sample.rgba(clamped * 0.24)} 68%, ${sample.rgba(0.0)} 100%)`;

  return {
    frontFacing: inletStat.frontFacing,
    backgroundImage,
    frontEdgeColor: sample.hex,
    borderGlowColor: sample.rgba(0.65),
    sample,
  };
}

// Calibrated 20°C–45°C Rack Map Heatmap Temperature Scale stops aligned to 5°C intervals:
// 20°C Cool Blue -> 25°C Cyan -> 30°C Optimal Emerald -> 35°C Elevated Amber -> 40°C Warning Orange -> 45°C Critical Crimson
const HEATMAP_TEMPERATURE_SCALE_STOPS: ColorStop[] = [
  { t: 0.0, r: 2, g: 132, b: 199 },   // 20°C #0284C7 Cool Blue
  { t: 0.2, r: 6, g: 182, b: 212 },   // 25°C #06B6D4 Chilled Cyan
  { t: 0.4, r: 16, g: 185, b: 129 },  // 30°C #10B981 Nominal Emerald
  { t: 0.6, r: 245, g: 158, b: 11 },  // 35°C #F59E0B Elevated Amber
  { t: 0.8, r: 234, g: 88, b: 12 },   // 40°C #EA580C Thermal Warning Orange
  { t: 1.0, r: 220, g: 38, b: 38 },   // 45°C #DC2626 Critical Crimson
];

/**
 * Generates the calibrated CSS linear-gradient string for the Rack Map heatmap temperature scale legend (20°C to 45°C).
 */
export function getHeatmapTemperatureScaleGradientCss(): string {
  const parts = HEATMAP_TEMPERATURE_SCALE_STOPS.map(
    (s) => `rgb(${s.r}, ${s.g}, ${s.b}) ${Math.round(s.t * 100)}%`
  );
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}

/**
 * Smoothly interpolates a color along the calibrated 20°C–45°C Rack Map heatmap temperature scale.
 */
export function interpolateTemperatureScaleColor(
  tempC: number,
  rangeMinC: number = HEATMAP_SCALE_LEGEND_MIN_C,
  rangeMaxC: number = HEATMAP_SCALE_LEGEND_MAX_C
): ThermalColorSample {
  return sampleColorStops(tempC, rangeMinC, rangeMaxC, HEATMAP_TEMPERATURE_SCALE_STOPS, (t) => {
    if (t >= 40) return 'Critical';
    if (t >= 35) return 'Hot';
    if (t >= 30) return 'Warm';
    if (t >= 25) return 'Nominal';
    return 'Cool';
  });
}

/**
 * Returns the 5 operational thermal interpretation zones spanning the legend range (default 20°C–45°C).
 */
export function getTemperatureScaleZones(
  rangeMinC: number = HEATMAP_SCALE_LEGEND_MIN_C,
  rangeMaxC: number = HEATMAP_SCALE_LEGEND_MAX_C
): TemperatureScaleZone[] {
  const span = Math.max(5, rangeMaxC - rangeMinC);
  const step = span / 5;
  const defs: Array<{
    id: TemperatureScaleZone['id'];
    label: string;
    description: string;
  }> = [
    { id: 'cool', label: 'Cool', description: 'Chilled cold-aisle intake with full thermal headroom' },
    { id: 'nominal', label: 'Nominal', description: 'Balanced operating range within ASHRAE Class A1 envelope' },
    { id: 'elevated', label: 'Elevated', description: 'Elevated rack thermal density; monitor airflow & CRAC load' },
    { id: 'warning', label: 'Warning', description: 'Thermal warning threshold; inspect hot-aisle recirculation' },
    { id: 'critical', label: 'Critical', description: 'Critical over-temperature zone requiring immediate cooling response' },
  ];

  return defs.map((def, idx) => {
    const zMin = round1(rangeMinC + step * idx);
    const zMax = round1(rangeMinC + step * (idx + 1));
    const mid = (zMin + zMax) / 2;
    const sample = interpolateTemperatureScaleColor(mid, rangeMinC, rangeMaxC);
    return {
      id: def.id,
      label: def.label,
      minC: zMin,
      maxC: zMax,
      colorHex: sample.hex,
      description: def.description,
    };
  });
}

/**
 * Projects a live temperature onto the 0..100% horizontal position of the temperature scale legend bar.
 */
export function computeTemperatureMarkerPercent(
  tempC: number,
  rangeMinC: number = HEATMAP_SCALE_LEGEND_MIN_C,
  rangeMaxC: number = HEATMAP_SCALE_LEGEND_MAX_C
): TemperatureMarkerProjection {
  const span = Math.max(1, rangeMaxC - rangeMinC);
  const rawPct = ((tempC - rangeMinC) / span) * 100;
  const clampedLow = tempC < rangeMinC;
  const clampedHigh = tempC > rangeMaxC;
  const percent = Math.max(0, Math.min(100, Math.round(rawPct * 10) / 10));
  const sample = interpolateTemperatureScaleColor(tempC, rangeMinC, rangeMaxC);
  return {
    tempC: round1(tempC),
    percent,
    clampedLow,
    clampedHigh,
    colorHex: sample.hex,
  };
}

/**
 * Resolves legend scale bounds for the Rack Map thermal heatmap:
 * - Fixed mode: calibrated 20°C–45°C range with 5°C ticks [20, 25, 30, 35, 40, 45].
 * - Dynamic Auto-Range mode: wraps observed hall min–max cleanly across 6 evenly spaced ticks.
 */
export function resolveTemperatureLegendScaleBounds(
  mode: HeatmapScaleMode,
  minObservedC: number,
  maxObservedC: number
): { minC: number; maxC: number; ticks: number[] } {
  if (mode === 'fixed' || maxObservedC <= 0) {
    return {
      minC: HEATMAP_SCALE_LEGEND_MIN_C,
      maxC: HEATMAP_SCALE_LEGEND_MAX_C,
      ticks: [...HEATMAP_SCALE_LEGEND_TICKS],
    };
  }

  const minC = Math.floor(Math.max(15, minObservedC - 1));
  const maxC = Math.ceil(Math.max(minC + 5, maxObservedC + 1));
  const step = (maxC - minC) / 5;
  return {
    minC,
    maxC,
    ticks: [0, 1, 2, 3, 4, 5].map((i) => round1(minC + step * i)),
  };
}




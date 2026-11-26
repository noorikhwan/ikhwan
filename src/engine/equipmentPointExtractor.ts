import { SiteId, SITE_META_MAP, SITES, SiteWorkspaceState } from './sites';
import type {
  GeneratedReport,
  ReportColumn,
  ReportHallScope,
  ReportRow,
  ReportSiteScope,
  ReportSummaryMetric,
} from './reportEngine';
import {
  buildReportFilename,
  formatIsoTimestamp,
  getHallScopeLabel,
  getSiteScopeLabel,
  serializeReportToCsv,
} from './reportEngine';

export type EquipmentCategoryId =
  | 'chiller'
  | 'chw_tank_pump'
  | 'crac_cdu'
  | 'switchgear'
  | 'ups'
  | 'generator'
  | 'diesel_tank'
  | 'cold_aisle_sla'
  | 'gateway'
  | 'server';

export type IntervalUnit = 'seconds' | 'minutes' | 'hours' | 'days';
export type PointAggregationMode = 'sample' | 'avg' | 'max' | 'min';
export type PointExportLayout = 'long' | 'wide';
export type PointWindowPresetId = '1h' | '6h' | '24h' | '7d' | '30d' | 'custom';

export interface EquipmentPointDefinition {
  pointKey: string;
  pointCode: string;
  label: string;
  unit: string;
  decimals: number;
  currentValue: number;
  minClamp: number;
  maxClamp: number;
  volatility: number; // fraction of value or absolute swing amplitude
  absoluteSwing?: number;
}

export interface ExtractableEquipment {
  uid: string; // e.g. "kl1::chw-01"
  siteId: SiteId;
  siteCode: string;
  equipmentId: string;
  name: string;
  category: EquipmentCategoryId;
  categoryLabel: string;
  location: string;
  protocol: string;
  endpoint: string;
  statusLabel: string;
  points: EquipmentPointDefinition[];
}

export interface CustomIntervalSetting {
  value: number;
  unit: IntervalUnit;
}

export interface EquipmentPointExtractionConfig {
  siteScope: ReportSiteScope;
  categoryFilter?: EquipmentCategoryId | 'all';
  selectedEquipmentUids: string[];
  selectedPointKeys: string[];
  interval: CustomIntervalSetting;
  windowPreset: PointWindowPresetId;
  customStartMs?: number;
  customEndMs?: number;
  aggregation: PointAggregationMode;
  layout: PointExportLayout;
  customTitle?: string;
  includeBom?: boolean;
  includeMetadataComments?: boolean;
}

export const EQUIPMENT_CATEGORIES: Array<{ id: EquipmentCategoryId; label: string; shortLabel: string }> = [
  { id: 'chiller', label: 'Chillers (2 Water + 14 Air)', shortLabel: 'Chillers' },
  { id: 'chw_tank_pump', label: 'CHW Square Buffer Tanks & Pumps', shortLabel: 'CHW Tanks' },
  { id: 'crac_cdu', label: 'CRAC & Liquid Cooling CDUs', shortLabel: 'CRAC / CDU' },
  { id: 'switchgear', label: 'HV / MSB / OPSWB Switchgear', shortLabel: 'Switchgear' },
  { id: 'ups', label: '2N Critical UPS Systems', shortLabel: 'UPS' },
  { id: 'generator', label: 'Standby Diesel Generators (8x)', shortLabel: 'Generators' },
  { id: 'diesel_tank', label: 'Basement B1 Diesel Tanks (8x)', shortLabel: 'Diesel Tanks' },
  { id: 'cold_aisle_sla', label: 'Cold Aisle SLA Env Probes', shortLabel: 'Cold Aisle SLA' },
  { id: 'gateway', label: 'BMS Field-Bus Gateways', shortLabel: 'Gateways' },
  { id: 'server', label: 'Server Fleet Compute Nodes', shortLabel: 'Servers' },
];

export const INTERVAL_PRESETS: Array<{ id: string; label: string; setting: CustomIntervalSetting }> = [
  { id: '1m', label: '1 min', setting: { value: 1, unit: 'minutes' } },
  { id: '5m', label: '5 min', setting: { value: 5, unit: 'minutes' } },
  { id: '15m', label: '15 min', setting: { value: 15, unit: 'minutes' } },
  { id: '30m', label: '30 min', setting: { value: 30, unit: 'minutes' } },
  { id: '1h', label: '1 hour', setting: { value: 1, unit: 'hours' } },
  { id: '6h', label: '6 hours', setting: { value: 6, unit: 'hours' } },
  { id: '1d', label: '1 day', setting: { value: 1, unit: 'days' } },
];

export const WINDOW_PRESETS: Array<{ id: Exclude<PointWindowPresetId, 'custom'>; label: string; durationMs: number }> = [
  { id: '1h', label: 'Last 1 Hour', durationMs: 1 * 60 * 60 * 1000 },
  { id: '6h', label: 'Last 6 Hours', durationMs: 6 * 60 * 60 * 1000 },
  { id: '24h', label: 'Last 24 Hours', durationMs: 24 * 60 * 60 * 1000 },
  { id: '7d', label: 'Last 7 Days', durationMs: 7 * 24 * 60 * 60 * 1000 },
  { id: '30d', label: 'Last 30 Days', durationMs: 30 * 24 * 60 * 60 * 1000 },
];

export const MAX_EXTRACTION_INTERVALS = 500;

export function intervalToMs(setting: CustomIntervalSetting): number {
  const safeVal = Number.isFinite(setting.value) ? Math.max(1, Math.round(setting.value)) : 15;
  switch (setting.unit) {
    case 'seconds':
      return Math.max(5_000, safeVal * 1000);
    case 'minutes':
      return safeVal * 60 * 1000;
    case 'hours':
      return safeVal * 60 * 60 * 1000;
    case 'days':
      return safeVal * 24 * 60 * 60 * 1000;
  }
}

export function formatIntervalLabel(setting: CustomIntervalSetting): string {
  const safeVal = Number.isFinite(setting.value) ? Math.max(1, Math.round(setting.value)) : 15;
  const unitLabels: Record<IntervalUnit, [string, string]> = {
    seconds: ['sec', 'sec'],
    minutes: ['min', 'min'],
    hours: ['hr', 'hrs'],
    days: ['day', 'days'],
  };
  const [singular, plural] = unitLabels[setting.unit];
  return `${safeVal} ${safeVal === 1 ? singular : plural}`;
}

export function resolveExtractionTimeRange(
  config: Pick<EquipmentPointExtractionConfig, 'windowPreset' | 'customStartMs' | 'customEndMs'>,
  now: number
): { startMs: number; endMs: number } {
  if (
    config.windowPreset === 'custom' &&
    typeof config.customStartMs === 'number' &&
    typeof config.customEndMs === 'number' &&
    Number.isFinite(config.customStartMs) &&
    Number.isFinite(config.customEndMs) &&
    config.customEndMs > config.customStartMs
  ) {
    return { startMs: config.customStartMs, endMs: config.customEndMs };
  }
  const preset = WINDOW_PRESETS.find((p) => p.id === config.windowPreset) ?? WINDOW_PRESETS[2]; // default 24h
  return { startMs: now - preset.durationMs, endMs: now };
}

export interface IntervalSeriesPlan {
  timestamps: number[];
  intervalMs: number;
  startMs: number;
  endMs: number;
  rawBucketCount: number;
  wasCapped: boolean;
}

export function buildIntervalTimestamps(params: {
  startMs: number;
  endMs: number;
  interval: CustomIntervalSetting;
  maxIntervals?: number;
}): IntervalSeriesPlan {
  const maxIntervals = params.maxIntervals ?? MAX_EXTRACTION_INTERVALS;
  const intervalMs = intervalToMs(params.interval);
  const startMs = Math.min(params.startMs, params.endMs);
  const endMs = Math.max(params.startMs, params.endMs);

  if (endMs <= startMs) {
    return {
      timestamps: [endMs],
      intervalMs,
      startMs,
      endMs,
      rawBucketCount: 1,
      wasCapped: false,
    };
  }

  const rawBucketCount = Math.floor((endMs - startMs) / intervalMs) + 1;
  const wasCapped = rawBucketCount > maxIntervals;
  const timestamps: number[] = [];

  if (!wasCapped) {
    for (let ts = startMs; ts <= endMs; ts += intervalMs) {
      timestamps.push(ts);
    }
    if (timestamps.length === 0 || timestamps[timestamps.length - 1] < endMs) {
      timestamps.push(endMs);
    }
  } else {
    // Keep the most recent maxIntervals points stepping backward from endMs at the exact requested interval
    const firstIncluded = endMs - (maxIntervals - 1) * intervalMs;
    for (let i = 0; i < maxIntervals; i++) {
      timestamps.push(firstIncluded + i * intervalMs);
    }
  }

  return {
    timestamps,
    intervalMs,
    startMs: timestamps[0],
    endMs: timestamps[timestamps.length - 1],
    rawBucketCount,
    wasCapped,
  };
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

/**
 * Generates a deterministic historical point reading anchored at the latest live reading
 * so the final interval equals the live BMS/DCIM telemetry value.
 */
export function evaluatePointSampleAtTimestamp(params: {
  equipmentUid: string;
  point: EquipmentPointDefinition;
  timestampMs: number;
  endMs: number;
  intervalMs: number;
  aggregation: PointAggregationMode;
}): number {
  const { equipmentUid, point, timestampMs, endMs, intervalMs, aggregation } = params;
  const isLatest = timestampMs >= endMs;
  const base = point.currentValue;
  const swing =
    point.absoluteSwing !== undefined
      ? point.absoluteSwing
      : Math.max(0.05, Math.abs(base) * point.volatility);

  const calcSample = (ts: number): number => {
    if (ts >= endMs) return base;
    const seed = hashSeed(`${equipmentUid}:${point.pointKey}`);
    const phaseA = (seed % 360) * (Math.PI / 180);
    const phaseB = ((seed >> 8) % 360) * (Math.PI / 180);

    // Diurnal 24h cycle + 4h operational cycle + deterministic micro-jitter
    const hoursFromEnd = (endMs - ts) / (3600 * 1000);
    const diurnal = Math.sin((ts / (24 * 3600 * 1000)) * Math.PI * 2 + phaseA);
    const shortWave = Math.cos((ts / (4 * 3600 * 1000)) * Math.PI * 2 + phaseB) * 0.45;
    const stepHash = (hashSeed(`${equipmentUid}:${point.pointKey}:${Math.floor(ts / 1000)}`) % 1000) / 1000 - 0.5;
    // Smoothly taper variation near endMs so continuity to live reading is exact
    const taper = Math.min(1, hoursFromEnd / Math.max(0.05, intervalMs / (3600 * 1000)));
    const delta = (diurnal * 0.55 + shortWave * 0.25 + stepHash * 0.4) * swing * taper;
    const raw = base + delta;
    return Math.min(point.maxClamp, Math.max(point.minClamp, raw));
  };

  let value: number;
  if (aggregation === 'sample' || isLatest) {
    value = calcSample(timestampMs);
  } else {
    // Sub-sample 4 quarters within the interval window to compute true avg/max/min
    const subs = [
      calcSample(timestampMs - intervalMs * 0.75),
      calcSample(timestampMs - intervalMs * 0.5),
      calcSample(timestampMs - intervalMs * 0.25),
      calcSample(timestampMs),
    ];
    if (aggregation === 'avg') {
      value = subs.reduce((a, b) => a + b, 0) / subs.length;
    } else if (aggregation === 'max') {
      value = Math.max(...subs);
    } else {
      value = Math.min(...subs);
    }
  }

  return Number(value.toFixed(point.decimals));
}

/**
 * Builds the full extractable equipment catalog & per-equipment telemetry point dictionary
 * from live site state across KL1, KL2, and KL3.
 */
export function buildExtractableEquipmentCatalog(
  sitesMap: Record<SiteId, SiteWorkspaceState>,
  siteScope: ReportSiteScope
): ExtractableEquipment[] {
  const siteIds: SiteId[] = siteScope === 'all' ? SITES.map((s) => s.id) : [siteScope];
  const catalog: ExtractableEquipment[] = [];

  for (const sid of siteIds) {
    const site = sitesMap[sid];
    const meta = SITE_META_MAP[sid];
    const prefix = meta.code;

    // 1. Chillers (2 Water + 14 Air)
    for (const ch of site.bms.chillers) {
      const tag = ch.id.toUpperCase();
      catalog.push({
        uid: `${sid}::${ch.id}`,
        siteId: sid,
        siteCode: meta.code,
        equipmentId: ch.id,
        name: `${ch.name} (${ch.chillerType})`,
        category: 'chiller',
        categoryLabel: 'Chillers',
        location: `Chiller Plant · ${ch.chilledLoop}`,
        protocol: ch.protocol,
        endpoint: ch.endpoint,
        statusLabel: `${ch.mode} · ${ch.status}`,
        points: [
          {
            pointKey: 'chw_supply_temp_c',
            pointCode: `${prefix}:${tag}:AI_CHW_SUP_TEMP`,
            label: 'CHW Supply Temp',
            unit: '°C',
            decimals: 2,
            currentValue: ch.chwSupplyTempC,
            minClamp: 4.5,
            maxClamp: 18,
            volatility: 0.04,
            absoluteSwing: 0.45,
          },
          {
            pointKey: 'chw_return_temp_c',
            pointCode: `${prefix}:${tag}:AI_CHW_RET_TEMP`,
            label: 'CHW Return Temp',
            unit: '°C',
            decimals: 2,
            currentValue: ch.chwReturnTempC,
            minClamp: 8,
            maxClamp: 24,
            volatility: 0.04,
            absoluteSwing: 0.6,
          },
          {
            pointKey: 'cooling_output_kw',
            pointCode: `${prefix}:${tag}:AI_COOLING_KW`,
            label: 'Cooling Output',
            unit: 'kW',
            decimals: 1,
            currentValue: ch.coolingOutputKw,
            minClamp: 0,
            maxClamp: ch.capacityKw * 1.05,
            volatility: 0.08,
          },
          {
            pointKey: 'compressor_load_pct',
            pointCode: `${prefix}:${tag}:AI_COMP_LOAD`,
            label: 'Compressor Load',
            unit: '%',
            decimals: 1,
            currentValue: ch.compressorLoadPct,
            minClamp: 0,
            maxClamp: 100,
            volatility: 0.08,
            absoluteSwing: 6.5,
          },
          {
            pointKey: 'power_draw_kw',
            pointCode: `${prefix}:${tag}:AI_POWER_KW`,
            label: 'Electrical Input Power',
            unit: 'kW',
            decimals: 1,
            currentValue: Number((ch.coolingOutputKw / Math.max(2.5, ch.cop)).toFixed(1)),
            minClamp: 0,
            maxClamp: ch.capacityKw * 0.45,
            volatility: 0.08,
          },
          {
            pointKey: 'condenser_temp_c',
            pointCode: `${prefix}:${tag}:AI_COND_TEMP`,
            label: ch.chillerType === 'Water-Cooled' ? 'Condenser Water Temp' : 'Ambient Condenser Temp',
            unit: '°C',
            decimals: 1,
            currentValue: ch.condenserOrAmbientTempC,
            minClamp: 18,
            maxClamp: 48,
            volatility: 0.04,
            absoluteSwing: 1.2,
          },
          {
            pointKey: 'cop',
            pointCode: `${prefix}:${tag}:AI_COP_EFF`,
            label: 'COP Efficiency',
            unit: 'COP',
            decimals: 2,
            currentValue: ch.cop,
            minClamp: 0,
            maxClamp: 8.5,
            volatility: 0.04,
            absoluteSwing: 0.25,
          },
        ],
      });
    }

    // 2. Rooftop Square CHW Buffer Tanks & Pump Sets (2x)
    for (const p of site.bms.chwTankPumpSets) {
      const tag = p.id.toUpperCase();
      catalog.push({
        uid: `${sid}::${p.id}`,
        siteId: sid,
        siteCode: meta.code,
        equipmentId: p.id,
        name: p.name,
        category: 'chw_tank_pump',
        categoryLabel: 'CHW Tanks',
        location: `Roof Deck · ${p.chilledLoop}`,
        protocol: p.protocol,
        endpoint: p.endpoint,
        statusLabel: `${p.mode} · ${p.activePumps}/${p.totalPumps} Pumps`,
        points: [
          {
            pointKey: 'tank_level_pct',
            pointCode: `${prefix}:${tag}:AI_TANK_LEVEL`,
            label: 'Square Buffer Tank Level',
            unit: '%',
            decimals: 1,
            currentValue: p.tankLevelPct,
            minClamp: 15,
            maxClamp: 100,
            volatility: 0.02,
            absoluteSwing: 1.4,
          },
          {
            pointKey: 'tank_temp_c',
            pointCode: `${prefix}:${tag}:AI_BUFFER_TEMP`,
            label: 'CHW Buffer Water Temp',
            unit: '°C',
            decimals: 2,
            currentValue: p.waterTempC,
            minClamp: 4.5,
            maxClamp: 16,
            volatility: 0.04,
            absoluteSwing: 0.35,
          },
          {
            pointKey: 'flow_rate_lps',
            pointCode: `${prefix}:${tag}:AI_CHW_FLOW`,
            label: 'CHW Loop Flow Rate',
            unit: 'L/s',
            decimals: 1,
            currentValue: p.flowRateLps,
            minClamp: 0,
            maxClamp: 340,
            volatility: 0.06,
          },
          {
            pointKey: 'header_pressure_bar',
            pointCode: `${prefix}:${tag}:AI_HDR_PRESS`,
            label: 'Discharge Header Pressure',
            unit: 'bar',
            decimals: 2,
            currentValue: p.dischargePressureBar,
            minClamp: 0,
            maxClamp: 7.5,
            volatility: 0.05,
            absoluteSwing: 0.18,
          },
          {
            pointKey: 'vfd_speed_pct',
            pointCode: `${prefix}:${tag}:AI_VFD_SPEED`,
            label: 'Pump VFD Speed',
            unit: '%',
            decimals: 1,
            currentValue: p.vfdSpeedPct,
            minClamp: 0,
            maxClamp: 100,
            volatility: 0.06,
            absoluteSwing: 5.0,
          },
          {
            pointKey: 'pump_power_kw',
            pointCode: `${prefix}:${tag}:AI_PUMP_KW`,
            label: 'Pump Set Power',
            unit: 'kW',
            decimals: 1,
            currentValue: p.pumpPowerKw,
            minClamp: 0,
            maxClamp: 240,
            volatility: 0.07,
          },
        ],
      });
    }

    // 3. CRAC & Liquid Cooling CDU Units (8x)
    for (const c of site.bms.cracUnits) {
      const tag = c.id.toUpperCase();
      const pts: EquipmentPointDefinition[] = [
        {
          pointKey: 'supply_temp_c',
          pointCode: `${prefix}:${tag}:AI_SUP_TEMP`,
          label: 'Supply Air / Coolant Temp',
          unit: '°C',
          decimals: 2,
          currentValue: c.supplyTempC,
          minClamp: 14,
          maxClamp: 32,
          volatility: 0.04,
          absoluteSwing: 0.6,
        },
        {
          pointKey: 'return_temp_c',
          pointCode: `${prefix}:${tag}:AI_RET_TEMP`,
          label: 'Return Air / Coolant Temp',
          unit: '°C',
          decimals: 2,
          currentValue: c.returnTempC,
          minClamp: 20,
          maxClamp: 48,
          volatility: 0.04,
          absoluteSwing: 1.1,
        },
        {
          pointKey: 'setpoint_c',
          pointCode: `${prefix}:${tag}:AO_SETPOINT`,
          label: 'Active Setpoint',
          unit: '°C',
          decimals: 1,
          currentValue: c.setpointC,
          minClamp: 16,
          maxClamp: 27,
          volatility: 0,
          absoluteSwing: 0,
        },
        {
          pointKey: 'fan_speed_pct',
          pointCode: `${prefix}:${tag}:AI_FAN_PCT`,
          label: c.coolingType === 'Liquid CDU' ? 'Pump VFD Speed' : 'EC Fan Speed',
          unit: '%',
          decimals: 1,
          currentValue: c.fanSpeedPct,
          minClamp: 0,
          maxClamp: 100,
          volatility: 0.07,
          absoluteSwing: 6,
        },
        {
          pointKey: 'cooling_output_kw',
          pointCode: `${prefix}:${tag}:AI_COOLING_KW`,
          label: 'Cooling Output',
          unit: 'kW',
          decimals: 1,
          currentValue: c.coolingOutputKw,
          minClamp: 0,
          maxClamp: 6000,
          volatility: 0.07,
        },
      ];
      if (c.coolantFlowLpm !== undefined) {
        pts.push({
          pointKey: 'coolant_flow_lpm',
          pointCode: `${prefix}:${tag}:AI_CDU_FLOW_LPM`,
          label: 'Coolant Manifold Flow',
          unit: 'L/min',
          decimals: 1,
          currentValue: c.coolantFlowLpm,
          minClamp: 0,
          maxClamp: 2800,
          volatility: 0.05,
        });
      }
      catalog.push({
        uid: `${sid}::${c.id}`,
        siteId: sid,
        siteCode: meta.code,
        equipmentId: c.id,
        name: `${c.name} (${c.coolingType})`,
        category: 'crac_cdu',
        categoryLabel: 'CRAC / CDU',
        location: `${c.hallLabel} · ${c.chilledLoop}`,
        protocol: c.protocol,
        endpoint: c.endpoint,
        statusLabel: `${c.mode} · ${c.status}`,
        points: pts,
      });
    }

    // 4. Electrical Switchgear (HV / MSB / OPSWB)
    for (const sw of site.bms.electricalSwitchgear) {
      const tag = sw.id.toUpperCase();
      catalog.push({
        uid: `${sid}::${sw.id}`,
        siteId: sid,
        siteCode: meta.code,
        equipmentId: sw.id,
        name: `${sw.name} (${sw.stage} · ${sw.voltageLabel})`,
        category: 'switchgear',
        categoryLabel: 'Switchgear',
        location: `${sw.redundancyPath} · ${sw.stage}`,
        protocol: sw.protocol,
        endpoint: sw.endpoint,
        statusLabel: `Breaker ${sw.breakerState}`,
        points: [
          {
            pointKey: 'active_load_kw',
            pointCode: `${prefix}:${tag}:MOD_ACTIVE_KW`,
            label: 'Total Active Load',
            unit: 'kW',
            decimals: 1,
            currentValue: sw.activeLoadKw,
            minClamp: 0,
            maxClamp: sw.ratedKva * 1.05,
            volatility: 0.06,
          },
          {
            pointKey: 'electrical_serve_kw',
            pointCode: `${prefix}:${tag}:MOD_IT_SERVE_KW`,
            label: 'IT Electrical Serve',
            unit: 'kW',
            decimals: 1,
            currentValue: sw.electricalServeKw,
            minClamp: 0,
            maxClamp: sw.ratedKva,
            volatility: 0.06,
          },
          {
            pointKey: 'mechanical_serve_kw',
            pointCode: `${prefix}:${tag}:MOD_MECH_SERVE_KW`,
            label: 'Mechanical Plant Serve',
            unit: 'kW',
            decimals: 1,
            currentValue: sw.mechanicalServeKw,
            minClamp: 0,
            maxClamp: sw.ratedKva,
            volatility: 0.07,
          },
          {
            pointKey: 'bus_utilization_pct',
            pointCode: `${prefix}:${tag}:MOD_BUS_UTIL`,
            label: 'Bus Utilization',
            unit: '%',
            decimals: 1,
            currentValue: Number(((sw.activeLoadKw / Math.max(1, sw.ratedKva)) * 100).toFixed(1)),
            minClamp: 0,
            maxClamp: 100,
            volatility: 0.06,
            absoluteSwing: 4.5,
          },
          {
            pointKey: 'power_factor',
            pointCode: `${prefix}:${tag}:MOD_PF`,
            label: 'Power Factor',
            unit: 'PF',
            decimals: 3,
            currentValue: sw.powerFactor,
            minClamp: 0.85,
            maxClamp: 1.0,
            volatility: 0.01,
            absoluteSwing: 0.008,
          },
        ],
      });
    }

    // 5. UPS Systems (4x)
    for (const u of site.bms.upsSystems) {
      const tag = u.id.toUpperCase();
      const loadPct = Number(((u.loadKw / Math.max(1, u.capacityKw)) * 100).toFixed(1));
      catalog.push({
        uid: `${sid}::${u.id}`,
        siteId: sid,
        siteCode: meta.code,
        equipmentId: u.id,
        name: `${u.name} (${u.role})`,
        category: 'ups',
        categoryLabel: 'UPS',
        location: `West MEP · ${u.feedBus}`,
        protocol: u.protocol,
        endpoint: u.endpoint,
        statusLabel: `${u.mode} · ${u.status}`,
        points: [
          {
            pointKey: 'load_kw',
            pointCode: `${prefix}:${tag}:MOD_LOAD_KW`,
            label: 'UPS Active Output Load',
            unit: 'kW',
            decimals: 1,
            currentValue: u.loadKw,
            minClamp: 0,
            maxClamp: u.capacityKw,
            volatility: 0.06,
          },
          {
            pointKey: 'load_pct',
            pointCode: `${prefix}:${tag}:MOD_LOAD_PCT`,
            label: 'UPS Load Percentage',
            unit: '%',
            decimals: 1,
            currentValue: loadPct,
            minClamp: 0,
            maxClamp: 100,
            volatility: 0.06,
            absoluteSwing: 4.5,
          },
          {
            pointKey: 'battery_soc_pct',
            pointCode: `${prefix}:${tag}:MOD_BATT_SOC`,
            label: 'Battery State of Charge',
            unit: '%',
            decimals: 1,
            currentValue: u.batterySocPct,
            minClamp: 0,
            maxClamp: 100,
            volatility: 0.01,
            absoluteSwing: 0.8,
          },
          {
            pointKey: 'runtime_min',
            pointCode: `${prefix}:${tag}:MOD_RUNTIME_MIN`,
            label: 'Estimated Battery Runtime',
            unit: 'min',
            decimals: 1,
            currentValue: u.runtimeMin,
            minClamp: 0,
            maxClamp: 90,
            volatility: 0.04,
            absoluteSwing: 1.5,
          },
          {
            pointKey: 'input_voltage_v',
            pointCode: `${prefix}:${tag}:MOD_IN_VOLT`,
            label: 'Input Bus Voltage',
            unit: 'V',
            decimals: 1,
            currentValue: u.inputVoltageV,
            minClamp: 440,
            maxClamp: 510,
            volatility: 0.005,
            absoluteSwing: 1.2,
          },
        ],
      });
    }

    // 6. Standby Diesel Generators (8x)
    for (const g of site.bms.generators) {
      const tag = g.id.toUpperCase();
      catalog.push({
        uid: `${sid}::${g.id}`,
        siteId: sid,
        siteCode: meta.code,
        equipmentId: g.id,
        name: `${g.name} (${g.role})`,
        category: 'generator',
        categoryLabel: 'Generators',
        location: `East Yard · ${g.feedBus}`,
        protocol: g.protocol,
        endpoint: g.endpoint,
        statusLabel: g.state,
        points: [
          {
            pointKey: 'output_kw',
            pointCode: `${prefix}:${tag}:MOD_GEN_OUT_KW`,
            label: 'Generator Electrical Output',
            unit: 'kW',
            decimals: 1,
            currentValue: g.outputKw,
            minClamp: 0,
            maxClamp: g.ratedKw,
            volatility: 0.05,
          },
          {
            pointKey: 'fuel_level_pct',
            pointCode: `${prefix}:${tag}:MOD_FUEL_PCT`,
            label: 'Day-Tank Fuel Level',
            unit: '%',
            decimals: 1,
            currentValue: g.fuelLevelPct,
            minClamp: 0,
            maxClamp: 100,
            volatility: 0.01,
            absoluteSwing: 0.5,
          },
          {
            pointKey: 'coolant_temp_c',
            pointCode: `${prefix}:${tag}:MOD_COOLANT_C`,
            label: 'Jacket Water Temp',
            unit: '°C',
            decimals: 1,
            currentValue: g.coolantTempC,
            minClamp: 25,
            maxClamp: 105,
            volatility: 0.03,
            absoluteSwing: 1.8,
          },
          {
            pointKey: 'fuel_autonomy_h',
            pointCode: `${prefix}:${tag}:MOD_AUTONOMY_H`,
            label: 'Fuel Autonomy Hours',
            unit: 'hrs',
            decimals: 1,
            currentValue: g.fuelAutonomyHours,
            minClamp: 0,
            maxClamp: 120,
            volatility: 0.01,
            absoluteSwing: 0.6,
          },
        ],
      });
    }

    // 7. Basement B1 Diesel Tanks (8x)
    for (const t of site.bms.dieselTanks) {
      const tag = t.id.toUpperCase();
      catalog.push({
        uid: `${sid}::${t.id}`,
        siteId: sid,
        siteCode: meta.code,
        equipmentId: t.id,
        name: t.name,
        category: 'diesel_tank',
        categoryLabel: 'Diesel Tanks',
        location: `${t.vaultZone} · ${t.redundancyPath}`,
        protocol: t.protocol,
        endpoint: t.endpoint,
        statusLabel: `${t.transferPumpMode} · ${t.levelPct.toFixed(1)}%`,
        points: [
          {
            pointKey: 'level_pct',
            pointCode: `${prefix}:${tag}:MOD_TANK_PCT`,
            label: 'Diesel Level',
            unit: '%',
            decimals: 2,
            currentValue: t.levelPct,
            minClamp: 0,
            maxClamp: 100,
            volatility: 0.005,
            absoluteSwing: 0.35,
          },
          {
            pointKey: 'current_liters',
            pointCode: `${prefix}:${tag}:MOD_TANK_LITERS`,
            label: 'Fuel Volume',
            unit: 'L',
            decimals: 0,
            currentValue: t.currentLiters,
            minClamp: 0,
            maxClamp: t.capacityLiters,
            volatility: 0.005,
            absoluteSwing: 180,
          },
          {
            pointKey: 'supply_pressure_bar',
            pointCode: `${prefix}:${tag}:MOD_SUP_PRESS`,
            label: 'Supply Header Pressure',
            unit: 'bar',
            decimals: 2,
            currentValue: t.supplyPressureBar,
            minClamp: 0,
            maxClamp: 6.5,
            volatility: 0.04,
            absoluteSwing: 0.14,
          },
          {
            pointKey: 'fuel_temp_c',
            pointCode: `${prefix}:${tag}:MOD_FUEL_TEMP`,
            label: 'Fuel Temperature',
            unit: '°C',
            decimals: 1,
            currentValue: t.fuelTempC,
            minClamp: 15,
            maxClamp: 45,
            volatility: 0.02,
            absoluteSwing: 0.5,
          },
        ],
      });
    }

    // 8. Cold Aisle SLA Environmental Sensors (4 Halls)
    for (const env of site.bms.envSensors) {
      const tag = env.hallId.toUpperCase();
      catalog.push({
        uid: `${sid}::env-${env.hallId}`,
        siteId: sid,
        siteCode: meta.code,
        equipmentId: `env-${env.hallId}`,
        name: `${env.hallLabel} Cold Aisle SLA Probes`,
        category: 'cold_aisle_sla',
        categoryLabel: 'Cold Aisle SLA',
        location: `${env.hallLabel} · 40 Row Probes`,
        protocol: 'BACnet/IP',
        endpoint: `${env.slaProbeAId} / ${env.slaProbeBId}`,
        statusLabel: `${env.tempSlaStatus} / ${env.humiditySlaStatus}`,
        points: [
          {
            pointKey: 'cold_aisle_temp_c',
            pointCode: `${prefix}:${tag}:AI_COLD_AISLE_C`,
            label: 'Cold Aisle Temp',
            unit: '°C',
            decimals: 2,
            currentValue: env.coldAisleTempC,
            minClamp: 15,
            maxClamp: 34,
            volatility: 0.03,
            absoluteSwing: 0.55,
          },
          {
            pointKey: 'humidity_pct',
            pointCode: `${prefix}:${tag}:AI_COLD_AISLE_RH`,
            label: 'Relative Humidity',
            unit: '% RH',
            decimals: 1,
            currentValue: env.humidityPct,
            minClamp: 25,
            maxClamp: 75,
            volatility: 0.04,
            absoluteSwing: 1.8,
          },
          {
            pointKey: 'dew_point_c',
            pointCode: `${prefix}:${tag}:AI_DEW_POINT_C`,
            label: 'Dew Point',
            unit: '°C',
            decimals: 2,
            currentValue: env.dewPointC,
            minClamp: 4,
            maxClamp: 20,
            volatility: 0.04,
            absoluteSwing: 0.45,
          },
          {
            pointKey: 'diff_pressure_pa',
            pointCode: `${prefix}:${tag}:AI_DIFF_PRESS_PA`,
            label: 'Underfloor Diff Pressure',
            unit: 'Pa',
            decimals: 1,
            currentValue: env.differentialPressurePa,
            minClamp: 0,
            maxClamp: 40,
            volatility: 0.06,
            absoluteSwing: 1.2,
          },
          {
            pointKey: 'sla_compliance_pct',
            pointCode: `${prefix}:${tag}:AI_SLA_30D_PCT`,
            label: '30-Day SLA Compliance',
            unit: '%',
            decimals: 2,
            currentValue: env.slaCompliancePct,
            minClamp: 95,
            maxClamp: 100,
            volatility: 0.002,
            absoluteSwing: 0.04,
          },
        ],
      });
    }

    // 9. BMS Gateways (6x)
    for (const gw of site.bms.gateways) {
      const tag = gw.id.toUpperCase();
      catalog.push({
        uid: `${sid}::${gw.id}`,
        siteId: sid,
        siteCode: meta.code,
        equipmentId: gw.id,
        name: `${gw.name} (${gw.role})`,
        category: 'gateway',
        categoryLabel: 'Gateways',
        location: 'BMS Core Network',
        protocol: gw.protocol,
        endpoint: gw.endpoint,
        statusLabel: gw.connected ? 'Connected' : 'Offline',
        points: [
          {
            pointKey: 'latency_ms',
            pointCode: `${prefix}:${tag}:GW_LATENCY_MS`,
            label: 'Poll Round-Trip Latency',
            unit: 'ms',
            decimals: 1,
            currentValue: gw.latencyMs,
            minClamp: 1,
            maxClamp: 500,
            volatility: 0.12,
            absoluteSwing: 3.5,
          },
          {
            pointKey: 'mapped_points',
            pointCode: `${prefix}:${tag}:GW_MAPPED_PTS`,
            label: 'Active Mapped Points',
            unit: 'pts',
            decimals: 0,
            currentValue: gw.mappedPoints,
            minClamp: 0,
            maxClamp: 5000,
            volatility: 0,
            absoluteSwing: 0,
          },
        ],
      });
    }

    // 10. Server Fleet Nodes (24x)
    for (const s of site.servers) {
      const tag = s.id.toUpperCase();
      catalog.push({
        uid: `${sid}::${s.id}`,
        siteId: sid,
        siteCode: meta.code,
        equipmentId: s.id,
        name: `${s.hostname} (${s.rackId})`,
        category: 'server',
        categoryLabel: 'Servers',
        location: `${s.rackId} · U${s.uStart}`,
        protocol: 'Redfish / IPMI',
        endpoint: s.ip,
        statusLabel: s.status.toUpperCase(),
        points: [
          {
            pointKey: 'cpu_pct',
            pointCode: `${prefix}:${tag}:RF_CPU_UTIL`,
            label: 'CPU Utilization',
            unit: '%',
            decimals: 1,
            currentValue: s.cpu,
            minClamp: 2,
            maxClamp: 100,
            volatility: 0.14,
            absoluteSwing: 9.5,
          },
          {
            pointKey: 'memory_pct',
            pointCode: `${prefix}:${tag}:RF_MEM_UTIL`,
            label: 'Memory Utilization',
            unit: '%',
            decimals: 1,
            currentValue: s.memory,
            minClamp: 5,
            maxClamp: 100,
            volatility: 0.06,
            absoluteSwing: 4.0,
          },
          {
            pointKey: 'inlet_temp_c',
            pointCode: `${prefix}:${tag}:IPMI_INLET_C`,
            label: 'Inlet Temperature',
            unit: '°C',
            decimals: 1,
            currentValue: s.inletTempC,
            minClamp: 16,
            maxClamp: 42,
            volatility: 0.04,
            absoluteSwing: 0.9,
          },
          {
            pointKey: 'exhaust_temp_c',
            pointCode: `${prefix}:${tag}:IPMI_EXHAUST_C`,
            label: 'Exhaust Temperature',
            unit: '°C',
            decimals: 1,
            currentValue: s.tempC,
            minClamp: 24,
            maxClamp: 98,
            volatility: 0.07,
            absoluteSwing: 3.4,
          },
          {
            pointKey: 'power_w',
            pointCode: `${prefix}:${tag}:IPMI_POWER_W`,
            label: 'Host Power Draw',
            unit: 'W',
            decimals: 0,
            currentValue: s.powerW,
            minClamp: 80,
            maxClamp: s.ratedPowerW * 1.1,
            volatility: 0.1,
          },
          {
            pointKey: 'network_gbps',
            pointCode: `${prefix}:${tag}:SNMP_NET_GBPS`,
            label: 'Network Throughput',
            unit: 'Gbps',
            decimals: 2,
            currentValue: s.networkGbps,
            minClamp: 0,
            maxClamp: 400,
            volatility: 0.18,
          },
          {
            pointKey: 'fan_rpm',
            pointCode: `${prefix}:${tag}:IPMI_FAN_RPM`,
            label: 'Chassis Fan Speed',
            unit: 'RPM',
            decimals: 0,
            currentValue: s.fanRpm,
            minClamp: 1200,
            maxClamp: 18000,
            volatility: 0.08,
          },
        ],
      });
    }
  }

  return catalog;
}

/**
 * Generates an equipment point-data time-series report at the exact custom interval
 * configured by the operator (supports both normalized Long format and pivoted Wide format).
 */
export function generateEquipmentPointReport(params: {
  config: EquipmentPointExtractionConfig;
  sitesMap: Record<SiteId, SiteWorkspaceState>;
  now?: number;
}): GeneratedReport {
  const { config, sitesMap } = params;
  const now = params.now ?? Date.now();

  const fullCatalog = buildExtractableEquipmentCatalog(sitesMap, config.siteScope);
  const categoryFiltered =
    config.categoryFilter && config.categoryFilter !== 'all'
      ? fullCatalog.filter((eq) => eq.category === config.categoryFilter)
      : fullCatalog;

  // Resolve selected equipment (fallback to first 4 matching items if empty array was passed programmatically)
  const selectedUidSet = new Set(config.selectedEquipmentUids);
  const targetEquipment =
    selectedUidSet.size > 0
      ? fullCatalog.filter((eq) => selectedUidSet.has(eq.uid))
      : categoryFiltered.slice(0, 4);

  const selectedPointKeySet = new Set(config.selectedPointKeys);

  // Pair each selected equipment with its active selected points (or all points if none explicitly filtered)
  const activePairs: Array<{ equipment: ExtractableEquipment; point: EquipmentPointDefinition }> = [];
  for (const eq of targetEquipment) {
    const matchedPoints =
      selectedPointKeySet.size > 0
        ? eq.points.filter((p) => selectedPointKeySet.has(p.pointKey))
        : eq.points;
    for (const pt of matchedPoints) {
      activePairs.push({ equipment: eq, point: pt });
    }
  }

  const range = resolveExtractionTimeRange(config, now);
  const plan = buildIntervalTimestamps({
    startMs: range.startMs,
    endMs: range.endMs,
    interval: config.interval,
  });

  const intervalLabel = formatIntervalLabel(config.interval);
  const aggLabelMap: Record<PointAggregationMode, string> = {
    sample: 'Instantaneous Sample',
    avg: 'Interval Average',
    max: 'Interval Peak (Max)',
    min: 'Interval Minimum',
  };

  let columns: ReportColumn[] = [];
  const rows: ReportRow[] = [];

  if (config.layout === 'wide') {
    columns = [
      { key: 'timestamp', label: 'Timestamp (UTC)' },
      { key: 'intervalStep', label: 'Interval', align: 'right' },
      ...activePairs.map(({ equipment, point }) => ({
        key: `${equipment.uid}::${point.pointKey}`,
        label: `${equipment.siteCode} ${equipment.equipmentId.toUpperCase()} · ${point.label} (${point.unit})`,
        align: 'right' as const,
      })),
    ];

    for (let idx = 0; idx < plan.timestamps.length; idx++) {
      const ts = plan.timestamps[idx];
      const row: ReportRow = {
        timestamp: formatIsoTimestamp(ts),
        intervalStep: `${idx + 1}/${plan.timestamps.length}`,
      };
      for (const { equipment, point } of activePairs) {
        const key = `${equipment.uid}::${point.pointKey}`;
        row[key] = evaluatePointSampleAtTimestamp({
          equipmentUid: equipment.uid,
          point,
          timestampMs: ts,
          endMs: plan.endMs,
          intervalMs: plan.intervalMs,
          aggregation: config.aggregation,
        });
      }
      rows.push(row);
    }
  } else {
    // Normalized Long Format: 1 row per Timestamp x Equipment x Point
    columns = [
      { key: 'timestamp', label: 'Timestamp (UTC)' },
      { key: 'siteCode', label: 'Site' },
      { key: 'category', label: 'Equipment Class' },
      { key: 'equipmentId', label: 'Equipment ID' },
      { key: 'equipmentName', label: 'Equipment Name' },
      { key: 'protocol', label: 'Protocol' },
      { key: 'pointCode', label: 'Point Address' },
      { key: 'pointName', label: 'Point Name' },
      { key: 'value', label: 'Value', align: 'right' },
      { key: 'unit', label: 'Unit' },
      { key: 'aggregation', label: 'Aggregation' },
      { key: 'interval', label: 'Interval' },
    ];

    for (const ts of plan.timestamps) {
      const tsLabel = formatIsoTimestamp(ts);
      for (const { equipment, point } of activePairs) {
        const val = evaluatePointSampleAtTimestamp({
          equipmentUid: equipment.uid,
          point,
          timestampMs: ts,
          endMs: plan.endMs,
          intervalMs: plan.intervalMs,
          aggregation: config.aggregation,
        });
        rows.push({
          timestamp: tsLabel,
          siteCode: equipment.siteCode,
          category: equipment.categoryLabel,
          equipmentId: equipment.equipmentId.toUpperCase(),
          equipmentName: equipment.name,
          protocol: equipment.protocol,
          pointCode: point.pointCode,
          pointName: point.label,
          value: val,
          unit: point.unit,
          aggregation: aggLabelMap[config.aggregation],
          interval: intervalLabel,
        });
      }
    }
  }

  const siteScopeLabel = getSiteScopeLabel(config.siteScope);
  const hallScopeLabel = getHallScopeLabel('all' as ReportHallScope);
  const trimmedTitle = config.customTitle?.trim();
  const title = trimmedTitle
    ? trimmedTitle
    : `Equipment Point Data (${intervalLabel}) — ${config.siteScope === 'all' ? 'All Sites' : SITE_META_MAP[config.siteScope].code}`;

  const summaryMetrics: ReportSummaryMetric[] = [
    {
      label: 'Equipment & Points',
      value: `${targetEquipment.length} Units · ${activePairs.length} Pts`,
      detail: config.layout === 'wide' ? 'Pivoted Wide Matrix' : 'Normalized Long Table',
      tone: 'neutral',
    },
    {
      label: 'Custom Interval',
      value: intervalLabel,
      detail: aggLabelMap[config.aggregation],
      tone: 'positive',
    },
    {
      label: 'Sample Buckets',
      value: `${plan.timestamps.length.toLocaleString()}`,
      detail: plan.wasCapped
        ? `Capped to latest ${MAX_EXTRACTION_INTERVALS} of ${plan.rawBucketCount.toLocaleString()}`
        : `${formatIsoTimestamp(plan.startMs).slice(5, 16)} → ${formatIsoTimestamp(plan.endMs).slice(5, 16)}`,
      tone: plan.wasCapped ? 'warning' : 'neutral',
    },
    {
      label: 'Extracted Data Rows',
      value: rows.length.toLocaleString(),
      detail: `${(plan.timestamps.length * activePairs.length).toLocaleString()} total point readings`,
      tone: 'positive',
    },
  ];

  const filename = buildReportFilename('equipment_points', config.siteScope, 'all', now);
  const csvContent = serializeReportToCsv({
    columns,
    rows,
    title,
    siteScopeLabel,
    hallScopeLabel: `${intervalLabel} · ${aggLabelMap[config.aggregation]}`,
    generatedAt: now,
    includeBom: config.includeBom ?? true,
    includeMetadataComments: config.includeMetadataComments ?? false,
  });
  const byteSize = new TextEncoder().encode(csvContent).length;

  return {
    id: `rpt-equipment-points-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    typeId: 'equipment_points',
    typeLabel: 'Equipment Point Data (Custom Interval)',
    category: 'Facilities',
    siteScope: config.siteScope,
    siteScopeLabel,
    hallScope: 'all',
    hallScopeLabel: `${intervalLabel} · ${aggLabelMap[config.aggregation]}`,
    recordFilter: 'all',
    generatedAt: now,
    filename,
    columns,
    rows,
    summaryMetrics,
    csvContent,
    byteSize,
  };
}

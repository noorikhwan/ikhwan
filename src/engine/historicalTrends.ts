import { computeTier4RedundancySummary } from './bmsEngine';
import { SITES, SiteId, SiteWorkspaceState } from './sites';
import { computeFacilitySummary } from './telemetryEngine';
import { HallId, RackDefinition } from './types';

export type HistoryHorizonId = '6m' | '1y' | '18m' | '2y' | '3y';

export interface HistoryHorizonMeta {
  id: HistoryHorizonId;
  label: string;
  shortLabel: string;
  months: number;
  description: string;
}

export const HISTORY_HORIZONS: HistoryHorizonMeta[] = [
  { id: '6m', label: '6 Months', shortLabel: '6M', months: 6, description: 'Trailing 6-month window' },
  { id: '1y', label: '1 Year', shortLabel: '1Y', months: 12, description: 'Trailing 12-month window' },
  { id: '18m', label: '18 Months', shortLabel: '18M', months: 18, description: '1.5-year cross-season trend' },
  { id: '2y', label: '2 Years', shortLabel: '2Y', months: 24, description: '24-month YoY comparison' },
  { id: '3y', label: '3 Years', shortLabel: '3Y', months: 36, description: '36-month multi-year history' },
];

export const HISTORY_HORIZON_MAP: Record<HistoryHorizonId, HistoryHorizonMeta> = HISTORY_HORIZONS.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<HistoryHorizonId, HistoryHorizonMeta>
);

export type TrendMetricId =
  | 'itLoadMw'
  | 'pue'
  | 'coldAisleTempC'
  | 'coldAisleHumidityPct'
  | 'coolingOutputMw'
  | 'slaCompliancePct';

export interface TrendMetricMeta {
  id: TrendMetricId;
  label: string;
  shortLabel: string;
  unit: string;
  decimals: number;
  stroke: string;
  secondaryStroke?: string;
  secondaryLabel?: string;
  lowerIsBetter?: boolean;
  slaBand?: { min: number; max: number; label: string };
  benchmark?: { value: number; label: string };
}

export const TREND_METRICS: TrendMetricMeta[] = [
  {
    id: 'itLoadMw',
    label: 'IT Power Load',
    shortLabel: 'IT Load',
    unit: 'MW',
    decimals: 2,
    stroke: '#10b981',
    secondaryStroke: '#0ea5e9',
    secondaryLabel: 'Monthly Peak (MW)',
  },
  {
    id: 'pue',
    label: 'PUE Efficiency',
    shortLabel: 'PUE',
    unit: '',
    decimals: 3,
    stroke: '#0ea5e9',
    lowerIsBetter: true,
    benchmark: { value: 1.3, label: 'Target PUE 1.300' },
  },
  {
    id: 'coldAisleTempC',
    label: 'Cold Aisle Temp',
    shortLabel: 'Cold Temp',
    unit: '°C',
    decimals: 1,
    stroke: '#f59e0b',
    secondaryStroke: '#ef4444',
    secondaryLabel: 'Peak Cold Aisle (°C)',
    slaBand: { min: 18, max: 27, label: 'ASHRAE A1 SLA 18–27°C' },
  },
  {
    id: 'coldAisleHumidityPct',
    label: 'Cold Aisle Humidity',
    shortLabel: 'Humidity',
    unit: '% RH',
    decimals: 1,
    stroke: '#06b6d4',
    slaBand: { min: 40, max: 60, label: 'ASHRAE A1 SLA 40–60% RH' },
  },
  {
    id: 'coolingOutputMw',
    label: 'Chiller Plant Cooling',
    shortLabel: 'Cooling',
    unit: 'MW',
    decimals: 2,
    stroke: '#6366f1',
  },
  {
    id: 'slaCompliancePct',
    label: 'Cold Aisle SLA Compliance',
    shortLabel: 'SLA %',
    unit: '%',
    decimals: 2,
    stroke: '#10b981',
    benchmark: { value: 99.95, label: 'Target 99.95%' },
  },
];

export const TREND_METRIC_MAP: Record<TrendMetricId, TrendMetricMeta> = TREND_METRICS.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<TrendMetricId, TrendMetricMeta>
);

export interface HistoricalTrendPoint {
  monthKey: string; // YYYY-MM
  label: string; // e.g., "Nov 2026"
  shortLabel: string; // e.g., "Nov '26"
  year: number;
  monthIndex: number; // 0..11
  timestamp: number;
  itLoadMw: number;
  peakItLoadMw: number;
  pue: number;
  coolingOutputMw: number;
  coldAisleTempC: number;
  coldAislePeakTempC: number;
  coldAisleHumidityPct: number;
  slaCompliancePct: number;
  tier4AvailabilityPct: number;
  rackUtilizationPct: number;
  alertCount: number;
}

export interface HistoricalTrendSummary {
  metric: TrendMetricMeta;
  horizonMonths: number;
  yearSpanLabel: string;
  startValue: number;
  startLabel: string;
  currentValue: number;
  currentLabel: string;
  delta: number;
  deltaPct: number;
  yoyDelta: number | null;
  yoyDeltaPct: number | null;
  yoyReferenceLabel: string | null;
  average: number;
  minValue: number;
  minLabel: string;
  maxValue: number;
  maxLabel: string;
  forecastNextQuarter: number;
  forecastDelta: number;
  avgSlaCompliancePct: number;
  avgTier4AvailabilityPct: number;
  totalAlerts: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function deterministicNoise(seedStr: string): number {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Map unsigned 32-bit int to [-1, 1]
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round(v: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

interface LiveAnchor {
  itLoadMw: number;
  pue: number;
  coolingOutputMw: number;
  coldAisleTempC: number;
  coldAisleHumidityPct: number;
  slaCompliancePct: number;
  tier4AvailabilityPct: number;
  rackUtilizationPct: number;
  openAlerts: number;
}

function computeLiveAnchor(
  sitesMap: Record<SiteId, SiteWorkspaceState>,
  racks: RackDefinition[],
  siteScope: SiteId | 'all',
  hallScope: HallId | 'all'
): LiveAnchor {
  const siteIds: SiteId[] = siteScope === 'all' ? SITES.map((s) => s.id) : [siteScope];
  const scopedRacks = hallScope === 'all' ? racks : racks.filter((r) => r.hallId === hallScope);

  let totalItLoadKw = 0;
  let totalCapKw = 0;
  let weightedPueSum = 0;
  let totalCoolingKw = 0;
  let tempSum = 0;
  let rhSum = 0;
  let slaSum = 0;
  let envCount = 0;
  let tier4Sum = 0;
  let openAlerts = 0;

  for (const sid of siteIds) {
    const site = sitesMap[sid];
    const scopedServers =
      hallScope === 'all' ? site.servers : site.servers.filter((s) => s.hallId === hallScope);
    const summary = computeFacilitySummary(scopedServers, scopedRacks, site.alerts);
    const tier4 = computeTier4RedundancySummary(site.bms, site.servers);

    totalItLoadKw += summary.totalItLoadKw;
    totalCapKw += summary.totalFacilityCapacityKw;
    weightedPueSum += summary.pue * Math.max(1, summary.totalItLoadKw);

    if (hallScope === 'all') {
      const chillerKw = site.bms.chillers.reduce((sum, ch) => sum + ch.coolingOutputKw, 0);
      totalCoolingKw += chillerKw > 0 ? chillerKw : site.bms.cracUnits.reduce((s, c) => s + c.coolingOutputKw, 0);
    } else {
      const hallCracs = site.bms.cracUnits.filter((c) => c.hallId === hallScope);
      totalCoolingKw += hallCracs.reduce((sum, c) => sum + c.coolingOutputKw, 0);
    }

    const scopedEnvs =
      hallScope === 'all'
        ? site.bms.envSensors
        : site.bms.envSensors.filter((e) => e.hallId === hallScope);

    for (const env of scopedEnvs) {
      tempSum += env.coldAisleTempC;
      rhSum += env.humidityPct;
      slaSum += env.slaCompliancePct;
      envCount++;
    }

    tier4Sum += tier4.zeroSpofVerified ? 99.998 : 99.965;
    openAlerts += summary.activeAlertCount;
  }

  const itLoadMw = Math.max(0.4, totalItLoadKw / 1000);
  const pue = totalItLoadKw > 0 ? weightedPueSum / totalItLoadKw : 1.28;
  const coolingOutputMw = Math.max(0.4, totalCoolingKw / 1000);
  const coldAisleTempC = envCount > 0 ? tempSum / envCount : 21.8;
  const coldAisleHumidityPct = envCount > 0 ? rhSum / envCount : 48.5;
  const slaCompliancePct = envCount > 0 ? slaSum / envCount : 99.96;
  const tier4AvailabilityPct = siteIds.length > 0 ? tier4Sum / siteIds.length : 99.998;
  const rackUtilizationPct = totalCapKw > 0 ? (totalItLoadKw / totalCapKw) * 100 : 62;

  return {
    itLoadMw,
    pue,
    coolingOutputMw,
    coldAisleTempC,
    coldAisleHumidityPct,
    slaCompliancePct,
    tier4AvailabilityPct,
    rackUtilizationPct,
    openAlerts,
  };
}

/**
 * Generates deterministic monthly historical telemetry spanning 6 to 36 months (past 1 year),
 * anchored to the live operational state of the chosen site & data hall scope.
 */
export function buildHistoricalTrendSeries(params: {
  sitesMap: Record<SiteId, SiteWorkspaceState>;
  racks: RackDefinition[];
  siteScope: SiteId | 'all';
  hallScope: HallId | 'all';
  horizon: HistoryHorizonId;
  now?: number;
}): HistoricalTrendPoint[] {
  const { sitesMap, racks, siteScope, hallScope, horizon } = params;
  const now = params.now ?? Date.now();
  const months = HISTORY_HORIZON_MAP[horizon].months;
  const anchor = computeLiveAnchor(sitesMap, racks, siteScope, hallScope);

  const nowDate = new Date(now);
  const currentYear = nowDate.getUTCFullYear();
  const currentMonth = nowDate.getUTCMonth(); // 0..11

  // Hall B (AI & GPU) grew fastest over the past 3 years
  const annualGrowthRate =
    hallScope === 'hall-b'
      ? 0.19
      : hallScope === 'hall-d'
      ? 0.14
      : siteScope === 'kl2'
      ? 0.16
      : 0.13;

  // Chiller plant tuning improved PUE steadily over 36 months
  const annualPueImprovement = 0.018;

  const points: HistoricalTrendPoint[] = [];

  for (let offset = months - 1; offset >= 0; offset--) {
    const dt = new Date(Date.UTC(currentYear, currentMonth - offset, 1, 12, 0, 0));
    const year = dt.getUTCFullYear();
    const monthIndex = dt.getUTCMonth();
    const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    const label = `${MONTH_NAMES[monthIndex]} ${year}`;
    const shortLabel = `${MONTH_NAMES[monthIndex]} '${String(year).slice(2)}`;

    const yearsBack = offset / 12;
    const isLatest = offset === 0;

    const nLoad = deterministicNoise(`${siteScope}:${hallScope}:${monthKey}:load`);
    const nTemp = deterministicNoise(`${siteScope}:${hallScope}:${monthKey}:temp`);
    const nRh = deterministicNoise(`${siteScope}:${hallScope}:${monthKey}:rh`);
    const nPue = deterministicNoise(`${siteScope}:${hallScope}:${monthKey}:pue`);
    const nSla = deterministicNoise(`${siteScope}:${hallScope}:${monthKey}:sla`);

    // Kuala Lumpur tropical seasonal dynamics:
    // Mar–May (months 2..4): warmest/driest inter-monsoon → slight condenser/PUE lift
    // Nov–Jan (months 10, 11, 0): Northeast monsoon → higher ambient humidity
    const drySeasonWave = Math.sin(((monthIndex - 1) / 12) * Math.PI * 2);
    const monsoonWave = Math.cos(((monthIndex + 0.5) / 12) * Math.PI * 2);

    // Growth curve: backwards compounding so offset=0 matches live anchor
    const growthFactor = isLatest ? 1 : Math.pow(1 + annualGrowthRate, -yearsBack);
    const seasonalLoadFactor = isLatest ? 1 : 1 + 0.018 * Math.sin((monthIndex / 12) * Math.PI * 2) + nLoad * 0.018;
    const itLoadMw = round(
      clamp(anchor.itLoadMw * growthFactor * seasonalLoadFactor, 0.25, anchor.itLoadMw * 1.25),
      2
    );

    const peakMultiplier = 1.07 + Math.abs(nLoad) * 0.045;
    const peakItLoadMw = round(itLoadMw * peakMultiplier, 2);

    const pue = isLatest
      ? round(clamp(anchor.pue, 1.15, 1.65), 3)
      : round(
          clamp(
            anchor.pue + yearsBack * annualPueImprovement + drySeasonWave * 0.018 + nPue * 0.012,
            1.16,
            1.58
          ),
          3
        );

    const coolingRatio = anchor.coolingOutputMw / Math.max(0.25, anchor.itLoadMw);
    const coolingOutputMw = isLatest
      ? round(anchor.coolingOutputMw, 2)
      : round(clamp(itLoadMw * coolingRatio * (1 + drySeasonWave * 0.025 + nPue * 0.015), 0.2, 120), 2);

    const coldAisleTempC = isLatest
      ? round(anchor.coldAisleTempC, 1)
      : round(
          clamp(anchor.coldAisleTempC + yearsBack * 0.14 + drySeasonWave * 0.42 + nTemp * 0.35, 18.6, 25.8),
          1
        );

    const coldAislePeakTempC = round(
      clamp(coldAisleTempC + 1.3 + Math.abs(nTemp) * 0.9 + (drySeasonWave > 0.5 ? 0.4 : 0), 19.5, 26.9),
      1
    );

    const coldAisleHumidityPct = isLatest
      ? round(anchor.coldAisleHumidityPct, 1)
      : round(
          clamp(anchor.coldAisleHumidityPct + monsoonWave * 3.1 + nRh * 1.8, 41.2, 58.6),
          1
        );

    // SLA compliance slightly lower in earlier years before chiller retrofit
    const slaRaw = isLatest
      ? anchor.slaCompliancePct
      : anchor.slaCompliancePct - yearsBack * 0.03 + nSla * 0.06 - (coldAislePeakTempC > 25.6 ? 0.08 : 0);
    const slaCompliancePct = round(clamp(slaRaw, 99.72, 100.0), 2);

    const tier4AvailabilityPct = isLatest
      ? round(anchor.tier4AvailabilityPct, 3)
      : round(clamp(99.997 - Math.max(0, nSla) * 0.004, 99.991, 100.0), 3);

    const rackUtilizationPct = isLatest
      ? round(clamp(anchor.rackUtilizationPct, 12, 96), 1)
      : round(clamp(anchor.rackUtilizationPct * growthFactor * (1 + nLoad * 0.015), 18, 95), 1);

    const scopeMultiplier = (siteScope === 'all' ? 3 : 1) * (hallScope === 'all' ? 1 : 0.35);
    const baseAlerts = Math.max(1, Math.round((4 + yearsBack * 2.2 + Math.abs(nLoad) * 4.5) * scopeMultiplier));
    const alertCount = isLatest ? Math.max(anchor.openAlerts, Math.round(baseAlerts * 0.7)) : baseAlerts;

    points.push({
      monthKey,
      label,
      shortLabel,
      year,
      monthIndex,
      timestamp: dt.getTime(),
      itLoadMw,
      peakItLoadMw,
      pue,
      coolingOutputMw,
      coldAisleTempC,
      coldAislePeakTempC,
      coldAisleHumidityPct,
      slaCompliancePct,
      tier4AvailabilityPct,
      rackUtilizationPct,
      alertCount,
    });
  }

  return points;
}

export function getPointMetricValue(point: HistoricalTrendPoint, metricId: TrendMetricId): number {
  return point[metricId];
}

export function getPointSecondaryValue(point: HistoricalTrendPoint, metricId: TrendMetricId): number | null {
  if (metricId === 'itLoadMw') return point.peakItLoadMw;
  if (metricId === 'coldAisleTempC') return point.coldAislePeakTempC;
  return null;
}

/**
 * Computes statistical summary, Year-over-Year (12-month) delta, and 3-month OLS linear forecast.
 */
export function computeHistoricalTrendSummary(
  points: HistoricalTrendPoint[],
  metricId: TrendMetricId
): HistoricalTrendSummary {
  const metric = TREND_METRIC_MAP[metricId];
  if (points.length === 0) {
    return {
      metric,
      horizonMonths: 0,
      yearSpanLabel: '—',
      startValue: 0,
      startLabel: '—',
      currentValue: 0,
      currentLabel: '—',
      delta: 0,
      deltaPct: 0,
      yoyDelta: null,
      yoyDeltaPct: null,
      yoyReferenceLabel: null,
      average: 0,
      minValue: 0,
      minLabel: '—',
      maxValue: 0,
      maxLabel: '—',
      forecastNextQuarter: 0,
      forecastDelta: 0,
      avgSlaCompliancePct: 100,
      avgTier4AvailabilityPct: 99.998,
      totalAlerts: 0,
    };
  }

  const first = points[0];
  const latest = points[points.length - 1];
  const startValue = getPointMetricValue(first, metricId);
  const currentValue = getPointMetricValue(latest, metricId);
  const delta = round(currentValue - startValue, metric.decimals);
  const deltaPct = startValue !== 0 ? round(((currentValue - startValue) / Math.abs(startValue)) * 100, 1) : 0;

  // Year-over-Year comparison (exact 12 months prior: index = length - 13)
  let yoyDelta: number | null = null;
  let yoyDeltaPct: number | null = null;
  let yoyReferenceLabel: string | null = null;
  if (points.length >= 13) {
    const yearAgo = points[points.length - 13];
    const yearAgoVal = getPointMetricValue(yearAgo, metricId);
    yoyDelta = round(currentValue - yearAgoVal, metric.decimals);
    yoyDeltaPct =
      yearAgoVal !== 0 ? round(((currentValue - yearAgoVal) / Math.abs(yearAgoVal)) * 100, 1) : 0;
    yoyReferenceLabel = yearAgo.label;
  }

  let sum = 0;
  let minValue = Infinity;
  let minLabel = first.label;
  let maxValue = -Infinity;
  let maxLabel = first.label;
  let slaSum = 0;
  let tier4Sum = 0;
  let totalAlerts = 0;

  for (const pt of points) {
    const val = getPointMetricValue(pt, metricId);
    sum += val;
    if (val < minValue) {
      minValue = val;
      minLabel = pt.label;
    }
    if (val > maxValue) {
      maxValue = val;
      maxLabel = pt.label;
    }
    slaSum += pt.slaCompliancePct;
    tier4Sum += pt.tier4AvailabilityPct;
    totalAlerts += pt.alertCount;
  }

  const average = round(sum / points.length, metric.decimals);

  // Ordinary Least Squares (OLS) linear regression over the series to project +3 months
  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    const y = getPointMetricValue(points[i], metricId);
    sumX += i;
    sumY += y;
    sumXY += i * y;
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;
  const rawForecast = intercept + slope * (n - 1 + 3);

  const boundedForecast =
    metricId === 'slaCompliancePct'
      ? clamp(rawForecast, 99.0, 100.0)
      : metricId === 'pue'
      ? clamp(rawForecast, 1.12, 1.8)
      : metricId === 'coldAisleHumidityPct'
      ? clamp(rawForecast, 30, 70)
      : metricId === 'coldAisleTempC'
      ? clamp(rawForecast, 16, 30)
      : Math.max(0.1, rawForecast);

  const forecastNextQuarter = round(boundedForecast, metric.decimals);
  const forecastDelta = round(forecastNextQuarter - currentValue, metric.decimals);

  return {
    metric,
    horizonMonths: points.length,
    yearSpanLabel: `${first.label} – ${latest.label}`,
    startValue,
    startLabel: first.label,
    currentValue,
    currentLabel: latest.label,
    delta,
    deltaPct,
    yoyDelta,
    yoyDeltaPct,
    yoyReferenceLabel,
    average,
    minValue: round(minValue, metric.decimals),
    minLabel,
    maxValue: round(maxValue, metric.decimals),
    maxLabel,
    forecastNextQuarter,
    forecastDelta,
    avgSlaCompliancePct: round(slaSum / points.length, 2),
    avgTier4AvailabilityPct: round(tier4Sum / points.length, 3),
    totalAlerts,
  };
}

export function formatTrendValue(value: number, metric: TrendMetricMeta): string {
  const formatted = value.toFixed(metric.decimals);
  return metric.unit ? `${formatted} ${metric.unit}`.trim() : formatted;
}

export function formatSignedDelta(value: number, metric: TrendMetricMeta): string {
  const sign = value > 0 ? '+' : '';
  const formatted = `${sign}${value.toFixed(metric.decimals)}`;
  return metric.unit ? `${formatted} ${metric.unit}`.trim() : formatted;
}

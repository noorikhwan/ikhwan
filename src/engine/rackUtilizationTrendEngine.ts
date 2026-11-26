import { RackBmsPowerStat } from './rackPowerEngine';
import { HALL_CONFIGS } from './seedData';
import { HallId, RackDefinition, ServerNode } from './types';

export interface UtilizationTrendPoint {
  hourIndex: number; // 0 (-24h) .. 24 (Now)
  hourOffset: number; // -24 .. 0
  hourLabel: string; // "-24h", "-18h", ..., "Now"
  clockLabel: string; // "21:00", "03:00", etc.
  powerUtilPct: number; // 0..100
  uSpaceUtilPct: number; // 0..100
  highLoadRacksPct: number; // % of cabinets >= 75% power capacity
  highLoadRackCount: number;
  totalPowerMw: number;
  capacityMw: number;
  usedU: number;
  totalU: number;
  deltaFromStartPct: number; // cumulative pp delta vs -24h
}

export type CapacityGrowthPattern =
  | 'Accelerating Growth'
  | 'Steady Growth'
  | 'Diurnal Stable'
  | 'Load Easing';

export interface CapacityGrowthAnalytics {
  hallId: HallId;
  hallLabel: string;
  hallShortLabel: string;
  startPowerUtilPct: number;
  currentPowerUtilPct: number;
  peakPowerUtilPct: number;
  peakHourLabel: string;
  minPowerUtilPct: number;
  delta24hPct: number;
  currentUSpacePct: number;
  deltaUSpace24hPct: number;
  currentPowerMw: number;
  capacityMw: number;
  headroomKw: number;
  headroomU: number;
  highLoadRackCount: number;
  highLoadRacksPct: number;
  growthSlopePctPerHour: number;
  trendLineStartPct: number;
  trendLineEndPct: number;
  projected7dPct: number;
  daysToThreshold85: number | null;
  patternLabel: CapacityGrowthPattern;
}

export interface HallUtilizationTrendSeries {
  hallId: HallId;
  hallLabel: string;
  hallShortLabel: string;
  color: string;
  points: UtilizationTrendPoint[];
  analytics: CapacityGrowthAnalytics;
}

export interface RackUtilizationTrendsSummary {
  activeHallId: HallId;
  activeHall: HallUtilizationTrendSeries;
  allHalls: HallUtilizationTrendSeries[];
  campusAvgPowerUtilPct: number;
  campusDelta24hPct: number;
  fastestGrowingHallId: HallId;
  fastestGrowingHallLabel: string;
  fastestGrowingDelta24hPct: number;
}

interface HallTrendProfile {
  color: string;
  netPowerGrowth24hPct: number; // baseline 24h upward growth in percentage points
  diurnalAmpPct: number; // diurnal wave amplitude in pp
  diurnalPhaseRad: number;
  secondaryHarmonicAmpPct: number;
  uSpaceGrowth24hPct: number; // gradual provisioning step growth over 24h
  highLoadSensitivity: number; // maps power util shift -> high-load cabinet share
}

const HALL_TREND_PROFILES: Record<HallId, HallTrendProfile> = {
  'hall-a': {
    color: '#0284C7', // sky-600
    netPowerGrowth24hPct: 2.1,
    diurnalAmpPct: 3.4,
    diurnalPhaseRad: 0.4,
    secondaryHarmonicAmpPct: 0.9,
    uSpaceGrowth24hPct: 0.8,
    highLoadSensitivity: 1.15,
  },
  'hall-b': {
    color: '#009530', // Orise green (AI & GPU high growth)
    netPowerGrowth24hPct: 6.4,
    diurnalAmpPct: 4.1,
    diurnalPhaseRad: 1.05,
    secondaryHarmonicAmpPct: 1.5,
    uSpaceGrowth24hPct: 2.3,
    highLoadSensitivity: 1.85,
  },
  'hall-c': {
    color: '#D97706', // amber-600
    netPowerGrowth24hPct: 3.0,
    diurnalAmpPct: 2.2,
    diurnalPhaseRad: 2.1,
    secondaryHarmonicAmpPct: 0.7,
    uSpaceGrowth24hPct: 1.4,
    highLoadSensitivity: 1.1,
  },
  'hall-d': {
    color: '#4F46E5', // indigo-600
    netPowerGrowth24hPct: 4.2,
    diurnalAmpPct: 4.6,
    diurnalPhaseRad: -0.35,
    secondaryHarmonicAmpPct: 1.1,
    uSpaceGrowth24hPct: 1.7,
    highLoadSensitivity: 1.4,
  },
};

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function formatHourClock(timestampMs: number): string {
  const d = new Date(timestampMs);
  const hh = String(d.getHours()).padStart(2, '0');
  return `${hh}:00`;
}

/**
 * Ordinary Least Squares (OLS) linear regression over equally-spaced x = 0..n-1.
 * Returns slope (per step/hour) and intercept at x = 0.
 */
export function computeLinearGrowthSlope(values: number[]): {
  slope: number;
  intercept: number;
} {
  const n = values.length;
  if (n < 2) {
    return { slope: 0, intercept: values[0] ?? 0 };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }

  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-9) {
    return { slope: 0, intercept: sumY / n };
  }

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export function classifyGrowthPattern(
  delta24hPct: number,
  slopePerHour: number
): CapacityGrowthPattern {
  if (delta24hPct >= 4.5 && slopePerHour >= 0.16) return 'Accelerating Growth';
  if (delta24hPct >= 1.5 && slopePerHour >= 0.05) return 'Steady Growth';
  if (delta24hPct <= -1.5 && slopePerHour <= -0.05) return 'Load Easing';
  return 'Diurnal Stable';
}

function buildSingleHallSeries(
  hallId: HallId,
  racks: RackDefinition[],
  bmsPowerStatsMap: Record<string, RackBmsPowerStat>,
  serversByRack: Map<string, ServerNode[]>,
  nowTimestampMs: number
): HallUtilizationTrendSeries {
  const hallCfg = HALL_CONFIGS.find((h) => h.id === hallId) ?? HALL_CONFIGS[0];
  const profile = HALL_TREND_PROFILES[hallId];
  const hallRacks = racks.filter((r) => r.hallId === hallId);

  let currentTotalKw = 0;
  let totalCapacityKw = 0;
  let currentUsedU = 0;
  let totalU = 0;
  let currentHighLoadCount = 0;

  for (const rack of hallRacks) {
    const pStat = bmsPowerStatsMap[rack.id];
    const powerKw = pStat ? pStat.powerKw : rack.basePowerKw;
    const capKw = pStat ? pStat.powerCapacityKw : rack.powerCapacityKw;
    const utilPct = capKw > 0 ? (powerKw / capKw) * 100 : 0;

    currentTotalKw += powerKw;
    totalCapacityKw += capKw;

    const mounted = serversByRack.get(rack.id);
    const rackUsedU =
      mounted && mounted.length > 0
        ? mounted.reduce((sum, s) => sum + s.uHeight, 0)
        : rack.baseUsedU;
    currentUsedU += Math.min(rack.totalU, rackUsedU);
    totalU += rack.totalU;

    if (utilPct >= 75) {
      currentHighLoadCount += 1;
    }
  }

  const rackCount = Math.max(1, hallRacks.length);
  const currentPowerUtilPct =
    totalCapacityKw > 0 ? clamp((currentTotalKw / totalCapacityKw) * 100, 5, 99.5) : 0;
  const currentUSpacePct =
    totalU > 0 ? clamp((currentUsedU / totalU) * 100, 5, 99.5) : 0;
  const currentHighLoadPct = (currentHighLoadCount / rackCount) * 100;
  const capacityMw = totalCapacityKw / 1000;

  // Evaluate raw curve offsets so that at i = 24 (Now), offset is strictly 0
  // and live BMS telemetry anchors the terminal point exactly.
  const waveAt = (hourIndex: number): number => {
    const t = hourIndex / 24; // 0..1
    const diurnal =
      Math.sin((hourIndex / 24) * Math.PI * 2 + profile.diurnalPhaseRad) *
      profile.diurnalAmpPct;
    const harmonic =
      Math.cos((hourIndex / 12) * Math.PI * 2 + profile.diurnalPhaseRad * 0.7) *
      profile.secondaryHarmonicAmpPct;
    const growthRamp = t * profile.netPowerGrowth24hPct;
    // Slight acceleration in the most recent 8 hours to represent capacity ramp
    const lateRamp = t > 0.65 ? Math.pow((t - 0.65) / 0.35, 1.4) * (profile.netPowerGrowth24hPct * 0.22) : 0;
    return diurnal + harmonic + growthRamp + lateRamp;
  };

  const anchorWave = waveAt(24);
  const points: UtilizationTrendPoint[] = [];

  for (let i = 0; i <= 24; i++) {
    const hourOffset = i - 24; // -24 .. 0
    const ts = nowTimestampMs + hourOffset * 3600 * 1000;
    const isNow = i === 24;

    const powerUtilPct = isNow
      ? round1(currentPowerUtilPct)
      : round1(clamp(currentPowerUtilPct + (waveAt(i) - anchorWave), 8, 99.2));

    // U-space grows in realistic deployment steps (cabinet rack-and-stack events)
    const stepProgress =
      i < 6 ? 0 : i < 13 ? 0.35 : i < 19 ? 0.72 : 1;
    const uSpaceUtilPct = isNow
      ? round1(currentUSpacePct)
      : round1(
          clamp(
            currentUSpacePct - profile.uSpaceGrowth24hPct * (1 - stepProgress),
            8,
            99.5
          )
        );

    const powerShift = powerUtilPct - currentPowerUtilPct;
    const highLoadRacksPct = isNow
      ? round1(currentHighLoadPct)
      : round1(clamp(currentHighLoadPct + powerShift * profile.highLoadSensitivity, 0, 100));

    const highLoadRackCount = isNow
      ? currentHighLoadCount
      : Math.round((highLoadRacksPct / 100) * rackCount);

    const totalPowerMw = isNow
      ? round2(currentTotalKw / 1000)
      : round2((powerUtilPct / 100) * capacityMw);

    const usedU = isNow
      ? currentUsedU
      : Math.round((uSpaceUtilPct / 100) * totalU);

    points.push({
      hourIndex: i,
      hourOffset,
      hourLabel: isNow ? 'Now' : `${hourOffset}h`,
      clockLabel: isNow ? 'Now' : formatHourClock(ts),
      powerUtilPct,
      uSpaceUtilPct,
      highLoadRacksPct,
      highLoadRackCount,
      totalPowerMw,
      capacityMw: round2(capacityMw),
      usedU,
      totalU,
      deltaFromStartPct: 0, // filled right after loop
    });
  }

  const startPowerUtilPct = points[0]?.powerUtilPct ?? currentPowerUtilPct;
  const startUSpacePct = points[0]?.uSpaceUtilPct ?? currentUSpacePct;
  let peakPowerUtilPct = -Infinity;
  let peakHourLabel = 'Now';
  let minPowerUtilPct = Infinity;

  for (const pt of points) {
    pt.deltaFromStartPct = round1(pt.powerUtilPct - startPowerUtilPct);
    if (pt.powerUtilPct >= peakPowerUtilPct) {
      peakPowerUtilPct = pt.powerUtilPct;
      peakHourLabel = pt.hourLabel;
    }
    if (pt.powerUtilPct < minPowerUtilPct) {
      minPowerUtilPct = pt.powerUtilPct;
    }
  }

  const powerSeries = points.map((p) => p.powerUtilPct);
  const { slope, intercept } = computeLinearGrowthSlope(powerSeries);
  const trendLineStartPct = round1(clamp(intercept, 0, 100));
  const trendLineEndPct = round1(clamp(intercept + slope * 24, 0, 100));

  const delta24hPct = round1(points[24].powerUtilPct - startPowerUtilPct);
  const deltaUSpace24hPct = round1(points[24].uSpaceUtilPct - startUSpacePct);

  // Conservative dampened 7-day projection (daily capacity growth ~ 18% of intraday ramp)
  const effectiveDailyGrowthPct = slope > 0 ? slope * 24 * 0.22 : slope * 24 * 0.12;
  const projected7dPct = round1(
    clamp(points[24].powerUtilPct + effectiveDailyGrowthPct * 7, 5, 100)
  );

  let daysToThreshold85: number | null = null;
  if (points[24].powerUtilPct >= 85) {
    daysToThreshold85 = 0;
  } else if (effectiveDailyGrowthPct > 0.08) {
    daysToThreshold85 = Math.max(
      1,
      Math.round((85 - points[24].powerUtilPct) / effectiveDailyGrowthPct)
    );
  }

  const patternLabel = classifyGrowthPattern(delta24hPct, slope);

  const analytics: CapacityGrowthAnalytics = {
    hallId,
    hallLabel: hallCfg.label,
    hallShortLabel: hallCfg.shortLabel,
    startPowerUtilPct: round1(startPowerUtilPct),
    currentPowerUtilPct: points[24].powerUtilPct,
    peakPowerUtilPct: round1(peakPowerUtilPct),
    peakHourLabel,
    minPowerUtilPct: round1(minPowerUtilPct),
    delta24hPct,
    currentUSpacePct: points[24].uSpaceUtilPct,
    deltaUSpace24hPct,
    currentPowerMw: round2(currentTotalKw / 1000),
    capacityMw: round2(capacityMw),
    headroomKw: Math.max(0, Math.round(totalCapacityKw - currentTotalKw)),
    headroomU: Math.max(0, totalU - currentUsedU),
    highLoadRackCount: currentHighLoadCount,
    highLoadRacksPct: round1(currentHighLoadPct),
    growthSlopePctPerHour: round2(slope),
    trendLineStartPct,
    trendLineEndPct,
    projected7dPct,
    daysToThreshold85,
    patternLabel,
  };

  return {
    hallId,
    hallLabel: hallCfg.label,
    hallShortLabel: hallCfg.shortLabel,
    color: profile.color,
    points,
    analytics,
  };
}

/**
 * Computes 24-hour rack utilization trends (Power %, U-Space %, High-Load Rack %)
 * and capacity growth analytics across all 4 data halls, anchored to live BMS telemetry.
 */
export function buildHallUtilizationTrends24h(
  racks: RackDefinition[],
  bmsPowerStatsMap: Record<string, RackBmsPowerStat>,
  servers: ServerNode[],
  activeHallId: HallId,
  nowTimestampMs: number = Date.now()
): RackUtilizationTrendsSummary {
  const serversByRack = new Map<string, ServerNode[]>();
  for (const srv of servers) {
    const list = serversByRack.get(srv.rackId);
    if (list) list.push(srv);
    else serversByRack.set(srv.rackId, [srv]);
  }

  const allHalls = HALL_CONFIGS.map((hc) =>
    buildSingleHallSeries(hc.id, racks, bmsPowerStatsMap, serversByRack, nowTimestampMs)
  );

  const activeHall =
    allHalls.find((h) => h.hallId === activeHallId) ?? allHalls[0];

  const totalCapMw = allHalls.reduce((s, h) => s + h.analytics.capacityMw, 0);
  const totalCurMw = allHalls.reduce((s, h) => s + h.analytics.currentPowerMw, 0);
  const campusAvgPowerUtilPct =
    totalCapMw > 0 ? round1((totalCurMw / totalCapMw) * 100) : 0;

  const campusDelta24hPct = round1(
    allHalls.reduce((s, h) => s + h.analytics.delta24hPct, 0) / Math.max(1, allHalls.length)
  );

  const fastest = [...allHalls].sort(
    (a, b) => b.analytics.delta24hPct - a.analytics.delta24hPct
  )[0];

  return {
    activeHallId: activeHall.hallId,
    activeHall,
    allHalls,
    campusAvgPowerUtilPct,
    campusDelta24hPct,
    fastestGrowingHallId: fastest.hallId,
    fastestGrowingHallLabel: fastest.hallShortLabel,
    fastestGrowingDelta24hPct: fastest.analytics.delta24hPct,
  };
}

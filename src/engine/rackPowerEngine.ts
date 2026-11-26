import { BmsState, UtilityFeedState } from './bmsTypes';
import { HeatmapScaleMode, RackBmsSensorStat, ThermalColorSample } from './rackHeatmapEngine';
import {
  HallId,
  HallPowerCapacityPolicy,
  HallPowerPolicyMap,
  RackDefinition,
  RackQuickFilterId,
  RackRebalanceCandidate,
  RackRebalancePlan,
  ServerNode,
} from './types';

export type PowerLoadBand = 'Low' | 'Nominal' | 'Elevated' | 'High' | 'Overload';

export type FeedBalanceStatus = '2N Balanced' | '2N Asymmetric' | 'Single-Feed Failover';

export interface RackBmsPowerStat {
  rackId: string;
  hallId: HallId;
  rowNumber: number;
  rackIndex: number;
  powerKw: number;
  powerCapacityKw: number;
  effectiveLimitKw: number;
  thresholdPct: number;
  utilizationPct: number;
  feedAKw: number;
  feedBKw: number;
  apparentKva: number;
  powerFactor: number;
  powerBand: PowerLoadBand;
  feedStatus: FeedBalanceStatus;
  utilityFeed: UtilityFeedState;
  busSourceLabel: string;
  hasLiveServers: boolean;
  exceedsCapacity: boolean;
  overCapacityKw: number;
  adjustmentKw: number;
}

export interface HallBmsPowerSummary {
  hallId: HallId;
  totalKw: number;
  totalCapacityKw: number;
  utilizationPct: number;
  avgRackKw: number;
  minRackKw: number;
  maxRackKw: number;
  peakRackId: string | null;
  peakRackKw: number;
  feedATotalKw: number;
  feedBTotalKw: number;
  busASharePct: number;
  avgPowerFactor: number;
  highLoadCount: number; // utilizationPct >= 80
  overloadCount: number; // utilizationPct >= 92
  capacityExceededCount: number; // powerKw > effectiveLimitKw (when policy enabled)
  capacityExceededRackIds: string[];
  utilityFeed: UtilityFeedState;
  upsModeSummary: string;
  feedStatus: FeedBalanceStatus;
}

export const DEFAULT_HALL_POWER_POLICIES: HallPowerPolicyMap = {
  'hall-a': { hallId: 'hall-a', thresholdPct: 100, hysteresisKw: 0.15, enabled: true },
  'hall-b': { hallId: 'hall-b', thresholdPct: 100, hysteresisKw: 0.15, enabled: true },
  'hall-c': { hallId: 'hall-c', thresholdPct: 100, hysteresisKw: 0.15, enabled: true },
  'hall-d': { hallId: 'hall-d', thresholdPct: 100, hysteresisKw: 0.15, enabled: true },
};

export function createDefaultHallPowerPolicies(): HallPowerPolicyMap {
  return {
    'hall-a': { ...DEFAULT_HALL_POWER_POLICIES['hall-a'] },
    'hall-b': { ...DEFAULT_HALL_POWER_POLICIES['hall-b'] },
    'hall-c': { ...DEFAULT_HALL_POWER_POLICIES['hall-c'] },
    'hall-d': { ...DEFAULT_HALL_POWER_POLICIES['hall-d'] },
  };
}

export function sanitizeHallPowerPolicy(
  hallId: HallId,
  patch: Partial<HallPowerCapacityPolicy>
): HallPowerCapacityPolicy {
  const base = DEFAULT_HALL_POWER_POLICIES[hallId];
  const rawThreshold =
    typeof patch.thresholdPct === 'number' && Number.isFinite(patch.thresholdPct)
      ? patch.thresholdPct
      : base.thresholdPct;
  const rawHysteresis =
    typeof patch.hysteresisKw === 'number' && Number.isFinite(patch.hysteresisKw)
      ? patch.hysteresisKw
      : base.hysteresisKw;
  return {
    hallId,
    thresholdPct: Math.round(Math.max(75, Math.min(115, rawThreshold))),
    hysteresisKw: round2(Math.max(0.05, Math.min(1.5, rawHysteresis))),
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : base.enabled,
  };
}

interface ColorStop {
  t: number;
  r: number;
  g: number;
  b: number;
}

// Calibrated Electrical Power Draw (kW) ramp:
// Low Indigo-Sky -> Moderate Teal -> Optimal Emerald -> Elevated Amber -> High Orange -> Overload Crimson
const POWER_DRAW_STOPS: ColorStop[] = [
  { t: 0.0, r: 30, g: 64, b: 175 },   // #1E40AF Low Load Deep Blue
  { t: 0.25, r: 8, g: 145, b: 178 },  // #0891B2 Moderate Draw Cyan-Teal
  { t: 0.50, r: 22, g: 163, b: 74 },  // #16A34A Balanced Eco Emerald
  { t: 0.72, r: 217, g: 119, b: 6 },  // #D97706 High Density Amber
  { t: 0.88, r: 234, g: 88, b: 12 },  // #EA580C Near-Cap Orange
  { t: 1.0, r: 220, g: 38, b: 38 },   // #DC2626 Overload Crimson
];

const BASELINE_CAMPUS_UPS_LOAD_KW = 14800;

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

function toHexByte(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
}

export function classifyPowerLoadBand(utilizationPct: number): PowerLoadBand {
  if (utilizationPct >= 92) return 'Overload';
  if (utilizationPct >= 78) return 'High';
  if (utilizationPct >= 60) return 'Elevated';
  if (utilizationPct >= 35) return 'Nominal';
  return 'Low';
}

export function interpolatePowerColor(
  powerKw: number,
  rangeMinKw: number = 0,
  rangeMaxKw: number = 22
): ThermalColorSample {
  const span = Math.max(2, rangeMaxKw - rangeMinKw);
  const normalized = Math.max(0, Math.min(1, (powerKw - rangeMinKw) / span));

  let lower = POWER_DRAW_STOPS[0];
  let upper = POWER_DRAW_STOPS[POWER_DRAW_STOPS.length - 1];
  for (let i = 0; i < POWER_DRAW_STOPS.length - 1; i++) {
    const a = POWER_DRAW_STOPS[i];
    const b = POWER_DRAW_STOPS[i + 1];
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
    band:
      normalized >= 0.9
        ? 'Critical'
        : normalized >= 0.75
        ? 'Hot'
        : normalized >= 0.58
        ? 'Warm'
        : normalized < 0.28
        ? 'Cool'
        : 'Nominal',
    contrastText,
  };
}

export function getPowerLegendGradientCss(): string {
  const parts = POWER_DRAW_STOPS.map(
    (s) => `rgb(${s.r}, ${s.g}, ${s.b}) ${Math.round(s.t * 100)}%`
  );
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}

export interface ComputeRackPowerOptions {
  rackPowerAdjustmentsKw?: Record<string, number>;
  hallPowerPolicies?: HallPowerPolicyMap;
}

/**
 * Computes real-time per-cabinet power draw (kW), 2N Feed A/B split, apparent kVA, and
 * power factor coupled directly to live BMS UPS & switchgear telemetry.
 * Supports live rebalance adjustments (`rackPowerAdjustmentsKw`) and per-hall capacity thresholds (`hallPowerPolicies`).
 */
export function computeBmsRackPowerStats(
  racks: RackDefinition[],
  bms: BmsState,
  servers: ServerNode[],
  options?: ComputeRackPowerOptions
): Record<string, RackBmsPowerStat> {
  const adjustments = options?.rackPowerAdjustmentsKw ?? {};
  const policies = options?.hallPowerPolicies ?? DEFAULT_HALL_POWER_POLICIES;

  const serversByRack = new Map<string, ServerNode[]>();
  for (const srv of servers) {
    const arr = serversByRack.get(srv.rackId);
    if (arr) arr.push(srv);
    else serversByRack.set(srv.rackId, [srv]);
  }

  // Extract live Bus A & Bus B telemetry from BMS UPS & Electrical Switchgear
  const busAUps = bms.upsSystems.filter((u) => u.feedBus === 'Bus A');
  const busBUps = bms.upsSystems.filter((u) => u.feedBus === 'Bus B');

  const busAHealthyUps = busAUps.filter((u) => u.mode !== 'Fault');
  const busBHealthyUps = busBUps.filter((u) => u.mode !== 'Fault');

  const busALoadKw = busAHealthyUps.reduce((sum, u) => sum + u.loadKw, 0);
  const busBLoadKw = busBHealthyUps.reduce((sum, u) => sum + u.loadKw, 0);
  const totalUpsLoadKw = busALoadKw + busBLoadKw;

  const opswbNodes = bms.electricalSwitchgear.filter((n) => n.stage === 'OPSWB');
  const swgNodes = opswbNodes.length > 0 ? opswbNodes : bms.electricalSwitchgear;
  const avgPowerFactor =
    swgNodes.length > 0
      ? round2(
          Math.max(
            0.88,
            Math.min(
              0.99,
              swgNodes.reduce((sum, n) => sum + n.powerFactor, 0) / swgNodes.length
            )
          )
        )
      : 0.98;

  const busAOnline = busAHealthyUps.length > 0 && busALoadKw > 0;
  const busBOnline = busBHealthyUps.length > 0 && busBLoadKw > 0;

  let busAShare = 0.51;
  if (busAOnline && busBOnline && totalUpsLoadKw > 0) {
    busAShare = Math.max(0.15, Math.min(0.85, busALoadKw / totalUpsLoadKw));
  } else if (busAOnline && !busBOnline) {
    busAShare = 1.0;
  } else if (!busAOnline && busBOnline) {
    busAShare = 0.0;
  }

  const feedStatus: FeedBalanceStatus =
    !busAOnline || !busBOnline
      ? 'Single-Feed Failover'
      : Math.abs(busAShare - 0.5) > 0.12
      ? '2N Asymmetric'
      : '2N Balanced';

  // Live BMS demand multiplier relative to baseline campus UPS IT load
  const rawDemandFactor =
    totalUpsLoadKw > 0 ? totalUpsLoadKw / BASELINE_CAMPUS_UPS_LOAD_KW : 1.0;
  const bmsDemandFactor = Math.max(0.78, Math.min(1.28, rawDemandFactor));

  const busSourceLabel =
    busAOnline && busBOnline
      ? `Bus A+B · ${bms.utilityFeed}`
      : busAOnline
      ? `Bus A Failover · ${bms.utilityFeed}`
      : busBOnline
      ? `Bus B Failover · ${bms.utilityFeed}`
      : `Degraded · ${bms.utilityFeed}`;

  const result: Record<string, RackBmsPowerStat> = {};

  for (const rack of racks) {
    const mounted = serversByRack.get(rack.id);
    const hasLiveServers = Boolean(mounted && mounted.length > 0);
    const adjustmentKw = round2(adjustments[rack.id] ?? 0);
    const policy = policies[rack.hallId] ?? DEFAULT_HALL_POWER_POLICIES[rack.hallId];
    const thresholdPct = policy?.thresholdPct ?? 100;
    const effectiveLimitKw = round2(rack.powerCapacityKw * (thresholdPct / 100));

    let baseCalculatedKw: number;
    if (hasLiveServers && mounted) {
      // Exact sum of live chassis power (W -> kW) + metered rPDU / ToR leaf overhead (~0.32 kW)
      const chassisKw = mounted.reduce((sum, s) => sum + s.powerW, 0) / 1000;
      const pduOverheadKw = 0.32;
      // Subtle real-time UPS bus transfer / efficiency ripple (±1.5%)
      const bmsRipple = 1 + (bmsDemandFactor - 1) * 0.08;
      baseCalculatedKw = Math.max(0.3, (chassisKw + pduOverheadKw) * bmsRipple);
    } else {
      // Standard production racks couple directly to live BMS UPS/switchgear demand factor
      // with deterministic per-row phase ripple tied to Bus A vs Bus B weighting
      const phaseOffset =
        1 + Math.sin(rack.rowNumber * 0.65 + rack.rackIndex * 0.45 + bmsDemandFactor * 4.2) * 0.035;
      const rawKw = rack.basePowerKw * bmsDemandFactor * phaseOffset;
      baseCalculatedKw = Math.max(0.5, Math.min(rack.powerCapacityKw * 1.22, rawKw));
    }

    const powerKw = round2(
      Math.max(0.3, Math.min(rack.powerCapacityKw * 1.25, baseCalculatedKw + adjustmentKw))
    );

    const utilizationPct = Math.min(
      125,
      Math.round((powerKw / Math.max(1, rack.powerCapacityKw)) * 100)
    );
    const exceedsCapacity = policy.enabled ? powerKw > effectiveLimitKw : false;
    const overCapacityKw = exceedsCapacity ? round2(powerKw - effectiveLimitKw) : 0;
    const feedAKw = round2(powerKw * busAShare);
    const feedBKw = round2(Math.max(0, powerKw - feedAKw));
    const apparentKva = round2(powerKw / avgPowerFactor);

    result[rack.id] = {
      rackId: rack.id,
      hallId: rack.hallId,
      rowNumber: rack.rowNumber,
      rackIndex: rack.rackIndex,
      powerKw,
      powerCapacityKw: rack.powerCapacityKw,
      effectiveLimitKw,
      thresholdPct,
      utilizationPct,
      feedAKw,
      feedBKw,
      apparentKva,
      powerFactor: avgPowerFactor,
      powerBand: classifyPowerLoadBand(utilizationPct),
      feedStatus,
      utilityFeed: bms.utilityFeed,
      busSourceLabel,
      hasLiveServers,
      exceedsCapacity,
      overCapacityKw,
      adjustmentKw,
    };
  }

  return result;
}

/**
 * Computes hall-level real-time power draw aggregates from per-cabinet BMS power stats.
 */
export function computeHallBmsPowerSummary(
  hallId: HallId,
  racks: RackDefinition[],
  powerMap: Record<string, RackBmsPowerStat>,
  bms: BmsState
): HallBmsPowerSummary {
  const hallRacks = racks.filter((r) => r.hallId === hallId);
  const upsModes = Array.from(new Set(bms.upsSystems.map((u) => u.mode)));
  const upsModeSummary = upsModes.length > 0 ? upsModes.join(' / ') : 'Online';

  if (hallRacks.length === 0) {
    return {
      hallId,
      totalKw: 0,
      totalCapacityKw: 0,
      utilizationPct: 0,
      avgRackKw: 0,
      minRackKw: 0,
      maxRackKw: 0,
      peakRackId: null,
      peakRackKw: 0,
      feedATotalKw: 0,
      feedBTotalKw: 0,
      busASharePct: 50,
      avgPowerFactor: 0.98,
      highLoadCount: 0,
      overloadCount: 0,
      capacityExceededCount: 0,
      capacityExceededRackIds: [],
      utilityFeed: bms.utilityFeed,
      upsModeSummary,
      feedStatus: '2N Balanced',
    };
  }

  let totalKw = 0;
  let totalCapacityKw = 0;
  let feedATotalKw = 0;
  let feedBTotalKw = 0;
  let pfSum = 0;
  let minKw = Infinity;
  let maxKw = -Infinity;
  let peakRackId: string | null = null;
  let highLoadCount = 0;
  let overloadCount = 0;
  const capacityExceededRackIds: string[] = [];
  let feedStatus: FeedBalanceStatus = '2N Balanced';

  for (const rack of hallRacks) {
    const st = powerMap[rack.id];
    if (!st) continue;
    totalKw += st.powerKw;
    totalCapacityKw += st.powerCapacityKw;
    feedATotalKw += st.feedAKw;
    feedBTotalKw += st.feedBKw;
    pfSum += st.powerFactor;
    feedStatus = st.feedStatus;
    if (st.powerKw < minKw) minKw = st.powerKw;
    if (st.powerKw > maxKw) {
      maxKw = st.powerKw;
      peakRackId = rack.id;
    }
    if (st.utilizationPct >= 80) highLoadCount += 1;
    if (st.utilizationPct >= 92) overloadCount += 1;
    if (st.exceedsCapacity) capacityExceededRackIds.push(rack.id);
  }

  const busASharePct =
    totalKw > 0 ? Math.round((feedATotalKw / totalKw) * 100) : 50;

  return {
    hallId,
    totalKw: round1(totalKw),
    totalCapacityKw: round1(totalCapacityKw),
    utilizationPct:
      totalCapacityKw > 0 ? Math.round((totalKw / totalCapacityKw) * 100) : 0,
    avgRackKw: round2(totalKw / hallRacks.length),
    minRackKw: round2(minKw === Infinity ? 0 : minKw),
    maxRackKw: round2(maxKw === -Infinity ? 0 : maxKw),
    peakRackId,
    peakRackKw: round2(maxKw === -Infinity ? 0 : maxKw),
    feedATotalKw: round1(feedATotalKw),
    feedBTotalKw: round1(feedBTotalKw),
    busASharePct,
    avgPowerFactor: round2(pfSum / hallRacks.length),
    highLoadCount,
    overloadCount,
    capacityExceededCount: capacityExceededRackIds.length,
    capacityExceededRackIds,
    utilityFeed: bms.utilityFeed,
    upsModeSummary,
    feedStatus,
  };
}

/**
 * Resolves legend scale bounds (kW) for the Power Draw (kW) overlay:
 * - Fixed scale: 0 kW up to the hall's cabinet power capacity (e.g. 12 kW, 14 kW, 16 kW, or 22 kW)
 * - Dynamic Auto-Range: tightly wraps live hall min/max rack draw (minimum 3 kW span)
 */
export function resolvePowerHeatmapScaleBounds(
  mode: HeatmapScaleMode,
  powerSummary: HallBmsPowerSummary,
  hallCabinetCapKw: number = 22
): { minC: number; maxC: number; ticks: number[] } {
  let minKw = 0;
  let maxKw = Math.max(10, Math.ceil(hallCabinetCapKw));

  if (mode === 'dynamic' && powerSummary.maxRackKw > 0) {
    minKw = Math.max(0, Math.floor(powerSummary.minRackKw - 0.5));
    maxKw = Math.ceil(Math.max(minKw + 3, powerSummary.maxRackKw + 0.5));
  }

  const step = (maxKw - minKw) / 3;
  return {
    minC: minKw,
    maxC: maxKw,
    ticks: [
      round1(minKw),
      round1(minKw + step),
      round1(minKw + step * 2),
      round1(maxKw),
    ],
  };
}

/**
 * Computes an Over-Capacity Rebalance Plan for a cabinet: recommends up to 3 under-utilized
 * same-hall destination cabinets with ample electrical headroom so transferring `recommendedShiftKw`
 * brings the source safely below its effective limit without pushing targets past 80%.
 */
export function computeRackRebalancePlan(
  sourceRackId: string,
  racks: RackDefinition[],
  powerStats: Record<string, RackBmsPowerStat>,
  maxCandidates = 3
): RackRebalancePlan | null {
  const sourceRack = racks.find((r) => r.id === sourceRackId);
  const sourceStat = powerStats[sourceRackId];
  if (!sourceRack || !sourceStat) return null;

  const overByKw = round2(Math.max(0, sourceStat.powerKw - sourceStat.effectiveLimitKw));
  // Aim to bring source at least 1.5 kW safely under effectiveLimitKw (or relieve 18% if proactively rebalancing)
  const targetSourceKw = Math.max(
    1.5,
    round2(Math.min(sourceStat.effectiveLimitKw - 1.5, sourceStat.powerKw * 0.85))
  );
  const recommendedShiftKw = round2(Math.max(1.2, sourceStat.powerKw - targetSourceKw));

  const sameHallCandidates: RackRebalanceCandidate[] = [];
  for (const rack of racks) {
    if (rack.id === sourceRackId || rack.hallId !== sourceRack.hallId) continue;
    const st = powerStats[rack.id];
    if (!st || st.exceedsCapacity) continue;

    const safeCeilingKw = st.effectiveLimitKw * 0.82;
    const availableHeadroomKw = round2(safeCeilingKw - st.powerKw);
    if (availableHeadroomKw < recommendedShiftKw) continue;

    const projectedKw = round2(st.powerKw + recommendedShiftKw);
    const projectedUtilPct = Math.round((projectedKw / Math.max(1, st.powerCapacityKw)) * 100);
    const headroomAfterKw = round2(Math.max(0, st.effectiveLimitKw - projectedKw));

    sameHallCandidates.push({
      targetRackId: rack.id,
      targetRackName: rack.name,
      hallId: rack.hallId,
      row: rack.row,
      currentKw: st.powerKw,
      effectiveLimitKw: st.effectiveLimitKw,
      currentUtilPct: st.utilizationPct,
      projectedKw,
      projectedUtilPct,
      headroomAfterKw,
      shiftKw: recommendedShiftKw,
    });
  }

  sameHallCandidates.sort((a, b) => {
    if (a.projectedUtilPct !== b.projectedUtilPct) return a.projectedUtilPct - b.projectedUtilPct;
    return a.targetRackId.localeCompare(b.targetRackId);
  });

  const sourceProjectedKw = round2(Math.max(0.5, sourceStat.powerKw - recommendedShiftKw));
  const sourceProjectedUtilPct = Math.round(
    (sourceProjectedKw / Math.max(1, sourceStat.powerCapacityKw)) * 100
  );

  return {
    sourceRackId,
    hallId: sourceRack.hallId,
    sourceCurrentKw: sourceStat.powerKw,
    sourceEffectiveLimitKw: sourceStat.effectiveLimitKw,
    sourceRatedKw: sourceStat.powerCapacityKw,
    overByKw,
    recommendedShiftKw,
    sourceProjectedKw,
    sourceProjectedUtilPct,
    candidates: sameHallCandidates.slice(0, maxCandidates),
  };
}

/**
 * Purely applies a kW load transfer between source and target cabinets to the adjustment map.
 */
export function applyRackPowerRebalance(
  adjustments: Record<string, number>,
  sourceRackId: string,
  targetRackId: string,
  shiftKw: number
): Record<string, number> {
  const safeShift = round2(Math.max(0.1, shiftKw));
  const next = { ...adjustments };
  next[sourceRackId] = round2((next[sourceRackId] ?? 0) - safeShift);
  next[targetRackId] = round2((next[targetRackId] ?? 0) + safeShift);
  return next;
}

/**
 * Evaluates whether a cabinet matches a Rack Map quick filter chip.
 */
export function matchesRackQuickFilter(
  filterId: RackQuickFilterId,
  powerStat: RackBmsPowerStat | undefined,
  sensorStat: RackBmsSensorStat | undefined
): boolean {
  if (filterId === 'all') return true;
  if (!powerStat) return false;
  switch (filterId) {
    case 'over_cap':
      return powerStat.exceedsCapacity;
    case 'thermal_high':
      return (sensorStat?.sensorTempC ?? 0) > 27.0;
    case 'util_80':
      return powerStat.utilizationPct >= 80;
    case 'headroom_low':
      return powerStat.utilizationPct < 50;
    default:
      return true;
  }
}

export function computeRackQuickFilterCounts(
  hallRacks: RackDefinition[],
  powerStats: Record<string, RackBmsPowerStat>,
  sensorStats: Record<string, RackBmsSensorStat>
): Record<RackQuickFilterId, number> {
  const counts: Record<RackQuickFilterId, number> = {
    all: hallRacks.length,
    over_cap: 0,
    thermal_high: 0,
    util_80: 0,
    headroom_low: 0,
  };
  for (const r of hallRacks) {
    const p = powerStats[r.id];
    const s = sensorStats[r.id];
    if (matchesRackQuickFilter('over_cap', p, s)) counts.over_cap += 1;
    if (matchesRackQuickFilter('thermal_high', p, s)) counts.thermal_high += 1;
    if (matchesRackQuickFilter('util_80', p, s)) counts.util_80 += 1;
    if (matchesRackQuickFilter('headroom_low', p, s)) counts.headroom_low += 1;
  }
  return counts;
}

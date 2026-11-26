import { SiteId, SiteWorkspaceState } from './sites';
import { HallId, RackDefinition } from './types';

export type CoolingProfileType = 'air_only' | 'hybrid_air_liquid' | 'liquid_cdu_high_density';

export interface WhatIfDeploymentRequest {
  workloadName: string;
  rackCount: number;
  uPerRack: number;
  powerKwPerRack: number;
  weightKgPerRack: number;
  coolingType: CoolingProfileType;
  require2NFeeds: boolean;
  preferredHall: HallId | 'any';
}

export interface ConstraintCheckResult {
  key: 'space' | 'power' | 'cooling' | 'floor_weight';
  label: string;
  passed: boolean;
  requiredText: string;
  availableText: string;
  postUtilizationPct: number;
  headroomText: string;
}

export interface HallPlacementEvaluation {
  hallId: HallId;
  hallLabel: string;
  feasible: boolean;
  score: number; // 0-100 suitability score
  limitingConstraint: string | null;
  constraints: ConstraintCheckResult[];
  recommendedRackIds: string[];
  currentPowerUtilPct: number;
  projectedPowerUtilPct: number;
  strandedPowerKw: number;
  floorLoadLimitKgPerM2: number;
  projectedFloorLoadKgPerM2: number;
}

export interface CapacityPlanReport {
  siteId: SiteId;
  request: WhatIfDeploymentRequest;
  totalRequiredU: number;
  totalRequiredPowerKw: number;
  totalRequiredCoolingKw: number;
  totalRequiredWeightKg: number;
  feasibleHallCount: number;
  bestHall: HallPlacementEvaluation | null;
  evaluations: HallPlacementEvaluation[];
}

const HALL_SPECS: Record<
  HallId,
  {
    label: string;
    floorLimitKgPerM2: number;
    liquidCduCapacityKw: number;
    airCoolingShare: number;
  }
> = {
  'hall-a': {
    label: 'Hall A · Core Compute',
    floorLimitKgPerM2: 1250,
    liquidCduCapacityKw: 450,
    airCoolingShare: 1.0,
  },
  'hall-b': {
    label: 'Hall B · AI & GPU',
    floorLimitKgPerM2: 1850,
    liquidCduCapacityKw: 3800,
    airCoolingShare: 1.0,
  },
  'hall-c': {
    label: 'Hall C · Storage & Edge',
    floorLimitKgPerM2: 1450,
    liquidCduCapacityKw: 650,
    airCoolingShare: 1.0,
  },
  'hall-d': {
    label: 'Hall D · Cloud & Interconnect',
    floorLimitKgPerM2: 1350,
    liquidCduCapacityKw: 900,
    airCoolingShare: 1.0,
  },
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function evaluateWhatIfCapacityPlan(params: {
  siteId: SiteId;
  site: SiteWorkspaceState;
  racks: RackDefinition[];
  request: WhatIfDeploymentRequest;
}): CapacityPlanReport {
  const { siteId, site, racks, request } = params;
  const rackCount = Math.max(1, Math.min(80, Math.round(request.rackCount || 1)));
  const uPerRack = Math.max(1, Math.min(42, Math.round(request.uPerRack || 1)));
  const powerKwPerRack = Math.max(0.5, Math.min(80, Number(request.powerKwPerRack || 1)));
  const weightKgPerRack = Math.max(50, Math.min(2500, Number(request.weightKgPerRack || 100)));

  const totalRequiredU = rackCount * uPerRack;
  const totalRequiredPowerKw = round1(rackCount * powerKwPerRack);
  // 1.08 thermal factor to include PDU/cable heat gain
  const totalRequiredCoolingKw = round1(totalRequiredPowerKw * 1.08);
  const totalRequiredWeightKg = Math.round(rackCount * weightKgPerRack);

  const hallIds: HallId[] = ['hall-a', 'hall-b', 'hall-c', 'hall-d'];
  const targetHalls =
    request.preferredHall === 'any' ? hallIds : hallIds.filter((h) => h === request.preferredHall);

  const evaluations: HallPlacementEvaluation[] = targetHalls.map((hallId) => {
    const spec = HALL_SPECS[hallId];
    const hallRacks = racks.filter((r) => r.hallId === hallId);
    const hallCracs = site.bms.cracUnits.filter((c) => c.hallId === hallId);

    // 1. U-Space check: rank cabinets by free U & power headroom and check hall white-space budget
    const sortedCandidates = [...hallRacks].sort((a, b) => {
      const aFreeU = Math.max(0, a.totalU - a.baseUsedU);
      const bFreeU = Math.max(0, b.totalU - b.baseUsedU);
      if (bFreeU !== aFreeU) return bFreeU - aFreeU;
      return (b.powerCapacityKw - b.basePowerKw) - (a.powerCapacityKw - a.basePowerKw);
    });
    const totalFreeU = hallRacks.reduce((s, r) => s + Math.max(0, r.totalU - r.baseUsedU), 0);
    const totalAllU = hallRacks.reduce((s, r) => s + r.totalU, 0);
    const usedU = totalAllU - totalFreeU;
    const directFitRacks = sortedCandidates.filter((r) => Math.max(0, r.totalU - r.baseUsedU) >= uPerRack);
    const consolidatedSlotEquiv = Math.floor(totalFreeU / Math.max(1, uPerRack));
    const availableRackSlots = Math.max(directFitRacks.length, consolidatedSlotEquiv);
    const spacePassed = availableRackSlots >= rackCount && totalFreeU >= totalRequiredU;
    const postSpaceUtil = totalAllU > 0 ? round1(((usedU + totalRequiredU) / totalAllU) * 100) : 100;

    // 2. Power check (per 2N feed): design cap 85% per A/B feed so failover never exceeds 100%
    const totalHallCapKw = hallRacks.reduce((s, r) => s + r.powerCapacityKw, 0);
    const currentHallLoadKw = hallRacks.reduce((s, r) => s + r.basePowerKw, 0);
    const usablePowerCapKw = request.require2NFeeds ? totalHallCapKw * 0.85 : totalHallCapKw * 0.95;
    const availablePowerKw = Math.max(0, usablePowerCapKw - currentHallLoadKw);
    const powerPassed = availablePowerKw >= totalRequiredPowerKw;
    const currentPowerUtilPct = totalHallCapKw > 0 ? round1((currentHallLoadKw / totalHallCapKw) * 100) : 0;
    const projectedPowerUtilPct =
      totalHallCapKw > 0 ? round1(((currentHallLoadKw + totalRequiredPowerKw) / totalHallCapKw) * 100) : 100;

    // 3. Cooling check (Air CRAC + Liquid CDU) using real BMS maxCoolingKw & coolingOutputKw
    const airCracs = hallCracs.filter((c) => c.coolingType === 'CRAC');
    const cduUnits = hallCracs.filter((c) => c.coolingType === 'Liquid CDU');
    const airRatedKw =
      airCracs.length > 0
        ? airCracs.reduce((s, c) => s + (c.maxCoolingKw || 0), 0) * 0.9
        : Math.max(600, hallCracs.reduce((s, c) => s + (c.maxCoolingKw || 0), 0) * 0.45);
    const airUsedKw =
      airCracs.length > 0
        ? airCracs.reduce((s, c) => s + (c.coolingOutputKw || 0), 0)
        : hallCracs.reduce((s, c) => s + (c.coolingOutputKw || 0), 0) * 0.35;
    const airAvailableKw = Math.max(0, airRatedKw - airUsedKw);

    const cduRatedKw =
      cduUnits.length > 0
        ? Math.max(spec.liquidCduCapacityKw, cduUnits.reduce((s, c) => s + (c.maxCoolingKw || 0), 0))
        : spec.liquidCduCapacityKw;
    const cduUsedKw =
      cduUnits.length > 0
        ? cduUnits.reduce((s, c) => s + (c.coolingOutputKw || 0), 0)
        : hallId === 'hall-b'
        ? 1350
        : 120;
    const liquidAvailableKw = Math.max(0, cduRatedKw - cduUsedKw);

    let effectiveCoolingCap = airRatedKw + cduRatedKw;
    let effectiveCoolingAvail = airAvailableKw + liquidAvailableKw;
    let coolingPassed = false;
    if (request.coolingType === 'air_only') {
      effectiveCoolingCap = airRatedKw;
      effectiveCoolingAvail = airAvailableKw;
      coolingPassed = airAvailableKw >= totalRequiredCoolingKw;
    } else if (request.coolingType === 'liquid_cdu_high_density') {
      // 75% liquid CDU + 25% air
      const reqLiquid = totalRequiredCoolingKw * 0.75;
      const reqAir = totalRequiredCoolingKw * 0.25;
      coolingPassed = liquidAvailableKw >= reqLiquid && airAvailableKw >= reqAir;
    } else {
      // Hybrid 45% liquid + 55% air
      const reqLiquid = totalRequiredCoolingKw * 0.45;
      const reqAir = totalRequiredCoolingKw * 0.55;
      coolingPassed = liquidAvailableKw >= reqLiquid && airAvailableKw >= reqAir;
    }
    const postCoolingUtil =
      effectiveCoolingCap > 0
        ? round1(
            ((effectiveCoolingCap - effectiveCoolingAvail + totalRequiredCoolingKw) / effectiveCoolingCap) * 100
          )
        : 100;

    // 4. Floor Weight Load check (kg/m² — 1 rack footprint + aisle share ~ 1.15 m²)
    const footprintM2 = 1.15;
    const avgRackWeightKg = hallId === 'hall-b' ? 920 : 610;
    const projectedPeakRackWeightKg = Math.max(avgRackWeightKg, weightKgPerRack + 240);
    const projectedFloorLoadKgPerM2 = Math.round(projectedPeakRackWeightKg / footprintM2);
    const floorPassed = projectedFloorLoadKgPerM2 <= spec.floorLimitKgPerM2;
    const postFloorUtil = round1((projectedFloorLoadKgPerM2 / spec.floorLimitKgPerM2) * 100);

    const constraints: ConstraintCheckResult[] = [
      {
        key: 'space',
        label: 'Cabinet U-Space',
        passed: spacePassed,
        requiredText: `${totalRequiredU} U (${rackCount} racks)`,
        availableText: `${availableRackSlots} slots · ${totalFreeU.toLocaleString()} U free`,
        postUtilizationPct: Math.min(100, postSpaceUtil),
        headroomText: `${Math.max(0, availableRackSlots - rackCount)} slots headroom`,
      },
      {
        key: 'power',
        label: request.require2NFeeds ? '2N Dual-Feed Power' : 'Single-Path Power',
        passed: powerPassed,
        requiredText: `${totalRequiredPowerKw.toLocaleString()} kW`,
        availableText: `${round1(availablePowerKw).toLocaleString()} kW available`,
        postUtilizationPct: Math.min(125, projectedPowerUtilPct),
        headroomText: `${round1(availablePowerKw - totalRequiredPowerKw).toLocaleString()} kW margin`,
      },
      {
        key: 'cooling',
        label:
          request.coolingType === 'air_only'
            ? 'CRAC Air Cooling'
            : request.coolingType === 'liquid_cdu_high_density'
            ? 'Liquid CDU + Air Cooling'
            : 'Hybrid Air + Liquid Cooling',
        passed: coolingPassed,
        requiredText: `${totalRequiredCoolingKw.toLocaleString()} kWth`,
        availableText: `${round1(airAvailableKw).toLocaleString()} kW Air · ${round1(liquidAvailableKw).toLocaleString()} kW CDU`,
        postUtilizationPct: Math.min(125, postCoolingUtil),
        headroomText: `${round1(effectiveCoolingAvail - totalRequiredCoolingKw).toLocaleString()} kWth margin`,
      },
      {
        key: 'floor_weight',
        label: 'Raised Floor Load',
        passed: floorPassed,
        requiredText: `${projectedFloorLoadKgPerM2} kg/m²`,
        availableText: `Limit ${spec.floorLimitKgPerM2} kg/m²`,
        postUtilizationPct: Math.min(130, postFloorUtil),
        headroomText: `${spec.floorLimitKgPerM2 - projectedFloorLoadKgPerM2} kg/m² margin`,
      },
    ];

    const feasible = constraints.every((c) => c.passed);
    const failed = constraints.find((c) => !c.passed);

    // Compute balanced suitability score (0..100)
    const headroomScore =
      (Math.max(0, 100 - postSpaceUtil) * 0.25 +
        Math.max(0, 100 - projectedPowerUtilPct) * 0.35 +
        Math.max(0, 100 - postCoolingUtil) * 0.25 +
        Math.max(0, 100 - postFloorUtil) * 0.15);
    const score = feasible ? Math.min(99, Math.round(55 + headroomScore * 0.6)) : Math.max(8, Math.round(headroomScore * 0.45));

    // Stranded power: power remaining that cannot be consumed due to space or cooling limit
    const strandedPowerKw = round1(Math.max(0, availablePowerKw - effectiveCoolingAvail / 1.08));

    return {
      hallId,
      hallLabel: spec.label,
      feasible,
      score,
      limitingConstraint: failed ? failed.label : null,
      constraints,
      recommendedRackIds: sortedCandidates.slice(0, Math.min(6, rackCount)).map((r) => r.id),
      currentPowerUtilPct,
      projectedPowerUtilPct,
      strandedPowerKw,
      floorLoadLimitKgPerM2: spec.floorLimitKgPerM2,
      projectedFloorLoadKgPerM2,
    };
  });

  evaluations.sort((a, b) => Number(b.feasible) - Number(a.feasible) || b.score - a.score);
  const feasibleHallCount = evaluations.filter((e) => e.feasible).length;

  return {
    siteId,
    request: {
      ...request,
      rackCount,
      uPerRack,
      powerKwPerRack,
      weightKgPerRack,
    },
    totalRequiredU,
    totalRequiredPowerKw,
    totalRequiredCoolingKw,
    totalRequiredWeightKg,
    feasibleHallCount,
    bestHall: evaluations.find((e) => e.feasible) ?? null,
    evaluations,
  };
}

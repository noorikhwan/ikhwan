import { isAlertOpen } from './alertBulkActions';
import { computeTier4RedundancySummary } from './bmsEngine';
import { computeBmsRackPowerStats, DEFAULT_HALL_POWER_POLICIES } from './rackPowerEngine';
import { computeBmsSensorRackStats } from './rackHeatmapEngine';
import { SITES, SiteId, SiteWorkspaceState } from './sites';
import { computeFacilitySummary } from './telemetryEngine';
import { RackDefinition } from './types';

export interface SiteFleetRollup {
  siteId: SiteId;
  code: 'KL1' | 'KL2' | 'KL3';
  label: string;
  location: string;
  itLoadMw: number;
  facilityLoadMw: number;
  capacityMw: number;
  utilizationPct: number;
  coolingCapacityMw: number;
  coolingUsedMw: number;
  coolingHeadroomMw: number;
  liquidCduCapacityKw: number;
  liquidCduUsedKw: number;
  pue: number;
  wue: number;
  openCritical: number;
  openWarning: number;
  slaCompliancePct: number;
  tierState: 'fault-tolerant' | 'failover-active' | 'degraded';
  tierLabel: string;
  hottestTempC: number;
  serverCount: number;
  rackCount: number;
  capacityExceededCount: number;
  capacityExceededRackIds: string[];
  peakRackUtilPct: number;
  peakRackId: string | null;
  thermalExcursionCount: number;
}

export interface GlobalFleetOverview {
  sites: SiteFleetRollup[];
  totalItLoadMw: number;
  totalFacilityLoadMw: number;
  totalCapacityMw: number;
  fleetUtilizationPct: number;
  blendedPue: number;
  blendedWue: number;
  totalOpenCritical: number;
  totalOpenWarning: number;
  fleetSlaCompliancePct: number;
  totalServers: number;
  totalRacks: number;
  totalCapacityExceededRacks: number;
  totalThermalExcursions: number;
}

export interface FailoverSimulationRequest {
  sourceSiteId: SiteId;
  targetSiteId: SiteId;
  workloadName: string;
  loadKw: number;
  rackCount: number;
  requiresLiquidCooling: boolean;
}

export interface FailoverSimulationResult {
  feasible: boolean;
  verdict: 'Feasible — Zero SLA Impact' | 'Feasible with Cooling Boost' | 'Blocked — Exceeds Tier IV Headroom';
  sourceSiteCode: string;
  targetSiteCode: string;
  sourcePostItLoadMw: number;
  targetCurrentItLoadMw: number;
  targetProjectedItLoadMw: number;
  targetCapacityMw: number;
  targetCurrentUtilPct: number;
  targetProjectedUtilPct: number;
  powerHeadroomRemainingKw: number;
  coolingHeadroomRemainingKw: number;
  liquidHeadroomRemainingKw: number;
  projectedPueBefore: number;
  projectedPueAfter: number;
  pueDelta: number;
  racksAvailable: number;
  advisories: string[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function computeGlobalFleetOverview(
  sitesMap: Record<SiteId, SiteWorkspaceState>,
  racks: RackDefinition[]
): GlobalFleetOverview {
  const siteRollups: SiteFleetRollup[] = SITES.map((meta) => {
    const ws = sitesMap[meta.id];
    const summary = computeFacilitySummary(ws.servers, racks, ws.alerts);
    const tier4 = computeTier4RedundancySummary(ws.bms, ws.servers);

    const itLoadMw = summary.totalItLoadKw / 1000;
    const facilityLoadMw = (summary.totalItLoadKw * summary.pue) / 1000;
    const capacityMw = Math.max(1, summary.totalFacilityCapacityKw / 1000);
    const utilizationPct = (itLoadMw / capacityMw) * 100;

    const coolingCapacityMw =
      ws.bms.chillers.reduce((sum, ch) => sum + ch.capacityKw, 0) / 1000;
    const coolingUsedMw =
      ws.bms.chillers.reduce((sum, ch) => sum + ch.coolingOutputKw, 0) / 1000;
    const coolingHeadroomMw = Math.max(0, coolingCapacityMw - coolingUsedMw);

    const liquidCdus = ws.bms.cracUnits.filter((c) => c.coolingType === 'Liquid CDU');
    const liquidCduCapacityKw = liquidCdus.reduce((sum, c) => sum + c.maxCoolingKw, 0);
    const liquidCduUsedKw = liquidCdus.reduce((sum, c) => sum + c.coolingOutputKw, 0);

    // Water Usage Effectiveness (L/kWh) scales with water-cooled chiller share & load
    const waterChillerKw = ws.bms.chillers
      .filter((c) => c.chillerType === 'Water-Cooled')
      .reduce((sum, c) => sum + c.coolingOutputKw, 0);
    const waterShare = coolingUsedMw > 0 ? waterChillerKw / (coolingUsedMw * 1000) : 0.35;
    const wue = round2(0.42 + waterShare * 0.58 + (summary.pue - 1.25) * 0.45);

    const openAlerts = ws.alerts.filter((a) => isAlertOpen(a));
    const openCritical = openAlerts.filter((a) => a.severity === 'critical').length;
    const openWarning = openAlerts.filter((a) => a.severity === 'warning').length;

    const slaCompliancePct =
      ws.bms.envSensors.length > 0
        ? ws.bms.envSensors.reduce((sum, e) => sum + e.slaCompliancePct, 0) /
          ws.bms.envSensors.length
        : 100;

    // Live per-site over-capacity rack & thermal excursion rollup
    const powerStats = computeBmsRackPowerStats(racks, ws.bms, ws.servers, {
      rackPowerAdjustmentsKw: ws.rackPowerAdjustmentsKw,
      hallPowerPolicies: ws.hallPowerPolicies ?? DEFAULT_HALL_POWER_POLICIES,
    });
    const sensorStats = computeBmsSensorRackStats(racks, ws.bms, ws.servers);
    const capacityExceededRackIds: string[] = [];
    let peakRackUtilPct = 0;
    let peakRackId: string | null = null;
    let thermalExcursionCount = 0;

    for (const r of racks) {
      const ps = powerStats[r.id];
      if (ps) {
        if (ps.exceedsCapacity) capacityExceededRackIds.push(r.id);
        if (ps.utilizationPct > peakRackUtilPct) {
          peakRackUtilPct = ps.utilizationPct;
          peakRackId = r.id;
        }
      }
      const ss = sensorStats[r.id];
      if (ss && ss.sensorTempC > 27.0) {
        thermalExcursionCount += 1;
      }
    }

    return {
      siteId: meta.id,
      code: meta.code,
      label: meta.label,
      location: meta.location,
      itLoadMw: round2(itLoadMw),
      facilityLoadMw: round2(facilityLoadMw),
      capacityMw: round2(capacityMw),
      utilizationPct: round1(utilizationPct),
      coolingCapacityMw: round2(coolingCapacityMw),
      coolingUsedMw: round2(coolingUsedMw),
      coolingHeadroomMw: round2(coolingHeadroomMw),
      liquidCduCapacityKw: Math.round(liquidCduCapacityKw),
      liquidCduUsedKw: Math.round(liquidCduUsedKw),
      pue: round2(summary.pue),
      wue,
      openCritical,
      openWarning,
      slaCompliancePct: round2(slaCompliancePct),
      tierState: tier4.overallState,
      tierLabel: tier4.overallLabel,
      hottestTempC: round1(summary.peakExhaustTempC),
      serverCount: summary.totalServers,
      rackCount: racks.length,
      capacityExceededCount: capacityExceededRackIds.length,
      capacityExceededRackIds,
      peakRackUtilPct,
      peakRackId,
      thermalExcursionCount,
    };
  });

  const totalItLoadMw = siteRollups.reduce((s, r) => s + r.itLoadMw, 0);
  const totalFacilityLoadMw = siteRollups.reduce((s, r) => s + r.facilityLoadMw, 0);
  const totalCapacityMw = siteRollups.reduce((s, r) => s + r.capacityMw, 0);
  const blendedPue = totalItLoadMw > 0 ? totalFacilityLoadMw / totalItLoadMw : 1.3;
  const blendedWue =
    totalItLoadMw > 0
      ? siteRollups.reduce((s, r) => s + r.wue * r.itLoadMw, 0) / totalItLoadMw
      : 0.65;
  const fleetSlaCompliancePct =
    siteRollups.reduce((s, r) => s + r.slaCompliancePct, 0) / Math.max(1, siteRollups.length);

  return {
    sites: siteRollups,
    totalItLoadMw: round2(totalItLoadMw),
    totalFacilityLoadMw: round2(totalFacilityLoadMw),
    totalCapacityMw: round2(totalCapacityMw),
    fleetUtilizationPct: round1((totalItLoadMw / Math.max(1, totalCapacityMw)) * 100),
    blendedPue: round2(blendedPue),
    blendedWue: round2(blendedWue),
    totalOpenCritical: siteRollups.reduce((s, r) => s + r.openCritical, 0),
    totalOpenWarning: siteRollups.reduce((s, r) => s + r.openWarning, 0),
    fleetSlaCompliancePct: round2(fleetSlaCompliancePct),
    totalServers: siteRollups.reduce((s, r) => s + r.serverCount, 0),
    totalRacks: siteRollups.reduce((s, r) => s + r.rackCount, 0),
    totalCapacityExceededRacks: siteRollups.reduce((s, r) => s + r.capacityExceededCount, 0),
    totalThermalExcursions: siteRollups.reduce((s, r) => s + r.thermalExcursionCount, 0),
  };
}

export function simulateCrossSiteFailover(
  sitesMap: Record<SiteId, SiteWorkspaceState>,
  racks: RackDefinition[],
  req: FailoverSimulationRequest
): FailoverSimulationResult {
  const overview = computeGlobalFleetOverview(sitesMap, racks);
  const source = overview.sites.find((s) => s.siteId === req.sourceSiteId) ?? overview.sites[0];
  const target = overview.sites.find((s) => s.siteId === req.targetSiteId) ?? overview.sites[1];

  const loadKw = Math.max(10, req.loadKw);
  const loadMw = loadKw / 1000;
  const sourcePostItLoadMw = round2(Math.max(0, source.itLoadMw - loadMw));
  const targetProjectedItLoadMw = round2(target.itLoadMw + loadMw);

  // Tier IV 2N safe power envelope is 85% of rated IT capacity to keep single-path failover headroom
  const targetSafePowerCapKw = target.capacityMw * 1000 * 0.85;
  const powerHeadroomRemainingKw = Math.round(targetSafePowerCapKw - targetProjectedItLoadMw * 1000);

  const coolingHeadroomRemainingKw = Math.round(target.coolingHeadroomMw * 1000 - loadKw * 1.15);
  const liquidHeadroomRemainingKw = Math.round(
    target.liquidCduCapacityKw - target.liquidCduUsedKw - (req.requiresLiquidCooling ? loadKw : 0)
  );

  const targetCurrentUtilPct = target.utilizationPct;
  const targetProjectedUtilPct = round1(
    (targetProjectedItLoadMw / Math.max(0.1, target.capacityMw)) * 100
  );

  // PUE efficiency curve: moderate load increase reduces fixed overhead share slightly, high utilization (>78%) adds fan/compressor draw
  const utilShift = targetProjectedUtilPct - targetCurrentUtilPct;
  const pueEffect =
    targetProjectedUtilPct > 78
      ? +0.02 + (targetProjectedUtilPct - 78) * 0.0025
      : -Math.min(0.03, utilShift * 0.0012);
  const projectedPueAfter = round2(Math.max(1.18, Math.min(1.65, target.pue + pueEffect)));
  const pueDelta = round2(projectedPueAfter - target.pue);

  // Assume ~15% white-space rack reserve available per campus for emergency failover
  const racksAvailable = Math.round(target.rackCount * 0.15);

  const advisories: string[] = [];
  if (req.sourceSiteId === req.targetSiteId) {
    advisories.push('Select a different target facility to evaluate cross-site failover.');
  }
  if (powerHeadroomRemainingKw < 0) {
    advisories.push(
      `Exceeds ${target.code} Tier IV 2N safe power envelope (85% cap) by ${Math.abs(powerHeadroomRemainingKw).toLocaleString()} kW.`
    );
  }
  if (coolingHeadroomRemainingKw < 0) {
    advisories.push(
      `Exceeds ${target.code} active chiller plant headroom by ${Math.abs(coolingHeadroomRemainingKw).toLocaleString()} kW — stage standby air chillers first.`
    );
  }
  if (req.requiresLiquidCooling && liquidHeadroomRemainingKw < 0) {
    advisories.push(
      `Hall B Direct-to-Chip Liquid CDU loop on ${target.code} is short by ${Math.abs(liquidHeadroomRemainingKw).toLocaleString()} kW.`
    );
  }
  if (req.rackCount > racksAvailable) {
    advisories.push(
      `Requested ${req.rackCount} racks exceeds ${target.code} hot-standby cage reserve (${racksAvailable} racks).`
    );
  }

  let verdict: FailoverSimulationResult['verdict'];
  let feasible: boolean;

  if (
    req.sourceSiteId === req.targetSiteId ||
    powerHeadroomRemainingKw < 0 ||
    (req.requiresLiquidCooling && liquidHeadroomRemainingKw < -400) ||
    req.rackCount > racksAvailable
  ) {
    verdict = 'Blocked — Exceeds Tier IV Headroom';
    feasible = false;
  } else if (
    coolingHeadroomRemainingKw < 500 ||
    targetProjectedUtilPct > 74 ||
    (req.requiresLiquidCooling && liquidHeadroomRemainingKw < 0)
  ) {
    verdict = 'Feasible with Cooling Boost';
    feasible = true;
    advisories.push(
      `Pre-cool ${target.code} Hall B cold aisles (-1.5°C setpoint) and enable standby air chillers before workload cutover.`
    );
  } else {
    verdict = 'Feasible — Zero SLA Impact';
    feasible = true;
    advisories.push(
      `${target.code} absorbs ${loadKw.toLocaleString()} kW (${req.rackCount} racks) while preserving full 2(N+1) Tier IV fault tolerance.`
    );
  }

  return {
    feasible,
    verdict,
    sourceSiteCode: source.code,
    targetSiteCode: target.code,
    sourcePostItLoadMw,
    targetCurrentItLoadMw: target.itLoadMw,
    targetProjectedItLoadMw,
    targetCapacityMw: target.capacityMw,
    targetCurrentUtilPct,
    targetProjectedUtilPct,
    powerHeadroomRemainingKw,
    coolingHeadroomRemainingKw,
    liquidHeadroomRemainingKw,
    projectedPueBefore: target.pue,
    projectedPueAfter,
    pueDelta,
    racksAvailable,
    advisories,
  };
}

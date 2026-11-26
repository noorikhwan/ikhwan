import { BmsState } from './bmsTypes';
import { RackBmsPowerStat } from './rackPowerEngine';
import { HallId, RackDefinition } from './types';

export interface BmsResilienceScenario {
  busAFailed: boolean;
  busBFailed: boolean;
  failedChillersCount: number; // 0..4
  failedCracHall: HallId | 'none';
  loadSurgePct: number; // 0..35
}

export type ResilienceVerdict =
  | 'Resilient — Tier IV Intact'
  | 'Failover Active — Margin Tight'
  | 'Critical — SLA Breach Risk';

export interface BmsResilienceWhatIfResult {
  verdict: ResilienceVerdict;
  totalItLoadMw: number;
  projectedItLoadMw: number;
  survivingUpsCapacityMw: number;
  survivingBusUtilPct: number;
  projectedBatteryAutonomyMin: number;
  availableChillerCapacityMw: number;
  requiredCoolingMw: number;
  chillerHeadroomMw: number;
  projectedIntakeDeltaC: number;
  projectedPeakIntakeC: number;
  ashraeSlaAtRisk: boolean;
  baselineOverCapRacks: number;
  projectedOverCapRacks: number;
  newlyOverloadedRacks: number;
  advisories: string[];
}

export const DEFAULT_BMS_WHATIF_SCENARIO: BmsResilienceScenario = {
  busAFailed: false,
  busBFailed: false,
  failedChillersCount: 0,
  failedCracHall: 'none',
  loadSurgePct: 0,
};

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * Pure non-destructive Tier IV 2N Electrical & N+1 Cooling What-If Simulator.
 * Evaluates bus failure, chiller outages, CRAC/CDU unit loss, and load surges
 * against live BMS assets and rack power stats without mutating runtime state.
 */
export function simulateBmsResilienceWhatIf(
  bms: BmsState,
  racks: RackDefinition[],
  powerStats: Record<string, RackBmsPowerStat>,
  scenario: BmsResilienceScenario
): BmsResilienceWhatIfResult {
  const surgeFactor = 1 + Math.max(0, Math.min(35, scenario.loadSurgePct)) / 100;

  const totalUpsLoadKw = bms.upsSystems.reduce((sum, u) => sum + u.loadKw, 0);
  const totalItLoadMw = round2(totalUpsLoadKw / 1000);
  const projectedItLoadKw = totalUpsLoadKw * surgeFactor;
  const projectedItLoadMw = round2(projectedItLoadKw / 1000);

  // Surviving 2N UPS bus capacity
  const survivingUps = bms.upsSystems.filter((u) => {
    if (u.mode === 'Fault') return false;
    if (scenario.busAFailed && u.feedBus === 'Bus A') return false;
    if (scenario.busBFailed && u.feedBus === 'Bus B') return false;
    return true;
  });
  const survivingUpsCapacityKw = survivingUps.reduce((sum, u) => sum + u.capacityKw, 0);
  const survivingUpsCapacityMw = round2(survivingUpsCapacityKw / 1000);
  const survivingBusUtilPct =
    survivingUpsCapacityKw > 0
      ? Math.min(200, Math.round((projectedItLoadKw / survivingUpsCapacityKw) * 100))
      : 200;

  // Projected battery runtime scales inversely with surviving bus utilization
  const baseMinRuntime =
    survivingUps.length > 0
      ? Math.min(...survivingUps.map((u) => u.runtimeMin))
      : 0;
  const projectedBatteryAutonomyMin =
    survivingUps.length === 0
      ? 0
      : Math.max(
          2,
          Math.round(baseMinRuntime * Math.min(1.2, 55 / Math.max(25, survivingBusUtilPct)))
        );

  // Chiller plant N+1 cooling projection
  const activeCapChillers = bms.chillers
    .filter((c) => c.mode !== 'Fault')
    .sort((a, b) => b.capacityKw - a.capacityKw);
  const failedCount = Math.max(0, Math.min(activeCapChillers.length, scenario.failedChillersCount));
  const survivingChillers = activeCapChillers.slice(failedCount);
  const availableChillerCapacityKw = survivingChillers.reduce((sum, c) => sum + c.capacityKw, 0);
  const availableChillerCapacityMw = round2(availableChillerCapacityKw / 1000);

  // Required cooling = IT load * 1.18 (includes UPS/lighting/mechanical heat rejection)
  const requiredCoolingMw = round2(projectedItLoadMw * 1.18);
  const chillerHeadroomMw = round2(availableChillerCapacityMw - requiredCoolingMw);

  // Intake temperature rise model
  const baselinePeakIntakeC =
    bms.envSensors.length > 0
      ? Math.max(...bms.envSensors.map((s) => s.coldAisleTempC))
      : 22.8;

  let intakeDeltaC = 0;
  if (chillerHeadroomMw < 0) {
    intakeDeltaC += Math.min(8.5, Math.abs(chillerHeadroomMw) * 1.35 + 1.4);
  } else if (chillerHeadroomMw < 3.0) {
    intakeDeltaC += (3.0 - chillerHeadroomMw) * 0.45;
  }
  if (scenario.failedCracHall !== 'none') {
    intakeDeltaC += scenario.failedCracHall === 'hall-b' ? 3.8 : 2.6;
  }
  intakeDeltaC += (surgeFactor - 1) * 4.2;
  const projectedIntakeDeltaC = round1(intakeDeltaC);
  const projectedPeakIntakeC = round1(baselinePeakIntakeC + projectedIntakeDeltaC);
  const ashraeSlaAtRisk = projectedPeakIntakeC > 27.0;

  // Rack capacity impact under surge
  let baselineOverCapRacks = 0;
  let projectedOverCapRacks = 0;
  for (const rack of racks) {
    const st = powerStats[rack.id];
    if (!st) continue;
    if (st.exceedsCapacity) baselineOverCapRacks += 1;
    if (st.powerKw * surgeFactor > st.effectiveLimitKw) projectedOverCapRacks += 1;
  }
  const newlyOverloadedRacks = Math.max(0, projectedOverCapRacks - baselineOverCapRacks);

  const advisories: string[] = [];
  if (scenario.busAFailed && scenario.busBFailed) {
    advisories.push('Both 2N UPS buses offline — immediate critical IT power loss. Restore utility or start standby generators.');
  } else if (scenario.busAFailed || scenario.busBFailed) {
    const lost = scenario.busAFailed ? 'Bus A' : 'Bus B';
    const survivor = scenario.busAFailed ? 'Bus B' : 'Bus A';
    advisories.push(
      `${lost} offline: 100% IT load transfers to ${survivor} at ${survivingBusUtilPct}% capacity (${projectedBatteryAutonomyMin}m Li-Ion autonomy).`
    );
  }
  if (failedCount > 0) {
    advisories.push(
      `${failedCount} chiller${failedCount > 1 ? 's' : ''} offline: remaining plant capacity ${availableChillerCapacityMw.toFixed(1)} MW vs ${requiredCoolingMw.toFixed(1)} MW required (${chillerHeadroomMw >= 0 ? '+' : ''}${chillerHeadroomMw.toFixed(1)} MW margin).`
    );
  }
  if (scenario.failedCracHall !== 'none') {
    advisories.push(
      `${scenario.failedCracHall.toUpperCase()} cooling unit outage projects +${projectedIntakeDeltaC.toFixed(1)}°C intake delta — stage partner CRAC/CDU to Boost mode.`
    );
  }
  if (newlyOverloadedRacks > 0) {
    advisories.push(
      `+${scenario.loadSurgePct}% workload surge pushes ${newlyOverloadedRacks} additional cabinet${newlyOverloadedRacks === 1 ? '' : 's'} past their effective power limit (${projectedOverCapRacks} total).`
    );
  }
  if (advisories.length === 0) {
    advisories.push(
      'All 2N UPS paths, N+1 chiller headroom, and ASHRAE TC 9.9 intake margins remain inside Tier IV fault-tolerant limits.'
    );
  }

  let verdict: ResilienceVerdict;
  if (
    (scenario.busAFailed && scenario.busBFailed) ||
    survivingBusUtilPct > 95 ||
    chillerHeadroomMw < 0 ||
    projectedPeakIntakeC > 28.5
  ) {
    verdict = 'Critical — SLA Breach Risk';
  } else if (
    scenario.busAFailed ||
    scenario.busBFailed ||
    survivingBusUtilPct > 80 ||
    chillerHeadroomMw < 3.5 ||
    ashraeSlaAtRisk ||
    newlyOverloadedRacks > 0
  ) {
    verdict = 'Failover Active — Margin Tight';
  } else {
    verdict = 'Resilient — Tier IV Intact';
  }

  return {
    verdict,
    totalItLoadMw,
    projectedItLoadMw,
    survivingUpsCapacityMw,
    survivingBusUtilPct,
    projectedBatteryAutonomyMin,
    availableChillerCapacityMw,
    requiredCoolingMw,
    chillerHeadroomMw,
    projectedIntakeDeltaC,
    projectedPeakIntakeC,
    ashraeSlaAtRisk,
    baselineOverCapRacks,
    projectedOverCapRacks,
    newlyOverloadedRacks,
    advisories,
  };
}

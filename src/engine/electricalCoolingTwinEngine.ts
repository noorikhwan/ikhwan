import { BmsState } from './bmsTypes';
import { ServerNode } from './types';

export interface UpsAutonomyPoint {
  minute: number;
  label: string;
  socPct: number;
  busVoltageV: number;
}

export interface DieselAutonomyPoint {
  hour: number;
  label: string;
  fuelPct: number;
  litersRemaining: number;
  refuelThresholdPct: number;
}

export interface AutonomySimulationInput {
  outageDurationHrs: number; // 1 .. 72
  simulatedLoadKw: number; // 1000 .. 16000
  includeChillerLoad: boolean;
}

export interface AutonomySimulationResult {
  effectiveLoadKw: number;
  upsBankCapacityKwh: number;
  upsAutonomyMin: number;
  genAutoStartSec: number;
  batterySocAtGenSyncPct: number;
  totalDieselLiters: number;
  totalDieselCapLiters: number;
  fuelBurnRateLph: number;
  dieselAutonomyHrs: number;
  refuelCalloutHr: number;
  survivesOutage: boolean;
  upsCurve: UpsAutonomyPoint[];
  dieselCurve: DieselAutonomyPoint[];
}

export interface DlcLeakRopeZone {
  id: string;
  label: string;
  location: string;
  lengthMeters: number;
  impedanceKohm: number;
  leakDetected: boolean;
  leakDistanceM: number | null;
  lastSelfTestLabel: string;
}

export interface DlcLoopSummary {
  cdus: Array<{
    id: string;
    name: string;
    mode: string;
    status: 'nominal' | 'warning' | 'critical';
    supplyTempC: number;
    returnTempC: number;
    deltaTC: number;
    manifoldPressureBar: number;
    flowLpm: number;
    conductivityUsCm: number;
    glycolMixPct: number;
    coolingOutputKw: number;
    maxCoolingKw: number;
  }>;
  avgManifoldPressureBar: number;
  avgDeltaTC: number;
  avgConductivityUsCm: number;
  totalLiquidCoolingKw: number;
  totalLiquidCapKw: number;
  activeLeakCount: number;
  leakZones: DlcLeakRopeZone[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Computes UPS lithium-ion battery discharge curve (minutes) and B1 diesel vault runtime curve (hours)
 * for a simulated utility grid outage against live or custom IT + mechanical load.
 */
export function computeAutonomySimulation(
  bms: BmsState,
  input: AutonomySimulationInput
): AutonomySimulationResult {
  const outageHrs = Math.max(1, Math.min(72, Math.round(input.outageDurationHrs)));
  const baseLoadKw = Math.max(500, input.simulatedLoadKw);
  // Mechanical chiller & pump parasitic overhead adds ~26% when included
  const effectiveLoadKw = Math.round(
    input.includeChillerLoad ? baseLoadKw * 1.26 : baseLoadKw
  );

  // Healthy UPS battery reserve (4 x 2N Li-Ion banks, ~2,800 kWh usable at 100% SoC)
  const healthyUps = bms.upsSystems.filter((u) => u.mode !== 'Fault');
  const avgSoc =
    healthyUps.length > 0
      ? healthyUps.reduce((s, u) => s + u.batterySocPct, 0) / healthyUps.length
      : 92;
  const upsBankCapacityKwh = Math.round(healthyUps.length * 700 * (avgSoc / 100));
  // Peukert-adjusted discharge runtime in minutes at effective IT load (UPS only backs IT + controls)
  const upsLoadKw = Math.max(400, baseLoadKw);
  const upsAutonomyMin = round1(Math.max(4, Math.min(60, (upsBankCapacityKwh / upsLoadKw) * 60 * 0.92)));
  const genAutoStartSec = 14;
  const socDropPerMin = avgSoc / Math.max(1, upsAutonomyMin);
  const batterySocAtGenSyncPct = round1(Math.max(10, avgSoc - socDropPerMin * (genAutoStartSec / 60)));

  const upsCurve: UpsAutonomyPoint[] = [];
  const maxMin = Math.min(36, Math.max(16, Math.ceil(upsAutonomyMin / 4) * 4));
  for (let m = 0; m <= maxMin; m += 2) {
    // Non-linear tail drop below 25% SoC
    const linSoc = avgSoc - socDropPerMin * m;
    const soc = Math.max(0, round1(linSoc < 25 ? linSoc * 0.92 : linSoc));
    const busVoltageV = round1(480 + (soc / 100) * 64);
    upsCurve.push({
      minute: m,
      label: `${m}m`,
      socPct: soc,
      busVoltageV,
    });
  }

  // Diesel fuel calculation across all 8 Basement B1 vault tanks
  const totalDieselLiters = bms.dieselTanks.reduce((s, t) => s + t.currentLiters, 0);
  const totalDieselCapLiters = Math.max(
    1,
    bms.dieselTanks.reduce((s, t) => s + t.capacityLiters, 0)
  );
  // Modern Tier IV standby diesel gen consumes ~0.265 L/kWh at ~70% load
  const fuelBurnRateLph = Math.max(120, Math.round(effectiveLoadKw * 0.265));
  const dieselAutonomyHrs = round1(totalDieselLiters / fuelBurnRateLph);
  const refuelThresholdPct = 25;
  const usableBeforeRefuelLiters = Math.max(
    0,
    totalDieselLiters - totalDieselCapLiters * (refuelThresholdPct / 100)
  );
  const refuelCalloutHr = round1(usableBeforeRefuelLiters / fuelBurnRateLph);
  const survivesOutage = dieselAutonomyHrs >= outageHrs;

  const dieselCurve: DieselAutonomyPoint[] = [];
  const horizonHrs = Math.max(24, Math.min(72, Math.ceil(outageHrs / 4) * 4));
  for (let h = 0; h <= horizonHrs; h += 4) {
    const liters = Math.max(0, Math.round(totalDieselLiters - fuelBurnRateLph * h));
    const fuelPct = round1((liters / totalDieselCapLiters) * 100);
    dieselCurve.push({
      hour: h,
      label: `${h}h`,
      fuelPct,
      litersRemaining: liters,
      refuelThresholdPct,
    });
  }

  return {
    effectiveLoadKw,
    upsBankCapacityKwh,
    upsAutonomyMin,
    genAutoStartSec,
    batterySocAtGenSyncPct,
    totalDieselLiters: Math.round(totalDieselLiters),
    totalDieselCapLiters: Math.round(totalDieselCapLiters),
    fuelBurnRateLph,
    dieselAutonomyHrs,
    refuelCalloutHr,
    survivesOutage,
    upsCurve,
    dieselCurve,
  };
}

/**
 * Computes Hall B Direct Liquid Cooling (DLC) loop hydraulics, dielectric conductivity,
 * and addressable floor leak-rope zone statuses.
 */
export function computeDlcLeakTelemetry(
  bms: BmsState,
  servers: ServerNode[],
  simulatedLeakZoneIds: string[] = []
): DlcLoopSummary {
  const hallBEnv = bms.envSensors.find((e) => e.hallId === 'hall-b');
  const hallBPowerKw =
    servers.filter((s) => s.hallId === 'hall-b').reduce((sum, s) => sum + s.powerW, 0) / 1000;

  const liquidUnits = bms.cracUnits.filter((c) => c.coolingType === 'Liquid CDU');
  const cdus = liquidUnits.map((u, idx) => {
    const supplyTempC = round1(u.coolantSupplyTempC ?? u.supplyTempC);
    const returnTempC = round1(u.coolantReturnTempC ?? supplyTempC + 8.4 + Math.min(3.5, hallBPowerKw / 40));
    const deltaTC = round1(Math.max(1.5, returnTempC - supplyTempC));
    const manifoldPressureBar = round2(u.deltaPBar ?? (u.mode === 'Boost' ? 2.35 : 1.85 + idx * 0.06));
    const flowLpm = Math.round(u.coolantFlowLpm ?? (u.mode === 'Boost' ? 1420 : 1160));
    // Target PG25 coolant conductivity < 25 µS/cm
    const conductivityUsCm = round1(u.status === 'critical' ? 31.4 : u.mode === 'Boost' ? 16.8 : 14.2 + idx * 0.7);
    const glycolMixPct = round1(u.glycolMixPct ?? 25.0);

    return {
      id: u.id,
      name: u.name,
      mode: u.mode,
      status: u.status,
      supplyTempC,
      returnTempC,
      deltaTC,
      manifoldPressureBar,
      flowLpm,
      conductivityUsCm,
      glycolMixPct,
      coolingOutputKw: Math.round(u.coolingOutputKw),
      maxCoolingKw: Math.round(u.maxCoolingKw),
    };
  });

  const leakSet = new Set(simulatedLeakZoneIds);
  if (hallBEnv?.leakDetected) {
    leakSet.add('zone-b-cdu1');
  }

  const baseZones: Array<Omit<DlcLeakRopeZone, 'leakDetected' | 'leakDistanceM' | 'impedanceKohm'>> = [
    {
      id: 'zone-b-cdu1',
      label: 'CDU-B1 Primary Manifold Pit',
      location: 'Hall B West Perimeter',
      lengthMeters: 42,
      lastSelfTestLabel: 'Pass · 14m ago',
    },
    {
      id: 'zone-b-cdu2',
      label: 'CDU-B2 Secondary Header Trench',
      location: 'Hall B East Perimeter',
      lengthMeters: 42,
      lastSelfTestLabel: 'Pass · 14m ago',
    },
    {
      id: 'zone-b-west',
      label: 'Hall B Row 01–04 Cold-Plate Spine',
      location: 'AI GPU Cluster West',
      lengthMeters: 68,
      lastSelfTestLabel: 'Pass · 14m ago',
    },
    {
      id: 'zone-b-east',
      label: 'Hall B Row 05–08 Return Header',
      location: 'AI GPU Cluster East',
      lengthMeters: 68,
      lastSelfTestLabel: 'Pass · 14m ago',
    },
  ];

  const leakZones: DlcLeakRopeZone[] = baseZones.map((z, idx) => {
    const leakDetected = leakSet.has(z.id);
    return {
      ...z,
      leakDetected,
      impedanceKohm: leakDetected ? round1(3.8 + idx * 0.4) : round1(482.5 - idx * 4.2),
      leakDistanceM: leakDetected ? round1(11.4 + idx * 6.5) : null,
    };
  });

  const avgManifoldPressureBar =
    cdus.length > 0
      ? round2(cdus.reduce((s, c) => s + c.manifoldPressureBar, 0) / cdus.length)
      : 1.85;
  const avgDeltaTC =
    cdus.length > 0 ? round1(cdus.reduce((s, c) => s + c.deltaTC, 0) / cdus.length) : 8.5;
  const avgConductivityUsCm =
    cdus.length > 0
      ? round1(cdus.reduce((s, c) => s + c.conductivityUsCm, 0) / cdus.length)
      : 14.5;

  return {
    cdus,
    avgManifoldPressureBar,
    avgDeltaTC,
    avgConductivityUsCm,
    totalLiquidCoolingKw: cdus.reduce((s, c) => s + c.coolingOutputKw, 0),
    totalLiquidCapKw: cdus.reduce((s, c) => s + c.maxCoolingKw, 0),
    activeLeakCount: leakZones.filter((z) => z.leakDetected).length,
    leakZones,
  };
}

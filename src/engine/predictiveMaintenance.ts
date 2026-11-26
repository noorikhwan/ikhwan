import { computeTier4RedundancySummary } from './bmsEngine';
import { buildHistoricalTrendSeries, computeHistoricalTrendSummary } from './historicalTrends';
import { SITE_META_MAP, SiteId, SiteWorkspaceState } from './sites';
import { computeFacilitySummary } from './telemetryEngine';
import { RackDefinition } from './types';

export type AssetRiskCategory = 'chiller' | 'crac' | 'ups' | 'generator' | 'sla_sensor' | 'server';
export type RiskSeverity = 'critical' | 'high' | 'moderate' | 'low';

export interface PredictiveAssetRisk {
  id: string;
  assetId: string;
  assetName: string;
  category: AssetRiskCategory;
  categoryLabel: string;
  location: string;
  redundancyTopology: string;
  healthScore: number; // 0..100 (100 = optimal)
  failureRiskPct: number; // 0..100
  severity: RiskSeverity;
  estimatedRulDays: number;
  predictedFailureWindow: string;
  predictedFailureMode: string;
  anomalySignals: string[];
  recommendedAction: string;
  tier4ImpactNote: string;
  projectedPueDelta: number;
}

export interface PredictiveMaintenanceSummary {
  fleetHealthScore: number;
  totalMonitoredAssets: number;
  criticalCount: number;
  highCount: number;
  moderateCount: number;
  lowCount: number;
  nearestRulDays: number;
  nearestAssetName: string;
  projectedPueReduction: number;
  projectedAnnualMwhSaved: number;
  tier4SafeWindowsReady: boolean;
}

export type WorkOrderPriority = 'P1 - Urgent' | 'P2 - High' | 'P3 - Preventive';
export type WorkOrderStatus = 'Scheduled' | 'In Progress' | 'Completed';

export interface MaintenanceWorkOrder {
  id: string;
  siteId: SiteId;
  assetId: string;
  assetName: string;
  categoryLabel: string;
  priority: WorkOrderPriority;
  predictedFailureMode: string;
  recommendedAction: string;
  estimatedWindow: string;
  tier4SafetyNote: string;
  status: WorkOrderStatus;
  source: 'Predictive Engine' | 'Gemini AI Audit';
  createdAt: number;
}

export interface AiPredictiveAuditResult {
  executiveBrief: string;
  riskPosture: 'Elevated' | 'Guarded' | 'Optimal' | 'Critical';
  rootCauseCorrelations: Array<{
    title: string;
    affectedAssets: string[];
    explanation: string;
  }>;
  pueOptimization: {
    estimatedPueGain: string;
    summary: string;
    actions: string[];
  };
  recommendedWorkOrders: Array<{
    assetId: string;
    assetName: string;
    priority: WorkOrderPriority;
    predictedFailureMode: string;
    recommendedAction: string;
    estimatedWindow: string;
    tier4SafetyNote: string;
    expectedImpact: string;
  }>;
  generatedAt: number;
  model: string;
}

export interface AiWorkOrderRunbook {
  assetId: string;
  assetName: string;
  title: string;
  estimatedDuration: string;
  tier4IsolationStrategy: string;
  requiredTools: string[];
  preChecks: string[];
  serviceProcedure: string[];
  verificationChecks: string[];
  rollbackCriteria: string[];
  generatedAt: number;
  model: string;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round(v: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

function classifySeverity(riskPct: number): RiskSeverity {
  if (riskPct >= 70) return 'critical';
  if (riskPct >= 45) return 'high';
  if (riskPct >= 25) return 'moderate';
  return 'low';
}

function formatFailureWindow(rulDays: number): string {
  if (rulDays <= 7) return 'Next 1–7 days';
  if (rulDays <= 21) return 'Next 1–3 weeks';
  if (rulDays <= 60) return '30–60 days';
  if (rulDays <= 150) return '2–5 months';
  return '> 6 months';
}

function estimateRulDays(riskPct: number): number {
  if (riskPct >= 85) return Math.max(2, Math.round((100 - riskPct) * 0.4));
  if (riskPct >= 70) return Math.round(6 + (85 - riskPct) * 0.6);
  if (riskPct >= 45) return Math.round(16 + (70 - riskPct) * 1.4);
  if (riskPct >= 25) return Math.round(55 + (45 - riskPct) * 3.8);
  return Math.round(160 + (25 - riskPct) * 8);
}

/**
 * Computes deterministic real-time predictive maintenance scores, RUL estimates,
 * and Tier IV failover safety notes across all critical BMS & compute assets.
 */
export function computePredictiveMaintenance(
  site: SiteWorkspaceState,
  racks: RackDefinition[],
  siteId: SiteId
): {
  risks: PredictiveAssetRisk[];
  summary: PredictiveMaintenanceSummary;
} {
  const risks: PredictiveAssetRisk[] = [];
  const facilitySummary = computeFacilitySummary(site.servers, racks, site.alerts);
  const tier4 = computeTier4RedundancySummary(site.bms, site.servers);

  // 1. Chillers (2 Water-Cooled 2N + 6 Air-Cooled 2(N+1))
  for (const ch of site.bms.chillers) {
    const isWater = ch.chillerType === 'Water-Cooled';
    const expectedCop = isWater ? 5.6 : 3.5;
    const expectedChwC = isWater ? 7.0 : 8.2;
    const copDrop = Math.max(0, expectedCop - ch.cop);
    const loadPressure = Math.max(0, ch.compressorLoadPct - 68);
    const chwOvershoot = Math.max(0, ch.chwSupplyTempC - (expectedChwC + 0.8));

    let risk = 11 + loadPressure * 1.15 + copDrop * 18 + chwOvershoot * 14;
    if (ch.mode === 'Fault') risk = 94;
    else if (ch.mode === 'Boost') risk += 22;
    else if (ch.status === 'warning') risk += 16;
    risk = round(clamp(risk, 6, 98), 0);

    const signals: string[] = [];
    if (ch.mode === 'Fault') signals.push('Active chiller fault trip');
    if (ch.mode === 'Boost') signals.push(`Boost overdrive (${ch.compressorLoadPct}% compressor load)`);
    else if (ch.compressorLoadPct >= 74) signals.push(`High compressor duty (${ch.compressorLoadPct}%)`);
    if (copDrop >= 0.35) signals.push(`COP efficiency drift (${ch.cop.toFixed(1)} vs ${expectedCop.toFixed(1)} nominal)`);
    if (chwOvershoot > 0.2) signals.push(`CHW supply +${chwOvershoot.toFixed(1)}°C above setpoint`);
    if (signals.length === 0) signals.push(`Steady ${ch.compressorLoadPct}% load · COP ${ch.cop.toFixed(1)}`);

    const rulDays = estimateRulDays(risk);
    const mode =
      ch.mode === 'Fault'
        ? 'Compressor / VFD trip fault'
        : copDrop >= 0.35
        ? isWater
          ? 'Condenser tube scaling & approach temp drift'
          : 'Air-cooled condenser fin fouling & fan VFD stress'
        : ch.compressorLoadPct >= 74
        ? 'Compressor bearing thermal wear under sustained duty'
        : 'Routine vibration & refrigerant charge check';

    risks.push({
      id: `pm-${siteId}-${ch.id}`,
      assetId: ch.deviceId,
      assetName: `${ch.name} (${ch.chillerType})`,
      category: 'chiller',
      categoryLabel: isWater ? 'Water Chiller' : 'Air Chiller',
      location: `Chiller Plant · ${ch.chilledLoop}`,
      redundancyTopology: isWater ? '2N' : '2(N+1)',
      healthScore: 100 - risk,
      failureRiskPct: risk,
      severity: classifySeverity(risk),
      estimatedRulDays: rulDays,
      predictedFailureWindow: formatFailureWindow(rulDays),
      predictedFailureMode: mode,
      anomalySignals: signals,
      recommendedAction:
        risk >= 45
          ? `Shift cooling load to peer ${ch.chilledLoop === 'Loop A' ? 'Loop B' : 'Loop A'} chillers, inspect condenser approach delta-T and oil/bearing vibration spectrum.`
          : 'Continue scheduled quarterly condenser inspection and oil spectroscopy.',
      tier4ImpactNote: isWater
        ? 'Zero downtime: peer 2N Water Chiller + 6 Air Chillers absorb 100% thermal load.'
        : 'Zero downtime: 2(N+1) air chiller array maintains full N+1 margin during service.',
      projectedPueDelta: risk >= 45 ? round(0.008 + copDrop * 0.012, 3) : 0.002,
    });
  }

  // 2. CRAC / CRAH Units (8 units, 2N per Hall)
  for (const crac of site.bms.cracUnits) {
    const supplyDrift = Math.max(0, crac.supplyTempC - (crac.setpointC + 0.6));
    const fanStress = Math.max(0, crac.fanSpeedPct - 74);

    let risk = 10 + fanStress * 1.45 + supplyDrift * 15;
    if (crac.mode === 'Fault') risk = 93;
    else if (crac.mode === 'Boost') risk += 26;
    else if (crac.status === 'warning') risk += 15;
    risk = round(clamp(risk, 7, 97), 0);

    const signals: string[] = [];
    if (crac.mode === 'Fault') signals.push('CRAC offline fault');
    if (crac.mode === 'Boost') signals.push(`Closed-loop Boost active (Fan ${crac.fanSpeedPct}%)`);
    else if (crac.fanSpeedPct >= 78) signals.push(`Elevated EC fan duty (${crac.fanSpeedPct}%)`);
    if (supplyDrift > 0.3) signals.push(`Supply ${crac.supplyTempC.toFixed(1)}°C vs SP ${crac.setpointC.toFixed(1)}°C`);
    if (signals.length === 0) signals.push(`Fan ${crac.fanSpeedPct}% · Supply ${crac.supplyTempC.toFixed(1)}°C`);

    const rulDays = estimateRulDays(risk);
    const mode =
      crac.mode === 'Fault'
        ? 'Blower inverter / chilled-water actuator failure'
        : crac.mode === 'Boost' || crac.fanSpeedPct >= 82
        ? 'EC blower bearing fatigue & filter pressure drop'
        : supplyDrift > 0.5
        ? 'CHW 3-way modulating valve stiction'
        : 'Nominal airflow & coil heat transfer';

    risks.push({
      id: `pm-${siteId}-${crac.id}`,
      assetId: crac.deviceId,
      assetName: crac.name,
      category: 'crac',
      categoryLabel: 'CRAC Cooling',
      location: `${crac.hallLabel} · ${crac.chilledLoop}`,
      redundancyTopology: '2N',
      healthScore: 100 - risk,
      failureRiskPct: risk,
      severity: classifySeverity(risk),
      estimatedRulDays: rulDays,
      predictedFailureWindow: formatFailureWindow(rulDays),
      predictedFailureMode: mode,
      anomalySignals: signals,
      recommendedAction:
        risk >= 45
          ? `Pre-boost peer 2N CRAC in ${crac.hallLabel}, replace MERV-11 return filters, and inspect EC fan vibration and CHW valve stroke.`
          : 'Routine 90-day filter differential pressure & condensate pan inspection.',
      tier4ImpactNote: `Zero downtime: paired 2N CRAC on alternate chilled loop maintains ${crac.hallLabel} ASHRAE A1 SLA.`,
      projectedPueDelta: risk >= 45 ? 0.009 : 0.001,
    });
  }

  // 3. Critical UPS Modules (4 units, 2(N+1))
  for (const ups of site.bms.upsSystems) {
    const loadPct = (ups.loadKw / Math.max(1, ups.capacityKw)) * 100;
    const socDeficit = Math.max(0, 96 - ups.batterySocPct);

    let risk = 9 + Math.max(0, loadPct - 62) * 1.1 + socDeficit * 1.3;
    if (ups.mode === 'Fault') risk = 96;
    else if (ups.mode === 'On Battery') risk = Math.max(risk, 74);
    else if (ups.mode === 'Bypass') risk = Math.max(risk, 58);
    risk = round(clamp(risk, 6, 98), 0);

    const signals: string[] = [];
    if (ups.mode !== 'Online') signals.push(`Non-normal UPS mode: ${ups.mode}`);
    if (loadPct >= 68) signals.push(`High bus loading (${loadPct.toFixed(0)}%)`);
    if (ups.batterySocPct < 95) signals.push(`Battery string SoC ${ups.batterySocPct.toFixed(1)}%`);
    if (signals.length === 0) signals.push(`Online · Load ${loadPct.toFixed(0)}% · SoC ${ups.batterySocPct.toFixed(0)}%`);

    const rulDays = estimateRulDays(risk);
    risks.push({
      id: `pm-${siteId}-${ups.id}`,
      assetId: ups.id.toUpperCase(),
      assetName: `${ups.name} (${ups.role})`,
      category: 'ups',
      categoryLabel: 'Critical UPS',
      location: `West MEP · ${ups.feedBus}`,
      redundancyTopology: '2(N+1)',
      healthScore: 100 - risk,
      failureRiskPct: risk,
      severity: classifySeverity(risk),
      estimatedRulDays: rulDays,
      predictedFailureWindow: formatFailureWindow(rulDays),
      predictedFailureMode:
        ups.mode === 'Fault'
          ? 'IGBT inverter module trip or DC bus capacitor fault'
          : ups.batterySocPct < 92
          ? 'Battery string internal impedance degradation'
          : loadPct >= 68
          ? 'DC link capacitor thermal aging under elevated load'
          : 'Standard battery conductance & thermal scan cycle',
      anomalySignals: signals,
      recommendedAction:
        risk >= 45
          ? `Transfer ${ups.feedBus} maintenance bypass via 2(N+1) peer module, perform cell ohmic impedance sweep and thermographic busbar scan.`
          : 'Continue semi-annual battery conductance and capacitor ripple checks.',
      tier4ImpactNote: 'Zero downtime: 2(N+1) dual-bus UPS topology preserves 100% protected IT power during single-module isolation.',
      projectedPueDelta: risk >= 45 ? 0.004 : 0,
    });
  }

  // 4. Standby Generators (4 units, 2(N+1))
  for (const gen of site.bms.generators) {
    const fuelDeficit = Math.max(0, 92 - gen.fuelLevelPct);
    let risk = 8 + fuelDeficit * 1.4;
    if (gen.state === 'Running · On Load') risk += 28;
    else if (gen.state === 'Cranking') risk += 22;
    risk = round(clamp(risk, 6, 92), 0);

    const signals: string[] = [];
    if (gen.state !== 'Standby Ready') signals.push(`Active generator state: ${gen.state}`);
    if (gen.fuelLevelPct < 88) signals.push(`Diesel reserve ${gen.fuelLevelPct.toFixed(1)}% (${gen.fuelAutonomyHours}h)`);
    if (signals.length === 0) signals.push(`Standby Ready · Fuel ${gen.fuelLevelPct.toFixed(0)}% (${gen.fuelAutonomyHours}h)`);

    const rulDays = estimateRulDays(risk);
    risks.push({
      id: `pm-${siteId}-${gen.id}`,
      assetId: gen.id.toUpperCase(),
      assetName: `${gen.name} (${gen.role})`,
      category: 'generator',
      categoryLabel: 'Generator',
      location: `East Yard · ${gen.feedBus}`,
      redundancyTopology: '2(N+1)',
      healthScore: 100 - risk,
      failureRiskPct: risk,
      severity: classifySeverity(risk),
      estimatedRulDays: rulDays,
      predictedFailureWindow: formatFailureWindow(rulDays),
      predictedFailureMode:
        gen.fuelLevelPct < 82
          ? 'Fuel reserve below 72h Tier IV compliance floor'
          : gen.state === 'Running · On Load'
          ? 'Post-run lube oil, coolant & starter battery inspection needed'
          : 'Scheduled monthly load-bank exercise & fuel polishing',
      anomalySignals: signals,
      recommendedAction:
        risk >= 40
          ? 'Schedule bulk diesel top-off, sample fuel for microbial contamination, and inspect cranking battery CCA.'
          : 'Maintain monthly 30% load-bank exercise and jacket-water heater verification.',
      tier4ImpactNote: 'Zero downtime: 3 peer 2(N+1) generators cover full critical facility demand while 1 unit is serviced.',
      projectedPueDelta: 0,
    });
  }

  // 5. Cold Aisle SLA Sensors (4 Halls · 2 probes per row = 160 probes/site)
  for (const env of site.bms.envSensors) {
    const probeTempDelta = Math.abs(env.probeATempC - env.probeBTempC);
    const probeRhDelta = Math.abs(env.probeAHumidityPct - env.probeBHumidityPct);
    const tempMargin = Math.min(env.coldAisleTempC - env.slaTempMinC, env.slaTempMaxC - env.coldAisleTempC);
    const rhMargin = Math.min(env.humidityPct - env.slaHumidityMinPct, env.slaHumidityMaxPct - env.humidityPct);

    let risk = 9 + probeTempDelta * 18 + probeRhDelta * 4;
    if (env.tempSlaStatus === 'Breached' || env.humiditySlaStatus === 'Breached') risk = 89;
    else if (env.tempSlaStatus === 'Warning' || env.humiditySlaStatus === 'Warning') risk = Math.max(risk, 56);
    if (env.leakDetected) risk = Math.max(risk, 95);
    if (tempMargin < 2.2) risk += 18;
    if (rhMargin < 4.5) risk += 14;
    risk = round(clamp(risk, 6, 98), 0);

    const signals: string[] = [];
    if (env.leakDetected) signals.push('Sub-floor water leak rope alarm active');
    if (env.tempSlaStatus !== 'Compliant') signals.push(`Cold Aisle Temp ${env.coldAisleTempC.toFixed(1)}°C (${env.tempSlaStatus})`);
    if (env.humiditySlaStatus !== 'Compliant') signals.push(`Cold Aisle RH ${env.humidityPct.toFixed(1)}% (${env.humiditySlaStatus})`);
    if (probeTempDelta >= 0.45) signals.push(`Probe A/B drift ${probeTempDelta.toFixed(2)}°C across 40 row sensors`);
    if (signals.length === 0) signals.push(`${env.coldAisleTempC.toFixed(1)}°C · ${env.humidityPct.toFixed(1)}% RH · SLA ${env.slaCompliancePct.toFixed(2)}%`);

    const rulDays = estimateRulDays(risk);
    risks.push({
      id: `pm-${siteId}-${env.id}`,
      assetId: `${env.slaProbeAId} / ${env.slaProbeBId}`,
      assetName: `${env.hallLabel} Cold Aisle SLA Array (40 Probes)`,
      category: 'sla_sensor',
      categoryLabel: 'Cold Aisle SLA',
      location: `${env.hallLabel} · 20 Cold Aisles`,
      redundancyTopology: '2N Dual Probe',
      healthScore: 100 - risk,
      failureRiskPct: risk,
      severity: classifySeverity(risk),
      estimatedRulDays: rulDays,
      predictedFailureWindow: formatFailureWindow(rulDays),
      predictedFailureMode:
        env.leakDetected
          ? 'Chilled-water manifold drip / condensate drain backup'
          : env.tempSlaStatus !== 'Compliant' || env.humiditySlaStatus !== 'Compliant'
          ? 'Cold-aisle containment bypass & ASHRAE A1 excursion'
          : probeTempDelta >= 0.45
          ? 'Capacitive RH/temp probe calibration drift'
          : 'Annual NIST-traceable dual-probe calibration',
      anomalySignals: signals,
      recommendedAction:
        risk >= 45
          ? `Inspect cold-aisle blanking panels & containment doors in ${env.hallLabel}; recalibrate drifting row probes and verify CRAC setpoint balance.`
          : 'Continue automated 2N Probe A vs Probe B cross-check monitoring.',
      tier4ImpactNote: 'Zero downtime: 2N redundant Probe A/B polling keeps SLA telemetry uninterrupted during recalibration.',
      projectedPueDelta: risk >= 45 ? 0.005 : 0,
    });
  }

  // 6. Servers (surface top at-risk compute hosts + any faulted/warning/high-thermal nodes)
  const serverRisks: PredictiveAssetRisk[] = site.servers.map((srv) => {
    const tempRisk = Math.max(0, srv.tempC - 56) * 2.5;
    const fanRisk = Math.max(0, srv.fanRpm - 6200) / 110;
    const cpuMemRisk = Math.max(0, srv.cpu - 75) * 0.9 + Math.max(0, srv.memory - 80) * 1.05;
    const netRisk = srv.packetLoss * 18;
    const psuPenalty = srv.psuStatus !== 'Redundant (2/2)' ? 34 : 0;

    let risk = 8 + tempRisk + fanRisk + cpuMemRisk + netRisk + psuPenalty;
    if (srv.status === 'critical') risk = Math.max(risk, 86);
    else if (srv.status === 'warning') risk = Math.max(risk, 54);
    if (srv.activeFault) risk = Math.max(risk, 82);
    risk = round(clamp(risk, 5, 98), 0);

    const signals: string[] = [];
    if (srv.activeFault) signals.push(`Fault: ${srv.activeFault}`);
    if (srv.tempC >= 68) signals.push(`Exhaust ${srv.tempC.toFixed(1)}°C (Inlet ${srv.inletTempC.toFixed(1)}°C)`);
    if (srv.fanRpm >= 7800) signals.push(`Fan speed ${Math.round(srv.fanRpm)} RPM`);
    if (srv.memory >= 84) signals.push(`Memory saturation ${srv.memory.toFixed(1)}%`);
    if (srv.cpu >= 80) signals.push(`Sustained CPU ${srv.cpu.toFixed(1)}%`);
    if (srv.psuStatus !== 'Redundant (2/2)') signals.push(`PSU ${srv.psuStatus}`);
    if (signals.length === 0) signals.push(`Exhaust ${srv.tempC.toFixed(1)}°C · CPU ${srv.cpu.toFixed(0)}% · 2/2 PSU`);

    const rulDays = estimateRulDays(risk);
    const mode =
      srv.psuStatus !== 'Redundant (2/2)'
        ? 'Single-feed PSU failure — redundant rail lost'
        : srv.tempC >= 75
        ? 'GPU/CPU TIM degradation & heatsink thermal runaway'
        : srv.fanRpm >= 8200
        ? 'Hot-swap chassis fan bearing wearout'
        : srv.memory >= 86
        ? 'DIMM thermal throttling / ECC correctable error spike'
        : 'Nominal compute lifecycle wear';

    return {
      id: `pm-${siteId}-${srv.id}`,
      assetId: srv.hostname,
      assetName: `${srv.hostname} (${srv.role})`,
      category: 'server',
      categoryLabel: 'Compute Host',
      location: `${srv.rackId} · U${srv.uStart}`,
      redundancyTopology: srv.psuStatus === 'Redundant (2/2)' ? '2N Dual PSU' : 'Degraded PSU',
      healthScore: 100 - risk,
      failureRiskPct: risk,
      severity: classifySeverity(risk),
      estimatedRulDays: rulDays,
      predictedFailureWindow: formatFailureWindow(rulDays),
      predictedFailureMode: mode,
      anomalySignals: signals,
      recommendedAction:
        risk >= 50
          ? `Live-migrate workloads off ${srv.hostname}, schedule chassis thermal/TIM & fan module swap in rack ${srv.rackId}, and verify cold-aisle intake clearance.`
          : 'Keep under standard telemetry watch; no unscheduled intervention needed.',
      tier4ImpactNote:
        srv.psuStatus === 'Redundant (2/2)'
          ? 'Workload-safe: live-migrate VMs/containers to peer cluster nodes prior to chassis service.'
          : 'Immediate action: lost 2N PSU feed — hot-swap failed PSU module without powering down host.',
      projectedPueDelta: risk >= 65 ? 0.004 : 0,
    };
  });

  // Include all servers with risk >= 25 plus top 4 overall servers so table stays comprehensive yet sharp
  serverRisks.sort((a, b) => b.failureRiskPct - a.failureRiskPct);
  const selectedServers = serverRisks.filter((s, idx) => idx < 6 || s.failureRiskPct >= 25);
  risks.push(...selectedServers);

  // Sort globally by failure risk descending, then RUL ascending
  risks.sort((a, b) => b.failureRiskPct - a.failureRiskPct || a.estimatedRulDays - b.estimatedRulDays);

  const criticalCount = risks.filter((r) => r.severity === 'critical').length;
  const highCount = risks.filter((r) => r.severity === 'high').length;
  const moderateCount = risks.filter((r) => r.severity === 'moderate').length;
  const lowCount = risks.filter((r) => r.severity === 'low').length;

  const avgHealth =
    risks.length > 0
      ? round(risks.reduce((sum, r) => sum + r.healthScore, 0) / risks.length, 0)
      : 96;

  const nearest = risks[0];
  const projectedPueReduction = round(
    clamp(
      risks
        .filter((r) => r.severity === 'critical' || r.severity === 'high')
        .reduce((sum, r) => sum + r.projectedPueDelta, 0),
      0.006,
      0.065
    ),
    3
  );

  // Annual MWh saved = IT Load (MW) * PUE reduction * 8760 hours
  const itLoadMw = Math.max(1, facilitySummary.totalItLoadKw / 1000);
  const projectedAnnualMwhSaved = Math.round(itLoadMw * projectedPueReduction * 8760);

  return {
    risks,
    summary: {
      fleetHealthScore: avgHealth,
      totalMonitoredAssets: risks.length,
      criticalCount,
      highCount,
      moderateCount,
      lowCount,
      nearestRulDays: nearest ? nearest.estimatedRulDays : 180,
      nearestAssetName: nearest ? nearest.assetId : 'None',
      projectedPueReduction,
      projectedAnnualMwhSaved,
      tier4SafeWindowsReady: tier4.zeroSpofVerified,
    },
  };
}

export function createWorkOrderFromRisk(
  risk: PredictiveAssetRisk,
  siteId: SiteId,
  now: number = Date.now()
): MaintenanceWorkOrder {
  const priority: WorkOrderPriority =
    risk.severity === 'critical'
      ? 'P1 - Urgent'
      : risk.severity === 'high'
      ? 'P2 - High'
      : 'P3 - Preventive';

  return {
    id: `WO-${siteId.toUpperCase()}-${now.toString(36).slice(-4).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 4)
      .toUpperCase()}`,
    siteId,
    assetId: risk.assetId,
    assetName: risk.assetName,
    categoryLabel: risk.categoryLabel,
    priority,
    predictedFailureMode: risk.predictedFailureMode,
    recommendedAction: risk.recommendedAction,
    estimatedWindow: risk.predictedFailureWindow,
    tier4SafetyNote: risk.tier4ImpactNote,
    status: 'Scheduled',
    source: 'Predictive Engine',
    createdAt: now,
  };
}

export function createInitialWorkOrders(
  risks: PredictiveAssetRisk[],
  siteId: SiteId,
  now: number = Date.now()
): MaintenanceWorkOrder[] {
  const topCandidates = risks.filter((r) => r.severity === 'critical' || r.severity === 'high').slice(0, 3);
  return topCandidates.map((r, idx) => ({
    ...createWorkOrderFromRisk(r, siteId, now - (idx + 1) * 3600 * 1000),
    id: `WO-${siteId.toUpperCase()}-260${idx + 1}`,
    status: idx === 0 ? 'In Progress' : 'Scheduled',
  }));
}

/**
 * Packages concise, grounded live telemetry for the active site so server-side Gemini 4
 * reasons exclusively over actual Orise DCIM readings, Tier IV posture, and 2-year trends.
 */
export function buildSiteAiContext(params: {
  siteId: SiteId;
  sitesMap: Record<SiteId, SiteWorkspaceState>;
  racks: RackDefinition[];
  now?: number;
}) {
  const { siteId, sitesMap, racks } = params;
  const now = params.now ?? Date.now();
  const site = sitesMap[siteId];
  const meta = SITE_META_MAP[siteId];
  const facility = computeFacilitySummary(site.servers, racks, site.alerts);
  const tier4 = computeTier4RedundancySummary(site.bms, site.servers);
  const { risks, summary: pmSummary } = computePredictiveMaintenance(site, racks, siteId);

  const history2y = buildHistoricalTrendSeries({
    sitesMap,
    racks,
    siteScope: siteId,
    hallScope: 'all',
    horizon: '2y',
    now,
  });
  const loadTrend = computeHistoricalTrendSummary(history2y, 'itLoadMw');
  const pueTrend = computeHistoricalTrendSummary(history2y, 'pue');

  return {
    site: {
      code: meta.code,
      label: meta.label,
      location: meta.location,
      tierCertification: meta.tierLabel,
      racksCount: racks.length,
      hallsCount: 4,
      liveHostsCount: site.servers.length,
    },
    liveFacility: {
      itLoadMw: Number((facility.totalItLoadKw / 1000).toFixed(2)),
      facilityCapacityMw: Number((facility.totalFacilityCapacityKw / 1000).toFixed(2)),
      pue: Number(facility.pue.toFixed(3)),
      avgExhaustTempC: Number(
        (
          site.servers.reduce((sum, s) => sum + s.tempC, 0) / Math.max(1, site.servers.length)
        ).toFixed(1)
      ),
      peakExhaustTempC: Number(
        Math.max(0, ...site.servers.map((s) => s.tempC)).toFixed(1)
      ),
      activeCriticalAlerts: facility.activeCriticalCount,
      activeTotalAlerts: facility.activeAlertCount,
      utilityFeed: site.bms.utilityFeed,
      tier4Overall: tier4.overallLabel,
      zeroSpofVerified: tier4.zeroSpofVerified,
    },
    chillerPlant: {
      waterChillers: site.bms.chillers
        .filter((c) => c.chillerType === 'Water-Cooled')
        .map((c) => ({
          id: c.deviceId,
          mode: c.mode,
          loadPct: c.compressorLoadPct,
          cop: c.cop,
          chwSupplyC: c.chwSupplyTempC,
          coolingMw: Number((c.coolingOutputKw / 1000).toFixed(2)),
        })),
      airChillers: site.bms.chillers
        .filter((c) => c.chillerType === 'Air-Cooled')
        .map((c) => ({
          id: c.deviceId,
          mode: c.mode,
          loadPct: c.compressorLoadPct,
          cop: c.cop,
          chwSupplyC: c.chwSupplyTempC,
          coolingMw: Number((c.coolingOutputKw / 1000).toFixed(2)),
        })),
    },
    cracUnits: site.bms.cracUnits.map((c) => ({
      id: c.deviceId,
      hall: c.hallLabel,
      mode: c.mode,
      supplyTempC: c.supplyTempC,
      setpointC: c.setpointC,
      fanSpeedPct: c.fanSpeedPct,
      coolingMw: Number((c.coolingOutputKw / 1000).toFixed(2)),
    })),
    coldAisleSla: site.bms.envSensors.map((e) => ({
      hall: e.hallLabel,
      coldAisleTempC: e.coldAisleTempC,
      humidityPct: e.humidityPct,
      tempSlaStatus: e.tempSlaStatus,
      humiditySlaStatus: e.humiditySlaStatus,
      slaCompliancePct: e.slaCompliancePct,
      leakDetected: e.leakDetected,
      rowProbesCount: 40,
    })),
    activeAlerts: site.alerts
      .filter((a) => a.state !== 'resolved')
      .slice(0, 8)
      .map((a) => ({
        severity: a.severity,
        rule: a.ruleName,
        asset: a.serverHostname,
        location: a.rackId,
        reading: a.currentValue,
        threshold: `${a.operator} ${a.threshold}`,
      })),
    twoYearTrends: {
      span: loadTrend.yearSpanLabel,
      itLoadStartMw: loadTrend.startValue,
      itLoadCurrentMw: loadTrend.currentValue,
      itLoadYoyDeltaMw: loadTrend.yoyDelta,
      itLoadForecast3mMw: loadTrend.forecastNextQuarter,
      pueStart: pueTrend.startValue,
      pueCurrent: pueTrend.currentValue,
      pueYoyDelta: pueTrend.yoyDelta,
      avgMultiYearSlaPct: loadTrend.avgSlaCompliancePct,
    },
    predictiveMaintenanceSummary: pmSummary,
    topAtRiskAssets: risks.slice(0, 10).map((r) => ({
      assetId: r.assetId,
      assetName: r.assetName,
      category: r.categoryLabel,
      location: r.location,
      redundancy: r.redundancyTopology,
      failureRiskPct: r.failureRiskPct,
      estimatedRulDays: r.estimatedRulDays,
      predictedFailureMode: r.predictedFailureMode,
      anomalySignals: r.anomalySignals,
    })),
  };
}

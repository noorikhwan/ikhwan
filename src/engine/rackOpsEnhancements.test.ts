import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_BMS_WHATIF_SCENARIO,
  simulateBmsResilienceWhatIf,
} from './bmsWhatIfEngine';
import { buildCabinetSparkline24h } from './cabinetSparklineEngine';
import { createInitialAuditTrail } from './enterpriseOpsEngine';
import {
  buildExecutiveShiftHandoverReport,
  exportExecutiveHandoverMarkdown,
} from './executiveHandoverEngine';
import { computeGlobalFleetOverview } from './globalNocEngine';
import {
  applyRackPowerRebalance,
  computeBmsRackPowerStats,
  computeRackQuickFilterCounts,
  computeRackRebalancePlan,
  createDefaultHallPowerPolicies,
  matchesRackQuickFilter,
  sanitizeHallPowerPolicy,
} from './rackPowerEngine';
import { computeBmsSensorRackStats } from './rackHeatmapEngine';
import { INITIAL_RACKS } from './seedData';
import { createAllSitesInitialState } from './sites';
import {
  evaluateRackPowerCapacityAlerts,
  RACK_CRITICAL_POWER_RULE_ID,
} from './telemetryEngine';

test('Over-Capacity Rebalance Advisor resolves overloaded rack and auto-resolves Critical Power Capacity alert', () => {
  const now = 1_750_000_000_000;
  const sites = createAllSitesInitialState(now);
  const kl1 = sites.kl1;

  const initialStats = computeBmsRackPowerStats(INITIAL_RACKS, kl1.bms, kl1.servers);
  const overloadedRack = INITIAL_RACKS.find((r) => initialStats[r.id]?.exceedsCapacity);
  assert.ok(overloadedRack, 'KL1 should start with at least one over-capacity rack');

  const plan = computeRackRebalancePlan(overloadedRack.id, INITIAL_RACKS, initialStats, 3);
  assert.ok(plan, 'Should produce a rebalance plan');
  assert.ok(plan.candidates.length >= 1, 'Should find under-utilized same-hall target racks');
  assert.ok(plan.recommendedShiftKw >= 1.2, 'Shift kW should be positive');
  assert.equal(plan.candidates[0].hallId, overloadedRack.hallId, 'Target must be in same hall');

  const target = plan.candidates[0];
  const nextAdjustments = applyRackPowerRebalance(
    kl1.rackPowerAdjustmentsKw,
    overloadedRack.id,
    target.targetRackId,
    target.shiftKw
  );

  const postStats = computeBmsRackPowerStats(INITIAL_RACKS, kl1.bms, kl1.servers, {
    rackPowerAdjustmentsKw: nextAdjustments,
    hallPowerPolicies: kl1.hallPowerPolicies,
  });

  assert.equal(
    postStats[overloadedRack.id].exceedsCapacity,
    false,
    'Source rack should no longer exceed capacity after rebalance'
  );
  assert.equal(
    postStats[target.targetRackId].exceedsCapacity,
    false,
    'Target rack should stay safely within capacity after rebalance'
  );

  const evalPost = evaluateRackPowerCapacityAlerts({
    racks: INITIAL_RACKS,
    bms: kl1.bms,
    servers: kl1.servers,
    existingAlerts: kl1.alerts,
    channels: kl1.channels,
    now: now + 5_000,
    siteCode: 'KL1',
    rackPowerAdjustmentsKw: nextAdjustments,
    hallPowerPolicies: kl1.hallPowerPolicies,
  });

  const resolvedAlert = evalPost.alerts.find(
    (a) => a.ruleId === RACK_CRITICAL_POWER_RULE_ID && a.rackId === overloadedRack.id
  );
  assert.equal(resolvedAlert?.state, 'resolved', 'Critical Power Capacity alert must auto-resolve after rebalance');
});

test('Per-Hall Power Capacity Policies dynamically tighten or disable capacity alerts', () => {
  const now = 1_750_000_000_000;
  const sites = createAllSitesInitialState(now);
  const kl1 = sites.kl1;

  const basePolicies = createDefaultHallPowerPolicies();
  const baseStats = computeBmsRackPowerStats(INITIAL_RACKS, kl1.bms, kl1.servers, {
    hallPowerPolicies: basePolicies,
  });
  const baseHallBExceeded = INITIAL_RACKS.filter(
    (r) => r.hallId === 'hall-b' && baseStats[r.id].exceedsCapacity
  ).length;

  // Lower Hall B threshold to 80% -> should flag significantly more racks
  const strictPolicies = {
    ...basePolicies,
    'hall-b': sanitizeHallPowerPolicy('hall-b', { thresholdPct: 80, hysteresisKw: 0.2, enabled: true }),
  };
  const strictStats = computeBmsRackPowerStats(INITIAL_RACKS, kl1.bms, kl1.servers, {
    hallPowerPolicies: strictPolicies,
  });
  const strictHallBExceeded = INITIAL_RACKS.filter(
    (r) => r.hallId === 'hall-b' && strictStats[r.id].exceedsCapacity
  ).length;

  assert.ok(
    strictHallBExceeded > baseHallBExceeded,
    `Tightening Hall B to 80% should flag more racks (${strictHallBExceeded} > ${baseHallBExceeded})`
  );

  // Disabling Hall B policy should clear exceedsCapacity flags in Hall B
  const disabledPolicies = {
    ...basePolicies,
    'hall-b': sanitizeHallPowerPolicy('hall-b', { enabled: false }),
  };
  const disabledStats = computeBmsRackPowerStats(INITIAL_RACKS, kl1.bms, kl1.servers, {
    hallPowerPolicies: disabledPolicies,
  });
  const disabledHallBExceeded = INITIAL_RACKS.filter(
    (r) => r.hallId === 'hall-b' && disabledStats[r.id].exceedsCapacity
  ).length;
  assert.equal(disabledHallBExceeded, 0, 'Disabled hall policy should flag 0 racks');
});

test('Rack Map Quick Filter counts and matcher work accurately', () => {
  const now = 1_750_000_000_000;
  const kl1 = createAllSitesInitialState(now).kl1;
  const powerStats = computeBmsRackPowerStats(INITIAL_RACKS, kl1.bms, kl1.servers);
  const sensorStats = computeBmsSensorRackStats(INITIAL_RACKS, kl1.bms, kl1.servers);
  const hallBRacks = INITIAL_RACKS.filter((r) => r.hallId === 'hall-b');

  const counts = computeRackQuickFilterCounts(hallBRacks, powerStats, sensorStats);
  assert.equal(counts.all, 400);
  assert.ok(counts.over_cap >= 1, 'Hall B should have over_cap racks');
  assert.ok(counts.util_80 >= counts.over_cap, 'util_80 must be >= over_cap');

  const sampleOverCap = hallBRacks.find((r) => powerStats[r.id].exceedsCapacity)!;
  assert.equal(matchesRackQuickFilter('over_cap', powerStats[sampleOverCap.id], sensorStats[sampleOverCap.id]), true);
  assert.equal(matchesRackQuickFilter('headroom_low', powerStats[sampleOverCap.id], sensorStats[sampleOverCap.id]), false);
});

test('Per-Cabinet 24h Sparkline anchors strictly to live power & intake temperature', () => {
  const now = 1_750_000_000_000;
  const kl1 = createAllSitesInitialState(now).kl1;
  const powerStats = computeBmsRackPowerStats(INITIAL_RACKS, kl1.bms, kl1.servers);
  const sensorStats = computeBmsSensorRackStats(INITIAL_RACKS, kl1.bms, kl1.servers);

  const rack = INITIAL_RACKS.find((r) => r.id === 'B-R03-10')!;
  const series = buildCabinetSparkline24h(rack, powerStats[rack.id], sensorStats[rack.id], now);

  assert.equal(series.points.length, 25);
  assert.equal(series.points[24].hourLabel, 'Now');
  assert.equal(series.points[24].powerKw, powerStats[rack.id].powerKw);
  assert.equal(series.points[24].intakeTempC, sensorStats[rack.id].sensorTempC);
  assert.ok(series.powerMaxKw >= series.powerMinKw);
});

test('BMS 2N Failover & N+1 Cooling What-If Simulator projects load, autonomy, and SLA impacts without mutating state', () => {
  const now = 1_750_000_000_000;
  const kl1 = createAllSitesInitialState(now).kl1;
  const powerStats = computeBmsRackPowerStats(INITIAL_RACKS, kl1.bms, kl1.servers);

  const baseline = simulateBmsResilienceWhatIf(
    kl1.bms,
    INITIAL_RACKS,
    powerStats,
    DEFAULT_BMS_WHATIF_SCENARIO
  );
  assert.equal(baseline.verdict, 'Resilient — Tier IV Intact');
  assert.equal(baseline.projectedIntakeDeltaC, 0);

  const busAFail = simulateBmsResilienceWhatIf(kl1.bms, INITIAL_RACKS, powerStats, {
    ...DEFAULT_BMS_WHATIF_SCENARIO,
    busAFailed: true,
    loadSurgePct: 30,
  });
  assert.ok(busAFail.survivingBusUtilPct > baseline.survivingBusUtilPct);
  assert.ok(busAFail.newlyOverloadedRacks > 0);
  assert.notEqual(busAFail.verdict, 'Resilient — Tier IV Intact');

  const dualBusFail = simulateBmsResilienceWhatIf(kl1.bms, INITIAL_RACKS, powerStats, {
    ...DEFAULT_BMS_WHATIF_SCENARIO,
    busAFailed: true,
    busBFailed: true,
  });
  assert.equal(dualBusFail.verdict, 'Critical — SLA Breach Risk');
  assert.equal(dualBusFail.survivingUpsCapacityMw, 0);
});

test('Global NOC Overview rolls up per-site over-capacity racks and thermal excursions', () => {
  const now = 1_750_000_000_000;
  const sites = createAllSitesInitialState(now);
  const overview = computeGlobalFleetOverview(sites, INITIAL_RACKS);

  assert.equal(overview.sites.length, 3);
  const sumExceeded = overview.sites.reduce((s, site) => s + site.capacityExceededCount, 0);
  assert.equal(overview.totalCapacityExceededRacks, sumExceeded);
  assert.ok(overview.totalCapacityExceededRacks >= 1, 'Fleet should reflect seeded over-capacity racks');
  for (const s of overview.sites) {
    assert.ok(s.peakRackUtilPct > 0);
    assert.ok(s.peakRackId !== null);
  }
});

test('Executive Shift Handover Report builds structured summary and clean Markdown export', () => {
  const now = 1_750_000_000_000;
  const sites = createAllSitesInitialState(now);
  const report = buildExecutiveShiftHandoverReport({
    siteId: 'kl1',
    site: sites.kl1,
    racks: INITIAL_RACKS,
    operatorName: 'Elena Vance',
    shiftTeam: 'Alpha Team',
    shiftSlot: 'Day Watch',
    auditTrail: createInitialAuditTrail(now),
    handoverLog: [],
    cloudSyncedHandoversCount: 2,
    executiveNotes: 'Monitor Hall B liquid cooling CDU loop and complete B-R03-10 rebalance.',
    now,
  });

  assert.equal(report.siteCode, 'KL1');
  assert.ok(report.overCapCount >= 1);
  const md = exportExecutiveHandoverMarkdown(report);
  assert.ok(md.includes('# Orise DCIM — Executive Shift Handover Briefing (KL1)'));
  assert.ok(md.includes('Monitor Hall B liquid cooling CDU loop'));
});

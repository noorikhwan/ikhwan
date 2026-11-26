import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_CHANNELS, createInitialServers } from './seedData';
import { applyFaultToServer } from './telemetryEngine';
import {
  COLD_AISLE_SLA_LIMITS,
  computeDewPointC,
  computeTier4RedundancySummary,
  createInitialBmsState,
  refillDieselTank,
  restoreUtilityPower,
  setCracMode,
  setCracSetpoint,
  stepBmsAndCoupling,
  toggleChillerFault,
  toggleChwPumpSetMode,
  toggleColdAisleSlaExcursion,
  toggleDieselTankPump,
  toggleGatewayConnection,
  toggleLeakSensorFault,
  toggleUpsFault,
  triggerUtilityOutageDrill,
} from './bmsEngine';

test('setCracSetpoint clamps target temperature and records BACnet write command', () => {
  const now = 1_700_000_000_000;
  const bms = createInitialBmsState(now);
  const updated = setCracSetpoint(bms, 'crac-a1', 18.0, 'Operator', now + 1000);
  const cracA1 = updated.cracUnits.find((c) => c.id === 'crac-a1');

  assert.equal(cracA1?.setpointC, 18.0);
  assert.equal(updated.commandLog[0].protocol, 'BACnet/IP');
  assert.equal(updated.commandLog[0].result, 'Applied');

  // Verify clamping below 16°C
  const clamped = setCracSetpoint(updated, 'crac-a1', 10.0, 'Operator', now + 2000);
  assert.equal(clamped.cracUnits.find((c) => c.id === 'crac-a1')?.setpointC, 16.0);
});

test('Tier IV 2N gateway failover keeps BACnet writes active when Primary fails and blocks only when both Primary & Standby fail', () => {
  const now = 1_700_000_000_000;
  let bms = createInitialBmsState(now);
  assert.equal(bms.gateways.length, 6);

  // Take Primary BACnet offline -> Standby automatically covers writes
  bms = toggleGatewayConnection(bms, 'gw-bacnet-a', now + 500);
  const viaStandby = setCracSetpoint(bms, 'crac-a1', 19.0, 'Operator', now + 1000);
  assert.equal(viaStandby.cracUnits.find((c) => c.id === 'crac-a1')?.setpointC, 19.0);
  assert.equal(viaStandby.commandLog[0].result, 'Applied');

  // Take Standby BACnet offline too -> writes now cleanly blocked
  const bothDown = toggleGatewayConnection(viaStandby, 'gw-bacnet-b', now + 1500);
  const blocked = setCracSetpoint(bothDown, 'crac-a1', 17.5, 'Operator', now + 2000);
  assert.equal(blocked.cracUnits.find((c) => c.id === 'crac-a1')?.setpointC, 19.0);
  assert.equal(blocked.commandLog[0].result, 'Blocked (Gateway Offline)');
});

test('Tier IV 2N CRAC fault automatically boosts peer Loop B CRAC and preserves hall cooling', () => {
  const now = 1_700_000_000_000;
  const bms = createInitialBmsState(now);
  const servers = createInitialServers(now);
  assert.equal(bms.cracUnits.length, 8);

  // Fault Hall A Path A CRAC -> Path B peer (crac-a2) immediately auto-boosts
  const failed = setCracMode(bms, 'crac-a1', 'Fault', 'Operator', now + 500);
  const cracA2 = failed.cracUnits.find((c) => c.id === 'crac-a2');
  const envA = failed.envSensors.find((e) => e.hallId === 'hall-a');
  assert.equal(cracA2?.mode, 'Boost');
  assert.equal(envA?.chilledLoopStatus, 'Loop B Failover');

  const summary = computeTier4RedundancySummary(failed, servers);
  assert.equal(summary.overallState, 'failover-active');
  assert.equal(summary.zeroSpofVerified, true);
});

test('Tier IV 2(N+1) UPS fault redistributes 100% of load to healthy peers with zero drop', () => {
  const now = 1_700_000_000_000;
  const bms = createInitialBmsState(now);
  const servers = createInitialServers(now);
  assert.equal(bms.upsSystems.length, 4);

  const beforeLoad = bms.upsSystems.reduce((sum, u) => sum + u.loadKw, 0);
  const faulted = toggleUpsFault(bms, 'ups-a1', now + 1000);
  const upsA1 = faulted.upsSystems.find((u) => u.id === 'ups-a1');
  const afterLoad = faulted.upsSystems.reduce((sum, u) => sum + u.loadKw, 0);

  assert.equal(upsA1?.mode, 'Fault');
  assert.equal(upsA1?.loadKw, 0);
  assert.ok(Math.abs(afterLoad - beforeLoad) < 2, 'Total UPS load conserved across 3 healthy peers');

  const summary = computeTier4RedundancySummary(faulted, servers);
  const upsSub = summary.subsystems.find((s) => s.id === 'ups');
  assert.equal(upsSub?.state, 'failover-active');
  assert.equal(upsSub?.activeCount, 3);
});

test('closed-loop cooling auto-boosts hall CRAC pair when server exhaust reaches critical threshold', () => {
  const now = 1_700_000_000_000;
  const bms = createInitialBmsState(now);
  const servers = createInitialServers(now).map((s) =>
    s.id === 'srv-a01-01' ? applyFaultToServer(s, 'thermal_spike') : s
  );

  const res = stepBmsAndCoupling({
    bms,
    servers,
    alerts: [],
    channels: INITIAL_CHANNELS,
    tickCount: 1,
    now: now + 3000,
  });

  const cracA1 = res.bms.cracUnits.find((c) => c.id === 'crac-a1');
  const cracA2 = res.bms.cracUnits.find((c) => c.id === 'crac-a2');
  assert.equal(cracA1?.mode, 'Boost');
  assert.equal(cracA2?.mode, 'Boost');
  assert.equal(res.bms.commandLog[0].source, 'Closed-Loop Automation');
});

test('utility outage drill transfers 2(N+1) UPS to battery, cranks Path A & Path B generators, and restores cleanly', () => {
  const now = 1_700_000_000_000;
  let bms = createInitialBmsState(now);
  const servers = createInitialServers(now);
  assert.equal(bms.generators.length, 8);

  bms = triggerUtilityOutageDrill(bms, now + 1000);
  assert.equal(bms.utilityFeed, 'Utility Outage · UPS Battery');
  assert.equal(bms.generators.filter((g) => g.state === 'Cranking').length, 6);

  let res = stepBmsAndCoupling({
    bms,
    servers,
    alerts: [],
    channels: INITIAL_CHANNELS,
    tickCount: 1,
    now: now + 4000,
  });

  assert.ok(res.newAlerts.some((a) => a.ruleId === 'bms-utility-outage' && a.severity === 'critical'));
  assert.ok(res.newDispatches.some((d) => d.channelId === 'ch-pagerduty'));

  res = stepBmsAndCoupling({
    bms: res.bms,
    servers: res.adjustedServers,
    alerts: res.alerts,
    channels: res.updatedChannels,
    tickCount: 2,
    now: now + 7000,
  });
  res = stepBmsAndCoupling({
    bms: res.bms,
    servers: res.adjustedServers,
    alerts: res.alerts,
    channels: res.updatedChannels,
    tickCount: 3,
    now: now + 10000,
  });
  assert.equal(res.bms.utilityFeed, 'Generator Backup');
  assert.equal(res.bms.generators.filter((g) => g.state === 'Running · On Load').length, 6);

  const restoredBms = restoreUtilityPower(res.bms, now + 13000);
  const finalRes = stepBmsAndCoupling({
    bms: restoredBms,
    servers: res.adjustedServers,
    alerts: res.alerts,
    channels: res.updatedChannels,
    tickCount: 4,
    now: now + 16000,
  });

  assert.equal(finalRes.bms.utilityFeed, 'Utility Normal');
  const outageAlert = finalRes.alerts.find((a) => a.ruleId === 'bms-utility-outage');
  assert.equal(outageAlert?.state, 'resolved');
});

test('cold aisle SLA temperature & humidity 2N sensors evaluate ASHRAE envelope and fire/resolve SLA breach alerts', () => {
  const now = 1_700_000_000_000;
  let bms = createInitialBmsState(now);
  const servers = createInitialServers(now);

  // Verify initial calibrated probes are within 18-27°C and 40-60% RH
  for (const env of bms.envSensors) {
    assert.equal(env.slaTempMinC, COLD_AISLE_SLA_LIMITS.tempMinC);
    assert.equal(env.slaTempMaxC, COLD_AISLE_SLA_LIMITS.tempMaxC);
    assert.equal(env.slaHumidityMinPct, COLD_AISLE_SLA_LIMITS.humidityMinPct);
    assert.equal(env.slaHumidityMaxPct, COLD_AISLE_SLA_LIMITS.humidityMaxPct);
    assert.equal(env.tempSlaStatus, 'Compliant');
    assert.equal(env.humiditySlaStatus, 'Compliant');
    assert.ok(env.dewPointC < env.coldAisleTempC);
  }
  assert.ok(computeDewPointC(21.0, 46.0) > 8 && computeDewPointC(21.0, 46.0) < 11);

  // Trigger Cold Aisle SLA breach in Hall D
  bms = toggleColdAisleSlaExcursion(bms, 'hall-d', now + 500);
  const res = stepBmsAndCoupling({
    bms,
    servers,
    alerts: [],
    channels: INITIAL_CHANNELS,
    tickCount: 1,
    now: now + 1000,
  });
  assert.ok(res.newAlerts.some((a) => a.ruleId === 'bms-sla-temp-hall-d' && a.severity === 'critical'));
  assert.ok(res.newAlerts.some((a) => a.ruleId === 'bms-sla-hum-hall-d' && a.severity === 'warning'));

  // Clear SLA breach and verify alerts auto-resolve
  const clearedBms = toggleColdAisleSlaExcursion(res.bms, 'hall-d', now + 2000);
  const clearedRes = stepBmsAndCoupling({
    bms: clearedBms,
    servers: res.adjustedServers,
    alerts: res.alerts,
    channels: res.updatedChannels,
    tickCount: 2,
    now: now + 3000,
  });
  assert.equal(
    clearedRes.alerts.find((a) => a.ruleId === 'bms-sla-temp-hall-d')?.state,
    'resolved'
  );
  assert.equal(
    clearedRes.alerts.find((a) => a.ruleId === 'bms-sla-hum-hall-d')?.state,
    'resolved'
  );
});

test('water leak sensor fault and CRAC fault both raise critical BMS alerts', () => {
  const now = 1_700_000_000_000;
  let bms = createInitialBmsState(now);
  bms = toggleLeakSensorFault(bms, 'hall-c', now + 500);
  bms = setCracMode(bms, 'crac-c1', 'Fault', 'Operator', now + 600);

  const res = stepBmsAndCoupling({
    bms,
    servers: createInitialServers(now),
    alerts: [],
    channels: INITIAL_CHANNELS,
    tickCount: 1,
    now: now + 1000,
  });

  assert.ok(res.newAlerts.some((a) => a.ruleId === 'bms-leak-hall-c'));
  assert.ok(res.newAlerts.some((a) => a.ruleId === 'bms-crac-fault-crac-c1'));
});

test('chiller plant runs 2 water-cooled chillers (2N) + 14 air-cooled chillers (2(N+1)) with automatic N+1 failover', () => {
  const now = 1_700_000_000_000;
  let bms = createInitialBmsState(now);
  const servers = createInitialServers(now);

  const water = bms.chillers.filter((c) => c.chillerType === 'Water-Cooled');
  const air = bms.chillers.filter((c) => c.chillerType === 'Air-Cooled');
  assert.equal(water.length, 2);
  assert.equal(air.length, 14);
  assert.equal(air.filter((c) => c.mode === 'Standby').length, 4);

  // Fault Water Chiller A (chw-01) -> peer CHW-02 boosts & Loop A Redundant (N+1) air chiller auto-starts
  bms = toggleChillerFault(bms, 'chw-01', now + 500);
  const chw02 = bms.chillers.find((c) => c.id === 'chw-02');
  const loopAStandbyRunning = bms.chillers.filter(
    (c) => c.chillerType === 'Air-Cooled' && c.chilledLoop === 'Loop A' && c.role === 'Redundant (N+1)' && c.mode !== 'Standby'
  );
  assert.equal(bms.chillers.find((c) => c.id === 'chw-01')?.mode, 'Fault');
  assert.equal(chw02?.mode, 'Boost');
  assert.ok(loopAStandbyRunning.length >= 1);
  assert.ok(loopAStandbyRunning.every((c) => c.coolingOutputKw > 0));

  const tier4AfterWaterFault = computeTier4RedundancySummary(bms, servers);
  assert.equal(tier4AfterWaterFault.zeroSpofVerified, true);
  assert.equal(
    tier4AfterWaterFault.subsystems.find((s) => s.id === 'water-chillers')?.state,
    'failover-active'
  );

  // Restore CHW-01 -> Loop A Redundant (N+1) standby air chillers return to Standby
  bms = toggleChillerFault(bms, 'chw-01', now + 1500);
  assert.equal(bms.chillers.find((c) => c.id === 'chw-01')?.mode, 'Running');
  assert.equal(
    bms.chillers.filter((c) => c.chillerType === 'Air-Cooled' && c.mode === 'Standby').length,
    4
  );

  // Fault Air Chiller B1 -> Loop B Redundant (N+1) standby air chiller wakes up
  bms = toggleChillerFault(bms, 'cha-b1', now + 2000);
  const loopBStandbyRunning = bms.chillers.filter(
    (c) => c.chillerType === 'Air-Cooled' && c.chilledLoop === 'Loop B' && c.role === 'Redundant (N+1)' && c.mode === 'Running'
  );
  assert.ok(loopBStandbyRunning.length >= 1);
  assert.ok(loopBStandbyRunning[0].coolingOutputKw > 0);
});

test('rooftop CHW buffer tanks (2x180kL) and complete 3-pump VFD sets cycle modes and preserve Tier IV redundancy', () => {
  const now = 1_700_000_000_000;
  let bms = createInitialBmsState(now);
  const servers = createInitialServers(now);

  assert.equal(bms.chwTankPumpSets.length, 2);
  assert.equal(bms.chwTankPumpSets[0].tankCapacityLiters, 180000);
  assert.equal(bms.chwTankPumpSets[1].tankCapacityLiters, 180000);
  assert.equal(bms.chwTankPumpSets[0].totalPumps, 3);

  // Cycle chw-tank-a: Auto -> Boost -> Fault -> Auto
  bms = toggleChwPumpSetMode(bms, 'chw-tank-a', now + 500);
  assert.equal(bms.chwTankPumpSets.find((p) => p.id === 'chw-tank-a')?.mode, 'Boost');
  assert.equal(bms.chwTankPumpSets.find((p) => p.id === 'chw-tank-a')?.activePumps, 3);

  bms = toggleChwPumpSetMode(bms, 'chw-tank-a', now + 1000);
  assert.equal(bms.chwTankPumpSets.find((p) => p.id === 'chw-tank-a')?.mode, 'Fault');
  assert.equal(bms.chwTankPumpSets.find((p) => p.id === 'chw-tank-a')?.activePumps, 0);

  const summary = computeTier4RedundancySummary(bms, servers);
  const pumpSub = summary.subsystems.find((s) => s.id === 'chw-tank-pumps');
  assert.equal(pumpSub?.state, 'failover-active');

  bms = toggleChwPumpSetMode(bms, 'chw-tank-a', now + 1500);
  assert.equal(bms.chwTankPumpSets.find((p) => p.id === 'chw-tank-a')?.mode, 'Auto');
});

test('Data Hall B runs Direct-to-Chip Liquid Cooling CDUs (CDU-B1 / CDU-B2) while Halls A/C/D run Air CRACs', () => {
  const now = 1_700_000_000_000;
  const bms = createInitialBmsState(now);

  const hallBUnits = bms.cracUnits.filter((c) => c.hallId === 'hall-b');
  const otherHallUnits = bms.cracUnits.filter((c) => c.hallId !== 'hall-b');

  assert.equal(hallBUnits.length, 2);
  assert.equal(otherHallUnits.length, 6);
  for (const cdu of hallBUnits) {
    assert.equal(cdu.coolingType, 'Liquid CDU');
    assert.ok(cdu.name.startsWith('CDU-B'));
    assert.ok((cdu.coolantFlowLpm ?? 0) > 1000);
    assert.ok((cdu.coolantSupplyTempC ?? 0) > 15 && (cdu.coolantReturnTempC ?? 0) > (cdu.coolantSupplyTempC ?? 0));
    assert.ok((cdu.deltaPBar ?? 0) > 1.0);
    assert.equal(cdu.glycolMixPct, 25);
  }
  assert.ok(otherHallUnits.every((u) => u.coolingType === 'CRAC'));
});

test('8 Basement Level B1 diesel tanks (400,000 L) feed Path A/B generators, drain under backup, and support pump toggle & refill', () => {
  const now = 1_700_000_000_000;
  let bms = createInitialBmsState(now);
  const servers = createInitialServers(now);

  assert.equal(bms.dieselTanks.length, 8);
  const totalCap = bms.dieselTanks.reduce((sum, t) => sum + t.capacityLiters, 0);
  assert.equal(totalCap, 400000);
  assert.equal(bms.dieselTanks.filter((t) => t.redundancyPath === 'Path A').length, 4);
  assert.equal(bms.dieselTanks.filter((t) => t.redundancyPath === 'Path B').length, 4);

  // Trigger outage and advance 3 ticks into Generator Backup
  bms = triggerUtilityOutageDrill(bms, now + 500);
  const initialLiters = bms.dieselTanks[0].currentLiters;
  let stepRes = stepBmsAndCoupling({
    bms,
    servers,
    alerts: [],
    channels: INITIAL_CHANNELS,
    tickCount: 1,
    now: now + 3500,
  });
  for (let i = 2; i <= 4; i++) {
    stepRes = stepBmsAndCoupling({
      bms: stepRes.bms,
      servers: stepRes.adjustedServers,
      alerts: stepRes.alerts,
      channels: stepRes.updatedChannels,
      tickCount: i,
      now: now + i * 3500,
    });
  }
  assert.equal(stepRes.bms.utilityFeed, 'Generator Backup');
  assert.ok(
    stepRes.bms.dieselTanks[0].currentLiters < initialLiters,
    'Basement diesel tank should drain while feeding generators under Generator Backup'
  );
  assert.equal(stepRes.bms.dieselTanks[0].transferPumpMode, 'Transferring');

  // Test Refill & Pump Cycle
  const refilled = refillDieselTank(stepRes.bms, 'diesel-a1', now + 20000);
  assert.equal(refilled.dieselTanks.find((t) => t.id === 'diesel-a1')?.levelPct, 98.5);

  const cycled = toggleDieselTankPump(refilled, 'diesel-a2', now + 21000);
  assert.notEqual(
    cycled.dieselTanks.find((t) => t.id === 'diesel-a2')?.transferPumpMode,
    refilled.dieselTanks.find((t) => t.id === 'diesel-a2')?.transferPumpMode
  );
});

test('2N Electrical distribution chain HV -> MSB -> OPSWB serves both Electrical (IT) and Mechanical plant loads', () => {
  const now = 1_700_000_000_000;
  let bms = createInitialBmsState(now);
  const servers = createInitialServers(now);

  assert.equal(bms.electricalSwitchgear.length, 6);
  for (const node of bms.electricalSwitchgear) {
    assert.ok(node.electricalServeKw > 0, `${node.id} must serve Electrical IT load`);
    assert.ok(node.mechanicalServeKw > 0, `${node.id} must serve Mechanical plant load`);
    assert.ok(
      Math.abs(node.activeLoadKw - (node.electricalServeKw + node.mechanicalServeKw)) < 5,
      `${node.id} activeLoadKw must equal Electrical + Mechanical serve`
    );
    assert.equal(node.breakerState, 'Closed');
  }

  // During utility outage -> HV breaker opens while MSB/OPSWB continue feeding loads
  bms = triggerUtilityOutageDrill(bms, now + 500);
  const res = stepBmsAndCoupling({
    bms,
    servers,
    alerts: [],
    channels: INITIAL_CHANNELS,
    tickCount: 1,
    now: now + 3500,
  });
  const hvA = res.bms.electricalSwitchgear.find((n) => n.id === 'hv-a');
  const opswbA = res.bms.electricalSwitchgear.find((n) => n.id === 'opswb-a');
  assert.equal(hvA?.breakerState, 'Open');
  assert.ok((opswbA?.electricalServeKw ?? 0) > 0);
  assert.ok((opswbA?.mechanicalServeKw ?? 0) > 0);
});


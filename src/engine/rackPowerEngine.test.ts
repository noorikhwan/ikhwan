import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialBmsState } from './bmsEngine';
import { INITIAL_RACKS, createInitialServers } from './seedData';
import {
  computeBmsRackPowerStats,
  computeHallBmsPowerSummary,
  interpolatePowerColor,
  resolvePowerHeatmapScaleBounds,
} from './rackPowerEngine';

test('computeBmsRackPowerStats computes live kW draw, 2N feed split, and apparent kVA for all 1,600 racks', () => {
  const now = 1_700_000_000_000;
  const servers = createInitialServers(now);
  const bms = createInitialBmsState(now);
  const powerMap = computeBmsRackPowerStats(INITIAL_RACKS, bms, servers);

  assert.equal(Object.keys(powerMap).length, INITIAL_RACKS.length);

  // Live host rack B-R01-01 must reflect its mounted GPU servers + rPDU overhead
  const liveRack = powerMap['B-R01-01'];
  assert.ok(liveRack);
  assert.equal(liveRack.hasLiveServers, true);
  assert.ok(liveRack.powerKw > 6.5 && liveRack.powerKw < 9.0);
  assert.ok(liveRack.apparentKva >= liveRack.powerKw);
  assert.equal(Number((liveRack.feedAKw + liveRack.feedBKw).toFixed(2)), liveRack.powerKw);
  assert.equal(liveRack.feedStatus, '2N Balanced');

  // Standard rack in Hall B should couple to live BMS UPS load
  const stdRack = powerMap['B-R05-10'];
  assert.ok(stdRack);
  assert.equal(stdRack.hasLiveServers, false);
  assert.ok(stdRack.powerKw > 8 && stdRack.powerKw <= stdRack.powerCapacityKw * 1.05);
});

test('computeBmsRackPowerStats reacts dynamically to BMS UPS load surge and single-bus failover', () => {
  const now = 1_700_000_000_000;
  const servers = createInitialServers(now);
  const baseBms = createInitialBmsState(now);
  const baseStats = computeBmsRackPowerStats(INITIAL_RACKS, baseBms, servers);

  // Simulate a +20% BMS UPS load increase
  const surgedBms = {
    ...baseBms,
    upsSystems: baseBms.upsSystems.map((u) => ({ ...u, loadKw: u.loadKw * 1.2 })),
  };
  const surgedStats = computeBmsRackPowerStats(INITIAL_RACKS, surgedBms, servers);
  assert.ok(
    surgedStats['B-R05-10'].powerKw > baseStats['B-R05-10'].powerKw,
    'Expected cabinet kW draw to rise when BMS UPS load increases'
  );

  // Simulate Bus B UPS fault failover (Bus A carries 100% load)
  const busBFaultBms = {
    ...baseBms,
    upsSystems: baseBms.upsSystems.map((u) =>
      u.feedBus === 'Bus B' ? { ...u, mode: 'Fault' as const, loadKw: 0 } : u
    ),
  };
  const failoverStats = computeBmsRackPowerStats(INITIAL_RACKS, busBFaultBms, servers);
  const r = failoverStats['B-R05-10'];
  assert.equal(r.feedStatus, 'Single-Feed Failover');
  assert.equal(r.feedBKw, 0);
  assert.equal(r.feedAKw, r.powerKw);
});

test('computeHallBmsPowerSummary aggregates hall kW totals, peak cabinet, and legend scale bounds', () => {
  const now = 1_700_000_000_000;
  const servers = createInitialServers(now);
  const bms = createInitialBmsState(now);
  const powerMap = computeBmsRackPowerStats(INITIAL_RACKS, bms, servers);

  const hallB = computeHallBmsPowerSummary('hall-b', INITIAL_RACKS, powerMap, bms);
  assert.equal(hallB.hallId, 'hall-b');
  assert.ok(hallB.totalKw > 4000 && hallB.totalKw < 8800);
  assert.equal(hallB.totalCapacityKw, 8800);
  assert.ok(hallB.peakRackId?.startsWith('B-'));
  assert.ok(hallB.avgRackKw >= hallB.minRackKw && hallB.avgRackKw <= hallB.maxRackKw);

  const fixedBounds = resolvePowerHeatmapScaleBounds('fixed', hallB, 22);
  assert.equal(fixedBounds.minC, 0);
  assert.equal(fixedBounds.maxC, 22);
  assert.equal(fixedBounds.ticks.length, 4);

  const dynamicBounds = resolvePowerHeatmapScaleBounds('dynamic', hallB, 22);
  assert.ok(dynamicBounds.maxC - dynamicBounds.minC >= 3);

  const lowColor = interpolatePowerColor(1, 0, 22);
  const highColor = interpolatePowerColor(21, 0, 22);
  assert.ok(highColor.normalized > lowColor.normalized);
  assert.ok(lowColor.hex.startsWith('#') && highColor.hex.startsWith('#'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialBmsState } from './bmsEngine';
import { computeBmsRackPowerStats } from './rackPowerEngine';
import {
  buildHallUtilizationTrends24h,
  classifyGrowthPattern,
  computeLinearGrowthSlope,
} from './rackUtilizationTrendEngine';
import { createInitialServers, INITIAL_RACKS } from './seedData';

const FIXED_NOW_MS = Date.UTC(2026, 10, 22, 20, 0, 0);

test('computeLinearGrowthSlope computes exact OLS slope and intercept', () => {
  const linear = [50, 51, 52, 53, 54];
  const res = computeLinearGrowthSlope(linear);
  assert.ok(Math.abs(res.slope - 1) < 1e-6);
  assert.ok(Math.abs(res.intercept - 50) < 1e-6);

  const flat = [60, 60, 60, 60];
  const flatRes = computeLinearGrowthSlope(flat);
  assert.equal(flatRes.slope, 0);
  assert.equal(flatRes.intercept, 60);

  assert.equal(classifyGrowthPattern(6.2, 0.25), 'Accelerating Growth');
  assert.equal(classifyGrowthPattern(2.5, 0.1), 'Steady Growth');
  assert.equal(classifyGrowthPattern(0.4, 0.01), 'Diurnal Stable');
  assert.equal(classifyGrowthPattern(-2.2, -0.09), 'Load Easing');
});

test('buildHallUtilizationTrends24h builds 25 hourly points for all 4 halls anchored to live BMS power', () => {
  const bms = createInitialBmsState(FIXED_NOW_MS);
  const servers = createInitialServers(FIXED_NOW_MS);
  const powerStats = computeBmsRackPowerStats(INITIAL_RACKS, bms, servers);

  const summary = buildHallUtilizationTrends24h(
    INITIAL_RACKS,
    powerStats,
    servers,
    'hall-b',
    FIXED_NOW_MS
  );

  assert.equal(summary.allHalls.length, 4);
  assert.equal(summary.activeHall.hallId, 'hall-b');

  for (const hall of summary.allHalls) {
    assert.equal(hall.points.length, 25);
    assert.equal(hall.points[0].hourLabel, '-24h');
    assert.equal(hall.points[24].hourLabel, 'Now');
    assert.equal(hall.points[0].deltaFromStartPct, 0);
    assert.equal(hall.analytics.currentPowerUtilPct, hall.points[24].powerUtilPct);
    assert.ok(hall.analytics.peakPowerUtilPct >= hall.analytics.minPowerUtilPct);
    assert.ok(hall.analytics.capacityMw > 0);
    assert.ok(hall.analytics.currentPowerMw > 0);
  }

  // Hall B (AI & GPU Fabric) has the strongest 24h growth ramp by design
  assert.equal(summary.fastestGrowingHallId, 'hall-b');
  assert.ok(summary.activeHall.analytics.delta24hPct > 0);
  assert.ok(summary.activeHall.analytics.growthSlopePctPerHour > 0);
  assert.ok(summary.activeHall.analytics.daysToThreshold85 !== null);
});

test('buildHallUtilizationTrends24h reflects live BMS load surge immediately on terminal point', () => {
  const baseBms = createInitialBmsState(FIXED_NOW_MS);
  const servers = createInitialServers(FIXED_NOW_MS);
  const basePower = computeBmsRackPowerStats(INITIAL_RACKS, baseBms, servers);
  const baseSummary = buildHallUtilizationTrends24h(
    INITIAL_RACKS,
    basePower,
    servers,
    'hall-b',
    FIXED_NOW_MS
  );

  // Surge UPS loads by +18%
  const surgedBms = {
    ...baseBms,
    upsSystems: baseBms.upsSystems.map((u) => ({
      ...u,
      loadKw: Math.round(u.loadKw * 1.18),
    })),
  };
  const surgedPower = computeBmsRackPowerStats(INITIAL_RACKS, surgedBms, servers);
  const surgedSummary = buildHallUtilizationTrends24h(
    INITIAL_RACKS,
    surgedPower,
    servers,
    'hall-b',
    FIXED_NOW_MS
  );

  assert.ok(
    surgedSummary.activeHall.analytics.currentPowerUtilPct >
      baseSummary.activeHall.analytics.currentPowerUtilPct + 5,
    'Surged BMS load should raise current hall power utilization'
  );
  assert.ok(
    surgedSummary.activeHall.analytics.headroomKw <
      baseSummary.activeHall.analytics.headroomKw,
    'Surged BMS load should reduce remaining kW headroom'
  );
});

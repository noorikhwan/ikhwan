import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialBmsState } from './bmsEngine';
import { computeAutonomySimulation, computeDlcLeakTelemetry } from './electricalCoolingTwinEngine';
import { createInitialServers } from './seedData';

test('computeAutonomySimulation generates decreasing UPS SoC and diesel fuel curves', () => {
  const bms = createInitialBmsState(1_700_000_000_000);
  const sim = computeAutonomySimulation(bms, {
    outageDurationHrs: 24,
    simulatedLoadKw: 5000,
    includeChillerLoad: true,
  });

  assert.equal(sim.effectiveLoadKw, 6300);
  assert.ok(sim.upsAutonomyMin > 5);
  assert.ok(sim.upsCurve.length >= 5);
  assert.ok(sim.upsCurve[0].socPct > sim.upsCurve[sim.upsCurve.length - 1].socPct);
  assert.ok(sim.dieselCurve.length >= 6);
  assert.ok(sim.dieselCurve[0].fuelPct > sim.dieselCurve[sim.dieselCurve.length - 1].fuelPct);
  assert.ok(sim.dieselAutonomyHrs > 24);
  assert.equal(sim.survivesOutage, true);
});

test('computeDlcLeakTelemetry tracks Hall B CDUs and interactive leak-rope alarms', () => {
  const bms = createInitialBmsState(1_700_000_000_000);
  const servers = createInitialServers(1_700_000_000_000);

  const nominal = computeDlcLeakTelemetry(bms, servers, []);
  assert.equal(nominal.cdus.length, 2);
  assert.equal(nominal.leakZones.length, 4);
  assert.equal(nominal.activeLeakCount, 0);
  assert.ok(nominal.avgManifoldPressureBar > 1.0);
  assert.ok(nominal.avgDeltaTC > 2.0);

  const leaked = computeDlcLeakTelemetry(bms, servers, ['zone-b-west']);
  assert.equal(leaked.activeLeakCount, 1);
  const flagged = leaked.leakZones.find((z) => z.id === 'zone-b-west');
  assert.equal(flagged?.leakDetected, true);
  assert.ok((flagged?.impedanceKohm ?? 500) < 20);
  assert.ok(flagged?.leakDistanceM !== null);
});

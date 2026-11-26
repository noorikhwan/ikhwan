import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialBmsState } from './bmsEngine';
import { computeBmsRackPowerStats } from './rackPowerEngine';
import {
  OUTLETS_PER_RPDU_STRIP,
  applyRpduOutletAction,
  computeRackRpduStrip,
} from './rpduOutletEngine';
import { INITIAL_RACKS, createInitialServers } from './seedData';

test('computeRackRpduStrip produces 24 metered outlets anchored to rack servers and feed load', () => {
  const now = 1_700_000_000_000;
  const servers = createInitialServers(now);
  const bms = createInitialBmsState(now);
  const powerStats = computeBmsRackPowerStats(INITIAL_RACKS, bms, servers);
  const rack = INITIAL_RACKS.find((r) => r.id === 'B-R01-01')!;

  const stripA = computeRackRpduStrip({
    rack,
    feed: 'A',
    servers,
    powerStat: powerStats[rack.id],
  });
  const stripB = computeRackRpduStrip({
    rack,
    feed: 'B',
    servers,
    powerStat: powerStats[rack.id],
  });

  assert.equal(stripA.outlets.length, OUTLETS_PER_RPDU_STRIP);
  assert.equal(stripB.outlets.length, OUTLETS_PER_RPDU_STRIP);
  assert.equal(stripA.pduName, rack.pduAName);
  assert.equal(stripB.pduName, rack.pduBName);
  assert.ok(stripA.totalWatts > 0 && stripA.totalAmps > 0);
  assert.ok(stripA.outlets[0].assignedDevice.includes('PSU-A'));
  assert.ok(stripB.outlets[0].assignedDevice.includes('PSU-B'));
  assert.ok(stripA.occupiedCount >= 3);
});

test('applyRpduOutletAction enforces lockout guard, unlocks, switches power, and tracks power cycles', () => {
  const now = 1_700_000_000_000;
  const servers = createInitialServers(now);
  const rack = INITIAL_RACKS.find((r) => r.id === 'B-R01-01')!;
  const strip = computeRackRpduStrip({ rack, feed: 'A', servers });

  // Find a locked critical outlet (e.g., ToR switch)
  const lockedOutlet = strip.outlets.find((o) => o.locked);
  assert.ok(lockedOutlet, 'Expected at least one default-locked outlet (ToR/Critical)');

  const blocked = applyRpduOutletAction({}, lockedOutlet, 'toggle_power', now);
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /locked/i);

  // Unlock -> toggle off -> verify zero watts on recompute
  const unlocked = applyRpduOutletAction({}, lockedOutlet, 'toggle_lock', now + 1000);
  assert.equal(unlocked.ok, true);

  const stripAfterUnlock = computeRackRpduStrip({
    rack,
    feed: 'A',
    servers,
    overrides: unlocked.overrides,
  });
  const unlockedOutlet = stripAfterUnlock.outlets.find((o) => o.id === lockedOutlet.id)!;
  assert.equal(unlockedOutlet.locked, false);

  const switchedOff = applyRpduOutletAction(
    unlocked.overrides,
    unlockedOutlet,
    'toggle_power',
    now + 2000
  );
  assert.equal(switchedOff.ok, true);

  const stripAfterOff = computeRackRpduStrip({
    rack,
    feed: 'A',
    servers,
    overrides: switchedOff.overrides,
  });
  const offOutlet = stripAfterOff.outlets.find((o) => o.id === lockedOutlet.id)!;
  assert.equal(offOutlet.powerState, 'Off');
  assert.equal(offOutlet.watts, 0);

  // Power cycle an unlocked server outlet and verify cycleCount increments
  const unlockedServerOutlet = strip.outlets.find((o) => !o.locked && o.serverId !== null)!;
  const cycled = applyRpduOutletAction({}, unlockedServerOutlet, 'power_cycle', now + 3000);
  assert.equal(cycled.ok, true);

  const stripAfterCycle = computeRackRpduStrip({
    rack,
    feed: 'A',
    servers,
    overrides: cycled.overrides,
  });
  const cycledOutlet = stripAfterCycle.outlets.find((o) => o.id === unlockedServerOutlet.id)!;
  assert.equal(cycledOutlet.cycleCount, 1);
  assert.equal(cycledOutlet.lastCycleAt, now + 3000);
});

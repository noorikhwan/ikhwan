import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialBmsState } from './bmsEngine';
import { computeFailoverStressAudit } from './failoverStressEngine';
import { INITIAL_RACKS, createInitialServers } from './seedData';

test('computeFailoverStressAudit flags cabinets >50% rated kW on Feed A loss and calculates ASHRAE ride-through on CRAC trip', () => {
  const now = Date.now();
  const servers = createInitialServers(now);
  const bms = createInitialBmsState(now);
  const sampleRacks = INITIAL_RACKS.slice(0, 24);

  const baseline = computeFailoverStressAudit({
    racks: sampleRacks,
    servers,
    bms,
    mode: 'none',
  });
  assert.equal(baseline.powerViolationCount, 0);
  assert.equal(baseline.coolingViolationCount, 0);

  // Force one rack over 50% capacity so Feed A loss guarantees a Feed B overload
  const overloadedRack = sampleRacks[0];
  const powerAudit = computeFailoverStressAudit({
    racks: sampleRacks,
    servers,
    bms,
    mode: 'feed_a_loss',
    rackPowerAdjustmentsKw: {
      [overloadedRack.id]: overloadedRack.powerCapacityKw * 0.4,
    },
  });
  assert.ok(powerAudit.powerViolationCount >= 1);
  assert.equal(powerAudit.byRack[overloadedRack.id].powerVerdict, 'violation');
  assert.ok(powerAudit.byRack[overloadedRack.id].survivingFeedLoadPct > 100);

  const combinedAudit = computeFailoverStressAudit({
    racks: sampleRacks,
    servers,
    bms,
    mode: 'combined',
  });
  assert.ok(combinedAudit.shortestMinutesToBreach !== null);
  assert.ok(combinedAudit.worstCoolingRackId !== null);
});

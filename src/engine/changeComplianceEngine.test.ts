import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialBmsState } from './bmsEngine';
import {
  buildComplianceEvidencePack,
  compileShiftHandoverBrief,
  moveServerInRack,
  validateRackUPlacement,
} from './changeComplianceEngine';
import { createInitialAuditTrail, createInitialRackLocks } from './enterpriseOpsEngine';
import { INITIAL_RACKS, createInitialAlerts, createInitialServers } from './seedData';
import { createInitialProfiles } from './shiftEngine';
import { createInitialTickets } from './ticketEngine';
import { createInitialVisitors } from './visitorEngine';

const NOW = 1_700_000_000_000;

test('validateRackUPlacement and moveServerInRack prevent U-collisions and out-of-bounds slots', () => {
  const servers = createInitialServers(NOW);
  const rack = INITIAL_RACKS.find((r) => r.id === 'B-R01-01')!;
  const rackServers = servers.filter((s) => s.rackId === rack.id);
  assert.ok(rackServers.length >= 2);

  const first = rackServers[0];
  const second = rackServers[1];

  // Colliding with second server should fail
  const collision = validateRackUPlacement(rack, rackServers, first.id, second.uStart);
  assert.equal(collision.valid, false);
  assert.ok(collision.reason?.includes('collision'));

  // Out of 42U bounds should fail
  const oob = validateRackUPlacement(rack, rackServers, first.id, 42);
  assert.equal(oob.valid, false);

  // Moving to an open U slot that fits first.uHeight should succeed
  let openU = -1;
  for (let candidate = rack.totalU - first.uHeight + 1; candidate >= 1; candidate--) {
    if (candidate === first.uStart) continue;
    const candEnd = candidate + first.uHeight - 1;
    const collides = rackServers.some(
      (s) => s.id !== first.id && candidate <= s.uStart + s.uHeight - 1 && candEnd >= s.uStart
    );
    if (!collides) {
      openU = candidate;
      break;
    }
  }
  assert.ok(openU >= 1, 'Expected at least one open U slot in cabinet');
  const moved = moveServerInRack(servers, rack, first.id, openU);
  assert.equal(moved.ok, true);
  const updated = moved.servers.find((s) => s.id === first.id)!;
  assert.equal(updated.uStart, openU);
});

test('compileShiftHandoverBrief summarizes open alarms, tickets, visitors, and BMS overrides', () => {
  const profiles = createInitialProfiles();
  const brief = compileShiftHandoverBrief({
    siteId: 'kl1',
    siteCode: 'KL1',
    shiftLabel: 'Shift A · Day',
    outgoingOperator: 'Elena Vance',
    incomingLead: 'Marcus Thorne',
    alerts: createInitialAlerts(NOW),
    tickets: createInitialTickets(profiles, NOW),
    visitors: createInitialVisitors(profiles, NOW),
    bms: createInitialBmsState(NOW),
    workOrders: [],
    sitePue: 1.32,
    slaCompliancePct: 99.98,
    now: NOW,
  });

  assert.ok(brief.markdown.includes('# Shift Handover Brief — KL1'));
  assert.ok(brief.summaryText.includes('Elena Vance'));
  assert.ok(brief.unresolvedCritical >= 1);
});

test('buildComplianceEvidencePack verifies hash chain and compiles ISO 27001 / SOC2 / Tier IV checks', () => {
  const profiles = createInitialProfiles();
  const pack = buildComplianceEvidencePack({
    siteId: 'kl1',
    siteCode: 'KL1',
    auditTrail: createInitialAuditTrail(NOW),
    visitors: createInitialVisitors(profiles, NOW),
    rackLocks: createInitialRackLocks('kl1', NOW),
    slaCompliancePct: 99.98,
    pue: 1.31,
    now: NOW,
  });

  assert.equal(pack.auditChainValid, true);
  assert.equal(pack.controlChecks.length, 4);
  assert.ok(pack.jsonString.includes('ISO/IEC 27001:2022'));
  assert.ok(pack.markdownSummary.includes('VERIFIED'));
});

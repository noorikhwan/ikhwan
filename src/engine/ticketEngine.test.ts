import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialProfiles } from './shiftEngine';
import {
  TICKET_SLA_HOURS,
  addTicketComment,
  assignOpsTicket,
  computeTicketMetrics,
  createInitialTickets,
  createOpsTicket,
  createTicketFromAlert,
  filterTickets,
  getTicketSlaState,
  transitionTicketStatus,
} from './ticketEngine';
import type { ActiveAlert } from './types';

const FIXED_NOW = Date.UTC(2026, 10, 21, 8, 0, 0);

test('createInitialTickets seeds realistic multi-site operations tickets across KL1, KL2, KL3', () => {
  const profiles = createInitialProfiles();
  const tickets = createInitialTickets(profiles, FIXED_NOW);
  assert.ok(tickets.length >= 6);
  const sites = new Set(tickets.map((t) => t.siteId));
  assert.equal(sites.has('kl1'), true);
  assert.equal(sites.has('kl2'), true);
  assert.equal(sites.has('kl3'), true);
});

test('createOpsTicket generates sequential site IDs, sets priority SLA due date, and logs creation', () => {
  const profiles = createInitialProfiles();
  const initial = createInitialTickets(profiles, FIXED_NOW);
  const created = createOpsTicket(
    initial,
    {
      siteId: 'kl1',
      title: 'Inspect square CHW buffer tank sensor',
      description: 'Verify differential pressure transmitter on CHW-TANK-A.',
      category: 'Cooling & Power',
      priority: 'P1 - Critical',
      affectedAssetId: 'chw-tank-a',
      affectedAssetLabel: 'CHW-TANK-A',
      requesterName: profiles[0].name,
      assigneeProfileId: profiles[1].id,
      assigneeName: profiles[1].name,
    },
    FIXED_NOW
  );

  assert.match(created.id, /^TKT-KL1-\d{4}$/);
  assert.equal(created.status, 'Open');
  assert.equal(created.slaDueAt, FIXED_NOW + TICKET_SLA_HOURS['P1 - Critical'] * 3600 * 1000);
  assert.equal(created.comments.length, 1);
});

test('createTicketFromAlert maps critical power surge alert to P1 Cooling & Power ticket linked to alert ID', () => {
  const profiles = createInitialProfiles();
  const initial = createInitialTickets(profiles, FIXED_NOW);
  const sampleAlert: ActiveAlert = {
    id: 'alt-surge-01',
    ruleId: 'rule-power-surge',
    ruleName: 'Campus 5MW Surge Alert',
    serverId: 'facility-power-plant',
    serverHostname: 'KL1-FACILITY-POWER',
    rackId: 'Campus Main Bus',
    metric: 'facilityPowerMw',
    operator: '>',
    threshold: 5,
    currentValue: 6.4,
    severity: 'critical',
    state: 'active',
    triggeredAt: FIXED_NOW - 60_000,
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
    dispatchedChannelNames: ['Facility Management Channel'],
    message: 'Facility total power 6.40 MW exceeded 5.00 MW for 30s',
  };

  const ticket = createTicketFromAlert(
    initial,
    sampleAlert,
    'kl1',
    profiles[0],
    profiles[1],
    FIXED_NOW
  );

  assert.equal(ticket.priority, 'P1 - Critical');
  assert.equal(ticket.category, 'Cooling & Power');
  assert.equal(ticket.linkedAlertId, 'alt-surge-01');
  assert.equal(ticket.affectedAssetId, 'facility-power-plant');
});

test('workflow transitions, engineer assignment, comments, SLA state, filtering, and KPI metrics stay consistent', () => {
  const profiles = createInitialProfiles();
  const initial = createInitialTickets(profiles, FIXED_NOW);
  const created = createOpsTicket(
    initial,
    {
      siteId: 'kl2',
      title: 'Replace air chiller CHA-A4 fan VFD',
      description: 'VFD fault code F014 on condenser fan bank 2.',
      category: 'Cooling & Power',
      priority: 'P2 - High',
      affectedAssetId: 'cha-a4',
      affectedAssetLabel: 'CHA-A4 · Air Chiller A4',
      requesterName: profiles[0].name,
      assigneeProfileId: profiles[0].id,
      assigneeName: profiles[0].name,
    },
    FIXED_NOW
  );

  const actor = { name: profiles[0].name, role: profiles[0].role };
  let list = [created, ...initial];

  list = transitionTicketStatus(list, created.id, 'In Progress', actor, 'Dispatched tech to roof', FIXED_NOW + 60_000);
  assert.equal(list.find((t) => t.id === created.id)?.status, 'In Progress');

  list = assignOpsTicket(list, created.id, { id: profiles[1].id, name: profiles[1].name }, actor, FIXED_NOW + 120_000);
  assert.equal(list.find((t) => t.id === created.id)?.assigneeProfileId, profiles[1].id);
  assert.equal(list.find((t) => t.id === created.id)?.assigneeName, profiles[1].name);

  list = addTicketComment(list, created.id, 'Swapped VFD module and tested at 100% RPM.', actor, FIXED_NOW + 180_000);
  assert.ok(
    list
      .find((t) => t.id === created.id)
      ?.comments.some((c) => c.kind === 'comment' && c.body.includes('Swapped VFD module'))
  );

  list = transitionTicketStatus(list, created.id, 'Resolved', actor, 'Verified nominal amps', FIXED_NOW + 240_000);
  const resolved = list.find((t) => t.id === created.id)!;
  assert.equal(resolved.status, 'Resolved');
  assert.equal(resolved.resolvedAt, FIXED_NOW + 240_000);
  assert.equal(getTicketSlaState(resolved, FIXED_NOW + 300_000), 'met');

  const filteredKl2 = filterTickets(list, {
    siteId: 'kl2',
    status: 'all',
    priority: 'all',
    category: 'all',
    query: 'CHA-A4',
  });
  assert.equal(filteredKl2.length, 1);
  assert.equal(filteredKl2[0].id, created.id);

  const metrics = computeTicketMetrics(list, FIXED_NOW + 300_000);
  assert.equal(metrics.total, list.length);
  assert.ok(metrics.resolvedCount >= 1);
});

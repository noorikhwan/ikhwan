import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeIncidentSlaMetrics,
  createIncidentWarRoomRecord,
  formatIncidentForShiftHandover,
  toggleRunbookStep,
} from './incidentRunbookEngine';
import { ActiveAlert } from './types';

test('incidentRunbookEngine builds tailored runbook steps, tracks sign-offs & MTTA, and formats shift handover summary', () => {
  const now = Date.now();
  const alert: ActiveAlert = {
    id: 'alt-rack-pwr-1',
    ruleId: 'rule-rack-power-capacity',
    ruleName: 'Critical Power Capacity',
    serverId: 'rack-B-R01-01',
    serverHostname: 'Cabinet B-R01-01',
    rackId: 'B-R01-01',
    metric: 'rackPowerKw',
    currentValue: 23.4,
    threshold: 22.0,
    operator: '>',
    severity: 'critical',
    state: 'active',
    triggeredAt: now - 120_000,
    acknowledgedAt: now - 90_000,
    acknowledgedBy: 'Elena Vance',
    resolvedAt: null,
    dispatchedChannelNames: ['PagerDuty NOC'],
    message: 'Cabinet B-R01-01 exceeded 22.0 kW rated power capacity',
  };

  let record = createIncidentWarRoomRecord({
    alert,
    siteId: 'kl1',
    siteCode: 'KL1',
    assignedEngineerId: 'op-elena',
    assignedEngineerName: 'Elena Vance',
    now,
  });

  assert.equal(record.steps.length, 4);
  assert.match(record.steps[0].title, /rPDU/i);

  record = toggleRunbookStep(record, 'step-1', 'Elena Vance', now);
  record = toggleRunbookStep(record, 'step-2', 'Elena Vance', now + 5000);

  const sla = computeIncidentSlaMetrics(record, now + 10_000);
  assert.equal(sla.completedSteps, 2);
  assert.equal(sla.completionPct, 50);
  assert.equal(sla.mttaSec, 30);

  const summary = formatIncidentForShiftHandover(record, now + 10_000);
  assert.match(summary, /\[KL1 War Room · ACTIVE\]/);
  assert.match(summary, /Runbook 2\/4 \(50%\)/);
  assert.match(summary, /Elena Vance/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  correlateAlertStorms,
  generatePostIncidentReview,
  isAlertSilencedByMaintenance,
  MaintenanceWindow,
} from './alertIntelligenceEngine';
import { ActiveAlert } from './types';

const NOW = 1_700_000_000_000;

function makeAlert(overrides: Partial<ActiveAlert>): ActiveAlert {
  return {
    id: 'alt-1',
    ruleId: 'rule-temp',
    ruleName: 'Critical Exhaust Thermal Threshold',
    serverId: 'srv-b01-01',
    serverHostname: 'gpu-b01-x01.kl1.orise',
    rackId: 'B-R01-01',
    metric: 'tempC',
    currentValue: 81.4,
    threshold: 78,
    operator: '>=',
    severity: 'critical',
    state: 'active',
    triggeredAt: NOW - 1000 * 60 * 12,
    acknowledgedAt: NOW - 1000 * 60 * 7,
    acknowledgedBy: 'Elena Vance',
    resolvedAt: null,
    dispatchedChannelNames: ['PagerDuty NOC Primary'],
    message: 'Exhaust Temperature reached 81.4°C (threshold >= 78°C)',
    ...overrides,
  };
}

test('correlateAlertStorms groups cascading hall thermal alerts under a single parent root-cause incident', () => {
  const alerts: ActiveAlert[] = [
    makeAlert({ id: 'alt-root', severity: 'critical', triggeredAt: NOW - 600_000 }),
    makeAlert({
      id: 'alt-child-1',
      serverId: 'srv-b01-02',
      serverHostname: 'gpu-b01-x02.kl1.orise',
      rackId: 'B-R01-02',
      severity: 'warning',
      triggeredAt: NOW - 480_000,
    }),
    makeAlert({
      id: 'alt-other-hall',
      serverId: 'srv-a01-01',
      serverHostname: 'cmp-a01-01.kl1.orise',
      rackId: 'A-R01-01',
      metric: 'cpu',
      ruleName: 'High CPU',
      severity: 'warning',
      triggeredAt: NOW - 300_000,
    }),
  ];

  const groups = correlateAlertStorms(alerts, [], 'kl1', NOW);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].category, 'Thermal Cascade');
  assert.equal(groups[0].rootCauseAlert.id, 'alt-root');
  assert.equal(groups[0].childAlerts.length, 1);
  assert.equal(groups[0].totalAlerts, 2);
});

test('isAlertSilencedByMaintenance matches active hall, rack, and subsystem windows cleanly', () => {
  const windows: MaintenanceWindow[] = [
    {
      id: 'mw-1',
      siteId: 'kl1',
      title: 'Hall B CDU Service',
      scopeType: 'hall',
      scopeValue: 'hall-b',
      reason: 'Planned maintenance',
      createdBy: 'Elena Vance',
      status: 'active',
      startAtMs: NOW - 60_000,
      endAtMs: NOW + 3_600_000,
    },
  ];

  const hallBAlert = makeAlert({ rackId: 'B-R01-01' });
  const hallAAlert = makeAlert({ rackId: 'A-R01-01', serverHostname: 'cmp-a01-01.kl1.orise' });

  assert.equal(isAlertSilencedByMaintenance(hallBAlert, 'kl1', windows, NOW), true);
  assert.equal(isAlertSilencedByMaintenance(hallAAlert, 'kl1', windows, NOW), false);
  assert.equal(isAlertSilencedByMaintenance(hallBAlert, 'kl2', windows, NOW), false);
});

test('generatePostIncidentReview compiles timeline, MTTR, and structured Markdown brief', () => {
  const alert = makeAlert({ resolvedAt: NOW - 1000 * 60 * 2 });
  const pir = generatePostIncidentReview({
    alert,
    siteCode: 'KL1',
    facilityHistory: [
      {
        timestamp: NOW,
        label: '12:00',
        totalPowerKw: 6200,
        pue: 1.31,
        avgCpu: 58,
        avgTempC: 48,
        totalNetworkGbps: 180,
      },
    ],
    operatorName: 'Elena Vance',
    now: NOW,
  });

  assert.equal(pir.mttrMinutes, 10);
  assert.ok(pir.timeline.length >= 3);
  assert.ok(pir.markdown.includes('# Post-Incident Review'));
  assert.ok(pir.markdown.includes('gpu-b01-x01.kl1.orise'));
  assert.ok(pir.markdown.includes('PUE 1.31'));
});

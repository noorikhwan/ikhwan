import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALERTS_CSV_HEADERS,
  buildAlertsCsv,
  buildAlertsCsvFilename,
  computeResolutionMinutes,
  escapeCsvCell,
  formatAlertResolutionStatus,
} from './alertCsvExport';
import { ActiveAlert } from './types';

function makeAlert(overrides: Partial<ActiveAlert> = {}): ActiveAlert {
  const baseTime = Date.UTC(2026, 10, 22, 10, 0, 0);
  return {
    id: 'alt-1001',
    ruleId: 'rule-temp-crit',
    ruleName: 'Critical Exhaust Thermal Threshold',
    serverId: 'srv-b01',
    serverHostname: 'gpu-b01-x01.kl1.orise',
    rackId: 'B-R01-01',
    metric: 'tempC',
    currentValue: 81.4,
    threshold: 78,
    operator: '>=',
    severity: 'critical',
    state: 'active',
    triggeredAt: baseTime,
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
    ignoredAt: null,
    ignoredBy: null,
    dispatchedChannelNames: ['PagerDuty NOC Primary', 'Slack #dc-ops-alerts'],
    message: 'Exhaust Temperature reached 81.4°C (threshold >= 78°C)',
    ...overrides,
  };
}

test('buildAlertsCsv exports full alert lifecycle, resolution status, and MTTR with UTF-8 BOM and CRLF', () => {
  const t0 = Date.UTC(2026, 10, 22, 10, 0, 0);
  const alerts: ActiveAlert[] = [
    makeAlert({
      id: 'alt-open',
      state: 'active',
      severity: 'critical',
    }),
    makeAlert({
      id: 'alt-ack',
      state: 'acknowledged',
      severity: 'warning',
      acknowledgedBy: 'Elena Vance',
      acknowledgedAt: t0 + 5 * 60 * 1000,
    }),
    makeAlert({
      id: 'alt-resolved',
      state: 'resolved',
      severity: 'critical',
      acknowledgedBy: 'Elena Vance',
      acknowledgedAt: t0 + 3 * 60 * 1000,
      resolvedAt: t0 + 18.5 * 60 * 1000,
      message: 'Resolved after CDU boost, "stabilized" at 61°C',
    }),
    makeAlert({
      id: 'alt-ignored',
      state: 'ignored',
      severity: 'warning',
      ignoredBy: 'Marcus Lim',
      ignoredAt: t0 + 10 * 60 * 1000,
      dispatchedChannelNames: [],
    }),
  ];

  const csv = buildAlertsCsv(alerts, { siteCode: 'KL1' });
  assert.ok(csv.startsWith('\uFEFF'), 'CSV should include UTF-8 BOM for Excel');
  const lines = csv.slice(1).trim().split('\r\n');
  assert.equal(lines.length, 5, 'Should contain 1 header row + 4 alert rows');
  assert.equal(lines[0], ALERTS_CSV_HEADERS.join(','));

  // Active row
  assert.ok(lines[1].includes('alt-open,KL1,CRITICAL,Unacknowledged (Open),active'));
  assert.ok(lines[1].includes('PagerDuty NOC Primary; Slack #dc-ops-alerts'));

  // Acknowledged row
  assert.ok(lines[2].includes('alt-ack,KL1,WARNING,Acknowledged (Open),acknowledged'));
  assert.ok(lines[2].includes('Elena Vance,2026-11-22T10:05:00.000Z'));

  // Resolved row with quoted comma + double quotes + MTTR 18.5 min
  assert.ok(lines[3].includes('alt-resolved,KL1,CRITICAL,Resolved,resolved'));
  assert.ok(lines[3].includes('"Resolved after CDU boost, ""stabilized"" at 61°C"'));
  assert.ok(lines[3].endsWith(',2026-11-22T10:18:30.000Z,18.5'));

  // Ignored row
  assert.ok(lines[4].includes('alt-ignored,KL1,WARNING,Ignored (Suppressed),ignored'));
  assert.ok(lines[4].includes('None'));
  assert.ok(lines[4].includes('Marcus Lim,2026-11-22T10:10:00.000Z'));
});

test('escapeCsvCell neutralizes formula injection and preserves negative numbers', () => {
  assert.equal(escapeCsvCell('=CMD("calc")'), `"'=CMD(""calc"")"`);
  assert.equal(escapeCsvCell('+SUM(A1:A2)'), `'+SUM(A1:A2)`);
  assert.equal(escapeCsvCell('@HYPERLINK'), `'@HYPERLINK`);
  assert.equal(escapeCsvCell(-12.5), '-12.5');
  assert.equal(escapeCsvCell('normal, value'), '"normal, value"');
});

test('formatAlertResolutionStatus, computeResolutionMinutes, and buildAlertsCsvFilename behave deterministically', () => {
  assert.equal(formatAlertResolutionStatus('active'), 'Unacknowledged (Open)');
  assert.equal(formatAlertResolutionStatus('resolved'), 'Resolved');
  assert.equal(
    computeResolutionMinutes({ triggeredAt: 1000, resolvedAt: null }),
    ''
  );
  assert.equal(
    computeResolutionMinutes({ triggeredAt: 0, resolvedAt: 90_000 }),
    '1.5'
  );

  const filename = buildAlertsCsvFilename({
    siteCode: 'KL2',
    stateFilter: 'resolved',
    severityFilter: 'critical',
    now: Date.UTC(2026, 10, 22, 16, 5, 0),
  });
  assert.equal(filename, 'orise-alerts-KL2-resolved-critical-2026-11-22_16-05.csv');
});

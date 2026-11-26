import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAlertFrequency24h,
  getFilteredSeriesVisibility,
} from './alertFrequencyEngine';
import { ActiveAlert, FacilityTelemetryPoint } from './types';

function makeTelemetry(avgTempC: number, avgCpu: number, now: number): FacilityTelemetryPoint[] {
  return Array.from({ length: 12 }, (_, idx) => ({
    timestamp: now - (11 - idx) * 3000,
    label: `12:00:${String(idx * 3).padStart(2, '0')}`,
    totalPowerKw: 15000 + idx * 15,
    pue: 1.26,
    avgCpu,
    avgTempC,
    totalNetworkGbps: 145,
  }));
}

function makeAlert(overrides: Partial<ActiveAlert> = {}): ActiveAlert {
  const now = Date.UTC(2026, 10, 22, 16, 20, 0);
  return {
    id: 'alt-1',
    ruleId: 'r-1',
    ruleName: 'Critical Exhaust Thermal Threshold',
    serverId: 'srv-1',
    serverHostname: 'gpu-b01-x01.kl1.orise',
    rackId: 'B-R01-01',
    metric: 'tempC',
    currentValue: 81.4,
    threshold: 78,
    operator: '>=',
    severity: 'critical',
    state: 'active',
    triggeredAt: now - 5 * 60 * 1000,
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
    dispatchedChannelNames: ['PagerDuty'],
    message: 'Exhaust temp reached 81.4°C',
    ...overrides,
  };
}

test('buildAlertFrequency24h produces 24 hourly buckets anchored to live alerts in the current hour', () => {
  const now = Date.UTC(2026, 10, 22, 16, 25, 0);
  const alerts: ActiveAlert[] = [
    makeAlert({ id: 'a1', severity: 'critical', triggeredAt: now - 4 * 60 * 1000 }),
    makeAlert({ id: 'a2', severity: 'warning', triggeredAt: now - 10 * 60 * 1000 }),
    makeAlert({ id: 'a3', severity: 'warning', triggeredAt: now - 15 * 60 * 1000 }),
  ];

  const summary = buildAlertFrequency24h({
    alerts,
    facilityHistory: makeTelemetry(54.2, 68.5, now),
    siteCode: 'KL1',
    now,
  });

  assert.equal(summary.buckets.length, 24, 'Must emit exactly 24 hourly buckets');
  assert.equal(summary.buckets[23].hourLabel, 'Now');
  assert.equal(summary.buckets[23].critical, 1, 'Current hour must match live critical alerts');
  assert.equal(summary.buckets[23].warning, 2, 'Current hour must match live warning alerts');
  assert.equal(summary.currentHourCount, 3);
  assert.equal(summary.totalAlerts, summary.totalCritical + summary.totalWarning);
  assert.ok(summary.peakHourCount >= 3);
  assert.equal(summary.latestTempC, 54.2);
  assert.equal(summary.latestCpuPct, 68.5);
});

test('buildAlertFrequency24h scales historical alert frequency with site telemetry load & thermal pressure', () => {
  const now = Date.UTC(2026, 10, 22, 16, 25, 0);
  const coolSite = buildAlertFrequency24h({
    alerts: [],
    facilityHistory: makeTelemetry(42.0, 38.0, now),
    siteCode: 'KL3',
    now,
  });
  const hotSite = buildAlertFrequency24h({
    alerts: [],
    facilityHistory: makeTelemetry(62.5, 84.0, now),
    siteCode: 'KL1',
    now,
  });

  assert.ok(
    hotSite.totalAlerts > coolSite.totalAlerts,
    `Hot site (${hotSite.totalAlerts}) should show higher 24h alert frequency than cool site (${coolSite.totalAlerts})`
  );
  assert.ok(hotSite.totalCritical >= coolSite.totalCritical);
});

test('getFilteredSeriesVisibility accurately maps severity filter to stacked chart series', () => {
  assert.deepEqual(getFilteredSeriesVisibility('all'), { showCritical: true, showWarning: true });
  assert.deepEqual(getFilteredSeriesVisibility('critical'), { showCritical: true, showWarning: false });
  assert.deepEqual(getFilteredSeriesVisibility('warning'), { showCritical: false, showWarning: true });
});

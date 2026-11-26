import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAlarmSoundDecision,
  detectNewAlarmBurstLevel,
  getAlarmTonePattern,
  readSavedAlarmMuted,
} from './alarmAudio';
import { ActiveAlert } from './types';

function makeAlert(overrides: Partial<ActiveAlert> = {}): ActiveAlert {
  return {
    id: 'alrt-1',
    ruleId: 'rule-temp-crit',
    ruleName: 'Critical Thermal Excursion',
    serverId: 'srv-b01-01',
    serverHostname: 'gpu-inf-01.kl1.orise',
    rackId: 'B-R01-01',
    severity: 'critical',
    state: 'active',
    metric: 'tempC',
    currentValue: 83.4,
    threshold: 78,
    operator: '>=',
    message: 'Inlet/core temperature reached 83.4°C (threshold >= 78°C)',
    triggeredAt: 1_700_000_000_000,
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
    dispatchedChannelNames: ['PagerDuty Tier-1'],
    ...overrides,
  };
}

test('computeAlarmSoundDecision sounds critical alarm when unacknowledged critical alert exists and not muted', () => {
  const alerts = [
    makeAlert({ id: 'a1', severity: 'warning', state: 'active' }),
    makeAlert({ id: 'a2', severity: 'critical', state: 'active' }),
  ];

  const decision = computeAlarmSoundDecision(alerts, false);
  assert.equal(decision.level, 'critical');
  assert.equal(decision.unackedCriticalCount, 1);
  assert.equal(decision.unackedWarningCount, 1);
  assert.equal(decision.shouldSound, true);
  assert.ok(decision.cadenceMs > 0 && decision.cadenceMs < 3000);
  assert.equal(decision.statusLabel, 'Sounding · Critical');
});

test('computeAlarmSoundDecision silences immediately when muted even with critical alerts active', () => {
  const alerts = [makeAlert({ id: 'a1', severity: 'critical', state: 'active' })];

  const decision = computeAlarmSoundDecision(alerts, true);
  assert.equal(decision.level, 'critical');
  assert.equal(decision.shouldSound, false);
  assert.equal(decision.statusLabel, 'Muted · Critical Active');
});

test('computeAlarmSoundDecision drops to warning when critical alerts are acknowledged, and stops when all acknowledged/resolved', () => {
  const mixed = [
    makeAlert({ id: 'a1', severity: 'critical', state: 'acknowledged' }),
    makeAlert({ id: 'a2', severity: 'warning', state: 'active' }),
  ];
  const warnDecision = computeAlarmSoundDecision(mixed, false);
  assert.equal(warnDecision.level, 'warning');
  assert.equal(warnDecision.shouldSound, true);
  assert.equal(warnDecision.unackedCriticalCount, 0);
  assert.equal(warnDecision.unackedWarningCount, 1);
  assert.equal(warnDecision.statusLabel, 'Sounding · Warning');

  const allHandled = [
    makeAlert({ id: 'a1', severity: 'critical', state: 'acknowledged' }),
    makeAlert({ id: 'a2', severity: 'warning', state: 'resolved' }),
  ];
  const quietDecision = computeAlarmSoundDecision(allHandled, false);
  assert.equal(quietDecision.level, 'none');
  assert.equal(quietDecision.shouldSound, false);
  assert.equal(quietDecision.cadenceMs, 0);
  assert.equal(quietDecision.statusLabel, 'Sound Armed');
});

test('detectNewAlarmBurstLevel prioritizes critical over warning and ignores non-active alerts', () => {
  assert.equal(detectNewAlarmBurstLevel([]), 'none');
  assert.equal(
    detectNewAlarmBurstLevel([makeAlert({ severity: 'critical', state: 'acknowledged' })]),
    'none'
  );
  assert.equal(
    detectNewAlarmBurstLevel([makeAlert({ severity: 'warning', state: 'active' })]),
    'warning'
  );
  assert.equal(
    detectNewAlarmBurstLevel([
      makeAlert({ id: 'w1', severity: 'warning', state: 'active' }),
      makeAlert({ id: 'c1', severity: 'critical', state: 'active' }),
    ]),
    'critical'
  );
});

test('getAlarmTonePattern returns distinct multi-pulse critical pattern and calmer warning chime', () => {
  const critPattern = getAlarmTonePattern('critical');
  const warnPattern = getAlarmTonePattern('warning');

  assert.equal(critPattern.length, 3);
  assert.equal(warnPattern.length, 2);
  assert.ok(critPattern[0].frequencyHz > warnPattern[0].frequencyHz);
  assert.ok(critPattern.every((s) => s.durationSec > 0 && s.gain > 0 && s.gain <= 0.25));
  assert.ok(warnPattern.every((s) => s.durationSec > 0 && s.gain > 0 && s.gain <= 0.2));
});

test('readSavedAlarmMuted safely defaults to false outside browser environment', () => {
  assert.equal(readSavedAlarmMuted(), false);
});

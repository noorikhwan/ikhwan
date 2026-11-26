import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialBmsState } from './bmsEngine';
import {
  INITIAL_ALERT_RULES,
  INITIAL_CHANNELS,
  INITIAL_RACKS,
  createInitialAlerts,
  createInitialServers,
} from './seedData';
import {
  DEFAULT_RACK_THERMAL_CRITICAL_C,
  DEFAULT_RACK_THERMAL_WARNING_C,
  RACK_CRITICAL_POWER_RULE_ID,
  RACK_CRITICAL_POWER_RULE_NAME,
  RACK_THERMAL_VIOLATION_RULE_ID,
  RACK_THERMAL_VIOLATION_RULE_NAME,
  applyFaultToServer,
  computeFacilitySummary,
  evaluateAlertRules,
  evaluateRackPowerCapacityAlerts,
  filterServers,
  sortServers,
  stepTelemetryTick,
  validateAlertRuleDraft,
} from './telemetryEngine';

test('computeFacilitySummary aggregates fleet counts and IT power load accurately', () => {
  const now = 1_700_000_000_000;
  const servers = createInitialServers(now);
  const alerts = createInitialAlerts(now);
  const summary = computeFacilitySummary(servers, INITIAL_RACKS, alerts);

  assert.equal(summary.totalServers, 24);
  assert.equal(
    summary.nominalCount + summary.warningCount + summary.criticalCount + summary.maintenanceCount,
    24
  );
  assert.ok(summary.totalItLoadKw > 10000 && summary.totalItLoadKw < 20000);
  assert.equal(summary.totalFacilityCapacityKw, 25600.0);
  assert.equal(summary.unacknowledgedCount, 2);
  assert.equal(summary.activeAlertCount, 3);
});

test('evaluateAlertRules opens alert and dispatches automated notifications on threshold breach', () => {
  const now = 1_700_000_000_000;
  const servers = createInitialServers(now);
  // Inject a CPU surge on cmp-a01-n01 (which starts nominal)
  const mutated = servers.map((s) =>
    s.id === 'srv-a01-01' ? applyFaultToServer(s, 'cpu_surge') : s
  );

  const result = evaluateAlertRules(mutated, INITIAL_ALERT_RULES, [], INITIAL_CHANNELS, now);
  const cpuCrit = result.newAlerts.find(
    (a) => a.serverId === 'srv-a01-01' && a.ruleId === 'rule-cpu-crit'
  );

  assert.ok(cpuCrit, 'Expected critical CPU alert to fire for srv-a01-01');
  assert.equal(cpuCrit.severity, 'critical');
  assert.ok(cpuCrit.dispatchedChannelNames.includes('PagerDuty NOC Primary'));
  assert.ok(cpuCrit.dispatchedChannelNames.includes('Slack #dc-ops-alerts'));
  assert.ok(result.newDispatches.some((d) => d.alertId === cpuCrit.id && d.channelId === 'ch-pagerduty'));
});

test('evaluateAlertRules deduplicates open alerts and auto-resolves upon recovery', () => {
  const now = 1_700_000_000_000;
  const servers = createInitialServers(now);
  const spiked = servers.map((s) =>
    s.id === 'srv-a01-01' ? applyFaultToServer(s, 'thermal_spike') : s
  );

  const firstPass = evaluateAlertRules(spiked, INITIAL_ALERT_RULES, [], INITIAL_CHANNELS, now);
  const secondPass = evaluateAlertRules(
    spiked,
    INITIAL_ALERT_RULES,
    firstPass.alerts,
    firstPass.updatedChannels,
    now + 3000
  );

  // Should not create duplicate open thermal alerts for the same server
  const openThermal = secondPass.alerts.filter(
    (a) => a.serverId === 'srv-a01-01' && a.ruleId === 'rule-thermal-crit' && a.state !== 'resolved'
  );
  assert.equal(openThermal.length, 1);

  // Recover the server and verify auto-resolve
  const recovered = spiked.map((s) => (s.id === 'srv-a01-01' ? applyFaultToServer(s, null) : s));
  const thirdPass = evaluateAlertRules(
    recovered,
    INITIAL_ALERT_RULES,
    secondPass.alerts,
    secondPass.updatedChannels,
    now + 6000
  );
  const resolvedThermal = thirdPass.alerts.find(
    (a) => a.serverId === 'srv-a01-01' && a.ruleId === 'rule-thermal-crit'
  );
  assert.equal(resolvedThermal?.state, 'resolved');
  assert.equal(resolvedThermal?.resolvedAt, now + 6000);
});

test('stepTelemetryTick appends facility and server history within valid bounds', () => {
  const now = 1_700_000_000_000;
  const servers = createInitialServers(now);
  const alerts = createInitialAlerts(now);

  const next = stepTelemetryTick({
    servers,
    rules: INITIAL_ALERT_RULES,
    alerts,
    dispatchLogs: [],
    channels: INITIAL_CHANNELS,
    tickCount: 1,
    now: now + 3000,
  });

  assert.equal(next.servers.length, servers.length);
  for (const s of next.servers) {
    assert.ok(s.cpu >= 0 && s.cpu <= 100);
    assert.ok(s.tempC >= 20 && s.tempC <= 100);
    assert.equal(s.history.length, 20);
  }
  assert.ok(next.facilityPoint.totalPowerKw > 0);
  assert.ok(next.facilityPoint.pue >= 1.1 && next.facilityPoint.pue <= 2.0);
});

test('filterServers and sortServers support search, zone, status, and numeric sorting', () => {
  const servers = createInitialServers(1_700_000_000_000);
  const gpus = filterServers(servers, { search: 'gpu', hallId: 'all', status: 'all', rackId: 'all' });
  assert.equal(gpus.length, 5);

  const hallA = filterServers(servers, { search: '', hallId: 'hall-a', status: 'all', rackId: 'all' });
  assert.equal(hallA.length, 6);

  const sortedByTemp = sortServers(servers, 'tempC', 'desc');
  assert.equal(sortedByTemp[0].id, 'srv-b01-01');
});

test('validateAlertRuleDraft rejects missing name, invalid thresholds, and empty channels', () => {
  const bad = validateAlertRuleDraft({
    name: '',
    ruleType: 'server_telemetry',
    metric: 'cpu',
    operator: '>=',
    threshold: '150',
    sustainedDurationSec: '60',
    severity: 'critical',
    scopeHall: 'all',
    channelIds: [],
    autoResolve: true,
    cooldownSec: '5',
  });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.name);
  assert.ok(bad.errors.threshold);
  assert.ok(bad.errors.channelIds);
  assert.ok(bad.errors.cooldownSec);

  const good = validateAlertRuleDraft({
    name: 'GPU Thermal Guard',
    ruleType: 'server_telemetry',
    metric: 'tempC',
    operator: '>=',
    threshold: '75',
    sustainedDurationSec: '60',
    severity: 'warning',
    scopeHall: 'hall-b',
    channelIds: ['ch-slack'],
    autoResolve: true,
    cooldownSec: '60',
  });
  assert.equal(good.valid, true);
  assert.deepEqual(good.errors, {});
});

test('validateAlertRuleDraft enforces MW threshold and sustained period for facility_power_surge', () => {
  const invalidSurge = validateAlertRuleDraft({
    name: 'Campus Surge',
    ruleType: 'facility_power_surge',
    metric: 'facilityPowerMw',
    operator: '>',
    threshold: '150',
    sustainedDurationSec: '5',
    severity: 'critical',
    scopeHall: 'all',
    channelIds: ['ch-facility-mgmt'],
    autoResolve: true,
    cooldownSec: '120',
  });
  assert.equal(invalidSurge.valid, false);
  assert.ok(invalidSurge.errors.threshold);
  assert.ok(invalidSurge.errors.sustainedDurationSec);

  const validSurge = validateAlertRuleDraft({
    name: 'Campus 5MW Sustained Surge',
    ruleType: 'facility_power_surge',
    metric: 'facilityPowerMw',
    operator: '>',
    threshold: '5',
    sustainedDurationSec: '60',
    severity: 'critical',
    scopeHall: 'all',
    channelIds: ['ch-facility-mgmt'],
    autoResolve: true,
    cooldownSec: '120',
  });
  assert.equal(validSurge.valid, true);
  assert.deepEqual(validSurge.errors, {});
});

test('facility_power_surge waits for sustained duration, triggers critical alert & dispatches to Facility Management Channel, then auto-resolves', () => {
  const t0 = 1_700_000_000_000;
  const servers = createInitialServers(t0);
  const surgeRule = {
    id: 'rule-test-surge-5mw',
    name: 'Campus 5MW Surge Guard',
    ruleType: 'facility_power_surge' as const,
    metric: 'facilityPowerMw' as const,
    operator: '>' as const,
    threshold: 5,
    sustainedDurationSec: 60,
    breachStartedAt: null,
    severity: 'critical' as const,
    scopeHall: 'all' as const,
    channelIds: ['ch-slack'],
    enabled: true,
    autoResolve: true,
    cooldownSec: 120,
  };

  // Initial breach at t0 (6.4 MW > 5 MW): should start breach timer without firing yet
  const pass1 = evaluateAlertRules(servers, [surgeRule], [], INITIAL_CHANNELS, t0, {
    facilityPowerMwOverride: 6.4,
    siteCode: 'KL1',
  });
  assert.equal(pass1.newAlerts.length, 0);
  assert.equal(pass1.updatedRules[0].breachStartedAt, t0);

  // Drop below 5 MW at t0 + 30s: timer must reset
  const pass2 = evaluateAlertRules(servers, pass1.updatedRules, pass1.alerts, pass1.updatedChannels, t0 + 30_000, {
    facilityPowerMwOverride: 4.5,
    siteCode: 'KL1',
  });
  assert.equal(pass2.newAlerts.length, 0);
  assert.equal(pass2.updatedRules[0].breachStartedAt, null);

  // Start a new sustained surge at t0 + 40s (6.8 MW)
  const pass3 = evaluateAlertRules(servers, pass2.updatedRules, pass2.alerts, pass2.updatedChannels, t0 + 40_000, {
    facilityPowerMwOverride: 6.8,
    siteCode: 'KL1',
  });
  assert.equal(pass3.newAlerts.length, 0);
  assert.equal(pass3.updatedRules[0].breachStartedAt, t0 + 40_000);

  // Still breaching at t0 + 100s (elapsed = 60s >= sustainedDurationSec): must fire critical alert & auto-dispatch to Facility Management Channel
  const pass4 = evaluateAlertRules(servers, pass3.updatedRules, pass3.alerts, pass3.updatedChannels, t0 + 100_000, {
    facilityPowerMwOverride: 7.2,
    siteCode: 'KL1',
  });
  assert.equal(pass4.newAlerts.length, 1);
  const surgeAlert = pass4.newAlerts[0];
  assert.equal(surgeAlert.severity, 'critical');
  assert.equal(surgeAlert.serverId, 'facility-power-plant');
  assert.equal(surgeAlert.serverHostname, 'KL1 · Total Facility Power');
  assert.ok(surgeAlert.dispatchedChannelNames.includes('Facility Management Channel'));
  assert.ok(
    pass4.newDispatches.some(
      (d) => d.alertId === surgeAlert.id && d.channelId === 'ch-facility-mgmt' && d.status === 'Delivered'
    )
  );

  // Recover below hysteresis margin (4.2 MW < 5 - 0.25 MW): alert should auto-resolve
  const pass5 = evaluateAlertRules(servers, pass4.updatedRules, pass4.alerts, pass4.updatedChannels, t0 + 120_000, {
    facilityPowerMwOverride: 4.2,
    siteCode: 'KL1',
  });
  const resolved = pass5.alerts.find((a) => a.id === surgeAlert.id);
  assert.equal(resolved?.state, 'resolved');
  assert.equal(resolved?.resolvedAt, t0 + 120_000);
});

test('filterServers filters accurately by rack manufacturer and power density rating', () => {
  const servers = createInitialServers(1_700_000_000_000);
  const rackMap = new Map(INITIAL_RACKS.map((r) => [r.id, r]));

  const schneider = filterServers(
    servers,
    { search: '', hallId: 'all', status: 'all', rackId: 'all', rackManufacturer: 'Schneider Electric' },
    INITIAL_RACKS
  );
  assert.equal(schneider.length, 6);
  assert.ok(schneider.every((s) => rackMap.get(s.rackId)?.manufacturer === 'Schneider Electric'));

  const vertiv = filterServers(
    servers,
    { search: '', hallId: 'all', status: 'all', rackId: 'all', rackManufacturer: 'Vertiv' },
    INITIAL_RACKS
  );
  assert.equal(vertiv.length, 6);
  assert.ok(vertiv.every((s) => rackMap.get(s.rackId)?.manufacturer === 'Vertiv'));

  const highDensity = filterServers(
    servers,
    { search: '', hallId: 'all', status: 'all', rackId: 'all', powerDensityRating: 'High-Density (22 kW)' },
    INITIAL_RACKS
  );
  assert.equal(highDensity.length, 6);
  assert.ok(highDensity.every((s) => rackMap.get(s.rackId)?.powerDensityRating === 'High-Density (22 kW)'));

  const mediumDensity = filterServers(
    servers,
    { search: '', hallId: 'all', status: 'all', rackId: 'all', powerDensityRating: 'Medium (14–16 kW)' },
    INITIAL_RACKS
  );
  assert.equal(mediumDensity.length, 12);

  // Combining Hall B + Schneider Electric yields the 3 high-density Schneider Electric GPU hosts
  const combined = filterServers(
    servers,
    { search: '', hallId: 'hall-b', status: 'all', rackId: 'all', rackManufacturer: 'Schneider Electric' },
    INITIAL_RACKS
  );
  assert.equal(combined.length, 3);
  assert.ok(combined.every((s) => s.hallId === 'hall-b' && rackMap.get(s.rackId)?.manufacturer === 'Schneider Electric'));
});

test('evaluateRackPowerCapacityAlerts triggers Critical Power Capacity alerts, deduplicates, and auto-resolves upon recovery', () => {
  const t0 = 1_700_000_000_000;
  const servers = createInitialServers(t0);
  const bms = createInitialBmsState(t0);

  // Pass 1: initial racks include B-R03-10 and B-R12-11 exceeding 22 kW rated limit
  const pass1 = evaluateRackPowerCapacityAlerts({
    racks: INITIAL_RACKS,
    bms,
    servers,
    existingAlerts: [],
    channels: INITIAL_CHANNELS,
    now: t0,
    siteCode: 'KL1',
  });

  assert.ok(pass1.exceededRackIds.includes('B-R03-10'));
  assert.ok(pass1.exceededRackIds.includes('B-R12-11'));
  const overAlert = pass1.newAlerts.find(
    (a) => a.ruleId === RACK_CRITICAL_POWER_RULE_ID && a.rackId === 'B-R03-10'
  );
  assert.ok(overAlert, 'Expected Critical Power Capacity alert for B-R03-10');
  assert.equal(overAlert.ruleName, RACK_CRITICAL_POWER_RULE_NAME);
  assert.equal(overAlert.severity, 'critical');
  assert.equal(overAlert.metric, 'rackPowerKw');
  assert.ok(overAlert.currentValue > overAlert.threshold);
  assert.ok(pass1.newDispatches.some((d) => d.alertId === overAlert.id));

  // Pass 2: deduplication on subsequent tick while still exceeded
  const pass2 = evaluateRackPowerCapacityAlerts({
    racks: INITIAL_RACKS,
    bms,
    servers,
    existingAlerts: pass1.alerts,
    channels: pass1.updatedChannels,
    now: t0 + 3000,
    siteCode: 'KL1',
  });
  const openForB03 = pass2.alerts.filter(
    (a) => a.ruleId === RACK_CRITICAL_POWER_RULE_ID && a.rackId === 'B-R03-10' && a.state !== 'resolved'
  );
  assert.equal(openForB03.length, 1);
  assert.equal(pass2.newAlerts.length, 0);

  // Pass 3: drop BMS UPS demand so racks return safely below rated limit -> auto-resolves
  const reducedBms = {
    ...bms,
    upsSystems: bms.upsSystems.map((u) => ({ ...u, loadKw: Math.round(u.loadKw * 0.72) })),
  };
  const pass3 = evaluateRackPowerCapacityAlerts({
    racks: INITIAL_RACKS,
    bms: reducedBms,
    servers,
    existingAlerts: pass2.alerts,
    channels: pass2.updatedChannels,
    now: t0 + 6000,
    siteCode: 'KL1',
  });
  const resolved = pass3.alerts.find((a) => a.id === overAlert.id);
  assert.equal(resolved?.state, 'resolved');
  assert.equal(resolved?.resolvedAt, t0 + 6000);
});

test('stepTelemetryTick integrates Critical Power Capacity evaluation when racks and bms are supplied', () => {
  const t0 = 1_700_000_000_000;
  const servers = createInitialServers(t0);
  const bms = createInitialBmsState(t0);

  const tickRes = stepTelemetryTick({
    servers,
    rules: INITIAL_ALERT_RULES,
    alerts: [],
    dispatchLogs: [],
    channels: INITIAL_CHANNELS,
    racks: INITIAL_RACKS,
    bms,
    siteCode: 'KL1',
    tickCount: 1,
    now: t0 + 3000,
  });

  const capAlerts = tickRes.alerts.filter(
    (a) => a.ruleName === RACK_CRITICAL_POWER_RULE_NAME && a.severity === 'critical'
  );
  assert.ok(capAlerts.length >= 2, 'Expected stepTelemetryTick to fire Critical Power Capacity alerts');

  const thermalAlerts = tickRes.alerts.filter(
    (a) => a.ruleId === RACK_THERMAL_VIOLATION_RULE_ID && a.rackId === 'B-R01-01'
  );
  assert.equal(thermalAlerts.length, 1, 'Expected stepTelemetryTick to fire per-rack thermal violation for B-R01-01');
  assert.equal(thermalAlerts[0].metric, 'rackAvgTempC');
  assert.equal(thermalAlerts[0].ruleName, RACK_THERMAL_VIOLATION_RULE_NAME);
  assert.ok(thermalAlerts[0].currentValue >= DEFAULT_RACK_THERMAL_WARNING_C);
});

test('evaluateRackPowerCapacityAlerts detects per-rack thermal violations from average server temperature, escalates to critical, respects hysteresis, and auto-resolves', () => {
  const t0 = 1_700_000_000_000;
  const servers = createInitialServers(t0);
  const bms = createInitialBmsState(t0);

  // Pass 1: B-R01-01 hosts 3 live GPU servers (81.4, 63.2, 64.5 => avg 69.7°C >= 65°C warning)
  const pass1 = evaluateRackPowerCapacityAlerts({
    racks: INITIAL_RACKS,
    bms,
    servers,
    existingAlerts: [],
    channels: INITIAL_CHANNELS,
    now: t0,
    siteCode: 'KL1',
  });

  assert.ok(pass1.thermalViolationRackIds.includes('B-R01-01'));
  const thmAlert = pass1.newAlerts.find(
    (a) => a.ruleId === RACK_THERMAL_VIOLATION_RULE_ID && a.rackId === 'B-R01-01'
  );
  assert.ok(thmAlert, 'Expected Rack Thermal Sensor Violation alert for B-R01-01');
  assert.equal(thmAlert.severity, 'warning');
  assert.equal(thmAlert.metric, 'rackAvgTempC');
  assert.equal(thmAlert.threshold, DEFAULT_RACK_THERMAL_WARNING_C);
  assert.equal(thmAlert.currentValue, 69.7);
  // Warning alerts should dispatch to Slack (minSeverity: warning) but not PagerDuty (minSeverity: critical)
  assert.ok(thmAlert.dispatchedChannelNames.includes('Slack #dc-ops-alerts'));
  assert.ok(!thmAlert.dispatchedChannelNames.includes('PagerDuty NOC Primary'));

  // Pass 2: Escalate B-R01-01 average server temp >= 72°C by spiking a second server in B-R01-01
  const escalatedServers = servers.map((s) =>
    s.id === 'srv-b01-02' ? applyFaultToServer(s, 'thermal_spike') : s
  );
  const pass2 = evaluateRackPowerCapacityAlerts({
    racks: INITIAL_RACKS,
    bms,
    servers: escalatedServers,
    existingAlerts: pass1.alerts,
    channels: pass1.updatedChannels,
    now: t0 + 3000,
    siteCode: 'KL1',
  });

  const openForB01 = pass2.alerts.filter(
    (a) => a.ruleId === RACK_THERMAL_VIOLATION_RULE_ID && a.rackId === 'B-R01-01' && a.state !== 'resolved'
  );
  assert.equal(openForB01.length, 1, 'Escalation must update existing open alert in-place without duplicating');
  assert.equal(openForB01[0].severity, 'critical');
  assert.equal(openForB01[0].threshold, DEFAULT_RACK_THERMAL_CRITICAL_C);
  assert.ok(openForB01[0].currentValue >= DEFAULT_RACK_THERMAL_CRITICAL_C);
  assert.ok(
    openForB01[0].dispatchedChannelNames.includes('PagerDuty NOC Primary'),
    'Escalation to critical should dispatch to critical-tier channels'
  );
  assert.ok(
    pass2.newDispatches.some((d) => d.alertId === openForB01[0].id && d.channelId === 'ch-pagerduty')
  );

  // Pass 3: Hysteresis deadband (avg = 64.2°C, between 63.5°C and 65.0°C) keeps alert open without flapping
  const deadbandServers = servers.map((s) =>
    s.rackId === 'B-R01-01' ? { ...s, activeFault: null, tempC: 64.2 } : s
  );
  const pass3 = evaluateRackPowerCapacityAlerts({
    racks: INITIAL_RACKS,
    bms,
    servers: deadbandServers,
    existingAlerts: pass2.alerts,
    channels: pass2.updatedChannels,
    now: t0 + 6000,
    siteCode: 'KL1',
  });
  const stillOpen = pass3.alerts.find((a) => a.id === thmAlert.id);
  assert.equal(stillOpen?.state, 'active');
  assert.equal(stillOpen?.currentValue, 64.2);

  // Pass 4: Recover rack avg temp below hysteresis threshold (<= 63.5°C) -> auto-resolves
  const cooledServers = servers.map((s) =>
    s.id === 'srv-b01-01' ? applyFaultToServer(s, null) : s
  );
  const pass4 = evaluateRackPowerCapacityAlerts({
    racks: INITIAL_RACKS,
    bms,
    servers: cooledServers,
    existingAlerts: pass3.alerts,
    channels: pass3.updatedChannels,
    now: t0 + 9000,
    siteCode: 'KL1',
  });
  const resolved = pass4.alerts.find((a) => a.id === thmAlert.id);
  assert.equal(resolved?.state, 'resolved');
  assert.equal(resolved?.resolvedAt, t0 + 9000);
  assert.ok(!pass4.thermalViolationRackIds.includes('B-R01-01'));
});

test('evaluateRackPowerCapacityAlerts ignores maintenance-only racks and auto-resolves open thermal alerts on maintenance drain', () => {
  const t0 = 1_700_000_000_000;
  const servers = createInitialServers(t0);
  const bms = createInitialBmsState(t0);

  const pass1 = evaluateRackPowerCapacityAlerts({
    racks: INITIAL_RACKS,
    bms,
    servers,
    existingAlerts: [],
    channels: INITIAL_CHANNELS,
    now: t0,
    siteCode: 'KL1',
  });
  const openB01 = pass1.alerts.find(
    (a) => a.ruleId === RACK_THERMAL_VIOLATION_RULE_ID && a.rackId === 'B-R01-01'
  );
  assert.ok(openB01, 'B-R01-01 should initially have an active thermal violation');

  // Put all servers in B-R01-01 into maintenance
  const maintServers = servers.map((s) =>
    s.rackId === 'B-R01-01' ? { ...s, status: 'maintenance' as const } : s
  );
  const pass2 = evaluateRackPowerCapacityAlerts({
    racks: INITIAL_RACKS,
    bms,
    servers: maintServers,
    existingAlerts: pass1.alerts,
    channels: pass1.updatedChannels,
    now: t0 + 3000,
    siteCode: 'KL1',
  });
  const resolvedB01 = pass2.alerts.find((a) => a.id === openB01.id);
  assert.equal(resolvedB01?.state, 'resolved');
  assert.ok(!pass2.thermalViolationRackIds.includes('B-R01-01'));
});

test('hallThermalPolicies enforce per-hall warning/critical/disabled overrides and sanitizeHallThermalPolicy clamps safely', async () => {
  const { createDefaultHallThermalPolicies, sanitizeHallThermalPolicy } = await import(
    './hallThermalPolicyEngine'
  );

  const clamped = sanitizeHallThermalPolicy('hall-a', {
    warningTempC: 79,
    criticalTempC: 75,
    hysteresisC: 12,
    enabled: true,
  });
  assert.equal(clamped.warningTempC, 79);
  assert.equal(clamped.criticalTempC, 81);
  assert.equal(clamped.hysteresisC, 5.0);

  const t0 = 1_700_000_000_000;
  const servers = createInitialServers(t0);
  const bms = createInitialBmsState(t0);
  const policies = createDefaultHallThermalPolicies();

  policies['hall-b'] = sanitizeHallThermalPolicy('hall-b', {
    warningTempC: 60,
    criticalTempC: 68,
    hysteresisC: 2.0,
    enabled: true,
  });

  const tightened = evaluateRackPowerCapacityAlerts({
    racks: INITIAL_RACKS,
    bms,
    servers,
    existingAlerts: [],
    channels: INITIAL_CHANNELS,
    now: t0,
    siteCode: 'KL1',
    hallThermalPolicies: policies,
  });

  const b01Alert = tightened.alerts.find(
    (a) => a.ruleId === RACK_THERMAL_VIOLATION_RULE_ID && a.rackId === 'B-R01-01'
  );
  assert.ok(b01Alert, 'Expected Hall B tightened thermal policy to alert B-R01-01');
  assert.equal(b01Alert.severity, 'critical');
  assert.equal(b01Alert.threshold, 68);

  const disabledPolicies = {
    ...policies,
    'hall-b': { ...policies['hall-b'], enabled: false },
  };
  const disabledRes = evaluateRackPowerCapacityAlerts({
    racks: INITIAL_RACKS,
    bms,
    servers,
    existingAlerts: tightened.alerts,
    channels: tightened.updatedChannels,
    now: t0 + 3000,
    siteCode: 'KL1',
    hallThermalPolicies: disabledPolicies,
  });
  const resolvedB01 = disabledRes.alerts.find((a) => a.id === b01Alert.id);
  assert.equal(resolvedB01?.state, 'resolved');
  assert.ok(!disabledRes.thermalViolationRackIds.includes('B-R01-01'));
});




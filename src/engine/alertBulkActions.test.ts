import assert from 'node:assert/strict';
import test from 'node:test';
import { computeAlarmSoundDecision } from './alarmAudio';
import {
  bulkAcknowledgeAlerts,
  bulkClearAlerts,
  bulkIgnoreAlerts,
  isAlertOpen,
  pruneSelectedAlertIds,
  restoreIgnoredAlert,
} from './alertBulkActions';
import { INITIAL_ALERT_RULES, INITIAL_CHANNELS, INITIAL_RACKS, createInitialAlerts, createInitialServers } from './seedData';
import { computeFacilitySummary, deriveNodeStatus, evaluateAlertRules } from './telemetryEngine';

const FIXED_NOW = Date.UTC(2026, 10, 21, 8, 30, 0);

test('bulkIgnoreAlerts suppresses selected open alerts, silences alarm horn, and updates facility open counts', () => {
  const servers = createInitialServers(FIXED_NOW);
  const alerts = createInitialAlerts(FIXED_NOW);
  // Seeded alerts: 1 critical active (gpu-b01-x01), 1 warning active (hyp-a01-v01), 1 warning acknowledged (gpu-b02-x05)
  const activeIds = alerts.filter((a) => a.state === 'active').map((a) => a.id);
  assert.equal(activeIds.length, 2);

  const ignored = bulkIgnoreAlerts(alerts, activeIds, 'Elena Vance', FIXED_NOW + 5000);
  assert.equal(ignored.affectedCount, 2);

  const ignoredItems = ignored.alerts.filter((a) => a.state === 'ignored');
  assert.equal(ignoredItems.length, 2);
  assert.equal(ignoredItems[0].ignoredBy, 'Elena Vance');
  assert.equal(ignoredItems[0].ignoredAt, FIXED_NOW + 5000);

  // Remaining acknowledged alert is still open; ignored alerts are excluded from open counts & alarm horn
  const summary = computeFacilitySummary(servers, INITIAL_RACKS, ignored.alerts);
  assert.equal(summary.activeAlertCount, 1);
  assert.equal(summary.activeCriticalCount, 0);
  assert.equal(summary.unacknowledgedCount, 0);

  const alarm = computeAlarmSoundDecision(ignored.alerts, false);
  assert.equal(alarm.shouldSound, false);
  assert.equal(alarm.level, 'none');

  // Ignored alert should NOT re-trigger duplicate active alerts on subsequent telemetry evaluation
  const evalNext = evaluateAlertRules(
    servers,
    INITIAL_ALERT_RULES,
    ignored.alerts,
    INITIAL_CHANNELS,
    FIXED_NOW + 8000
  );
  assert.equal(evalNext.newAlerts.length, 0);
  assert.equal(evalNext.alerts.filter((a) => a.state === 'ignored').length, 2);

  // Restoring one ignored alert brings it back to active state
  const restored = restoreIgnoredAlert(ignored.alerts, activeIds[0]);
  const restoredItem = restored.find((a) => a.id === activeIds[0]);
  assert.equal(restoredItem?.state, 'active');
  assert.equal(restoredItem?.ignoredBy, null);
  assert.equal(isAlertOpen(restoredItem!), true);
});

test('bulkClearAlerts resolves open/ignored alerts, honors rule cooldown, and purges already-resolved alerts', () => {
  const servers = createInitialServers(FIXED_NOW);
  const alerts = createInitialAlerts(FIXED_NOW);
  const allOpenIds = alerts.map((a) => a.id);

  // First pass: Clear all 3 open alerts -> transitions them to resolved
  const firstClear = bulkClearAlerts(alerts, allOpenIds, FIXED_NOW + 10_000);
  assert.equal(firstClear.clearedOpenCount, 3);
  assert.equal(firstClear.removedResolvedCount, 0);
  assert.equal(firstClear.affectedCount, 3);
  assert.equal(firstClear.alerts.every((a) => a.state === 'resolved'), true);

  // Affected server statuses recover when alerts are cleared
  const gpuNode = servers.find((s) => s.id === 'srv-b01-01')!;
  assert.equal(deriveNodeStatus({ ...gpuNode, tempC: 60, cpu: 50, memory: 60 }, firstClear.alerts), 'nominal');

  // Immediate next telemetry tick within rule cooldownSec does NOT spam-recreate cleared alerts
  const tickWithinCooldown = evaluateAlertRules(
    servers,
    INITIAL_ALERT_RULES,
    firstClear.alerts,
    INITIAL_CHANNELS,
    FIXED_NOW + 13_000
  );
  assert.equal(tickWithinCooldown.newAlerts.length, 0);

  // Second pass: Clearing already-resolved alerts permanently purges them from the list
  const purge = bulkClearAlerts(firstClear.alerts, [allOpenIds[0], allOpenIds[1]], FIXED_NOW + 15_000);
  assert.equal(purge.clearedOpenCount, 0);
  assert.equal(purge.removedResolvedCount, 2);
  assert.equal(purge.alerts.length, 1);
  assert.equal(purge.alerts[0].id, allOpenIds[2]);
});

test('bulkAcknowledgeAlerts and pruneSelectedAlertIds handle mixed states safely', () => {
  const alerts = createInitialAlerts(FIXED_NOW);
  const ids = alerts.map((a) => a.id);

  const acked = bulkAcknowledgeAlerts(alerts, ids, 'Farid Hakim', FIXED_NOW + 2000);
  // Only the 2 active alerts should be counted as newly acknowledged (the 3rd was already acknowledged)
  assert.equal(acked.affectedCount, 2);
  assert.equal(acked.alerts.every((a) => a.state === 'acknowledged'), true);

  const selected = new Set([ids[0], ids[1], 'non-existent-id']);
  const pruned = pruneSelectedAlertIds(selected, [alerts[1]]);
  assert.deepEqual(Array.from(pruned), [ids[1]]);
});

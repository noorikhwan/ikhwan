import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialRackLocks } from './enterpriseOpsEngine';
import { buildPowerChainSnapshot } from './powerChainEngine';
import { computeBmsSensorRackStats, computeRackThermalStats } from './rackHeatmapEngine';
import { INITIAL_RACKS } from './seedData';
import { createAllSitesInitialState } from './sites';
import { createInitialProfiles } from './shiftEngine';
import { createInitialVisitors } from './visitorEngine';
import {
  buildHallThermalCsv,
  buildUrlWorkspaceSearch,
  computeHorizonRackValues,
  computeSecurityThermalCorrelations,
  getWorkspaceRoleConfig,
  interpolateDeltaThermalColor,
  parseUrlWorkspaceParams,
  resolveSldBlastHighlight,
} from './opsEnhancementsEngine';

test('computeHorizonRackValues supports -1h/-6h/-24h playback and signed delta1h thermal drift', () => {
  const now = Date.UTC(2026, 10, 22, 12, 0, 0);
  const kl1 = createAllSitesInitialState(now).kl1;
  const thermalStats = computeRackThermalStats(INITIAL_RACKS, kl1.servers, kl1.bms);
  const sensorStats = computeBmsSensorRackStats(INITIAL_RACKS, kl1.bms, kl1.servers);

  const liveVals = computeHorizonRackValues(INITIAL_RACKS, thermalStats, sensorStats, 'live', false);
  const minus6hVals = computeHorizonRackValues(INITIAL_RACKS, thermalStats, sensorStats, '-6h', false);
  const deltaVals = computeHorizonRackValues(INITIAL_RACKS, thermalStats, sensorStats, 'delta1h', false);

  assert.equal(liveVals['B-R01-01'], thermalStats['B-R01-01'].avgTempC);
  assert.ok(
    minus6hVals['B-R01-01'] < liveVals['B-R01-01'],
    'Overnight -6h playback should be cooler than peak live load'
  );
  assert.ok(
    deltaVals['B-R01-01'] > 0,
    'Hot row B-R01-01 should show positive warming drift vs 1h ago'
  );

  const warmingColor = interpolateDeltaThermalColor(4.2, -5, 5);
  const coolingColor = interpolateDeltaThermalColor(-4.2, -5, 5);
  assert.ok(warmingColor.r > coolingColor.r && coolingColor.b > warmingColor.b);
});

test('computeSecurityThermalCorrelations flags door-open/unlocked cabinets alongside live thermal telemetry', () => {
  const now = Date.UTC(2026, 10, 22, 12, 0, 0);
  const kl1 = createAllSitesInitialState(now).kl1;
  const locks = createInitialRackLocks('kl1', now);
  const visitors = createInitialVisitors(createInitialProfiles(), now);
  const thermalStats = computeRackThermalStats(INITIAL_RACKS, kl1.servers, kl1.bms);
  const sensorStats = computeBmsSensorRackStats(INITIAL_RACKS, kl1.bms, kl1.servers);

  const correlations = computeSecurityThermalCorrelations(
    locks,
    visitors,
    'kl1',
    thermalStats,
    sensorStats
  );
  assert.ok(correlations.length >= 1, 'Expected at least one door-open/unlocked rack correlation in KL1');
  assert.equal(correlations[0].rackId, 'B-R01-01');
  assert.equal(correlations[0].hallId, 'hall-b');
  assert.ok(correlations[0].rackTempC > 30);
  assert.ok(correlations[0].summary.includes(correlations[0].rackId));
});

test('resolveSldBlastHighlight, buildHallThermalCsv, RBAC roles, and URL deep-link helpers work accurately', () => {
  const now = Date.UTC(2026, 10, 22, 12, 0, 0);
  const kl1 = createAllSitesInitialState(now).kl1;
  const snapshot = buildPowerChainSnapshot({
    siteId: 'kl1',
    bms: kl1.bms,
    servers: kl1.servers,
    faults: { trippedNodeIds: ['ups-bank-a'], bypassUpsIds: [] },
    selectedNodeId: 'ups-bank-a',
  });
  const upsNode = snapshot.nodes.find((n) => n.id === 'ups-bank-a')!;
  const blast = resolveSldBlastHighlight(upsNode);
  assert.equal(blast.busLabel, 'Path A');
  assert.equal(blast.severity, 'critical');
  assert.equal(blast.hallIds.length, 4);

  const hallBRacks = INITIAL_RACKS.filter((r) => r.hallId === 'hall-b');
  const thermalStats = computeRackThermalStats(INITIAL_RACKS, kl1.servers, kl1.bms);
  const sensorStats = computeBmsSensorRackStats(INITIAL_RACKS, kl1.bms, kl1.servers);
  const csv = buildHallThermalCsv('Hall B · AI & GPU Fabric', hallBRacks, thermalStats, sensorStats, kl1.bms);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 401, 'Header + 400 Hall B rack rows');
  assert.ok(lines[0].includes('BMS Sensor Temp (C)'));

  const tenantRole = getWorkspaceRoleConfig('colocation_tenant');
  assert.equal(tenantRole.canControlBms, false);
  assert.ok(Array.isArray(tenantRole.allowedTabs) && tenantRole.allowedTabs.includes('tenants'));

  const qs = buildUrlWorkspaceSearch({
    siteId: 'kl2',
    tab: 'racks',
    hallId: 'hall-c',
    rackId: 'C-R04-05',
    sensorHeatmap: true,
  });
  const parsed = parseUrlWorkspaceParams(qs);
  assert.equal(parsed.siteId, 'kl2');
  assert.equal(parsed.tab, 'racks');
  assert.equal(parsed.hallId, 'hall-c');
  assert.equal(parsed.rackId, 'C-R04-05');
  assert.equal(parsed.sensorHeatmap, true);
});

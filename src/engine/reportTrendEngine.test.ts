import assert from 'node:assert/strict';
import test from 'node:test';
import { generateEquipmentPointReport } from './equipmentPointExtractor';
import { generateDcimReport, ReportTypeId } from './reportEngine';
import { buildReportTrendModel } from './reportTrendEngine';
import { INITIAL_RACKS } from './seedData';
import { createAllSitesInitialState } from './sites';

test('buildReportTrendModel produces valid trend metrics for all 8 DCIM report types', () => {
  const now = Date.UTC(2026, 10, 22, 4, 0, 0);
  const sitesMap = createAllSitesInitialState(now);
  const types: ReportTypeId[] = [
    'executive_summary',
    'historical_trends',
    'equipment_points',
    'cold_aisle_sla',
    'tier4_redundancy',
    'server_inventory',
    'rack_capacity',
    'alerts_audit',
  ];

  for (const typeId of types) {
    const report = generateDcimReport({
      config: {
        typeId,
        siteScope: typeId === 'executive_summary' ? 'all' : 'kl1',
        hallScope: 'all',
        recordFilter: 'all',
        historyHorizon: '1y',
      },
      sitesMap,
      racks: INITIAL_RACKS,
      now,
    });
    const model = buildReportTrendModel(report);
    assert.equal(model.reportId, report.id);
    assert.ok(model.metrics.length >= 1, `Expected >= 1 trend metric for ${typeId}`);
    for (const metric of model.metrics) {
      assert.ok(metric.data.length >= 1, `Expected plotted points for ${typeId}:${metric.id}`);
      assert.ok(metric.series.length >= 1, `Expected series definitions for ${typeId}:${metric.id}`);
    }
  }
});

test('buildReportTrendModel supports custom-interval equipment point reports in both long and wide layouts', () => {
  const now = Date.UTC(2026, 10, 22, 4, 0, 0);
  const sitesMap = createAllSitesInitialState(now);

  const longReport = generateEquipmentPointReport({
    config: {
      siteScope: 'kl1',
      categoryFilter: 'chiller',
      selectedEquipmentUids: ['kl1::chw-01', 'kl1::cha-a1'],
      selectedPointKeys: ['chw_supply_temp_c', 'cooling_output_kw'],
      windowPreset: '6h',
      interval: { value: 30, unit: 'minutes' },
      aggregation: 'avg',
      layout: 'long',
    },
    sitesMap,
    now,
  });

  const longTrend = buildReportTrendModel(longReport);
  assert.equal(longTrend.metrics.length, 2);
  assert.equal(longTrend.metrics[0].chartKind, 'line');
  assert.equal(longTrend.metrics[0].series.length, 2);
  assert.ok(longTrend.metrics[0].data.length >= 10);

  const wideReport = generateEquipmentPointReport({
    config: {
      siteScope: 'kl1',
      categoryFilter: 'chiller',
      selectedEquipmentUids: ['kl1::chw-01', 'kl1::cha-a1'],
      selectedPointKeys: ['chw_supply_temp_c', 'cooling_output_kw'],
      windowPreset: '6h',
      interval: { value: 30, unit: 'minutes' },
      aggregation: 'avg',
      layout: 'wide',
    },
    sitesMap,
    now,
  });

  const wideTrend = buildReportTrendModel(wideReport);
  assert.ok(wideTrend.metrics.length >= 2);
  assert.equal(wideTrend.metrics[0].chartKind, 'line');
  assert.ok(wideTrend.metrics[0].data.length >= 10);
});

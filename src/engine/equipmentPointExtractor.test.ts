import test from 'node:test';
import assert from 'node:assert/strict';
import { createAllSitesInitialState } from './sites';
import {
  MAX_EXTRACTION_INTERVALS,
  buildExtractableEquipmentCatalog,
  buildIntervalTimestamps,
  formatIntervalLabel,
  generateEquipmentPointReport,
  intervalToMs,
} from './equipmentPointExtractor';

const FIXED_NOW = Date.UTC(2026, 10, 21, 12, 0, 0);

test('buildExtractableEquipmentCatalog exposes all BMS & server equipment per site including 16 chillers, 2 square tanks, 4 UPS, 8 generators, 8 diesel tanks, and 24 servers', () => {
  const sitesMap = createAllSitesInitialState(FIXED_NOW);
  const kl1Catalog = buildExtractableEquipmentCatalog(sitesMap, 'kl1');

  assert.equal(kl1Catalog.filter((e) => e.category === 'chiller').length, 16); // 2 Water + 14 Air
  assert.equal(kl1Catalog.filter((e) => e.category === 'chw_tank_pump').length, 2);
  assert.equal(kl1Catalog.filter((e) => e.category === 'crac_cdu').length, 8);
  assert.equal(kl1Catalog.filter((e) => e.category === 'switchgear').length, 6);
  assert.equal(kl1Catalog.filter((e) => e.category === 'ups').length, 4);
  assert.equal(kl1Catalog.filter((e) => e.category === 'generator').length, 8);
  assert.equal(kl1Catalog.filter((e) => e.category === 'diesel_tank').length, 8);
  assert.equal(kl1Catalog.filter((e) => e.category === 'cold_aisle_sla').length, 4);
  assert.equal(kl1Catalog.filter((e) => e.category === 'gateway').length, 6);
  assert.equal(kl1Catalog.filter((e) => e.category === 'server').length, 24);
  assert.equal(kl1Catalog.length, 86);

  for (const eq of kl1Catalog) {
    assert.ok(eq.points.length >= 2, `${eq.uid} must expose multiple extractable points`);
  }

  const allSitesCatalog = buildExtractableEquipmentCatalog(sitesMap, 'all');
  assert.equal(allSitesCatalog.length, 86 * 3);
});

test('custom interval math supports seconds, minutes, hours, days and respects MAX_EXTRACTION_INTERVALS cap', () => {
  assert.equal(intervalToMs({ value: 3, unit: 'seconds' }), 5_000); // min 5s clamp
  assert.equal(intervalToMs({ value: 10, unit: 'seconds' }), 10_000);
  assert.equal(intervalToMs({ value: 12, unit: 'minutes' }), 12 * 60_000);
  assert.equal(intervalToMs({ value: 2, unit: 'hours' }), 2 * 3600_000);
  assert.equal(intervalToMs({ value: 1, unit: 'days' }), 24 * 3600_000);
  assert.equal(formatIntervalLabel({ value: 12, unit: 'minutes' }), '12 min');

  const sixHoursMs = 6 * 3600_000;
  const plan10Min = buildIntervalTimestamps({
    startMs: FIXED_NOW - sixHoursMs,
    endMs: FIXED_NOW,
    interval: { value: 10, unit: 'minutes' },
  });
  assert.equal(plan10Min.wasCapped, false);
  assert.equal(plan10Min.timestamps.length, 37); // 0..360 min inclusive every 10 min
  assert.equal(plan10Min.timestamps[1] - plan10Min.timestamps[0], 10 * 60_000);

  // Requesting 10-second intervals over 7 days exceeds cap and caps cleanly at MAX_EXTRACTION_INTERVALS
  const capped = buildIntervalTimestamps({
    startMs: FIXED_NOW - 7 * 24 * 3600_000,
    endMs: FIXED_NOW,
    interval: { value: 10, unit: 'seconds' },
  });
  assert.equal(capped.wasCapped, true);
  assert.equal(capped.timestamps.length, MAX_EXTRACTION_INTERVALS);
  assert.equal(capped.timestamps[capped.timestamps.length - 1], FIXED_NOW);
});

test('generateEquipmentPointReport extracts selected equipment points in both Long and Wide CSV layouts with exact custom intervals and live-anchored end values', () => {
  const sitesMap = createAllSitesInitialState(FIXED_NOW);
  const chw01LiveTemp = Number(sitesMap.kl1.bms.chillers.find((c) => c.id === 'chw-01')!.chwSupplyTempC.toFixed(2));

  const longReport = generateEquipmentPointReport({
    config: {
      siteScope: 'kl1',
      selectedEquipmentUids: ['kl1::chw-01', 'kl1::ups-a1'],
      selectedPointKeys: ['chw_supply_temp_c', 'cooling_output_kw', 'battery_soc_pct'],
      interval: { value: 20, unit: 'minutes' },
      windowPreset: '1h',
      aggregation: 'avg',
      layout: 'long',
      includeBom: false,
      includeMetadataComments: false,
    },
    sitesMap,
    now: FIXED_NOW,
  });

  // 1h at 20 min interval = 4 timestamps (0, 20, 40, 60 min)
  // Active equipment-point pairs: chw-01 (2 pts) + ups-a1 (1 pt) = 3 pairs -> 4 * 3 = 12 rows
  assert.equal(longReport.rows.length, 12);
  const csvLines = longReport.csvContent.trimEnd().split('\r\n');
  assert.equal(csvLines.length, 13);

  // Latest timestamp row for CHW-01 CHW Supply Temp matches live reading exactly
  const latestChwRows = longReport.rows.filter(
    (r) => r.equipmentId === 'CHW-01' && r.pointName === 'CHW Supply Temp'
  );
  assert.equal(latestChwRows.length, 4);
  assert.equal(latestChwRows[latestChwRows.length - 1].value, chw01LiveTemp);

  // Test Wide Matrix layout with custom Start/End range (2 hours at 30 min = 5 rows)
  const wideReport = generateEquipmentPointReport({
    config: {
      siteScope: 'kl1',
      selectedEquipmentUids: ['kl1::chw-01', 'kl1::chw-tank-a'],
      selectedPointKeys: ['chw_supply_temp_c', 'tank_level_pct'],
      interval: { value: 30, unit: 'minutes' },
      windowPreset: 'custom',
      customStartMs: FIXED_NOW - 2 * 3600_000,
      customEndMs: FIXED_NOW,
      aggregation: 'max',
      layout: 'wide',
      includeBom: false,
    },
    sitesMap,
    now: FIXED_NOW,
  });

  assert.equal(wideReport.rows.length, 5);
  // Columns: timestamp, intervalStep, + 2 selected equipment-point columns = 4 columns
  assert.equal(wideReport.columns.length, 4);
});

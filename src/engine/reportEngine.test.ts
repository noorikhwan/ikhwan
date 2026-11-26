import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReportFilename,
  escapeCsvCell,
  generateDcimReport,
  REPORT_TEMPLATES,
  serializeReportToCsv,
} from './reportEngine';
import { INITIAL_RACKS } from './seedData';
import { createAllSitesInitialState } from './sites';
import { toggleColdAisleSlaExcursion } from './bmsEngine';

const FIXED_NOW = Date.UTC(2026, 10, 20, 9, 15, 30);

test('escapeCsvCell handles commas, quotes, newlines, and nullish values per RFC 4180', () => {
  assert.equal(escapeCsvCell('KL1'), 'KL1');
  assert.equal(escapeCsvCell('Hall A, Row 1'), '"Hall A, Row 1"');
  assert.equal(escapeCsvCell('He said "OK"'), '"He said ""OK"""');
  assert.equal(escapeCsvCell('Line 1\nLine 2'), '"Line 1\nLine 2"');
  assert.equal(escapeCsvCell(null), '');
  assert.equal(escapeCsvCell(undefined), '');
  assert.equal(escapeCsvCell(21.4), '21.4');
});

test('serializeReportToCsv emits UTF-8 BOM when enabled and optional metadata header comments', () => {
  const csvWithBom = serializeReportToCsv({
    columns: [
      { key: 'site', label: 'Site' },
      { key: 'note', label: 'Note' },
    ],
    rows: [{ site: 'KL1', note: 'Tier IV, "Verified"' }],
    title: 'Test Report',
    siteScopeLabel: 'KL1',
    hallScopeLabel: 'All 4 Data Halls',
    generatedAt: FIXED_NOW,
    includeBom: true,
    includeMetadataComments: true,
  });

  assert.equal(csvWithBom.startsWith('\uFEFF# Report: Test Report\r\n'), true);
  assert.match(csvWithBom, /Site,Note\r\nKL1,"Tier IV, ""Verified"""\r\n$/);

  const csvPlain = serializeReportToCsv({
    columns: [{ key: 'site', label: 'Site' }],
    rows: [{ site: 'KL2' }],
    title: 'Plain',
    siteScopeLabel: 'KL2',
    hallScopeLabel: 'All 4 Data Halls',
    generatedAt: FIXED_NOW,
    includeBom: false,
    includeMetadataComments: false,
  });

  assert.equal(csvPlain, 'Site\r\nKL2\r\n');
});

test('buildReportFilename generates clean sanitized csv filenames', () => {
  assert.equal(
    buildReportFilename('cold_aisle_sla', 'kl1', 'hall-b', FIXED_NOW),
    'orise-dcim-kl1-hall-b-cold-aisle-sla-20261120-091530.csv'
  );
  assert.equal(
    buildReportFilename('executive_summary', 'all', 'all', FIXED_NOW),
    'orise-dcim-all-sites-executive-summary-20261120-091530.csv'
  );
});

test('all 6 report templates generate consistent CSVs for single site and all sites', () => {
  const sitesMap = createAllSitesInitialState(FIXED_NOW);

  for (const tpl of REPORT_TEMPLATES) {
    const singleReport = generateDcimReport({
      config: {
        typeId: tpl.id,
        siteScope: 'kl1',
        hallScope: 'all',
        recordFilter: 'all',
        includeBom: false,
      },
      sitesMap,
      racks: INITIAL_RACKS,
      now: FIXED_NOW,
    });

    assert.ok(singleReport.columns.length >= 6, `${tpl.id} should have detailed columns`);
    assert.ok(singleReport.rows.length > 0, `${tpl.id} should produce rows for KL1`);
    assert.ok(singleReport.filename.endsWith('.csv'));
    assert.equal(singleReport.summaryMetrics.length, 4);

    // Every CSV line count = 1 header + rows.length
    const lines = singleReport.csvContent.trimEnd().split('\r\n');
    assert.equal(lines.length, singleReport.rows.length + 1, `${tpl.id} CSV line count must match`);
  }
});

test('rack capacity report scales across 1,600 racks per site, 400 per hall, and 4,800 across KL1-KL3', () => {
  const sitesMap = createAllSitesInitialState(FIXED_NOW);

  const kl1AllHalls = generateDcimReport({
    config: {
      typeId: 'rack_capacity',
      siteScope: 'kl1',
      hallScope: 'all',
      recordFilter: 'all',
      includeBom: false,
    },
    sitesMap,
    racks: INITIAL_RACKS,
    now: FIXED_NOW,
  });
  assert.equal(kl1AllHalls.rows.length, 1600);

  const kl1HallB = generateDcimReport({
    config: {
      typeId: 'rack_capacity',
      siteScope: 'kl1',
      hallScope: 'hall-b',
      recordFilter: 'all',
      includeBom: false,
    },
    sitesMap,
    racks: INITIAL_RACKS,
    now: FIXED_NOW,
  });
  assert.equal(kl1HallB.rows.length, 400);
  assert.equal(kl1HallB.rows.every((r) => r.hallName === 'Hall B · AI & GPU Fabric'), true);

  const allSites = generateDcimReport({
    config: {
      typeId: 'rack_capacity',
      siteScope: 'all',
      hallScope: 'all',
      recordFilter: 'all',
      includeBom: false,
    },
    sitesMap,
    racks: INITIAL_RACKS,
    now: FIXED_NOW,
  });
  assert.equal(allSites.rows.length, 4800);
});

test('cold aisle SLA report covers all 12 halls across KL1-KL3 and isolates SLA breaches with issues_only filter', () => {
  const sitesMap = createAllSitesInitialState(FIXED_NOW);

  const allNominal = generateDcimReport({
    config: {
      typeId: 'cold_aisle_sla',
      siteScope: 'all',
      hallScope: 'all',
      recordFilter: 'all',
      includeBom: false,
    },
    sitesMap,
    racks: INITIAL_RACKS,
    now: FIXED_NOW,
  });
  assert.equal(allNominal.rows.length, 12);

  // Inject an SLA excursion on KL2 Hall C
  sitesMap.kl2 = {
    ...sitesMap.kl2,
    bms: toggleColdAisleSlaExcursion(sitesMap.kl2.bms, 'hall-c', FIXED_NOW),
  };

  const breachesOnly = generateDcimReport({
    config: {
      typeId: 'cold_aisle_sla',
      siteScope: 'all',
      hallScope: 'all',
      recordFilter: 'issues_only',
      includeBom: false,
    },
    sitesMap,
    racks: INITIAL_RACKS,
    now: FIXED_NOW,
  });

  assert.equal(breachesOnly.rows.length, 1);
  assert.equal(breachesOnly.rows[0].siteCode, 'KL2');
  assert.equal(breachesOnly.rows[0].tempSlaStatus, 'Breached');
  assert.equal(breachesOnly.rows[0].humiditySlaStatus, 'Breached');
});

test('server inventory report exports 24 hosts per site and 72 hosts across all sites', () => {
  const sitesMap = createAllSitesInitialState(FIXED_NOW);

  const single = generateDcimReport({
    config: {
      typeId: 'server_inventory',
      siteScope: 'kl3',
      hallScope: 'all',
      recordFilter: 'all',
    },
    sitesMap,
    racks: INITIAL_RACKS,
    now: FIXED_NOW,
  });
  assert.equal(single.rows.length, 24);
  assert.equal(single.rows.every((r) => r.siteCode === 'KL3'), true);

  const multi = generateDcimReport({
    config: {
      typeId: 'server_inventory',
      siteScope: 'all',
      hallScope: 'all',
      recordFilter: 'all',
    },
    sitesMap,
    racks: INITIAL_RACKS,
    now: FIXED_NOW,
  });
  assert.equal(multi.rows.length, 72);
});

test('Tier IV & BMS report includes 2 Water-Cooled Chillers, 14 Air-Cooled Chillers, and 8 Standby Generators per site', () => {
  const sitesMap = createAllSitesInitialState(FIXED_NOW);

  const bmsAudit = generateDcimReport({
    config: {
      typeId: 'tier4_redundancy',
      siteScope: 'all',
      hallScope: 'all',
      recordFilter: 'all',
    },
    sitesMap,
    racks: INITIAL_RACKS,
    now: FIXED_NOW,
  });

  const waterRows = bmsAudit.rows.filter((r) => r.assetCategory === 'Water-Cooled Chiller');
  const airRows = bmsAudit.rows.filter((r) => r.assetCategory === 'Air-Cooled Chiller');
  const genRows = bmsAudit.rows.filter((r) => r.assetCategory === 'Standby Diesel Generator');
  assert.equal(waterRows.length, 6, '2 water chillers x 3 sites = 6');
  assert.equal(airRows.length, 42, '14 air chillers x 3 sites = 42');
  assert.equal(genRows.length, 24, '8 standby generators x 3 sites = 24');
});

test('Multi-Year History & Trends template exports 24M (2Y) and 36M (3Y) CSV rows past 1 year', async () => {
  const { createInitialReportArchive } = await import('./reportEngine');
  const sitesMap = createAllSitesInitialState(FIXED_NOW);

  const twoYearReport = generateDcimReport({
    config: {
      typeId: 'historical_trends',
      siteScope: 'all',
      hallScope: 'all',
      recordFilter: 'all',
      historyHorizon: '2y',
      includeBom: false,
    },
    sitesMap,
    racks: INITIAL_RACKS,
    now: FIXED_NOW,
  });
  assert.equal(twoYearReport.rows.length, 24);
  assert.equal(twoYearReport.historyHorizon, '2y');
  assert.equal(twoYearReport.csvContent.trim().split('\r\n').length, 25);

  const threeYearReport = generateDcimReport({
    config: {
      typeId: 'historical_trends',
      siteScope: 'kl1',
      hallScope: 'hall-b',
      recordFilter: 'all',
      historyHorizon: '3y',
      includeBom: false,
    },
    sitesMap,
    racks: INITIAL_RACKS,
    now: FIXED_NOW,
  });
  assert.equal(threeYearReport.rows.length, 36);
  assert.equal(threeYearReport.rows[0].monthKey, '2023-12');
  assert.equal(threeYearReport.rows[35].monthKey, '2026-11');

  const archive = createInitialReportArchive(sitesMap, INITIAL_RACKS, FIXED_NOW);
  assert.ok(archive.length >= 5, 'Initial archive should contain multi-year snapshots');
  const oldest = Math.min(...archive.map((r) => r.generatedAt));
  const spanDays = (FIXED_NOW - oldest) / (24 * 60 * 60 * 1000);
  assert.ok(spanDays > 365, `Archive must span > 1 year (got ${spanDays.toFixed(0)} days)`);
});


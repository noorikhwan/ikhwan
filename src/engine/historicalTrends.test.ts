import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildHistoricalTrendSeries,
  computeHistoricalTrendSummary,
  HISTORY_HORIZONS,
  TREND_METRICS,
} from './historicalTrends';
import { INITIAL_RACKS } from './seedData';
import { createAllSitesInitialState } from './sites';

const FIXED_NOW = Date.UTC(2026, 10, 20, 10, 0, 0); // Nov 20, 2026

test('buildHistoricalTrendSeries generates exact month counts from 6M through 3Y (past 1 year)', () => {
  const sitesMap = createAllSitesInitialState(FIXED_NOW);

  for (const h of HISTORY_HORIZONS) {
    const series = buildHistoricalTrendSeries({
      sitesMap,
      racks: INITIAL_RACKS,
      siteScope: 'all',
      hallScope: 'all',
      horizon: h.id,
      now: FIXED_NOW,
    });

    assert.equal(series.length, h.months, `Horizon ${h.id} must emit ${h.months} monthly points`);
    assert.equal(series[series.length - 1].monthKey, '2026-11', 'Latest point must anchor on current month');

    // Strictly ascending timestamps
    for (let i = 1; i < series.length; i++) {
      assert.ok(series[i].timestamp > series[i - 1].timestamp, 'Points must be strictly chronological');
    }
  }

  // Verify 2Y and 3Y span well past 1 year across multiple calendar years
  const twoYear = buildHistoricalTrendSeries({
    sitesMap,
    racks: INITIAL_RACKS,
    siteScope: 'kl1',
    hallScope: 'all',
    horizon: '2y',
    now: FIXED_NOW,
  });
  assert.equal(twoYear[0].monthKey, '2024-12');
  assert.equal(twoYear[23].monthKey, '2026-11');

  const threeYear = buildHistoricalTrendSeries({
    sitesMap,
    racks: INITIAL_RACKS,
    siteScope: 'kl1',
    hallScope: 'all',
    horizon: '3y',
    now: FIXED_NOW,
  });
  assert.equal(threeYear[0].monthKey, '2023-12');
  assert.equal(threeYear[35].monthKey, '2026-11');
});

test('historical trend metrics stay within realistic DCIM & ASHRAE Class A1 envelopes', () => {
  const sitesMap = createAllSitesInitialState(FIXED_NOW);
  const series = buildHistoricalTrendSeries({
    sitesMap,
    racks: INITIAL_RACKS,
    siteScope: 'all',
    hallScope: 'all',
    horizon: '3y',
    now: FIXED_NOW,
  });

  for (const pt of series) {
    assert.ok(pt.itLoadMw > 0 && pt.peakItLoadMw >= pt.itLoadMw, 'Peak IT load must be >= avg load');
    assert.ok(pt.pue >= 1.15 && pt.pue <= 1.65, `PUE out of bounds: ${pt.pue}`);
    assert.ok(pt.coldAisleTempC >= 18.0 && pt.coldAisleTempC <= 27.0, `Cold aisle temp out of SLA: ${pt.coldAisleTempC}`);
    assert.ok(pt.coldAislePeakTempC >= pt.coldAisleTempC && pt.coldAislePeakTempC <= 27.0);
    assert.ok(pt.coldAisleHumidityPct >= 40.0 && pt.coldAisleHumidityPct <= 60.0, `Humidity out of SLA: ${pt.coldAisleHumidityPct}`);
    assert.ok(pt.slaCompliancePct >= 99.5 && pt.slaCompliancePct <= 100.0);
    assert.ok(pt.tier4AvailabilityPct >= 99.99 && pt.tier4AvailabilityPct <= 100.0);
  }
});

test('multi-site aggregate IT load equals sum of KL1 + KL2 + KL3 and Hall B GPU load exceeds Hall C', () => {
  const sitesMap = createAllSitesInitialState(FIXED_NOW);

  const allSeries = buildHistoricalTrendSeries({
    sitesMap,
    racks: INITIAL_RACKS,
    siteScope: 'all',
    hallScope: 'all',
    horizon: '2y',
    now: FIXED_NOW,
  });
  const kl1 = buildHistoricalTrendSeries({
    sitesMap,
    racks: INITIAL_RACKS,
    siteScope: 'kl1',
    hallScope: 'all',
    horizon: '2y',
    now: FIXED_NOW,
  });
  const kl2 = buildHistoricalTrendSeries({
    sitesMap,
    racks: INITIAL_RACKS,
    siteScope: 'kl2',
    hallScope: 'all',
    horizon: '2y',
    now: FIXED_NOW,
  });
  const kl3 = buildHistoricalTrendSeries({
    sitesMap,
    racks: INITIAL_RACKS,
    siteScope: 'kl3',
    hallScope: 'all',
    horizon: '2y',
    now: FIXED_NOW,
  });

  const latestAll = allSeries[allSeries.length - 1].itLoadMw;
  const latestSum =
    kl1[kl1.length - 1].itLoadMw + kl2[kl2.length - 1].itLoadMw + kl3[kl3.length - 1].itLoadMw;
  assert.ok(Math.abs(latestAll - latestSum) < 0.08, `Expected ${latestAll} ≈ ${latestSum}`);

  const hallB = buildHistoricalTrendSeries({
    sitesMap,
    racks: INITIAL_RACKS,
    siteScope: 'kl1',
    hallScope: 'hall-b',
    horizon: '2y',
    now: FIXED_NOW,
  });
  const hallC = buildHistoricalTrendSeries({
    sitesMap,
    racks: INITIAL_RACKS,
    siteScope: 'kl1',
    hallScope: 'hall-c',
    horizon: '2y',
    now: FIXED_NOW,
  });

  assert.ok(
    hallB[hallB.length - 1].itLoadMw > hallC[hallC.length - 1].itLoadMw,
    'Hall B (AI & GPU) should carry higher IT load than Hall C'
  );
});

test('computeHistoricalTrendSummary computes YoY delta for >1Y horizons and null YoY for <=12M', () => {
  const sitesMap = createAllSitesInitialState(FIXED_NOW);

  const shortSeries = buildHistoricalTrendSeries({
    sitesMap,
    racks: INITIAL_RACKS,
    siteScope: 'kl1',
    hallScope: 'all',
    horizon: '1y',
    now: FIXED_NOW,
  });
  const shortSummary = computeHistoricalTrendSummary(shortSeries, 'itLoadMw');
  assert.equal(shortSummary.yoyDelta, null, '12-month series has no 13th point for YoY delta');

  const multiYearSeries = buildHistoricalTrendSeries({
    sitesMap,
    racks: INITIAL_RACKS,
    siteScope: 'kl1',
    hallScope: 'all',
    horizon: '2y',
    now: FIXED_NOW,
  });

  for (const metric of TREND_METRICS) {
    const summary = computeHistoricalTrendSummary(multiYearSeries, metric.id);
    assert.equal(summary.horizonMonths, 24);
    assert.equal(summary.yearSpanLabel, 'Dec 2024 – Nov 2026');
    assert.ok(summary.yoyDelta !== null, `2Y summary for ${metric.id} must include YoY delta`);
    assert.equal(summary.yoyReferenceLabel, 'Nov 2025');
    assert.ok(summary.minValue <= summary.average && summary.average <= summary.maxValue);
    assert.ok(Number.isFinite(summary.forecastNextQuarter));
  }
});

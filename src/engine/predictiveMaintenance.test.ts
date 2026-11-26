import assert from 'node:assert/strict';
import test from 'node:test';
import { toggleChillerFault, toggleColdAisleSlaExcursion } from './bmsEngine';
import {
  buildSiteAiContext,
  computePredictiveMaintenance,
  createInitialWorkOrders,
  createWorkOrderFromRisk,
} from './predictiveMaintenance';
import { INITIAL_RACKS } from './seedData';
import { createAllSitesInitialState } from './sites';

const FIXED_NOW = Date.UTC(2026, 10, 20, 10, 0, 0);

test('computePredictiveMaintenance scores all critical MEP, SLA sensor, and compute host categories', () => {
  const sitesMap = createAllSitesInitialState(FIXED_NOW);
  const { risks, summary } = computePredictiveMaintenance(sitesMap.kl1, INITIAL_RACKS, 'kl1');

  // 16 chillers + 8 CRACs + 4 UPS + 8 generators + 4 hall SLA arrays + >=6 servers = >= 46 assets
  assert.ok(risks.length >= 46, `Expected >= 46 monitored risk assets, got ${risks.length}`);
  assert.ok(summary.fleetHealthScore >= 0 && summary.fleetHealthScore <= 100);
  assert.ok(summary.projectedPueReduction > 0);
  assert.ok(summary.projectedAnnualMwhSaved > 0);
  assert.equal(summary.tier4SafeWindowsReady, true);

  // Sorted strictly by failureRiskPct descending
  for (let i = 1; i < risks.length; i++) {
    assert.ok(
      risks[i - 1].failureRiskPct >= risks[i].failureRiskPct,
      'Risks must be sorted highest risk first'
    );
  }

  // Must surface the critical thermal GPU server near the top
  const hotGpu = risks.find((r) => r.assetId.includes('gpu-b01-x01'));
  assert.ok(hotGpu, 'Critical GPU node should be present in predictive risk list');
  assert.equal(hotGpu.severity, 'critical');
  assert.ok(hotGpu.estimatedRulDays <= 10, 'Critical thermal node should have imminent RUL');
});

test('predictive failure risk reacts immediately to live chiller faults and Cold Aisle SLA breaches', () => {
  const sitesMap = createAllSitesInitialState(FIXED_NOW);
  const baseBms = sitesMap.kl1.bms;
  const faultedBms = toggleColdAisleSlaExcursion(
    toggleChillerFault(baseBms, baseBms.chillers[0].id, FIXED_NOW),
    'hall-b',
    FIXED_NOW
  );

  const mutatedSite = { ...sitesMap.kl1, bms: faultedBms };
  const { risks } = computePredictiveMaintenance(mutatedSite, INITIAL_RACKS, 'kl1');

  const faultedChiller = risks.find((r) => r.assetId === baseBms.chillers[0].deviceId);
  assert.ok(faultedChiller);
  assert.equal(faultedChiller.severity, 'critical');
  assert.ok(faultedChiller.failureRiskPct >= 90);

  const breachedHall = risks.find((r) => r.category === 'sla_sensor' && r.location.includes('Hall B'));
  assert.ok(breachedHall);
  assert.equal(breachedHall.severity, 'critical');
  assert.ok(breachedHall.failureRiskPct >= 85);
});

test('work order creation and grounded AI site context include live metrics and 2-year trends', () => {
  const sitesMap = createAllSitesInitialState(FIXED_NOW);
  const { risks } = computePredictiveMaintenance(sitesMap.kl1, INITIAL_RACKS, 'kl1');

  const initialWos = createInitialWorkOrders(risks, 'kl1', FIXED_NOW);
  assert.ok(initialWos.length >= 1, 'Should seed initial preventive work orders');
  assert.equal(initialWos[0].siteId, 'kl1');

  const manualWo = createWorkOrderFromRisk(risks[0], 'kl1', FIXED_NOW);
  assert.equal(manualWo.status, 'Scheduled');
  assert.equal(manualWo.assetId, risks[0].assetId);

  const ctx = buildSiteAiContext({
    siteId: 'kl1',
    sitesMap,
    racks: INITIAL_RACKS,
    now: FIXED_NOW,
  });

  assert.equal(ctx.site.code, 'KL1');
  assert.equal(ctx.chillerPlant.waterChillers.length, 2);
  assert.equal(ctx.chillerPlant.airChillers.length, 14);
  assert.equal(ctx.cracUnits.length, 8);
  assert.equal(ctx.coldAisleSla.length, 4);
  assert.equal(ctx.twoYearTrends.span, 'Dec 2024 – Nov 2026');
  assert.equal(ctx.topAtRiskAssets.length, 10);
});

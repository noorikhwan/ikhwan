import assert from 'node:assert/strict';
import test from 'node:test';
import { computeGlobalFleetOverview, simulateCrossSiteFailover } from './globalNocEngine';
import { INITIAL_RACKS } from './seedData';
import { createAllSitesInitialState } from './sites';

test('computeGlobalFleetOverview rolls up KL1, KL2, and KL3 fleet metrics accurately', () => {
  const sitesMap = createAllSitesInitialState(1_700_000_000_000);
  const overview = computeGlobalFleetOverview(sitesMap, INITIAL_RACKS);

  assert.equal(overview.sites.length, 3);
  assert.deepEqual(
    overview.sites.map((s) => s.code),
    ['KL1', 'KL2', 'KL3']
  );

  const sumItMw = overview.sites.reduce((s, r) => s + r.itLoadMw, 0);
  assert.ok(Math.abs(overview.totalItLoadMw - sumItMw) < 0.05);
  assert.ok(overview.blendedPue >= 1.15 && overview.blendedPue <= 1.6);
  assert.ok(overview.blendedWue >= 0.4 && overview.blendedWue <= 1.5);
  assert.equal(overview.totalRacks, INITIAL_RACKS.length * 3);
  assert.ok(overview.totalOpenCritical >= 1);
});

test('simulateCrossSiteFailover validates feasible vs over-capacity cross-site migrations', () => {
  const sitesMap = createAllSitesInitialState(1_700_000_000_000);

  const feasible = simulateCrossSiteFailover(sitesMap, INITIAL_RACKS, {
    sourceSiteId: 'kl1',
    targetSiteId: 'kl3',
    workloadName: 'LLM Inference Pod A',
    loadKw: 650,
    rackCount: 24,
    requiresLiquidCooling: false,
  });
  assert.equal(feasible.feasible, true);
  assert.equal(feasible.sourceSiteCode, 'KL1');
  assert.equal(feasible.targetSiteCode, 'KL3');
  assert.ok(feasible.targetProjectedItLoadMw > feasible.targetCurrentItLoadMw);

  const blocked = simulateCrossSiteFailover(sitesMap, INITIAL_RACKS, {
    sourceSiteId: 'kl1',
    targetSiteId: 'kl2',
    workloadName: 'Hyperscale Training Superpod',
    loadKw: 22_000,
    rackCount: 400,
    requiresLiquidCooling: true,
  });
  assert.equal(blocked.feasible, false);
  assert.equal(blocked.verdict, 'Blocked — Exceeds Tier IV Headroom');
  assert.ok(blocked.advisories.length >= 2);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateWhatIfCapacityPlan } from './capacityPlannerEngine';
import {
  appendImmutableAudit,
  createInitialAccessEvents,
  createInitialAssets,
  createInitialAuditTrail,
  createInitialPlaybooks,
  createInitialPmTasks,
  createInitialProtocolConnectors,
  createInitialRackLocks,
  createInitialSpareParts,
  createInitialTenants,
  verifyAuditChain,
} from './enterpriseOpsEngine';
import { computeSiteEsgMetrics } from './esgEngine';
import {
  createInitialCableTrays,
  createInitialCircuits,
  provisionCrossConnect,
  validateCrossConnectDraft,
} from './physicalLayerEngine';
import { buildPowerChainSnapshot } from './powerChainEngine';
import { INITIAL_RACKS } from './seedData';
import { createAllSitesInitialState } from './sites';

test('Power Chain SLD propagates 2N failover and detects dual-path outage blast radius', () => {
  const now = Date.UTC(2026, 10, 22, 4, 0, 0);
  const sitesMap = createAllSitesInitialState(now);
  const kl1 = sitesMap.kl1;

  // Nominal 2N operation
  const nominal = buildPowerChainSnapshot({
    siteId: 'kl1',
    bms: kl1.bms,
    servers: kl1.servers,
    faults: { trippedNodeIds: [], bypassUpsIds: [] },
    selectedNodeId: 'ups-bank-a',
  });
  assert.ok(nominal.feedALoadKw > 0 && nominal.feedBLoadKw > 0);
  assert.ok(nominal.sitePhaseBalance.l1Amps > 0);
  assert.equal(nominal.blastRadius?.redundantSurvived, true);

  // Single-path breaker trip (PDU-A open) -> Feed B absorbs 100% load, racks stay energized
  const singleFault = buildPowerChainSnapshot({
    siteId: 'kl1',
    bms: kl1.bms,
    servers: kl1.servers,
    faults: { trippedNodeIds: ['pdu-a'], bypassUpsIds: [] },
    selectedNodeId: 'pdu-a',
  });
  assert.equal(singleFault.feedALoadKw, 0);
  assert.ok(singleFault.feedBLoadKw > 0);
  assert.equal(singleFault.blastRadius?.redundantSurvived, true);

  // Dual-path fault (PDU-A & PDU-B open) -> blast radius reports non-surviving outage
  const dualFault = buildPowerChainSnapshot({
    siteId: 'kl1',
    bms: kl1.bms,
    servers: kl1.servers,
    faults: { trippedNodeIds: ['pdu-a', 'pdu-b'], bypassUpsIds: [] },
    selectedNodeId: 'pdu-a',
  });
  assert.equal(dualFault.blastRadius?.redundantSurvived, false);
  assert.ok((dualFault.blastRadius?.deEnergizedNodeIds.length ?? 0) >= 4);
});

test('Capacity Planner checks all 4 constraints (space, 2N power, cooling, floor weight)', () => {
  const now = Date.UTC(2026, 10, 22, 4, 0, 0);
  const sitesMap = createAllSitesInitialState(now);

  // Reasonable AI/GPU deployment should pass in Hall B (liquid CDU + heavy floor limit)
  const validPlan = evaluateWhatIfCapacityPlan({
    siteId: 'kl1',
    site: sitesMap.kl1,
    racks: INITIAL_RACKS,
    request: {
      workloadName: 'AI Inference Pod',
      rackCount: 4,
      uPerRack: 12,
      powerKwPerRack: 10,
      weightKgPerRack: 950,
      coolingType: 'liquid_cdu_high_density',
      require2NFeeds: true,
      preferredHall: 'any',
    },
  });
  assert.ok(validPlan.feasibleHallCount >= 1);
  assert.equal(validPlan.evaluations[0].constraints.length, 4);

  // Extreme weight (2200 kg/rack -> > 2100 kg/m²) should fail floor_weight constraint across halls
  const overweightPlan = evaluateWhatIfCapacityPlan({
    siteId: 'kl1',
    site: sitesMap.kl1,
    racks: INITIAL_RACKS,
    request: {
      workloadName: 'Overweight Lead-Acid Cabinet',
      rackCount: 2,
      uPerRack: 10,
      powerKwPerRack: 5,
      weightKgPerRack: 2200,
      coolingType: 'air_only',
      require2NFeeds: true,
      preferredHall: 'any',
    },
  });
  assert.equal(overweightPlan.feasibleHallCount, 0);
  assert.ok(
    overweightPlan.evaluations.every(
      (ev) => ev.constraints.find((c) => c.key === 'floor_weight')?.passed === false
    )
  );
});

test('Physical Layer validates drafts, provisions MMR cross-connects, and increments tray fill ratio', () => {
  const now = Date.UTC(2026, 10, 22, 4, 0, 0);
  const trays = createInitialCableTrays('kl1');
  const circuits = createInitialCircuits('kl1', now);

  const emptyErrs = validateCrossConnectDraft({
    siteId: 'kl1',
    customerOrService: '',
    carrierName: '',
    mediaType: 'SMF OS2 Fiber',
    bandwidthGbps: 400,
    mmrCage: 'MMR-A',
    aEnd: '',
    zEnd: '',
    trayId: trays[0].id,
  });
  assert.ok(Object.keys(emptyErrs).length === 4);

  const beforeInstalled = trays[0].installedCables;
  const res = provisionCrossConnect(
    circuits,
    trays,
    {
      siteId: 'kl1',
      customerOrService: 'Cloud Interconnect Backup',
      carrierName: 'TIME dotCom',
      mediaType: 'SMF OS2 Fiber',
      bandwidthGbps: 400,
      mmrCage: 'MMR-A · Cage 03',
      aEnd: 'KL1-MMR-ODF-01 / Port 22',
      zEnd: 'KL1-HALL-D-R09 / TOR-D09:et-0/0/2',
      trayId: trays[0].id,
    },
    now
  );
  assert.equal(res.circuits.length, circuits.length + 1);
  assert.equal(res.created.hops.length, 3);
  assert.equal(res.trays[0].installedCables, beforeInstalled + 2);
});

test('ESG Sustainability engine computes WUE, CUE, REF, and reduces Scope 2 emissions when renewable PPA rises', () => {
  const now = Date.UTC(2026, 10, 22, 4, 0, 0);
  const sitesMap = createAllSitesInitialState(now);

  const base = computeSiteEsgMetrics({
    siteId: 'kl1',
    bms: sitesMap.kl1.bms,
    itLoadKw: 8400,
    pue: 1.29,
    renewablePpaOverridePct: 30,
  });
  const green = computeSiteEsgMetrics({
    siteId: 'kl1',
    bms: sitesMap.kl1.bms,
    itLoadKw: 8400,
    pue: 1.29,
    renewablePpaOverridePct: 80,
  });

  assert.equal(base.history12m.length, 12);
  assert.ok(base.wueLitersPerKwh > 0.25);
  assert.ok(green.cueKgCo2PerKwh < base.cueKgCo2PerKwh);
  assert.ok(green.annualizedScope2Tonnes < base.annualizedScope2Tonnes);
  assert.ok(green.annualizedAvoidedTonnes > base.annualizedAvoidedTonnes);
});

test('Enterprise Operations engines seed CMMS, Tenants, Rack Locks, Connectors, and verify tamper-evident Audit Chain', () => {
  const now = Date.UTC(2026, 10, 22, 4, 0, 0);
  assert.ok(createInitialAssets('kl1').length >= 5);
  assert.ok(createInitialPmTasks('kl1').length >= 4);
  assert.ok(createInitialSpareParts().length >= 5);
  assert.ok(createInitialPlaybooks().length >= 4);

  const tenants = createInitialTenants('kl1');
  assert.ok(tenants.some((t) => t.overageAlert === true));
  assert.ok(tenants.every((t) => t.estimatedMonthlyBillUsd > 0));

  const locks = createInitialRackLocks('kl1', now);
  assert.ok(locks.some((l) => l.lockState === 'Door Open Alarm' && l.correlatedAlert !== null));
  assert.ok(createInitialAccessEvents('kl1', now).length >= 4);
  assert.equal(createInitialProtocolConnectors('kl1', now).length, 5);

  let audit = createInitialAuditTrail(now);
  assert.equal(verifyAuditChain(audit).valid, true);

  audit = appendImmutableAudit(audit, {
    timestamp: now + 1000,
    siteCode: 'KL1',
    actor: 'Elena Vance',
    category: 'Power / SLD',
    action: 'Simulated breaker trip on PDU-A',
    target: 'PDU-A',
  });
  assert.equal(verifyAuditChain(audit).valid, true);

  // Tampering with an action must invalidate hash chain verification
  const tampered = audit.map((e, i) => (i === 1 ? { ...e, action: 'TAMPERED ACTION' } : e));
  assert.equal(verifyAuditChain(tampered).valid, false);
});

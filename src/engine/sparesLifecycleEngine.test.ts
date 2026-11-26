import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialAssets, createInitialSpareParts } from './enterpriseOpsEngine';
import {
  advanceRmaStatus,
  consumeSpareForWorkOrder,
  createHardwareRmaRequest,
  createSiteAwareSpares,
  transferSpareBetweenSites,
} from './sparesLifecycleEngine';

test('consumeSpareForWorkOrder decrements campus stock and records ledger entry', () => {
  const now = 1_700_000_000_000;
  const spares = createSiteAwareSpares(createInitialSpareParts());
  const target = spares[0];
  const initialKl1 = target.stockBySite.kl1;
  assert.ok(initialKl1 >= 1);

  const res = consumeSpareForWorkOrder({
    spares,
    partId: target.id,
    siteId: 'kl1',
    qty: 1,
    linkedRef: 'INC-2041',
    actorName: 'Elena Vance',
    now,
  });

  assert.equal(res.ok, true);
  assert.equal(res.spares.find((s) => s.id === target.id)!.stockBySite.kl1, initialKl1 - 1);
  assert.equal(res.entry?.actionType, 'Consumed');
  assert.equal(res.entry?.linkedRef, 'INC-2041');

  // Over-consumption is rejected cleanly
  const over = consumeSpareForWorkOrder({
    spares: res.spares,
    partId: target.id,
    siteId: 'kl1',
    qty: 999,
    linkedRef: 'INC-2042',
    actorName: 'Elena Vance',
    now: now + 1000,
  });
  assert.equal(over.ok, false);
  assert.match(over.error ?? '', /Insufficient/i);
});

test('transferSpareBetweenSites shifts stock between campuses and rejects same-campus transfers', () => {
  const now = 1_700_000_000_000;
  const spares = createSiteAwareSpares(createInitialSpareParts());
  const target = spares.find((s) => s.stockBySite.kl1 >= 1)!;

  const sameSite = transferSpareBetweenSites({
    spares,
    partId: target.id,
    fromSiteId: 'kl1',
    toSiteId: 'kl1',
    qty: 1,
    actorName: 'Elena Vance',
    now,
  });
  assert.equal(sameSite.ok, false);

  const initialKl1 = target.stockBySite.kl1;
  const initialKl2 = target.stockBySite.kl2;
  const xfer = transferSpareBetweenSites({
    spares,
    partId: target.id,
    fromSiteId: 'kl1',
    toSiteId: 'kl2',
    qty: 1,
    actorName: 'Elena Vance',
    now,
  });
  assert.equal(xfer.ok, true);
  const updated = xfer.spares.find((s) => s.id === target.id)!;
  assert.equal(updated.stockBySite.kl1, initialKl1 - 1);
  assert.equal(updated.stockBySite.kl2, initialKl2 + 1);
  assert.equal(xfer.entries.length, 2);
});

test('createHardwareRmaRequest and advanceRmaStatus progress cleanly through all 4 lifecycle stages', () => {
  const now = 1_700_000_000_000;
  const assets = createInitialAssets('kl1');
  const asset = assets[0];

  const rma = createHardwareRmaRequest({
    existing: [],
    asset,
    requestType: 'Warranty Renewal',
    actorName: 'Elena Vance',
    now,
  });
  assert.equal(rma.status, 'Requested');
  assert.equal(rma.estimatedCostUsd, Math.round(asset.replacementCostUsd * 0.14));
  assert.match(rma.rmaNumber, /^RMA-KL1-/);

  const s2 = advanceRmaStatus(rma, now + 1000);
  assert.equal(s2.status, 'Vendor Approved');
  const s3 = advanceRmaStatus(s2, now + 2000);
  assert.equal(s3.status, 'Replacement Shipped');
  const s4 = advanceRmaStatus(s3, now + 3000);
  assert.equal(s4.status, 'Completed');
  // Idempotent at terminal state
  const s5 = advanceRmaStatus(s4, now + 4000);
  assert.equal(s5.status, 'Completed');
});

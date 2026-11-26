import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAllWallboardSnapshots } from './nocWallboardEngine';
import { INITIAL_RACKS } from './seedData';
import { createInitialProfiles } from './shiftEngine';
import { createAllSitesInitialState } from './sites';

test('buildAllWallboardSnapshots produces valid KL1/KL2/KL3 snapshots with sorted hotspots and shift leads', () => {
  const now = 1_700_000_000_000;
  const sitesMap = createAllSitesInitialState(now);
  const operators = createInitialProfiles();

  const snapshots = buildAllWallboardSnapshots(sitesMap, INITIAL_RACKS, operators);
  assert.equal(snapshots.length, 3);
  assert.deepEqual(
    snapshots.map((s) => s.siteCode),
    ['KL1', 'KL2', 'KL3']
  );

  for (const snap of snapshots) {
    assert.ok(snap.siteName.length > 0);
    assert.ok(snap.region.length > 0);
    assert.ok(snap.totalItLoadMw > 0);
    assert.ok(snap.pue >= 1.1 && snap.pue <= 2.2);
    assert.ok(snap.ashraeCompliancePct >= 0 && snap.ashraeCompliancePct <= 100);
    assert.equal(snap.hotspots.length, 5);
    // Hotspots sorted descending by average temp
    for (let i = 1; i < snap.hotspots.length; i++) {
      assert.ok(snap.hotspots[i - 1].avgTempC >= snap.hotspots[i].avgTempC);
    }
    assert.ok(snap.onDutyLead !== null, `Expected on-duty lead for ${snap.siteCode}`);
    assert.ok(snap.onDutyLead.avatarUrl && snap.onDutyLead.avatarUrl.length > 0);
  }
});

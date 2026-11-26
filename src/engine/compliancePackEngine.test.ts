import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialMaintenanceWindows } from './alertIntelligenceEngine';
import { buildComplianceAuditPack, exportCompliancePackMarkdown } from './compliancePackEngine';
import { createInitialAuditTrail } from './enterpriseOpsEngine';
import { INITIAL_RACKS } from './seedData';
import { createInitialProfiles } from './shiftEngine';
import { createAllSitesInitialState } from './sites';
import { createInitialVisitors } from './visitorEngine';

test('buildComplianceAuditPack computes framework controls and exports structured Markdown', () => {
  const now = 1_700_000_000_000;
  const sitesMap = createAllSitesInitialState(now);
  const profiles = createInitialProfiles();
  const visitors = createInitialVisitors(profiles, now);
  const maintenanceWindows = createInitialMaintenanceWindows(now);
  const auditTrail = createInitialAuditTrail(now);

  const allPack = buildComplianceAuditPack({
    siteScope: 'all',
    framework: 'all',
    sitesMap,
    racks: INITIAL_RACKS,
    visitors,
    maintenanceWindows,
    auditTrail,
    auditorName: 'Elena Vance',
    now,
  });

  assert.equal(allPack.controls.length, 6);
  assert.ok(allPack.overallScorePct >= 0 && allPack.overallScorePct <= 100);
  assert.ok(allPack.ashraeThermalCompliancePct >= 0 && allPack.ashraeThermalCompliancePct <= 100);
  assert.ok(allPack.powerAvailabilitySlaPct >= 99 && allPack.powerAvailabilitySlaPct <= 100);
  assert.match(allPack.scopeLabel, /All Campuses/);

  const ashraeOnly = buildComplianceAuditPack({
    siteScope: 'kl1',
    framework: 'ashrae_a1',
    sitesMap,
    racks: INITIAL_RACKS,
    visitors,
    maintenanceWindows,
    auditTrail,
    auditorName: 'Elena Vance',
    now,
  });
  assert.ok(ashraeOnly.controls.length >= 2);
  assert.ok(ashraeOnly.controls.every((c) => c.framework === 'ASHRAE Class A1'));
  assert.match(ashraeOnly.scopeLabel, /^KL1 — /);

  const md = exportCompliancePackMarkdown(allPack);
  assert.match(md, /# Orise DCIM — Audit & SLA Compliance Pack/);
  assert.match(md, /ASHRAE Class A1/);
  assert.match(md, /Uptime Tier IV/);
  assert.match(md, /ISO 27001/);
  assert.match(md, /Elena Vance/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialBmsState, toggleChillerFault, toggleUpsFault, triggerUtilityOutageDrill } from './bmsEngine';
import { buildBmsEquipment3DCatalog } from './bms3dSpecs';

test('buildBmsEquipment3DCatalog covers all 58 electrical and mechanical BMS assets across 12 model kinds', () => {
  const bms = createInitialBmsState(Date.UTC(2026, 10, 20, 12, 0, 0));
  const catalog = buildBmsEquipment3DCatalog(bms);

  assert.equal(catalog.length, 58);

  const mechanical = catalog.filter((i) => i.discipline === 'mechanical');
  const electrical = catalog.filter((i) => i.discipline === 'electrical');
  // 2 Water Chillers + 2 Square CHW Buffer Tanks & Pump Sets + 14 Air Chillers + 6 CRACs + 2 Liquid CDUs + 8 Basement Diesel Tanks = 34
  assert.equal(mechanical.length, 34);
  // 2 HV + 2 MSB + 2 OPSWB + 4 UPS + 8 Generators + 6 Gateways = 24
  assert.equal(electrical.length, 24);

  assert.equal(catalog.filter((i) => i.modelKind === 'water-chiller').length, 2);
  assert.equal(catalog.filter((i) => i.modelKind === 'chw-tank-pump').length, 2);
  assert.equal(catalog.filter((i) => i.modelKind === 'air-chiller').length, 14);
  assert.equal(catalog.filter((i) => i.modelKind === 'crac').length, 6);
  assert.equal(catalog.filter((i) => i.modelKind === 'liquid-cdu').length, 2);
  assert.equal(catalog.filter((i) => i.modelKind === 'diesel-tank').length, 8);
  assert.equal(catalog.filter((i) => i.modelKind === 'hv-transformer').length, 2);
  assert.equal(catalog.filter((i) => i.modelKind === 'msb-switchboard').length, 2);
  assert.equal(catalog.filter((i) => i.modelKind === 'opswb-switchboard').length, 2);
  assert.equal(catalog.filter((i) => i.modelKind === 'ups').length, 4);
  assert.equal(catalog.filter((i) => i.modelKind === 'generator').length, 8);
  assert.equal(catalog.filter((i) => i.modelKind === 'gateway').length, 6);

  const tankA = catalog.find((i) => i.id === 'chw-tank-a');
  assert.ok(tankA?.mechanicalSpecs.some((s) => s.value.toLowerCase().includes('square')));

  for (const item of catalog) {
    assert.ok(item.electricalSpecs.length >= 4, `${item.id} must have >=4 electrical specs`);
    assert.ok(item.mechanicalSpecs.length >= 4, `${item.id} must have >=4 mechanical specs`);
    assert.ok(item.subComponents.length >= 4, `${item.id} must have >=4 sub-components`);
    assert.ok(item.liveTelemetry.length >= 4, `${item.id} must have >=4 live telemetry fields`);
  }
});

test('BMS 3D equipment specs react live to chiller faults, UPS faults, and utility outages', () => {
  const now = Date.UTC(2026, 10, 20, 12, 0, 0);
  let bms = createInitialBmsState(now);
  bms = toggleChillerFault(bms, 'chw-01', now + 1000);
  bms = toggleUpsFault(bms, 'ups-a1', now + 2000);

  const catalog = buildBmsEquipment3DCatalog(bms);
  const chw1 = catalog.find((i) => i.id === 'chw-01');
  const upsA1 = catalog.find((i) => i.id === 'ups-a1');
  const cduB1 = catalog.find((i) => i.id === 'crac-b1');
  const tankA1 = catalog.find((i) => i.id === 'diesel-a1');
  const chwTankA = catalog.find((i) => i.id === 'chw-tank-a');
  const hvA = catalog.find((i) => i.id === 'hv-a');

  assert.ok(chw1 && chw1.isFault && chw1.severityState === 'critical');
  assert.equal(chw1.fanSpeedRatio, 0);
  assert.ok(upsA1 && upsA1.isFault && upsA1.severityState === 'critical');
  assert.equal(cduB1?.modelKind, 'liquid-cdu');
  assert.equal(tankA1?.modelKind, 'diesel-tank');
  assert.equal(chwTankA?.modelKind, 'chw-tank-pump');
  assert.equal(hvA?.modelKind, 'hv-transformer');

  const outageBms = triggerUtilityOutageDrill(createInitialBmsState(now), now + 3000);
  const outageCat = buildBmsEquipment3DCatalog(outageBms);
  const genA1 = outageCat.find((i) => i.id === 'gen-a1');
  assert.ok(genA1 && (genA1.severityState === 'warning' || genA1.severityState === 'nominal'));
  assert.ok(genA1.fanSpeedRatio > 0);
});

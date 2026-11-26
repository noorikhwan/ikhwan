import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_OFFICE_BOUNDS,
  BATTERY_ROOM_PLACEMENTS,
  BUILDING_BOUNDS,
  CAMERA_PRESETS,
  CAMERA_PRESET_LIST,
  CHILLER_3D_PLACEMENTS,
  CHW_TANK_PUMP_3D_PLACEMENTS,
  COLD_AISLE_SLA_SENSOR_PLACEMENTS,
  CRAC_3D_PLACEMENTS,
  DATAHALL_WALKWAY_SEGMENTS,
  DIESEL_TANK_3D_PLACEMENTS,
  ELECTRICAL_CHAIN_3D_PLACEMENTS,
  FACILITY_ASSET_PLACEMENTS,
  HALL_ZONE_BOUNDS,
  LANDSCAPE_TREE_PLACEMENTS,
  RACK_3D_PLACEMENTS,
  SITE_BUILDING_LAYOUTS,
  SLA_SENSORS_PER_HALL,
  SLA_SENSORS_PER_ROW,
  TELECOM_ROOM_PLACEMENTS,
  TOTAL_SLA_SENSORS_PER_SITE,
  VISITOR_PARKING_BAYS,
  computeBatteryRoomMetrics,
  computeColdAisleSlaSensorMetrics,
  computeRack3DMetrics,
  computeTelecomRoomMetrics,
  getBmsAssetStatusHex,
  getSiteBuildingLayout,
  getSiteCameraPresets,
  powerLoadColorHex,
  slaSensorStatusHex,
  thermalColorHex,
} from './twin3dLayout';
import {
  HALLS_PER_SITE,
  INITIAL_RACKS,
  RACKS_PER_ROW,
  ROWS_PER_HALL,
  TOTAL_RACKS_PER_SITE,
  createInitialServers,
} from './seedData';
import {
  createInitialBmsState,
  toggleChillerFault,
  toggleColdAisleSlaExcursion,
  triggerUtilityOutageDrill,
} from './bmsEngine';
import { SITES, createAllSitesInitialState } from './sites';

test('each site has exactly 4 data halls x 20 rows x 20 racks (1,600 racks) inside building without overlap', () => {
  assert.equal(HALLS_PER_SITE, 4);
  assert.equal(ROWS_PER_HALL, 20);
  assert.equal(RACKS_PER_ROW, 20);
  assert.equal(TOTAL_RACKS_PER_SITE, 1600);
  assert.equal(INITIAL_RACKS.length, 1600);
  assert.equal(RACK_3D_PLACEMENTS.length, 1600);
  assert.equal(HALL_ZONE_BOUNDS.length, 4);
  assert.equal(CRAC_3D_PLACEMENTS.length, 8);

  // Verify exact counts per hall and per row
  for (const hallId of ['hall-a', 'hall-b', 'hall-c', 'hall-d'] as const) {
    const hallRacks = RACK_3D_PLACEMENTS.filter((r) => r.hallId === hallId);
    assert.equal(hallRacks.length, 400, `${hallId} should have 400 racks`);
    for (let row = 1; row <= 20; row++) {
      const rowRacks = hallRacks.filter((r) => r.rowNumber === row);
      assert.equal(rowRacks.length, 20, `${hallId} Row ${row} should have 20 racks`);
    }
  }

  // Verify every rack sits strictly inside main building footprint
  const halfW = BUILDING_BOUNDS.mainWidth / 2;
  const halfD = BUILDING_BOUNDS.mainDepth / 2;
  for (const r of RACK_3D_PLACEMENTS) {
    assert.ok(Math.abs(r.x) < halfW - 1, `Rack ${r.rackId} inside building X`);
    assert.ok(Math.abs(r.z) < halfD - 1, `Rack ${r.rackId} inside building Z`);
  }

  // Verify adjacent racks within every row and between adjacent rows do not overlap
  const byHallRow = new Map<string, typeof RACK_3D_PLACEMENTS>();
  for (const r of RACK_3D_PLACEMENTS) {
    const key = `${r.hallId}:${r.rowNumber}`;
    const list = byHallRow.get(key) ?? [];
    list.push(r);
    byHallRow.set(key, list);
  }
  for (const [, rowList] of byHallRow) {
    rowList.sort((a, b) => a.rackIndex - b.rackIndex);
    for (let i = 1; i < rowList.length; i++) {
      const dx = Math.abs(rowList[i].x - rowList[i - 1].x);
      assert.ok(dx > BUILDING_BOUNDS.rackWidth, `Adjacent racks in same row must not overlap (${dx}m)`);
    }
  }
  for (const hallId of ['hall-a', 'hall-b', 'hall-c', 'hall-d'] as const) {
    for (let row = 2; row <= 20; row++) {
      const prevZ = byHallRow.get(`${hallId}:${row - 1}`)![0].z;
      const currZ = byHallRow.get(`${hallId}:${row}`)![0].z;
      const dz = Math.abs(currZ - prevZ);
      assert.ok(dz > BUILDING_BOUNDS.rackDepth, `Adjacent rows in ${hallId} must not overlap (${dz}m)`);
    }
  }
});

test('computeRack3DMetrics computes all 1,600 racks and identifies critical thermal hotspot in B-R01-01', () => {
  const servers = createInitialServers(1_700_000_000_000);
  const bms = createInitialBmsState(1_700_000_000_000);
  const metrics = computeRack3DMetrics(INITIAL_RACKS, servers, bms);

  assert.equal(Object.keys(metrics).length, 1600);
  assert.equal(metrics['B-R01-01'].status, 'critical');
  assert.ok(metrics['B-R01-01'].peakTempC >= 80);
  assert.equal(metrics['B-R01-01'].hottestServerId, 'srv-b01-01');
  assert.equal(metrics['B-R01-01'].serverCount, 3);
  assert.ok(metrics['B-R01-01'].powerKw > 5);
  assert.ok(metrics['D-R20-20'].powerKw > 0);
  assert.equal(metrics['D-R20-20'].rowNumber, 20);
  assert.equal(metrics['D-R20-20'].rackIndex, 20);
});

test('thermal and power color scales map accurately across thresholds', () => {
  assert.equal(thermalColorHex(82), 0xdc2626);
  assert.equal(thermalColorHex(66), 0xd97706);
  assert.equal(thermalColorHex(54), 0x3dcd58);
  assert.equal(thermalColorHex(42), 0x0284c7);

  assert.equal(powerLoadColorHex(85), 0xdc2626);
  assert.equal(powerLoadColorHex(65), 0xd97706);
  assert.equal(powerLoadColorHex(40), 0x3dcd58);
  assert.equal(powerLoadColorHex(15), 0x0284c7);
});

test('BMS asset 3D status reflects Hall B Liquid CDU boost, Hall D nominal, and utility outage UPS battery transfer', () => {
  const bms = createInitialBmsState(1_700_000_000_000);
  assert.equal(getBmsAssetStatusHex(bms, 'crac', 'crac-b1'), 0x06b6d4);
  assert.equal(getBmsAssetStatusHex(bms, 'crac', 'crac-d2'), 0x3dcd58);
  assert.equal(getBmsAssetStatusHex(bms, 'ups', 'ups-a1'), 0x3dcd58);

  const outage = triggerUtilityOutageDrill(bms, 1_700_000_001_000);
  assert.equal(getBmsAssetStatusHex(outage, 'ups', 'ups-a1'), 0xdc2626);
  assert.equal(getBmsAssetStatusHex(outage, 'ups', 'ups-b2'), 0xdc2626);
});

test('camera presets and Tier IV facility placements cover building, visitor parking, cutaway, chiller plant, basement fuel, Hall B CDU, HV→MSB→OPSWB, Admin Office, Battery Rooms, and 8 diesel tanks', () => {
  assert.equal(CAMERA_PRESET_LIST.length, 14);
  assert.ok(CAMERA_PRESETS['admin-office'], 'admin-office preset must exist');
  assert.ok(CAMERA_PRESETS['battery-rooms'], 'battery-rooms preset must exist');
  assert.ok(CAMERA_PRESETS['visitor-parking'], 'visitor-parking preset must exist');
  assert.equal(CAMERA_PRESETS['visitor-parking'].defaultCutaway, 0);
  assert.equal(CAMERA_PRESETS['visitor-parking'].defaultViewMode, 'building');
  assert.ok(CAMERA_PRESETS['basement-fuel'], 'basement-fuel preset must exist');
  assert.equal(CAMERA_PRESETS.campus.defaultCutaway, 0);
  assert.equal(CAMERA_PRESETS['chiller-plant'].defaultCutaway, 0);
  assert.equal(CAMERA_PRESETS.cutaway.defaultCutaway, 1);
  assert.equal(CAMERA_PRESETS['hall-b'].defaultViewMode, 'datahall');
  assert.equal(CAMERA_PRESETS['hall-d'].defaultViewMode, 'datahall');
  assert.equal(FACILITY_ASSET_PLACEMENTS.length, 12);
  assert.equal(FACILITY_ASSET_PLACEMENTS.filter((f) => f.kind === 'ups').length, 4);
  assert.equal(FACILITY_ASSET_PLACEMENTS.filter((f) => f.kind === 'generator').length, 8);
  assert.equal(CHILLER_3D_PLACEMENTS.length, 16);
  assert.equal(CHILLER_3D_PLACEMENTS.filter((c) => c.chillerType === 'Water-Cooled').length, 2);
  assert.equal(CHILLER_3D_PLACEMENTS.filter((c) => c.chillerType === 'Air-Cooled').length, 14);
  assert.ok(CHILLER_3D_PLACEMENTS.some((c) => c.chillerId === 'cha-a1'));
  assert.ok(CHILLER_3D_PLACEMENTS.some((c) => c.chillerId === 'cha-a7'));
  assert.ok(CHILLER_3D_PLACEMENTS.some((c) => c.chillerId === 'cha-b7'));

  // Rooftop Water Chiller 2x180kL Buffer Tanks & Pump Sets
  assert.equal(CHW_TANK_PUMP_3D_PLACEMENTS.length, 2);
  assert.deepEqual(
    CHW_TANK_PUMP_3D_PLACEMENTS.map((p) => p.pumpSetId).sort(),
    ['chw-tank-a', 'chw-tank-b']
  );

  // Hall B Liquid Cooling CDUs vs Air CRACs in Halls A/C/D
  const hallBCdus = CRAC_3D_PLACEMENTS.filter((c) => c.hallId === 'hall-b');
  assert.equal(hallBCdus.length, 2);
  assert.ok(hallBCdus.every((c) => c.coolingType === 'Liquid CDU'));
  assert.equal(CRAC_3D_PLACEMENTS.filter((c) => c.coolingType === 'CRAC').length, 6);

  // 8 Basement Level B1 Diesel Tanks (y < 0, 4 Path A + 4 Path B)
  assert.equal(DIESEL_TANK_3D_PLACEMENTS.length, 8);
  assert.ok(DIESEL_TANK_3D_PLACEMENTS.every((t) => t.y < 0), 'All 8 diesel tanks must sit in subterranean Basement B1');
  assert.equal(DIESEL_TANK_3D_PLACEMENTS.filter((t) => t.redundancyPath === 'Path A').length, 4);
  assert.equal(DIESEL_TANK_3D_PLACEMENTS.filter((t) => t.redundancyPath === 'Path B').length, 4);

  // HV -> MSB -> OPSWB 2N Electrical Distribution Chain (6 nodes)
  assert.equal(ELECTRICAL_CHAIN_3D_PLACEMENTS.length, 6);
  assert.equal(ELECTRICAL_CHAIN_3D_PLACEMENTS.filter((e) => e.stage === 'HV').length, 2);
  assert.equal(ELECTRICAL_CHAIN_3D_PLACEMENTS.filter((e) => e.stage === 'MSB').length, 2);
  assert.equal(ELECTRICAL_CHAIN_3D_PLACEMENTS.filter((e) => e.stage === 'OPSWB').length, 2);

  const bms = createInitialBmsState(1_700_000_000_000);
  assert.equal(getBmsAssetStatusHex(bms, 'chiller', 'chw-01'), 0x3dcd58);
  assert.equal(getBmsAssetStatusHex(bms, 'chw_tank_pump', 'chw-tank-a'), 0x06b6d4);
  assert.equal(getBmsAssetStatusHex(bms, 'diesel_tank', 'diesel-a1'), 0x3dcd58);
  assert.equal(getBmsAssetStatusHex(bms, 'hv', 'hv-a'), 0x3dcd58);
  assert.equal(getBmsAssetStatusHex(bms, 'msb', 'msb-a'), 0x3dcd58);
  assert.equal(getBmsAssetStatusHex(bms, 'opswb', 'opswb-a'), 0x3dcd58);

  const standbyUnit = bms.chillers.find((c) => c.mode === 'Standby');
  if (standbyUnit) {
    assert.equal(getBmsAssetStatusHex(bms, 'chiller', standbyUnit.id), 0x64748b);
  }
  const faulted = toggleChillerFault(bms, 'chw-01', 1_700_000_001_000);
  assert.equal(getBmsAssetStatusHex(faulted, 'chiller', 'chw-01'), 0xdc2626);
});

test('KL1, KL2, and KL3 initialize as independent Certified Tier IV sites with 8 CRACs, 4 UPS, 4 Gens, 6 Gateways, and 4 Cold Aisle SLA sensors', () => {
  assert.deepEqual(
    SITES.map((s) => s.code),
    ['KL1', 'KL2', 'KL3']
  );
  for (const s of SITES) {
    assert.ok(s.tierLabel.includes('TIER IV'), `${s.code} must be Tier IV certified`);
  }
  const all = createAllSitesInitialState(1_700_000_000_000);
  assert.equal(all.kl1.servers.length, 24);
  assert.equal(all.kl2.servers.length, 24);
  assert.equal(all.kl3.servers.length, 24);
  assert.ok(all.kl1.servers[0].hostname.endsWith('.kl1.orise'));
  assert.ok(all.kl2.servers[0].hostname.endsWith('.kl2.orise'));
  assert.ok(all.kl3.servers[0].hostname.endsWith('.kl3.orise'));
  assert.notEqual(all.kl1.servers[0].ip, all.kl2.servers[0].ip);
  assert.notEqual(all.kl2.servers[0].ip, all.kl3.servers[0].ip);
  for (const site of [all.kl1, all.kl2, all.kl3]) {
    assert.equal(site.bms.cracUnits.length, 8);
    assert.equal(site.bms.upsSystems.length, 4);
    assert.equal(site.bms.generators.length, 8);
    assert.equal(site.bms.chillers.length, 16);
    assert.equal(site.bms.gateways.length, 6);
    assert.equal(site.bms.envSensors.length, 4);
  }
});

test('3D Cold Aisle SLA sensors place exactly 2 sensors per row (40/hall · 160/site) aligned to cold-aisle faces and couple to live SLA breaches', () => {
  assert.equal(SLA_SENSORS_PER_ROW, 2);
  assert.equal(SLA_SENSORS_PER_HALL, 40);
  assert.equal(TOTAL_SLA_SENSORS_PER_SITE, 160);
  assert.equal(COLD_AISLE_SLA_SENSOR_PLACEMENTS.length, 160);

  const halfW = BUILDING_BOUNDS.mainWidth / 2;
  const halfD = BUILDING_BOUNDS.mainDepth / 2;

  for (const hallId of ['hall-a', 'hall-b', 'hall-c', 'hall-d'] as const) {
    const hallSensors = COLD_AISLE_SLA_SENSOR_PLACEMENTS.filter((s) => s.hallId === hallId);
    assert.equal(hallSensors.length, 40, `${hallId} should have 40 SLA sensors (2 per row)`);
    for (let row = 1; row <= 20; row++) {
      const rowSensors = hallSensors.filter((s) => s.rowNumber === row);
      assert.equal(rowSensors.length, 2, `${hallId} Row ${row} should have exactly 2 SLA sensors`);
      assert.deepEqual(
        rowSensors.map((s) => s.slot).sort(),
        ['A', 'B']
      );
      assert.deepEqual(
        rowSensors.map((s) => s.redundancyPath).sort(),
        ['Path A', 'Path B']
      );
    }
  }

  for (const s of COLD_AISLE_SLA_SENSOR_PLACEMENTS) {
    assert.ok(Math.abs(s.x) < halfW - 1, `Sensor ${s.sensorId} inside building X`);
    assert.ok(Math.abs(s.z) < halfD - 1, `Sensor ${s.sensorId} inside building Z`);
    assert.ok(s.y > BUILDING_BOUNDS.floorY + BUILDING_BOUNDS.rackHeight, `Sensor ${s.sensorId} mounted cleanly above cabinet rail`);
  }

  // Verify live metrics and Hall B SLA breach coupling across all 40 sensors in Hall B
  const now = 1_700_000_000_000;
  const servers = createInitialServers(now);
  const bms = createInitialBmsState(now);
  const nominalMetrics = computeColdAisleSlaSensorMetrics(bms, servers);
  assert.equal(Object.keys(nominalMetrics).length, 160);
  assert.equal(nominalMetrics['SLA-A-R01-A'].overallStatus, 'Compliant');
  assert.equal(slaSensorStatusHex('Compliant'), 0x06b6d4);
  assert.equal(slaSensorStatusHex('Warning'), 0xd97706);
  assert.equal(slaSensorStatusHex('Breached'), 0xdc2626);

  const breachedBms = toggleColdAisleSlaExcursion(bms, 'hall-b', now + 1000);
  const breachedMetrics = computeColdAisleSlaSensorMetrics(breachedBms, servers);
  const hallBSensors = Object.values(breachedMetrics).filter((m) => m.hallId === 'hall-b');
  const hallASensors = Object.values(breachedMetrics).filter((m) => m.hallId === 'hall-a');
  assert.equal(hallBSensors.length, 40);
  assert.ok(
    hallBSensors.every((m) => m.overallStatus === 'Breached'),
    'All 40 Hall B row SLA sensors must reflect Breached status during Hall B SLA excursion'
  );
  assert.ok(
    hallASensors.every((m) => m.overallStatus === 'Compliant'),
    'Hall A row SLA sensors must remain Compliant during Hall B SLA excursion'
  );
});

test('South Visitor Parking has 28 non-overlapping bays (EV, Accessible, Solar Carport) and zero 3D landscape trees remain in the scene', () => {
  assert.equal(VISITOR_PARKING_BAYS.length, 28);
  assert.equal(VISITOR_PARKING_BAYS.filter((b) => b.wing === 'West').length, 14);
  assert.equal(VISITOR_PARKING_BAYS.filter((b) => b.wing === 'East').length, 14);
  assert.equal(VISITOR_PARKING_BAYS.filter((b) => b.kind === 'ev').length, 4);
  assert.equal(VISITOR_PARKING_BAYS.filter((b) => b.kind === 'accessible').length, 2);
  assert.equal(VISITOR_PARKING_BAYS.filter((b) => b.hasSolarCanopy).length, 7);
  assert.ok(VISITOR_PARKING_BAYS.filter((b) => b.occupied).length >= 12);

  // Verify every parking bay sits cleanly South of the building facade and no two bays overlap
  const southFacadeZ = BUILDING_BOUNDS.mainDepth / 2;
  for (let i = 0; i < VISITOR_PARKING_BAYS.length; i++) {
    const a = VISITOR_PARKING_BAYS[i];
    assert.ok(a.z - a.depth / 2 > southFacadeZ + 10, `Bay ${a.bayId} must sit South of NOC plaza`);
    for (let j = i + 1; j < VISITOR_PARKING_BAYS.length; j++) {
      const b = VISITOR_PARKING_BAYS[j];
      const overlapX = Math.abs(a.x - b.x) < (a.width + b.width) / 2;
      const overlapZ = Math.abs(a.z - b.z) < (a.depth + b.depth) / 2;
      assert.ok(!(overlapX && overlapZ), `Parking bays ${a.bayId} and ${b.bayId} must not overlap`);
    }
  }

  // Verify all 3D trees have been removed cleanly
  assert.equal(LANDSCAPE_TREE_PLACEMENTS.length, 0);
});

test('MDF Room, Network Room, and Meet-Me Room (MMR) sit cleanly in South Telecom Wing with zero overlap and valid live telemetry', () => {
  assert.equal(TELECOM_ROOM_PLACEMENTS.length, 3);
  assert.deepEqual(
    TELECOM_ROOM_PLACEMENTS.map((r) => r.code),
    ['MDF', 'NET', 'MMR']
  );

  // Camera preset exists and is exposed in toolbar preset list
  assert.ok(CAMERA_PRESETS['telecom-rooms']);
  assert.ok(CAMERA_PRESET_LIST.some((p) => p.id === 'telecom-rooms'));

  const halfW = BUILDING_BOUNDS.mainWidth / 2;
  const halfD = BUILDING_BOUNDS.mainDepth / 2;
  const pitMinX = BUILDING_BOUNDS.basementVaultCenterX - BUILDING_BOUNDS.basementVaultWidth / 2;
  const pitMaxX = BUILDING_BOUNDS.basementVaultCenterX + BUILDING_BOUNDS.basementVaultWidth / 2;
  const pitHalfD = BUILDING_BOUNDS.basementVaultDepth / 2;

  for (let i = 0; i < TELECOM_ROOM_PLACEMENTS.length; i++) {
    const r = TELECOM_ROOM_PLACEMENTS[i];
    const minX = r.centerX - r.width / 2;
    const maxX = r.centerX + r.width / 2;
    const minZ = r.centerZ - r.depth / 2;
    const maxZ = r.centerZ + r.depth / 2;

    // Inside main building perimeter walls
    assert.ok(minX > -halfW + 0.5 && maxX < halfW - 0.5, `${r.roomId} must sit inside West/East building walls`);
    assert.ok(maxZ < halfD - 0.3, `${r.roomId} must sit inside South facade wall`);

    // Strictly South of all 4 Data Halls (max hall Z = 42.0) and clear of NOC Lobby corridor (x in [-6.8, +6.8])
    for (const hall of HALL_ZONE_BOUNDS) {
      const hallMaxZ = hall.centerZ + hall.depth / 2;
      assert.ok(minZ > hallMaxZ, `${r.roomId} must sit strictly clear of ${hall.label}`);
    }
    const overlapsLobby = maxX > -6.8 && minX < 6.8;
    assert.ok(!overlapsLobby, `${r.roomId} must leave NOC Lobby entrance clear`);

    // Pairwise non-overlapping between MDF, Network, and MMR
    for (let j = i + 1; j < TELECOM_ROOM_PLACEMENTS.length; j++) {
      const other = TELECOM_ROOM_PLACEMENTS[j];
      const overlapX = Math.abs(r.centerX - other.centerX) < (r.width + other.width) / 2;
      const overlapZ = Math.abs(r.centerZ - other.centerZ) < (r.depth + other.depth) / 2;
      assert.ok(!(overlapX && overlapZ), `${r.roomId} and ${other.roomId} must not overlap`);
    }

    // External Fiber POE manholes clear of East Basement Fuel Vault & Visitor Parking bays
    if (r.poeManhole) {
      const { x: mx, z: mz } = r.poeManhole;
      const inPit = mx > pitMinX - 1.5 && mx < pitMaxX + 1.5 && Math.abs(mz) < pitHalfD + 1.5;
      assert.ok(!inPit, `POE manhole for ${r.roomId} must not overlap East Basement Fuel Vault`);
      for (const bay of VISITOR_PARKING_BAYS) {
        const inBay = Math.abs(mx - bay.x) < bay.width / 2 + 1.5 && Math.abs(mz - bay.z) < bay.depth / 2 + 1.5;
        assert.ok(!inBay, `POE manhole for ${r.roomId} must not overlap parking bay ${bay.bayId}`);
      }
    }

    // Live site-coupled telemetry metrics are valid and positive
    const bms = createInitialBmsState();
    const servers = createInitialServers();
    const metrics = computeTelecomRoomMetrics(r, servers, bms);
    assert.ok(metrics.throughputTbps > 0 && metrics.throughputTbps <= r.fiberCapacityTbps);
    assert.ok(metrics.utilizationPct >= 20 && metrics.utilizationPct <= 95);
    assert.ok(metrics.activeCrossConnects > 500);
    assert.ok(metrics.roomTempC >= 18.5 && metrics.roomTempC <= 26.5);
  }
});

test('Admin Office Pavilion and Enclosed Walkway to Data Halls sit clear of MEP, Battery Room B, West POE Manhole, and Visitor Parking', () => {
  const adminMinX = ADMIN_OFFICE_BOUNDS.centerX - ADMIN_OFFICE_BOUNDS.width / 2;
  const adminMaxX = ADMIN_OFFICE_BOUNDS.centerX + ADMIN_OFFICE_BOUNDS.width / 2;
  const adminMinZ = ADMIN_OFFICE_BOUNDS.centerZ - ADMIN_OFFICE_BOUNDS.depth / 2;
  const adminMaxZ = ADMIN_OFFICE_BOUNDS.centerZ + ADMIN_OFFICE_BOUNDS.depth / 2;

  // Strictly West of main building (x=-30) and inside West perimeter fence (x=-59)
  assert.ok(adminMinX > -59.0, 'Admin Office must sit inside West perimeter fence');
  assert.ok(adminMaxX < -30.0, 'Admin Office must sit strictly West of main building');

  // Clear South of HV/MSB pad (z=+28) and clear North of West Visitor Parking bays
  assert.ok(adminMinZ > 28.0, 'Admin Office must sit clear South of HV/MSB pad');
  for (const bay of VISITOR_PARKING_BAYS) {
    const overlapX = adminMaxX > bay.x - bay.width / 2 && adminMinX < bay.x + bay.width / 2;
    const overlapZ = adminMaxZ > bay.z - bay.depth / 2 && adminMinZ < bay.z + bay.depth / 2;
    assert.ok(!(overlapX && overlapZ), `Admin Office must not overlap parking bay ${bay.bayId}`);
  }

  // Clear of West POE Manhole
  const mdf = TELECOM_ROOM_PLACEMENTS.find((r) => r.roomId === 'mdf-room')!;
  if (mdf.poeManhole) {
    assert.ok(
      adminMaxX < mdf.poeManhole.x - 1.0,
      'Admin Office must leave clearance West of West Fiber POE manhole'
    );
  }

  // Walkway segments connect Admin Office via glazed security bridge into Data Halls A-D
  assert.ok(DATAHALL_WALKWAY_SEGMENTS.length >= 3);
  const bridge = DATAHALL_WALKWAY_SEGMENTS.find((s) => s.zone === 'exterior-bridge');
  assert.ok(bridge, 'Walkway must include an enclosed glazed security bridge');
  assert.ok(
    bridge.centerZ - bridge.depth / 2 > 34.0 && bridge.centerZ + bridge.depth / 2 < 42.3,
    'Security bridge must sit clear of CRAC-C2 and North of MDF Room'
  );
});

test('2N Battery Rooms A & B sit clear of HV/MSB pad & Admin Office, link to UPS-A/B, and respond to utility outage drills', () => {
  assert.equal(BATTERY_ROOM_PLACEMENTS.length, 2);
  assert.deepEqual(
    BATTERY_ROOM_PLACEMENTS.map((r) => r.roomId),
    ['batt-room-a', 'batt-room-b']
  );

  const adminMinZ = ADMIN_OFFICE_BOUNDS.centerZ - ADMIN_OFFICE_BOUNDS.depth / 2;

  for (const room of BATTERY_ROOM_PLACEMENTS) {
    const minX = room.centerX - room.width / 2;
    const maxX = room.centerX + room.width / 2;
    const minZ = room.centerZ - room.depth / 2;
    const maxZ = room.centerZ + room.depth / 2;

    assert.ok(minX > -59.0 && maxX < -40.0, `${room.roomId} must sit inside West yard clear of MEP wing`);
    if (room.redundancyPath === 'Path A') {
      assert.ok(maxZ <= -28.5, 'Battery Room A must sit clear North of HV/MSB pad (z=-28)');
      assert.deepEqual(room.servedUpsIds, ['ups-a1', 'ups-a2']);
    } else {
      assert.ok(minZ >= 28.5, 'Battery Room B must sit clear South of HV/MSB pad (z=+28)');
      assert.ok(maxZ < adminMinZ - 0.8, 'Battery Room B must sit clear North of Admin Office');
      assert.deepEqual(room.servedUpsIds, ['ups-b1', 'ups-b2']);
    }

    // Verify all served UPS IDs exist in 3D facility placements
    for (const upsId of room.servedUpsIds) {
      assert.ok(
        FACILITY_ASSET_PLACEMENTS.some((f) => f.kind === 'ups' && f.assetId === upsId),
        `${room.roomId} must link to valid 3D UPS ${upsId}`
      );
    }
  }

  // Live telemetry transitions cleanly from Float Charge · Standby -> Discharging -> UPS during utility outage
  const now = 1_700_000_000_000;
  const bms = createInitialBmsState(now);
  const battA = BATTERY_ROOM_PLACEMENTS[0];
  const normalMetrics = computeBatteryRoomMetrics(battA, bms);
  assert.equal(normalMetrics.operatingMode, 'Float Charge · Standby');
  assert.ok(normalMetrics.avgSocPct >= 95);
  assert.ok(normalMetrics.dcVoltageV >= 530 && normalMetrics.dcVoltageV <= 560);

  const outageBms = triggerUtilityOutageDrill(bms, now + 1000);
  const outageMetrics = computeBatteryRoomMetrics(battA, outageBms);
  assert.equal(outageMetrics.operatingMode, 'Discharging → UPS');
  assert.ok(outageMetrics.dcCurrentA > 1000, 'Discharging battery room must supply high DC current to UPS');
});

test('KL1, KL2, and KL3 define 3 architecturally distinct building layouts, Admin Office placements, and tailored camera presets', () => {
  const kl1 = getSiteBuildingLayout('kl1');
  const kl2 = getSiteBuildingLayout('kl2');
  const kl3 = getSiteBuildingLayout('kl3');

  assert.equal(Object.keys(SITE_BUILDING_LAYOUTS).length, 3);
  assert.notEqual(kl1.styleId, kl2.styleId);
  assert.notEqual(kl2.styleId, kl3.styleId);
  assert.notEqual(kl1.styleId, kl3.styleId);
  assert.notEqual(kl1.wallHeight, kl2.wallHeight);
  assert.notEqual(kl1.accentTrimHex, kl2.accentTrimHex);
  assert.notEqual(kl2.accentTrimHex, kl3.accentTrimHex);

  // Admin Office sits in 3 distinct quadrants (SW for KL1, SE for KL2, NW for KL3)
  assert.equal(kl1.adminWingSide, 'SW');
  assert.equal(kl2.adminWingSide, 'SE');
  assert.equal(kl3.adminWingSide, 'NW');
  assert.ok(kl1.adminOffice.centerX < -30 && kl1.adminOffice.centerZ > 25);
  assert.ok(kl2.adminOffice.centerX > 30 && kl2.adminOffice.centerZ > 25);
  assert.ok(kl3.adminOffice.centerX < -30 && kl3.adminOffice.centerZ < -25);

  // Signature architectural features are distinct per site
  assert.equal(kl2.hasBriseSoleilFins, true);
  assert.equal(kl2.hasCantileverSkyDeck, true);
  assert.equal(kl2.hasNorthHelipad, true);
  assert.equal(kl3.hasCornerServiceTowers, true);
  assert.equal(kl3.hasCentralRoofSolarArray, true);
  assert.equal(kl3.hasSouthPorteCochereArch, true);

  // Site-tailored admin-office camera presets track each site's Admin Office quadrant
  const camKl1 = getSiteCameraPresets('kl1')['admin-office'];
  const camKl2 = getSiteCameraPresets('kl2')['admin-office'];
  const camKl3 = getSiteCameraPresets('kl3')['admin-office'];
  assert.ok(camKl1.target.x < 0 && camKl1.target.z > 0);
  assert.ok(camKl2.target.x > 0 && camKl2.target.z > 0);
  assert.ok(camKl3.target.x < 0 && camKl3.target.z < 0);
});



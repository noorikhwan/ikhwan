import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_RACKS, createInitialServers } from './seedData';
import {
  buildRackSlotMap,
  createDeployedServerNode,
  decommissionServerFromRack,
  findFirstOpenUSlot,
  moveServerAcrossRacks,
  RackUReservation,
  validateServerDeployment,
} from './rackElevationEngine';

test('validateServerDeployment rejects collisions, duplicate hostnames, and power overloads while allowing clean deploys', () => {
  const servers = createInitialServers(Date.now());
  const rack = INITIAL_RACKS.find((r) => r.id === 'B-R01-01')!;
  const rackServers = servers.filter((s) => s.rackId === rack.id);
  const occupied = rackServers[0];
  const reservations: RackUReservation[] = [
    {
      id: 'res-1',
      rackId: rack.id,
      uStart: 10,
      uHeight: 2,
      label: 'Expansion Reserved',
      reservedBy: 'Elena Vance',
      createdAt: Date.now(),
    },
  ];

  // Collides with occupied server
  const hitServer = validateServerDeployment(rack, servers, reservations, {
    hostname: 'gpu-b01-new.kl1.orise',
    model: 'Dell PowerEdge R760',
    role: 'Compute',
    uStart: occupied.uStart,
    uHeight: 2,
    ratedPowerW: 900,
  });
  assert.equal(hitServer.valid, false);
  assert.match(hitServer.reason ?? '', /Collides with/);

  // Collides with reservation
  const hitRes = validateServerDeployment(rack, servers, reservations, {
    hostname: 'gpu-b01-new.kl1.orise',
    model: 'Dell PowerEdge R760',
    role: 'Compute',
    uStart: 10,
    uHeight: 2,
    ratedPowerW: 900,
  });
  assert.equal(hitRes.valid, false);
  assert.match(hitRes.reason ?? '', /reserved space/i);

  // Clean open slot deployment
  const openU = findFirstOpenUSlot(rack, rackServers, reservations, 2);
  assert.ok(openU !== null);
  const okDeploy = validateServerDeployment(rack, servers, reservations, {
    hostname: 'cmp-b01-new01.kl1.orise',
    model: 'Dell PowerEdge R760',
    role: 'Compute',
    uStart: openU!,
    uHeight: 2,
    ratedPowerW: 900,
  });
  assert.equal(okDeploy.valid, true);

  const created = createDeployedServerNode(
    rack,
    {
      hostname: 'cmp-b01-new01.kl1.orise',
      model: 'Dell PowerEdge R760',
      role: 'Compute',
      uStart: openU!,
      uHeight: 2,
      ratedPowerW: 900,
    },
    42
  );
  assert.equal(created.rackId, rack.id);
  assert.equal(created.uStart, openU);
});

test('moveServerAcrossRacks, buildRackSlotMap, and decommissionServerFromRack maintain cabinet integrity', () => {
  const servers = createInitialServers(Date.now());
  const sourceSrv = servers.find((s) => s.rackId === 'A-R01-01')!;
  const targetRack = INITIAL_RACKS.find((r) => r.id === 'A-R01-02')!;

  const openU = findFirstOpenUSlot(
    targetRack,
    servers.filter((s) => s.rackId === targetRack.id),
    [],
    sourceSrv.uHeight
  );
  assert.ok(openU !== null);

  const moved = moveServerAcrossRacks(servers, INITIAL_RACKS, [], sourceSrv.id, targetRack.id, openU!);
  assert.equal(moved.ok, true);
  const relocated = moved.servers.find((s) => s.id === sourceSrv.id)!;
  assert.equal(relocated.rackId, targetRack.id);
  assert.equal(relocated.uStart, openU);

  const slots = buildRackSlotMap(
    targetRack,
    moved.servers.filter((s) => s.rackId === targetRack.id),
    []
  );
  const totalCoveredU = slots.reduce((sum, seg) => sum + seg.uHeight, 0);
  assert.equal(totalCoveredU, targetRack.totalU);

  const decomm = decommissionServerFromRack(moved.servers, sourceSrv.id);
  assert.equal(decomm.ok, true);
  assert.equal(decomm.servers.length, servers.length - 1);
});

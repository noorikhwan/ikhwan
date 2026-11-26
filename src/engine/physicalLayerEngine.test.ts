import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeHopOpticalDom,
  createInitialCircuits,
  evaluateCircuitFailureImpact,
} from './physicalLayerEngine';

test('computeHopOpticalDom returns valid optical transceiver DOM telemetry and flags degraded links', () => {
  const now = 1_700_000_000_000;
  const circuits = createInitialCircuits('kl1', now);
  const fiberCircuit = circuits.find((c) => c.mediaType.includes('Fiber'))!;
  assert.ok(fiberCircuit, 'Expected at least one fiber circuit');

  const hop1 = fiberCircuit.hops[0];
  const dom = computeHopOpticalDom(fiberCircuit, hop1);
  assert.ok(dom.txPowerDbm < 0);
  assert.ok(dom.rxPowerDbm < dom.txPowerDbm);
  assert.ok(dom.transceiverTempC > 30 && dom.transceiverTempC < 75);
  assert.ok(dom.attenuationBudgetPct >= 0);

  // Force high hop attenuation to verify Out of Spec status
  const dirtyHop = { ...hop1, lossDb: 0.55 };
  const dirtyDom = computeHopOpticalDom(fiberCircuit, dirtyHop);
  assert.equal(dirtyDom.domStatus, 'Out of Spec');

  // Copper/DAC hop returns nominal electrical/passive optics
  const copperCircuit = circuits.find((c) => c.mediaType === 'Cat6A Copper');
  if (copperCircuit) {
    const copperDom = computeHopOpticalDom(copperCircuit, copperCircuit.hops[0]);
    assert.equal(copperDom.domStatus, 'Nominal');
    assert.equal(copperDom.txPowerDbm, 0);
  }
});

test('evaluateCircuitFailureImpact distinguishes 2N Diverse Failover vs SPOF Outage Risk', () => {
  const now = 1_700_000_000_000;
  const circuits = createInitialCircuits('kl1', now);
  const serverHostnamesByRack = {
    'B-R01-01': ['gpu-b01-n01.orise', 'gpu-b01-n02.orise'],
    'A-R01-01': ['cmp-a01-n01.orise'],
  };

  // Pick a primary circuit that has another active circuit on a different tray
  const diverseCircuit = circuits.find(
    (c) =>
      c.status === 'Active' &&
      !/oob|management/i.test(c.customerOrService) &&
      circuits.some((o) => o.id !== c.id && o.status === 'Active' && o.trayId !== c.trayId)
  )!;
  assert.ok(diverseCircuit);

  const diverseImpact = evaluateCircuitFailureImpact({
    circuit: diverseCircuit,
    allCircuits: circuits,
    serverHostnamesByRack,
    cutHopIndex: 2,
  });
  assert.equal(diverseImpact.redundancyStatus, '2N Diverse Failover');
  assert.ok(diverseImpact.backupCircuitCode);
  assert.equal(diverseImpact.estimatedFailoverMs, 14);
  assert.equal(diverseImpact.simulatedCutHopIndex, 2);

  // Isolated circuit with no sibling circuits -> SPOF Outage Risk
  const spofImpact = evaluateCircuitFailureImpact({
    circuit: diverseCircuit,
    allCircuits: [diverseCircuit],
    serverHostnamesByRack,
    cutHopIndex: 1,
  });
  assert.equal(spofImpact.redundancyStatus, 'SPOF — Outage Risk');
  assert.equal(spofImpact.backupCircuitCode, null);
  assert.equal(spofImpact.estimatedFailoverMs, null);
  assert.ok(spofImpact.affectedServers.length > 0);
});

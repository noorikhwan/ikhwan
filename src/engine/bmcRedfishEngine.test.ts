import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialServers } from './seedData';
import { applyBmcAction, countFirmwareDrift, createInitialServerBmcState } from './bmcRedfishEngine';

test('createInitialServerBmcState and applyBmcAction toggle Locate LED, execute power actions, and append SEL entries', () => {
  const now = Date.now();
  const server = createInitialServers(now)[0];
  const initial = createInitialServerBmcState(server, now);

  assert.match(initial.bmcIp, /^172\.30\./);
  assert.equal(initial.locateLedOn, false);
  assert.equal(initial.powerState, 'On');
  assert.equal(initial.firmware.length, 4);

  const drift = countFirmwareDrift(initial);
  assert.ok(drift.driftCount + drift.securityPatchCount >= 1);

  const ledOn = applyBmcAction(initial, 'toggle_locate_led', 'Elena Vance', now + 1000);
  assert.equal(ledOn.locateLedOn, true);
  assert.match(ledOn.selLog[0].message, /Locate LED activated/i);
  assert.equal(ledOn.selLog[0].actor, 'Elena Vance');

  const restarted = applyBmcAction(ledOn, 'graceful_restart', 'Elena Vance', now + 2000);
  assert.equal(restarted.powerState, 'GracefulRestarting');
  assert.match(restarted.selLog[0].message, /GracefulRestart/);

  const poweredOff = applyBmcAction(restarted, 'graceful_shutdown', 'Elena Vance', now + 3000);
  assert.equal(poweredOff.powerState, 'Off');

  const poweredOn = applyBmcAction(poweredOff, 'power_on', 'Elena Vance', now + 4000);
  assert.equal(poweredOn.powerState, 'On');
});

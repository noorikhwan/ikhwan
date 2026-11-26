import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUrlWorkspaceParams } from './opsEnhancementsEngine';
import {
  buildPrintableAssetQrSvg,
  buildRackQrSheetSvg,
  buildServerQrPayload,
  buildServerQrTagData,
  deriveServerAssetId,
  generateQrSvgMatrix,
  parseScannedServerQrPayload,
} from './serverQrEngine';
import { createAllSitesInitialState } from './sites';

test('deriveServerAssetId produces deterministic, unique asset IDs across servers and sites', () => {
  const sites = createAllSitesInitialState(Date.UTC(2026, 10, 23, 8, 0, 0));
  const kl1Servers = sites.kl1.servers;
  const kl2Servers = sites.kl2.servers;

  const kl1Ids = new Set(kl1Servers.map((s) => deriveServerAssetId(s, 'KL1')));
  assert.equal(kl1Ids.size, kl1Servers.length, 'Every server in KL1 must have a unique asset ID');

  const firstKl1 = deriveServerAssetId(kl1Servers[0], 'KL1');
  const firstKl2 = deriveServerAssetId(kl2Servers[0], 'KL2');
  assert.match(firstKl1, /^AST-KL1-[A-D]-R\d{2}-\d{2}-/);
  assert.notEqual(firstKl1, firstKl2, 'Asset IDs must be unique across data center sites');
});

test('buildServerQrPayload encodes asset ID, hostname, and live status in scannable console link and JSON modes', () => {
  const sites = createAllSitesInitialState(Date.UTC(2026, 10, 23, 8, 0, 0));
  const server = sites.kl1.servers[0];

  const tagData = buildServerQrTagData(server, 'kl1', 'KL1', 'https://dcim.orise.internal');
  const consoleLinkPayload = buildServerQrPayload(tagData, 'console-link');
  const url = new URL(consoleLinkPayload);

  assert.equal(url.searchParams.get('site'), 'kl1');
  assert.equal(url.searchParams.get('tab'), 'servers');
  assert.equal(url.searchParams.get('server'), server.id);
  assert.equal(url.searchParams.get('asset'), tagData.assetId);
  assert.equal(url.searchParams.get('hostname'), server.hostname);
  assert.equal(url.searchParams.get('status'), server.status);

  // Deep-link round-trip parses serverId cleanly so scanning opens ServerDetailDrawer
  const parsed = parseUrlWorkspaceParams(url.search);
  assert.equal(parsed.siteId, 'kl1');
  assert.equal(parsed.tab, 'servers');
  assert.equal(parsed.serverId, server.id);

  // JSON Asset Tag payload contains exact structured fields
  const jsonPayload = buildServerQrPayload(tagData, 'json-tag');
  const parsedJson = JSON.parse(jsonPayload) as Record<string, string>;
  assert.equal(parsedJson.assetId, tagData.assetId);
  assert.equal(parsedJson.hostname, server.hostname);
  assert.equal(parsedJson.status, server.status);
  assert.equal(parsedJson.url, consoleLinkPayload);
});

test('generateQrSvgMatrix produces a valid ISO/IEC 18004 QR matrix that reacts live to status changes', () => {
  const sites = createAllSitesInitialState(Date.UTC(2026, 10, 23, 8, 0, 0));
  const server = sites.kl1.servers[0];

  const nominalTag = buildServerQrTagData(
    { ...server, status: 'nominal' },
    'kl1',
    'KL1',
    'https://dcim.orise.internal'
  );
  const maintenanceTag = buildServerQrTagData(
    { ...server, status: 'maintenance' },
    'kl1',
    'KL1',
    'https://dcim.orise.internal'
  );

  const nominalMatrix = generateQrSvgMatrix(buildServerQrPayload(nominalTag, 'console-link'));
  const maintenanceMatrix = generateQrSvgMatrix(buildServerQrPayload(maintenanceTag, 'console-link'));

  assert.ok(nominalMatrix.size >= 21, 'Standard QR code size must be at least 21x21 modules');
  assert.equal(nominalMatrix.viewBoxSize, nominalMatrix.size + 8, 'Must include 4-module quiet zone on each side');
  assert.ok(nominalMatrix.moduleCount > 100, 'QR matrix must encode real dark modules');
  assert.ok(nominalMatrix.pathData.startsWith('M'), 'SVG path data must start with move command');
  assert.notEqual(
    nominalMatrix.pathData,
    maintenanceMatrix.pathData,
    'Changing server status must re-encode the QR matrix'
  );

  const printableSvg = buildPrintableAssetQrSvg(nominalTag, nominalMatrix);
  assert.ok(printableSvg.includes(nominalTag.assetId));
  assert.ok(printableSvg.includes(nominalTag.hostname));
  assert.ok(printableSvg.includes('STATUS: NOMINAL'));
});

test('parseScannedServerQrPayload decodes URL, JSON, Asset ID, and hostname, and buildRackQrSheetSvg renders multi-label sheet', () => {
  const sites = createAllSitesInitialState(Date.UTC(2026, 10, 23, 8, 0, 0));
  const rackServers = sites.kl1.servers.filter((s) => s.rackId === 'B-R01-01');
  assert.ok(rackServers.length >= 2);

  const firstTag = buildServerQrTagData(rackServers[0], 'kl1', 'KL1', 'https://dcim.orise.internal');
  const fromUrl = parseScannedServerQrPayload(buildServerQrPayload(firstTag, 'console-link'));
  assert.equal(fromUrl.valid, true);
  assert.equal(fromUrl.sourceFormat, 'console-url');
  assert.equal(fromUrl.serverId, rackServers[0].id);
  assert.equal(fromUrl.siteId, 'kl1');

  const fromJson = parseScannedServerQrPayload(buildServerQrPayload(firstTag, 'json-tag'));
  assert.equal(fromJson.valid, true);
  assert.equal(fromJson.sourceFormat, 'json-tag');
  assert.equal(fromJson.assetId, firstTag.assetId);
  assert.equal(fromJson.serverId, rackServers[0].id);

  const fromAsset = parseScannedServerQrPayload(firstTag.assetId);
  assert.equal(fromAsset.valid, true);
  assert.equal(fromAsset.sourceFormat, 'asset-id');
  assert.equal(fromAsset.siteId, 'kl1');

  const sheetItems = rackServers.map((s) => {
    const tagData = buildServerQrTagData(s, 'kl1', 'KL1', 'https://dcim.orise.internal');
    const matrix = generateQrSvgMatrix(buildServerQrPayload(tagData, 'console-link'));
    return { tagData, matrix };
  });
  const sheetSvg = buildRackQrSheetSvg('B-R01-01', 'KL1', sheetItems);
  assert.ok(sheetSvg.includes('Cabinet B-R01-01 QR Asset Label Sheet'));
  for (const item of sheetItems) {
    assert.ok(sheetSvg.includes(item.tagData.assetId));
    assert.ok(sheetSvg.includes(item.tagData.hostname));
  }
});

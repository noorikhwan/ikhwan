import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialBmsState } from './bmsEngine';
import { computeBmsRackPowerStats } from './rackPowerEngine';
import {
  buildAllRacksPowerCsv,
  buildAllRacksPowerCsvFilename,
  formatRackUtilizationStatus,
  RACK_POWER_CSV_HEADERS,
} from './rackPowerCsvExport';
import { INITIAL_RACKS, INITIAL_CHANNELS, createInitialServers, createInitialAlerts } from './seedData';
import { evaluateRackPowerCapacityAlerts } from './telemetryEngine';

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

test('buildAllRacksPowerCsv exports all 1,600 racks across all 4 halls with UTF-8 BOM, CRLF, and exact headers', () => {
  const now = 1_700_000_000_000;
  const servers = createInitialServers(now);
  const bms = createInitialBmsState(now);
  const powerMap = computeBmsRackPowerStats(INITIAL_RACKS, bms, servers);
  const evalRes = evaluateRackPowerCapacityAlerts({
    racks: INITIAL_RACKS,
    bms,
    servers,
    channels: INITIAL_CHANNELS,
    existingAlerts: createInitialAlerts(now),
    now,
  });

  const csv = buildAllRacksPowerCsv(INITIAL_RACKS, powerMap, servers, evalRes.alerts, {
    siteCode: 'KL1',
    exportedAt: now,
  });

  assert.ok(csv.startsWith('\uFEFF'), 'CSV should include UTF-8 BOM for Excel compatibility');
  assert.ok(csv.endsWith('\r\n'), 'CSV should end with CRLF');

  const lines = csv.slice(1).trimEnd().split('\r\n');
  assert.equal(lines.length, INITIAL_RACKS.length + 1, 'Expected 1 header row + 1,600 rack rows');

  const headerCells = parseCsvLine(lines[0]);
  assert.deepEqual(headerCells, [...RACK_POWER_CSV_HEADERS]);

  // First data row should be Hall A, Row 1, Rack 1 (A-R01-01)
  const firstRow = parseCsvLine(lines[1]);
  assert.equal(firstRow[0], 'KL1');
  assert.equal(firstRow[1], 'A-R01-01');
  assert.equal(firstRow[4], '1');

  // Last data row should be Hall D, Row 20, Rack 20 (D-R20-20)
  const lastRow = parseCsvLine(lines[lines.length - 1]);
  assert.equal(lastRow[1], 'D-R20-20');

  // Verify live host rack B-R01-01 reports 3 live hosts and 18U used
  const br0101Line = lines.find((l) => l.includes(',B-R01-01,'));
  assert.ok(br0101Line);
  const br0101 = parseCsvLine(br0101Line);
  assert.equal(br0101[16], '18'); // U-Space Used (U)
  assert.equal(br0101[20], '3'); // Live Telemetry Hosts

  // Verify capacity-exceeded rack B-R03-10 reports Critical (Over Capacity) & active alert
  const br0310Line = lines.find((l) => l.includes(',B-R03-10,'));
  assert.ok(br0310Line);
  const br0310 = parseCsvLine(br0310Line);
  assert.ok(Number(br0310[5]) > Number(br0310[6]), 'B-R03-10 draw should exceed rated 22 kW limit');
  assert.equal(br0310[8], 'Critical (Over Capacity)');
  assert.equal(br0310[9], 'Yes');
  assert.ok(Number(br0310[10]) > 0, 'Over capacity margin should be > 0 kW');
  assert.equal(br0310[19], 'Yes', 'Active capacity alert should be Yes');
});

test('formatRackUtilizationStatus classifies capacity breaches and all load bands accurately', () => {
  assert.equal(
    formatRackUtilizationStatus({ exceedsCapacity: true, powerBand: 'Overload' }),
    'Critical (Over Capacity)'
  );
  assert.equal(
    formatRackUtilizationStatus({ exceedsCapacity: false, powerBand: 'Overload' }),
    'Overload (Near Cap)'
  );
  assert.equal(formatRackUtilizationStatus({ exceedsCapacity: false, powerBand: 'High' }), 'High');
  assert.equal(formatRackUtilizationStatus({ exceedsCapacity: false, powerBand: 'Elevated' }), 'Elevated');
  assert.equal(formatRackUtilizationStatus({ exceedsCapacity: false, powerBand: 'Nominal' }), 'Nominal');
  assert.equal(formatRackUtilizationStatus({ exceedsCapacity: false, powerBand: 'Low' }), 'Low');
});

test('buildAllRacksPowerCsvFilename sanitizes site code and formats UTC timestamp', () => {
  const filename = buildAllRacksPowerCsvFilename({
    siteCode: 'KL2/Primary!',
    now: Date.UTC(2026, 10, 23, 8, 5, 0),
  });
  assert.equal(filename, 'orise-all-racks-power-utilization-KL2Primary-2026-11-23_08-05.csv');
});

test('buildAllRacksPowerCsv neutralizes CSV formula injection in custom site or hall names', () => {
  const now = 1_700_000_000_000;
  const servers = createInitialServers(now);
  const bms = createInitialBmsState(now);
  const sampleRack = { ...INITIAL_RACKS[0], hallName: '=HYPERLINK("http://evil")' };
  const powerMap = computeBmsRackPowerStats([sampleRack], bms, servers);
  const csv = buildAllRacksPowerCsv([sampleRack], powerMap, servers, [], {
    siteCode: '+KL1',
    exportedAt: now,
  });
  const dataRow = parseCsvLine(csv.slice(1).trimEnd().split('\r\n')[1]);
  assert.equal(dataRow[0], "'+KL1");
  assert.equal(dataRow[2], '\'=HYPERLINK("http://evil")');
});

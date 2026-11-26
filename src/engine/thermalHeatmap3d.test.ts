import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialBmsState } from './bmsEngine';
import { createInitialServers, INITIAL_RACKS } from './seedData';
import {
  HEATMAP_GRID_COLS,
  HEATMAP_GRID_ROWS,
  computeThermalHeatmapGrid,
  extractHotspotPlumes,
  getSliceHeightLabel,
  renderHeatmapToRgba,
  temperatureToHeatMapHex,
  temperatureToHeatMapRgb,
} from './thermalHeatmap3d';

const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);

test('temperatureToHeatMapRgb transitions cleanly from cool blue to cyan, green, yellow, orange, and crimson', () => {
  const [rCold, , bCold] = temperatureToHeatMapRgb(18);
  const [, gMid] = temperatureToHeatMapRgb(31);
  const [rHot, gHot, bHot] = temperatureToHeatMapRgb(78);

  assert.ok(bCold > rCold + 100, '18°C must render predominantly cool blue');
  assert.ok(gMid > 150, '31°C must render predominantly green');
  assert.ok(rHot > 200 && rHot > bHot + 150 && gHot < 100, '78°C must render critical crimson-red');
  assert.equal(typeof temperatureToHeatMapHex(64), 'number');
});

test('computeThermalHeatmapGrid models all 4 halls, detects Hall B GPU hotspot, and stratifies vertically', () => {
  const servers = createInitialServers(NOW);
  const bms = createInitialBmsState(NOW);

  const floorGrid = computeThermalHeatmapGrid(INITIAL_RACKS, servers, bms, 0.35);
  const exhaustGrid = computeThermalHeatmapGrid(INITIAL_RACKS, servers, bms, 2.3);
  const ceilingGrid = computeThermalHeatmapGrid(INITIAL_RACKS, servers, bms, 3.4);

  assert.equal(floorGrid.cols, HEATMAP_GRID_COLS);
  assert.equal(floorGrid.rows, HEATMAP_GRID_ROWS);
  assert.equal(floorGrid.tempsC.length, HEATMAP_GRID_COLS * HEATMAP_GRID_ROWS);
  assert.equal(exhaustGrid.hottestRackId, 'B-R01-01');
  assert.ok(exhaustGrid.hottestRackTempC >= 75, `expected critical GPU hotspot >= 75°C, got ${exhaustGrid.hottestRackTempC}`);
  assert.ok(exhaustGrid.maxTempC >= 70, `expected grid maxTempC >= 70°C, got ${exhaustGrid.maxTempC}`);
  assert.ok(floorGrid.minTempC < 26, `expected cool floor plenum intake < 26°C, got ${floorGrid.minTempC}`);
  assert.ok(
    ceilingGrid.avgTempC > floorGrid.avgTempC,
    `expected thermal stratification (ceiling ${ceilingGrid.avgTempC}°C > floor ${floorGrid.avgTempC}°C)`
  );
  assert.equal(getSliceHeightLabel(0.4), 'Floor Plenum');
  assert.equal(getSliceHeightLabel(1.2), 'Cold Aisle Intake');
  assert.equal(getSliceHeightLabel(2.2), 'Rack Exhaust');
  assert.equal(getSliceHeightLabel(3.3), 'Ceiling Return');
});

test('computeThermalHeatmapGrid reacts immediately to dual CRAC fault and Cold Aisle SLA excursion', () => {
  const servers = createInitialServers(NOW);
  const bmsNominal = createInitialBmsState(NOW);
  const nominalGrid = computeThermalHeatmapGrid(INITIAL_RACKS, servers, bmsNominal, 1.4);

  const bmsFault = structuredClone(bmsNominal);
  for (const crac of bmsFault.cracUnits) {
    if (crac.hallId === 'hall-a') {
      crac.mode = 'Fault';
      crac.supplyTempC = 32.5;
      crac.returnTempC = 41.0;
    }
  }
  const hallASensor = bmsFault.envSensors.find((s) => s.hallId === 'hall-a');
  if (hallASensor) {
    hallASensor.coldAisleTempC = 30.8;
    hallASensor.tempSlaStatus = 'Breached';
    hallASensor.slaExcursionActive = true;
  }

  const faultGrid = computeThermalHeatmapGrid(INITIAL_RACKS, servers, bmsFault, 1.4);
  assert.ok(
    faultGrid.avgTempC > nominalGrid.avgTempC + 1.5,
    `expected Hall A dual CRAC fault to raise thermal heat map average (${faultGrid.avgTempC} vs ${nominalGrid.avgTempC})`
  );
  assert.ok(faultGrid.coldAisleAvgC > nominalGrid.coldAisleAvgC + 1.5);
});

test('renderHeatmapToRgba writes valid RGBA texture buffer with isotherm contour modulation', () => {
  const servers = createInitialServers(NOW);
  const bms = createInitialBmsState(NOW);
  const grid = computeThermalHeatmapGrid(INITIAL_RACKS, servers, bms, 1.8);

  const plain = renderHeatmapToRgba(grid, { showContours: false, opacity: 0.85 });
  const contoured = renderHeatmapToRgba(grid, { showContours: true, opacity: 0.85 });

  assert.equal(plain.length, HEATMAP_GRID_COLS * HEATMAP_GRID_ROWS * 4);
  assert.equal(contoured.length, plain.length);

  let nonZeroAlpha = 0;
  let contourDiffPixels = 0;
  for (let i = 0; i < plain.length; i += 4) {
    if (plain[i + 3] > 0) nonZeroAlpha += 1;
    if (
      plain[i] !== contoured[i] ||
      plain[i + 1] !== contoured[i + 1] ||
      plain[i + 2] !== contoured[i + 2]
    ) {
      contourDiffPixels += 1;
    }
  }
  assert.ok(nonZeroAlpha > HEATMAP_GRID_COLS * HEATMAP_GRID_ROWS * 0.8, 'expected most interior texels visible');
  assert.ok(contourDiffPixels > 50, `expected crisp isotherm contour pixels, found ${contourDiffPixels}`);
});

test('extractHotspotPlumes ranks critical GPU rack B-R01-01 first with valid 3D plume geometry', () => {
  const servers = createInitialServers(NOW);
  const bms = createInitialBmsState(NOW);
  const plumes = extractHotspotPlumes(INITIAL_RACKS, servers, bms, 64);

  assert.ok(plumes.length > 0, 'expected at least 1 thermal exhaust plume');
  assert.equal(plumes[0].rackId, 'B-R01-01');
  assert.ok(plumes[0].intensity > 0.75);
  assert.ok(plumes[0].heightM >= 3.0);
  assert.ok(plumes[0].radiusM >= 0.75);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_RACKS } from './seedData';
import { createAllSitesInitialState } from './sites';
import {
  buildBmsThermalOverlaySample,
  buildRackFrontThermalGradientCss,
  computeBmsSensorRackStats,
  computeHallBmsSensorSummary,
  computeHallInletThermalSummary,
  computeHallThermalSummary,
  computeRackInletThermalStats,
  computeRackThermalStats,
  computeTemperatureMarkerPercent,
  FIXED_INLET_MAX_C,
  FIXED_INLET_MIN_C,
  FIXED_SENSOR_MAX_C,
  FIXED_SENSOR_MIN_C,
  getHeatmapTemperatureScaleGradientCss,
  getRackFrontFacing,
  getTemperatureScaleZones,
  HEATMAP_SCALE_LEGEND_MAX_C,
  HEATMAP_SCALE_LEGEND_MIN_C,
  HEATMAP_SCALE_LEGEND_TICKS,
  interpolateInletThermalColor,
  interpolateSensorThermalColor,
  interpolateTemperatureScaleColor,
  interpolateThermalColor,
  resolveHeatmapScaleBounds,
  resolveInletHeatmapScaleBounds,
  resolveSensorHeatmapScaleBounds,
  resolveTemperatureLegendScaleBounds,
} from './rackHeatmapEngine';

test('computeRackThermalStats computes exact arithmetic average server temperature per rack and reacts dynamically to faults', () => {
  const now = Date.UTC(2026, 10, 22, 6, 0, 0);
  const sites = createAllSitesInitialState(now);
  const kl1 = sites.kl1;

  const targetRackId = 'B-R01-01';
  const rackServers = kl1.servers.filter((s) => s.rackId === targetRackId);
  assert.ok(rackServers.length >= 2, 'Expected multiple live servers in B-R01-01');

  const expectedAvg =
    Math.round(
      (rackServers.reduce((acc, s) => acc + s.tempC, 0) / rackServers.length) * 10
    ) / 10;

  const stats = computeRackThermalStats(INITIAL_RACKS, kl1.servers, kl1.bms);
  const rackStat = stats[targetRackId];
  assert.ok(rackStat);
  assert.equal(rackStat.hasLiveServers, true);
  assert.equal(rackStat.serverCount, rackServers.length);
  assert.equal(rackStat.avgTempC, expectedAvg);
  assert.ok(rackStat.maxTempC >= rackStat.avgTempC && rackStat.avgTempC >= rackStat.minTempC);

  // Simulate a +15°C thermal spike on one server in the rack -> average must rise immediately
  const heatedServers = kl1.servers.map((s) =>
    s.id === rackServers[0].id ? { ...s, tempC: s.tempC + 15 } : s
  );
  const heatedStats = computeRackThermalStats(INITIAL_RACKS, heatedServers, kl1.bms);
  assert.ok(
    heatedStats[targetRackId].avgTempC > rackStat.avgTempC,
    'Expected rack avgTempC to increase after server thermal spike'
  );
});

test('interpolateThermalColor smoothly maps cool-to-critical temperatures and resolves fixed vs dynamic legend bounds', () => {
  const cool = interpolateThermalColor(36, 35, 80);
  const nominal = interpolateThermalColor(54, 35, 80);
  const hot = interpolateThermalColor(78, 35, 80);

  assert.equal(cool.band, 'Cool');
  assert.equal(nominal.band, 'Nominal');
  assert.equal(hot.band, 'Critical');
  assert.ok(cool.b > cool.r, 'Cool temperature should be blue-dominant');
  assert.ok(hot.r > hot.b, 'Critical temperature should be red-dominant');
  assert.ok(cool.normalized < nominal.normalized && nominal.normalized < hot.normalized);
  assert.match(hot.hex, /^#[0-9a-f]{6}$/);

  const now = Date.UTC(2026, 10, 22, 6, 0, 0);
  const kl1 = createAllSitesInitialState(now).kl1;
  const stats = computeRackThermalStats(INITIAL_RACKS, kl1.servers, kl1.bms);
  const hallBSummary = computeHallThermalSummary('hall-b', INITIAL_RACKS, stats);

  assert.ok(hallBSummary.avgTempC > 35 && hallBSummary.maxTempC >= hallBSummary.avgTempC);
  assert.ok(hallBSummary.hottestRackId !== null);

  const fixedBounds = resolveHeatmapScaleBounds('fixed', hallBSummary);
  assert.equal(fixedBounds.minC, 35);
  assert.equal(fixedBounds.maxC, 80);
  assert.equal(fixedBounds.ticks.length, 4);

  const dynamicBounds = resolveHeatmapScaleBounds('dynamic', hallBSummary);
  assert.ok(dynamicBounds.maxC - dynamicBounds.minC >= 10);
  assert.ok(dynamicBounds.minC <= hallBSummary.minTempC);
  assert.ok(dynamicBounds.maxC >= hallBSummary.maxTempC);
});

test('computeBmsSensorRackStats visualizes live BMS environment sensor telemetry per rack and reacts to SLA excursions', () => {
  const now = Date.UTC(2026, 10, 22, 6, 0, 0);
  const kl1 = createAllSitesInitialState(now).kl1;

  const baseMap = computeBmsSensorRackStats(INITIAL_RACKS, kl1.bms, kl1.servers);
  const probeARack = baseMap['B-R04-05'];
  const midRack = baseMap['B-R04-10'];
  const probeBRack = baseMap['B-R04-16'];

  assert.ok(probeARack && midRack && probeBRack);
  assert.equal(probeARack.probeMountSlot, 'A');
  assert.equal(probeARack.redundancyPath, 'Path A');
  assert.equal(midRack.probeMountSlot, null);
  assert.equal(probeBRack.probeMountSlot, 'B');
  assert.equal(probeBRack.redundancyPath, 'Path B');
  assert.ok(probeARack.sensorTempC >= 16 && probeARack.sensorTempC <= 27);

  const summary = computeHallBmsSensorSummary('hall-b', INITIAL_RACKS, baseMap, kl1.bms);
  assert.equal(summary.probeCount, 40, 'Hall B should have 40 mounted cold-aisle row probes');
  assert.ok(summary.warmestRackId !== null);

  const fixedSensorBounds = resolveSensorHeatmapScaleBounds('fixed', summary);
  assert.equal(fixedSensorBounds.minC, FIXED_SENSOR_MIN_C);
  assert.equal(fixedSensorBounds.maxC, FIXED_SENSOR_MAX_C);

  const dynamicSensorBounds = resolveSensorHeatmapScaleBounds('dynamic', summary);
  assert.ok(dynamicSensorBounds.maxC - dynamicSensorBounds.minC >= 4);

  // Inject a real-time BMS cold-aisle temperature excursion in Hall B (+9°C) -> racks must flip to Breached
  const hotBms = {
    ...kl1.bms,
    envSensors: kl1.bms.envSensors.map((e) =>
      e.hallId === 'hall-b'
        ? {
            ...e,
            coldAisleTempC: 29.2,
            probeATempC: 29.0,
            probeBTempC: 29.4,
            tempSlaStatus: 'Breached' as const,
            slaExcursionActive: true,
          }
        : e
    ),
  };

  const hotMap = computeBmsSensorRackStats(INITIAL_RACKS, hotBms, kl1.servers);
  const hotSummary = computeHallBmsSensorSummary('hall-b', INITIAL_RACKS, hotMap, hotBms);
  assert.ok(
    hotMap['B-R04-05'].sensorTempC > probeARack.sensorTempC + 6,
    'Rack BMS sensor temp must jump dynamically when BMS environment probe rises'
  );
  assert.equal(hotMap['B-R04-05'].slaStatus, 'Breached');
  assert.ok(hotSummary.breachedCount > 350, 'Excursion should mark Hall B racks as SLA Breached');

  const breachColor = interpolateSensorThermalColor(29.0);
  const optimalColor = interpolateSensorThermalColor(20.5);
  assert.ok(breachColor.r > optimalColor.r && breachColor.normalized > optimalColor.normalized);
});

test('buildBmsThermalOverlaySample formats °C labels and ASHRAE SLA thermal status indicators', () => {
  const optimal = buildBmsThermalOverlaySample({
    sensorTempC: 21.44,
    sensorBand: 'Optimal',
    slaStatus: 'Compliant',
  });
  assert.equal(optimal.tempLabel, '21.4°');
  assert.equal(optimal.band, 'Optimal');
  assert.equal(optimal.isThermalAlert, false);
  assert.match(optimal.statusBarClass, /emerald/);

  const warning = buildBmsThermalOverlaySample({
    sensorTempC: 26.2,
    sensorBand: 'Warning',
    slaStatus: 'Warning',
  });
  assert.equal(warning.tempLabel, '26.2°');
  assert.equal(warning.isThermalAlert, true);
  assert.match(warning.statusBarClass, /orange/);

  const breached = buildBmsThermalOverlaySample({
    sensorTempC: 28.7,
    sensorBand: 'Breached',
    slaStatus: 'Breached',
  });
  assert.equal(breached.tempLabel, '28.7°');
  assert.equal(breached.isThermalAlert, true);
  assert.match(breached.statusBarClass, /red/);

  const subSla = buildBmsThermalOverlaySample(undefined, 17.2);
  assert.equal(subSla.tempLabel, '17.2°');
  assert.equal(subSla.band, 'Sub-SLA');
  assert.match(subSla.statusBarClass, /sky/);
});

test('computeRackInletThermalStats computes exact average server inlet temp per rack and builds directional rack-front gradients', () => {
  const now = Date.UTC(2026, 10, 23, 8, 0, 0);
  const kl1 = createAllSitesInitialState(now).kl1;

  const targetRackId = 'B-R01-01';
  const rackServers = kl1.servers.filter((s) => s.rackId === targetRackId);
  assert.ok(rackServers.length >= 2, 'Expected multiple live servers in B-R01-01');

  const expectedAvgInlet =
    Math.round(
      (rackServers.reduce((acc, s) => acc + s.inletTempC, 0) / rackServers.length) * 10
    ) / 10;

  const inletMap = computeRackInletThermalStats(INITIAL_RACKS, kl1.servers, kl1.bms);
  const oddRowRack = inletMap[targetRackId]; // Row 1 (odd -> south front facing cold aisle)
  const evenRowRack = inletMap['B-R02-01']; // Row 2 (even -> north front facing cold aisle)

  assert.ok(oddRowRack && evenRowRack);
  assert.equal(oddRowRack.hasLiveServers, true);
  assert.equal(oddRowRack.avgInletTempC, expectedAvgInlet);
  assert.equal(oddRowRack.frontFacing, 'south');
  assert.equal(getRackFrontFacing(1), 'south');
  assert.equal(evenRowRack.frontFacing, 'north');
  assert.equal(getRackFrontFacing(2), 'north');
  assert.ok(oddRowRack.deltaTExhaustToInletC > 10, 'Exhaust should be well above server inlet');

  // Directional CSS gradients match rack front orientation (bottom -> top for south, top -> bottom for north)
  const southGrad = buildRackFrontThermalGradientCss(oddRowRack);
  const northGrad = buildRackFrontThermalGradientCss(evenRowRack);
  assert.ok(southGrad.backgroundImage.startsWith('linear-gradient(to top,'));
  assert.ok(northGrad.backgroundImage.startsWith('linear-gradient(to bottom,'));
  assert.match(southGrad.frontEdgeColor, /^#[0-9a-f]{6}$/);

  // Raising server inletTempC increases rack avgInletTempC and shifts front gradient color warmer
  const hotInletServers = kl1.servers.map((s) =>
    s.rackId === targetRackId ? { ...s, inletTempC: 28.6 } : s
  );
  const hotInletMap = computeRackInletThermalStats(INITIAL_RACKS, hotInletServers, kl1.bms);
  assert.equal(hotInletMap[targetRackId].avgInletTempC, 28.6);
  assert.equal(hotInletMap[targetRackId].band, 'Breached');

  const coolColor = interpolateInletThermalColor(18.0);
  const hotColor = interpolateInletThermalColor(28.6);
  assert.ok(hotColor.r > coolColor.r && hotColor.normalized > coolColor.normalized);

  // Hall inlet summary & fixed/dynamic scale bounds
  const hallBSummary = computeHallInletThermalSummary('hall-b', INITIAL_RACKS, hotInletMap);
  assert.ok(hallBSummary.warmestRackId !== null);
  assert.ok(hallBSummary.breachedCount >= 1);

  const fixedBounds = resolveInletHeatmapScaleBounds('fixed', hallBSummary);
  assert.equal(fixedBounds.minC, FIXED_INLET_MIN_C);
  assert.equal(fixedBounds.maxC, FIXED_INLET_MAX_C);

  const dynamicBounds = resolveInletHeatmapScaleBounds('dynamic', hallBSummary);
  assert.ok(dynamicBounds.maxC - dynamicBounds.minC >= 4);
  assert.ok(dynamicBounds.maxC >= hallBSummary.maxInletTempC);
});

test('20°C–45°C heatmap temperature scale legend generates calibrated gradient, zones, marker projection, and bounds', () => {
  assert.equal(HEATMAP_SCALE_LEGEND_MIN_C, 20);
  assert.equal(HEATMAP_SCALE_LEGEND_MAX_C, 45);
  assert.deepEqual([...HEATMAP_SCALE_LEGEND_TICKS], [20, 25, 30, 35, 40, 45]);

  const gradientCss = getHeatmapTemperatureScaleGradientCss();
  assert.ok(gradientCss.startsWith('linear-gradient(90deg,'));
  assert.ok(gradientCss.includes('0%') && gradientCss.includes('100%'));

  const cool = interpolateTemperatureScaleColor(20);
  const nominal = interpolateTemperatureScaleColor(30);
  const critical = interpolateTemperatureScaleColor(45);
  assert.equal(cool.normalized, 0);
  assert.equal(critical.normalized, 1);
  assert.ok(cool.b > cool.r, '20°C should be cool blue-dominant');
  assert.ok(nominal.g > nominal.r && nominal.g > nominal.b, '30°C should be emerald green-dominant');
  assert.ok(critical.r > critical.b, '45°C should be critical crimson-dominant');

  const zones = getTemperatureScaleZones();
  assert.equal(zones.length, 5);
  assert.equal(zones[0].minC, 20);
  assert.equal(zones[0].maxC, 25);
  assert.equal(zones[4].minC, 40);
  assert.equal(zones[4].maxC, 45);

  const midMarker = computeTemperatureMarkerPercent(32.5);
  assert.equal(midMarker.percent, 50);
  assert.equal(midMarker.clampedLow, false);
  assert.equal(midMarker.clampedHigh, false);

  const lowMarker = computeTemperatureMarkerPercent(16.0);
  assert.equal(lowMarker.percent, 0);
  assert.equal(lowMarker.clampedLow, true);

  const highMarker = computeTemperatureMarkerPercent(58.0);
  assert.equal(highMarker.percent, 100);
  assert.equal(highMarker.clampedHigh, true);

  const fixedLegendBounds = resolveTemperatureLegendScaleBounds('fixed', 21.0, 28.0);
  assert.equal(fixedLegendBounds.minC, 20);
  assert.equal(fixedLegendBounds.maxC, 45);
  assert.deepEqual(fixedLegendBounds.ticks, [20, 25, 30, 35, 40, 45]);

  const dynamicLegendBounds = resolveTemperatureLegendScaleBounds('dynamic', 21.2, 26.8);
  assert.equal(dynamicLegendBounds.ticks.length, 6);
  assert.ok(dynamicLegendBounds.minC <= 21.2 && dynamicLegendBounds.maxC >= 26.8);
});




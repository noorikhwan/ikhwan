import { RackBmsSensorStat } from './rackHeatmapEngine';
import { RackBmsPowerStat } from './rackPowerEngine';
import { RackDefinition } from './types';

export interface CabinetSparklinePoint {
  hourIndex: number; // 0 (-24h) .. 24 (Now)
  hourLabel: string;
  powerKw: number;
  intakeTempC: number;
}

export interface CabinetSparklineSeries {
  rackId: string;
  points: CabinetSparklinePoint[];
  powerMinKw: number;
  powerMaxKw: number;
  powerDelta24hKw: number;
  effectiveLimitKw: number;
  tempMinC: number;
  tempMaxC: number;
  tempDelta24hC: number;
  ashraeMaxC: number;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function formatHourLabel(ts: number, isNow: boolean): string {
  if (isNow) return 'Now';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:00`;
}

/**
 * Generates a deterministic 25-point (24h hourly + Now) per-cabinet Power (kW) &
 * BMS Intake (°C) sparkline series anchored strictly to live cabinet telemetry at index 24.
 */
export function buildCabinetSparkline24h(
  rack: RackDefinition,
  powerStat: RackBmsPowerStat,
  sensorStat: RackBmsSensorStat | undefined,
  nowMs: number = Date.now()
): CabinetSparklineSeries {
  const livePowerKw = powerStat.powerKw;
  const liveTempC = sensorStat?.sensorTempC ?? rack.ambientTempC;
  const phase = rack.rowNumber * 0.43 + rack.rackIndex * 0.29;
  const isAiHall = rack.hallId === 'hall-b';

  const points: CabinetSparklinePoint[] = [];

  for (let i = 0; i <= 24; i++) {
    const hoursAgo = 24 - i;
    const ts = nowMs - hoursAgo * 3600 * 1000;
    const progress = i / 24; // 0..1

    if (i === 24) {
      points.push({
        hourIndex: i,
        hourLabel: 'Now',
        powerKw: round2(livePowerKw),
        intakeTempC: round1(liveTempC),
      });
      continue;
    }

    // Blend smoothly toward live reading as i approaches 24 so no artificial cliff appears
    const envelope = 1 - progress;
    const diurnal = Math.sin(((i - 6) / 24) * Math.PI * 2);
    const ripple = Math.sin(i * 0.65 + phase) * 0.35 + Math.cos(i * 0.31 + phase * 0.5) * 0.2;

    const growthDriftKw = (isAiHall ? 1.15 : 0.65) * envelope;
    const waveKw = (diurnal * (isAiHall ? 0.9 : 0.65) + ripple * 0.45) * (0.35 + 0.65 * envelope);
    const powerKw = round2(
      Math.max(0.4, Math.min(rack.powerCapacityKw * 1.25, livePowerKw - growthDriftKw + waveKw))
    );

    const tempDriftC = (isAiHall ? 0.8 : 0.45) * envelope;
    const tempWaveC = (diurnal * 0.9 + ripple * 0.35) * (0.3 + 0.7 * envelope);
    const intakeTempC = round1(
      Math.max(17.2, Math.min(34.5, liveTempC - tempDriftC + tempWaveC))
    );

    points.push({
      hourIndex: i,
      hourLabel: formatHourLabel(ts, false),
      powerKw,
      intakeTempC,
    });
  }

  const powers = points.map((p) => p.powerKw);
  const temps = points.map((p) => p.intakeTempC);

  return {
    rackId: rack.id,
    points,
    powerMinKw: round2(Math.min(...powers)),
    powerMaxKw: round2(Math.max(...powers)),
    powerDelta24hKw: round2(points[24].powerKw - points[0].powerKw),
    effectiveLimitKw: powerStat.effectiveLimitKw,
    tempMinC: round1(Math.min(...temps)),
    tempMaxC: round1(Math.max(...temps)),
    tempDelta24hC: round1(points[24].intakeTempC - points[0].intakeTempC),
    ashraeMaxC: 27.0,
  };
}

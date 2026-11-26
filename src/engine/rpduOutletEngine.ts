import { RackBmsPowerStat } from './rackPowerEngine';
import { RackDefinition, ServerNode } from './types';

export type RpduFeedId = 'A' | 'B';
export type OutletPowerState = 'On' | 'Off';

export interface RpduOutletOverride {
  powerState?: OutletPowerState;
  locked?: boolean;
  lastCycleAt?: number | null;
  cycleCount?: number;
}

export type RpduOverrideMap = Record<string, RpduOutletOverride>;

export interface RpduOutletMetric {
  id: string; // e.g. "B-R01-01:A:01"
  rackId: string;
  feed: RpduFeedId;
  outletNumber: number; // 1..24
  connectorType: 'C13' | 'C19';
  assignedDevice: string;
  serverId: string | null;
  powerState: OutletPowerState;
  locked: boolean;
  watts: number;
  amps: number;
  voltageV: number;
  powerFactor: number;
  lastCycleAt: number | null;
  cycleCount: number;
  isCriticalLoad: boolean;
}

export interface RpduStripSummary {
  rackId: string;
  feed: RpduFeedId;
  pduName: string;
  ratedAmps: number;
  voltageV: number;
  totalWatts: number;
  totalAmps: number;
  utilizationPct: number;
  occupiedCount: number;
  onCount: number;
  offCount: number;
  lockedCount: number;
  outlets: RpduOutletMetric[];
}

export const OUTLETS_PER_RPDU_STRIP = 24;
const NOMINAL_VOLTAGE_V = 230;

export function buildOutletKey(rackId: string, feed: RpduFeedId, outletNumber: number): string {
  return `${rackId}:${feed}:${String(outletNumber).padStart(2, '0')}`;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Computes live 24-outlet metering for a cabinet's Feed A or Feed B intelligent rPDU strip,
 * anchored to real mounted servers and the cabinet's live BMS feed draw.
 */
export function computeRackRpduStrip(params: {
  rack: RackDefinition;
  feed: RpduFeedId;
  servers: ServerNode[];
  powerStat?: RackBmsPowerStat;
  overrides?: RpduOverrideMap;
}): RpduStripSummary {
  const { rack, feed, servers, powerStat, overrides = {} } = params;
  const rackServers = servers
    .filter((s) => s.rackId === rack.id)
    .sort((a, b) => b.uStart - a.uStart);

  const feedKw = powerStat
    ? feed === 'A'
      ? powerStat.feedAKw
      : powerStat.feedBKw
    : rack.basePowerKw / 2;
  const targetFeedWatts = Math.max(0, Math.round(feedKw * 1000));
  const ratedAmps = rack.powerCapacityKw >= 20 ? 63 : 32;

  // Determine how many base chassis slots are occupied besides live telemetry servers
  const liveCount = Math.min(rackServers.length, 16);
  const baseOccupiedTotal = Math.min(
    OUTLETS_PER_RPDU_STRIP - 2,
    Math.max(liveCount + 2, Math.round(rack.baseUsedU / 2.6))
  );

  // Assign live server outlets first (1..liveCount)
  let allocatedLiveWatts = 0;
  const rawOutlets: RpduOutletMetric[] = [];

  for (let i = 1; i <= OUTLETS_PER_RPDU_STRIP; i++) {
    const key = buildOutletKey(rack.id, feed, i);
    const ov = overrides[key];
    const connectorType: 'C13' | 'C19' = i <= 6 ? 'C19' : 'C13';

    if (i <= liveCount) {
      const srv = rackServers[i - 1];
      const feedShare = feed === 'A' ? 0.51 : 0.49;
      const baseWatts = Math.round(srv.powerW * feedShare);
      const isCriticalLoad = srv.role === 'Network Spine' || srv.role === 'NVMe Storage';
      const defaultLocked = isCriticalLoad;
      const powerState: OutletPowerState = ov?.powerState ?? 'On';
      const locked = ov?.locked ?? defaultLocked;
      const watts = powerState === 'Off' ? 0 : baseWatts;
      allocatedLiveWatts += watts;
      const pf = srv.role === 'GPU Inference' ? 0.98 : 0.96;
      const amps = watts > 0 ? round2(watts / (NOMINAL_VOLTAGE_V * pf)) : 0;

      rawOutlets.push({
        id: key,
        rackId: rack.id,
        feed,
        outletNumber: i,
        connectorType,
        assignedDevice: `${srv.hostname} (PSU-${feed})`,
        serverId: srv.id,
        powerState,
        locked,
        watts,
        amps,
        voltageV: NOMINAL_VOLTAGE_V,
        powerFactor: pf,
        lastCycleAt: ov?.lastCycleAt ?? null,
        cycleCount: ov?.cycleCount ?? 0,
        isCriticalLoad,
      });
    } else if (i <= baseOccupiedTotal) {
      const isTorSwitch = i === liveCount + 1 || i === liveCount + 2;
      const deviceLabel = isTorSwitch
        ? `ToR-Leaf-${rack.id.slice(-2)}-${i === liveCount + 1 ? '01' : '02'} (PSU-${feed})`
        : `Production Blade Bay-${String(i).padStart(2, '0')} (PSU-${feed})`;
      const locked = ov?.locked ?? isTorSwitch;
      const powerState: OutletPowerState = ov?.powerState ?? 'On';

      rawOutlets.push({
        id: key,
        rackId: rack.id,
        feed,
        outletNumber: i,
        connectorType,
        assignedDevice: deviceLabel,
        serverId: null,
        powerState,
        locked,
        watts: 0, // populated below from residual feed load
        amps: 0,
        voltageV: NOMINAL_VOLTAGE_V,
        powerFactor: 0.96,
        lastCycleAt: ov?.lastCycleAt ?? null,
        cycleCount: ov?.cycleCount ?? 0,
        isCriticalLoad: isTorSwitch,
      });
    } else {
      const powerState: OutletPowerState = ov?.powerState ?? 'Off';
      const locked = ov?.locked ?? false;
      rawOutlets.push({
        id: key,
        rackId: rack.id,
        feed,
        outletNumber: i,
        connectorType,
        assignedDevice: 'Spare / Unassigned',
        serverId: null,
        powerState,
        locked,
        watts: 0,
        amps: 0,
        voltageV: NOMINAL_VOLTAGE_V,
        powerFactor: 1.0,
        lastCycleAt: ov?.lastCycleAt ?? null,
        cycleCount: ov?.cycleCount ?? 0,
        isCriticalLoad: false,
      });
    }
  }

  // Distribute remaining feed wattage cleanly across active base occupied outlets
  const activeBaseIndices = rawOutlets
    .map((o, idx) => ({ o, idx }))
    .filter(({ o }) => o.serverId === null && o.assignedDevice !== 'Spare / Unassigned' && o.powerState === 'On');

  if (activeBaseIndices.length > 0) {
    const residualWatts = Math.max(activeBaseIndices.length * 160, targetFeedWatts - allocatedLiveWatts);
    const avgBase = residualWatts / activeBaseIndices.length;
    for (let k = 0; k < activeBaseIndices.length; k++) {
      const { idx } = activeBaseIndices[k];
      const o = rawOutlets[idx];
      const tilt = o.isCriticalLoad ? 0.72 : 1.0 + (((k * 7 + (feed === 'A' ? 1 : 3)) % 5) - 2) * 0.06;
      const w = Math.max(110, Math.round(avgBase * tilt));
      const amps = round2(w / (NOMINAL_VOLTAGE_V * o.powerFactor));
      rawOutlets[idx] = { ...o, watts: w, amps };
    }
  }

  const totalWatts = rawOutlets.reduce((s, o) => s + o.watts, 0);
  const totalAmps = round2(rawOutlets.reduce((s, o) => s + o.amps, 0));
  const utilizationPct = round1(Math.min(130, (totalAmps / ratedAmps) * 100));

  return {
    rackId: rack.id,
    feed,
    pduName: feed === 'A' ? rack.pduAName : rack.pduBName,
    ratedAmps,
    voltageV: NOMINAL_VOLTAGE_V,
    totalWatts,
    totalAmps,
    utilizationPct,
    occupiedCount: rawOutlets.filter((o) => o.assignedDevice !== 'Spare / Unassigned').length,
    onCount: rawOutlets.filter((o) => o.powerState === 'On').length,
    offCount: rawOutlets.filter((o) => o.powerState === 'Off').length,
    lockedCount: rawOutlets.filter((o) => o.locked).length,
    outlets: rawOutlets,
  };
}

export function applyRpduOutletAction(
  overrides: RpduOverrideMap,
  outlet: RpduOutletMetric,
  action: 'toggle_power' | 'power_cycle' | 'toggle_lock',
  now: number
): { ok: boolean; overrides: RpduOverrideMap; message: string } {
  const prev = overrides[outlet.id] ?? {};

  if (action === 'toggle_lock') {
    const nextLocked = !outlet.locked;
    return {
      ok: true,
      overrides: {
        ...overrides,
        [outlet.id]: { ...prev, locked: nextLocked },
      },
      message: `${outlet.rackId} Feed ${outlet.feed} Port ${outlet.outletNumber} ${
        nextLocked ? 'locked against remote switching' : 'unlocked for operator control'
      }.`,
    };
  }

  if (outlet.locked) {
    return {
      ok: false,
      overrides,
      message: `Port ${outlet.outletNumber} (${outlet.assignedDevice}) is locked. Unlock before switching power.`,
    };
  }

  if (action === 'toggle_power') {
    const nextState: OutletPowerState = outlet.powerState === 'On' ? 'Off' : 'On';
    return {
      ok: true,
      overrides: {
        ...overrides,
        [outlet.id]: { ...prev, powerState: nextState },
      },
      message: `${outlet.rackId} Feed ${outlet.feed} Port ${outlet.outletNumber} switched ${nextState.toUpperCase()}.`,
    };
  }

  // power_cycle
  return {
    ok: true,
    overrides: {
      ...overrides,
      [outlet.id]: {
        ...prev,
        powerState: 'On',
        lastCycleAt: now,
        cycleCount: (prev.cycleCount ?? outlet.cycleCount) + 1,
      },
    },
    message: `Power-cycled ${outlet.rackId} Feed ${outlet.feed} Port ${outlet.outletNumber} (${outlet.assignedDevice}).`,
  };
}

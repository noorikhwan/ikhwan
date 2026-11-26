import { computeRackElevationMetrics, RACK_MAX_WEIGHT_KG } from './changeComplianceEngine';
import { HallId, RackDefinition, ServerNode, ServerRole } from './types';

export interface RackUReservation {
  id: string;
  rackId: string;
  uStart: number;
  uHeight: number;
  label: string;
  reservedBy: string;
  createdAt: number;
}

export interface NewServerDeploymentDraft {
  hostname: string;
  model: string;
  role: ServerRole;
  uStart: number;
  uHeight: number;
  ratedPowerW: number;
}

export interface SlotCheckResult {
  valid: boolean;
  reason?: string;
}

export interface RackElevationSlotSegment {
  kind: 'server' | 'reservation' | 'free';
  uStart: number;
  uEnd: number;
  uHeight: number;
  server?: ServerNode;
  reservation?: RackUReservation;
}

const ROLE_DEFAULTS: Record<ServerRole, { model: string; uHeight: number; ratedPowerW: number; baseCpu: number; baseMem: number }> = {
  Compute: { model: 'Dell PowerEdge R760', uHeight: 2, ratedPowerW: 950, baseCpu: 46, baseMem: 54 },
  'GPU Inference': { model: 'NVIDIA HGX-Class 4U', uHeight: 4, ratedPowerW: 2600, baseCpu: 62, baseMem: 70 },
  'NVMe Storage': { model: 'Pure FlashBlade//S500', uHeight: 4, ratedPowerW: 1500, baseCpu: 34, baseMem: 58 },
  'Network Spine': { model: 'Arista 7060X5-64PE', uHeight: 2, ratedPowerW: 880, baseCpu: 28, baseMem: 41 },
  Hypervisor: { model: 'HPE ProLiant DL380 Gen11', uHeight: 2, ratedPowerW: 1100, baseCpu: 55, baseMem: 64 },
};

export function getRoleDeploymentDefaults(role: ServerRole) {
  return ROLE_DEFAULTS[role];
}

export function validateRackSlotAvailability(
  rack: RackDefinition,
  rackServers: ServerNode[],
  reservations: RackUReservation[],
  uStartRaw: number,
  uHeightRaw: number,
  excludeServerId?: string
): SlotCheckResult {
  const uStart = Math.round(uStartRaw);
  const uHeight = Math.round(uHeightRaw);
  if (!Number.isFinite(uStart) || !Number.isFinite(uHeight) || uHeight < 1 || uHeight > 12) {
    return { valid: false, reason: 'Height must be between 1U and 12U.' };
  }
  const uEnd = uStart + uHeight - 1;
  if (uStart < 1 || uEnd > rack.totalU) {
    return {
      valid: false,
      reason: `Slot U${uStart}–U${uEnd} exceeds ${rack.totalU}U cabinet bounds.`,
    };
  }

  for (const srv of rackServers) {
    if (excludeServerId && srv.id === excludeServerId) continue;
    const srvEnd = srv.uStart + srv.uHeight - 1;
    if (uStart <= srvEnd && uEnd >= srv.uStart) {
      return {
        valid: false,
        reason: `Collides with ${srv.hostname} (U${srv.uStart}–U${srvEnd}).`,
      };
    }
  }

  for (const res of reservations) {
    if (res.rackId !== rack.id) continue;
    const resEnd = res.uStart + res.uHeight - 1;
    if (uStart <= resEnd && uEnd >= res.uStart) {
      return {
        valid: false,
        reason: `Collides with reserved space "${res.label}" (U${res.uStart}–U${resEnd}).`,
      };
    }
  }

  return { valid: true };
}

export function findFirstOpenUSlot(
  rack: RackDefinition,
  rackServers: ServerNode[],
  reservations: RackUReservation[],
  uHeight: number
): number | null {
  for (let u = 1; u <= rack.totalU - uHeight + 1; u++) {
    const check = validateRackSlotAvailability(rack, rackServers, reservations, u, uHeight);
    if (check.valid) return u;
  }
  return null;
}

export function validateServerDeployment(
  rack: RackDefinition,
  allServers: ServerNode[],
  reservations: RackUReservation[],
  draft: NewServerDeploymentDraft
): SlotCheckResult {
  const hostname = draft.hostname.trim().toLowerCase();
  if (!hostname || !/^[a-z0-9][a-z0-9.-]{2,64}$/i.test(hostname)) {
    return { valid: false, reason: 'Enter a valid hostname (e.g. cmp-b01-n09.kl1.orise).' };
  }
  if (allServers.some((s) => s.hostname.toLowerCase() === hostname)) {
    return { valid: false, reason: `Hostname ${hostname} already exists in this site.` };
  }
  if (!Number.isFinite(draft.ratedPowerW) || draft.ratedPowerW < 150 || draft.ratedPowerW > 12000) {
    return { valid: false, reason: 'Rated power must be between 150 W and 12,000 W.' };
  }

  const rackServers = allServers.filter((s) => s.rackId === rack.id);
  const slotCheck = validateRackSlotAvailability(
    rack,
    rackServers,
    reservations,
    draft.uStart,
    draft.uHeight
  );
  if (!slotCheck.valid) return slotCheck;

  const estimatedOperatingW = Math.round(draft.ratedPowerW * 0.72);
  const currentKw = rackServers.reduce((sum, s) => sum + s.powerW, 0) / 1000;
  const projectedKw = currentKw + estimatedOperatingW / 1000;
  if (projectedKw > rack.powerCapacityKw) {
    return {
      valid: false,
      reason: `Projected load (${projectedKw.toFixed(2)} kW) exceeds ${rack.id} rated limit (${rack.powerCapacityKw} kW).`,
    };
  }

  const previewNode: ServerNode = {
    id: 'preview-node',
    hostname,
    ip: '10.40.0.1',
    model: draft.model || ROLE_DEFAULTS[draft.role].model,
    role: draft.role,
    hallId: rack.hallId,
    rackId: rack.id,
    uStart: Math.round(draft.uStart),
    uHeight: Math.round(draft.uHeight),
    status: 'nominal',
    cpu: 40,
    memory: 45,
    disk: 30,
    tempC: 44,
    inletTempC: 21.5,
    powerW: estimatedOperatingW,
    ratedPowerW: Math.round(draft.ratedPowerW),
    networkGbps: 18,
    packetLoss: 0.01,
    fanRpm: 6200,
    psuStatus: 'Redundant (2/2)',
    uptimeDays: 0,
    activeFault: null,
    history: [],
  };

  const metrics = computeRackElevationMetrics(rack, [...rackServers, previewNode]);
  if (metrics.estimatedWeightKg > RACK_MAX_WEIGHT_KG) {
    return {
      valid: false,
      reason: `Static weight (${metrics.estimatedWeightKg} kg) exceeds ${RACK_MAX_WEIGHT_KG} kg cabinet limit.`,
    };
  }

  return { valid: true };
}

export function createDeployedServerNode(
  rack: RackDefinition,
  draft: NewServerDeploymentDraft,
  ipPrefix: number,
  now: number = Date.now()
): ServerNode {
  const defaults = ROLE_DEFAULTS[draft.role];
  const powerW = Math.round(draft.ratedPowerW * 0.72);
  const cleanId = `srv-${rack.id.toLowerCase().replace(/[^a-z0-9]/g, '')}-u${Math.round(draft.uStart)}-${(now % 10000).toString(36)}`;
  const history = Array.from({ length: 16 }, (_, idx) => ({
    timestamp: now - (15 - idx) * 3000,
    cpu: Number((defaults.baseCpu + Math.sin(idx * 0.5) * 3).toFixed(1)),
    memory: Number((defaults.baseMem + Math.cos(idx * 0.4) * 2).toFixed(1)),
    tempC: Number((43.5 + (powerW / 3000) * 14 + Math.sin(idx * 0.3) * 0.8).toFixed(1)),
    powerW,
    networkGbps: Number((16 + (idx % 5) * 1.4).toFixed(1)),
  }));
  const latest = history[history.length - 1];
  const octet4 = 40 + (Math.round(draft.uStart) * 3) % 190;
  return {
    id: cleanId,
    hostname: draft.hostname.trim().toLowerCase(),
    ip: `10.${ipPrefix}.${rack.rowNumber}.${octet4}`,
    model: draft.model.trim() || defaults.model,
    role: draft.role,
    hallId: rack.hallId as HallId,
    rackId: rack.id,
    uStart: Math.round(draft.uStart),
    uHeight: Math.round(draft.uHeight),
    status: 'nominal',
    cpu: latest.cpu,
    memory: latest.memory,
    disk: 28.4,
    tempC: latest.tempC,
    inletTempC: Number((rack.ambientTempC + 0.6).toFixed(1)),
    powerW,
    ratedPowerW: Math.round(draft.ratedPowerW),
    networkGbps: latest.networkGbps,
    packetLoss: 0.01,
    fanRpm: Math.round(5800 + (powerW / 1000) * 1100),
    psuStatus: 'Redundant (2/2)',
    uptimeDays: 0,
    activeFault: null,
    history,
  };
}

export function moveServerAcrossRacks(
  allServers: ServerNode[],
  racks: RackDefinition[],
  reservations: RackUReservation[],
  serverId: string,
  targetRackId: string,
  targetUStart: number
): { ok: boolean; servers: ServerNode[]; error?: string } {
  const srv = allServers.find((s) => s.id === serverId);
  const targetRack = racks.find((r) => r.id === targetRackId);
  if (!srv || !targetRack) {
    return { ok: false, servers: allServers, error: 'Target server or cabinet not found.' };
  }

  const targetRackServers = allServers.filter((s) => s.rackId === targetRack.id);
  const slotCheck = validateRackSlotAvailability(
    targetRack,
    targetRackServers,
    reservations,
    targetUStart,
    srv.uHeight,
    srv.id
  );
  if (!slotCheck.valid) {
    return { ok: false, servers: allServers, error: slotCheck.reason };
  }

  const simulatedTarget = [
    ...targetRackServers.filter((s) => s.id !== srv.id),
    { ...srv, rackId: targetRack.id, hallId: targetRack.hallId, uStart: Math.round(targetUStart) },
  ];
  const metrics = computeRackElevationMetrics(targetRack, simulatedTarget);
  if (metrics.totalPowerKw > targetRack.powerCapacityKw) {
    return {
      ok: false,
      servers: allServers,
      error: `Moving ${srv.hostname} to ${targetRack.id} pushes load to ${metrics.totalPowerKw.toFixed(2)} kW (limit ${targetRack.powerCapacityKw} kW).`,
    };
  }
  if (metrics.estimatedWeightKg > RACK_MAX_WEIGHT_KG) {
    return {
      ok: false,
      servers: allServers,
      error: `Moving ${srv.hostname} exceeds ${RACK_MAX_WEIGHT_KG} kg floor tile weight limit.`,
    };
  }

  const nextServers = allServers.map((s) =>
    s.id === serverId
      ? { ...s, rackId: targetRack.id, hallId: targetRack.hallId, uStart: Math.round(targetUStart) }
      : s
  );
  return { ok: true, servers: nextServers };
}

export function decommissionServerFromRack(
  allServers: ServerNode[],
  serverId: string
): { ok: boolean; removed?: ServerNode; servers: ServerNode[] } {
  const removed = allServers.find((s) => s.id === serverId);
  if (!removed) return { ok: false, servers: allServers };
  return {
    ok: true,
    removed,
    servers: allServers.filter((s) => s.id !== serverId),
  };
}

export function buildRackSlotMap(
  rack: RackDefinition,
  rackServers: ServerNode[],
  reservations: RackUReservation[]
): RackElevationSlotSegment[] {
  const rackRes = reservations.filter((r) => r.rackId === rack.id);
  const segments: RackElevationSlotSegment[] = [];
  let cursor = rack.totalU;

  while (cursor >= 1) {
    const srv = rackServers.find((s) => cursor >= s.uStart && cursor <= s.uStart + s.uHeight - 1);
    if (srv) {
      segments.push({
        kind: 'server',
        uStart: srv.uStart,
        uEnd: srv.uStart + srv.uHeight - 1,
        uHeight: srv.uHeight,
        server: srv,
      });
      cursor = srv.uStart - 1;
      continue;
    }

    const res = rackRes.find((r) => cursor >= r.uStart && cursor <= r.uStart + r.uHeight - 1);
    if (res) {
      segments.push({
        kind: 'reservation',
        uStart: res.uStart,
        uEnd: res.uStart + res.uHeight - 1,
        uHeight: res.uHeight,
        reservation: res,
      });
      cursor = res.uStart - 1;
      continue;
    }

    // Group contiguous free U slots
    const freeTop = cursor;
    let freeBottom = cursor;
    while (freeBottom > 1) {
      const nextU = freeBottom - 1;
      const occupied =
        rackServers.some((s) => nextU >= s.uStart && nextU <= s.uStart + s.uHeight - 1) ||
        rackRes.some((r) => nextU >= r.uStart && nextU <= r.uStart + r.uHeight - 1);
      if (occupied) break;
      freeBottom = nextU;
    }
    segments.push({
      kind: 'free',
      uStart: freeBottom,
      uEnd: freeTop,
      uHeight: freeTop - freeBottom + 1,
    });
    cursor = freeBottom - 1;
  }

  return segments;
}

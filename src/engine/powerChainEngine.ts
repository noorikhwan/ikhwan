import { BmsState } from './bmsTypes';
import { SITE_META_MAP, SiteId } from './sites';
import { HallId, ServerNode } from './types';

export type PowerNodeTier =
  | 'utility'
  | 'generator'
  | 'ats_sts'
  | 'ups'
  | 'pdu'
  | 'busway'
  | 'rack_pdu';

export type PowerFeedSide = 'A' | 'B' | 'SHARED';
export type PowerNodeState = 'energized' | 'standby' | 'bypass' | 'tripped' | 'de_energized' | 'degraded';

export interface PhaseLoadReading {
  l1Amps: number;
  l2Amps: number;
  l3Amps: number;
  imbalancePct: number;
  neutralAmps: number;
}

export interface PowerChainNode {
  id: string;
  label: string;
  shortCode: string;
  tier: PowerNodeTier;
  feed: PowerFeedSide;
  ratedKw: number;
  loadKw: number;
  loadPct: number;
  voltageKv: number;
  breakerClosed: boolean;
  bypassActive: boolean;
  state: PowerNodeState;
  upstreamIds: string[];
  downstreamIds: string[];
  hallId?: HallId;
  rackCount?: number;
  phaseBalance?: PhaseLoadReading;
}

export interface PowerChainEdge {
  id: string;
  fromId: string;
  toId: string;
  feed: PowerFeedSide;
  energized: boolean;
  redundantBackup: boolean;
}

export interface PowerFaultInjection {
  trippedNodeIds: string[];
  bypassUpsIds: string[];
}

export interface BlastRadiusReport {
  sourceNodeId: string | null;
  sourceLabel: string | null;
  affectedDownstreamIds: string[];
  affectedUpstreamIds: string[];
  deEnergizedNodeIds: string[];
  failoverProtectedNodeIds: string[];
  impactedLoadKw: number;
  impactedRackCount: number;
  redundantSurvived: boolean;
  summary: string;
}

export interface PowerChainSnapshot {
  siteId: SiteId;
  siteCode: string;
  nodes: PowerChainNode[];
  edges: PowerChainEdge[];
  totalFacilityLoadKw: number;
  feedALoadKw: number;
  feedBLoadKw: number;
  feedBalanceDeltaPct: number;
  sitePhaseBalance: PhaseLoadReading;
  blastRadius: BlastRadiusReport | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function computePhaseBalance(loadKw: number, voltageV: number, seedOffset: number): PhaseLoadReading {
  // 3-phase power: I_total = P / (sqrt(3) * V * PF)
  const pf = 0.96;
  const lineCurrent = loadKw > 0 ? (loadKw * 1000) / (Math.sqrt(3) * voltageV * pf) : 0;
  // Realistic slight phase skew (1.2%–4.8%)
  const skew1 = 1 + Math.sin(seedOffset * 1.7) * 0.032;
  const skew2 = 1 + Math.cos(seedOffset * 2.3) * 0.028;
  const skew3 = 3 - skew1 - skew2;
  const l1 = round1(lineCurrent * skew1);
  const l2 = round1(lineCurrent * skew2);
  const l3 = round1(lineCurrent * skew3);
  const avg = (l1 + l2 + l3) / 3;
  const maxDev = Math.max(Math.abs(l1 - avg), Math.abs(l2 - avg), Math.abs(l3 - avg));
  const imbalancePct = avg > 0 ? round1((maxDev / avg) * 100) : 0;
  // Neutral current approx for slight imbalance
  const neutralAmps = round1(Math.sqrt(Math.max(0, l1 * l1 + l2 * l2 + l3 * l3 - l1 * l2 - l2 * l3 - l3 * l1)));
  return { l1Amps: l1, l2Amps: l2, l3Amps: l3, imbalancePct, neutralAmps };
}

export function buildPowerChainSnapshot(params: {
  siteId: SiteId;
  bms: BmsState;
  servers: ServerNode[];
  faults: PowerFaultInjection;
  selectedNodeId?: string | null;
}): PowerChainSnapshot {
  const { siteId, bms, servers, faults, selectedNodeId } = params;
  const meta = SITE_META_MAP[siteId];
  const trippedSet = new Set(faults.trippedNodeIds);
  const bypassSet = new Set(faults.bypassUpsIds);

  const siteSeed = siteId === 'kl1' ? 1 : siteId === 'kl2' ? 2 : 3;
  const rawServerKw = servers.reduce((s, srv) => s + srv.powerW / 1000, 0);
  // Scale to facility hall scale matching 1,600 racks (~14–20 MW)
  const upsTotalKw = Math.max(
    rawServerKw,
    bms.upsSystems.reduce((sum, u) => sum + u.loadKw, 0)
  );
  const totalFacilityLoadKw = round1(Math.max(6200, upsTotalKw));
  const utilityFailed = bms.utilityFeed !== 'Utility Normal';
  const genRunning = utilityFailed || bms.generators.some((g) => g.state === 'Running · On Load');

  // Build 7-tier 2N Power Chain Graph: Utility -> Generators -> ATS/STS -> UPS -> PDU -> Busway -> Rack PDU (4 Halls)
  const utilATripped = trippedSet.has('util-a') || utilityFailed;
  const utilBTripped = trippedSet.has('util-b') || utilityFailed;

  const genAAvailable = !trippedSet.has('gen-bank-a');
  const genBAvailable = !trippedSet.has('gen-bank-b');

  const atsATripped = trippedSet.has('ats-a');
  const atsBTripped = trippedSet.has('ats-b');

  const upsATripped = trippedSet.has('ups-bank-a') || bms.upsSystems.filter((u) => u.feedBus === 'Bus A' && u.mode === 'Fault').length >= 2;
  const upsBTripped = trippedSet.has('ups-bank-b') || bms.upsSystems.filter((u) => u.feedBus === 'Bus B' && u.mode === 'Fault').length >= 2;
  const upsABypass = bypassSet.has('ups-bank-a') && !upsATripped;
  const upsBBypass = bypassSet.has('ups-bank-b') && !upsBTripped;

  const pduATripped = trippedSet.has('pdu-a');
  const pduBTripped = trippedSet.has('pdu-b');

  const busATripped = trippedSet.has('busway-a');
  const busBTripped = trippedSet.has('busway-b');

  // Energization propagation along Feed A & Feed B
  const atsAEnergized = !atsATripped && (!utilATripped || genAAvailable);
  const atsBEnergized = !atsBTripped && (!utilBTripped || genBAvailable);

  const upsAEnergized = atsAEnergized && !upsATripped;
  const upsBEnergized = atsBEnergized && !upsBTripped;

  const pduAEnergized = upsAEnergized && !pduATripped;
  const pduBEnergized = upsBEnergized && !pduBTripped;

  const busAEnergized = pduAEnergized && !busATripped;
  const busBEnergized = pduBEnergized && !busBTripped;

  // Dynamic 2N load sharing: if one side fails, surviving path absorbs 100% of dual-corded IT load!
  let feedAShare = 0.51;
  let feedBShare = 0.49;
  if (busAEnergized && !busBEnergized) {
    feedAShare = 1.0;
    feedBShare = 0.0;
  } else if (!busAEnergized && busBEnergized) {
    feedAShare = 0.0;
    feedBShare = 1.0;
  } else if (!busAEnergized && !busBEnergized) {
    feedAShare = 0.0;
    feedBShare = 0.0;
  }

  const feedALoadKw = round1(totalFacilityLoadKw * feedAShare);
  const feedBLoadKw = round1(totalFacilityLoadKw * feedBShare);

  const hallShares: Array<{ id: HallId; name: string; share: number; racks: number }> = [
    { id: 'hall-a', name: 'Hall A · Core Compute', share: 0.24, racks: 400 },
    { id: 'hall-b', name: 'Hall B · AI & GPU', share: 0.36, racks: 400 },
    { id: 'hall-c', name: 'Hall C · Storage & Edge', share: 0.21, racks: 400 },
    { id: 'hall-d', name: 'Hall D · Cloud & Interconnect', share: 0.19, racks: 400 },
  ];

  const nodes: PowerChainNode[] = [
    {
      id: 'util-a',
      label: 'TNB 33kV Utility Feed A',
      shortCode: 'UTIL-A',
      tier: 'utility',
      feed: 'A',
      ratedKw: 24000,
      loadKw: !utilATripped && atsAEnergized ? feedALoadKw : 0,
      loadPct: !utilATripped && atsAEnergized ? round1((feedALoadKw / 24000) * 100) : 0,
      voltageKv: 33,
      breakerClosed: !utilATripped,
      bypassActive: false,
      state: utilATripped ? 'tripped' : 'energized',
      upstreamIds: [],
      downstreamIds: ['ats-a'],
    },
    {
      id: 'util-b',
      label: 'TNB 33kV Utility Feed B',
      shortCode: 'UTIL-B',
      tier: 'utility',
      feed: 'B',
      ratedKw: 24000,
      loadKw: !utilBTripped && atsBEnergized ? feedBLoadKw : 0,
      loadPct: !utilBTripped && atsBEnergized ? round1((feedBLoadKw / 24000) * 100) : 0,
      voltageKv: 33,
      breakerClosed: !utilBTripped,
      bypassActive: false,
      state: utilBTripped ? 'tripped' : 'energized',
      upstreamIds: [],
      downstreamIds: ['ats-b'],
    },
    {
      id: 'gen-bank-a',
      label: 'Generator Bank A (GEN-1..4)',
      shortCode: 'GEN-A (4x)',
      tier: 'generator',
      feed: 'A',
      ratedKw: 16000,
      loadKw: genAAvailable && (utilATripped || genRunning) && atsAEnergized ? feedALoadKw : 0,
      loadPct: genAAvailable && (utilATripped || genRunning) && atsAEnergized ? round1((feedALoadKw / 16000) * 100) : 0,
      voltageKv: 11,
      breakerClosed: genAAvailable,
      bypassActive: false,
      state: !genAAvailable ? 'tripped' : utilATripped || genRunning ? 'energized' : 'standby',
      upstreamIds: [],
      downstreamIds: ['ats-a'],
    },
    {
      id: 'gen-bank-b',
      label: 'Generator Bank B (GEN-5..8)',
      shortCode: 'GEN-B (4x)',
      tier: 'generator',
      feed: 'B',
      ratedKw: 16000,
      loadKw: genBAvailable && (utilBTripped || genRunning) && atsBEnergized ? feedBLoadKw : 0,
      loadPct: genBAvailable && (utilBTripped || genRunning) && atsBEnergized ? round1((feedBLoadKw / 16000) * 100) : 0,
      voltageKv: 11,
      breakerClosed: genBAvailable,
      bypassActive: false,
      state: !genBAvailable ? 'tripped' : utilBTripped || genRunning ? 'energized' : 'standby',
      upstreamIds: [],
      downstreamIds: ['ats-b'],
    },
    {
      id: 'ats-a',
      label: 'MV Switchgear & ATS-A',
      shortCode: 'ATS-A',
      tier: 'ats_sts',
      feed: 'A',
      ratedKw: 20000,
      loadKw: atsAEnergized ? feedALoadKw : 0,
      loadPct: atsAEnergized ? round1((feedALoadKw / 20000) * 100) : 0,
      voltageKv: 11,
      breakerClosed: !atsATripped,
      bypassActive: false,
      state: atsATripped ? 'tripped' : atsAEnergized ? 'energized' : 'de_energized',
      upstreamIds: ['util-a', 'gen-bank-a'],
      downstreamIds: ['ups-bank-a'],
    },
    {
      id: 'ats-b',
      label: 'MV Switchgear & ATS-B',
      shortCode: 'ATS-B',
      tier: 'ats_sts',
      feed: 'B',
      ratedKw: 20000,
      loadKw: atsBEnergized ? feedBLoadKw : 0,
      loadPct: atsBEnergized ? round1((feedBLoadKw / 20000) * 100) : 0,
      voltageKv: 11,
      breakerClosed: !atsBTripped,
      bypassActive: false,
      state: atsBTripped ? 'tripped' : atsBEnergized ? 'energized' : 'de_energized',
      upstreamIds: ['util-b', 'gen-bank-b'],
      downstreamIds: ['ups-bank-b'],
    },
    {
      id: 'ups-bank-a',
      label: 'UPS Bank A (UPS-A1/A2 · 2N)',
      shortCode: 'UPS-A',
      tier: 'ups',
      feed: 'A',
      ratedKw: 16000,
      loadKw: upsAEnergized ? feedALoadKw : 0,
      loadPct: upsAEnergized ? round1((feedALoadKw / 16000) * 100) : 0,
      voltageKv: 0.415,
      breakerClosed: !upsATripped,
      bypassActive: upsABypass,
      state: upsATripped ? 'tripped' : !upsAEnergized ? 'de_energized' : upsABypass ? 'bypass' : 'energized',
      upstreamIds: ['ats-a'],
      downstreamIds: ['pdu-a'],
      phaseBalance: computePhaseBalance(upsAEnergized ? feedALoadKw : 0, 415, siteSeed + 1),
    },
    {
      id: 'ups-bank-b',
      label: 'UPS Bank B (UPS-B1/B2 · 2N)',
      shortCode: 'UPS-B',
      tier: 'ups',
      feed: 'B',
      ratedKw: 16000,
      loadKw: upsBEnergized ? feedBLoadKw : 0,
      loadPct: upsBEnergized ? round1((feedBLoadKw / 16000) * 100) : 0,
      voltageKv: 0.415,
      breakerClosed: !upsBTripped,
      bypassActive: upsBBypass,
      state: upsBTripped ? 'tripped' : !upsBEnergized ? 'de_energized' : upsBBypass ? 'bypass' : 'energized',
      upstreamIds: ['ats-b'],
      downstreamIds: ['pdu-b'],
      phaseBalance: computePhaseBalance(upsBEnergized ? feedBLoadKw : 0, 415, siteSeed + 4),
    },
    {
      id: 'pdu-a',
      label: 'Main Floor PDU Array A',
      shortCode: 'PDU-A',
      tier: 'pdu',
      feed: 'A',
      ratedKw: 16000,
      loadKw: pduAEnergized ? feedALoadKw : 0,
      loadPct: pduAEnergized ? round1((feedALoadKw / 16000) * 100) : 0,
      voltageKv: 0.415,
      breakerClosed: !pduATripped,
      bypassActive: false,
      state: pduATripped ? 'tripped' : pduAEnergized ? (upsABypass ? 'degraded' : 'energized') : 'de_energized',
      upstreamIds: ['ups-bank-a'],
      downstreamIds: ['busway-a'],
      phaseBalance: computePhaseBalance(pduAEnergized ? feedALoadKw : 0, 415, siteSeed + 7),
    },
    {
      id: 'pdu-b',
      label: 'Main Floor PDU Array B',
      shortCode: 'PDU-B',
      tier: 'pdu',
      feed: 'B',
      ratedKw: 16000,
      loadKw: pduBEnergized ? feedBLoadKw : 0,
      loadPct: pduBEnergized ? round1((feedBLoadKw / 16000) * 100) : 0,
      voltageKv: 0.415,
      breakerClosed: !pduBTripped,
      bypassActive: false,
      state: pduBTripped ? 'tripped' : pduBEnergized ? (upsBBypass ? 'degraded' : 'energized') : 'de_energized',
      upstreamIds: ['ups-bank-b'],
      downstreamIds: ['busway-b'],
      phaseBalance: computePhaseBalance(pduBEnergized ? feedBLoadKw : 0, 415, siteSeed + 10),
    },
    {
      id: 'busway-a',
      label: 'Overhead Busway Spine A',
      shortCode: 'BUS-A',
      tier: 'busway',
      feed: 'A',
      ratedKw: 16000,
      loadKw: busAEnergized ? feedALoadKw : 0,
      loadPct: busAEnergized ? round1((feedALoadKw / 16000) * 100) : 0,
      voltageKv: 0.415,
      breakerClosed: !busATripped,
      bypassActive: false,
      state: busATripped ? 'tripped' : busAEnergized ? (upsABypass ? 'degraded' : 'energized') : 'de_energized',
      upstreamIds: ['pdu-a'],
      downstreamIds: hallShares.map((h) => `rpdu-${h.id}`),
      phaseBalance: computePhaseBalance(busAEnergized ? feedALoadKw : 0, 415, siteSeed + 13),
    },
    {
      id: 'busway-b',
      label: 'Overhead Busway Spine B',
      shortCode: 'BUS-B',
      tier: 'busway',
      feed: 'B',
      ratedKw: 16000,
      loadKw: busBEnergized ? feedBLoadKw : 0,
      loadPct: busBEnergized ? round1((feedBLoadKw / 16000) * 100) : 0,
      voltageKv: 0.415,
      breakerClosed: !busBTripped,
      bypassActive: false,
      state: busBTripped ? 'tripped' : busBEnergized ? (upsBBypass ? 'degraded' : 'energized') : 'de_energized',
      upstreamIds: ['pdu-b'],
      downstreamIds: hallShares.map((h) => `rpdu-${h.id}`),
      phaseBalance: computePhaseBalance(busBEnergized ? feedBLoadKw : 0, 415, siteSeed + 16),
    },
    ...hallShares.map((h, idx): PowerChainNode => {
      const rpduId = `rpdu-${h.id}`;
      const rpduTripped = trippedSet.has(rpduId);
      const bothFeeds = busAEnergized && busBEnergized;
      const singleFeed = (busAEnergized || busBEnergized) && !bothFeeds;
      const energized = !rpduTripped && (busAEnergized || busBEnergized);
      const hallLoad = energized ? round1(totalFacilityLoadKw * h.share) : 0;
      const rated = h.id === 'hall-b' ? 6800 : 4800;
      const state: PowerNodeState = rpduTripped
        ? 'tripped'
        : !energized
        ? 'de_energized'
        : singleFeed || upsABypass || upsBBypass
        ? 'degraded'
        : 'energized';

      return {
        id: rpduId,
        label: `${h.name} Rack PDUs (A+B)`,
        shortCode: `RPDU-${h.id.slice(-1).toUpperCase()}`,
        tier: 'rack_pdu',
        feed: 'SHARED',
        ratedKw: rated,
        loadKw: hallLoad,
        loadPct: round1((hallLoad / rated) * 100),
        voltageKv: 0.24,
        breakerClosed: !rpduTripped,
        bypassActive: false,
        state,
        upstreamIds: ['busway-a', 'busway-b'],
        downstreamIds: [],
        hallId: h.id,
        rackCount: h.racks,
        phaseBalance: computePhaseBalance(hallLoad, 415, siteSeed * 10 + idx + 2),
      };
    }),
  ];

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edges: PowerChainEdge[] = [];
  for (const node of nodes) {
    for (const downId of node.downstreamIds) {
      const target = nodeMap.get(downId);
      if (!target) continue;
      const energized =
        (node.state === 'energized' || node.state === 'bypass' || node.state === 'degraded') &&
        target.state !== 'tripped' &&
        target.state !== 'de_energized';
      edges.push({
        id: `${node.id}->${downId}`,
        fromId: node.id,
        toId: downId,
        feed: node.feed,
        energized,
        redundantBackup: node.tier === 'generator',
      });
    }
  }

  const totalBalanced = feedALoadKw + feedBLoadKw;
  const feedBalanceDeltaPct =
    totalBalanced > 0 ? round1((Math.abs(feedALoadKw - feedBLoadKw) / totalBalanced) * 100) : 0;

  const sitePhaseBalance = computePhaseBalance(totalBalanced, 415, siteSeed + 21);

  const blastTargetId =
    selectedNodeId ?? faults.trippedNodeIds[0] ?? faults.bypassUpsIds[0] ?? null;

  const blastRadius = blastTargetId ? computeBlastRadius(nodes, blastTargetId) : null;

  return {
    siteId,
    siteCode: meta.code,
    nodes,
    edges,
    totalFacilityLoadKw: totalBalanced,
    feedALoadKw,
    feedBLoadKw,
    feedBalanceDeltaPct,
    sitePhaseBalance,
    blastRadius,
  };
}

export function computeBlastRadius(
  nodes: PowerChainNode[],
  sourceNodeId: string
): BlastRadiusReport | null {
  const map = new Map(nodes.map((n) => [n.id, n]));
  const source = map.get(sourceNodeId);
  if (!source) return null;

  // BFS downstream
  const downVisited = new Set<string>();
  const downQueue = [...source.downstreamIds];
  while (downQueue.length > 0) {
    const cur = downQueue.shift()!;
    if (downVisited.has(cur)) continue;
    downVisited.add(cur);
    const n = map.get(cur);
    if (n) {
      for (const nxt of n.downstreamIds) downQueue.push(nxt);
    }
  }

  // BFS upstream
  const upVisited = new Set<string>();
  const upQueue = [...source.upstreamIds];
  while (upQueue.length > 0) {
    const cur = upQueue.shift()!;
    if (upVisited.has(cur)) continue;
    upVisited.add(cur);
    const n = map.get(cur);
    if (n) {
      for (const prev of n.upstreamIds) upQueue.push(prev);
    }
  }

  const affectedDownstreamIds = Array.from(downVisited);
  const affectedUpstreamIds = Array.from(upVisited);
  const deEnergizedNodeIds = affectedDownstreamIds.filter((id) => {
    const n = map.get(id);
    return n && (n.state === 'de_energized' || n.state === 'tripped');
  });
  const failoverProtectedNodeIds = affectedDownstreamIds.filter((id) => {
    const n = map.get(id);
    return n && n.tier === 'rack_pdu' && n.state !== 'de_energized' && n.state !== 'tripped';
  });

  const rackNodes = affectedDownstreamIds
    .map((id) => map.get(id))
    .filter((n): n is PowerChainNode => Boolean(n && n.tier === 'rack_pdu'));
  const impactedRackCount =
    source.tier === 'rack_pdu'
      ? source.rackCount ?? 0
      : rackNodes.reduce((sum, r) => sum + (r.rackCount ?? 0), 0);

  const impactedLoadKw = round1(
    source.loadKw > 0
      ? source.loadKw
      : rackNodes.reduce((sum, r) => sum + r.loadKw, 0)
  );

  const redundantSurvived =
    source.tier === 'rack_pdu'
      ? source.state !== 'tripped' && source.state !== 'de_energized'
      : rackNodes.every((r) => r.state !== 'de_energized' && r.state !== 'tripped');

  let summary: string;
  if (source.state === 'tripped') {
    summary = redundantSurvived
      ? `Breaker ${source.shortCode} OPEN: ${affectedDownstreamIds.length} downstream nodes in blast path, but 2N redundant feed preserved 100% of ${impactedRackCount} dual-corded racks.`
      : `CRITICAL OUTAGE on ${source.shortCode}: ${deEnergizedNodeIds.length} downstream nodes de-energized impacting ${impactedRackCount} racks!`;
  } else if (source.state === 'bypass') {
    summary = `${source.shortCode} on Static Bypass: Unconditioned utility feed passing to ${affectedDownstreamIds.length} downstream nodes (${impactedRackCount} racks on reduced protection).`;
  } else {
    summary = `Tracing ${source.shortCode}: ${affectedUpstreamIds.length} upstream sources and ${affectedDownstreamIds.length} downstream distribution nodes (${impactedRackCount} racks).`;
  }

  return {
    sourceNodeId,
    sourceLabel: source.label,
    affectedDownstreamIds,
    affectedUpstreamIds,
    deEnergizedNodeIds,
    failoverProtectedNodeIds,
    impactedLoadKw,
    impactedRackCount,
    redundantSurvived,
    summary,
  };
}

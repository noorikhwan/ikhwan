import { SITE_META_MAP, SiteId } from './sites';

export type CableMediaType = 'SMF OS2 Fiber' | 'MMF OM4 Fiber' | 'Cat6A Copper' | 'DAC 400G Twinax';
export type CircuitStatus = 'Active' | 'Standby' | 'Degraded' | 'Planned MAC';

export interface PatchHop {
  hopIndex: number;
  location: string;
  device: string;
  port: string;
  media: CableMediaType;
  lossDb?: number;
}

export interface CableCircuit {
  id: string;
  siteId: SiteId;
  circuitCode: string;
  customerOrService: string;
  carrierName: string;
  mediaType: CableMediaType;
  bandwidthGbps: number;
  mmrCage: string;
  aEnd: string;
  zEnd: string;
  lengthMeters: number;
  opticalLossDb: number | null;
  status: CircuitStatus;
  trayId: string;
  hops: PatchHop[];
  lastTestedAt: number;
}

export interface CableTraySegment {
  id: string;
  siteId: SiteId;
  name: string;
  zone: string;
  level: 'Overhead Basket' | 'Underfloor Plenum' | 'MMR Conduit';
  mediaClass: 'Fiber Only' | 'Copper & Trunk' | 'High-Density 400G';
  capacityCables: number;
  installedCables: number;
  fillRatioPct: number;
  necWarningThresholdPct: number; // 40% warn, 50% critical per TIA-569/NEC
}

export interface NewCrossConnectDraft {
  siteId: SiteId;
  customerOrService: string;
  carrierName: string;
  mediaType: CableMediaType;
  bandwidthGbps: number;
  mmrCage: string;
  aEnd: string;
  zEnd: string;
  trayId: string;
}

const HOUR_MS = 3600 * 1000;

export function createInitialCableTrays(siteId: SiteId): CableTraySegment[] {
  const code = SITE_META_MAP[siteId].code;
  const offset = siteId === 'kl1' ? 0 : siteId === 'kl2' ? 6 : -4;
  const raw: Array<Omit<CableTraySegment, 'fillRatioPct'>> = [
    {
      id: `${siteId}-tray-mmr-n`,
      siteId,
      name: `${code}-TRAY-MMR-01 (North Spine)`,
      zone: 'Meet-Me Room (MMR) → Hall A/B',
      level: 'MMR Conduit',
      mediaClass: 'Fiber Only',
      capacityCables: 480,
      installedCables: Math.min(470, 212 + offset * 4),
      necWarningThresholdPct: 45,
    },
    {
      id: `${siteId}-tray-hall-a`,
      siteId,
      name: `${code}-TRAY-HA-02 (Core Compute)`,
      zone: 'Hall A · Rows R01–R10',
      level: 'Overhead Basket',
      mediaClass: 'Copper & Trunk',
      capacityCables: 360,
      installedCables: Math.min(350, 134 + offset * 3),
      necWarningThresholdPct: 45,
    },
    {
      id: `${siteId}-tray-hall-b`,
      siteId,
      name: `${code}-TRAY-HB-01 (AI/GPU InfiniBand)`,
      zone: 'Hall B · Rows R01–R20',
      level: 'Overhead Basket',
      mediaClass: 'High-Density 400G',
      capacityCables: 600,
      installedCables: Math.min(580, 318 + offset * 5),
      necWarningThresholdPct: 50,
    },
    {
      id: `${siteId}-tray-hall-c`,
      siteId,
      name: `${code}-TRAY-HC-03 (Storage Fabric)`,
      zone: 'Hall C · SAN Spine',
      level: 'Underfloor Plenum',
      mediaClass: 'Fiber Only',
      capacityCables: 320,
      installedCables: Math.min(300, 118 + offset * 2),
      necWarningThresholdPct: 45,
    },
    {
      id: `${siteId}-tray-hall-d`,
      siteId,
      name: `${code}-TRAY-HD-01 (Cloud Interconnect)`,
      zone: 'Hall D · Carrier Cages',
      level: 'MMR Conduit',
      mediaClass: 'Fiber Only',
      capacityCables: 420,
      installedCables: Math.min(410, 186 + offset * 4),
      necWarningThresholdPct: 45,
    },
  ];
  return raw.map((t) => ({
    ...t,
    fillRatioPct: Math.round((t.installedCables / t.capacityCables) * 1000) / 10,
  }));
}

export function createInitialCircuits(siteId: SiteId, now: number): CableCircuit[] {
  const code = SITE_META_MAP[siteId].code;
  return [
    {
      id: `xc-${siteId}-101`,
      siteId,
      circuitCode: `XC-${code}-4001`,
      customerOrService: 'Hyperscale Cloud Direct Connect (Primary)',
      carrierName: 'TIME dotCom Carrier',
      mediaType: 'SMF OS2 Fiber',
      bandwidthGbps: 400,
      mmrCage: 'MMR-A · Cage 02',
      aEnd: `${code}-MMR-ODF-01 / Port 14`,
      zEnd: `${code}-HALL-D-R04 / TOR-D04:et-0/0/1`,
      lengthMeters: 142,
      opticalLossDb: 0.42,
      status: 'Active',
      trayId: `${siteId}-tray-hall-d`,
      lastTestedAt: now - 14 * HOUR_MS,
      hops: [
        { hopIndex: 1, location: 'Meet-Me Room A', device: `${code}-MMR-ODF-01`, port: 'LC-APC 14', media: 'SMF OS2 Fiber', lossDb: 0.12 },
        { hopIndex: 2, location: 'North Fiber Spine', device: `${code}-PP-SPINE-02`, port: 'MPO-12 B4', media: 'SMF OS2 Fiber', lossDb: 0.14 },
        { hopIndex: 3, location: 'Hall D Entry Patch', device: `${code}-HD-PP-01`, port: 'LC-08', media: 'SMF OS2 Fiber', lossDb: 0.08 },
        { hopIndex: 4, location: 'Hall D · Rack D-R04', device: `${code}-TOR-D04`, port: 'QSFP-DD 0/0/1', media: 'SMF OS2 Fiber', lossDb: 0.08 },
      ],
    },
    {
      id: `xc-${siteId}-102`,
      siteId,
      circuitCode: `XC-${code}-4002`,
      customerOrService: 'AI GPU Cluster RoCEv2 East-West Spine',
      carrierName: 'Internal Spine Fabric',
      mediaType: 'MMF OM4 Fiber',
      bandwidthGbps: 400,
      mmrCage: 'Internal Hall B Spine',
      aEnd: `${code}-SPINE-GPU-01 / Port 22`,
      zEnd: `${code}-HALL-B-R01 / HGX-B01:ib0`,
      lengthMeters: 38,
      opticalLossDb: 0.24,
      status: 'Active',
      trayId: `${siteId}-tray-hall-b`,
      lastTestedAt: now - 6 * HOUR_MS,
      hops: [
        { hopIndex: 1, location: 'Hall B Spine Core', device: `${code}-SPINE-GPU-01`, port: 'OSFP 1/22', media: 'MMF OM4 Fiber', lossDb: 0.08 },
        { hopIndex: 2, location: 'Overhead Tray HB-01', device: `${code}-HB-MPO-04`, port: 'MPO-24 C2', media: 'MMF OM4 Fiber', lossDb: 0.09 },
        { hopIndex: 3, location: 'Hall B · Rack B-R01', device: `${code}-HGX-B01`, port: 'ConnectX-7 ib0', media: 'MMF OM4 Fiber', lossDb: 0.07 },
      ],
    },
    {
      id: `xc-${siteId}-103`,
      siteId,
      circuitCode: `XC-${code}-4003`,
      customerOrService: 'Tier-1 Financial Core Redundant Wavelength',
      carrierName: 'TM Wholesale / Global',
      mediaType: 'SMF OS2 Fiber',
      bandwidthGbps: 100,
      mmrCage: 'MMR-B · Cage 05',
      aEnd: `${code}-MMR-ODF-02 / Port 07`,
      zEnd: `${code}-HALL-A-R02 / CORE-A02:xe-1/0/4`,
      lengthMeters: 168,
      opticalLossDb: 0.91,
      status: 'Degraded',
      trayId: `${siteId}-tray-mmr-n`,
      lastTestedAt: now - 2 * HOUR_MS,
      hops: [
        { hopIndex: 1, location: 'Meet-Me Room B', device: `${code}-MMR-ODF-02`, port: 'LC-APC 07', media: 'SMF OS2 Fiber', lossDb: 0.18 },
        { hopIndex: 2, location: 'North Conduit Splice', device: `${code}-SPLICE-N01`, port: 'Tray 3 · F07', media: 'SMF OS2 Fiber', lossDb: 0.49 },
        { hopIndex: 3, location: 'Hall A Patch Panel', device: `${code}-HA-PP-02`, port: 'LC-19', media: 'SMF OS2 Fiber', lossDb: 0.14 },
        { hopIndex: 4, location: 'Hall A · Rack A-R02', device: `${code}-CORE-A02`, port: 'QSFP28 1/0/4', media: 'SMF OS2 Fiber', lossDb: 0.10 },
      ],
    },
    {
      id: `xc-${siteId}-104`,
      siteId,
      circuitCode: `XC-${code}-4004`,
      customerOrService: 'Out-of-Band Redfish & BMS Management Trunk',
      carrierName: 'Internal OOB LAN',
      mediaType: 'Cat6A Copper',
      bandwidthGbps: 10,
      mmrCage: 'NOC Patch Room',
      aEnd: `${code}-OOB-SW-01 / Gi1/0/24`,
      zEnd: `${code}-HALL-C-R01 / MGMT-C01:eth0`,
      lengthMeters: 54,
      opticalLossDb: null,
      status: 'Active',
      trayId: `${siteId}-tray-hall-a`,
      lastTestedAt: now - 36 * HOUR_MS,
      hops: [
        { hopIndex: 1, location: 'NOC Core Rack', device: `${code}-OOB-SW-01`, port: 'RJ45 1/0/24', media: 'Cat6A Copper' },
        { hopIndex: 2, location: 'Hall C Entry Patch', device: `${code}-HC-CU-PP01`, port: 'Port 12', media: 'Cat6A Copper' },
        { hopIndex: 3, location: 'Hall C · Rack C-R01', device: `${code}-MGMT-C01`, port: 'iDRAC/Redfish eth0', media: 'Cat6A Copper' },
      ],
    },
  ];
}

export function validateCrossConnectDraft(draft: NewCrossConnectDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.customerOrService.trim()) errors.customerOrService = 'Customer or service name is required.';
  if (!draft.carrierName.trim()) errors.carrierName = 'Carrier / fabric name is required.';
  if (!draft.aEnd.trim()) errors.aEnd = 'A-End port termination is required.';
  if (!draft.zEnd.trim()) errors.zEnd = 'Z-End port termination is required.';
  return errors;
}

export function provisionCrossConnect(
  existingCircuits: CableCircuit[],
  trays: CableTraySegment[],
  draft: NewCrossConnectDraft,
  now: number
): { circuits: CableCircuit[]; trays: CableTraySegment[]; created: CableCircuit } {
  const code = SITE_META_MAP[draft.siteId].code;
  const seq = 4001 + existingCircuits.length;
  const created: CableCircuit = {
    id: `xc-${draft.siteId}-${now.toString(36)}`,
    siteId: draft.siteId,
    circuitCode: `XC-${code}-${seq}`,
    customerOrService: draft.customerOrService.trim(),
    carrierName: draft.carrierName.trim(),
    mediaType: draft.mediaType,
    bandwidthGbps: draft.bandwidthGbps,
    mmrCage: draft.mmrCage.trim() || 'MMR-A · Cage 01',
    aEnd: draft.aEnd.trim(),
    zEnd: draft.zEnd.trim(),
    lengthMeters: draft.mediaType === 'Cat6A Copper' ? 45 : 115,
    opticalLossDb: draft.mediaType.includes('Fiber') ? 0.31 : null,
    status: 'Active',
    trayId: draft.trayId,
    lastTestedAt: now,
    hops: [
      { hopIndex: 1, location: draft.mmrCage || 'MMR-A', device: draft.aEnd.split('/')[0]?.trim() || 'MMR-ODF', port: draft.aEnd.split('/')[1]?.trim() || 'Port 01', media: draft.mediaType, lossDb: draft.mediaType.includes('Fiber') ? 0.11 : undefined },
      { hopIndex: 2, location: 'Trunk Patch Panel', device: `${code}-PP-TRUNK`, port: 'MPO-A12', media: draft.mediaType, lossDb: draft.mediaType.includes('Fiber') ? 0.12 : undefined },
      { hopIndex: 3, location: 'Destination Rack', device: draft.zEnd.split('/')[0]?.trim() || 'TOR-SW', port: draft.zEnd.split('/')[1]?.trim() || 'Port 01', media: draft.mediaType, lossDb: draft.mediaType.includes('Fiber') ? 0.08 : undefined },
    ],
  };

  const nextTrays = trays.map((t) => {
    if (t.id !== draft.trayId) return t;
    const nextInstalled = Math.min(t.capacityCables, t.installedCables + 2);
    return {
      ...t,
      installedCables: nextInstalled,
      fillRatioPct: Math.round((nextInstalled / t.capacityCables) * 1000) / 10,
    };
  });

  return {
    circuits: [created, ...existingCircuits],
    trays: nextTrays,
    created,
  };
}

export interface OpticalDomTelemetry {
  opticsModule: string;
  txPowerDbm: number;
  rxPowerDbm: number;
  transceiverTempC: number;
  biasCurrentMa: number;
  attenuationBudgetPct: number;
  domStatus: 'Nominal' | 'Marginal' | 'Out of Spec';
}

export interface CircuitFailureImpact {
  circuitId: string;
  circuitCode: string;
  simulatedCutHopIndex: number | null;
  redundancyStatus: '2N Diverse Failover' | 'SPOF — Outage Risk';
  backupCircuitCode: string | null;
  bandwidthLostGbps: number;
  affectedRacks: string[];
  affectedServers: string[];
  estimatedFailoverMs: number | null;
  recommendedAction: string;
}

/**
 * Computes live Digital Optical Monitoring (DOM) transceiver telemetry for any hop in a circuit.
 */
export function computeHopOpticalDom(circuit: CableCircuit, hop: PatchHop): OpticalDomTelemetry {
  if (hop.media === 'Cat6A Copper' || hop.media === 'DAC 400G Twinax') {
    return {
      opticsModule: hop.media === 'DAC 400G Twinax' ? 'QSFP-DD 400G Passive DAC' : '10GBASE-T Copper RJ45',
      txPowerDbm: 0,
      rxPowerDbm: 0,
      transceiverTempC: 36.4 + hop.hopIndex * 0.8,
      biasCurrentMa: 0,
      attenuationBudgetPct: 18,
      domStatus: 'Nominal',
    };
  }

  const cumulativeLoss = circuit.hops
    .filter((h) => h.hopIndex <= hop.hopIndex)
    .reduce((sum, h) => sum + (h.lossDb ?? 0.1), 0);
  const txPowerDbm = circuit.mediaType === 'SMF OS2 Fiber' ? -1.2 : -2.1;
  const rxPowerDbm = Math.round((txPowerDbm - cumulativeLoss * 2.4 - (circuit.status === 'Degraded' ? 2.6 : 0)) * 100) / 100;
  const maxBudgetDb = circuit.mediaType === 'SMF OS2 Fiber' ? 4.5 : 2.6;
  const hopLoss = hop.lossDb ?? 0.1;
  const attenuationBudgetPct = Math.min(125, Math.round(((cumulativeLoss / maxBudgetDb) * 100) * 10) / 10);
  const domStatus: OpticalDomTelemetry['domStatus'] =
    hopLoss >= 0.4 || rxPowerDbm < -8.0
      ? 'Out of Spec'
      : hopLoss >= 0.22 || rxPowerDbm < -5.5
      ? 'Marginal'
      : 'Nominal';

  return {
    opticsModule:
      circuit.bandwidthGbps >= 400
        ? circuit.mediaType === 'SMF OS2 Fiber'
          ? 'QSFP-DD 400G-DR4'
          : 'OSFP 400G-SR8'
        : 'QSFP28 100G-LR4',
    txPowerDbm,
    rxPowerDbm,
    transceiverTempC: Math.round((39.5 + hop.hopIndex * 1.3 + (domStatus === 'Out of Spec' ? 4.2 : 0)) * 10) / 10,
    biasCurrentMa: Math.round((34.2 + hop.hopIndex * 2.1 + (domStatus === 'Out of Spec' ? 9.5 : 0)) * 10) / 10,
    attenuationBudgetPct,
    domStatus,
  };
}

/**
 * Evaluates single-link / patch-hop failure blast radius for a given circuit against active site servers and sibling circuits.
 */
export function evaluateCircuitFailureImpact(params: {
  circuit: CableCircuit;
  allCircuits: CableCircuit[];
  serverHostnamesByRack: Record<string, string[]>;
  cutHopIndex?: number | null;
}): CircuitFailureImpact {
  const { circuit, allCircuits, serverHostnamesByRack, cutHopIndex = null } = params;

  // Match racks referenced in Z-end or hop locations (e.g., "HALL-B-R01" -> "B-R01-01")
  const hallMatch = `${circuit.zEnd} ${circuit.hops.map((h) => h.location).join(' ')}`.match(
    /HALL[- ]([A-D])[- ]R(\d{2})/i
  );
  const hallLetter = hallMatch ? hallMatch[1].toUpperCase() : 'A';
  const rowNum = hallMatch ? hallMatch[2] : '01';
  const candidatePrefix = `${hallLetter}-R${rowNum}-`;

  const matchedRacks = Object.keys(serverHostnamesByRack).filter((rid) =>
    rid.startsWith(candidatePrefix)
  );
  const fallbackRacks =
    matchedRacks.length > 0 ? matchedRacks : [`${hallLetter}-R${rowNum}-01`, `${hallLetter}-R${rowNum}-02`];
  const affectedServers = fallbackRacks.flatMap((r) => serverHostnamesByRack[r] ?? []);

  // Check if another active circuit provides diverse redundancy for the same zone/service
  const backup = allCircuits.find(
    (other) =>
      other.id !== circuit.id &&
      other.status === 'Active' &&
      (other.mediaType === circuit.mediaType || other.bandwidthGbps >= circuit.bandwidthGbps) &&
      other.trayId !== circuit.trayId
  );

  const isDiverse = Boolean(backup && !/oob|management/i.test(circuit.customerOrService));
  const targetHop =
    cutHopIndex !== null ? circuit.hops.find((h) => h.hopIndex === cutHopIndex) : null;

  return {
    circuitId: circuit.id,
    circuitCode: circuit.circuitCode,
    simulatedCutHopIndex: cutHopIndex,
    redundancyStatus: isDiverse ? '2N Diverse Failover' : 'SPOF — Outage Risk',
    backupCircuitCode: isDiverse ? backup!.circuitCode : null,
    bandwidthLostGbps: circuit.bandwidthGbps,
    affectedRacks: fallbackRacks,
    affectedServers:
      affectedServers.length > 0
        ? affectedServers
        : [`tor-${hallLetter.toLowerCase()}${rowNum}-sw01.orise`],
    estimatedFailoverMs: isDiverse ? 14 : null,
    recommendedAction: targetHop
      ? `Inspect & clean/re-terminate ${targetHop.device} (${targetHop.port}) at ${targetHop.location}${
          isDiverse ? `; traffic safely reroutes over ${backup!.circuitCode} (~14ms BGP/ECMP).` : '; dispatch DCO hands immediately (no diverse path).'
        }`
      : isDiverse
      ? `Diverse failover verified via ${backup!.circuitCode}; schedule optical cleaning during next maintenance window.`
      : `Single Point of Failure detected — provision a physically diverse secondary path on an alternate overhead tray.`,
  };
}


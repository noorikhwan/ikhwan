import { SITE_META_MAP, SiteId } from './sites';

/* ============================================================================
 * 1. ASSET LIFECYCLE, CMMS PREVENTIVE MAINTENANCE & SOP/MOP/EOP PLAYBOOKS
 * ========================================================================== */

export type LifecycleStage = 'Active Warranty' | 'Expiring <90d' | 'End-of-Life Risk';
export type PmTaskStatus = 'Scheduled' | 'Due Soon' | 'Completed';
export type PlaybookKind = 'SOP' | 'MOP' | 'EOP';

export interface AssetLifecycleRecord {
  id: string;
  siteId: SiteId;
  assetTag: string;
  name: string;
  subsystem: 'Chiller Plant' | 'UPS & Battery' | 'Generator' | 'CRAC / CDU' | 'Core Switch';
  vendor: string;
  installYear: number;
  warrantyExpires: string;
  eolDate: string;
  lifecycleStage: LifecycleStage;
  replacementCostUsd: number;
}

export interface PmScheduleTask {
  id: string;
  siteId: SiteId;
  title: string;
  equipmentTag: string;
  cadence: 'Monthly' | 'Quarterly' | 'Semi-Annual' | 'Annual';
  dueDateLabel: string;
  assignee: string;
  status: PmTaskStatus;
  linkedPlaybookId: string;
  lastCompletedNote?: string;
}

export interface SparePartItem {
  id: string;
  sku: string;
  name: string;
  category: 'Power' | 'Cooling' | 'Optics & Network' | 'Controls';
  location: string;
  qtyOnHand: number;
  minStock: number;
  unitCostUsd: number;
}

export interface OpsPlaybook {
  id: string;
  code: string;
  kind: PlaybookKind;
  title: string;
  applicableAlarm: string;
  estimatedMinutes: number;
  riskLevel: 'Low' | 'Medium' | 'High';
  steps: Array<{ id: string; text: string; completed: boolean }>;
}

/* ============================================================================
 * 2. MULTI-TENANCY, COLOCATION CAGES & METERED BILLING
 * ========================================================================== */

export interface ColocationTenant {
  id: string;
  siteId: SiteId;
  name: string;
  tier: 'Hyperscale Cage' | 'Enterprise Suite' | 'AI Dedicated Hall' | 'Carrier Cage';
  cageCode: string;
  hallId: 'hall-a' | 'hall-b' | 'hall-c' | 'hall-d';
  allocatedRacks: number;
  contractedKw: number;
  liveDrawKw: number;
  meteredKwhMtd: number;
  tariffPerKwhUsd: number;
  baseCageFeeUsd: number;
  slaTargetPct: number;
  slaActualPct: number;
  overageAlert: boolean;
  estimatedMonthlyBillUsd: number;
}

/* ============================================================================
 * 3. PHYSICAL SECURITY, SMART RACK LOCKS & ANOMALY CORRELATION
 * ========================================================================== */

export type RackLockState = 'Locked' | 'Unlocked' | 'Door Open Alarm';

export interface SmartRackLock {
  id: string;
  siteId: SiteId;
  rackId: string;
  hallLabel: string;
  tenantName: string;
  lockState: RackLockState;
  frontDoorClosed: boolean;
  rearDoorClosed: boolean;
  lastBadgeUser: string;
  lastEventAt: number;
  rackTempDeltaC: number;
  correlatedAlert: string | null;
}

export interface PhysicalAccessEvent {
  id: string;
  siteId: SiteId;
  timestamp: number;
  actorName: string;
  badgeId: string;
  method: 'RFID + Biometric' | 'Smart Rack PIN' | 'Remote NOC Unlock' | 'Forced Door Sensor';
  zoneOrRack: string;
  outcome: 'Granted' | 'Denied' | 'Alarm';
  correlationNote: string | null;
}

/* ============================================================================
 * 4. PROTOCOL INTEGRATIONS & IMMUTABLE AUDIT TRAIL
 * ========================================================================== */

export type ProtocolType = 'Modbus TCP' | 'BACnet/IP' | 'SNMPv3' | 'Redfish REST' | 'MQTT Broker';
export type ConnectorDirection = 'Southbound BMS/IT' | 'Northbound Telemetry';

export interface ProtocolConnector {
  id: string;
  siteId: SiteId;
  name: string;
  protocol: ProtocolType;
  direction: ConnectorDirection;
  endpoint: string;
  status: 'Connected' | 'Degraded' | 'Paused';
  pollIntervalSec: number;
  latencyMs: number;
  packetLossPct: number;
  activePoints: number;
  lastHeartbeatAt: number;
}

export interface ImmutableAuditEntry {
  seq: number;
  id: string;
  timestamp: number;
  siteCode: string;
  actor: string;
  category: 'Setpoint' | 'Power / SLD' | 'Security' | 'CMMS' | 'Protocol' | 'Visitor' | 'Alert' | 'Capacity';
  action: string;
  target: string;
  prevHash: string;
  hash: string;
}

const HOUR_MS = 3600 * 1000;

/* ----------------------------- SEED GENERATORS ---------------------------- */

export function createInitialAssets(siteId: SiteId): AssetLifecycleRecord[] {
  const code = SITE_META_MAP[siteId].code;
  return [
    {
      id: `ast-${siteId}-1`,
      siteId,
      assetTag: `${code}-CHW-01`,
      name: 'Water-Cooled Centrifugal Chiller #1 (2.8 MW)',
      subsystem: 'Chiller Plant',
      vendor: 'Trane CenTraVac',
      installYear: 2022,
      warrantyExpires: '2027-06-30',
      eolDate: '2037-06-30',
      lifecycleStage: 'Active Warranty',
      replacementCostUsd: 680000,
    },
    {
      id: `ast-${siteId}-2`,
      siteId,
      assetTag: `${code}-UPS-BATT-A1`,
      name: 'VRLA / Li-Ion Battery Bank A1 (480V String)',
      subsystem: 'UPS & Battery',
      vendor: 'Schneider Galaxy VX',
      installYear: 2021,
      warrantyExpires: '2026-12-31',
      eolDate: '2027-03-31',
      lifecycleStage: 'Expiring <90d',
      replacementCostUsd: 145000,
    },
    {
      id: `ast-${siteId}-3`,
      siteId,
      assetTag: `${code}-GEN-01`,
      name: 'Standby Diesel Generator #1 (3.0 MVA)',
      subsystem: 'Generator',
      vendor: 'Caterpillar 3516E',
      installYear: 2022,
      warrantyExpires: '2027-08-15',
      eolDate: '2042-08-15',
      lifecycleStage: 'Active Warranty',
      replacementCostUsd: 920000,
    },
    {
      id: `ast-${siteId}-4`,
      siteId,
      assetTag: `${code}-CDU-HB-01`,
      name: 'Hall B Liquid Cooling Distribution Unit (1.5 MW)',
      subsystem: 'CRAC / CDU',
      vendor: 'Vertiv CoolChip CDU',
      installYear: 2024,
      warrantyExpires: '2029-04-01',
      eolDate: '2034-04-01',
      lifecycleStage: 'Active Warranty',
      replacementCostUsd: 210000,
    },
    {
      id: `ast-${siteId}-5`,
      siteId,
      assetTag: `${code}-CORE-SW-02`,
      name: 'Hall A Legacy OOB Aggregation Switch',
      subsystem: 'Core Switch',
      vendor: 'Arista 7050X2',
      installYear: 2019,
      warrantyExpires: '2025-11-30',
      eolDate: '2026-10-31',
      lifecycleStage: 'End-of-Life Risk',
      replacementCostUsd: 38000,
    },
  ];
}

export function createInitialPmTasks(siteId: SiteId): PmScheduleTask[] {
  const code = SITE_META_MAP[siteId].code;
  return [
    {
      id: `pm-${siteId}-1`,
      siteId,
      title: 'Monthly 2-Hour Generator Load-Bank & ATS Sync Test (GEN-1..4)',
      equipmentTag: `${code}-GEN-01..04`,
      cadence: 'Monthly',
      dueDateLabel: 'In 3 days',
      assignee: 'Farid Hakim',
      status: 'Due Soon',
      linkedPlaybookId: 'pb-mop-gen',
    },
    {
      id: `pm-${siteId}-2`,
      siteId,
      title: 'Quarterly UPS Battery Internal Impedance & Thermal Scan',
      equipmentTag: `${code}-UPS-A1/B1`,
      cadence: 'Quarterly',
      dueDateLabel: 'In 9 days',
      assignee: 'Elena Vance',
      status: 'Scheduled',
      linkedPlaybookId: 'pb-mop-ups',
    },
    {
      id: `pm-${siteId}-3`,
      siteId,
      title: 'Square CHW Buffer Tank Strainer Flush & Glycol Concentration Check',
      equipmentTag: `${code}-CHW-TANK-A/B`,
      cadence: 'Quarterly',
      dueDateLabel: 'Completed 2d ago',
      assignee: 'Priya Nair',
      status: 'Completed',
      linkedPlaybookId: 'pb-sop-chw',
      lastCompletedNote: 'Differential pressure nominal (0.18 bar), glycol 24.8% verified.',
    },
    {
      id: `pm-${siteId}-4`,
      siteId,
      title: 'Semi-Annual Cold Aisle 2N Dual-Probe Calibration (160 Sensors)',
      equipmentTag: `${code}-ENV-ALL`,
      cadence: 'Semi-Annual',
      dueDateLabel: 'In 18 days',
      assignee: 'Daniel Tan',
      status: 'Scheduled',
      linkedPlaybookId: 'pb-sop-chw',
    },
  ];
}

export function createInitialSpareParts(): SparePartItem[] {
  return [
    { id: 'sp-1', sku: 'PSU-3200W-TI', name: '3.2kW Titanium Hot-Swap Server PSU', category: 'Power', location: 'KL1 Cage S-04', qtyOnHand: 14, minStock: 8, unitCostUsd: 640 },
    { id: 'sp-2', sku: 'UPS-MOD-250K', name: 'Galaxy VX 250kW Power Module', category: 'Power', location: 'KL1 MEP Store', qtyOnHand: 2, minStock: 2, unitCostUsd: 18500 },
    { id: 'sp-3', sku: 'CHW-VFD-75KW', name: 'Chilled Water Pump VFD Drive (75kW)', category: 'Cooling', location: 'KL1 Roof Store', qtyOnHand: 1, minStock: 2, unitCostUsd: 7900 },
    { id: 'sp-4', sku: 'QSFPDD-400G-DR4', name: '400G-DR4 OS2 Optical Transceiver', category: 'Optics & Network', location: 'MMR Locker 02', qtyOnHand: 28, minStock: 12, unitCostUsd: 490 },
    { id: 'sp-5', sku: 'BACNET-GW-IP', name: 'Redundant BACnet/IP Field-Bus Gateway', category: 'Controls', location: 'NOC Spares Rack', qtyOnHand: 3, minStock: 2, unitCostUsd: 2150 },
  ];
}

export function createInitialPlaybooks(): OpsPlaybook[] {
  return [
    {
      id: 'pb-mop-ups',
      code: 'MOP-PWR-014',
      kind: 'MOP',
      title: 'UPS Module Maintenance Bypass & Battery String Swap',
      applicableAlarm: 'UPS Fault / Battery SoC Low',
      estimatedMinutes: 45,
      riskLevel: 'High',
      steps: [
        { id: 's1', text: 'Verify opposing 2N UPS path (Bus B) load is < 45% rated capacity before transfer.', completed: false },
        { id: 's2', text: 'Confirm zero active utility voltage sags on TNB 33kV feeder telemetry.', completed: false },
        { id: 's3', text: 'Engage Static Bypass on target UPS and verify phase-lock synchronization (Δφ < 1°).', completed: false },
        { id: 's4', text: 'Close External Maintenance Bypass Breaker (MBB) and open UPS output isolator.', completed: false },
        { id: 's5', text: 'Complete battery module replacement, verify torque & impedance, then restore Online double-conversion.', completed: false },
      ],
    },
    {
      id: 'pb-mop-gen',
      code: 'MOP-GEN-008',
      kind: 'MOP',
      title: 'Standby Diesel Generator Parallel Load-Bank Verification',
      applicableAlarm: 'Utility Outage Drill / Fuel Autonomy Low',
      estimatedMinutes: 90,
      riskLevel: 'Medium',
      steps: [
        { id: 'g1', text: 'Inspect B1 underground diesel tank fuel level (> 80%) and day-tank transfer pumps.', completed: false },
        { id: 'g2', text: 'Verify jacket water heater temp (40–50°C) and starter battery bank voltage (26.4V DC).', completed: false },
        { id: 'g3', text: 'Initiate closed-transition parallel run and step load to 30% → 60% → 80% rated kW.', completed: false },
        { id: 'g4', text: 'Log exhaust temp, oil pressure, and frequency stability (50.00 Hz ±0.1 Hz) for 60 minutes.', completed: false },
      ],
    },
    {
      id: 'pb-eop-thermal',
      code: 'EOP-THM-001',
      kind: 'EOP',
      title: 'Cold Aisle ASHRAE >27°C Emergency Thermal Excursion Response',
      applicableAlarm: 'Cold Aisle Temp SLA Breach',
      estimatedMinutes: 15,
      riskLevel: 'High',
      steps: [
        { id: 't1', text: 'Confirm dual-probe readings (Probe A & Probe B) to rule out single sensor drift.', completed: false },
        { id: 't2', text: 'Force standby Air Chillers & Hall CRAC units into Boost mode (100% fan speed).', completed: false },
        { id: 't3', text: 'Verify Rooftop Square CHW Buffer Tank level (> 70%) and header pressure (> 3.8 bar).', completed: false },
        { id: 't4', text: 'Dispatch on-duty technician to inspect containment doors and hot-aisle bypass dampers.', completed: false },
      ],
    },
    {
      id: 'pb-sop-chw',
      code: 'SOP-BMS-022',
      kind: 'SOP',
      title: 'Square CHW Buffer Tank Strainer Inspection & Loop Balancing',
      applicableAlarm: 'CHW Differential Pressure High',
      estimatedMinutes: 30,
      riskLevel: 'Low',
      steps: [
        { id: 'c1', text: 'Confirm 2N redundant chilled water loop (Loop B) is carrying active cooling load.', completed: false },
        { id: 'c2', text: 'Isolate primary strainer basket, relieve pressure safely, and inspect mesh debris.', completed: false },
        { id: 'c3', text: 'Re-pressurize slowly, bleed air vent, and confirm pump VFD frequency stabilizes.', completed: false },
      ],
    },
  ];
}

export function createInitialTenants(siteId: SiteId): ColocationTenant[] {
  const code = SITE_META_MAP[siteId].code;
  const mult = siteId === 'kl1' ? 1 : siteId === 'kl2' ? 0.92 : 0.78;
  const baseList: Array<Omit<ColocationTenant, 'overageAlert' | 'estimatedMonthlyBillUsd'>> = [
    {
      id: `ten-${siteId}-1`,
      siteId,
      name: 'AetherScale AI Cloud Sdn Bhd',
      tier: 'AI Dedicated Hall',
      cageCode: `${code}-CAGE-B01`,
      hallId: 'hall-b',
      allocatedRacks: Math.round(160 * mult),
      contractedKw: Math.round(2800 * mult),
      liveDrawKw: Math.round(2945 * mult), // Overage!
      meteredKwhMtd: Math.round(1612000 * mult),
      tariffPerKwhUsd: 0.118,
      baseCageFeeUsd: Math.round(118000 * mult),
      slaTargetPct: 99.995,
      slaActualPct: 99.998,
    },
    {
      id: `ten-${siteId}-2`,
      siteId,
      name: 'Maybank Digital Core Banking',
      tier: 'Enterprise Suite',
      cageCode: `${code}-SUITE-A04`,
      hallId: 'hall-a',
      allocatedRacks: Math.round(95 * mult),
      contractedKw: Math.round(1150 * mult),
      liveDrawKw: Math.round(918 * mult),
      meteredKwhMtd: Math.round(528400 * mult),
      tariffPerKwhUsd: 0.125,
      baseCageFeeUsd: Math.round(86000 * mult),
      slaTargetPct: 99.995,
      slaActualPct: 100.0,
    },
    {
      id: `ten-${siteId}-3`,
      siteId,
      name: 'ASEAN Content & Storage Mesh',
      tier: 'Hyperscale Cage',
      cageCode: `${code}-CAGE-C02`,
      hallId: 'hall-c',
      allocatedRacks: Math.round(120 * mult),
      contractedKw: Math.round(1400 * mult),
      liveDrawKw: Math.round(1284 * mult),
      meteredKwhMtd: Math.round(739100 * mult),
      tariffPerKwhUsd: 0.12,
      baseCageFeeUsd: Math.round(94000 * mult),
      slaTargetPct: 99.99,
      slaActualPct: 99.994,
    },
    {
      id: `ten-${siteId}-4`,
      siteId,
      name: 'TIME & Equinix Interconnect Node',
      tier: 'Carrier Cage',
      cageCode: `${code}-MMR-D01`,
      hallId: 'hall-d',
      allocatedRacks: Math.round(48 * mult),
      contractedKw: Math.round(520 * mult),
      liveDrawKw: Math.round(442 * mult),
      meteredKwhMtd: Math.round(248900 * mult),
      tariffPerKwhUsd: 0.128,
      baseCageFeeUsd: Math.round(54000 * mult),
      slaTargetPct: 99.995,
      slaActualPct: 99.999,
    },
  ];

  return baseList.map((t) => {
    const overageKw = Math.max(0, t.liveDrawKw - t.contractedKw);
    const overagePenalty = overageKw * 42; // $42/kW demand overage fee
    const energyCharge = t.meteredKwhMtd * t.tariffPerKwhUsd;
    return {
      ...t,
      overageAlert: overageKw > 0,
      estimatedMonthlyBillUsd: Math.round(t.baseCageFeeUsd + energyCharge + overagePenalty),
    };
  });
}

export function createInitialRackLocks(siteId: SiteId, now: number): SmartRackLock[] {
  const code = SITE_META_MAP[siteId].code;
  return [
    {
      id: `lock-${siteId}-1`,
      siteId,
      rackId: `${code}-B-R01-01`,
      hallLabel: 'Hall B · AI & GPU',
      tenantName: 'AetherScale AI Cloud',
      lockState: 'Door Open Alarm',
      frontDoorClosed: false,
      rearDoorClosed: true,
      lastBadgeUser: 'Marcus Tan Wei Jie (Vendor)',
      lastEventAt: now - 14 * 60 * 1000,
      rackTempDeltaC: 3.4,
      correlatedAlert: 'Correlated +3.4°C inlet spike 2 min after front door opened without NOC work window.',
    },
    {
      id: `lock-${siteId}-2`,
      siteId,
      rackId: `${code}-A-R02-04`,
      hallLabel: 'Hall A · Core Compute',
      tenantName: 'Maybank Digital Core',
      lockState: 'Locked',
      frontDoorClosed: true,
      rearDoorClosed: true,
      lastBadgeUser: 'Elena Vance (Shift Lead)',
      lastEventAt: now - 3 * HOUR_MS,
      rackTempDeltaC: 0.2,
      correlatedAlert: null,
    },
    {
      id: `lock-${siteId}-3`,
      siteId,
      rackId: `${code}-D-R04-02`,
      hallLabel: 'Hall D · Interconnect',
      tenantName: 'TIME Carrier Node',
      lockState: 'Unlocked',
      frontDoorClosed: true,
      rearDoorClosed: false,
      lastBadgeUser: 'Mei Ling Chong (Escort: Daniel Tan)',
      lastEventAt: now - 28 * 60 * 1000,
      rackTempDeltaC: 0.8,
      correlatedAlert: 'Approved MMR splice window (VIS-KL1-2042) — rear fiber tray open.',
    },
    {
      id: `lock-${siteId}-4`,
      siteId,
      rackId: `${code}-C-R01-08`,
      hallLabel: 'Hall C · Storage & Edge',
      tenantName: 'ASEAN Storage Mesh',
      lockState: 'Locked',
      frontDoorClosed: true,
      rearDoorClosed: true,
      lastBadgeUser: 'Priya Nair (Facility Eng)',
      lastEventAt: now - 6 * HOUR_MS,
      rackTempDeltaC: 0.1,
      correlatedAlert: null,
    },
    {
      id: `lock-${siteId}-5`,
      siteId,
      rackId: `${code}-A-R01-01`,
      hallLabel: 'Hall A · Core Compute',
      tenantName: 'Orise Core Infra',
      lockState: 'Locked',
      frontDoorClosed: true,
      rearDoorClosed: true,
      lastBadgeUser: 'Farid Hakim (Shift Eng)',
      lastEventAt: now - 9 * HOUR_MS,
      rackTempDeltaC: 0.0,
      correlatedAlert: null,
    },
  ];
}

export function createInitialAccessEvents(siteId: SiteId, now: number): PhysicalAccessEvent[] {
  const code = SITE_META_MAP[siteId].code;
  return [
    {
      id: `acc-${siteId}-1`,
      siteId,
      timestamp: now - 14 * 60 * 1000,
      actorName: 'Marcus Tan Wei Jie',
      badgeId: `${code}-TMP-099`,
      method: 'Forced Door Sensor',
      zoneOrRack: `${code}-B-R01-01 (Front Door)`,
      outcome: 'Alarm',
      correlationNote: 'Thermal +3.4°C & PSU-2 fan ramp correlated within 120s of door ajar event.',
    },
    {
      id: `acc-${siteId}-2`,
      siteId,
      timestamp: now - 28 * 60 * 1000,
      actorName: 'Mei Ling Chong',
      badgeId: `${code}-TMP-102`,
      method: 'RFID + Biometric',
      zoneOrRack: 'Meet-Me Room (MMR) → Hall D Cage 02',
      outcome: 'Granted',
      correlationNote: 'Escort Daniel Tan verified; optical port et-0/0/1 link flap matches splice MOP.',
    },
    {
      id: `acc-${siteId}-3`,
      siteId,
      timestamp: now - 1.8 * HOUR_MS,
      actorName: 'Ir. Haziq Roslan',
      badgeId: `${code}-TMP-101`,
      method: 'RFID + Biometric',
      zoneOrRack: 'Rooftop Chiller Deck Mantrap',
      outcome: 'Granted',
      correlationNote: 'Escort Farid Hakim verified for CHW-TANK-A thermography.',
    },
    {
      id: `acc-${siteId}-4`,
      siteId,
      timestamp: now - 4.2 * HOUR_MS,
      actorName: 'Unregistered Badge #8821',
      badgeId: 'EXT-UNKNOWN-8821',
      method: 'RFID + Biometric',
      zoneOrRack: 'Electrical & Battery Room East Door',
      outcome: 'Denied',
      correlationNote: 'Access blocked — badge not authorized for high-voltage battery zone.',
    },
  ];
}

export function createInitialProtocolConnectors(siteId: SiteId, now: number): ProtocolConnector[] {
  const code = SITE_META_MAP[siteId].code;
  const octet = siteId === 'kl1' ? 10 : siteId === 'kl2' ? 20 : 30;
  return [
    {
      id: `proto-${siteId}-bacnet`,
      siteId,
      name: `${code} Chiller & CRAC BACnet/IP Core`,
      protocol: 'BACnet/IP',
      direction: 'Southbound BMS/IT',
      endpoint: `10.${octet}.40.10:47808 (UDP)`,
      status: 'Connected',
      pollIntervalSec: 2,
      latencyMs: 14,
      packetLossPct: 0.0,
      activePoints: 1840,
      lastHeartbeatAt: now - 2000,
    },
    {
      id: `proto-${siteId}-modbus`,
      siteId,
      name: `${code} EPMS UPS, Switchgear & 8x Gen Modbus TCP`,
      protocol: 'Modbus TCP',
      direction: 'Southbound BMS/IT',
      endpoint: `10.${octet}.40.22:502 (TCP)`,
      status: 'Connected',
      pollIntervalSec: 1,
      latencyMs: 9,
      packetLossPct: 0.0,
      activePoints: 1420,
      lastHeartbeatAt: now - 1000,
    },
    {
      id: `proto-${siteId}-redfish`,
      siteId,
      name: `${code} Server Fleet & GPU Sled Redfish API`,
      protocol: 'Redfish REST',
      direction: 'Southbound BMS/IT',
      endpoint: `https://oob-gw.${siteId}.orise.local/redfish/v1`,
      status: 'Connected',
      pollIntervalSec: 5,
      latencyMs: 42,
      packetLossPct: 0.02,
      activePoints: 960,
      lastHeartbeatAt: now - 4000,
    },
    {
      id: `proto-${siteId}-snmp`,
      siteId,
      name: `${code} Rack PDU & Core Switch SNMPv3 Poller`,
      protocol: 'SNMPv3',
      direction: 'Southbound BMS/IT',
      endpoint: `10.${octet}.50.5:161 (SHA-256/AES)`,
      status: 'Degraded',
      pollIntervalSec: 10,
      latencyMs: 186,
      packetLossPct: 1.4,
      activePoints: 3200,
      lastHeartbeatAt: now - 14000,
    },
    {
      id: `proto-${siteId}-mqtt`,
      siteId,
      name: `${code} Northbound ESG & SIEM MQTT Telemetry Bus`,
      protocol: 'MQTT Broker',
      direction: 'Northbound Telemetry',
      endpoint: `mqtts://telemetry.orise-dcim.internal:8883`,
      status: 'Connected',
      pollIntervalSec: 2,
      latencyMs: 18,
      packetLossPct: 0.0,
      activePoints: 7420,
      lastHeartbeatAt: now - 2000,
    },
  ];
}

/* --------------------- IMMUTABLE HASH-CHAIN AUDIT TRAIL ------------------- */

export function computeAuditHash(prevHash: string, payload: string): string {
  // Deterministic 64-bit FNV-1a style hex digest for tamper-evident chain verification
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  const input = `${prevHash}|${payload}`;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + (i & 0xff);
    h2 = Math.imul(h2, 0x01000193);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

export function appendImmutableAudit(
  existing: ImmutableAuditEntry[],
  entry: Omit<ImmutableAuditEntry, 'seq' | 'id' | 'prevHash' | 'hash'>
): ImmutableAuditEntry[] {
  const prev = existing[0];
  const prevHash = prev ? prev.hash : '0000000000000000';
  const seq = prev ? prev.seq + 1 : 1;
  const payload = `${seq}|${entry.timestamp}|${entry.siteCode}|${entry.actor}|${entry.category}|${entry.action}|${entry.target}`;
  const hash = computeAuditHash(prevHash, payload);
  const created: ImmutableAuditEntry = {
    ...entry,
    seq,
    id: `AUD-${String(seq).padStart(5, '0')}`,
    prevHash,
    hash,
  };
  return [created, ...existing];
}

export function verifyAuditChain(entries: ImmutableAuditEntry[]): { valid: boolean; checkedCount: number } {
  // entries are newest-first; reverse to verify chronologically from genesis
  const chrono = [...entries].reverse();
  let expectedPrev = '0000000000000000';
  for (const e of chrono) {
    if (e.prevHash !== expectedPrev) {
      return { valid: false, checkedCount: chrono.length };
    }
    const payload = `${e.seq}|${e.timestamp}|${e.siteCode}|${e.actor}|${e.category}|${e.action}|${e.target}`;
    const recomputed = computeAuditHash(e.prevHash, payload);
    if (recomputed !== e.hash) {
      return { valid: false, checkedCount: chrono.length };
    }
    expectedPrev = e.hash;
  }
  return { valid: true, checkedCount: chrono.length };
}

export function createInitialAuditTrail(now: number): ImmutableAuditEntry[] {
  let log: ImmutableAuditEntry[] = [];
  const seeds: Array<Omit<ImmutableAuditEntry, 'seq' | 'id' | 'prevHash' | 'hash'>> = [
    {
      timestamp: now - 6 * HOUR_MS,
      siteCode: 'KL1',
      actor: 'Elena Vance',
      category: 'Setpoint',
      action: 'Updated Hall B CRAC-B1 cold aisle supply setpoint to 18.5°C',
      target: 'KL1-CRAC-B1',
    },
    {
      timestamp: now - 4.5 * HOUR_MS,
      siteCode: 'KL1',
      actor: 'Farid Hakim',
      category: 'CMMS',
      action: 'Completed quarterly Square CHW Buffer Tank strainer flush & glycol check',
      target: 'KL1-CHW-TANK-A/B',
    },
    {
      timestamp: now - 2.1 * HOUR_MS,
      siteCode: 'KL1',
      actor: 'Elena Vance',
      category: 'Visitor',
      action: 'Issued temporary RFID badge KL1-TMP-101 after NDA & biometric verification',
      target: 'VIS-KL1-2041',
    },
    {
      timestamp: now - 0.5 * HOUR_MS,
      siteCode: 'KL1',
      actor: 'System Security Engine',
      category: 'Security',
      action: 'Flagged Door Open Alarm correlated with +3.4°C inlet rise on Hall B rack',
      target: 'KL1-B-R01-01',
    },
  ];
  for (const s of seeds) {
    log = appendImmutableAudit(log, s);
  }
  return log;
}

import { OperatorProfile } from './shiftEngine';
import { SiteId } from './sites';

export type VisitorStatus = 'Pre-Approved' | 'Checked In' | 'Checked Out' | 'Denied / Revoked';

export type VisitorType =
  | 'Vendor / OEM Engineer'
  | 'Customer / Colocation'
  | 'Carrier / Fiber Tech'
  | 'Auditor / Compliance'
  | 'VIP / Executive';

export type AccessZoneId =
  | 'Admin Office & NOC'
  | 'Hall A · Core Compute'
  | 'Hall B · AI & GPU'
  | 'Hall C · Storage & Edge'
  | 'Hall D · Cloud & Interconnect'
  | 'Meet-Me Room (MMR)'
  | 'Rooftop Chiller Plant'
  | 'Electrical & Battery Yard';

export const VISITOR_TYPES: VisitorType[] = [
  'Vendor / OEM Engineer',
  'Customer / Colocation',
  'Carrier / Fiber Tech',
  'Auditor / Compliance',
  'VIP / Executive',
];

export const ACCESS_ZONES: AccessZoneId[] = [
  'Admin Office & NOC',
  'Hall A · Core Compute',
  'Hall B · AI & GPU',
  'Hall C · Storage & Edge',
  'Hall D · Cloud & Interconnect',
  'Meet-Me Room (MMR)',
  'Rooftop Chiller Plant',
  'Electrical & Battery Yard',
];

export const VISITOR_PARKING_BAYS = [
  'None',
  'VP-01',
  'VP-02',
  'VP-03',
  'VP-04',
  'VP-05',
  'VP-06',
  'VP-07',
  'VP-08',
  'VIP-01',
  'VIP-02',
  'LOAD-01',
];

export interface VisitorAuditEntry {
  id: string;
  timestamp: number;
  actor: string;
  action: string;
}

export interface VisitorRecord {
  id: string;
  siteId: SiteId;
  fullName: string;
  company: string;
  email: string;
  phone: string;
  idNumber: string;
  visitorType: VisitorType;
  purpose: string;
  accessZones: AccessZoneId[];
  escortProfileId: string;
  escortName: string;
  escortRequired: boolean;
  badgeNumber: string | null;
  vehiclePlate: string;
  parkingBay: string;
  equipmentManifest: string;
  ndaSigned: boolean;
  safetyBriefed: boolean;
  biometricVerified: boolean;
  status: VisitorStatus;
  scheduledStartAt: number;
  scheduledEndAt: number;
  checkedInAt: number | null;
  checkedOutAt: number | null;
  linkedTicketId?: string | null;
  auditLog: VisitorAuditEntry[];
}

export interface VisitorDraft {
  siteId: SiteId;
  fullName: string;
  company: string;
  email: string;
  phone: string;
  idNumber: string;
  visitorType: VisitorType;
  purpose: string;
  accessZones: AccessZoneId[];
  escortProfileId: string;
  escortName: string;
  escortRequired: boolean;
  vehiclePlate: string;
  parkingBay: string;
  equipmentManifest: string;
  ndaSigned: boolean;
  safetyBriefed: boolean;
  biometricVerified: boolean;
  durationHours: number;
}

export interface VisitorValidationResult {
  valid: boolean;
  errors: Partial<Record<'fullName' | 'company' | 'idNumber' | 'purpose' | 'accessZones' | 'escortProfileId', string>>;
}

export interface VisitorFilterCriteria {
  siteScope: SiteId | 'all';
  status: VisitorStatus | 'all';
  visitorType: VisitorType | 'all';
  search: string;
}

export interface VisitorStats {
  total: number;
  onSiteCount: number;
  preApprovedCount: number;
  checkedOutCount: number;
  revokedCount: number;
  overdueCount: number;
  activeParkingBays: number;
  complianceClearedPct: number;
}

export interface CheckInResult {
  visitors: VisitorRecord[];
  ok: boolean;
  badgeNumber?: string;
  error?: string;
}

const HOUR_MS = 3_600_000;

function siteCode(siteId: SiteId): string {
  return siteId.toUpperCase();
}

function nextVisitorSequence(existing: VisitorRecord[], siteId: SiteId): number {
  const prefix = `VIS-${siteCode(siteId)}-`;
  let maxSeq = 2040;
  for (const v of existing) {
    if (v.id.startsWith(prefix)) {
      const parsed = Number.parseInt(v.id.slice(prefix.length), 10);
      if (Number.isFinite(parsed) && parsed > maxSeq) maxSeq = parsed;
    }
  }
  return maxSeq + 1;
}

function nextBadgeNumber(existing: VisitorRecord[], siteId: SiteId): string {
  const prefix = `${siteCode(siteId)}-TMP-`;
  let maxNum = 100;
  for (const v of existing) {
    if (v.badgeNumber && v.badgeNumber.startsWith(prefix)) {
      const parsed = Number.parseInt(v.badgeNumber.slice(prefix.length), 10);
      if (Number.isFinite(parsed) && parsed > maxNum) maxNum = parsed;
    }
  }
  return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
}

export function createInitialVisitors(profiles: OperatorProfile[], now: number): VisitorRecord[] {
  const elena = profiles[0] ?? { id: 'op-elena', name: 'Elena Vance' };
  const farid = profiles[1] ?? elena;
  const priya = profiles[2] ?? elena;
  const daniel = profiles[3] ?? elena;

  return [
    {
      id: 'VIS-KL1-2041',
      siteId: 'kl1',
      fullName: 'Ir. Haziq Roslan',
      company: 'Schneider Electric Services MY',
      email: 'haziq.roslan@se-partner.my',
      phone: '+60 12-448 9201',
      idNumber: 'MY-880412-14-XXXX',
      visitorType: 'Vendor / OEM Engineer',
      purpose: 'Preventive IR thermography & VFD commissioning on Rooftop Square CHW-TANK-A Pump Skid',
      accessZones: ['Rooftop Chiller Plant', 'Admin Office & NOC'],
      escortProfileId: farid.id,
      escortName: farid.name,
      escortRequired: true,
      badgeNumber: 'KL1-TMP-101',
      vehiclePlate: 'VKL 7742',
      parkingBay: 'VP-02',
      equipmentManifest: 'FLIR E96 Thermal Camera, Fluke 435-II Power Analyzer, ESD Wrist Strap',
      ndaSigned: true,
      safetyBriefed: true,
      biometricVerified: true,
      status: 'Checked In',
      scheduledStartAt: now - 2 * HOUR_MS,
      scheduledEndAt: now + 3 * HOUR_MS,
      checkedInAt: now - 1.8 * HOUR_MS,
      checkedOutAt: null,
      linkedTicketId: 'TKT-KL1-1042',
      auditLog: [
        {
          id: 'va-2041-1',
          timestamp: now - 5 * HOUR_MS,
          actor: elena.name,
          action: 'Pre-registered OEM visit and linked to preventive maintenance window.',
        },
        {
          id: 'va-2041-2',
          timestamp: now - 1.8 * HOUR_MS,
          actor: farid.name,
          action: 'Verified NDA, ESD safety briefing & biometric ID. Issued temporary RFID badge KL1-TMP-101.',
        },
      ],
    },
    {
      id: 'VIS-KL1-2042',
      siteId: 'kl1',
      fullName: 'Mei Ling Chong',
      company: 'TIME dotCom Carrier Engineering',
      email: 'meiling.chong@time-carrier.my',
      phone: '+60 17-902 1184',
      idNumber: 'MY-910903-10-XXXX',
      visitorType: 'Carrier / Fiber Tech',
      purpose: 'Dual-path 400G DWDM dark fiber cross-connect splice in Meet-Me Room (MMR)',
      accessZones: ['Meet-Me Room (MMR)', 'Hall D · Cloud & Interconnect'],
      escortProfileId: daniel.id,
      escortName: daniel.name,
      escortRequired: true,
      badgeNumber: 'KL1-TMP-102',
      vehiclePlate: 'WXY 3190',
      parkingBay: 'VP-05',
      equipmentManifest: 'Fujikura 90S+ Fusion Splicer, EXFO OTDR, Fiber Cleaver Kit',
      ndaSigned: true,
      safetyBriefed: true,
      biometricVerified: true,
      status: 'Checked In',
      scheduledStartAt: now - 1.2 * HOUR_MS,
      scheduledEndAt: now + 2.5 * HOUR_MS,
      checkedInAt: now - 1.1 * HOUR_MS,
      checkedOutAt: null,
      linkedTicketId: 'TKT-KL1-1039',
      auditLog: [
        {
          id: 'va-2042-1',
          timestamp: now - 4 * HOUR_MS,
          actor: daniel.name,
          action: 'Approved carrier cross-connect access request for MMR Cage 02.',
        },
        {
          id: 'va-2042-2',
          timestamp: now - 1.1 * HOUR_MS,
          actor: elena.name,
          action: 'Mantrap check-in completed. Issued badge KL1-TMP-102 and logged tool manifest.',
        },
      ],
    },
    {
      id: 'VIS-KL1-2043',
      siteId: 'kl1',
      fullName: 'Dr. Aravind Subramaniam',
      company: 'Uptime Institute Audit Group',
      email: 'a.subramaniam@uptime-audit.org',
      phone: '+60 16-331 5540',
      idNumber: 'P-A8492014',
      visitorType: 'Auditor / Compliance',
      purpose: 'Annual Tier IV 2N Fault-Tolerant Battery Room & Switchgear witness inspection',
      accessZones: ['Electrical & Battery Yard', 'Admin Office & NOC', 'Hall A · Core Compute'],
      escortProfileId: elena.id,
      escortName: elena.name,
      escortRequired: true,
      badgeNumber: null,
      vehiclePlate: 'BND 9012',
      parkingBay: 'VIP-01',
      equipmentManifest: 'Audit Tablet (Camera Sealed), Sound Level Meter',
      ndaSigned: true,
      safetyBriefed: false,
      biometricVerified: false,
      status: 'Pre-Approved',
      scheduledStartAt: now + 0.5 * HOUR_MS,
      scheduledEndAt: now + 5 * HOUR_MS,
      checkedInAt: null,
      checkedOutAt: null,
      linkedTicketId: null,
      auditLog: [
        {
          id: 'va-2043-1',
          timestamp: now - 12 * HOUR_MS,
          actor: elena.name,
          action: 'Pre-approved Tier IV compliance audit visit; NDA signed electronically prior to arrival.',
        },
      ],
    },
    {
      id: 'VIS-KL1-2040',
      siteId: 'kl1',
      fullName: 'Marcus Tan Wei Jie',
      company: 'NVIDIA Enterprise Field Support',
      email: 'marcus.tan@nv-field.com',
      phone: '+60 19-612 4408',
      idNumber: 'MY-891120-07-XXXX',
      visitorType: 'Vendor / OEM Engineer',
      purpose: 'Hall B liquid-cooled HGX GPU sled PSU replacement & Redfish firmware validation',
      accessZones: ['Hall B · AI & GPU'],
      escortProfileId: priya.id,
      escortName: priya.name,
      escortRequired: true,
      badgeNumber: 'KL1-TMP-099',
      vehiclePlate: 'VJH 4481',
      parkingBay: 'VP-01',
      equipmentManifest: 'Replacement 3.2kW Titanium PSU (x2), ESD Mat',
      ndaSigned: true,
      safetyBriefed: true,
      biometricVerified: true,
      status: 'Checked Out',
      scheduledStartAt: now - 6 * HOUR_MS,
      scheduledEndAt: now - 2 * HOUR_MS,
      checkedInAt: now - 5.9 * HOUR_MS,
      checkedOutAt: now - 2.2 * HOUR_MS,
      linkedTicketId: 'TKT-KL1-1043',
      auditLog: [
        {
          id: 'va-2040-1',
          timestamp: now - 5.9 * HOUR_MS,
          actor: priya.name,
          action: 'Checked in at South Reception mantrap; issued badge KL1-TMP-099.',
        },
        {
          id: 'va-2040-2',
          timestamp: now - 2.2 * HOUR_MS,
          actor: priya.name,
          action: 'Checked out; temporary badge KL1-TMP-099 returned and tool manifest cleared.',
        },
      ],
    },
    {
      id: 'VIS-KL2-2041',
      siteId: 'kl2',
      fullName: 'Nurul Aina Syafiqah',
      company: 'Maybank Cloud Infrastructure',
      email: 'nurul.aina@maybank-infra.my',
      phone: '+60 13-774 8820',
      idNumber: 'MY-930615-14-XXXX',
      visitorType: 'Customer / Colocation',
      purpose: 'Colocation Cage B2 rack audit & smart-PDU metering verification',
      accessZones: ['Hall B · AI & GPU', 'Admin Office & NOC'],
      escortProfileId: farid.id,
      escortName: farid.name,
      escortRequired: true,
      badgeNumber: 'KL2-TMP-101',
      vehiclePlate: 'VGB 2219',
      parkingBay: 'VP-03',
      equipmentManifest: 'Barcode Scanner, Asset Inventory Laptop',
      ndaSigned: true,
      safetyBriefed: true,
      biometricVerified: true,
      status: 'Checked In',
      scheduledStartAt: now - 1.5 * HOUR_MS,
      scheduledEndAt: now + 2 * HOUR_MS,
      checkedInAt: now - 1.4 * HOUR_MS,
      checkedOutAt: null,
      linkedTicketId: null,
      auditLog: [
        {
          id: 'va-kl2-1',
          timestamp: now - 1.4 * HOUR_MS,
          actor: farid.name,
          action: 'Checked in at KL2 SE Admin Security Desk; issued badge KL2-TMP-101.',
        },
      ],
    },
    {
      id: 'VIS-KL3-2041',
      siteId: 'kl3',
      fullName: 'Kenneth Lim Kok Wai',
      company: 'Cummins Power Generation MY',
      email: 'kenneth.lim@cummins-my.com',
      phone: '+60 12-889 0312',
      idNumber: 'MY-850219-08-XXXX',
      visitorType: 'Vendor / OEM Engineer',
      purpose: 'Load-bank inspection on Standby Diesel Generators GEN-A4 & GEN-B4 + B1 fuel polishing check',
      accessZones: ['Electrical & Battery Yard'],
      escortProfileId: daniel.id,
      escortName: daniel.name,
      escortRequired: true,
      badgeNumber: null,
      vehiclePlate: 'BQP 6604',
      parkingBay: 'LOAD-01',
      equipmentManifest: 'Diesel Fuel Sample Bottles, Digital Tachometer, Acoustic PPE',
      ndaSigned: true,
      safetyBriefed: true,
      biometricVerified: false,
      status: 'Pre-Approved',
      scheduledStartAt: now + 1 * HOUR_MS,
      scheduledEndAt: now + 4 * HOUR_MS,
      checkedInAt: null,
      checkedOutAt: null,
      linkedTicketId: null,
      auditLog: [
        {
          id: 'va-kl3-1',
          timestamp: now - 3 * HOUR_MS,
          actor: daniel.name,
          action: 'Pre-registered generator OEM maintenance visit at KL3 NW Command Annex.',
        },
      ],
    },
  ];
}

export function validateVisitorDraft(draft: VisitorDraft): VisitorValidationResult {
  const errors: VisitorValidationResult['errors'] = {};
  if (draft.fullName.trim().length < 2) {
    errors.fullName = 'Visitor full name is required (at least 2 characters).';
  }
  if (draft.company.trim().length < 2) {
    errors.company = 'Organization / company name is required.';
  }
  if (draft.idNumber.trim().length < 4) {
    errors.idNumber = 'Government ID or Passport number is required.';
  }
  if (draft.purpose.trim().length < 5) {
    errors.purpose = 'Provide a clear purpose of visit (at least 5 characters).';
  }
  if (!draft.accessZones || draft.accessZones.length === 0) {
    errors.accessZones = 'Select at least one authorized physical access zone.';
  }
  if (!draft.escortProfileId.trim()) {
    errors.escortProfileId = 'Assign an authorized on-site escort engineer.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function registerVisitor(
  existing: VisitorRecord[],
  draft: VisitorDraft,
  actor: string,
  now: number
): VisitorRecord {
  const seq = nextVisitorSequence(existing, draft.siteId);
  const id = `VIS-${siteCode(draft.siteId)}-${seq}`;
  const durationHours = Math.max(1, Math.min(24, draft.durationHours || 4));

  return {
    id,
    siteId: draft.siteId,
    fullName: draft.fullName.trim(),
    company: draft.company.trim(),
    email: draft.email.trim(),
    phone: draft.phone.trim(),
    idNumber: draft.idNumber.trim(),
    visitorType: draft.visitorType,
    purpose: draft.purpose.trim(),
    accessZones: [...draft.accessZones],
    escortProfileId: draft.escortProfileId,
    escortName: draft.escortName,
    escortRequired: draft.escortRequired,
    badgeNumber: null,
    vehiclePlate: draft.vehiclePlate.trim().toUpperCase(),
    parkingBay: draft.parkingBay || 'None',
    equipmentManifest: draft.equipmentManifest.trim() || 'No tools / equipment declared',
    ndaSigned: draft.ndaSigned,
    safetyBriefed: draft.safetyBriefed,
    biometricVerified: draft.biometricVerified,
    status: 'Pre-Approved',
    scheduledStartAt: now,
    scheduledEndAt: now + durationHours * HOUR_MS,
    checkedInAt: null,
    checkedOutAt: null,
    linkedTicketId: null,
    auditLog: [
      {
        id: `va-${now.toString(36)}-reg`,
        timestamp: now,
        actor,
        action: `Pre-registered ${draft.visitorType} visit for ${draft.accessZones.join(', ')}. Escort: ${draft.escortName}.`,
      },
    ],
  };
}

export function updateVisitorCompliance(
  visitors: VisitorRecord[],
  visitorId: string,
  patch: Partial<Pick<VisitorRecord, 'ndaSigned' | 'safetyBriefed' | 'biometricVerified' | 'parkingBay'>>,
  actor: string,
  now: number
): VisitorRecord[] {
  return visitors.map((v) => {
    if (v.id !== visitorId) return v;
    const changes: string[] = [];
    if (patch.ndaSigned !== undefined && patch.ndaSigned !== v.ndaSigned) {
      changes.push(`NDA ${patch.ndaSigned ? 'verified' : 'unchecked'}`);
    }
    if (patch.safetyBriefed !== undefined && patch.safetyBriefed !== v.safetyBriefed) {
      changes.push(`Safety/ESD briefing ${patch.safetyBriefed ? 'completed' : 'unchecked'}`);
    }
    if (patch.biometricVerified !== undefined && patch.biometricVerified !== v.biometricVerified) {
      changes.push(`ID/Biometric ${patch.biometricVerified ? 'verified' : 'unchecked'}`);
    }
    if (patch.parkingBay !== undefined && patch.parkingBay !== v.parkingBay) {
      changes.push(`Parking bay set to ${patch.parkingBay}`);
    }
    if (changes.length === 0) return v;

    return {
      ...v,
      ...patch,
      auditLog: [
        ...v.auditLog,
        {
          id: `va-${now.toString(36)}-cmp-${v.auditLog.length}`,
          timestamp: now,
          actor,
          action: `Updated security gate record: ${changes.join(', ')}.`,
        },
      ],
    };
  });
}

export function checkInVisitor(
  visitors: VisitorRecord[],
  visitorId: string,
  actor: string,
  now: number
): CheckInResult {
  const target = visitors.find((v) => v.id === visitorId);
  if (!target) {
    return { visitors, ok: false, error: 'Visitor record not found.' };
  }
  if (target.status !== 'Pre-Approved') {
    return { visitors, ok: false, error: `Cannot check in a visitor currently marked ${target.status}.` };
  }

  const missing: string[] = [];
  if (!target.ndaSigned) missing.push('NDA Signed');
  if (!target.safetyBriefed) missing.push('Safety & ESD Briefing');
  if (!target.biometricVerified) missing.push('ID / Biometric Verification');

  if (missing.length > 0) {
    return {
      visitors,
      ok: false,
      error: `Security gate blocked — complete required checks first: ${missing.join(', ')}.`,
    };
  }

  const badgeNumber = target.badgeNumber ?? nextBadgeNumber(visitors, target.siteId);
  const nextVisitors = visitors.map((v) => {
    if (v.id !== visitorId) return v;
    return {
      ...v,
      status: 'Checked In' as const,
      badgeNumber,
      checkedInAt: now,
      auditLog: [
        ...v.auditLog,
        {
          id: `va-${now.toString(36)}-in`,
          timestamp: now,
          actor,
          action: `Mantrap check-in approved. Issued temporary RFID badge ${badgeNumber}${
            v.parkingBay && v.parkingBay !== 'None' ? ` · Parking bay ${v.parkingBay}` : ''
          }.`,
        },
      ],
    };
  });

  return { visitors: nextVisitors, ok: true, badgeNumber };
}

export function checkOutVisitor(
  visitors: VisitorRecord[],
  visitorId: string,
  actor: string,
  now: number,
  note?: string
): VisitorRecord[] {
  return visitors.map((v) => {
    if (v.id !== visitorId || v.status !== 'Checked In') return v;
    const suffix = note?.trim() ? ` Note: ${note.trim()}` : '';
    return {
      ...v,
      status: 'Checked Out' as const,
      checkedOutAt: now,
      auditLog: [
        ...v.auditLog,
        {
          id: `va-${now.toString(36)}-out`,
          timestamp: now,
          actor,
          action: `Visitor checked out. Temporary RFID badge ${v.badgeNumber ?? 'N/A'} returned and deactivated.${suffix}`,
        },
      ],
    };
  });
}

export function revokeVisitorAccess(
  visitors: VisitorRecord[],
  visitorId: string,
  reason: string,
  actor: string,
  now: number
): VisitorRecord[] {
  const cleanReason = reason.trim() || 'Access revoked by site security / NOC operator';
  return visitors.map((v) => {
    if (v.id !== visitorId) return v;
    return {
      ...v,
      status: 'Denied / Revoked' as const,
      checkedOutAt: v.status === 'Checked In' ? now : v.checkedOutAt,
      auditLog: [
        ...v.auditLog,
        {
          id: `va-${now.toString(36)}-rev`,
          timestamp: now,
          actor,
          action: `Access denied / revoked (${cleanReason}).${
            v.badgeNumber ? ` Badge ${v.badgeNumber} deactivated immediately.` : ''
          }`,
        },
      ],
    };
  });
}

export function filterVisitors(
  visitors: VisitorRecord[],
  criteria: VisitorFilterCriteria
): VisitorRecord[] {
  const q = criteria.search.trim().toLowerCase();
  return visitors.filter((v) => {
    if (criteria.siteScope !== 'all' && v.siteId !== criteria.siteScope) return false;
    if (criteria.status !== 'all' && v.status !== criteria.status) return false;
    if (criteria.visitorType !== 'all' && v.visitorType !== criteria.visitorType) return false;
    if (q) {
      const hay = [
        v.id,
        v.fullName,
        v.company,
        v.idNumber,
        v.badgeNumber ?? '',
        v.vehiclePlate,
        v.parkingBay,
        v.escortName,
        v.purpose,
        ...v.accessZones,
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function computeVisitorStats(
  visitors: VisitorRecord[],
  siteScope: SiteId | 'all',
  now: number
): VisitorStats {
  const scoped = siteScope === 'all' ? visitors : visitors.filter((v) => v.siteId === siteScope);
  let onSiteCount = 0;
  let preApprovedCount = 0;
  let checkedOutCount = 0;
  let revokedCount = 0;
  let overdueCount = 0;
  let activeParkingBays = 0;
  let complianceReady = 0;

  for (const v of scoped) {
    if (v.status === 'Checked In') {
      onSiteCount += 1;
      if (now > v.scheduledEndAt) overdueCount += 1;
      if (v.parkingBay && v.parkingBay !== 'None') activeParkingBays += 1;
    } else if (v.status === 'Pre-Approved') {
      preApprovedCount += 1;
    } else if (v.status === 'Checked Out') {
      checkedOutCount += 1;
    } else {
      revokedCount += 1;
    }

    if (v.ndaSigned && v.safetyBriefed && v.biometricVerified) {
      complianceReady += 1;
    }
  }

  return {
    total: scoped.length,
    onSiteCount,
    preApprovedCount,
    checkedOutCount,
    revokedCount,
    overdueCount,
    activeParkingBays,
    complianceClearedPct: scoped.length > 0 ? Math.round((complianceReady / scoped.length) * 100) : 100,
  };
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportVisitorsCsv(visitors: VisitorRecord[]): string {
  const headers = [
    'Visitor ID',
    'Site',
    'Full Name',
    'Company',
    'Type',
    'Status',
    'RFID Badge',
    'ID / Passport',
    'Escort',
    'Authorized Zones',
    'Vehicle Plate',
    'Parking Bay',
    'NDA Signed',
    'Safety Briefed',
    'Biometric Verified',
    'Checked In (UTC)',
    'Checked Out (UTC)',
    'Purpose',
    'Equipment Manifest',
  ];

  const rows = visitors.map((v) =>
    [
      v.id,
      v.siteId.toUpperCase(),
      v.fullName,
      v.company,
      v.visitorType,
      v.status,
      v.badgeNumber ?? 'Pending',
      v.idNumber,
      v.escortName,
      v.accessZones.join(' | '),
      v.vehiclePlate || 'None',
      v.parkingBay,
      v.ndaSigned ? 'Yes' : 'No',
      v.safetyBriefed ? 'Yes' : 'No',
      v.biometricVerified ? 'Yes' : 'No',
      v.checkedInAt ? new Date(v.checkedInAt).toISOString() : '',
      v.checkedOutAt ? new Date(v.checkedOutAt).toISOString() : '',
      v.purpose,
      v.equipmentManifest,
    ]
      .map((cell) => escapeCsvCell(String(cell)))
      .join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

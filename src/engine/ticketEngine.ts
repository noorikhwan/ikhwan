import { OperatorProfile } from './shiftEngine';
import { SiteId } from './sites';
import { ActiveAlert, HallId } from './types';

export type TicketPriority = 'P1 - Critical' | 'P2 - High' | 'P3 - Medium' | 'P4 - Low';
export type TicketStatus = 'Open' | 'In Progress' | 'Pending Parts' | 'Resolved' | 'Closed';
export type TicketCategory =
  | 'Incident'
  | 'Cooling & Power'
  | 'Hardware Replacement'
  | 'Change Request'
  | 'Security & Access'
  | 'Preventive Maintenance';

export interface TicketComment {
  id: string;
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: number;
  kind: 'comment' | 'status-change' | 'assignment';
}

export interface OpsTicket {
  id: string;
  siteId: SiteId;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  affectedAssetId: string;
  affectedAssetLabel: string;
  hallId?: HallId;
  requesterName: string;
  assigneeProfileId: string;
  assigneeName: string;
  createdAt: number;
  updatedAt: number;
  slaDueAt: number;
  resolvedAt?: number;
  linkedAlertId?: string;
  comments: TicketComment[];
}

export interface NewTicketDraft {
  siteId: SiteId;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  affectedAssetId: string;
  affectedAssetLabel: string;
  hallId?: HallId;
  requesterName: string;
  assigneeProfileId: string;
  assigneeName: string;
  linkedAlertId?: string;
}

export interface TicketFilterCriteria {
  siteId?: SiteId | 'all';
  status?: TicketStatus | 'all';
  priority?: TicketPriority | 'all';
  category?: TicketCategory | 'all';
  query?: string;
}

export interface TicketMetricsSummary {
  total: number;
  openCount: number;
  inProgressCount: number;
  pendingPartsCount: number;
  resolvedCount: number;
  p1OpenCount: number;
  slaBreachedCount: number;
  slaAtRiskCount: number;
  slaCompliancePct: number;
}

export const TICKET_SLA_HOURS: Record<TicketPriority, number> = {
  'P1 - Critical': 2,
  'P2 - High': 6,
  'P3 - Medium': 24,
  'P4 - Low': 72,
};

export const TICKET_CATEGORIES: TicketCategory[] = [
  'Incident',
  'Cooling & Power',
  'Hardware Replacement',
  'Change Request',
  'Security & Access',
  'Preventive Maintenance',
];

export const TICKET_PRIORITIES: TicketPriority[] = [
  'P1 - Critical',
  'P2 - High',
  'P3 - Medium',
  'P4 - Low',
];

export const TICKET_STATUSES: TicketStatus[] = [
  'Open',
  'In Progress',
  'Pending Parts',
  'Resolved',
  'Closed',
];

export function computeSlaDueAt(priority: TicketPriority, createdAt: number): number {
  return createdAt + TICKET_SLA_HOURS[priority] * 3600 * 1000;
}

export function getTicketSlaState(
  ticket: OpsTicket,
  now: number
): 'met' | 'on-track' | 'at-risk' | 'breached' {
  if (ticket.status === 'Resolved' || ticket.status === 'Closed') {
    const completedAt = ticket.resolvedAt ?? ticket.updatedAt;
    return completedAt <= ticket.slaDueAt ? 'met' : 'breached';
  }
  const remainingMs = ticket.slaDueAt - now;
  if (remainingMs <= 0) return 'breached';
  const totalWindowMs = Math.max(1, ticket.slaDueAt - ticket.createdAt);
  if (remainingMs <= totalWindowMs * 0.25 || remainingMs <= 45 * 60 * 1000) {
    return 'at-risk';
  }
  return 'on-track';
}

export function formatSlaRemaining(ticket: OpsTicket, now: number): string {
  if (ticket.status === 'Resolved' || ticket.status === 'Closed') {
    return getTicketSlaState(ticket, now) === 'met' ? 'SLA Met' : 'SLA Breached';
  }
  const diffMs = ticket.slaDueAt - now;
  const absMins = Math.round(Math.abs(diffMs) / 60000);
  const hours = Math.floor(absMins / 60);
  const mins = absMins % 60;
  const span = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  return diffMs < 0 ? `Overdue ${span}` : `${span} left`;
}

export function createInitialTickets(profiles: OperatorProfile[], now: number): OpsTicket[] {
  const op = (idx: number) => profiles[idx % Math.max(1, profiles.length)];
  const p0 = op(0);
  const p1 = op(1);
  const p2 = op(2);
  const p3 = op(3);

  const hour = 3600 * 1000;
  const min = 60 * 1000;

  return [
    {
      id: 'TKT-KL1-1041',
      siteId: 'kl1',
      title: 'Inspect Hall B Liquid CDU-B1 secondary manifold delta-P drift',
      description:
        'Differential pressure across Hall B Row 01-04 PG25 manifold drifted +0.28 bar above baseline. Verify strainer basket cleanliness during Path A failover window without GPU rack downtime.',
      category: 'Cooling & Power',
      priority: 'P1 - Critical',
      status: 'In Progress',
      affectedAssetId: 'crac-b1',
      affectedAssetLabel: 'CDU-B1 · Hall B Liquid Cooling CDU',
      hallId: 'hall-b',
      requesterName: p0?.name ?? 'Elena Vance',
      assigneeProfileId: p1?.id ?? 'op-farid',
      assigneeName: p1?.name ?? 'Farid Rahman',
      createdAt: now - 55 * min,
      updatedAt: now - 14 * min,
      slaDueAt: computeSlaDueAt('P1 - Critical', now - 55 * min),
      comments: [
        {
          id: 'cmt-1041-1',
          authorName: p0?.name ?? 'Elena Vance',
          authorRole: p0?.role ?? 'NOC Shift Lead',
          body: 'Ticket opened from Hall B CDU telemetry trend. Path B CDU-B2 confirmed healthy at 100% standby takeover margin.',
          createdAt: now - 55 * min,
          kind: 'comment',
        },
        {
          id: 'cmt-1041-2',
          authorName: p1?.name ?? 'Farid Rahman',
          authorRole: p1?.role ?? 'Critical Facilities Engineer',
          body: 'Status changed to In Progress. Isolating duplex strainer loop A for physical inspection.',
          createdAt: now - 14 * min,
          kind: 'status-change',
        },
      ],
    },
    {
      id: 'TKT-KL1-1042',
      siteId: 'kl1',
      title: 'Quarterly calibration check on Rooftop Square CHW-TANK-A level transmitter',
      description:
        'Verify ultrasonic level sensor and sight-glass alignment on 180,000 L Square Sectional Thermal Buffer Tank A and confirm Triplex VFD pump alternation.',
      category: 'Preventive Maintenance',
      priority: 'P3 - Medium',
      status: 'Open',
      affectedAssetId: 'chw-tank-a',
      affectedAssetLabel: 'CHW-TANK-A · 180kL Square Buffer Tank & Pump Set',
      requesterName: p2?.name ?? 'Nadia Tan',
      assigneeProfileId: p1?.id ?? 'op-farid',
      assigneeName: p1?.name ?? 'Farid Rahman',
      createdAt: now - 4 * hour,
      updatedAt: now - 4 * hour,
      slaDueAt: computeSlaDueAt('P3 - Medium', now - 4 * hour),
      comments: [
        {
          id: 'cmt-1042-1',
          authorName: p2?.name ?? 'Nadia Tan',
          authorRole: p2?.role ?? 'DC Operations Engineer',
          body: 'Scheduled inside rooftop Loop A inspection window. Zero impact to chilled-water supply.',
          createdAt: now - 4 * hour,
          kind: 'comment',
        },
      ],
    },
    {
      id: 'TKT-KL1-1043',
      siteId: 'kl1',
      title: 'Replace redundant PSU module on Hall B GPU node kl1-gpu-b01-01',
      description:
        'Power supply bay 2 flagged amber pre-failure warning on BMC health check. Hot-swap replacement unit staged in Admin Office spares cage.',
      category: 'Hardware Replacement',
      priority: 'P2 - High',
      status: 'Pending Parts',
      affectedAssetId: 'srv-b-01',
      affectedAssetLabel: 'kl1-gpu-b01-01 · Rack B-R01-01',
      hallId: 'hall-b',
      requesterName: p3?.name ?? 'Marcus Lim',
      assigneeProfileId: p2?.id ?? 'op-nadia',
      assigneeName: p2?.name ?? 'Nadia Tan',
      createdAt: now - 3.5 * hour,
      updatedAt: now - 45 * min,
      slaDueAt: computeSlaDueAt('P2 - High', now - 3.5 * hour),
      comments: [
        {
          id: 'cmt-1043-1',
          authorName: p2?.name ?? 'Nadia Tan',
          authorRole: p2?.role ?? 'DC Operations Engineer',
          body: 'Waiting for OEM 3000W Titanium PSU delivery sign-off at South Security Desk.',
          createdAt: now - 45 * min,
          kind: 'status-change',
        },
      ],
    },
    {
      id: 'TKT-KL1-1039',
      siteId: 'kl1',
      title: 'Escort carrier fiber splice crew into Meet-Me Room (MMR)',
      description:
        'Dual-diverse 800G carrier cross-connect cutover on MMR Path B demarcation rack. Biometric mantrap access verified via Admin Office security desk.',
      category: 'Security & Access',
      priority: 'P3 - Medium',
      status: 'Resolved',
      affectedAssetId: 'mmr-room',
      affectedAssetLabel: 'Meet-Me Room (MMR) · Carrier Interconnect',
      requesterName: p0?.name ?? 'Elena Vance',
      assigneeProfileId: p3?.id ?? 'op-marcus',
      assigneeName: p3?.name ?? 'Marcus Lim',
      createdAt: now - 11 * hour,
      updatedAt: now - 5 * hour,
      resolvedAt: now - 5 * hour,
      slaDueAt: computeSlaDueAt('P3 - Medium', now - 11 * hour),
      comments: [
        {
          id: 'cmt-1039-1',
          authorName: p3?.name ?? 'Marcus Lim',
          authorRole: p3?.role ?? 'Network & Security Specialist',
          body: 'Optical loss verified at 0.21 dB across all 12 pairs. Vendor escorted out and rack locked.',
          createdAt: now - 5 * hour,
          kind: 'status-change',
        },
      ],
    },
    {
      id: 'TKT-KL2-2018',
      siteId: 'kl2',
      title: 'Load-bank readiness verification on East Yard Generator GEN-A4',
      description:
        'Confirm jacket water pre-heater, ATS sync relay, and Basement B1 Tank A4 transfer pump pressure ahead of monthly 2(N+1) generator exercise.',
      category: 'Cooling & Power',
      priority: 'P2 - High',
      status: 'Open',
      affectedAssetId: 'gen-a4',
      affectedAssetLabel: 'GEN-A4 · 8 MW Standby Diesel Generator',
      requesterName: p1?.name ?? 'Farid Rahman',
      assigneeProfileId: p1?.id ?? 'op-farid',
      assigneeName: p1?.name ?? 'Farid Rahman',
      createdAt: now - 2 * hour,
      updatedAt: now - 2 * hour,
      slaDueAt: computeSlaDueAt('P2 - High', now - 2 * hour),
      comments: [
        {
          id: 'cmt-2018-1',
          authorName: p1?.name ?? 'Farid Rahman',
          authorRole: p1?.role ?? 'Critical Facilities Engineer',
          body: 'Fuel polishing completed on Diesel Tank A4 (94% level). Ready for ATS synchronization test.',
          createdAt: now - 2 * hour,
          kind: 'comment',
        },
      ],
    },
    {
      id: 'TKT-KL2-2019',
      siteId: 'kl2',
      title: 'Balance Air-Cooled Chiller CHA-B5 VFD fan staging',
      description:
        'Optimize EC condenser fan speed curve on Loop B Air Chiller CHA-B5 to reduce evening acoustic profile across KL2 rooftop parapet screen.',
      category: 'Change Request',
      priority: 'P3 - Medium',
      status: 'In Progress',
      affectedAssetId: 'cha-b5',
      affectedAssetLabel: 'CHA-B5 · 4.8 MW Air-Cooled Chiller (Loop B)',
      requesterName: p0?.name ?? 'Elena Vance',
      assigneeProfileId: p2?.id ?? 'op-nadia',
      assigneeName: p2?.name ?? 'Nadia Tan',
      createdAt: now - 6 * hour,
      updatedAt: now - 90 * min,
      slaDueAt: computeSlaDueAt('P3 - Medium', now - 6 * hour),
      comments: [
        {
          id: 'cmt-2019-1',
          authorName: p2?.name ?? 'Nadia Tan',
          authorRole: p2?.role ?? 'DC Operations Engineer',
          body: 'Applying updated BACnet PID ramp parameters; COP improved from 4.4 to 4.7.',
          createdAt: now - 90 * min,
          kind: 'comment',
        },
      ],
    },
    {
      id: 'TKT-KL3-3012',
      siteId: 'kl3',
      title: 'Inspect KL3 Central Rooftop Solar PV Inverter String 04',
      description:
        'String 04 yield dipped 4% below adjacent canopies during midday peak. Inspect DC combiner breaker and panel surface dust accumulation.',
      category: 'Preventive Maintenance',
      priority: 'P4 - Low',
      status: 'Open',
      affectedAssetId: 'hv-a',
      affectedAssetLabel: 'KL3 Rooftop Solar PV Canopy → HV-A Tie',
      requesterName: p3?.name ?? 'Marcus Lim',
      assigneeProfileId: p0?.id ?? 'op-elena',
      assigneeName: p0?.name ?? 'Elena Vance',
      createdAt: now - 5 * hour,
      updatedAt: now - 5 * hour,
      slaDueAt: computeSlaDueAt('P4 - Low', now - 5 * hour),
      comments: [
        {
          id: 'cmt-3012-1',
          authorName: p3?.name ?? 'Marcus Lim',
          authorRole: p3?.role ?? 'Network & Security Specialist',
          body: 'Logged for next daylight rooftop inspection from North-West Command Annex.',
          createdAt: now - 5 * hour,
          kind: 'comment',
        },
      ],
    },
  ];
}

export function createOpsTicket(
  existingTickets: OpsTicket[],
  draft: NewTicketDraft,
  now: number
): OpsTicket {
  const siteCode = draft.siteId.toUpperCase();
  const siteSequence =
    existingTickets
      .filter((t) => t.siteId === draft.siteId)
      .reduce((maxSeq, t) => {
        const num = Number(t.id.split('-').pop());
        return Number.isFinite(num) ? Math.max(maxSeq, num) : maxSeq;
      }, draft.siteId === 'kl1' ? 1043 : draft.siteId === 'kl2' ? 2019 : 3012) + 1;

  const id = `TKT-${siteCode}-${siteSequence}`;
  const title = draft.title.trim();
  const description = draft.description.trim();

  return {
    id,
    siteId: draft.siteId,
    title,
    description,
    category: draft.category,
    priority: draft.priority,
    status: 'Open',
    affectedAssetId: draft.affectedAssetId || 'facility-general',
    affectedAssetLabel: draft.affectedAssetLabel || `${siteCode} Facility Infrastructure`,
    hallId: draft.hallId,
    requesterName: draft.requesterName,
    assigneeProfileId: draft.assigneeProfileId,
    assigneeName: draft.assigneeName,
    createdAt: now,
    updatedAt: now,
    slaDueAt: computeSlaDueAt(draft.priority, now),
    linkedAlertId: draft.linkedAlertId,
    comments: [
      {
        id: `cmt-${id}-open`,
        authorName: draft.requesterName,
        authorRole: 'Operations Requester',
        body: draft.linkedAlertId
          ? `Ticket escalated from active alert ${draft.linkedAlertId} and assigned to ${draft.assigneeName}.`
          : `Ticket created and assigned to ${draft.assigneeName}.`,
        createdAt: now,
        kind: 'comment',
      },
    ],
  };
}

export function createTicketFromAlert(
  existingTickets: OpsTicket[],
  alert: ActiveAlert,
  siteId: SiteId,
  requester: OperatorProfile,
  assignee: OperatorProfile,
  now: number
): OpsTicket {
  const priority: TicketPriority =
    alert.severity === 'critical'
      ? 'P1 - Critical'
      : alert.severity === 'warning'
      ? 'P2 - High'
      : 'P3 - Medium';
  const category: TicketCategory =
    alert.metric === 'facilityPowerMw' ||
    alert.serverId.startsWith('ch') ||
    alert.serverId.startsWith('ups') ||
    alert.serverId.startsWith('gen')
      ? 'Cooling & Power'
      : 'Incident';

  return createOpsTicket(
    existingTickets,
    {
      siteId,
      title: `[Alert] ${alert.ruleName} — ${alert.serverHostname}`,
      description: `${alert.message}. Dispatched to: ${
        alert.dispatchedChannelNames.length > 0 ? alert.dispatchedChannelNames.join(', ') : 'NOC Queue'
      }.`,
      category,
      priority,
      affectedAssetId: alert.serverId,
      affectedAssetLabel: alert.serverHostname,
      requesterName: requester.name,
      assigneeProfileId: assignee.id,
      assigneeName: assignee.name,
      linkedAlertId: alert.id,
    },
    now
  );
}

export function transitionTicketStatus(
  tickets: OpsTicket[],
  ticketId: string,
  nextStatus: TicketStatus,
  actor: { name: string; role: string },
  note: string | undefined,
  now: number
): OpsTicket[] {
  return tickets.map((ticket) => {
    if (ticket.id !== ticketId || ticket.status === nextStatus) return ticket;
    const isCompleting = nextStatus === 'Resolved' || nextStatus === 'Closed';
    const isReopening = nextStatus === 'Open' || nextStatus === 'In Progress';
    const commentBody = note?.trim()
      ? `Status changed from ${ticket.status} to ${nextStatus}: ${note.trim()}`
      : `Status changed from ${ticket.status} to ${nextStatus}.`;

    return {
      ...ticket,
      status: nextStatus,
      updatedAt: now,
      resolvedAt: isCompleting ? ticket.resolvedAt ?? now : isReopening ? undefined : ticket.resolvedAt,
      comments: [
        ...ticket.comments,
        {
          id: `cmt-${ticket.id}-${now.toString(36)}-${ticket.comments.length}`,
          authorName: actor.name,
          authorRole: actor.role,
          body: commentBody,
          createdAt: now,
          kind: 'status-change',
        },
      ],
    };
  });
}

export function assignOpsTicket(
  tickets: OpsTicket[],
  ticketId: string,
  assignee: Pick<OperatorProfile, 'id' | 'name'>,
  actor: { name: string; role: string },
  now: number
): OpsTicket[] {
  return tickets.map((ticket) => {
    if (ticket.id !== ticketId || ticket.assigneeProfileId === assignee.id) return ticket;
    return {
      ...ticket,
      assigneeProfileId: assignee.id,
      assigneeName: assignee.name,
      updatedAt: now,
      comments: [
        ...ticket.comments,
        {
          id: `cmt-${ticket.id}-assign-${now.toString(36)}-${ticket.comments.length}`,
          authorName: actor.name,
          authorRole: actor.role,
          body: `Reassigned ticket from ${ticket.assigneeName} to ${assignee.name}.`,
          createdAt: now,
          kind: 'assignment',
        },
      ],
    };
  });
}

export function addTicketComment(
  tickets: OpsTicket[],
  ticketId: string,
  body: string,
  actor: { name: string; role: string },
  now: number
): OpsTicket[] {
  const clean = body.trim();
  if (!clean) return tickets;
  return tickets.map((ticket) => {
    if (ticket.id !== ticketId) return ticket;
    return {
      ...ticket,
      updatedAt: now,
      comments: [
        ...ticket.comments,
        {
          id: `cmt-${ticket.id}-${now.toString(36)}-${ticket.comments.length}`,
          authorName: actor.name,
          authorRole: actor.role,
          body: clean,
          createdAt: now,
          kind: 'comment',
        },
      ],
    };
  });
}

export function filterTickets(tickets: OpsTicket[], criteria: TicketFilterCriteria): OpsTicket[] {
  const q = criteria.query?.trim().toLowerCase() ?? '';
  return tickets.filter((t) => {
    if (criteria.siteId && criteria.siteId !== 'all' && t.siteId !== criteria.siteId) return false;
    if (criteria.status && criteria.status !== 'all' && t.status !== criteria.status) return false;
    if (criteria.priority && criteria.priority !== 'all' && t.priority !== criteria.priority) return false;
    if (criteria.category && criteria.category !== 'all' && t.category !== criteria.category) return false;
    if (q) {
      const hay = `${t.id} ${t.title} ${t.description} ${t.affectedAssetLabel} ${t.assigneeName} ${t.category}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function computeTicketMetrics(tickets: OpsTicket[], now: number): TicketMetricsSummary {
  let openCount = 0;
  let inProgressCount = 0;
  let pendingPartsCount = 0;
  let resolvedCount = 0;
  let p1OpenCount = 0;
  let slaBreachedCount = 0;
  let slaAtRiskCount = 0;

  for (const t of tickets) {
    const isClosed = t.status === 'Resolved' || t.status === 'Closed';
    if (t.status === 'Open') openCount += 1;
    else if (t.status === 'In Progress') inProgressCount += 1;
    else if (t.status === 'Pending Parts') pendingPartsCount += 1;
    else resolvedCount += 1;

    if (!isClosed && t.priority === 'P1 - Critical') {
      p1OpenCount += 1;
    }
    const slaState = getTicketSlaState(t, now);
    if (slaState === 'breached') slaBreachedCount += 1;
    else if (slaState === 'at-risk') slaAtRiskCount += 1;
  }

  const total = tickets.length;
  const slaCompliancePct =
    total > 0 ? Number((((total - slaBreachedCount) / total) * 100).toFixed(1)) : 100;

  return {
    total,
    openCount,
    inProgressCount,
    pendingPartsCount,
    resolvedCount,
    p1OpenCount,
    slaBreachedCount,
    slaAtRiskCount,
    slaCompliancePct,
  };
}

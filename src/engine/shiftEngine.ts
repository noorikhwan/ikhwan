import { SiteId } from './sites';

export type ShiftTeamId = 'Shift A' | 'Shift B' | 'Shift C' | 'Shift D';

export type ShiftPatternId = 'panama-12h' | 'continental-8h' | 'four-on-four-off-12h';

export type ShiftSlotType = 'Day' | 'Morning' | 'Swing' | 'Night' | 'Off';

export type OperatorRole =
  | 'On-Call Lead'
  | 'MEP & Cooling Specialist'
  | 'Power & Tier IV Engineer'
  | 'BMS Automation Engineer'
  | 'NOC Operations Engineer'
  | 'AI Reliability Analyst';

export type DutyOverrideStatus = 'auto' | 'Standby' | 'On Leave';
export type EffectiveDutyStatus = 'On Duty' | 'Standby' | 'Off Duty' | 'On Leave';

export interface OperatorProfile {
  id: string;
  name: string;
  initials: string;
  role: OperatorRole;
  shiftTeam: ShiftTeamId;
  primarySite: SiteId;
  email: string;
  phone: string;
  certifications: string[];
  avatarUrl?: string;
  isShiftLead: boolean;
  dutyOverride: DutyOverrideStatus;
}

export interface NewProfileDraft {
  name: string;
  role: OperatorRole;
  shiftTeam: ShiftTeamId;
  primarySite: SiteId;
  email: string;
  phone: string;
  certificationsText: string;
  isShiftLead: boolean;
  avatarUrl?: string;
}

export interface ShiftSlotWindow {
  slot: Exclude<ShiftSlotType, 'Off'>;
  label: string;
  timeRange: string;
  hours: number;
}

export interface ShiftPatternDefinition {
  id: ShiftPatternId;
  name: string;
  shortName: string;
  description: string;
  cycleLengthDays: number;
  shiftHours: number;
  slots: ShiftSlotWindow[];
  /**
   * For each day index (0..cycleLengthDays-1), maps each ShiftTeamId to its ShiftSlotType.
   * Invariant: every active slot in `slots` is covered by exactly one ShiftTeamId per day.
   */
  schedule: Array<Record<ShiftTeamId, ShiftSlotType>>;
}

export interface ShiftCalendarDay {
  dayOffset: number;
  cycleDayNumber: number; // 1-based within pattern cycle
  dateLabel: string;
  weekdayLabel: string;
  assignments: Record<ShiftTeamId, ShiftSlotType>;
  isCurrentCycleDay: boolean;
}

export interface ShiftHandoverEntry {
  id: string;
  timestamp: number;
  siteId: SiteId;
  patternId: ShiftPatternId;
  cycleDayNumber: number;
  outgoingTeam: ShiftTeamId;
  outgoingSlot: Exclude<ShiftSlotType, 'Off'>;
  outgoingOperatorName: string;
  incomingTeam: ShiftTeamId;
  incomingSlot: Exclude<ShiftSlotType, 'Off'>;
  incomingLeadName: string;
  openCriticalCount: number;
  openWarningCount: number;
  sitePue: number;
  slaCompliancePct: number;
  notes: string;
  checklistVerified: boolean;
}

export interface ShiftCycleState {
  patternId: ShiftPatternId;
  cycleDayIndex: number; // 0-based index within current pattern cycle
  activeSlotIndex: number; // index into pattern.slots (e.g., 0 = Day, 1 = Night)
  baseDateIso: string; // YYYY-MM-DD reference for Day 1
  handoverLog: ShiftHandoverEntry[];
}

export const SHIFT_TEAMS: ShiftTeamId[] = ['Shift A', 'Shift B', 'Shift C', 'Shift D'];

export const OPERATOR_ROLES: OperatorRole[] = [
  'On-Call Lead',
  'MEP & Cooling Specialist',
  'Power & Tier IV Engineer',
  'BMS Automation Engineer',
  'NOC Operations Engineer',
  'AI Reliability Analyst',
];

/**
 * 14-day 12-hour Panama (2-2-3) 4-team Tier IV rotation:
 * Day 07:00-19:00 MYT, Night 19:00-07:00 MYT.
 * Every day has exactly 1 Day team, 1 Night team, and 2 Off teams.
 * Every team works 7 shifts (84h) per 14-day cycle (42h/week avg) with alternating 3-day weekends.
 */
const PANAMA_12H_SCHEDULE: Array<Record<ShiftTeamId, ShiftSlotType>> = [
  { 'Shift A': 'Day', 'Shift B': 'Off', 'Shift C': 'Night', 'Shift D': 'Off' },
  { 'Shift A': 'Day', 'Shift B': 'Off', 'Shift C': 'Night', 'Shift D': 'Off' },
  { 'Shift A': 'Off', 'Shift B': 'Day', 'Shift C': 'Off', 'Shift D': 'Night' },
  { 'Shift A': 'Off', 'Shift B': 'Day', 'Shift C': 'Off', 'Shift D': 'Night' },
  { 'Shift A': 'Day', 'Shift B': 'Off', 'Shift C': 'Night', 'Shift D': 'Off' },
  { 'Shift A': 'Day', 'Shift B': 'Off', 'Shift C': 'Night', 'Shift D': 'Off' },
  { 'Shift A': 'Day', 'Shift B': 'Off', 'Shift C': 'Night', 'Shift D': 'Off' },
  { 'Shift A': 'Off', 'Shift B': 'Day', 'Shift C': 'Off', 'Shift D': 'Night' },
  { 'Shift A': 'Off', 'Shift B': 'Day', 'Shift C': 'Off', 'Shift D': 'Night' },
  { 'Shift A': 'Day', 'Shift B': 'Off', 'Shift C': 'Night', 'Shift D': 'Off' },
  { 'Shift A': 'Day', 'Shift B': 'Off', 'Shift C': 'Night', 'Shift D': 'Off' },
  { 'Shift A': 'Off', 'Shift B': 'Day', 'Shift C': 'Off', 'Shift D': 'Night' },
  { 'Shift A': 'Off', 'Shift B': 'Day', 'Shift C': 'Off', 'Shift D': 'Night' },
  { 'Shift A': 'Off', 'Shift B': 'Day', 'Shift C': 'Off', 'Shift D': 'Night' },
];

/**
 * 16-day 12-hour 4-On / 4-Off rotation:
 * 4 Days, 4 Off, 4 Nights, 4 Off — staggered by 4 days across Teams A, B, C, D.
 * Guarantees exactly 1 Day team and 1 Night team every single day.
 */
const FOUR_ON_FOUR_OFF_SCHEDULE: Array<Record<ShiftTeamId, ShiftSlotType>> = Array.from(
  { length: 16 },
  (_, day) => {
    const slotForOffset = (offset: number): ShiftSlotType => {
      const pos = (day + offset) % 16;
      if (pos < 4) return 'Day';
      if (pos < 8) return 'Off';
      if (pos < 12) return 'Night';
      return 'Off';
    };
    return {
      'Shift A': slotForOffset(0),
      'Shift B': slotForOffset(4),
      'Shift C': slotForOffset(8),
      'Shift D': slotForOffset(12),
    };
  }
);

/**
 * 28-day 8-hour Continental 3-Shift (Morning / Swing / Night) 4-team rotation:
 * Standard 2-2-3 Continental block per team offset by 7 days:
 * [M, M, S, S, N, N, N, Off, Off, M, M, S, S, S, N, N, Off, Off, M, M, M, S, S, N, N, Off, Off, Off]
 * Every day across all 28 days covers Morning, Swing, and Night with 1 team resting Off.
 */
const CONTINENTAL_BASE: ShiftSlotType[] = [
  'Morning', 'Morning', 'Swing', 'Swing', 'Night', 'Night', 'Night',
  'Off', 'Off', 'Morning', 'Morning', 'Swing', 'Swing', 'Swing',
  'Night', 'Night', 'Off', 'Off', 'Morning', 'Morning', 'Morning',
  'Swing', 'Swing', 'Night', 'Night', 'Off', 'Off', 'Off',
];

const CONTINENTAL_8H_SCHEDULE: Array<Record<ShiftTeamId, ShiftSlotType>> = Array.from(
  { length: 28 },
  (_, day) => ({
    'Shift A': CONTINENTAL_BASE[day % 28],
    'Shift B': CONTINENTAL_BASE[(day + 7) % 28],
    'Shift C': CONTINENTAL_BASE[(day + 14) % 28],
    'Shift D': CONTINENTAL_BASE[(day + 21) % 28],
  })
);

export const SHIFT_PATTERNS: Record<ShiftPatternId, ShiftPatternDefinition> = {
  'panama-12h': {
    id: 'panama-12h',
    name: '12h Panama (2-2-3 Rotation)',
    shortName: '12h Panama 2-2-3',
    description:
      '4-team 12-hour Tier IV coverage (07:00–19:00 & 19:00–07:00 MYT) with alternating 3-day recovery weekends.',
    cycleLengthDays: 14,
    shiftHours: 12,
    slots: [
      { slot: 'Day', label: 'Day Watch', timeRange: '07:00 – 19:00 MYT', hours: 12 },
      { slot: 'Night', label: 'Night Watch', timeRange: '19:00 – 07:00 MYT', hours: 12 },
    ],
    schedule: PANAMA_12H_SCHEDULE,
  },
  'four-on-four-off-12h': {
    id: 'four-on-four-off-12h',
    name: '12h Hyperscale (4-On / 4-Off)',
    shortName: '12h 4-On / 4-Off',
    description:
      '16-day continuous block rotation (4 Day, 4 Off, 4 Night, 4 Off) minimizing circadian handoff transitions across KL campuses.',
    cycleLengthDays: 16,
    shiftHours: 12,
    slots: [
      { slot: 'Day', label: 'Day Watch', timeRange: '07:00 – 19:00 MYT', hours: 12 },
      { slot: 'Night', label: 'Night Watch', timeRange: '19:00 – 07:00 MYT', hours: 12 },
    ],
    schedule: FOUR_ON_FOUR_OFF_SCHEDULE,
  },
  'continental-8h': {
    id: 'continental-8h',
    name: '8h Continental (3-Shift 24/7)',
    shortName: '8h 3-Shift Continental',
    description:
      '28-day rapid forward-rotating 8-hour Morning, Swing, and Night watch cycle for high-tempo MEP & NOC operations.',
    cycleLengthDays: 28,
    shiftHours: 8,
    slots: [
      { slot: 'Morning', label: 'Morning Watch', timeRange: '07:00 – 15:00 MYT', hours: 8 },
      { slot: 'Swing', label: 'Swing Watch', timeRange: '15:00 – 23:00 MYT', hours: 8 },
      { slot: 'Night', label: 'Night Watch', timeRange: '23:00 – 07:00 MYT', hours: 8 },
    ],
    schedule: CONTINENTAL_8H_SCHEDULE,
  },
};

export const SHIFT_PATTERN_LIST: ShiftPatternDefinition[] = [
  SHIFT_PATTERNS['panama-12h'],
  SHIFT_PATTERNS['four-on-four-off-12h'],
  SHIFT_PATTERNS['continental-8h'],
];

export function createInitialProfiles(): OperatorProfile[] {
  return [
    // --- Existing core 8 leads & specialists (indices 0..7 preserved) ---
    {
      id: 'op-elena',
      name: 'Elena Vance',
      initials: 'EV',
      role: 'On-Call Lead',
      shiftTeam: 'Shift A',
      primarySite: 'kl1',
      email: 'elena.vance@orise-dc.io',
      phone: '+60 3-8312-4101',
      certifications: ['CDCP', 'Uptime ATD', 'Tier IV Ops'],
      avatarUrl: '/src/assets/images/avatar_noc_operator_1795158964720.jpg',
      isShiftLead: true,
      dutyOverride: 'auto',
    },
    {
      id: 'op-farid',
      name: 'Farid Hakim',
      initials: 'FH',
      role: 'MEP & Cooling Specialist',
      shiftTeam: 'Shift A',
      primarySite: 'kl1',
      email: 'farid.hakim@orise-dc.io',
      phone: '+60 3-8312-4102',
      certifications: ['CDCE', 'ASHRAE BEAP', 'Chiller Plant'],
      avatarUrl: '/src/assets/images/avatar_farid_hakim_1795171182883.jpg',
      isShiftLead: false,
      dutyOverride: 'auto',
    },
    {
      id: 'op-priya',
      name: 'Priya Nair',
      initials: 'PN',
      role: 'On-Call Lead',
      shiftTeam: 'Shift B',
      primarySite: 'kl2',
      email: 'priya.nair@orise-dc.io',
      phone: '+60 3-8312-4201',
      certifications: ['CDCS', 'ITIL v4', 'Incident Cmd'],
      avatarUrl: '/src/assets/images/avatar_priya_nair_1795171183977.jpg',
      isShiftLead: true,
      dutyOverride: 'auto',
    },
    {
      id: 'op-daniel',
      name: 'Daniel Tan',
      initials: 'DT',
      role: 'Power & Tier IV Engineer',
      shiftTeam: 'Shift B',
      primarySite: 'kl2',
      email: 'daniel.tan@orise-dc.io',
      phone: '+60 3-8312-4202',
      certifications: ['PE Electrical', '2N Switchgear', 'UPS 2(N+1)'],
      avatarUrl: '/src/assets/images/avatar_daniel_tan_1795429980768.jpg',
      isShiftLead: false,
      dutyOverride: 'auto',
    },
    {
      id: 'op-aisha',
      name: 'Aisha Rahman',
      initials: 'AR',
      role: 'On-Call Lead',
      shiftTeam: 'Shift C',
      primarySite: 'kl3',
      email: 'aisha.rahman@orise-dc.io',
      phone: '+60 3-8312-4301',
      certifications: ['CDCE', 'Tier IV Ops', 'ISO 22237'],
      avatarUrl: '/src/assets/images/avatar_aisha_rahman_1795171183922.jpg',
      isShiftLead: true,
      dutyOverride: 'auto',
    },
    {
      id: 'op-kenji',
      name: 'Kenji Sato',
      initials: 'KS',
      role: 'BMS Automation Engineer',
      shiftTeam: 'Shift C',
      primarySite: 'kl1',
      email: 'kenji.sato@orise-dc.io',
      phone: '+60 3-8312-4302',
      certifications: ['BACnet/IP', 'Modbus TCP', 'SCADA'],
      avatarUrl: '/src/assets/images/avatar_kenji_sato_1795429979652.jpg',
      isShiftLead: false,
      dutyOverride: 'auto',
    },
    {
      id: 'op-marcus',
      name: 'Marcus Chen',
      initials: 'MC',
      role: 'On-Call Lead',
      shiftTeam: 'Shift D',
      primarySite: 'kl3',
      email: 'marcus.chen@orise-dc.io',
      phone: '+60 3-8312-4401',
      certifications: ['CDCS', 'DRP Commander', 'HV Switching'],
      avatarUrl: '/src/assets/images/avatar_marcus_chen_1795171184401.jpg',
      isShiftLead: true,
      dutyOverride: 'auto',
    },
    {
      id: 'op-nurul',
      name: 'Nurul Izzah',
      initials: 'NI',
      role: 'AI Reliability Analyst',
      shiftTeam: 'Shift D',
      primarySite: 'kl2',
      email: 'nurul.izzah@orise-dc.io',
      phone: '+60 3-8312-4402',
      certifications: ['CDCP', 'Predictive RUL', 'ASHRAE A1'],
      avatarUrl: '/src/assets/images/avatar_nurul_izzah_1795429979360.jpg',
      isShiftLead: false,
      dutyOverride: 'auto',
    },

    // --- Additional KL1 · Cyberjaya Primary DCO Staff (total 8 at KL1: 2 per Shift A/B/C/D) ---
    {
      id: 'op-kl1-amir',
      name: 'Amirul Azman',
      initials: 'AA',
      role: 'Power & Tier IV Engineer',
      shiftTeam: 'Shift B',
      primarySite: 'kl1',
      email: 'amirul.azman@orise-dc.io',
      phone: '+60 3-8312-4103',
      certifications: ['CDCS', 'HV Switching', '2N UPS'],
      avatarUrl: '/src/assets/images/avatar_amirul_azman_1795429981009.jpg',
      isShiftLead: true,
      dutyOverride: 'auto',
    },
    {
      id: 'op-kl1-meiling',
      name: 'Mei Ling Chong',
      initials: 'MC',
      role: 'NOC Operations Engineer',
      shiftTeam: 'Shift B',
      primarySite: 'kl1',
      email: 'meiling.chong@orise-dc.io',
      phone: '+60 3-8312-4104',
      certifications: ['CDCP', 'CCNP DC', 'DCIM Ops'],
      avatarUrl: '/src/assets/images/avatar_meiling_chong_1795429980239.jpg',
      isShiftLead: false,
      dutyOverride: 'auto',
    },
    {
      id: 'op-kl1-hafiz',
      name: 'Hafizuddin Rosli',
      initials: 'HR',
      role: 'On-Call Lead',
      shiftTeam: 'Shift C',
      primarySite: 'kl1',
      email: 'hafizuddin.rosli@orise-dc.io',
      phone: '+60 3-8312-4105',
      certifications: ['CDCE', 'Tier IV Ops', 'Liquid CDU'],
      avatarUrl: '/src/assets/images/avatar_hafizuddin_rosli_1795429980891.jpg',
      isShiftLead: true,
      dutyOverride: 'auto',
    },
    {
      id: 'op-kl1-sharon',
      name: 'Sharon Lim',
      initials: 'SL',
      role: 'AI Reliability Analyst',
      shiftTeam: 'Shift D',
      primarySite: 'kl1',
      email: 'sharon.lim@orise-dc.io',
      phone: '+60 3-8312-4106',
      certifications: ['CDCP', 'Thermal CFD', 'GPU Fabric'],
      avatarUrl: '/src/assets/images/avatar_sharon_lim_1795429979887.jpg',
      isShiftLead: true,
      dutyOverride: 'auto',
    },
    {
      id: 'op-kl1-vikram',
      name: 'Vikram Subramaniam',
      initials: 'VS',
      role: 'NOC Operations Engineer',
      shiftTeam: 'Shift D',
      primarySite: 'kl1',
      email: 'vikram.subramaniam@orise-dc.io',
      phone: '+60 3-8312-4107',
      certifications: ['CDCP', 'ISO 27001', 'Smart Hands'],
      avatarUrl: '/src/assets/images/avatar_vikram_subra_1795429980243.jpg',
      isShiftLead: false,
      dutyOverride: 'auto',
    },

    // --- Additional KL2 · Bukit Jalil Core DCO Staff (total 8 at KL2: 2 per Shift A/B/C/D) ---
    {
      id: 'op-kl2-syafiq',
      name: 'Syafiq Abdullah',
      initials: 'SA',
      role: 'On-Call Lead',
      shiftTeam: 'Shift A',
      primarySite: 'kl2',
      email: 'syafiq.abdullah@orise-dc.io',
      phone: '+60 3-8312-4203',
      certifications: ['CDCE', 'Uptime AOS', 'Tier IV Ops'],
      avatarUrl: '/src/assets/images/avatar_syafiq_abdullah_1795430006189.jpg',
      isShiftLead: true,
      dutyOverride: 'auto',
    },
    {
      id: 'op-kl2-rachel',
      name: 'Rachel Wong',
      initials: 'RW',
      role: 'MEP & Cooling Specialist',
      shiftTeam: 'Shift A',
      primarySite: 'kl2',
      email: 'rachel.wong@orise-dc.io',
      phone: '+60 3-8312-4204',
      certifications: ['ASHRAE A1', 'Chiller Plant', 'CDCP'],
      avatarUrl: '/src/assets/images/avatar_rachel_wong_1795429983250.jpg',
      isShiftLead: false,
      dutyOverride: 'auto',
    },
    {
      id: 'op-kl2-arvind',
      name: 'Arvind Raj',
      initials: 'AR',
      role: 'BMS Automation Engineer',
      shiftTeam: 'Shift C',
      primarySite: 'kl2',
      email: 'arvind.raj@orise-dc.io',
      phone: '+60 3-8312-4205',
      certifications: ['BACnet/IP', 'PLC SCADA', 'CDCS'],
      avatarUrl: '/src/assets/images/avatar_arvind_raj_1795430008009.jpg',
      isShiftLead: true,
      dutyOverride: 'auto',
    },
    {
      id: 'op-kl2-hana',
      name: 'Hana Sofea',
      initials: 'HS',
      role: 'NOC Operations Engineer',
      shiftTeam: 'Shift C',
      primarySite: 'kl2',
      email: 'hana.sofea@orise-dc.io',
      phone: '+60 3-8312-4206',
      certifications: ['CDCP', 'ITIL v4', 'Fiber MMR'],
      avatarUrl: '/src/assets/images/avatar_hana_sofea_1795429980833.jpg',
      isShiftLead: false,
      dutyOverride: 'auto',
    },
    {
      id: 'op-kl2-jason',
      name: 'Jason Lau',
      initials: 'JL',
      role: 'Power & Tier IV Engineer',
      shiftTeam: 'Shift D',
      primarySite: 'kl2',
      email: 'jason.lau@orise-dc.io',
      phone: '+60 3-8312-4207',
      certifications: ['PE Electrical', 'DRP Cmd', 'Generator Sync'],
      avatarUrl: '/src/assets/images/avatar_jason_lau_1795429979886.jpg',
      isShiftLead: true,
      dutyOverride: 'auto',
    },

    // --- Additional KL3 · Shah Alam Edge DCO Staff (total 8 at KL3: 2 per Shift A/B/C/D) ---
    {
      id: 'op-kl3-zainab',
      name: 'Zainab Ismail',
      initials: 'ZI',
      role: 'On-Call Lead',
      shiftTeam: 'Shift A',
      primarySite: 'kl3',
      email: 'zainab.ismail@orise-dc.io',
      phone: '+60 3-8312-4303',
      certifications: ['CDCE', 'Tier IV Ops', 'Solar PV'],
      avatarUrl: '/src/assets/images/avatar_zainab_ismail_1795429982186.jpg',
      isShiftLead: true,
      dutyOverride: 'auto',
    },
    {
      id: 'op-kl3-kevin',
      name: 'Kevin Ooi',
      initials: 'KO',
      role: 'MEP & Cooling Specialist',
      shiftTeam: 'Shift A',
      primarySite: 'kl3',
      email: 'kevin.ooi@orise-dc.io',
      phone: '+60 3-8312-4304',
      certifications: ['CDCP', 'HVAC Chiller', 'BMS'],
      avatarUrl: '/src/assets/images/avatar_kevin_ooi_1795429980240.jpg',
      isShiftLead: false,
      dutyOverride: 'auto',
    },
    {
      id: 'op-kl3-nadia',
      name: 'Nadia Kamarudin',
      initials: 'NK',
      role: 'Power & Tier IV Engineer',
      shiftTeam: 'Shift B',
      primarySite: 'kl3',
      email: 'nadia.kamarudin@orise-dc.io',
      phone: '+60 3-8312-4305',
      certifications: ['CDCS', '2N Switchgear', 'Li-Ion BESS'],
      avatarUrl: '/src/assets/images/avatar_nadia_kamarudin_1795429979889.jpg',
      isShiftLead: true,
      dutyOverride: 'auto',
    },
    {
      id: 'op-kl3-wei',
      name: 'Wei Jie Teh',
      initials: 'WT',
      role: 'NOC Operations Engineer',
      shiftTeam: 'Shift B',
      primarySite: 'kl3',
      email: 'weijie.teh@orise-dc.io',
      phone: '+60 3-8312-4306',
      certifications: ['CDCP', 'Fiber Spine', 'Smart Hands'],
      avatarUrl: '/src/assets/images/avatar_weijie_teh_1795429980358.jpg',
      isShiftLead: false,
      dutyOverride: 'auto',
    },
    {
      id: 'op-kl3-deepak',
      name: 'Deepak Menon',
      initials: 'DM',
      role: 'BMS Automation Engineer',
      shiftTeam: 'Shift C',
      primarySite: 'kl3',
      email: 'deepak.menon@orise-dc.io',
      phone: '+60 3-8312-4307',
      certifications: ['Modbus TCP', 'BACnet/IP', 'ASHRAE A1'],
      avatarUrl: '/src/assets/images/avatar_deepak_menon_1795430046620.jpg',
      isShiftLead: false,
      dutyOverride: 'auto',
    },
    {
      id: 'op-kl3-siti',
      name: 'Siti Aisyah Yusof',
      initials: 'SY',
      role: 'AI Reliability Analyst',
      shiftTeam: 'Shift D',
      primarySite: 'kl3',
      email: 'siti.yusof@orise-dc.io',
      phone: '+60 3-8312-4308',
      certifications: ['CDCP', 'Predictive RUL', 'ISO 22237'],
      avatarUrl: '/src/assets/images/avatar_siti_aisyah_1795429980123.jpg',
      isShiftLead: false,
      dutyOverride: 'auto',
    },
  ];
}

export function createInitialShiftState(now: number): ShiftCycleState {
  const baseDate = new Date(now);
  const baseDateIso = baseDate.toISOString().slice(0, 10);

  return {
    patternId: 'panama-12h',
    cycleDayIndex: 0,
    activeSlotIndex: 0,
    baseDateIso,
    handoverLog: [
      {
        id: 'ho-init-1',
        timestamp: now - 12 * 3600 * 1000,
        siteId: 'kl1',
        patternId: 'panama-12h',
        cycleDayNumber: 14,
        outgoingTeam: 'Shift D',
        outgoingSlot: 'Night',
        outgoingOperatorName: 'Marcus Chen',
        incomingTeam: 'Shift A',
        incomingSlot: 'Day',
        incomingLeadName: 'Elena Vance',
        openCriticalCount: 1,
        openWarningCount: 2,
        sitePue: 1.32,
        slaCompliancePct: 100,
        notes:
          'Hall B GPU Row 01 running elevated thermal density; CRAC-B1/B2 locked in closed-loop auto. 2 Water Chillers + 6 Air Chillers balanced on Loop A/B with zero CHW drift.',
        checklistVerified: true,
      },
      {
        id: 'ho-init-2',
        timestamp: now - 24 * 3600 * 1000,
        siteId: 'kl2',
        patternId: 'panama-12h',
        cycleDayNumber: 14,
        outgoingTeam: 'Shift B',
        outgoingSlot: 'Day',
        outgoingOperatorName: 'Priya Nair',
        incomingTeam: 'Shift D',
        incomingSlot: 'Night',
        incomingLeadName: 'Marcus Chen',
        openCriticalCount: 0,
        openWarningCount: 1,
        sitePue: 1.30,
        slaCompliancePct: 100,
        notes:
          'Completed weekly Path A & Path B diesel generator unloaded test (15 min) with zero transfer alarms. All 160 Cold Aisle SLA sensors nominal within ASHRAE Class A1 envelope.',
        checklistVerified: true,
      },
      {
        id: 'ho-init-3',
        timestamp: now - 36 * 3600 * 1000,
        siteId: 'kl3',
        patternId: 'panama-12h',
        cycleDayNumber: 13,
        outgoingTeam: 'Shift C',
        outgoingSlot: 'Night',
        outgoingOperatorName: 'Aisha Rahman',
        incomingTeam: 'Shift B',
        incomingSlot: 'Day',
        incomingLeadName: 'Priya Nair',
        openCriticalCount: 0,
        openWarningCount: 0,
        sitePue: 1.31,
        slaCompliancePct: 100,
        notes:
          'KL3 Bukit Jalil steady state across Halls A–D. Predictive maintenance scheduled condenser coil cleaning for Air Chiller ACH-04 during next low-load window.',
        checklistVerified: true,
      },
    ],
  };
}

export interface ActiveShiftSnapshot {
  pattern: ShiftPatternDefinition;
  cycleDayNumber: number;
  activeSlot: ShiftSlotWindow;
  onDutyTeam: ShiftTeamId;
  nextSlot: ShiftSlotWindow;
  nextCycleDayIndex: number;
  nextSlotIndex: number;
  nextTeam: ShiftTeamId;
  standbyTeams: ShiftTeamId[];
  offTeams: ShiftTeamId[];
}

export function getTeamForDaySlot(
  pattern: ShiftPatternDefinition,
  cycleDayIndex: number,
  slot: Exclude<ShiftSlotType, 'Off'>
): ShiftTeamId {
  const safeDay = ((cycleDayIndex % pattern.cycleLengthDays) + pattern.cycleLengthDays) % pattern.cycleLengthDays;
  const row = pattern.schedule[safeDay];
  for (const team of SHIFT_TEAMS) {
    if (row[team] === slot) return team;
  }
  return 'Shift A';
}

export function getActiveShiftSnapshot(state: ShiftCycleState): ActiveShiftSnapshot {
  const pattern = SHIFT_PATTERNS[state.patternId];
  const safeDayIdx =
    ((state.cycleDayIndex % pattern.cycleLengthDays) + pattern.cycleLengthDays) %
    pattern.cycleLengthDays;
  const safeSlotIdx = Math.max(0, Math.min(state.activeSlotIndex, pattern.slots.length - 1));
  const activeSlot = pattern.slots[safeSlotIdx];
  const onDutyTeam = getTeamForDaySlot(pattern, safeDayIdx, activeSlot.slot);

  const nextSlotIndex = (safeSlotIdx + 1) % pattern.slots.length;
  const nextCycleDayIndex =
    nextSlotIndex === 0 ? (safeDayIdx + 1) % pattern.cycleLengthDays : safeDayIdx;
  const nextSlot = pattern.slots[nextSlotIndex];
  const nextTeam = getTeamForDaySlot(pattern, nextCycleDayIndex, nextSlot.slot);

  const dayRow = pattern.schedule[safeDayIdx];
  const standbyTeams = SHIFT_TEAMS.filter(
    (t) => t !== onDutyTeam && (t === nextTeam || dayRow[t] !== 'Off')
  );
  const offTeams = SHIFT_TEAMS.filter((t) => t !== onDutyTeam && !standbyTeams.includes(t));

  return {
    pattern,
    cycleDayNumber: safeDayIdx + 1,
    activeSlot,
    onDutyTeam,
    nextSlot,
    nextCycleDayIndex,
    nextSlotIndex,
    nextTeam,
    standbyTeams,
    offTeams,
  };
}

export function computeEffectiveDutyStatus(
  profile: OperatorProfile,
  state: ShiftCycleState
): EffectiveDutyStatus {
  if (profile.dutyOverride === 'On Leave') return 'On Leave';
  const snap = getActiveShiftSnapshot(state);
  if (profile.shiftTeam === snap.onDutyTeam) return 'On Duty';
  if (profile.dutyOverride === 'Standby' || profile.shiftTeam === snap.nextTeam) return 'Standby';
  return 'Off Duty';
}

export function buildShiftCycleCalendar(
  patternId: ShiftPatternId,
  currentCycleDayIndex: number,
  baseDateIso: string,
  daysToShow = 14
): ShiftCalendarDay[] {
  const pattern = SHIFT_PATTERNS[patternId];
  const startDate = new Date(`${baseDateIso}T00:00:00Z`);
  const safeCurrent =
    ((currentCycleDayIndex % pattern.cycleLengthDays) + pattern.cycleLengthDays) %
    pattern.cycleLengthDays;

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return Array.from({ length: daysToShow }, (_, i) => {
    const idx = (safeCurrent + i) % pattern.cycleLengthDays;
    const d = new Date(startDate.getTime() + i * 86400000);
    return {
      dayOffset: i,
      cycleDayNumber: idx + 1,
      dateLabel: `${months[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')}`,
      weekdayLabel: weekdays[d.getUTCDay()],
      assignments: { ...pattern.schedule[idx] },
      isCurrentCycleDay: i === 0,
    };
  });
}

export function computeTeamCycleStats(patternId: ShiftPatternId): Record<
  ShiftTeamId,
  { workDays: number; offDays: number; avgWeeklyHours: number }
> {
  const pattern = SHIFT_PATTERNS[patternId];
  const weeks = pattern.cycleLengthDays / 7;
  const result = {} as Record<
    ShiftTeamId,
    { workDays: number; offDays: number; avgWeeklyHours: number }
  >;

  for (const team of SHIFT_TEAMS) {
    let workDays = 0;
    for (const dayRow of pattern.schedule) {
      if (dayRow[team] !== 'Off') workDays += 1;
    }
    const offDays = pattern.cycleLengthDays - workDays;
    const avgWeeklyHours = Number(((workDays * pattern.shiftHours) / weeks).toFixed(1));
    result[team] = { workDays, offDays, avgWeeklyHours };
  }
  return result;
}

export function verifyPattern24x7Coverage(patternId: ShiftPatternId): {
  coveragePct: number;
  uncoveredSlots: number;
  doubleBookedDays: number;
} {
  const pattern = SHIFT_PATTERNS[patternId];
  const totalRequiredSlots = pattern.cycleLengthDays * pattern.slots.length;
  let coveredSlots = 0;
  let doubleBookedDays = 0;

  for (const dayRow of pattern.schedule) {
    const assignedSlots = new Map<ShiftSlotType, number>();
    for (const team of SHIFT_TEAMS) {
      const slot = dayRow[team];
      assignedSlots.set(slot, (assignedSlots.get(slot) ?? 0) + 1);
    }
    for (const required of pattern.slots) {
      const count = assignedSlots.get(required.slot) ?? 0;
      if (count >= 1) coveredSlots += 1;
      if (count > 1) doubleBookedDays += 1;
    }
  }

  return {
    coveragePct: Number(((coveredSlots / totalRequiredSlots) * 100).toFixed(1)),
    uncoveredSlots: totalRequiredSlots - coveredSlots,
    doubleBookedDays,
  };
}

export function validateNewProfileDraft(draft: NewProfileDraft): string | null {
  const trimmedName = draft.name.trim();
  if (trimmedName.length < 2) {
    return 'Enter the operator full name (at least 2 characters).';
  }
  const trimmedEmail = draft.email.trim();
  if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return 'Enter a valid corporate email address (e.g. name@orise-dc.io).';
  }
  if (!draft.phone.trim()) {
    return 'Enter an on-call contact phone number.';
  }
  return null;
}

export function deriveInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'OP';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function isValidAvatarUrl(url: string | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^\/src\/assets\/images\/[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$/.test(trimmed)) {
    return true;
  }
  if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return true;
  }
  if (/^https:\/\/[^\s]+$/.test(trimmed)) {
    return true;
  }
  return false;
}

export function updateProfileAvatar(
  profiles: OperatorProfile[],
  profileId: string,
  avatarUrl: string | undefined
): OperatorProfile[] {
  if (avatarUrl !== undefined && !isValidAvatarUrl(avatarUrl)) {
    return profiles;
  }
  const normalized = avatarUrl ? avatarUrl.trim() : undefined;
  return profiles.map((p) => (p.id === profileId ? { ...p, avatarUrl: normalized } : p));
}

export function createOperatorProfile(draft: NewProfileDraft, now: number): OperatorProfile {
  const certs = draft.certificationsText
    .split(/[,·]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const avatarUrl = isValidAvatarUrl(draft.avatarUrl) ? draft.avatarUrl?.trim() : undefined;

  return {
    id: `op-${now}-${Math.floor(Math.random() * 1000)}`,
    name: draft.name.trim(),
    initials: deriveInitials(draft.name),
    role: draft.role,
    shiftTeam: draft.shiftTeam,
    primarySite: draft.primarySite,
    email: draft.email.trim(),
    phone: draft.phone.trim(),
    certifications: certs.length > 0 ? certs : ['CDCP'],
    ...(avatarUrl ? { avatarUrl } : {}),
    isShiftLead: draft.isShiftLead,
    dutyOverride: 'auto',
  };
}

export function switchShiftPattern(
  state: ShiftCycleState,
  nextPatternId: ShiftPatternId
): ShiftCycleState {
  const nextPattern = SHIFT_PATTERNS[nextPatternId];
  return {
    ...state,
    patternId: nextPatternId,
    cycleDayIndex: state.cycleDayIndex % nextPattern.cycleLengthDays,
    activeSlotIndex: Math.min(state.activeSlotIndex, nextPattern.slots.length - 1),
  };
}

export interface ExecuteHandoverInput {
  state: ShiftCycleState;
  profiles: OperatorProfile[];
  activeOperator: OperatorProfile;
  siteId: SiteId;
  openCriticalCount: number;
  openWarningCount: number;
  sitePue: number;
  slaCompliancePct: number;
  notes: string;
  checklistVerified: boolean;
  now: number;
}

export function executeShiftHandover(input: ExecuteHandoverInput): {
  nextState: ShiftCycleState;
  incomingLead: OperatorProfile | null;
  entry: ShiftHandoverEntry;
} {
  const snap = getActiveShiftSnapshot(input.state);
  const incomingLead =
    input.profiles.find(
      (p) => p.shiftTeam === snap.nextTeam && p.isShiftLead && p.dutyOverride !== 'On Leave'
    ) ??
    input.profiles.find((p) => p.shiftTeam === snap.nextTeam && p.dutyOverride !== 'On Leave') ??
    null;

  const trimmedNotes = input.notes.trim();
  const entry: ShiftHandoverEntry = {
    id: `ho-${input.now}-${Math.floor(Math.random() * 1000)}`,
    timestamp: input.now,
    siteId: input.siteId,
    patternId: input.state.patternId,
    cycleDayNumber: snap.cycleDayNumber,
    outgoingTeam: snap.onDutyTeam,
    outgoingSlot: snap.activeSlot.slot,
    outgoingOperatorName: input.activeOperator.name,
    incomingTeam: snap.nextTeam,
    incomingSlot: snap.nextSlot.slot,
    incomingLeadName: incomingLead?.name ?? `${snap.nextTeam} Lead`,
    openCriticalCount: input.openCriticalCount,
    openWarningCount: input.openWarningCount,
    sitePue: Number(input.sitePue.toFixed(2)),
    slaCompliancePct: Number(input.slaCompliancePct.toFixed(1)),
    notes:
      trimmedNotes ||
      `Routine ${snap.activeSlot.slot} to ${snap.nextSlot.slot} shift handover completed with Tier IV 2N/2(N+1) plant verified.`,
    checklistVerified: input.checklistVerified,
  };

  return {
    nextState: {
      ...input.state,
      cycleDayIndex: snap.nextCycleDayIndex,
      activeSlotIndex: snap.nextSlotIndex,
      handoverLog: [entry, ...input.state.handoverLog].slice(0, 40),
    },
    incomingLead,
    entry,
  };
}

function escapeCsv(val: string | number): string {
  const s = String(val);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportShiftRosterToCsv(
  state: ShiftCycleState,
  profiles: OperatorProfile[]
): string {
  const pattern = SHIFT_PATTERNS[state.patternId];
  const calendar = buildShiftCycleCalendar(
    state.patternId,
    state.cycleDayIndex,
    state.baseDateIso,
    pattern.cycleLengthDays
  );

  const lines: string[] = [
    `# Orise DCIM — 24/7 Shift Cycle & Operator Roster (${pattern.name})`,
    ['Section', 'Date / ID', 'Shift Team / Name', 'Slot / Role', 'Site / Cycle Day', 'Status / Details']
      .map(escapeCsv)
      .join(','),
  ];

  for (const day of calendar) {
    for (const team of SHIFT_TEAMS) {
      lines.push(
        [
          'Shift Cycle',
          `${day.dateLabel} (${day.weekdayLabel})`,
          team,
          day.assignments[team],
          `Day ${day.cycleDayNumber}/${pattern.cycleLengthDays}`,
          day.isCurrentCycleDay ? 'Current Cycle Day' : 'Scheduled',
        ]
          .map(escapeCsv)
          .join(',')
      );
    }
  }

  for (const op of profiles) {
    lines.push(
      [
        'Operator Profile',
        op.id,
        op.name,
        `${op.role} (${op.shiftTeam})`,
        op.primarySite.toUpperCase(),
        `${computeEffectiveDutyStatus(op, state)} · ${op.certifications.join(' / ')}`,
      ]
        .map(escapeCsv)
        .join(',')
    );
  }

  return `\uFEFF${lines.join('\r\n')}`;
}

import { BmsState } from './bmsTypes';
import { SmartRackLock } from './enterpriseOpsEngine';
import { PowerChainNode } from './powerChainEngine';
import {
  interpolateSensorThermalColor,
  interpolateThermalColor,
  RackBmsSensorStat,
  RackThermalStat,
  ThermalColorSample,
} from './rackHeatmapEngine';
import { SiteId } from './sites';
import { HallId, RackDefinition } from './types';
import { VisitorRecord } from './visitorEngine';

export type HeatmapTimeHorizon = 'live' | '-1h' | '-6h' | '-24h' | 'delta1h';

export type WorkspaceRole =
  | 'noc_operator'
  | 'facilities_engineer'
  | 'security_officer'
  | 'colocation_tenant';

export interface WorkspaceRoleConfig {
  id: WorkspaceRole;
  label: string;
  shortLabel: string;
  description: string;
  canSimulateFaults: boolean;
  canControlBms: boolean;
  canManageSecurity: boolean;
  allowedTabs: string[] | 'all';
  defaultTenantName?: string;
}

export const WORKSPACE_ROLES: WorkspaceRoleConfig[] = [
  {
    id: 'noc_operator',
    label: 'NOC Shift Operator',
    shortLabel: 'NOC Ops',
    description: 'Full 24/7 operational visibility, alert triage, ticketing, and incident drills.',
    canSimulateFaults: true,
    canControlBms: true,
    canManageSecurity: true,
    allowedTabs: 'all',
  },
  {
    id: 'facilities_engineer',
    label: 'Facilities & MEP Engineer',
    shortLabel: 'Facilities',
    description: 'Focuses on BMS cooling, SLD power chain, capacity planning, CMMS, and ESG.',
    canSimulateFaults: true,
    canControlBms: true,
    canManageSecurity: false,
    allowedTabs: [
      'global-noc',
      'overview',
      'racks',
      'twin3d',
      'bms',
      'ai',
      'alerts',
      'reports',
      'sld',
      'capacity',
      'esg',
      'cmms',
      'tickets',
      'system',
    ],
  },
  {
    id: 'security_officer',
    label: 'Physical Security Officer',
    shortLabel: 'Security',
    description: 'Manages visitor badges, smart rack locks, door alarms, and audit logs.',
    canSimulateFaults: false,
    canControlBms: false,
    canManageSecurity: true,
    allowedTabs: ['global-noc', 'overview', 'racks', 'alerts', 'visitors', 'security', 'tickets', 'system'],
  },
  {
    id: 'colocation_tenant',
    label: 'Colocation Tenant Portal',
    shortLabel: 'Tenant',
    description: 'Read-only customer scope for Aether AI Cloud cages, kWh billing, and visitors.',
    canSimulateFaults: false,
    canControlBms: false,
    canManageSecurity: false,
    allowedTabs: ['tenants', 'racks', 'visitors', 'tickets', 'reports'],
    defaultTenantName: 'Aether AI Cloud',
  },
];

export function getWorkspaceRoleConfig(role: WorkspaceRole): WorkspaceRoleConfig {
  return WORKSPACE_ROLES.find((r) => r.id === role) ?? WORKSPACE_ROLES[0];
}

export interface SecurityThermalCorrelation {
  id: string;
  rackId: string;
  hallId: HallId;
  rowNumber: number;
  lockState: SmartRackLock['lockState'];
  actorName: string;
  rackTempC: number;
  bmsSensorTempC: number;
  tempDeltaC: number;
  severity: 'warning' | 'critical';
  summary: string;
}

export interface SldBlastHighlight {
  sourceNodeId: string;
  sourceLabel: string;
  busLabel: 'Path A' | 'Path B' | 'Dual A+B';
  hallIds: HallId[];
  severity: 'degraded' | 'critical';
  summary: string;
}

export interface UrlWorkspaceParams {
  siteId?: SiteId;
  tab?: string;
  hallId?: HallId;
  rackId?: string;
  sensorHeatmap?: boolean;
  serverId?: string;
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

/**
 * Deterministic historical thermal offset per rack for time-scrub playback (-1h, -6h, -24h).
 * Captures diurnal load curves (cooler overnight at -6h, warmer peak at -1h/-24h) plus subtle spatial drift.
 */
export function computeHistoricalRackOffsetC(
  rack: RackDefinition,
  horizon: HeatmapTimeHorizon,
  isSensorMode: boolean
): number {
  if (horizon === 'live') return 0;
  const phase = (rack.rowNumber * 1.7 + rack.rackIndex * 0.9) % 6.283;
  const spatialWave = Math.sin(phase) * (isSensorMode ? 0.55 : 2.1);

  if (horizon === '-1h') {
    const baseDrift = isSensorMode ? -0.6 : -2.4;
    const hotspotCreep = rack.rowNumber <= 4 && rack.rackIndex <= 8 ? (isSensorMode ? -0.8 : -3.2) : 0;
    return round1(baseDrift + hotspotCreep + spatialWave * 0.6);
  }
  if (horizon === '-6h') {
    // Overnight lower IT load -> noticeably cooler 6 hours ago
    const baseDrift = isSensorMode ? -1.4 : -6.2;
    return round1(baseDrift + spatialWave);
  }
  if (horizon === '-24h') {
    // Similar diurnal phase yesterday with mild variance
    const baseDrift = isSensorMode ? -0.3 : -1.4;
    return round1(baseDrift + spatialWave * 0.85);
  }
  return 0;
}

/**
 * Computes the effective per-rack scalar map for the active heatmap horizon:
 * - 'live' | '-1h' | '-6h' | '-24h' => absolute temperature (°C)
 * - 'delta1h' => signed temperature change (°C) = currentLiveTemp - temp1hAgo
 */
export function computeHorizonRackValues(
  racks: RackDefinition[],
  thermalStats: Record<string, RackThermalStat>,
  sensorStats: Record<string, RackBmsSensorStat>,
  horizon: HeatmapTimeHorizon,
  isSensorMode: boolean
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const rack of racks) {
    const liveVal = isSensorMode
      ? sensorStats[rack.id]?.sensorTempC ?? 20.5
      : thermalStats[rack.id]?.avgTempC ?? rack.basePeakTempC - 3.5;

    if (horizon === 'live') {
      result[rack.id] = round1(liveVal);
    } else if (horizon === 'delta1h') {
      const offset1h = computeHistoricalRackOffsetC(rack, '-1h', isSensorMode);
      const past1h = liveVal + offset1h;
      result[rack.id] = round1(liveVal - past1h);
    } else {
      const offset = computeHistoricalRackOffsetC(rack, horizon, isSensorMode);
      result[rack.id] = round1(Math.max(isSensorMode ? 14 : 24, liveVal + offset));
    }
  }
  return result;
}

// Diverging thermal drift ramp for Δ vs 1h Ago (-5°C Cooling Blue -> 0°C Neutral Slate -> +5°C Warming Crimson)
const DELTA_STOPS = [
  { t: 0.0, r: 2, g: 132, b: 199 },   // -maxDelta Cool Blue
  { t: 0.25, r: 56, g: 189, b: 248 }, // Mild cooling Cyan
  { t: 0.5, r: 100, g: 116, b: 139 }, // 0°C Neutral Slate
  { t: 0.75, r: 245, g: 158, b: 11 }, // Mild warming Amber
  { t: 1.0, r: 220, g: 38, b: 38 },   // +maxDelta Rapid Warming Red
];

function toHexByte(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
}

export function interpolateDeltaThermalColor(
  deltaC: number,
  rangeMinC: number = -5,
  rangeMaxC: number = 5
): ThermalColorSample {
  const span = Math.max(2, rangeMaxC - rangeMinC);
  const normalized = Math.max(0, Math.min(1, (deltaC - rangeMinC) / span));

  let lower = DELTA_STOPS[0];
  let upper = DELTA_STOPS[DELTA_STOPS.length - 1];
  for (let i = 0; i < DELTA_STOPS.length - 1; i++) {
    const a = DELTA_STOPS[i];
    const b = DELTA_STOPS[i + 1];
    if (normalized >= a.t && normalized <= b.t) {
      lower = a;
      upper = b;
      break;
    }
  }
  const f = Math.max(0, Math.min(1, (normalized - lower.t) / Math.max(0.0001, upper.t - lower.t)));
  const r = Math.round(lower.r + (upper.r - lower.r) * f);
  const g = Math.round(lower.g + (upper.g - lower.g) * f);
  const b = Math.round(lower.b + (upper.b - lower.b) * f);

  return {
    r,
    g,
    b,
    hex: `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`,
    rgb: `rgb(${r}, ${g}, ${b})`,
    rgba: (alpha: number) => `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`,
    normalized,
    band: deltaC >= 3 ? 'Critical' : deltaC >= 1.5 ? 'Warm' : deltaC <= -1.5 ? 'Cool' : 'Nominal',
    contrastText: 'text-white',
  };
}

export function getDeltaLegendGradientCss(): string {
  return `linear-gradient(90deg, ${DELTA_STOPS.map(
    (s) => `rgb(${s.r}, ${s.g}, ${s.b}) ${Math.round(s.t * 100)}%`
  ).join(', ')})`;
}

export function pickHeatmapColorSample(
  value: number,
  minC: number,
  maxC: number,
  horizon: HeatmapTimeHorizon,
  isSensorMode: boolean
): ThermalColorSample {
  if (horizon === 'delta1h') {
    return interpolateDeltaThermalColor(value, minC, maxC);
  }
  if (isSensorMode) {
    return interpolateSensorThermalColor(value, minC, maxC);
  }
  return interpolateThermalColor(value, minC, maxC);
}

/**
 * Correlates physical cabinet door-open / unlocked states & active on-site visitors
 * with live rack server temperatures and BMS cold-aisle sensor telemetry.
 */
export function computeSecurityThermalCorrelations(
  locks: SmartRackLock[],
  visitors: VisitorRecord[],
  siteId: SiteId,
  thermalStats: Record<string, RackThermalStat>,
  sensorStats: Record<string, RackBmsSensorStat>
): SecurityThermalCorrelation[] {
  const checkedInVisitors = visitors.filter(
    (v) => v.siteId === siteId && v.status === 'Checked In'
  );
  const correlations: SecurityThermalCorrelation[] = [];

  for (const lock of locks) {
    if (lock.siteId !== siteId) continue;
    const isDoorIssue =
      lock.lockState === 'Door Open Alarm' ||
      lock.lockState === 'Unlocked' ||
      !lock.frontDoorClosed ||
      !lock.rearDoorClosed;

    if (!isDoorIssue) continue;

    const normalizedRackId = lock.rackId.replace(/^KL\d-/i, '');
    const therm = thermalStats[normalizedRackId] ?? thermalStats[lock.rackId];
    const sensor = sensorStats[normalizedRackId] ?? sensorStats[lock.rackId];
    const hallPrefix = normalizedRackId.charAt(0).toLowerCase();
    const hallId: HallId =
      hallPrefix === 'a'
        ? 'hall-a'
        : hallPrefix === 'b'
        ? 'hall-b'
        : hallPrefix === 'c'
        ? 'hall-c'
        : 'hall-d';
    const rowMatch = normalizedRackId.match(/-R(\d{2})-/);
    const rowNumber = rowMatch ? Number(rowMatch[1]) : 1;

    const rackTempC = therm?.avgTempC ?? 54.0;
    const bmsSensorTempC = sensor?.sensorTempC ?? 21.0;
    const matchedVisitor = checkedInVisitors.find((v) =>
      (v.accessZones ?? []).some((z) => {
        const lower = z.toLowerCase();
        return lower.includes(`hall ${hallPrefix}`) || lower.includes(`hall-${hallPrefix}`);
      })
    );

    const isCritical =
      lock.lockState === 'Door Open Alarm' ||
      lock.rackTempDeltaC >= 2.0 ||
      rackTempC >= 65 ||
      sensor?.slaStatus === 'Breached';

    const doorLabel =
      lock.lockState === 'Door Open Alarm'
        ? 'Door open alarm'
        : !lock.frontDoorClosed || !lock.rearDoorClosed
        ? 'Cabinet door ajar'
        : 'Smart lock unlocked';

    const visitorSuffix = matchedVisitor
      ? ` · Contractor ${matchedVisitor.fullName} (${matchedVisitor.badgeNumber ?? matchedVisitor.id}) in zone`
      : '';

    correlations.push({
      id: `corr-${lock.id}`,
      rackId: normalizedRackId,
      hallId,
      rowNumber,
      lockState: lock.lockState,
      actorName: lock.lastBadgeUser,
      rackTempC: round1(rackTempC),
      bmsSensorTempC: round1(bmsSensorTempC),
      tempDeltaC: round1(lock.rackTempDeltaC),
      severity: isCritical ? 'critical' : 'warning',
      summary: `${doorLabel} on ${normalizedRackId} (+${lock.rackTempDeltaC.toFixed(1)}°C intake drift, Avg ${rackTempC.toFixed(1)}°C)${visitorSuffix}`,
    });
  }

  return correlations;
}

/**
 * Maps an SLD node (Utility, Generator, ATS, UPS, PDU, Busway, or Hall rPDU)
 * to the impacted halls & rack blast-radius highlight descriptor for RackMapView.
 */
export function resolveSldBlastHighlight(node: PowerChainNode): SldBlastHighlight {
  let hallIds: HallId[] = ['hall-a', 'hall-b', 'hall-c', 'hall-d'];
  if (node.hallId) hallIds = [node.hallId];
  else if (node.id === 'rpdu-hall-a') hallIds = ['hall-a'];
  else if (node.id === 'rpdu-hall-b') hallIds = ['hall-b'];
  else if (node.id === 'rpdu-hall-c') hallIds = ['hall-c'];
  else if (node.id === 'rpdu-hall-d') hallIds = ['hall-d'];

  const busLabel: 'Path A' | 'Path B' | 'Dual A+B' =
    node.feed === 'A' ? 'Path A' : node.feed === 'B' ? 'Path B' : 'Dual A+B';

  const severity: 'degraded' | 'critical' =
    node.state === 'tripped' || node.state === 'de_energized' ? 'critical' : 'degraded';

  const hallText =
    hallIds.length === 4
      ? 'All 4 Data Halls (1,600 racks)'
      : `${hallIds[0].replace('hall-', 'Hall ').toUpperCase()} (400 racks)`;

  const summary =
    severity === 'critical'
      ? `${node.label} (${busLabel}) OPEN/FAULT — ${hallText} running on single-feed failover or impacted bus.`
      : `${node.label} (${busLabel}) trace active — highlighting ${hallText} downstream distribution path.`;

  return {
    sourceNodeId: node.id,
    sourceLabel: node.label,
    busLabel,
    hallIds,
    severity,
    summary,
  };
}

/**
 * Exports the active hall's 400-rack thermal & BMS environment sensor snapshot as RFC-4180 CSV.
 */
export function buildHallThermalCsv(
  hallLabel: string,
  racks: RackDefinition[],
  thermalStats: Record<string, RackThermalStat>,
  sensorStats: Record<string, RackBmsSensorStat>,
  bms: BmsState
): string {
  const header = [
    'Rack ID',
    'Hall',
    'Row',
    'Rack Index',
    'Avg Server Temp (C)',
    'Min Server Temp (C)',
    'Max Server Temp (C)',
    'Server Thermal Band',
    'BMS Sensor Temp (C)',
    'BMS Humidity (%)',
    'Dew Point (C)',
    'ASHRAE SLA Status',
    'Nearest BMS Probe',
    'Probe Path',
    'Mounted Probe Slot',
    'Delta-T Exhaust vs Intake (C)',
    'Hall Cold Aisle Setpoint (C)',
  ].join(',');

  const lines: string[] = [header];
  for (const rack of racks) {
    const t = thermalStats[rack.id];
    const s = sensorStats[rack.id];
    const crac = bms.cracUnits.find((c) => c.hallId === rack.hallId);
    const avgT = t?.avgTempC ?? rack.basePeakTempC - 3.5;
    const sensorT = s?.sensorTempC ?? 20.5;
    const deltaT = round1(avgT - sensorT);

    lines.push(
      [
        rack.id,
        `"${hallLabel}"`,
        `R${String(rack.rowNumber).padStart(2, '0')}`,
        rack.rackIndex,
        avgT.toFixed(1),
        (t?.minTempC ?? avgT - 3).toFixed(1),
        (t?.maxTempC ?? rack.basePeakTempC).toFixed(1),
        t?.band ?? 'Nominal',
        sensorT.toFixed(1),
        (s?.humidityPct ?? 46).toFixed(1),
        (s?.dewPointC ?? 9.0).toFixed(1),
        s?.slaStatus ?? 'Compliant',
        s?.nearestProbeId ?? 'SLA-CA',
        s?.redundancyPath ?? 'Path A',
        s?.probeMountSlot ?? 'Interpolated',
        deltaT.toFixed(1),
        (crac?.setpointC ?? 20.0).toFixed(1),
      ].join(',')
    );
  }

  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/**
 * Parses URL query parameters (?site=kl1&tab=racks&hall=hall-b&rack=B-R01-01&sensor=1)
 * for shareable deep links.
 */
export function parseUrlWorkspaceParams(search: string): UrlWorkspaceParams {
  const params = new URLSearchParams(search);
  const out: UrlWorkspaceParams = {};

  const site = params.get('site');
  if (site === 'kl1' || site === 'kl2' || site === 'kl3') {
    out.siteId = site;
  }
  const tab = params.get('tab');
  if (tab && /^[a-z0-9_-]{2,24}$/i.test(tab)) {
    out.tab = tab;
  }
  const hall = params.get('hall');
  if (hall === 'hall-a' || hall === 'hall-b' || hall === 'hall-c' || hall === 'hall-d') {
    out.hallId = hall;
  }
  const rack = params.get('rack');
  if (rack && /^[A-D]-R\d{2}-\d{2}$/.test(rack)) {
    out.rackId = rack;
  }
  const sensor = params.get('sensor');
  if (sensor === '1' || sensor === 'true') {
    out.sensorHeatmap = true;
  } else if (sensor === '0' || sensor === 'false') {
    out.sensorHeatmap = false;
  }
  const server = params.get('server');
  if (server && /^[a-z0-9_-]{2,48}$/i.test(server)) {
    out.serverId = server;
  }
  return out;
}

export function buildUrlWorkspaceSearch(params: UrlWorkspaceParams): string {
  const sp = new URLSearchParams();
  if (params.siteId) sp.set('site', params.siteId);
  if (params.tab) sp.set('tab', params.tab);
  if (params.tab === 'racks') {
    if (params.hallId) sp.set('hall', params.hallId);
    if (params.rackId) sp.set('rack', params.rackId);
    if (params.sensorHeatmap) sp.set('sensor', '1');
  }
  if (params.serverId) sp.set('server', params.serverId);
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

const STORAGE_PREFIX = 'orise_dcim_v1_';

export function readPersistedJson<T>(key: string, fallback: T): T {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback;
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writePersistedJson<T>(key: string, value: T): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // Ignore quota / private mode failures cleanly
  }
}

export function clearAllPersistedWorkspaceState(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      window.localStorage.removeItem(k);
    }
  } catch {
    // Ignore
  }
}

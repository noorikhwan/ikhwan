import { createInitialBmsState } from './bmsEngine';
import { BmsState } from './bmsTypes';
import {
  INITIAL_ALERT_RULES,
  INITIAL_CHANNELS,
  INITIAL_RACKS,
  createInitialAlerts,
  createInitialDispatchLogs,
  createInitialFacilityHistory,
  createInitialServers,
} from './seedData';
import { createDefaultHallThermalPolicies } from './hallThermalPolicyEngine';
import { createDefaultHallPowerPolicies } from './rackPowerEngine';
import { evaluateRackPowerCapacityAlerts } from './telemetryEngine';
import {
  ActiveAlert,
  AlertRule,
  DispatchLogEntry,
  FacilityTelemetryPoint,
  HallPowerPolicyMap,
  HallThermalPolicyMap,
  NotificationChannel,
  ServerNode,
} from './types';

export type SiteId = 'kl1' | 'kl2' | 'kl3';

export interface SiteMeta {
  id: SiteId;
  code: 'KL1' | 'KL2' | 'KL3';
  label: string;
  location: string;
  tierLabel: string;
  ipPrefix: number;
}

export const SITES: SiteMeta[] = [
  {
    id: 'kl1',
    code: 'KL1',
    label: 'KL1 · Cyberjaya Primary',
    location: 'Cyberjaya, MY',
    tierLabel: 'KL1 · TIER IV CERTIFIED',
    ipPrefix: 40,
  },
  {
    id: 'kl2',
    code: 'KL2',
    label: 'KL2 · Bukit Jalil Core',
    location: 'Bukit Jalil, MY',
    tierLabel: 'KL2 · TIER IV CERTIFIED',
    ipPrefix: 50,
  },
  {
    id: 'kl3',
    code: 'KL3',
    label: 'KL3 · Shah Alam Edge',
    location: 'Shah Alam, MY',
    tierLabel: 'KL3 · TIER IV CERTIFIED',
    ipPrefix: 60,
  },
];

export const SITE_META_MAP: Record<SiteId, SiteMeta> = {
  kl1: SITES[0],
  kl2: SITES[1],
  kl3: SITES[2],
};

export interface SiteWorkspaceState {
  siteId: SiteId;
  servers: ServerNode[];
  bms: BmsState;
  alerts: ActiveAlert[];
  dispatchLogs: DispatchLogEntry[];
  rules: AlertRule[];
  channels: NotificationChannel[];
  facilityHistory: FacilityTelemetryPoint[];
  rackPowerAdjustmentsKw: Record<string, number>;
  hallPowerPolicies: HallPowerPolicyMap;
  hallThermalPolicies: HallThermalPolicyMap;
}

function adaptHostname(hostname: string, siteId: SiteId): string {
  return hostname.replace(/\.orise$/, `.${siteId}.orise`);
}

function adaptIp(ip: string, targetSecondOctet: number): string {
  const parts = ip.split('.');
  if (parts.length !== 4) return ip;
  const origSecond = Number(parts[1]);
  const hallOffset = Number.isFinite(origSecond) ? origSecond - 40 : 0;
  return `${parts[0]}.${targetSecondOctet + hallOffset}.${parts[2]}.${parts[3]}`;
}

export function createSiteWorkspaceState(siteId: SiteId, now = Date.now()): SiteWorkspaceState {
  const meta = SITE_META_MAP[siteId];
  const baseServers = createInitialServers(now);

  // Customize telemetry profiles per site so KL1, KL2, KL3 feel authentically distinct while sharing full functionality
  const servers: ServerNode[] = baseServers.map((srv) => {
    const hostname = adaptHostname(srv.hostname, siteId);
    const ip = adaptIp(srv.ip, meta.ipPrefix);

    if (siteId === 'kl1') {
      return { ...srv, hostname, ip };
    }

    if (siteId === 'kl2') {
      // KL2: High-utilization AI core with nominal thermals (no critical thermal fault on boot), elevated CPU on hyp-a01-v01
      const isHotGpu = srv.id === 'srv-b01-01';
      const isWarnHyp = srv.id === 'srv-a01-03';
      const isWarnMem = srv.id === 'srv-b02-02';
      const cpu = isWarnHyp ? 84.6 : Number(Math.min(92, srv.cpu + 4.2).toFixed(1));
      const tempC = isHotGpu ? 65.2 : Number(Math.max(36, srv.tempC - 2.1).toFixed(1));
      const powerW = Math.round(srv.powerW * 1.07);
      const memory = isWarnMem ? 78.4 : Number(Math.min(84, srv.memory + 1.5).toFixed(1));
      const status =
        srv.status === 'maintenance'
          ? 'maintenance'
          : isWarnHyp
          ? 'warning'
          : 'nominal';
      return {
        ...srv,
        hostname,
        ip,
        cpu,
        memory,
        tempC,
        powerW,
        status,
        activeFault: null,
        history: srv.history.map((pt) => ({
          ...pt,
          cpu: Number(Math.min(95, pt.cpu + 4.2).toFixed(1)),
          tempC: isHotGpu ? Number((pt.tempC - 16.0).toFixed(1)) : Number(Math.max(34, pt.tempC - 2.1).toFixed(1)),
          powerW: Math.round(pt.powerW * 1.07),
        })),
      };
    }

    // KL3: Storage & Edge campus with lower average load, 1 warning on GPU B02 memory & 1 critical on GPU B02 thermal
    const isKl3Crit = srv.id === 'srv-b02-01';
    const isKl1Hot = srv.id === 'srv-b01-01';
    const isKl1Hyp = srv.id === 'srv-a01-03';
    const tempC = isKl3Crit
      ? 79.6
      : isKl1Hot
      ? 58.4
      : Number(Math.max(34, srv.tempC - 4.4).toFixed(1));
    const cpu = isKl1Hyp ? 62.4 : Number(Math.max(12, srv.cpu - 5.2).toFixed(1));
    const powerW = Math.round(srv.powerW * 0.91);
    const status =
      srv.status === 'maintenance'
        ? 'maintenance'
        : isKl3Crit
        ? 'critical'
        : srv.id === 'srv-b02-02'
        ? 'warning'
        : 'nominal';

    return {
      ...srv,
      hostname,
      ip,
      cpu,
      tempC,
      powerW,
      status,
      activeFault: isKl3Crit ? 'thermal_spike' : null,
      history: srv.history.map((pt) => ({
        ...pt,
        cpu: Number(Math.max(10, pt.cpu - 5.2).toFixed(1)),
        tempC: isKl3Crit ? Number((pt.tempC + 18.5).toFixed(1)) : Number(Math.max(33, pt.tempC - 4.4).toFixed(1)),
        powerW: Math.round(pt.powerW * 0.91),
      })),
    };
  });

  const baseBms = createInitialBmsState(now);
  const chillerLoadScale = siteId === 'kl2' ? 1.07 : siteId === 'kl3' ? 0.91 : 1;
  const bms: BmsState = {
    ...baseBms,
    chillers: baseBms.chillers.map((ch) => ({
      ...ch,
      endpoint: adaptIp(ch.endpoint, meta.ipPrefix + 20),
      coolingOutputKw:
        ch.mode === 'Standby' ? 0 : Number((ch.coolingOutputKw * chillerLoadScale).toFixed(1)),
      compressorLoadPct:
        ch.mode === 'Standby' ? 0 : Math.min(92, Math.round(ch.compressorLoadPct * chillerLoadScale)),
    })),
    cracUnits: baseBms.cracUnits.map((c) => {
      const isKl2HallB = siteId === 'kl2' && c.hallId === 'hall-b';
      return {
        ...c,
        endpoint: adaptIp(c.endpoint, meta.ipPrefix + 20),
        mode: isKl2HallB ? 'Auto' : c.mode,
        status: isKl2HallB ? 'nominal' : c.status,
        fanSpeedPct: isKl2HallB ? 66 : c.fanSpeedPct,
        coolingOutputKw: isKl2HallB ? 2480.0 : c.coolingOutputKw,
      };
    }),
    upsSystems: baseBms.upsSystems.map((u) => ({
      ...u,
      endpoint: adaptIp(u.endpoint, meta.ipPrefix + 20),
      loadKw: Number((u.loadKw * (siteId === 'kl2' ? 1.08 : siteId === 'kl3' ? 0.9 : 1)).toFixed(1)),
    })),
    generators: baseBms.generators.map((g) => ({
      ...g,
      endpoint: adaptIp(g.endpoint, meta.ipPrefix + 20),
    })),
    gateways: baseBms.gateways.map((gw) => ({
      ...gw,
      name: `${meta.code} ${gw.name}`,
      endpoint: adaptIp(gw.endpoint, meta.ipPrefix + 20),
    })),
    commandLog: baseBms.commandLog.map((entry) => ({
      ...entry,
      id: `${siteId}-${entry.id}`,
      command: `[${meta.code}] ${entry.command}`,
    })),
  };

  let alerts: ActiveAlert[];
  if (siteId === 'kl1') {
    alerts = createInitialAlerts(now).map((a) => ({
      ...a,
      id: `kl1-${a.id}`,
      serverHostname: adaptHostname(a.serverHostname, 'kl1'),
    }));
  } else if (siteId === 'kl2') {
    alerts = [
      {
        id: 'kl2-alt-2001',
        ruleId: 'rule-cpu-warn',
        ruleName: 'Elevated CPU Workload',
        serverId: 'srv-a01-03',
        serverHostname: 'hyp-a01-v01.kl2.orise',
        rackId: 'A-R01-01',
        metric: 'cpu',
        currentValue: 84.6,
        threshold: 80,
        operator: '>=',
        severity: 'warning',
        state: 'active',
        triggeredAt: now - 1000 * 60 * 8,
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolvedAt: null,
        dispatchedChannelNames: ['Slack #dc-ops-alerts'],
        message: 'CPU Utilization reached 84.6% (threshold >= 80%)',
      },
    ];
  } else {
    alerts = [
      {
        id: 'kl3-alt-3001',
        ruleId: 'rule-thermal-crit',
        ruleName: 'Critical Exhaust Thermal Threshold',
        serverId: 'srv-b02-01',
        serverHostname: 'gpu-b02-x04.kl3.orise',
        rackId: 'B-R01-02',
        metric: 'tempC',
        currentValue: 79.6,
        threshold: 78,
        operator: '>=',
        severity: 'critical',
        state: 'active',
        triggeredAt: now - 1000 * 60 * 4,
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolvedAt: null,
        dispatchedChannelNames: ['PagerDuty NOC Primary', 'Slack #dc-ops-alerts', 'Automation Runbook Webhook'],
        message: 'Exhaust Temperature reached 79.6°C (threshold >= 78°C)',
      },
      {
        id: 'kl3-alt-3002',
        ruleId: 'rule-mem-warn',
        ruleName: 'High Memory Pressure',
        serverId: 'srv-b02-02',
        serverHostname: 'gpu-b02-x05.kl3.orise',
        rackId: 'B-R01-02',
        metric: 'memory',
        currentValue: 88.4,
        threshold: 86,
        operator: '>=',
        severity: 'warning',
        state: 'acknowledged',
        triggeredAt: now - 1000 * 60 * 19,
        acknowledgedAt: now - 1000 * 60 * 12,
        acknowledgedBy: 'Elena Vance',
        resolvedAt: null,
        dispatchedChannelNames: ['Slack #dc-ops-alerts', 'Facilities Thermal Digest'],
        message: 'Memory Utilization reached 88.4% (threshold >= 86%)',
      },
    ];
  }

  const channels = INITIAL_CHANNELS.map((c) => ({ ...c }));
  const hallPowerPolicies = createDefaultHallPowerPolicies();
  const hallThermalPolicies = createDefaultHallThermalPolicies();
  const rackCapEval = evaluateRackPowerCapacityAlerts({
    racks: INITIAL_RACKS,
    bms,
    servers,
    existingAlerts: alerts,
    channels,
    now,
    siteCode: meta.code,
    hallPowerPolicies,
    hallThermalPolicies,
  });

  const dispatchLogs: DispatchLogEntry[] = [
    ...rackCapEval.newDispatches,
    ...createInitialDispatchLogs(now).map((entry) => ({
      ...entry,
      id: `${siteId}-${entry.id}`,
      serverHostname: adaptHostname(entry.serverHostname, siteId),
      summary: `[${meta.code}] ${entry.summary}`,
    })),
  ].slice(0, 120);

  return {
    siteId,
    servers,
    bms,
    alerts: rackCapEval.alerts,
    dispatchLogs,
    rules: INITIAL_ALERT_RULES.map((r) => ({ ...r })),
    channels: rackCapEval.updatedChannels,
    facilityHistory: createInitialFacilityHistory(servers, now),
    rackPowerAdjustmentsKw: {},
    hallPowerPolicies,
    hallThermalPolicies,
  };
}

export function createAllSitesInitialState(now = Date.now()): Record<SiteId, SiteWorkspaceState> {
  return {
    kl1: createSiteWorkspaceState('kl1', now),
    kl2: createSiteWorkspaceState('kl2', now),
    kl3: createSiteWorkspaceState('kl3', now),
  };
}

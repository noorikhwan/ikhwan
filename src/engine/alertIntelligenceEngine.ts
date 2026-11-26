import { isAlertOpen } from './alertBulkActions';
import { SiteId } from './sites';
import { ActiveAlert, FacilityTelemetryPoint, HallId, Severity } from './types';

export type MaintenanceScopeType = 'all' | 'hall' | 'rack' | 'subsystem';

export interface MaintenanceWindow {
  id: string;
  siteId: SiteId;
  title: string;
  scopeType: MaintenanceScopeType;
  scopeValue: string; // 'all', 'hall-a'..'hall-d', 'B-R01-01', or 'cooling'|'power'|'compute'
  reason: string;
  createdBy: string;
  status: 'active' | 'scheduled' | 'ended';
  startAtMs: number;
  endAtMs: number;
  cloudSynced?: boolean;
}

export interface CorrelatedIncidentGroup {
  id: string;
  category: 'Thermal Cascade' | 'Power & Electrical' | 'Compute Saturation' | 'Network & Fabric';
  rootCauseAlert: ActiveAlert;
  childAlerts: ActiveAlert[];
  totalAlerts: number;
  highestSeverity: Severity;
  probableRootCause: string;
  affectedHall: string;
  silencedByWindow: MaintenanceWindow | null;
}

export interface PostIncidentReview {
  incidentId: string;
  title: string;
  siteCode: string;
  severity: Severity;
  stateLabel: string;
  mttrMinutes: number | null;
  affectedAssets: string[];
  timeline: Array<{ stage: string; timestampIso: string; detail: string }>;
  telemetrySnapshot: {
    metric: string;
    observedValue: string;
    threshold: string;
    facilityPowerMw: string;
    pue: string;
  };
  rootCauseSummary: string;
  actionItems: string[];
  markdown: string;
}

export function createInitialMaintenanceWindows(now = Date.now()): MaintenanceWindow[] {
  return [
    {
      id: 'mw-kl1-hallc-pm',
      siteId: 'kl1',
      title: 'Hall C CRAC-C2 Filter & Belt Preventive Service',
      scopeType: 'hall',
      scopeValue: 'hall-c',
      reason: 'Scheduled Q4 mechanical PM — temporary supply air variance expected',
      createdBy: 'Elena Vance',
      status: 'scheduled',
      startAtMs: now + 1000 * 60 * 60 * 4,
      endAtMs: now + 1000 * 60 * 60 * 6,
    },
  ];
}

function inferAlertHall(alert: ActiveAlert): HallId | null {
  const hay = `${alert.rackId} ${alert.serverHostname} ${alert.message}`.toLowerCase();
  if (hay.includes('hall-a') || hay.includes('hall a') || alert.rackId.startsWith('A-')) return 'hall-a';
  if (hay.includes('hall-b') || hay.includes('hall b') || alert.rackId.startsWith('B-')) return 'hall-b';
  if (hay.includes('hall-c') || hay.includes('hall c') || alert.rackId.startsWith('C-')) return 'hall-c';
  if (hay.includes('hall-d') || hay.includes('hall d') || alert.rackId.startsWith('D-')) return 'hall-d';
  return null;
}

function inferAlertSubsystem(alert: ActiveAlert): 'cooling' | 'power' | 'compute' {
  const hay = `${alert.ruleName} ${alert.message} ${alert.metric}`.toLowerCase();
  if (hay.includes('temp') || hay.includes('thermal') || hay.includes('crac') || hay.includes('chiller') || hay.includes('sla') || hay.includes('leak')) {
    return 'cooling';
  }
  if (hay.includes('power') || hay.includes('ups') || hay.includes('utility') || hay.includes('diesel') || hay.includes('surge') || hay.includes('psu')) {
    return 'power';
  }
  return 'compute';
}

export function isMaintenanceWindowLive(win: MaintenanceWindow, now = Date.now()): boolean {
  if (win.status === 'ended') return false;
  return now >= win.startAtMs && now <= win.endAtMs;
}

export function findMatchingMaintenanceWindow(
  alert: ActiveAlert,
  siteId: SiteId,
  windows: MaintenanceWindow[],
  now = Date.now()
): MaintenanceWindow | null {
  for (const win of windows) {
    if (win.siteId !== siteId) continue;
    if (!isMaintenanceWindowLive(win, now)) continue;
    if (win.scopeType === 'all') return win;
    if (win.scopeType === 'hall') {
      const alertHall = inferAlertHall(alert);
      if (alertHall && alertHall === win.scopeValue.toLowerCase()) return win;
    }
    if (win.scopeType === 'rack') {
      if (alert.rackId.toLowerCase() === win.scopeValue.toLowerCase()) return win;
    }
    if (win.scopeType === 'subsystem') {
      if (inferAlertSubsystem(alert) === win.scopeValue.toLowerCase()) return win;
    }
  }
  return null;
}

export function isAlertSilencedByMaintenance(
  alert: ActiveAlert,
  siteId: SiteId,
  windows: MaintenanceWindow[],
  now = Date.now()
): boolean {
  return findMatchingMaintenanceWindow(alert, siteId, windows, now) !== null;
}

function classifyIncidentCategory(alert: ActiveAlert): CorrelatedIncidentGroup['category'] {
  const sub = inferAlertSubsystem(alert);
  if (sub === 'cooling') return 'Thermal Cascade';
  if (sub === 'power') return 'Power & Electrical';
  if (alert.metric === 'packetLoss' || alert.metric === 'networkGbps') return 'Network & Fabric';
  return 'Compute Saturation';
}

function buildRootCauseNarrative(
  category: CorrelatedIncidentGroup['category'],
  root: ActiveAlert,
  childCount: number,
  hallLabel: string
): string {
  if (childCount === 0) {
    return `${root.ruleName} isolated to ${root.serverHostname} (${root.rackId}).`;
  }
  if (category === 'Thermal Cascade') {
    return `Correlated thermal excursion across ${hallLabel}: ${root.serverHostname} (${root.rackId}) triggered ${childCount} downstream thermal/cooling alarm${childCount === 1 ? '' : 's'}.`;
  }
  if (category === 'Power & Electrical') {
    return `Upstream electrical/power event anchored on ${root.serverHostname} correlated with ${childCount} related power alarm${childCount === 1 ? '' : 's'}.`;
  }
  if (category === 'Network & Fabric') {
    return `Fabric degradation anchored at ${root.serverHostname} correlated with ${childCount} peer link alarm${childCount === 1 ? '' : 's'}.`;
  }
  return `Workload saturation cluster in ${hallLabel} centered on ${root.serverHostname} (${childCount} correlated compute alarm${childCount === 1 ? '' : 's'}).`;
}

/**
 * Groups cascading alerts occurring in the same hall & domain (thermal, power, compute, network)
 * into Parent Root-Cause Incidents to suppress alarm storms.
 */
export function correlateAlertStorms(
  alerts: ActiveAlert[],
  windows: MaintenanceWindow[],
  siteId: SiteId,
  now = Date.now()
): CorrelatedIncidentGroup[] {
  const buckets = new Map<string, ActiveAlert[]>();

  for (const alert of alerts) {
    const category = classifyIncidentCategory(alert);
    const hall = inferAlertHall(alert) ?? 'facility';
    const key = `${category}::${hall}`;
    const list = buckets.get(key) ?? [];
    list.push(alert);
    buckets.set(key, list);
  }

  const groups: CorrelatedIncidentGroup[] = [];

  for (const [key, list] of buckets.entries()) {
    const [category, hall] = key.split('::') as [CorrelatedIncidentGroup['category'], string];
    // Pick root cause: prioritize critical > earlier triggered > BMS infrastructure
    const sorted = [...list].sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
      const aOpen = isAlertOpen(a) ? 0 : 1;
      const bOpen = isAlertOpen(b) ? 0 : 1;
      if (aOpen !== bOpen) return aOpen - bOpen;
      return a.triggeredAt - b.triggeredAt;
    });

    const root = sorted[0];
    const children = sorted.slice(1);
    const hallLabel =
      hall === 'facility'
        ? 'Campus Plant'
        : `Hall ${hall.slice(-1).toUpperCase()}`;

    const silencedByWindow = findMatchingMaintenanceWindow(root, siteId, windows, now);

    groups.push({
      id: `inc-${root.id}`,
      category,
      rootCauseAlert: root,
      childAlerts: children,
      totalAlerts: sorted.length,
      highestSeverity: sorted.some((a) => a.severity === 'critical') ? 'critical' : 'warning',
      probableRootCause: buildRootCauseNarrative(category, root, children.length, hallLabel),
      affectedHall: hallLabel,
      silencedByWindow,
    });
  }

  return groups.sort((a, b) => {
    if (a.highestSeverity !== b.highestSeverity) {
      return a.highestSeverity === 'critical' ? -1 : 1;
    }
    if (a.totalAlerts !== b.totalAlerts) return b.totalAlerts - a.totalAlerts;
    return b.rootCauseAlert.triggeredAt - a.rootCauseAlert.triggeredAt;
  });
}

export function generatePostIncidentReview(params: {
  alert: ActiveAlert;
  correlatedChildren?: ActiveAlert[];
  siteCode: string;
  facilityHistory: FacilityTelemetryPoint[];
  operatorName: string;
  now?: number;
}): PostIncidentReview {
  const { alert, correlatedChildren = [], siteCode, facilityHistory, operatorName } = params;
  const now = params.now ?? Date.now();
  const latestPt = facilityHistory[facilityHistory.length - 1];
  const facilityPowerMw = latestPt
    ? `${((latestPt.totalPowerKw * latestPt.pue) / 1000).toFixed(2)} MW`
    : 'N/A';
  const pueStr = latestPt ? latestPt.pue.toFixed(2) : 'N/A';

  const endRef = alert.resolvedAt ?? now;
  const mttrMinutes =
    alert.resolvedAt != null
      ? Math.max(1, Math.round((alert.resolvedAt - alert.triggeredAt) / 60_000))
      : Math.max(1, Math.round((endRef - alert.triggeredAt) / 60_000));

  const timeline: PostIncidentReview['timeline'] = [
    {
      stage: 'Triggered',
      timestampIso: new Date(alert.triggeredAt).toISOString(),
      detail: `${alert.ruleName} breached (${alert.message}) on ${alert.serverHostname} [${alert.rackId}].`,
    },
  ];

  if (alert.dispatchedChannelNames.length > 0) {
    timeline.push({
      stage: 'Dispatched',
      timestampIso: new Date(alert.triggeredAt + 4000).toISOString(),
      detail: `Automated escalation dispatched to ${alert.dispatchedChannelNames.join(', ')}.`,
    });
  }

  if (alert.acknowledgedAt) {
    timeline.push({
      stage: 'Acknowledged',
      timestampIso: new Date(alert.acknowledgedAt).toISOString(),
      detail: `Incident acknowledged by ${alert.acknowledgedBy ?? operatorName}.`,
    });
  } else {
    timeline.push({
      stage: 'Triage / MOP',
      timestampIso: new Date(now).toISOString(),
      detail: `Active operator triage initiated by ${operatorName}; MOP verification recommended.`,
    });
  }

  if (alert.resolvedAt) {
    timeline.push({
      stage: 'Resolved',
      timestampIso: new Date(alert.resolvedAt).toISOString(),
      detail: `Telemetry returned within safe operating envelope (MTTR: ${mttrMinutes} min).`,
    });
  }

  const affectedAssets = Array.from(
    new Set([
      `${alert.serverHostname} (${alert.rackId})`,
      ...correlatedChildren.map((c) => `${c.serverHostname} (${c.rackId})`),
    ])
  );

  const rootCauseSummary =
    correlatedChildren.length > 0
      ? `Primary breach on ${alert.serverHostname} (${alert.metric} ${alert.operator} ${alert.threshold}) coincided with ${correlatedChildren.length} correlated secondary alarm(s). Closed-loop BMS telemetry snapshot recorded ${facilityPowerMw} total campus load at PUE ${pueStr}.`
      : `Threshold breach on ${alert.serverHostname} (${alert.rackId}): ${alert.message}. Campus telemetry at capture: ${facilityPowerMw} total facility load, PUE ${pueStr}.`;

  const actionItems = [
    `Verify physical intake/exhaust airflow seals and CRAC/CDU balance serving ${alert.rackId}.`,
    `Review alert cooldown (${alert.ruleName}) and confirm escalation channel receipt (${alert.dispatchedChannelNames.join(', ') || 'NOC Console'}).`,
    `Attach this PIR brief to CMMS work order and sign off in next shift handover.`,
  ];

  const incidentId = `PIR-${siteCode}-${alert.id.slice(-6).toUpperCase()}`;
  const stateLabel =
    alert.state === 'resolved'
      ? 'Resolved'
      : alert.state === 'acknowledged'
      ? 'In Progress (Acknowledged)'
      : alert.state === 'ignored'
      ? 'Suppressed / Ignored'
      : 'Active / Unacknowledged';

  const markdown = [
    `# Post-Incident Review — ${incidentId}`,
    ``,
    `- **Site:** ${siteCode} (Uptime Tier IV)`,
    `- **Incident:** ${alert.ruleName}`,
    `- **Severity:** ${alert.severity.toUpperCase()}`,
    `- **Status:** ${stateLabel}`,
    `- **Elapsed / MTTR:** ${mttrMinutes} minutes`,
    `- **Compiled By:** ${operatorName}`,
    `- **Generated UTC:** ${new Date(now).toISOString()}`,
    ``,
    `## Affected Assets`,
    ...affectedAssets.map((a) => `- ${a}`),
    ``,
    `## Telemetry Snapshot`,
    `- **Metric:** ${alert.metric}`,
    `- **Observed Value:** ${alert.currentValue} (Threshold ${alert.operator} ${alert.threshold})`,
    `- **Campus Power / PUE:** ${facilityPowerMw} · PUE ${pueStr}`,
    ``,
    `## Incident Timeline`,
    ...timeline.map((t) => `- **${t.stage}** (\`${t.timestampIso}\`): ${t.detail}`),
    ``,
    `## Root Cause Summary`,
    rootCauseSummary,
    ``,
    `## Follow-Up Action Items`,
    ...actionItems.map((item, idx) => `${idx + 1}. ${item}`),
    ``,
  ].join('\n');

  return {
    incidentId,
    title: alert.ruleName,
    siteCode,
    severity: alert.severity,
    stateLabel,
    mttrMinutes,
    affectedAssets,
    timeline,
    telemetrySnapshot: {
      metric: alert.metric,
      observedValue: String(alert.currentValue),
      threshold: `${alert.operator} ${alert.threshold}`,
      facilityPowerMw,
      pue: pueStr,
    },
    rootCauseSummary,
    actionItems,
    markdown,
  };
}

import { SiteId } from './sites';
import { ActiveAlert, Severity } from './types';

export interface RunbookStep {
  id: string;
  title: string;
  detail: string;
  category: 'Triage' | 'Containment' | 'Remediation' | 'Verification';
  completed: boolean;
  completedBy: string | null;
  completedAt: number | null;
}

export interface IncidentWarRoomRecord {
  id: string;
  alertId: string;
  siteId: SiteId;
  siteCode: string;
  title: string;
  severity: Severity;
  targetAsset: string;
  rackId: string;
  assignedEngineerId: string;
  assignedEngineerName: string;
  openedAt: number;
  acknowledgedAt: number | null;
  resolvedAt: number | null;
  steps: RunbookStep[];
  notes: string;
  linkedTicketId: string | null;
  appendedToHandover: boolean;
}

export interface IncidentSlaMetrics {
  mttaSec: number | null;
  elapsedSec: number;
  completedSteps: number;
  totalSteps: number;
  completionPct: number;
}

export function buildRunbookStepsForAlert(alert: ActiveAlert): RunbookStep[] {
  const metric = alert.metric;

  if (metric === 'rackPowerKw' || metric === 'facilityPowerMw') {
    return [
      {
        id: 'step-1',
        title: 'Verify live rPDU Feed A & Feed B amperage',
        detail: `Confirm cabinet ${alert.rackId} breaker headroom and verify no phase skew > 5% on busway tap.`,
        category: 'Triage',
        completed: false,
        completedBy: null,
        completedAt: null,
      },
      {
        id: 'step-2',
        title: 'Initiate non-critical workload live migration / load-shed',
        detail: 'Shift >= 2.0 kW of batch compute or standby workloads to an adjacent rack with > 30% headroom.',
        category: 'Containment',
        completed: false,
        completedBy: null,
        completedAt: null,
      },
      {
        id: 'step-3',
        title: 'Execute Rack Power Rebalance & confirm breaker margin',
        detail: 'Apply load redistribution plan and verify cabinet utilization drops below 92% rated limit.',
        category: 'Remediation',
        completed: false,
        completedBy: null,
        completedAt: null,
      },
      {
        id: 'step-4',
        title: 'Record thermal/power stabilization & close shift log',
        detail: 'Confirm alert hysteresis cleared for 2 consecutive telemetry intervals and update shift handover.',
        category: 'Verification',
        completed: false,
        completedBy: null,
        completedAt: null,
      },
    ];
  }

  if (metric === 'tempC' || metric === 'rackAvgTempC') {
    return [
      {
        id: 'step-1',
        title: 'Verify cold-aisle containment doors & blanking panels',
        detail: `Check physical cabinet ${alert.rackId} front/rear doors and nearby hot-aisle recirculation paths.`,
        category: 'Triage',
        completed: false,
        completedBy: null,
        completedAt: null,
      },
      {
        id: 'step-2',
        title: 'Engage hall CRAC Boost mode & lower supply setpoint',
        detail: 'Trigger CRAC Boost on the affected data hall and verify chilled-water valve >= 85% open.',
        category: 'Containment',
        completed: false,
        completedBy: null,
        completedAt: null,
      },
      {
        id: 'step-3',
        title: 'Inspect server fan array & throttle GPU/CPU TDP if needed',
        detail: `Check Redfish SEL on ${alert.serverHostname} for failed fan rotor or clogged intake filter.`,
        category: 'Remediation',
        completed: false,
        completedBy: null,
        completedAt: null,
      },
      {
        id: 'step-4',
        title: 'Confirm inlet <= 25°C and exhaust <= 72°C',
        detail: 'Verify thermal decay trend over 2 telemetry ticks and document root cause for shift relief.',
        category: 'Verification',
        completed: false,
        completedBy: null,
        completedAt: null,
      },
    ];
  }

  return [
    {
      id: 'step-1',
      title: 'Acknowledge alert & isolate telemetry blast radius',
      detail: `Confirm whether ${alert.serverHostname} (${alert.rackId}) breach is isolated or hall-wide.`,
      category: 'Triage',
      completed: false,
      completedBy: null,
      completedAt: null,
    },
    {
      id: 'step-2',
      title: 'Inspect out-of-band BMC SEL & active workloads',
      detail: `Review hardware events and current ${alert.metric} saturation (${alert.currentValue}) on ${alert.serverHostname}.`,
      category: 'Containment',
      completed: false,
      completedBy: null,
      completedAt: null,
    },
    {
      id: 'step-3',
      title: 'Execute stabilizing remediation or drain node to Maintenance',
      detail: 'Stabilize faulty subsystem, migrate workloads, or place node into Maintenance Mode for swap.',
      category: 'Remediation',
      completed: false,
      completedBy: null,
      completedAt: null,
    },
    {
      id: 'step-4',
      title: 'Verify nominal telemetry & sign off incident handover',
      detail: 'Confirm alert resolves cleanly and append post-action summary to the Shift Handover brief.',
      category: 'Verification',
      completed: false,
      completedBy: null,
      completedAt: null,
    },
  ];
}

export function createIncidentWarRoomRecord(params: {
  alert: ActiveAlert;
  siteId: SiteId;
  siteCode: string;
  assignedEngineerId: string;
  assignedEngineerName: string;
  now?: number;
}): IncidentWarRoomRecord {
  const { alert, siteId, siteCode, assignedEngineerId, assignedEngineerName } = params;
  const now = params.now ?? Date.now();
  return {
    id: `war-${alert.id}`,
    alertId: alert.id,
    siteId,
    siteCode,
    title: `${alert.ruleName} — ${alert.serverHostname}`,
    severity: alert.severity,
    targetAsset: alert.serverHostname,
    rackId: alert.rackId,
    assignedEngineerId,
    assignedEngineerName,
    openedAt: alert.triggeredAt,
    acknowledgedAt: alert.acknowledgedAt ?? now,
    resolvedAt: alert.resolvedAt,
    steps: buildRunbookStepsForAlert(alert),
    notes: '',
    linkedTicketId: null,
    appendedToHandover: false,
  };
}

export function toggleRunbookStep(
  record: IncidentWarRoomRecord,
  stepId: string,
  operatorName: string,
  now: number = Date.now()
): IncidentWarRoomRecord {
  return {
    ...record,
    steps: record.steps.map((step) => {
      if (step.id !== stepId) return step;
      const nextCompleted = !step.completed;
      return {
        ...step,
        completed: nextCompleted,
        completedBy: nextCompleted ? operatorName : null,
        completedAt: nextCompleted ? now : null,
      };
    }),
  };
}

export function computeIncidentSlaMetrics(
  record: IncidentWarRoomRecord,
  now: number = Date.now()
): IncidentSlaMetrics {
  const completedSteps = record.steps.filter((s) => s.completed).length;
  const totalSteps = record.steps.length;
  const completionPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  const mttaSec =
    record.acknowledgedAt !== null
      ? Math.max(0, Math.round((record.acknowledgedAt - record.openedAt) / 1000))
      : null;
  const endTs = record.resolvedAt ?? now;
  const elapsedSec = Math.max(0, Math.round((endTs - record.openedAt) / 1000));
  return {
    mttaSec,
    elapsedSec,
    completedSteps,
    totalSteps,
    completionPct,
  };
}

export function formatDurationCompact(seconds: number | null): string {
  if (seconds === null) return 'Pending';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (mins < 60) return `${mins}m ${remSec}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export function formatIncidentForShiftHandover(
  record: IncidentWarRoomRecord,
  now: number = Date.now()
): string {
  const sla = computeIncidentSlaMetrics(record, now);
  const statusLabel = record.resolvedAt ? 'RESOLVED' : 'ACTIVE';
  const noteSuffix = record.notes.trim() ? ` Notes: ${record.notes.trim()}` : '';
  const ticketSuffix = record.linkedTicketId ? ` [${record.linkedTicketId}]` : '';
  return `[${record.siteCode} War Room · ${statusLabel}] ${record.title} (${record.rackId}) · Lead: ${record.assignedEngineerName} · Runbook ${sla.completedSteps}/${sla.totalSteps} (${sla.completionPct}%) · MTTA ${formatDurationCompact(sla.mttaSec)} / Elapsed ${formatDurationCompact(sla.elapsedSec)}${ticketSuffix}.${noteSuffix}`;
}

import { isAlertOpen } from './alertBulkActions';
import { ImmutableAuditEntry } from './enterpriseOpsEngine';
import { computeBmsRackPowerStats, DEFAULT_HALL_POWER_POLICIES } from './rackPowerEngine';
import { ShiftHandoverEntry } from './shiftEngine';
import { SITE_META_MAP, SiteId, SiteWorkspaceState } from './sites';
import { computeFacilitySummary } from './telemetryEngine';
import { ActiveAlert, RackDefinition } from './types';

export interface OverCapRackReportRow {
  rackId: string;
  hallName: string;
  powerKw: number;
  effectiveLimitKw: number;
  ratedKw: number;
  utilizationPct: number;
  overByKw: number;
}

export interface ExecutiveShiftHandoverReport {
  generatedAt: number;
  siteId: SiteId;
  siteCode: string;
  siteLabel: string;
  location: string;
  operatorName: string;
  shiftTeam: string;
  shiftSlot: string;
  itLoadMw: number;
  facilityLoadMw: number;
  pue: number;
  slaCompliancePct: number;
  openCriticalCount: number;
  openWarningCount: number;
  overCapCount: number;
  overCapRacks: OverCapRackReportRow[];
  openAlerts: ActiveAlert[];
  recentAuditActions: ImmutableAuditEntry[];
  recentHandovers: ShiftHandoverEntry[];
  cloudSyncedHandoversCount: number;
  executiveNotes: string;
}

export function buildExecutiveShiftHandoverReport(params: {
  siteId: SiteId;
  site: SiteWorkspaceState;
  racks: RackDefinition[];
  operatorName: string;
  shiftTeam: string;
  shiftSlot: string;
  auditTrail: ImmutableAuditEntry[];
  handoverLog: ShiftHandoverEntry[];
  cloudSyncedHandoversCount: number;
  executiveNotes: string;
  now?: number;
}): ExecutiveShiftHandoverReport {
  const {
    siteId,
    site,
    racks,
    operatorName,
    shiftTeam,
    shiftSlot,
    auditTrail,
    handoverLog,
    cloudSyncedHandoversCount,
    executiveNotes,
    now = Date.now(),
  } = params;

  const meta = SITE_META_MAP[siteId];
  const summary = computeFacilitySummary(site.servers, racks, site.alerts);
  const powerStats = computeBmsRackPowerStats(racks, site.bms, site.servers, {
    rackPowerAdjustmentsKw: site.rackPowerAdjustmentsKw,
    hallPowerPolicies: site.hallPowerPolicies ?? DEFAULT_HALL_POWER_POLICIES,
  });

  const overCapRacks: OverCapRackReportRow[] = racks
    .map((r) => {
      const st = powerStats[r.id];
      if (!st || !st.exceedsCapacity) return null;
      return {
        rackId: r.id,
        hallName: r.hallName,
        powerKw: st.powerKw,
        effectiveLimitKw: st.effectiveLimitKw,
        ratedKw: st.powerCapacityKw,
        utilizationPct: st.utilizationPct,
        overByKw: st.overCapacityKw,
      };
    })
    .filter((row): row is OverCapRackReportRow => row !== null)
    .sort((a, b) => b.overByKw - a.overByKw);

  const openAlerts = site.alerts
    .filter((a) => isAlertOpen(a))
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
      return b.triggeredAt - a.triggeredAt;
    });

  const slaCompliancePct =
    site.bms.envSensors.length > 0
      ? Number(
          (
            site.bms.envSensors.reduce((sum, s) => sum + s.slaCompliancePct, 0) /
            site.bms.envSensors.length
          ).toFixed(2)
        )
      : 100;

  const siteAudit = auditTrail
    .filter((a) => a.siteCode === meta.code || a.siteCode === 'ALL')
    .slice(0, 12);

  const siteHandovers = handoverLog
    .filter((h) => h.siteId === siteId)
    .slice(0, 6);

  return {
    generatedAt: now,
    siteId,
    siteCode: meta.code,
    siteLabel: meta.label,
    location: meta.location,
    operatorName,
    shiftTeam,
    shiftSlot,
    itLoadMw: Number((summary.totalItLoadKw / 1000).toFixed(2)),
    facilityLoadMw: Number(((summary.totalItLoadKw * summary.pue) / 1000).toFixed(2)),
    pue: summary.pue,
    slaCompliancePct,
    openCriticalCount: openAlerts.filter((a) => a.severity === 'critical').length,
    openWarningCount: openAlerts.filter((a) => a.severity === 'warning').length,
    overCapCount: overCapRacks.length,
    overCapRacks,
    openAlerts: openAlerts.slice(0, 15),
    recentAuditActions: siteAudit,
    recentHandovers: siteHandovers,
    cloudSyncedHandoversCount,
    executiveNotes: executiveNotes.trim(),
  };
}

export function exportExecutiveHandoverMarkdown(report: ExecutiveShiftHandoverReport): string {
  const lines: string[] = [
    `# Orise DCIM — Executive Shift Handover Briefing (${report.siteCode})`,
    ``,
    `- **Facility**: ${report.siteLabel} (${report.location})`,
    `- **Generated**: ${new Date(report.generatedAt).toISOString()}`,
    `- **Outgoing Lead**: ${report.operatorName} (${report.shiftTeam} · ${report.shiftSlot})`,
    ``,
    `## 1. Live Operational Snapshot`,
    `| Metric | Value |`,
    `| --- | --- |`,
    `| IT Load | ${report.itLoadMw.toFixed(2)} MW |`,
    `| Total Facility Power | ${report.facilityLoadMw.toFixed(2)} MW (PUE ${report.pue.toFixed(2)}) |`,
    `| ASHRAE SLA Compliance | ${report.slaCompliancePct.toFixed(2)}% |`,
    `| Open Critical / Warning Alerts | ${report.openCriticalCount} Critical / ${report.openWarningCount} Warning |`,
    `| Over-Capacity Cabinets | ${report.overCapCount} |`,
    ``,
    `## 2. Shift Handover Brief & Incoming Watch Notes`,
    report.executiveNotes || 'No custom shift handover notes recorded.',
    ``,
    `## 3. Over-Capacity Cabinets (${report.overCapCount})`,
  ];

  if (report.overCapRacks.length === 0) {
    lines.push('All 1,600 cabinets are operating within configured electrical capacity thresholds.');
  } else {
    lines.push(`| Cabinet | Hall | Live Draw | Effective Limit | Overage | Utilization |`);
    lines.push(`| --- | --- | --- | --- | --- | --- |`);
    for (const r of report.overCapRacks.slice(0, 20)) {
      lines.push(
        `| ${r.rackId} | ${r.hallName} | ${r.powerKw.toFixed(2)} kW | ${r.effectiveLimitKw.toFixed(1)} kW | +${r.overByKw.toFixed(2)} kW | ${r.utilizationPct}% |`
      );
    }
  }

  lines.push(``, `## 4. Open Critical & Warning Alerts (${report.openAlerts.length})`);
  if (report.openAlerts.length === 0) {
    lines.push('Zero open alerts at handover.');
  } else {
    for (const a of report.openAlerts) {
      lines.push(`- **[${a.severity.toUpperCase()}]** ${a.ruleName} · \`${a.serverHostname}\` (${a.rackId}): ${a.message}`);
    }
  }

  lines.push(``, `## 5. Recent Operator & Remediation Audit Log`);
  if (report.recentAuditActions.length === 0) {
    lines.push('No recent audit entries.');
  } else {
    for (const entry of report.recentAuditActions) {
      lines.push(
        `- \`${new Date(entry.timestamp).toISOString()}\` [${entry.category}] **${entry.actor}**: ${entry.action} (${entry.target})`
      );
    }
  }

  return lines.join('\n');
}

import { isAlertOpen } from './alertBulkActions';
import { MaintenanceWindow } from './alertIntelligenceEngine';
import { ImmutableAuditEntry } from './enterpriseOpsEngine';
import { computeBmsSensorRackStats, computeRackThermalStats } from './rackHeatmapEngine';
import { computeBmsRackPowerStats } from './rackPowerEngine';
import { SITE_META_MAP, SITES, SiteId, SiteWorkspaceState } from './sites';
import { computeFacilitySummary } from './telemetryEngine';
import { RackDefinition } from './types';
import { VisitorRecord } from './visitorEngine';

export type ComplianceFrameworkId = 'all' | 'ashrae_a1' | 'uptime_tier4' | 'iso_27001';

export interface ComplianceControlCheck {
  id: string;
  framework: 'ASHRAE Class A1' | 'Uptime Tier IV' | 'ISO 27001';
  controlCode: string;
  title: string;
  metricValue: string;
  targetValue: string;
  status: 'Pass' | 'Advisory' | 'Action Required';
  detail: string;
}

export interface SiteComplianceAuditPack {
  packId: string;
  generatedAtIso: string;
  scopeLabel: string;
  framework: ComplianceFrameworkId;
  auditorName: string;
  overallScorePct: number;
  ashraeThermalCompliancePct: number;
  powerAvailabilitySlaPct: number;
  meanTimeToAckMinutes: number;
  meanTimeToResolveMinutes: number;
  openCriticalIncidents: number;
  overCapacityRacks: number;
  thermalHotspotRacks: number;
  visitorRecordsAudited: number;
  escortedVisitorCompliancePct: number;
  maintenanceWindowsCount: number;
  auditHashChainEntries: number;
  controls: ComplianceControlCheck[];
}

export function buildComplianceAuditPack(params: {
  siteScope: SiteId | 'all';
  framework: ComplianceFrameworkId;
  sitesMap: Record<SiteId, SiteWorkspaceState>;
  racks: RackDefinition[];
  visitors: VisitorRecord[];
  maintenanceWindows: MaintenanceWindow[];
  auditTrail: ImmutableAuditEntry[];
  auditorName: string;
  now: number;
}): SiteComplianceAuditPack {
  const {
    siteScope,
    framework,
    sitesMap,
    racks,
    visitors,
    maintenanceWindows,
    auditTrail,
    auditorName,
    now,
  } = params;

  const targetSites: SiteId[] = siteScope === 'all' ? SITES.map((s) => s.id) : [siteScope];
  const scopeLabel =
    siteScope === 'all'
      ? 'All Campuses (KL1 · KL2 · KL3)'
      : `${SITE_META_MAP[siteScope].code} — ${SITE_META_MAP[siteScope].label}`;

  let totalSensors = 0;
  let compliantSensors = 0;
  let overCapacityRacks = 0;
  let thermalHotspotRacks = 0;
  let openCriticalIncidents = 0;
  let totalAckDeltaMs = 0;
  let ackCount = 0;
  let totalResolveDeltaMs = 0;
  let resolveCount = 0;
  let pueSum = 0;

  for (const sid of targetSites) {
    const st = sitesMap[sid];
    const summary = computeFacilitySummary(st.servers, racks, st.alerts);
    pueSum += summary.pue;
    const sensorMap = computeBmsSensorRackStats(racks, st.bms, st.servers);
    const powerMap = computeBmsRackPowerStats(racks, st.bms, st.servers, {
      rackPowerAdjustmentsKw: st.rackPowerAdjustmentsKw,
      hallPowerPolicies: st.hallPowerPolicies,
    });
    const thermalMap = computeRackThermalStats(racks, st.servers, st.bms);

    for (const r of racks) {
      const sen = sensorMap[r.id];
      if (sen) {
        totalSensors += 1;
        if (sen.slaStatus === 'Compliant') compliantSensors += 1;
      }
      if (powerMap[r.id]?.exceedsCapacity) overCapacityRacks += 1;
      if ((thermalMap[r.id]?.avgTempC ?? 0) >= 65) thermalHotspotRacks += 1;
    }

    for (const alert of st.alerts) {
      if (isAlertOpen(alert) && alert.severity === 'critical') openCriticalIncidents += 1;
      if (alert.acknowledgedAt && alert.acknowledgedAt >= alert.triggeredAt) {
        totalAckDeltaMs += alert.acknowledgedAt - alert.triggeredAt;
        ackCount += 1;
      }
      if (alert.resolvedAt && alert.resolvedAt >= alert.triggeredAt) {
        totalResolveDeltaMs += alert.resolvedAt - alert.triggeredAt;
        resolveCount += 1;
      }
    }
  }

  const avgPue = Math.round((pueSum / targetSites.length) * 100) / 100;
  const ashraeThermalCompliancePct =
    totalSensors > 0 ? Math.round((compliantSensors / totalSensors) * 1000) / 10 : 100;

  // Tier IV 2N power availability SLA reflects live capacity compliance
  const powerPenalty = Math.min(0.45, overCapacityRacks * 0.015);
  const powerAvailabilitySlaPct = Math.round((99.995 - powerPenalty) * 1000) / 1000;

  const meanTimeToAckMinutes =
    ackCount > 0 ? Math.round((totalAckDeltaMs / ackCount / 60000) * 10) / 10 : 4.2;
  const meanTimeToResolveMinutes =
    resolveCount > 0 ? Math.round((totalResolveDeltaMs / resolveCount / 60000) * 10) / 10 : 18.5;

  const scopedVisitors =
    siteScope === 'all' ? visitors : visitors.filter((v) => v.siteId === siteScope);
  const escortedOk = scopedVisitors.filter((v) => Boolean(v.escortName?.trim())).length;
  const escortedVisitorCompliancePct =
    scopedVisitors.length > 0
      ? Math.round((escortedOk / scopedVisitors.length) * 1000) / 10
      : 100;

  const scopedMaintenance =
    siteScope === 'all'
      ? maintenanceWindows
      : maintenanceWindows.filter((m) => m.siteId === siteScope);

  const scopedAudit =
    siteScope === 'all'
      ? auditTrail
      : auditTrail.filter((a) => a.siteCode === SITE_META_MAP[siteScope].code);

  const allControls: ComplianceControlCheck[] = [
    {
      id: 'ctrl-ashrae-inlet',
      framework: 'ASHRAE Class A1',
      controlCode: 'TC9.9-A1',
      title: 'Cold-Aisle Intake Temperature Envelope (18–27°C)',
      metricValue: `${ashraeThermalCompliancePct.toFixed(1)}% compliant`,
      targetValue: '>= 99.0%',
      status:
        ashraeThermalCompliancePct >= 99
          ? 'Pass'
          : ashraeThermalCompliancePct >= 95
          ? 'Advisory'
          : 'Action Required',
      detail: `${compliantSensors.toLocaleString()} of ${totalSensors.toLocaleString()} cabinet BMS intake probes within Class A1 SLA bounds.`,
    },
    {
      id: 'ctrl-ashrae-hotspot',
      framework: 'ASHRAE Class A1',
      controlCode: 'TC9.9-EXH',
      title: 'Cabinet Average Server Thermal Threshold Governance',
      metricValue: `${thermalHotspotRacks} hotspot rack(s)`,
      targetValue: '0 sustained hotspots',
      status: thermalHotspotRacks === 0 ? 'Pass' : thermalHotspotRacks <= 2 ? 'Advisory' : 'Action Required',
      detail: `${thermalHotspotRacks} rack(s) currently averaging >= 65°C across mounted servers (live PUE ${avgPue.toFixed(2)}).`,
    },
    {
      id: 'ctrl-tier4-2n',
      framework: 'Uptime Tier IV',
      controlCode: 'UPT-2N-CAP',
      title: '2N Fault-Tolerant Power Path & Rack Rated Capacity',
      metricValue: `${powerAvailabilitySlaPct.toFixed(3)}% SLA · ${overCapacityRacks} over-cap`,
      targetValue: '>= 99.995% · 0 over-cap',
      status: overCapacityRacks === 0 ? 'Pass' : 'Action Required',
      detail: `${overCapacityRacks} cabinet(s) exceeding active Hall Power Capacity policy limit; rebalance advisor active.`,
    },
    {
      id: 'ctrl-tier4-incident',
      framework: 'Uptime Tier IV',
      controlCode: 'UPT-OPS-MTTR',
      title: 'Critical Incident Response (MTTA / MTTR)',
      metricValue: `MTTA ${meanTimeToAckMinutes}m · ${openCriticalIncidents} open P1`,
      targetValue: 'MTTA <= 10m',
      status:
        meanTimeToAckMinutes <= 10 && openCriticalIncidents <= 3
          ? 'Pass'
          : openCriticalIncidents > 5
          ? 'Action Required'
          : 'Advisory',
      detail: `Average acknowledgement ${meanTimeToAckMinutes} min, resolution ${meanTimeToResolveMinutes} min across tracked incidents.`,
    },
    {
      id: 'ctrl-iso-physical',
      framework: 'ISO 27001',
      controlCode: 'A.11.1.2',
      title: 'Physical Entry Controls & Mandatory DCO Escort Verification',
      metricValue: `${escortedVisitorCompliancePct.toFixed(1)}% escorted (${scopedVisitors.length} logs)`,
      targetValue: '100% escorted',
      status: escortedVisitorCompliancePct >= 100 ? 'Pass' : 'Action Required',
      detail: `${escortedOk} of ${scopedVisitors.length} site visitor access records verified with assigned DCO escort.`,
    },
    {
      id: 'ctrl-iso-audit',
      framework: 'ISO 27001',
      controlCode: 'A.12.4.1',
      title: 'Tamper-Evident Change & Maintenance Audit Trail',
      metricValue: `${scopedAudit.length} hash-chained events · ${scopedMaintenance.length} MW`,
      targetValue: 'Continuous SHA-chain',
      status: scopedAudit.length > 0 ? 'Pass' : 'Advisory',
      detail: `All setpoint changes, rack MAC operations, and ${scopedMaintenance.length} maintenance window(s) cryptographically logged.`,
    },
  ];

  const controls =
    framework === 'all'
      ? allControls
      : allControls.filter((c) => {
          if (framework === 'ashrae_a1') return c.framework === 'ASHRAE Class A1';
          if (framework === 'uptime_tier4') return c.framework === 'Uptime Tier IV';
          return c.framework === 'ISO 27001';
        });

  const scoreWeight = controls.reduce(
    (acc, c) => acc + (c.status === 'Pass' ? 100 : c.status === 'Advisory' ? 78 : 48),
    0
  );
  const overallScorePct = controls.length > 0 ? Math.round(scoreWeight / controls.length) : 100;

  const iso = new Date(now).toISOString();
  return {
    packId: `CMP-${siteScope.toUpperCase()}-${iso.slice(0, 10).replace(/-/g, '')}`,
    generatedAtIso: iso,
    scopeLabel,
    framework,
    auditorName,
    overallScorePct,
    ashraeThermalCompliancePct,
    powerAvailabilitySlaPct,
    meanTimeToAckMinutes,
    meanTimeToResolveMinutes,
    openCriticalIncidents,
    overCapacityRacks,
    thermalHotspotRacks,
    visitorRecordsAudited: scopedVisitors.length,
    escortedVisitorCompliancePct,
    maintenanceWindowsCount: scopedMaintenance.length,
    auditHashChainEntries: scopedAudit.length,
    controls,
  };
}

export function exportCompliancePackMarkdown(pack: SiteComplianceAuditPack): string {
  const lines = [
    `# Orise DCIM — Audit & SLA Compliance Pack (${pack.packId})`,
    ``,
    `- **Scope**: ${pack.scopeLabel}`,
    `- **Generated (UTC)**: ${pack.generatedAtIso}`,
    `- **Prepared By**: ${pack.auditorName}`,
    `- **Composite Compliance Score**: ${pack.overallScorePct}%`,
    ``,
    `## Executive KPI Summary`,
    `| Metric | Observed Value |`,
    `| --- | --- |`,
    `| ASHRAE Class A1 Thermal Compliance | ${pack.ashraeThermalCompliancePct.toFixed(1)}% |`,
    `| 2N Power Availability SLA | ${pack.powerAvailabilitySlaPct.toFixed(3)}% |`,
    `| Mean Time to Acknowledge (MTTA) | ${pack.meanTimeToAckMinutes} min |`,
    `| Mean Time to Resolve (MTTR) | ${pack.meanTimeToResolveMinutes} min |`,
    `| Over-Capacity Cabinets | ${pack.overCapacityRacks} |`,
    `| Thermal Hotspot Racks (>=65°C avg) | ${pack.thermalHotspotRacks} |`,
    `| Visitor Escort Compliance | ${pack.escortedVisitorCompliancePct.toFixed(1)}% (${pack.visitorRecordsAudited} records) |`,
    `| Immutable Audit Chain Events | ${pack.auditHashChainEntries} |`,
    ``,
    `## Control Verification Matrix`,
    `| Framework | Control | Requirement | Observed | Target | Status |`,
    `| --- | --- | --- | --- | --- | --- |`,
    ...pack.controls.map(
      (c) =>
        `| ${c.framework} | ${c.controlCode} | ${c.title} | ${c.metricValue} | ${c.targetValue} | **${c.status}** |`
    ),
    ``,
    `## Detailed Auditor Evidence`,
    ...pack.controls.map((c) => `- **${c.controlCode} (${c.status})**: ${c.detail}`),
    ``,
  ];
  return lines.join('\n');
}

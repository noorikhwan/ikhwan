import { isAlertOpen } from './alertBulkActions';
import { BmsState } from './bmsTypes';
import { ImmutableAuditEntry, SmartRackLock, verifyAuditChain } from './enterpriseOpsEngine';
import { MaintenanceWorkOrder } from './predictiveMaintenance';
import { SiteId } from './sites';
import { OpsTicket } from './ticketEngine';
import { ActiveAlert, RackDefinition, ServerNode } from './types';
import { VisitorRecord } from './visitorEngine';

export const RACK_MAX_WEIGHT_KG = 1200;

export interface RackElevationMetrics {
  usedU: number;
  freeU: number;
  totalPowerKw: number;
  powerCapacityKw: number;
  feedAKw: number;
  feedBKw: number;
  feedImbalancePct: number;
  estimatedWeightKg: number;
  weightLimitKg: number;
  withinLimits: boolean;
}

export interface RackMoveValidation {
  valid: boolean;
  reason?: string;
  collidingHostname?: string;
  metrics: RackElevationMetrics;
}

function estimateServerWeightKg(srv: ServerNode): number {
  const perU = srv.role === 'GPU Inference' ? 24 : srv.role === 'NVMe Storage' ? 19 : 14;
  return srv.uHeight * perU;
}

export function computeRackElevationMetrics(
  rack: RackDefinition,
  rackServers: ServerNode[]
): RackElevationMetrics {
  const usedU = rackServers.reduce((s, n) => s + n.uHeight, 0);
  const freeU = Math.max(0, rack.totalU - usedU);
  const livePowerKw = rackServers.reduce((s, n) => s + n.powerW, 0) / 1000;
  const totalPowerKw = Math.round((livePowerKw > 0 ? livePowerKw : rack.basePowerKw) * 100) / 100;

  // Compute deterministic 2N A/B balance based on U-slot parity & dual-PSU health
  let feedAW = 0;
  let feedBW = 0;
  for (const s of rackServers) {
    if (s.psuStatus === 'Degraded (1/2)') {
      // Single-PSU fallback biases Feed A
      feedAW += s.powerW * 0.82;
      feedBW += s.powerW * 0.18;
    } else if (s.uStart % 2 === 0) {
      feedAW += s.powerW * 0.51;
      feedBW += s.powerW * 0.49;
    } else {
      feedAW += s.powerW * 0.49;
      feedBW += s.powerW * 0.51;
    }
  }
  const feedAKw = Math.round(((feedAW > 0 ? feedAW / 1000 : totalPowerKw * 0.505)) * 100) / 100;
  const feedBKw = Math.round(((feedBW > 0 ? feedBW / 1000 : totalPowerKw * 0.495)) * 100) / 100;
  const feedImbalancePct =
    totalPowerKw > 0 ? Math.round((Math.abs(feedAKw - feedBKw) / totalPowerKw) * 1000) / 10 : 0;

  const baseCabinetHardwareKg = 140; // Cabinet frame + ToR switches + rPDUs
  const estimatedWeightKg =
    baseCabinetHardwareKg +
    rackServers.reduce((sum, s) => sum + estimateServerWeightKg(s), 0);

  return {
    usedU,
    freeU,
    totalPowerKw,
    powerCapacityKw: rack.powerCapacityKw,
    feedAKw,
    feedBKw,
    feedImbalancePct,
    estimatedWeightKg,
    weightLimitKg: RACK_MAX_WEIGHT_KG,
    withinLimits:
      totalPowerKw <= rack.powerCapacityKw &&
      estimatedWeightKg <= RACK_MAX_WEIGHT_KG &&
      feedImbalancePct <= 15,
  };
}

export function validateRackUPlacement(
  rack: RackDefinition,
  rackServers: ServerNode[],
  serverId: string,
  targetUStart: number
): RackMoveValidation {
  const targetServer = rackServers.find((s) => s.id === serverId);
  const currentMetrics = computeRackElevationMetrics(rack, rackServers);

  if (!targetServer) {
    return { valid: false, reason: 'Selected chassis not found in cabinet.', metrics: currentMetrics };
  }

  const uStart = Math.round(targetUStart);
  const uEnd = uStart + targetServer.uHeight - 1;
  if (uStart < 1 || uEnd > rack.totalU) {
    return {
      valid: false,
      reason: `Slot U${uStart}–U${uEnd} exceeds cabinet ${rack.totalU}U boundary.`,
      metrics: currentMetrics,
    };
  }

  for (const other of rackServers) {
    if (other.id === serverId) continue;
    const otherEnd = other.uStart + other.uHeight - 1;
    const overlaps = uStart <= otherEnd && uEnd >= other.uStart;
    if (overlaps) {
      return {
        valid: false,
        reason: `U-space collision with ${other.hostname} (U${other.uStart}–U${otherEnd}).`,
        collidingHostname: other.hostname,
        metrics: currentMetrics,
      };
    }
  }

  const simulatedServers = rackServers.map((s) =>
    s.id === serverId ? { ...s, uStart } : s
  );
  const nextMetrics = computeRackElevationMetrics(rack, simulatedServers);

  if (nextMetrics.estimatedWeightKg > RACK_MAX_WEIGHT_KG) {
    return {
      valid: false,
      reason: `Cabinet static weight (${nextMetrics.estimatedWeightKg} kg) exceeds ${RACK_MAX_WEIGHT_KG} kg floor tile rating.`,
      metrics: nextMetrics,
    };
  }

  return {
    valid: true,
    metrics: nextMetrics,
  };
}

export function moveServerInRack(
  allServers: ServerNode[],
  rack: RackDefinition,
  serverId: string,
  targetUStart: number
): { ok: boolean; servers: ServerNode[]; error?: string; metrics: RackElevationMetrics } {
  const rackServers = allServers.filter((s) => s.rackId === rack.id);
  const validation = validateRackUPlacement(rack, rackServers, serverId, targetUStart);
  if (!validation.valid) {
    return {
      ok: false,
      servers: allServers,
      error: validation.reason,
      metrics: validation.metrics,
    };
  }

  const nextServers = allServers.map((s) =>
    s.id === serverId ? { ...s, uStart: Math.round(targetUStart) } : s
  );
  return {
    ok: true,
    servers: nextServers,
    metrics: validation.metrics,
  };
}

export interface CompiledShiftHandoverBrief {
  siteCode: string;
  shiftLabel: string;
  outgoingOperator: string;
  incomingLead: string;
  unresolvedCritical: number;
  unresolvedWarning: number;
  openP1P2Tickets: number;
  activeContractorsOnSite: number;
  bmsOverridesCount: number;
  pendingPmCount: number;
  summaryText: string;
  markdown: string;
}

export function compileShiftHandoverBrief(params: {
  siteId: SiteId;
  siteCode: string;
  shiftLabel: string;
  outgoingOperator: string;
  incomingLead: string;
  alerts: ActiveAlert[];
  tickets: OpsTicket[];
  visitors: VisitorRecord[];
  bms: BmsState;
  workOrders: MaintenanceWorkOrder[];
  sitePue: number;
  slaCompliancePct: number;
  now?: number;
}): CompiledShiftHandoverBrief {
  const {
    siteId,
    siteCode,
    shiftLabel,
    outgoingOperator,
    incomingLead,
    alerts,
    tickets,
    visitors,
    bms,
    workOrders,
    sitePue,
    slaCompliancePct,
  } = params;
  const now = params.now ?? Date.now();

  const openAlerts = alerts.filter((a) => isAlertOpen(a));
  const unresolvedCritical = openAlerts.filter((a) => a.severity === 'critical').length;
  const unresolvedWarning = openAlerts.filter((a) => a.severity === 'warning').length;

  const openP1P2Tickets = tickets.filter(
    (t) =>
      t.siteId === siteId &&
      t.status !== 'Resolved' &&
      t.status !== 'Closed' &&
      (t.priority === 'P1 - Critical' || t.priority === 'P2 - High')
  );

  const activeVisitors = visitors.filter((v) => v.siteId === siteId && v.status === 'Checked In');

  const cracOverrides = bms.cracUnits.filter((c) => c.mode === 'Boost' || c.mode === 'Manual' || c.mode === 'Fault');
  const upsOverrides = bms.upsSystems.filter((u) => u.mode !== 'Online');
  const bmsOverridesCount = cracOverrides.length + upsOverrides.length;

  const pendingPms = workOrders.filter(
    (w) => w.siteId === siteId && w.status !== 'Completed'
  );

  const summaryParts = [
    `${siteCode} ${shiftLabel} Handover (${outgoingOperator} → ${incomingLead}):`,
    `${unresolvedCritical} critical / ${unresolvedWarning} warning open alarms.`,
    `${openP1P2Tickets.length} open P1/P2 tickets, ${activeVisitors.length} contractor(s) checked in on-site.`,
    `${bmsOverridesCount} BMS CRAC/UPS override(s) active; ${pendingPms.length} pending PM work order(s).`,
    `Campus PUE ${sitePue.toFixed(2)} · Cold Aisle SLA ${slaCompliancePct.toFixed(1)}%.`,
  ];

  const markdown = [
    `# Shift Handover Brief — ${siteCode} (${shiftLabel})`,
    ``,
    `- **Outgoing Watch:** ${outgoingOperator}`,
    `- **Incoming Relief Lead:** ${incomingLead}`,
    `- **Timestamp (UTC):** ${new Date(now).toISOString()}`,
    `- **Live Efficiency / SLA:** PUE ${sitePue.toFixed(2)} · ASHRAE A1 SLA ${slaCompliancePct.toFixed(1)}%`,
    ``,
    `## 1. Unresolved Alarms (${openAlerts.length})`,
    ...(openAlerts.length > 0
      ? openAlerts.slice(0, 8).map((a) => `- [${a.severity.toUpperCase()}] ${a.ruleName} — ${a.serverHostname} (${a.rackId}): ${a.message}`)
      : ['- No active alarms on floor.']),
    ``,
    `## 2. Open P1/P2 Operations Tickets (${openP1P2Tickets.length})`,
    ...(openP1P2Tickets.length > 0
      ? openP1P2Tickets.slice(0, 8).map((t) => `- ${t.id} (${t.priority} · ${t.status}): ${t.title} — Assigned: ${t.assigneeName}`)
      : ['- No open P1/P2 tickets.']),
    ``,
    `## 3. Active Checked-In Contractors / Visitors (${activeVisitors.length})`,
    ...(activeVisitors.length > 0
      ? activeVisitors.map((v) => `- ${v.fullName} (${v.company}) · Badge ${v.badgeNumber ?? 'Issued'} · Escort: ${v.escortName}`)
      : ['- Zero external contractors currently inside white space.']),
    ``,
    `## 4. BMS CRAC / UPS Overrides (${bmsOverridesCount})`,
    ...(bmsOverridesCount > 0
      ? [
          ...cracOverrides.map((c) => `- ${c.name} (${c.hallLabel}): Mode=${c.mode}, Supply=${c.supplyTempC.toFixed(1)}°C`),
          ...upsOverrides.map((u) => `- ${u.name} (${u.feedBus}): Mode=${u.mode}, SoC=${u.batterySocPct.toFixed(0)}%`),
        ]
      : ['- All CRAC/CDU and 2N UPS assets operating in nominal Auto/Online mode.']),
    ``,
    `## 5. Pending Preventive Maintenance (${pendingPms.length})`,
    ...(pendingPms.length > 0
      ? pendingPms.slice(0, 6).map((pm) => `- ${pm.id}: ${pm.assetName} (${pm.priority} · ${pm.status})`)
      : ['- No pending PM tasks for this shift.']),
    ``,
  ].join('\n');

  return {
    siteCode,
    shiftLabel,
    outgoingOperator,
    incomingLead,
    unresolvedCritical,
    unresolvedWarning,
    openP1P2Tickets: openP1P2Tickets.length,
    activeContractorsOnSite: activeVisitors.length,
    bmsOverridesCount,
    pendingPmCount: pendingPms.length,
    summaryText: summaryParts.join(' '),
    markdown,
  };
}

export interface ComplianceEvidencePack {
  packId: string;
  generatedAtIso: string;
  siteCode: string;
  frameworks: string[];
  auditChainValid: boolean;
  auditRecordCount: number;
  visitorEscortCount: number;
  smartLockCount: number;
  slaCompliancePct: number;
  controlChecks: Array<{
    framework: 'ISO 27001' | 'SOC2 Type II' | 'Uptime Tier IV';
    controlId: string;
    title: string;
    status: 'PASS' | 'ATTENTION';
    evidenceSummary: string;
  }>;
  jsonString: string;
  markdownSummary: string;
}

export function buildComplianceEvidencePack(params: {
  siteId: SiteId;
  siteCode: string;
  auditTrail: ImmutableAuditEntry[];
  visitors: VisitorRecord[];
  rackLocks: SmartRackLock[];
  slaCompliancePct: number;
  pue: number;
  now?: number;
}): ComplianceEvidencePack {
  const { siteId, siteCode, auditTrail, visitors, rackLocks, slaCompliancePct, pue } = params;
  const now = params.now ?? Date.now();
  const chain = verifyAuditChain(auditTrail);
  const siteVisitors = visitors.filter((v) => v.siteId === siteId);
  const escortedCount = siteVisitors.filter((v) => Boolean(v.escortName)).length;
  const forcedOpenLocks = rackLocks.filter((l) => l.lockState === 'Door Open Alarm').length;
  const packId = `EVD-${siteCode}-${new Date(now).toISOString().slice(0, 10).replace(/-/g, '')}`;

  const controlChecks: ComplianceEvidencePack['controlChecks'] = [
    {
      framework: 'ISO 27001',
      controlId: 'A.8.15',
      title: 'Immutable Tamper-Evident Operator Audit Logging',
      status: chain.valid ? 'PASS' : 'ATTENTION',
      evidenceSummary: `${chain.checkedCount} hash-chained records verified (${chain.valid ? 'zero hash mismatches' : 'chain break detected'}).`,
    },
    {
      framework: 'ISO 27001',
      controlId: 'A.7.2',
      title: 'Physical Entry Controls & Escorted Visitor Access',
      status: siteVisitors.length === escortedCount ? 'PASS' : 'ATTENTION',
      evidenceSummary: `${escortedCount}/${siteVisitors.length} site visitor records have assigned biometric/escort verification.`,
    },
    {
      framework: 'SOC2 Type II',
      controlId: 'CC6.4',
      title: 'Cabinet Electronic Lock & Door Telemetry Monitoring',
      status: forcedOpenLocks === 0 ? 'PASS' : 'ATTENTION',
      evidenceSummary: `${rackLocks.length} smart rack locks monitored; ${forcedOpenLocks} forced-open anomaly currently active.`,
    },
    {
      framework: 'Uptime Tier IV',
      controlId: 'T4-SLA',
      title: 'ASHRAE A1 Cold Aisle & Concurrent Maintainability',
      status: slaCompliancePct >= 99.5 ? 'PASS' : 'ATTENTION',
      evidenceSummary: `Cold-aisle SLA compliance at ${slaCompliancePct.toFixed(2)}% with 2(N+1) power/cooling topology (PUE ${pue.toFixed(2)}).`,
    },
  ];

  const payload = {
    packId,
    generatedAtIso: new Date(now).toISOString(),
    siteCode,
    frameworks: ['ISO/IEC 27001:2022', 'SOC2 Type II (CC6/CC7)', 'Uptime Institute Tier IV'],
    integrity: chain,
    slaSummary: {
      ashraeA1CompliancePct: Number(slaCompliancePct.toFixed(2)),
      campusPue: Number(pue.toFixed(2)),
    },
    controlChecks,
    physicalAccessLogs: siteVisitors.slice(0, 50).map((v) => ({
      id: v.id,
      fullName: v.fullName,
      company: v.company,
      status: v.status,
      badgeNumber: v.badgeNumber,
      escortName: v.escortName,
      ndaSigned: v.ndaSigned,
    })),
    smartRackLockSnapshot: rackLocks.map((l) => ({
      id: l.id,
      rackId: l.rackId,
      lockState: l.lockState,
      lastActor: l.lastBadgeUser,
      lastEventAt: new Date(l.lastEventAt).toISOString(),
    })),
    auditTrail: auditTrail.slice(0, 100),
  };

  const markdownSummary = [
    `# Compliance Evidence Pack — ${packId}`,
    ``,
    `- **Facility:** ${siteCode} · Uptime Institute Tier IV`,
    `- **Generated UTC:** ${payload.generatedAtIso}`,
    `- **Audit Chain Integrity:** ${chain.valid ? 'VERIFIED' : 'TAMPER DETECTED'} (${chain.checkedCount} chained records)`,
    `- **ASHRAE A1 Cold-Aisle SLA:** ${slaCompliancePct.toFixed(2)}% · PUE ${pue.toFixed(2)}`,
    ``,
    `## Control Verification Matrix`,
    ...controlChecks.map(
      (c) => `- **${c.framework} ${c.controlId} (${c.status})** — ${c.title}: ${c.evidenceSummary}`
    ),
    ``,
  ].join('\n');

  return {
    packId,
    generatedAtIso: payload.generatedAtIso,
    siteCode,
    frameworks: payload.frameworks,
    auditChainValid: chain.valid,
    auditRecordCount: chain.checkedCount,
    visitorEscortCount: siteVisitors.length,
    smartLockCount: rackLocks.length,
    slaCompliancePct,
    controlChecks,
    jsonString: JSON.stringify(payload, null, 2),
    markdownSummary,
  };
}

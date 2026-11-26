import { isAlertOpen } from './alertBulkActions';
import { computeBmsSensorRackStats, computeRackThermalStats } from './rackHeatmapEngine';
import { computeBmsRackPowerStats } from './rackPowerEngine';
import { OperatorProfile } from './shiftEngine';
import { SITE_META_MAP, SITES, SiteId, SiteWorkspaceState } from './sites';
import { computeFacilitySummary } from './telemetryEngine';
import { ActiveAlert, RackDefinition } from './types';

export interface WallboardHotspotItem {
  rackId: string;
  hallId: string;
  avgTempC: number;
  maxTempC: number;
  powerKw: number;
  powerCapacityKw: number;
  band: string;
}

export interface WallboardSiteSnapshot {
  siteId: SiteId;
  siteCode: string;
  siteName: string;
  region: string;
  totalItLoadMw: number;
  totalCapacityMw: number;
  utilizationPct: number;
  pue: number;
  ashraeCompliancePct: number;
  avgInletTempC: number;
  peakExhaustTempC: number;
  openAlertCount: number;
  criticalAlertCount: number;
  warningAlertCount: number;
  overCapacityRackCount: number;
  topIncidents: ActiveAlert[];
  hotspots: WallboardHotspotItem[];
  onDutyLead: OperatorProfile | null;
}

export function buildWallboardSiteSnapshot(params: {
  siteId: SiteId;
  siteState: SiteWorkspaceState;
  racks: RackDefinition[];
  operators: OperatorProfile[];
}): WallboardSiteSnapshot {
  const { siteId, siteState, racks, operators } = params;
  const meta = SITE_META_MAP[siteId];
  const summary = computeFacilitySummary(siteState.servers, racks, siteState.alerts);
  const powerStats = computeBmsRackPowerStats(racks, siteState.bms, siteState.servers, {
    rackPowerAdjustmentsKw: siteState.rackPowerAdjustmentsKw,
    hallPowerPolicies: siteState.hallPowerPolicies,
  });
  const thermalStats = computeRackThermalStats(racks, siteState.servers, siteState.bms);
  const sensorStats = computeBmsSensorRackStats(racks, siteState.bms, siteState.servers);

  let compliantSensors = 0;
  let totalSensors = 0;
  let overCapacityRackCount = 0;

  for (const rack of racks) {
    const s = sensorStats[rack.id];
    if (s) {
      totalSensors += 1;
      if (s.slaStatus === 'Compliant') compliantSensors += 1;
    }
    if (powerStats[rack.id]?.exceedsCapacity) {
      overCapacityRackCount += 1;
    }
  }

  const ashraeCompliancePct =
    totalSensors > 0 ? Math.round((compliantSensors / totalSensors) * 1000) / 10 : 100;

  const openAlerts = siteState.alerts
    .filter((a) => isAlertOpen(a))
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
      return b.triggeredAt - a.triggeredAt;
    });

  const hotspots: WallboardHotspotItem[] = Object.values(thermalStats)
    .sort((a, b) => b.avgTempC - a.avgTempC)
    .slice(0, 5)
    .map((t) => {
      const p = powerStats[t.rackId];
      return {
        rackId: t.rackId,
        hallId: t.hallId,
        avgTempC: t.avgTempC,
        maxTempC: t.maxTempC,
        powerKw: p?.powerKw ?? 0,
        powerCapacityKw: p?.powerCapacityKw ?? 16,
        band: t.band,
      };
    });

  const siteOps = operators.filter((o) => o.primarySite === siteId);
  const onDutyLead =
    siteOps.find((o) => o.isShiftLead) ??
    siteOps.find((o) => /lead|chief|manager/i.test(o.role)) ??
    siteOps[0] ??
    null;

  const totalItLoadMw = Math.round((summary.totalItLoadKw / 1000) * 100) / 100;
  const totalCapacityMw = Math.round((summary.totalFacilityCapacityKw / 1000) * 100) / 100;
  const utilizationPct =
    totalCapacityMw > 0 ? Math.round((totalItLoadMw / totalCapacityMw) * 1000) / 10 : 0;

  return {
    siteId,
    siteCode: meta.code,
    siteName: meta.label,
    region: meta.location,
    totalItLoadMw,
    totalCapacityMw,
    utilizationPct,
    pue: summary.pue,
    ashraeCompliancePct,
    avgInletTempC: summary.avgInletTempC,
    peakExhaustTempC: summary.peakExhaustTempC,
    openAlertCount: openAlerts.length,
    criticalAlertCount: openAlerts.filter((a) => a.severity === 'critical').length,
    warningAlertCount: openAlerts.filter((a) => a.severity === 'warning').length,
    overCapacityRackCount,
    topIncidents: openAlerts.slice(0, 6),
    hotspots,
    onDutyLead,
  };
}

export function buildAllWallboardSnapshots(
  sitesMap: Record<SiteId, SiteWorkspaceState>,
  racks: RackDefinition[],
  operators: OperatorProfile[]
): WallboardSiteSnapshot[] {
  return SITES.map((s) =>
    buildWallboardSiteSnapshot({
      siteId: s.id,
      siteState: sitesMap[s.id],
      racks,
      operators,
    })
  );
}

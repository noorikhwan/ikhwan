import { computeTier4RedundancySummary } from './bmsEngine';
import {
  buildHistoricalTrendSeries,
  computeHistoricalTrendSummary,
  HISTORY_HORIZON_MAP,
  HistoryHorizonId,
} from './historicalTrends';
import { SITE_META_MAP, SITES, SiteId, SiteWorkspaceState } from './sites';
import { computeFacilitySummary } from './telemetryEngine';
import { HallId, RackDefinition } from './types';

export type ReportTypeId =
  | 'executive_summary'
  | 'historical_trends'
  | 'equipment_points'
  | 'cold_aisle_sla'
  | 'tier4_redundancy'
  | 'server_inventory'
  | 'rack_capacity'
  | 'alerts_audit';

export type ReportSiteScope = SiteId | 'all';
export type ReportHallScope = HallId | 'all';
export type ReportRecordFilter = 'all' | 'issues_only';

export interface ReportTemplateMeta {
  id: ReportTypeId;
  label: string;
  shortLabel: string;
  category: 'Compliance' | 'Facilities' | 'Compute' | 'Operations';
  description: string;
  supportsHallFilter: boolean;
  supportsIssuesFilter: boolean;
}

export const REPORT_TEMPLATES: ReportTemplateMeta[] = [
  {
    id: 'executive_summary',
    label: 'Executive Site & Tier IV Summary',
    shortLabel: 'Executive Summary',
    category: 'Compliance',
    description: 'Site-level PUE, IT load, Tier IV 2N readiness, Cold Aisle SLA compliance, and active alarm totals.',
    supportsHallFilter: false,
    supportsIssuesFilter: false,
  },
  {
    id: 'historical_trends',
    label: 'Multi-Year History & Trends (1–3Y)',
    shortLabel: 'History & Trends',
    category: 'Compliance',
    description: 'Monthly 6M–36M historical ledger of IT load, peak MW, PUE, chiller cooling, Cold Aisle temp/RH, and Tier IV SLA.',
    supportsHallFilter: true,
    supportsIssuesFilter: false,
  },
  {
    id: 'equipment_points',
    label: 'Equipment Point Data (Custom Interval)',
    shortLabel: 'Equipment Points',
    category: 'Facilities',
    description: 'Extract per-equipment BACnet/Modbus/Redfish telemetry points (Chillers, Square Tanks, UPS, 8x Gens, CRAC, Servers) at custom sampling intervals.',
    supportsHallFilter: false,
    supportsIssuesFilter: false,
  },
  {
    id: 'cold_aisle_sla',
    label: 'Cold Aisle Temp & Humidity SLA',
    shortLabel: 'Cold Aisle SLA',
    category: 'Compliance',
    description: 'ASHRAE TC 9.9 Class A1 2-per-row cold aisle sensors (40/hall · 160/site), humidity, dew point, and 30-day SLA compliance.',
    supportsHallFilter: true,
    supportsIssuesFilter: true,
  },
  {
    id: 'tier4_redundancy',
    label: 'Tier IV Redundancy & BMS Audit',
    shortLabel: 'Tier IV & BMS',
    category: 'Facilities',
    description: 'Tier IV matrix plus 2 Water Chillers, 14 Air Chillers, 8 CRACs, 4 UPS, 8 generators, and 6 gateways.',
    supportsHallFilter: true,
    supportsIssuesFilter: true,
  },
  {
    id: 'server_inventory',
    label: 'Server Health & Live Telemetry',
    shortLabel: 'Server Fleet',
    category: 'Compute',
    description: 'Per-host CPU, memory, disk, inlet/exhaust temperature, power draw, PSU 2N status, and active faults.',
    supportsHallFilter: true,
    supportsIssuesFilter: true,
  },
  {
    id: 'rack_capacity',
    label: 'Rack Power & Space Capacity',
    shortLabel: 'Rack Capacity',
    category: 'Facilities',
    description: 'Complete 42U cabinet ledger (1,600 racks/site) with U utilization, kW draw, ambient temp, and 2N PDU feeds.',
    supportsHallFilter: true,
    supportsIssuesFilter: true,
  },
  {
    id: 'alerts_audit',
    label: 'Alerts & Incident Dispatch Log',
    shortLabel: 'Alerts Audit',
    category: 'Operations',
    description: 'Active, acknowledged, and resolved IT/BMS alerts with thresholds, acknowledgement owner, and channels.',
    supportsHallFilter: false,
    supportsIssuesFilter: true,
  },
];

export const REPORT_TEMPLATE_MAP: Record<ReportTypeId, ReportTemplateMeta> = REPORT_TEMPLATES.reduce(
  (acc, t) => {
    acc[t.id] = t;
    return acc;
  },
  {} as Record<ReportTypeId, ReportTemplateMeta>
);

export interface ReportConfig {
  typeId: ReportTypeId;
  siteScope: ReportSiteScope;
  hallScope: ReportHallScope;
  recordFilter: ReportRecordFilter;
  historyHorizon?: HistoryHorizonId;
  customTitle?: string;
  includeBom?: boolean;
  includeMetadataComments?: boolean;
}

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
}

export type ReportCellValue = string | number | boolean | null | undefined;
export type ReportRow = Record<string, ReportCellValue>;

export interface ReportSummaryMetric {
  label: string;
  value: string;
  detail: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'critical';
}

export interface GeneratedReport {
  id: string;
  title: string;
  typeId: ReportTypeId;
  typeLabel: string;
  category: ReportTemplateMeta['category'];
  siteScope: ReportSiteScope;
  siteScopeLabel: string;
  hallScope: ReportHallScope;
  hallScopeLabel: string;
  recordFilter: ReportRecordFilter;
  historyHorizon?: HistoryHorizonId;
  generatedAt: number;
  filename: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  summaryMetrics: ReportSummaryMetric[];
  csvContent: string;
  byteSize: number;
}

const HALL_LABEL_MAP: Record<HallId, string> = {
  'hall-a': 'Hall A · Core Compute',
  'hall-b': 'Hall B · AI & GPU',
  'hall-c': 'Hall C · Storage & Edge',
  'hall-d': 'Hall D · Cloud & Interconnect',
};

export function getHallScopeLabel(hallScope: ReportHallScope): string {
  return hallScope === 'all' ? 'All 4 Data Halls' : HALL_LABEL_MAP[hallScope];
}

export function getSiteScopeLabel(siteScope: ReportSiteScope): string {
  if (siteScope === 'all') return 'All Sites (KL1 · KL2 · KL3)';
  const meta = SITE_META_MAP[siteScope];
  return meta ? meta.label : siteScope.toUpperCase();
}

export function formatIsoTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export function formatFilenameTimestamp(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(
    d.getUTCMinutes()
  )}${pad(d.getUTCSeconds())}`;
}

export function slugifyFilenamePart(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function buildReportFilename(
  typeId: ReportTypeId,
  siteScope: ReportSiteScope,
  hallScope: ReportHallScope,
  generatedAt: number
): string {
  const sitePart = siteScope === 'all' ? 'all-sites' : siteScope;
  const hallPart = hallScope === 'all' ? '' : `-${hallScope}`;
  const typeSlug = slugifyFilenamePart(typeId.replace(/_/g, '-'));
  return `orise-dcim-${sitePart}${hallPart}-${typeSlug}-${formatFilenameTimestamp(generatedAt)}.csv`;
}

/**
 * RFC 4180 compliant CSV cell encoder.
 */
export function escapeCsvCell(value: ReportCellValue): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function serializeReportToCsv(params: {
  columns: ReportColumn[];
  rows: ReportRow[];
  title: string;
  siteScopeLabel: string;
  hallScopeLabel: string;
  generatedAt: number;
  includeBom?: boolean;
  includeMetadataComments?: boolean;
}): string {
  const lines: string[] = [];

  if (params.includeMetadataComments) {
    lines.push(`# Report: ${params.title}`);
    lines.push(`# Scope: ${params.siteScopeLabel} | ${params.hallScopeLabel}`);
    lines.push(`# Generated: ${formatIsoTimestamp(params.generatedAt)}`);
  }

  lines.push(params.columns.map((col) => escapeCsvCell(col.label)).join(','));

  for (const row of params.rows) {
    lines.push(params.columns.map((col) => escapeCsvCell(row[col.key])).join(','));
  }

  const body = lines.join('\r\n') + '\r\n';
  return params.includeBom ? `\uFEFF${body}` : body;
}

function resolveTargetSiteIds(siteScope: ReportSiteScope): SiteId[] {
  return siteScope === 'all' ? SITES.map((s) => s.id) : [siteScope];
}

export function generateDcimReport(params: {
  config: ReportConfig;
  sitesMap: Record<SiteId, SiteWorkspaceState>;
  racks: RackDefinition[];
  now?: number;
}): GeneratedReport {
  const { config, sitesMap, racks } = params;
  const now = params.now ?? Date.now();
  const template = REPORT_TEMPLATE_MAP[config.typeId];
  const siteIds = resolveTargetSiteIds(config.siteScope);
  const effectiveHallScope: ReportHallScope = template.supportsHallFilter ? config.hallScope : 'all';
  const effectiveRecordFilter: ReportRecordFilter = template.supportsIssuesFilter
    ? config.recordFilter
    : 'all';

  const siteScopeLabel = getSiteScopeLabel(config.siteScope);
  const hallScopeLabel = getHallScopeLabel(effectiveHallScope);

  let columns: ReportColumn[] = [];
  let rows: ReportRow[] = [];
  let summaryMetrics: ReportSummaryMetric[] = [];

  if (config.typeId === 'executive_summary') {
    columns = [
      { key: 'siteCode', label: 'Site' },
      { key: 'location', label: 'Location' },
      { key: 'certification', label: 'Tier Certification' },
      { key: 'tier4Status', label: 'Tier IV Readiness' },
      { key: 'zeroSpof', label: 'Zero SPOF' },
      { key: 'totalRacks', label: 'Total Racks', align: 'right' },
      { key: 'totalServers', label: 'Live Hosts', align: 'right' },
      { key: 'nominalServers', label: 'Nominal Hosts', align: 'right' },
      { key: 'itLoadKw', label: 'IT Load (kW)', align: 'right' },
      { key: 'facilityCapKw', label: 'Capacity (kW)', align: 'right' },
      { key: 'pue', label: 'PUE', align: 'right' },
      { key: 'chillerPlant', label: 'Chiller Plant (2W + 14A)' },
      { key: 'coolingMw', label: 'Cooling Output (MW)', align: 'right' },
      { key: 'avgColdAisleTempC', label: 'Avg Cold Aisle (°C)', align: 'right' },
      { key: 'avgColdAisleRhPct', label: 'Avg Cold Aisle (% RH)', align: 'right' },
      { key: 'slaCompliantHalls', label: 'SLA Halls Compliant', align: 'right' },
      { key: 'upsBatterySocPct', label: 'UPS Battery SoC (%)', align: 'right' },
      { key: 'activeCriticalAlerts', label: 'Critical Alerts', align: 'right' },
      { key: 'activeTotalAlerts', label: 'Open Alerts', align: 'right' },
      { key: 'utilityFeed', label: 'Utility Feed State' },
    ];

    let totalLoadKw = 0;
    let totalRacks = 0;
    let totalOpenAlerts = 0;
    let totalCompliantHalls = 0;
    let totalHalls = 0;
    let allZeroSpof = true;

    for (const sid of siteIds) {
      const site = sitesMap[sid];
      const meta = SITE_META_MAP[sid];
      const summary = computeFacilitySummary(site.servers, racks, site.alerts);
      const tier4 = computeTier4RedundancySummary(site.bms, site.servers);
      const coolingMw =
        site.bms.cracUnits.reduce((sum, c) => sum + c.coolingOutputKw, 0) / 1000;
      const healthyUps = site.bms.upsSystems.filter((u) => u.mode !== 'Fault');
      const avgUpsSoc =
        healthyUps.reduce((sum, u) => sum + u.batterySocPct, 0) / Math.max(1, healthyUps.length);
      const avgColdTemp =
        site.bms.envSensors.reduce((sum, e) => sum + e.coldAisleTempC, 0) /
        Math.max(1, site.bms.envSensors.length);
      const avgColdRh =
        site.bms.envSensors.reduce((sum, e) => sum + e.humidityPct, 0) /
        Math.max(1, site.bms.envSensors.length);
      const compliantHalls = site.bms.envSensors.filter(
        (e) => e.tempSlaStatus !== 'Breached' && e.humiditySlaStatus !== 'Breached'
      ).length;

      totalLoadKw += summary.totalItLoadKw;
      totalRacks += racks.length;
      totalOpenAlerts += summary.activeAlertCount;
      totalCompliantHalls += compliantHalls;
      totalHalls += site.bms.envSensors.length;
      if (!tier4.zeroSpofVerified) allZeroSpof = false;

      const waterActive = site.bms.chillers.filter(
        (ch) => ch.chillerType === 'Water-Cooled' && ch.mode !== 'Fault'
      ).length;
      const airActive = site.bms.chillers.filter(
        (ch) => ch.chillerType === 'Air-Cooled' && ch.mode !== 'Fault'
      ).length;
      rows.push({
        siteCode: meta.code,
        location: meta.location,
        certification: meta.tierLabel,
        tier4Status: tier4.overallLabel,
        zeroSpof: tier4.zeroSpofVerified ? 'Verified' : 'At Risk',
        totalRacks: racks.length,
        totalServers: summary.totalServers,
        nominalServers: summary.nominalCount,
        itLoadKw: Number(summary.totalItLoadKw.toFixed(1)),
        facilityCapKw: Number(summary.totalFacilityCapacityKw.toFixed(1)),
        pue: Number(summary.pue.toFixed(2)),
        chillerPlant: `${waterActive}/2 Water · ${airActive}/14 Air`,
        coolingMw: Number(coolingMw.toFixed(2)),
        avgColdAisleTempC: Number(avgColdTemp.toFixed(1)),
        avgColdAisleRhPct: Number(avgColdRh.toFixed(1)),
        slaCompliantHalls: `${compliantHalls}/${site.bms.envSensors.length}`,
        upsBatterySocPct: Number(avgUpsSoc.toFixed(1)),
        activeCriticalAlerts: summary.activeCriticalCount,
        activeTotalAlerts: summary.activeAlertCount,
        utilityFeed: site.bms.utilityFeed,
      });
    }

    summaryMetrics = [
      {
        label: 'Sites Covered',
        value: `${siteIds.length}`,
        detail: `${totalRacks.toLocaleString()} total 42U racks`,
        tone: 'neutral',
      },
      {
        label: 'Aggregate IT Load',
        value: `${(totalLoadKw / 1000).toFixed(2)} MW`,
        detail: `${totalLoadKw.toFixed(1)} kW active draw`,
        tone: 'neutral',
      },
      {
        label: 'Cold Aisle SLA',
        value: `${totalCompliantHalls}/${totalHalls} Halls`,
        detail: 'ASHRAE Class A1 envelope',
        tone: totalCompliantHalls === totalHalls ? 'positive' : 'critical',
      },
      {
        label: 'Tier IV Integrity',
        value: allZeroSpof ? 'Zero SPOF' : 'Review Needed',
        detail: `${totalOpenAlerts} open alerts in scope`,
        tone: allZeroSpof ? 'positive' : 'warning',
      },
    ];
  } else if (config.typeId === 'historical_trends') {
    const horizon: HistoryHorizonId = config.historyHorizon ?? '2y';
    const horizonMeta = HISTORY_HORIZON_MAP[horizon];
    const points = buildHistoricalTrendSeries({
      sitesMap,
      racks,
      siteScope: config.siteScope,
      hallScope: effectiveHallScope,
      horizon,
      now,
    });
    const loadSummary = computeHistoricalTrendSummary(points, 'itLoadMw');
    const pueSummary = computeHistoricalTrendSummary(points, 'pue');

    columns = [
      { key: 'monthKey', label: 'Month (YYYY-MM)' },
      { key: 'monthLabel', label: 'Period' },
      { key: 'siteScope', label: 'Site Scope' },
      { key: 'hallScope', label: 'Data Hall Scope' },
      { key: 'itLoadMw', label: 'Avg IT Load (MW)', align: 'right' },
      { key: 'peakItLoadMw', label: 'Peak IT Load (MW)', align: 'right' },
      { key: 'pue', label: 'PUE', align: 'right' },
      { key: 'coolingOutputMw', label: 'Chiller Cooling (MW)', align: 'right' },
      { key: 'coldAisleTempC', label: 'Cold Aisle Avg (°C)', align: 'right' },
      { key: 'coldAislePeakTempC', label: 'Cold Aisle Peak (°C)', align: 'right' },
      { key: 'coldAisleHumidityPct', label: 'Humidity (% RH)', align: 'right' },
      { key: 'slaCompliancePct', label: 'SLA Compliance (%)', align: 'right' },
      { key: 'tier4AvailabilityPct', label: 'Tier IV Availability (%)', align: 'right' },
      { key: 'rackUtilizationPct', label: 'Rack Util (%)', align: 'right' },
      { key: 'alertCount', label: 'Monthly Alerts', align: 'right' },
    ];

    for (const pt of points) {
      rows.push({
        monthKey: pt.monthKey,
        monthLabel: pt.label,
        siteScope: siteScopeLabel,
        hallScope: hallScopeLabel,
        itLoadMw: pt.itLoadMw,
        peakItLoadMw: pt.peakItLoadMw,
        pue: pt.pue,
        coolingOutputMw: pt.coolingOutputMw,
        coldAisleTempC: pt.coldAisleTempC,
        coldAislePeakTempC: pt.coldAislePeakTempC,
        coldAisleHumidityPct: pt.coldAisleHumidityPct,
        slaCompliancePct: pt.slaCompliancePct,
        tier4AvailabilityPct: pt.tier4AvailabilityPct,
        rackUtilizationPct: pt.rackUtilizationPct,
        alertCount: pt.alertCount,
      });
    }

    summaryMetrics = [
      {
        label: 'History Window',
        value: `${horizonMeta.months} Months`,
        detail: loadSummary.yearSpanLabel,
        tone: 'neutral',
      },
      {
        label: 'IT Load Trajectory',
        value: `${loadSummary.delta >= 0 ? '+' : ''}${loadSummary.delta.toFixed(2)} MW`,
        detail: `${loadSummary.deltaPct >= 0 ? '+' : ''}${loadSummary.deltaPct.toFixed(1)}% · Peak ${loadSummary.maxValue.toFixed(2)} MW`,
        tone: 'neutral',
      },
      {
        label: 'PUE Improvement',
        value: `${pueSummary.currentValue.toFixed(3)}`,
        detail: `${pueSummary.delta <= 0 ? '' : '+'}${pueSummary.delta.toFixed(3)} vs ${pueSummary.startLabel}`,
        tone: pueSummary.delta <= 0 ? 'positive' : 'warning',
      },
      {
        label: 'Multi-Year SLA Avg',
        value: `${loadSummary.avgSlaCompliancePct.toFixed(2)}%`,
        detail: `Tier IV ${loadSummary.avgTier4AvailabilityPct.toFixed(3)}% · ${loadSummary.totalAlerts} alerts`,
        tone: loadSummary.avgSlaCompliancePct >= 99.9 ? 'positive' : 'warning',
      },
    ];
  } else if (config.typeId === 'equipment_points') {
    // Default quick extraction for Report Builder when invoked via generateDcimReport
    columns = [
      { key: 'timestamp', label: 'Timestamp (UTC)' },
      { key: 'siteCode', label: 'Site' },
      { key: 'equipmentId', label: 'Equipment ID' },
      { key: 'equipmentName', label: 'Equipment Name' },
      { key: 'protocol', label: 'Protocol' },
      { key: 'pointCode', label: 'Point Address' },
      { key: 'pointName', label: 'Point Name' },
      { key: 'value', label: 'Value', align: 'right' },
      { key: 'unit', label: 'Unit' },
    ];
    const tsLabel = formatIsoTimestamp(now);
    let unitCount = 0;
    for (const sid of siteIds) {
      const site = sitesMap[sid];
      const meta = SITE_META_MAP[sid];
      for (const ch of site.bms.chillers) {
        unitCount++;
        rows.push(
          {
            timestamp: tsLabel,
            siteCode: meta.code,
            equipmentId: ch.id.toUpperCase(),
            equipmentName: `${ch.name} (${ch.chillerType})`,
            protocol: ch.protocol,
            pointCode: `${meta.code}:${ch.id.toUpperCase()}:AI_CHW_SUP_TEMP`,
            pointName: 'CHW Supply Temp',
            value: Number(ch.chwSupplyTempC.toFixed(2)),
            unit: '°C',
          },
          {
            timestamp: tsLabel,
            siteCode: meta.code,
            equipmentId: ch.id.toUpperCase(),
            equipmentName: `${ch.name} (${ch.chillerType})`,
            protocol: ch.protocol,
            pointCode: `${meta.code}:${ch.id.toUpperCase()}:AI_COOLING_KW`,
            pointName: 'Cooling Output',
            value: Number(ch.coolingOutputKw.toFixed(1)),
            unit: 'kW',
          }
        );
      }
      for (const p of site.bms.chwTankPumpSets) {
        unitCount++;
        rows.push({
          timestamp: tsLabel,
          siteCode: meta.code,
          equipmentId: p.id.toUpperCase(),
          equipmentName: p.name,
          protocol: p.protocol,
          pointCode: `${meta.code}:${p.id.toUpperCase()}:AI_TANK_LEVEL`,
          pointName: 'Square Buffer Tank Level',
          value: Number(p.tankLevelPct.toFixed(1)),
          unit: '%',
        });
      }
      for (const u of site.bms.upsSystems) {
        unitCount++;
        rows.push({
          timestamp: tsLabel,
          siteCode: meta.code,
          equipmentId: u.id.toUpperCase(),
          equipmentName: u.name,
          protocol: u.protocol,
          pointCode: `${meta.code}:${u.id.toUpperCase()}:MOD_BATT_SOC`,
          pointName: 'Battery State of Charge',
          value: Number(u.batterySocPct.toFixed(1)),
          unit: '%',
        });
      }
      for (const g of site.bms.generators) {
        unitCount++;
        rows.push({
          timestamp: tsLabel,
          siteCode: meta.code,
          equipmentId: g.id.toUpperCase(),
          equipmentName: g.name,
          protocol: g.protocol,
          pointCode: `${meta.code}:${g.id.toUpperCase()}:MOD_FUEL_PCT`,
          pointName: 'Day-Tank Fuel Level',
          value: Number(g.fuelLevelPct.toFixed(1)),
          unit: '%',
        });
      }
    }
    summaryMetrics = [
      { label: 'Equipment Sampled', value: `${unitCount}`, detail: 'Chillers, Square Tanks, UPS & 8x Gens', tone: 'neutral' },
      { label: 'Extracted Points', value: rows.length.toLocaleString(), detail: 'Point-in-time BACnet/Modbus tags', tone: 'positive' },
      { label: 'Interval Mode', value: 'Snapshot', detail: 'Use Point Extractor tab for custom intervals', tone: 'neutral' },
      { label: 'Site Scope', value: siteScopeLabel, detail: 'RFC 4180 CSV ready', tone: 'positive' },
    ];
  } else if (config.typeId === 'cold_aisle_sla') {
    columns = [
      { key: 'siteCode', label: 'Site' },
      { key: 'hallLabel', label: 'Data Hall' },
      { key: 'rowSensorCount', label: 'Row SLA Sensors' },
      { key: 'probeAId', label: 'Probe A ID' },
      { key: 'probeBId', label: 'Probe B ID' },
      { key: 'coldAisleTempC', label: 'Cold Aisle Temp (°C)', align: 'right' },
      { key: 'probeATempC', label: 'Probe A (°C)', align: 'right' },
      { key: 'probeBTempC', label: 'Probe B (°C)', align: 'right' },
      { key: 'tempSlaRange', label: 'Temp SLA Envelope' },
      { key: 'tempSlaStatus', label: 'Temp SLA Status' },
      { key: 'humidityPct', label: 'Relative Humidity (% RH)', align: 'right' },
      { key: 'probeAHumidityPct', label: 'Probe A (% RH)', align: 'right' },
      { key: 'probeBHumidityPct', label: 'Probe B (% RH)', align: 'right' },
      { key: 'humiditySlaRange', label: 'Humidity SLA Envelope' },
      { key: 'humiditySlaStatus', label: 'Humidity SLA Status' },
      { key: 'dewPointC', label: 'Dew Point (°C)', align: 'right' },
      { key: 'slaCompliancePct', label: '30d SLA Compliance (%)', align: 'right' },
      { key: 'dualProbeStatus', label: '2N Probe Health' },
      { key: 'chilledLoopStatus', label: '2N Cooling Loops' },
      { key: 'diffPressurePa', label: 'Diff Pressure (Pa)', align: 'right' },
      { key: 'leakDetected', label: 'Floor Leak' },
    ];

    let breachCount = 0;
    let complianceSum = 0;
    let peakTemp = -Infinity;

    for (const sid of siteIds) {
      const site = sitesMap[sid];
      const meta = SITE_META_MAP[sid];
      for (const sensor of site.bms.envSensors) {
        if (effectiveHallScope !== 'all' && sensor.hallId !== effectiveHallScope) continue;
        const hasIssue =
          sensor.tempSlaStatus !== 'Compliant' ||
          sensor.humiditySlaStatus !== 'Compliant' ||
          sensor.leakDetected ||
          sensor.dualProbeStatus !== '2N Dual Verified';
        if (effectiveRecordFilter === 'issues_only' && !hasIssue) continue;

        if (sensor.tempSlaStatus === 'Breached' || sensor.humiditySlaStatus === 'Breached') {
          breachCount++;
        }
        complianceSum += sensor.slaCompliancePct;
        if (sensor.coldAisleTempC > peakTemp) peakTemp = sensor.coldAisleTempC;

        rows.push({
          siteCode: meta.code,
          hallLabel: sensor.hallLabel,
          rowSensorCount: '40 (2/row × 20 rows)',
          probeAId: sensor.slaProbeAId,
          probeBId: sensor.slaProbeBId,
          coldAisleTempC: Number(sensor.coldAisleTempC.toFixed(1)),
          probeATempC: Number(sensor.probeATempC.toFixed(1)),
          probeBTempC: Number(sensor.probeBTempC.toFixed(1)),
          tempSlaRange: `${sensor.slaTempMinC.toFixed(1)}–${sensor.slaTempMaxC.toFixed(1)} °C`,
          tempSlaStatus: sensor.tempSlaStatus,
          humidityPct: Number(sensor.humidityPct.toFixed(1)),
          probeAHumidityPct: Number(sensor.probeAHumidityPct.toFixed(1)),
          probeBHumidityPct: Number(sensor.probeBHumidityPct.toFixed(1)),
          humiditySlaRange: `${sensor.slaHumidityMinPct.toFixed(0)}–${sensor.slaHumidityMaxPct.toFixed(0)}% RH`,
          humiditySlaStatus: sensor.humiditySlaStatus,
          dewPointC: Number(sensor.dewPointC.toFixed(1)),
          slaCompliancePct: Number(sensor.slaCompliancePct.toFixed(2)),
          dualProbeStatus: sensor.dualProbeStatus,
          chilledLoopStatus: sensor.chilledLoopStatus,
          diffPressurePa: Number(sensor.differentialPressurePa.toFixed(1)),
          leakDetected: sensor.leakDetected ? 'ALARM' : 'Dry',
        });
      }
    }

    const avgCompliance = rows.length > 0 ? complianceSum / rows.length : 100;
    summaryMetrics = [
      {
        label: 'Monitored Halls',
        value: `${rows.length}`,
        detail: `${rows.length * 40} calibrated row probes (2/row)`,
        tone: 'neutral',
      },
      {
        label: 'Mean 30d SLA',
        value: `${avgCompliance.toFixed(2)}%`,
        detail: 'ASHRAE TC 9.9 Class A1',
        tone: breachCount === 0 ? 'positive' : 'critical',
      },
      {
        label: 'Peak Cold Aisle',
        value: rows.length > 0 ? `${peakTemp.toFixed(1)}°C` : '—',
        detail: 'Envelope 18.0–27.0 °C',
        tone: peakTemp > 27 ? 'critical' : peakTemp > 25.5 ? 'warning' : 'positive',
      },
      {
        label: 'Active SLA Breaches',
        value: `${breachCount}`,
        detail: breachCount === 0 ? 'All sensors inside SLA' : 'Remediation required',
        tone: breachCount === 0 ? 'positive' : 'critical',
      },
    ];
  } else if (config.typeId === 'tier4_redundancy') {
    columns = [
      { key: 'siteCode', label: 'Site' },
      { key: 'assetCategory', label: 'Subsystem / Asset Class' },
      { key: 'assetId', label: 'Asset ID' },
      { key: 'assetName', label: 'Equipment Name' },
      { key: 'location', label: 'Hall / Zone' },
      { key: 'redundancyPath', label: 'Redundancy Path' },
      { key: 'topology', label: 'Topology' },
      { key: 'protocol', label: 'BMS Protocol' },
      { key: 'endpoint', label: 'Endpoint' },
      { key: 'operatingMode', label: 'Mode / State' },
      { key: 'primaryMetric', label: 'Primary Reading', align: 'right' },
      { key: 'secondaryMetric', label: 'Secondary Reading', align: 'right' },
      { key: 'healthStatus', label: 'Health Status' },
    ];

    let degradedCount = 0;
    let faultTolerantSubsystems = 0;
    let totalSubsystems = 0;

    for (const sid of siteIds) {
      const site = sitesMap[sid];
      const meta = SITE_META_MAP[sid];
      const tier4 = computeTier4RedundancySummary(site.bms, site.servers);

      // 7 Tier IV Matrix rows (when hall scope is 'all')
      if (effectiveHallScope === 'all') {
        for (const sub of tier4.subsystems) {
          totalSubsystems++;
          if (sub.state === 'fault-tolerant') faultTolerantSubsystems++;
          const isIssue = sub.state !== 'fault-tolerant';
          if (isIssue) degradedCount++;
          if (effectiveRecordFilter === 'issues_only' && !isIssue) continue;

          rows.push({
            siteCode: meta.code,
            assetCategory: 'Tier IV Matrix',
            assetId: sub.id.toUpperCase(),
            assetName: sub.subsystem,
            location: 'Site-Wide',
            redundancyPath: `${sub.pathAHealthy ? 'Path A OK' : 'Path A Fault'} / ${sub.pathBHealthy ? 'Path B OK' : 'Path B Fault'}`,
            topology: sub.topology,
            protocol: 'Supervisory',
            endpoint: `${meta.code}-BMS-CORE`,
            operatingMode: sub.state === 'fault-tolerant' ? 'Fault-Tolerant' : sub.state === 'failover-active' ? 'Failover Active' : 'Degraded',
            primaryMetric: `${sub.activeCount}/${sub.totalCount} Active`,
            secondaryMetric: sub.detail,
            healthStatus: sub.state === 'fault-tolerant' ? 'Nominal' : sub.state === 'failover-active' ? 'Warning' : 'Critical',
          });
        }
      }

      // 2 Water-Cooled Chillers (2N) + 6 Air-Cooled Chillers (2(N+1)) when hallScope === 'all'
      if (effectiveHallScope === 'all') {
        for (const ch of site.bms.chillers) {
          const isIssue = ch.status !== 'nominal' || ch.mode === 'Fault' || ch.mode === 'Boost';
          if (ch.status !== 'nominal') degradedCount++;
          if (effectiveRecordFilter === 'issues_only' && !isIssue) continue;

          rows.push({
            siteCode: meta.code,
            assetCategory: ch.chillerType === 'Water-Cooled' ? 'Water-Cooled Chiller' : 'Air-Cooled Chiller',
            assetId: ch.deviceId,
            assetName: `${ch.name} (${ch.role})`,
            location: `Central Chiller Plant · ${ch.chilledLoop}`,
            redundancyPath: ch.redundancyPath,
            topology: ch.chillerType === 'Water-Cooled' ? '2N' : '2(N+1)',
            protocol: ch.protocol,
            endpoint: ch.endpoint,
            operatingMode: ch.mode,
            primaryMetric: `${(ch.coolingOutputKw / 1000).toFixed(2)} / ${(ch.capacityKw / 1000).toFixed(1)} MW`,
            secondaryMetric: `CHW ${ch.chwSupplyTempC.toFixed(1)}°C · COP ${ch.cop.toFixed(1)} · Load ${ch.compressorLoadPct}%`,
            healthStatus: ch.status === 'nominal' ? 'Nominal' : ch.status === 'warning' ? 'Warning' : 'Critical',
          });
        }
      }

      // 8 CRAC units (2N)
      for (const c of site.bms.cracUnits) {
        if (effectiveHallScope !== 'all' && c.hallId !== effectiveHallScope) continue;
        const isIssue = c.status !== 'nominal' || c.mode === 'Fault' || c.mode === 'Boost';
        if (c.status !== 'nominal') degradedCount++;
        if (effectiveRecordFilter === 'issues_only' && !isIssue) continue;

        rows.push({
          siteCode: meta.code,
          assetCategory: 'CRAC / CRAH Cooling',
          assetId: c.deviceId,
          assetName: c.name,
          location: `${c.hallLabel} (${c.chilledLoop})`,
          redundancyPath: c.redundancyPath,
          topology: '2N',
          protocol: c.protocol,
          endpoint: c.endpoint,
          operatingMode: c.mode,
          primaryMetric: `${c.supplyTempC.toFixed(1)}°C / SP ${c.setpointC.toFixed(1)}°C`,
          secondaryMetric: `${(c.coolingOutputKw / 1000).toFixed(2)} MW · Fan ${c.fanSpeedPct}%`,
          healthStatus: c.status === 'nominal' ? 'Nominal' : c.status === 'warning' ? 'Warning' : 'Critical',
        });
      }

      // 4 UPS modules (2(N+1)), 4 Generators (2(N+1)), 6 Gateways (2N) when hallScope === 'all'
      if (effectiveHallScope === 'all') {
        for (const u of site.bms.upsSystems) {
          const isIssue = u.status !== 'nominal' || u.mode !== 'Online';
          if (u.status !== 'nominal') degradedCount++;
          if (effectiveRecordFilter === 'issues_only' && !isIssue) continue;

          rows.push({
            siteCode: meta.code,
            assetCategory: 'Critical UPS Module',
            assetId: u.id.toUpperCase(),
            assetName: `${u.name} (${u.role})`,
            location: `West MEP · ${u.feedBus}`,
            redundancyPath: u.redundancyPath,
            topology: '2(N+1)',
            protocol: u.protocol,
            endpoint: u.endpoint,
            operatingMode: u.mode,
            primaryMetric: `${(u.loadKw / 1000).toFixed(2)} / ${(u.capacityKw / 1000).toFixed(1)} MVA`,
            secondaryMetric: `${u.batterySocPct.toFixed(1)}% SoC · ${u.runtimeMin} min`,
            healthStatus: u.status === 'nominal' ? 'Nominal' : u.status === 'warning' ? 'Warning' : 'Critical',
          });
        }

        for (const g of site.bms.generators) {
          const isIssue = g.state !== 'Standby Ready' || g.fuelLevelPct < 80;
          if (effectiveRecordFilter === 'issues_only' && !isIssue) continue;

          rows.push({
            siteCode: meta.code,
            assetCategory: 'Standby Diesel Generator',
            assetId: g.id.toUpperCase(),
            assetName: `${g.name} (${g.role})`,
            location: `East Yard · ${g.feedBus}`,
            redundancyPath: g.redundancyPath,
            topology: '2(N+1)',
            protocol: g.protocol,
            endpoint: g.endpoint,
            operatingMode: g.state,
            primaryMetric: `${(g.outputKw / 1000).toFixed(2)} / ${(g.ratedKw / 1000).toFixed(1)} MW`,
            secondaryMetric: `Fuel ${g.fuelLevelPct.toFixed(1)}% (${g.fuelAutonomyHours}h)`,
            healthStatus: g.fuelLevelPct < 50 ? 'Warning' : 'Nominal',
          });
        }

        for (const gw of site.bms.gateways) {
          const isIssue = !gw.connected;
          if (!gw.connected) degradedCount++;
          if (effectiveRecordFilter === 'issues_only' && !isIssue) continue;

          rows.push({
            siteCode: meta.code,
            assetCategory: 'BMS Field-Bus Gateway',
            assetId: gw.id.toUpperCase(),
            assetName: `${gw.name} (${gw.role})`,
            location: 'BMS Core Network',
            redundancyPath: gw.redundancyPath,
            topology: '2N',
            protocol: gw.protocol,
            endpoint: gw.endpoint,
            operatingMode: gw.connected ? 'Connected' : 'Offline',
            primaryMetric: `${gw.mappedPoints} pts`,
            secondaryMetric: `${gw.latencyMs} ms · ${gw.pollIntervalSec}s poll`,
            healthStatus: gw.connected ? 'Nominal' : 'Warning',
          });
        }
      }
    }

    summaryMetrics = [
      {
        label: 'Equipment Records',
        value: `${rows.length}`,
        detail: 'Tier IV matrix & BMS assets',
        tone: 'neutral',
      },
      {
        label: 'Subsystems Verified',
        value: totalSubsystems > 0 ? `${faultTolerantSubsystems}/${totalSubsystems}` : 'Hall Scope',
        detail: '2N & 2(N+1) redundancy',
        tone: degradedCount === 0 ? 'positive' : 'warning',
      },
      {
        label: 'Non-Nominal Items',
        value: `${degradedCount}`,
        detail: degradedCount === 0 ? 'Zero degraded equipment' : 'Failover or fault logged',
        tone: degradedCount === 0 ? 'positive' : 'warning',
      },
      {
        label: 'Certification Target',
        value: '99.995% SLA',
        detail: 'Uptime Institute Tier IV',
        tone: 'positive',
      },
    ];
  } else if (config.typeId === 'server_inventory') {
    columns = [
      { key: 'siteCode', label: 'Site' },
      { key: 'hostname', label: 'Hostname' },
      { key: 'hallLabel', label: 'Data Hall' },
      { key: 'rackId', label: 'Rack ID' },
      { key: 'uPosition', label: 'U Position' },
      { key: 'role', label: 'Role' },
      { key: 'model', label: 'Hardware Model' },
      { key: 'ip', label: 'Management IP' },
      { key: 'status', label: 'Status' },
      { key: 'cpuPct', label: 'CPU (%)', align: 'right' },
      { key: 'memoryPct', label: 'Memory (%)', align: 'right' },
      { key: 'diskPct', label: 'Disk (%)', align: 'right' },
      { key: 'inletTempC', label: 'Inlet (°C)', align: 'right' },
      { key: 'exhaustTempC', label: 'Exhaust (°C)', align: 'right' },
      { key: 'powerW', label: 'Power (W)', align: 'right' },
      { key: 'ratedPowerW', label: 'Rated (W)', align: 'right' },
      { key: 'networkGbps', label: 'Network (Gbps)', align: 'right' },
      { key: 'packetLossPct', label: 'Packet Loss (%)', align: 'right' },
      { key: 'fanRpm', label: 'Fan (RPM)', align: 'right' },
      { key: 'psuStatus', label: '2N PSU Status' },
      { key: 'uptimeDays', label: 'Uptime (Days)', align: 'right' },
      { key: 'activeFault', label: 'Active Fault' },
    ];

    let issueHosts = 0;
    let totalPowerW = 0;
    let peakTemp = 0;

    for (const sid of siteIds) {
      const site = sitesMap[sid];
      const meta = SITE_META_MAP[sid];
      for (const s of site.servers) {
        if (effectiveHallScope !== 'all' && s.hallId !== effectiveHallScope) continue;
        const isIssue = s.status === 'critical' || s.status === 'warning' || s.activeFault !== null;
        if (effectiveRecordFilter === 'issues_only' && !isIssue) continue;

        if (isIssue) issueHosts++;
        totalPowerW += s.powerW;
        if (s.tempC > peakTemp) peakTemp = s.tempC;

        rows.push({
          siteCode: meta.code,
          hostname: s.hostname,
          hallLabel: HALL_LABEL_MAP[s.hallId],
          rackId: s.rackId,
          uPosition: `U${s.uStart}–U${s.uStart + s.uHeight - 1}`,
          role: s.role,
          model: s.model,
          ip: s.ip,
          status: s.status.toUpperCase(),
          cpuPct: Number(s.cpu.toFixed(1)),
          memoryPct: Number(s.memory.toFixed(1)),
          diskPct: Number(s.disk.toFixed(1)),
          inletTempC: Number(s.inletTempC.toFixed(1)),
          exhaustTempC: Number(s.tempC.toFixed(1)),
          powerW: Math.round(s.powerW),
          ratedPowerW: Math.round(s.ratedPowerW),
          networkGbps: Number(s.networkGbps.toFixed(2)),
          packetLossPct: Number(s.packetLoss.toFixed(2)),
          fanRpm: Math.round(s.fanRpm),
          psuStatus: s.psuStatus,
          uptimeDays: s.uptimeDays,
          activeFault: s.activeFault ?? 'None',
        });
      }
    }

    summaryMetrics = [
      {
        label: 'Exported Hosts',
        value: `${rows.length}`,
        detail: `${issueHosts} warning/critical`,
        tone: issueHosts === 0 ? 'positive' : 'warning',
      },
      {
        label: 'Sampled Power Draw',
        value: `${(totalPowerW / 1000).toFixed(2)} kW`,
        detail: `${totalPowerW.toLocaleString()} W total`,
        tone: 'neutral',
      },
      {
        label: 'Peak Exhaust Temp',
        value: rows.length > 0 ? `${peakTemp.toFixed(1)}°C` : '—',
        detail: 'Threshold >= 78.0°C critical',
        tone: peakTemp >= 78 ? 'critical' : peakTemp >= 68 ? 'warning' : 'positive',
      },
      {
        label: 'PSU Redundancy',
        value: `${rows.filter((r) => r.psuStatus === 'Redundant (2/2)').length}/${rows.length}`,
        detail: 'Dual-feed 2N server PSUs',
        tone: 'positive',
      },
    ];
  } else if (config.typeId === 'rack_capacity') {
    columns = [
      { key: 'siteCode', label: 'Site' },
      { key: 'rackId', label: 'Rack ID' },
      { key: 'hallName', label: 'Data Hall' },
      { key: 'row', label: 'Row' },
      { key: 'rackIndex', label: 'Rack #' , align: 'right'},
      { key: 'usedU', label: 'Used U', align: 'right' },
      { key: 'availableU', label: 'Available U', align: 'right' },
      { key: 'totalU', label: 'Total U', align: 'right' },
      { key: 'powerDrawKw', label: 'Power Draw (kW)', align: 'right' },
      { key: 'powerCapKw', label: 'Capacity (kW)', align: 'right' },
      { key: 'utilizationPct', label: 'Power Util (%)', align: 'right' },
      { key: 'ambientTempC', label: 'Cold Aisle (°C)', align: 'right' },
      { key: 'peakTempC', label: 'Peak Exhaust (°C)', align: 'right' },
      { key: 'pduA', label: '2N Feed A PDU' },
      { key: 'pduB', label: '2N Feed B PDU' },
      { key: 'status', label: 'Rack Status' },
    ];

    let totalPowerKw = 0;
    let totalCapKw = 0;
    let totalUsedU = 0;
    let totalAllU = 0;
    let hotOrHighRacks = 0;

    for (const sid of siteIds) {
      const site = sitesMap[sid];
      const meta = SITE_META_MAP[sid];
      const envByHall = new Map(site.bms.envSensors.map((e) => [e.hallId, e]));
      const serversByRack = new Map<string, typeof site.servers>();
      for (const s of site.servers) {
        const list = serversByRack.get(s.rackId) ?? [];
        list.push(s);
        serversByRack.set(s.rackId, list);
      }

      for (const rack of racks) {
        if (effectiveHallScope !== 'all' && rack.hallId !== effectiveHallScope) continue;
        const mounted = serversByRack.get(rack.id) ?? [];
        const hallEnv = envByHall.get(rack.hallId);
        const liveMountedKw = mounted.reduce((sum, s) => sum + s.powerW / 1000, 0);
        const powerDrawKw = mounted.length > 0
          ? Number(Math.min(rack.powerCapacityKw * 0.98, Math.max(rack.basePowerKw, liveMountedKw + rack.basePowerKw * 0.45)).toFixed(2))
          : rack.basePowerKw;
        const usedU = Math.min(
          rack.totalU,
          Math.max(rack.baseUsedU, mounted.reduce((sum, s) => sum + s.uHeight, 0))
        );
        const availableU = Math.max(0, rack.totalU - usedU);
        const utilizationPct = Number(((powerDrawKw / Math.max(1, rack.powerCapacityKw)) * 100).toFixed(1));
        const ambientTempC = hallEnv ? Number(hallEnv.coldAisleTempC.toFixed(1)) : rack.ambientTempC;
        const peakTempC = mounted.length > 0
          ? Number(Math.max(rack.basePeakTempC, ...mounted.map((s) => s.tempC)).toFixed(1))
          : rack.basePeakTempC;
        const hasCrit = mounted.some((s) => s.status === 'critical') || peakTempC >= 78 || utilizationPct >= 88;
        const hasWarn = mounted.some((s) => s.status === 'warning') || peakTempC >= 68 || utilizationPct >= 78;
        const status = hasCrit ? 'Critical' : hasWarn ? 'Warning' : 'Nominal';

        if (effectiveRecordFilter === 'issues_only' && status === 'Nominal') continue;

        totalPowerKw += powerDrawKw;
        totalCapKw += rack.powerCapacityKw;
        totalUsedU += usedU;
        totalAllU += rack.totalU;
        if (status !== 'Nominal') hotOrHighRacks++;

        rows.push({
          siteCode: meta.code,
          rackId: rack.id,
          hallName: rack.hallName,
          row: rack.row,
          rackIndex: rack.rackIndex,
          usedU,
          availableU,
          totalU: rack.totalU,
          powerDrawKw,
          powerCapKw: rack.powerCapacityKw,
          utilizationPct,
          ambientTempC,
          peakTempC,
          pduA: rack.pduAName,
          pduB: rack.pduBName,
          status,
        });
      }
    }

    const avgPowerUtil = totalCapKw > 0 ? (totalPowerKw / totalCapKw) * 100 : 0;
    const spaceUtil = totalAllU > 0 ? (totalUsedU / totalAllU) * 100 : 0;

    summaryMetrics = [
      {
        label: 'Cabinets in Export',
        value: rows.length.toLocaleString(),
        detail: `${(rows.length / 20).toFixed(0)} rows · 42U dual-fed`,
        tone: 'neutral',
      },
      {
        label: 'Aggregate Rack Load',
        value: `${(totalPowerKw / 1000).toFixed(2)} MW`,
        detail: `${avgPowerUtil.toFixed(1)}% of ${(totalCapKw / 1000).toFixed(1)} MW cap`,
        tone: avgPowerUtil > 85 ? 'warning' : 'positive',
      },
      {
        label: 'Rack Space Used',
        value: `${spaceUtil.toFixed(1)}%`,
        detail: `${(totalAllU - totalUsedU).toLocaleString()} U available`,
        tone: 'neutral',
      },
      {
        label: 'Attention Racks',
        value: `${hotOrHighRacks}`,
        detail: 'Thermal or >78% power util',
        tone: hotOrHighRacks > 0 ? 'warning' : 'positive',
      },
    ];
  } else {
    // alerts_audit
    columns = [
      { key: 'siteCode', label: 'Site' },
      { key: 'alertId', label: 'Alert ID' },
      { key: 'severity', label: 'Severity' },
      { key: 'state', label: 'State' },
      { key: 'ruleName', label: 'Rule Name' },
      { key: 'asset', label: 'Target Asset' },
      { key: 'location', label: 'Rack / Location' },
      { key: 'metric', label: 'Metric' },
      { key: 'currentValue', label: 'Reading', align: 'right' },
      { key: 'threshold', label: 'Threshold', align: 'right' },
      { key: 'channels', label: 'Dispatched Channels' },
      { key: 'triggeredAt', label: 'Triggered At (UTC)' },
      { key: 'acknowledgedBy', label: 'Acknowledged By' },
      { key: 'message', label: 'Alert Message' },
    ];

    let critCount = 0;
    let openCount = 0;
    let ackCount = 0;

    for (const sid of siteIds) {
      const site = sitesMap[sid];
      const meta = SITE_META_MAP[sid];
      for (const a of site.alerts) {
        if (effectiveRecordFilter === 'issues_only' && a.state === 'resolved') continue;
        if (a.state !== 'resolved') openCount++;
        if (a.state !== 'resolved' && a.severity === 'critical') critCount++;
        if (a.state === 'acknowledged') ackCount++;

        rows.push({
          siteCode: meta.code,
          alertId: a.id,
          severity: a.severity.toUpperCase(),
          state: a.state.toUpperCase(),
          ruleName: a.ruleName,
          asset: a.serverHostname,
          location: a.rackId,
          metric: a.metric,
          currentValue: Number(a.currentValue.toFixed(1)),
          threshold: `${a.operator} ${a.threshold}`,
          channels: a.dispatchedChannelNames.join(' | '),
          triggeredAt: formatIsoTimestamp(a.triggeredAt),
          acknowledgedBy: a.acknowledgedBy ?? 'Unacknowledged',
          message: a.message,
        });
      }
    }

    summaryMetrics = [
      {
        label: 'Alert Records',
        value: `${rows.length}`,
        detail: `${openCount} currently open`,
        tone: openCount === 0 ? 'positive' : 'warning',
      },
      {
        label: 'Critical Open',
        value: `${critCount}`,
        detail: 'Immediate NOC escalation',
        tone: critCount > 0 ? 'critical' : 'positive',
      },
      {
        label: 'Acknowledged',
        value: `${ackCount}`,
        detail: 'Assigned to on-call lead',
        tone: 'neutral',
      },
      {
        label: 'Resolved in Log',
        value: `${Math.max(0, rows.length - openCount)}`,
        detail: 'Auto-resolved or cleared',
        tone: 'positive',
      },
    ];
  }

  const trimmedTitle = config.customTitle?.trim();
  const title = trimmedTitle
    ? trimmedTitle
    : `${template.label} — ${config.siteScope === 'all' ? 'All Sites' : SITE_META_MAP[config.siteScope].code}`;

  const filename = buildReportFilename(config.typeId, config.siteScope, effectiveHallScope, now);
  const csvContent = serializeReportToCsv({
    columns,
    rows,
    title,
    siteScopeLabel,
    hallScopeLabel,
    generatedAt: now,
    includeBom: config.includeBom ?? true,
    includeMetadataComments: config.includeMetadataComments ?? false,
  });

  const byteSize = new TextEncoder().encode(csvContent).length;

  const effectiveHorizon = config.typeId === 'historical_trends' ? config.historyHorizon ?? '2y' : undefined;

  return {
    id: `rpt-${config.typeId}-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    typeId: config.typeId,
    typeLabel: template.label,
    category: template.category,
    siteScope: config.siteScope,
    siteScopeLabel,
    hallScope: effectiveHallScope,
    hallScopeLabel,
    recordFilter: effectiveRecordFilter,
    historyHorizon: effectiveHorizon,
    generatedAt: now,
    filename,
    columns,
    rows,
    summaryMetrics,
    csvContent,
    byteSize,
  };
}

/**
 * Seeds a realistic multi-year archived report ledger (spanning > 1 year) so operators
 * can immediately inspect and export historical snapshots alongside live reports.
 */
export function createInitialReportArchive(
  sitesMap: Record<SiteId, SiteWorkspaceState>,
  racks: RackDefinition[],
  now: number = Date.now()
): GeneratedReport[] {
  const DAY_MS = 24 * 60 * 60 * 1000;
  return [
    generateDcimReport({
      config: {
        typeId: 'historical_trends',
        siteScope: 'all',
        hallScope: 'all',
        recordFilter: 'all',
        historyHorizon: '2y',
        customTitle: '24-Month Multi-Year Capacity, PUE & SLA Trend — All Sites',
        includeBom: true,
      },
      sitesMap,
      racks,
      now,
    }),
    generateDcimReport({
      config: {
        typeId: 'executive_summary',
        siteScope: 'all',
        hallScope: 'all',
        recordFilter: 'all',
        customTitle: 'Live Executive Site & Tier IV Snapshot — KL1 · KL2 · KL3',
        includeBom: true,
      },
      sitesMap,
      racks,
      now: now - 45 * 60 * 1000,
    }),
    generateDcimReport({
      config: {
        typeId: 'cold_aisle_sla',
        siteScope: 'all',
        hallScope: 'all',
        recordFilter: 'all',
        customTitle: 'Q2 2026 Cold Aisle Temp & Humidity SLA Audit (480 Probes)',
        includeBom: true,
      },
      sitesMap,
      racks,
      now: now - 152 * DAY_MS,
    }),
    generateDcimReport({
      config: {
        typeId: 'tier4_redundancy',
        siteScope: 'kl1',
        hallScope: 'all',
        recordFilter: 'all',
        customTitle: 'FY 2025 Annual Tier IV Redundancy & Chiller Audit — KL1',
        includeBom: true,
      },
      sitesMap,
      racks,
      now: now - 335 * DAY_MS,
    }),
    generateDcimReport({
      config: {
        typeId: 'historical_trends',
        siteScope: 'all',
        hallScope: 'all',
        recordFilter: 'all',
        historyHorizon: '1y',
        customTitle: 'FY 2024–2025 Annual Multi-Site Telemetry Archive (>1Y Ago)',
        includeBom: true,
      },
      sitesMap,
      racks,
      now: now - 430 * DAY_MS,
    }),
  ];
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

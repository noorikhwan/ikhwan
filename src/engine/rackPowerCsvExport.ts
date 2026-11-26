import { escapeCsvCell, formatIsoTimestamp } from './alertCsvExport';
import { RackBmsPowerStat } from './rackPowerEngine';
import { RACK_CRITICAL_POWER_RULE_ID } from './telemetryEngine';
import { ActiveAlert, HallId, RackDefinition, ServerNode } from './types';

export interface BuildAllRacksPowerCsvOptions {
  siteCode?: string;
  exportedAt?: number;
}

export interface AllRacksPowerCsvFilenameOptions {
  siteCode?: string;
  now?: number;
}

const HALL_SORT_ORDER: Record<HallId, number> = {
  'hall-a': 0,
  'hall-b': 1,
  'hall-c': 2,
  'hall-d': 3,
};

export const RACK_POWER_CSV_HEADERS = [
  'Site',
  'Rack ID',
  'Hall',
  'Row',
  'Rack Index',
  'Current Power Draw (kW)',
  'Rated Power Limit (kW)',
  'Power Utilization (%)',
  'Utilization Status',
  'Capacity Exceeded',
  'Over Capacity Margin (kW)',
  '2N Feed A (kW)',
  '2N Feed B (kW)',
  'Apparent Power (kVA)',
  'Power Factor',
  '2N Feed Status',
  'U-Space Used (U)',
  'U-Space Capacity (U)',
  'U-Space Utilization (%)',
  'Active Capacity Alert',
  'Live Telemetry Hosts',
  'Exported At (ISO)',
] as const;

/**
 * Formats a cabinet's real-time power utilization status into an unambiguous
 * operational label suitable for capacity & post-incident CSV reports.
 */
export function formatRackUtilizationStatus(
  powerStat: Pick<RackBmsPowerStat, 'exceedsCapacity' | 'powerBand'> | undefined
): string {
  if (!powerStat) return 'Nominal';
  if (powerStat.exceedsCapacity) return 'Critical (Over Capacity)';
  switch (powerStat.powerBand) {
    case 'Overload':
      return 'Overload (Near Cap)';
    case 'High':
      return 'High';
    case 'Elevated':
      return 'Elevated';
    case 'Nominal':
      return 'Nominal';
    case 'Low':
      return 'Low';
  }
}

/**
 * Generates an RFC-4180 CSV report (UTF-8 BOM + CRLF) of all racks across all
 * data halls with their live BMS power draw, rated capacity, 2N feed telemetry,
 * U-space occupancy, and utilization status.
 */
export function buildAllRacksPowerCsv(
  racks: readonly RackDefinition[],
  powerStatsMap: Record<string, RackBmsPowerStat>,
  servers: readonly ServerNode[] = [],
  alerts: readonly ActiveAlert[] = [],
  options: BuildAllRacksPowerCsvOptions = {}
): string {
  const siteCode = options.siteCode ?? 'KL1';
  const exportedAtIso = formatIsoTimestamp(options.exportedAt ?? Date.now());

  const serversByRack = new Map<string, ServerNode[]>();
  for (const srv of servers) {
    const existing = serversByRack.get(srv.rackId);
    if (existing) existing.push(srv);
    else serversByRack.set(srv.rackId, [srv]);
  }

  const activeCapacityAlertRacks = new Set<string>();
  for (const alert of alerts) {
    if (alert.ruleId === RACK_CRITICAL_POWER_RULE_ID && alert.state !== 'resolved') {
      activeCapacityAlertRacks.add(alert.rackId);
    }
  }

  const orderedRacks = [...racks].sort((a, b) => {
    const hallDiff = (HALL_SORT_ORDER[a.hallId] ?? 99) - (HALL_SORT_ORDER[b.hallId] ?? 99);
    if (hallDiff !== 0) return hallDiff;
    if (a.rowNumber !== b.rowNumber) return a.rowNumber - b.rowNumber;
    return a.rackIndex - b.rackIndex;
  });

  const rows: string[] = [RACK_POWER_CSV_HEADERS.map((h) => escapeCsvCell(h)).join(',')];

  for (const rack of orderedRacks) {
    const power = powerStatsMap[rack.id];
    const mounted = serversByRack.get(rack.id) ?? [];

    const powerKw = power?.powerKw ?? rack.basePowerKw;
    const ratedKw = power?.powerCapacityKw ?? rack.powerCapacityKw;
    const utilizationPct =
      power?.utilizationPct ?? Math.round((powerKw / Math.max(1, ratedKw)) * 100);
    const exceedsCapacity = power?.exceedsCapacity ?? powerKw > ratedKw;
    const overCapacityKw =
      power?.overCapacityKw ?? (exceedsCapacity ? Math.round((powerKw - ratedKw) * 100) / 100 : 0);
    const utilizationStatus = formatRackUtilizationStatus(
      power ?? { exceedsCapacity, powerBand: utilizationPct >= 92 ? 'Overload' : 'Nominal' }
    );

    const usedU =
      mounted.length > 0
        ? mounted.reduce((sum, s) => sum + s.uHeight, 0)
        : rack.baseUsedU;
    const uUtilizationPct = Math.round((usedU / Math.max(1, rack.totalU)) * 100);

    const row = [
      siteCode,
      rack.id,
      rack.hallName,
      rack.row,
      rack.rackIndex,
      Number(powerKw.toFixed(2)),
      Number(ratedKw.toFixed(1)),
      utilizationPct,
      utilizationStatus,
      exceedsCapacity ? 'Yes' : 'No',
      Number(overCapacityKw.toFixed(2)),
      Number((power?.feedAKw ?? powerKw / 2).toFixed(2)),
      Number((power?.feedBKw ?? powerKw / 2).toFixed(2)),
      Number((power?.apparentKva ?? powerKw / 0.98).toFixed(2)),
      Number((power?.powerFactor ?? 0.98).toFixed(2)),
      power?.feedStatus ?? '2N Balanced',
      usedU,
      rack.totalU,
      uUtilizationPct,
      activeCapacityAlertRacks.has(rack.id) ? 'Yes' : 'No',
      mounted.length,
      exportedAtIso,
    ];

    rows.push(row.map((cell) => escapeCsvCell(cell)).join(','));
  }

  return `\uFEFF${rows.join('\r\n')}\r\n`;
}

export function buildAllRacksPowerCsvFilename({
  siteCode = 'KL1',
  now = Date.now(),
}: AllRacksPowerCsvFilenameOptions = {}): string {
  const safeSite = siteCode.replace(/[^a-zA-Z0-9_-]/g, '') || 'DCIM';
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(
    d.getUTCHours()
  )}-${pad(d.getUTCMinutes())}`;
  return `orise-all-racks-power-utilization-${safeSite}-${stamp}.csv`;
}

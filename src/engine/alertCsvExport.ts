import { ActiveAlert, AlertState, Severity } from './types';

export interface BuildAlertsCsvOptions {
  siteCode?: string;
}

export interface AlertsCsvFilenameOptions {
  siteCode?: string;
  stateFilter: AlertState | 'all' | 'open';
  severityFilter: Severity | 'all';
  now?: number;
}

export function formatAlertResolutionStatus(state: AlertState): string {
  switch (state) {
    case 'active':
      return 'Unacknowledged (Open)';
    case 'acknowledged':
      return 'Acknowledged (Open)';
    case 'ignored':
      return 'Ignored (Suppressed)';
    case 'resolved':
      return 'Resolved';
  }
}

export function formatIsoTimestamp(timestampMs: number | null | undefined): string {
  if (typeof timestampMs !== 'number' || !Number.isFinite(timestampMs)) {
    return '';
  }
  return new Date(timestampMs).toISOString();
}

export function computeResolutionMinutes(
  alert: Pick<ActiveAlert, 'triggeredAt' | 'resolvedAt'>
): string {
  if (
    typeof alert.resolvedAt !== 'number' ||
    !Number.isFinite(alert.resolvedAt) ||
    !Number.isFinite(alert.triggeredAt)
  ) {
    return '';
  }
  const diffMin = Math.max(0, (alert.resolvedAt - alert.triggeredAt) / 60000);
  return diffMin.toFixed(1);
}

/**
 * Escapes a single CSV field per RFC 4180 and neutralizes spreadsheet formula injection.
 */
export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let str = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export const ALERTS_CSV_HEADERS = [
  'Alert ID',
  'Site',
  'Severity',
  'Resolution Status',
  'State Code',
  'Rule Name',
  'Affected Hostname',
  'Rack ID',
  'Metric',
  'Observed Value',
  'Threshold Condition',
  'Telemetry Message',
  'Dispatched Channels',
  'Triggered At (ISO)',
  'Acknowledged By',
  'Acknowledged At (ISO)',
  'Ignored By',
  'Ignored At (ISO)',
  'Resolved At (ISO)',
  'Time to Resolve (min)',
] as const;

/**
 * Builds an RFC-4180 CSV report (UTF-8 BOM + CRLF) for the currently visible alerts
 * and their full resolution lifecycle metadata for post-incident reporting.
 */
export function buildAlertsCsv(
  alerts: readonly ActiveAlert[],
  options: BuildAlertsCsvOptions = {}
): string {
  const siteCode = options.siteCode ?? 'DCIM';
  const rows: string[] = [ALERTS_CSV_HEADERS.map((h) => escapeCsvCell(h)).join(',')];

  for (const alert of alerts) {
    const channels =
      alert.dispatchedChannelNames.length > 0
        ? alert.dispatchedChannelNames.join('; ')
        : 'None';

    const row = [
      alert.id,
      siteCode,
      alert.severity.toUpperCase(),
      formatAlertResolutionStatus(alert.state),
      alert.state,
      alert.ruleName,
      alert.serverHostname,
      alert.rackId,
      alert.metric,
      Number.isFinite(alert.currentValue) ? Number(alert.currentValue.toFixed(2)) : '',
      `${alert.operator} ${alert.threshold}`,
      alert.message,
      channels,
      formatIsoTimestamp(alert.triggeredAt),
      alert.acknowledgedBy ?? '',
      formatIsoTimestamp(alert.acknowledgedAt),
      alert.ignoredBy ?? '',
      formatIsoTimestamp(alert.ignoredAt),
      formatIsoTimestamp(alert.resolvedAt),
      computeResolutionMinutes(alert),
    ];

    rows.push(row.map((cell) => escapeCsvCell(cell)).join(','));
  }

  return `\uFEFF${rows.join('\r\n')}\r\n`;
}

export function buildAlertsCsvFilename({
  siteCode = 'DCIM',
  stateFilter,
  severityFilter,
  now = Date.now(),
}: AlertsCsvFilenameOptions): string {
  const safeSite = siteCode.replace(/[^a-zA-Z0-9_-]/g, '') || 'DCIM';
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(
    d.getUTCHours()
  )}-${pad(d.getUTCMinutes())}`;
  return `orise-alerts-${safeSite}-${stateFilter}-${severityFilter}-${stamp}.csv`;
}

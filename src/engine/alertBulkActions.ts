import { ActiveAlert } from './types';

export interface BulkAcknowledgeResult {
  alerts: ActiveAlert[];
  affectedCount: number;
}

export interface BulkIgnoreResult {
  alerts: ActiveAlert[];
  affectedCount: number;
}

export interface BulkClearResult {
  alerts: ActiveAlert[];
  clearedOpenCount: number;
  removedResolvedCount: number;
  affectedCount: number;
}

/**
 * Returns true when an alert requires operator attention (active or acknowledged).
 * Both resolved and ignored alerts are excluded from open incident counts and alarms.
 */
export function isAlertOpen(alert: Pick<ActiveAlert, 'state'>): boolean {
  return alert.state === 'active' || alert.state === 'acknowledged';
}

export function isAlertIgnored(alert: Pick<ActiveAlert, 'state'>): boolean {
  return alert.state === 'ignored';
}

/**
 * Acknowledges all selected alerts that are currently unacknowledged ('active').
 */
export function bulkAcknowledgeAlerts(
  alerts: ActiveAlert[],
  selectedIds: Iterable<string>,
  operatorName: string,
  now: number
): BulkAcknowledgeResult {
  const idSet = new Set(selectedIds);
  if (idSet.size === 0) return { alerts, affectedCount: 0 };

  let affectedCount = 0;
  const nextAlerts = alerts.map((alert) => {
    if (!idSet.has(alert.id) || alert.state !== 'active') return alert;
    affectedCount += 1;
    return {
      ...alert,
      state: 'acknowledged' as const,
      acknowledgedAt: now,
      acknowledgedBy: operatorName,
    };
  });

  return { alerts: affectedCount > 0 ? nextAlerts : alerts, affectedCount };
}

/**
 * Suppresses selected open alerts ('active' or 'acknowledged') into 'ignored' state.
 * Ignored alerts stop sounding alarms, leave the open incident queue, and suppress
 * duplicate re-triggering until explicitly restored or cleared.
 */
export function bulkIgnoreAlerts(
  alerts: ActiveAlert[],
  selectedIds: Iterable<string>,
  operatorName: string,
  now: number
): BulkIgnoreResult {
  const idSet = new Set(selectedIds);
  if (idSet.size === 0) return { alerts, affectedCount: 0 };

  let affectedCount = 0;
  const nextAlerts = alerts.map((alert) => {
    if (!idSet.has(alert.id)) return alert;
    if (alert.state === 'resolved' || alert.state === 'ignored') return alert;
    affectedCount += 1;
    return {
      ...alert,
      state: 'ignored' as const,
      ignoredAt: now,
      ignoredBy: operatorName,
    };
  });

  return { alerts: affectedCount > 0 ? nextAlerts : alerts, affectedCount };
}

/**
 * Clears selected alerts:
 * - Open ('active' | 'acknowledged') and 'ignored' alerts are cleared into 'resolved'
 *   with resolvedAt = now (honoring rule cooldown to avoid immediate re-trigger noise).
 * - Already 'resolved' alerts are purged from the alert table.
 */
export function bulkClearAlerts(
  alerts: ActiveAlert[],
  selectedIds: Iterable<string>,
  now: number
): BulkClearResult {
  const idSet = new Set(selectedIds);
  if (idSet.size === 0) {
    return { alerts, clearedOpenCount: 0, removedResolvedCount: 0, affectedCount: 0 };
  }

  let clearedOpenCount = 0;
  let removedResolvedCount = 0;
  const nextAlerts: ActiveAlert[] = [];

  for (const alert of alerts) {
    if (!idSet.has(alert.id)) {
      nextAlerts.push(alert);
      continue;
    }

    if (alert.state === 'resolved') {
      removedResolvedCount += 1;
      continue;
    }

    clearedOpenCount += 1;
    nextAlerts.push({
      ...alert,
      state: 'resolved',
      resolvedAt: now,
    });
  }

  const affectedCount = clearedOpenCount + removedResolvedCount;
  return {
    alerts: affectedCount > 0 ? nextAlerts : alerts,
    clearedOpenCount,
    removedResolvedCount,
    affectedCount,
  };
}

/**
 * Restores a suppressed ('ignored') alert back to active unacknowledged triage.
 */
export function restoreIgnoredAlert(alerts: ActiveAlert[], alertId: string): ActiveAlert[] {
  let changed = false;
  const next = alerts.map((alert) => {
    if (alert.id !== alertId || alert.state !== 'ignored') return alert;
    changed = true;
    return {
      ...alert,
      state: 'active' as const,
      ignoredAt: null,
      ignoredBy: null,
    };
  });
  return changed ? next : alerts;
}

/**
 * Keeps only selected alert IDs that are still present in the currently visible list.
 */
export function pruneSelectedAlertIds(
  selectedIds: ReadonlySet<string>,
  visibleAlerts: readonly Pick<ActiveAlert, 'id'>[]
): Set<string> {
  if (selectedIds.size === 0) return new Set();
  const visibleSet = new Set(visibleAlerts.map((a) => a.id));
  const next = new Set<string>();
  for (const id of selectedIds) {
    if (visibleSet.has(id)) next.add(id);
  }
  return next;
}

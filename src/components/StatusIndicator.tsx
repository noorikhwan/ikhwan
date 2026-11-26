import { AlertTriangle, CheckCircle2, OctagonAlert, Wrench } from 'lucide-react';
import { AlertState, NodeStatus, Severity } from '../engine/types';

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSec < 10) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export function formatClockTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(
    d.getSeconds()
  ).padStart(2, '0')}`;
}

export function NodeStatusLabel({ status }: { status: NodeStatus }) {
  if (status === 'critical') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400 whitespace-nowrap">
        <OctagonAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Critical
      </span>
    );
  }
  if (status === 'warning') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Warning
      </span>
    );
  }
  if (status === 'maintenance') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
        <Wrench className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Maintenance
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      Nominal
    </span>
  );
}

export function SeverityLabel({ severity }: { severity: Severity | 'info' }) {
  if (severity === 'critical') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400 whitespace-nowrap">
        <OctagonAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Critical
      </span>
    );
  }
  if (severity === 'warning') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Warning
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 whitespace-nowrap">
      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      Notice
    </span>
  );
}

export function AlertStateText({ state }: { state: AlertState }) {
  if (state === 'active') {
    return <span className="text-xs font-medium text-red-700 dark:text-red-400 whitespace-nowrap">Unacknowledged</span>;
  }
  if (state === 'acknowledged') {
    return <span className="text-xs font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap">Acknowledged</span>;
  }
  if (state === 'ignored') {
    return <span className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">Ignored</span>;
  }
  return <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">Resolved</span>;
}

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  ShieldAlert,
  Ticket,
  UserCheck,
  Wrench,
  X,
} from 'lucide-react';
import {
  computeIncidentSlaMetrics,
  formatDurationCompact,
  IncidentWarRoomRecord,
} from '../engine/incidentRunbookEngine';
import { OperatorProfile } from '../engine/shiftEngine';
import { ActiveAlert } from '../engine/types';
import { SeverityLabel } from './StatusIndicator';

interface IncidentWarRoomModalProps {
  open: boolean;
  alert: ActiveAlert | null;
  record: IncidentWarRoomRecord | null;
  siteEngineers: OperatorProfile[];
  activeOperatorName: string;
  onClose: () => void;
  onToggleStep: (alertId: string, stepId: string) => void;
  onAssignEngineer: (alertId: string, engineerId: string, engineerName: string) => void;
  onUpdateNotes: (alertId: string, notes: string) => void;
  onCreateLinkedTicket: (alert: ActiveAlert) => void;
  onRunRemediation: (alert: ActiveAlert) => { ok: boolean; summary: string };
  onResolveAlert: (alertId: string) => void;
  onAppendToShiftHandover: (record: IncidentWarRoomRecord) => void;
}

export function IncidentWarRoomModal({
  open,
  alert,
  record,
  siteEngineers,
  activeOperatorName,
  onClose,
  onToggleStep,
  onAssignEngineer,
  onUpdateNotes,
  onCreateLinkedTicket,
  onRunRemediation,
  onResolveAlert,
  onAppendToShiftHandover,
}: IncidentWarRoomModalProps) {
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [remediationMsg, setRemediationMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRemediationMsg(null);
    const interval = window.setInterval(() => setNowTick(Date.now()), 1000);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open || !alert || !record) return null;

  const sla = computeIncidentSlaMetrics(record, nowTick);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="war-room-modal-title"
      data-testid="incident-war-room-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50"
    >
      <div className="w-full max-w-2xl bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" aria-hidden="true" />
              <SeverityLabel severity={record.severity} />
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                {record.siteCode} · {record.rackId}
              </span>
            </div>
            <h2
              id="war-room-modal-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-50 truncate"
            >
              Incident War Room — {record.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close incident war room"
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Live SLA Strip */}
        <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-800 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50">
          <div className="px-4 py-2.5">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3" aria-hidden="true" />
              MTTA
            </div>
            <div
              data-testid="war-room-mtta"
              className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100"
            >
              {formatDurationCompact(sla.mttaSec)}
            </div>
          </div>
          <div className="px-4 py-2.5">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {record.resolvedAt ? 'Final MTTR' : 'Elapsed Incident Time'}
            </div>
            <div
              data-testid="war-room-elapsed"
              className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100"
            >
              {formatDurationCompact(sla.elapsedSec)}
            </div>
          </div>
          <div className="px-4 py-2.5">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Runbook Progress</div>
            <div
              data-testid="war-room-progress"
              className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[#007A27] dark:text-[#3DCD58]"
            >
              {sla.completedSteps}/{sla.totalSteps} ({sla.completionPct}%)
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Assigned DCO Lead + Quick Incident Actions */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <label
                htmlFor="war-room-assignee"
                className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
              >
                <UserCheck className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
                Assigned On-Call DCO Engineer
              </label>
              <select
                id="war-room-assignee"
                data-testid="war-room-assignee-select"
                value={record.assignedEngineerId}
                onChange={(e) => {
                  const eng = siteEngineers.find((p) => p.id === e.target.value);
                  if (eng) onAssignEngineer(alert.id, eng.id, eng.name);
                }}
                className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 cursor-pointer"
              >
                {siteEngineers.map((eng) => (
                  <option key={eng.id} value={eng.id}>
                    {eng.name} · {eng.role} ({eng.shiftTeam})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                data-testid="war-room-auto-remediate-btn"
                onClick={() => {
                  const res = onRunRemediation(alert);
                  setRemediationMsg(res.summary);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 cursor-pointer whitespace-nowrap"
              >
                <Wrench className="w-3.5 h-3.5" aria-hidden="true" />
                Run Auto-Remediation
              </button>
              <button
                type="button"
                data-testid="war-room-create-ticket-btn"
                onClick={() => onCreateLinkedTicket(alert)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer whitespace-nowrap"
              >
                <Ticket className="w-3.5 h-3.5" aria-hidden="true" />
                {record.linkedTicketId ? `Ticket ${record.linkedTicketId}` : 'Create P1 Ticket'}
              </button>
            </div>
          </div>

          {remediationMsg && (
            <div
              role="status"
              data-testid="war-room-remediation-status"
              className="px-3 py-2 text-xs rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300"
            >
              {remediationMsg}
            </div>
          )}

          {/* Interactive Guided Runbook Checklist */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                Guided Remediation Runbook Checklist
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Sign-off actor: {activeOperatorName}
              </span>
            </div>

            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-[#009530] dark:bg-[#3DCD58] transition-all duration-200"
                style={{ width: `${sla.completionPct}%` }}
              />
            </div>

            <ul className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
              {record.steps.map((step, idx) => (
                <li
                  key={step.id}
                  className={`p-3 transition-colors ${
                    step.completed
                      ? 'bg-emerald-50/40 dark:bg-emerald-950/20'
                      : 'bg-white dark:bg-[#1B2026]'
                  }`}
                >
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      data-testid={`war-room-step-${idx}`}
                      checked={step.completed}
                      onChange={() => onToggleStep(alert.id, step.id)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-[#009530] focus:ring-[#009530] cursor-pointer"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={`text-xs font-medium ${
                            step.completed
                              ? 'line-through text-slate-500 dark:text-slate-400'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {idx + 1}. {step.title}
                        </span>
                        <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                          {step.category}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                        {step.detail}
                      </p>
                      {step.completed && step.completedBy && (
                        <div className="mt-1 font-mono text-[10px] text-[#007A27] dark:text-[#3DCD58]">
                          Signed off by {step.completedBy} ·{' '}
                          {step.completedAt ? new Date(step.completedAt).toLocaleTimeString() : ''}
                        </div>
                      )}
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          {/* Operator Incident Notes */}
          <div className="space-y-1.5">
            <label
              htmlFor="war-room-notes"
              className="block text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              Shift Relief &amp; Root-Cause Notes
            </label>
            <textarea
              id="war-room-notes"
              data-testid="war-room-notes-input"
              rows={2}
              value={record.notes}
              onChange={(e) => onUpdateNotes(alert.id, e.target.value)}
              placeholder="Document physical floor inspection findings, breaker readings, or follow-up actions for incoming shift..."
              className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            data-testid="war-room-append-handover-btn"
            onClick={() => onAppendToShiftHandover(record)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border cursor-pointer whitespace-nowrap transition-colors ${
              record.appendedToHandover
                ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ClipboardCheck className="w-3.5 h-3.5" aria-hidden="true" />
            {record.appendedToHandover ? 'Appended to Shift Handover' : 'Append to Shift Handover'}
          </button>

          <div className="flex items-center gap-2">
            {alert.state !== 'resolved' && (
              <button
                type="button"
                data-testid="war-room-resolve-alert-btn"
                onClick={() => onResolveAlert(alert.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white cursor-pointer whitespace-nowrap"
              >
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                Resolve Incident
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { X } from 'lucide-react';
import { Severity } from '../engine/types';
import { SeverityLabel } from './StatusIndicator';

export interface NotificationToast {
  id: string;
  alertId?: string;
  serverId?: string;
  title: string;
  body: string;
  channelsText?: string;
  severity: Severity | 'info';
}

interface ToastStackProps {
  toasts: NotificationToast[];
  onDismiss: (id: string) => void;
  onDismissAll?: () => void;
  onInspectServer?: (serverId: string) => void;
  onAcknowledgeAlert?: (alertId: string) => void;
}

export function ToastStack({
  toasts,
  onDismiss,
  onDismissAll,
  onInspectServer,
  onAcknowledgeAlert,
}: ToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Automated alert notifications"
      className="fixed top-16 right-3 sm:top-[68px] sm:right-5 z-40 flex flex-col gap-2 w-[calc(100vw-1.5rem)] max-w-sm pointer-events-none"
    >
      {toasts.length > 1 && onDismissAll && (
        <div className="flex justify-end pointer-events-auto">
          <button
            type="button"
            onClick={onDismissAll}
            className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 shadow-xs cursor-pointer"
          >
            Dismiss all ({toasts.length})
          </button>
        </div>
      )}
      {toasts.slice(0, 2).map((t, idx) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-3.5 ${
            idx > 0 ? 'hidden sm:block' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <SeverityLabel severity={t.severity} />
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label={`Dismiss notification ${t.title}`}
              className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
            {t.title}
          </p>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{t.body}</p>
          {t.channelsText && (
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Dispatched: {t.channelsText}
            </p>
          )}
          {(t.serverId || t.alertId) && (
            <div className="mt-2.5 flex items-center gap-2">
              {t.alertId && onAcknowledgeAlert && (
                <button
                  type="button"
                  onClick={() => {
                    onAcknowledgeAlert(t.alertId!);
                    onDismiss(t.id);
                  }}
                  className="px-2.5 py-1 text-xs font-medium rounded-sm bg-[#009530] hover:bg-[#007A27] text-white cursor-pointer"
                >
                  Acknowledge
                </button>
              )}
              {t.serverId && onInspectServer && (
                <button
                  type="button"
                  onClick={() => {
                    onInspectServer(t.serverId!);
                    onDismiss(t.id);
                  }}
                  className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Inspect Node
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

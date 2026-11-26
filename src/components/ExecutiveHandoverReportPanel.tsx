import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Download,
  FileText,
  Printer,
  ShieldAlert,
} from 'lucide-react';
import { ImmutableAuditEntry } from '../engine/enterpriseOpsEngine';
import {
  buildExecutiveShiftHandoverReport,
  exportExecutiveHandoverMarkdown,
} from '../engine/executiveHandoverEngine';
import { ShiftHandoverEntry } from '../engine/shiftEngine';
import { SiteId, SiteWorkspaceState } from '../engine/sites';
import { RackDefinition } from '../engine/types';

interface ExecutiveHandoverReportPanelProps {
  activeSiteId: SiteId;
  site: SiteWorkspaceState;
  racks: RackDefinition[];
  operatorName: string;
  shiftTeam: string;
  shiftSlot: string;
  auditTrail: ImmutableAuditEntry[];
  handoverLog: ShiftHandoverEntry[];
  cloudSynced: boolean;
  cloudSyncedHandoversCount: number;
  onSyncExecutiveHandover?: (notes: string) => void;
}

export function ExecutiveHandoverReportPanel({
  activeSiteId,
  site,
  racks,
  operatorName,
  shiftTeam,
  shiftSlot,
  auditTrail,
  handoverLog,
  cloudSynced,
  cloudSyncedHandoversCount,
  onSyncExecutiveHandover,
}: ExecutiveHandoverReportPanelProps) {
  const [executiveNotes, setExecutiveNotes] = useState(
    'Verified Tier IV 2N electrical bus balance and ASHRAE Class A1 cold-aisle envelopes. Incoming watch to monitor high-density Hall B cabinets and review any pending rebalance tickets.'
  );
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const report = useMemo(
    () =>
      buildExecutiveShiftHandoverReport({
        siteId: activeSiteId,
        site,
        racks,
        operatorName,
        shiftTeam,
        shiftSlot,
        auditTrail,
        handoverLog,
        cloudSyncedHandoversCount,
        executiveNotes,
      }),
    [
      activeSiteId,
      site,
      racks,
      operatorName,
      shiftTeam,
      shiftSlot,
      auditTrail,
      handoverLog,
      cloudSyncedHandoversCount,
      executiveNotes,
    ]
  );

  const handleDownloadMarkdown = () => {
    const md = exportExecutiveHandoverMarkdown(report);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orise-dcim-shift-handover-${report.siteCode.toLowerCase()}-${new Date(
      report.generatedAt
    )
      .toISOString()
      .slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrintPdf = () => {
    window.print();
  };

  const handleCloudSync = () => {
    if (!onSyncExecutiveHandover) return;
    onSyncExecutiveHandover(executiveNotes);
    setSyncNotice(
      cloudSynced
        ? 'Shift handover briefing saved to Firestore cloud & local log.'
        : 'Shift handover briefing saved to local shift log (sign in to enable cloud sync).'
    );
    window.setTimeout(() => setSyncNotice(null), 5000);
  };

  return (
    <div data-testid="executive-handover-report" className="space-y-4">
      {/* Action Toolbar (Hidden in Print) */}
      <div className="print-hidden bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
            Executive Shift Handover Briefing · {report.siteCode}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Print-ready PDF dossier combining live power/PUE KPIs, over-capacity cabinets, open critical alerts, and remediation audit trail.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onSyncExecutiveHandover && (
            <button
              type="button"
              data-testid="handover-sync-cloud-btn"
              onClick={handleCloudSync}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Cloud className="w-3.5 h-3.5" aria-hidden="true" />
              {cloudSynced ? 'Save to Cloud Handover' : 'Log Handover Brief'}
            </button>
          )}
          <button
            type="button"
            data-testid="handover-download-md-btn"
            onClick={handleDownloadMarkdown}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Download .md
          </button>
          <button
            type="button"
            data-testid="handover-print-pdf-btn"
            onClick={handlePrintPdf}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-sm bg-[#009530] hover:bg-[#007A27] text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            Print / Save PDF
          </button>
        </div>
      </div>

      {syncNotice && (
        <div className="print-hidden rounded-sm border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-3.5 py-2 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{syncNotice}</span>
        </div>
      )}

      {/* Printable Executive Briefing Sheet */}
      <article className="print-report-sheet bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-6 space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-[#009530] dark:text-[#3DCD58] font-semibold">
              Orise DCIM · Tier IV Operations Briefing
            </div>
            <h3 className="text-lg font-display font-bold text-slate-900 dark:text-slate-50 mt-0.5">
              Executive Shift Handover Report — {report.siteLabel}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
              {report.location} · Outgoing: {report.operatorName} ({report.shiftTeam} · {report.shiftSlot})
            </p>
          </div>
          <div className="text-right font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            <div>{new Date(report.generatedAt).toLocaleString()}</div>
            <div className="mt-0.5">
              Cloud Handovers Synced: {report.cloudSyncedHandoversCount}
            </div>
          </div>
        </header>

        {/* Live KPI Strip */}
        <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 rounded-sm border border-slate-200 dark:border-slate-800">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">IT Load</div>
            <div className="mt-1 text-lg font-mono font-bold tabular-nums text-slate-900 dark:text-slate-50">
              {report.itLoadMw.toFixed(2)} MW
            </div>
          </div>
          <div className="p-3 rounded-sm border border-slate-200 dark:border-slate-800">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Facility / PUE</div>
            <div className="mt-1 text-lg font-mono font-bold tabular-nums text-slate-900 dark:text-slate-50">
              {report.pue.toFixed(2)}
            </div>
            <div className="text-[10px] font-mono text-slate-500 tabular-nums">
              {report.facilityLoadMw.toFixed(2)} MW total
            </div>
          </div>
          <div className="p-3 rounded-sm border border-slate-200 dark:border-slate-800">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">ASHRAE SLA</div>
            <div className="mt-1 text-lg font-mono font-bold tabular-nums text-slate-900 dark:text-slate-50">
              {report.slaCompliancePct.toFixed(1)}%
            </div>
          </div>
          <div className="p-3 rounded-sm border border-slate-200 dark:border-slate-800">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Open Alerts</div>
            <div className="mt-1 text-lg font-mono font-bold tabular-nums text-red-600 dark:text-red-400">
              {report.openCriticalCount}C / {report.openWarningCount}W
            </div>
          </div>
          <div className="p-3 rounded-sm border border-slate-200 dark:border-slate-800">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Over-Cap Racks</div>
            <div
              className={`mt-1 text-lg font-mono font-bold tabular-nums ${
                report.overCapCount > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-[#009530] dark:text-[#3DCD58]'
              }`}
            >
              {report.overCapCount}
            </div>
          </div>
        </section>

        {/* Editable Shift Handover Brief */}
        <section className="space-y-2">
          <label
            htmlFor="executive-handover-notes"
            className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
          >
            Outgoing Watch Summary &amp; Incoming Directives
          </label>
          <textarea
            id="executive-handover-notes"
            rows={3}
            value={executiveNotes}
            onChange={(e) => setExecutiveNotes(e.target.value)}
            className="print-hidden w-full px-3 py-2 text-xs rounded-sm border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#009530]/30"
          />
          <p className="hidden print-only text-xs text-slate-900 leading-relaxed border border-slate-300 rounded-xs p-3">
            {executiveNotes}
          </p>
        </section>

        {/* Over-Capacity Racks Table */}
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-red-600 dark:text-red-400" aria-hidden="true" />
            Over-Capacity Cabinets ({report.overCapCount})
          </h4>
          {report.overCapRacks.length === 0 ? (
            <p className="text-xs text-slate-600 dark:text-slate-400">
              All 1,600 cabinets on {report.siteCode} are operating within configured capacity thresholds.
            </p>
          ) : (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/70 text-[11px] text-slate-500 dark:text-slate-400 uppercase">
                  <tr>
                    <th className="px-3 py-2">Cabinet</th>
                    <th className="px-3 py-2">Hall</th>
                    <th className="px-3 py-2 text-right">Live Draw</th>
                    <th className="px-3 py-2 text-right">Policy Limit</th>
                    <th className="px-3 py-2 text-right">Overage</th>
                    <th className="px-3 py-2 text-right">Util</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                  {report.overCapRacks.slice(0, 12).map((row) => (
                    <tr key={row.rackId}>
                      <td className="px-3 py-2 font-semibold text-red-700 dark:text-red-400">
                        {row.rackId}
                      </td>
                      <td className="px-3 py-2 font-sans text-slate-700 dark:text-slate-300">
                        {row.hallName}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-900 dark:text-slate-100">
                        {row.powerKw.toFixed(2)} kW
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">
                        {row.effectiveLimitKw.toFixed(1)} kW
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-red-600 dark:text-red-400">
                        +{row.overByKw.toFixed(2)} kW
                      </td>
                      <td className="px-3 py-2 text-right text-slate-900 dark:text-slate-100">
                        {row.utilizationPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Active Alerts & Recent Remediation Audit */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Active Incidents at Handover ({report.openAlerts.length})
            </h4>
            <div className="border border-slate-200 dark:border-slate-800 rounded-sm divide-y divide-slate-200 dark:divide-slate-800">
              {report.openAlerts.length === 0 ? (
                <div className="p-3 text-xs text-slate-500">No open incidents at shift handover.</div>
              ) : (
                report.openAlerts.slice(0, 8).map((a) => (
                  <div key={a.id} className="px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-semibold ${
                          a.severity === 'critical'
                            ? 'text-red-700 dark:text-red-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        [{a.severity.toUpperCase()}] {a.ruleName}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">{a.rackId}</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                      {a.message}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Recent Remediation &amp; Audit Actions ({report.recentAuditActions.length})
            </h4>
            <div className="border border-slate-200 dark:border-slate-800 rounded-sm divide-y divide-slate-200 dark:divide-slate-800">
              {report.recentAuditActions.length === 0 ? (
                <div className="p-3 text-xs text-slate-500">No audit actions recorded yet.</div>
              ) : (
                report.recentAuditActions.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {entry.actor} · <span className="text-slate-500">{entry.category}</span>
                      </span>
                      <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                        {new Date(entry.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                      {entry.action} ({entry.target})
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </article>
    </div>
  );
}

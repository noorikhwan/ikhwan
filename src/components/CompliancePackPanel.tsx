import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileCode2,
  FileText,
  Printer,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { MaintenanceWindow } from '../engine/alertIntelligenceEngine';
import {
  buildComplianceAuditPack,
  ComplianceFrameworkId,
  exportCompliancePackMarkdown,
} from '../engine/compliancePackEngine';
import { ImmutableAuditEntry } from '../engine/enterpriseOpsEngine';
import { SITES, SiteId, SiteWorkspaceState } from '../engine/sites';
import { RackDefinition } from '../engine/types';
import { VisitorRecord } from '../engine/visitorEngine';

interface CompliancePackPanelProps {
  activeSiteId: SiteId;
  sitesMap: Record<SiteId, SiteWorkspaceState>;
  racks: RackDefinition[];
  visitors: VisitorRecord[];
  maintenanceWindows: MaintenanceWindow[];
  auditTrail: ImmutableAuditEntry[];
  auditorName: string;
  onLogAudit?: (category: ImmutableAuditEntry['category'], action: string, target: string) => void;
}

function triggerFileDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function CompliancePackPanel({
  activeSiteId,
  sitesMap,
  racks,
  visitors,
  maintenanceWindows,
  auditTrail,
  auditorName,
  onLogAudit,
}: CompliancePackPanelProps) {
  const [siteScope, setSiteScope] = useState<SiteId | 'all'>(activeSiteId);
  const [framework, setFramework] = useState<ComplianceFrameworkId>('all');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const pack = useMemo(
    () =>
      buildComplianceAuditPack({
        siteScope,
        framework,
        sitesMap,
        racks,
        visitors,
        maintenanceWindows,
        auditTrail,
        auditorName,
        now: Date.now(),
      }),
    [siteScope, framework, sitesMap, racks, visitors, maintenanceWindows, auditTrail, auditorName]
  );

  const handleExportMarkdown = () => {
    const md = exportCompliancePackMarkdown(pack);
    const filename = `${pack.packId.toLowerCase()}-compliance-pack.md`;
    triggerFileDownload(filename, md, 'text/markdown;charset=utf-8');
    setExportNotice(`Exported ${filename} (${pack.controls.length} verified controls).`);
    onLogAudit?.(
      'Protocol',
      `Exported Audit & SLA Compliance Pack (${pack.packId}) as Markdown`,
      pack.scopeLabel
    );
  };

  const handleExportJson = () => {
    const filename = `${pack.packId.toLowerCase()}-compliance-pack.json`;
    triggerFileDownload(filename, JSON.stringify(pack, null, 2), 'application/json;charset=utf-8');
    setExportNotice(`Exported ${filename} (structured auditor evidence JSON).`);
    onLogAudit?.(
      'Protocol',
      `Exported Audit & SLA Compliance Pack (${pack.packId}) as JSON`,
      pack.scopeLabel
    );
  };

  return (
    <div data-testid="compliance-pack-panel" className="space-y-4">
      {/* Header & Controls */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Audit & SLA Compliance Evidence Pack
            </h2>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {pack.packId}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Consolidates ASHRAE Class A1 thermal compliance, Uptime Tier IV 2N power availability,
            MTTA/MTTR response, visitor escort verification, and hash-chained audit logs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Compliance site scope"
            data-testid="compliance-scope-select"
            value={siteScope}
            onChange={(e) => setSiteScope(e.target.value as SiteId | 'all')}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100"
          >
            {SITES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.location}
              </option>
            ))}
            <option value="all">All Campuses (KL1 · KL2 · KL3)</option>
          </select>

          <select
            aria-label="Compliance framework filter"
            data-testid="compliance-framework-select"
            value={framework}
            onChange={(e) => setFramework(e.target.value as ComplianceFrameworkId)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100"
          >
            <option value="all">All Frameworks</option>
            <option value="ashrae_a1">ASHRAE Class A1</option>
            <option value="uptime_tier4">Uptime Tier IV</option>
            <option value="iso_27001">ISO 27001</option>
          </select>

          <button
            type="button"
            data-testid="compliance-export-md-btn"
            onClick={handleExportMarkdown}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            Export Markdown
          </button>

          <button
            type="button"
            data-testid="compliance-export-json-btn"
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap transition-colors"
          >
            <FileCode2 className="w-3.5 h-3.5" />
            Export JSON
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            Print
          </button>
        </div>
      </div>

      {exportNotice && (
        <div
          data-testid="compliance-export-notice"
          className="rounded-lg border border-emerald-200 dark:border-emerald-700/60 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-2"
        >
          <span className="flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5 shrink-0" />
            {exportNotice}
          </span>
          <button
            type="button"
            onClick={() => setExportNotice(null)}
            className="text-[11px] underline hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Executive Compliance KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 p-3.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Composite Score
          </div>
          <div
            className={`mt-1 text-2xl font-bold font-mono tabular-nums ${
              pack.overallScorePct >= 90
                ? 'text-emerald-600 dark:text-emerald-400'
                : pack.overallScorePct >= 75
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {pack.overallScorePct}%
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            {pack.controls.filter((c) => c.status === 'Pass').length}/{pack.controls.length} controls
            passing
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 p-3.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            ASHRAE A1 Thermal
          </div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {pack.ashraeThermalCompliancePct.toFixed(1)}%
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {pack.thermalHotspotRacks} hotspot rack(s)
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 p-3.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Tier IV 2N Power SLA
          </div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {pack.powerAvailabilitySlaPct.toFixed(3)}%
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {pack.overCapacityRacks} over-cap cabinet(s)
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 p-3.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Incident MTTA / MTTR
          </div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {pack.meanTimeToAckMinutes}m / {pack.meanTimeToResolveMinutes}m
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {pack.openCriticalIncidents} open P1 alert(s)
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 p-3.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            ISO 27001 Escort & Audit
          </div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {pack.escortedVisitorCompliancePct.toFixed(0)}%
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {pack.auditHashChainEntries} chained audit events
          </div>
        </div>
      </div>

      {/* Control Verification Matrix */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Control Verification Matrix · {pack.scopeLabel}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Prepared by {pack.auditorName} · Snapshot {pack.generatedAtIso.slice(0, 19).replace('T', ' ')} UTC
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-4">Framework</th>
                <th className="py-2.5 px-3">Control</th>
                <th className="py-2.5 px-3">Requirement & Auditor Evidence</th>
                <th className="py-2.5 px-3">Observed</th>
                <th className="py-2.5 px-3">Target</th>
                <th className="py-2.5 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {pack.controls.map((ctrl) => (
                <tr key={ctrl.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                    {ctrl.framework}
                  </td>
                  <td className="py-3 px-3 font-mono text-[11px] font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                    {ctrl.controlCode}
                  </td>
                  <td className="py-3 px-3 max-w-md">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {ctrl.title}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {ctrl.detail}
                    </div>
                  </td>
                  <td className="py-3 px-3 font-mono tabular-nums text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {ctrl.metricValue}
                  </td>
                  <td className="py-3 px-3 font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {ctrl.targetValue}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1 font-semibold text-xs ${
                        ctrl.status === 'Pass'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : ctrl.status === 'Advisory'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {ctrl.status === 'Pass' ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <ShieldAlert className="w-3.5 h-3.5" />
                      )}
                      {ctrl.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

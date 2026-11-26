import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  Lock,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { buildComplianceEvidencePack } from '../engine/changeComplianceEngine';
import {
  createInitialProtocolConnectors,
  ImmutableAuditEntry,
  ProtocolConnector,
  SmartRackLock,
  verifyAuditChain,
} from '../engine/enterpriseOpsEngine';
import { SITE_META_MAP, SiteId } from '../engine/sites';
import { VisitorRecord } from '../engine/visitorEngine';
import { formatClockTime } from './StatusIndicator';

interface ProtocolsAuditViewProps {
  activeSiteId: SiteId;
  auditTrail: ImmutableAuditEntry[];
  visitors?: VisitorRecord[];
  rackLocks?: SmartRackLock[];
  slaCompliancePct?: number;
  pue?: number;
  onLogAudit: (category: 'Protocol', action: string, target: string) => void;
}

export function ProtocolsAuditView({
  activeSiteId,
  auditTrail,
  visitors = [],
  rackLocks = [],
  slaCompliancePct = 99.98,
  pue = 1.24,
  onLogAudit,
}: ProtocolsAuditViewProps) {
  const [connectorsBySite, setConnectorsBySite] = useState<Record<SiteId, ProtocolConnector[]>>(() => {
    const now = Date.now();
    return {
      kl1: createInitialProtocolConnectors('kl1', now),
      kl2: createInitialProtocolConnectors('kl2', now),
      kl3: createInitialProtocolConnectors('kl3', now),
    };
  });

  const [auditSearch, setAuditSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const connectors = connectorsBySite[activeSiteId];
  const siteCode = SITE_META_MAP[activeSiteId].code;

  const chainCheck = useMemo(() => verifyAuditChain(auditTrail), [auditTrail]);

  const evidencePack = useMemo(
    () =>
      buildComplianceEvidencePack({
        siteId: activeSiteId,
        siteCode,
        auditTrail,
        visitors,
        rackLocks,
        slaCompliancePct,
        pue,
      }),
    [activeSiteId, siteCode, auditTrail, visitors, rackLocks, slaCompliancePct, pue]
  );

  const handleExportEvidenceJson = () => {
    const blob = new Blob([evidencePack.jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${evidencePack.packId.toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onLogAudit('Protocol', `Exported ISO 27001 / SOC2 / Tier IV Evidence Pack (${evidencePack.packId})`, siteCode);
  };

  const handleExportEvidenceMarkdown = () => {
    const blob = new Blob([evidencePack.markdownSummary], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${evidencePack.packId.toLowerCase()}-summary.md`;
    a.click();
    URL.revokeObjectURL(url);
    onLogAudit('Protocol', `Exported Compliance Evidence Summary Markdown (${evidencePack.packId})`, siteCode);
  };

  const filteredAudit = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return auditTrail.filter((e) => {
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        e.id.toLowerCase().includes(q) ||
        e.actor.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        e.target.toLowerCase().includes(q) ||
        e.hash.toLowerCase().includes(q)
      );
    });
  }, [auditTrail, auditSearch, categoryFilter]);

  const handleToggleConnector = (conn: ProtocolConnector) => {
    const nextStatus = conn.status === 'Connected' ? 'Paused' : 'Connected';
    setConnectorsBySite((prev) => ({
      ...prev,
      [activeSiteId]: prev[activeSiteId].map((c) =>
        c.id === conn.id
          ? {
              ...c,
              status: nextStatus,
              latencyMs: nextStatus === 'Connected' ? Math.min(28, c.latencyMs) : 0,
              packetLossPct: nextStatus === 'Connected' ? 0 : c.packetLossPct,
              lastHeartbeatAt: Date.now(),
            }
          : c
      ),
    }));
    onLogAudit(
      'Protocol',
      nextStatus === 'Connected'
        ? `Reconnected ${conn.protocol} connector (${conn.endpoint})`
        : `Paused polling on ${conn.protocol} connector (${conn.endpoint})`,
      conn.name
    );
  };

  const handleExportAuditCsv = () => {
    const header = 'Seq,Audit ID,Timestamp UTC,Site,Actor,Category,Action,Target,Prev Hash,Record Hash';
    const lines = filteredAudit.map(
      (e) =>
        `${e.seq},${e.id},${new Date(e.timestamp).toISOString()},${e.siteCode},"${e.actor}",${e.category},"${e.action.replace(/"/g, '""')}","${e.target}",${e.prevHash},${e.hash}`
    );
    const blob = new Blob([`\uFEFF${[header, ...lines].join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orise-immutable-audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const connectedCount = connectors.filter((c) => c.status === 'Connected').length;
  const totalPoints = connectors.reduce((s, c) => s + c.activePoints, 0);

  return (
    <div className="space-y-5 pb-16" data-testid="protocols-audit-view">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            System Health — Protocol Connectors &amp; Immutable Audit Trail
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Live southbound/northbound telemetry connectors (Modbus TCP, BACnet/IP, SNMPv3, Redfish, MQTT) and hash-chained ISO/SOC2/Tier IV audit ledger
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportAuditCsv}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white cursor-pointer whitespace-nowrap self-start xl:self-auto"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Export Immutable Audit CSV
        </button>
      </div>

      {/* 4-Column KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Live Connectors ({siteCode})</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#007A27] dark:text-[#3DCD58]">
            {connectedCount} / {connectors.length}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Modbus · BACnet · SNMP · Redfish · MQTT</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Active Polled Telemetry Points</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {totalPoints.toLocaleString()}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Real-time BMS + IT registers</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Immutable Audit Chain Integrity</div>
          <div
            data-testid="audit-chain-status"
            className="mt-1 inline-flex items-center gap-1.5 font-mono text-lg font-semibold text-[#007A27] dark:text-[#3DCD58]"
          >
            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
            {chainCheck.valid ? 'HASH VERIFIED' : 'CHAIN TAMPERED'}
          </div>
          <div className="mt-0.5 text-xs font-mono text-slate-500 dark:text-slate-400">
            {chainCheck.checkedCount} chained records verified
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Compliance Readiness</div>
          <div className="mt-1 font-mono text-lg font-semibold text-slate-900 dark:text-slate-50">
            ISO 27001 · SOC2
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Append-only operator action log</div>
        </div>
      </section>

      {/* ISO 27001 / SOC2 / Uptime Tier IV Compliance Evidence Pack */}
      <section
        data-testid="compliance-evidence-pack"
        className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-4 space-y-3"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
              ISO 27001 / SOC2 Type II / Uptime Tier IV Evidence Pack ({evidencePack.packId})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Bundles verified hash-chained operator audit logs, visitor escort records, smart rack lock states, and ASHRAE A1 SLA compliance snapshots.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="export-compliance-md-btn"
              onClick={handleExportEvidenceMarkdown}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151A20] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5 text-[#007A27] dark:text-[#3DCD58]" aria-hidden="true" />
              Export Summary (.md)
            </button>
            <button
              type="button"
              data-testid="export-compliance-pack-btn"
              onClick={handleExportEvidenceJson}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Export Evidence Pack (JSON)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {evidencePack.controlChecks.map((check) => (
            <div
              key={check.controlId}
              className="p-3 rounded-md bg-slate-50 dark:bg-[#151A20] border border-slate-200/80 dark:border-slate-800 space-y-1"
            >
              <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {check.framework} · {check.controlId}
                </span>
                <span
                  className={`inline-flex items-center gap-1 font-semibold ${
                    check.status === 'PASS'
                      ? 'text-[#007A27] dark:text-[#3DCD58]'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {check.status === 'PASS' ? (
                    <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                  )}
                  {check.status}
                </span>
              </div>
              <div className="text-xs font-medium text-slate-900 dark:text-slate-100">{check.title}</div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {check.evidenceSummary}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Protocol Connectors Table */}
      <section className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <Radio className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
          Southbound &amp; Northbound Protocol Integrations — {siteCode}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pl-4 pr-3 font-semibold">Connector &amp; Endpoint</th>
                <th className="py-2.5 px-3 font-semibold">Protocol</th>
                <th className="py-2.5 px-3 font-semibold">Direction</th>
                <th className="py-2.5 px-3 font-semibold text-right">Points</th>
                <th className="py-2.5 px-3 font-semibold text-right">Latency / Loss</th>
                <th className="py-2.5 px-3 font-semibold">Status</th>
                <th className="py-2.5 pl-3 pr-4 font-semibold text-right">Diagnostics</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {connectors.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 pl-4 pr-3">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{c.name}</div>
                    <div className="font-mono text-[11px] text-slate-500">{c.endpoint}</div>
                  </td>
                  <td className="py-3 px-3 font-mono font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {c.protocol}
                  </td>
                  <td className="py-3 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{c.direction}</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                    {c.activePoints.toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                    <span className={c.latencyMs > 100 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-slate-700 dark:text-slate-300'}>
                      {c.latencyMs} ms
                    </span>{' '}
                    <span className="text-slate-400">· {c.packetLossPct.toFixed(2)}% loss</span>
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap font-semibold">
                    <span
                      className={
                        c.status === 'Connected'
                          ? 'text-[#007A27] dark:text-[#3DCD58]'
                          : c.status === 'Degraded'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-500'
                      }
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="py-3 pl-3 pr-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      data-testid={`toggle-connector-${c.id}`}
                      onClick={() => handleToggleConnector(c)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      {c.status === 'Connected' ? (
                        <>
                          <Pause className="w-3 h-3" /> Pause
                        </>
                      ) : c.status === 'Degraded' ? (
                        <>
                          <RefreshCw className="w-3 h-3 text-[#009530]" /> Reconnect
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3 text-[#009530]" /> Resume
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Immutable Audit Trail */}
      <section className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Lock className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
            Immutable Operator &amp; Setpoint Audit Trail ({filteredAudit.length})
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-52">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="search"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search actor, action, hash..."
                className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#111418] text-slate-900 dark:text-slate-100"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-800 dark:text-slate-200"
            >
              <option value="all">All Categories</option>
              <option value="Setpoint">Setpoint</option>
              <option value="Power / SLD">Power / SLD</option>
              <option value="Security">Security</option>
              <option value="CMMS">CMMS</option>
              <option value="Protocol">Protocol</option>
              <option value="Visitor">Visitor</option>
              <option value="Capacity">Capacity</option>
              <option value="Alert">Alert</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[380px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-50 dark:bg-[#15191E] border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-2.5 pl-4 pr-3 font-semibold">Audit ID &amp; Time</th>
                <th className="py-2.5 px-3 font-semibold">Actor &amp; Site</th>
                <th className="py-2.5 px-3 font-semibold">Category</th>
                <th className="py-2.5 px-3 font-semibold">Action &amp; Target</th>
                <th className="py-2.5 pl-3 pr-4 font-semibold text-right">Chain Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filteredAudit.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 pl-4 pr-3 font-mono text-[11px] whitespace-nowrap">
                    <div className="font-semibold text-[#007A27] dark:text-[#3DCD58]">{entry.id}</div>
                    <div className="text-slate-500">{formatClockTime(entry.timestamp)}</div>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{entry.actor}</div>
                    <div className="font-mono text-[11px] text-slate-500">{entry.siteCode}</div>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap font-medium text-slate-700 dark:text-slate-300">
                    {entry.category}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="text-slate-900 dark:text-slate-100">{entry.action}</div>
                    <div className="font-mono text-[11px] text-slate-500">Target: {entry.target}</div>
                  </td>
                  <td className="py-2.5 pl-3 pr-4 text-right font-mono text-[11px] text-slate-500 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-[#009530]" aria-hidden="true" />
                      {entry.hash}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

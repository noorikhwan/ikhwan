import { useState } from 'react';
import {
  ArrowRightLeft,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Package,
  RefreshCw,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import {
  AssetLifecycleRecord,
  createInitialAssets,
  createInitialPlaybooks,
  createInitialPmTasks,
  createInitialSpareParts,
  OpsPlaybook,
  PmScheduleTask,
} from '../engine/enterpriseOpsEngine';
import { SITE_META_MAP, SITES, SiteId } from '../engine/sites';
import {
  advanceRmaStatus,
  consumeSpareForWorkOrder,
  createHardwareRmaRequest,
  createSiteAwareSpares,
  HardwareRmaRecord,
  SiteSpareStock,
  SpareConsumptionEntry,
  transferSpareBetweenSites,
} from '../engine/sparesLifecycleEngine';
import { OpsTicket } from '../engine/ticketEngine';

interface CmmsMopViewProps {
  activeSiteId: SiteId;
  tickets?: OpsTicket[];
  activeOperatorName?: string;
  onLogAudit: (category: 'CMMS', action: string, target: string) => void;
}

type CmmsTab = 'pm' | 'lifecycle' | 'spares' | 'playbooks';

export function CmmsMopView({
  activeSiteId,
  tickets = [],
  activeOperatorName = 'Elena Vance',
  onLogAudit,
}: CmmsMopViewProps) {
  const [subTab, setSubTab] = useState<CmmsTab>('pm');

  const [assetsBySite] = useState<Record<SiteId, AssetLifecycleRecord[]>>(() => ({
    kl1: createInitialAssets('kl1'),
    kl2: createInitialAssets('kl2'),
    kl3: createInitialAssets('kl3'),
  }));
  const [pmBySite, setPmBySite] = useState<Record<SiteId, PmScheduleTask[]>>(() => ({
    kl1: createInitialPmTasks('kl1'),
    kl2: createInitialPmTasks('kl2'),
    kl3: createInitialPmTasks('kl3'),
  }));
  const [spares, setSpares] = useState<SiteSpareStock[]>(() =>
    createSiteAwareSpares(createInitialSpareParts())
  );
  const [consumptionLedger, setConsumptionLedger] = useState<SpareConsumptionEntry[]>([]);
  const [selectedTicketRef, setSelectedTicketRef] = useState<string>('');
  const [transferDraft, setTransferDraft] = useState<{
    partId: string;
    toSiteId: SiteId;
  } | null>(null);
  const [sparesNotice, setSparesNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [rmaRecords, setRmaRecords] = useState<HardwareRmaRecord[]>([]);
  const [playbooks, setPlaybooks] = useState<OpsPlaybook[]>(() => createInitialPlaybooks());
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string>('pb-mop-ups');

  const assets = assetsBySite[activeSiteId];
  const pmTasks = pmBySite[activeSiteId];
  const siteCode = SITE_META_MAP[activeSiteId].code;
  const openTickets = tickets.filter((t) => t.status !== 'Closed' && t.status !== 'Resolved');

  const activePlaybook = playbooks.find((p) => p.id === selectedPlaybookId) ?? playbooks[0];

  const handleCompletePm = (task: PmScheduleTask) => {
    setPmBySite((prev) => ({
      ...prev,
      [activeSiteId]: prev[activeSiteId].map((t) =>
        t.id === task.id
          ? {
              ...t,
              status: 'Completed',
              dueDateLabel: 'Completed just now',
              lastCompletedNote: 'Signed off via Orise CMMS checklist.',
            }
          : t
      ),
    }));
    onLogAudit('CMMS', `Completed preventive maintenance: ${task.title}`, task.equipmentTag);
  };

  const handleIssueSpareToWorkOrder = (part: SiteSpareStock) => {
    const linkedRef =
      selectedTicketRef ||
      openTickets[0]?.id ||
      `PM-${siteCode}-${pmTasks[0]?.equipmentTag ?? 'OPS'}`;
    const res = consumeSpareForWorkOrder({
      spares,
      partId: part.id,
      siteId: activeSiteId,
      qty: 1,
      linkedRef,
      actorName: activeOperatorName,
      now: Date.now(),
    });
    if (!res.ok || !res.entry) {
      setSparesNotice({ ok: false, text: res.error ?? 'Unable to issue spare part.' });
      return;
    }
    setSpares(res.spares);
    setConsumptionLedger((prev) => [res.entry!, ...prev].slice(0, 30));
    setSparesNotice({ ok: true, text: res.entry.notes });
    onLogAudit('CMMS', res.entry.notes, part.sku);
  };

  const handleRestockSpare = (part: SiteSpareStock, qty = 2) => {
    const now = Date.now();
    setSpares((prev) =>
      prev.map((p) => {
        if (p.id !== part.id) return p;
        const nextSiteQty = (p.stockBySite[activeSiteId] ?? 0) + qty;
        return {
          ...p,
          qtyOnHand: activeSiteId === 'kl1' ? nextSiteQty : p.qtyOnHand,
          stockBySite: { ...p.stockBySite, [activeSiteId]: nextSiteQty },
        };
      })
    );
    const entry: SpareConsumptionEntry = {
      id: `rstk-${now.toString(36)}-${part.sku.slice(-4)}`,
      timestamp: now,
      siteId: activeSiteId,
      sku: part.sku,
      partName: part.name,
      qty,
      linkedRef: `PO-RESTOCK-${siteCode}`,
      actorName: activeOperatorName,
      actionType: 'Restocked',
      notes: `Restocked +${qty}x ${part.sku} into ${siteCode} spares cage`,
    };
    setConsumptionLedger((prev) => [entry, ...prev].slice(0, 30));
    setSparesNotice({ ok: true, text: entry.notes });
    onLogAudit('CMMS', entry.notes, part.sku);
  };

  const handleExecuteTransfer = () => {
    if (!transferDraft) return;
    const res = transferSpareBetweenSites({
      spares,
      partId: transferDraft.partId,
      fromSiteId: activeSiteId,
      toSiteId: transferDraft.toSiteId,
      qty: 1,
      actorName: activeOperatorName,
      now: Date.now(),
    });
    if (!res.ok) {
      setSparesNotice({ ok: false, text: res.error ?? 'Transfer failed.' });
      return;
    }
    setSpares(res.spares);
    setConsumptionLedger((prev) => [...res.entries, ...prev].slice(0, 30));
    setTransferDraft(null);
    setSparesNotice({ ok: true, text: res.entries[0]?.notes ?? 'Inter-site transfer logged.' });
    onLogAudit(
      'CMMS',
      `Transferred 1x spare from ${siteCode} to ${SITE_META_MAP[transferDraft.toSiteId].code}`,
      res.entries[0]?.sku ?? transferDraft.partId
    );
  };

  const handleRequestRma = (
    asset: AssetLifecycleRecord,
    requestType: HardwareRmaRecord['requestType']
  ) => {
    const record = createHardwareRmaRequest({
      existing: rmaRecords,
      asset,
      requestType,
      actorName: activeOperatorName,
      now: Date.now(),
    });
    setRmaRecords((prev) => [record, ...prev]);
    onLogAudit(
      'CMMS',
      `Opened ${requestType} (${record.rmaNumber}) for ${asset.assetTag} (${asset.vendor})`,
      asset.assetTag
    );
  };

  const handleAdvanceRma = (id: string) => {
    setRmaRecords((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = advanceRmaStatus(r, Date.now());
        if (next.status !== r.status) {
          onLogAudit('CMMS', `Advanced ${r.rmaNumber} to ${next.status}`, r.assetTag);
        }
        return next;
      })
    );
  };

  const handleTogglePlaybookStep = (pbId: string, stepId: string) => {
    setPlaybooks((prev) =>
      prev.map((pb) => {
        if (pb.id !== pbId) return pb;
        return {
          ...pb,
          steps: pb.steps.map((s) => (s.id === stepId ? { ...s, completed: !s.completed } : s)),
        };
      })
    );
  };

  const lowStockCount = spares.filter((s) => (s.stockBySite[activeSiteId] ?? 0) <= s.minStock).length;
  const eolRiskCount = assets.filter((a) => a.lifecycleStage !== 'Active Warranty').length;

  return (
    <div className="space-y-5 pb-16" data-testid="cmms-mop-view">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Asset Lifecycle, CMMS &amp; SOP / MOP / EOP Playbooks
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Preventive maintenance calendars, warranty &amp; EoL risk tracking, critical spare parts inventory, and executable MOP/EOP procedures
          </p>
        </div>

        <div className="inline-flex items-center p-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] shrink-0">
          {[
            { id: 'pm' as const, label: 'PM Calendar', icon: Calendar },
            { id: 'lifecycle' as const, label: 'Warranty & EoL', icon: ShieldAlert },
            { id: 'spares' as const, label: `Spares (${lowStockCount} Low)`, icon: Package },
            { id: 'playbooks' as const, label: 'SOP / MOP / EOP', icon: BookOpen },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`cmms-tab-${tab.id}`}
                onClick={() => setSubTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#009530] text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Scheduled PM Tasks ({siteCode})</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {pmTasks.filter((t) => t.status !== 'Completed').length} Open
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {pmTasks.filter((t) => t.status === 'Completed').length} completed this cycle
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Warranty / EoL Attention</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
            {eolRiskCount} Assets
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Expiring &lt;90d or End-of-Life</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Critical Spares Reorder Alerts</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {lowStockCount} SKUs
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">At or below minimum stock</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Approved SOP / MOP / EOP Library</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#007A27] dark:text-[#3DCD58]">
            {playbooks.length} Active
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Linked directly to alarms &amp; PMs</div>
        </div>
      </section>

      {/* Active Sub-Tab Body */}
      {subTab === 'pm' && (
        <section className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Wrench className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
            Preventive Maintenance Schedule — {siteCode}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pl-4 pr-3 font-semibold">PM Work Order</th>
                  <th className="py-2.5 px-3 font-semibold">Cadence &amp; Due</th>
                  <th className="py-2.5 px-3 font-semibold">Assignee</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                  <th className="py-2.5 pl-3 pr-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {pmTasks.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 pl-4 pr-3">
                      <div className="font-mono text-[11px] text-[#007A27] dark:text-[#3DCD58]">{t.equipmentTag}</div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{t.title}</div>
                      {t.lastCompletedNote && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{t.lastCompletedNote}</div>
                      )}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="font-medium text-slate-800 dark:text-slate-200">{t.cadence}</div>
                      <div className="font-mono text-[11px] text-slate-500">{t.dueDateLabel}</div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-slate-700 dark:text-slate-300">{t.assignee}</td>
                    <td className="py-3 px-3 whitespace-nowrap font-semibold">
                      <span
                        className={
                          t.status === 'Completed'
                            ? 'text-[#007A27] dark:text-[#3DCD58]'
                            : t.status === 'Due Soon'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-slate-600 dark:text-slate-300'
                        }
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="py-3 pl-3 pr-4 text-right whitespace-nowrap space-x-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPlaybookId(t.linkedPlaybookId);
                          setSubTab('playbooks');
                        }}
                        className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        Open MOP
                      </button>
                      {t.status !== 'Completed' && (
                        <button
                          type="button"
                          data-testid={`complete-pm-${t.id}`}
                          onClick={() => handleCompletePm(t)}
                          className="px-2.5 py-1 rounded bg-[#009530] hover:bg-[#007A27] text-white font-medium cursor-pointer"
                        >
                          Mark Complete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {subTab === 'lifecycle' && (
        <div className="space-y-4">
          <section className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Critical Asset Warranty &amp; End-of-Life Register — {siteCode}
              </span>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                {rmaRecords.length} active RMA / Renewal request(s)
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 pl-4 pr-3 font-semibold">Asset Tag &amp; Equipment</th>
                    <th className="py-2.5 px-3 font-semibold">Vendor</th>
                    <th className="py-2.5 px-3 font-semibold">Warranty Expires</th>
                    <th className="py-2.5 px-3 font-semibold">End-of-Life</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Replacement CapEx</th>
                    <th className="py-2.5 px-3 font-semibold">Lifecycle Stage</th>
                    <th className="py-2.5 pl-3 pr-4 font-semibold text-right">Lifecycle Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {assets.map((a) => {
                    const reqType: HardwareRmaRecord['requestType'] =
                      a.lifecycleStage === 'Active Warranty'
                        ? 'Hardware RMA'
                        : a.lifecycleStage === 'Expiring <90d'
                        ? 'Warranty Renewal'
                        : 'EoL Refresh Quote';
                    return (
                      <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 pl-4 pr-3">
                          <div className="font-mono text-[11px] font-semibold text-[#007A27] dark:text-[#3DCD58]">
                            {a.assetTag}
                          </div>
                          <div className="font-medium text-slate-900 dark:text-slate-100">{a.name}</div>
                        </td>
                        <td className="py-3 px-3 text-slate-700 dark:text-slate-300">{a.vendor}</td>
                        <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300">
                          {a.warrantyExpires}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300">
                          {a.eolDate}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                          ${a.replacementCostUsd.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 font-semibold whitespace-nowrap">
                          <span
                            className={
                              a.lifecycleStage === 'Active Warranty'
                                ? 'text-[#007A27] dark:text-[#3DCD58]'
                                : a.lifecycleStage === 'Expiring <90d'
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-red-600 dark:text-red-400'
                            }
                          >
                            {a.lifecycleStage}
                          </span>
                        </td>
                        <td className="py-3 pl-3 pr-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            data-testid={`request-rma-${a.id}`}
                            onClick={() => handleRequestRma(a, reqType)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" aria-hidden="true" />
                            {reqType}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Active Hardware RMA & Warranty Renewal Tracker */}
          {rmaRecords.length > 0 && (
            <section
              data-testid="hardware-rma-tracker"
              className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-slate-100">
                Active Hardware RMA &amp; Vendor Renewal Pipeline ({rmaRecords.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2 pl-4 pr-3 font-semibold">RMA #</th>
                      <th className="py-2 px-3 font-semibold">Asset &amp; Vendor</th>
                      <th className="py-2 px-3 font-semibold">Type</th>
                      <th className="py-2 px-3 font-semibold text-right">Est. Cost</th>
                      <th className="py-2 px-3 font-semibold">Status</th>
                      <th className="py-2 pl-3 pr-4 font-semibold text-right">Workflow</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {rmaRecords.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2.5 pl-4 pr-3 font-mono font-semibold text-blue-600 dark:text-blue-400">
                          {r.rmaNumber}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {r.assetTag} · {r.assetName}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {r.vendor} · Requested by {r.requestedBy}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                          {r.requestType}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                          ${r.estimatedCostUsd.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-amber-700 dark:text-amber-400">
                          {r.status}
                        </td>
                        <td className="py-2.5 pl-3 pr-4 text-right whitespace-nowrap">
                          {r.status !== 'Completed' ? (
                            <button
                              type="button"
                              data-testid={`advance-rma-${r.id}`}
                              onClick={() => handleAdvanceRma(r.id)}
                              className="px-2.5 py-1 rounded bg-[#009530] hover:bg-[#007A27] text-white font-medium cursor-pointer"
                            >
                              Advance Stage
                            </button>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                              Closed
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {subTab === 'spares' && (
        <div className="space-y-4">
          <section className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Multi-Campus Critical Spare Parts Inventory ({siteCode} Active)
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Track stock across KL1 / KL2 / KL3 cages, transfer spares between campuses, and issue parts directly to active work orders
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label
                  htmlFor="spare-ticket-ref"
                  className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap"
                >
                  Work Order / Ticket:
                </label>
                <select
                  id="spare-ticket-ref"
                  data-testid="spare-workorder-select"
                  value={selectedTicketRef}
                  onChange={(e) => setSelectedTicketRef(e.target.value)}
                  className="px-2.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                >
                  <option value="">Auto-assign ({openTickets[0]?.id ?? `PM-${siteCode}`})</option>
                  {openTickets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.id} · {t.title.slice(0, 32)}
                    </option>
                  ))}
                  {pmTasks.map((pm) => (
                    <option key={pm.id} value={`PM-${pm.equipmentTag}`}>
                      PM-{pm.equipmentTag} · {pm.title.slice(0, 28)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {sparesNotice && (
              <div
                data-testid="spares-action-notice"
                className={`mx-4 mt-3 px-3 py-2 rounded border text-xs flex items-center justify-between gap-2 ${
                  sparesNotice.ok
                    ? 'border-emerald-200 dark:border-emerald-700/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                    : 'border-rose-200 dark:border-rose-700/60 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300'
                }`}
              >
                <span>{sparesNotice.text}</span>
                <button
                  type="button"
                  onClick={() => setSparesNotice(null)}
                  className="underline text-[11px] cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {transferDraft && (
              <div
                data-testid="spare-transfer-bar"
                className="mx-4 mt-3 p-3 rounded border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/30 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2 text-blue-900 dark:text-blue-200">
                  <ArrowRightLeft className="w-4 h-4 shrink-0" />
                  <span>
                    Transfer <strong>1 unit</strong> from <strong>{siteCode}</strong> to:
                  </span>
                  <select
                    data-testid="spare-transfer-dest-select"
                    value={transferDraft.toSiteId}
                    onChange={(e) =>
                      setTransferDraft((d) =>
                        d ? { ...d, toSiteId: e.target.value as SiteId } : null
                      )
                    }
                    className="px-2 py-1 rounded border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono"
                  >
                    {SITES.filter((st) => st.id !== activeSiteId).map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.code} · {st.location}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTransferDraft(null)}
                    className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    data-testid="spare-transfer-confirm-btn"
                    onClick={handleExecuteTransfer}
                    className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
                  >
                    Confirm Transfer
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto mt-2">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 pl-4 pr-3 font-semibold">SKU &amp; Component</th>
                    <th className="py-2.5 px-3 font-semibold">Storage Location</th>
                    <th className="py-2.5 px-2.5 font-semibold text-right">KL1</th>
                    <th className="py-2.5 px-2.5 font-semibold text-right">KL2</th>
                    <th className="py-2.5 px-2.5 font-semibold text-right">KL3</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Min / Cost</th>
                    <th className="py-2.5 pl-3 pr-4 font-semibold text-right">Stock Control ({siteCode})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {spares.map((s) => {
                    const siteQty = s.stockBySite[activeSiteId] ?? 0;
                    const low = siteQty <= s.minStock;
                    const otherSite = SITES.find((st) => st.id !== activeSiteId)?.id ?? 'kl2';
                    return (
                      <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 pl-4 pr-3">
                          <div className="font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            {s.sku}
                          </div>
                          <div className="font-medium text-slate-900 dark:text-slate-100">{s.name}</div>
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{s.location}</td>
                        {(['kl1', 'kl2', 'kl3'] as SiteId[]).map((sid) => {
                          const qty = s.stockBySite[sid] ?? 0;
                          const isCurrent = sid === activeSiteId;
                          return (
                            <td
                              key={sid}
                              className={`py-3 px-2.5 text-right font-mono tabular-nums ${
                                isCurrent ? 'font-bold bg-slate-50/70 dark:bg-slate-800/40' : ''
                              } ${
                                qty <= s.minStock
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-[#007A27] dark:text-[#3DCD58]'
                              }`}
                            >
                              {qty}
                            </td>
                          );
                        })}
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          Min {s.minStock} · ${s.unitCostUsd.toLocaleString()}
                          {low && (
                            <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                              REORDER {siteCode}
                            </div>
                          )}
                        </td>
                        <td className="py-3 pl-3 pr-4 text-right whitespace-nowrap space-x-1.5">
                          <button
                            type="button"
                            data-testid={`spare-issue-${s.id}`}
                            disabled={siteQty === 0}
                            onClick={() => handleIssueSpareToWorkOrder(s)}
                            className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
                          >
                            -1 Issue WO
                          </button>
                          <button
                            type="button"
                            data-testid={`spare-transfer-${s.id}`}
                            disabled={siteQty === 0}
                            onClick={() => setTransferDraft({ partId: s.id, toSiteId: otherSite })}
                            className="px-2 py-1 rounded border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 disabled:opacity-40 cursor-pointer"
                          >
                            Transfer
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestockSpare(s, 2)}
                            className="px-2 py-1 rounded bg-[#009530] hover:bg-[#007A27] text-white font-medium cursor-pointer"
                          >
                            +2 Restock
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Work-Order Consumption & Transfer Ledger */}
          {consumptionLedger.length > 0 && (
            <section
              data-testid="spares-consumption-ledger"
              className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden"
            >
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                <ClipboardList className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58]" />
                Spares Consumption &amp; Inter-Site Transfer Ledger ({consumptionLedger.length})
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {consumptionLedger.slice(0, 8).map((entry) => (
                  <div
                    key={entry.id}
                    className="px-4 py-2 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                        [{entry.actionType}]
                      </span>
                      <span className="text-slate-800 dark:text-slate-100">{entry.notes}</span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-500">
                      {entry.linkedRef} · {entry.actorName}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {subTab === 'playbooks' && activePlaybook && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          <div className="xl:col-span-4 space-y-2">
            {playbooks.map((pb) => {
              const selected = pb.id === activePlaybook.id;
              const done = pb.steps.filter((s) => s.completed).length;
              return (
                <button
                  key={pb.id}
                  type="button"
                  onClick={() => setSelectedPlaybookId(pb.id)}
                  className={`w-full text-left p-3.5 rounded-md border transition-colors cursor-pointer ${
                    selected
                      ? 'border-[#009530] bg-[#009530]/[0.06] dark:bg-[#3DCD58]/[0.09]'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1B2026] hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="font-semibold text-[#007A27] dark:text-[#3DCD58]">{pb.code} · {pb.kind}</span>
                    <span className="text-slate-500">{done}/{pb.steps.length} done</span>
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-900 dark:text-slate-100">{pb.title}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Trigger: {pb.applicableAlarm}
                  </div>
                </button>
              );
            })}
          </div>

          <section className="xl:col-span-8 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-5 space-y-4">
            <div className="pb-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-mono text-xs font-semibold text-[#007A27] dark:text-[#3DCD58]">
                  {activePlaybook.code} · {activePlaybook.kind} · Risk: {activePlaybook.riskLevel} · Est. {activePlaybook.estimatedMinutes} min
                </div>
                <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-50">
                  {activePlaybook.title}
                </h2>
              </div>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                Alarm Link: {activePlaybook.applicableAlarm}
              </span>
            </div>

            <div className="space-y-2.5">
              {activePlaybook.steps.map((step, idx) => (
                <label
                  key={step.id}
                  className={`flex items-start gap-3 p-3 rounded-md border text-xs cursor-pointer transition-colors ${
                    step.completed
                      ? 'border-[#009530]/40 bg-[#009530]/[0.05] text-slate-500 line-through'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#14181D] text-slate-800 dark:text-slate-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={step.completed}
                    onChange={() => handleTogglePlaybookStep(activePlaybook.id, step.id)}
                    className="mt-0.5 rounded-xs border-slate-300 text-[#009530] focus:ring-[#009530]"
                  />
                  <span>
                    <strong className="font-mono mr-1.5">Step {idx + 1}:</strong>
                    {step.text}
                  </span>
                </label>
              ))}
            </div>

            {activePlaybook.steps.every((s) => s.completed) && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-[#009530]/[0.08] border border-[#009530]/30 text-xs font-semibold text-[#006B22] dark:text-[#6EE787]">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                All {activePlaybook.code} procedure steps verified and signed off.
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

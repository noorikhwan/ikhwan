import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  MessageSquarePlus,
  Plus,
  Search,
  Ticket,
  UserCheck,
  X,
} from 'lucide-react';
import { BmsState } from '../engine/bmsTypes';
import { OperatorProfile } from '../engine/shiftEngine';
import { SITES, SiteId } from '../engine/sites';
import {
  NewTicketDraft,
  OpsTicket,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  computeTicketMetrics,
  filterTickets,
  formatSlaRemaining,
  getTicketSlaState,
} from '../engine/ticketEngine';
import { ServerNode } from '../engine/types';
import { formatRelativeTime } from './StatusIndicator';

interface TicketingViewProps {
  activeSiteId: SiteId;
  tickets: OpsTicket[];
  profiles: OperatorProfile[];
  activeProfile: OperatorProfile;
  servers: ServerNode[];
  bms: BmsState;
  onCreateTicket: (draft: NewTicketDraft) => OpsTicket;
  onTransitionStatus: (ticketId: string, nextStatus: TicketStatus, note?: string) => void;
  onAssignTicket: (ticketId: string, assigneeProfileId: string) => void;
  onAddComment: (ticketId: string, body: string) => void;
  onInspectAsset: (assetId: string) => void;
}

function priorityColorClass(priority: TicketPriority): string {
  switch (priority) {
    case 'P1 - Critical':
      return 'text-red-700 dark:text-red-400 font-semibold';
    case 'P2 - High':
      return 'text-amber-700 dark:text-amber-400 font-semibold';
    case 'P3 - Medium':
      return 'text-sky-700 dark:text-sky-400 font-medium';
    case 'P4 - Low':
      return 'text-slate-600 dark:text-slate-400 font-medium';
  }
}

function statusColorClass(status: TicketStatus): string {
  switch (status) {
    case 'Open':
      return 'text-red-700 dark:text-red-400 font-semibold';
    case 'In Progress':
      return 'text-amber-700 dark:text-amber-400 font-semibold';
    case 'Pending Parts':
      return 'text-sky-700 dark:text-sky-400 font-semibold';
    case 'Resolved':
      return 'text-[#009530] dark:text-[#3DCD58] font-semibold';
    case 'Closed':
      return 'text-slate-500 dark:text-slate-400 font-medium';
  }
}

export function TicketingView({
  activeSiteId,
  tickets,
  profiles,
  activeProfile,
  servers,
  bms,
  onCreateTicket,
  onTransitionStatus,
  onAssignTicket,
  onAddComment,
  onInspectAsset,
}: TicketingViewProps) {
  const [siteScope, setSiteScope] = useState<SiteId | 'all'>(activeSiteId);
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<TicketCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(
    () => tickets.find((t) => t.siteId === activeSiteId)?.id ?? tickets[0]?.id ?? null
  );

  // Create Ticket modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftCategory, setDraftCategory] = useState<TicketCategory>('Incident');
  const [draftPriority, setDraftPriority] = useState<TicketPriority>('P2 - High');
  const [draftSiteId, setDraftSiteId] = useState<SiteId>(activeSiteId);
  const [draftAssetValue, setDraftAssetValue] = useState('chw-tank-a|CHW-TANK-A · 180kL Square Buffer Tank & Pump Set');
  const [draftAssigneeId, setDraftAssigneeId] = useState(profiles[0]?.id ?? activeProfile.id);
  const [formError, setFormError] = useState<string | null>(null);

  // Detail comment input state
  const [commentText, setCommentText] = useState('');

  const now = Date.now();

  // Build live selectable infrastructure asset list from active site's BMS + critical servers
  const selectableAssets = useMemo(() => {
    const items: Array<{ id: string; label: string }> = [
      ...bms.chwTankPumpSets.map((p) => ({
        id: p.id,
        label: `${p.name} · 180kL Square Buffer Tank & Pump Set`,
      })),
      ...bms.chillers.map((c) => ({
        id: c.id,
        label: `${c.name} · ${c.chillerType} (${c.chilledLoop})`,
      })),
      ...bms.cracUnits.map((c) => ({
        id: c.id,
        label: `${c.name} · ${c.hallLabel} (${c.coolingType})`,
      })),
      ...bms.upsSystems.map((u) => ({
        id: u.id,
        label: `${u.name} · ${u.feedBus}`,
      })),
      ...bms.generators.map((g) => ({
        id: g.id,
        label: `${g.name} · ${g.feedBus} (8 MW)`,
      })),
      ...servers.slice(0, 12).map((s) => ({
        id: s.id,
        label: `${s.hostname} · Rack ${s.rackId}`,
      })),
      { id: 'facility-general', label: `${activeSiteId.toUpperCase()} General Facility / Security` },
    ];
    return items;
  }, [bms, servers, activeSiteId]);

  const scopedTickets = useMemo(
    () =>
      filterTickets(tickets, {
        siteId: siteScope,
      }),
    [tickets, siteScope]
  );

  const metrics = useMemo(() => computeTicketMetrics(scopedTickets, now), [scopedTickets, now]);

  const filteredTickets = useMemo(
    () =>
      filterTickets(tickets, {
        siteId: siteScope,
        status: statusFilter,
        priority: priorityFilter,
        category: categoryFilter,
        query: searchQuery,
      }),
    [tickets, siteScope, statusFilter, priorityFilter, categoryFilter, searchQuery]
  );

  const selectedTicket = useMemo(
    () =>
      filteredTickets.find((t) => t.id === selectedTicketId) ??
      tickets.find((t) => t.id === selectedTicketId) ??
      filteredTickets[0] ??
      null,
    [filteredTickets, tickets, selectedTicketId]
  );

  const handleOpenCreateModal = () => {
    setDraftSiteId(activeSiteId);
    setDraftTitle('');
    setDraftDescription('');
    setDraftCategory('Incident');
    setDraftPriority('P2 - High');
    if (selectableAssets.length > 0) {
      setDraftAssetValue(`${selectableAssets[0].id}|${selectableAssets[0].label}`);
    }
    setDraftAssigneeId(profiles[0]?.id ?? activeProfile.id);
    setFormError(null);
    setCreateOpen(true);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftTitle.trim()) {
      setFormError('Ticket summary title is required.');
      return;
    }
    if (!draftDescription.trim()) {
      setFormError('Please provide an operational description or procedure note.');
      return;
    }
    const [assetId, assetLabel] = draftAssetValue.split('|');
    const assignee = profiles.find((p) => p.id === draftAssigneeId) ?? activeProfile;
    const created = onCreateTicket({
      siteId: draftSiteId,
      title: draftTitle.trim(),
      description: draftDescription.trim(),
      category: draftCategory,
      priority: draftPriority,
      affectedAssetId: assetId || 'facility-general',
      affectedAssetLabel: assetLabel || `${draftSiteId.toUpperCase()} Facility`,
      requesterName: activeProfile.name,
      assigneeProfileId: assignee.id,
      assigneeName: assignee.name,
    });
    setSiteScope((prev) => (prev === 'all' ? 'all' : created.siteId));
    setStatusFilter('all');
    setPriorityFilter('all');
    setCategoryFilter('all');
    setSelectedTicketId(created.id);
    setCreateOpen(false);
  };

  const handlePostComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !commentText.trim()) return;
    onAddComment(selectedTicket.id, commentText);
    setCommentText('');
  };

  return (
    <div className="space-y-5" data-testid="ticketing-view">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Data Center Operations Ticketing
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Incident triage, change requests, hardware swaps &amp; SLA tracking across KL1, KL2, and KL3
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label="Filter tickets by site scope"
            className="inline-flex items-center p-0.5 rounded-md bg-slate-100 dark:bg-[#1B2026] border border-slate-200 dark:border-slate-700"
          >
            <button
              type="button"
              onClick={() => setSiteScope('all')}
              className={`px-2.5 py-1 text-xs font-medium rounded-sm transition-colors cursor-pointer ${
                siteScope === 'all'
                  ? 'bg-[#009530] text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All Sites
            </button>
            {SITES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSiteScope(s.id)}
                className={`px-2.5 py-1 text-xs font-mono font-medium rounded-sm transition-colors cursor-pointer ${
                  siteScope === s.id
                    ? 'bg-[#009530] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {s.code}
              </button>
            ))}
          </div>
          <button
            type="button"
            data-testid="new-ticket-btn"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            New Ticket
          </button>
        </div>
      </div>

      {/* 4-Column Operations SLA KPI Strip */}
      <section
        aria-label="Operations ticketing metrics"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800"
      >
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Queue</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span
              data-testid="tickets-active-count"
              className="font-mono text-2xl font-semibold text-slate-900 dark:text-slate-50 tabular-nums"
            >
              {metrics.openCount + metrics.inProgressCount + metrics.pendingPartsCount}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {metrics.openCount} Open · {metrics.inProgressCount} In Progress
            </span>
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">P1 Critical Active</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span
              className={`font-mono text-2xl font-semibold tabular-nums ${
                metrics.p1OpenCount > 0
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-slate-900 dark:text-slate-50'
              }`}
            >
              {metrics.p1OpenCount}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">2h Response SLA</span>
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">SLA Compliance</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span
              className={`font-mono text-2xl font-semibold tabular-nums ${
                metrics.slaBreachedCount > 0
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-[#009530] dark:text-[#3DCD58]'
              }`}
            >
              {metrics.slaCompliancePct.toFixed(1)}%
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {metrics.slaAtRiskCount} At Risk · {metrics.slaBreachedCount} Overdue
            </span>
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Resolved / Closed</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span
              data-testid="tickets-resolved-count"
              className="font-mono text-2xl font-semibold text-slate-900 dark:text-slate-50 tabular-nums"
            >
              {metrics.resolvedCount}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              of {metrics.total} Total Tickets
            </span>
          </div>
        </div>
      </section>

      {/* Filter & Search Toolbar */}
      <div className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-3 flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <label htmlFor="ticket-search" className="sr-only">
            Search tickets by ID, summary, asset, or assignee
          </label>
          <input
            id="ticket-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ticket ID, summary, asset, or engineer..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-sm border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#14181D] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
          />
        </div>

        <label className="sr-only" htmlFor="ticket-status-filter">
          Filter by status
        </label>
        <select
          id="ticket-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TicketStatus | 'all')}
          className="px-2.5 py-1.5 text-xs rounded-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14181D] text-slate-800 dark:text-slate-200 cursor-pointer"
        >
          <option value="all">All Statuses</option>
          {TICKET_STATUSES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="ticket-priority-filter">
          Filter by priority
        </label>
        <select
          id="ticket-priority-filter"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as TicketPriority | 'all')}
          className="px-2.5 py-1.5 text-xs rounded-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14181D] text-slate-800 dark:text-slate-200 cursor-pointer"
        >
          <option value="all">All Priorities</option>
          {TICKET_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="ticket-category-filter">
          Filter by category
        </label>
        <select
          id="ticket-category-filter"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as TicketCategory | 'all')}
          className="px-2.5 py-1.5 text-xs rounded-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14181D] text-slate-800 dark:text-slate-200 cursor-pointer"
        >
          <option value="all">All Categories</option>
          {TICKET_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Main Split Workspace: Left 7-col Queue Table + Right 5-col Ticket Inspector & Worklog */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <section
          aria-label="Operations ticket queue"
          className="xl:col-span-7 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Ticket className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Operations Ticket Queue ({filteredTickets.length})
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {siteScope === 'all' ? 'KL1 · KL2 · KL3' : siteScope.toUpperCase()}
            </span>
          </div>

          {filteredTickets.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                No tickets match the current filters
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Clear filters or open a new operations ticket to track work.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 pl-4 pr-2">Ticket</th>
                    <th className="py-2.5 px-2">Priority</th>
                    <th className="py-2.5 px-2">Status</th>
                    <th className="py-2.5 px-2">Assignee</th>
                    <th className="py-2.5 pl-2 pr-4 text-right">SLA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredTickets.map((t) => {
                    const isSelected = selectedTicket?.id === t.id;
                    const slaState = getTicketSlaState(t, now);
                    return (
                      <tr
                        key={t.id}
                        data-testid={`ticket-row-${t.id}`}
                        className={`transition-colors ${
                          isSelected
                            ? 'bg-emerald-50/70 dark:bg-emerald-950/25'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-2.5 pl-4 pr-2 max-w-[280px]">
                          <button
                            type="button"
                            onClick={() => setSelectedTicketId(t.id)}
                            className="text-left w-full group cursor-pointer"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-semibold text-[#009530] dark:text-[#3DCD58]">
                                {t.id}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                · {t.category}
                              </span>
                            </div>
                            <div className="mt-0.5 font-medium text-slate-900 dark:text-slate-100 group-hover:text-[#009530] dark:group-hover:text-[#3DCD58] line-clamp-1">
                              {t.title}
                            </div>
                            <div className="mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                              {t.affectedAssetLabel}
                            </div>
                          </button>
                        </td>
                        <td className={`py-2.5 px-2 whitespace-nowrap ${priorityColorClass(t.priority)}`}>
                          {t.priority.split(' - ')[0]}
                        </td>
                        <td className={`py-2.5 px-2 whitespace-nowrap ${statusColorClass(t.status)}`}>
                          {t.status}
                        </td>
                        <td className="py-2.5 px-2 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {t.assigneeName}
                        </td>
                        <td className="py-2.5 pl-2 pr-4 text-right font-mono tabular-nums whitespace-nowrap">
                          <span
                            className={
                              slaState === 'breached'
                                ? 'text-red-700 dark:text-red-400 font-semibold'
                                : slaState === 'at-risk'
                                ? 'text-amber-700 dark:text-amber-400 font-semibold'
                                : slaState === 'met'
                                ? 'text-[#009530] dark:text-[#3DCD58]'
                                : 'text-slate-600 dark:text-slate-400'
                            }
                          >
                            {formatSlaRemaining(t, now)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Right 5 cols: Selected Ticket Detail, Workflow Controls & Worklog */}
        <section
          aria-label="Selected ticket details"
          data-testid="ticket-detail-panel"
          className="xl:col-span-5 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden"
        >
          {!selectedTicket ? (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
              Select a ticket from the queue to inspect workflow details and worklog history.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {/* Header */}
              <div className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                      <span className="font-semibold text-[#009530] dark:text-[#3DCD58]">
                        {selectedTicket.id}
                      </span>
                      <span className="text-slate-300 dark:text-slate-700">·</span>
                      <span className={priorityColorClass(selectedTicket.priority)}>
                        {selectedTicket.priority}
                      </span>
                      <span className="text-slate-300 dark:text-slate-700">·</span>
                      <span
                        data-testid="selected-ticket-status"
                        className={statusColorClass(selectedTicket.status)}
                      >
                        {selectedTicket.status}
                      </span>
                    </div>
                    <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                      {selectedTicket.title}
                    </h3>
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {selectedTicket.description}
                </p>

                {/* Metadata Grid */}
                <dl className="grid grid-cols-2 gap-2.5 pt-2 text-xs border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">Affected Asset</dt>
                    <dd className="mt-0.5 flex items-center gap-1 font-mono text-slate-900 dark:text-slate-100">
                      <span className="truncate">{selectedTicket.affectedAssetLabel}</span>
                      {selectedTicket.affectedAssetId !== 'facility-general' && (
                        <button
                          type="button"
                          onClick={() => onInspectAsset(selectedTicket.affectedAssetId)}
                          aria-label={`Inspect ${selectedTicket.affectedAssetLabel}`}
                          className="text-[#009530] dark:text-[#3DCD58] hover:underline shrink-0 cursor-pointer"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">SLA Status</dt>
                    <dd className="mt-0.5 inline-flex items-center gap-1 font-mono text-slate-900 dark:text-slate-100">
                      <Clock className="w-3 h-3 text-slate-400" aria-hidden="true" />
                      {formatSlaRemaining(selectedTicket, now)}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">Category &amp; Site</dt>
                    <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                      {selectedTicket.category} · {selectedTicket.siteId.toUpperCase()}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">Requester</dt>
                    <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                      {selectedTicket.requesterName} · {formatRelativeTime(selectedTicket.createdAt)}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Workflow Transitions & Assignee Controls */}
              <div className="p-4 space-y-3 bg-slate-50/70 dark:bg-[#14181D]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="ticket-detail-assignee"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
                    Assigned Engineer
                  </label>
                  <select
                    id="ticket-detail-assignee"
                    value={selectedTicket.assigneeProfileId}
                    onChange={(e) => onAssignTicket(selectedTicket.id, e.target.value)}
                    className="px-2.5 py-1 text-xs rounded-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-900 dark:text-slate-100 cursor-pointer"
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.shiftTeam})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {selectedTicket.status !== 'In Progress' &&
                    selectedTicket.status !== 'Resolved' &&
                    selectedTicket.status !== 'Closed' && (
                      <button
                        type="button"
                        onClick={() => onTransitionStatus(selectedTicket.id, 'In Progress')}
                        className="px-2.5 py-1.5 text-xs font-medium rounded-sm bg-amber-600 hover:bg-amber-700 text-white transition-colors cursor-pointer"
                      >
                        Start Work
                      </button>
                    )}

                  {selectedTicket.status === 'In Progress' && (
                    <button
                      type="button"
                      onClick={() => onTransitionStatus(selectedTicket.id, 'Pending Parts')}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-sm border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-950/70 transition-colors cursor-pointer"
                    >
                      Pending Parts
                    </button>
                  )}

                  {selectedTicket.status !== 'Resolved' && selectedTicket.status !== 'Closed' && (
                    <button
                      type="button"
                      onClick={() => onTransitionStatus(selectedTicket.id, 'Resolved')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-sm bg-[#009530] hover:bg-[#007A27] text-white transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Resolve Ticket
                    </button>
                  )}

                  {selectedTicket.status === 'Resolved' && (
                    <button
                      type="button"
                      onClick={() => onTransitionStatus(selectedTicket.id, 'Closed')}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-sm bg-[#252A30] hover:bg-[#1D2126] text-white transition-colors cursor-pointer"
                    >
                      Close Ticket
                    </button>
                  )}

                  {(selectedTicket.status === 'Resolved' || selectedTicket.status === 'Closed') && (
                    <button
                      type="button"
                      onClick={() => onTransitionStatus(selectedTicket.id, 'Open')}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </div>

              {/* Activity & Worklog Timeline */}
              <div className="p-4 space-y-3">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Worklog &amp; Audit Trail ({selectedTicket.comments.length})
                </div>

                <ul className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                  {selectedTicket.comments.map((cmt) => (
                    <li
                      key={cmt.id}
                      className="rounded-sm border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-[#14181D] p-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {cmt.authorName}
                        </span>
                        <span className="font-mono text-slate-500 dark:text-slate-400">
                          {formatRelativeTime(cmt.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-700 dark:text-slate-300 leading-relaxed">
                        {cmt.body}
                      </p>
                    </li>
                  ))}
                </ul>

                <form onSubmit={handlePostComment} className="flex items-center gap-2 pt-1">
                  <label htmlFor="ticket-worklog-input" className="sr-only">
                    Add worklog update
                  </label>
                  <input
                    id="ticket-worklog-input"
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add engineering note or handover update..."
                    className="flex-1 min-w-0 px-3 py-1.5 text-xs rounded-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#14181D] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
                  />
                  <button
                    type="submit"
                    disabled={!commentText.trim()}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-sm bg-[#009530] hover:bg-[#007A27] text-white transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" aria-hidden="true" />
                    Post
                  </button>
                </form>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Create New Ticket Dialog */}
      {createOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create new operations ticket"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60"
        >
          <div className="w-full max-w-lg bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-700 rounded-md shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 bg-[#1D2126] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ticket className="w-4 h-4 text-[#3DCD58]" aria-hidden="true" />
                <h2 className="text-sm font-semibold">Create Operations Ticket</h2>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label="Close create ticket dialog"
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4 text-xs">
              {formError && (
                <div
                  role="alert"
                  className="flex items-center gap-2 p-2.5 rounded-sm border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label htmlFor="new-ticket-title" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Summary Title *
                </label>
                <input
                  id="new-ticket-title"
                  type="text"
                  value={draftTitle}
                  onChange={(e) => {
                    setDraftTitle(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="e.g. Inspect Rooftop Air Chiller CHA-A4 fan bearing vibration"
                  className="w-full px-3 py-2 rounded-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#14181D] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="new-ticket-site" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Site
                  </label>
                  <select
                    id="new-ticket-site"
                    value={draftSiteId}
                    onChange={(e) => setDraftSiteId(e.target.value as SiteId)}
                    className="w-full px-2.5 py-2 rounded-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#14181D] text-slate-900 dark:text-slate-100"
                  >
                    {SITES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="new-ticket-priority" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Priority (SLA)
                  </label>
                  <select
                    id="new-ticket-priority"
                    value={draftPriority}
                    onChange={(e) => setDraftPriority(e.target.value as TicketPriority)}
                    className="w-full px-2.5 py-2 rounded-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#14181D] text-slate-900 dark:text-slate-100"
                  >
                    {TICKET_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="new-ticket-category" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    id="new-ticket-category"
                    value={draftCategory}
                    onChange={(e) => setDraftCategory(e.target.value as TicketCategory)}
                    className="w-full px-2.5 py-2 rounded-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#14181D] text-slate-900 dark:text-slate-100"
                  >
                    {TICKET_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="new-ticket-asset" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Affected Infrastructure Asset
                  </label>
                  <select
                    id="new-ticket-asset"
                    value={draftAssetValue}
                    onChange={(e) => setDraftAssetValue(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#14181D] text-slate-900 dark:text-slate-100"
                  >
                    {selectableAssets.map((a) => (
                      <option key={a.id} value={`${a.id}|${a.label}`}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="new-ticket-assignee" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Assign Engineer
                  </label>
                  <select
                    id="new-ticket-assignee"
                    value={draftAssigneeId}
                    onChange={(e) => setDraftAssigneeId(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#14181D] text-slate-900 dark:text-slate-100"
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.shiftTeam})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="new-ticket-description" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Description &amp; Impact Notes *
                </label>
                <textarea
                  id="new-ticket-description"
                  rows={3}
                  value={draftDescription}
                  onChange={(e) => {
                    setDraftDescription(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="Describe symptoms, Tier IV isolation requirements, or spare parts needed..."
                  className="w-full px-3 py-2 rounded-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#14181D] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="px-3.5 py-2 rounded-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="submit-new-ticket-btn"
                  className="px-4 py-2 rounded-sm bg-[#009530] hover:bg-[#007A27] text-white font-medium cursor-pointer"
                >
                  Create Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

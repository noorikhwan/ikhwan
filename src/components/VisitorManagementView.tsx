import { useMemo, useState } from 'react';
import {
  Ban,
  Car,
  CheckCircle2,
  Download,
  IdCard,
  LogIn,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  UserCheck,
  Wrench,
  X,
} from 'lucide-react';
import { OperatorProfile } from '../engine/shiftEngine';
import { SITES, SiteId } from '../engine/sites';
import {
  ACCESS_ZONES,
  AccessZoneId,
  CheckInResult,
  VISITOR_PARKING_BAYS,
  VISITOR_TYPES,
  VisitorDraft,
  VisitorRecord,
  VisitorStatus,
  VisitorType,
  computeVisitorStats,
  exportVisitorsCsv,
  filterVisitors,
  validateVisitorDraft,
} from '../engine/visitorEngine';
import { formatClockTime, formatRelativeTime } from './StatusIndicator';

interface VisitorManagementViewProps {
  activeSiteId: SiteId;
  visitors: VisitorRecord[];
  profiles: OperatorProfile[];
  activeProfile: OperatorProfile;
  onRegisterVisitor: (draft: VisitorDraft) => VisitorRecord;
  onUpdateCompliance: (
    visitorId: string,
    patch: Partial<Pick<VisitorRecord, 'ndaSigned' | 'safetyBriefed' | 'biometricVerified' | 'parkingBay'>>
  ) => void;
  onCheckInVisitor: (visitorId: string) => CheckInResult;
  onCheckOutVisitor: (visitorId: string, note?: string) => void;
  onRevokeVisitor: (visitorId: string, reason: string) => void;
}

function visitorStatusStyle(status: VisitorStatus): string {
  switch (status) {
    case 'Checked In':
      return 'text-[#007A27] dark:text-[#3DCD58] font-semibold';
    case 'Pre-Approved':
      return 'text-amber-700 dark:text-amber-400 font-semibold';
    case 'Checked Out':
      return 'text-slate-600 dark:text-slate-400 font-medium';
    default:
      return 'text-red-700 dark:text-red-400 font-semibold';
  }
}

function createEmptyDraft(siteId: SiteId, defaultEscort: OperatorProfile): VisitorDraft {
  return {
    siteId,
    fullName: '',
    company: '',
    email: '',
    phone: '',
    idNumber: '',
    visitorType: 'Vendor / OEM Engineer',
    purpose: '',
    accessZones: ['Admin Office & NOC'],
    escortProfileId: defaultEscort.id,
    escortName: defaultEscort.name,
    escortRequired: true,
    vehiclePlate: '',
    parkingBay: 'VP-04',
    equipmentManifest: '',
    ndaSigned: true,
    safetyBriefed: false,
    biometricVerified: false,
    durationHours: 4,
  };
}

export function VisitorManagementView({
  activeSiteId,
  visitors,
  profiles,
  activeProfile,
  onRegisterVisitor,
  onUpdateCompliance,
  onCheckInVisitor,
  onCheckOutVisitor,
  onRevokeVisitor,
}: VisitorManagementViewProps) {
  const [siteScope, setSiteScope] = useState<SiteId | 'all'>(activeSiteId);
  const [statusFilter, setStatusFilter] = useState<VisitorStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<VisitorType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateNotice, setGateNotice] = useState<string | null>(null);
  const [checkoutNote, setCheckoutNote] = useState('');
  const [revokeReason, setRevokeReason] = useState('');
  const [showRevokeForm, setShowRevokeForm] = useState(false);

  // Pre-registration modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<VisitorDraft>(() => createEmptyDraft(activeSiteId, activeProfile));
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});

  const now = Date.now();

  const stats = useMemo(
    () => computeVisitorStats(visitors, siteScope, now),
    [visitors, siteScope, now]
  );

  const filteredVisitors = useMemo(
    () =>
      filterVisitors(visitors, {
        siteScope,
        status: statusFilter,
        visitorType: typeFilter,
        search,
      }),
    [visitors, siteScope, statusFilter, typeFilter, search]
  );

  const selectedVisitor = useMemo(() => {
    if (selectedId) {
      const exact = filteredVisitors.find((v) => v.id === selectedId);
      if (exact) return exact;
    }
    return filteredVisitors[0] ?? null;
  }, [filteredVisitors, selectedId]);

  const handleOpenModal = () => {
    setDraft(createEmptyDraft(siteScope === 'all' ? activeSiteId : siteScope, activeProfile));
    setDraftErrors({});
    setModalOpen(true);
  };

  const handleToggleZone = (zone: AccessZoneId) => {
    setDraft((prev) => {
      const exists = prev.accessZones.includes(zone);
      return {
        ...prev,
        accessZones: exists
          ? prev.accessZones.filter((z) => z !== zone)
          : [...prev.accessZones, zone],
      };
    });
  };

  const handleSubmitRegistration = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateVisitorDraft(draft);
    if (!validation.valid) {
      setDraftErrors(validation.errors as Record<string, string>);
      return;
    }
    const created = onRegisterVisitor(draft);
    setModalOpen(false);
    setSelectedId(created.id);
    setSiteScope(created.siteId);
    setStatusFilter('all');
    setGateError(null);
    setGateNotice(`Pre-registered ${created.fullName} (${created.id}). Ready for mantrap verification.`);
  };

  const handleTriggerCheckIn = (visitor: VisitorRecord) => {
    setGateError(null);
    setGateNotice(null);
    const result = onCheckInVisitor(visitor.id);
    if (!result.ok) {
      setGateError(result.error ?? 'Check-in blocked by security policy.');
      return;
    }
    setGateNotice(
      `${visitor.fullName} checked in successfully — issued temporary RFID badge ${result.badgeNumber}.`
    );
  };

  const handleTriggerCheckOut = (visitor: VisitorRecord) => {
    setGateError(null);
    onCheckOutVisitor(visitor.id, checkoutNote);
    setCheckoutNote('');
    setGateNotice(
      `${visitor.fullName} checked out — RFID badge ${visitor.badgeNumber ?? ''} returned and deactivated.`
    );
  };

  const handleTriggerRevoke = (visitor: VisitorRecord) => {
    setGateError(null);
    onRevokeVisitor(visitor.id, revokeReason);
    setRevokeReason('');
    setShowRevokeForm(false);
    setGateNotice(`Access revoked for ${visitor.fullName} (${visitor.id}).`);
  };

  const handleExportCsv = () => {
    const csv = exportVisitorsCsv(filteredVisitors);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `orise-visitors-${siteScope}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 pb-16" data-testid="visitor-management-view">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Data Center Visitor Management
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Mantrap access control, NDA &amp; biometric clearance, RFID badge issuance, and escort audit log
          </p>
        </div>

        <div className="flex flex-wrap xl:flex-nowrap items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label="Filter visitors by site"
            className="inline-flex items-center p-0.5 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md shrink-0"
          >
            <button
              type="button"
              onClick={() => setSiteScope('all')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-sm transition-colors whitespace-nowrap cursor-pointer ${
                siteScope === 'all'
                  ? 'bg-[#009530] text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              All Sites
            </button>
            {SITES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSiteScope(s.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-sm transition-colors whitespace-nowrap cursor-pointer ${
                  siteScope === s.id
                    ? 'bg-[#009530] text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {s.code}
              </button>
            ))}
          </div>

          <button
            type="button"
            data-testid="export-visitors-csv-btn"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Export Log
          </button>

          <button
            type="button"
            data-testid="new-visitor-btn"
            onClick={handleOpenModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Pre-Register Visitor
          </button>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Currently On-Site
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span
              data-testid="visitors-onsite-count"
              className="text-2xl font-semibold font-mono tabular-nums text-[#007A27] dark:text-[#3DCD58]"
            >
              {stats.onSiteCount}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {stats.overdueCount > 0 ? `${stats.overdueCount} Overdue` : 'Active RFID Badges'}
            </span>
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Pre-Approved Arrivals
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span
              data-testid="visitors-preapproved-count"
              className="text-2xl font-semibold font-mono tabular-nums text-amber-700 dark:text-amber-400"
            >
              {stats.preApprovedCount}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Awaiting Security Desk
            </span>
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Checked Out &amp; Cleared
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span
              data-testid="visitors-checkedout-count"
              className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100"
            >
              {stats.checkedOutCount}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              of {stats.total} Total Records
            </span>
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Parking &amp; Gate Compliance
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {stats.activeParkingBays}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Bays Used · {stats.complianceClearedPct}% Verified
            </span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-3">
        <div className="relative flex-1">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search visitor name, company, RFID badge, vehicle plate, or zone..."
            aria-label="Search visitors"
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#111418] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by visitor status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as VisitorStatus | 'all')}
            className="px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-800 dark:text-slate-200"
          >
            <option value="all">All Statuses</option>
            <option value="Checked In">Checked In (On-Site)</option>
            <option value="Pre-Approved">Pre-Approved</option>
            <option value="Checked Out">Checked Out</option>
            <option value="Denied / Revoked">Denied / Revoked</option>
          </select>

          <select
            aria-label="Filter by visitor category"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as VisitorType | 'all')}
            className="px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-800 dark:text-slate-200"
          >
            <option value="all">All Categories</option>
            {VISITOR_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Inline Gate Confirmation Banner */}
      {gateNotice && (
        <div
          role="status"
          data-testid="visitor-gate-notice"
          className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-md border border-[#009530]/30 bg-[#009530]/[0.08] dark:bg-[#3DCD58]/10 text-xs font-medium text-[#006B22] dark:text-[#6EE787]"
        >
          <span>{gateNotice}</span>
          <button
            type="button"
            onClick={() => setGateNotice(null)}
            aria-label="Dismiss notification"
            className="p-0.5 hover:opacity-75 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Split Master-Detail Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left: Visitor Registry Table */}
        <section
          aria-label="Visitor Registry"
          className="xl:col-span-7 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <IdCard className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
              Visitor Access Registry ({filteredVisitors.length})
            </div>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
              {siteScope === 'all' ? 'KL1 · KL2 · KL3' : siteScope.toUpperCase()}
            </span>
          </div>

          {filteredVisitors.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                No visitor records match the current filter
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Clear search filters or pre-register a new site visitor.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 pl-4 pr-3">Visitor &amp; Organization</th>
                    <th className="py-2.5 px-3">Zones &amp; Escort</th>
                    <th className="py-2.5 px-3">Badge / Vehicle</th>
                    <th className="py-2.5 pl-3 pr-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                  {filteredVisitors.map((v) => {
                    const isSelected = selectedVisitor?.id === v.id;
                    return (
                      <tr
                        key={v.id}
                        data-testid={`visitor-row-${v.id}`}
                        onClick={() => {
                          setSelectedId(v.id);
                          setGateError(null);
                          setShowRevokeForm(false);
                        }}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[#009530]/[0.06] dark:bg-[#3DCD58]/[0.09]'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-3 pl-4 pr-3 align-top">
                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#007A27] dark:text-[#3DCD58]">
                            <span className="whitespace-nowrap shrink-0">{v.id}</span>
                            <span className="text-slate-300 dark:text-slate-600 shrink-0">·</span>
                            <span className="text-slate-500 dark:text-slate-400 font-sans truncate">
                              {v.visitorType}
                            </span>
                          </div>
                          <div className="mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100">
                            {v.fullName}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {v.company}
                          </div>
                        </td>
                        <td className="py-3 px-3 align-top">
                          <div className="text-slate-800 dark:text-slate-200 font-medium">
                            {v.accessZones[0]}
                            {v.accessZones.length > 1 ? ` +${v.accessZones.length - 1}` : ''}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            Escort: {v.escortName}
                          </div>
                        </td>
                        <td className="py-3 px-3 align-top font-mono text-[11px] whitespace-nowrap">
                          <div className="text-slate-900 dark:text-slate-100 font-medium">
                            {v.badgeNumber ?? 'Pending Badge'}
                          </div>
                          <div className="mt-0.5 text-slate-500 dark:text-slate-400">
                            {v.vehiclePlate ? `${v.vehiclePlate} · ${v.parkingBay}` : `Bay ${v.parkingBay}`}
                          </div>
                        </td>
                        <td className="py-3 pl-3 pr-4 align-top text-right whitespace-nowrap">
                          <div className={visitorStatusStyle(v.status)}>{v.status}</div>
                          <div className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {v.checkedInAt
                              ? `In ${formatRelativeTime(v.checkedInAt, now)}`
                              : `Sched ${formatClockTime(v.scheduledStartAt)}`}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Right: Security Gate & Visitor Pass Inspector */}
        <section
          aria-label="Visitor Pass Inspector"
          data-testid="visitor-detail-panel"
          className="xl:col-span-5 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-5 space-y-4"
        >
          {!selectedVisitor ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              Select a visitor record to inspect security clearance, issue an RFID badge, or process check-out.
            </div>
          ) : (
            <>
              {/* Pass Header */}
              <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="font-semibold text-[#007A27] dark:text-[#3DCD58]">
                      {selectedVisitor.id}
                    </span>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {selectedVisitor.siteId.toUpperCase()}
                    </span>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <span
                      data-testid="selected-visitor-status"
                      className={visitorStatusStyle(selectedVisitor.status)}
                    >
                      {selectedVisitor.status}
                    </span>
                  </div>
                  <span
                    data-testid="selected-visitor-badge"
                    className="font-mono text-xs font-semibold px-2 py-0.5 rounded-sm bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  >
                    {selectedVisitor.badgeNumber ?? 'No Badge Issued'}
                  </span>
                </div>

                <h2 className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-50">
                  {selectedVisitor.fullName}
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {selectedVisitor.company} · {selectedVisitor.visitorType}
                </p>
                <p className="mt-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {selectedVisitor.purpose}
                </p>
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">ID / Passport</div>
                  <div className="mt-0.5 font-mono font-medium text-slate-900 dark:text-slate-100">
                    {selectedVisitor.idNumber}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Assigned Escort</div>
                  <div className="mt-0.5 font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
                    {selectedVisitor.escortName}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Vehicle &amp; Parking</div>
                  <div className="mt-0.5 font-mono text-slate-900 dark:text-slate-100 flex items-center gap-1">
                    <Car className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                    {selectedVisitor.vehiclePlate || 'No Vehicle'} · {selectedVisitor.parkingBay}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Contact</div>
                  <div className="mt-0.5 text-slate-800 dark:text-slate-200 truncate">
                    {selectedVisitor.phone || selectedVisitor.email || 'Not provided'}
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Authorized Physical Zones</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {selectedVisitor.accessZones.map((zone) => (
                      <span
                        key={zone}
                        className="px-2 py-0.5 text-[11px] font-medium rounded-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                      >
                        {zone}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Wrench className="w-3 h-3" aria-hidden="true" />
                    Declared Tool &amp; Equipment Manifest
                  </div>
                  <div className="mt-0.5 text-slate-800 dark:text-slate-200 font-mono text-[11px]">
                    {selectedVisitor.equipmentManifest}
                  </div>
                </div>
              </div>

              {/* Mantrap Security & Compliance Gate Checklist */}
              <div className="space-y-2.5 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
                    Mantrap Security Gate Clearance
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    All 3 required for check-in
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(
                    [
                      ['ndaSigned', 'NDA Signed'],
                      ['safetyBriefed', 'Safety & ESD'],
                      ['biometricVerified', 'ID / Biometric'],
                    ] as const
                  ).map(([field, label]) => {
                    const checked = selectedVisitor[field];
                    const disabled = selectedVisitor.status !== 'Pre-Approved';
                    return (
                      <label
                        key={field}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-md border text-xs transition-colors ${
                          checked
                            ? 'border-[#009530]/40 bg-[#009530]/[0.06] dark:bg-[#3DCD58]/10 text-slate-900 dark:text-slate-100'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#111418] text-slate-700 dark:text-slate-300'
                        } ${disabled ? 'opacity-75 cursor-default' : 'cursor-pointer'}`}
                      >
                        <input
                          type="checkbox"
                          data-testid={`visitor-gate-${field}`}
                          checked={checked}
                          disabled={disabled}
                          onChange={(e) => {
                            setGateError(null);
                            onUpdateCompliance(selectedVisitor.id, { [field]: e.target.checked });
                          }}
                          className="h-3.5 w-3.5 rounded accent-[#009530]"
                        />
                        <span className="font-medium truncate">{label}</span>
                      </label>
                    );
                  })}
                </div>

                {gateError && (
                  <div
                    role="alert"
                    data-testid="visitor-gate-error"
                    className="px-3 py-2 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300"
                  >
                    {gateError}
                  </div>
                )}

                {/* Primary Security Gate Action Buttons */}
                <div className="pt-1 space-y-2">
                  {selectedVisitor.status === 'Pre-Approved' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        data-testid="visitor-checkin-btn"
                        onClick={() => handleTriggerCheckIn(selectedVisitor)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white transition-colors cursor-pointer"
                      >
                        <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                        Check In &amp; Issue Badge
                      </button>
                      <button
                        type="button"
                        data-testid="visitor-revoke-toggle-btn"
                        onClick={() => setShowRevokeForm((prev) => !prev)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-red-200 dark:border-red-800/80 bg-white dark:bg-[#111418] text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                      >
                        <Ban className="w-3.5 h-3.5" aria-hidden="true" />
                        Revoke Access
                      </button>
                    </div>
                  )}

                  {selectedVisitor.status === 'Checked In' && (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={checkoutNote}
                        onChange={(e) => setCheckoutNote(e.target.value)}
                        placeholder="Optional check-out note (e.g., all tools verified, rack door locked)..."
                        aria-label="Check-out security note"
                        className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#111418] text-slate-900 dark:text-slate-100"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          data-testid="visitor-checkout-btn"
                          onClick={() => handleTriggerCheckOut(selectedVisitor)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 transition-colors cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                          Check Out &amp; Return Badge
                        </button>
                        <button
                          type="button"
                          data-testid="visitor-revoke-toggle-btn"
                          onClick={() => setShowRevokeForm((prev) => !prev)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-red-200 dark:border-red-800/80 bg-white dark:bg-[#111418] text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                        >
                          <Ban className="w-3.5 h-3.5" aria-hidden="true" />
                          Revoke Badge
                        </button>
                      </div>
                    </div>
                  )}

                  {(selectedVisitor.status === 'Checked Out' ||
                    selectedVisitor.status === 'Denied / Revoked') && (
                    <div className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <CheckCircle2 className="w-4 h-4 text-slate-400" aria-hidden="true" />
                      Visit closed · Physical RFID credentials inactive
                    </div>
                  )}

                  {showRevokeForm && (
                    <div className="p-3 rounded-md border border-red-200 dark:border-red-900/70 bg-red-50/60 dark:bg-red-950/20 space-y-2">
                      <label
                        htmlFor="visitor-revoke-reason"
                        className="block text-[11px] font-medium text-red-800 dark:text-red-300"
                      >
                        Security revocation / cancellation reason
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="visitor-revoke-reason"
                          type="text"
                          value={revokeReason}
                          onChange={(e) => setRevokeReason(e.target.value)}
                          placeholder="e.g., Unverified ID, Escort unavailable, Maintenance rescheduled"
                          className="flex-1 px-2.5 py-1.5 text-xs rounded-md border border-red-200 dark:border-red-800 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          data-testid="visitor-confirm-revoke-btn"
                          onClick={() => handleTriggerRevoke(selectedVisitor)}
                          className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                        >
                          Confirm Revoke
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Security Access Audit Trail */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Security Access Audit Trail ({selectedVisitor.auditLog.length})
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {selectedVisitor.auditLog.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111418] text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {entry.actor}
                        </span>
                        <span className="font-mono text-slate-500 dark:text-slate-400">
                          {formatClockTime(entry.timestamp)}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-700 dark:text-slate-300 leading-relaxed">
                        {entry.action}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Pre-Register Visitor Modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="register-visitor-title"
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-700 rounded-md shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2
                  id="register-visitor-title"
                  className="text-base font-semibold text-slate-900 dark:text-slate-50"
                >
                  Pre-Register Data Center Visitor
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Issue mantrap clearance request, assign escort engineer, and authorize physical zones
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close registration modal"
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmitRegistration} className="p-5 space-y-4 overflow-y-auto text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="vis-fullname" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Full Name *
                  </label>
                  <input
                    id="vis-fullname"
                    data-testid="vis-fullname-input"
                    type="text"
                    value={draft.fullName}
                    onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
                    placeholder="e.g., Ahmad Faizal"
                    className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100"
                  />
                  {draftErrors.fullName && (
                    <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{draftErrors.fullName}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="vis-company" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Company / Organization *
                  </label>
                  <input
                    id="vis-company"
                    data-testid="vis-company-input"
                    type="text"
                    value={draft.company}
                    onChange={(e) => setDraft({ ...draft, company: e.target.value })}
                    placeholder="e.g., Vertiv Malaysia"
                    className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100"
                  />
                  {draftErrors.company && (
                    <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{draftErrors.company}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="vis-idnumber" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    NRIC / Passport Number *
                  </label>
                  <input
                    id="vis-idnumber"
                    data-testid="vis-idnumber-input"
                    type="text"
                    value={draft.idNumber}
                    onChange={(e) => setDraft({ ...draft, idNumber: e.target.value })}
                    placeholder="e.g., MY-900514-14-5123"
                    className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100 font-mono"
                  />
                  {draftErrors.idNumber && (
                    <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{draftErrors.idNumber}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="vis-type" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Visitor Category
                  </label>
                  <select
                    id="vis-type"
                    value={draft.visitorType}
                    onChange={(e) => setDraft({ ...draft, visitorType: e.target.value as VisitorType })}
                    className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100"
                  >
                    {VISITOR_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="vis-site" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Data Center Site
                  </label>
                  <select
                    id="vis-site"
                    value={draft.siteId}
                    onChange={(e) => setDraft({ ...draft, siteId: e.target.value as SiteId })}
                    className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100"
                  >
                    {SITES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} · {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="vis-escort" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Assigned Escort Engineer *
                  </label>
                  <select
                    id="vis-escort"
                    value={draft.escortProfileId}
                    onChange={(e) => {
                      const prof = profiles.find((p) => p.id === e.target.value);
                      setDraft({
                        ...draft,
                        escortProfileId: e.target.value,
                        escortName: prof?.name ?? draft.escortName,
                      });
                    }}
                    className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100"
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.role})
                      </option>
                    ))}
                  </select>
                  {draftErrors.escortProfileId && (
                    <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                      {draftErrors.escortProfileId}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="vis-phone" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Mobile Phone
                  </label>
                  <input
                    id="vis-phone"
                    type="text"
                    value={draft.phone}
                    onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                    placeholder="+60 12-555 8120"
                    className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="vis-plate" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Vehicle Plate
                    </label>
                    <input
                      id="vis-plate"
                      data-testid="vis-plate-input"
                      type="text"
                      value={draft.vehiclePlate}
                      onChange={(e) => setDraft({ ...draft, vehiclePlate: e.target.value })}
                      placeholder="WXY 8421"
                      className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100 font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label htmlFor="vis-bay" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Parking Bay
                    </label>
                    <select
                      id="vis-bay"
                      value={draft.parkingBay}
                      onChange={(e) => setDraft({ ...draft, parkingBay: e.target.value })}
                      className="w-full px-2.5 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100 font-mono"
                    >
                      {VISITOR_PARKING_BAYS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="vis-purpose" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Purpose of Visit &amp; Work Scope *
                </label>
                <textarea
                  id="vis-purpose"
                  data-testid="vis-purpose-input"
                  rows={2}
                  value={draft.purpose}
                  onChange={(e) => setDraft({ ...draft, purpose: e.target.value })}
                  placeholder="e.g., Preventive inspection of rooftop air chiller CHA-A7 and VFD drive check"
                  className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100"
                />
                {draftErrors.purpose && (
                  <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{draftErrors.purpose}</p>
                )}
              </div>

              <div>
                <span className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Authorized Physical Access Zones *
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {ACCESS_ZONES.map((zone) => {
                    const checked = draft.accessZones.includes(zone);
                    return (
                      <label
                        key={zone}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border cursor-pointer ${
                          checked
                            ? 'border-[#009530]/50 bg-[#009530]/[0.07] dark:bg-[#3DCD58]/10 text-slate-900 dark:text-slate-100'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleZone(zone)}
                          className="h-3.5 w-3.5 accent-[#009530]"
                        />
                        <span>{zone}</span>
                      </label>
                    );
                  })}
                </div>
                {draftErrors.accessZones && (
                  <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                    {draftErrors.accessZones}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="vis-manifest" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Tools / Equipment Manifest
                </label>
                <input
                  id="vis-manifest"
                  type="text"
                  value={draft.equipmentManifest}
                  onChange={(e) => setDraft({ ...draft, equipmentManifest: e.target.value })}
                  placeholder="e.g., Fluke multimeter, ESD mat, laptop serial #SN-4482"
                  className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="submit-visitor-btn"
                  className="px-4 py-2 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white cursor-pointer"
                >
                  Pre-Register Visitor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

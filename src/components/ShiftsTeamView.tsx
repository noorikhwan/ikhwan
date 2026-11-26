import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Cloud,
  Download,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { BmsState } from '../engine/bmsTypes';
import { compileShiftHandoverBrief } from '../engine/changeComplianceEngine';
import { MaintenanceWorkOrder } from '../engine/predictiveMaintenance';
import { OpsTicket } from '../engine/ticketEngine';
import { ActiveAlert } from '../engine/types';
import { VisitorRecord } from '../engine/visitorEngine';
import {
  DutyOverrideStatus,
  NewProfileDraft,
  OPERATOR_ROLES,
  OperatorProfile,
  OperatorRole,
  SHIFT_PATTERN_LIST,
  SHIFT_TEAMS,
  ShiftCycleState,
  ShiftPatternId,
  ShiftSlotType,
  ShiftTeamId,
  buildShiftCycleCalendar,
  computeEffectiveDutyStatus,
  computeTeamCycleStats,
  exportShiftRosterToCsv,
  getActiveShiftSnapshot,
  validateNewProfileDraft,
  verifyPattern24x7Coverage,
} from '../engine/shiftEngine';
import { SITES, SITE_META_MAP, SiteId } from '../engine/sites';

interface ShiftsTeamViewProps {
  activeSiteId: SiteId;
  profiles: OperatorProfile[];
  activeProfileId: string;
  shiftState: ShiftCycleState;
  openCriticalCount: number;
  openWarningCount: number;
  sitePue: number;
  slaCompliancePct: number;
  alerts?: ActiveAlert[];
  tickets?: OpsTicket[];
  visitors?: VisitorRecord[];
  bms?: BmsState;
  workOrders?: MaintenanceWorkOrder[];
  cloudSynced?: boolean;
  cloudHandoversCount?: number;
  onSelectActiveProfile: (profileId: string) => void;
  onAddProfile: (draft: NewProfileDraft) => void;
  onUpdateDutyOverride: (profileId: string, override: DutyOverrideStatus) => void;
  onUpdateProfileAvatar?: (profileId: string, avatarUrl: string | undefined) => void;
  onSwitchPattern: (patternId: ShiftPatternId) => void;
  onExecuteHandover: (params: {
    notes: string;
    checklistVerified: boolean;
    switchToIncomingLead: boolean;
  }) => void;
}

type ShiftsSubTab = 'cycle' | 'profiles' | 'handover';

const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function processProfileImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      reject(new Error('Please upload a JPG, PNG, or WebP image file.'));
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      reject(new Error('Profile image must be 5 MB or smaller.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Selected file is not a valid image.'));
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable.'));
          return;
        }
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = Math.max(0, (img.height - side) * 0.25);
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function OperatorAvatar({
  profile,
  size = 'md',
}: {
  profile: OperatorProfile;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [profile.avatarUrl]);

  const dimClass =
    size === 'sm' ? 'w-7 h-7 text-[11px]' : size === 'lg' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs';

  const teamBg: Record<ShiftTeamId, string> = {
    'Shift A': 'bg-[#009530]/15 text-[#007a27] dark:bg-[#3DCD58]/20 dark:text-[#3DCD58]',
    'Shift B': 'bg-sky-500/15 text-sky-700 dark:bg-sky-400/20 dark:text-sky-300',
    'Shift C': 'bg-amber-500/15 text-amber-800 dark:bg-amber-400/20 dark:text-amber-300',
    'Shift D': 'bg-slate-600/15 text-slate-700 dark:bg-slate-400/20 dark:text-slate-200',
  };

  if (profile.avatarUrl && !imgFailed) {
    return (
      <img
        src={profile.avatarUrl}
        alt={`${profile.name}, ${profile.role}`}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${dimClass} rounded-full object-cover object-top border border-slate-200 dark:border-slate-700 shrink-0`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`${dimClass} ${teamBg[profile.shiftTeam]} rounded-full flex items-center justify-center font-semibold border border-slate-200/80 dark:border-slate-700 shrink-0`}
    >
      {profile.initials}
    </div>
  );
}

function formatSlotCellStyle(slot: ShiftSlotType, isActiveSlotNow: boolean): string {
  if (isActiveSlotNow) {
    return 'bg-[#009530] text-white font-semibold';
  }
  switch (slot) {
    case 'Day':
    case 'Morning':
      return 'bg-[#009530]/12 dark:bg-[#3DCD58]/15 text-[#007a27] dark:text-[#3DCD58] font-medium';
    case 'Swing':
      return 'bg-sky-500/12 dark:bg-sky-400/15 text-sky-700 dark:text-sky-300 font-medium';
    case 'Night':
      return 'bg-slate-800/10 dark:bg-slate-700/70 text-slate-800 dark:text-slate-200 font-medium';
    case 'Off':
      return 'bg-transparent text-slate-400 dark:text-slate-600';
  }
}

function formatDutyTextClass(status: ReturnType<typeof computeEffectiveDutyStatus>): string {
  switch (status) {
    case 'On Duty':
      return 'text-[#009530] dark:text-[#3DCD58] font-semibold';
    case 'Standby':
      return 'text-amber-700 dark:text-amber-400 font-medium';
    case 'On Leave':
      return 'text-red-700 dark:text-red-400 font-medium';
    default:
      return 'text-slate-500 dark:text-slate-400';
  }
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

const EMPTY_DRAFT: NewProfileDraft = {
  name: '',
  role: 'NOC Operations Engineer',
  shiftTeam: 'Shift A',
  primarySite: 'kl1',
  email: '',
  phone: '+60 3-8312-',
  certificationsText: 'CDCP, ASHRAE A1',
  isShiftLead: false,
};

export function ShiftsTeamView({
  activeSiteId,
  profiles,
  activeProfileId,
  shiftState,
  openCriticalCount,
  openWarningCount,
  sitePue,
  slaCompliancePct,
  alerts = [],
  tickets = [],
  visitors = [],
  bms,
  workOrders = [],
  cloudSynced = false,
  cloudHandoversCount = 0,
  onSelectActiveProfile,
  onAddProfile,
  onUpdateDutyOverride,
  onUpdateProfileAvatar,
  onSwitchPattern,
  onExecuteHandover,
}: ShiftsTeamViewProps) {
  const [subTab, setSubTab] = useState<ShiftsSubTab>('cycle');
  const [teamFilter, setTeamFilter] = useState<ShiftTeamId | 'all'>('all');
  const [siteFilter, setSiteFilter] = useState<SiteId | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Add Profile inline form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [draft, setDraft] = useState<NewProfileDraft>({
    ...EMPTY_DRAFT,
    primarySite: activeSiteId,
  });
  const [draftError, setDraftError] = useState<string | null>(null);
  const [profileFeedback, setProfileFeedback] = useState<string | null>(null);
  const draftAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const rowAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarTargetId, setAvatarTargetId] = useState<string | null>(null);

  // Handover form state
  const [handoverNotes, setHandoverNotes] = useState('');
  const [checklistVerified, setChecklistVerified] = useState(true);
  const [switchToIncomingLead, setSwitchToIncomingLead] = useState(true);
  const [handoverFeedback, setHandoverFeedback] = useState<string | null>(null);

  const siteMeta = SITE_META_MAP[activeSiteId];
  const snapshot = useMemo(() => getActiveShiftSnapshot(shiftState), [shiftState]);
  const coverageAudit = useMemo(
    () => verifyPattern24x7Coverage(shiftState.patternId),
    [shiftState.patternId]
  );
  const teamStats = useMemo(
    () => computeTeamCycleStats(shiftState.patternId),
    [shiftState.patternId]
  );
  const calendarDays = useMemo(
    () =>
      buildShiftCycleCalendar(
        shiftState.patternId,
        shiftState.cycleDayIndex,
        shiftState.baseDateIso,
        14
      ),
    [shiftState.patternId, shiftState.cycleDayIndex, shiftState.baseDateIso]
  );

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? profiles[0],
    [profiles, activeProfileId]
  );

  const onDutyCrew = useMemo(
    () => profiles.filter((p) => computeEffectiveDutyStatus(p, shiftState) === 'On Duty'),
    [profiles, shiftState]
  );

  const incomingLead = useMemo(
    () =>
      profiles.find(
        (p) => p.shiftTeam === snapshot.nextTeam && p.isShiftLead && p.dutyOverride !== 'On Leave'
      ) ??
      profiles.find((p) => p.shiftTeam === snapshot.nextTeam && p.dutyOverride !== 'On Leave') ??
      null,
    [profiles, snapshot.nextTeam]
  );

  const filteredProfiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return profiles.filter((p) => {
      if (teamFilter !== 'all' && p.shiftTeam !== teamFilter) return false;
      if (siteFilter !== 'all' && p.primarySite !== siteFilter) return false;
      if (q) {
        const hay = `${p.name} ${p.role} ${p.email} ${p.shiftTeam} ${p.certifications.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [profiles, teamFilter, siteFilter, searchQuery]);

  const handleDraftAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await processProfileImageFile(file);
      setDraft((d) => ({ ...d, avatarUrl: dataUrl }));
      setDraftError(null);
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Unable to process profile photo.');
    }
  };

  const handleRowAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !avatarTargetId || !onUpdateProfileAvatar) return;
    const targetOp = profiles.find((p) => p.id === avatarTargetId);
    try {
      const dataUrl = await processProfileImageFile(file);
      onUpdateProfileAvatar(avatarTargetId, dataUrl);
      setProfileFeedback(`Updated profile picture for ${targetOp?.name ?? 'operator'}.`);
      window.setTimeout(() => setProfileFeedback(null), 5000);
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Unable to update profile photo.');
    } finally {
      setAvatarTargetId(null);
    }
  };

  const handleSubmitProfile = (e: FormEvent) => {
    e.preventDefault();
    const err = validateNewProfileDraft(draft);
    if (err) {
      setDraftError(err);
      return;
    }
    onAddProfile(draft);
    setDraftError(null);
    setProfileFeedback(`Added ${draft.name.trim()} to ${draft.shiftTeam} (${draft.primarySite.toUpperCase()}).`);
    setDraft({ ...EMPTY_DRAFT, primarySite: activeSiteId });
    setShowAddForm(false);
    window.setTimeout(() => setProfileFeedback(null), 5000);
  };

  const handleConfirmHandover = (e: FormEvent) => {
    e.preventDefault();
    onExecuteHandover({
      notes: handoverNotes,
      checklistVerified,
      switchToIncomingLead,
    });
    setHandoverFeedback(
      `Handover signed off: ${snapshot.onDutyTeam} (${snapshot.activeSlot.slot}) → ${snapshot.nextTeam} (${snapshot.nextSlot.slot}).`
    );
    setHandoverNotes('');
    window.setTimeout(() => setHandoverFeedback(null), 6000);
  };

  const compiledBrief = useMemo(() => {
    if (!bms) return null;
    return compileShiftHandoverBrief({
      siteId: activeSiteId,
      siteCode: siteMeta.code,
      shiftLabel: `${snapshot.onDutyTeam} (${snapshot.activeSlot.slot})`,
      outgoingOperator: activeProfile.name,
      incomingLead: incomingLead?.name ?? `${snapshot.nextTeam} Lead`,
      alerts,
      tickets,
      visitors,
      bms,
      workOrders,
      sitePue,
      slaCompliancePct,
    });
  }, [
    activeSiteId,
    siteMeta.code,
    snapshot.onDutyTeam,
    snapshot.activeSlot.slot,
    snapshot.nextTeam,
    activeProfile.name,
    incomingLead,
    alerts,
    tickets,
    visitors,
    bms,
    workOrders,
    sitePue,
    slaCompliancePct,
  ]);

  const handleDownloadBriefMarkdown = () => {
    if (!compiledBrief) return;
    const blob = new Blob([compiledBrief.markdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shift-handover-${siteMeta.code.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setHandoverFeedback(`Exported ${siteMeta.code} auto-compiled Shift Handover Brief (.md).`);
  };

  const handleExportCsv = () => {
    const csv = exportShiftRosterToCsv(shiftState, profiles);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orise-dcim-shift-cycle-${shiftState.patternId}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Page Title & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Operator Profiles &amp; 24/7 Shift Cycle
          </h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
            <span>{siteMeta.label}</span>
            <span aria-hidden="true">·</span>
            <span>Tier IV 4-Team Continuous Watch</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Active Operator: {activeProfile.name} ({activeProfile.shiftTeam})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Export Roster CSV
          </button>
          <button
            type="button"
            onClick={() => {
              setSubTab('handover');
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md bg-[#009530] hover:bg-[#007a27] text-white transition-colors whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            Log Handover &amp; Rotate Shift
          </button>
        </div>
      </div>

      {/* 4-Column Shift & Coverage KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Active Watch Slot</span>
            <Clock className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {snapshot.onDutyTeam} · {snapshot.activeSlot.slot}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {snapshot.activeSlot.timeRange} · Day {snapshot.cycleDayNumber}/{snapshot.pattern.cycleLengthDays}
          </div>
        </div>

        <div className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>On-Duty Crew</span>
            <Users className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {onDutyCrew.length} <span className="text-sm font-normal text-slate-500">/ {profiles.length} profiles</span>
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
            {onDutyCrew.map((p) => p.name).join(', ') || 'No active crew assigned'}
          </div>
        </div>

        <div className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>24/7 Tier IV Coverage</span>
            <ShieldCheck className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-xl font-bold text-[#009530] dark:text-[#3DCD58] tabular-nums">
            {coverageAudit.coveragePct.toFixed(1)}%
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {coverageAudit.uncoveredSlots} gaps · {snapshot.pattern.slots.length} slots/day · 4 teams
          </div>
        </div>

        <div className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Next Incoming Relief</span>
            <CalendarClock className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {snapshot.nextTeam} · {snapshot.nextSlot.slot}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
            Lead: {incomingLead?.name ?? `${snapshot.nextTeam} Lead`} · {snapshot.nextSlot.timeRange}
          </div>
        </div>
      </div>

      {/* Sub-Navigation Segmented Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div
          role="tablist"
          aria-label="Shift and profile sections"
          className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#111418] border border-slate-200 dark:border-slate-800 rounded-md"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'cycle'}
            onClick={() => setSubTab('cycle')}
            className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'cycle'
                ? 'bg-white dark:bg-[#1B2026] text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            Shift Cycle &amp; Roster
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'profiles'}
            onClick={() => setSubTab('profiles')}
            className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'profiles'
                ? 'bg-white dark:bg-[#1B2026] text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            Operator Profiles ({profiles.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'handover'}
            onClick={() => setSubTab('handover')}
            className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'handover'
                ? 'bg-white dark:bg-[#1B2026] text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            Handover Log ({shiftState.handoverLog.length})
          </button>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
          Pattern: {snapshot.pattern.shortName} · {snapshot.pattern.cycleLengthDays}-day cycle
        </div>
      </div>

      {/* Feedback Banner */}
      {(profileFeedback || handoverFeedback) && (
        <div
          role="status"
          className="px-4 py-2.5 rounded-md border border-[#009530]/30 bg-[#009530]/8 dark:bg-[#3DCD58]/10 text-xs text-[#007a27] dark:text-[#3DCD58] flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{handoverFeedback ?? profileFeedback}</span>
        </div>
      )}

      {/* SUB-TAB 1: SHIFT CYCLE & ROSTER */}
      {subTab === 'cycle' && (
        <div className="space-y-5">
          {/* Rotation Pattern Selector */}
          <section className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-4 sm:p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  24/7 Shift Rotation Cycle Pattern
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Select an industry-standard Tier IV continuous watch pattern across KL1, KL2, and KL3.
                </p>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                Watch Windows: {snapshot.pattern.slots.map((s) => `${s.slot} ${s.timeRange}`).join(' · ')}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {SHIFT_PATTERN_LIST.map((pat) => {
                const selected = shiftState.patternId === pat.id;
                return (
                  <button
                    key={pat.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSwitchPattern(pat.id)}
                    className={`text-left p-3.5 rounded-md border transition-colors cursor-pointer ${
                      selected
                        ? 'border-[#009530] dark:border-[#3DCD58] bg-[#009530]/5 dark:bg-[#3DCD58]/10'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#111418]/50 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {pat.name}
                      </span>
                      {selected && (
                        <Check
                          className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58] shrink-0"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {pat.shiftHours}h shifts · {pat.cycleLengthDays}-day cycle · {pat.slots.length} slots/day
                    </div>
                    <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {pat.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 14-Day Interactive Shift Cycle Matrix */}
          <section className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  14-Day Rolling Shift Cycle Matrix
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Highlighted cell marks the live watch ({snapshot.onDutyTeam} · {snapshot.activeSlot.slot} on Day {snapshot.cycleDayNumber}).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                <span>Legend:</span>
                <span className="font-medium text-[#007a27] dark:text-[#3DCD58]">Day / Morning</span>
                {snapshot.pattern.slots.some((s) => s.slot === 'Swing') && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-sky-700 dark:text-sky-300">Swing</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">Night</span>
                <span aria-hidden="true">·</span>
                <span className="text-slate-400 dark:text-slate-500">Off</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#14181D] text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    <th className="py-2.5 pl-3 pr-2 sticky left-0 bg-slate-50 dark:bg-[#14181D] z-10 min-w-[144px]">
                      Shift Team &amp; Lead
                    </th>
                    {calendarDays.map((day) => (
                      <th
                        key={day.dayOffset}
                        className={`py-2 px-1 text-center font-mono tabular-nums min-w-[54px] ${
                          day.isCurrentCycleDay
                            ? 'bg-[#009530]/10 dark:bg-[#3DCD58]/12 text-[#007a27] dark:text-[#3DCD58]'
                            : ''
                        }`}
                      >
                        <div className="text-[10px] font-normal opacity-80">{day.weekdayLabel}</div>
                        <div className="text-[10px] font-semibold whitespace-nowrap">{day.dateLabel}</div>
                        <div className="text-[10px] opacity-70">D{day.cycleDayNumber}</div>
                      </th>
                    ))}
                    <th className="py-2.5 px-2.5 text-right font-mono tabular-nums min-w-[68px]">
                      Avg / Wk
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                  {SHIFT_TEAMS.map((team) => {
                    const teamMembers = profiles.filter((p) => p.shiftTeam === team);
                    const lead = teamMembers.find((p) => p.isShiftLead) ?? teamMembers[0];
                    const isTeamOnDuty = team === snapshot.onDutyTeam;
                    const stat = teamStats[team];

                    return (
                      <tr
                        key={team}
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-2.5 pl-3 pr-2 sticky left-0 bg-white dark:bg-[#1B2026] z-10 border-r border-slate-100 dark:border-slate-800">
                          <div className="flex items-center gap-2">
                            {lead && <OperatorAvatar profile={lead} size="sm" />}
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                                <span>{team}</span>
                                {isTeamOnDuty && (
                                  <span className="text-[10px] font-mono text-[#009530] dark:text-[#3DCD58]">
                                    LIVE
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {lead ? lead.name : 'Unassigned'} · {teamMembers.length}
                              </div>
                            </div>
                          </div>
                        </td>

                        {calendarDays.map((day) => {
                          const slot = day.assignments[team];
                          const isActiveNow =
                            day.isCurrentCycleDay &&
                            team === snapshot.onDutyTeam &&
                            slot === snapshot.activeSlot.slot;
                          return (
                            <td key={`${team}-${day.dayOffset}`} className="p-0.5 text-center">
                              <div
                                className={`py-1.5 px-0.5 rounded-sm text-[10px] font-mono tabular-nums ${formatSlotCellStyle(
                                  slot,
                                  isActiveNow
                                )}`}
                              >
                                {slot}
                              </div>
                            </td>
                          );
                        })}

                        <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          <div className="font-semibold">{stat.avgWeeklyHours.toFixed(1)}h</div>
                          <div className="text-[10px] text-slate-400">
                            {stat.workDays}on/{stat.offDays}off
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Active Watch Crew & Quick Switch */}
          <section className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3.5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Current Watch Team ({snapshot.onDutyTeam} · {snapshot.activeSlot.label})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Switch active console operator directly or open full directory to manage all {profiles.length} profiles.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSubTab('profiles')}
                className="text-xs font-medium text-[#009530] dark:text-[#3DCD58] hover:underline self-start sm:self-auto cursor-pointer"
              >
                View all {profiles.length} profiles
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {profiles
                .filter((p) => p.shiftTeam === snapshot.onDutyTeam || p.shiftTeam === snapshot.nextTeam)
                .map((op) => {
                  const status = computeEffectiveDutyStatus(op, shiftState);
                  const isCurrentUser = op.id === activeProfile.id;
                  return (
                    <div
                      key={op.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#14181D]/60"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <OperatorAvatar profile={op} size="md" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {op.name}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {op.role} · {op.shiftTeam} · {op.primarySite.toUpperCase()}
                          </div>
                          <div className={`text-[11px] mt-0.5 ${formatDutyTextClass(status)}`}>
                            {status} · {op.certifications.slice(0, 2).join(' / ')}
                          </div>
                        </div>
                      </div>

                      {isCurrentUser ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#009530] dark:text-[#3DCD58] shrink-0">
                          <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                          Active
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectActiveProfile(op.id)}
                          className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-200 hover:border-[#009530] hover:text-[#009530] dark:hover:text-[#3DCD58] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Switch Profile
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          </section>
        </div>
      )}

      {/* SUB-TAB 2: OPERATOR PROFILES DIRECTORY */}
      {subTab === 'profiles' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[210px] flex-1 sm:flex-initial">
                <Search
                  className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <label htmlFor="profile-search" className="sr-only">
                  Search operator profiles
                </label>
                <input
                  id="profile-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search engineer, role, cert..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
                />
              </div>

              <div
                role="group"
                aria-label="Filter by shift team"
                className="inline-flex items-center p-0.5 rounded-md bg-slate-100 dark:bg-[#111418] border border-slate-200 dark:border-slate-800"
              >
                {(['all', ...SHIFT_TEAMS] as const).map((team) => (
                  <button
                    key={team}
                    type="button"
                    aria-pressed={teamFilter === team}
                    onClick={() => setTeamFilter(team)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-sm transition-colors whitespace-nowrap cursor-pointer ${
                      teamFilter === team
                        ? 'bg-white dark:bg-[#1B2026] text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    {team === 'all' ? 'All Shifts' : team}
                  </button>
                ))}
              </div>

              <label htmlFor="profile-site-filter" className="sr-only">
                Filter by primary site
              </label>
              <select
                id="profile-site-filter"
                value={siteFilter}
                onChange={(e) => setSiteFilter(e.target.value as SiteId | 'all')}
                className="px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#009530]/30"
              >
                <option value="all">All Sites (KL1–KL3)</option>
                {SITES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.location}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowAddForm((prev) => !prev);
                setDraftError(null);
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md bg-[#009530] hover:bg-[#007a27] text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {showAddForm ? (
                <>
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                  Close Form
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                  Add Profile
                </>
              )}
            </button>
          </div>

          {/* Add Operator Profile Form */}
          {showAddForm && (
            <form
              onSubmit={handleSubmitProfile}
              noValidate
              className="bg-white dark:bg-[#1B2026] border border-[#009530]/40 dark:border-[#3DCD58]/40 rounded-md p-4 sm:p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Add New Operator Profile
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Assign engineer to a 24/7 Shift Team (A–D) and primary Kuala Lumpur campus.
                  </p>
                </div>
              </div>

              {draftError && (
                <div
                  role="alert"
                  className="px-3 py-2 rounded-md border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300"
                >
                  {draftError}
                </div>
              )}

              {/* Profile Picture Upload Row */}
              <div className="flex flex-wrap items-center gap-3.5 p-3 rounded-md bg-slate-50 dark:bg-[#14181D] border border-slate-200 dark:border-slate-800">
                {draft.avatarUrl ? (
                  <img
                    src={draft.avatarUrl}
                    alt="New operator portrait preview"
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-full object-cover object-top border border-slate-200 dark:border-slate-700 shrink-0"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="w-12 h-12 rounded-full bg-[#009530]/12 dark:bg-[#3DCD58]/15 text-[#007a27] dark:text-[#3DCD58] border border-slate-200 dark:border-slate-700 flex items-center justify-center text-sm font-semibold shrink-0"
                  >
                    {draft.name.trim()
                      ? draft.name
                          .trim()
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((p) => p[0])
                          .join('')
                          .toUpperCase()
                      : 'OP'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    Staff Profile Picture
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    JPG, PNG, or WebP up to 5 MB · auto-cropped to square badge portrait
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={draftAvatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    data-testid="new-op-avatar-input"
                    onChange={handleDraftAvatarChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    data-testid="new-op-avatar-upload-btn"
                    onClick={() => draftAvatarInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-200 hover:border-[#009530] hover:text-[#009530] dark:hover:text-[#3DCD58] transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                    {draft.avatarUrl ? 'Replace Photo' : 'Upload Photo'}
                  </button>
                  {draft.avatarUrl && (
                    <button
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, avatarUrl: undefined }))}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Remove
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                <div>
                  <label
                    htmlFor="new-op-name"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Full Name
                  </label>
                  <input
                    id="new-op-name"
                    type="text"
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="e.g. Hafizudin Razak"
                    className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-op-role"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Engineering Role
                  </label>
                  <select
                    id="new-op-role"
                    value={draft.role}
                    onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value as OperatorRole }))}
                    className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  >
                    {OPERATOR_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="new-op-team"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Shift Team
                  </label>
                  <select
                    id="new-op-team"
                    value={draft.shiftTeam}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, shiftTeam: e.target.value as ShiftTeamId }))
                    }
                    className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  >
                    {SHIFT_TEAMS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="new-op-site"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Primary Site
                  </label>
                  <select
                    id="new-op-site"
                    value={draft.primarySite}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, primarySite: e.target.value as SiteId }))
                    }
                    className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  >
                    {SITES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="new-op-email"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Corporate Email
                  </label>
                  <input
                    id="new-op-email"
                    type="email"
                    value={draft.email}
                    onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                    placeholder="name@orise-dc.io"
                    className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-op-phone"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    On-Call Phone
                  </label>
                  <input
                    id="new-op-phone"
                    type="tel"
                    value={draft.phone}
                    onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                    placeholder="+60 3-8312-4501"
                    className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-4 flex-1">
                  <div className="flex-1 min-w-[200px] max-w-sm">
                    <label
                      htmlFor="new-op-certs"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Certifications (comma-separated)
                    </label>
                    <input
                      id="new-op-certs"
                      type="text"
                      value={draft.certificationsText}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, certificationsText: e.target.value }))
                      }
                      className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 mt-4 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.isShiftLead}
                      onChange={(e) => setDraft((d) => ({ ...d, isShiftLead: e.target.checked }))}
                      className="rounded border-slate-300 text-[#009530] focus:ring-[#009530]"
                    />
                    Designate as Shift Lead
                  </label>
                </div>

                <div className="flex items-center gap-2 self-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setDraftError(null);
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-semibold rounded-md bg-[#009530] hover:bg-[#007a27] text-white cursor-pointer"
                  >
                    Save Operator Profile
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Hidden file input for updating any existing operator's profile picture */}
          <input
            ref={rowAvatarInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            data-testid="row-op-avatar-input"
            onChange={handleRowAvatarChange}
            className="hidden"
          />

          {/* Profiles Directory Table */}
          <div className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#14181D] text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    <th className="py-2.5 pl-4 pr-3">Operator</th>
                    <th className="py-2.5 px-3">Role &amp; Credentials</th>
                    <th className="py-2.5 px-3">Shift &amp; Site</th>
                    <th className="py-2.5 px-3">Current Duty</th>
                    <th className="py-2.5 px-3">Availability Override</th>
                    <th className="py-2.5 pl-3 pr-4 text-right">Console Session</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                  {filteredProfiles.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-8 text-center text-xs text-slate-500 dark:text-slate-400"
                      >
                        No operator profiles match the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredProfiles.map((op) => {
                      const duty = computeEffectiveDutyStatus(op, shiftState);
                      const isCurrent = op.id === activeProfile.id;
                      return (
                        <tr
                          key={op.id}
                          className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors ${
                            isCurrent ? 'bg-[#009530]/[0.04] dark:bg-[#3DCD58]/[0.05]' : ''
                          }`}
                        >
                          <td className="py-3 pl-4 pr-3">
                            <div className="flex items-center gap-2.5">
                              <div className="relative group shrink-0">
                                <OperatorAvatar profile={op} size="md" />
                                {onUpdateProfileAvatar && (
                                  <button
                                    type="button"
                                    data-testid={`change-avatar-${op.id}`}
                                    aria-label={`Change profile picture for ${op.name}`}
                                    title={`Change profile picture for ${op.name}`}
                                    onClick={() => {
                                      setAvatarTargetId(op.id);
                                      rowAvatarInputRef.current?.click();
                                    }}
                                    className="absolute inset-0 rounded-full bg-slate-900/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                                  >
                                    <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                                  </button>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                                  <span>{op.name}</span>
                                  {op.isShiftLead && (
                                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                      · Lead
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                  <div>{op.email}</div>
                                  <div className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                                    {op.phone}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-medium text-slate-800 dark:text-slate-200">
                              {op.role}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {op.certifications.join(' · ')}
                            </div>
                          </td>
                          <td className="py-3 px-3 font-mono tabular-nums">
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {op.shiftTeam}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {SITE_META_MAP[op.primarySite].code} · {SITE_META_MAP[op.primarySite].location}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className={`text-xs ${formatDutyTextClass(duty)}`}>{duty}</span>
                          </td>
                          <td className="py-3 px-3">
                            <label htmlFor={`duty-${op.id}`} className="sr-only">
                              Duty override for {op.name}
                            </label>
                            <select
                              id={`duty-${op.id}`}
                              value={op.dutyOverride}
                              onChange={(e) =>
                                onUpdateDutyOverride(op.id, e.target.value as DutyOverrideStatus)
                              }
                              className="px-2 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                            >
                              <option value="auto">Auto (Follow Cycle)</option>
                              <option value="Standby">Standby On-Call</option>
                              <option value="On Leave">On Leave</option>
                            </select>
                          </td>
                          <td className="py-3 pl-3 pr-4 text-right">
                            {isCurrent ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#009530] dark:text-[#3DCD58]">
                                <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                                Active Session
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onSelectActiveProfile(op.id)}
                                className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-200 hover:border-[#009530] hover:text-[#009530] dark:hover:text-[#3DCD58] transition-colors whitespace-nowrap cursor-pointer"
                              >
                                Switch to {op.name.split(' ')[0]}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: SHIFT HANDOVER LOG */}
      {subTab === 'handover' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* Execute Shift Handover Card */}
          <form
            onSubmit={handleConfirmHandover}
            className="xl:col-span-5 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-4 sm:p-5 space-y-4"
          >
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Execute Shift Handover &amp; Advance Cycle
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Captures live {siteMeta.code} Tier IV telemetry and transitions watch ownership to the next cycle slot.
              </p>
            </div>

            <div className="p-3 rounded-md bg-slate-50 dark:bg-[#14181D] border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2 font-mono tabular-nums">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {snapshot.onDutyTeam} ({snapshot.activeSlot.slot})
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
                <span className="font-semibold text-[#009530] dark:text-[#3DCD58]">
                  {snapshot.nextTeam} ({snapshot.nextSlot.slot})
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-1 font-mono tabular-nums">
                <span>Outgoing: {activeProfile.name}</span>
                <span>Incoming Lead: {incomingLead?.name ?? `${snapshot.nextTeam} Lead`}</span>
              </div>
              <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 flex flex-wrap gap-x-3 gap-y-1 font-mono tabular-nums">
                <span>Site: {siteMeta.code}</span>
                <span>Crit: {openCriticalCount}</span>
                <span>Warn: {openWarningCount}</span>
                <span>PUE: {sitePue.toFixed(2)}</span>
                <span>SLA: {slaCompliancePct.toFixed(1)}%</span>
              </div>
            </div>

            {/* Auto-Compiled Shift Handover Brief Preview */}
            {compiledBrief && (
              <div
                data-testid="shift-compiled-brief-card"
                className="p-3 rounded-md bg-emerald-50/50 dark:bg-[#141E18] border border-[#009530]/30 space-y-2.5 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#007A27] dark:text-[#3DCD58]" aria-hidden="true" />
                    Auto-Compiled Live Watch Brief
                  </div>
                  {cloudSynced && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#007A27] dark:text-[#3DCD58]">
                      <Cloud className="w-3 h-3" aria-hidden="true" />
                      Cloud Sync ({cloudHandoversCount})
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-[11px] tabular-nums">
                  <div className="px-2 py-1 rounded bg-white dark:bg-[#1B2026] border border-slate-200/80 dark:border-slate-800">
                    <span className="text-slate-500">Alarms: </span>
                    <strong className="text-slate-900 dark:text-white">
                      {compiledBrief.unresolvedCritical}C / {compiledBrief.unresolvedWarning}W
                    </strong>
                  </div>
                  <div className="px-2 py-1 rounded bg-white dark:bg-[#1B2026] border border-slate-200/80 dark:border-slate-800">
                    <span className="text-slate-500">P1/P2 Tix: </span>
                    <strong className="text-slate-900 dark:text-white">{compiledBrief.openP1P2Tickets}</strong>
                  </div>
                  <div className="px-2 py-1 rounded bg-white dark:bg-[#1B2026] border border-slate-200/80 dark:border-slate-800">
                    <span className="text-slate-500">Contractors: </span>
                    <strong className="text-slate-900 dark:text-white">{compiledBrief.activeContractorsOnSite}</strong>
                  </div>
                  <div className="px-2 py-1 rounded bg-white dark:bg-[#1B2026] border border-slate-200/80 dark:border-slate-800">
                    <span className="text-slate-500">BMS Overrides: </span>
                    <strong className="text-slate-900 dark:text-white">{compiledBrief.bmsOverridesCount}</strong>
                  </div>
                  <div className="px-2 py-1 rounded bg-white dark:bg-[#1B2026] border border-slate-200/80 dark:border-slate-800 col-span-2">
                    <span className="text-slate-500">Pending PMs: </span>
                    <strong className="text-slate-900 dark:text-white">{compiledBrief.pendingPmCount}</strong>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    data-testid="shift-autofill-brief-btn"
                    onClick={() => setHandoverNotes(compiledBrief.summaryText)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded border border-[#009530]/40 bg-white dark:bg-[#1B2026] text-[#007A27] dark:text-[#3DCD58] hover:bg-[#009530]/10 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" aria-hidden="true" />
                    Auto-Fill Briefing Notes
                  </button>
                  <button
                    type="button"
                    data-testid="shift-download-brief-btn"
                    onClick={handleDownloadBriefMarkdown}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Download className="w-3 h-3" aria-hidden="true" />
                    Download Brief (.md)
                  </button>
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="handover-notes"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Shift Handover Briefing Notes
              </label>
              <textarea
                id="handover-notes"
                rows={4}
                value={handoverNotes}
                onChange={(e) => setHandoverNotes(e.target.value)}
                placeholder="Summarize active alarms, chiller plant balance, ongoing MOPs, and cold-aisle hotspots for the incoming watch..."
                className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checklistVerified}
                  onChange={(e) => setChecklistVerified(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-[#009530] focus:ring-[#009530]"
                />
                <span>Tier IV 2N/2(N+1) power, 2 Water + 6 Air Chillers, and Cold Aisle SLA verified</span>
              </label>

              <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={switchToIncomingLead}
                  onChange={(e) => setSwitchToIncomingLead(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-[#009530] focus:ring-[#009530]"
                />
                <span>
                  Switch active console profile to incoming lead ({incomingLead?.name ?? `${snapshot.nextTeam} Lead`})
                </span>
              </label>
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-md bg-[#009530] hover:bg-[#007a27] text-white transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              Confirm Handover &amp; Advance Shift
            </button>
          </form>

          {/* Auditable Shift Handover Log */}
          <section className="xl:col-span-7 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Auditable Shift Handover Ledger
              </h2>
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {shiftState.handoverLog.length} entries
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {shiftState.handoverLog.map((entry) => (
                <article key={entry.id} className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 font-mono tabular-nums">
                      <span>{entry.siteId.toUpperCase()}</span>
                      <span className="text-slate-400" aria-hidden="true">·</span>
                      <span>
                        {entry.outgoingTeam} ({entry.outgoingSlot}) → {entry.incomingTeam} ({entry.incomingSlot})
                      </span>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {formatTimestamp(entry.timestamp)} · Day {entry.cycleDayNumber}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    <span>From: {entry.outgoingOperatorName}</span>
                    <span>To: {entry.incomingLeadName}</span>
                    <span>PUE {entry.sitePue.toFixed(2)}</span>
                    <span>SLA {entry.slaCompliancePct.toFixed(1)}%</span>
                    <span
                      className={
                        entry.openCriticalCount > 0
                          ? 'text-red-700 dark:text-red-400 font-semibold'
                          : 'text-[#009530] dark:text-[#3DCD58]'
                      }
                    >
                      Crit {entry.openCriticalCount} / Warn {entry.openWarningCount}
                    </span>
                    {entry.checklistVerified && (
                      <span className="text-[#009530] dark:text-[#3DCD58]">Tier IV Checklist OK</span>
                    )}
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    {entry.notes}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import {
  AlertTriangle,
  DoorOpen,
  LayoutGrid,
  Lock,
  ShieldCheck,
  Unlock,
  UserCheck,
} from 'lucide-react';
import {
  createInitialAccessEvents,
  createInitialRackLocks,
  PhysicalAccessEvent,
  SmartRackLock,
} from '../engine/enterpriseOpsEngine';
import { SecurityThermalCorrelation } from '../engine/opsEnhancementsEngine';
import { SITE_META_MAP, SiteId } from '../engine/sites';
import { HallId } from '../engine/types';
import { VisitorRecord } from '../engine/visitorEngine';
import { formatRelativeTime } from './StatusIndicator';

interface PhysicalSecurityViewProps {
  activeSiteId: SiteId;
  visitors: VisitorRecord[];
  activeOperatorName: string;
  locksBySite?: Record<SiteId, SmartRackLock[]>;
  onUpdateLocksBySite?: (updater: (prev: Record<SiteId, SmartRackLock[]>) => Record<SiteId, SmartRackLock[]>) => void;
  securityCorrelations?: SecurityThermalCorrelation[];
  onFocusRackOnMap?: (hallId: HallId, rackId: string) => void;
  onOpenVisitorTab: () => void;
  onLogAudit: (category: 'Security', action: string, target: string) => void;
}

export function PhysicalSecurityView({
  activeSiteId,
  visitors,
  activeOperatorName,
  locksBySite: externalLocksBySite,
  onUpdateLocksBySite,
  securityCorrelations = [],
  onFocusRackOnMap,
  onOpenVisitorTab,
  onLogAudit,
}: PhysicalSecurityViewProps) {
  const [localLocksBySite, setLocalLocksBySite] = useState<Record<SiteId, SmartRackLock[]>>(() => {
    const now = Date.now();
    return {
      kl1: createInitialRackLocks('kl1', now),
      kl2: createInitialRackLocks('kl2', now),
      kl3: createInitialRackLocks('kl3', now),
    };
  });

  const locksBySite = externalLocksBySite ?? localLocksBySite;
  const setLocksBySite = onUpdateLocksBySite ?? setLocalLocksBySite;

  const [eventsBySite, setEventsBySite] = useState<Record<SiteId, PhysicalAccessEvent[]>>(() => {
    const now = Date.now();
    return {
      kl1: createInitialAccessEvents('kl1', now),
      kl2: createInitialAccessEvents('kl2', now),
      kl3: createInitialAccessEvents('kl3', now),
    };
  });

  const locks = locksBySite[activeSiteId];
  const events = eventsBySite[activeSiteId];
  const siteCode = SITE_META_MAP[activeSiteId].code;
  const now = Date.now();

  const onSiteVisitors = visitors.filter((v) => v.siteId === activeSiteId && v.status === 'Checked In');

  const handleToggleLock = (lock: SmartRackLock) => {
    const isNowLocked = lock.lockState !== 'Locked';
    setLocksBySite((prev) => ({
      ...prev,
      [activeSiteId]: prev[activeSiteId].map((l) =>
        l.id === lock.id
          ? {
              ...l,
              lockState: isNowLocked ? 'Locked' : 'Unlocked',
              frontDoorClosed: isNowLocked ? true : l.frontDoorClosed,
              rearDoorClosed: isNowLocked ? true : l.rearDoorClosed,
              lastBadgeUser: `${activeOperatorName} (Remote NOC)`,
              lastEventAt: Date.now(),
              rackTempDeltaC: isNowLocked ? 0.1 : l.rackTempDeltaC,
              correlatedAlert: isNowLocked ? null : 'Remote NOC unlock active — monitoring door sensor.',
            }
          : l
      ),
    }));
    const newEvt: PhysicalAccessEvent = {
      id: `acc-op-${Date.now().toString(36)}`,
      siteId: activeSiteId,
      timestamp: Date.now(),
      actorName: activeOperatorName,
      badgeId: 'NOC-ADMIN',
      method: 'Remote NOC Unlock',
      zoneOrRack: lock.rackId,
      outcome: 'Granted',
      correlationNote: isNowLocked ? 'Cabinet secured & door alarm cleared.' : 'Cabinet remotely unlocked from NOC.',
    };
    setEventsBySite((prev) => ({
      ...prev,
      [activeSiteId]: [newEvt, ...prev[activeSiteId]],
    }));
    onLogAudit(
      'Security',
      isNowLocked ? `Secured smart rack lock & cleared door alarm on ${lock.rackId}` : `Unlocked smart cabinet ${lock.rackId} remotely`,
      lock.rackId
    );
  };

  const handleSimulateDoorBreach = (lock: SmartRackLock) => {
    setLocksBySite((prev) => ({
      ...prev,
      [activeSiteId]: prev[activeSiteId].map((l) =>
        l.id === lock.id
          ? {
              ...l,
              lockState: 'Door Open Alarm',
              frontDoorClosed: false,
              lastEventAt: Date.now(),
              rackTempDeltaC: 2.9,
              correlatedAlert: 'Forced door ajar detected — correlated +2.9°C cold-aisle bypass thermal rise.',
            }
          : l
      ),
    }));
    const newEvt: PhysicalAccessEvent = {
      id: `acc-alm-${Date.now().toString(36)}`,
      siteId: activeSiteId,
      timestamp: Date.now(),
      actorName: 'Door Magnetic Sensor',
      badgeId: 'UNBADGED',
      method: 'Forced Door Sensor',
      zoneOrRack: `${lock.rackId} (Front Door)`,
      outcome: 'Alarm',
      correlationNote: 'Simulated unauthorized door open correlated with +2.9°C thermal anomaly.',
    };
    setEventsBySite((prev) => ({
      ...prev,
      [activeSiteId]: [newEvt, ...prev[activeSiteId]],
    }));
    onLogAudit('Security', `Triggered door-open intrusion alarm on ${lock.rackId}`, lock.rackId);
  };

  const alarmLocks = locks.filter((l) => l.lockState === 'Door Open Alarm').length;
  const securedLocks = locks.filter((l) => l.lockState === 'Locked').length;

  return (
    <div className="space-y-5 pb-16" data-testid="physical-security-view">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Physical Security — Access Control &amp; Smart Cabinet Locks
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Badge &amp; biometric mantrap logs, electronic smart rack locks, door-open alarms correlated with thermal spikes, and active visitor escorts
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenVisitorTab}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap self-start xl:self-auto"
        >
          <UserCheck className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
          Manage Visitors &amp; Escorts ({onSiteVisitors.length} On-Site)
        </button>
      </div>

      {/* 4-Column KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Smart Rack Locks Secured ({siteCode})</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#007A27] dark:text-[#3DCD58]">
            {securedLocks} / {locks.length}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Dual front/rear electronic swinghandles</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Active Door-Open Alarms</div>
          <div
            data-testid="security-door-alarms-count"
            className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${
              alarmLocks > 0 ? 'text-red-600 dark:text-red-400' : 'text-[#007A27] dark:text-[#3DCD58]'
            }`}
          >
            {alarmLocks}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Correlated with hall thermal sensors</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Escorted Visitors On-Site</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {onSiteVisitors.length}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Synced live with Visitor Management</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Access Events Logged (24h)</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {events.length}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">RFID + Biometric + Smart Rack audit</div>
        </div>
      </section>

      {/* Live Security <-> Thermal Correlation Alerts */}
      {securityCorrelations.length > 0 && (
        <section
          data-testid="security-thermal-correlations-panel"
          className="bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 rounded-md p-4 space-y-2"
        >
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-amber-900 dark:text-amber-300">
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              Live Physical Access ↔ Thermal Spike Correlations ({securityCorrelations.length})
            </span>
            <span className="font-mono text-[11px] font-normal">Synced with Rack Map &amp; BMS Sensors</span>
          </div>
          <div className="divide-y divide-amber-200/70 dark:divide-amber-900/50">
            {securityCorrelations.map((c) => (
              <div key={c.id} className="py-2 first:pt-1 last:pb-0 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-amber-950 dark:text-amber-100">{c.summary}</span>
                {onFocusRackOnMap && (
                  <button
                    type="button"
                    data-testid={`security-inspect-rack-${c.rackId}`}
                    onClick={() => onFocusRackOnMap(c.hallId, c.rackId)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-amber-400/70 dark:border-amber-700 bg-white dark:bg-[#1B2026] text-amber-900 dark:text-amber-200 hover:bg-amber-100/70 dark:hover:bg-amber-950/60 cursor-pointer whitespace-nowrap"
                  >
                    <LayoutGrid className="w-3 h-3" aria-hidden="true" />
                    Inspect {c.rackId} on Rack Map
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Smart Rack Lock Control Table */}
      <section className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <ShieldCheck className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
          Electronic Smart Rack Lock Status &amp; Thermal Correlation — {siteCode}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pl-4 pr-3 font-semibold">Cabinet &amp; Tenant</th>
                <th className="py-2.5 px-3 font-semibold">Doors (F / R)</th>
                <th className="py-2.5 px-3 font-semibold">Last Badge Access</th>
                <th className="py-2.5 px-3 font-semibold">Telemetry Correlation</th>
                <th className="py-2.5 pl-3 pr-4 font-semibold text-right">Lock Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {locks.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 pl-4 pr-3">
                    <div className="font-mono text-[11px] font-semibold text-[#007A27] dark:text-[#3DCD58]">
                      {l.rackId} · {l.hallLabel}
                    </div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">{l.tenantName}</div>
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap font-mono text-[11px]">
                    <div
                      className={
                        l.lockState === 'Door Open Alarm'
                          ? 'text-red-600 dark:text-red-400 font-bold'
                          : l.lockState === 'Unlocked'
                          ? 'text-amber-600 dark:text-amber-400 font-semibold'
                          : 'text-[#007A27] dark:text-[#3DCD58] font-semibold'
                      }
                    >
                      {l.lockState}
                    </div>
                    <div className="text-slate-500">
                      F: {l.frontDoorClosed ? 'Closed' : 'OPEN'} · R: {l.rearDoorClosed ? 'Closed' : 'OPEN'}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="text-slate-800 dark:text-slate-200">{l.lastBadgeUser}</div>
                    <div className="font-mono text-[11px] text-slate-500">{formatRelativeTime(l.lastEventAt, now)}</div>
                  </td>
                  <td className="py-3 px-3 max-w-xs">
                    {l.correlatedAlert ? (
                      <span className="inline-flex items-start gap-1 text-red-700 dark:text-red-400 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{l.correlatedAlert}</span>
                      </span>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                        Nominal · ΔT +{l.rackTempDeltaC.toFixed(1)}°C
                      </span>
                    )}
                  </td>
                  <td className="py-3 pl-3 pr-4 text-right whitespace-nowrap space-x-1.5">
                    <button
                      type="button"
                      data-testid={`toggle-lock-${l.id}`}
                      onClick={() => handleToggleLock(l)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      {l.lockState === 'Locked' ? (
                        <>
                          <Unlock className="w-3 h-3" /> Unlock
                        </>
                      ) : (
                        <>
                          <Lock className="w-3 h-3 text-[#009530]" /> Secure Lock
                        </>
                      )}
                    </button>
                    {l.lockState !== 'Door Open Alarm' && (
                      <button
                        type="button"
                        onClick={() => handleSimulateDoorBreach(l)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-red-300 dark:border-red-900 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                      >
                        <DoorOpen className="w-3 h-3" /> Test Alarm
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bottom Split: Badge & Biometric Stream + Active Escorted Visitors */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <section className="xl:col-span-7 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Badge / Biometric &amp; Door-Sensor Event Correlation Log
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
            {events.map((ev) => (
              <div key={ev.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{ev.actorName}</span>
                    <span className="font-mono text-[11px] text-slate-500">{ev.badgeId}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-600 dark:text-slate-300">{ev.zoneOrRack}</span>
                  </div>
                  {ev.correlationNote && (
                    <div className="text-[11px] text-slate-600 dark:text-slate-400">{ev.correlationNote}</div>
                  )}
                </div>
                <div className="text-right shrink-0 font-mono text-[11px]">
                  <div
                    className={
                      ev.outcome === 'Alarm' || ev.outcome === 'Denied'
                        ? 'text-red-600 dark:text-red-400 font-semibold'
                        : 'text-[#007A27] dark:text-[#3DCD58] font-semibold'
                    }
                  >
                    {ev.outcome}
                  </div>
                  <div className="text-slate-400">{formatRelativeTime(ev.timestamp, now)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="xl:col-span-5 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Active Escorted Contractors &amp; Visitors ({onSiteVisitors.length})
            </span>
            <span className="font-mono text-xs text-[#007A27] dark:text-[#3DCD58]">{siteCode} Live</span>
          </div>
          {onSiteVisitors.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No external visitors currently checked into {siteCode}.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
              {onSiteVisitors.map((v) => (
                <div key={v.id} className="px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{v.fullName}</span>
                    <span className="font-mono text-[11px] font-semibold text-[#007A27] dark:text-[#3DCD58]">
                      {v.badgeNumber}
                    </span>
                  </div>
                  <div className="text-slate-600 dark:text-slate-400">
                    {v.company} · Escort: <strong>{v.escortName}</strong>
                  </div>
                  <div className="font-mono text-[11px] text-slate-500">
                    Zones: {v.accessZones.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

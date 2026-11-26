import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Flame,
  Gauge,
  Pause,
  Play,
  ShieldCheck,
  Tv,
  X,
  Zap,
} from 'lucide-react';
import { buildAllWallboardSnapshots, WallboardSiteSnapshot } from '../engine/nocWallboardEngine';
import { OperatorProfile } from '../engine/shiftEngine';
import { SiteId, SiteWorkspaceState } from '../engine/sites';
import { RackDefinition } from '../engine/types';

interface NocWallboardModalProps {
  open: boolean;
  initialSiteId: SiteId;
  sitesMap: Record<SiteId, SiteWorkspaceState>;
  racks: RackDefinition[];
  operators: OperatorProfile[];
  onClose: () => void;
  onFocusRack?: (siteId: SiteId, rackId: string) => void;
}

type RotateSec = 0 | 10 | 20 | 30;

export function NocWallboardModal({
  open,
  initialSiteId,
  sitesMap,
  racks,
  operators,
  onClose,
  onFocusRack,
}: NocWallboardModalProps) {
  const [selectedSiteId, setSelectedSiteId] = useState<SiteId>(initialSiteId);
  const [rotateSec, setRotateSec] = useState<RotateSec>(20);
  const [clockLabel, setClockLabel] = useState<string>(() =>
    new Date().toLocaleTimeString('en-GB', { hour12: false })
  );

  useEffect(() => {
    if (open) {
      setSelectedSiteId(initialSiteId);
    }
  }, [open, initialSiteId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => {
      setClockLabel(new Date().toLocaleTimeString('en-GB', { hour12: false }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  const snapshots = useMemo(
    () => buildAllWallboardSnapshots(sitesMap, racks, operators),
    [sitesMap, racks, operators]
  );

  useEffect(() => {
    if (!open || rotateSec === 0) return;
    const order: SiteId[] = ['kl1', 'kl2', 'kl3'];
    const id = window.setInterval(() => {
      setSelectedSiteId((prev) => order[(order.indexOf(prev) + 1) % order.length]);
    }, rotateSec * 1000);
    return () => window.clearInterval(id);
  }, [open, rotateSec]);

  if (!open) return null;

  const activeSnap: WallboardSiteSnapshot =
    snapshots.find((s) => s.siteId === selectedSiteId) ?? snapshots[0];

  const fleetLoadMw = snapshots.reduce((sum, s) => sum + s.totalItLoadMw, 0);
  const fleetCrit = snapshots.reduce((sum, s) => sum + s.criticalAlertCount, 0);

  return (
    <div
      data-testid="noc-wallboard-modal"
      className="fixed inset-0 z-[80] bg-slate-950 text-slate-100 flex flex-col overflow-hidden"
    >
      {/* Top Kiosk Header */}
      <header className="flex items-center justify-between gap-4 px-6 py-3.5 border-b border-slate-800 bg-slate-900/90 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center shrink-0">
            <Tv className="w-5 h-5 text-blue-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-bold tracking-tight text-white truncate">
                ORISE DCIM · NOC COMMAND WALLBOARD
              </h1>
              <span className="text-xs font-mono font-semibold text-emerald-400 whitespace-nowrap">
                ● LIVE TELEMETRY
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono truncate">
              Fleet Load {fleetLoadMw.toFixed(2)} MW · {fleetCrit} Fleet P1 Critical · Active Focus:{' '}
              {activeSnap.siteCode} ({activeSnap.siteName})
            </p>
          </div>
        </div>

        {/* Site Switcher + Auto-Rotate + Exit */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center rounded-lg border border-slate-700 bg-slate-900 p-0.5">
            {snapshots.map((snap) => (
              <button
                key={snap.siteId}
                type="button"
                data-testid={`wallboard-site-${snap.siteId}`}
                onClick={() => setSelectedSiteId(snap.siteId)}
                className={`px-3 py-1 rounded-md text-xs font-semibold font-mono whitespace-nowrap transition-colors ${
                  snap.siteId === activeSnap.siteId
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {snap.siteCode}
                {snap.criticalAlertCount > 0 && (
                  <span className="ml-1.5 text-rose-400">({snap.criticalAlertCount})</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1">
            {rotateSec === 0 ? (
              <Pause className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Play className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <select
              aria-label="Auto-rotate interval"
              data-testid="wallboard-rotate-select"
              value={rotateSec}
              onChange={(e) => setRotateSec(Number(e.target.value) as RotateSec)}
              className="bg-transparent text-xs font-mono text-slate-200 focus:outline-none"
            >
              <option value={10} className="bg-slate-900">
                Rotate 10s
              </option>
              <option value={20} className="bg-slate-900">
                Rotate 20s
              </option>
              <option value={30} className="bg-slate-900">
                Rotate 30s
              </option>
              <option value={0} className="bg-slate-900">
                Paused
              </option>
            </select>
          </div>

          <div className="font-mono tabular-nums text-sm font-semibold text-slate-200 px-2.5 py-1 rounded border border-slate-800 bg-slate-900 whitespace-nowrap">
            {clockLabel} MYT
          </div>

          <button
            type="button"
            data-testid="wallboard-exit-btn"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-100 whitespace-nowrap transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Exit Wallboard
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-6 py-4 space-y-3.5">
        {/* 4-KPI High-Visibility Telemetry Strip */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5">
            <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-400">
              <span>Campus IT Load</span>
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono tabular-nums text-white">
                {activeSnap.totalItLoadMw.toFixed(2)} MW
              </span>
              <span className="text-xs font-mono text-slate-400">
                / {activeSnap.totalCapacityMw.toFixed(1)} MW
              </span>
            </div>
            <div className="mt-2.5 h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${Math.min(100, activeSnap.utilizationPct)}%` }}
              />
            </div>
            <div className="mt-1.5 text-xs font-mono text-slate-400">
              {activeSnap.utilizationPct.toFixed(1)}% plant utilization · {activeSnap.region}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-400">
              <span>Live Campus PUE</span>
              <Gauge className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono tabular-nums text-white">
                {activeSnap.pue.toFixed(2)}
              </span>
              <span
                className={`text-xs font-semibold ${
                  activeSnap.pue <= 1.32 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {activeSnap.pue <= 1.32 ? 'Target <= 1.32' : 'Elevated Overhead'}
              </span>
            </div>
            <div className="mt-3 text-xs font-mono text-slate-400">
              Avg Inlet {activeSnap.avgInletTempC.toFixed(1)}°C · Peak Exhaust{' '}
              {activeSnap.peakExhaustTempC.toFixed(1)}°C
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-400">
              <span>ASHRAE Class A1 SLA</span>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono tabular-nums text-emerald-400">
                {activeSnap.ashraeCompliancePct.toFixed(1)}%
              </span>
              <span className="text-xs font-mono text-slate-400">18–27°C Intake</span>
            </div>
            <div className="mt-3 text-xs font-mono text-slate-400">
              {activeSnap.overCapacityRackCount} over-capacity cabinet(s) detected
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-400">
              <span>Active Incidents</span>
              <AlertTriangle
                className={`w-4 h-4 ${
                  activeSnap.criticalAlertCount > 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              />
            </div>
            <div className="mt-2 flex items-baseline gap-3 font-mono tabular-nums">
              <span
                className={`text-3xl font-bold ${
                  activeSnap.criticalAlertCount > 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {activeSnap.criticalAlertCount} P1
              </span>
              <span className="text-lg font-semibold text-amber-400">
                {activeSnap.warningAlertCount} P2
              </span>
            </div>
            <div className="mt-3 text-xs font-mono text-slate-400">
              {activeSnap.openAlertCount} total open alert(s) at {activeSnap.siteCode}
            </div>
          </div>
        </section>

        {/* Two-Column NOC Operational Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Priority Incident Stream */}
          <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-900/80 p-4 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-rose-400" />
                <h2 className="text-sm font-semibold text-white">
                  {activeSnap.siteCode} Priority Incident Feed
                </h2>
              </div>
              <span className="text-xs font-mono text-slate-400">
                Sorted by Severity & Recency
              </span>
            </div>

            {activeSnap.topIncidents.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-2" />
                <p className="text-sm font-semibold text-emerald-300">
                  Zero Active Critical or Warning Incidents
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  All {activeSnap.siteCode} halls, chillers, and power paths are within SLA thresholds.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80 mt-2">
                {activeSnap.topIncidents.map((alert) => (
                  <div
                    key={alert.id}
                    className="py-3 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider font-mono ${
                            alert.severity === 'critical' ? 'text-rose-400' : 'text-amber-400'
                          }`}
                        >
                          [{alert.severity === 'critical' ? 'P1 CRIT' : 'P2 WARN'}]
                        </span>
                        <span className="text-sm font-semibold text-white truncate">
                          {alert.ruleName}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 line-clamp-2">{alert.message}</p>
                      <div className="text-[11px] font-mono text-slate-400">
                        {alert.serverHostname} · Rack {alert.rackId} · State:{' '}
                        <span className="uppercase text-slate-300">{alert.state}</span>
                      </div>
                    </div>
                    {onFocusRack && alert.rackId && /^[A-D]-R\d{2}-\d{2}$/.test(alert.rackId) && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onFocusRack(activeSnap.siteId, alert.rackId);
                        }}
                        className="px-2.5 py-1 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-slate-200 whitespace-nowrap shrink-0"
                      >
                        Inspect Rack
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Thermal Hotspots + On-Duty Campus Lead */}
          <div className="lg:col-span-5 space-y-5">
            {/* Thermal Hotspot Watchlist */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-orange-400" />
                  <h2 className="text-sm font-semibold text-white">
                    Top 5 Thermal Hotspots ({activeSnap.siteCode})
                  </h2>
                </div>
                <span className="text-xs font-mono text-slate-400">Avg / Peak °C</span>
              </div>
              <div className="mt-2 divide-y divide-slate-800/80">
                {activeSnap.hotspots.map((h) => {
                  const isHot = h.avgTempC >= 65;
                  return (
                    <div
                      key={h.rackId}
                      className="py-2 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono font-semibold text-white">{h.rackId}</span>
                        <span className="text-[11px] uppercase text-slate-400">{h.hallId}</span>
                      </div>
                      <div className="flex items-center gap-3 font-mono tabular-nums whitespace-nowrap">
                        <span className="text-slate-400">
                          {h.powerKw.toFixed(1)}/{h.powerCapacityKw} kW
                        </span>
                        <span
                          className={`font-bold ${
                            h.avgTempC >= 72
                              ? 'text-rose-400'
                              : isHot
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {h.avgTempC.toFixed(1)}°C{' '}
                          <span className="text-slate-500 font-normal">
                            (pk {h.maxTempC.toFixed(1)}°)
                          </span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* On-Duty DCO Campus Lead */}
            {activeSnap.onDutyLead && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                <div className="text-xs uppercase tracking-wider text-slate-400 mb-3">
                  On-Duty Campus Lead · {activeSnap.siteCode}
                </div>
                <div className="flex items-center gap-3.5">
                  {activeSnap.onDutyLead.avatarUrl ? (
                    <img
                      src={activeSnap.onDutyLead.avatarUrl}
                      alt={activeSnap.onDutyLead.name}
                      className="w-12 h-12 rounded-full object-cover border-2 border-emerald-500/70 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-blue-600/30 border border-blue-400/50 flex items-center justify-center text-sm font-bold text-blue-200 shrink-0">
                      {activeSnap.onDutyLead.initials}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">
                      {activeSnap.onDutyLead.name}
                    </div>
                    <div className="text-xs text-emerald-400 font-medium truncate">
                      {activeSnap.onDutyLead.role} · {activeSnap.onDutyLead.shiftTeam}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 mt-0.5 truncate">
                      {activeSnap.onDutyLead.phone} · {activeSnap.onDutyLead.email}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Bottom Fleet Comparison Strip */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {snapshots.map((snap) => {
            const isCurrent = snap.siteId === activeSnap.siteId;
            return (
              <button
                key={snap.siteId}
                type="button"
                onClick={() => setSelectedSiteId(snap.siteId)}
                className={`text-left rounded-xl border p-3.5 transition-colors ${
                  isCurrent
                    ? 'border-blue-500 bg-blue-950/30'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold font-mono text-white">
                    {snap.siteCode} · {snap.region}
                  </span>
                  <span
                    className={`text-[11px] font-mono font-semibold ${
                      snap.criticalAlertCount > 0 ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {snap.criticalAlertCount > 0 ? `${snap.criticalAlertCount} P1` : 'NOMINAL'}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs font-mono tabular-nums text-slate-300">
                  <span>{snap.totalItLoadMw.toFixed(2)} MW</span>
                  <span>PUE {snap.pue.toFixed(2)}</span>
                  <span>SLA {snap.ashraeCompliancePct.toFixed(1)}%</span>
                </div>
              </button>
            );
          })}
        </section>
      </main>
    </div>
  );
}

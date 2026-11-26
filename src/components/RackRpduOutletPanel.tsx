import { useMemo, useState } from 'react';
import { Lock, Power, RotateCw, ShieldAlert, Unlock, Zap } from 'lucide-react';
import { RackBmsPowerStat } from '../engine/rackPowerEngine';
import {
  applyRpduOutletAction,
  computeRackRpduStrip,
  RpduFeedId,
  RpduOutletMetric,
  RpduOverrideMap,
} from '../engine/rpduOutletEngine';
import { ImmutableAuditEntry } from '../engine/enterpriseOpsEngine';
import { RackDefinition, ServerNode } from '../engine/types';

interface RackRpduOutletPanelProps {
  rack: RackDefinition;
  servers: ServerNode[];
  powerStat?: RackBmsPowerStat;
  overrides: RpduOverrideMap;
  onUpdateOverrides: (next: RpduOverrideMap) => void;
  onLogAudit?: (category: ImmutableAuditEntry['category'], action: string, target: string) => void;
}

type OutletFilter = 'all' | 'occupied' | 'locked' | 'off';

interface PendingAction {
  outlet: RpduOutletMetric;
  action: 'toggle_power' | 'power_cycle';
}

export function RackRpduOutletPanel({
  rack,
  servers,
  powerStat,
  overrides,
  onUpdateOverrides,
  onLogAudit,
}: RackRpduOutletPanelProps) {
  const [feed, setFeed] = useState<RpduFeedId>('A');
  const [filter, setFilter] = useState<OutletFilter>('occupied');
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const strip = useMemo(
    () =>
      computeRackRpduStrip({
        rack,
        feed,
        servers,
        powerStat,
        overrides,
      }),
    [rack, feed, servers, powerStat, overrides]
  );

  const visibleOutlets = useMemo(() => {
    return strip.outlets.filter((o) => {
      if (filter === 'occupied') return o.assignedDevice !== 'Spare / Unassigned';
      if (filter === 'locked') return o.locked;
      if (filter === 'off') return o.powerState === 'Off';
      return true;
    });
  }, [strip.outlets, filter]);

  const executeAction = (
    outlet: RpduOutletMetric,
    action: 'toggle_power' | 'power_cycle' | 'toggle_lock'
  ) => {
    const result = applyRpduOutletAction(overrides, outlet, action, Date.now());
    setFeedback({ ok: result.ok, text: result.message });
    setPendingAction(null);
    if (result.ok) {
      onUpdateOverrides(result.overrides);
      onLogAudit?.('Power / SLD', result.message, `${outlet.rackId} · ${strip.pduName} #${outlet.outletNumber}`);
    }
  };

  const utilColor =
    strip.utilizationPct >= 85
      ? 'bg-rose-500'
      : strip.utilizationPct >= 70
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  return (
    <div
      data-testid="rack-rpdu-outlet-panel"
      className="rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900/70 p-3 space-y-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200 whitespace-nowrap">
            rPDU Outlets (24)
          </span>
        </div>
        <div className="flex items-center rounded border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0">
          {(['A', 'B'] as RpduFeedId[]).map((f) => (
            <button
              key={f}
              type="button"
              data-testid={`rpdu-feed-${f.toLowerCase()}-btn`}
              onClick={() => {
                setFeed(f);
                setPendingAction(null);
              }}
              className={`px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap transition-colors ${
                feed === f
                  ? f === 'A'
                    ? 'bg-blue-600 text-white'
                    : 'bg-indigo-600 text-white'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              Feed {f}
            </button>
          ))}
        </div>
      </div>

      {/* Strip Load Summary */}
      <div className="rounded bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 p-2 space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="font-mono font-semibold text-slate-800 dark:text-slate-100 truncate">
            {strip.pduName}
          </span>
          <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200 whitespace-nowrap">
            {strip.totalAmps.toFixed(1)} / {strip.ratedAmps} A ({strip.utilizationPct.toFixed(1)}%)
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <div
            className={`h-full transition-all ${utilColor}`}
            style={{ width: `${Math.min(100, strip.utilizationPct)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
          <span>
            {(strip.totalWatts / 1000).toFixed(2)} kW @ {strip.voltageV}V
          </span>
          <span>
            {strip.occupiedCount}/24 used · {strip.onCount} ON · {strip.lockedCount} locked
          </span>
        </div>
      </div>

      {/* Inline Guarded Confirmation Banner (Zero browser confirm dialogs) */}
      {pendingAction && (
        <div
          data-testid="rpdu-confirm-banner"
          className="rounded border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/40 p-2 space-y-1.5"
        >
          <div className="flex items-start gap-1.5 text-[11px] text-amber-900 dark:text-amber-200">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <span>
              Confirm{' '}
              <strong>
                {pendingAction.action === 'power_cycle'
                  ? 'Remote Power Cycle'
                  : pendingAction.outlet.powerState === 'On'
                  ? 'Power OFF'
                  : 'Power ON'}
              </strong>{' '}
              on Feed {pendingAction.outlet.feed} Port #{String(pendingAction.outlet.outletNumber).padStart(2, '0')} (
              {pendingAction.outlet.assignedDevice})?
            </span>
          </div>
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setPendingAction(null)}
              className="px-2 py-0.5 rounded text-[10px] font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="rpdu-confirm-execute-btn"
              onClick={() => executeAction(pendingAction.outlet, pendingAction.action)}
              className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-600 hover:bg-amber-700 text-white whitespace-nowrap"
            >
              Confirm Execute
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <div
          data-testid="rpdu-action-feedback"
          className={`text-[10px] px-2 py-1 rounded border ${
            feedback.ok
              ? 'border-emerald-200 dark:border-emerald-700/50 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
              : 'border-rose-200 dark:border-rose-700/50 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex items-center gap-1">
        {(
          [
            ['occupied', `Occupied (${strip.occupiedCount})`],
            ['all', 'All (24)'],
            ['locked', `Locked (${strip.lockedCount})`],
            ['off', `Off (${strip.offCount})`],
          ] as [OutletFilter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap transition-colors ${
              filter === key
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Scrollable 24-Port Outlet Table */}
      <div className="max-h-56 overflow-y-auto overflow-x-hidden border border-slate-200 dark:border-slate-700/70 rounded">
        <table className="w-full table-fixed text-left border-collapse">
          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-[9px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-1.5 px-1.5 w-[44px]">Port</th>
              <th className="py-1.5 px-1">Assigned Load</th>
              <th className="py-1.5 px-1 w-[56px] text-right">Draw</th>
              <th className="py-1.5 px-1.5 w-[78px] text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[10px]">
            {visibleOutlets.map((o) => {
              const isOff = o.powerState === 'Off';
              return (
                <tr
                  key={o.id}
                  data-testid={`rpdu-outlet-row-${o.outletNumber}`}
                  className={`${
                    isOff
                      ? 'bg-slate-50/70 dark:bg-slate-900/40 text-slate-400 dark:text-slate-500'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <td className="py-1.5 px-1.5 font-mono tabular-nums whitespace-nowrap">
                    <div className="font-semibold text-slate-800 dark:text-slate-100">
                      #{String(o.outletNumber).padStart(2, '0')}
                    </div>
                    <div className="text-[8px] text-slate-400">{o.connectorType}</div>
                  </td>
                  <td className="py-1.5 px-1 min-w-0">
                    <div className="truncate font-medium" title={o.assignedDevice}>
                      {o.assignedDevice}
                    </div>
                    <div className="flex items-center gap-1 text-[9px] text-slate-400 font-mono truncate">
                      <span
                        className={
                          isOff
                            ? 'text-slate-400'
                            : 'text-emerald-600 dark:text-emerald-400 font-semibold'
                        }
                      >
                        {o.powerState.toUpperCase()}
                      </span>
                      <span>PF {o.powerFactor.toFixed(2)}</span>
                      {o.cycleCount > 0 && <span>· {o.cycleCount}x</span>}
                    </div>
                  </td>
                  <td className="py-1.5 px-1 text-right font-mono tabular-nums whitespace-nowrap">
                    <div className="font-semibold text-slate-800 dark:text-slate-100">{o.watts}W</div>
                    <div className="text-[9px] text-slate-400">{o.amps.toFixed(1)}A</div>
                  </td>
                  <td className="py-1.5 px-1.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-0.5">
                      <button
                        type="button"
                        data-testid={`rpdu-lock-btn-${o.outletNumber}`}
                        title={o.locked ? 'Unlock outlet' : 'Lock outlet against switching'}
                        onClick={() => executeAction(o, 'toggle_lock')}
                        className={`p-1 rounded border transition-colors ${
                          o.locked
                            ? 'border-amber-300 dark:border-amber-600/50 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100'
                        }`}
                      >
                        {o.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                      </button>
                      <button
                        type="button"
                        data-testid={`rpdu-cycle-btn-${o.outletNumber}`}
                        disabled={o.locked || isOff}
                        title={o.locked ? 'Locked' : 'Remote power cycle'}
                        onClick={() => setPendingAction({ outlet: o, action: 'power_cycle' })}
                        className="p-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed"
                      >
                        <RotateCw className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        data-testid={`rpdu-power-btn-${o.outletNumber}`}
                        disabled={o.locked}
                        title={o.locked ? 'Locked' : isOff ? 'Power ON outlet' : 'Power OFF outlet'}
                        onClick={() => setPendingAction({ outlet: o, action: 'toggle_power' })}
                        className={`p-1 rounded border transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
                          isOff
                            ? 'border-emerald-300 dark:border-emerald-600/50 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                            : 'border-rose-300 dark:border-rose-600/50 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                        }`}
                      >
                        <Power className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visibleOutlets.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-[11px] text-slate-400">
                  No outlets match the selected filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

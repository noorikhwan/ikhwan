import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Flame,
  RotateCcw,
  ShieldAlert,
  Sliders,
  Zap,
} from 'lucide-react';
import { BmsState } from '../engine/bmsTypes';
import {
  BmsResilienceScenario,
  DEFAULT_BMS_WHATIF_SCENARIO,
  simulateBmsResilienceWhatIf,
} from '../engine/bmsWhatIfEngine';
import { computeBmsRackPowerStats } from '../engine/rackPowerEngine';
import { HallId, HallPowerPolicyMap, RackDefinition, ServerNode } from '../engine/types';

interface BmsResilienceSimulatorPanelProps {
  bms: BmsState;
  racks: RackDefinition[];
  servers: ServerNode[];
  rackPowerAdjustmentsKw?: Record<string, number>;
  hallPowerPolicies?: HallPowerPolicyMap;
  onLogSimulation?: (summary: string) => void;
}

const HALL_OPTIONS: Array<{ id: HallId | 'none'; label: string }> = [
  { id: 'none', label: 'None (All Halls N+1)' },
  { id: 'hall-a', label: 'Hall A CRAC Outage' },
  { id: 'hall-b', label: 'Hall B Liquid CDU Outage' },
  { id: 'hall-c', label: 'Hall C CRAC Outage' },
  { id: 'hall-d', label: 'Hall D CRAC Outage' },
];

export function BmsResilienceSimulatorPanel({
  bms,
  racks,
  servers,
  rackPowerAdjustmentsKw,
  hallPowerPolicies,
  onLogSimulation,
}: BmsResilienceSimulatorPanelProps) {
  const [scenario, setScenario] = useState<BmsResilienceScenario>(DEFAULT_BMS_WHATIF_SCENARIO);
  const [loggedFeedback, setLoggedFeedback] = useState<string | null>(null);

  const powerStats = useMemo(
    () =>
      computeBmsRackPowerStats(racks, bms, servers, {
        rackPowerAdjustmentsKw,
        hallPowerPolicies,
      }),
    [racks, bms, servers, rackPowerAdjustmentsKw, hallPowerPolicies]
  );

  const result = useMemo(
    () => simulateBmsResilienceWhatIf(bms, racks, powerStats, scenario),
    [bms, racks, powerStats, scenario]
  );

  const isDirty =
    scenario.busAFailed ||
    scenario.busBFailed ||
    scenario.failedChillersCount > 0 ||
    scenario.failedCracHall !== 'none' ||
    scenario.loadSurgePct > 0;

  const verdictStyle =
    result.verdict === 'Critical — SLA Breach Risk'
      ? 'border-red-300 dark:border-red-800/80 bg-red-50/70 dark:bg-red-950/30 text-red-800 dark:text-red-300'
      : result.verdict === 'Failover Active — Margin Tight'
      ? 'border-amber-300 dark:border-amber-800/80 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
      : 'border-emerald-300 dark:border-emerald-800/80 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300';

  const handleLog = () => {
    if (!onLogSimulation) return;
    const summary = `What-If Resilience Drill (${result.verdict}): BusA=${
      scenario.busAFailed ? 'FAIL' : 'OK'
    }, BusB=${scenario.busBFailed ? 'FAIL' : 'OK'}, ChillersLost=${
      scenario.failedChillersCount
    }, Surge=+${scenario.loadSurgePct}% → Surviving Bus ${result.survivingBusUtilPct}%, Peak Intake ${result.projectedPeakIntakeC.toFixed(
      1
    )}°C`;
    onLogSimulation(summary);
    setLoggedFeedback('Simulation snapshot logged to immutable audit trail.');
    window.setTimeout(() => setLoggedFeedback(null), 4000);
  };

  return (
    <section
      data-testid="bms-resilience-whatif-panel"
      aria-label="Tier IV 2N Failover and N+1 Cooling What-If Simulator"
      className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-4 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              2N Electrical Failover &amp; N+1 Cooling What-If Simulator
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Non-destructive stress test against live BMS load &amp; chiller plant — projects surviving bus utilization, battery autonomy, ASHRAE intake ΔT, and over-capacity racks without mutating live hardware.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onLogSimulation && (
            <button
              type="button"
              data-testid="whatif-log-audit-btn"
              onClick={handleLog}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
            >
              <ClipboardCheck className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
              Log Drill to Audit
            </button>
          )}
          <button
            type="button"
            data-testid="whatif-reset-btn"
            disabled={!isDirty}
            onClick={() => setScenario(DEFAULT_BMS_WHATIF_SCENARIO)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Reset
          </button>
        </div>
      </div>

      {/* Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {/* 2N Bus Fault Toggles */}
        <div className="p-3 rounded-sm border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            2N UPS Bus Outage
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="whatif-bus-a-toggle"
              aria-pressed={scenario.busAFailed}
              onClick={() => setScenario((prev) => ({ ...prev, busAFailed: !prev.busAFailed }))}
              className={`flex-1 px-2.5 py-1.5 text-xs font-medium rounded-sm border transition-colors cursor-pointer whitespace-nowrap ${
                scenario.busAFailed
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Zap className="w-3 h-3 inline mr-1" aria-hidden="true" />
              Bus A {scenario.busAFailed ? 'OFF' : 'ON'}
            </button>
            <button
              type="button"
              data-testid="whatif-bus-b-toggle"
              aria-pressed={scenario.busBFailed}
              onClick={() => setScenario((prev) => ({ ...prev, busBFailed: !prev.busBFailed }))}
              className={`flex-1 px-2.5 py-1.5 text-xs font-medium rounded-sm border transition-colors cursor-pointer whitespace-nowrap ${
                scenario.busBFailed
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Zap className="w-3 h-3 inline mr-1" aria-hidden="true" />
              Bus B {scenario.busBFailed ? 'OFF' : 'ON'}
            </button>
          </div>
        </div>

        {/* Chiller N+1 Outage Stepper */}
        <div className="p-3 rounded-sm border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Chiller Plant Outage</span>
            <span className="font-mono text-slate-900 dark:text-slate-100">
              -{scenario.failedChillersCount} unit{scenario.failedChillersCount === 1 ? '' : 's'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {[0, 1, 2, 3, 4].map((count) => (
              <button
                key={count}
                type="button"
                data-testid={`whatif-chiller-${count}`}
                onClick={() => setScenario((prev) => ({ ...prev, failedChillersCount: count }))}
                className={`flex-1 py-1.5 text-xs font-mono font-semibold rounded-sm border transition-colors cursor-pointer ${
                  scenario.failedChillersCount === count
                    ? 'bg-[#009530] text-white border-[#009530]'
                    : 'bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {count === 0 ? 'N+1' : `-${count}`}
              </button>
            ))}
          </div>
        </div>

        {/* Hall CRAC/CDU Unit Outage */}
        <div className="p-3 rounded-sm border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2">
          <label
            htmlFor="whatif-crac-hall"
            className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
          >
            Hall Cooling Loss
          </label>
          <select
            id="whatif-crac-hall"
            data-testid="whatif-crac-select"
            value={scenario.failedCracHall}
            onChange={(e) =>
              setScenario((prev) => ({
                ...prev,
                failedCracHall: e.target.value as HallId | 'none',
              }))
            }
            className="w-full px-2.5 py-1.5 text-xs rounded-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#009530]/30"
          >
            {HALL_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Workload Surge Slider */}
        <div className="p-3 rounded-sm border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <label htmlFor="whatif-surge-slider">IT Load Surge</label>
            <span className="font-mono text-slate-900 dark:text-slate-100 tabular-nums">
              +{scenario.loadSurgePct}% ({result.projectedItLoadMw.toFixed(2)} MW)
            </span>
          </div>
          <input
            id="whatif-surge-slider"
            data-testid="whatif-surge-slider"
            type="range"
            min={0}
            max={35}
            step={5}
            value={scenario.loadSurgePct}
            onChange={(e) =>
              setScenario((prev) => ({ ...prev, loadSurgePct: Number(e.target.value) }))
            }
            className="w-full accent-[#009530] cursor-pointer h-1.5"
          />
          <div className="flex justify-between text-[10px] font-mono text-slate-400">
            <span>0%</span>
            <span>+15%</span>
            <span>+35%</span>
          </div>
        </div>
      </div>

      {/* Verdict & Projected KPIs */}
      <div className={`rounded-sm border p-3.5 space-y-3 ${verdictStyle}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold">
            {result.verdict === 'Critical — SLA Breach Risk' ? (
              <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
            ) : result.verdict === 'Failover Active — Margin Tight' ? (
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            )}
            <span data-testid="whatif-verdict">{result.verdict}</span>
          </div>
          {loggedFeedback && (
            <span className="text-[11px] font-medium text-[#007A27] dark:text-[#3DCD58]">
              {loggedFeedback}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="bg-white/85 dark:bg-[#1B2026]/85 rounded-xs border border-slate-200/80 dark:border-slate-700/80 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Surviving UPS Bus
            </div>
            <div
              data-testid="whatif-bus-util"
              className="mt-0.5 text-base font-mono font-bold tabular-nums text-slate-900 dark:text-slate-50"
            >
              {result.survivingBusUtilPct}%
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              {result.projectedBatteryAutonomyMin}m batt · {result.survivingUpsCapacityMw.toFixed(1)} MW cap
            </div>
          </div>

          <div className="bg-white/85 dark:bg-[#1B2026]/85 rounded-xs border border-slate-200/80 dark:border-slate-700/80 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Chiller Margin
            </div>
            <div className="mt-0.5 text-base font-mono font-bold tabular-nums text-slate-900 dark:text-slate-50">
              {result.chillerHeadroomMw >= 0 ? '+' : ''}
              {result.chillerHeadroomMw.toFixed(1)} MW
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              {result.availableChillerCapacityMw.toFixed(1)} / {result.requiredCoolingMw.toFixed(1)} MW req
            </div>
          </div>

          <div className="bg-white/85 dark:bg-[#1B2026]/85 rounded-xs border border-slate-200/80 dark:border-slate-700/80 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Projected Peak Intake
            </div>
            <div className="mt-0.5 text-base font-mono font-bold tabular-nums text-slate-900 dark:text-slate-50 flex items-center gap-1">
              {result.ashraeSlaAtRisk && <Flame className="w-3.5 h-3.5 text-red-500" aria-hidden="true" />}
              {result.projectedPeakIntakeC.toFixed(1)}°C
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              +{result.projectedIntakeDeltaC.toFixed(1)}°C ΔT (SLA 27.0°C)
            </div>
          </div>

          <div className="bg-white/85 dark:bg-[#1B2026]/85 rounded-xs border border-slate-200/80 dark:border-slate-700/80 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Over-Cap Racks
            </div>
            <div className="mt-0.5 text-base font-mono font-bold tabular-nums text-slate-900 dark:text-slate-50">
              {result.projectedOverCapRacks}
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              +{result.newlyOverloadedRacks} new ({result.baselineOverCapRacks} base)
            </div>
          </div>
        </div>

        <ul className="space-y-1 text-xs pt-1">
          {result.advisories.map((adv, idx) => (
            <li key={idx} className="leading-relaxed">
              • {adv}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

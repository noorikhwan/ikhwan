import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Cpu,
  Layers,
  Scale,
  Thermometer,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  CoolingProfileType,
  evaluateWhatIfCapacityPlan,
  WhatIfDeploymentRequest,
} from '../engine/capacityPlannerEngine';
import { SITE_META_MAP, SiteId, SiteWorkspaceState } from '../engine/sites';
import { HallId, RackDefinition } from '../engine/types';

interface CapacityPlannerViewProps {
  activeSiteId: SiteId;
  site: SiteWorkspaceState;
  racks: RackDefinition[];
  onLogAudit: (category: 'Capacity', action: string, target: string) => void;
}

const PRESETS: Array<{ label: string; req: WhatIfDeploymentRequest }> = [
  {
    label: 'AI GPU Pod (8× 24kW Liquid CDU)',
    req: {
      workloadName: 'NVIDIA HGX H200 Inference Pod',
      rackCount: 8,
      uPerRack: 16,
      powerKwPerRack: 24,
      weightKgPerRack: 1180,
      coolingType: 'liquid_cdu_high_density',
      require2NFeeds: true,
      preferredHall: 'any',
    },
  },
  {
    label: 'Enterprise Compute (12× 9kW Air)',
    req: {
      workloadName: 'Core Banking Virtualization Cluster',
      rackCount: 12,
      uPerRack: 14,
      powerKwPerRack: 9,
      weightKgPerRack: 680,
      coolingType: 'air_only',
      require2NFeeds: true,
      preferredHall: 'any',
    },
  },
  {
    label: 'Heavy Storage Stress Test (Overweight)',
    req: {
      workloadName: 'High-Density JBOD Storage Array',
      rackCount: 6,
      uPerRack: 24,
      powerKwPerRack: 14,
      weightKgPerRack: 1850,
      coolingType: 'hybrid_air_liquid',
      require2NFeeds: true,
      preferredHall: 'any',
    },
  },
];

export function CapacityPlannerView({
  activeSiteId,
  site,
  racks,
  onLogAudit,
}: CapacityPlannerViewProps) {
  const [request, setRequest] = useState<WhatIfDeploymentRequest>(PRESETS[0].req);
  const [reservedBanner, setReservedBanner] = useState<string | null>(null);

  const report = useMemo(
    () => evaluateWhatIfCapacityPlan({ siteId: activeSiteId, site, racks, request }),
    [activeSiteId, site, racks, request]
  );

  const siteCode = SITE_META_MAP[activeSiteId].code;

  const handleReserveCapacity = (hallLabel: string, rackIds: string[]) => {
    const msg = `Reserved ${request.rackCount} racks (${report.totalRequiredPowerKw} kW) in ${siteCode} ${hallLabel} — Candidate racks: ${rackIds.join(', ')}`;
    setReservedBanner(msg);
    onLogAudit('Capacity', msg, `${siteCode} ${hallLabel}`);
  };

  return (
    <div className="space-y-5 pb-16" data-testid="capacity-planner-view">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            &ldquo;What-If&rdquo; Space, Power &amp; Cooling Capacity Planner
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Automated 4-constraint placement engine verifying U-space, 2N power per feed, Air + Liquid CDU cooling, and raised floor weight load
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setRequest(p.req);
                setReservedBanner(null);
              }}
              className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-200 hover:border-[#009530] hover:text-[#009530] dark:hover:text-[#3DCD58] cursor-pointer whitespace-nowrap"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {reservedBanner && (
        <div
          role="status"
          data-testid="capacity-reserve-banner"
          className="px-4 py-2.5 rounded-md border border-[#009530]/30 bg-[#009530]/[0.08] text-xs font-medium text-[#006B22] dark:text-[#6EE787]"
        >
          {reservedBanner}
        </div>
      )}

      {/* Main Split: What-If Controls + Ranked Hall Evaluations */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left: Workload Configuration Form */}
        <section className="xl:col-span-4 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-4 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Layers className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
            Workload Deployment Parameters
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label htmlFor="cap-workload-name" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Deployment / Project Name
              </label>
              <input
                id="cap-workload-name"
                type="text"
                value={request.workloadName}
                onChange={(e) => setRequest((r) => ({ ...r, workloadName: e.target.value }))}
                className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="cap-rack-count" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Cabinets Required
                </label>
                <input
                  id="cap-rack-count"
                  data-testid="cap-rack-count-input"
                  type="number"
                  min={1}
                  max={60}
                  value={request.rackCount}
                  onChange={(e) => setRequest((r) => ({ ...r, rackCount: Number(e.target.value) || 1 }))}
                  className="w-full px-3 py-2 font-mono rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label htmlFor="cap-u-per-rack" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  U-Space / Rack
                </label>
                <input
                  id="cap-u-per-rack"
                  type="number"
                  min={1}
                  max={42}
                  value={request.uPerRack}
                  onChange={(e) => setRequest((r) => ({ ...r, uPerRack: Number(e.target.value) || 1 }))}
                  className="w-full px-3 py-2 font-mono rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="cap-power-kw" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Power Draw (kW / Rack)
                </label>
                <input
                  id="cap-power-kw"
                  data-testid="cap-power-kw-input"
                  type="number"
                  min={1}
                  max={80}
                  step={0.5}
                  value={request.powerKwPerRack}
                  onChange={(e) => setRequest((r) => ({ ...r, powerKwPerRack: Number(e.target.value) || 1 }))}
                  className="w-full px-3 py-2 font-mono rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label htmlFor="cap-weight-kg" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Floor Weight (kg / Rack)
                </label>
                <input
                  id="cap-weight-kg"
                  data-testid="cap-weight-kg-input"
                  type="number"
                  min={100}
                  max={2500}
                  step={50}
                  value={request.weightKgPerRack}
                  onChange={(e) => setRequest((r) => ({ ...r, weightKgPerRack: Number(e.target.value) || 100 }))}
                  className="w-full px-3 py-2 font-mono rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label htmlFor="cap-cooling-type" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Cooling Architecture
              </label>
              <select
                id="cap-cooling-type"
                value={request.coolingType}
                onChange={(e) => setRequest((r) => ({ ...r, coolingType: e.target.value as CoolingProfileType }))}
                className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100"
              >
                <option value="air_only">Air-Cooled CRAC Only</option>
                <option value="hybrid_air_liquid">Hybrid Air + Rear-Door Liquid (55/45)</option>
                <option value="liquid_cdu_high_density">High-Density Direct-to-Chip Liquid CDU (75/25)</option>
              </select>
            </div>

            <div>
              <label htmlFor="cap-preferred-hall" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Target Data Hall Scope
              </label>
              <select
                id="cap-preferred-hall"
                value={request.preferredHall}
                onChange={(e) => setRequest((r) => ({ ...r, preferredHall: e.target.value as HallId | 'any' }))}
                className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100"
              >
                <option value="any">Evaluate All 4 Halls Automatically</option>
                <option value="hall-a">Hall A · Core Compute</option>
                <option value="hall-b">Hall B · AI &amp; GPU</option>
                <option value="hall-c">Hall C · Storage &amp; Edge</option>
                <option value="hall-d">Hall D · Cloud &amp; Interconnect</option>
              </select>
            </div>

            <label className="inline-flex items-center gap-2 pt-1 cursor-pointer text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={request.require2NFeeds}
                onChange={(e) => setRequest((r) => ({ ...r, require2NFeeds: e.target.checked }))}
                className="rounded-xs border-slate-300 text-[#009530] focus:ring-[#009530]"
              />
              <span>Enforce Tier IV 2N Dual-Feed Power Margin (≤ 85% cap)</span>
            </label>
          </div>

          {/* Aggregate Requirements Box */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2.5 text-xs font-mono tabular-nums">
            <div className="p-2.5 rounded bg-slate-50 dark:bg-[#14181D] border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] font-sans text-slate-500">Total Space</div>
              <div className="font-semibold text-slate-900 dark:text-slate-100">{report.totalRequiredU} U</div>
            </div>
            <div className="p-2.5 rounded bg-slate-50 dark:bg-[#14181D] border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] font-sans text-slate-500">Total IT Power</div>
              <div className="font-semibold text-slate-900 dark:text-slate-100">{report.totalRequiredPowerKw} kW</div>
            </div>
            <div className="p-2.5 rounded bg-slate-50 dark:bg-[#14181D] border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] font-sans text-slate-500">Thermal Rejection</div>
              <div className="font-semibold text-slate-900 dark:text-slate-100">{report.totalRequiredCoolingKw} kWth</div>
            </div>
            <div className="p-2.5 rounded bg-slate-50 dark:bg-[#14181D] border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] font-sans text-slate-500">Gross Weight</div>
              <div className="font-semibold text-slate-900 dark:text-slate-100">{(report.totalRequiredWeightKg / 1000).toFixed(2)} t</div>
            </div>
          </div>
        </section>

        {/* Right: 4-Constraint Evaluation Matrix */}
        <section className="xl:col-span-8 space-y-4">
          <div className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Placement Engine Verdict ({siteCode})
              </div>
              <div
                data-testid="capacity-verdict-text"
                className="mt-0.5 text-base font-semibold text-slate-900 dark:text-slate-50"
              >
                {report.bestHall
                  ? `Recommended: ${report.bestHall.hallLabel} (Suitability ${report.bestHall.score}/100)`
                  : 'No Hall Passes All 4 Constraints — Reduce Density or Switch Cooling'}
              </div>
            </div>
            <span className="font-mono text-xs text-[#007A27] dark:text-[#3DCD58] font-semibold">
              {report.feasibleHallCount} / {report.evaluations.length} Halls Feasible
            </span>
          </div>

          <div className="space-y-3">
            {report.evaluations.map((ev) => (
              <div
                key={ev.hallId}
                data-testid={`capacity-hall-card-${ev.hallId}`}
                className={`bg-white dark:bg-[#1B2026] border rounded-md p-4 space-y-3 ${
                  ev.feasible
                    ? 'border-[#009530]/40 dark:border-[#3DCD58]/30'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {ev.feasible ? (
                      <CheckCircle2 className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" aria-hidden="true" />
                    )}
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {ev.hallLabel}
                    </h3>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      Score {ev.score}/100
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {ev.strandedPowerKw > 0 && (
                      <span className="text-[11px] font-mono text-amber-700 dark:text-amber-400">
                        Stranded Power: {ev.strandedPowerKw} kW
                      </span>
                    )}
                    {ev.feasible && (
                      <button
                        type="button"
                        data-testid={`capacity-reserve-${ev.hallId}`}
                        onClick={() => handleReserveCapacity(ev.hallLabel, ev.recommendedRackIds)}
                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white cursor-pointer"
                      >
                        Reserve Placement
                      </button>
                    )}
                  </div>
                </div>

                {/* 4 Constraints Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {ev.constraints.map((c) => {
                    const Icon =
                      c.key === 'space'
                        ? Cpu
                        : c.key === 'power'
                        ? Zap
                        : c.key === 'cooling'
                        ? Thermometer
                        : Scale;
                    return (
                      <div
                        key={c.key}
                        className={`p-2.5 rounded border text-xs ${
                          c.passed
                            ? 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#14181D]'
                            : 'border-red-300 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-200">
                            <Icon className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                            {c.label}
                          </span>
                          <span
                            className={`font-mono text-[10px] font-semibold ${
                              c.passed ? 'text-[#007A27] dark:text-[#3DCD58]' : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {c.passed ? 'PASS' : 'BLOCK'}
                          </span>
                        </div>
                        <div className="mt-1.5 font-mono text-[11px] text-slate-900 dark:text-slate-100">
                          Req: {c.requiredText}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate" title={c.availableText}>
                          {c.availableText}
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full ${
                              !c.passed
                                ? 'bg-red-500'
                                : c.postUtilizationPct > 80
                                ? 'bg-amber-500'
                                : 'bg-[#009530]'
                            }`}
                            style={{ width: `${Math.min(100, c.postUtilizationPct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {ev.feasible && ev.recommendedRackIds.length > 0 && (
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    Candidate Cabinets: {ev.recommendedRackIds.join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

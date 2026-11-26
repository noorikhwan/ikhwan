import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Droplets,
  Globe,
  OctagonAlert,
  Server,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import {
  computeGlobalFleetOverview,
  simulateCrossSiteFailover,
} from '../engine/globalNocEngine';
import { SITES, SiteId, SiteWorkspaceState } from '../engine/sites';
import { RackDefinition } from '../engine/types';

interface GlobalNocViewProps {
  sitesMap: Record<SiteId, SiteWorkspaceState>;
  racks: RackDefinition[];
  activeSiteId: SiteId;
  onJumpToSite: (siteId: SiteId) => void;
  onJumpToSiteRackMap?: (siteId: SiteId, rackId?: string) => void;
  onLogAudit: (category: 'Capacity', action: string, target: string) => void;
}

export function GlobalNocView({
  sitesMap,
  racks,
  activeSiteId,
  onJumpToSite,
  onJumpToSiteRackMap,
  onLogAudit,
}: GlobalNocViewProps) {
  const overview = useMemo(
    () => computeGlobalFleetOverview(sitesMap, racks),
    [sitesMap, racks]
  );

  const [sourceSiteId, setSourceSiteId] = useState<SiteId>('kl1');
  const [targetSiteId, setTargetSiteId] = useState<SiteId>('kl3');
  const [workloadName, setWorkloadName] = useState<string>('Hall B GPU Inference Cluster');
  const [loadKw, setLoadKw] = useState<number>(850);
  const [rackCount, setRackCount] = useState<number>(28);
  const [requiresLiquidCooling, setRequiresLiquidCooling] = useState<boolean>(true);
  const [auditRecordedMsg, setAuditRecordedMsg] = useState<string | null>(null);

  const simulation = useMemo(
    () =>
      simulateCrossSiteFailover(sitesMap, racks, {
        sourceSiteId,
        targetSiteId,
        workloadName,
        loadKw,
        rackCount,
        requiresLiquidCooling,
      }),
    [sitesMap, racks, sourceSiteId, targetSiteId, workloadName, loadKw, rackCount, requiresLiquidCooling]
  );

  const handleRecordFailoverPlan = () => {
    onLogAudit(
      'Capacity',
      `Simulated cross-site failover of "${workloadName}" (${loadKw} kW, ${rackCount} racks): ${simulation.sourceSiteCode} → ${simulation.targetSiteCode} [${simulation.verdict}]`,
      `${simulation.sourceSiteCode}→${simulation.targetSiteCode}`
    );
    setAuditRecordedMsg(
      `Failover simulation logged to immutable compliance ledger (${simulation.sourceSiteCode} → ${simulation.targetSiteCode}).`
    );
    window.setTimeout(() => setAuditRecordedMsg(null), 5000);
  };

  return (
    <div className="space-y-6" data-testid="global-noc-view">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Global NOC Command Wall — KL1 · KL2 · KL3 Fleet
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Side-by-side multi-campus Tier IV telemetry rollup, aggregate SLA posture, and cross-site workload failover simulator
          </p>
        </div>
        <div className="inline-flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
          <Globe className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
          <span>3 Tier IV Campuses · {overview.totalRacks.toLocaleString()} Racks</span>
        </div>
      </div>

      {/* 5-Column Global Fleet Rollup KPI Strip */}
      <section
        aria-label="Global fleet KPIs"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800"
      >
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Fleet Facility Load</div>
          <div
            data-testid="global-fleet-mw"
            className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50"
          >
            {overview.totalFacilityLoadMw.toFixed(2)} MW
          </div>
          <div className="mt-0.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            IT {overview.totalItLoadMw.toFixed(2)} / {overview.totalCapacityMw.toFixed(1)} MW ({overview.fleetUtilizationPct}%)
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Blended Fleet PUE</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#007A27] dark:text-[#3DCD58]">
            {overview.blendedPue.toFixed(2)}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Power-weighted across KL1–KL3
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Blended Fleet WUE</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-sky-700 dark:text-sky-400">
            {overview.blendedWue.toFixed(2)} L/kWh
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Hybrid water + air chiller balance
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Aggregate Open Alarms</div>
          <div className="mt-1 flex items-baseline gap-3 font-mono text-2xl font-semibold tabular-nums">
            <span className={overview.totalOpenCritical > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-50'}>
              {overview.totalOpenCritical}
              <span className="ml-1 text-xs font-normal text-slate-500">Crit</span>
            </span>
            <span className={overview.totalOpenWarning > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-50'}>
              {overview.totalOpenWarning}
              <span className="ml-1 text-xs font-normal text-slate-500">Warn</span>
            </span>
          </div>
          <div
            data-testid="global-fleet-overcap-summary"
            className={`mt-0.5 text-xs font-mono tabular-nums ${
              overview.totalCapacityExceededRacks > 0
                ? 'text-red-600 dark:text-red-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {overview.totalCapacityExceededRacks} Over-Cap Racks · {overview.totalThermalExcursions} Thermal &gt;27°C
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Fleet ASHRAE A1 SLA</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#007A27] dark:text-[#3DCD58]">
            {overview.fleetSlaCompliancePct.toFixed(2)}%
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            480 dual-probe cold-aisle sensors
          </div>
        </div>
      </section>

      {/* Side-by-Side Site Comparison Cards (KL1, KL2, KL3) */}
      <section aria-label="Campus side-by-side status" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {overview.sites.map((site) => {
          const isCurrent = site.siteId === activeSiteId;
          return (
            <article
              key={site.siteId}
              data-testid={`global-site-card-${site.siteId}`}
              className={`bg-white dark:bg-[#1B2026] border rounded-md p-5 flex flex-col justify-between gap-4 transition-colors ${
                isCurrent
                  ? 'border-[#009530] dark:border-[#3DCD58]'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="space-y-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-bold text-slate-900 dark:text-slate-50">
                        {site.code}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {site.location}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                      {site.label}
                    </div>
                  </div>
                  <span
                    className={`text-xs font-semibold whitespace-nowrap ${
                      site.tierState === 'fault-tolerant'
                        ? 'text-[#007A27] dark:text-[#3DCD58]'
                        : site.tierState === 'failover-active'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-red-700 dark:text-red-400'
                    }`}
                  >
                    {site.tierState === 'fault-tolerant'
                      ? '2(N+1) Nominal'
                      : site.tierState === 'failover-active'
                      ? 'Failover Active'
                      : 'Degraded'}
                  </span>
                </div>

                {/* Power Utilization Progress */}
                <div>
                  <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                    <span>IT Load: {site.itLoadMw.toFixed(2)} / {site.capacityMw.toFixed(1)} MW</span>
                    <span className="font-semibold">{site.utilizationPct}%</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-xs overflow-hidden">
                    <div
                      className={`h-full ${
                        site.utilizationPct >= 80
                          ? 'bg-red-600'
                          : site.utilizationPct >= 65
                          ? 'bg-amber-500'
                          : 'bg-[#009530] dark:bg-[#3DCD58]'
                      }`}
                      style={{ width: `${Math.min(100, site.utilizationPct)}%` }}
                    />
                  </div>
                </div>

                {/* Structured Metrics Grid */}
                <dl className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">PUE / WUE</dt>
                    <dd className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {site.pue.toFixed(2)} · {site.wue.toFixed(2)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">ASHRAE SLA</dt>
                    <dd className="mt-0.5 font-mono font-semibold text-[#007A27] dark:text-[#3DCD58] tabular-nums">
                      {site.slaCompliancePct.toFixed(2)}%
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Cooling Headroom</dt>
                    <dd className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {site.coolingHeadroomMw.toFixed(2)} MW
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Peak Exhaust</dt>
                    <dd
                      className={`mt-0.5 font-mono font-semibold tabular-nums ${
                        site.hottestTempC >= 78
                          ? 'text-red-600 dark:text-red-400'
                          : site.hottestTempC >= 68
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {site.hottestTempC.toFixed(1)}°C
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Over-Cap Racks</dt>
                    <dd
                      data-testid={`global-site-overcap-${site.siteId}`}
                      className={`mt-0.5 font-mono font-semibold tabular-nums ${
                        site.capacityExceededCount > 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-[#007A27] dark:text-[#3DCD58]'
                      }`}
                    >
                      {site.capacityExceededCount > 0
                        ? `${site.capacityExceededCount} Exceeded`
                        : '0 Nominal'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Peak Rack Util</dt>
                    <dd
                      data-testid={`global-site-peak-util-${site.siteId}`}
                      className={`mt-0.5 font-mono font-semibold tabular-nums ${
                        site.peakRackUtilPct > 100
                          ? 'text-red-600 dark:text-red-400'
                          : site.peakRackUtilPct >= 85
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {site.peakRackUtilPct}% ({site.peakRackId})
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 text-xs font-mono tabular-nums">
                  <span
                    className={`inline-flex items-center gap-1 font-semibold ${
                      site.openCritical > 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    <OctagonAlert className="w-3.5 h-3.5" aria-hidden="true" />
                    {site.openCritical}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 font-semibold ${
                      site.openWarning > 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                    {site.openWarning}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {site.capacityExceededCount > 0 && onJumpToSiteRackMap && (
                    <button
                      type="button"
                      data-testid={`global-jump-overcap-${site.siteId}`}
                      onClick={() =>
                        onJumpToSiteRackMap(site.siteId, site.capacityExceededRackIds[0])
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-red-300 dark:border-red-800/80 bg-red-50 dark:bg-red-950/35 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Zap className="w-3 h-3" aria-hidden="true" />
                      Over-Cap ({site.capacityExceededCount})
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid={`global-jump-${site.siteId}`}
                    onClick={() => onJumpToSite(site.siteId)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14181D] text-slate-800 dark:text-slate-100 hover:border-[#009530] hover:text-[#007A27] dark:hover:text-[#3DCD58] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {isCurrent ? 'Open Overview' : `Jump to ${site.code}`}
                    <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {/* Cross-Site Workload Failover Simulator */}
      <section
        aria-label="Cross-Site Workload Failover Simulator"
        data-testid="cross-site-failover-simulator"
        className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
              Cross-Site Workload Failover Simulator
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Model migrating an AI/GPU pod or colocation tenant block between campuses and validate 2N power, chiller, and liquid CDU headroom before cutover
            </p>
          </div>
          <button
            type="button"
            data-testid="record-failover-plan-btn"
            onClick={handleRecordFailoverPlan}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-[#009530] hover:bg-[#007A27] text-white cursor-pointer whitespace-nowrap self-start sm:self-auto"
          >
            Log Simulation to Audit Trail
          </button>
        </div>

        {auditRecordedMsg && (
          <div
            role="status"
            className="mx-5 mt-4 px-3.5 py-2 rounded-md border border-[#009530]/30 bg-[#009530]/10 text-xs font-medium text-[#007A27] dark:text-[#3DCD58]"
          >
            {auditRecordedMsg}
          </div>
        )}

        <div className="p-5 grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left Controls */}
          <div className="xl:col-span-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="failover-source"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Source Campus
                </label>
                <select
                  id="failover-source"
                  data-testid="failover-source-select"
                  value={sourceSiteId}
                  onChange={(e) => setSourceSiteId(e.target.value as SiteId)}
                  className="w-full px-3 py-2 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100"
                >
                  {SITES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.location}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="failover-target"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Target Campus
                </label>
                <select
                  id="failover-target"
                  data-testid="failover-target-select"
                  value={targetSiteId}
                  onChange={(e) => setTargetSiteId(e.target.value as SiteId)}
                  className="w-full px-3 py-2 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100"
                >
                  {SITES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.location}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="failover-workload"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Workload / Tenant Block Name
              </label>
              <input
                id="failover-workload"
                type="text"
                value={workloadName}
                onChange={(e) => setWorkloadName(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="failover-load-kw" className="font-medium text-slate-700 dark:text-slate-300">
                    Migrated IT Load
                  </label>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                    {loadKw.toLocaleString()} kW ({(loadKw / 1000).toFixed(2)} MW)
                  </span>
                </div>
                <input
                  id="failover-load-kw"
                  data-testid="failover-load-slider"
                  type="range"
                  min={100}
                  max={8000}
                  step={50}
                  value={loadKw}
                  onChange={(e) => setLoadKw(Number(e.target.value))}
                  className="mt-1.5 w-full accent-[#009530] cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="failover-rack-count" className="font-medium text-slate-700 dark:text-slate-300">
                    Required Failover Cabinets
                  </label>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                    {rackCount} racks (max reserve: {simulation.racksAvailable})
                  </span>
                </div>
                <input
                  id="failover-rack-count"
                  type="range"
                  min={4}
                  max={300}
                  step={4}
                  value={rackCount}
                  onChange={(e) => setRackCount(Number(e.target.value))}
                  className="mt-1.5 w-full accent-[#009530] cursor-pointer"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={requiresLiquidCooling}
                  onChange={(e) => setRequiresLiquidCooling(e.target.checked)}
                  className="rounded border-slate-300 accent-[#009530]"
                />
                <span>Requires Hall B Direct-to-Chip Liquid Cooling (CDU Loop)</span>
              </label>
            </div>
          </div>

          {/* Right Live Headroom Preview & Verdict */}
          <div className="xl:col-span-7 space-y-4">
            <div
              data-testid="failover-verdict-banner"
              className={`p-4 rounded-md border flex items-start justify-between gap-3 ${
                !simulation.feasible
                  ? 'border-red-300 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/35'
                  : simulation.verdict === 'Feasible with Cooling Boost'
                  ? 'border-amber-300 dark:border-amber-900/70 bg-amber-50/80 dark:bg-amber-950/35'
                  : 'border-[#009530]/40 bg-[#009530]/[0.07] dark:bg-[#3DCD58]/10'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-mono font-semibold text-slate-700 dark:text-slate-300">
                  <span>{simulation.sourceSiteCode}</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{simulation.targetSiteCode}</span>
                  <span>·</span>
                  <span>{workloadName || 'Failover Workload'}</span>
                </div>
                <div
                  className={`text-sm font-bold flex items-center gap-1.5 ${
                    !simulation.feasible
                      ? 'text-red-700 dark:text-red-400'
                      : simulation.verdict === 'Feasible with Cooling Boost'
                      ? 'text-amber-800 dark:text-amber-300'
                      : 'text-[#007A27] dark:text-[#3DCD58]'
                  }`}
                >
                  {!simulation.feasible ? (
                    <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                  )}
                  {simulation.verdict}
                </div>
              </div>
              <div className="text-right font-mono text-xs tabular-nums shrink-0">
                <div className="text-slate-500 dark:text-slate-400">Projected PUE</div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  {simulation.projectedPueBefore.toFixed(2)} → {simulation.projectedPueAfter.toFixed(2)}{' '}
                  <span
                    className={
                      simulation.pueDelta > 0
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-[#007A27] dark:text-[#3DCD58]'
                    }
                  >
                    ({simulation.pueDelta >= 0 ? '+' : ''}
                    {simulation.pueDelta.toFixed(2)})
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#14181D]">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <Zap className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                  {simulation.targetSiteCode} 2N Power Headroom
                </div>
                <div
                  className={`mt-1 font-mono text-base font-semibold tabular-nums ${
                    simulation.powerHeadroomRemainingKw < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {simulation.powerHeadroomRemainingKw >= 0 ? '+' : ''}
                  {simulation.powerHeadroomRemainingKw.toLocaleString()} kW
                </div>
                <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500">
                  Util: {simulation.targetCurrentUtilPct}% → {simulation.targetProjectedUtilPct}%
                </div>
              </div>

              <div className="p-3.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#14181D]">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <Droplets className="w-3.5 h-3.5 text-sky-500" aria-hidden="true" />
                  Chiller &amp; DLC Margin
                </div>
                <div
                  className={`mt-1 font-mono text-base font-semibold tabular-nums ${
                    simulation.coolingHeadroomRemainingKw < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {simulation.coolingHeadroomRemainingKw >= 0 ? '+' : ''}
                  {simulation.coolingHeadroomRemainingKw.toLocaleString()} kW
                </div>
                <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500">
                  {requiresLiquidCooling
                    ? `DLC CDU: ${simulation.liquidHeadroomRemainingKw >= 0 ? '+' : ''}${simulation.liquidHeadroomRemainingKw} kW`
                    : 'Air-cooled CRAC loop'}
                </div>
              </div>

              <div className="p-3.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#14181D]">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <Server className="w-3.5 h-3.5 text-[#009530]" aria-hidden="true" />
                  Target Projected Load
                </div>
                <div className="mt-1 font-mono text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {simulation.targetProjectedItLoadMw.toFixed(2)} MW
                </div>
                <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500">
                  {simulation.sourceSiteCode} after: {simulation.sourcePostItLoadMw.toFixed(2)} MW
                </div>
              </div>
            </div>

            <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
              {simulation.advisories.map((adv, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <CheckCircle2
                    className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                      simulation.feasible ? 'text-[#009530] dark:text-[#3DCD58]' : 'text-red-500'
                    }`}
                    aria-hidden="true"
                  />
                  <span>{adv}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

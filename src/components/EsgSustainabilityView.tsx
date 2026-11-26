import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Cloud, Droplets, Leaf, Sun } from 'lucide-react';
import { BmsState } from '../engine/bmsTypes';
import { computeSiteEsgMetrics } from '../engine/esgEngine';
import { SiteId } from '../engine/sites';

interface EsgSustainabilityViewProps {
  activeSiteId: SiteId;
  bms: BmsState;
  itLoadKw: number;
  pue: number;
}

export function EsgSustainabilityView({
  activeSiteId,
  bms,
  itLoadKw,
  pue,
}: EsgSustainabilityViewProps) {
  const [ppaOverride, setPpaOverride] = useState<number | null>(null);

  const metrics = useMemo(
    () =>
      computeSiteEsgMetrics({
        siteId: activeSiteId,
        bms,
        itLoadKw,
        pue,
        renewablePpaOverridePct: ppaOverride ?? undefined,
      }),
    [activeSiteId, bms, itLoadKw, pue, ppaOverride]
  );

  return (
    <div className="space-y-5 pb-16" data-testid="esg-sustainability-view">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Sustainability (ESG) — WUE, CUE &amp; Scope 2 Carbon Tracking
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Live Water Usage Effectiveness (WUE), Carbon Usage Effectiveness (CUE), Renewable Energy Factor (REF), and Scope 2 emissions across water chillers &amp; liquid CDUs
          </p>
        </div>

        {/* Interactive Renewable PPA Simulator */}
        <div className="flex items-center gap-3 px-3.5 py-2 rounded-md bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 shrink-0">
          <Sun className="w-4 h-4 text-[#009530] dark:text-[#3DCD58] shrink-0" aria-hidden="true" />
          <label htmlFor="esg-ref-slider" className="text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
            Renewable PPA Mix:
          </label>
          <input
            id="esg-ref-slider"
            data-testid="esg-ref-slider"
            type="range"
            min={0}
            max={100}
            step={5}
            value={metrics.refPct}
            onChange={(e) => setPpaOverride(Number(e.target.value))}
            className="w-28 accent-[#009530] cursor-pointer"
          />
          <span className="font-mono text-xs font-bold text-[#007A27] dark:text-[#3DCD58] w-10 text-right tabular-nums">
            {metrics.refPct}%
          </span>
        </div>
      </div>

      {/* 4-Column ESG KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>WUE (Water Usage Effectiveness)</span>
            <Droplets className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
          </div>
          <div
            data-testid="esg-wue-value"
            className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50"
          >
            {metrics.wueLitersPerKwh.toFixed(2)} <span className="text-sm font-normal text-slate-500">L/kWh</span>
          </div>
          <div className="mt-0.5 text-xs font-mono text-slate-500 dark:text-slate-400">
            {metrics.dailyWaterM3.toLocaleString()} m³/day · Target &lt; 1.20 L/kWh
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>CUE (Carbon Usage Effectiveness)</span>
            <Cloud className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
          </div>
          <div
            data-testid="esg-cue-value"
            className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50"
          >
            {metrics.cueKgCo2PerKwh.toFixed(3)}{' '}
            <span className="text-sm font-normal text-slate-500">kgCO₂/kWh</span>
          </div>
          <div className="mt-0.5 text-xs font-mono text-slate-500 dark:text-slate-400">
            Grid {metrics.gridEmissionFactorKgPerKwh} kg/kWh · PUE {metrics.pue.toFixed(2)}
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Renewable Energy Factor (REF)</span>
            <Leaf className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#007A27] dark:text-[#3DCD58]">
            {metrics.refPct}%
          </div>
          <div className="mt-0.5 text-xs font-mono text-slate-500 dark:text-slate-400">
            {metrics.annualizedAvoidedTonnes.toLocaleString()} tCO₂e/yr avoided via PPA
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Scope 2 Market-Based Emissions</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {metrics.monthlyScope2Tonnes.toLocaleString()}{' '}
            <span className="text-sm font-normal text-slate-500">tCO₂e/mo</span>
          </div>
          <div className="mt-0.5 text-xs font-mono text-slate-500 dark:text-slate-400">
            Annualized {metrics.annualizedScope2Tonnes.toLocaleString()} tCO₂e · {metrics.siteCode}
          </div>
        </div>
      </section>

      {/* Dual Recharts ESG Visualizations */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* WUE & CUE 12-Month Efficiency Trajectory */}
        <section className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              12-Month WUE &amp; CUE Efficiency Trajectory ({metrics.siteCode})
            </h2>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">ISO/IEC 30134-8 / -9</span>
          </div>
          <div className="p-4 h-[270px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.history12m} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.22} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} width={42} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1D2126',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    fontSize: '11px',
                    color: '#f8fafc',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Area
                  type="monotone"
                  dataKey="wueLitersPerKwh"
                  name="WUE (L/kWh)"
                  stroke="#0284c7"
                  fill="#0284c7"
                  fillOpacity={0.14}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="cueKgCo2PerKwh"
                  name="CUE (kgCO₂/kWh)"
                  stroke="#009530"
                  fill="#009530"
                  fillOpacity={0.16}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Monthly Scope 2 Emissions & Water Consumption */}
        <section className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Monthly Scope 2 Emissions (tCO₂e) &amp; Renewable %
            </h2>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">GHG Protocol Scope 2</span>
          </div>
          <div className="p-4 h-[270px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.history12m} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.22} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} width={48} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1D2126',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    fontSize: '11px',
                    color: '#f8fafc',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar
                  dataKey="scope2Tonnes"
                  name="Scope 2 (tCO₂e)"
                  fill="#009530"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Cooling Water & Liquid CDU Plant Allocation Strip */}
      <section className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="p-3 rounded bg-slate-50 dark:bg-[#14181D] border border-slate-200 dark:border-slate-800">
          <div className="font-semibold text-slate-900 dark:text-slate-100">Water Chiller vs Air Chiller Heat Rejection</div>
          <div className="mt-1 font-mono text-[15px] font-semibold text-sky-600 dark:text-sky-400">
            {metrics.waterChillerSharePct}% Water-Cooled · {100 - metrics.waterChillerSharePct}% Air-Cooled
          </div>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            2 Water Chillers + 14 Air Chillers + 2×180kL Square Buffer Tanks dynamically balance evaporative water draw.
          </p>
        </div>
        <div className="p-3 rounded bg-slate-50 dark:bg-[#14181D] border border-slate-200 dark:border-slate-800">
          <div className="font-semibold text-slate-900 dark:text-slate-100">Closed-Loop Liquid Cooling CDU Share</div>
          <div className="mt-1 font-mono text-lg font-semibold text-[#007A27] dark:text-[#3DCD58]">
            {metrics.liquidCduLoopSharePct}% of Site IT Load
          </div>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            Direct-to-chip closed-loop CDUs in Hall B cut makeup water loss by 88% vs open evaporative towers.
          </p>
        </div>
        <div className="p-3 rounded bg-slate-50 dark:bg-[#14181D] border border-slate-200 dark:border-slate-800">
          <div className="font-semibold text-slate-900 dark:text-slate-100">Annualized Water &amp; ESG Compliance</div>
          <div className="mt-1 font-mono text-lg font-semibold text-slate-900 dark:text-slate-100">
            {metrics.annualizedWaterM3.toLocaleString()} m³/yr
          </div>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            Aligned with EU EED, ISO 50001, and Malaysia Green Data Centre reporting standards.
          </p>
        </div>
      </section>
    </div>
  );
}

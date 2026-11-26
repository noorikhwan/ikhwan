import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  BatteryCharging,
  CheckCircle2,
  Droplets,
  Fuel,
  Gauge,
  ShieldAlert,
  Waves,
} from 'lucide-react';
import { BmsState } from '../engine/bmsTypes';
import {
  computeAutonomySimulation,
  computeDlcLeakTelemetry,
} from '../engine/electricalCoolingTwinEngine';
import { HallId, ServerNode } from '../engine/types';

interface BmsAutonomyAndDlcPanelProps {
  bms: BmsState;
  servers: ServerNode[];
  onToggleLeakFault: (hallId: HallId) => void;
}

export function BmsAutonomyAndDlcPanel({
  bms,
  servers,
  onToggleLeakFault,
}: BmsAutonomyAndDlcPanelProps) {
  const liveUpsLoadKw = useMemo(
    () => Math.max(1500, Math.round(bms.upsSystems.reduce((s, u) => s + u.loadKw, 0))),
    [bms.upsSystems]
  );

  const [outageDurationHrs, setOutageDurationHrs] = useState<number>(36);
  const [loadOverrideKw, setLoadOverrideKw] = useState<number | null>(null);
  const [includeChillerLoad, setIncludeChillerLoad] = useState<boolean>(true);
  const [simulatedLeakZones, setSimulatedLeakZones] = useState<string[]>([]);

  const effectiveInputLoadKw = loadOverrideKw ?? liveUpsLoadKw;

  const autonomy = useMemo(
    () =>
      computeAutonomySimulation(bms, {
        outageDurationHrs,
        simulatedLoadKw: effectiveInputLoadKw,
        includeChillerLoad,
      }),
    [bms, outageDurationHrs, effectiveInputLoadKw, includeChillerLoad]
  );

  const dlc = useMemo(
    () => computeDlcLeakTelemetry(bms, servers, simulatedLeakZones),
    [bms, servers, simulatedLeakZones]
  );

  const toggleLeakZone = (zoneId: string) => {
    setSimulatedLeakZones((prev) =>
      prev.includes(zoneId) ? prev.filter((id) => id !== zoneId) : [...prev, zoneId]
    );
    if (zoneId === 'zone-b-cdu1') {
      onToggleLeakFault('hall-b');
    }
  };

  return (
    <div className="space-y-6">
      {/* Interactive UPS Battery & Diesel Generator Autonomy Calculator */}
      <section
        aria-label="UPS Battery and Generator Autonomy Calculator"
        data-testid="bms-autonomy-calculator"
        className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <BatteryCharging className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
              Interactive Utility Outage — UPS Battery &amp; Diesel Generator Autonomy Calculator
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Simulate extended grid outages against live IT &amp; chiller load to model 540V Li-Ion UPS discharge (minutes) and B1 diesel vault autonomy (hours)
            </p>
          </div>
          <div
            data-testid="autonomy-verdict"
            className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${
              autonomy.survivesOutage
                ? 'text-[#007A27] dark:text-[#3DCD58]'
                : 'text-red-700 dark:text-red-400'
            }`}
          >
            {autonomy.survivesOutage ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            ) : (
              <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
            )}
            {autonomy.survivesOutage
              ? `Survives ${outageDurationHrs}h Outage (${autonomy.dieselAutonomyHrs}h fuel)`
              : `Refuel Required Before ${autonomy.dieselAutonomyHrs}h`}
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Controls Strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-md bg-slate-50 dark:bg-[#14181D] border border-slate-200/80 dark:border-slate-800">
            <div>
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="autonomy-outage-hrs" className="font-medium text-slate-700 dark:text-slate-300">
                  Simulated Outage Duration
                </label>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {outageDurationHrs} hrs
                </span>
              </div>
              <input
                id="autonomy-outage-hrs"
                data-testid="autonomy-outage-slider"
                type="range"
                min={4}
                max={72}
                step={2}
                value={outageDurationHrs}
                onChange={(e) => setOutageDurationHrs(Number(e.target.value))}
                className="mt-2 w-full accent-[#009530] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="autonomy-load-kw" className="font-medium text-slate-700 dark:text-slate-300">
                  Simulated IT Load
                </label>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {effectiveInputLoadKw.toLocaleString()} kW
                  {loadOverrideKw !== null && (
                    <button
                      type="button"
                      onClick={() => setLoadOverrideKw(null)}
                      className="ml-1.5 text-[10px] text-[#007A27] dark:text-[#3DCD58] underline cursor-pointer"
                    >
                      Live
                    </button>
                  )}
                </span>
              </div>
              <input
                id="autonomy-load-kw"
                type="range"
                min={1500}
                max={12000}
                step={250}
                value={effectiveInputLoadKw}
                onChange={(e) => setLoadOverrideKw(Number(e.target.value))}
                className="mt-2 w-full accent-[#009530] cursor-pointer"
              />
            </div>

            <div className="flex flex-col justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeChillerLoad}
                  onChange={(e) => setIncludeChillerLoad(e.target.checked)}
                  className="rounded border-slate-300 accent-[#009530]"
                />
                <span>Include Chiller &amp; Pump Load (+26%)</span>
              </label>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                Gen Load: {autonomy.effectiveLoadKw.toLocaleString()} kW · Burn: {autonomy.fuelBurnRateLph} L/hr
              </div>
            </div>
          </div>

          {/* 4-Column Autonomy Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-md border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">UPS Full-Load Runtime</div>
              <div className="mt-1 font-mono text-lg font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {autonomy.upsAutonomyMin} min
              </div>
              <div className="text-[11px] font-mono text-slate-500">
                Gen sync @ {autonomy.genAutoStartSec}s ({autonomy.batterySocAtGenSyncPct}% SoC)
              </div>
            </div>
            <div className="p-3 rounded-md border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">Diesel Vault Runtime</div>
              <div className="mt-1 font-mono text-lg font-semibold text-[#007A27] dark:text-[#3DCD58] tabular-nums">
                {autonomy.dieselAutonomyHrs} hrs
              </div>
              <div className="text-[11px] font-mono text-slate-500">
                {autonomy.totalDieselLiters.toLocaleString()} L on-site
              </div>
            </div>
            <div className="p-3 rounded-md border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">25% Refuel Dispatch</div>
              <div className="mt-1 font-mono text-lg font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                T+{autonomy.refuelCalloutHr} hrs
              </div>
              <div className="text-[11px] font-mono text-slate-500">
                SLA tanker dispatch trigger
              </div>
            </div>
            <div className="p-3 rounded-md border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">Usable Li-Ion Reserve</div>
              <div className="mt-1 font-mono text-lg font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {autonomy.upsBankCapacityKwh.toLocaleString()} kWh
              </div>
              <div className="text-[11px] font-mono text-slate-500">
                2(N+1) 540V DC battery banks
              </div>
            </div>
          </div>

          {/* Dual Recharts Curves: UPS Discharge (min) + Diesel Depletion (hrs) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#14181D]">
              <div className="flex items-center justify-between mb-2 text-xs">
                <span className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <BatteryCharging className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                  UPS Battery Discharge Curve (SoC %)
                </span>
                <span className="font-mono text-[11px] text-slate-500">Auto-Gen Sync: 14s</span>
              </div>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={autonomy.upsCurve} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1B2026',
                        borderColor: '#334155',
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: '#F8FAFC',
                      }}
                    />
                    <ReferenceLine y={20} stroke="#DC2626" strokeDasharray="4 4" />
                    <Area
                      type="monotone"
                      dataKey="socPct"
                      name="Battery SoC (%)"
                      stroke="#0284C7"
                      fill="#0284C7"
                      fillOpacity={0.18}
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#14181D]">
              <div className="flex items-center justify-between mb-2 text-xs">
                <span className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Fuel className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
                  B1 Diesel Vault Depletion Curve (Fuel %)
                </span>
                <span className="font-mono text-[11px] text-amber-600 dark:text-amber-400">
                  Refuel Line: 25%
                </span>
              </div>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={autonomy.dieselCurve} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1B2026',
                        borderColor: '#334155',
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: '#F8FAFC',
                      }}
                    />
                    <ReferenceLine y={25} stroke="#D97706" strokeDasharray="4 4" />
                    <Area
                      type="monotone"
                      dataKey="fuelPct"
                      name="Diesel Vault Level (%)"
                      stroke="#009530"
                      fill="#009530"
                      fillOpacity={0.18}
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Hall B Direct Liquid Cooling (DLC) & Floor Leak-Rope Detection Loop */}
      <section
        aria-label="Hall B Direct Liquid Cooling and Leak Detection Loop"
        data-testid="bms-dlc-leak-panel"
        className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Droplets className="w-4 h-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              Hall B Direct-to-Chip Liquid Cooling (DLC) &amp; Addressable Floor Leak-Rope Loop
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Secondary PG25 cold-plate manifold pressure, supply/return ΔT, dielectric conductivity, and addressable conductive leak-sensing rope zones
            </p>
          </div>
          <span
            className={`text-xs font-mono font-semibold whitespace-nowrap ${
              dlc.activeLeakCount > 0
                ? 'text-red-700 dark:text-red-400'
                : 'text-[#007A27] dark:text-[#3DCD58]'
            }`}
          >
            {dlc.activeLeakCount > 0
              ? `LEAK ALARM · ${dlc.activeLeakCount} ZONE${dlc.activeLeakCount > 1 ? 'S' : ''}`
              : 'ALL 4 LEAK-ROPE ZONES DRY'}
          </span>
        </div>

        <div className="p-5 space-y-5">
          {/* Hydraulic KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-md bg-slate-50 dark:bg-[#14181D] border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <Gauge className="w-3.5 h-3.5 text-sky-500" aria-hidden="true" />
                Manifold Differential ΔP
              </div>
              <div className="mt-1 font-mono text-lg font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {dlc.avgManifoldPressureBar.toFixed(2)} bar
              </div>
              <div className="text-[11px] font-mono text-slate-500">Target 1.60–2.40 bar</div>
            </div>

            <div className="p-3 rounded-md bg-slate-50 dark:bg-[#14181D] border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">Secondary Supply / Return ΔT</div>
              <div className="mt-1 font-mono text-lg font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {dlc.avgDeltaTC.toFixed(1)}°C
              </div>
              <div className="text-[11px] font-mono text-slate-500">Cold-plate heat rejection</div>
            </div>

            <div className="p-3 rounded-md bg-slate-50 dark:bg-[#14181D] border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">Coolant Conductivity</div>
              <div className="mt-1 font-mono text-lg font-semibold text-[#007A27] dark:text-[#3DCD58] tabular-nums">
                {dlc.avgConductivityUsCm.toFixed(1)} µS/cm
              </div>
              <div className="text-[11px] font-mono text-slate-500">PG25 spec &lt; 25.0 µS/cm</div>
            </div>

            <div className="p-3 rounded-md bg-slate-50 dark:bg-[#14181D] border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">Active DLC Rejection</div>
              <div className="mt-1 font-mono text-lg font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {(dlc.totalLiquidCoolingKw / 1000).toFixed(2)} / {(dlc.totalLiquidCapKw / 1000).toFixed(1)} MW
              </div>
              <div className="text-[11px] font-mono text-slate-500">2N Liquid CDU-B1 + B2</div>
            </div>
          </div>

          {/* CDU Detail + Addressable Leak-Rope Zones */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            <div className="xl:col-span-5 space-y-2.5">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Hall B Liquid Cooling Distribution Units
              </div>
              {dlc.cdus.map((cdu) => (
                <div
                  key={cdu.id}
                  className="p-3.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#14181D] space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {cdu.name}
                    </span>
                    <span className="font-mono text-[11px] text-[#007A27] dark:text-[#3DCD58]">
                      {cdu.mode} · {cdu.flowLpm} L/min
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-400">
                    <span>Sup {cdu.supplyTempC}°C</span>
                    <span>Ret {cdu.returnTempC}°C</span>
                    <span>ΔT {cdu.deltaTC}°C</span>
                    <span>ΔP {cdu.manifoldPressureBar} bar</span>
                    <span>{cdu.conductivityUsCm} µS/cm</span>
                    <span>PG{cdu.glycolMixPct}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="xl:col-span-7 space-y-2.5">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Waves className="w-3.5 h-3.5 text-sky-500" aria-hidden="true" />
                Addressable Floor Leak-Rope Sensing Zones
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
                {dlc.leakZones.map((zone) => (
                  <div
                    key={zone.id}
                    data-testid={`dlc-leak-zone-${zone.id}`}
                    className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
                      zone.leakDetected
                        ? 'bg-red-50/80 dark:bg-red-950/35'
                        : 'bg-white dark:bg-[#1B2026]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {zone.leakDetected ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58] shrink-0" aria-hidden="true" />
                        )}
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {zone.label}
                        </span>
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                        {zone.location} · {zone.lengthMeters}m rope · {zone.impedanceKohm} kΩ
                        {zone.leakDetected && zone.leakDistanceM !== null && (
                          <span className="ml-1.5 font-semibold text-red-700 dark:text-red-400">
                            · Moisture detected @ {zone.leakDistanceM}m
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      data-testid={`toggle-dlc-leak-${zone.id}`}
                      onClick={() => toggleLeakZone(zone.id)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        zone.leakDetected
                          ? 'border-red-300 dark:border-red-800 bg-white dark:bg-slate-900 text-red-700 dark:text-red-300'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14181D] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {zone.leakDetected ? 'Clear Rope Alarm' : 'Test Rope Sensor'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

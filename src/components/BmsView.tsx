import { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Droplets,
  Fan,
  Fuel,
  Gauge,
  Minus,
  Plus,
  Power,
  RotateCcw,
  ShieldCheck,
  Thermometer,
  Zap,
} from 'lucide-react';
import { computeTier4RedundancySummary } from '../engine/bmsEngine';
import { BmsState, CracMode, SlaComplianceStatus } from '../engine/bmsTypes';
import { computeColdAisleSlaSensorMetrics } from '../engine/twin3dLayout';
import { HallId, HallPowerPolicyMap, RackDefinition, ServerNode } from '../engine/types';
import { BmsAutonomyAndDlcPanel } from './BmsAutonomyAndDlcPanel';
import { BmsEquipment3DInspector } from './BmsEquipment3DInspector';
import { BmsResilienceSimulatorPanel } from './BmsResilienceSimulatorPanel';
import { formatClockTime, formatRelativeTime, NodeStatusLabel } from './StatusIndicator';

interface BmsViewProps {
  bms: BmsState;
  servers: ServerNode[];
  racks?: RackDefinition[];
  rackPowerAdjustmentsKw?: Record<string, number>;
  hallPowerPolicies?: HallPowerPolicyMap;
  onLogAudit?: (
    category: 'Setpoint' | 'Power / SLD' | 'CMMS' | 'Alert' | 'Security',
    action: string,
    target: string
  ) => void;
  darkMode: boolean;
  focusedEquipmentId: string;
  onSelectFocusedEquipmentId: (equipmentId: string) => void;
  onAdjustSetpoint: (cracId: string, nextSetpointC: number) => void;
  onSetCracMode: (cracId: string, mode: CracMode) => void;
  onToggleClosedLoop: () => void;
  onToggleChillerFault: (chillerId: string) => void;
  onToggleChwPumpSetMode: (pumpSetId: string) => void;
  onTriggerOutage: () => void;
  onRestoreUtility: () => void;
  onToggleUpsFault: (upsId: string) => void;
  onToggleDieselTankPump: (tankId: string) => void;
  onRefillDieselTank: (tankId: string) => void;
  onToggleLeakFault: (hallId: HallId) => void;
  onToggleColdAisleSla: (hallId: HallId) => void;
  onToggleGateway: (gatewayId: string) => void;
}

function SlaStatusText({ status }: { status: SlaComplianceStatus }) {
  if (status === 'Breached') {
    return (
      <span className="text-[11px] font-semibold text-red-700 dark:text-red-400">
        SLA Breached
      </span>
    );
  }
  if (status === 'Warning') {
    return (
      <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
        Near Limit
      </span>
    );
  }
  return (
    <span className="text-[11px] font-medium text-[#009530] dark:text-[#3DCD58]">
      Compliant
    </span>
  );
}

function SlaEnvelopeBar({
  value,
  scaleMin,
  scaleMax,
  slaMin,
  slaMax,
  status,
}: {
  value: number;
  scaleMin: number;
  scaleMax: number;
  slaMin: number;
  slaMax: number;
  status: SlaComplianceStatus;
}) {
  const span = Math.max(1, scaleMax - scaleMin);
  const bandLeftPct = Math.max(0, Math.min(100, ((slaMin - scaleMin) / span) * 100));
  const bandWidthPct = Math.max(4, Math.min(100 - bandLeftPct, ((slaMax - slaMin) / span) * 100));
  const markerPct = Math.max(2, Math.min(98, ((value - scaleMin) / span) * 100));

  return (
    <div className="relative h-2 w-full rounded-xs bg-slate-200 dark:bg-slate-800 overflow-hidden">
      <div
        className="absolute top-0 bottom-0 bg-[#009530]/20 dark:bg-[#3DCD58]/20 border-x border-[#009530]/50 dark:border-[#3DCD58]/50"
        style={{ left: `${bandLeftPct}%`, width: `${bandWidthPct}%` }}
      />
      <div
        className={`absolute top-0 bottom-0 w-1.5 -translate-x-1/2 rounded-xs ${
          status === 'Breached'
            ? 'bg-red-600'
            : status === 'Warning'
            ? 'bg-amber-500'
            : 'bg-[#009530] dark:bg-[#3DCD58]'
        }`}
        style={{ left: `${markerPct}%` }}
      />
    </div>
  );
}

export function BmsView({
  bms,
  servers,
  racks = [],
  rackPowerAdjustmentsKw,
  hallPowerPolicies,
  onLogAudit,
  darkMode,
  focusedEquipmentId,
  onSelectFocusedEquipmentId,
  onAdjustSetpoint,
  onSetCracMode,
  onToggleClosedLoop,
  onToggleChillerFault,
  onToggleChwPumpSetMode,
  onTriggerOutage,
  onRestoreUtility,
  onToggleUpsFault,
  onToggleDieselTankPump,
  onRefillDieselTank,
  onToggleLeakFault,
  onToggleColdAisleSla,
  onToggleGateway,
}: BmsViewProps) {
  const [rowProbesOpen, setRowProbesOpen] = useState(false);
  const [selectedRowProbeHall, setSelectedRowProbeHall] = useState<HallId>('hall-b');

  const handleInspectIn3D = useCallback(
    (equipmentId: string) => {
      onSelectFocusedEquipmentId(equipmentId);
      const studioEl = document.getElementById('bms-3d-equipment-studio');
      if (studioEl) {
        studioEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [onSelectFocusedEquipmentId]
  );

  const tier4 = useMemo(() => computeTier4RedundancySummary(bms, servers), [bms, servers]);
  const allRowSlaSensors = useMemo(
    () => Object.values(computeColdAisleSlaSensorMetrics(bms, servers)),
    [bms, servers]
  );
  const activeHallRowPairs = useMemo(() => {
    const hallProbes = allRowSlaSensors.filter((s) => s.hallId === selectedRowProbeHall);
    const byRow = new Map<
      number,
      { rowNumber: number; rowLabel: string; sensorA?: (typeof hallProbes)[0]; sensorB?: (typeof hallProbes)[0] }
    >();
    for (const p of hallProbes) {
      const entry = byRow.get(p.rowNumber) ?? { rowNumber: p.rowNumber, rowLabel: p.rowLabel };
      if (p.slot === 'A') entry.sensorA = p;
      else entry.sensorB = p;
      byRow.set(p.rowNumber, entry);
    }
    return Array.from(byRow.values()).sort((a, b) => a.rowNumber - b.rowNumber);
  }, [allRowSlaSensors, selectedRowProbeHall]);

  const waterChillers = useMemo(
    () => bms.chillers.filter((ch) => ch.chillerType === 'Water-Cooled'),
    [bms.chillers]
  );
  const airChillers = useMemo(
    () => bms.chillers.filter((ch) => ch.chillerType === 'Air-Cooled'),
    [bms.chillers]
  );
  const totalChillerOutputMw = bms.chillers.reduce((sum, ch) => sum + ch.coolingOutputKw, 0) / 1000;
  const totalChillerCapMw = bms.chillers.reduce((sum, ch) => sum + ch.capacityKw, 0) / 1000;
  const faultChillerCount = bms.chillers.filter((ch) => ch.mode === 'Fault').length;

  const totalCoolingMw = bms.cracUnits.reduce((sum, c) => sum + c.coolingOutputKw, 0) / 1000;
  const totalCoolingCapMw = bms.cracUnits.reduce((sum, c) => sum + c.maxCoolingKw, 0) / 1000;
  const boostCount = bms.cracUnits.filter((c) => c.mode === 'Boost').length;
  const faultCracCount = bms.cracUnits.filter((c) => c.mode === 'Fault').length;

  const healthyUps = bms.upsSystems.filter((u) => u.mode !== 'Fault');
  const totalUpsLoadMw = bms.upsSystems.reduce((sum, u) => sum + u.loadKw, 0) / 1000;
  const totalUpsCapMva = bms.upsSystems.reduce((sum, u) => sum + u.capacityKw, 0) / 1000;
  const avgBatterySoc =
    healthyUps.reduce((sum, u) => sum + u.batterySocPct, 0) / Math.max(1, healthyUps.length);
  const minRuntimeMin =
    healthyUps.length > 0 ? Math.min(...healthyUps.map((u) => u.runtimeMin)) : 0;

  const slaCompliantHalls = bms.envSensors.filter(
    (e) => e.tempSlaStatus !== 'Breached' && e.humiditySlaStatus !== 'Breached'
  ).length;
  const avgSlaCompliance =
    bms.envSensors.reduce((sum, e) => sum + e.slaCompliancePct, 0) / Math.max(1, bms.envSensors.length);
  const isOutageActive = bms.utilityFeed !== 'Utility Normal';

  const totalDieselLiters = bms.dieselTanks.reduce((sum, t) => sum + t.currentLiters, 0);
  const totalDieselCapLiters = bms.dieselTanks.reduce((sum, t) => sum + t.capacityLiters, 0);
  const avgDieselLevelPct =
    totalDieselCapLiters > 0 ? (totalDieselLiters / totalDieselCapLiters) * 100 : 0;
  const electricalPathA = useMemo(
    () => bms.electricalSwitchgear.filter((n) => n.redundancyPath === 'Path A'),
    [bms.electricalSwitchgear]
  );
  const electricalPathB = useMemo(
    () => bms.electricalSwitchgear.filter((n) => n.redundancyPath === 'Path B'),
    [bms.electricalSwitchgear]
  );
  const dieselPathA = useMemo(
    () => bms.dieselTanks.filter((t) => t.redundancyPath === 'Path A'),
    [bms.dieselTanks]
  );
  const dieselPathB = useMemo(
    () => bms.dieselTanks.filter((t) => t.redundancyPath === 'Path B'),
    [bms.dieselTanks]
  );

  return (
    <div className="space-y-6">
      {/* Header & Top Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Building Management System (BMS)
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {tier4.certificationLabel} · {tier4.uptimeSla} · 2N / 2(N+1) Redundancy &amp; Cold Aisle SLA Sensors
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={bms.closedLoopCoolingEnabled}
            onClick={onToggleClosedLoop}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
              bms.closedLoopCoolingEnabled
                ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
            }`}
          >
            <Fan className="w-3.5 h-3.5" aria-hidden="true" />
            Closed-Loop Cooling: {bms.closedLoopCoolingEnabled ? 'On' : 'Off'}
          </button>

          {isOutageActive ? (
            <button
              type="button"
              onClick={onRestoreUtility}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Restore Utility Power
            </button>
          ) : (
            <button
              type="button"
              onClick={onTriggerOutage}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md bg-[#252A30] dark:bg-[#009530] text-white hover:bg-[#1D2126] dark:hover:bg-[#007A27] transition-colors whitespace-nowrap cursor-pointer"
            >
              <Power className="w-3.5 h-3.5" aria-hidden="true" />
              Simulate Utility Outage
            </button>
          )}
        </div>
      </div>

      {/* 4-Column Certified Tier IV & Cold Aisle SLA Summary Strip */}
      <section
        aria-label="Tier IV facility plant summary"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800"
      >
        <div className="p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Tier IV Redundancy Posture
          </div>
          <div
            data-testid="tier4-posture"
            className={`mt-2 text-base font-semibold leading-tight ${
              tier4.overallState === 'degraded'
                ? 'text-red-700 dark:text-red-400'
                : tier4.overallState === 'failover-active'
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-[#009530] dark:text-[#3DCD58]'
            }`}
          >
            {tier4.overallLabel}
          </div>
          <div
            data-testid="bms-utility-state"
            className="mt-2 text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums"
          >
            {bms.utilityFeed} · {tier4.zeroSpofVerified ? 'Zero SPOF' : 'Redundancy Alert'}
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Chiller Plant (2 Water + 2×180kL Square Tanks + 14 Air)
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold text-slate-900 dark:text-slate-50 tabular-nums">
              {totalChillerOutputMw.toFixed(2)} MW
            </span>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              / {totalChillerCapMw.toFixed(1)} MW
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
            {waterChillers.filter((c) => c.mode !== 'Fault').length}/2 Water · {bms.chwTankPumpSets.filter((p) => p.mode !== 'Fault').length}/2 Pump Sets · {airChillers.filter((c) => c.mode !== 'Fault').length}/14 Air · 6 CRAC + 2 Liquid CDU ({totalCoolingMw.toFixed(1)}/{totalCoolingCapMw.toFixed(0)} MW · {boostCount} Boost
            {faultCracCount + faultChillerCount > 0 ? ` · ${faultCracCount + faultChillerCount} Fault` : ''})
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            2(N+1) Critical UPS Reserve
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`font-mono text-2xl font-semibold tabular-nums ${
                avgBatterySoc < 95 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-900 dark:text-slate-50'
              }`}
            >
              {avgBatterySoc.toFixed(1)}%
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              SoC · {minRuntimeMin}m
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
            {totalUpsLoadMw.toFixed(2)} MW / {totalUpsCapMva.toFixed(0)} MVA ({healthyUps.length}/{bms.upsSystems.length} Online)
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Cold Aisle SLA Compliance
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              data-testid="cold-aisle-sla-summary"
              className={`font-mono text-2xl font-semibold tabular-nums ${
                slaCompliantHalls < bms.envSensors.length
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-slate-900 dark:text-slate-50'
              }`}
            >
              {slaCompliantHalls}/{bms.envSensors.length} Halls
            </span>
            <span
              className={`text-xs font-medium ${
                slaCompliantHalls < bms.envSensors.length
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-[#009530] dark:text-[#3DCD58]'
              }`}
            >
              {avgSlaCompliance.toFixed(2)}%
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
            18–27°C · 40–60% RH · {allRowSlaSensors.length} Probes (2/Row · 2N)
          </div>
        </div>
      </section>

      {/* Interactive 3D Electrical & Mechanical Equipment Explorer (All 46 BMS Units per Site) */}
      <BmsEquipment3DInspector
        bms={bms}
        darkMode={darkMode}
        selectedEquipmentId={focusedEquipmentId}
        onSelectEquipmentId={onSelectFocusedEquipmentId}
        onToggleChillerFault={onToggleChillerFault}
        onToggleChwPumpSetMode={onToggleChwPumpSetMode}
        onSetCracMode={onSetCracMode}
        onToggleUpsFault={onToggleUpsFault}
        onToggleDieselTankPump={onToggleDieselTankPump}
        onRefillDieselTank={onRefillDieselTank}
        onToggleGateway={onToggleGateway}
      />

      {/* Certified Tier IV Fault-Tolerance Matrix across ALL Subsystems */}
      <section
        aria-label="Tier IV equipment redundancy certification matrix"
        className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden"
      >
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Tier IV Certified Equipment Redundancy Matrix (Zero Single Point of Failure)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Real-time fault-tolerance verification across dual physically isolated electrical, cooling, sensor, and gateway paths
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-[#009530] dark:text-[#3DCD58]">
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            Uptime Tier IV · 99.995% SLA
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pl-5 pr-3">Equipment Subsystem</th>
                <th className="py-2.5 px-3">Topology</th>
                <th className="py-2.5 px-3">Path A</th>
                <th className="py-2.5 px-3">Path B</th>
                <th className="py-2.5 px-3 text-right">Online</th>
                <th className="py-2.5 px-3">Live Operational Detail</th>
                <th className="py-2.5 pl-3 pr-5 text-right">Tier IV State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
              {tier4.subsystems.map((sub) => (
                <tr key={sub.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 pl-5 pr-3 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {sub.subsystem}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {sub.topology}
                  </td>
                  <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                    <span
                      className={
                        sub.pathAHealthy
                          ? 'text-[#009530] dark:text-[#3DCD58]'
                          : 'text-amber-700 dark:text-amber-400 font-semibold'
                      }
                    >
                      {sub.pathAHealthy ? 'Active' : 'Failover'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                    <span
                      className={
                        sub.pathBHealthy
                          ? 'text-[#009530] dark:text-[#3DCD58]'
                          : 'text-amber-700 dark:text-amber-400 font-semibold'
                      }
                    >
                      {sub.pathBHealthy ? 'Active' : 'Failover'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {sub.activeCount}/{sub.totalCount}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{sub.detail}</td>
                  <td className="py-2.5 pl-3 pr-5 text-right font-medium whitespace-nowrap">
                    {sub.state === 'fault-tolerant' ? (
                      <span className="inline-flex items-center gap-1 text-[#009530] dark:text-[#3DCD58]">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        Fault-Tolerant
                      </span>
                    ) : sub.state === 'failover-active' ? (
                      <span className="text-amber-700 dark:text-amber-400 font-semibold">
                        Failover Active
                      </span>
                    ) : (
                      <span className="text-red-700 dark:text-red-400 font-semibold">Degraded</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Cold Aisle SLA Temperature & Humidity Sensors (ASHRAE TC 9.9 Class A1 · 2 Sensors per Row = 40/Hall · 160/Site) */}
      <section aria-label="Cold aisle SLA temperature and humidity sensors" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Thermometer className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Cold Aisle SLA Sensors — Temp &amp; Humidity ({allRowSlaSensors.length} Probes · 2/Row × 20 Rows/Hall)
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              SLA Envelope: 18.0–27.0°C · 40.0–60.0% RH
            </p>
            <button
              type="button"
              onClick={() => setRowProbesOpen((prev) => !prev)}
              aria-expanded={rowProbesOpen}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {rowProbesOpen ? (
                <>
                  Hide Row Probes (160)
                  <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                </>
              ) : (
                <>
                  Inspect Row Probes (2/Row)
                  <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {bms.envSensors.map((env) => {
            const anyBreach =
              env.tempSlaStatus === 'Breached' || env.humiditySlaStatus === 'Breached';
            return (
              <div
                key={`sla-${env.id}`}
                data-testid={`cold-aisle-sla-${env.hallId}`}
                className={`bg-white dark:bg-[#1B2026] border rounded-md p-4 flex flex-col justify-between gap-3.5 ${
                  anyBreach
                    ? 'border-red-300 dark:border-red-800'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {env.hallLabel}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        40 Row Probes (2/row) · {env.dualProbeStatus}
                      </div>
                    </div>
                    <span
                      className={`font-mono text-xs font-semibold tabular-nums shrink-0 ${
                        anyBreach
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-[#009530] dark:text-[#3DCD58]'
                      }`}
                    >
                      {env.slaCompliancePct.toFixed(2)}%
                    </span>
                  </div>

                  {/* Temperature SLA Band */}
                  <div className="mt-3.5 space-y-1">
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Cold Aisle Temp</span>
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`font-mono font-semibold tabular-nums ${
                            env.tempSlaStatus === 'Breached'
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-slate-900 dark:text-slate-50'
                          }`}
                        >
                          {env.coldAisleTempC.toFixed(1)}°C
                        </span>
                        <SlaStatusText status={env.tempSlaStatus} />
                      </div>
                    </div>
                    <SlaEnvelopeBar
                      value={env.coldAisleTempC}
                      scaleMin={14}
                      scaleMax={32}
                      slaMin={env.slaTempMinC}
                      slaMax={env.slaTempMaxC}
                      status={env.tempSlaStatus}
                    />
                    <div className="flex items-center justify-between font-mono text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                      <span>A: {env.probeATempC.toFixed(1)}°C</span>
                      <span>SLA 18–27°C</span>
                      <span>B: {env.probeBTempC.toFixed(1)}°C</span>
                    </div>
                  </div>

                  {/* Humidity SLA Band */}
                  <div className="mt-3 space-y-1">
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Relative Humidity</span>
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`font-mono font-semibold tabular-nums ${
                            env.humiditySlaStatus === 'Breached'
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-slate-900 dark:text-slate-50'
                          }`}
                        >
                          {env.humidityPct.toFixed(1)}%
                        </span>
                        <SlaStatusText status={env.humiditySlaStatus} />
                      </div>
                    </div>
                    <SlaEnvelopeBar
                      value={env.humidityPct}
                      scaleMin={25}
                      scaleMax={75}
                      slaMin={env.slaHumidityMinPct}
                      slaMax={env.slaHumidityMaxPct}
                      status={env.humiditySlaStatus}
                    />
                    <div className="flex items-center justify-between font-mono text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                      <span>A: {env.probeAHumidityPct.toFixed(1)}%</span>
                      <span>SLA 40–60%</span>
                      <span>B: {env.probeBHumidityPct.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>

                {/* Dew Point + Interactive SLA Excursion Test */}
                <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    Dew Pt {env.dewPointC.toFixed(1)}°C · {env.chilledLoopStatus}
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggleColdAisleSla(env.hallId)}
                    aria-label={
                      env.slaExcursionActive
                        ? `Clear Cold Aisle SLA excursion in ${env.hallLabel}`
                        : `Test Cold Aisle SLA breach in ${env.hallLabel}`
                    }
                    className={`px-2 py-1 text-[11px] font-medium rounded-sm border transition-colors whitespace-nowrap cursor-pointer ${
                      env.slaExcursionActive
                        ? 'bg-red-600 text-white border-red-600'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {env.slaExcursionActive ? 'Clear SLA' : 'Test SLA'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {rowProbesOpen && (
          <div className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Per-Row Cold Aisle SLA Sensor Telemetry (2 Calibrated Probes per Row · 40 per Hall)
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Sensor A (Path A · West Rack 05) &amp; Sensor B (Path B · East Rack 16) — mirrored live in 3D View
                </div>
              </div>
              <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-0.5 rounded-sm">
                {(['hall-a', 'hall-b', 'hall-c', 'hall-d'] as const).map((hId) => {
                  const code = hId.replace('hall-', 'Hall ').toUpperCase();
                  return (
                    <button
                      key={hId}
                      type="button"
                      onClick={() => setSelectedRowProbeHall(hId)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-sm transition-colors cursor-pointer ${
                        selectedRowProbeHall === hId
                          ? 'bg-[#009530] text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {code}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-2 pl-4 pr-3">Row</th>
                    <th className="py-2 px-3">Sensor A (West · Rack 05)</th>
                    <th className="py-2 px-3 text-right">A Temp / RH</th>
                    <th className="py-2 px-3">Sensor B (East · Rack 16)</th>
                    <th className="py-2 px-3 text-right">B Temp / RH</th>
                    <th className="py-2 pl-3 pr-4 text-right">Row SLA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono">
                  {activeHallRowPairs.map((pair) => {
                    const rowStatus: SlaComplianceStatus =
                      pair.sensorA?.overallStatus === 'Breached' ||
                      pair.sensorB?.overallStatus === 'Breached'
                        ? 'Breached'
                        : pair.sensorA?.overallStatus === 'Warning' ||
                          pair.sensorB?.overallStatus === 'Warning'
                        ? 'Warning'
                        : 'Compliant';
                    return (
                      <tr key={pair.rowLabel} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-1.5 pl-4 pr-3 font-semibold text-slate-900 dark:text-slate-100">
                          {pair.rowLabel}
                        </td>
                        <td className="py-1.5 px-3 text-slate-600 dark:text-slate-400">
                          {pair.sensorA?.sensorId}
                        </td>
                        <td className="py-1.5 px-3 text-right tabular-nums text-slate-900 dark:text-slate-100">
                          {pair.sensorA?.tempC.toFixed(1)}°C · {pair.sensorA?.humidityPct.toFixed(1)}%
                        </td>
                        <td className="py-1.5 px-3 text-slate-600 dark:text-slate-400">
                          {pair.sensorB?.sensorId}
                        </td>
                        <td className="py-1.5 px-3 text-right tabular-nums text-slate-900 dark:text-slate-100">
                          {pair.sensorB?.tempC.toFixed(1)}°C · {pair.sensorB?.humidityPct.toFixed(1)}%
                        </td>
                        <td className="py-1.5 pl-3 pr-4 text-right font-sans">
                          <SlaStatusText status={rowStatus} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Central Chiller Plant — 2 Water-Cooled Chillers (2N) + 14 Air-Cooled Chillers (2(N+1)) */}
      <section aria-label="Central chiller plant" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
          <div className="flex items-center gap-2">
            <Droplets className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Central Chiller Plant — 2 Water-Cooled Chillers (2N) + 14 Air-Cooled Chillers (2(N+1))
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Total Capacity: 24.0 MW Water + 67.2 MW Air = 91.2 MW · Dual Loop A &amp; Loop B
          </p>
        </div>

        {/* 2 Water-Cooled Centrifugal Chillers (2N) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Water-Cooled Centrifugal Chillers (2 Units · 2N Baseload)
            </span>
            <span className="font-mono tabular-nums">
              {waterChillers.filter((c) => c.mode !== 'Fault').length}/2 Online · High-Efficiency Magnetic Bearing
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {waterChillers.map((ch) => {
              const isFault = ch.mode === 'Fault';
              const isBoost = ch.mode === 'Boost';
              return (
                <div
                  key={ch.id}
                  data-testid={`chiller-card-${ch.id}`}
                  className={`bg-white dark:bg-[#1B2026] border rounded-md p-4 space-y-3 ${
                    isFault
                      ? 'border-red-300 dark:border-red-800'
                      : isBoost
                      ? 'border-amber-300 dark:border-amber-800'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-50">
                          {ch.name}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          · {ch.redundancyPath} ({ch.chilledLoop})
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {ch.deviceId} · {ch.protocol} · {ch.endpoint}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-xs font-semibold ${
                          isFault
                            ? 'text-red-700 dark:text-red-400'
                            : isBoost
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-[#009530] dark:text-[#3DCD58]'
                        }`}
                      >
                        {ch.mode}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleInspectIn3D(ch.id)}
                        aria-label={`Inspect ${ch.name} in 3D`}
                        className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-sm border transition-colors whitespace-nowrap cursor-pointer ${
                          focusedEquipmentId === ch.id
                            ? 'bg-[#009530] text-white border-[#009530]'
                            : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Box className="w-3 h-3" aria-hidden="true" />
                        3D
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleChillerFault(ch.id)}
                        aria-label={isFault ? `Restore ${ch.name}` : `Test fault on ${ch.name}`}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded-sm border transition-colors whitespace-nowrap cursor-pointer ${
                          isFault
                            ? 'bg-red-600 text-white border-red-600'
                            : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {isFault ? 'Restore' : 'Test Fault'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Output / Cap</div>
                      <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {(ch.coolingOutputKw / 1000).toFixed(2)} / {(ch.capacityKw / 1000).toFixed(0)} MW
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">CHW Supply / Ret</div>
                      <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {ch.chwSupplyTempC.toFixed(1)}° / {ch.chwReturnTempC.toFixed(1)}°C
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Condenser Water</div>
                      <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {ch.condenserOrAmbientTempC.toFixed(1)}°C · {ch.waterFlowLps} L/s
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Efficiency</div>
                      <div className="mt-0.5 font-mono font-semibold text-[#009530] dark:text-[#3DCD58] tabular-nums">
                        COP {ch.cop.toFixed(1)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Comp / Tower Fan</div>
                      <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {ch.compressorLoadPct}% / {ch.fanSpeedPct}%
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rooftop Chilled-Water Square Thermal Buffer Tanks (2×180,000 L) & Complete VFD Pump Sets */}
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" aria-hidden="true" />
              Rooftop Square Thermal Buffer Tanks (2×180,000 L) &amp; Complete 3-Pump VFD Skids
            </span>
            <span className="font-mono tabular-nums">
              360,000 L Total Rooftop Square CHW Reserve · 2 Duty + 1 N+1 Standby Pumps per Loop
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {bms.chwTankPumpSets.map((set) => {
              const isFault = set.mode === 'Fault';
              const isBoost = set.mode === 'Boost';
              return (
                <div
                  key={set.id}
                  data-testid={`chw-tank-card-${set.id}`}
                  className={`bg-white dark:bg-[#1B2026] border rounded-md p-4 space-y-3 ${
                    isFault
                      ? 'border-red-300 dark:border-red-800'
                      : isBoost
                      ? 'border-amber-300 dark:border-amber-800'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-50">
                          {set.name}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          · {set.redundancyPath} ({set.chilledLoop})
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {set.pumpConfigLabel} · Feeds {set.servedChillerId.toUpperCase()} · {set.protocol} ({set.endpoint})
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-xs font-semibold ${
                          isFault
                            ? 'text-red-700 dark:text-red-400'
                            : isBoost
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-[#009530] dark:text-[#3DCD58]'
                        }`}
                      >
                        {set.mode}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleInspectIn3D(set.id)}
                        aria-label={`Inspect ${set.name} in 3D`}
                        className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-sm border transition-colors whitespace-nowrap cursor-pointer ${
                          focusedEquipmentId === set.id
                            ? 'bg-[#009530] text-white border-[#009530]'
                            : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Box className="w-3 h-3" aria-hidden="true" />
                        3D
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleChwPumpSetMode(set.id)}
                        aria-label={`Cycle pump mode on ${set.name}`}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded-sm border transition-colors whitespace-nowrap cursor-pointer ${
                          isFault
                            ? 'bg-red-600 text-white border-red-600'
                            : isBoost
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {isFault ? 'Restore' : isBoost ? 'Test Fault' : 'Boost Pumps'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Tank Reserve</div>
                      <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {(set.tankCapacityLiters / 1000).toFixed(0)}kL ({set.tankLevelPct.toFixed(0)}%)
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">CHW / Autonomy</div>
                      <div className="mt-0.5 font-mono font-semibold text-cyan-700 dark:text-cyan-400 tabular-nums">
                        {set.waterTempC.toFixed(1)}°C · {set.bufferAutonomyMin}m
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Active Pumps</div>
                      <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {set.activePumps}/{set.totalPumps} Duty
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Flow / Head</div>
                      <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {set.flowRateLps} L/s · {set.dischargePressureBar.toFixed(1)} bar
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">VFD / Power</div>
                      <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {set.vfdSpeedPct}% · {set.pumpPowerKw} kW
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 14 Air-Cooled Free-Cooling Chillers (2(N+1): 7x Loop A + 7x Loop B) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Air-Cooled Chillers (14 Units · 2(N+1) · 7× Loop A &amp; 7× Loop B)
            </span>
            <span className="font-mono tabular-nums">
              {airChillers.filter((c) => c.mode === 'Running' || c.mode === 'Boost').length} Running ·{' '}
              {airChillers.filter((c) => c.mode === 'Standby').length} N+1 Standby ·{' '}
              {airChillers.filter((c) => c.mode === 'Fault').length} Fault
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {airChillers.map((ch) => {
              const isFault = ch.mode === 'Fault';
              const isBoost = ch.mode === 'Boost';
              const isStandby = ch.mode === 'Standby';
              return (
                <div
                  key={ch.id}
                  data-testid={`chiller-card-${ch.id}`}
                  className={`bg-white dark:bg-[#1B2026] border rounded-md p-3.5 space-y-2.5 ${
                    isFault
                      ? 'border-red-300 dark:border-red-800'
                      : isBoost
                      ? 'border-amber-300 dark:border-amber-800'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-50 truncate">
                        {ch.name}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {ch.chilledLoop} · {ch.role} · <span className="font-mono">{ch.deviceId}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`text-[11px] font-semibold ${
                          isFault
                            ? 'text-red-700 dark:text-red-400'
                            : isBoost
                            ? 'text-amber-700 dark:text-amber-400'
                            : isStandby
                            ? 'text-slate-500 dark:text-slate-400'
                            : 'text-[#009530] dark:text-[#3DCD58]'
                        }`}
                      >
                        {ch.mode}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleInspectIn3D(ch.id)}
                        aria-label={`Inspect ${ch.name} in 3D`}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium rounded-sm border transition-colors whitespace-nowrap cursor-pointer ${
                          focusedEquipmentId === ch.id
                            ? 'bg-[#009530] text-white border-[#009530]'
                            : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Box className="w-3 h-3" aria-hidden="true" />
                        3D
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleChillerFault(ch.id)}
                        aria-label={isFault ? `Restore ${ch.name}` : `Test fault on ${ch.name}`}
                        className={`px-2 py-0.5 text-[11px] font-medium rounded-sm border transition-colors whitespace-nowrap cursor-pointer ${
                          isFault
                            ? 'bg-red-600 text-white border-red-600'
                            : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {isFault ? 'Restore' : 'Test Fault'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Cooling</div>
                      <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {(ch.coolingOutputKw / 1000).toFixed(2)} / {(ch.capacityKw / 1000).toFixed(1)} MW
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">CHW / Amb</div>
                      <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {ch.chwSupplyTempC.toFixed(1)}° / {ch.condenserOrAmbientTempC.toFixed(0)}°C
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Load · Fan</div>
                      <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {ch.compressorLoadPct}% · {ch.fanSpeedPct}% (COP {ch.cop.toFixed(1)})
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Cooling & HVAC Plant — 6 Air CRACs (Halls A/C/D) + 2 Direct-to-Chip Liquid Cooling CDUs (Hall B) */}
      <section aria-label="CRAC HVAC and Liquid CDU cooling units" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Data Hall Cooling — 6 Air CRACs (Halls A/C/D) &amp; 2 Direct-to-Chip Liquid CDUs (Hall B)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Hall B AI &amp; GPU clusters operate on 2N PG25 Liquid Cooling CDUs; faulting any Path A unit auto-boosts its Path B peer
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {bms.cracUnits.map((crac) => {
            const isCdu = crac.coolingType === 'Liquid CDU';
            return (
              <div
                key={crac.id}
                data-testid={`crac-card-${crac.id}`}
                className={`bg-white dark:bg-[#1B2026] border rounded-md p-4 flex flex-col justify-between gap-3.5 ${
                  isCdu
                    ? 'border-cyan-300 dark:border-cyan-800/80'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {crac.name}
                        </span>
                        <span className="font-mono text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          · {crac.redundancyPath} ({crac.chilledLoop})
                        </span>
                      </div>
                      <div className="mt-0.5 space-y-1">
                        <div className="text-xs text-slate-500 dark:text-slate-400">{crac.hallLabel}</div>
                        {isCdu && (
                          <span className="inline-block px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded-xs bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 whitespace-nowrap">
                            Liquid CDU · PG{crac.glycolMixPct ?? 25}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                        {crac.mode} · {crac.endpoint} ({crac.deviceId})
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <NodeStatusLabel status={crac.status} />
                      <button
                        type="button"
                        onClick={() => handleInspectIn3D(crac.id)}
                        aria-label={`Inspect ${crac.name} in 3D`}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-sm border transition-colors whitespace-nowrap cursor-pointer ${
                          focusedEquipmentId === crac.id
                            ? 'bg-[#009530] text-white border-[#009530]'
                            : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Box className="w-3 h-3" aria-hidden="true" />
                        3D
                      </button>
                    </div>
                  </div>

                  {/* Live Thermal & Airflow / Secondary Liquid Coolant Readouts */}
                  {isCdu ? (
                    <dl className="mt-3.5 grid grid-cols-3 gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Coolant Sup</dt>
                        <dd className="mt-0.5 font-mono text-sm font-semibold text-cyan-700 dark:text-cyan-400 tabular-nums">
                          {(crac.coolantSupplyTempC ?? crac.supplyTempC).toFixed(1)}°C
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Coolant Ret</dt>
                        <dd className="mt-0.5 font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {(crac.coolantReturnTempC ?? crac.returnTempC).toFixed(1)}°C
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Output</dt>
                        <dd className="mt-0.5 font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {(crac.coolingOutputKw / 1000).toFixed(2)} MW
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Flow</dt>
                        <dd className="mt-0.5 font-mono font-medium text-slate-800 dark:text-slate-200 tabular-nums">
                          {crac.coolantFlowLpm ?? 0} L/m
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">ΔP / HX</dt>
                        <dd className="mt-0.5 font-mono font-medium text-slate-800 dark:text-slate-200 tabular-nums">
                          {(crac.deltaPBar ?? 2.1).toFixed(1)}b · {crac.heatExchangerEffPct ?? 94}%
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Pump VFD</dt>
                        <dd className="mt-0.5 font-mono font-medium text-slate-800 dark:text-slate-200 tabular-nums">
                          {crac.fanSpeedPct}%
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <dl className="mt-3.5 grid grid-cols-3 gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Supply</dt>
                        <dd
                          className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${
                            crac.supplyTempC >= 25.5
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {crac.supplyTempC.toFixed(1)}°C
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Return</dt>
                        <dd className="mt-0.5 font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {crac.returnTempC.toFixed(1)}°C
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Output</dt>
                        <dd className="mt-0.5 font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {(crac.coolingOutputKw / 1000).toFixed(2)} MW
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Fan</dt>
                        <dd className="mt-0.5 font-mono font-medium text-slate-800 dark:text-slate-200 tabular-nums">
                          {crac.fanSpeedPct}%
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">CW Valve</dt>
                        <dd className="mt-0.5 font-mono font-medium text-slate-800 dark:text-slate-200 tabular-nums">
                          {crac.chilledWaterValvePct}%
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Humidity</dt>
                        <dd className="mt-0.5 font-mono font-medium text-slate-800 dark:text-slate-200 tabular-nums">
                          {crac.humidityPct.toFixed(1)}%
                        </dd>
                      </div>
                    </dl>
                  )}
                </div>

              {/* Interactive BACnet Setpoint & Mode Controls */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Setpoint
                  </span>
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onAdjustSetpoint(crac.id, crac.setpointC - 0.5)}
                      aria-label={`Decrease ${crac.name} setpoint`}
                      className="p-1 rounded-sm border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Minus className="w-3 h-3" aria-hidden="true" />
                    </button>
                    <span
                      data-testid={`setpoint-${crac.id}`}
                      className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 w-12 text-center tabular-nums"
                    >
                      {crac.setpointC.toFixed(1)}°C
                    </span>
                    <button
                      type="button"
                      onClick={() => onAdjustSetpoint(crac.id, crac.setpointC + 0.5)}
                      aria-label={`Increase ${crac.name} setpoint`}
                      className="p-1 rounded-sm border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSetCracMode(crac.id, 'Auto')}
                    aria-label={`Set ${crac.name} to Auto mode`}
                    className={`flex-1 py-1 text-xs font-medium rounded-sm border transition-colors cursor-pointer ${
                      crac.mode === 'Auto'
                        ? 'bg-[#009530] text-white border-[#009530]'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetCracMode(crac.id, 'Boost')}
                    aria-label={`Set ${crac.name} to Boost mode`}
                    className={`flex-1 py-1 text-xs font-medium rounded-sm border transition-colors cursor-pointer ${
                      crac.mode === 'Boost'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    Boost
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetCracMode(crac.id, crac.mode === 'Fault' ? 'Auto' : 'Fault')}
                    aria-label={crac.mode === 'Fault' ? `Clear ${crac.name} fault` : `Simulate ${crac.name} fault`}
                    className={`flex-1 py-1 text-xs font-medium rounded-sm border transition-colors cursor-pointer ${
                      crac.mode === 'Fault'
                        ? 'bg-red-600 text-white border-red-600'
                        : 'border-slate-200 dark:border-slate-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
                    }`}
                  >
                    {crac.mode === 'Fault' ? 'Clear' : 'Test Fault'}
                  </button>
                </div>
              </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Tier IV 2N Electrical Single-Line Distribution: HV → MSB → OPSWB serving Electrical (IT) & Mechanical */}
      <section
        aria-label="Tier IV HV to MSB to OPSWB electrical distribution"
        className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                2N Electrical Single-Line Distribution — HV → MSB → OPSWB (Serving Electrical &amp; Mechanical)
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              132kV/11kV HV GIS &amp; Transformers step down to 415V MSB &amp; OPSWB feeders distributing critical power to Electrical (IT) &amp; Mechanical plants
            </p>
          </div>
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
            Dual Isolated Bus A &amp; Bus B · 64 MVA Total
          </span>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {(
            [
              { label: 'Path A · Bus A Lineup', nodes: electricalPathA, accent: 'text-[#009530] dark:text-[#3DCD58]' },
              { label: 'Path B · Bus B Lineup', nodes: electricalPathB, accent: 'text-sky-700 dark:text-sky-400' },
            ] as const
          ).map((lineup) => (
            <div key={lineup.label} className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className={`font-mono font-semibold ${lineup.accent}`}>{lineup.label}</span>
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  Utility / Gen → HV → MSB → OPSWB → Electrical (IT) + Mechanical (Chillers / Pumps / CRAC / CDU)
                </span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {lineup.nodes.map((node, idx) => {
                  const isGenSync = node.breakerState === 'Gen Sync';
                  const isOpen = node.breakerState === 'Open';
                  return (
                    <div
                      key={node.id}
                      data-testid={`switchgear-card-${node.id}`}
                      className={`relative rounded-md border p-3.5 space-y-2.5 bg-slate-50/70 dark:bg-[#14181D] ${
                        isOpen
                          ? 'border-red-300 dark:border-red-800'
                          : isGenSync
                          ? 'border-amber-300 dark:border-amber-800'
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded-xs bg-slate-900 dark:bg-slate-200 text-white dark:text-slate-900">
                              {node.stage}
                            </span>
                            <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {node.name}
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                            {node.voltageLabel} · {(node.ratedKva / 1000).toFixed(0)} MVA · {node.endpoint}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`text-[11px] font-mono font-semibold ${
                              isOpen
                                ? 'text-red-700 dark:text-red-400'
                                : isGenSync
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-[#009530] dark:text-[#3DCD58]'
                            }`}
                          >
                            {node.breakerState}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleInspectIn3D(node.id)}
                            aria-label={`Inspect ${node.name} in 3D`}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium rounded-sm border transition-colors whitespace-nowrap cursor-pointer ${
                              focusedEquipmentId === node.id
                                ? 'bg-[#009530] text-white border-[#009530]'
                                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            <Box className="w-3 h-3" aria-hidden="true" />
                            3D
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800 text-[11px]">
                        <div>
                          <div className="text-slate-500 dark:text-slate-400">Total Load</div>
                          <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                            {(node.activeLoadKw / 1000).toFixed(2)} MW
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-500 dark:text-slate-400">Electrical (IT)</div>
                          <div className="font-mono font-semibold text-[#009530] dark:text-[#3DCD58] tabular-nums">
                            {(node.electricalServeKw / 1000).toFixed(2)} MW
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-500 dark:text-slate-400">Mechanical</div>
                          <div className="font-mono font-semibold text-sky-700 dark:text-sky-400 tabular-nums">
                            {(node.mechanicalServeKw / 1000).toFixed(2)} MW
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400 pt-1">
                        <span className="truncate">
                          → {node.downstreamTargets.join(' + ')}
                        </span>
                        <span className="shrink-0 ml-2 inline-flex items-center gap-1">
                          PF {node.powerFactor.toFixed(2)}
                          {idx < lineup.nodes.length - 1 && (
                            <ArrowRight className="w-3 h-3 text-slate-400 hidden lg:inline" aria-hidden="true" />
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Critical Power Chain: 2(N+1) UPS Systems (4 Modules) & 2(N+1) Standby Diesel Generators (4 Units) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section
          aria-label="Tier IV 2(N+1) UPS Power Systems"
          className="lg:col-span-7 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Critical Power — 2(N+1) UPS Systems (4 Modules · 64 MVA)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Physically isolated Bus A &amp; Bus B double-conversion vaults; test any module fault to verify zero-drop load takeover
              </p>
            </div>
            <Zap className="w-4 h-4 text-[#009530] dark:text-[#3DCD58] shrink-0" aria-hidden="true" />
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {bms.upsSystems.map((ups) => {
              const loadPct = Math.round((ups.loadKw / ups.capacityKw) * 100);
              return (
                <div key={ups.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {ups.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {ups.feedBus} · {ups.role} · {ups.endpoint} · Mode: {ups.mode}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <NodeStatusLabel status={ups.status} />
                      <button
                        type="button"
                        onClick={() => handleInspectIn3D(ups.id)}
                        aria-label={`Inspect ${ups.name} in 3D`}
                        className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-sm border transition-colors whitespace-nowrap cursor-pointer ${
                          focusedEquipmentId === ups.id
                            ? 'bg-[#009530] text-white border-[#009530]'
                            : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Box className="w-3 h-3" aria-hidden="true" />
                        3D
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleUpsFault(ups.id)}
                        aria-label={
                          ups.mode === 'Fault'
                            ? `Restore ${ups.name}`
                            : `Simulate fault on ${ups.name}`
                        }
                        className={`px-2 py-1 text-[11px] font-medium rounded-sm border transition-colors cursor-pointer ${
                          ups.mode === 'Fault'
                            ? 'bg-red-600 text-white border-red-600'
                            : 'border-slate-200 dark:border-slate-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
                        }`}
                      >
                        {ups.mode === 'Fault' ? 'Restore' : 'Test Fault'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Bus Load</div>
                      <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {(ups.loadKw / 1000).toFixed(2)} MW ({loadPct}%)
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Battery SoC</div>
                      <div
                        className={`mt-0.5 font-mono font-semibold tabular-nums ${
                          ups.batterySocPct < 90
                            ? 'text-red-700 dark:text-red-400'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {ups.batterySocPct.toFixed(1)}% · {ups.runtimeMin}m
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Input Bus</div>
                      <div
                        className={`mt-0.5 font-mono font-semibold tabular-nums ${
                          ups.inputVoltageV === 0
                            ? 'text-red-700 dark:text-red-400'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {ups.inputVoltageV.toFixed(1)} V
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Output Freq</div>
                      <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {ups.outputFreqHz.toFixed(1)} Hz
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section
          aria-label="Tier IV 2(N+1) Standby Diesel Generators"
          className="lg:col-span-5 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Standby Generators — 2(N+1) Yards (64 MW · 8 Units · 96h Fuel)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Dual independent Path A (4×8 MW) &amp; Path B (4×8 MW) ATS auto-start with dedicated on-site fuel farms
            </p>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {bms.generators.map((gen) => (
              <div key={gen.id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {gen.name}
                    </div>
                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      {gen.feedBus} · {gen.role} · {gen.endpoint}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-xs font-medium whitespace-nowrap ${
                        gen.state === 'Running · On Load'
                          ? 'text-amber-700 dark:text-amber-400'
                          : gen.state === 'Cranking'
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-[#009530] dark:text-[#3DCD58]'
                      }`}
                    >
                      {gen.state}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleInspectIn3D(gen.id)}
                      aria-label={`Inspect ${gen.name} in 3D`}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-sm border transition-colors whitespace-nowrap cursor-pointer ${
                        focusedEquipmentId === gen.id
                          ? 'bg-[#009530] text-white border-[#009530]'
                          : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Box className="w-3 h-3" aria-hidden="true" />
                      3D
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Output</div>
                    <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {(gen.outputKw / 1000).toFixed(2)} / {(gen.ratedKw / 1000).toFixed(0)} MW
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Fuel ({gen.fuelAutonomyHours}h)</div>
                    <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {gen.fuelLevelPct.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Coolant</div>
                    <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {gen.coolantTempC.toFixed(1)}°C
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Basement Level B1 Bulk Diesel Storage Vault (8 UL-2085 Tanks · 400,000 L supplying 8 Generators) */}
      <section
        aria-label="Basement Level B1 bulk diesel fuel vault"
        className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Fuel className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Basement Level B1 Bulk Diesel Fuel Vault — 8 Tanks (400,000 L Supplying 8 Standby Generators)
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Subterranean double-walled UL-2085 cylindrical storage tanks with duplex transfer pumps &amp; vertical risers paired 1:1 to Path A &amp; Path B Generators
            </p>
          </div>
          <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
            {totalDieselLiters.toLocaleString()} / {totalDieselCapLiters.toLocaleString()} L ({avgDieselLevelPct.toFixed(1)}%)
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {(
            [
              { label: 'Basement B1 · Path A Fuel Vault → GEN-A1–A4', tanks: dieselPathA },
              { label: 'Basement B1 · Path B Fuel Vault → GEN-B1–B4', tanks: dieselPathB },
            ] as const
          ).map((vault) => (
            <div key={vault.label} className="space-y-2">
              <div className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300">
                {vault.label}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {vault.tanks.map((tank) => {
                  const isFault = tank.transferPumpMode === 'Fault';
                  const isTransfer = tank.transferPumpMode === 'Transferring';
                  const isPolishing = tank.transferPumpMode === 'Polishing';
                  return (
                    <div
                      key={tank.id}
                      data-testid={`diesel-tank-card-${tank.id}`}
                      className={`rounded-md border p-3.5 space-y-2.5 bg-slate-50/60 dark:bg-[#14181D] ${
                        isFault || tank.levelPct < 25
                          ? 'border-red-300 dark:border-red-800'
                          : isTransfer
                          ? 'border-amber-300 dark:border-amber-800'
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {tank.name}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            → {tank.servedGenerators.join(', ')}
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-mono font-semibold whitespace-nowrap ${
                            isFault
                              ? 'text-red-700 dark:text-red-400'
                              : isTransfer
                              ? 'text-amber-700 dark:text-amber-400'
                              : isPolishing
                              ? 'text-cyan-700 dark:text-cyan-400'
                              : 'text-[#009530] dark:text-[#3DCD58]'
                          }`}
                        >
                          {tank.transferPumpMode}
                        </span>
                      </div>

                      {/* Tank Fill Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex items-baseline justify-between text-[11px] font-mono tabular-nums">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {tank.currentLiters.toLocaleString()} L
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">
                            {tank.levelPct.toFixed(1)}% / 50kL
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-xs bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              tank.levelPct < 25
                                ? 'bg-red-600'
                                : tank.levelPct < 60
                                ? 'bg-amber-500'
                                : 'bg-amber-500 dark:bg-amber-400'
                            }`}
                            style={{ width: `${Math.max(2, Math.min(100, tank.levelPct))}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                          <span>Header {tank.supplyPressureBar.toFixed(1)} bar</span>
                          <span>Fuel {tank.fuelTempC.toFixed(1)}°C</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 pt-1 border-t border-slate-200/80 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => handleInspectIn3D(tank.id)}
                          aria-label={`Inspect ${tank.name} in 3D`}
                          className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-sm border transition-colors whitespace-nowrap cursor-pointer ${
                            focusedEquipmentId === tank.id
                              ? 'bg-[#009530] text-white border-[#009530]'
                              : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <Box className="w-3 h-3" aria-hidden="true" />
                          3D
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleDieselTankPump(tank.id)}
                          aria-label={`Cycle transfer pump on ${tank.name}`}
                          className="flex-1 py-1 px-1.5 text-[11px] font-medium rounded-sm border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          Pump
                        </button>
                        <button
                          type="button"
                          onClick={() => onRefillDieselTank(tank.id)}
                          aria-label={`Refill ${tank.name} to 98%`}
                          className="flex-1 py-1 px-1.5 text-[11px] font-medium rounded-sm border border-slate-200 dark:border-slate-700 text-[#009530] dark:text-[#3DCD58] hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors cursor-pointer"
                        >
                          Refill
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Environmental & Life-Safety Probes Table */}
      <section
        aria-label="Environmental and safety sensors"
        className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Environmental &amp; Life-Safety Probes (2N SNMP v3)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Under-floor containment pressure, dual chilled-water loop status, VESDA smoke aspiration, and leak ropes
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pl-5 pr-3">Data Hall Zone</th>
                <th className="py-2.5 px-3">Chilled Water Loops</th>
                <th className="py-2.5 px-3 text-right">Diff Pressure</th>
                <th className="py-2.5 px-3">VESDA Smoke</th>
                <th className="py-2.5 px-3">Under-Floor Leak</th>
                <th className="py-2.5 pl-3 pr-5 text-right">Leak Test</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
              {bms.envSensors.map((env) => (
                <tr key={env.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 pl-5 pr-3 font-medium text-slate-900 dark:text-slate-100 text-xs">
                    {env.hallLabel}
                  </td>
                  <td className="py-3 px-3 font-mono text-xs">
                    <span
                      className={
                        env.chilledLoopStatus === 'Dual Loop Fault'
                          ? 'text-red-700 dark:text-red-400 font-semibold'
                          : env.chilledLoopStatus === 'Loop A + B Active'
                          ? 'text-[#009530] dark:text-[#3DCD58]'
                          : 'text-amber-700 dark:text-amber-400 font-semibold'
                      }
                    >
                      {env.chilledLoopStatus}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                    +{env.differentialPressurePa.toFixed(1)} Pa
                  </td>
                  <td className="py-3 px-3 text-xs text-[#009530] dark:text-[#3DCD58] font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                      {env.smokeAspiration}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-xs font-medium">
                    {env.leakDetected ? (
                      <span className="inline-flex items-center gap-1.5 text-red-700 dark:text-red-400 font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                        Leak Detected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[#009530] dark:text-[#3DCD58]">
                        <Droplets className="w-3.5 h-3.5" aria-hidden="true" />
                        Dry
                      </span>
                    )}
                  </td>
                  <td className="py-3 pl-3 pr-5 text-right">
                    <button
                      type="button"
                      onClick={() => onToggleLeakFault(env.hallId)}
                      aria-label={
                        env.leakDetected
                          ? `Clear leak alarm in ${env.hallLabel}`
                          : `Simulate water leak in ${env.hallLabel}`
                      }
                      className="px-2.5 py-1 text-xs font-medium rounded-sm border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                    >
                      {env.leakDetected ? 'Clear Leak' : 'Test Leak'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2N Active/Standby BMS Protocol Gateways & Closed-Loop BMS Command Audit Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section
          aria-label="BMS 2N Protocol Gateways"
          className="lg:col-span-5 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              2N BMS Protocol Gateways (Active / Standby Pairs)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pausing any Primary gateway triggers automatic Standby failover with zero polling loss
            </p>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {bms.gateways.map((gw) => (
              <li key={gw.id} className="p-3.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {gw.name}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {gw.protocol} · {gw.redundancyPath} · {gw.endpoint}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    {gw.mappedPoints} pts · {gw.connected ? `${gw.latencyMs}ms · Synced ${formatRelativeTime(gw.lastSyncAt).toLowerCase()}` : 'Standby failover active'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleInspectIn3D(gw.id)}
                    aria-label={`Inspect ${gw.name} in 3D`}
                    className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-sm border transition-colors whitespace-nowrap cursor-pointer ${
                      focusedEquipmentId === gw.id
                        ? 'bg-[#009530] text-white border-[#009530]'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Box className="w-3 h-3" aria-hidden="true" />
                    3D
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={gw.connected}
                    aria-label={`Toggle ${gw.name} gateway`}
                    onClick={() => onToggleGateway(gw.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-sm border shrink-0 transition-colors cursor-pointer ${
                      gw.connected
                        ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {gw.connected ? 'Connected' : 'Paused'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-label="BMS Command and Automation Log"
          className="lg:col-span-7 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              BMS Write, Failover &amp; Automation Command Log
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Audit trail of BACnet/Modbus/SNMP control writes and Tier IV automatic failover actions
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pl-5 pr-3">Time</th>
                  <th className="py-2.5 px-3">Device &amp; Protocol</th>
                  <th className="py-2.5 px-3">Command</th>
                  <th className="py-2.5 pl-3 pr-5 text-right">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {bms.commandLog.slice(0, 10).map((cmd) => (
                  <tr key={cmd.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 pl-5 pr-3 font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatClockTime(cmd.timestamp)}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="font-mono font-medium text-slate-900 dark:text-slate-100">
                        {cmd.targetDevice}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {cmd.protocol} · {cmd.source}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                      {cmd.command}
                    </td>
                    <td
                      className={`py-2.5 pl-3 pr-5 text-right font-medium whitespace-nowrap ${
                        cmd.result === 'Applied'
                          ? 'text-[#009530] dark:text-[#3DCD58]'
                          : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {cmd.result}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* 2N Failover & N+1 Cooling What-If Resilience Simulator */}
      {racks.length > 0 && (
        <BmsResilienceSimulatorPanel
          bms={bms}
          racks={racks}
          servers={servers}
          rackPowerAdjustmentsKw={rackPowerAdjustmentsKw}
          hallPowerPolicies={hallPowerPolicies}
          onLogSimulation={(summary) => onLogAudit?.('Power / SLD', summary, 'BMS Resilience Drill')}
        />
      )}

      {/* UPS Battery & Diesel Generator Autonomy Calculator + Hall B DLC & Leak-Rope Monitor */}
      <BmsAutonomyAndDlcPanel
        bms={bms}
        servers={servers}
        onToggleLeakFault={onToggleLeakFault}
      />
    </div>
  );
}

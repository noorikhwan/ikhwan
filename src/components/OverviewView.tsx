import { ArrowUpRight, Building2, Check, FileSpreadsheet, Flame, Pause, Play, ShieldCheck } from 'lucide-react';
import { computeTier4RedundancySummary } from '../engine/bmsEngine';
import { BmsState } from '../engine/bmsTypes';
import { ActiveAlert, FacilitySummary, FacilityTelemetryPoint, ServerNode } from '../engine/types';
import { RadialHealthGauge, SemiArcPueGauge } from './EcoGauges';
import { formatRelativeTime, NodeStatusLabel, SeverityLabel } from './StatusIndicator';
import { FacilityChartMetric, TelemetryChart } from './TelemetryChart';

interface OverviewViewProps {
  siteLabel: string;
  summary: FacilitySummary;
  bms: BmsState;
  facilityHistory: FacilityTelemetryPoint[];
  chartMetric: FacilityChartMetric;
  onChartMetricChange: (m: FacilityChartMetric) => void;
  servers: ServerNode[];
  alerts: ActiveAlert[];
  isLive: boolean;
  onToggleLive: () => void;
  onSimulateFault: () => void;
  onInspectServer: (serverId: string) => void;
  onAcknowledgeAlert: (alertId: string) => void;
  onResolveAlert: (alertId: string) => void;
  onNavigateTab: (tab: 'servers' | 'alerts' | 'racks' | 'rules' | 'bms' | 'reports') => void;
}

export function OverviewView({
  siteLabel,
  summary,
  bms,
  facilityHistory,
  chartMetric,
  onChartMetricChange,
  servers,
  alerts,
  isLive,
  onToggleLive,
  onSimulateFault,
  onInspectServer,
  onAcknowledgeAlert,
  onResolveAlert,
  onNavigateTab,
}: OverviewViewProps) {
  const totalCoolingMw = bms.cracUnits.reduce((sum, c) => sum + c.coolingOutputKw, 0) / 1000;
  const waterChillersOnline = bms.chillers.filter(
    (ch) => ch.chillerType === 'Water-Cooled' && ch.mode !== 'Fault'
  ).length;
  const airChillersOnline = bms.chillers.filter(
    (ch) => ch.chillerType === 'Air-Cooled' && ch.mode !== 'Fault'
  ).length;
  const connectedGateways = bms.gateways.filter((g) => g.connected).length;
  const boostCracs = bms.cracUnits.filter((c) => c.mode === 'Boost').map((c) => c.name);
  const tier4 = computeTier4RedundancySummary(bms, servers);
  const slaCompliantHalls = bms.envSensors.filter(
    (e) => e.tempSlaStatus !== 'Breached' && e.humiditySlaStatus !== 'Breached'
  ).length;
  const avgColdAisleTemp =
    bms.envSensors.reduce((sum, e) => sum + e.coldAisleTempC, 0) / Math.max(1, bms.envSensors.length);
  const avgColdAisleHum =
    bms.envSensors.reduce((sum, e) => sum + e.humidityPct, 0) / Math.max(1, bms.envSensors.length);

  const priorityServers = [...servers]
    .sort((a, b) => {
      const rank = { critical: 0, warning: 1, nominal: 2, maintenance: 3 };
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      return b.tempC - a.tempC;
    })
    .slice(0, 7);

  const openAlerts = alerts
    .filter((a) => a.state === 'active' || a.state === 'acknowledged')
    .slice(0, 5);
  const powerPct = Math.round((summary.totalItLoadKw / Math.max(1, summary.totalFacilityCapacityKw)) * 100);
  const activeServersCount = Math.max(1, summary.totalServers - summary.maintenanceCount);
  const healthScore = Math.round(
    ((summary.nominalCount + summary.warningCount * 0.55) / activeServersCount) * 100
  );

  return (
    <div className="space-y-5">
      {/* EcoStruxure Header Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Site Operations Dashboard
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {siteLabel} · Tier IV Certified (2N / 2(N+1)) · 4 Data Halls · 1,600 Racks · {summary.totalServers} Live Hosts
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigateTab('reports')}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
            Generate Report
          </button>
          <button
            type="button"
            onClick={onToggleLive}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isLive ? <Pause className="w-3.5 h-3.5" aria-hidden="true" /> : <Play className="w-3.5 h-3.5" aria-hidden="true" />}
            {isLive ? 'Pause Telemetry' : 'Resume Telemetry'}
          </button>
          <button
            type="button"
            onClick={onSimulateFault}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Flame className="w-3.5 h-3.5" aria-hidden="true" />
            Simulate Thermal Fault
          </button>
        </div>
      </div>

      {/* EcoStruxure 4-Column Engineering Widget Row (Health Gauge, PUE Gauge, Alarm Summary, Thermal & BMS) */}
      <section
        aria-label="Facility key metrics"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        {/* 1. Infrastructure Health Index */}
        <div className="bg-white dark:bg-[#1B2026] border border-slate-200/90 dark:border-slate-800 rounded-md p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Infrastructure Health
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-semibold text-slate-900 dark:text-slate-50 tabular-nums">
                {summary.nominalCount}/{summary.totalServers}
              </span>
              <span className="text-xs font-medium text-[#009530] dark:text-[#3DCD58]">Nominal</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
              <span className={summary.criticalCount > 0 ? 'text-red-700 dark:text-red-400 font-semibold' : ''}>
                {summary.criticalCount} Crit
              </span>
              <span aria-hidden="true">·</span>
              <span className={summary.warningCount > 0 ? 'text-amber-700 dark:text-amber-400 font-medium' : ''}>
                {summary.warningCount} Warn
              </span>
              <span aria-hidden="true">·</span>
              <span>{summary.maintenanceCount} Maint</span>
            </div>
          </div>
          <RadialHealthGauge scorePct={healthScore} label="Score" />
        </div>

        {/* 2. IT Power Load & PUE Gauge */}
        <div className="bg-white dark:bg-[#1B2026] border border-slate-200/90 dark:border-slate-800 rounded-md p-4 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              IT Power Load &amp; PUE
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-semibold text-slate-900 dark:text-slate-50 tabular-nums">
                {(summary.totalItLoadKw / 1000).toFixed(2)} MW
              </span>
            </div>
            <div className="mt-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                <span>
                  {powerPct}% of {(summary.totalFacilityCapacityKw / 1000).toFixed(1)} MW
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-sm overflow-hidden">
                <div
                  className="h-full bg-[#009530] dark:bg-[#3DCD58] transition-all"
                  style={{ width: `${Math.min(100, powerPct)}%` }}
                />
              </div>
            </div>
          </div>
          <SemiArcPueGauge pue={summary.pue} />
        </div>

        {/* 3. Active Alarm Summary (EcoStruxure 4-tier counter card) */}
        <div className="bg-white dark:bg-[#1B2026] border border-slate-200/90 dark:border-slate-800 rounded-md p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Active Alarms Summary
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('alerts')}
              className="text-xs font-medium text-[#009530] dark:text-[#3DCD58] hover:underline cursor-pointer"
            >
              View All
            </button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="py-1.5 px-1 rounded-sm bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800">
              <div
                data-testid="unacked-alert-count"
                className={`font-mono text-xl font-semibold tabular-nums ${
                  summary.unacknowledgedCount > 0
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-slate-900 dark:text-slate-50'
                }`}
              >
                {summary.unacknowledgedCount}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Unacked</div>
            </div>
            <div className="py-1.5 px-1 rounded-sm bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800">
              <div
                className={`font-mono text-xl font-semibold tabular-nums ${
                  summary.activeCriticalCount > 0
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-slate-900 dark:text-slate-50'
                }`}
              >
                {summary.activeCriticalCount}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Critical</div>
            </div>
            <div className="py-1.5 px-1 rounded-sm bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800">
              <div className="font-mono text-xl font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                {Math.max(0, summary.activeAlertCount - summary.activeCriticalCount)}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Warning</div>
            </div>
          </div>
        </div>

        {/* 4. Cold Aisle SLA & Thermal Envelope */}
        <div className="bg-white dark:bg-[#1B2026] border border-slate-200/90 dark:border-slate-800 rounded-md p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Cold Aisle SLA &amp; Thermal</span>
            <span
              className={`font-mono text-[11px] font-semibold ${
                slaCompliantHalls < bms.envSensors.length
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-[#009530] dark:text-[#3DCD58]'
              }`}
            >
              {slaCompliantHalls}/{bms.envSensors.length} SLA OK
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold text-slate-900 dark:text-slate-50 tabular-nums">
              {avgColdAisleTemp.toFixed(1)}°C
            </span>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {avgColdAisleHum.toFixed(0)}% RH
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
            <span>SLA 18–27°C · 40–60%</span>
            <span className={summary.peakExhaustTempC >= 78 ? 'text-red-700 dark:text-red-400 font-semibold' : ''}>
              Peak {summary.peakExhaustTempC.toFixed(1)}°C
            </span>
          </div>
        </div>
      </section>

      {/* Tier IV BMS Closed-Loop Integration Status Strip */}
      <section
        aria-label="BMS integration status"
        className="bg-white dark:bg-[#1B2026] border border-slate-200/90 dark:border-slate-800 rounded-md px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3"
      >
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
            <ShieldCheck className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
            {tier4.overallLabel}
          </span>
          <span aria-hidden="true" className="hidden sm:inline text-slate-300 dark:text-slate-700">|</span>
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
            <Building2 className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
            BMS 2N ({connectedGateways}/{bms.gateways.length} Gateways)
          </span>
          <span aria-hidden="true">·</span>
          <span
            className={
              bms.utilityFeed === 'Utility Outage · UPS Battery'
                ? 'text-red-700 dark:text-red-400 font-semibold'
                : bms.utilityFeed === 'Generator Backup'
                ? 'text-amber-700 dark:text-amber-400 font-medium'
                : 'text-[#009530] dark:text-[#3DCD58] font-medium'
            }
          >
            2(N+1) Power: {bms.utilityFeed}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            Chillers: {waterChillersOnline}/2 Water · {airChillersOnline}/14 Air ({totalCoolingMw.toFixed(2)} MW)
          </span>
          {boostCracs.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-amber-700 dark:text-amber-400 font-medium">
                Boost Active: {boostCracs.join(', ')}
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => onNavigateTab('bms')}
          className="inline-flex items-center gap-1 text-xs font-medium text-[#009530] dark:text-[#3DCD58] hover:underline whitespace-nowrap shrink-0 self-start md:self-auto cursor-pointer"
        >
          Open BMS Controls
          <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </section>

      {/* Dominant Focal Anchor: Live Facility Telemetry Chart */}
      <TelemetryChart
        data={facilityHistory}
        metric={chartMetric}
        onMetricChange={onChartMetricChange}
        isLive={isLive}
      />

      {/* Two-Column Operational Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left 7 cols: Priority Server Watchlist */}
        <section
          aria-label="Server Health Watchlist"
          className="lg:col-span-7 bg-white dark:bg-[#1B2026] border border-slate-200/90 dark:border-slate-800 rounded-md overflow-hidden flex flex-col"
        >
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Device Health Watchlist
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Prioritized by alarm state and exhaust thermal load
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('servers')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#009530] dark:text-[#3DCD58] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              All {summary.totalServers} Devices
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pl-5 pr-3">Asset</th>
                  <th className="py-2.5 px-3">State</th>
                  <th className="py-2.5 px-3 text-right">CPU</th>
                  <th className="py-2.5 px-3 text-right">Mem</th>
                  <th className="py-2.5 px-3 text-right">Exhaust</th>
                  <th className="py-2.5 pl-3 pr-5 text-right">Power</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                {priorityServers.map((srv) => (
                  <tr
                    key={srv.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-2.5 pl-5 pr-3">
                      <button
                        type="button"
                        onClick={() => onInspectServer(srv.id)}
                        className="text-left group cursor-pointer"
                      >
                        <div className="font-mono text-xs font-medium text-slate-900 dark:text-slate-100 group-hover:text-[#009530] dark:group-hover:text-[#3DCD58] transition-colors">
                          {srv.hostname}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {srv.rackId} · U{srv.uStart} · {srv.role}
                        </div>
                      </button>
                    </td>
                    <td className="py-2.5 px-3">
                      <NodeStatusLabel status={srv.status} />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                        {srv.cpu.toFixed(1)}%
                      </div>
                      <div className="mt-1 h-1 w-14 ml-auto bg-slate-100 dark:bg-slate-800 rounded-xs overflow-hidden">
                        <div
                          className={`h-full ${
                            srv.cpu >= 90
                              ? 'bg-red-600'
                              : srv.cpu >= 80
                              ? 'bg-amber-500'
                              : 'bg-[#009530] dark:bg-[#3DCD58]'
                          }`}
                          style={{ width: `${Math.min(100, srv.cpu)}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                      {srv.memory.toFixed(1)}%
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono text-xs tabular-nums ${
                        srv.tempC >= 78
                          ? 'text-red-700 dark:text-red-400 font-semibold'
                          : srv.tempC >= 68
                          ? 'text-amber-700 dark:text-amber-400 font-medium'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {srv.tempC.toFixed(1)}°C
                    </td>
                    <td className="py-2.5 pl-3 pr-5 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                      {srv.powerW} W
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right 5 cols: Active Automated Alerts */}
        <section
          aria-label="Active Automated Alerts"
          className="lg:col-span-5 bg-white dark:bg-[#1B2026] border border-slate-200/90 dark:border-slate-800 rounded-md overflow-hidden flex flex-col"
        >
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Active Alarm Feed
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Real-time automated dispatches &amp; incident triage
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('alerts')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#009530] dark:text-[#3DCD58] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              Alarm History
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          {openAlerts.length === 0 ? (
            <div className="p-8 text-center flex-1 flex flex-col items-center justify-center">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                All facility monitors nominal
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                No active alarms across servers or BMS infrastructure.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800/80 flex-1">
              {openAlerts.map((alert) => (
                <li key={alert.id} className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <SeverityLabel severity={alert.severity} />
                        <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                        <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                          {formatRelativeTime(alert.triggeredAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {alert.ruleName}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                        <button
                          type="button"
                          onClick={() => onInspectServer(alert.serverId)}
                          className="font-mono text-[#009530] dark:text-[#3DCD58] hover:underline cursor-pointer"
                        >
                          {alert.serverHostname}
                        </button>{' '}
                        — {alert.message}
                      </p>
                      {alert.dispatchedChannelNames.length > 0 && (
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                          Notified: {alert.dispatchedChannelNames.join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    {alert.state === 'active' ? (
                      <button
                        type="button"
                        onClick={() => onAcknowledgeAlert(alert.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Check className="w-3 h-3" aria-hidden="true" />
                        Acknowledge
                      </button>
                    ) : (
                      <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                        Ack by {alert.acknowledgedBy ?? 'Operator'}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onResolveAlert(alert.id)}
                      className="px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Resolve
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

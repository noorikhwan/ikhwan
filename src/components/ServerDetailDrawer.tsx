import { useEffect } from 'react';
import { Check, Cpu, Flame, RotateCcw, ShieldCheck, WifiOff, Wrench, X } from 'lucide-react';
import { BmcActionType, ServerBmcState } from '../engine/bmcRedfishEngine';
import { SiteId } from '../engine/sites';
import { ActiveAlert, FaultType, ServerNode } from '../engine/types';
import { ServerAssetQrCard } from './ServerAssetQrCard';
import { ServerBmcRedfishPanel } from './ServerBmcRedfishPanel';
import { formatRelativeTime, NodeStatusLabel, SeverityLabel } from './StatusIndicator';
import { MiniSparkline } from './TelemetryChart';

interface ServerDetailDrawerProps {
  server: ServerNode | null;
  siteId?: SiteId;
  siteCode?: string;
  alerts: ActiveAlert[];
  bmcState?: ServerBmcState | null;
  onExecuteBmcAction?: (serverId: string, action: BmcActionType) => void;
  onScheduleFirmwareWindow?: (server: ServerNode, driftedComponents: string[]) => void;
  onClose: () => void;
  onInjectFault: (serverId: string, fault: FaultType | null) => void;
  onToggleMaintenance: (serverId: string) => void;
  onAcknowledgeAlert: (alertId: string) => void;
  onResolveAlert: (alertId: string) => void;
}

export function ServerDetailDrawer({
  server,
  siteId = 'kl1',
  siteCode = 'KL1',
  alerts,
  bmcState,
  onExecuteBmcAction,
  onScheduleFirmwareWindow,
  onClose,
  onInjectFault,
  onToggleMaintenance,
  onAcknowledgeAlert,
  onResolveAlert,
}: ServerDetailDrawerProps) {
  useEffect(() => {
    if (!server) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [server, onClose]);

  if (!server) return null;

  const nodeAlerts = alerts.filter(
    (a) => a.serverId === server.id && (a.state === 'active' || a.state === 'acknowledged')
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-server-hostname"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/50"
    >
      <div className="w-full max-w-xl bg-white dark:bg-[#1B2026] border-l border-slate-200 dark:border-slate-800 h-full overflow-y-auto flex flex-col shadow-2xl">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4 sticky top-0 bg-white dark:bg-[#1B2026] z-10">
          <div>
            <div className="flex items-center gap-2.5">
              <h2
                id="drawer-server-hostname"
                className="font-mono text-base font-semibold text-slate-900 dark:text-slate-50"
              >
                {server.hostname}
              </h2>
              <NodeStatusLabel status={server.status} />
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {server.model} · {server.rackId} U{server.uStart}–U{server.uStart + server.uHeight - 1} ·{' '}
              <span className="font-mono">{server.ip}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close server inspector"
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-md cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 space-y-6 flex-1">
          {/* Live Sparklines Grid */}
          <div className="grid grid-cols-2 gap-3.5">
            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">CPU Load</span>
                <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {server.cpu.toFixed(1)}%
                </span>
              </div>
              <div className="mt-2">
                <MiniSparkline
                  values={server.history.map((h) => h.cpu)}
                  stroke={server.cpu >= 90 ? '#DC2626' : '#0284C7'}
                  minVal={0}
                  maxVal={100}
                />
              </div>
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">Exhaust Thermal</span>
                <span
                  className={`font-mono text-sm font-semibold tabular-nums ${
                    server.tempC >= 78 ? 'text-red-700 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {server.tempC.toFixed(1)}°C
                </span>
              </div>
              <div className="mt-2">
                <MiniSparkline
                  values={server.history.map((h) => h.tempC)}
                  stroke={server.tempC >= 78 ? '#DC2626' : '#D97706'}
                  minVal={25}
                  maxVal={95}
                />
              </div>
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">Memory Used</span>
                <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {server.memory.toFixed(1)}%
                </span>
              </div>
              <div className="mt-2">
                <MiniSparkline
                  values={server.history.map((h) => h.memory)}
                  stroke="#2563EB"
                  minVal={0}
                  maxVal={100}
                />
              </div>
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">Power Draw</span>
                <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {server.powerW} W
                </span>
              </div>
              <div className="mt-2">
                <MiniSparkline
                  values={server.history.map((h) => h.powerW)}
                  stroke="#009530"
                  minVal={200}
                  maxVal={server.ratedPowerW}
                />
              </div>
            </div>
          </div>

          {/* Field Technician QR Asset Tag */}
          <ServerAssetQrCard server={server} siteId={siteId} siteCode={siteCode} />

          {/* Hardware & Environmental Specs */}
          <div>
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 pb-2 border-b border-slate-200 dark:border-slate-800">
              Hardware &amp; Chassis Telemetry
            </h3>
            <dl className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-4 text-xs">
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Inlet Temp</dt>
                <dd className="mt-0.5 font-mono font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                  {server.inletTempC.toFixed(1)}°C
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Fan Array Speed</dt>
                <dd className="mt-0.5 font-mono font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                  {server.fanRpm.toLocaleString()} RPM
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">PSU Redundancy</dt>
                <dd className="mt-0.5 font-mono font-medium text-slate-900 dark:text-slate-100">
                  {server.psuStatus}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Fabric Throughput</dt>
                <dd className="mt-0.5 font-mono font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                  {server.networkGbps.toFixed(1)} Gbps
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Packet Loss</dt>
                <dd className="mt-0.5 font-mono font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                  {server.packetLoss.toFixed(2)}%
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Storage Volume</dt>
                <dd className="mt-0.5 font-mono font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                  {server.disk.toFixed(1)}% used
                </dd>
              </div>
            </dl>
          </div>

          {/* Out-of-Band BMC Redfish Controls & Firmware Compliance */}
          {bmcState && onExecuteBmcAction && (
            <ServerBmcRedfishPanel
              server={server}
              bmcState={bmcState}
              onExecuteBmcAction={onExecuteBmcAction}
              onScheduleFirmwareWindow={onScheduleFirmwareWindow}
            />
          )}

          {/* Live Fault Simulation & Remediation Controls */}
          <div>
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 pb-2 border-b border-slate-200 dark:border-slate-800">
              Node Operations &amp; Alert Testing
            </h3>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Trigger realistic fault conditions to verify automated threshold alerts, or stabilize the node.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onInjectFault(server.id, 'thermal_spike')}
                disabled={server.status === 'maintenance'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-100/70 dark:hover:bg-red-950/60 disabled:opacity-40 cursor-pointer"
              >
                <Flame className="w-3.5 h-3.5" aria-hidden="true" />
                Inject Thermal Spike
              </button>
              <button
                type="button"
                onClick={() => onInjectFault(server.id, 'cpu_surge')}
                disabled={server.status === 'maintenance'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100/70 dark:hover:bg-amber-950/50 disabled:opacity-40 cursor-pointer"
              >
                <Cpu className="w-3.5 h-3.5" aria-hidden="true" />
                Inject CPU Surge
              </button>
              <button
                type="button"
                onClick={() => onInjectFault(server.id, 'network_drop')}
                disabled={server.status === 'maintenance'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
              >
                <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
                Inject Packet Loss
              </button>
              <button
                type="button"
                onClick={() => onInjectFault(server.id, null)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100/70 dark:hover:bg-emerald-950/50 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                Stabilize Node
              </button>
              <button
                type="button"
                onClick={() => onToggleMaintenance(server.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
              >
                {server.status === 'maintenance' ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    Exit Maintenance
                  </>
                ) : (
                  <>
                    <Wrench className="w-3.5 h-3.5" aria-hidden="true" />
                    Maintenance Mode
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Open Alerts for this Node */}
          <div>
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 pb-2 border-b border-slate-200 dark:border-slate-800">
              Active Alerts on Node ({nodeAlerts.length})
            </h3>
            {nodeAlerts.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                No active threshold breaches on {server.hostname}.
              </p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {nodeAlerts.map((a) => (
                  <li
                    key={a.id}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <SeverityLabel severity={a.severity} />
                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {formatRelativeTime(a.triggeredAt)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs font-medium text-slate-900 dark:text-slate-100">
                      {a.ruleName}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 font-mono">
                      {a.message}
                    </div>
                    <div className="mt-2.5 flex items-center gap-2">
                      {a.state === 'active' && (
                        <button
                          type="button"
                          onClick={() => onAcknowledgeAlert(a.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                        >
                          <Check className="w-3 h-3" aria-hidden="true" />
                          Acknowledge
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onResolveAlert(a.id)}
                        className="px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                      >
                        Resolve
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Lightbulb,
  Power,
  RefreshCw,
  RotateCcw,
  Terminal,
} from 'lucide-react';
import {
  BmcActionType,
  countFirmwareDrift,
  ServerBmcState,
} from '../engine/bmcRedfishEngine';
import { ServerNode } from '../engine/types';
import { formatRelativeTime } from './StatusIndicator';

interface ServerBmcRedfishPanelProps {
  server: ServerNode;
  bmcState: ServerBmcState;
  onExecuteBmcAction: (serverId: string, action: BmcActionType) => void;
  onScheduleFirmwareWindow?: (server: ServerNode, driftedComponents: string[]) => void;
}

export function ServerBmcRedfishPanel({
  server,
  bmcState,
  onExecuteBmcAction,
  onScheduleFirmwareWindow,
}: ServerBmcRedfishPanelProps) {
  const [confirmPowerCycle, setConfirmPowerCycle] = useState(false);
  const { driftCount, securityPatchCount } = countFirmwareDrift(bmcState);
  const driftedNames = bmcState.firmware
    .filter((f) => f.status !== 'Compliant')
    .map((f) => `${f.component} (${f.currentVersion} → ${f.baselineVersion})`);

  const isOff = bmcState.powerState === 'Off';

  return (
    <section
      data-testid="server-bmc-redfish-panel"
      aria-label={`Out-of-Band BMC Redfish console for ${server.hostname}`}
      className="space-y-4"
    >
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Out-of-Band BMC &amp; Firmware (Redfish)
          </h3>
        </div>
        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
          {bmcState.protocol} · {bmcState.bmcIp}
        </span>
      </div>

      {/* Remote Chassis Controls: Locate LED + Power Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="bmc-locate-led-btn"
          aria-pressed={bmcState.locateLedOn}
          onClick={() => onExecuteBmcAction(server.id, 'toggle_locate_led')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
            bmcState.locateLedOn
              ? 'border-blue-500 bg-blue-600 text-white hover:bg-blue-700'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          <Lightbulb className="w-3.5 h-3.5" aria-hidden="true" />
          {bmcState.locateLedOn ? 'Locate LED: Blinking Blue' : 'Blink Locate LED'}
        </button>

        {!isOff ? (
          <>
            <button
              type="button"
              data-testid="bmc-graceful-restart-btn"
              onClick={() => onExecuteBmcAction(server.id, 'graceful_restart')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              Graceful Restart
            </button>

            {confirmPowerCycle ? (
              <div className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="bmc-confirm-power-cycle-btn"
                  onClick={() => {
                    onExecuteBmcAction(server.id, 'power_cycle');
                    setConfirmPowerCycle(false);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-red-600 hover:bg-red-700 text-white cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  Confirm Cold Cycle
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmPowerCycle(false)}
                  className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-testid="bmc-power-cycle-btn"
                onClick={() => setConfirmPowerCycle(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100/70 dark:hover:bg-amber-950/50 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                Cold Power Cycle
              </button>
            )}

            <button
              type="button"
              data-testid="bmc-shutdown-btn"
              onClick={() => onExecuteBmcAction(server.id, 'graceful_shutdown')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-100/70 dark:hover:bg-red-950/60 cursor-pointer whitespace-nowrap"
            >
              <Power className="w-3.5 h-3.5" aria-hidden="true" />
              Graceful Shutdown
            </button>
          </>
        ) : (
          <button
            type="button"
            data-testid="bmc-power-on-btn"
            onClick={() => onExecuteBmcAction(server.id, 'power_on')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white cursor-pointer whitespace-nowrap"
          >
            <Power className="w-3.5 h-3.5" aria-hidden="true" />
            Power On Chassis
          </button>
        )}
      </div>

      {/* Live Power State Summary Line */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
        <span>
          Chassis Power State:{' '}
          <strong
            data-testid="bmc-power-state-label"
            className={`font-mono ${
              bmcState.powerState === 'Off'
                ? 'text-red-600 dark:text-red-400'
                : bmcState.powerState === 'On'
                ? 'text-[#007A27] dark:text-[#3DCD58]'
                : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {bmcState.powerState}
          </strong>
        </span>
        {bmcState.locateLedOn && (
          <span
            data-testid="bmc-locate-active-note"
            className="font-mono text-[11px] font-semibold text-blue-600 dark:text-blue-400"
          >
            Beacon synced to Rack Map ({server.rackId}) &amp; 3D View
          </span>
        )}
      </div>

      {/* Firmware Compliance Matrix */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
            Firmware Compliance ·{' '}
            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
              {driftCount + securityPatchCount === 0
                ? 'All baseline verified'
                : `${driftCount} drift · ${securityPatchCount} security patch`}
            </span>
          </span>
          {driftedNames.length > 0 && onScheduleFirmwareWindow && (
            <button
              type="button"
              data-testid="bmc-schedule-fw-btn"
              disabled={Boolean(bmcState.scheduledFirmwareWindowId)}
              onClick={() => onScheduleFirmwareWindow(server, driftedNames)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <CalendarClock className="w-3 h-3 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
              {bmcState.scheduledFirmwareWindowId ? 'Maintenance Window Scheduled' : 'Schedule FW Window'}
            </button>
          )}
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-md">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-[11px] text-slate-500 dark:text-slate-400">
                <th className="py-1.5 px-2.5 font-medium">Subsystem</th>
                <th className="py-1.5 px-2.5 font-medium">Installed</th>
                <th className="py-1.5 px-2.5 font-medium">Baseline</th>
                <th className="py-1.5 px-2.5 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/80">
              {bmcState.firmware.map((fw) => (
                <tr key={fw.component} className="bg-white dark:bg-[#1B2026]">
                  <td className="py-1.5 px-2.5 font-medium text-slate-800 dark:text-slate-200">
                    {fw.component}
                  </td>
                  <td className="py-1.5 px-2.5 font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-300">
                    {fw.currentVersion}
                  </td>
                  <td className="py-1.5 px-2.5 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                    {fw.baselineVersion}
                  </td>
                  <td className="py-1.5 px-2.5 text-right whitespace-nowrap">
                    {fw.status === 'Compliant' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#007A27] dark:text-[#3DCD58]">
                        <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                        Compliant
                      </span>
                    ) : fw.status === 'Security Patch' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 dark:text-red-400">
                        <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                        Security Patch
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                        Drift
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hardware System Event Log (SEL) */}
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
          Hardware System Event Log (SEL · {bmcState.selLog.length})
        </div>
        <ul
          data-testid="bmc-sel-list"
          className="divide-y divide-slate-200/70 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-md bg-slate-50/40 dark:bg-slate-950/40"
        >
          {bmcState.selLog.slice(0, 5).map((entry) => (
            <li key={entry.id} className="px-3 py-2 text-[11px] space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                  {entry.sensor}
                  {entry.actor ? ` · ${entry.actor}` : ''}
                </span>
                <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                  {formatRelativeTime(entry.timestamp)}
                </span>
              </div>
              <div
                className={
                  entry.severity === 'Critical'
                    ? 'text-red-700 dark:text-red-400'
                    : entry.severity === 'Warning'
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-slate-600 dark:text-slate-400'
                }
              >
                {entry.message}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

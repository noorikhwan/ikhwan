import { ServerNode } from './types';

export type BmcPowerState = 'On' | 'GracefulRestarting' | 'PowerCycling' | 'Off';

export type BmcActionType =
  | 'toggle_locate_led'
  | 'graceful_restart'
  | 'power_cycle'
  | 'graceful_shutdown'
  | 'power_on';

export interface FirmwareComponent {
  component: 'BIOS / UEFI' | 'BMC / Out-of-Band' | 'NIC / SmartNIC' | 'NVMe / RAID Controller';
  currentVersion: string;
  baselineVersion: string;
  status: 'Compliant' | 'Drift' | 'Security Patch';
  releaseDate: string;
}

export interface BmcSelEntry {
  id: string;
  timestamp: number;
  severity: 'OK' | 'Warning' | 'Critical';
  sensor: string;
  message: string;
  actor?: string;
}

export interface ServerBmcState {
  serverId: string;
  protocol: 'Redfish v1.19 (iDRAC 9)' | 'Redfish v1.18 (iLO 6)' | 'Redfish v1.19 (OpenBMC)';
  bmcIp: string;
  locateLedOn: boolean;
  powerState: BmcPowerState;
  firmware: FirmwareComponent[];
  selLog: BmcSelEntry[];
  scheduledFirmwareWindowId: string | null;
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function deriveBmcProtocol(model: string): ServerBmcState['protocol'] {
  const lower = model.toLowerCase();
  if (lower.includes('dell')) return 'Redfish v1.19 (iDRAC 9)';
  if (lower.includes('hpe') || lower.includes('proliant')) return 'Redfish v1.18 (iLO 6)';
  return 'Redfish v1.19 (OpenBMC)';
}

function deriveBmcIp(mgmtIp: string): string {
  const parts = mgmtIp.split('.');
  if (parts.length !== 4) return '172.30.1.10';
  return `172.30.${parts[2]}.${parts[3]}`;
}

export function createInitialServerBmcState(
  server: ServerNode,
  now: number = Date.now()
): ServerBmcState {
  const seed = hashSeed(server.id + server.hostname);
  const hasBiosDrift = seed % 2 === 0 || server.status === 'critical';
  const hasBmcSecurityPatch = seed % 3 === 0 || server.role === 'GPU Inference';
  const hasNicDrift = seed % 4 === 1;

  const firmware: FirmwareComponent[] = [
    {
      component: 'BIOS / UEFI',
      currentVersion: hasBiosDrift ? '2.4.1' : '2.6.0',
      baselineVersion: '2.6.0',
      status: hasBiosDrift ? 'Drift' : 'Compliant',
      releaseDate: '2026-09-14',
    },
    {
      component: 'BMC / Out-of-Band',
      currentVersion: hasBmcSecurityPatch ? '7.10.30.00' : '7.10.50.10',
      baselineVersion: '7.10.50.10',
      status: hasBmcSecurityPatch ? 'Security Patch' : 'Compliant',
      releaseDate: '2026-10-28',
    },
    {
      component: 'NIC / SmartNIC',
      currentVersion: hasNicDrift ? '28.39.1002' : '28.41.1000',
      baselineVersion: '28.41.1000',
      status: hasNicDrift ? 'Drift' : 'Compliant',
      releaseDate: '2026-08-22',
    },
    {
      component: 'NVMe / RAID Controller',
      currentVersion: '52.28.0-5182',
      baselineVersion: '52.28.0-5182',
      status: 'Compliant',
      releaseDate: '2026-07-09',
    },
  ];

  const selLog: BmcSelEntry[] = [
    {
      id: `sel-${server.id}-1`,
      timestamp: now - 1000 * 60 * 14,
      severity: server.tempC >= 75 ? 'Critical' : server.tempC >= 65 ? 'Warning' : 'OK',
      sensor: 'Thermal · Exhaust',
      message:
        server.tempC >= 75
          ? `Exhaust sensor asserted Upper Critical (${server.tempC.toFixed(1)}°C); fan array ramped to ${server.fanRpm.toLocaleString()} RPM`
          : `Redfish telemetry poll nominal · Exhaust ${server.tempC.toFixed(1)}°C · Inlet ${server.inletTempC.toFixed(1)}°C`,
    },
    {
      id: `sel-${server.id}-2`,
      timestamp: now - 1000 * 60 * 48,
      severity: server.psuStatus === 'Degraded (1/2)' ? 'Warning' : 'OK',
      sensor: 'Power Supply 2N',
      message:
        server.psuStatus === 'Degraded (1/2)'
          ? 'PSU-B input lost — chassis running on single redundant feed PSU-A'
          : 'Dual redundant PSU-A/PSU-B load sharing balanced within 2.5%',
    },
    {
      id: `sel-${server.id}-3`,
      timestamp: now - 1000 * 60 * 180,
      severity: hasBmcSecurityPatch ? 'Warning' : 'OK',
      sensor: 'Firmware Compliance',
      message: hasBmcSecurityPatch
        ? 'Out-of-band BMC security advisory CVE-2026-4112 pending maintenance window'
        : 'All chassis firmware hashes verified against site golden baseline',
    },
  ];

  return {
    serverId: server.id,
    protocol: deriveBmcProtocol(server.model),
    bmcIp: deriveBmcIp(server.ip),
    locateLedOn: false,
    powerState: 'On',
    firmware,
    selLog,
    scheduledFirmwareWindowId: null,
  };
}

export function countFirmwareDrift(state: ServerBmcState): {
  driftCount: number;
  securityPatchCount: number;
} {
  let driftCount = 0;
  let securityPatchCount = 0;
  for (const fw of state.firmware) {
    if (fw.status === 'Drift') driftCount += 1;
    if (fw.status === 'Security Patch') securityPatchCount += 1;
  }
  return { driftCount, securityPatchCount };
}

export function applyBmcAction(
  state: ServerBmcState,
  action: BmcActionType,
  actor: string,
  now: number = Date.now()
): ServerBmcState {
  const entryId = `sel-${state.serverId}-${now.toString(36)}-${Math.floor(Math.random() * 1000)}`;

  if (action === 'toggle_locate_led') {
    const nextLed = !state.locateLedOn;
    return {
      ...state,
      locateLedOn: nextLed,
      selLog: [
        {
          id: entryId,
          timestamp: now,
          severity: 'OK' as const,
          sensor: 'Chassis Identify LED',
          message: nextLed
            ? 'Identify Locate LED activated (Blinking Blue on Rack Map & 3D Twin)'
            : 'Identify Locate LED turned OFF',
          actor,
        },
        ...state.selLog,
      ].slice(0, 12),
    };
  }

  if (action === 'graceful_restart') {
    return {
      ...state,
      powerState: 'GracefulRestarting',
      selLog: [
        {
          id: entryId,
          timestamp: now,
          severity: 'Warning' as const,
          sensor: 'Redfish Power Control',
          message: 'POST /redfish/v1/Systems/1/Actions/ComputerSystem.Reset (GracefulRestart) accepted',
          actor,
        },
        ...state.selLog,
      ].slice(0, 12),
    };
  }

  if (action === 'power_cycle') {
    return {
      ...state,
      powerState: 'PowerCycling',
      selLog: [
        {
          id: entryId,
          timestamp: now,
          severity: 'Warning' as const,
          sensor: 'Redfish Power Control',
          message: 'Cold PowerCycle command issued via Out-of-Band BMC controller',
          actor,
        },
        ...state.selLog,
      ].slice(0, 12),
    };
  }

  if (action === 'graceful_shutdown') {
    return {
      ...state,
      powerState: 'Off',
      selLog: [
        {
          id: entryId,
          timestamp: now,
          severity: 'Warning' as const,
          sensor: 'Redfish Power Control',
          message: 'GracefulShutdown completed — chassis in standby auxiliary power',
          actor,
        },
        ...state.selLog,
      ].slice(0, 12),
    };
  }

  return {
    ...state,
    powerState: 'On',
    selLog: [
      {
        id: entryId,
        timestamp: now,
        severity: 'OK' as const,
        sensor: 'Redfish Power Control',
        message: 'PowerOn command issued — chassis POST complete and online',
        actor,
      },
      ...state.selLog,
    ].slice(0, 12),
  };
}

import {
  ActiveAlert,
  DispatchLogEntry,
  HallId,
  NotificationChannel,
  ServerNode,
} from './types';
import {
  BmsCommandLogEntry,
  BmsProtocol,
  BmsState,
  ChillerUnit,
  ChwTankPumpSet,
  CracMode,
  CracUnit,
  DieselTankUnit,
  ElectricalSwitchgearNode,
  SlaComplianceStatus,
  Tier4RedundancySummary,
  Tier4SubsystemStatus,
} from './bmsTypes';

export const COLD_AISLE_SLA_LIMITS = {
  tempMinC: 18.0,
  tempMaxC: 27.0,
  humidityMinPct: 40.0,
  humidityMaxPct: 60.0,
} as const;

export function computeDewPointC(tempC: number, humidityPct: number): number {
  const rh = clamp(humidityPct, 5, 100);
  const a = 17.27;
  const b = 237.7;
  const gamma = (a * tempC) / (b + tempC) + Math.log(rh / 100);
  return Number(((b * gamma) / (a - gamma)).toFixed(1));
}

export function evaluateSlaMetricStatus(
  value: number,
  min: number,
  max: number,
  warnMargin: number
): SlaComplianceStatus {
  if (value < min || value > max) return 'Breached';
  if (value <= min + warnMargin || value >= max - warnMargin) return 'Warning';
  return 'Compliant';
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function isProtocolOnline(bms: BmsState, protocol: BmsProtocol): boolean {
  const matching = bms.gateways.filter((g) => g.protocol === protocol);
  if (matching.length === 0) return true;
  return matching.some((g) => g.connected);
}

export function createInitialBmsState(now = Date.now()): BmsState {
  return {
    tierCertification: 'Uptime Institute Tier IV · Fault-Tolerant',
    utilityFeed: 'Utility Normal',
    utilityFeedAOnline: true,
    utilityFeedBOnline: true,
    outageTicksElapsed: 0,
    closedLoopCoolingEnabled: true,
    // Central Chiller Plant per site: 2 Water-Cooled Centrifugal Chillers (2N) + 14 Air-Cooled Free-Cooling Chillers (2(5+2 N+1))
    chillers: [
      {
        id: 'chw-01',
        name: 'CHW-01 · Water Chiller A',
        chillerType: 'Water-Cooled',
        redundancyPath: 'Path A',
        chilledLoop: 'Loop A',
        role: 'Primary',
        protocol: 'BACnet/IP',
        endpoint: '10.60.15.11:47808',
        deviceId: 'CHW-101A',
        mode: 'Running',
        coolingOutputKw: 5640.0,
        capacityKw: 12000.0,
        chwSupplyTempC: 7.2,
        chwReturnTempC: 13.4,
        condenserOrAmbientTempC: 29.4,
        compressorLoadPct: 47,
        cop: 6.4,
        waterFlowLps: 218,
        fanSpeedPct: 54,
        status: 'nominal',
      },
      {
        id: 'chw-02',
        name: 'CHW-02 · Water Chiller B',
        chillerType: 'Water-Cooled',
        redundancyPath: 'Path B',
        chilledLoop: 'Loop B',
        role: 'Primary',
        protocol: 'BACnet/IP',
        endpoint: '10.60.15.12:47808',
        deviceId: 'CHW-101B',
        mode: 'Running',
        coolingOutputKw: 5580.0,
        capacityKw: 12000.0,
        chwSupplyTempC: 7.3,
        chwReturnTempC: 13.5,
        condenserOrAmbientTempC: 29.6,
        compressorLoadPct: 46,
        cop: 6.3,
        waterFlowLps: 215,
        fanSpeedPct: 53,
        status: 'nominal',
      },
      {
        id: 'cha-a1',
        name: 'CHA-A1 · Air Chiller A1',
        chillerType: 'Air-Cooled',
        redundancyPath: 'Path A',
        chilledLoop: 'Loop A',
        role: 'Primary',
        protocol: 'BACnet/IP',
        endpoint: '10.60.15.21:47808',
        deviceId: 'CHA-201A',
        mode: 'Running',
        coolingOutputKw: 2120.0,
        capacityKw: 4800.0,
        chwSupplyTempC: 7.5,
        chwReturnTempC: 13.2,
        condenserOrAmbientTempC: 31.8,
        compressorLoadPct: 44,
        cop: 3.9,
        waterFlowLps: 0,
        fanSpeedPct: 58,
        status: 'nominal',
      },
      {
        id: 'cha-a2',
        name: 'CHA-A2 · Air Chiller A2',
        chillerType: 'Air-Cooled',
        redundancyPath: 'Path A',
        chilledLoop: 'Loop A',
        role: 'Primary',
        protocol: 'BACnet/IP',
        endpoint: '10.60.15.22:47808',
        deviceId: 'CHA-202A',
        mode: 'Running',
        coolingOutputKw: 2100.0,
        capacityKw: 4800.0,
        chwSupplyTempC: 7.6,
        chwReturnTempC: 13.3,
        condenserOrAmbientTempC: 31.9,
        compressorLoadPct: 44,
        cop: 3.8,
        waterFlowLps: 0,
        fanSpeedPct: 57,
        status: 'nominal',
      },
      {
        id: 'cha-a3',
        name: 'CHA-A3 · Air Chiller A3',
        chillerType: 'Air-Cooled',
        redundancyPath: 'Path A',
        chilledLoop: 'Loop A',
        role: 'Redundant (N+1)',
        protocol: 'BACnet/IP',
        endpoint: '10.60.15.23:47808',
        deviceId: 'CHA-203A',
        mode: 'Standby',
        coolingOutputKw: 0.0,
        capacityKw: 4800.0,
        chwSupplyTempC: 8.2,
        chwReturnTempC: 12.1,
        condenserOrAmbientTempC: 31.6,
        compressorLoadPct: 0,
        cop: 4.0,
        waterFlowLps: 0,
        fanSpeedPct: 12,
        status: 'nominal',
      },
      {
        id: 'cha-a4',
        name: 'CHA-A4 · Air Chiller A4',
        chillerType: 'Air-Cooled',
        redundancyPath: 'Path A',
        chilledLoop: 'Loop A',
        role: 'Primary',
        protocol: 'BACnet/IP',
        endpoint: '10.60.15.24:47808',
        deviceId: 'CHA-204A',
        mode: 'Running',
        coolingOutputKw: 1960.0,
        capacityKw: 4800.0,
        chwSupplyTempC: 7.5,
        chwReturnTempC: 13.2,
        condenserOrAmbientTempC: 31.7,
        compressorLoadPct: 41,
        cop: 3.9,
        waterFlowLps: 0,
        fanSpeedPct: 55,
        status: 'nominal',
      },
      {
        id: 'cha-a5',
        name: 'CHA-A5 · Air Chiller A5',
        chillerType: 'Air-Cooled',
        redundancyPath: 'Path A',
        chilledLoop: 'Loop A',
        role: 'Primary',
        protocol: 'BACnet/IP',
        endpoint: '10.60.15.25:47808',
        deviceId: 'CHA-205A',
        mode: 'Running',
        coolingOutputKw: 1940.0,
        capacityKw: 4800.0,
        chwSupplyTempC: 7.6,
        chwReturnTempC: 13.3,
        condenserOrAmbientTempC: 31.8,
        compressorLoadPct: 40,
        cop: 3.9,
        waterFlowLps: 0,
        fanSpeedPct: 54,
        status: 'nominal',
      },
      {
        id: 'cha-a6',
        name: 'CHA-A6 · Air Chiller A6',
        chillerType: 'Air-Cooled',
        redundancyPath: 'Path A',
        chilledLoop: 'Loop A',
        role: 'Primary',
        protocol: 'BACnet/IP',
        endpoint: '10.60.15.26:47808',
        deviceId: 'CHA-206A',
        mode: 'Running',
        coolingOutputKw: 1920.0,
        capacityKw: 4800.0,
        chwSupplyTempC: 7.5,
        chwReturnTempC: 13.2,
        condenserOrAmbientTempC: 31.7,
        compressorLoadPct: 40,
        cop: 3.9,
        waterFlowLps: 0,
        fanSpeedPct: 54,
        status: 'nominal',
      },
      {
        id: 'cha-a7',
        name: 'CHA-A7 · Air Chiller A7',
        chillerType: 'Air-Cooled',
        redundancyPath: 'Path A',
        chilledLoop: 'Loop A',
        role: 'Redundant (N+1)',
        protocol: 'BACnet/IP',
        endpoint: '10.60.15.27:47808',
        deviceId: 'CHA-207A',
        mode: 'Standby',
        coolingOutputKw: 0.0,
        capacityKw: 4800.0,
        chwSupplyTempC: 8.2,
        chwReturnTempC: 12.1,
        condenserOrAmbientTempC: 31.5,
        compressorLoadPct: 0,
        cop: 4.0,
        waterFlowLps: 0,
        fanSpeedPct: 12,
        status: 'nominal',
      },
      {
        id: 'cha-b1',
        name: 'CHA-B1 · Air Chiller B1',
        chillerType: 'Air-Cooled',
        redundancyPath: 'Path B',
        chilledLoop: 'Loop B',
        role: 'Primary',
        protocol: 'BACnet/IP',
        endpoint: '10.60.15.31:47808',
        deviceId: 'CHA-201B',
        mode: 'Running',
        coolingOutputKw: 2080.0,
        capacityKw: 4800.0,
        chwSupplyTempC: 7.5,
        chwReturnTempC: 13.1,
        condenserOrAmbientTempC: 31.7,
        compressorLoadPct: 43,
        cop: 3.9,
        waterFlowLps: 0,
        fanSpeedPct: 56,
        status: 'nominal',
      },
      {
        id: 'cha-b2',
        name: 'CHA-B2 · Air Chiller B2',
        chillerType: 'Air-Cooled',
        redundancyPath: 'Path B',
        chilledLoop: 'Loop B',
        role: 'Primary',
        protocol: 'BACnet/IP',
        endpoint: '10.60.15.32:47808',
        deviceId: 'CHA-202B',
        mode: 'Running',
        coolingOutputKw: 2070.0,
        capacityKw: 4800.0,
        chwSupplyTempC: 7.6,
        chwReturnTempC: 13.2,
        condenserOrAmbientTempC: 31.8,
        compressorLoadPct: 43,
        cop: 3.8,
        waterFlowLps: 0,
        fanSpeedPct: 56,
        status: 'nominal',
      },
      {
        id: 'cha-b3',
        name: 'CHA-B3 · Air Chiller B3',
        chillerType: 'Air-Cooled',
        redundancyPath: 'Path B',
        chilledLoop: 'Loop B',
        role: 'Redundant (N+1)',
        protocol: 'BACnet/IP',
        endpoint: '10.60.15.33:47808',
        deviceId: 'CHA-203B',
        mode: 'Standby',
        coolingOutputKw: 0.0,
        capacityKw: 4800.0,
        chwSupplyTempC: 8.2,
        chwReturnTempC: 12.0,
        condenserOrAmbientTempC: 31.5,
        compressorLoadPct: 0,
        cop: 4.0,
        waterFlowLps: 0,
        fanSpeedPct: 12,
        status: 'nominal',
      },
      {
        id: 'cha-b4',
        name: 'CHA-B4 · Air Chiller B4',
        chillerType: 'Air-Cooled',
        redundancyPath: 'Path B',
        chilledLoop: 'Loop B',
        role: 'Primary',
        protocol: 'BACnet/IP',
        endpoint: '10.60.15.34:47808',
        deviceId: 'CHA-204B',
        mode: 'Running',
        coolingOutputKw: 1950.0,
        capacityKw: 4800.0,
        chwSupplyTempC: 7.5,
        chwReturnTempC: 13.1,
        condenserOrAmbientTempC: 31.6,
        compressorLoadPct: 41,
        cop: 3.9,
        waterFlowLps: 0,
        fanSpeedPct: 55,
        status: 'nominal',
      },
      {
        id: 'cha-b5',
        name: 'CHA-B5 · Air Chiller B5',
        chillerType: 'Air-Cooled',
        redundancyPath: 'Path B',
        chilledLoop: 'Loop B',
        role: 'Primary',
        protocol: 'BACnet/IP',
        endpoint: '10.60.15.35:47808',
        deviceId: 'CHA-205B',
        mode: 'Running',
        coolingOutputKw: 1930.0,
        capacityKw: 4800.0,
        chwSupplyTempC: 7.6,
        chwReturnTempC: 13.2,
        condenserOrAmbientTempC: 31.7,
        compressorLoadPct: 40,
        cop: 3.9,
        waterFlowLps: 0,
        fanSpeedPct: 54,
        status: 'nominal',
      },
      {
        id: 'cha-b6',
        name: 'CHA-B6 · Air Chiller B6',
        chillerType: 'Air-Cooled',
        redundancyPath: 'Path B',
        chilledLoop: 'Loop B',
        role: 'Primary',
        protocol: 'BACnet/IP',
        endpoint: '10.60.15.36:47808',
        deviceId: 'CHA-206B',
        mode: 'Running',
        coolingOutputKw: 1910.0,
        capacityKw: 4800.0,
        chwSupplyTempC: 7.5,
        chwReturnTempC: 13.1,
        condenserOrAmbientTempC: 31.6,
        compressorLoadPct: 40,
        cop: 3.9,
        waterFlowLps: 0,
        fanSpeedPct: 54,
        status: 'nominal',
      },
      {
        id: 'cha-b7',
        name: 'CHA-B7 · Air Chiller B7',
        chillerType: 'Air-Cooled',
        redundancyPath: 'Path B',
        chilledLoop: 'Loop B',
        role: 'Redundant (N+1)',
        protocol: 'BACnet/IP',
        endpoint: '10.60.15.37:47808',
        deviceId: 'CHA-207B',
        mode: 'Standby',
        coolingOutputKw: 0.0,
        capacityKw: 4800.0,
        chwSupplyTempC: 8.2,
        chwReturnTempC: 12.0,
        condenserOrAmbientTempC: 31.4,
        compressorLoadPct: 0,
        cop: 4.0,
        waterFlowLps: 0,
        fanSpeedPct: 12,
        status: 'nominal',
      },
    ],
    // Rooftop Water Chiller Plant Square Thermal Buffer Tanks (2 x 180,000 L = 360,000 L) + Complete VFD Pump Sets (2 x 3-Pump N+1)
    chwTankPumpSets: [
      {
        id: 'chw-tank-a',
        name: 'CHW-TANK-A · 180kL Square Buffer Tank & Pump Set A',
        chilledLoop: 'Loop A',
        redundancyPath: 'Path A',
        servedChillerId: 'chw-01',
        protocol: 'BACnet/IP',
        endpoint: '10.60.15.41:47808',
        tankCapacityLiters: 180000,
        tankLevelPct: 96.4,
        waterTempC: 7.2,
        bufferAutonomyMin: 18,
        activePumps: 2,
        totalPumps: 3,
        pumpConfigLabel: '2+1 VFD Centrifugal Pump Skid (3×110 kW)',
        flowRateLps: 218,
        dischargePressureBar: 4.3,
        vfdSpeedPct: 68,
        pumpPowerKw: 142.0,
        mode: 'Auto',
        status: 'nominal',
      },
      {
        id: 'chw-tank-b',
        name: 'CHW-TANK-B · 180kL Square Buffer Tank & Pump Set B',
        chilledLoop: 'Loop B',
        redundancyPath: 'Path B',
        servedChillerId: 'chw-02',
        protocol: 'BACnet/IP',
        endpoint: '10.60.15.42:47808',
        tankCapacityLiters: 180000,
        tankLevelPct: 95.8,
        waterTempC: 7.3,
        bufferAutonomyMin: 18,
        activePumps: 2,
        totalPumps: 3,
        pumpConfigLabel: '2+1 VFD Centrifugal Pump Skid (3×110 kW)',
        flowRateLps: 215,
        dischargePressureBar: 4.2,
        vfdSpeedPct: 67,
        pumpPowerKw: 139.0,
        mode: 'Auto',
        status: 'nominal',
      },
    ],
    // Certified Tier IV 2N Fault-Tolerant Cooling: Halls A/C/D Air CRACs + Hall B Direct-to-Chip Liquid Cooling CDU (CDU-B1/B2)
    cracUnits: [
      {
        id: 'crac-a1',
        name: 'CRAC-A1',
        coolingType: 'CRAC',
        hallId: 'hall-a',
        hallLabel: 'Hall A · Core Compute',
        redundancyPath: 'Path A',
        chilledLoop: 'Loop A',
        peerCracId: 'crac-a2',
        protocol: 'BACnet/IP',
        endpoint: '10.60.10.11:47808',
        deviceId: 'BAC-4101A',
        mode: 'Auto',
        setpointC: 20.5,
        supplyTempC: 20.6,
        returnTempC: 31.8,
        humidityPct: 46.2,
        fanSpeedPct: 58,
        chilledWaterValvePct: 50,
        coolingOutputKw: 1840.0,
        maxCoolingKw: 4800.0,
        status: 'nominal',
      },
      {
        id: 'crac-a2',
        name: 'CRAC-A2',
        coolingType: 'CRAC',
        hallId: 'hall-a',
        hallLabel: 'Hall A · Core Compute',
        redundancyPath: 'Path B',
        chilledLoop: 'Loop B',
        peerCracId: 'crac-a1',
        protocol: 'BACnet/IP',
        endpoint: '10.60.10.21:47808',
        deviceId: 'BAC-4101B',
        mode: 'Auto',
        setpointC: 20.5,
        supplyTempC: 20.5,
        returnTempC: 31.5,
        humidityPct: 46.0,
        fanSpeedPct: 56,
        chilledWaterValvePct: 49,
        coolingOutputKw: 1810.0,
        maxCoolingKw: 4800.0,
        status: 'nominal',
      },
      {
        id: 'crac-b1',
        name: 'CDU-B1',
        coolingType: 'Liquid CDU',
        hallId: 'hall-b',
        hallLabel: 'Hall B · AI & GPU Fabric (Liquid CDU)',
        redundancyPath: 'Path A',
        chilledLoop: 'Loop A',
        peerCracId: 'crac-b2',
        protocol: 'BACnet/IP',
        endpoint: '10.60.10.12:47808',
        deviceId: 'CDU-4102A',
        mode: 'Boost',
        setpointC: 19.0,
        supplyTempC: 20.4,
        returnTempC: 34.8,
        humidityPct: 44.8,
        fanSpeedPct: 86,
        chilledWaterValvePct: 82,
        coolingOutputKw: 3860.0,
        maxCoolingKw: 8800.0,
        coolantFlowLpm: 1440,
        coolantSupplyTempC: 24.4,
        coolantReturnTempC: 36.8,
        deltaPBar: 1.85,
        glycolMixPct: 25,
        heatExchangerEffPct: 94.8,
        status: 'warning',
      },
      {
        id: 'crac-b2',
        name: 'CDU-B2',
        coolingType: 'Liquid CDU',
        hallId: 'hall-b',
        hallLabel: 'Hall B · AI & GPU Fabric (Liquid CDU)',
        redundancyPath: 'Path B',
        chilledLoop: 'Loop B',
        peerCracId: 'crac-b1',
        protocol: 'BACnet/IP',
        endpoint: '10.60.10.22:47808',
        deviceId: 'CDU-4102B',
        mode: 'Boost',
        setpointC: 19.0,
        supplyTempC: 20.2,
        returnTempC: 34.4,
        humidityPct: 44.9,
        fanSpeedPct: 84,
        chilledWaterValvePct: 80,
        coolingOutputKw: 3820.0,
        maxCoolingKw: 8800.0,
        coolantFlowLpm: 1410,
        coolantSupplyTempC: 24.2,
        coolantReturnTempC: 36.4,
        deltaPBar: 1.82,
        glycolMixPct: 25,
        heatExchangerEffPct: 94.6,
        status: 'warning',
      },
      {
        id: 'crac-c1',
        name: 'CRAC-C1',
        coolingType: 'CRAC',
        hallId: 'hall-c',
        hallLabel: 'Hall C · Storage & Edge',
        redundancyPath: 'Path A',
        chilledLoop: 'Loop A',
        peerCracId: 'crac-c2',
        protocol: 'BACnet/IP',
        endpoint: '10.60.10.13:47808',
        deviceId: 'BAC-4103A',
        mode: 'Auto',
        setpointC: 21.0,
        supplyTempC: 20.9,
        returnTempC: 29.4,
        humidityPct: 47.5,
        fanSpeedPct: 52,
        chilledWaterValvePct: 45,
        coolingOutputKw: 1920.0,
        maxCoolingKw: 5600.0,
        status: 'nominal',
      },
      {
        id: 'crac-c2',
        name: 'CRAC-C2',
        coolingType: 'CRAC',
        hallId: 'hall-c',
        hallLabel: 'Hall C · Storage & Edge',
        redundancyPath: 'Path B',
        chilledLoop: 'Loop B',
        peerCracId: 'crac-c1',
        protocol: 'BACnet/IP',
        endpoint: '10.60.10.23:47808',
        deviceId: 'BAC-4103B',
        mode: 'Auto',
        setpointC: 21.0,
        supplyTempC: 20.8,
        returnTempC: 29.2,
        humidityPct: 47.3,
        fanSpeedPct: 51,
        chilledWaterValvePct: 44,
        coolingOutputKw: 1890.0,
        maxCoolingKw: 5600.0,
        status: 'nominal',
      },
      {
        id: 'crac-d1',
        name: 'CRAC-D1',
        coolingType: 'CRAC',
        hallId: 'hall-d',
        hallLabel: 'Hall D · Cloud & Interconnect',
        redundancyPath: 'Path A',
        chilledLoop: 'Loop A',
        peerCracId: 'crac-d2',
        protocol: 'BACnet/IP',
        endpoint: '10.60.10.14:47808',
        deviceId: 'BAC-4104A',
        mode: 'Auto',
        setpointC: 20.5,
        supplyTempC: 20.7,
        returnTempC: 31.2,
        humidityPct: 45.8,
        fanSpeedPct: 57,
        chilledWaterValvePct: 50,
        coolingOutputKw: 2240.0,
        maxCoolingKw: 6400.0,
        status: 'nominal',
      },
      {
        id: 'crac-d2',
        name: 'CRAC-D2',
        coolingType: 'CRAC',
        hallId: 'hall-d',
        hallLabel: 'Hall D · Cloud & Interconnect',
        redundancyPath: 'Path B',
        chilledLoop: 'Loop B',
        peerCracId: 'crac-d1',
        protocol: 'BACnet/IP',
        endpoint: '10.60.10.24:47808',
        deviceId: 'BAC-4104B',
        mode: 'Auto',
        setpointC: 20.5,
        supplyTempC: 20.6,
        returnTempC: 31.0,
        humidityPct: 45.7,
        fanSpeedPct: 56,
        chilledWaterValvePct: 49,
        coolingOutputKw: 2210.0,
        maxCoolingKw: 6400.0,
        status: 'nominal',
      },
    ],
    // Basement Level B1 Bulk Diesel Fuel Vault: 8 Double-Walled UL-2085 Tanks (8 x 50,000 L = 400,000 L) supplying GEN-A1–A4 & GEN-B1–B4
    dieselTanks: [
      {
        id: 'diesel-a1',
        name: 'FUEL-TANK-A1',
        vaultZone: 'Basement B1 · Path A Vault',
        redundancyPath: 'Path A',
        feedBus: 'Bus A',
        servedGenerators: ['GEN-A1'],
        capacityLiters: 50000,
        currentLiters: 48200,
        levelPct: 96.4,
        fuelTempC: 26.8,
        supplyPressureBar: 2.1,
        transferPumpMode: 'Auto Standby',
        interstitialLeakDetected: false,
        protocol: 'Modbus TCP',
        endpoint: '10.60.25.11:502',
        status: 'nominal',
      },
      {
        id: 'diesel-a2',
        name: 'FUEL-TANK-A2',
        vaultZone: 'Basement B1 · Path A Vault',
        redundancyPath: 'Path A',
        feedBus: 'Bus A',
        servedGenerators: ['GEN-A2'],
        capacityLiters: 50000,
        currentLiters: 48600,
        levelPct: 97.2,
        fuelTempC: 26.6,
        supplyPressureBar: 2.1,
        transferPumpMode: 'Auto Standby',
        interstitialLeakDetected: false,
        protocol: 'Modbus TCP',
        endpoint: '10.60.25.12:502',
        status: 'nominal',
      },
      {
        id: 'diesel-a3',
        name: 'FUEL-TANK-A3',
        vaultZone: 'Basement B1 · Path A Vault',
        redundancyPath: 'Path A',
        feedBus: 'Bus A',
        servedGenerators: ['GEN-A3'],
        capacityLiters: 50000,
        currentLiters: 47850,
        levelPct: 95.7,
        fuelTempC: 26.9,
        supplyPressureBar: 2.2,
        transferPumpMode: 'Polishing',
        interstitialLeakDetected: false,
        protocol: 'Modbus TCP',
        endpoint: '10.60.25.13:502',
        status: 'nominal',
      },
      {
        id: 'diesel-a4',
        name: 'FUEL-TANK-A4',
        vaultZone: 'Basement B1 · Path A Vault',
        redundancyPath: 'Path A',
        feedBus: 'Bus A',
        servedGenerators: ['GEN-A4'],
        capacityLiters: 50000,
        currentLiters: 48400,
        levelPct: 96.8,
        fuelTempC: 26.7,
        supplyPressureBar: 2.1,
        transferPumpMode: 'Auto Standby',
        interstitialLeakDetected: false,
        protocol: 'Modbus TCP',
        endpoint: '10.60.25.14:502',
        status: 'nominal',
      },
      {
        id: 'diesel-b1',
        name: 'FUEL-TANK-B1',
        vaultZone: 'Basement B1 · Path B Vault',
        redundancyPath: 'Path B',
        feedBus: 'Bus B',
        servedGenerators: ['GEN-B1'],
        capacityLiters: 50000,
        currentLiters: 47900,
        levelPct: 95.8,
        fuelTempC: 26.9,
        supplyPressureBar: 2.1,
        transferPumpMode: 'Auto Standby',
        interstitialLeakDetected: false,
        protocol: 'Modbus TCP',
        endpoint: '10.60.25.21:502',
        status: 'nominal',
      },
      {
        id: 'diesel-b2',
        name: 'FUEL-TANK-B2',
        vaultZone: 'Basement B1 · Path B Vault',
        redundancyPath: 'Path B',
        feedBus: 'Bus B',
        servedGenerators: ['GEN-B2'],
        capacityLiters: 50000,
        currentLiters: 48450,
        levelPct: 96.9,
        fuelTempC: 26.8,
        supplyPressureBar: 2.1,
        transferPumpMode: 'Auto Standby',
        interstitialLeakDetected: false,
        protocol: 'Modbus TCP',
        endpoint: '10.60.25.22:502',
        status: 'nominal',
      },
      {
        id: 'diesel-b3',
        name: 'FUEL-TANK-B3',
        vaultZone: 'Basement B1 · Path B Vault',
        redundancyPath: 'Path B',
        feedBus: 'Bus B',
        servedGenerators: ['GEN-B3'],
        capacityLiters: 50000,
        currentLiters: 48100,
        levelPct: 96.2,
        fuelTempC: 27.0,
        supplyPressureBar: 2.2,
        transferPumpMode: 'Polishing',
        interstitialLeakDetected: false,
        protocol: 'Modbus TCP',
        endpoint: '10.60.25.23:502',
        status: 'nominal',
      },
      {
        id: 'diesel-b4',
        name: 'FUEL-TANK-B4',
        vaultZone: 'Basement B1 · Path B Vault',
        redundancyPath: 'Path B',
        feedBus: 'Bus B',
        servedGenerators: ['GEN-B4'],
        capacityLiters: 50000,
        currentLiters: 47750,
        levelPct: 95.5,
        fuelTempC: 26.8,
        supplyPressureBar: 2.1,
        transferPumpMode: 'Auto Standby',
        interstitialLeakDetected: false,
        protocol: 'Modbus TCP',
        endpoint: '10.60.25.24:502',
        status: 'nominal',
      },
    ],
    // Tier IV 2N Electrical Single-Line Chain: HV (132kV/11kV) -> MSB (415V 6300A) -> OPSWB (415V) -> Electrical (IT) + Mechanical
    electricalSwitchgear: [
      {
        id: 'hv-a',
        name: 'HV-A · 132kV/11kV GIS & Step-Down Transformer',
        stage: 'HV',
        redundancyPath: 'Path A',
        feedBus: 'Bus A',
        voltageLabel: '132kV → 11kV / 415V',
        ratedKva: 20000,
        activeLoadKw: 9420.0,
        electricalServeKw: 7610.0,
        mechanicalServeKw: 1810.0,
        upstreamSource: 'TNB 132kV Substation A',
        downstreamTargets: ['MSB-A'],
        breakerState: 'Closed',
        powerFactor: 0.98,
        thdPct: 1.9,
        protocol: 'Modbus TCP',
        endpoint: '10.60.22.10:502',
        status: 'nominal',
      },
      {
        id: 'hv-b',
        name: 'HV-B · 132kV/11kV GIS & Step-Down Transformer',
        stage: 'HV',
        redundancyPath: 'Path B',
        feedBus: 'Bus B',
        voltageLabel: '132kV → 11kV / 415V',
        ratedKva: 20000,
        activeLoadKw: 9260.0,
        electricalServeKw: 7460.0,
        mechanicalServeKw: 1800.0,
        upstreamSource: 'TNB 132kV Substation B',
        downstreamTargets: ['MSB-B'],
        breakerState: 'Closed',
        powerFactor: 0.98,
        thdPct: 2.0,
        protocol: 'Modbus TCP',
        endpoint: '10.60.22.20:502',
        status: 'nominal',
      },
      {
        id: 'msb-a',
        name: 'MSB-A · Main Switchboard (415V · 6300A)',
        stage: 'MSB',
        redundancyPath: 'Path A',
        feedBus: 'Bus A',
        voltageLabel: '415V 3-Ph · 6300A ACB',
        ratedKva: 18000,
        activeLoadKw: 9420.0,
        electricalServeKw: 7610.0,
        mechanicalServeKw: 1810.0,
        upstreamSource: 'HV-A + GEN-A1–A4 ATS',
        downstreamTargets: ['UPS-A1', 'UPS-A2', 'OPSWB-A'],
        breakerState: 'Closed',
        powerFactor: 0.99,
        thdPct: 2.1,
        protocol: 'Modbus TCP',
        endpoint: '10.60.22.11:502',
        status: 'nominal',
      },
      {
        id: 'msb-b',
        name: 'MSB-B · Main Switchboard (415V · 6300A)',
        stage: 'MSB',
        redundancyPath: 'Path B',
        feedBus: 'Bus B',
        voltageLabel: '415V 3-Ph · 6300A ACB',
        ratedKva: 18000,
        activeLoadKw: 9260.0,
        electricalServeKw: 7460.0,
        mechanicalServeKw: 1800.0,
        upstreamSource: 'HV-B + GEN-B1–B4 ATS',
        downstreamTargets: ['UPS-B1', 'UPS-B2', 'OPSWB-B'],
        breakerState: 'Closed',
        powerFactor: 0.99,
        thdPct: 2.1,
        protocol: 'Modbus TCP',
        endpoint: '10.60.22.21:502',
        status: 'nominal',
      },
      {
        id: 'opswb-a',
        name: 'OPSWB-A · Output Switchboard (Elec + Mech)',
        stage: 'OPSWB',
        redundancyPath: 'Path A',
        feedBus: 'Bus A',
        voltageLabel: '415V Dual Output Bus',
        ratedKva: 18000,
        activeLoadKw: 9420.0,
        electricalServeKw: 7610.0,
        mechanicalServeKw: 1810.0,
        upstreamSource: 'MSB-A + UPS-A1/A2',
        downstreamTargets: [
          'Electrical: Hall A–D Busway A & rPDUs',
          'Mechanical: CHW-01, CHW-TANK-A Pumps, CDU-B1, CRAC-A1/C1/D1, Fuel A',
        ],
        breakerState: 'Closed',
        powerFactor: 0.99,
        thdPct: 1.7,
        protocol: 'Modbus TCP',
        endpoint: '10.60.22.12:502',
        status: 'nominal',
      },
      {
        id: 'opswb-b',
        name: 'OPSWB-B · Output Switchboard (Elec + Mech)',
        stage: 'OPSWB',
        redundancyPath: 'Path B',
        feedBus: 'Bus B',
        voltageLabel: '415V Dual Output Bus',
        ratedKva: 18000,
        activeLoadKw: 9260.0,
        electricalServeKw: 7460.0,
        mechanicalServeKw: 1800.0,
        upstreamSource: 'MSB-B + UPS-B1/B2',
        downstreamTargets: [
          'Electrical: Hall A–D Busway B & rPDUs',
          'Mechanical: CHW-02, CHW-TANK-B Pumps, CDU-B2, CRAC-A2/C2/D2, Fuel B',
        ],
        breakerState: 'Closed',
        powerFactor: 0.99,
        thdPct: 1.8,
        protocol: 'Modbus TCP',
        endpoint: '10.60.22.22:502',
        status: 'nominal',
      },
    ],
    // Certified Tier IV 2(N+1) Critical Power: Dual physically compartmented electrical paths A & B, each with N+1 UPS modules
    upsSystems: [
      {
        id: 'ups-a1',
        name: 'UPS-A1 · Bus A Primary',
        feedBus: 'Bus A',
        redundancyPath: 'Path A',
        role: 'Primary',
        peerUpsId: 'ups-a2',
        protocol: 'Modbus TCP',
        endpoint: '10.60.20.10:502',
        mode: 'Online',
        loadKw: 3820.0,
        capacityKw: 16000.0,
        batterySocPct: 100,
        runtimeMin: 48,
        inputVoltageV: 480.2,
        outputFreqHz: 50.0,
        status: 'nominal',
      },
      {
        id: 'ups-a2',
        name: 'UPS-A2 · Bus A Redundant (N+1)',
        feedBus: 'Bus A',
        redundancyPath: 'Path A',
        role: 'Redundant (N+1)',
        peerUpsId: 'ups-a1',
        protocol: 'Modbus TCP',
        endpoint: '10.60.20.11:502',
        mode: 'Online',
        loadKw: 3790.0,
        capacityKw: 16000.0,
        batterySocPct: 100,
        runtimeMin: 49,
        inputVoltageV: 480.1,
        outputFreqHz: 50.0,
        status: 'nominal',
      },
      {
        id: 'ups-b1',
        name: 'UPS-B1 · Bus B Primary',
        feedBus: 'Bus B',
        redundancyPath: 'Path B',
        role: 'Primary',
        peerUpsId: 'ups-b2',
        protocol: 'Modbus TCP',
        endpoint: '10.60.20.20:502',
        mode: 'Online',
        loadKw: 3740.0,
        capacityKw: 16000.0,
        batterySocPct: 100,
        runtimeMin: 50,
        inputVoltageV: 479.8,
        outputFreqHz: 50.0,
        status: 'nominal',
      },
      {
        id: 'ups-b2',
        name: 'UPS-B2 · Bus B Redundant (N+1)',
        feedBus: 'Bus B',
        redundancyPath: 'Path B',
        role: 'Redundant (N+1)',
        peerUpsId: 'ups-b1',
        protocol: 'Modbus TCP',
        endpoint: '10.60.20.21:502',
        mode: 'Online',
        loadKw: 3720.0,
        capacityKw: 16000.0,
        batterySocPct: 100,
        runtimeMin: 50,
        inputVoltageV: 479.9,
        outputFreqHz: 50.0,
        status: 'nominal',
      },
    ],
    // Certified Tier IV 2(3+1 N+1) Standby Diesel Generators: 8 × 8 MW (64 MW Installed) across Bus A & Bus B yards with 96h on-site fuel autonomy
    generators: [
      {
        id: 'gen-a1',
        name: 'GEN-A1 · 8 MW Bus A Primary',
        redundancyPath: 'Path A',
        feedBus: 'Bus A',
        role: 'Primary',
        protocol: 'Modbus TCP',
        endpoint: '10.60.20.30:502',
        state: 'Standby Ready',
        fuelLevelPct: 96.4,
        fuelAutonomyHours: 96,
        coolantTempC: 42.0,
        outputKw: 0,
        ratedKw: 8000,
      },
      {
        id: 'gen-a2',
        name: 'GEN-A2 · 8 MW Bus A Primary',
        redundancyPath: 'Path A',
        feedBus: 'Bus A',
        role: 'Primary',
        protocol: 'Modbus TCP',
        endpoint: '10.60.20.31:502',
        state: 'Standby Ready',
        fuelLevelPct: 97.2,
        fuelAutonomyHours: 96,
        coolantTempC: 41.6,
        outputKw: 0,
        ratedKw: 8000,
      },
      {
        id: 'gen-a3',
        name: 'GEN-A3 · 8 MW Bus A Primary',
        redundancyPath: 'Path A',
        feedBus: 'Bus A',
        role: 'Primary',
        protocol: 'Modbus TCP',
        endpoint: '10.60.20.32:502',
        state: 'Standby Ready',
        fuelLevelPct: 95.7,
        fuelAutonomyHours: 96,
        coolantTempC: 41.9,
        outputKw: 0,
        ratedKw: 8000,
      },
      {
        id: 'gen-a4',
        name: 'GEN-A4 · 8 MW Bus A Standby',
        redundancyPath: 'Path A',
        feedBus: 'Bus A',
        role: 'Standby (N+1)',
        protocol: 'Modbus TCP',
        endpoint: '10.60.20.33:502',
        state: 'Standby Ready',
        fuelLevelPct: 96.8,
        fuelAutonomyHours: 96,
        coolantTempC: 41.5,
        outputKw: 0,
        ratedKw: 8000,
      },
      {
        id: 'gen-b1',
        name: 'GEN-B1 · 8 MW Bus B Primary',
        redundancyPath: 'Path B',
        feedBus: 'Bus B',
        role: 'Primary',
        protocol: 'Modbus TCP',
        endpoint: '10.60.20.40:502',
        state: 'Standby Ready',
        fuelLevelPct: 95.8,
        fuelAutonomyHours: 96,
        coolantTempC: 41.8,
        outputKw: 0,
        ratedKw: 8000,
      },
      {
        id: 'gen-b2',
        name: 'GEN-B2 · 8 MW Bus B Primary',
        redundancyPath: 'Path B',
        feedBus: 'Bus B',
        role: 'Primary',
        protocol: 'Modbus TCP',
        endpoint: '10.60.20.41:502',
        state: 'Standby Ready',
        fuelLevelPct: 96.9,
        fuelAutonomyHours: 96,
        coolantTempC: 41.4,
        outputKw: 0,
        ratedKw: 8000,
      },
      {
        id: 'gen-b3',
        name: 'GEN-B3 · 8 MW Bus B Primary',
        redundancyPath: 'Path B',
        feedBus: 'Bus B',
        role: 'Primary',
        protocol: 'Modbus TCP',
        endpoint: '10.60.20.42:502',
        state: 'Standby Ready',
        fuelLevelPct: 96.2,
        fuelAutonomyHours: 96,
        coolantTempC: 41.7,
        outputKw: 0,
        ratedKw: 8000,
      },
      {
        id: 'gen-b4',
        name: 'GEN-B4 · 8 MW Bus B Standby',
        redundancyPath: 'Path B',
        feedBus: 'Bus B',
        role: 'Standby (N+1)',
        protocol: 'Modbus TCP',
        endpoint: '10.60.20.43:502',
        state: 'Standby Ready',
        fuelLevelPct: 95.5,
        fuelAutonomyHours: 96,
        coolantTempC: 41.3,
        outputKw: 0,
        ratedKw: 8000,
      },
    ],
    envSensors: [
      {
        id: 'env-a',
        hallId: 'hall-a',
        hallLabel: 'Hall A · Core Compute',
        slaProbeAId: 'SLA-CA-A1',
        slaProbeBId: 'SLA-CA-A2',
        coldAisleTempC: 21.2,
        probeATempC: 21.1,
        probeBTempC: 21.3,
        humidityPct: 46.1,
        probeAHumidityPct: 46.0,
        probeBHumidityPct: 46.2,
        dewPointC: computeDewPointC(21.2, 46.1),
        slaTempMinC: COLD_AISLE_SLA_LIMITS.tempMinC,
        slaTempMaxC: COLD_AISLE_SLA_LIMITS.tempMaxC,
        slaHumidityMinPct: COLD_AISLE_SLA_LIMITS.humidityMinPct,
        slaHumidityMaxPct: COLD_AISLE_SLA_LIMITS.humidityMaxPct,
        tempSlaStatus: 'Compliant',
        humiditySlaStatus: 'Compliant',
        slaCompliancePct: 99.99,
        slaExcursionActive: false,
        differentialPressurePa: 18.4,
        leakDetected: false,
        smokeAspiration: 'Normal',
        dualProbeStatus: '2N Dual Verified',
        chilledLoopStatus: 'Loop A + B Active',
      },
      {
        id: 'env-b',
        hallId: 'hall-b',
        hallLabel: 'Hall B · AI & GPU Fabric',
        slaProbeAId: 'SLA-CA-B1',
        slaProbeBId: 'SLA-CA-B2',
        coldAisleTempC: 22.4,
        probeATempC: 22.3,
        probeBTempC: 22.5,
        humidityPct: 44.8,
        probeAHumidityPct: 44.7,
        probeBHumidityPct: 44.9,
        dewPointC: computeDewPointC(22.4, 44.8),
        slaTempMinC: COLD_AISLE_SLA_LIMITS.tempMinC,
        slaTempMaxC: COLD_AISLE_SLA_LIMITS.tempMaxC,
        slaHumidityMinPct: COLD_AISLE_SLA_LIMITS.humidityMinPct,
        slaHumidityMaxPct: COLD_AISLE_SLA_LIMITS.humidityMaxPct,
        tempSlaStatus: 'Compliant',
        humiditySlaStatus: 'Compliant',
        slaCompliancePct: 99.98,
        slaExcursionActive: false,
        differentialPressurePa: 21.2,
        leakDetected: false,
        smokeAspiration: 'Normal',
        dualProbeStatus: '2N Dual Verified',
        chilledLoopStatus: 'Loop A + B Active',
      },
      {
        id: 'env-c',
        hallId: 'hall-c',
        hallLabel: 'Hall C · Storage & Edge',
        slaProbeAId: 'SLA-CA-C1',
        slaProbeBId: 'SLA-CA-C2',
        coldAisleTempC: 20.9,
        probeATempC: 20.8,
        probeBTempC: 21.0,
        humidityPct: 47.4,
        probeAHumidityPct: 47.3,
        probeBHumidityPct: 47.5,
        dewPointC: computeDewPointC(20.9, 47.4),
        slaTempMinC: COLD_AISLE_SLA_LIMITS.tempMinC,
        slaTempMaxC: COLD_AISLE_SLA_LIMITS.tempMaxC,
        slaHumidityMinPct: COLD_AISLE_SLA_LIMITS.humidityMinPct,
        slaHumidityMaxPct: COLD_AISLE_SLA_LIMITS.humidityMaxPct,
        tempSlaStatus: 'Compliant',
        humiditySlaStatus: 'Compliant',
        slaCompliancePct: 100.0,
        slaExcursionActive: false,
        differentialPressurePa: 17.6,
        leakDetected: false,
        smokeAspiration: 'Normal',
        dualProbeStatus: '2N Dual Verified',
        chilledLoopStatus: 'Loop A + B Active',
      },
      {
        id: 'env-d',
        hallId: 'hall-d',
        hallLabel: 'Hall D · Cloud & Interconnect',
        slaProbeAId: 'SLA-CA-D1',
        slaProbeBId: 'SLA-CA-D2',
        coldAisleTempC: 21.1,
        probeATempC: 21.0,
        probeBTempC: 21.2,
        humidityPct: 45.8,
        probeAHumidityPct: 45.7,
        probeBHumidityPct: 45.9,
        dewPointC: computeDewPointC(21.1, 45.8),
        slaTempMinC: COLD_AISLE_SLA_LIMITS.tempMinC,
        slaTempMaxC: COLD_AISLE_SLA_LIMITS.tempMaxC,
        slaHumidityMinPct: COLD_AISLE_SLA_LIMITS.humidityMinPct,
        slaHumidityMaxPct: COLD_AISLE_SLA_LIMITS.humidityMaxPct,
        tempSlaStatus: 'Compliant',
        humiditySlaStatus: 'Compliant',
        slaCompliancePct: 99.99,
        slaExcursionActive: false,
        differentialPressurePa: 19.1,
        leakDetected: false,
        smokeAspiration: 'Normal',
        dualProbeStatus: '2N Dual Verified',
        chilledLoopStatus: 'Loop A + B Active',
      },
    ],
    // Certified Tier IV 2N Active/Standby BMS Field-Bus Gateways
    gateways: [
      {
        id: 'gw-bacnet-a',
        name: 'HVAC BACnet Controller A (Primary)',
        protocol: 'BACnet/IP',
        redundancyPath: 'Path A',
        role: 'Primary',
        peerGatewayId: 'gw-bacnet-b',
        endpoint: '10.60.10.1:47808',
        connected: true,
        pollIntervalSec: 3,
        mappedPoints: 296,
        latencyMs: 11,
        lastSyncAt: now,
      },
      {
        id: 'gw-bacnet-b',
        name: 'HVAC BACnet Controller B (Standby)',
        protocol: 'BACnet/IP',
        redundancyPath: 'Path B',
        role: 'Standby',
        peerGatewayId: 'gw-bacnet-a',
        endpoint: '10.60.10.2:47808',
        connected: true,
        pollIntervalSec: 3,
        mappedPoints: 296,
        latencyMs: 12,
        lastSyncAt: now,
      },
      {
        id: 'gw-modbus-a',
        name: 'Electrical Power PLC A (Primary)',
        protocol: 'Modbus TCP',
        redundancyPath: 'Path A',
        role: 'Primary',
        peerGatewayId: 'gw-modbus-b',
        endpoint: '10.60.20.1:502',
        connected: true,
        pollIntervalSec: 3,
        mappedPoints: 192,
        latencyMs: 8,
        lastSyncAt: now,
      },
      {
        id: 'gw-modbus-b',
        name: 'Electrical Power PLC B (Standby)',
        protocol: 'Modbus TCP',
        redundancyPath: 'Path B',
        role: 'Standby',
        peerGatewayId: 'gw-modbus-a',
        endpoint: '10.60.20.2:502',
        connected: true,
        pollIntervalSec: 3,
        mappedPoints: 192,
        latencyMs: 9,
        lastSyncAt: now,
      },
      {
        id: 'gw-snmp-a',
        name: 'Environmental Safety Bus A (Primary)',
        protocol: 'SNMP v3',
        redundancyPath: 'Path A',
        role: 'Primary',
        peerGatewayId: 'gw-snmp-b',
        endpoint: '10.60.30.5:161',
        connected: true,
        pollIntervalSec: 5,
        mappedPoints: 128,
        latencyMs: 14,
        lastSyncAt: now,
      },
      {
        id: 'gw-snmp-b',
        name: 'Environmental Safety Bus B (Standby)',
        protocol: 'SNMP v3',
        redundancyPath: 'Path B',
        role: 'Standby',
        peerGatewayId: 'gw-snmp-a',
        endpoint: '10.60.30.6:161',
        connected: true,
        pollIntervalSec: 5,
        mappedPoints: 128,
        latencyMs: 15,
        lastSyncAt: now,
      },
    ],
    commandLog: [
      {
        id: 'cmd-init-1',
        timestamp: now - 1000 * 60 * 6,
        source: 'Closed-Loop Automation',
        protocol: 'BACnet/IP',
        targetDevice: 'CDU-B1 & CDU-B2 (Hall B Liquid Cooling 2N)',
        command: 'Set Mode=Boost, Coolant Flow=1440/1410 L/min, Supply=24.4°C (Hall B GPU fabric)',
        result: 'Applied',
      },
      {
        id: 'cmd-init-2',
        timestamp: now - 1000 * 60 * 32,
        source: 'Operator',
        protocol: 'Modbus TCP',
        targetDevice: 'HV-A/B → MSB-A/B → OPSWB-A/B & 8 Basement Diesel Tanks',
        command: 'Tier IV 2N Electrical Chain & 400,000 L Basement Fuel Reserve Verified (Zero SPOF)',
        result: 'Applied',
      },
    ],
  };
}

/**
 * Pure Tier IV Fault-Tolerance Audit Engine across all electrical, cooling, gateway, and IT subsystems.
 */
export function computeTier4RedundancySummary(
  bms: BmsState,
  servers: ServerNode[]
): Tier4RedundancySummary {
  const subsystems: Tier4SubsystemStatus[] = [];

  // 1. Dual Independent Utility Substations (2N)
  const utilActive = (bms.utilityFeedAOnline ? 1 : 0) + (bms.utilityFeedBOnline ? 1 : 0);
  subsystems.push({
    id: 'utility',
    subsystem: 'Utility Grid Substations',
    topology: '2N',
    activeCount: utilActive,
    totalCount: 2,
    pathAHealthy: bms.utilityFeedAOnline,
    pathBHealthy: bms.utilityFeedBOnline,
    state:
      utilActive === 2
        ? 'fault-tolerant'
        : utilActive === 1 || bms.utilityFeed === 'Generator Backup'
        ? 'failover-active'
        : 'degraded',
    detail:
      utilActive === 2
        ? 'Substation A + B Online (Dual 132kV Active)'
        : bms.utilityFeed === 'Generator Backup'
        ? 'Dual 2N Diesel Generators Carrying Bus A + B'
        : 'UPS 2(N+1) Battery Bridge Active · Generators Cranking',
  });

  // 1b. HV -> MSB -> OPSWB Electrical Distribution Chain (2N serving Electrical IT & Mechanical)
  const swgTotal = bms.electricalSwitchgear.length;
  const swgHealthy = bms.electricalSwitchgear.filter((n) => n.status !== 'critical').length;
  const swgAOk = bms.electricalSwitchgear
    .filter((n) => n.redundancyPath === 'Path A')
    .every((n) => n.status !== 'critical');
  const swgBOk = bms.electricalSwitchgear
    .filter((n) => n.redundancyPath === 'Path B')
    .every((n) => n.status !== 'critical');
  const opswbElecMw =
    bms.electricalSwitchgear
      .filter((n) => n.stage === 'OPSWB')
      .reduce((s, n) => s + n.electricalServeKw, 0) / 1000;
  const opswbMechMw =
    bms.electricalSwitchgear
      .filter((n) => n.stage === 'OPSWB')
      .reduce((s, n) => s + n.mechanicalServeKw, 0) / 1000;
  subsystems.push({
    id: 'electrical-chain',
    subsystem: 'HV → MSB → OPSWB Power Chain',
    topology: '2N',
    activeCount: swgHealthy,
    totalCount: swgTotal,
    pathAHealthy: swgAOk,
    pathBHealthy: swgBOk,
    state:
      !swgAOk && !swgBOk
        ? 'degraded'
        : bms.utilityFeed !== 'Utility Normal' || swgHealthy < swgTotal
        ? 'failover-active'
        : 'fault-tolerant',
    detail: `OPSWB Serving Electrical IT (${opswbElecMw.toFixed(2)} MW) + Mechanical Plant (${opswbMechMw.toFixed(2)} MW)`,
  });

  // 2. Critical UPS Power Chain — 2(N+1)
  const upsAHealthy = bms.upsSystems.filter((u) => u.redundancyPath === 'Path A' && u.mode !== 'Fault').length;
  const upsBHealthy = bms.upsSystems.filter((u) => u.redundancyPath === 'Path B' && u.mode !== 'Fault').length;
  const upsActive = upsAHealthy + upsBHealthy;
  const upsTotal = bms.upsSystems.length;
  subsystems.push({
    id: 'ups',
    subsystem: 'Critical UPS Modules',
    topology: '2(N+1)',
    activeCount: upsActive,
    totalCount: upsTotal,
    pathAHealthy: upsAHealthy >= 1,
    pathBHealthy: upsBHealthy >= 1,
    state:
      upsAHealthy === 2 && upsBHealthy === 2
        ? 'fault-tolerant'
        : upsAHealthy >= 1 && upsBHealthy >= 1
        ? 'failover-active'
        : upsActive >= 1
        ? 'failover-active'
        : 'degraded',
    detail:
      upsActive === upsTotal
        ? `Bus A (${upsAHealthy}/2) + Bus B (${upsBHealthy}/2) Active-Active`
        : upsActive >= 2
        ? `Auto-Failover Absorbed Load · Zero IT Power Drop (${upsActive}/${upsTotal})`
        : 'Critical UPS Capacity Degraded',
  });

  // 3. Standby Diesel Generators — 2(N+1) & Basement 8-Tank Bulk Fuel Vault
  const genA = bms.generators.filter((g) => g.redundancyPath === 'Path A');
  const genB = bms.generators.filter((g) => g.redundancyPath === 'Path B');
  const genReadyCount = bms.generators.filter((g) => g.fuelLevelPct >= 20).length;
  const genRunning = bms.generators.filter((g) => g.state === 'Running · On Load').length;
  subsystems.push({
    id: 'generators',
    subsystem: 'Standby Generators (96h Fuel)',
    topology: '2(N+1)',
    activeCount: genReadyCount,
    totalCount: bms.generators.length,
    pathAHealthy: genA.some((g) => g.fuelLevelPct >= 20),
    pathBHealthy: genB.some((g) => g.fuelLevelPct >= 20),
    state: genRunning > 0 ? 'failover-active' : genReadyCount === bms.generators.length ? 'fault-tolerant' : 'degraded',
    detail:
      genRunning > 0
        ? `${genRunning} Active on Load · ${bms.generators.length - genRunning} N+1 Hot Reserve`
        : `Path A (4×8 MW) + Path B (4×8 MW) Ready · 64 MW Installed`,
  });

  const tanksHealthy = bms.dieselTanks.filter((t) => !t.interstitialLeakDetected && t.levelPct >= 25 && t.transferPumpMode !== 'Fault').length;
  const tanksAOk = bms.dieselTanks.filter((t) => t.redundancyPath === 'Path A' && t.levelPct >= 25 && !t.interstitialLeakDetected).length >= 3;
  const tanksBOk = bms.dieselTanks.filter((t) => t.redundancyPath === 'Path B' && t.levelPct >= 25 && !t.interstitialLeakDetected).length >= 3;
  const totalDieselLiters = bms.dieselTanks.reduce((s, t) => s + t.currentLiters, 0);
  const totalDieselCap = bms.dieselTanks.reduce((s, t) => s + t.capacityLiters, 0);
  const transferringCount = bms.dieselTanks.filter((t) => t.transferPumpMode === 'Transferring').length;
  subsystems.push({
    id: 'basement-diesel',
    subsystem: 'Basement Diesel Vault (8 Tanks)',
    topology: '2N',
    activeCount: tanksHealthy,
    totalCount: bms.dieselTanks.length,
    pathAHealthy: tanksAOk,
    pathBHealthy: tanksBOk,
    state: !tanksAOk || !tanksBOk ? 'degraded' : transferringCount > 0 || tanksHealthy < bms.dieselTanks.length ? 'failover-active' : 'fault-tolerant',
    detail:
      transferringCount > 0
        ? `${transferringCount} Tanks Actively Pumping to GEN-A1–A4/B1–B4 · ${(totalDieselLiters / 1000).toFixed(1)}k / ${(totalDieselCap / 1000).toFixed(0)}k L`
        : `B1 Vault: 4× Path A + 4× Path B UL-2085 Tanks · ${(totalDieselLiters / 1000).toFixed(1)}k / ${(totalDieselCap / 1000).toFixed(0)}k L`,
  });

  // 4a. Central Water-Cooled Chillers — 2N (2 Units: CHW-01 Loop A + CHW-02 Loop B)
  const waterChillers = bms.chillers.filter((ch) => ch.chillerType === 'Water-Cooled');
  const waterHealthy = waterChillers.filter((ch) => ch.mode !== 'Fault').length;
  const waterAOk = waterChillers.some((ch) => ch.redundancyPath === 'Path A' && ch.mode !== 'Fault');
  const waterBOk = waterChillers.some((ch) => ch.redundancyPath === 'Path B' && ch.mode !== 'Fault');
  subsystems.push({
    id: 'water-chillers',
    subsystem: 'Water-Cooled Chillers (2 Units)',
    topology: '2N',
    activeCount: waterHealthy,
    totalCount: waterChillers.length,
    pathAHealthy: waterAOk,
    pathBHealthy: waterBOk,
    state:
      waterHealthy === 0
        ? 'degraded'
        : waterHealthy < waterChillers.length
        ? 'failover-active'
        : 'fault-tolerant',
    detail:
      waterHealthy === waterChillers.length
        ? 'CHW-01 (Loop A) + CHW-02 (Loop B) Online · 24.0 MW Water Plant'
        : waterHealthy === 1
        ? 'Peer Water Chiller Boosted + N+1 Air Chiller Supporting Loop'
        : 'Both Water-Cooled Chillers Offline · Air Chiller Array Carrying Load',
  });

  // 4a-ii. Rooftop Square Chilled-Water Thermal Buffer Tanks & Complete VFD Pump Sets (2N)
  const pumpSetsHealthy = bms.chwTankPumpSets.filter((p) => p.mode !== 'Fault').length;
  const pumpSetAOk = bms.chwTankPumpSets.some((p) => p.chilledLoop === 'Loop A' && p.mode !== 'Fault');
  const pumpSetBOk = bms.chwTankPumpSets.some((p) => p.chilledLoop === 'Loop B' && p.mode !== 'Fault');
  const totalBufferLiters = bms.chwTankPumpSets.reduce((s, p) => s + p.tankCapacityLiters, 0);
  const totalChwFlow = bms.chwTankPumpSets.reduce((s, p) => s + p.flowRateLps, 0);
  subsystems.push({
    id: 'chw-tank-pumps',
    subsystem: 'Rooftop Square CHW Tanks & Pump Sets',
    topology: '2(N+1)',
    activeCount: pumpSetsHealthy,
    totalCount: bms.chwTankPumpSets.length,
    pathAHealthy: pumpSetAOk,
    pathBHealthy: pumpSetBOk,
    state:
      pumpSetsHealthy === 0
        ? 'degraded'
        : pumpSetsHealthy < bms.chwTankPumpSets.length || bms.chwTankPumpSets.some((p) => p.mode === 'Boost')
        ? 'failover-active'
        : 'fault-tolerant',
    detail: `2×180kL Square Roof Tanks (${(totalBufferLiters / 1000).toFixed(0)}k L · 18m Ride-Through) · 6 VFD Pumps (${totalChwFlow} L/s)`,
  });

  // 4b. Rooftop Air-Cooled Chillers — 2(5+2 N+1) (14 Units: 7× Loop A + 7× Loop B)
  const airChillers = bms.chillers.filter((ch) => ch.chillerType === 'Air-Cooled');
  const airAHealthy = airChillers.filter((ch) => ch.redundancyPath === 'Path A' && ch.mode !== 'Fault').length;
  const airBHealthy = airChillers.filter((ch) => ch.redundancyPath === 'Path B' && ch.mode !== 'Fault').length;
  const airHealthy = airAHealthy + airBHealthy;
  subsystems.push({
    id: 'air-chillers',
    subsystem: 'Air-Cooled Chillers (14 Units)',
    topology: '2(N+1)',
    activeCount: airHealthy,
    totalCount: airChillers.length,
    pathAHealthy: airAHealthy >= 5,
    pathBHealthy: airBHealthy >= 5,
    state:
      airAHealthy < 5 || airBHealthy < 5
        ? 'degraded'
        : airHealthy < airChillers.length
        ? 'failover-active'
        : 'fault-tolerant',
    detail:
      airHealthy === airChillers.length
        ? 'Loop A (7×4.8 MW) + Loop B (7×4.8 MW) Ready · 67.2 MW Air Plant'
        : airAHealthy >= 5 && airBHealthy >= 5
        ? `N+1 Reserve Engaged · Full Air Chiller Capacity Preserved (${airHealthy}/${airChillers.length})`
        : `Air Chiller Redundancy Reduced (${airHealthy}/${airChillers.length})`,
  });

  // 4c. Data Hall CRAC / CRAH Cooling & Chilled Water Loops — 2N per Hall
  const healthyCracs = bms.cracUnits.filter((c) => c.mode !== 'Fault').length;
  const halls = ['hall-a', 'hall-b', 'hall-c', 'hall-d'] as const;
  let anyDualHallCoolingFault = false;
  let anySingleCracFailover = false;
  for (const h of halls) {
    const hallUnits = bms.cracUnits.filter((c) => c.hallId === h);
    const healthyInHall = hallUnits.filter((c) => c.mode !== 'Fault').length;
    if (healthyInHall === 0) anyDualHallCoolingFault = true;
    else if (healthyInHall < hallUnits.length) anySingleCracFailover = true;
  }
  const cracPathAOk = bms.cracUnits.filter((c) => c.redundancyPath === 'Path A' && c.mode !== 'Fault').length === 4;
  const cracPathBOk = bms.cracUnits.filter((c) => c.redundancyPath === 'Path B' && c.mode !== 'Fault').length === 4;
  subsystems.push({
    id: 'cooling',
    subsystem: 'Hall B Liquid CDU (2) & Halls A/C/D CRACs (6)',
    topology: '2N',
    activeCount: healthyCracs,
    totalCount: bms.cracUnits.length,
    pathAHealthy: cracPathAOk,
    pathBHealthy: cracPathBOk,
    state: anyDualHallCoolingFault
      ? 'degraded'
      : anySingleCracFailover
      ? 'failover-active'
      : 'fault-tolerant',
    detail: anyDualHallCoolingFault
      ? 'Dual-Loop Cooling Loss Detected in Data Hall'
      : anySingleCracFailover
      ? `Peer Loop Auto-Boosted · Envelope Maintained (${healthyCracs}/${bms.cracUnits.length})`
      : 'Hall B Direct-to-Chip Liquid CDUs (CDU-B1/B2) + 6 Precision CRACs Online',
  });

  // 5. BMS Protocol Gateways — 2N Active/Standby
  const connectedGw = bms.gateways.filter((g) => g.connected).length;
  const protocols: BmsProtocol[] = ['BACnet/IP', 'Modbus TCP', 'SNMP v3'];
  const anyProtocolDown = protocols.some((p) => !isProtocolOnline(bms, p));
  const anyGwDegraded = connectedGw < bms.gateways.length;
  subsystems.push({
    id: 'gateways',
    subsystem: 'BMS Field-Bus Gateways',
    topology: '2N',
    activeCount: connectedGw,
    totalCount: bms.gateways.length,
    pathAHealthy: bms.gateways.filter((g) => g.redundancyPath === 'Path A' && g.connected).length === 3,
    pathBHealthy: bms.gateways.filter((g) => g.redundancyPath === 'Path B' && g.connected).length === 3,
    state: anyProtocolDown ? 'degraded' : anyGwDegraded ? 'failover-active' : 'fault-tolerant',
    detail: anyProtocolDown
      ? 'Both Primary & Standby Controllers Offline on Protocol'
      : anyGwDegraded
      ? `Standby Controller Active Failover (${connectedGw}/${bms.gateways.length} Online)`
      : 'BACnet, Modbus & SNMP Active/Standby Pairs Synced',
  });

  // 6. Cold Aisle SLA Temperature & Humidity Probes — 2N Dual Calibrated Sensors (2 per row x 20 rows = 40/hall · 160/site)
  const sensorsPerHall = 40;
  const slaCompliantHalls = bms.envSensors.filter(
    (e) => e.tempSlaStatus !== 'Breached' && e.humiditySlaStatus !== 'Breached'
  ).length;
  const dualProbesVerified = bms.envSensors.every((e) => e.dualProbeStatus === '2N Dual Verified');
  const breachedHalls = bms.envSensors.length - slaCompliantHalls;
  subsystems.push({
    id: 'cold-aisle-sla',
    subsystem: 'Cold Aisle Temp & Humidity SLA Sensors',
    topology: '2N',
    activeCount: slaCompliantHalls * sensorsPerHall,
    totalCount: bms.envSensors.length * sensorsPerHall,
    pathAHealthy: slaCompliantHalls === bms.envSensors.length,
    pathBHealthy: dualProbesVerified,
    state:
      slaCompliantHalls < bms.envSensors.length
        ? 'degraded'
        : !dualProbesVerified
        ? 'failover-active'
        : 'fault-tolerant',
    detail:
      slaCompliantHalls < bms.envSensors.length
        ? `${breachedHalls} Hall(s) (${breachedHalls * sensorsPerHall}/160 Row Probes) Breaching ASHRAE 18–27°C / 40–60% RH SLA`
        : '160/160 Calibrated Row Probes In-Band (2/Row · 18–27°C · 40–60% RH)',
  });

  // 7. Rack Dual rPDUs & Server Dual PSUs — 2N
  const activeServers = servers.filter((s) => s.status !== 'maintenance');
  const dualPsuOk = activeServers.filter((s) => s.psuStatus === 'Redundant (2/2)').length;
  subsystems.push({
    id: 'it-power',
    subsystem: 'Rack rPDUs & Server Dual PSUs',
    topology: '2N',
    activeCount: dualPsuOk,
    totalCount: activeServers.length,
    pathAHealthy: true,
    pathBHealthy: true,
    state: dualPsuOk === activeServers.length ? 'fault-tolerant' : 'failover-active',
    detail:
      dualPsuOk === activeServers.length
        ? '1,600 Dual-Fed Cabinets (Feed A+B) · All Live PSUs Redundant (2/2)'
        : `${activeServers.length - dualPsuOk} Host(s) Running on Redundant Secondary PSU`,
  });

  const hasDegraded = subsystems.some((s) => s.state === 'degraded');
  const hasFailover = subsystems.some((s) => s.state === 'failover-active');

  const overallState = hasDegraded ? 'degraded' : hasFailover ? 'failover-active' : 'fault-tolerant';
  const overallLabel = hasDegraded
    ? 'Tier IV Degraded · Action Required'
    : hasFailover
    ? 'Tier IV Failover Active · Zero IT Impact'
    : 'Tier IV Fault-Tolerant · 2N Verified';

  return {
    certificationLabel: bms.tierCertification,
    uptimeSla: '99.995% SLA',
    overallState,
    overallLabel,
    zeroSpofVerified: !hasDegraded,
    subsystems,
  };
}

export function setCracSetpoint(
  bms: BmsState,
  cracId: string,
  newSetpointC: number,
  source: 'Operator' | 'Closed-Loop Automation',
  now: number
): BmsState {
  const bacnetOnline = isProtocolOnline(bms, 'BACnet/IP');
  const target = bms.cracUnits.find((c) => c.id === cracId);
  if (!target) return bms;

  const clamped = Number(clamp(newSetpointC, 16.0, 26.0).toFixed(1));
  const entry: BmsCommandLogEntry = {
    id: `cmd-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now,
    source,
    protocol: 'BACnet/IP',
    targetDevice: target.name,
    command: `Write AV:102 Supply Setpoint = ${clamped.toFixed(1)}°C`,
    result: bacnetOnline ? 'Applied' : 'Blocked (Gateway Offline)',
  };

  if (!bacnetOnline) {
    return {
      ...bms,
      commandLog: [entry, ...bms.commandLog].slice(0, 40),
    };
  }

  return {
    ...bms,
    cracUnits: bms.cracUnits.map((c) =>
      c.id === cracId
        ? {
            ...c,
            setpointC: clamped,
            mode: source === 'Operator' && c.mode === 'Auto' ? 'Manual' : c.mode,
          }
        : c
    ),
    commandLog: [entry, ...bms.commandLog].slice(0, 40),
  };
}

export function setCracMode(
  bms: BmsState,
  cracId: string,
  mode: CracMode,
  source: 'Operator' | 'Closed-Loop Automation',
  now: number,
  reason?: string
): BmsState {
  const bacnetOnline = isProtocolOnline(bms, 'BACnet/IP');
  const target = bms.cracUnits.find((c) => c.id === cracId);
  if (!target) return bms;

  const entry: BmsCommandLogEntry = {
    id: `cmd-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now,
    source,
    protocol: 'BACnet/IP',
    targetDevice: target.name,
    command: `Write MV:201 Mode = ${mode}${reason ? ` (${reason})` : ''}`,
    result: bacnetOnline ? 'Applied' : 'Blocked (Gateway Offline)',
  };

  if (!bacnetOnline) {
    return {
      ...bms,
      commandLog: [entry, ...bms.commandLog].slice(0, 40),
    };
  }

  const peer = bms.cracUnits.find((c) => c.id === target.peerCracId);
  const autoBoostPeer = mode === 'Fault' && peer && peer.mode !== 'Fault';
  const extraLogs: BmsCommandLogEntry[] = [entry];

  if (autoBoostPeer && peer) {
    extraLogs.unshift({
      id: `cmd-failover-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
      source: 'Closed-Loop Automation',
      protocol: 'BACnet/IP',
      targetDevice: peer.name,
      command: `Tier IV 2N Failover: Auto-Boost ${peer.chilledLoop} to 96% to cover ${target.name} fault`,
      result: 'Applied',
    });
  }

  const nextCracUnits: CracUnit[] = bms.cracUnits.map((c) => {
    if (c.id === cracId) {
      if (mode === 'Boost') {
        return {
          ...c,
          mode: 'Boost',
          fanSpeedPct: 95,
          chilledWaterValvePct: 92,
          setpointC: Math.min(c.setpointC, 18.5),
          status: 'warning',
        };
      }
      if (mode === 'Fault') {
        return {
          ...c,
          mode: 'Fault',
          fanSpeedPct: 0,
          chilledWaterValvePct: 0,
          supplyTempC: 27.6,
          coolingOutputKw: 0,
          status: 'critical',
        };
      }
      return {
        ...c,
        mode,
        fanSpeedPct: 58,
        chilledWaterValvePct: 50,
        supplyTempC: c.setpointC,
        status: 'nominal',
      };
    }

    if (autoBoostPeer && peer && c.id === peer.id) {
      return {
        ...c,
        mode: 'Boost',
        fanSpeedPct: 96,
        chilledWaterValvePct: 94,
        setpointC: Math.min(c.setpointC, 18.5),
        coolingOutputKw: Number(clamp(c.coolingOutputKw * 1.85, 1800, c.maxCoolingKw).toFixed(1)),
        status: 'warning',
      };
    }

    return c;
  });

  // Update environmental loop status immediately for the affected hall
  const hallUnits = nextCracUnits.filter((c) => c.hallId === target.hallId);
  const loopAOk = hallUnits.some((c) => c.chilledLoop === 'Loop A' && c.mode !== 'Fault');
  const loopBOk = hallUnits.some((c) => c.chilledLoop === 'Loop B' && c.mode !== 'Fault');
  const chilledLoopStatus =
    loopAOk && loopBOk
      ? 'Loop A + B Active'
      : loopBOk
      ? 'Loop B Failover'
      : loopAOk
      ? 'Loop A Failover'
      : 'Dual Loop Fault';

  return {
    ...bms,
    cracUnits: nextCracUnits,
    envSensors: bms.envSensors.map((env) =>
      env.hallId === target.hallId ? { ...env, chilledLoopStatus } : env
    ),
    commandLog: [...extraLogs, ...bms.commandLog].slice(0, 40),
  };
}

export function toggleUpsFault(bms: BmsState, upsId: string, now: number): BmsState {
  const modbusOnline = isProtocolOnline(bms, 'Modbus TCP');
  const target = bms.upsSystems.find((u) => u.id === upsId);
  if (!target) return bms;

  const nextFault = target.mode !== 'Fault';
  const entry: BmsCommandLogEntry = {
    id: `cmd-ups-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now,
    source: 'Operator',
    protocol: 'Modbus TCP',
    targetDevice: target.name,
    command: nextFault
      ? `Simulate Module Isolation Fault -> 2(N+1) Redundant Peers Absorb ${target.feedBus} Load`
      : `Restore ${target.name} Online -> Rebalance 2(N+1) Load Sharing`,
    result: modbusOnline ? 'Applied' : 'Blocked (Gateway Offline)',
  };

  if (!modbusOnline) {
    return {
      ...bms,
      commandLog: [entry, ...bms.commandLog].slice(0, 40),
    };
  }

  const totalLoad = bms.upsSystems.reduce((sum, u) => sum + u.loadKw, 0);
  const nextUnits = bms.upsSystems.map((u) => {
    if (u.id !== upsId) return u;
    if (nextFault) {
      return {
        ...u,
        mode: 'Fault' as const,
        loadKw: 0,
        status: 'critical' as const,
      };
    }
    return {
      ...u,
      mode: bms.utilityFeed === 'Utility Outage · UPS Battery' ? ('On Battery' as const) : bms.utilityFeed === 'Generator Backup' ? ('Generator Sync' as const) : ('Online' as const),
      status: bms.utilityFeed === 'Utility Normal' ? ('nominal' as const) : ('warning' as const),
    };
  });

  const healthyCount = nextUnits.filter((u) => u.mode !== 'Fault').length;
  const shareKw = healthyCount > 0 ? Number((totalLoad / healthyCount).toFixed(1)) : 0;

  return {
    ...bms,
    upsSystems: nextUnits.map((u) =>
      u.mode === 'Fault' ? u : { ...u, loadKw: shareKw }
    ),
    commandLog: [entry, ...bms.commandLog].slice(0, 40),
  };
}

function rebalanceChillerPlant(chillers: ChillerUnit[], cracUnits: CracUnit[], tickCount: number): ChillerUnit[] {
  const loopADemandKw = cracUnits
    .filter((c) => c.chilledLoop === 'Loop A')
    .reduce((sum, c) => sum + c.coolingOutputKw, 0);
  const loopBDemandKw = cracUnits
    .filter((c) => c.chilledLoop === 'Loop B')
    .reduce((sum, c) => sum + c.coolingOutputKw, 0);

  const demandByLoop: Record<'Loop A' | 'Loop B', number> = {
    'Loop A': Math.max(4500, loopADemandKw),
    'Loop B': Math.max(4500, loopBDemandKw),
  };

  // Determine standby wake-up per loop: wake N+1 air chiller if any chiller on that loop is Faulted
  const loopHasFault: Record<'Loop A' | 'Loop B', boolean> = {
    'Loop A': chillers.some((ch) => ch.chilledLoop === 'Loop A' && ch.mode === 'Fault'),
    'Loop B': chillers.some((ch) => ch.chilledLoop === 'Loop B' && ch.mode === 'Fault'),
  };

  // Water chiller peer boost if the other water chiller is faulted
  const anyWaterFault = chillers.some((ch) => ch.chillerType === 'Water-Cooled' && ch.mode === 'Fault');

  return chillers.map((ch, idx) => {
    if (ch.mode === 'Fault') {
      return {
        ...ch,
        coolingOutputKw: 0,
        compressorLoadPct: 0,
        chwSupplyTempC: 14.8,
        chwReturnTempC: 15.2,
        waterFlowLps: 0,
        fanSpeedPct: 0,
        status: 'critical' as const,
      };
    }

    const loopDemand = demandByLoop[ch.chilledLoop];
    const loopFault = loopHasFault[ch.chilledLoop];
    const loopWaterHealthy = chillers.some(
      (x) => x.chilledLoop === ch.chilledLoop && x.chillerType === 'Water-Cooled' && x.mode !== 'Fault'
    );
    const activeAirOnLoop = chillers.filter(
      (x) =>
        x.chilledLoop === ch.chilledLoop &&
        x.chillerType === 'Air-Cooled' &&
        x.mode !== 'Fault' &&
        (x.role === 'Primary' || loopFault)
    );

    const wave = Math.sin(tickCount * 0.3 + idx * 0.9) * 0.15;

    if (ch.chillerType === 'Water-Cooled') {
      // Water chiller takes ~58% baseload on its loop, or boosts to ~75% if peer water chiller or air chillers are faulted
      const waterShare = anyWaterFault ? 0.78 : activeAirOnLoop.length < 5 ? 0.75 : 0.58;
      const targetKw = clamp(
        loopDemand * waterShare + (anyWaterFault ? 2100 : 0),
        1800,
        ch.capacityKw * 0.96
      );
      const loadPct = Math.round((targetKw / ch.capacityKw) * 100);
      const mode = anyWaterFault || loadPct >= 75 ? ('Boost' as const) : ('Running' as const);
      const supplyC = Number(clamp(7.0 + (loadPct / 100) * 1.1 + wave, 6.4, 9.8).toFixed(1));
      const returnC = Number(clamp(supplyC + 5.2 + (loadPct / 100) * 2.4, 11.5, 16.5).toFixed(1));
      return {
        ...ch,
        mode,
        coolingOutputKw: Number(targetKw.toFixed(1)),
        compressorLoadPct: loadPct,
        chwSupplyTempC: supplyC,
        chwReturnTempC: returnC,
        condenserOrAmbientTempC: Number(clamp(28.8 + (loadPct / 100) * 2.6 + wave, 27.0, 34.0).toFixed(1)),
        cop: Number(clamp(6.8 - (loadPct / 100) * 0.9, 5.4, 6.9).toFixed(1)),
        waterFlowLps: Math.round(clamp(120 + (loadPct / 100) * 220, 110, 360)),
        fanSpeedPct: Math.round(clamp(38 + loadPct * 0.58, 35, 98)),
        status: mode === 'Boost' ? ('warning' as const) : ('nominal' as const),
      };
    }

    // Air-Cooled Chiller
    const shouldRun = ch.role === 'Primary' || loopFault;
    if (!shouldRun) {
      return {
        ...ch,
        mode: 'Standby' as const,
        coolingOutputKw: 0,
        compressorLoadPct: 0,
        chwSupplyTempC: 8.2,
        chwReturnTempC: 12.0,
        condenserOrAmbientTempC: Number((31.6 + wave).toFixed(1)),
        cop: 4.0,
        waterFlowLps: 0,
        fanSpeedPct: 12,
        status: 'nominal' as const,
      };
    }

    const airPoolDemand = loopWaterHealthy ? loopDemand * 0.42 : loopDemand * 0.95;
    const activeCount = Math.max(1, activeAirOnLoop.length);
    const targetKw = clamp(airPoolDemand / activeCount, 750, ch.capacityKw * 0.96);
    const loadPct = Math.round((targetKw / ch.capacityKw) * 100);
    const mode = !loopWaterHealthy || loadPct >= 75 ? ('Boost' as const) : ('Running' as const);
    const supplyC = Number(clamp(7.3 + (loadPct / 100) * 1.3 + wave, 6.8, 10.6).toFixed(1));
    const returnC = Number(clamp(supplyC + 4.8 + (loadPct / 100) * 2.5, 11.8, 17.2).toFixed(1));
    return {
      ...ch,
      mode,
      coolingOutputKw: Number(targetKw.toFixed(1)),
      compressorLoadPct: loadPct,
      chwSupplyTempC: supplyC,
      chwReturnTempC: returnC,
      condenserOrAmbientTempC: Number(clamp(31.5 + wave * 2, 29.0, 36.0).toFixed(1)),
      cop: Number(clamp(4.2 - (loadPct / 100) * 0.7, 3.2, 4.3).toFixed(1)),
      waterFlowLps: 0,
      fanSpeedPct: Math.round(clamp(40 + loadPct * 0.6, 36, 100)),
      status: mode === 'Boost' ? ('warning' as const) : ('nominal' as const),
    };
  });
}

export function toggleChillerFault(bms: BmsState, chillerId: string, now: number): BmsState {
  const bacnetOnline = isProtocolOnline(bms, 'BACnet/IP');
  const target = bms.chillers.find((ch) => ch.id === chillerId);
  if (!target) return bms;

  const nextFault = target.mode !== 'Fault';
  const entry: BmsCommandLogEntry = {
    id: `cmd-ch-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now,
    source: 'Operator',
    protocol: 'BACnet/IP',
    targetDevice: target.name,
    command: nextFault
      ? `Simulate ${target.chillerType} Fault -> Auto-Engage ${target.chilledLoop} N+1 Reserve & Peer Boost`
      : `Restore ${target.name} Online -> Rebalance 2 Water + 14 Air Chiller Plant`,
    result: bacnetOnline ? 'Applied' : 'Blocked (Gateway Offline)',
  };

  if (!bacnetOnline) {
    return {
      ...bms,
      commandLog: [entry, ...bms.commandLog].slice(0, 40),
    };
  }

  const toggled: ChillerUnit[] = bms.chillers.map((ch) =>
    ch.id === chillerId
      ? {
          ...ch,
          mode: nextFault ? ('Fault' as const) : ch.role === 'Redundant (N+1)' ? ('Standby' as const) : ('Running' as const),
          status: nextFault ? ('critical' as const) : ('nominal' as const),
        }
      : ch
  );

  const rebalanced = rebalanceChillerPlant(toggled, bms.cracUnits, 1);

  return {
    ...bms,
    chillers: rebalanced,
    commandLog: [entry, ...bms.commandLog].slice(0, 40),
  };
}

export function toggleChwPumpSetMode(bms: BmsState, pumpSetId: string, now: number): BmsState {
  const bacnetOnline = isProtocolOnline(bms, 'BACnet/IP');
  const target = bms.chwTankPumpSets.find((p) => p.id === pumpSetId);
  if (!target) return bms;

  const nextMode = target.mode === 'Auto' ? 'Boost' : target.mode === 'Boost' ? 'Fault' : 'Auto';
  const entry: BmsCommandLogEntry = {
    id: `cmd-chwp-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now,
    source: 'Operator',
    protocol: 'BACnet/IP',
    targetDevice: target.name,
    command:
      nextMode === 'Boost'
        ? 'Engage All 3/3 Rooftop CHW VFD Pumps (Boost Pressure 4.9 bar)'
        : nextMode === 'Fault'
        ? 'Simulate Pump Skid Isolation Fault -> Peer Loop & Buffer Tank Ride-Through'
        : 'Restore Rooftop CHW Tank & 2+1 VFD Pump Skid to Auto Mode',
    result: bacnetOnline ? 'Applied' : 'Blocked (Gateway Offline)',
  };

  if (!bacnetOnline) {
    return { ...bms, commandLog: [entry, ...bms.commandLog].slice(0, 40) };
  }

  return {
    ...bms,
    chwTankPumpSets: bms.chwTankPumpSets.map((p) => {
      if (p.id !== pumpSetId) return p;
      if (nextMode === 'Fault') {
        return {
          ...p,
          mode: 'Fault',
          activePumps: 0,
          flowRateLps: 0,
          dischargePressureBar: 0.4,
          vfdSpeedPct: 0,
          pumpPowerKw: 0,
          status: 'critical',
        };
      }
      if (nextMode === 'Boost') {
        return {
          ...p,
          mode: 'Boost',
          activePumps: 3,
          flowRateLps: 310,
          dischargePressureBar: 4.9,
          vfdSpeedPct: 94,
          pumpPowerKw: 265,
          status: 'warning',
        };
      }
      return {
        ...p,
        mode: 'Auto',
        activePumps: 2,
        flowRateLps: 218,
        dischargePressureBar: 4.3,
        vfdSpeedPct: 68,
        pumpPowerKw: 142,
        status: 'nominal',
      };
    }),
    commandLog: [entry, ...bms.commandLog].slice(0, 40),
  };
}

export function refillDieselTank(bms: BmsState, tankId: string, now: number): BmsState {
  const modbusOnline = isProtocolOnline(bms, 'Modbus TCP');
  const target = bms.dieselTanks.find((t) => t.id === tankId);
  if (!target) return bms;

  const entry: BmsCommandLogEntry = {
    id: `cmd-fuel-refill-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    timestamp: now,
    source: 'Operator',
    protocol: 'Modbus TCP',
    targetDevice: `${target.name} (${target.vaultZone})`,
    command: `Top-Up Bulk Diesel Tank to 98.5% (${Math.round(target.capacityLiters * 0.985).toLocaleString()} L) & Clear Interstitial Check`,
    result: modbusOnline ? 'Applied' : 'Blocked (Gateway Offline)',
  };

  if (!modbusOnline) {
    return { ...bms, commandLog: [entry, ...bms.commandLog].slice(0, 40) };
  }

  return {
    ...bms,
    dieselTanks: bms.dieselTanks.map((t) =>
      t.id === tankId
        ? {
            ...t,
            levelPct: 98.5,
            currentLiters: Math.round(t.capacityLiters * 0.985),
            interstitialLeakDetected: false,
            transferPumpMode: t.transferPumpMode === 'Fault' ? 'Auto Standby' : t.transferPumpMode,
            status: 'nominal',
          }
        : t
    ),
    commandLog: [entry, ...bms.commandLog].slice(0, 40),
  };
}

export function toggleDieselTankPump(bms: BmsState, tankId: string, now: number): BmsState {
  const modbusOnline = isProtocolOnline(bms, 'Modbus TCP');
  const target = bms.dieselTanks.find((t) => t.id === tankId);
  if (!target) return bms;

  const nextMode =
    target.transferPumpMode === 'Auto Standby'
      ? 'Transferring'
      : target.transferPumpMode === 'Transferring'
      ? 'Polishing'
      : 'Auto Standby';

  const entry: BmsCommandLogEntry = {
    id: `cmd-fuel-pump-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    timestamp: now,
    source: 'Operator',
    protocol: 'Modbus TCP',
    targetDevice: `${target.name} Duplex Transfer Skid`,
    command: `Set Basement Diesel Transfer Pump Mode = ${nextMode} (Feed: ${target.servedGenerators.join(' / ')})`,
    result: modbusOnline ? 'Applied' : 'Blocked (Gateway Offline)',
  };

  if (!modbusOnline) {
    return { ...bms, commandLog: [entry, ...bms.commandLog].slice(0, 40) };
  }

  return {
    ...bms,
    dieselTanks: bms.dieselTanks.map((t) =>
      t.id === tankId
        ? {
            ...t,
            transferPumpMode: nextMode,
            supplyPressureBar: nextMode === 'Transferring' ? 3.4 : nextMode === 'Polishing' ? 2.4 : 2.1,
            status: nextMode === 'Transferring' ? 'warning' : 'nominal',
          }
        : t
    ),
    commandLog: [entry, ...bms.commandLog].slice(0, 40),
  };
}

export function triggerUtilityOutageDrill(bms: BmsState, now: number): BmsState {
  const modbusOnline = isProtocolOnline(bms, 'Modbus TCP');
  const entry: BmsCommandLogEntry = {
    id: `cmd-outage-${now.toString(36)}`,
    timestamp: now,
    source: 'Operator',
    protocol: 'Modbus TCP',
    targetDevice: 'ATS-A & ATS-B / 2(N+1) UPS',
    command: 'Simulate Dual-Substation Outage -> 2(N+1) UPS Battery Bridge & Crank GEN-A1–A3 + GEN-B1–B3',
    result: modbusOnline ? 'Applied' : 'Blocked (Gateway Offline)',
  };
  if (!modbusOnline) {
    return { ...bms, commandLog: [entry, ...bms.commandLog].slice(0, 40) };
  }

  return {
    ...bms,
    utilityFeed: 'Utility Outage · UPS Battery',
    utilityFeedAOnline: false,
    utilityFeedBOnline: false,
    outageTicksElapsed: 0,
    upsSystems: bms.upsSystems.map((u) =>
      u.mode === 'Fault'
        ? u
        : {
            ...u,
            mode: 'On Battery',
            inputVoltageV: 0,
            batterySocPct: Math.max(85, u.batterySocPct - 3),
            status: 'critical',
          }
    ),
    generators: bms.generators.map((g) =>
      g.role === 'Primary' ? { ...g, state: 'Cranking', coolantTempC: 58.0 } : g
    ),
    commandLog: [entry, ...bms.commandLog].slice(0, 40),
  };
}

export function restoreUtilityPower(bms: BmsState, now: number): BmsState {
  const entry: BmsCommandLogEntry = {
    id: `cmd-restore-${now.toString(36)}`,
    timestamp: now,
    source: 'Operator',
    protocol: 'Modbus TCP',
    targetDevice: 'ATS-A & ATS-B / GEN-A1–A4 & GEN-B1–B4',
    command: 'Dual Utility Substations Synchronized -> Retransfer Load to 2N Grid & Cooldown Generators',
    result: 'Applied',
  };

  return {
    ...bms,
    utilityFeed: 'Utility Normal',
    utilityFeedAOnline: true,
    utilityFeedBOnline: true,
    outageTicksElapsed: 0,
    upsSystems: bms.upsSystems.map((u) =>
      u.mode === 'Fault'
        ? u
        : {
            ...u,
            mode: 'Online',
            inputVoltageV: 480.0,
            batterySocPct: Math.min(100, u.batterySocPct + 4),
            status: 'nominal',
          }
    ),
    generators: bms.generators.map((g) => ({
      ...g,
      state: 'Standby Ready',
      outputKw: 0,
      coolantTempC: 44.0,
    })),
    commandLog: [entry, ...bms.commandLog].slice(0, 40),
  };
}

export function toggleLeakSensorFault(bms: BmsState, hallId: HallId, now: number): BmsState {
  const target = bms.envSensors.find((e) => e.hallId === hallId);
  if (!target) return bms;
  const nextLeak = !target.leakDetected;
  const entry: BmsCommandLogEntry = {
    id: `cmd-leak-${now.toString(36)}`,
    timestamp: now,
    source: 'Operator',
    protocol: 'SNMP v3',
    targetDevice: `Leak Rope 2N · ${target.hallLabel}`,
    command: nextLeak
      ? 'Simulate Under-Floor Chilled Water Leak Probe Alarm'
      : 'Clear Water Leak Alarm & Dry Probe Verified',
    result: 'Applied',
  };

  return {
    ...bms,
    envSensors: bms.envSensors.map((e) =>
      e.hallId === hallId ? { ...e, leakDetected: nextLeak } : e
    ),
    commandLog: [entry, ...bms.commandLog].slice(0, 40),
  };
}

export function toggleColdAisleSlaExcursion(bms: BmsState, hallId: HallId, now: number): BmsState {
  const target = bms.envSensors.find((e) => e.hallId === hallId);
  if (!target) return bms;
  const nextExcursion = !target.slaExcursionActive;
  const nextTemp = nextExcursion ? 28.6 : 21.4;
  const nextHum = nextExcursion ? 64.5 : 46.0;
  const tempStatus = evaluateSlaMetricStatus(nextTemp, target.slaTempMinC, target.slaTempMaxC, 1.5);
  const humStatus = evaluateSlaMetricStatus(
    nextHum,
    target.slaHumidityMinPct,
    target.slaHumidityMaxPct,
    3.0
  );

  const entry: BmsCommandLogEntry = {
    id: `cmd-sla-${now.toString(36)}`,
    timestamp: now,
    source: 'Operator',
    protocol: 'SNMP v3',
    targetDevice: `${target.slaProbeAId}/${target.slaProbeBId} (${target.hallLabel})`,
    command: nextExcursion
      ? `Simulate Cold Aisle SLA Breach (${nextTemp.toFixed(1)}°C / ${nextHum.toFixed(1)}% RH)`
      : `Clear Cold Aisle SLA Excursion -> Probes In-Band (${nextTemp.toFixed(1)}°C / ${nextHum.toFixed(1)}% RH)`,
    result: 'Applied',
  };

  return {
    ...bms,
    envSensors: bms.envSensors.map((e) =>
      e.hallId === hallId
        ? {
            ...e,
            slaExcursionActive: nextExcursion,
            coldAisleTempC: nextTemp,
            probeATempC: Number((nextTemp - 0.1).toFixed(1)),
            probeBTempC: Number((nextTemp + 0.1).toFixed(1)),
            humidityPct: nextHum,
            probeAHumidityPct: Number((nextHum - 0.2).toFixed(1)),
            probeBHumidityPct: Number((nextHum + 0.2).toFixed(1)),
            dewPointC: computeDewPointC(nextTemp, nextHum),
            tempSlaStatus: tempStatus,
            humiditySlaStatus: humStatus,
            slaCompliancePct: nextExcursion ? Number(Math.max(98.5, e.slaCompliancePct - 0.12).toFixed(2)) : 99.99,
          }
        : e
    ),
    commandLog: [entry, ...bms.commandLog].slice(0, 40),
  };
}

export function toggleGatewayConnection(bms: BmsState, gatewayId: string, now: number): BmsState {
  const target = bms.gateways.find((g) => g.id === gatewayId);
  const nextConnected = target ? !target.connected : true;
  const peer = target ? bms.gateways.find((g) => g.id === target.peerGatewayId) : undefined;

  const entry: BmsCommandLogEntry | null = target
    ? {
        id: `cmd-gw-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        timestamp: now,
        source: 'Operator',
        protocol: target.protocol,
        targetDevice: target.name,
        command: nextConnected
          ? `Restore ${target.protocol} Gateway -> 2N Active/Standby Sync Restored`
          : peer?.connected
          ? `Gateway Offline -> Tier IV Automatic Failover to ${peer.name} (Zero Telemetry Loss)`
          : `Both ${target.protocol} Gateways Offline -> Control Writes Blocked`,
        result: 'Applied',
      }
    : null;

  return {
    ...bms,
    gateways: bms.gateways.map((gw) =>
      gw.id === gatewayId
        ? { ...gw, connected: !gw.connected, lastSyncAt: !gw.connected ? now : gw.lastSyncAt }
        : gw
    ),
    commandLog: entry ? [entry, ...bms.commandLog].slice(0, 40) : bms.commandLog,
  };
}

export interface BmsTickResult {
  bms: BmsState;
  adjustedServers: ServerNode[];
  alerts: ActiveAlert[];
  newAlerts: ActiveAlert[];
  newDispatches: DispatchLogEntry[];
  updatedChannels: NotificationChannel[];
}

export function stepBmsAndCoupling(params: {
  bms: BmsState;
  servers: ServerNode[];
  alerts: ActiveAlert[];
  channels: NotificationChannel[];
  tickCount: number;
  now: number;
}): BmsTickResult {
  const { servers, alerts, channels, tickCount, now } = params;
  let bms = params.bms;

  const bacnetOnline = isProtocolOnline(bms, 'BACnet/IP');
  const modbusOnline = isProtocolOnline(bms, 'Modbus TCP');
  const snmpOnline = isProtocolOnline(bms, 'SNMP v3');

  // 1. Closed-loop DCIM -> BMS automation: auto-boost hall CRAC pair if any server exhaust >= 78°C OR peer CRAC is in Fault
  if (bms.closedLoopCoolingEnabled && bacnetOnline) {
    for (const crac of bms.cracUnits) {
      if (crac.mode === 'Fault') continue;
      const peer = bms.cracUnits.find((c) => c.id === crac.peerCracId);
      const peerFaulted = peer?.mode === 'Fault';
      const hallServers = servers.filter(
        (s) => s.hallId === crac.hallId && s.status !== 'maintenance'
      );
      const peakHallTemp =
        hallServers.length > 0 ? Math.max(...hallServers.map((s) => s.tempC)) : 45;

      if ((peakHallTemp >= 78 || peerFaulted) && crac.mode !== 'Boost') {
        bms = setCracMode(
          bms,
          crac.id,
          'Boost',
          'Closed-Loop Automation',
          now,
          peerFaulted
            ? `2N Failover covering ${peer?.name} fault`
            : `Peak ${peakHallTemp.toFixed(1)}°C in ${crac.hallLabel}`
        );
      } else if (peakHallTemp < 66 && !peerFaulted && crac.mode === 'Boost') {
        bms = setCracMode(
          bms,
          crac.id,
          'Auto',
          'Closed-Loop Automation',
          now,
          `Hall stabilized (${peakHallTemp.toFixed(1)}°C)`
        );
      }
    }
  }

  // 2. Step CRAC units (2N paired per hall, coupled to campus hall IT load)
  const hallBaseLoadKw: Record<HallId, number> = {
    'hall-a': 3200,
    'hall-b': 5200,
    'hall-c': 3100,
    'hall-d': 3600,
  };

  const nextCracUnits = bms.cracUnits.map((crac, idx) => {
    if (!bacnetOnline) return crac;
    const peer = bms.cracUnits.find((c) => c.id === crac.peerCracId);
    const peerHealthy = peer ? peer.mode !== 'Fault' : false;
    const hallLiveKw =
      servers.filter((s) => s.hallId === crac.hallId).reduce((acc, s) => acc + s.powerW, 0) / 1000;
    const hallTotalKw = hallBaseLoadKw[crac.hallId] + hallLiveKw * 20;
    const unitShareKw = peerHealthy ? hallTotalKw * 0.5 : hallTotalKw;
    const wave = Math.sin(tickCount * 0.35 + idx) * 0.25;

    if (crac.mode === 'Fault') {
      const supply = Number(clamp(crac.supplyTempC + 0.35, 25.0, 31.5).toFixed(1));
      return {
        ...crac,
        supplyTempC: supply,
        returnTempC: Number(clamp(supply + 12.5, 34, 46).toFixed(1)),
        fanSpeedPct: 0,
        chilledWaterValvePct: 0,
        coolingOutputKw: 0,
        status: 'critical' as const,
      };
    }

    const targetSupply = crac.mode === 'Boost' ? crac.setpointC - 0.8 : crac.setpointC;
    const nextSupply = Number(
      clamp(crac.supplyTempC + (targetSupply - crac.supplyTempC) * 0.35 + wave * 0.3, 15.5, 28.0).toFixed(1)
    );
    const deltaT = 8.8 + (unitShareKw / crac.maxCoolingKw) * 11.0;
    const nextReturn = Number(clamp(nextSupply + deltaT, 24.0, 44.0).toFixed(1));
    const nextFan =
      crac.mode === 'Boost'
        ? Math.round(clamp(93 + wave * 4, 86, 100))
        : Math.round(clamp(44 + (unitShareKw / crac.maxCoolingKw) * 48 + (22 - crac.setpointC) * 2.5, 35, 92));
    const nextValve =
      crac.mode === 'Boost'
        ? Math.round(clamp(90 + wave * 4, 82, 100))
        : Math.round(clamp(38 + (unitShareKw / crac.maxCoolingKw) * 50 + (22 - crac.setpointC) * 2.5, 25, 95));
    const coolingKw = Number(
      clamp(unitShareKw * 1.12 + (crac.mode === 'Boost' ? 350 : 80), 400, crac.maxCoolingKw).toFixed(1)
    );
    const humidity = Number(clamp(crac.humidityPct + wave * 0.4, 38, 56).toFixed(1));

    const status: 'nominal' | 'warning' | 'critical' =
      nextSupply >= 25.5 ? 'critical' : crac.mode === 'Boost' || nextSupply >= 23.5 ? 'warning' : 'nominal';

    if (crac.coolingType === 'Liquid CDU') {
      const flowLpm = Math.round(
        clamp(680 + (coolingKw / crac.maxCoolingKw) * 1120 + (crac.mode === 'Boost' ? 180 : 0), 620, 2100)
      );
      const coolantSupC = Number(clamp(nextSupply + 3.8 + wave * 0.25, 20.5, 29.5).toFixed(1));
      const coolantRetC = Number(
        clamp(coolantSupC + 8.5 + (coolingKw / crac.maxCoolingKw) * 7.2, 28.0, 44.5).toFixed(1)
      );
      const deltaP = Number(clamp(1.25 + (flowLpm / 2100) * 1.15, 1.1, 2.5).toFixed(2));
      const hxEff = Number(clamp(95.4 - (coolingKw / crac.maxCoolingKw) * 1.6, 92.0, 96.2).toFixed(1));
      return {
        ...crac,
        supplyTempC: nextSupply,
        returnTempC: nextReturn,
        fanSpeedPct: nextFan,
        chilledWaterValvePct: nextValve,
        coolingOutputKw: coolingKw,
        humidityPct: humidity,
        coolantFlowLpm: flowLpm,
        coolantSupplyTempC: coolantSupC,
        coolantReturnTempC: coolantRetC,
        deltaPBar: deltaP,
        glycolMixPct: crac.glycolMixPct ?? 25,
        heatExchangerEffPct: hxEff,
        status,
      };
    }

    return {
      ...crac,
      supplyTempC: nextSupply,
      returnTempC: nextReturn,
      fanSpeedPct: nextFan,
      chilledWaterValvePct: nextValve,
      coolingOutputKw: coolingKw,
      humidityPct: humidity,
      status,
    };
  });

  // 2b. Step Central Chiller Plant (2 Water-Cooled + 6 Air-Cooled Chillers) coupled to Loop A & Loop B cooling demand
  const nextChillers = bacnetOnline
    ? rebalanceChillerPlant(bms.chillers, nextCracUnits, tickCount)
    : bms.chillers;

  // 2c. Step Rooftop Water Chiller Buffer Tanks & Complete VFD Pump Sets coupled to Water Chillers CHW-01 / CHW-02
  const nextChwTankPumpSets: ChwTankPumpSet[] = bms.chwTankPumpSets.map((ps, idx) => {
    if (!bacnetOnline) return ps;
    if (ps.mode === 'Fault') {
      return {
        ...ps,
        activePumps: 0,
        flowRateLps: 0,
        dischargePressureBar: 0.4,
        vfdSpeedPct: 0,
        pumpPowerKw: 0,
        status: 'critical',
      };
    }
    const servedChiller = nextChillers.find((ch) => ch.id === ps.servedChillerId);
    const peerPumpFault = bms.chwTankPumpSets.some((other) => other.id !== ps.id && other.mode === 'Fault');
    const isBoost = ps.mode === 'Boost' || peerPumpFault || servedChiller?.mode === 'Boost';
    const baseFlow = servedChiller && servedChiller.waterFlowLps > 0 ? servedChiller.waterFlowLps : 195;
    const flowLps = Math.round(clamp(baseFlow * (isBoost ? 1.24 : 1.0), 120, 340));
    const vfdPct = Math.round(clamp(46 + (flowLps / 340) * 50, 42, 98));
    const activePumps = isBoost || flowLps >= 255 ? 3 : 2;
    const pressureBar = Number(clamp(3.6 + (vfdPct / 100) * 1.4, 3.4, 5.1).toFixed(1));
    const pumpKw = Number(clamp(activePumps * 42 + (vfdPct / 100) * 95, 78, 310).toFixed(1));
    const waterTemp = servedChiller ? servedChiller.chwSupplyTempC : ps.waterTempC;
    const levelPct = Number(
      clamp(ps.tankLevelPct + Math.sin(tickCount * 0.25 + idx) * 0.08, 92.5, 98.5).toFixed(1)
    );
    return {
      ...ps,
      tankLevelPct: levelPct,
      waterTempC: waterTemp,
      activePumps,
      flowRateLps: flowLps,
      dischargePressureBar: pressureBar,
      vfdSpeedPct: vfdPct,
      pumpPowerKw: pumpKw,
      status: isBoost ? 'warning' : 'nominal',
    };
  });

  // 3. Step Utility / 2(N+1) UPS / 2(N+1) Generator power chain
  let nextUtility = bms.utilityFeed;
  let nextOutageTicks = bms.outageTicksElapsed;
  let nextGenerators = bms.generators;
  let nextUps = bms.upsSystems;

  if (modbusOnline) {
    const liveServerKw = servers.reduce((acc, s) => acc + s.powerW, 0) / 1000;
    const campusItKw = 15050 + liveServerKw;
    const totalCoolingMechKw = nextCracUnits.reduce((sum, c) => sum + c.coolingOutputKw * 0.14, 0);
    const totalFacilityUpsLoadKw = campusItKw + totalCoolingMechKw * 0.15;
    const healthyUpsCount = Math.max(1, bms.upsSystems.filter((u) => u.mode !== 'Fault').length);
    const perUpsShare = Number((totalFacilityUpsLoadKw / healthyUpsCount).toFixed(1));
    const primaryGenCount = Math.max(1, bms.generators.filter((g) => g.role === 'Primary').length);
    const perPrimaryGenLoad = Number(((campusItKw + totalCoolingMechKw) / primaryGenCount).toFixed(1));

    if (bms.utilityFeed === 'Utility Outage · UPS Battery') {
      nextOutageTicks += 1;
      // After 3 ticks (~9 seconds), Path A (GEN-A1–A3) and Path B (GEN-B1–B3) complete warm-up and take independent buses
      if (nextOutageTicks >= 3) {
        nextUtility = 'Generator Backup';
        nextGenerators = bms.generators.map((g) =>
          g.role === 'Primary'
            ? {
                ...g,
                state: 'Running · On Load',
                outputKw: perPrimaryGenLoad,
                coolantTempC: 81.5,
                fuelLevelPct: Number(Math.max(10, g.fuelLevelPct - 0.15).toFixed(1)),
              }
            : g
        );
        nextUps = bms.upsSystems.map((u) =>
          u.mode === 'Fault'
            ? u
            : {
                ...u,
                mode: 'Generator Sync',
                loadKw: perUpsShare,
                inputVoltageV: 478.6,
                batterySocPct: Number(clamp(u.batterySocPct + 0.5, 10, 100).toFixed(1)),
                status: 'warning',
              }
        );
      } else {
        nextUps = bms.upsSystems.map((u) => {
          if (u.mode === 'Fault') return u;
          const nextSoc = Number(clamp(u.batterySocPct - 2.2, 5, 100).toFixed(1));
          return {
            ...u,
            mode: 'On Battery',
            loadKw: perUpsShare,
            inputVoltageV: 0,
            batterySocPct: nextSoc,
            runtimeMin: Math.max(2, Math.round((nextSoc / 100) * 46)),
            status: 'critical',
          };
        });
        nextGenerators = bms.generators.map((g) =>
          g.role === 'Primary'
            ? { ...g, state: 'Cranking', coolantTempC: Number((g.coolantTempC + 6.5).toFixed(1)) }
            : g
        );
      }
    } else if (bms.utilityFeed === 'Generator Backup') {
      nextOutageTicks += 1;
      nextGenerators = bms.generators.map((g, idx) =>
        g.role === 'Primary'
          ? {
              ...g,
              state: 'Running · On Load',
              outputKw: perPrimaryGenLoad,
              coolantTempC: Number(clamp(82 + Math.sin(tickCount * 0.4 + idx) * 1.2, 78, 88).toFixed(1)),
              fuelLevelPct: Number(Math.max(5, g.fuelLevelPct - 0.12).toFixed(1)),
            }
          : g
      );
      nextUps = bms.upsSystems.map((u) =>
        u.mode === 'Fault'
          ? u
          : {
              ...u,
              mode: 'Generator Sync',
              loadKw: perUpsShare,
              inputVoltageV: 479.1,
              batterySocPct: Number(clamp(u.batterySocPct + 1.0, 10, 100).toFixed(1)),
              runtimeMin: Math.round((u.batterySocPct / 100) * 48),
              status: 'warning',
            }
      );
    } else {
      nextUps = bms.upsSystems.map((u, idx) =>
        u.mode === 'Fault'
          ? u
          : {
              ...u,
              mode: 'Online',
              loadKw: Number((perUpsShare + (idx % 2 === 0 ? 14 : -14)).toFixed(1)),
              inputVoltageV: Number((480 + Math.sin(tickCount * 0.3 + idx) * 0.5).toFixed(1)),
              batterySocPct: Number(clamp(u.batterySocPct + 1.5, 0, 100).toFixed(1)),
              runtimeMin: Math.round((u.batterySocPct / 100) * 49),
              status: 'nominal',
            }
      );
    }
  }

  // 3b. Step Basement 8 Diesel Tanks coupled to running Path A / Path B generators
  const genARunning = nextGenerators.some(
    (g) => g.redundancyPath === 'Path A' && (g.state === 'Running · On Load' || g.state === 'Cranking')
  );
  const genBRunning = nextGenerators.some(
    (g) => g.redundancyPath === 'Path B' && (g.state === 'Running · On Load' || g.state === 'Cranking')
  );

  const nextDieselTanks: DieselTankUnit[] = bms.dieselTanks.map((tank, idx) => {
    if (!modbusOnline) return tank;
    const pathRunning = tank.redundancyPath === 'Path A' ? genARunning : genBRunning;
    const isManualTransfer = tank.transferPumpMode === 'Transferring';
    const nextPumpMode = pathRunning
      ? ('Transferring' as const)
      : tank.transferPumpMode === 'Transferring' && nextUtility === 'Utility Normal'
      ? ('Auto Standby' as const)
      : tank.transferPumpMode;
    const drainLiters = pathRunning ? 38 : isManualTransfer ? 12 : 0;
    const nextLiters = Math.max(2500, Math.round(tank.currentLiters - drainLiters));
    const nextPct = Number(((nextLiters / Math.max(1, tank.capacityLiters)) * 100).toFixed(1));
    const nextPressure =
      nextPumpMode === 'Transferring'
        ? Number((3.4 + Math.sin(tickCount * 0.5 + idx) * 0.1).toFixed(1))
        : nextPumpMode === 'Polishing'
        ? 2.4
        : 2.1;
    const status: 'nominal' | 'warning' | 'critical' =
      tank.interstitialLeakDetected || nextPct < 25 || nextPumpMode === 'Fault'
        ? 'critical'
        : nextPct < 55 || nextPumpMode === 'Transferring'
        ? 'warning'
        : 'nominal';
    return {
      ...tank,
      currentLiters: nextLiters,
      levelPct: nextPct,
      supplyPressureBar: nextPressure,
      transferPumpMode: nextPumpMode,
      fuelTempC: Number(clamp(26.7 + (pathRunning ? 1.4 : 0) + Math.sin(tickCount * 0.2 + idx) * 0.2, 24, 34).toFixed(1)),
      status,
    };
  });

  // 3c. Step Tier IV 2N Electrical Distribution Chain: HV -> MSB -> OPSWB serving Electrical (IT) + Mechanical
  const elecPathAKw = nextUps
    .filter((u) => u.redundancyPath === 'Path A')
    .reduce((s, u) => s + u.loadKw, 0);
  const elecPathBKw = nextUps
    .filter((u) => u.redundancyPath === 'Path B')
    .reduce((s, u) => s + u.loadKw, 0);
  const chillerMechAKw = nextChillers
    .filter((ch) => ch.redundancyPath === 'Path A' && ch.cop > 0)
    .reduce((s, ch) => s + ch.coolingOutputKw / ch.cop, 0);
  const chillerMechBKw = nextChillers
    .filter((ch) => ch.redundancyPath === 'Path B' && ch.cop > 0)
    .reduce((s, ch) => s + ch.coolingOutputKw / ch.cop, 0);
  const cracMechAKw = nextCracUnits
    .filter((c) => c.redundancyPath === 'Path A')
    .reduce((s, c) => s + c.coolingOutputKw * 0.08, 0);
  const cracMechBKw = nextCracUnits
    .filter((c) => c.redundancyPath === 'Path B')
    .reduce((s, c) => s + c.coolingOutputKw * 0.08, 0);
  const pumpMechAKw = nextChwTankPumpSets
    .filter((p) => p.redundancyPath === 'Path A')
    .reduce((s, p) => s + p.pumpPowerKw, 0);
  const pumpMechBKw = nextChwTankPumpSets
    .filter((p) => p.redundancyPath === 'Path B')
    .reduce((s, p) => s + p.pumpPowerKw, 0);
  const fuelPumpAKw = nextDieselTanks
    .filter((t) => t.redundancyPath === 'Path A' && t.transferPumpMode !== 'Auto Standby')
    .length * 14;
  const fuelPumpBKw = nextDieselTanks
    .filter((t) => t.redundancyPath === 'Path B' && t.transferPumpMode !== 'Auto Standby')
    .length * 14;

  const mechPathAKw = Number((chillerMechAKw + cracMechAKw + pumpMechAKw + fuelPumpAKw).toFixed(1));
  const mechPathBKw = Number((chillerMechBKw + cracMechBKw + pumpMechBKw + fuelPumpBKw).toFixed(1));

  const nextElectricalSwitchgear: ElectricalSwitchgearNode[] = bms.electricalSwitchgear.map((node) => {
    if (!modbusOnline) return node;
    const isPathA = node.redundancyPath === 'Path A';
    const elecKw = Number((isPathA ? elecPathAKw : elecPathBKw).toFixed(1));
    const mechKw = isPathA ? mechPathAKw : mechPathBKw;
    const totalKw = Number((elecKw + mechKw).toFixed(1));
    const gridUp = isPathA ? bms.utilityFeedAOnline : bms.utilityFeedBOnline;

    if (node.stage === 'HV') {
      const hvOpen = !gridUp || nextUtility !== 'Utility Normal';
      return {
        ...node,
        activeLoadKw: hvOpen ? 0 : totalKw,
        electricalServeKw: hvOpen ? 0 : elecKw,
        mechanicalServeKw: hvOpen ? 0 : mechKw,
        breakerState: hvOpen ? 'Open' : 'Closed',
        status: hvOpen ? 'warning' : 'nominal',
      };
    }

    const isGenBackup = nextUtility === 'Generator Backup';
    const isBatteryBridge = nextUtility === 'Utility Outage · UPS Battery';
    return {
      ...node,
      activeLoadKw: totalKw,
      electricalServeKw: elecKw,
      mechanicalServeKw: mechKw,
      breakerState: isGenBackup ? 'Gen Sync' : 'Closed',
      status: isBatteryBridge || isGenBackup ? 'warning' : 'nominal',
    };
  });

  // 4. Sync environmental & Cold Aisle SLA 2N sensors from dual 2N hall CRAC pair (Loop A + Loop B)
  const nextEnvSensors = bms.envSensors.map((env, idx) => {
    if (!snmpOnline) return env;
    const hallCracs = nextCracUnits.filter((c) => c.hallId === env.hallId);
    const healthyCracs = hallCracs.filter((c) => c.mode !== 'Fault');
    const activeSet = healthyCracs.length > 0 ? healthyCracs : hallCracs;
    const avgSupply =
      activeSet.length > 0
        ? activeSet.reduce((s, c) => s + c.supplyTempC, 0) / activeSet.length
        : env.coldAisleTempC;
    const avgHum =
      activeSet.length > 0
        ? activeSet.reduce((s, c) => s + c.humidityPct, 0) / activeSet.length
        : env.humidityPct;
    const maxFan = activeSet.length > 0 ? Math.max(...activeSet.map((c) => c.fanSpeedPct)) : 50;

    const loopAOk = hallCracs.some((c) => c.chilledLoop === 'Loop A' && c.mode !== 'Fault');
    const loopBOk = hallCracs.some((c) => c.chilledLoop === 'Loop B' && c.mode !== 'Fault');
    const chilledLoopStatus =
      loopAOk && loopBOk
        ? ('Loop A + B Active' as const)
        : loopBOk
        ? ('Loop B Failover' as const)
        : loopAOk
        ? ('Loop A Failover' as const)
        : ('Dual Loop Fault' as const);

    const snmpGatewaysUp = bms.gateways.filter((g) => g.protocol === 'SNMP v3' && g.connected).length;
    const probeDrift = Number((Math.sin(tickCount * 0.4 + idx) * 0.15).toFixed(1));
    const coldAisleTempC = env.slaExcursionActive
      ? Number(clamp(28.6 + probeDrift, 27.8, 30.2).toFixed(1))
      : Number((avgSupply + 0.7).toFixed(1));
    const humidityPct = env.slaExcursionActive
      ? Number(clamp(64.5 + probeDrift * 2, 62.5, 68.0).toFixed(1))
      : Number(avgHum.toFixed(1));

    const tempSlaStatus = evaluateSlaMetricStatus(
      coldAisleTempC,
      env.slaTempMinC,
      env.slaTempMaxC,
      1.5
    );
    const humiditySlaStatus = evaluateSlaMetricStatus(
      humidityPct,
      env.slaHumidityMinPct,
      env.slaHumidityMaxPct,
      3.0
    );
    const breached = tempSlaStatus === 'Breached' || humiditySlaStatus === 'Breached';
    const nextCompliance = breached
      ? Number(Math.max(97.5, env.slaCompliancePct - 0.02).toFixed(2))
      : Number(Math.min(100.0, env.slaCompliancePct + 0.005).toFixed(2));

    return {
      ...env,
      coldAisleTempC,
      probeATempC: Number((coldAisleTempC - 0.1).toFixed(1)),
      probeBTempC: Number((coldAisleTempC + 0.1).toFixed(1)),
      humidityPct,
      probeAHumidityPct: Number((humidityPct - 0.2).toFixed(1)),
      probeBHumidityPct: Number((humidityPct + 0.2).toFixed(1)),
      dewPointC: computeDewPointC(coldAisleTempC, humidityPct),
      tempSlaStatus,
      humiditySlaStatus,
      slaCompliancePct: nextCompliance,
      differentialPressurePa: Number(clamp(17.5 + maxFan * 0.05, 12, 28).toFixed(1)),
      dualProbeStatus:
        snmpGatewaysUp >= 2 ? ('2N Dual Verified' as const) : ('Single Probe Degraded' as const),
      chilledLoopStatus,
    };
  });

  // 5. Update gateway sync timestamps & latency
  const nextGateways = bms.gateways.map((gw, idx) =>
    gw.connected
      ? {
          ...gw,
          latencyMs: Math.round(clamp(gw.latencyMs + Math.sin(tickCount + idx) * 2, 6, 32)),
          lastSyncAt: now,
        }
      : gw
  );

  // 6. Closed-loop BMS -> DCIM thermal coupling:
  //    In Tier IV 2N cooling, a single CRAC fault is absorbed by its peer CRAC (no server overheat);
  //    only if BOTH Loop A & Loop B CRACs in a hall fault does server temperature climb!
  const adjustedServers = servers.map((srv) => {
    if (srv.status === 'maintenance') return srv;
    const hallCracs = nextCracUnits.filter((c) => c.hallId === srv.hallId);
    if (hallCracs.length === 0) return srv;
    const healthyCracs = hallCracs.filter((c) => c.mode !== 'Fault');
    const dualFault = healthyCracs.length === 0;
    const anyBoost = healthyCracs.some((c) => c.mode === 'Boost');
    const avgSupply =
      healthyCracs.length > 0
        ? healthyCracs.reduce((s, c) => s + c.supplyTempC, 0) / healthyCracs.length
        : hallCracs.reduce((s, c) => s + c.supplyTempC, 0) / hallCracs.length;

    const coupledInlet = Number((avgSupply + 0.8).toFixed(1));
    const cracDelta = dualFault
      ? 1.6
      : anyBoost && !srv.activeFault
      ? -0.7
      : (coupledInlet - 21.5) * 0.12;
    return {
      ...srv,
      inletTempC: coupledInlet,
      tempC: Number(clamp(srv.tempC + cracDelta, 30, 94).toFixed(1)),
    };
  });

  const nextBms: BmsState = {
    ...bms,
    utilityFeed: nextUtility,
    outageTicksElapsed: nextOutageTicks,
    chillers: nextChillers,
    chwTankPumpSets: nextChwTankPumpSets,
    cracUnits: nextCracUnits,
    dieselTanks: nextDieselTanks,
    electricalSwitchgear: nextElectricalSwitchgear,
    upsSystems: nextUps,
    generators: nextGenerators,
    envSensors: nextEnvSensors,
    gateways: nextGateways,
  };

  // 7. Evaluate BMS-specific alerts into the unified Orise DCIM alerts & dispatch stream
  const bmsEval = evaluateBmsAlerts(nextBms, alerts, channels, now);

  return {
    bms: nextBms,
    adjustedServers,
    alerts: bmsEval.alerts,
    newAlerts: bmsEval.newAlerts,
    newDispatches: bmsEval.newDispatches,
    updatedChannels: bmsEval.updatedChannels,
  };
}

export function evaluateBmsAlerts(
  bms: BmsState,
  existingAlerts: ActiveAlert[],
  channels: NotificationChannel[],
  now: number
): {
  alerts: ActiveAlert[];
  newAlerts: ActiveAlert[];
  newDispatches: DispatchLogEntry[];
  updatedChannels: NotificationChannel[];
} {
  const nextAlerts = existingAlerts.map((a) => ({ ...a }));
  const newAlerts: ActiveAlert[] = [];
  const newDispatches: DispatchLogEntry[] = [];
  const channelMap = new Map<string, NotificationChannel>(channels.map((c) => [c.id, { ...c }]));

  interface BmsCheck {
    ruleId: string;
    ruleName: string;
    deviceId: string;
    deviceHostname: string;
    location: string;
    breached: boolean;
    severity: 'warning' | 'critical';
    currentValue: number;
    threshold: number;
    message: string;
  }

  const healthyUps = bms.upsSystems.find((u) => u.mode !== 'Fault') ?? bms.upsSystems[0];
  const runningGenKw = bms.generators
    .filter((g) => g.state === 'Running · On Load')
    .reduce((sum, g) => sum + g.outputKw, 0);

  const checks: BmsCheck[] = [
    {
      ruleId: 'bms-utility-outage',
      ruleName: 'BMS Utility Feed Loss',
      deviceId: 'bms-ats-main',
      deviceHostname: 'ATS-A & ATS-B (BMS)',
      location: 'Dual 132kV Switchgear',
      breached: bms.utilityFeed !== 'Utility Normal',
      severity: bms.utilityFeed === 'Utility Outage · UPS Battery' ? 'critical' : 'warning',
      currentValue: healthyUps?.batterySocPct ?? 100,
      threshold: 480,
      message:
        bms.utilityFeed === 'Utility Outage · UPS Battery'
          ? `Dual utility grid lost — 2(N+1) UPS on battery (${healthyUps?.batterySocPct ?? 0}% SoC), GEN-A1 & GEN-B1 cranking`
          : `Running on 2N generator backup (GEN-A1 + GEN-B1 · ${runningGenKw.toFixed(0)} kW load)`,
    },
    ...bms.chillers.map((ch) => ({
      ruleId: `bms-chiller-fault-${ch.id}`,
      ruleName: 'BMS Chiller Plant Fault',
      deviceId: ch.id,
      deviceHostname: `${ch.name} (${ch.chillerType})`,
      location: `Central Chiller Plant · ${ch.chilledLoop}`,
      breached: ch.mode === 'Fault',
      severity: ch.chillerType === 'Water-Cooled' ? ('critical' as const) : ('warning' as const),
      currentValue: ch.chwSupplyTempC,
      threshold: 11.5,
      message: `${ch.name} fault isolated — ${ch.chilledLoop} N+1 air chillers & peer water chiller carrying cooling load`,
    })),
    ...bms.cracUnits.map((c) => ({
      ruleId: `bms-crac-fault-${c.id}`,
      ruleName: c.coolingType === 'Liquid CDU' ? 'BMS Liquid CDU Cooling Fault' : 'BMS CRAC Cooling Fault',
      deviceId: c.id,
      deviceHostname: `${c.name} (BMS · ${c.redundancyPath})`,
      location: c.hallLabel,
      breached: c.mode === 'Fault' || c.supplyTempC >= 25.5,
      severity: 'critical' as const,
      currentValue: c.supplyTempC,
      threshold: 25.5,
      message: `${c.name} (${c.chilledLoop}) supply ${c.supplyTempC.toFixed(1)}°C (${c.mode}) — 2N peer unit protecting hall`,
    })),
    ...bms.chwTankPumpSets.map((ps) => ({
      ruleId: `bms-chw-pump-fault-${ps.id}`,
      ruleName: 'Rooftop CHW Tank Pump Skid Fault',
      deviceId: ps.id,
      deviceHostname: `${ps.name} (BMS)`,
      location: `Rooftop Chiller Plant · ${ps.chilledLoop}`,
      breached: ps.mode === 'Fault',
      severity: 'critical' as const,
      currentValue: ps.dischargePressureBar,
      threshold: 2.0,
      message: `${ps.name} isolated — 180,000 L buffer tank & peer loop pump skid maintaining chilled-water head`,
    })),
    ...bms.dieselTanks.map((tank) => ({
      ruleId: `bms-diesel-tank-${tank.id}`,
      ruleName: 'Basement Diesel Tank Reserve Alert',
      deviceId: tank.id,
      deviceHostname: `${tank.name} (B1 Fuel Vault)`,
      location: tank.vaultZone,
      breached: tank.interstitialLeakDetected || tank.levelPct < 25 || tank.transferPumpMode === 'Fault',
      severity: 'critical' as const,
      currentValue: tank.levelPct,
      threshold: 25,
      message: `${tank.name} (${tank.servedGenerators.join('/')}) reserve ${tank.levelPct.toFixed(1)}% · Pump ${tank.transferPumpMode}`,
    })),
    ...bms.upsSystems.map((u) => ({
      ruleId: `bms-ups-fault-${u.id}`,
      ruleName: 'BMS UPS Redundancy Fault',
      deviceId: u.id,
      deviceHostname: `${u.name} (BMS)`,
      location: `${u.feedBus} Vault`,
      breached: u.mode === 'Fault',
      severity: 'warning' as const,
      currentValue: 0,
      threshold: 1,
      message: `${u.name} isolated on fault — 2(N+1) redundant UPS peers carrying 100% load with zero IT drop`,
    })),
    ...bms.envSensors.map((e) => ({
      ruleId: `bms-leak-${e.hallId}`,
      ruleName: 'BMS Under-Floor Water Leak',
      deviceId: e.id,
      deviceHostname: `LEAK-${e.hallId.toUpperCase()} (BMS)`,
      location: e.hallLabel,
      breached: e.leakDetected,
      severity: 'critical' as const,
      currentValue: 1,
      threshold: 0,
      message: `Moisture detected along chilled-water manifold in ${e.hallLabel}`,
    })),
    ...bms.envSensors.map((e) => ({
      ruleId: `bms-sla-temp-${e.hallId}`,
      ruleName: 'Cold Aisle Temperature SLA Breach',
      deviceId: `${e.id}-sla-temp`,
      deviceHostname: `${e.slaProbeAId}/${e.slaProbeBId} (SLA)`,
      location: e.hallLabel,
      breached: e.tempSlaStatus === 'Breached',
      severity: 'critical' as const,
      currentValue: e.coldAisleTempC,
      threshold: e.slaTempMaxC,
      message: `Cold aisle temperature ${e.coldAisleTempC.toFixed(1)}°C outside ASHRAE SLA band (${e.slaTempMinC.toFixed(0)}–${e.slaTempMaxC.toFixed(0)}°C) in ${e.hallLabel}`,
    })),
    ...bms.envSensors.map((e) => ({
      ruleId: `bms-sla-hum-${e.hallId}`,
      ruleName: 'Cold Aisle Humidity SLA Breach',
      deviceId: `${e.id}-sla-hum`,
      deviceHostname: `${e.slaProbeAId}/${e.slaProbeBId} (SLA)`,
      location: e.hallLabel,
      breached: e.humiditySlaStatus === 'Breached',
      severity: 'warning' as const,
      currentValue: e.humidityPct,
      threshold: e.slaHumidityMaxPct,
      message: `Cold aisle humidity ${e.humidityPct.toFixed(1)}% RH outside ASHRAE SLA band (${e.slaHumidityMinPct.toFixed(0)}–${e.slaHumidityMaxPct.toFixed(0)}% RH) in ${e.hallLabel}`,
    })),
  ];

  for (const chk of checks) {
    const openIdx = nextAlerts.findIndex(
      (a) => a.ruleId === chk.ruleId && a.serverId === chk.deviceId && a.state !== 'resolved'
    );

    if (chk.breached) {
      if (openIdx >= 0) {
        nextAlerts[openIdx] = {
          ...nextAlerts[openIdx],
          severity: chk.severity,
          currentValue: chk.currentValue,
          message: chk.message,
        };
      } else {
        const eligible = Array.from(channelMap.values()).filter((ch) => {
          if (!ch.enabled) return false;
          if (ch.minSeverity === 'critical' && chk.severity !== 'critical') return false;
          return true;
        });

        const alertId = `alt-bms-${now.toString(36)}-${chk.deviceId.slice(-4)}-${newAlerts.length}`;
        const created: ActiveAlert = {
          id: alertId,
          ruleId: chk.ruleId,
          ruleName: chk.ruleName,
          serverId: chk.deviceId,
          serverHostname: chk.deviceHostname,
          rackId: chk.location,
          metric: 'tempC',
          currentValue: chk.currentValue,
          threshold: chk.threshold,
          operator: '>=',
          severity: chk.severity,
          state: 'active',
          triggeredAt: now,
          acknowledgedAt: null,
          acknowledgedBy: null,
          resolvedAt: null,
          dispatchedChannelNames: eligible.map((c) => c.name),
          message: chk.message,
        };

        nextAlerts.unshift(created);
        newAlerts.push(created);

        for (const ch of eligible) {
          newDispatches.unshift({
            id: `dsp-bms-${now.toString(36)}-${newDispatches.length}-${ch.id.slice(-3)}`,
            timestamp: now,
            alertId,
            serverHostname: chk.deviceHostname,
            channelId: ch.id,
            channelName: ch.name,
            channelType: ch.type,
            target: ch.target,
            severity: chk.severity,
            status: 'Delivered',
            summary: `[BMS] ${chk.ruleName}: ${chk.message}`,
          });
          ch.lastDispatchedAt = now;
          ch.deliveryCount += 1;
        }
      }
    } else if (openIdx >= 0) {
      nextAlerts[openIdx] = {
        ...nextAlerts[openIdx],
        state: 'resolved',
        resolvedAt: now,
      };
    }
  }

  return {
    alerts: nextAlerts.slice(0, 80),
    newAlerts,
    newDispatches,
    updatedChannels: Array.from(channelMap.values()),
  };
}

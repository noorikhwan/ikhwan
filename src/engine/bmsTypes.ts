import { HallId, Severity } from './types';

export type BmsProtocol = 'BACnet/IP' | 'Modbus TCP' | 'SNMP v3';

export type RedundancyPath = 'Path A' | 'Path B';

export type RedundancyTopology = '2N' | '2(N+1)' | '2N+1';

export type CracMode = 'Auto' | 'Manual' | 'Boost' | 'Fault';

export type ChillerType = 'Water-Cooled' | 'Air-Cooled';

export type ChillerMode = 'Running' | 'Boost' | 'Standby' | 'Fault';

export type UpsOperatingMode = 'Online' | 'On Battery' | 'Generator Sync' | 'Bypass' | 'Fault';

export type GeneratorState = 'Standby Ready' | 'Cranking' | 'Running · On Load';

export type UtilityFeedState = 'Utility Normal' | 'Utility Outage · UPS Battery' | 'Generator Backup';

export type CoolingTechnology = 'CRAC' | 'Liquid CDU';

export type DieselPumpMode = 'Auto Standby' | 'Transferring' | 'Polishing' | 'Fault';

export type ElectricalStageKind = 'HV' | 'MSB' | 'OPSWB';

export type SwitchgearBreakerState = 'Closed' | 'Open' | 'Gen Sync';

export interface ChillerUnit {
  id: string;
  name: string;
  chillerType: ChillerType;
  redundancyPath: RedundancyPath;
  chilledLoop: 'Loop A' | 'Loop B';
  role: 'Primary' | 'Redundant (N+1)';
  protocol: BmsProtocol;
  endpoint: string;
  deviceId: string;
  mode: ChillerMode;
  coolingOutputKw: number;
  capacityKw: number;
  chwSupplyTempC: number;
  chwReturnTempC: number;
  condenserOrAmbientTempC: number;
  compressorLoadPct: number;
  cop: number;
  waterFlowLps: number;
  fanSpeedPct: number;
  status: 'nominal' | 'warning' | 'critical';
}

export interface ChwTankPumpSet {
  id: string;
  name: string;
  chilledLoop: 'Loop A' | 'Loop B';
  redundancyPath: RedundancyPath;
  servedChillerId: string;
  protocol: BmsProtocol;
  endpoint: string;
  tankCapacityLiters: number;
  tankLevelPct: number;
  waterTempC: number;
  bufferAutonomyMin: number;
  activePumps: number;
  totalPumps: number;
  pumpConfigLabel: string;
  flowRateLps: number;
  dischargePressureBar: number;
  vfdSpeedPct: number;
  pumpPowerKw: number;
  mode: 'Auto' | 'Boost' | 'Fault';
  status: 'nominal' | 'warning' | 'critical';
}

export interface CracUnit {
  id: string;
  name: string;
  coolingType: CoolingTechnology;
  hallId: HallId;
  hallLabel: string;
  redundancyPath: RedundancyPath;
  chilledLoop: 'Loop A' | 'Loop B';
  peerCracId: string;
  protocol: BmsProtocol;
  endpoint: string;
  deviceId: string;
  mode: CracMode;
  setpointC: number; // Target supply air or secondary coolant °C (16 - 26)
  supplyTempC: number;
  returnTempC: number;
  humidityPct: number; // Relative humidity %
  fanSpeedPct: number; // 0 - 100 (Fan % for CRAC, VFD Pump % for Liquid CDU)
  chilledWaterValvePct: number; // 0 - 100
  coolingOutputKw: number;
  maxCoolingKw: number;
  coolantFlowLpm?: number; // Liquid CDU secondary loop flow (L/min)
  coolantSupplyTempC?: number; // Liquid CDU cold-plate supply °C
  coolantReturnTempC?: number; // Liquid CDU cold-plate return °C
  deltaPBar?: number; // Liquid CDU manifold differential pressure (bar)
  glycolMixPct?: number; // PG25 coolant mixture %
  heatExchangerEffPct?: number; // Brazed-plate HX efficiency %
  status: 'nominal' | 'warning' | 'critical';
}

export interface DieselTankUnit {
  id: string;
  name: string;
  vaultZone: 'Basement B1 · Path A Vault' | 'Basement B1 · Path B Vault';
  redundancyPath: RedundancyPath;
  feedBus: 'Bus A' | 'Bus B';
  servedGenerators: string[];
  capacityLiters: number;
  currentLiters: number;
  levelPct: number;
  fuelTempC: number;
  supplyPressureBar: number;
  transferPumpMode: DieselPumpMode;
  interstitialLeakDetected: boolean;
  protocol: BmsProtocol;
  endpoint: string;
  status: 'nominal' | 'warning' | 'critical';
}

export interface ElectricalSwitchgearNode {
  id: string;
  name: string;
  stage: ElectricalStageKind;
  redundancyPath: RedundancyPath;
  feedBus: 'Bus A' | 'Bus B';
  voltageLabel: string;
  ratedKva: number;
  activeLoadKw: number;
  electricalServeKw: number;
  mechanicalServeKw: number;
  upstreamSource: string;
  downstreamTargets: string[];
  breakerState: SwitchgearBreakerState;
  powerFactor: number;
  thdPct: number;
  protocol: BmsProtocol;
  endpoint: string;
  status: 'nominal' | 'warning' | 'critical';
}

export interface UpsSystem {
  id: string;
  name: string;
  feedBus: 'Bus A' | 'Bus B';
  redundancyPath: RedundancyPath;
  role: 'Primary' | 'Redundant (N+1)';
  peerUpsId: string;
  protocol: BmsProtocol;
  endpoint: string;
  mode: UpsOperatingMode;
  loadKw: number;
  capacityKw: number;
  batterySocPct: number; // 0 - 100
  runtimeMin: number;
  inputVoltageV: number;
  outputFreqHz: number;
  status: 'nominal' | 'warning' | 'critical';
}

export interface BackupGenerator {
  id: string;
  name: string;
  redundancyPath: RedundancyPath;
  feedBus: 'Bus A' | 'Bus B';
  role: 'Primary' | 'Standby (N+1)';
  protocol: BmsProtocol;
  endpoint: string;
  state: GeneratorState;
  fuelLevelPct: number;
  fuelAutonomyHours: number;
  coolantTempC: number;
  outputKw: number;
  ratedKw: number;
}

export type SlaComplianceStatus = 'Compliant' | 'Warning' | 'Breached';

export interface EnvironmentalZoneSensor {
  id: string;
  hallId: HallId;
  hallLabel: string;
  slaProbeAId: string;
  slaProbeBId: string;
  coldAisleTempC: number;
  probeATempC: number;
  probeBTempC: number;
  humidityPct: number;
  probeAHumidityPct: number;
  probeBHumidityPct: number;
  dewPointC: number;
  slaTempMinC: number;
  slaTempMaxC: number;
  slaHumidityMinPct: number;
  slaHumidityMaxPct: number;
  tempSlaStatus: SlaComplianceStatus;
  humiditySlaStatus: SlaComplianceStatus;
  slaCompliancePct: number;
  slaExcursionActive: boolean;
  differentialPressurePa: number;
  leakDetected: boolean;
  smokeAspiration: 'Normal' | 'Pre-Alarm';
  dualProbeStatus: '2N Dual Verified' | 'Single Probe Degraded';
  chilledLoopStatus: 'Loop A + B Active' | 'Loop B Failover' | 'Loop A Failover' | 'Dual Loop Fault';
}

export interface ColdAisleRowSensorMetric {
  sensorId: string;
  hallId: HallId;
  hallLabel: string;
  rowNumber: number;
  rowLabel: string;
  slot: 'A' | 'B';
  positionLabel: 'West · Rack 05' | 'East · Rack 16';
  redundancyPath: RedundancyPath;
  tempC: number;
  humidityPct: number;
  dewPointC: number;
  tempSlaStatus: SlaComplianceStatus;
  humiditySlaStatus: SlaComplianceStatus;
  overallStatus: SlaComplianceStatus;
}

export interface BmsGateway {
  id: string;
  name: string;
  protocol: BmsProtocol;
  redundancyPath: RedundancyPath;
  role: 'Primary' | 'Standby';
  peerGatewayId: string;
  endpoint: string;
  connected: boolean;
  pollIntervalSec: number;
  mappedPoints: number;
  latencyMs: number;
  lastSyncAt: number;
}

export interface BmsCommandLogEntry {
  id: string;
  timestamp: number;
  source: 'Operator' | 'Closed-Loop Automation';
  protocol: BmsProtocol;
  targetDevice: string;
  command: string;
  result: 'Applied' | 'Blocked (Gateway Offline)';
}

export interface BmsState {
  tierCertification: 'Uptime Institute Tier IV · Fault-Tolerant';
  utilityFeed: UtilityFeedState;
  utilityFeedAOnline: boolean;
  utilityFeedBOnline: boolean;
  outageTicksElapsed: number;
  closedLoopCoolingEnabled: boolean;
  chillers: ChillerUnit[];
  chwTankPumpSets: ChwTankPumpSet[];
  cracUnits: CracUnit[];
  dieselTanks: DieselTankUnit[];
  electricalSwitchgear: ElectricalSwitchgearNode[];
  upsSystems: UpsSystem[];
  generators: BackupGenerator[];
  envSensors: EnvironmentalZoneSensor[];
  gateways: BmsGateway[];
  commandLog: BmsCommandLogEntry[];
}

export interface Tier4SubsystemStatus {
  id: string;
  subsystem: string;
  topology: RedundancyTopology;
  activeCount: number;
  totalCount: number;
  pathAHealthy: boolean;
  pathBHealthy: boolean;
  state: 'fault-tolerant' | 'failover-active' | 'degraded';
  detail: string;
}

export interface Tier4RedundancySummary {
  certificationLabel: string;
  uptimeSla: string;
  overallState: 'fault-tolerant' | 'failover-active' | 'degraded';
  overallLabel: string;
  zeroSpofVerified: boolean;
  subsystems: Tier4SubsystemStatus[];
}

export interface BmsAlertTrigger {
  ruleId: string;
  ruleName: string;
  deviceId: string;
  deviceLabel: string;
  location: string;
  severity: Severity;
  currentValue: number;
  threshold: number;
  message: string;
}

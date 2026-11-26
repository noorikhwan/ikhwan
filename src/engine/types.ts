export type HallId = 'hall-a' | 'hall-b' | 'hall-c' | 'hall-d';

export type ServerRole = 'Compute' | 'GPU Inference' | 'NVMe Storage' | 'Network Spine' | 'Hypervisor';

export type NodeStatus = 'nominal' | 'warning' | 'critical' | 'maintenance';

export type Severity = 'warning' | 'critical';

export type AlertState = 'active' | 'acknowledged' | 'resolved' | 'ignored';

export type MetricKey =
  | 'cpu'
  | 'memory'
  | 'tempC'
  | 'powerW'
  | 'disk'
  | 'networkGbps'
  | 'packetLoss'
  | 'facilityPowerMw'
  | 'rackPowerKw'
  | 'rackAvgTempC';

export type AlertRuleType =
  | 'server_telemetry'
  | 'facility_power_surge'
  | 'rack_power_capacity'
  | 'rack_thermal_violation';

export type ComparisonOp = '>' | '>=' | '<';

export type FaultType = 'thermal_spike' | 'cpu_surge' | 'memory_leak' | 'network_drop' | 'psu_degraded';

export interface ServerSample {
  timestamp: number;
  cpu: number;
  memory: number;
  tempC: number;
  powerW: number;
  networkGbps: number;
}

export interface ServerNode {
  id: string;
  hostname: string;
  ip: string;
  model: string;
  role: ServerRole;
  hallId: HallId;
  rackId: string;
  uStart: number;
  uHeight: number;
  status: NodeStatus;
  cpu: number; // % 0-100
  memory: number; // % 0-100
  disk: number; // % 0-100
  tempC: number; // Exhaust °C
  inletTempC: number; // Inlet °C
  powerW: number; // Watts
  ratedPowerW: number;
  networkGbps: number;
  packetLoss: number; // % 0-100
  fanRpm: number;
  psuStatus: 'Redundant (2/2)' | 'Degraded (1/2)';
  uptimeDays: number;
  activeFault: FaultType | null;
  history: ServerSample[];
}

export type RackManufacturer = 'Schneider Electric' | 'Vertiv' | 'Rittal' | 'Panduit';

export type RackPowerDensityRating =
  | 'Standard (12 kW)'
  | 'Medium (14–16 kW)'
  | 'High-Density (22 kW)';

export interface RackDefinition {
  id: string;
  name: string;
  hallId: HallId;
  hallName: string;
  row: string;
  rowNumber: number; // 1..20
  rackIndex: number; // 1..20
  totalU: number;
  powerCapacityKw: number;
  manufacturer: RackManufacturer;
  powerDensityRating: RackPowerDensityRating;
  ambientTempC: number;
  basePowerKw: number;
  basePeakTempC: number;
  baseUsedU: number;
  pduAName: string;
  pduBName: string;
}

export interface FacilityTelemetryPoint {
  timestamp: number;
  label: string;
  totalPowerKw: number;
  pue: number;
  avgCpu: number;
  avgTempC: number;
  totalNetworkGbps: number;
}

export interface NotificationChannel {
  id: string;
  name: string;
  type: 'PagerDuty' | 'Slack' | 'Webhook' | 'Email';
  target: string;
  enabled: boolean;
  minSeverity: Severity;
  lastDispatchedAt: number | null;
  deliveryCount: number;
}

export interface AlertRule {
  id: string;
  name: string;
  ruleType?: AlertRuleType;
  metric: MetricKey;
  operator: ComparisonOp;
  threshold: number;
  sustainedDurationSec?: number;
  breachStartedAt?: number | null;
  severity: Severity;
  scopeHall: HallId | 'all';
  channelIds: string[];
  enabled: boolean;
  autoResolve: boolean;
  cooldownSec: number;
}

export interface ActiveAlert {
  id: string;
  ruleId: string;
  ruleName: string;
  serverId: string;
  serverHostname: string;
  rackId: string;
  metric: MetricKey;
  currentValue: number;
  threshold: number;
  operator: ComparisonOp;
  severity: Severity;
  state: AlertState;
  triggeredAt: number;
  acknowledgedAt: number | null;
  acknowledgedBy: string | null;
  resolvedAt: number | null;
  ignoredAt?: number | null;
  ignoredBy?: string | null;
  dispatchedChannelNames: string[];
  message: string;
}

export interface DispatchLogEntry {
  id: string;
  timestamp: number;
  alertId: string;
  serverHostname: string;
  channelId: string;
  channelName: string;
  channelType: NotificationChannel['type'];
  target: string;
  severity: Severity | 'info';
  status: 'Delivered' | 'Queued';
  summary: string;
}

export interface FacilitySummary {
  totalServers: number;
  nominalCount: number;
  warningCount: number;
  criticalCount: number;
  maintenanceCount: number;
  totalItLoadKw: number;
  totalFacilityCapacityKw: number;
  pue: number;
  avgInletTempC: number;
  avgExhaustTempC: number;
  peakExhaustTempC: number;
  avgCpu: number;
  totalNetworkGbps: number;
  activeAlertCount: number;
  activeCriticalCount: number;
  unacknowledgedCount: number;
}

export interface AlertRuleDraft {
  name: string;
  ruleType: AlertRuleType;
  metric: MetricKey;
  operator: ComparisonOp;
  threshold: string;
  sustainedDurationSec: string;
  severity: Severity;
  scopeHall: HallId | 'all';
  channelIds: string[];
  autoResolve: boolean;
  cooldownSec: string;
}

export interface AlertRuleValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof AlertRuleDraft, string>>;
}

export interface ServerFilterCriteria {
  search: string;
  hallId: HallId | 'all';
  status: NodeStatus | 'all';
  rackId: string | 'all';
  rackManufacturer?: RackManufacturer | 'all';
  powerDensityRating?: RackPowerDensityRating | 'all';
}

export type ServerSortKey = 'hostname' | 'status' | 'cpu' | 'memory' | 'tempC' | 'powerW' | 'uptimeDays';

export interface HallPowerCapacityPolicy {
  hallId: HallId;
  thresholdPct: number; // e.g., 100 means 100% of rated rack kW; range 75..115
  hysteresisKw: number; // e.g., 0.15 kW auto-resolve deadband; range 0.05..1.5
  enabled: boolean;
}

export type HallPowerPolicyMap = Record<HallId, HallPowerCapacityPolicy>;

export interface HallThermalPolicy {
  hallId: HallId;
  warningTempC: number; // e.g., 65°C avg server temp; range 50..80
  criticalTempC: number; // e.g., 72°C avg server temp; range 55..90 (>= warningTempC + 2)
  hysteresisC: number; // e.g., 1.5°C recovery deadband; range 0.5..5.0
  enabled: boolean;
}

export type HallThermalPolicyMap = Record<HallId, HallThermalPolicy>;

export type RackQuickFilterId =
  | 'all'
  | 'over_cap'
  | 'thermal_high'
  | 'util_80'
  | 'headroom_low';

export interface RackRebalanceCandidate {
  targetRackId: string;
  targetRackName: string;
  hallId: HallId;
  row: string;
  currentKw: number;
  effectiveLimitKw: number;
  currentUtilPct: number;
  projectedKw: number;
  projectedUtilPct: number;
  headroomAfterKw: number;
  shiftKw: number;
}

export interface RackRebalancePlan {
  sourceRackId: string;
  hallId: HallId;
  sourceCurrentKw: number;
  sourceEffectiveLimitKw: number;
  sourceRatedKw: number;
  overByKw: number;
  recommendedShiftKw: number;
  sourceProjectedKw: number;
  sourceProjectedUtilPct: number;
  candidates: RackRebalanceCandidate[];
}


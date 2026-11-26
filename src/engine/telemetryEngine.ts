import { isAlertOpen } from './alertBulkActions';
import { BmsState } from './bmsTypes';
import {
  computeRackThermalStats,
  RackThermalStat,
} from './rackHeatmapEngine';
import {
  computeBmsRackPowerStats,
  DEFAULT_HALL_POWER_POLICIES,
  RackBmsPowerStat,
} from './rackPowerEngine';
import { BASE_CAMPUS_RACK_LOAD_KW, METRIC_META } from './seedData';
import {
  ActiveAlert,
  AlertRule,
  AlertRuleDraft,
  AlertRuleValidationResult,
  ComparisonOp,
  DispatchLogEntry,
  FacilitySummary,
  FacilityTelemetryPoint,
  FaultType,
  HallPowerPolicyMap,
  HallThermalPolicyMap,
  MetricKey,
  NodeStatus,
  NotificationChannel,
  RackDefinition,
  ServerFilterCriteria,
  ServerNode,
  ServerSortKey,
} from './types';

export const RACK_CRITICAL_POWER_RULE_ID = 'rule-rack-power-capacity';
export const RACK_CRITICAL_POWER_RULE_NAME = 'Critical Power Capacity';
export const RACK_THERMAL_VIOLATION_RULE_ID = 'rule-rack-thermal-violation';
export const RACK_THERMAL_VIOLATION_RULE_NAME = 'Rack Thermal Sensor Violation';
export const DEFAULT_RACK_THERMAL_WARNING_C = 65;
export const DEFAULT_RACK_THERMAL_CRITICAL_C = 72;
export const DEFAULT_RACK_THERMAL_HYSTERESIS_C = 1.5;

export interface RackThermalThresholds {
  warningTempC?: number;
  criticalTempC?: number;
  hysteresisC?: number;
  enabled?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function formatTimeLabel(timestamp: number): string {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(
    d.getSeconds()
  ).padStart(2, '0')}`;
}

export function evaluateCondition(value: number, operator: ComparisonOp, threshold: number): boolean {
  switch (operator) {
    case '>':
      return value > threshold;
    case '>=':
      return value >= threshold;
    case '<':
      return value < threshold;
    default:
      return false;
  }
}

export function getMetricValue(server: ServerNode, metric: MetricKey): number {
  switch (metric) {
    case 'cpu':
      return server.cpu;
    case 'memory':
      return server.memory;
    case 'tempC':
      return server.tempC;
    case 'powerW':
      return server.powerW;
    case 'disk':
      return server.disk;
    case 'networkGbps':
      return server.networkGbps;
    case 'packetLoss':
      return server.packetLoss;
    case 'facilityPowerMw':
      return server.powerW / 1000;
    case 'rackPowerKw':
      return server.powerW / 1000;
    case 'rackAvgTempC':
      return server.tempC;
  }
}

export function computeTotalFacilityPowerMw(servers: ServerNode[]): number {
  const monitoredKw = servers.reduce((acc, s) => acc + s.powerW, 0) / 1000;
  const totalItKw = BASE_CAMPUS_RACK_LOAD_KW + monitoredKw * 12;
  const avgTempC =
    servers.length > 0
      ? servers.reduce((acc, s) => acc + s.tempC, 0) / servers.length
      : 45;
  const pue = Number((1.22 + Math.max(0, (avgTempC - 45) * 0.008)).toFixed(2));
  return Number(((totalItKw * pue) / 1000).toFixed(2));
}

export function deriveNodeStatus(server: ServerNode, serverAlerts: ActiveAlert[]): NodeStatus {
  if (server.status === 'maintenance') return 'maintenance';
  const openAlerts = serverAlerts.filter((a) => a.serverId === server.id && isAlertOpen(a));
  if (
    openAlerts.some((a) => a.severity === 'critical') ||
    server.tempC >= 78 ||
    server.cpu >= 92 ||
    server.packetLoss > 1.5 ||
    server.psuStatus !== 'Redundant (2/2)'
  ) {
    return 'critical';
  }
  if (
    openAlerts.some((a) => a.severity === 'warning') ||
    server.tempC >= 68 ||
    server.cpu >= 80 ||
    server.memory >= 86
  ) {
    return 'warning';
  }
  return 'nominal';
}

export interface RuleEvaluationOutcome {
  alerts: ActiveAlert[];
  newAlerts: ActiveAlert[];
  newDispatches: DispatchLogEntry[];
  updatedChannels: NotificationChannel[];
  updatedRules: AlertRule[];
}

export interface EvaluateAlertRulesOptions {
  facilityHistory?: FacilityTelemetryPoint[];
  facilityPowerMwOverride?: number;
  siteCode?: string;
}

function resolveInitialFacilityBreachStart(
  rule: AlertRule,
  facilityHistory: FacilityTelemetryPoint[] | undefined,
  now: number
): number {
  if (!facilityHistory || facilityHistory.length === 0) return now;
  let earliest = now;
  for (let i = facilityHistory.length - 1; i >= 0; i--) {
    const pt = facilityHistory[i];
    const ptFacilityMw = Number(((pt.totalPowerKw * pt.pue) / 1000).toFixed(2));
    if (evaluateCondition(ptFacilityMw, rule.operator, rule.threshold)) {
      earliest = pt.timestamp;
    } else {
      break;
    }
  }
  return earliest;
}

export function evaluateAlertRules(
  servers: ServerNode[],
  rules: AlertRule[],
  existingAlerts: ActiveAlert[],
  channels: NotificationChannel[],
  now: number,
  options?: EvaluateAlertRulesOptions
): RuleEvaluationOutcome {
  const nextAlerts = existingAlerts.map((a) => ({ ...a }));
  const nextRules = rules.map((r) => ({ ...r }));
  const newAlerts: ActiveAlert[] = [];
  const newDispatches: DispatchLogEntry[] = [];
  const channelMap = new Map<string, NotificationChannel>(channels.map((c) => [c.id, { ...c }]));

  const enabledServerRules = nextRules.filter(
    (r) => r.enabled && r.ruleType !== 'facility_power_surge' && r.metric !== 'facilityPowerMw'
  );
  const facilitySurgeRules = nextRules.filter(
    (r) => r.ruleType === 'facility_power_surge' || r.metric === 'facilityPowerMw'
  );

  for (const server of servers) {
    if (server.status === 'maintenance') continue;

    for (const rule of enabledServerRules) {
      if (rule.scopeHall !== 'all' && rule.scopeHall !== server.hallId) continue;

      const currentValue = getMetricValue(server, rule.metric);
      const breached = evaluateCondition(currentValue, rule.operator, rule.threshold);
      const existingOpenIdx = nextAlerts.findIndex(
        (a) => a.serverId === server.id && a.ruleId === rule.id && a.state !== 'resolved'
      );

      if (breached) {
        if (existingOpenIdx >= 0) {
          // Update current value on existing open alert
          nextAlerts[existingOpenIdx] = {
            ...nextAlerts[existingOpenIdx],
            currentValue: Number(currentValue.toFixed(2)),
            message: `${METRIC_META[rule.metric]?.label ?? rule.metric} reached ${currentValue.toFixed(1)}${
              METRIC_META[rule.metric]?.unit ?? ''
            } (threshold ${rule.operator} ${rule.threshold}${METRIC_META[rule.metric]?.unit ?? ''})`,
          };
        } else {
          const cooldownMs = Math.max(0, rule.cooldownSec) * 1000;
          const inCooldown =
            cooldownMs > 0 &&
            nextAlerts.some(
              (a) =>
                a.serverId === server.id &&
                a.ruleId === rule.id &&
                a.state === 'resolved' &&
                a.resolvedAt !== null &&
                now - a.resolvedAt < cooldownMs
            );
          if (inCooldown) continue;

          // Determine eligible notification channels
          const eligibleChannels = rule.channelIds
            .map((id) => channelMap.get(id))
            .filter((ch): ch is NotificationChannel => {
              if (!ch || !ch.enabled) return false;
              if (ch.minSeverity === 'critical' && rule.severity !== 'critical') return false;
              return true;
            });

          const alertId = `alt-${now.toString(36)}-${server.id.slice(-3)}-${rule.id.slice(-3)}-${newAlerts.length}`;
          const meta = METRIC_META[rule.metric];
          const unit = meta?.unit ?? '';
          const createdAlert: ActiveAlert = {
            id: alertId,
            ruleId: rule.id,
            ruleName: rule.name,
            serverId: server.id,
            serverHostname: server.hostname,
            rackId: server.rackId,
            metric: rule.metric,
            currentValue: Number(currentValue.toFixed(2)),
            threshold: rule.threshold,
            operator: rule.operator,
            severity: rule.severity,
            state: 'active',
            triggeredAt: now,
            acknowledgedAt: null,
            acknowledgedBy: null,
            resolvedAt: null,
            dispatchedChannelNames: eligibleChannels.map((c) => c.name),
            message: `${meta?.label ?? rule.metric} reached ${currentValue.toFixed(1)}${unit} (threshold ${
              rule.operator
            } ${rule.threshold}${unit})`,
          };

          nextAlerts.unshift(createdAlert);
          newAlerts.push(createdAlert);

          for (const ch of eligibleChannels) {
            const dispatch: DispatchLogEntry = {
              id: `dsp-${now.toString(36)}-${newDispatches.length}-${ch.id.slice(-3)}`,
              timestamp: now,
              alertId,
              serverHostname: server.hostname,
              channelId: ch.id,
              channelName: ch.name,
              channelType: ch.type,
              target: ch.target,
              severity: rule.severity,
              status: 'Delivered',
              summary: `${rule.name} on ${server.hostname} (${currentValue.toFixed(1)}${unit})`,
            };
            newDispatches.unshift(dispatch);
            ch.lastDispatchedAt = now;
            ch.deliveryCount += 1;
          }
        }
      } else if (
        existingOpenIdx >= 0 &&
        rule.autoResolve &&
        nextAlerts[existingOpenIdx].state !== 'ignored'
      ) {
        // Hysteresis margin: resolve once comfortably back inside safe threshold
        const margin = rule.metric === 'packetLoss' ? 0.2 : 1.5;
        const recovered =
          rule.operator === '<'
            ? currentValue > rule.threshold + margin
            : currentValue < rule.threshold - margin;

        if (recovered) {
          nextAlerts[existingOpenIdx] = {
            ...nextAlerts[existingOpenIdx],
            currentValue: Number(currentValue.toFixed(2)),
            state: 'resolved',
            resolvedAt: now,
          };
        }
      }
    }
  }

  // Evaluate Facility-Wide Power Surge rules against total facility power (MW) over sustained period
  if (facilitySurgeRules.length > 0) {
    const totalFacilityMw =
      options?.facilityPowerMwOverride ?? computeTotalFacilityPowerMw(servers);
    const siteTag = options?.siteCode ? `${options.siteCode} · ` : '';
    const entityLabel = `${siteTag}Total Facility Power`;

    for (const rule of facilitySurgeRules) {
      if (!rule.enabled) {
        rule.breachStartedAt = null;
        continue;
      }

      const sustainedSec = Math.max(0, rule.sustainedDurationSec ?? 60);
      const breached = evaluateCondition(totalFacilityMw, rule.operator, rule.threshold);
      const existingOpenIdx = nextAlerts.findIndex(
        (a) => a.serverId === 'facility-power-plant' && a.ruleId === rule.id && a.state !== 'resolved'
      );

      if (breached) {
        if (rule.breachStartedAt == null) {
          rule.breachStartedAt = resolveInitialFacilityBreachStart(
            rule,
            options?.facilityHistory,
            now
          );
        }

        const elapsedSec = Math.max(0, Math.round((now - rule.breachStartedAt) / 1000));
        const sustainedMet = elapsedSec >= sustainedSec;

        if (existingOpenIdx >= 0) {
          nextAlerts[existingOpenIdx] = {
            ...nextAlerts[existingOpenIdx],
            currentValue: Number(totalFacilityMw.toFixed(2)),
            message: `Total Facility Power reached ${totalFacilityMw.toFixed(2)} MW (threshold ${
              rule.operator
            } ${rule.threshold} MW sustained for ${Math.max(elapsedSec, sustainedSec)}s)`,
          };
        } else if (sustainedMet) {
          const cooldownMs = Math.max(0, rule.cooldownSec) * 1000;
          const inCooldown =
            cooldownMs > 0 &&
            nextAlerts.some(
              (a) =>
                a.serverId === 'facility-power-plant' &&
                a.ruleId === rule.id &&
                a.state === 'resolved' &&
                a.resolvedAt !== null &&
                now - a.resolvedAt < cooldownMs
            );
          if (inCooldown) continue;

          // Ensure Facility Management Channel is always included if enabled
          const targetChannelIds = Array.from(
            new Set([
              ...rule.channelIds,
              ...(channelMap.has('ch-facility-mgmt') ? ['ch-facility-mgmt'] : []),
            ])
          );
          const eligibleChannels = targetChannelIds
            .map((id) => channelMap.get(id))
            .filter((ch): ch is NotificationChannel => {
              if (!ch || !ch.enabled) return false;
              if (ch.minSeverity === 'critical' && rule.severity !== 'critical') return false;
              return true;
            });

          const alertId = `alt-${now.toString(36)}-fac-${rule.id.slice(-4)}-${newAlerts.length}`;
          const createdAlert: ActiveAlert = {
            id: alertId,
            ruleId: rule.id,
            ruleName: rule.name,
            serverId: 'facility-power-plant',
            serverHostname: entityLabel,
            rackId: 'Facility-Wide · HV→MSB',
            metric: 'facilityPowerMw',
            currentValue: Number(totalFacilityMw.toFixed(2)),
            threshold: rule.threshold,
            operator: rule.operator,
            severity: rule.severity,
            state: 'active',
            triggeredAt: now,
            acknowledgedAt: null,
            acknowledgedBy: null,
            resolvedAt: null,
            dispatchedChannelNames: eligibleChannels.map((c) => c.name),
            message: `Total Facility Power reached ${totalFacilityMw.toFixed(2)} MW (threshold ${
              rule.operator
            } ${rule.threshold} MW sustained for ${sustainedSec}s)`,
          };

          nextAlerts.unshift(createdAlert);
          newAlerts.push(createdAlert);

          for (const ch of eligibleChannels) {
            const dispatch: DispatchLogEntry = {
              id: `dsp-${now.toString(36)}-${newDispatches.length}-${ch.id.slice(-3)}`,
              timestamp: now,
              alertId,
              serverHostname: entityLabel,
              channelId: ch.id,
              channelName: ch.name,
              channelType: ch.type,
              target: ch.target,
              severity: rule.severity,
              status: 'Delivered',
              summary: `${rule.name}: ${entityLabel} surged to ${totalFacilityMw.toFixed(
                2
              )} MW (>${rule.threshold} MW for ${sustainedSec}s)`,
            };
            newDispatches.unshift(dispatch);
            ch.lastDispatchedAt = now;
            ch.deliveryCount += 1;
          }
        }
      } else {
        rule.breachStartedAt = null;
        if (existingOpenIdx >= 0 && rule.autoResolve) {
          const marginMw = 0.25;
          const recovered =
            rule.operator === '<'
              ? totalFacilityMw > rule.threshold + marginMw
              : totalFacilityMw < rule.threshold - marginMw;

          if (recovered) {
            nextAlerts[existingOpenIdx] = {
              ...nextAlerts[existingOpenIdx],
              currentValue: Number(totalFacilityMw.toFixed(2)),
              state: 'resolved',
              resolvedAt: now,
            };
          }
        }
      }
    }
  }

  return {
    alerts: nextAlerts.slice(0, 80),
    newAlerts,
    newDispatches,
    updatedChannels: Array.from(channelMap.values()),
    updatedRules: nextRules,
  };
}

export interface RackPowerCapacityEvaluationOutcome {
  alerts: ActiveAlert[];
  newAlerts: ActiveAlert[];
  newDispatches: DispatchLogEntry[];
  updatedChannels: NotificationChannel[];
  exceededRackIds: string[];
  thermalViolationRackIds: string[];
  rackThermalStats: Record<string, RackThermalStat>;
}

/**
 * Evaluates every cabinet's real-time BMS power draw against its rated powerCapacityKw
 * as well as per-rack thermal sensor violations based on the average temperature of
 * active servers mounted within each rack.
 *
 * - Power capacity: triggers 'Critical Power Capacity' alerts whenever live rack draw
 *   exceeds its effective limit, deduplicates active alerts, and auto-resolves with hysteresis.
 * - Per-rack thermal: computes average server temperature per rack via `computeRackThermalStats`,
 *   triggers Warning (>= 65°C) or Critical (>= 72°C) 'Rack Thermal Sensor Violation' alerts,
 *   supports in-place Warning -> Critical escalation with critical-tier channel dispatch,
 *   deduplicates across ticks, and auto-resolves with hysteresis once cooled safely below threshold.
 */
export function evaluateRackPowerCapacityAlerts(params: {
  racks: RackDefinition[];
  bms: BmsState;
  servers: ServerNode[];
  existingAlerts: ActiveAlert[];
  channels: NotificationChannel[];
  now: number;
  siteCode?: string;
  rackPowerStatsOverride?: Record<string, RackBmsPowerStat>;
  rackPowerAdjustmentsKw?: Record<string, number>;
  hallPowerPolicies?: HallPowerPolicyMap;
  hallThermalPolicies?: HallThermalPolicyMap;
  rackThermalStatsOverride?: Record<string, RackThermalStat>;
  rackThermalThresholds?: RackThermalThresholds;
}): RackPowerCapacityEvaluationOutcome {
  const {
    racks,
    bms,
    servers,
    existingAlerts,
    channels,
    now,
    siteCode,
    rackPowerStatsOverride,
    rackPowerAdjustmentsKw,
    hallPowerPolicies,
    hallThermalPolicies,
    rackThermalStatsOverride,
    rackThermalThresholds,
  } = params;

  const policies = hallPowerPolicies ?? DEFAULT_HALL_POWER_POLICIES;
  const powerStats =
    rackPowerStatsOverride ??
    computeBmsRackPowerStats(racks, bms, servers, {
      rackPowerAdjustmentsKw,
      hallPowerPolicies: policies,
    });
  const activeServers = servers.filter((s) => s.status !== 'maintenance');
  const rackThermalStats =
    rackThermalStatsOverride ?? computeRackThermalStats(racks, activeServers, bms);

  const nextAlerts = existingAlerts.map((a) => ({ ...a }));
  const newAlerts: ActiveAlert[] = [];
  const newDispatches: DispatchLogEntry[] = [];
  const exceededRackIds: string[] = [];
  const thermalViolationRackIds: string[] = [];
  const channelMap = new Map<string, NotificationChannel>(
    channels.map((c) => [c.id, { ...c }])
  );

  const eligibleChannels = Array.from(channelMap.values()).filter(
    (ch) => ch.enabled
  );

  const sitePrefix = siteCode ? `${siteCode} · ` : '';

  for (const rack of racks) {
    const stat = powerStats[rack.id];
    const entityId = `rack-${rack.id}`;

    if (stat) {
      const policy = policies[rack.hallId] ?? DEFAULT_HALL_POWER_POLICIES[rack.hallId];
      const limitKw = stat.effectiveLimitKw ?? stat.powerCapacityKw;
      const hysteresisKw = policy?.hysteresisKw ?? 0.15;

      const existingOpenIdx = nextAlerts.findIndex(
        (a) =>
          a.ruleId === RACK_CRITICAL_POWER_RULE_ID &&
          (a.rackId === rack.id || a.serverId === entityId) &&
          a.state !== 'resolved'
      );

      const exceeded = policy.enabled && stat.powerKw > limitKw;
      if (exceeded) {
        exceededRackIds.push(rack.id);
        const overKw = Number((stat.powerKw - limitKw).toFixed(2));
        const limitLabel =
          policy.thresholdPct !== 100
            ? `${limitKw.toFixed(1)} kW policy limit (${policy.thresholdPct}% of ${stat.powerCapacityKw.toFixed(1)} kW)`
            : `${limitKw.toFixed(1)} kW rated limit`;
        const msg = `${RACK_CRITICAL_POWER_RULE_NAME}: ${rack.id} drawing ${stat.powerKw.toFixed(
          2
        )} kW, exceeding ${limitLabel} (+${overKw.toFixed(
          2
        )} kW · ${stat.utilizationPct}%)`;

        if (existingOpenIdx >= 0) {
          nextAlerts[existingOpenIdx] = {
            ...nextAlerts[existingOpenIdx],
            currentValue: Number(stat.powerKw.toFixed(2)),
            threshold: limitKw,
            message: msg,
          };
        } else {
          const alertId = `alt-${now.toString(36)}-pwr-${rack.id.toLowerCase()}-${newAlerts.length}`;
          const createdAlert: ActiveAlert = {
            id: alertId,
            ruleId: RACK_CRITICAL_POWER_RULE_ID,
            ruleName: RACK_CRITICAL_POWER_RULE_NAME,
            serverId: entityId,
            serverHostname: `${sitePrefix}Rack ${rack.id}`,
            rackId: rack.id,
            metric: 'rackPowerKw',
            currentValue: Number(stat.powerKw.toFixed(2)),
            threshold: limitKw,
            operator: '>',
            severity: 'critical',
            state: 'active',
            triggeredAt: now,
            acknowledgedAt: null,
            acknowledgedBy: null,
            resolvedAt: null,
            dispatchedChannelNames: eligibleChannels.map((c) => c.name),
            message: msg,
          };

          nextAlerts.unshift(createdAlert);
          newAlerts.push(createdAlert);

          for (const ch of eligibleChannels) {
            const dispatch: DispatchLogEntry = {
              id: `dsp-${now.toString(36)}-rpwr-${newDispatches.length}-${ch.id.slice(-3)}`,
              timestamp: now,
              alertId,
              serverHostname: `${sitePrefix}Rack ${rack.id}`,
              channelId: ch.id,
              channelName: ch.name,
              channelType: ch.type,
              target: ch.target,
              severity: 'critical',
              status: 'Delivered',
              summary: `${RACK_CRITICAL_POWER_RULE_NAME} on ${rack.id} (${stat.powerKw.toFixed(
                2
              )} kW > ${limitKw.toFixed(1)} kW limit)`,
            };
            newDispatches.unshift(dispatch);
            ch.lastDispatchedAt = now;
            ch.deliveryCount += 1;
          }
        }
      } else if (
        existingOpenIdx >= 0 &&
        nextAlerts[existingOpenIdx].state !== 'ignored'
      ) {
        // Hysteresis margin below effective limit (or immediate resolve when hall policy disabled)
        if (!policy.enabled || stat.powerKw <= limitKw - hysteresisKw) {
          nextAlerts[existingOpenIdx] = {
            ...nextAlerts[existingOpenIdx],
            currentValue: Number(stat.powerKw.toFixed(2)),
            state: 'resolved',
            resolvedAt: now,
          };
        }
      }
    }

    // Per-rack thermal sensor violation based on average temperature of servers within this rack
    const thermalStat = rackThermalStats[rack.id];
    const hasExplicitOverride = Boolean(rackThermalStatsOverride && rackThermalStatsOverride[rack.id]);
    const hasActiveMountedServers = Boolean(thermalStat && thermalStat.hasLiveServers && thermalStat.serverCount > 0);
    const existingThermalIdx = nextAlerts.findIndex(
      (a) =>
        a.ruleId === RACK_THERMAL_VIOLATION_RULE_ID &&
        (a.rackId === rack.id || a.serverId === entityId) &&
        a.state !== 'resolved'
    );

    if (!thermalStat || (!hasActiveMountedServers && !hasExplicitOverride)) {
      // Auto-resolve any open thermal alert if all mounted servers were drained to maintenance or removed
      if (existingThermalIdx >= 0 && nextAlerts[existingThermalIdx].state !== 'ignored') {
        nextAlerts[existingThermalIdx] = {
          ...nextAlerts[existingThermalIdx],
          state: 'resolved',
          resolvedAt: now,
        };
      }
      continue;
    }

    const hallThermalPolicy = hallThermalPolicies?.[rack.hallId];
    const thermalEnabled =
      rackThermalThresholds?.enabled ?? hallThermalPolicy?.enabled ?? true;
    const warningTempC =
      rackThermalThresholds?.warningTempC ??
      hallThermalPolicy?.warningTempC ??
      DEFAULT_RACK_THERMAL_WARNING_C;
    const criticalTempC = Math.max(
      warningTempC,
      rackThermalThresholds?.criticalTempC ??
        hallThermalPolicy?.criticalTempC ??
        DEFAULT_RACK_THERMAL_CRITICAL_C
    );
    const thermalHysteresisC = Math.max(
      0,
      rackThermalThresholds?.hysteresisC ??
        hallThermalPolicy?.hysteresisC ??
        DEFAULT_RACK_THERMAL_HYSTERESIS_C
    );

    const avgTempC = Number(thermalStat.avgTempC.toFixed(1));
    const isThermalCritical = thermalEnabled && avgTempC >= criticalTempC;
    const isThermalWarning = thermalEnabled && !isThermalCritical && avgTempC >= warningTempC;
    const isThermalViolated = isThermalCritical || isThermalWarning;

    if (isThermalViolated) {
      thermalViolationRackIds.push(rack.id);
      const severity = isThermalCritical ? 'critical' : 'warning';
      const activeThresholdC = isThermalCritical ? criticalTempC : warningTempC;
      const overC = Number((avgTempC - activeThresholdC).toFixed(1));
      const serverNoun = thermalStat.serverCount === 1 ? 'server' : 'servers';
      const msg = `${RACK_THERMAL_VIOLATION_RULE_NAME}: ${rack.id} avg server temp ${avgTempC.toFixed(
        1
      )}°C across ${thermalStat.serverCount} ${serverNoun} (peak ${thermalStat.maxTempC.toFixed(
        1
      )}°C), exceeding ${activeThresholdC.toFixed(1)}°C ${
        isThermalCritical ? 'critical' : 'warning'
      } threshold (+${overC.toFixed(1)}°C)`;

      const thermalEligibleChannels = Array.from(channelMap.values()).filter((ch) => {
        if (!ch.enabled) return false;
        if (ch.minSeverity === 'critical' && severity !== 'critical') return false;
        return true;
      });

      if (existingThermalIdx >= 0) {
        const existing = nextAlerts[existingThermalIdx];
        const escalatedToCritical = existing.severity !== 'critical' && severity === 'critical';
        const dispatchedNames = new Set(existing.dispatchedChannelNames);

        if (escalatedToCritical) {
          for (const ch of thermalEligibleChannels) {
            if (!dispatchedNames.has(ch.name)) {
              dispatchedNames.add(ch.name);
              const dispatch: DispatchLogEntry = {
                id: `dsp-${now.toString(36)}-rthm-${newDispatches.length}-${ch.id.slice(-3)}`,
                timestamp: now,
                alertId: existing.id,
                serverHostname: `${sitePrefix}Rack ${rack.id}`,
                channelId: ch.id,
                channelName: ch.name,
                channelType: ch.type,
                target: ch.target,
                severity: 'critical',
                status: 'Delivered',
                summary: `${RACK_THERMAL_VIOLATION_RULE_NAME} escalated to CRITICAL on ${rack.id} (avg ${avgTempC.toFixed(
                  1
                )}°C >= ${criticalTempC.toFixed(1)}°C)`,
              };
              newDispatches.unshift(dispatch);
              ch.lastDispatchedAt = now;
              ch.deliveryCount += 1;
            }
          }
        }

        nextAlerts[existingThermalIdx] = {
          ...existing,
          severity,
          currentValue: avgTempC,
          threshold: activeThresholdC,
          dispatchedChannelNames: Array.from(dispatchedNames),
          message: msg,
        };
      } else {
        const alertId = `alt-${now.toString(36)}-thm-${rack.id.toLowerCase()}-${newAlerts.length}`;
        const createdAlert: ActiveAlert = {
          id: alertId,
          ruleId: RACK_THERMAL_VIOLATION_RULE_ID,
          ruleName: RACK_THERMAL_VIOLATION_RULE_NAME,
          serverId: entityId,
          serverHostname: `${sitePrefix}Rack ${rack.id}`,
          rackId: rack.id,
          metric: 'rackAvgTempC',
          currentValue: avgTempC,
          threshold: activeThresholdC,
          operator: '>=',
          severity,
          state: 'active',
          triggeredAt: now,
          acknowledgedAt: null,
          acknowledgedBy: null,
          resolvedAt: null,
          dispatchedChannelNames: thermalEligibleChannels.map((c) => c.name),
          message: msg,
        };

        nextAlerts.unshift(createdAlert);
        newAlerts.push(createdAlert);

        for (const ch of thermalEligibleChannels) {
          const dispatch: DispatchLogEntry = {
            id: `dsp-${now.toString(36)}-rthm-${newDispatches.length}-${ch.id.slice(-3)}`,
            timestamp: now,
            alertId,
            serverHostname: `${sitePrefix}Rack ${rack.id}`,
            channelId: ch.id,
            channelName: ch.name,
            channelType: ch.type,
            target: ch.target,
            severity,
            status: 'Delivered',
            summary: `${RACK_THERMAL_VIOLATION_RULE_NAME} on ${rack.id} (avg ${avgTempC.toFixed(
              1
            )}°C >= ${activeThresholdC.toFixed(1)}°C)`,
          };
          newDispatches.unshift(dispatch);
          ch.lastDispatchedAt = now;
          ch.deliveryCount += 1;
        }
      }
    } else if (
      existingThermalIdx >= 0 &&
      nextAlerts[existingThermalIdx].state !== 'ignored'
    ) {
      if (!thermalEnabled || avgTempC <= warningTempC - thermalHysteresisC) {
        nextAlerts[existingThermalIdx] = {
          ...nextAlerts[existingThermalIdx],
          currentValue: avgTempC,
          state: 'resolved',
          resolvedAt: now,
        };
      } else {
        // Inside hysteresis recovery deadband: update live reading without flapping state
        nextAlerts[existingThermalIdx] = {
          ...nextAlerts[existingThermalIdx],
          currentValue: avgTempC,
        };
      }
    }
  }

  return {
    alerts: nextAlerts.slice(0, 80),
    newAlerts,
    newDispatches,
    updatedChannels: Array.from(channelMap.values()),
    exceededRackIds,
    thermalViolationRackIds,
    rackThermalStats,
  };
}

export function applyFaultToServer(server: ServerNode, fault: FaultType | null): ServerNode {
  if (!fault) {
    // Recover server back to safe operating envelope
    const cooledTemp = server.role === 'GPU Inference' ? 61.5 : 46.5;
    const normalInlet = server.role === 'GPU Inference' ? 21.6 : 20.9;
    const normalCpu = server.role === 'GPU Inference' ? 64.0 : 51.0;
    const normalMem = server.role === 'GPU Inference' ? 71.0 : 60.0;
    return {
      ...server,
      activeFault: null,
      status: server.status === 'maintenance' ? 'maintenance' : 'nominal',
      cpu: normalCpu,
      memory: normalMem,
      tempC: cooledTemp,
      inletTempC: normalInlet,
      packetLoss: 0.01,
      psuStatus: 'Redundant (2/2)',
      fanRpm: server.role === 'GPU Inference' ? 8100 : 5400,
    };
  }

  switch (fault) {
    case 'thermal_spike':
      return {
        ...server,
        activeFault: 'thermal_spike',
        status: 'critical',
        tempC: 84.6,
        inletTempC: 25.4,
        fanRpm: 12200,
        powerW: Math.min(server.ratedPowerW, Math.round(server.powerW * 1.15)),
      };
    case 'cpu_surge':
      return {
        ...server,
        activeFault: 'cpu_surge',
        status: 'critical',
        cpu: 96.4,
        tempC: Math.max(server.tempC, 72.5),
        fanRpm: Math.max(server.fanRpm, 9800),
      };
    case 'memory_leak':
      return {
        ...server,
        activeFault: 'memory_leak',
        status: 'warning',
        memory: 93.8,
      };
    case 'network_drop':
      return {
        ...server,
        activeFault: 'network_drop',
        status: 'critical',
        packetLoss: 4.8,
      };
    case 'psu_degraded':
      return {
        ...server,
        activeFault: 'psu_degraded',
        status: 'critical',
        psuStatus: 'Degraded (1/2)',
      };
  }
}

export interface TelemetryTickResult {
  servers: ServerNode[];
  rules: AlertRule[];
  alerts: ActiveAlert[];
  newAlerts: ActiveAlert[];
  dispatchLogs: DispatchLogEntry[];
  channels: NotificationChannel[];
  facilityPoint: FacilityTelemetryPoint;
}

export function stepTelemetryTick(params: {
  servers: ServerNode[];
  rules: AlertRule[];
  alerts: ActiveAlert[];
  dispatchLogs: DispatchLogEntry[];
  channels: NotificationChannel[];
  racks?: RackDefinition[];
  bms?: BmsState;
  rackPowerAdjustmentsKw?: Record<string, number>;
  hallPowerPolicies?: HallPowerPolicyMap;
  hallThermalPolicies?: HallThermalPolicyMap;
  rackThermalThresholds?: RackThermalThresholds;
  facilityHistory?: FacilityTelemetryPoint[];
  siteCode?: string;
  tickCount: number;
  now: number;
}): TelemetryTickResult {
  const {
    servers,
    rules,
    alerts,
    dispatchLogs,
    channels,
    racks,
    bms,
    rackPowerAdjustmentsKw,
    hallPowerPolicies,
    hallThermalPolicies,
    rackThermalThresholds,
    facilityHistory,
    siteCode,
    tickCount,
    now,
  } = params;

  const steppedServers: ServerNode[] = servers.map((srv, idx) => {
    if (srv.status === 'maintenance') {
      const sample = {
        timestamp: now,
        cpu: srv.cpu,
        memory: srv.memory,
        tempC: srv.tempC,
        powerW: srv.powerW,
        networkGbps: srv.networkGbps,
      };
      return { ...srv, history: [...srv.history.slice(-19), sample] };
    }

    // Deterministic smooth telemetry oscillation (no noisy jumps)
    const phase = tickCount * 0.42 + idx * 1.13;
    const driftCpu = Math.sin(phase) * 2.1 + Math.cos(phase * 0.5) * 1.1;
    const driftMem = Math.cos(phase * 0.7) * 0.9;
    const driftTemp = Math.sin(phase * 0.6) * 0.75;
    const driftNet = Math.sin(phase * 0.85) * 1.8;

    let targetCpu = clamp(srv.cpu + driftCpu * 0.55, 8, 99.5);
    let targetMem = clamp(srv.memory + driftMem * 0.45, 14, 98.5);
    let targetTemp = clamp(srv.tempC + driftTemp * 0.5, 30, 94);
    let targetLoss = clamp(srv.packetLoss + Math.sin(phase) * 0.005, 0, 12);

    // Maintain injected faults realistically
    if (srv.activeFault === 'thermal_spike') {
      targetTemp = clamp(83.5 + Math.sin(phase) * 1.8, 80.5, 89);
    } else if (srv.activeFault === 'cpu_surge') {
      targetCpu = clamp(95.2 + Math.sin(phase) * 2.1, 91.5, 99.2);
    } else if (srv.activeFault === 'memory_leak') {
      targetMem = clamp(92.5 + Math.cos(phase) * 1.4, 89.5, 97.5);
    } else if (srv.activeFault === 'network_drop') {
      targetLoss = clamp(4.2 + Math.sin(phase) * 0.9, 2.4, 7.5);
    } else {
      // Gentle mean reversion for healthy workloads
      const idealCpu = srv.role === 'GPU Inference' ? 68 : srv.role === 'Network Spine' ? 32 : 54;
      targetCpu = clamp(targetCpu + (idealCpu - targetCpu) * 0.06, 8, 88);
      const idealTemp = srv.role === 'GPU Inference' ? 62 : 46;
      targetTemp = clamp(targetTemp + (idealTemp - targetTemp) * 0.05, 32, 74);
    }

    const loadRatio = targetCpu / 100;
    const targetPower = Math.round(
      clamp(
        srv.ratedPowerW * (0.38 + loadRatio * 0.46) + (srv.activeFault === 'thermal_spike' ? 180 : 0),
        180,
        srv.ratedPowerW
      )
    );
    const targetNet = Number(clamp(srv.networkGbps + driftNet * 0.4, 1.0, 99.5).toFixed(1));
    const targetFan = Math.round(clamp(3800 + (targetTemp - 30) * 145, 3600, 13200));

    // Real-time server inlet temperature coupled to hall BMS cold-aisle intake + exhaust recirculation
    const hallEnv = bms?.envSensors.find((e) => e.hallId === srv.hallId);
    const baseColdAisle = hallEnv?.coldAisleTempC ?? (srv.role === 'GPU Inference' ? 22.0 : 21.0);
    const faultInletLift =
      srv.activeFault === 'thermal_spike' ? 3.8 : srv.activeFault === 'cpu_surge' ? 1.1 : 0;
    const exhaustRecircLift = Math.max(0, (targetTemp - 52) * 0.14);
    const loadInletLift = Math.max(0, (loadRatio - 0.45) * 1.4);
    const nodeOffset = ((idx % 5) - 2) * 0.22;
    const idealInlet =
      baseColdAisle +
      loadInletLift +
      exhaustRecircLift +
      faultInletLift +
      nodeOffset +
      Math.sin(phase * 0.45) * 0.35;
    const targetInlet = Number(
      clamp(srv.inletTempC + (idealInlet - srv.inletTempC) * 0.22, 16.0, 32.5).toFixed(1)
    );

    const nextSample = {
      timestamp: now,
      cpu: Number(targetCpu.toFixed(1)),
      memory: Number(targetMem.toFixed(1)),
      tempC: Number(targetTemp.toFixed(1)),
      powerW: targetPower,
      networkGbps: targetNet,
    };

    return {
      ...srv,
      cpu: nextSample.cpu,
      memory: nextSample.memory,
      tempC: nextSample.tempC,
      inletTempC: targetInlet,
      powerW: nextSample.powerW,
      networkGbps: nextSample.networkGbps,
      packetLoss: Number(targetLoss.toFixed(2)),
      fanRpm: targetFan,
      history: [...srv.history.slice(-19), nextSample],
    };
  });

  const evalResult = evaluateAlertRules(steppedServers, rules, alerts, channels, now, {
    facilityHistory,
    siteCode,
  });

  let mergedAlerts = evalResult.alerts;
  let mergedNewAlerts = evalResult.newAlerts;
  let mergedNewDispatches = evalResult.newDispatches;
  let mergedChannels = evalResult.updatedChannels;

  if (racks && bms) {
    const rackPowerEval = evaluateRackPowerCapacityAlerts({
      racks,
      bms,
      servers: steppedServers,
      existingAlerts: mergedAlerts,
      channels: mergedChannels,
      now,
      siteCode,
      rackPowerAdjustmentsKw,
      hallPowerPolicies,
      hallThermalPolicies,
      rackThermalThresholds,
    });
    mergedAlerts = rackPowerEval.alerts;
    mergedNewAlerts = [...rackPowerEval.newAlerts, ...mergedNewAlerts];
    mergedNewDispatches = [...rackPowerEval.newDispatches, ...mergedNewDispatches];
    mergedChannels = rackPowerEval.updatedChannels;
  }

  const finalizedServers = steppedServers.map((s) => ({
    ...s,
    status: deriveNodeStatus(s, mergedAlerts),
  }));

  const monitoredKw = finalizedServers.reduce((acc, s) => acc + s.powerW, 0) / 1000;
  const totalPowerKw = Number((BASE_CAMPUS_RACK_LOAD_KW + monitoredKw * 12).toFixed(1));
  const avgCpu = Number(
    (finalizedServers.reduce((acc, s) => acc + s.cpu, 0) / finalizedServers.length).toFixed(1)
  );
  const avgTempC = Number(
    (finalizedServers.reduce((acc, s) => acc + s.tempC, 0) / finalizedServers.length).toFixed(1)
  );
  const totalNetworkGbps = Number(
    finalizedServers.reduce((acc, s) => acc + s.networkGbps, 0).toFixed(1)
  );
  const pue = Number((1.22 + Math.max(0, (avgTempC - 45) * 0.008)).toFixed(2));

  const facilityPoint: FacilityTelemetryPoint = {
    timestamp: now,
    label: formatTimeLabel(now),
    totalPowerKw,
    pue,
    avgCpu,
    avgTempC,
    totalNetworkGbps,
  };

  return {
    servers: finalizedServers,
    rules: evalResult.updatedRules,
    alerts: mergedAlerts,
    newAlerts: mergedNewAlerts,
    dispatchLogs: [...mergedNewDispatches, ...dispatchLogs].slice(0, 120),
    channels: mergedChannels,
    facilityPoint,
  };
}

export function computeFacilitySummary(
  servers: ServerNode[],
  racks: RackDefinition[],
  alerts: ActiveAlert[]
): FacilitySummary {
  const totalServers = servers.length;
  const nominalCount = servers.filter((s) => s.status === 'nominal').length;
  const warningCount = servers.filter((s) => s.status === 'warning').length;
  const criticalCount = servers.filter((s) => s.status === 'critical').length;
  const maintenanceCount = servers.filter((s) => s.status === 'maintenance').length;

  const baseRacksKw = racks.reduce((acc, r) => acc + r.basePowerKw, 0);
  const monitoredKw = servers.reduce((acc, s) => acc + s.powerW, 0) / 1000;
  const totalItLoadKw = Number((baseRacksKw + monitoredKw * 12).toFixed(1));
  const totalFacilityCapacityKw = Number(
    racks.reduce((acc, r) => acc + r.powerCapacityKw, 0).toFixed(1)
  );
  const avgInletTempC =
    totalServers > 0
      ? Number((servers.reduce((acc, s) => acc + s.inletTempC, 0) / totalServers).toFixed(1))
      : 0;
  const avgExhaustTempC =
    totalServers > 0
      ? Number((servers.reduce((acc, s) => acc + s.tempC, 0) / totalServers).toFixed(1))
      : 0;
  const peakExhaustTempC =
    totalServers > 0 ? Number(Math.max(...servers.map((s) => s.tempC)).toFixed(1)) : 0;
  const avgCpu =
    totalServers > 0
      ? Number((servers.reduce((acc, s) => acc + s.cpu, 0) / totalServers).toFixed(1))
      : 0;
  const totalNetworkGbps = Number(
    servers.reduce((acc, s) => acc + s.networkGbps, 0).toFixed(1)
  );
  const pue = Number((1.22 + Math.max(0, (avgExhaustTempC - 45) * 0.008)).toFixed(2));

  const openAlerts = alerts.filter((a) => isAlertOpen(a));
  const activeAlertCount = openAlerts.length;
  const activeCriticalCount = openAlerts.filter((a) => a.severity === 'critical').length;
  const unacknowledgedCount = alerts.filter((a) => a.state === 'active').length;

  return {
    totalServers,
    nominalCount,
    warningCount,
    criticalCount,
    maintenanceCount,
    totalItLoadKw,
    totalFacilityCapacityKw,
    pue,
    avgInletTempC,
    avgExhaustTempC,
    peakExhaustTempC,
    avgCpu,
    totalNetworkGbps,
    activeAlertCount,
    activeCriticalCount,
    unacknowledgedCount,
  };
}

export function filterServers(
  servers: ServerNode[],
  criteria: ServerFilterCriteria,
  racks?: RackDefinition[]
): ServerNode[] {
  const q = criteria.search.trim().toLowerCase();
  const rackLookup = racks ? new Map(racks.map((r) => [r.id, r])) : null;
  const targetMfr = criteria.rackManufacturer && criteria.rackManufacturer !== 'all'
    ? criteria.rackManufacturer
    : null;
  const targetDensity = criteria.powerDensityRating && criteria.powerDensityRating !== 'all'
    ? criteria.powerDensityRating
    : null;

  return servers.filter((srv) => {
    if (criteria.hallId !== 'all' && srv.hallId !== criteria.hallId) return false;
    if (criteria.status !== 'all' && srv.status !== criteria.status) return false;
    if (criteria.rackId !== 'all' && srv.rackId !== criteria.rackId) return false;

    const rack = rackLookup?.get(srv.rackId);
    if (targetMfr && rack?.manufacturer !== targetMfr) return false;
    if (targetDensity && rack?.powerDensityRating !== targetDensity) return false;

    if (q) {
      const hay = `${srv.hostname} ${srv.ip} ${srv.model} ${srv.rackId} ${srv.role} ${rack?.manufacturer ?? ''} ${rack?.powerDensityRating ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const STATUS_WEIGHT: Record<NodeStatus, number> = {
  critical: 0,
  warning: 1,
  nominal: 2,
  maintenance: 3,
};

export function sortServers(
  servers: ServerNode[],
  sortKey: ServerSortKey,
  direction: 'asc' | 'desc'
): ServerNode[] {
  const mult = direction === 'asc' ? 1 : -1;
  return [...servers].sort((a, b) => {
    if (sortKey === 'hostname') return a.hostname.localeCompare(b.hostname) * mult;
    if (sortKey === 'status') return (STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status]) * mult;
    return (a[sortKey] - b[sortKey]) * mult;
  });
}

export function validateAlertRuleDraft(draft: AlertRuleDraft): AlertRuleValidationResult {
  const errors: Partial<Record<keyof AlertRuleDraft, string>> = {};
  const trimmedName = draft.name.trim();
  if (!trimmedName) {
    errors.name = 'Rule name is required.';
  } else if (trimmedName.length < 3) {
    errors.name = 'Rule name must be at least 3 characters.';
  }

  const isPowerSurge =
    draft.ruleType === 'facility_power_surge' || draft.metric === 'facilityPowerMw';

  const thresholdNum = Number(draft.threshold);
  if (draft.threshold.trim() === '' || Number.isNaN(thresholdNum)) {
    errors.threshold = 'Enter a valid numeric threshold.';
  } else if (thresholdNum <= 0) {
    errors.threshold = 'Threshold must be greater than 0.';
  } else if (isPowerSurge && thresholdNum > 100) {
    errors.threshold = 'Facility power surge threshold must be 100 MW or lower.';
  } else if (
    (draft.metric === 'cpu' || draft.metric === 'memory' || draft.metric === 'disk') &&
    thresholdNum > 100
  ) {
    errors.threshold = 'Percentage threshold cannot exceed 100%.';
  } else if (draft.metric === 'tempC' && thresholdNum > 120) {
    errors.threshold = 'Thermal threshold must be 120°C or lower.';
  }

  if (isPowerSurge) {
    const sustainedNum = Number(draft.sustainedDurationSec);
    if (
      draft.sustainedDurationSec.trim() === '' ||
      Number.isNaN(sustainedNum) ||
      sustainedNum < 10 ||
      sustainedNum > 3600
    ) {
      errors.sustainedDurationSec = 'Sustained period must be between 10 and 3600 seconds.';
    }
  }

  const cooldownNum = Number(draft.cooldownSec);
  if (draft.cooldownSec.trim() === '' || Number.isNaN(cooldownNum) || cooldownNum < 15 || cooldownNum > 3600) {
    errors.cooldownSec = 'Cooldown must be between 15 and 3600 seconds.';
  }

  if (draft.channelIds.length === 0) {
    errors.channelIds = 'Select at least one notification channel.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

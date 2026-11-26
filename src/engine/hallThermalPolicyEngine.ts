import { HallId, HallThermalPolicy, HallThermalPolicyMap } from './types';

export const DEFAULT_HALL_THERMAL_POLICIES: HallThermalPolicyMap = {
  'hall-a': {
    hallId: 'hall-a',
    warningTempC: 65,
    criticalTempC: 72,
    hysteresisC: 1.5,
    enabled: true,
  },
  'hall-b': {
    hallId: 'hall-b',
    warningTempC: 65,
    criticalTempC: 72,
    hysteresisC: 1.5,
    enabled: true,
  },
  'hall-c': {
    hallId: 'hall-c',
    warningTempC: 62,
    criticalTempC: 69,
    hysteresisC: 1.5,
    enabled: true,
  },
  'hall-d': {
    hallId: 'hall-d',
    warningTempC: 65,
    criticalTempC: 72,
    hysteresisC: 1.5,
    enabled: true,
  },
};

export function createDefaultHallThermalPolicies(): HallThermalPolicyMap {
  return {
    'hall-a': { ...DEFAULT_HALL_THERMAL_POLICIES['hall-a'] },
    'hall-b': { ...DEFAULT_HALL_THERMAL_POLICIES['hall-b'] },
    'hall-c': { ...DEFAULT_HALL_THERMAL_POLICIES['hall-c'] },
    'hall-d': { ...DEFAULT_HALL_THERMAL_POLICIES['hall-d'] },
  };
}

export function sanitizeHallThermalPolicy(
  hallId: HallId,
  patch: Partial<HallThermalPolicy>
): HallThermalPolicy {
  const base = DEFAULT_HALL_THERMAL_POLICIES[hallId];
  const rawWarn =
    typeof patch.warningTempC === 'number' && Number.isFinite(patch.warningTempC)
      ? patch.warningTempC
      : base.warningTempC;
  const warningTempC = Math.round(Math.max(50, Math.min(80, rawWarn)) * 10) / 10;

  const rawCrit =
    typeof patch.criticalTempC === 'number' && Number.isFinite(patch.criticalTempC)
      ? patch.criticalTempC
      : Math.max(base.criticalTempC, warningTempC + 4);
  const criticalTempC =
    Math.round(Math.max(warningTempC + 2, Math.min(90, rawCrit)) * 10) / 10;

  const rawHyst =
    typeof patch.hysteresisC === 'number' && Number.isFinite(patch.hysteresisC)
      ? patch.hysteresisC
      : base.hysteresisC;
  const hysteresisC = Math.round(Math.max(0.5, Math.min(5.0, rawHyst)) * 10) / 10;

  return {
    hallId,
    warningTempC,
    criticalTempC,
    hysteresisC,
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : base.enabled,
  };
}

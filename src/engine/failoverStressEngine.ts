import { BmsState } from './bmsTypes';
import { computeBmsRackPowerStats } from './rackPowerEngine';
import { computeRackInletThermalStats } from './rackHeatmapEngine';
import { HallId, HallPowerPolicyMap, RackDefinition, ServerNode } from './types';

export type FailoverStressMode = 'none' | 'feed_a_loss' | 'crac_trip' | 'combined';
export type FailoverVerdict = 'pass' | 'at_risk' | 'violation';

export const ASHRAE_A1_MAX_INLET_C = 27.0;

export interface RackFailoverAudit {
  rackId: string;
  hallId: HallId;
  currentPowerKw: number;
  ratedPowerKw: number;
  /** Under 2N single-feed loss (Feed A open), Feed B absorbs 100% of load against 50% design budget */
  survivingFeedLoadPct: number;
  feedBOverloadKw: number;
  powerVerdict: FailoverVerdict;
  baselineInletTempC: number;
  tempRiseCPerMin: number;
  minutesToAshraeBreach: number | null;
  coolingVerdict: FailoverVerdict;
  overallVerdict: FailoverVerdict;
}

export interface FailoverStressSummary {
  mode: FailoverStressMode;
  totalRacks: number;
  powerViolationCount: number;
  powerAtRiskCount: number;
  coolingViolationCount: number;
  coolingAtRiskCount: number;
  shortestMinutesToBreach: number | null;
  worstPowerRackId: string | null;
  worstPowerFeedBPct: number;
  worstCoolingRackId: string | null;
  byRack: Record<string, RackFailoverAudit>;
}

/**
 * Evaluates live 2N A+B power failover survival (flagging racks >50% rated capacity that would
 * overload surviving Feed B upon Feed A loss) and N+1 CRAC trip thermal ride-through time
 * until ASHRAE A1 cold-aisle inlet limit (27.0°C).
 */
export function computeFailoverStressAudit(params: {
  racks: RackDefinition[];
  servers: ServerNode[];
  bms: BmsState;
  mode: FailoverStressMode;
  rackPowerAdjustmentsKw?: Record<string, number>;
  hallPowerPolicies?: HallPowerPolicyMap;
}): FailoverStressSummary {
  const { racks, servers, bms, mode, rackPowerAdjustmentsKw, hallPowerPolicies } = params;
  const powerStats = computeBmsRackPowerStats(racks, bms, servers, {
    rackPowerAdjustmentsKw,
    hallPowerPolicies,
  });
  const inletStats = computeRackInletThermalStats(racks, servers, bms);

  const checkPower = mode === 'feed_a_loss' || mode === 'combined';
  const checkCooling = mode === 'crac_trip' || mode === 'combined';

  const byRack: Record<string, RackFailoverAudit> = {};
  let powerViolationCount = 0;
  let powerAtRiskCount = 0;
  let coolingViolationCount = 0;
  let coolingAtRiskCount = 0;
  let shortestMinutesToBreach: number | null = null;
  let worstPowerRackId: string | null = null;
  let worstPowerFeedBPct = 0;
  let worstCoolingRackId: string | null = null;

  for (const rack of racks) {
    const pStat = powerStats[rack.id];
    const iStat = inletStats[rack.id];
    const currentPowerKw = pStat?.powerKw ?? rack.basePowerKw;
    const ratedPowerKw = rack.powerCapacityKw;
    // In 2N A+B topology, each feed breaker is provisioned at 50% of rated combined cabinet capacity
    const singleFeedBudgetKw = ratedPowerKw * 0.5;
    const survivingFeedLoadPct = Math.round((currentPowerKw / Math.max(0.1, singleFeedBudgetKw)) * 1000) / 10;
    const feedBOverloadKw = Math.max(0, Math.round((currentPowerKw - singleFeedBudgetKw) * 100) / 100);

    let powerVerdict: FailoverVerdict = 'pass';
    if (checkPower) {
      if (survivingFeedLoadPct > 100) {
        powerVerdict = 'violation';
        powerViolationCount += 1;
      } else if (survivingFeedLoadPct >= 85) {
        powerVerdict = 'at_risk';
        powerAtRiskCount += 1;
      }
      if (survivingFeedLoadPct > worstPowerFeedBPct) {
        worstPowerFeedBPct = survivingFeedLoadPct;
        worstPowerRackId = rack.id;
      }
    }

    const baselineInletTempC = iStat?.avgInletTempC ?? rack.ambientTempC;
    // Higher kW cabinets heat up cold aisles faster when an N+1 CRAC unit trips
    const hallCracCount = Math.max(1, bms.cracUnits.filter((c) => c.hallId === rack.hallId).length);
    const thermalLossFactor = 1 / Math.max(1, hallCracCount);
    const tempRiseCPerMin =
      Math.round((0.08 + (currentPowerKw / Math.max(8, ratedPowerKw)) * 0.42 * (1 + thermalLossFactor)) * 100) /
      100;

    let minutesToAshraeBreach: number | null = null;
    let coolingVerdict: FailoverVerdict = 'pass';

    if (checkCooling) {
      const marginC = ASHRAE_A1_MAX_INLET_C - baselineInletTempC;
      if (marginC <= 0) {
        minutesToAshraeBreach = 0;
        coolingVerdict = 'violation';
        coolingViolationCount += 1;
      } else {
        minutesToAshraeBreach = Math.round((marginC / Math.max(0.05, tempRiseCPerMin)) * 10) / 10;
        if (minutesToAshraeBreach <= 12) {
          coolingVerdict = 'violation';
          coolingViolationCount += 1;
        } else if (minutesToAshraeBreach <= 20) {
          coolingVerdict = 'at_risk';
          coolingAtRiskCount += 1;
        }
      }

      if (
        minutesToAshraeBreach !== null &&
        (shortestMinutesToBreach === null || minutesToAshraeBreach < shortestMinutesToBreach)
      ) {
        shortestMinutesToBreach = minutesToAshraeBreach;
        worstCoolingRackId = rack.id;
      }
    }

    const overallVerdict: FailoverVerdict =
      powerVerdict === 'violation' || coolingVerdict === 'violation'
        ? 'violation'
        : powerVerdict === 'at_risk' || coolingVerdict === 'at_risk'
        ? 'at_risk'
        : 'pass';

    byRack[rack.id] = {
      rackId: rack.id,
      hallId: rack.hallId,
      currentPowerKw,
      ratedPowerKw,
      survivingFeedLoadPct,
      feedBOverloadKw,
      powerVerdict,
      baselineInletTempC,
      tempRiseCPerMin,
      minutesToAshraeBreach,
      coolingVerdict,
      overallVerdict,
    };
  }

  return {
    mode,
    totalRacks: racks.length,
    powerViolationCount,
    powerAtRiskCount,
    coolingViolationCount,
    coolingAtRiskCount,
    shortestMinutesToBreach,
    worstPowerRackId,
    worstPowerFeedBPct,
    worstCoolingRackId,
    byRack,
  };
}

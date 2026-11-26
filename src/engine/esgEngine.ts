import { BmsState } from './bmsTypes';
import { SITE_META_MAP, SiteId } from './sites';

export interface EsgMonthlyPoint {
  month: string;
  pue: number;
  wueLitersPerKwh: number;
  cueKgCo2PerKwh: number;
  refPct: number;
  scope2Tonnes: number;
  waterM3: number;
}

export interface EsgSiteMetrics {
  siteId: SiteId;
  siteCode: string;
  itLoadMw: number;
  facilityLoadMw: number;
  pue: number;
  wueLitersPerKwh: number; // Industry target < 1.2 L/kWh
  cueKgCo2PerKwh: number; // kg CO2e per kWh of IT load
  refPct: number; // Renewable Energy Factor (%)
  gridEmissionFactorKgPerKwh: number; // Peninsular Malaysia grid ~0.585 kgCO2e/kWh
  dailyWaterM3: number;
  annualizedWaterM3: number;
  monthlyScope2Tonnes: number;
  annualizedScope2Tonnes: number;
  annualizedAvoidedTonnes: number;
  waterChillerSharePct: number;
  liquidCduLoopSharePct: number;
  history12m: EsgMonthlyPoint[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function computeSiteEsgMetrics(params: {
  siteId: SiteId;
  bms: BmsState;
  itLoadKw: number;
  pue: number;
  renewablePpaOverridePct?: number;
}): EsgSiteMetrics {
  const { siteId, bms, itLoadKw, pue } = params;
  const meta = SITE_META_MAP[siteId];
  const baseRef = siteId === 'kl1' ? 42 : siteId === 'kl2' ? 54 : 36;
  const refPct = Math.max(0, Math.min(100, params.renewablePpaOverridePct ?? baseRef));

  // Scale IT load to live facility scale (MW)
  const upsLoadKw = bms.upsSystems.reduce((s, u) => s + u.loadKw, 0);
  const effectiveItKw = Math.max(itLoadKw, upsLoadKw * 0.85, 4800);
  const itLoadMw = round2(effectiveItKw / 1000);
  const facilityLoadMw = round2(itLoadMw * pue);

  // Water consumption: water-cooled chillers evaporate ~1.65 L/kWh of heat rejected; air chillers use ~0.04 L/kWh; closed-loop CDU uses ~0.12 L/kWh makeup
  const waterChillersKw = bms.chillers
    .filter((c) => c.chillerType === 'Water-Cooled')
    .reduce((sum, c) => sum + c.coolingOutputKw, 0);
  const airChillersKw = bms.chillers
    .filter((c) => c.chillerType === 'Air-Cooled')
    .reduce((sum, c) => sum + c.coolingOutputKw, 0);
  const totalCoolingKw = Math.max(1, waterChillersKw + airChillersKw);

  const waterChillerSharePct = Math.round((waterChillersKw / totalCoolingKw) * 100);
  const liquidCduLoopSharePct = siteId === 'kl1' ? 24 : siteId === 'kl2' ? 28 : 19;

  // Liters per hour across cooling plant
  const hourlyWaterLiters =
    waterChillersKw * 1.48 + airChillersKw * 0.04 + effectiveItKw * (liquidCduLoopSharePct / 100) * 0.14;
  const wueLitersPerKwh = round2(Math.max(0.28, Math.min(2.4, hourlyWaterLiters / Math.max(1, effectiveItKw))));
  const dailyWaterM3 = round2((hourlyWaterLiters * 24) / 1000);
  const annualizedWaterM3 = Math.round(dailyWaterM3 * 365);

  // Grid carbon intensity (Peninsular Malaysia TNB ~0.585 kg CO2e / kWh)
  const gridEmissionFactorKgPerKwh = 0.585;
  const residualGridFraction = 1 - refPct / 100;
  // CUE = Total Facility Carbon Emissions / IT Energy = PUE * gridFactor * (1 - REF)
  const cueKgCo2PerKwh = round3(pue * gridEmissionFactorKgPerKwh * residualGridFraction);

  const monthlyItKwh = effectiveItKw * 730;
  const monthlyScope2Tonnes = round2((monthlyItKwh * cueKgCo2PerKwh) / 1000);
  const annualizedScope2Tonnes = Math.round(monthlyScope2Tonnes * 12);
  const grossAnnualTonnes = Math.round(((effectiveItKw * 8760 * pue * gridEmissionFactorKgPerKwh) / 1000));
  const annualizedAvoidedTonnes = Math.max(0, grossAnnualTonnes - annualizedScope2Tonnes);

  // Deterministic 12-month ESG trend series anchored to live site metrics
  const monthNames = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
  const history12m: EsgMonthlyPoint[] = monthNames.map((m, idx) => {
    const progress = idx / 11; // 0 (11 months ago) -> 1 (current)
    const seasonal = Math.sin(((idx + 2) / 12) * Math.PI * 2) * 0.04;
    const histPue = round3(pue + (1 - progress) * 0.055 + seasonal * 0.35);
    const histRef = Math.round(Math.max(5, Math.min(100, refPct - (1 - progress) * 11)));
    const histWue = round2(Math.max(0.25, wueLitersPerKwh + (1 - progress) * 0.14 + seasonal * 1.1));
    const histCue = round3(histPue * gridEmissionFactorKgPerKwh * (1 - histRef / 100));
    const histScope2 = round2(((effectiveItKw * (0.91 + progress * 0.09) * 730) * histCue) / 1000);
    const histWaterM3 = Math.round((effectiveItKw * (0.91 + progress * 0.09) * 730 * histWue) / 1000);
    return {
      month: m,
      pue: histPue,
      wueLitersPerKwh: histWue,
      cueKgCo2PerKwh: histCue,
      refPct: histRef,
      scope2Tonnes: histScope2,
      waterM3: histWaterM3,
    };
  });

  return {
    siteId,
    siteCode: meta.code,
    itLoadMw,
    facilityLoadMw,
    pue: round2(pue),
    wueLitersPerKwh,
    cueKgCo2PerKwh,
    refPct,
    gridEmissionFactorKgPerKwh,
    dailyWaterM3,
    annualizedWaterM3,
    monthlyScope2Tonnes,
    annualizedScope2Tonnes,
    annualizedAvoidedTonnes,
    waterChillerSharePct,
    liquidCduLoopSharePct,
    history12m,
  };
}

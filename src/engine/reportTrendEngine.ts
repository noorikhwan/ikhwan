import { GeneratedReport, ReportRow } from './reportEngine';

export type ReportChartKind = 'area' | 'line' | 'bar' | 'stacked_bar';

export interface ReportTrendSeriesDef {
  key: string;
  label: string;
  color: string;
  unit?: string;
}

export interface ReportTrendReferenceLine {
  value: number;
  label: string;
  color: string;
}

export interface ReportTrendMetricOption {
  id: string;
  label: string;
  shortLabel: string;
  unit: string;
  decimals: number;
  chartKind: ReportChartKind;
  series: ReportTrendSeriesDef[];
  data: Array<Record<string, string | number>>;
  referenceLines?: ReportTrendReferenceLine[];
  stats: {
    latestLabel: string;
    latestValue: number;
    average: number;
    min: number;
    max: number;
    delta: number | null;
    deltaPct: number | null;
    pointCount: number;
  };
}

export interface ReportTrendModel {
  reportId: string;
  reportTitle: string;
  subtitle: string;
  metrics: ReportTrendMetricOption[];
}

const SERIES_PALETTE = [
  '#009530',
  '#0284c7',
  '#d97706',
  '#7c3aed',
  '#dc2626',
  '#0d9488',
  '#4f46e5',
  '#ea580c',
];

function toNum(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^0-9.\-+]/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function roundTo(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

function computeStats(
  data: Array<Record<string, string | number>>,
  primaryKey: string,
  decimals: number,
  isSequential: boolean
): ReportTrendMetricOption['stats'] {
  const vals = data
    .map((d) => ({ x: String(d.xLabel ?? ''), v: typeof d[primaryKey] === 'number' ? (d[primaryKey] as number) : null }))
    .filter((item): item is { x: string; v: number } => item.v !== null && Number.isFinite(item.v));

  if (vals.length === 0) {
    return {
      latestLabel: '—',
      latestValue: 0,
      average: 0,
      min: 0,
      max: 0,
      delta: null,
      deltaPct: null,
      pointCount: 0,
    };
  }

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const item of vals) {
    if (item.v < min) min = item.v;
    if (item.v > max) max = item.v;
    sum += item.v;
  }
  const first = vals[0];
  const last = vals[vals.length - 1];
  const delta = isSequential && vals.length >= 2 ? roundTo(last.v - first.v, decimals) : null;
  const deltaPct =
    delta !== null && Math.abs(first.v) > 1e-6 ? roundTo((delta / Math.abs(first.v)) * 100, 1) : null;

  return {
    latestLabel: last.x,
    latestValue: roundTo(last.v, decimals),
    average: roundTo(sum / vals.length, decimals),
    min: roundTo(min, decimals),
    max: roundTo(max, decimals),
    delta,
    deltaPct,
    pointCount: vals.length,
  };
}

function formatShortTs(ts: string): string {
  // '2026-11-22 04:10:00 UTC' -> '11-22 04:10'
  if (ts.length >= 16) return ts.slice(5, 16);
  return ts;
}

function buildHistoricalTrendsMetrics(rows: ReportRow[]): ReportTrendMetricOption[] {
  const defs: Array<{
    id: string;
    label: string;
    shortLabel: string;
    unit: string;
    decimals: number;
    secondaryKey?: string;
    secondaryLabel?: string;
    refLines?: ReportTrendReferenceLine[];
  }> = [
    {
      id: 'itLoadMw',
      label: 'IT Load Trajectory (Avg & Peak)',
      shortLabel: 'IT Load (MW)',
      unit: 'MW',
      decimals: 2,
      secondaryKey: 'peakItLoadMw',
      secondaryLabel: 'Peak IT Load',
    },
    {
      id: 'pue',
      label: 'Power Usage Effectiveness (PUE)',
      shortLabel: 'PUE',
      unit: 'PUE',
      decimals: 3,
      refLines: [{ value: 1.3, label: 'Target 1.30', color: '#0284c7' }],
    },
    {
      id: 'coolingOutputMw',
      label: 'Chiller Cooling Output',
      shortLabel: 'Cooling (MW)',
      unit: 'MW',
      decimals: 2,
    },
    {
      id: 'coldAisleTempC',
      label: 'Cold Aisle Temperature (Avg & Peak)',
      shortLabel: 'Cold Aisle °C',
      unit: '°C',
      decimals: 1,
      secondaryKey: 'coldAislePeakTempC',
      secondaryLabel: 'Peak Temp',
      refLines: [{ value: 27, label: 'ASHRAE Max 27°C', color: '#dc2626' }],
    },
    {
      id: 'slaCompliancePct',
      label: 'Cold Aisle SLA Compliance',
      shortLabel: 'SLA %',
      unit: '%',
      decimals: 2,
      refLines: [{ value: 99.9, label: 'SLA 99.9%', color: '#009530' }],
    },
    {
      id: 'rackUtilizationPct',
      label: 'Rack Space & Power Utilization',
      shortLabel: 'Rack Util %',
      unit: '%',
      decimals: 1,
    },
    {
      id: 'alertCount',
      label: 'Monthly Incident & Alert Volume',
      shortLabel: 'Alerts',
      unit: '',
      decimals: 0,
    },
  ];

  return defs.map((def) => {
    const data = rows.map((r) => {
      const point: Record<string, string | number> = {
        xLabel: String(r.monthLabel ?? r.monthKey ?? ''),
        [def.id]: toNum(r[def.id]) ?? 0,
      };
      if (def.secondaryKey) {
        point[def.secondaryKey] = toNum(r[def.secondaryKey]) ?? 0;
      }
      return point;
    });
    const series: ReportTrendSeriesDef[] = [
      { key: def.id, label: def.shortLabel, color: '#009530', unit: def.unit },
    ];
    if (def.secondaryKey && def.secondaryLabel) {
      series.push({
        key: def.secondaryKey,
        label: def.secondaryLabel,
        color: '#d97706',
        unit: def.unit,
      });
    }
    return {
      id: def.id,
      label: def.label,
      shortLabel: def.shortLabel,
      unit: def.unit,
      decimals: def.decimals,
      chartKind: def.id === 'alertCount' ? 'bar' : 'area',
      series,
      data,
      referenceLines: def.refLines,
      stats: computeStats(data, def.id, def.decimals, true),
    };
  });
}

function buildEquipmentPointMetrics(report: GeneratedReport): ReportTrendMetricOption[] {
  const { rows, columns } = report;
  if (rows.length === 0) return [];

  const isLongLayout = columns.some((c) => c.key === 'pointName') && columns.some((c) => c.key === 'value');

  if (isLongLayout) {
    // Group rows by pointName + unit
    const byPoint = new Map<
      string,
      {
        pointName: string;
        unit: string;
        timestamps: string[];
        tsSet: Set<string>;
        equipmentLabels: string[];
        eqSet: Set<string>;
        grid: Map<string, Record<string, number>>;
      }
    >();

    for (const r of rows) {
      const pointName = String(r.pointName ?? 'Reading');
      const unit = String(r.unit ?? '');
      const key = `${pointName}__${unit}`;
      const ts = String(r.timestamp ?? '');
      const eqLabel = `${String(r.siteCode ?? '')} ${String(r.equipmentId ?? '')}`.trim();
      const val = toNum(r.value);
      if (val === null) continue;

      let bucket = byPoint.get(key);
      if (!bucket) {
        bucket = {
          pointName,
          unit,
          timestamps: [],
          tsSet: new Set(),
          equipmentLabels: [],
          eqSet: new Set(),
          grid: new Map(),
        };
        byPoint.set(key, bucket);
      }
      if (!bucket.tsSet.has(ts)) {
        bucket.tsSet.add(ts);
        bucket.timestamps.push(ts);
      }
      if (!bucket.eqSet.has(eqLabel)) {
        bucket.eqSet.add(eqLabel);
        bucket.equipmentLabels.push(eqLabel);
      }
      const tsRec = bucket.grid.get(ts) ?? {};
      tsRec[eqLabel] = val;
      bucket.grid.set(ts, tsRec);
    }

    const metrics: ReportTrendMetricOption[] = [];
    for (const [id, bucket] of byPoint.entries()) {
      const isTimeSeries = bucket.timestamps.length > 1;
      const topEq = bucket.equipmentLabels.slice(0, 8);

      if (isTimeSeries) {
        const data = bucket.timestamps.map((ts) => {
          const rec = bucket.grid.get(ts) ?? {};
          const entry: Record<string, string | number> = { xLabel: formatShortTs(ts) };
          for (const eq of topEq) {
            if (rec[eq] !== undefined) entry[eq] = rec[eq];
          }
          return entry;
        });
        const series: ReportTrendSeriesDef[] = topEq.map((eq, idx) => ({
          key: eq,
          label: eq,
          color: SERIES_PALETTE[idx % SERIES_PALETTE.length],
          unit: bucket.unit,
        }));
        metrics.push({
          id,
          label: `${bucket.pointName}${bucket.unit ? ` (${bucket.unit})` : ''} — Multi-Equipment Trend`,
          shortLabel: bucket.pointName,
          unit: bucket.unit,
          decimals: bucket.unit === '°C' || bucket.unit === 'bar' || bucket.unit === 'COP' ? 2 : 1,
          chartKind: 'line',
          series,
          data,
          stats: computeStats(data, topEq[0] ?? '', 2, true),
        });
      } else {
        // Single-timestamp snapshot across multiple equipment -> Bar chart
        const onlyTs = bucket.timestamps[0] ?? '';
        const rec = bucket.grid.get(onlyTs) ?? {};
        const data = bucket.equipmentLabels.slice(0, 20).map((eq) => ({
          xLabel: eq,
          value: rec[eq] ?? 0,
        }));
        metrics.push({
          id,
          label: `${bucket.pointName}${bucket.unit ? ` (${bucket.unit})` : ''} — Equipment Snapshot`,
          shortLabel: bucket.pointName,
          unit: bucket.unit,
          decimals: 1,
          chartKind: 'bar',
          series: [{ key: 'value', label: bucket.pointName, color: '#009530', unit: bucket.unit }],
          data,
          stats: computeStats(data, 'value', 1, false),
        });
      }
    }
    return metrics;
  }

  // Wide pivoted layout: timestamp + numeric series columns
  const numericCols = columns.filter(
    (c) => c.key !== 'timestamp' && c.key !== 'intervalStep' && rows.some((r) => toNum(r[c.key]) !== null)
  );
  if (numericCols.length === 0) return [];

  // Group wide columns by unit suffix in parentheses (e.g. "(°C)", "(kW)", "(%)")
  const byUnit = new Map<string, typeof numericCols>();
  for (const col of numericCols) {
    const match = col.label.match(/\(([^)]+)\)\s*$/);
    const unit = match ? match[1] : 'Value';
    const arr = byUnit.get(unit) ?? [];
    arr.push(col);
    byUnit.set(unit, arr);
  }

  const metrics: ReportTrendMetricOption[] = [];
  for (const [unit, cols] of byUnit.entries()) {
    const activeCols = cols.slice(0, 8);
    const data = rows.map((r) => {
      const entry: Record<string, string | number> = {
        xLabel: formatShortTs(String(r.timestamp ?? '')),
      };
      for (const c of activeCols) {
        const v = toNum(r[c.key]);
        if (v !== null) entry[c.key] = v;
      }
      return entry;
    });
    const series: ReportTrendSeriesDef[] = activeCols.map((c, idx) => ({
      key: c.key,
      label: c.label.replace(/\s*\([^)]+\)\s*$/, ''),
      color: SERIES_PALETTE[idx % SERIES_PALETTE.length],
      unit,
    }));
    metrics.push({
      id: `wide-${unit}`,
      label: `Extracted Points (${unit})`,
      shortLabel: `${unit} (${activeCols.length})`,
      unit,
      decimals: unit === '°C' || unit === 'bar' ? 2 : 1,
      chartKind: 'line',
      series,
      data,
      stats: computeStats(data, activeCols[0].key, 2, rows.length > 1),
    });
  }
  return metrics;
}

function buildExecutiveSummaryMetrics(rows: ReportRow[]): ReportTrendMetricOption[] {
  const defs = [
    { id: 'itLoadKw', label: 'Site IT Load Comparison', shortLabel: 'IT Load (kW)', unit: 'kW', decimals: 1 },
    { id: 'pue', label: 'Site PUE Comparison', shortLabel: 'PUE', unit: 'PUE', decimals: 2 },
    { id: 'coolingMw', label: 'Cooling Output by Site', shortLabel: 'Cooling (MW)', unit: 'MW', decimals: 2 },
    { id: 'avgColdAisleTempC', label: 'Avg Cold Aisle Temperature', shortLabel: 'Cold Aisle °C', unit: '°C', decimals: 1 },
    { id: 'upsBatterySocPct', label: 'UPS Battery State of Charge', shortLabel: 'UPS SoC %', unit: '%', decimals: 1 },
    { id: 'activeTotalAlerts', label: 'Open Alerts by Site', shortLabel: 'Open Alerts', unit: '', decimals: 0 },
  ];

  return defs.map((d) => {
    const data = rows.map((r) => ({
      xLabel: String(r.siteCode ?? ''),
      [d.id]: toNum(r[d.id]) ?? 0,
    }));
    return {
      id: d.id,
      label: d.label,
      shortLabel: d.shortLabel,
      unit: d.unit,
      decimals: d.decimals,
      chartKind: 'bar',
      series: [{ key: d.id, label: d.shortLabel, color: '#009530', unit: d.unit }],
      data,
      stats: computeStats(data, d.id, d.decimals, false),
    };
  });
}

function buildColdAisleSlaMetrics(rows: ReportRow[]): ReportTrendMetricOption[] {
  const makeLabel = (r: ReportRow) => {
    const hall = String(r.hallLabel ?? '').split('·')[0].trim();
    return `${String(r.siteCode ?? '')} ${hall}`.trim();
  };

  const tempData = rows.map((r) => ({
    xLabel: makeLabel(r),
    coldAisleTempC: toNum(r.coldAisleTempC) ?? 0,
    probeATempC: toNum(r.probeATempC) ?? 0,
    probeBTempC: toNum(r.probeBTempC) ?? 0,
  }));

  const rhData = rows.map((r) => ({
    xLabel: makeLabel(r),
    humidityPct: toNum(r.humidityPct) ?? 0,
    dewPointC: toNum(r.dewPointC) ?? 0,
  }));

  const slaData = rows.map((r) => ({
    xLabel: makeLabel(r),
    slaCompliancePct: toNum(r.slaCompliancePct) ?? 0,
  }));

  return [
    {
      id: 'coldAisleTempC',
      label: 'Cold Aisle Temp (2N Dual Probes A/B)',
      shortLabel: 'Cold Aisle °C',
      unit: '°C',
      decimals: 1,
      chartKind: 'bar',
      series: [
        { key: 'coldAisleTempC', label: 'Mean Cold Aisle', color: '#009530', unit: '°C' },
        { key: 'probeATempC', label: 'Probe A', color: '#0284c7', unit: '°C' },
        { key: 'probeBTempC', label: 'Probe B', color: '#d97706', unit: '°C' },
      ],
      data: tempData,
      referenceLines: [
        { value: 18, label: 'ASHRAE Min 18°C', color: '#0284c7' },
        { value: 27, label: 'ASHRAE Max 27°C', color: '#dc2626' },
      ],
      stats: computeStats(tempData, 'coldAisleTempC', 1, false),
    },
    {
      id: 'humidityPct',
      label: 'Cold Aisle Relative Humidity (% RH)',
      shortLabel: 'Humidity %',
      unit: '% RH',
      decimals: 1,
      chartKind: 'bar',
      series: [{ key: 'humidityPct', label: 'Relative Humidity', color: '#0284c7', unit: '% RH' }],
      data: rhData,
      referenceLines: [
        { value: 40, label: 'Min 40%', color: '#009530' },
        { value: 60, label: 'Max 60%', color: '#dc2626' },
      ],
      stats: computeStats(rhData, 'humidityPct', 1, false),
    },
    {
      id: 'slaCompliancePct',
      label: '30-Day Cold Aisle SLA Compliance (%)',
      shortLabel: '30d SLA %',
      unit: '%',
      decimals: 2,
      chartKind: 'bar',
      series: [{ key: 'slaCompliancePct', label: 'SLA Compliance', color: '#009530', unit: '%' }],
      data: slaData,
      referenceLines: [{ value: 99.9, label: 'Target 99.9%', color: '#009530' }],
      stats: computeStats(slaData, 'slaCompliancePct', 2, false),
    },
  ];
}

function buildTier4RedundancyMetrics(rows: ReportRow[]): ReportTrendMetricOption[] {
  const byCategory = new Map<string, { nominal: number; warning: number; critical: number }>();
  for (const r of rows) {
    const cat = String(r.assetCategory ?? 'Asset');
    const health = String(r.healthStatus ?? 'Nominal');
    const cur = byCategory.get(cat) ?? { nominal: 0, warning: 0, critical: 0 };
    if (health === 'Critical') cur.critical += 1;
    else if (health === 'Warning') cur.warning += 1;
    else cur.nominal += 1;
    byCategory.set(cat, cur);
  }

  const stackData = Array.from(byCategory.entries()).map(([cat, counts]) => ({
    xLabel: cat.replace('Standby Diesel ', '').replace('BMS Field-Bus ', ''),
    nominal: counts.nominal,
    warning: counts.warning,
    critical: counts.critical,
  }));

  const healthRateData = Array.from(byCategory.entries()).map(([cat, counts]) => {
    const total = counts.nominal + counts.warning + counts.critical;
    return {
      xLabel: cat.replace('Standby Diesel ', '').replace('BMS Field-Bus ', ''),
      healthPct: total > 0 ? roundTo((counts.nominal / total) * 100, 1) : 100,
    };
  });

  return [
    {
      id: 'assetHealthStack',
      label: 'Equipment & Subsystem Health Distribution',
      shortLabel: 'Health Breakdown',
      unit: 'units',
      decimals: 0,
      chartKind: 'stacked_bar',
      series: [
        { key: 'nominal', label: 'Nominal', color: '#009530', unit: 'units' },
        { key: 'warning', label: 'Warning', color: '#d97706', unit: 'units' },
        { key: 'critical', label: 'Critical', color: '#dc2626', unit: 'units' },
      ],
      data: stackData,
      stats: computeStats(stackData, 'nominal', 0, false),
    },
    {
      id: 'healthPct',
      label: 'Nominal Availability Rate by Subsystem (%)',
      shortLabel: 'Nominal Rate %',
      unit: '%',
      decimals: 1,
      chartKind: 'bar',
      series: [{ key: 'healthPct', label: 'Nominal Rate', color: '#0284c7', unit: '%' }],
      data: healthRateData,
      referenceLines: [{ value: 100, label: '100% Fault-Tolerant', color: '#009530' }],
      stats: computeStats(healthRateData, 'healthPct', 1, false),
    },
  ];
}

function buildServerInventoryMetrics(rows: ReportRow[]): ReportTrendMetricOption[] {
  const capped = rows.slice(0, 24);
  const defs: Array<{
    id: string;
    label: string;
    shortLabel: string;
    unit: string;
    decimals: number;
    refLines?: ReportTrendReferenceLine[];
  }> = [
    {
      id: 'exhaustTempC',
      label: 'Host Exhaust Temperature Profile',
      shortLabel: 'Exhaust °C',
      unit: '°C',
      decimals: 1,
      refLines: [{ value: 78, label: 'Critical 78°C', color: '#dc2626' }],
    },
    { id: 'cpuPct', label: 'Server CPU Utilization', shortLabel: 'CPU %', unit: '%', decimals: 1 },
    { id: 'memoryPct', label: 'Server Memory Utilization', shortLabel: 'Memory %', unit: '%', decimals: 1 },
    { id: 'powerW', label: 'Per-Host Power Draw', shortLabel: 'Power (W)', unit: 'W', decimals: 0 },
  ];

  return defs.map((d) => {
    const data = capped.map((r) => ({
      xLabel: String(r.hostname ?? ''),
      [d.id]: toNum(r[d.id]) ?? 0,
    }));
    return {
      id: d.id,
      label: d.label,
      shortLabel: d.shortLabel,
      unit: d.unit,
      decimals: d.decimals,
      chartKind: 'bar',
      series: [{ key: d.id, label: d.shortLabel, color: '#009530', unit: d.unit }],
      data,
      referenceLines: d.refLines,
      stats: computeStats(data, d.id, d.decimals, false),
    };
  });
}

function buildRackCapacityMetrics(rows: ReportRow[]): ReportTrendMetricOption[] {
  // Aggregate 1,600–4,800 cabinets cleanly by Site + Row (or Hall)
  const grouped = new Map<
    string,
    { count: number; powerKw: number; capKw: number; usedU: number; totalU: number; maxTemp: number }
  >();

  for (const r of rows) {
    const site = String(r.siteCode ?? '');
    const hall = String(r.hallName ?? '').split('·')[0].trim();
    const row = String(r.row ?? '');
    const key = rows.length > 400 ? `${site} ${hall}` : `${site} ${hall} ${row}`;
    const cur = grouped.get(key) ?? { count: 0, powerKw: 0, capKw: 0, usedU: 0, totalU: 0, maxTemp: 0 };
    cur.count += 1;
    cur.powerKw += toNum(r.powerDrawKw) ?? 0;
    cur.capKw += toNum(r.powerCapKw) ?? 0;
    cur.usedU += toNum(r.usedU) ?? 0;
    cur.totalU += toNum(r.totalU) ?? 42;
    cur.maxTemp = Math.max(cur.maxTemp, toNum(r.peakTempC) ?? 0);
    grouped.set(key, cur);
  }

  const entries = Array.from(grouped.entries()).slice(0, 24);
  const powerData = entries.map(([xLabel, g]) => ({
    xLabel,
    powerDrawMw: roundTo(g.powerKw / 1000, 2),
    capacityMw: roundTo(g.capKw / 1000, 2),
  }));
  const utilData = entries.map(([xLabel, g]) => ({
    xLabel,
    powerUtilPct: g.capKw > 0 ? roundTo((g.powerKw / g.capKw) * 100, 1) : 0,
    spaceUtilPct: g.totalU > 0 ? roundTo((g.usedU / g.totalU) * 100, 1) : 0,
  }));

  return [
    {
      id: 'powerUtilPct',
      label: 'Rack Power & Space Utilization by Zone',
      shortLabel: 'Power vs Space %',
      unit: '%',
      decimals: 1,
      chartKind: 'bar',
      series: [
        { key: 'powerUtilPct', label: 'Power Util %', color: '#009530', unit: '%' },
        { key: 'spaceUtilPct', label: 'U-Space Util %', color: '#0284c7', unit: '%' },
      ],
      data: utilData,
      referenceLines: [{ value: 80, label: '80% Design Cap', color: '#d97706' }],
      stats: computeStats(utilData, 'powerUtilPct', 1, false),
    },
    {
      id: 'powerDrawMw',
      label: 'Aggregate Rack Power Draw vs Capacity (MW)',
      shortLabel: 'Rack Load (MW)',
      unit: 'MW',
      decimals: 2,
      chartKind: 'bar',
      series: [
        { key: 'powerDrawMw', label: 'Active Load (MW)', color: '#009530', unit: 'MW' },
        { key: 'capacityMw', label: 'Provisioned Cap (MW)', color: '#64748b', unit: 'MW' },
      ],
      data: powerData,
      stats: computeStats(powerData, 'powerDrawMw', 2, false),
    },
  ];
}

function buildAlertsAuditMetrics(rows: ReportRow[]): ReportTrendMetricOption[] {
  const bySite = new Map<string, { critical: number; warning: number; info: number }>();
  const byState = new Map<string, number>();

  for (const r of rows) {
    const site = String(r.siteCode ?? 'Site');
    const sev = String(r.severity ?? 'info').toLowerCase();
    const state = String(r.state ?? 'Active');
    const cur = bySite.get(site) ?? { critical: 0, warning: 0, info: 0 };
    if (sev === 'critical') cur.critical += 1;
    else if (sev === 'warning') cur.warning += 1;
    else cur.info += 1;
    bySite.set(site, cur);
    byState.set(state, (byState.get(state) ?? 0) + 1);
  }

  const sevData = Array.from(bySite.entries()).map(([xLabel, c]) => ({
    xLabel,
    critical: c.critical,
    warning: c.warning,
    info: c.info,
  }));

  const stateData = Array.from(byState.entries()).map(([xLabel, count]) => ({
    xLabel,
    count,
  }));

  return [
    {
      id: 'alertSeverity',
      label: 'Alert Volume by Site & Severity',
      shortLabel: 'Severity by Site',
      unit: 'alerts',
      decimals: 0,
      chartKind: 'stacked_bar',
      series: [
        { key: 'critical', label: 'Critical', color: '#dc2626', unit: 'alerts' },
        { key: 'warning', label: 'Warning', color: '#d97706', unit: 'alerts' },
        { key: 'info', label: 'Info', color: '#0284c7', unit: 'alerts' },
      ],
      data: sevData,
      stats: computeStats(sevData, 'critical', 0, false),
    },
    {
      id: 'alertState',
      label: 'Alert Lifecycle State Breakdown',
      shortLabel: 'By State',
      unit: 'alerts',
      decimals: 0,
      chartKind: 'bar',
      series: [{ key: 'count', label: 'Alerts', color: '#009530', unit: 'alerts' }],
      data: stateData,
      stats: computeStats(stateData, 'count', 0, false),
    },
  ];
}

export function buildReportTrendModel(report: GeneratedReport): ReportTrendModel {
  let metrics: ReportTrendMetricOption[] = [];
  if (report.rows.length > 0) {
    switch (report.typeId) {
      case 'historical_trends':
        metrics = buildHistoricalTrendsMetrics(report.rows);
        break;
      case 'equipment_points':
        metrics = buildEquipmentPointMetrics(report);
        break;
      case 'executive_summary':
        metrics = buildExecutiveSummaryMetrics(report.rows);
        break;
      case 'cold_aisle_sla':
        metrics = buildColdAisleSlaMetrics(report.rows);
        break;
      case 'tier4_redundancy':
        metrics = buildTier4RedundancyMetrics(report.rows);
        break;
      case 'server_inventory':
        metrics = buildServerInventoryMetrics(report.rows);
        break;
      case 'rack_capacity':
        metrics = buildRackCapacityMetrics(report.rows);
        break;
      case 'alerts_audit':
      default:
        metrics = buildAlertsAuditMetrics(report.rows);
        break;
    }
  }

  return {
    reportId: report.id,
    reportTitle: report.title,
    subtitle: `${report.typeLabel} · ${report.siteScopeLabel} · ${report.hallScopeLabel}`,
    metrics,
  };
}

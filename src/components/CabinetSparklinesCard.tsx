import { useMemo } from 'react';
import * as d3 from 'd3';
import { Activity, Thermometer } from 'lucide-react';
import { buildCabinetSparkline24h } from '../engine/cabinetSparklineEngine';
import { RackBmsSensorStat } from '../engine/rackHeatmapEngine';
import { RackBmsPowerStat } from '../engine/rackPowerEngine';
import { RackDefinition } from '../engine/types';

interface CabinetSparklinesCardProps {
  rack: RackDefinition;
  powerStat: RackBmsPowerStat;
  sensorStat?: RackBmsSensorStat;
}

const W = 236;
const H = 56;
const PAD = { top: 6, right: 6, bottom: 6, left: 6 };

export function CabinetSparklinesCard({
  rack,
  powerStat,
  sensorStat,
}: CabinetSparklinesCardProps) {
  const series = useMemo(
    () => buildCabinetSparkline24h(rack, powerStat, sensorStat),
    [rack, powerStat, sensorStat]
  );

  const charts = useMemo(() => {
    const xScale = d3
      .scaleLinear()
      .domain([0, 24])
      .range([PAD.left, W - PAD.right]);

    const pMin = Math.min(series.powerMinKw, series.effectiveLimitKw * 0.5) - 0.8;
    const pMax = Math.max(series.powerMaxKw, series.effectiveLimitKw) + 0.8;
    const yPower = d3
      .scaleLinear()
      .domain([Math.max(0, pMin), pMax])
      .range([H - PAD.bottom, PAD.top]);

    const powerLineGen = d3
      .line<(typeof series.points)[number]>()
      .x((d) => xScale(d.hourIndex))
      .y((d) => yPower(d.powerKw))
      .curve(d3.curveMonotoneX);

    const powerAreaGen = d3
      .area<(typeof series.points)[number]>()
      .x((d) => xScale(d.hourIndex))
      .y0(H - PAD.bottom)
      .y1((d) => yPower(d.powerKw))
      .curve(d3.curveMonotoneX);

    const tMin = Math.min(series.tempMinC, 18.0) - 0.8;
    const tMax = Math.max(series.tempMaxC, series.ashraeMaxC + 0.6) + 0.6;
    const yTemp = d3
      .scaleLinear()
      .domain([tMin, tMax])
      .range([H - PAD.bottom, PAD.top]);

    const tempLineGen = d3
      .line<(typeof series.points)[number]>()
      .x((d) => xScale(d.hourIndex))
      .y((d) => yTemp(d.intakeTempC))
      .curve(d3.curveMonotoneX);

    const last = series.points[series.points.length - 1];

    return {
      powerPath: powerLineGen(series.points) ?? '',
      powerArea: powerAreaGen(series.points) ?? '',
      powerLimitY: yPower(series.effectiveLimitKw),
      powerLastX: xScale(last.hourIndex),
      powerLastY: yPower(last.powerKw),
      tempPath: tempLineGen(series.points) ?? '',
      tempSlaY: yTemp(series.ashraeMaxC),
      tempLastX: xScale(last.hourIndex),
      tempLastY: yTemp(last.intakeTempC),
    };
  }, [series]);

  const powerStroke = powerStat.exceedsCapacity ? '#dc2626' : '#009530';
  const tempBreached = (sensorStat?.sensorTempC ?? rack.ambientTempC) > 27.0;
  const tempStroke = tempBreached ? '#dc2626' : '#0284c7';

  return (
    <div
      data-testid="cabinet-24h-sparklines"
      className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3 space-y-2.5"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          24h Cabinet Telemetry
        </span>
        <span className="text-[10px] font-mono text-slate-400 tabular-nums">
          -24h → Now
        </span>
      </div>

      {/* 24h Power Draw Sparkline */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
            <Activity className="w-3 h-3 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
            Power Draw
          </span>
          <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
            <strong className={powerStat.exceedsCapacity ? 'text-red-600 dark:text-red-400' : ''}>
              {powerStat.powerKw.toFixed(2)} kW
            </strong>
            <span className="text-slate-400 ml-1">
              ({series.powerDelta24hKw >= 0 ? '+' : ''}
              {series.powerDelta24hKw.toFixed(1)})
            </span>
          </span>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-14 overflow-visible rounded-xs bg-white dark:bg-[#1B2026] border border-slate-200/80 dark:border-slate-800"
          role="img"
          aria-label={`24-hour power draw sparkline for ${rack.id}, currently ${powerStat.powerKw.toFixed(2)} kW`}
        >
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={charts.powerLimitY}
            y2={charts.powerLimitY}
            stroke="#dc2626"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.65}
          />
          <path d={charts.powerArea} fill={powerStroke} opacity={0.12} />
          <path d={charts.powerPath} fill="none" stroke={powerStroke} strokeWidth={1.75} />
          <circle cx={charts.powerLastX} cy={charts.powerLastY} r={2.8} fill={powerStroke} />
        </svg>
        <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
          <span>Min {series.powerMinKw.toFixed(1)} kW</span>
          <span>Limit {series.effectiveLimitKw.toFixed(1)} kW</span>
          <span>Max {series.powerMaxKw.toFixed(1)} kW</span>
        </div>
      </div>

      {/* 24h BMS Intake Thermal Sparkline */}
      <div className="space-y-1 pt-2 border-t border-slate-200/70 dark:border-slate-800">
        <div className="flex items-center justify-between text-[11px]">
          <span className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
            <Thermometer className="w-3 h-3 text-sky-600 dark:text-sky-400" aria-hidden="true" />
            BMS Intake Temp
          </span>
          <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
            <strong className={tempBreached ? 'text-red-600 dark:text-red-400' : ''}>
              {(sensorStat?.sensorTempC ?? rack.ambientTempC).toFixed(1)}°C
            </strong>
            <span className="text-slate-400 ml-1">
              ({series.tempDelta24hC >= 0 ? '+' : ''}
              {series.tempDelta24hC.toFixed(1)}°)
            </span>
          </span>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-14 overflow-visible rounded-xs bg-white dark:bg-[#1B2026] border border-slate-200/80 dark:border-slate-800"
          role="img"
          aria-label={`24-hour intake temperature sparkline for ${rack.id}, currently ${(sensorStat?.sensorTempC ?? rack.ambientTempC).toFixed(1)} °C`}
        >
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={charts.tempSlaY}
            y2={charts.tempSlaY}
            stroke="#d97706"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.7}
          />
          <path d={charts.tempPath} fill="none" stroke={tempStroke} strokeWidth={1.75} />
          <circle cx={charts.tempLastX} cy={charts.tempLastY} r={2.8} fill={tempStroke} />
        </svg>
        <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
          <span>Min {series.tempMinC.toFixed(1)}°C</span>
          <span>ASHRAE 27.0°C</span>
          <span>Max {series.tempMaxC.toFixed(1)}°C</span>
        </div>
      </div>
    </div>
  );
}

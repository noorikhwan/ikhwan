import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Bookmark,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Flame,
  Layers,
  Lightbulb,
  MoveVertical,
  Pin,
  Plus,
  Printer,
  Radio,
  Search,
  ShieldAlert,
  Thermometer,
  Ticket,
  Trash2,
  Wind,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { BmsState } from '../engine/bmsTypes';
import { computeRackElevationMetrics } from '../engine/changeComplianceEngine';
import {
  buildHallThermalCsv,
  computeHorizonRackValues,
  getDeltaLegendGradientCss,
  HeatmapTimeHorizon,
  pickHeatmapColorSample,
  SecurityThermalCorrelation,
  SldBlastHighlight,
} from '../engine/opsEnhancementsEngine';
import {
  buildBmsThermalOverlaySample,
  buildRackFrontThermalGradientCss,
  computeBmsSensorRackStats,
  computeHallBmsSensorSummary,
  computeHallInletThermalSummary,
  computeHallThermalSummary,
  computeRackInletThermalStats,
  computeRackThermalStats,
  FIXED_INLET_MAX_C,
  FIXED_INLET_MIN_C,
  getInletLegendGradientCss,
  getSensorLegendGradientCss,
  getThermalLegendGradientCss,
  HEATMAP_SCALE_LEGEND_MAX_C,
  HEATMAP_SCALE_LEGEND_MIN_C,
  HeatmapScaleMode,
  interpolateInletThermalColor,
  interpolateSensorThermalColor,
  interpolateThermalColor,
  resolveHeatmapScaleBounds,
  resolveInletHeatmapScaleBounds,
  resolveSensorHeatmapScaleBounds,
  resolveTemperatureLegendScaleBounds,
} from '../engine/rackHeatmapEngine';
import {
  computeBmsRackPowerStats,
  computeHallBmsPowerSummary,
  computeRackQuickFilterCounts,
  computeRackRebalancePlan,
  getPowerLegendGradientCss,
  interpolatePowerColor,
  matchesRackQuickFilter,
  PowerLoadBand,
  resolvePowerHeatmapScaleBounds,
} from '../engine/rackPowerEngine';
import {
  buildAllRacksPowerCsv,
  buildAllRacksPowerCsvFilename,
} from '../engine/rackPowerCsvExport';
import { searchRacksById } from '../engine/rackSearch';
import { buildHallUtilizationTrends24h } from '../engine/rackUtilizationTrendEngine';
import {
  ASHRAE_A1_MAX_INLET_C,
  computeFailoverStressAudit,
  FailoverStressMode,
} from '../engine/failoverStressEngine';
import {
  buildRackSlotMap,
  findFirstOpenUSlot,
  getRoleDeploymentDefaults,
  NewServerDeploymentDraft,
  RackUReservation,
} from '../engine/rackElevationEngine';
import {
  buildRackQrSheetSvg,
  buildServerQrPayload,
  buildServerQrTagData,
  generateQrSvgMatrix,
} from '../engine/serverQrEngine';
import { SiteId } from '../engine/sites';
import { HALL_CONFIGS, RACKS_PER_ROW, ROWS_PER_HALL } from '../engine/seedData';
import {
  RACK_CRITICAL_POWER_RULE_ID,
  RACK_THERMAL_VIOLATION_RULE_ID,
} from '../engine/telemetryEngine';
import { computeRack3DMetrics } from '../engine/twin3dLayout';
import {
  ActiveAlert,
  HallId,
  HallPowerPolicyMap,
  RackDefinition,
  RackQuickFilterId,
  ServerNode,
  ServerRole,
} from '../engine/types';
import { ImmutableAuditEntry } from '../engine/enterpriseOpsEngine';
import { RpduOverrideMap } from '../engine/rpduOutletEngine';
import { CabinetSparklinesCard } from './CabinetSparklinesCard';
import { RackHeatmapTemperatureLegend } from './RackHeatmapTemperatureLegend';
import { RackRpduOutletPanel } from './RackRpduOutletPanel';
import { RackThermalHeatmapCanvas } from './RackThermalHeatmapCanvas';
import { RackUtilizationTrendsPanel } from './RackUtilizationTrendsPanel';
import { NodeStatusLabel } from './StatusIndicator';

interface RackMapViewProps {
  siteId?: SiteId;
  siteCode?: string;
  racks: RackDefinition[];
  servers: ServerNode[];
  bms: BmsState;
  alerts?: ActiveAlert[];
  rackPowerAdjustmentsKw?: Record<string, number>;
  hallPowerPolicies?: HallPowerPolicyMap;
  onRebalanceRack?: (sourceRackId: string, targetRackId: string, shiftKw: number) => void;
  onOpenAlerts?: () => void;
  onInspectServer: (serverId: string) => void;
  externalHallId?: HallId | null;
  externalRackId?: string | null;
  externalSensorHeatmap?: boolean | null;
  onSyncRackSelection?: (hallId: HallId, rackId: string, sensorHeatmap: boolean) => void;
  sldBlastHighlight?: SldBlastHighlight | null;
  onClearSldBlast?: () => void;
  securityCorrelations?: SecurityThermalCorrelation[];
  pinnedRackIds?: string[];
  onTogglePinRack?: (rackId: string) => void;
  onClearPinnedRacks?: () => void;
  canControlBms?: boolean;
  onBoostHallCrac?: (hallId: HallId) => void;
  onToggleHallExcursion?: (hallId: HallId) => void;
  onCreateTicketForRack?: (rackId: string, summary: string, severity: 'critical' | 'warning') => void;
  onLaunchMopForRack?: (rackId: string) => void;
  onMoveServerInRack?: (
    rackId: string,
    serverId: string,
    targetUStart: number
  ) => { ok: boolean; error?: string };
  rackReservations?: RackUReservation[];
  onDeployServerInRack?: (
    rackId: string,
    draft: NewServerDeploymentDraft
  ) => { ok: boolean; error?: string; server?: ServerNode };
  onMoveServerAcrossRacks?: (
    serverId: string,
    targetRackId: string,
    targetUStart: number
  ) => { ok: boolean; error?: string };
  onDecommissionServer?: (serverId: string) => { ok: boolean; error?: string };
  onAddRackReservation?: (
    rackId: string,
    uStart: number,
    uHeight: number,
    label: string
  ) => { ok: boolean; error?: string };
  onRemoveRackReservation?: (reservationId: string) => void;
  failoverMode?: FailoverStressMode;
  onFailoverModeChange?: (mode: FailoverStressMode) => void;
  locateLedServerIds?: string[];
  onPrintRackQrSheet?: (rackId: string, labelCount: number) => void;
  onLogAudit?: (category: ImmutableAuditEntry['category'], action: string, target: string) => void;
}

type RackMapLayer = 'status' | 'thermal' | 'power';

function baseCellColorClass(
  layer: RackMapLayer,
  status: string,
  utilizationPct: number
): string {
  if (layer === 'status') {
    if (status === 'critical') return 'bg-red-600 hover:bg-red-500 text-white';
    if (status === 'warning') return 'bg-amber-500 hover:bg-amber-400 text-slate-950';
    if (status === 'maintenance') return 'bg-slate-400 dark:bg-slate-600 text-white';
    return 'bg-[#009530]/85 dark:bg-[#3DCD58]/80 hover:bg-[#009530] dark:hover:bg-[#3DCD58] text-white';
  }
  if (utilizationPct >= 80) return 'bg-red-600 text-white';
  if (utilizationPct >= 60) return 'bg-amber-500 text-slate-950';
  if (utilizationPct >= 30) return 'bg-[#009530]/85 dark:bg-[#3DCD58]/80 text-white';
  return 'bg-sky-600 text-white';
}

function bandTextColorClass(band: string): string {
  if (band === 'Critical') return 'text-red-700 dark:text-red-400 font-semibold';
  if (band === 'Hot') return 'text-orange-700 dark:text-orange-400 font-semibold';
  if (band === 'Warm') return 'text-amber-700 dark:text-amber-400 font-medium';
  if (band === 'Cool') return 'text-sky-700 dark:text-sky-400 font-medium';
  return 'text-[#007A27] dark:text-[#3DCD58] font-medium';
}

function sensorBandTextColorClass(band: string): string {
  if (band === 'Breached') return 'text-red-700 dark:text-red-400 font-semibold';
  if (band === 'Warning') return 'text-orange-700 dark:text-orange-400 font-semibold';
  if (band === 'Elevated') return 'text-amber-700 dark:text-amber-400 font-medium';
  if (band === 'Sub-SLA') return 'text-sky-700 dark:text-sky-400 font-medium';
  return 'text-[#007A27] dark:text-[#3DCD58] font-medium';
}

function powerBandTextColorClass(band: PowerLoadBand): string {
  if (band === 'Overload') return 'text-red-700 dark:text-red-400 font-semibold';
  if (band === 'High') return 'text-orange-700 dark:text-orange-400 font-semibold';
  if (band === 'Elevated') return 'text-amber-700 dark:text-amber-400 font-medium';
  if (band === 'Low') return 'text-sky-700 dark:text-sky-400 font-medium';
  return 'text-[#007A27] dark:text-[#3DCD58] font-medium';
}

const TIME_HORIZONS: Array<{ id: HeatmapTimeHorizon; label: string }> = [
  { id: 'live', label: 'Live' },
  { id: '-1h', label: '-1h' },
  { id: '-6h', label: '-6h' },
  { id: '-24h', label: '-24h' },
  { id: 'delta1h', label: 'Δ vs 1h' },
];

export function RackMapView({
  siteId = 'kl1',
  siteCode = 'KL1',
  racks,
  servers,
  bms,
  alerts = [],
  rackPowerAdjustmentsKw,
  hallPowerPolicies,
  onRebalanceRack,
  onOpenAlerts,
  onInspectServer,
  externalHallId,
  externalRackId,
  externalSensorHeatmap,
  onSyncRackSelection,
  sldBlastHighlight,
  onClearSldBlast,
  securityCorrelations = [],
  pinnedRackIds = [],
  onTogglePinRack,
  onClearPinnedRacks,
  canControlBms = true,
  onBoostHallCrac,
  onToggleHallExcursion,
  onCreateTicketForRack,
  onLaunchMopForRack,
  onMoveServerInRack,
  rackReservations = [],
  onDeployServerInRack,
  onMoveServerAcrossRacks,
  onDecommissionServer,
  onAddRackReservation,
  onRemoveRackReservation,
  failoverMode: externalFailoverMode,
  onFailoverModeChange,
  locateLedServerIds = [],
  onPrintRackQrSheet,
  onLogAudit,
}: RackMapViewProps) {
  const [rpduOverrides, setRpduOverrides] = useState<RpduOverrideMap>({});
  const [activeHallId, setActiveHallId] = useState<HallId>(externalHallId ?? 'hall-b');
  const [layer, setLayer] = useState<RackMapLayer>('thermal');
  const [heatmapOverlayEnabled, setHeatmapOverlayEnabled] = useState<boolean>(true);
  const [inletFrontGradientActive, setInletFrontGradientActive] = useState<boolean>(true);
  const [powerOverlayActive, setPowerOverlayActive] = useState<boolean>(true);
  const [thermalOverlayActive, setThermalOverlayActive] = useState<boolean>(false);
  const [sensorHeatmapActive, setSensorHeatmapActive] = useState<boolean>(
    externalSensorHeatmap ?? false
  );
  const [timeHorizon, setTimeHorizon] = useState<HeatmapTimeHorizon>('live');
  const [heatmapOpacity, setHeatmapOpacity] = useState<number>(0.65);
  const [scaleMode, setScaleMode] = useState<HeatmapScaleMode>('fixed');
  const [selectedRackId, setSelectedRackId] = useState<string>(externalRackId ?? 'B-R01-01');
  const [hoveredRackId, setHoveredRackId] = useState<string | null>(null);
  const [rackSearchQuery, setRackSearchQuery] = useState<string>('');
  const [quickFilter, setQuickFilter] = useState<RackQuickFilterId>('all');
  const [rebalanceFeedback, setRebalanceFeedback] = useState<string | null>(null);
  const [macEditMode, setMacEditMode] = useState<boolean>(false);
  const [macTargetU, setMacTargetU] = useState<Record<string, string>>({});
  const [macTargetRack, setMacTargetRack] = useState<Record<string, string>>({});
  const [macFeedback, setMacFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [dragServerId, setDragServerId] = useState<string | null>(null);
  const [deployFormOpen, setDeployFormOpen] = useState<boolean>(false);
  const [deployRole, setDeployRole] = useState<ServerRole>('Compute');
  const [deployHostname, setDeployHostname] = useState<string>('');
  const [deployModel, setDeployModel] = useState<string>('Dell PowerEdge R760');
  const [deployUStart, setDeployUStart] = useState<string>('1');
  const [deployUHeight, setDeployUHeight] = useState<string>('2');
  const [deployRatedW, setDeployRatedW] = useState<string>('950');
  const [reserveFormOpen, setReserveFormOpen] = useState<boolean>(false);
  const [reserveUStart, setReserveUStart] = useState<string>('36');
  const [reserveUHeight, setReserveUHeight] = useState<string>('4');
  const [reserveLabel, setReserveLabel] = useState<string>('Q4 GPU Expansion');
  const [confirmDecomId, setConfirmDecomId] = useState<string | null>(null);
  const [localFailoverMode, setLocalFailoverMode] = useState<FailoverStressMode>('none');
  const [csvExportNotice, setCsvExportNotice] = useState<string | null>(null);
  const csvExportTimerRef = useRef<number | null>(null);
  const lastAutoFocusedExactIdRef = useRef<string | null>(null);

  const activeFailoverMode: FailoverStressMode = externalFailoverMode ?? localFailoverMode;
  const handleSetFailoverMode = (mode: FailoverStressMode) => {
    if (onFailoverModeChange) {
      onFailoverModeChange(mode);
    } else {
      setLocalFailoverMode(mode);
    }
  };

  useEffect(() => {
    return () => {
      if (csvExportTimerRef.current !== null) {
        window.clearTimeout(csvExportTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (externalHallId) setActiveHallId(externalHallId);
  }, [externalHallId]);

  useEffect(() => {
    if (externalRackId) setSelectedRackId(externalRackId);
  }, [externalRackId]);

  useEffect(() => {
    if (typeof externalSensorHeatmap === 'boolean') {
      setSensorHeatmapActive(externalSensorHeatmap);
      if (externalSensorHeatmap) setHeatmapOverlayEnabled(true);
    }
  }, [externalSensorHeatmap]);

  useEffect(() => {
    onSyncRackSelection?.(activeHallId, selectedRackId, sensorHeatmapActive);
  }, [activeHallId, selectedRackId, sensorHeatmapActive, onSyncRackSelection]);

  useEffect(() => {
    if (sldBlastHighlight) {
      const mainEl = document.querySelector('main');
      if (mainEl) mainEl.scrollTo({ top: 0, behavior: 'auto' });
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [sldBlastHighlight]);

  const rackMetricsMap = useMemo(
    () => computeRack3DMetrics(racks, servers, bms),
    [racks, servers, bms]
  );

  const thermalStatsMap = useMemo(
    () => computeRackThermalStats(racks, servers, bms),
    [racks, servers, bms]
  );

  const inletThermalStatsMap = useMemo(
    () => computeRackInletThermalStats(racks, servers, bms),
    [racks, servers, bms]
  );

  const bmsSensorStatsMap = useMemo(
    () => computeBmsSensorRackStats(racks, bms, servers),
    [racks, bms, servers]
  );

  const bmsPowerStatsMap = useMemo(
    () =>
      computeBmsRackPowerStats(racks, bms, servers, {
        rackPowerAdjustmentsKw,
        hallPowerPolicies,
      }),
    [racks, bms, servers, rackPowerAdjustmentsKw, hallPowerPolicies]
  );

  const utilizationTrends24h = useMemo(
    () => buildHallUtilizationTrends24h(racks, bmsPowerStatsMap, servers, activeHallId),
    [racks, bmsPowerStatsMap, servers, activeHallId]
  );

  const powerValuesByRackId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of racks) {
      map[r.id] = bmsPowerStatsMap[r.id]?.powerKw ?? r.basePowerKw;
    }
    return map;
  }, [racks, bmsPowerStatsMap]);

  const inletValuesByRackId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of racks) {
      map[r.id] = inletThermalStatsMap[r.id]?.avgInletTempC ?? r.ambientTempC;
    }
    return map;
  }, [racks, inletThermalStatsMap]);

  const horizonValuesByRackId = useMemo(
    () =>
      computeHorizonRackValues(
        racks,
        thermalStatsMap,
        bmsSensorStatsMap,
        timeHorizon,
        sensorHeatmapActive
      ),
    [racks, thermalStatsMap, bmsSensorStatsMap, timeHorizon, sensorHeatmapActive]
  );

  const serversByRack = useMemo(() => {
    const m = new Map<string, ServerNode[]>();
    for (const srv of servers) {
      const list = m.get(srv.rackId);
      if (list) list.push(srv);
      else m.set(srv.rackId, [srv]);
    }
    for (const list of m.values()) {
      list.sort((a, b) => b.uStart - a.uStart);
    }
    return m;
  }, [servers]);

  const hallStats = useMemo(() => {
    return HALL_CONFIGS.map((hc) => {
      const hallRacks = racks.filter((r) => r.hallId === hc.id);
      let peakTemp = 0;
      let critCount = 0;
      let warnCount = 0;
      for (const r of hallRacks) {
        const met = rackMetricsMap[r.id];
        if (!met) continue;
        if (met.peakTempC > peakTemp) peakTemp = met.peakTempC;
        if (met.status === 'critical') critCount += 1;
        else if (met.status === 'warning') warnCount += 1;
      }
      const thermalSummary = computeHallThermalSummary(hc.id, racks, thermalStatsMap);
      const inletSummary = computeHallInletThermalSummary(hc.id, racks, inletThermalStatsMap);
      const sensorSummary = computeHallBmsSensorSummary(hc.id, racks, bmsSensorStatsMap, bms);
      const powerSummary = computeHallBmsPowerSummary(hc.id, racks, bmsPowerStatsMap, bms);
      return {
        ...hc,
        rackCount: hallRacks.length,
        totalKw: powerSummary.totalKw,
        totalCapKw: powerSummary.totalCapacityKw,
        peakTemp: Number(peakTemp.toFixed(1)),
        avgTemp: thermalSummary.avgTempC,
        hotspotCount: thermalSummary.hotspotCount,
        critCount,
        warnCount,
        thermalSummary,
        inletSummary,
        sensorSummary,
        powerSummary,
      };
    });
  }, [racks, rackMetricsMap, thermalStatsMap, inletThermalStatsMap, bmsSensorStatsMap, bmsPowerStatsMap, bms]);

  const activeHallStat = useMemo(
    () => hallStats.find((h) => h.id === activeHallId) ?? hallStats[0],
    [hallStats, activeHallId]
  );

  const isPowerLayerMode = layer === 'power' && !sensorHeatmapActive;
  const isDeltaMode = timeHorizon === 'delta1h' && !isPowerLayerMode;
  const isInletFrontPrimaryMode =
    inletFrontGradientActive &&
    layer === 'thermal' &&
    !sensorHeatmapActive &&
    !isPowerLayerMode &&
    !isDeltaMode;

  const inletScaleBounds = useMemo(
    () => resolveInletHeatmapScaleBounds(scaleMode, activeHallStat.inletSummary),
    [scaleMode, activeHallStat.inletSummary]
  );

  const scaleBounds = useMemo(() => {
    if (isPowerLayerMode) {
      return resolvePowerHeatmapScaleBounds(
        scaleMode,
        activeHallStat.powerSummary,
        activeHallStat.powerCapacityKw
      );
    }
    if (isDeltaMode) {
      const limit = sensorHeatmapActive ? 3 : 6;
      return {
        minC: -limit,
        maxC: limit,
        ticks: [-limit, -limit / 2, 0, limit / 2, limit],
      };
    }
    if (isInletFrontPrimaryMode) {
      return inletScaleBounds;
    }
    return sensorHeatmapActive
      ? resolveSensorHeatmapScaleBounds(scaleMode, activeHallStat.sensorSummary)
      : resolveHeatmapScaleBounds(scaleMode, activeHallStat.thermalSummary);
  }, [
    isPowerLayerMode,
    isDeltaMode,
    isInletFrontPrimaryMode,
    inletScaleBounds,
    sensorHeatmapActive,
    scaleMode,
    activeHallStat,
  ]);

  const temperatureLegendBounds = useMemo(() => {
    if (sensorHeatmapActive) {
      return resolveTemperatureLegendScaleBounds(
        scaleMode,
        activeHallStat.sensorSummary.minTempC,
        activeHallStat.sensorSummary.maxTempC
      );
    }
    if (isInletFrontPrimaryMode) {
      return resolveTemperatureLegendScaleBounds(
        scaleMode,
        activeHallStat.inletSummary.minInletTempC,
        activeHallStat.inletSummary.maxInletTempC
      );
    }
    return resolveTemperatureLegendScaleBounds(
      scaleMode,
      activeHallStat.thermalSummary.minTempC,
      activeHallStat.thermalSummary.maxTempC
    );
  }, [scaleMode, sensorHeatmapActive, isInletFrontPrimaryMode, activeHallStat]);

  const legendGradient = useMemo(() => {
    if (isPowerLayerMode) return getPowerLegendGradientCss();
    if (isDeltaMode) return getDeltaLegendGradientCss();
    if (isInletFrontPrimaryMode) return getInletLegendGradientCss();
    return sensorHeatmapActive ? getSensorLegendGradientCss() : getThermalLegendGradientCss();
  }, [isPowerLayerMode, isDeltaMode, isInletFrontPrimaryMode, sensorHeatmapActive]);

  // 20 rows x 20 racks for the active Data Hall
  const activeHallRows = useMemo(() => {
    const hallRacks = racks.filter((r) => r.hallId === activeHallId);
    const byRow: RackDefinition[][] = Array.from({ length: ROWS_PER_HALL }, () => []);
    for (const r of hallRacks) {
      const idx = r.rowNumber - 1;
      if (idx >= 0 && idx < ROWS_PER_HALL) {
        byRow[idx].push(r);
      }
    }
    for (const rowList of byRow) {
      rowList.sort((a, b) => a.rackIndex - b.rackIndex);
    }
    return byRow;
  }, [racks, activeHallId]);

  const rackSearch = useMemo(
    () => searchRacksById(racks, rackSearchQuery, activeHallId),
    [racks, rackSearchQuery, activeHallId]
  );

  const matchedRowNumbers = useMemo(
    () => new Set(rackSearch.activeHallMatches.map((r) => r.rowNumber)),
    [rackSearch.activeHallMatches]
  );

  const matchedRackIndices = useMemo(
    () => new Set(rackSearch.activeHallMatches.map((r) => r.rackIndex)),
    [rackSearch.activeHallMatches]
  );

  useEffect(() => {
    const exact = rackSearch.exactMatch;
    if (!exact) {
      lastAutoFocusedExactIdRef.current = null;
      return;
    }
    if (lastAutoFocusedExactIdRef.current !== exact.id) {
      lastAutoFocusedExactIdRef.current = exact.id;
      setActiveHallId(exact.hallId);
      setSelectedRackId(exact.id);
      setHoveredRackId(null);
    }
  }, [rackSearch.exactMatch]);

  const focusedRack = useMemo(
    () => racks.find((r) => r.id === selectedRackId) ?? activeHallRows[0]?.[0] ?? racks[0],
    [racks, selectedRackId, activeHallRows]
  );

  const activeReadoutRackId = hoveredRackId ?? focusedRack.id;
  const activeReadoutThermal = thermalStatsMap[activeReadoutRackId];
  const activeReadoutInlet = inletThermalStatsMap[activeReadoutRackId];
  const activeReadoutSensor = bmsSensorStatsMap[activeReadoutRackId];
  const activeReadoutPower = bmsPowerStatsMap[activeReadoutRackId];
  const activeReadoutMetrics = rackMetricsMap[activeReadoutRackId];

  const focusedMetrics = rackMetricsMap[focusedRack.id];
  const focusedThermal = thermalStatsMap[focusedRack.id];
  const focusedInlet = inletThermalStatsMap[focusedRack.id];
  const focusedSensor = bmsSensorStatsMap[focusedRack.id];
  const focusedPower = bmsPowerStatsMap[focusedRack.id];
  const focusedServers = serversByRack.get(focusedRack.id) ?? [];

  const activeHallRacks = useMemo(
    () => racks.filter((r) => r.hallId === activeHallId),
    [racks, activeHallId]
  );

  const quickFilterCounts = useMemo(
    () => computeRackQuickFilterCounts(activeHallRacks, bmsPowerStatsMap, bmsSensorStatsMap),
    [activeHallRacks, bmsPowerStatsMap, bmsSensorStatsMap]
  );

  const focusedRebalancePlan = useMemo(() => {
    if (!focusedPower || (!focusedPower.exceedsCapacity && focusedPower.utilizationPct < 88)) {
      return null;
    }
    return computeRackRebalancePlan(focusedRack.id, racks, bmsPowerStatsMap, 3);
  }, [focusedPower, focusedRack.id, racks, bmsPowerStatsMap]);

  const handleExecuteRebalance = (sourceId: string, targetId: string, shiftKw: number) => {
    if (!onRebalanceRack) return;
    onRebalanceRack(sourceId, targetId, shiftKw);
    setRebalanceFeedback(
      `Rebalanced ${shiftKw.toFixed(2)} kW from ${sourceId} → ${targetId}. Live load & capacity alerts updated.`
    );
    window.setTimeout(() => setRebalanceFeedback(null), 5500);
  };

  const focusedElevationMetrics = useMemo(
    () => computeRackElevationMetrics(focusedRack, focusedServers),
    [focusedRack, focusedServers]
  );
  const focusedReservations = useMemo(
    () => rackReservations.filter((r) => r.rackId === focusedRack.id),
    [rackReservations, focusedRack.id]
  );
  const focusedSlotSegments = useMemo(
    () => buildRackSlotMap(focusedRack, focusedServers, focusedReservations),
    [focusedRack, focusedServers, focusedReservations]
  );
  const focusedUsedU =
    focusedServers.length > 0
      ? focusedServers.reduce((sum, s) => sum + s.uHeight, 0) +
        focusedReservations.reduce((sum, r) => sum + r.uHeight, 0)
      : focusedRack.baseUsedU + focusedReservations.reduce((sum, r) => sum + r.uHeight, 0);
  const linkedCrac = bms.cracUnits.find((c) => c.hallId === focusedRack.hallId);
  const linkedEnv = bms.envSensors.find((e) => e.hallId === focusedRack.hallId);

  const locateLedServerSet = useMemo(() => new Set(locateLedServerIds), [locateLedServerIds]);
  const locateLedRackSet = useMemo(() => {
    const s = new Set<string>();
    for (const srv of servers) {
      if (locateLedServerSet.has(srv.id)) s.add(srv.rackId);
    }
    return s;
  }, [servers, locateLedServerSet]);

  const failoverAudit = useMemo(
    () =>
      computeFailoverStressAudit({
        racks: activeHallRacks,
        servers,
        bms,
        mode: activeFailoverMode,
        rackPowerAdjustmentsKw,
        hallPowerPolicies,
      }),
    [activeHallRacks, servers, bms, activeFailoverMode, rackPowerAdjustmentsKw, hallPowerPolicies]
  );
  const focusedFailoverAudit = failoverAudit.byRack[focusedRack.id] ?? null;

  const sameHallMoveTargets = useMemo(
    () => activeHallRacks.slice(0, 20),
    [activeHallRacks]
  );

  const handleApplyServerMove = (serverId: string, hostname: string, targetU: number, targetRackId?: string) => {
    if (targetRackId && targetRackId !== focusedRack.id && onMoveServerAcrossRacks) {
      const res = onMoveServerAcrossRacks(serverId, targetRackId, targetU);
      if (res.ok) {
        setMacFeedback({ ok: true, text: `Relocated ${hostname} → ${targetRackId} U${targetU} (2N & weight verified).` });
      } else {
        setMacFeedback({ ok: false, text: res.error ?? 'Cross-rack move rejected.' });
      }
      return;
    }
    if (!onMoveServerInRack) return;
    const res = onMoveServerInRack(focusedRack.id, serverId, targetU);
    if (res.ok) {
      setMacFeedback({ ok: true, text: `Moved ${hostname} to U${targetU} (2N & weight verified).` });
      setMacTargetU((prev) => ({ ...prev, [serverId]: String(targetU) }));
    } else {
      setMacFeedback({ ok: false, text: res.error ?? 'Move rejected by cabinet boundary/collision check.' });
    }
  };

  const handleOpenDeployForm = () => {
    const defaults = getRoleDeploymentDefaults(deployRole);
    const openU = findFirstOpenUSlot(focusedRack, focusedServers, focusedReservations, defaults.uHeight) ?? 1;
    const suffix = String(focusedServers.length + 1).padStart(2, '0');
    setDeployHostname(`srv-${focusedRack.id.toLowerCase().replace(/[^a-z0-9]/g, '')}-n${suffix}.${siteCode.toLowerCase()}.orise`);
    setDeployModel(defaults.model);
    setDeployUHeight(String(defaults.uHeight));
    setDeployRatedW(String(defaults.ratedPowerW));
    setDeployUStart(String(openU));
    setReserveFormOpen(false);
    setDeployFormOpen((prev) => !prev);
  };

  const handleDeploySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onDeployServerInRack) return;
    const res = onDeployServerInRack(focusedRack.id, {
      hostname: deployHostname.trim(),
      model: deployModel.trim(),
      role: deployRole,
      uStart: Number(deployUStart),
      uHeight: Number(deployUHeight),
      ratedPowerW: Number(deployRatedW),
    });
    if (res.ok) {
      setMacFeedback({ ok: true, text: `Deployed ${deployHostname.trim()} into ${focusedRack.id} at U${deployUStart}.` });
      setDeployFormOpen(false);
    } else {
      setMacFeedback({ ok: false, text: res.error ?? 'Deployment rejected.' });
    }
  };

  const handleReserveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddRackReservation) return;
    const res = onAddRackReservation(
      focusedRack.id,
      Number(reserveUStart),
      Number(reserveUHeight),
      reserveLabel.trim() || 'Reserved U-Space'
    );
    if (res.ok) {
      setMacFeedback({ ok: true, text: `Reserved U${reserveUStart} (${reserveUHeight}U) in ${focusedRack.id}.` });
      setReserveFormOpen(false);
    } else {
      setMacFeedback({ ok: false, text: res.error ?? 'U-space reservation rejected.' });
    }
  };

  const handlePrintRackQrSheet = () => {
    if (focusedServers.length === 0) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://orise-dcim.local';
    const items = focusedServers.map((srv) => {
      const tagData = buildServerQrTagData(srv, siteId, siteCode, origin);
      const payload = buildServerQrPayload(tagData, 'console-link');
      const matrix = generateQrSvgMatrix(payload);
      return { tagData, matrix };
    });
    const svg = buildRackQrSheetSvg(focusedRack.id, siteCode, items);
    const filename = `orise-${siteCode.toLowerCase()}-${focusedRack.id.toLowerCase()}-qr-sheet.svg`;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onPrintRackQrSheet?.(focusedRack.id, items.length);
    setCsvExportNotice(`Generated ${items.length}-label QR sheet (${filename}) for cabinet ${focusedRack.id}.`);
    if (csvExportTimerRef.current !== null) window.clearTimeout(csvExportTimerRef.current);
    csvExportTimerRef.current = window.setTimeout(() => {
      setCsvExportNotice(null);
      csvExportTimerRef.current = null;
    }, 5000);
  };

  const activeHallCorrelations = useMemo(
    () => securityCorrelations.filter((c) => c.hallId === activeHallId),
    [securityCorrelations, activeHallId]
  );
  const correlatedRackIdSet = useMemo(
    () => new Set(activeHallCorrelations.map((c) => c.rackId)),
    [activeHallCorrelations]
  );
  const openCapacityAlertByRackId = useMemo(() => {
    const map = new Map<string, ActiveAlert>();
    for (const a of alerts) {
      if (a.ruleId === RACK_CRITICAL_POWER_RULE_ID && a.state !== 'resolved') {
        map.set(a.rackId, a);
      }
    }
    return map;
  }, [alerts]);
  const openThermalAlertByRackId = useMemo(() => {
    const map = new Map<string, ActiveAlert>();
    for (const a of alerts) {
      if (a.ruleId === RACK_THERMAL_VIOLATION_RULE_ID && a.state !== 'resolved') {
        map.set(a.rackId, a);
      }
    }
    return map;
  }, [alerts]);
  const focusedCapacityAlert = openCapacityAlertByRackId.get(focusedRack.id) ?? null;
  const focusedThermalAlert = openThermalAlertByRackId.get(focusedRack.id) ?? null;
  const activeHallBlastImpacted = Boolean(
    sldBlastHighlight && sldBlastHighlight.hallIds.includes(activeHallId)
  );
  const activeHallCrac = useMemo(
    () => bms.cracUnits.find((c) => c.hallId === activeHallId),
    [bms.cracUnits, activeHallId]
  );
  const activeHallEnv = useMemo(
    () => bms.envSensors.find((e) => e.hallId === activeHallId),
    [bms.envSensors, activeHallId]
  );

  const handleExportHallCsv = () => {
    const hallRacks = racks.filter((r) => r.hallId === activeHallId);
    const csv = buildHallThermalCsv(
      activeHallStat.label,
      hallRacks,
      thermalStatsMap,
      bmsSensorStatsMap,
      bms
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orise-${activeHallId}-thermal-snapshot-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAllRacksPowerCsv = () => {
    const now = Date.now();
    const csv = buildAllRacksPowerCsv(racks, bmsPowerStatsMap, servers, alerts, {
      siteCode,
      exportedAt: now,
    });
    const filename = buildAllRacksPowerCsvFilename({ siteCode, now });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const overCapTotal = hallStats.reduce(
      (sum, h) => sum + h.powerSummary.capacityExceededCount,
      0
    );
    setCsvExportNotice(
      `Exported ${racks.length.toLocaleString()} racks (${
        overCapTotal > 0 ? `${overCapTotal} over capacity` : 'all within rated limits'
      }) to ${filename}`
    );
    if (csvExportTimerRef.current !== null) {
      window.clearTimeout(csvExportTimerRef.current);
    }
    csvExportTimerRef.current = window.setTimeout(() => {
      setCsvExportNotice(null);
      csvExportTimerRef.current = null;
    }, 5000);
  };

  const handleFocusMatchedRack = (rack: RackDefinition) => {
    setActiveHallId(rack.hallId);
    setSelectedRackId(rack.id);
    setHoveredRackId(null);
  };

  const handleSelectHall = (hallId: HallId) => {
    setActiveHallId(hallId);
    setHoveredRackId(null);
    if (rackSearch.isActive) {
      const hallMatch = rackSearch.allMatches.find((r) => r.hallId === hallId);
      if (hallMatch) {
        setSelectedRackId(hallMatch.id);
        return;
      }
    }
    const hallInfo = hallStats.find((h) => h.id === hallId);
    const firstRack =
      (hallInfo?.thermalSummary.hottestRackId
        ? racks.find((r) => r.id === hallInfo.thermalSummary.hottestRackId)
        : undefined) ?? racks.find((r) => r.hallId === hallId);
    if (firstRack) setSelectedRackId(firstRack.id);
  };

  return (
    <div className="space-y-5 pb-12">
      <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-2.5">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Rack Topology &amp; 42U Elevations
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            4 Data Halls · {ROWS_PER_HALL}×{RACKS_PER_ROW} / Hall ·{' '}
            <span className="font-mono font-medium text-slate-800 dark:text-slate-200 tabular-nums">
              {racks.length.toLocaleString()} Racks
            </span>
          </p>
        </div>

        {/* Layer Switcher + Power & Thermal Overlay Toggles + All-Racks CSV Export */}
        <div className="flex flex-wrap items-center gap-1.5 self-start 2xl:self-auto">
          <div
            role="group"
            aria-label="Rack map base layer"
            className="inline-flex items-center gap-0.5 p-0.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1B2026]"
          >
            <button
              type="button"
              data-testid="rack-layer-status"
              onClick={() => {
                setLayer('status');
                setSensorHeatmapActive(false);
              }}
              className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-sm cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                layer === 'status' && !sensorHeatmapActive
                  ? 'bg-[#009530] text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" aria-hidden="true" />
              Status
            </button>
            <button
              type="button"
              data-testid="rack-layer-thermal"
              onClick={() => {
                setLayer('thermal');
                setSensorHeatmapActive(false);
                setHeatmapOverlayEnabled(true);
              }}
              className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-sm cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                layer === 'thermal' && !sensorHeatmapActive
                  ? 'bg-[#009530] text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Flame className="w-3.5 h-3.5" aria-hidden="true" />
              Thermal
            </button>
            <button
              type="button"
              data-testid="rack-layer-power"
              onClick={() => {
                setLayer('power');
                setSensorHeatmapActive(false);
                setPowerOverlayActive(true);
                setThermalOverlayActive(false);
                setHeatmapOverlayEnabled(true);
              }}
              className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-sm cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                isPowerLayerMode
                  ? 'bg-[#009530] text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Zap className="w-3.5 h-3.5" aria-hidden="true" />
              Power
            </button>
          </div>

          <div
            role="group"
            aria-label="Per-cabinet cell telemetry overlay"
            className="inline-flex items-center gap-0.5 p-0.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1B2026]"
          >
            <button
              type="button"
              data-testid="toggle-power-overlay-btn"
              aria-pressed={powerOverlayActive}
              onClick={() =>
                setPowerOverlayActive((prev) => {
                  const next = !prev;
                  if (next) setThermalOverlayActive(false);
                  return next;
                })
              }
              title="Toggle real-time BMS power draw (kW) overlay on each cabinet"
              className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-sm transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                powerOverlayActive
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Zap className="w-3.5 h-3.5" aria-hidden="true" />
              Power kW
            </button>

            <button
              type="button"
              data-testid="toggle-thermal-overlay-btn"
              aria-pressed={thermalOverlayActive}
              onClick={() =>
                setThermalOverlayActive((prev) => {
                  const next = !prev;
                  if (next) setPowerOverlayActive(false);
                  return next;
                })
              }
              title="Toggle live BMS sensor array thermal status (°C) overlay on each cabinet"
              className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-sm transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                thermalOverlayActive
                  ? 'bg-teal-600 text-white hover:bg-teal-700'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Thermometer className="w-3.5 h-3.5" aria-hidden="true" />
              Thermal °C
            </button>
          </div>

          <button
            type="button"
            data-testid="toggle-inlet-gradient-btn"
            aria-pressed={inletFrontGradientActive}
            onClick={() => setInletFrontGradientActive((prev) => !prev)}
            title="Toggle real-time directional thermal gradient on rack fronts based on average server inlet temperature (°C)"
            className={`inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              inletFrontGradientActive
                ? 'bg-cyan-600 border-cyan-600 text-white hover:bg-cyan-700'
                : 'bg-white dark:bg-[#1B2026] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Wind className="w-3.5 h-3.5" aria-hidden="true" />
            Inlet Fronts
          </button>

          <button
            type="button"
            data-testid="toggle-sensor-heatmap-btn"
            aria-pressed={sensorHeatmapActive}
            onClick={() => {
              setSensorHeatmapActive((prev) => {
                const next = !prev;
                if (next) {
                  setHeatmapOverlayEnabled(true);
                }
                return next;
              });
            }}
            className={`inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              sensorHeatmapActive
                ? 'bg-sky-600 border-sky-600 text-white hover:bg-sky-700'
                : 'bg-white dark:bg-[#1B2026] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Radio className="w-3.5 h-3.5" aria-hidden="true" />
            Sensor Heatmap
          </button>

          <button
            type="button"
            data-testid="rack-heatmap-overlay-toggle"
            aria-pressed={heatmapOverlayEnabled}
            onClick={() => setHeatmapOverlayEnabled((prev) => !prev)}
            className={`inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              heatmapOverlayEnabled
                ? 'bg-orange-600 border-orange-600 text-white hover:bg-orange-700'
                : 'bg-white dark:bg-[#1B2026] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Flame className="w-3.5 h-3.5" aria-hidden="true" />
            Heatmap
          </button>

          <button
            type="button"
            data-testid="rack-export-all-csv-btn"
            onClick={handleExportAllRacksPowerCsv}
            title={`Export all ${racks.length.toLocaleString()} racks with real-time power draw and utilization status to CSV`}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-200 hover:border-[#009530] dark:hover:border-[#3DCD58] hover:text-[#007A27] dark:hover:text-[#3DCD58] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Export to CSV
          </button>
        </div>
      </div>

      {csvExportNotice && (
        <div
          role="status"
          data-testid="rack-csv-export-notice"
          className="px-3 py-2 rounded-md border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/80 dark:bg-emerald-950/30 flex items-center justify-between gap-2 text-xs text-emerald-900 dark:text-emerald-200"
        >
          <div className="inline-flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58] shrink-0" aria-hidden="true" />
            <span className="font-mono text-[11px] truncate">{csvExportNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setCsvExportNotice(null)}
            aria-label="Dismiss CSV export confirmation"
            className="text-emerald-700 dark:text-emerald-300 hover:text-emerald-950 dark:hover:text-white cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* 4 Data Hall Summary Tabs */}
      <div
        role="tablist"
        aria-label="Data halls"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3"
      >
        {hallStats.map((h) => {
          const active = activeHallId === h.id;
          return (
            <button
              key={h.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`rack-hall-tab-${h.id}`}
              onClick={() => handleSelectHall(h.id)}
              className={`text-left p-3.5 rounded-md border transition-colors cursor-pointer ${
                active
                  ? 'bg-white dark:bg-[#1B2026] border-[#009530] dark:border-[#3DCD58] ring-1 ring-[#009530]/25'
                  : 'bg-white dark:bg-[#1B2026] border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {h.label}
                </span>
                {rackSearch.isActive ? (
                  <span
                    data-testid={`rack-hall-matches-${h.id}`}
                    className={`font-mono text-[11px] tabular-nums shrink-0 ${
                      rackSearch.matchCountByHall[h.id] > 0
                        ? 'text-[#007A27] dark:text-[#3DCD58] font-semibold'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {rackSearch.matchCountByHall[h.id]}{' '}
                    {rackSearch.matchCountByHall[h.id] === 1 ? 'match' : 'matches'}
                  </span>
                ) : h.powerSummary.capacityExceededCount > 0 ? (
                  <span
                    data-testid={`rack-hall-overcap-${h.id}`}
                    title={`${h.rackCount} racks · ${h.powerSummary.capacityExceededCount} exceeding rated power capacity`}
                    className="font-mono text-[11px] tabular-nums shrink-0 text-red-700 dark:text-red-400 font-semibold"
                  >
                    ! {h.powerSummary.capacityExceededCount} Over Cap
                  </span>
                ) : (
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                    {h.rackCount} racks
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
                <span className="whitespace-nowrap">
                  {(h.totalKw / 1000).toFixed(2)}/{(h.totalCapKw / 1000).toFixed(1)} MW
                </span>
                <span className="whitespace-nowrap text-slate-700 dark:text-slate-300">
                  Avg {h.avgTemp.toFixed(1)}°C
                </span>
                <span
                  className={`whitespace-nowrap ${
                    h.critCount > 0
                      ? 'text-red-700 dark:text-red-400 font-semibold'
                      : h.warnCount > 0
                      ? 'text-amber-700 dark:text-amber-400 font-medium'
                      : 'text-[#007A27] dark:text-[#3DCD58]'
                  }`}
                >
                  Peak {h.peakTemp.toFixed(1)}°C
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Split: 20x20 Interactive Floorplan Matrix + Selected 42U Cabinet Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* 20 Rows x 20 Racks Floorplan Grid with Dynamic Thermal Heatmap Overlay */}
        <section
          aria-label="Data hall 20 by 20 rack floorplan"
          data-testid="rack-matrix-grid"
          data-hall={activeHallId}
          data-rows={activeHallRows.length}
          data-racks-in-hall={activeHallRows.reduce((acc, r) => acc + r.length, 0)}
          data-heatmap-enabled={heatmapOverlayEnabled ? 'true' : 'false'}
          data-inlet-gradient={inletFrontGradientActive ? 'true' : 'false'}
          data-sensor-heatmap={sensorHeatmapActive ? 'true' : 'false'}
          data-power-overlay={powerOverlayActive ? 'true' : 'false'}
          data-thermal-overlay={thermalOverlayActive ? 'true' : 'false'}
          data-power-layer={isPowerLayerMode ? 'true' : 'false'}
          data-capacity-exceeded-count={activeHallStat.powerSummary.capacityExceededCount}
          data-search-active={rackSearch.isActive ? 'true' : 'false'}
          data-search-matches={rackSearch.activeHallMatches.length}
          className="xl:col-span-8 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {activeHallStat.label} —{' '}
                {isPowerLayerMode
                  ? 'Real-Time BMS Power Draw Matrix (kW)'
                  : sensorHeatmapActive
                  ? 'BMS Environment Sensor Heatmap'
                  : isInletFrontPrimaryMode
                  ? 'Rack-Front Server Inlet Thermal Gradient'
                  : 'Floorplan Thermal Matrix'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isPowerLayerMode
                  ? `Live BMS electrical metering (${activeHallStat.powerSummary.utilityFeed} · UPS ${activeHallStat.powerSummary.upsModeSummary}) · ${
                      inletFrontGradientActive
                        ? 'Rack front intake gradient active'
                        : thermalOverlayActive
                        ? 'BMS sensor array thermal status (°C) overlaid on each cabinet'
                        : 'Per-cabinet kW draw & 2N Feed A/B balance'
                    }`
                  : sensorHeatmapActive
                  ? `40 live BMS cold-aisle sensors (West R05 · East R16) · ASHRAE Class A1 SLA (${activeHallStat.sensorSummary.slaTempMinC}–${activeHallStat.sensorSummary.slaTempMaxC}°C)`
                  : isInletFrontPrimaryMode
                  ? `Rack fronts dynamically colored by live average server inlet °C (▼ Odd rows face South · ▲ Even rows face North into shared cold aisles)`
                  : `20 Rows (R01–R20, paired cold/hot aisles) × 20 Cabinets · ${
                      thermalOverlayActive
                        ? 'Live BMS sensor array thermal status (°C) overlaid on each cabinet'
                        : powerOverlayActive
                        ? 'Live BMS power draw (kW) overlaid on each cabinet'
                        : 'Heatmap dynamically tracks per-rack average server temperature'
                    }`}
              </p>
            </div>

            {/* Thermal Overlay Controls (Time-Scrub + Opacity + Scale Mode + Export) */}
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              {isPowerLayerMode ? (
                <div
                  data-testid="rack-power-live-badge"
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/30 text-[11px] font-mono text-indigo-700 dark:text-indigo-300 whitespace-nowrap"
                >
                  <Zap className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span>Live BMS · 2N Metered</span>
                </div>
              ) : (
                <div
                  role="group"
                  aria-label="Heatmap time playback horizon"
                  data-testid="rack-heatmap-horizon-group"
                  className="inline-flex items-center gap-0.5 p-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#14181D]"
                >
                  <Clock className="w-3 h-3 ml-1.5 mr-1 text-slate-400 shrink-0" aria-hidden="true" />
                  {TIME_HORIZONS.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      data-testid={`rack-horizon-${h.id}`}
                      onClick={() => setTimeHorizon(h.id)}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded-xs cursor-pointer transition-colors whitespace-nowrap ${
                        timeHorizon === h.id
                          ? 'bg-white dark:bg-[#252A30] text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              )}

              {heatmapOverlayEnabled && (
                <label className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <span className="whitespace-nowrap">Overlay</span>
                  <input
                    type="range"
                    min={20}
                    max={90}
                    step={5}
                    value={Math.round(heatmapOpacity * 100)}
                    onChange={(e) => setHeatmapOpacity(Number(e.target.value) / 100)}
                    aria-label="Thermal heatmap overlay opacity"
                    data-testid="rack-heatmap-opacity-slider"
                    className="w-16 accent-[#009530] cursor-pointer"
                  />
                  <span className="font-mono tabular-nums w-8 text-right text-slate-700 dark:text-slate-200">
                    {Math.round(heatmapOpacity * 100)}%
                  </span>
                </label>
              )}

              {!isDeltaMode && (
                <div
                  role="group"
                  aria-label="Thermal color scale mode"
                  className="inline-flex items-center gap-0.5 p-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#14181D]"
                >
                  <button
                    type="button"
                    data-testid="rack-heatmap-scale-fixed"
                    onClick={() => setScaleMode('fixed')}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded-xs cursor-pointer transition-colors whitespace-nowrap ${
                      scaleMode === 'fixed'
                        ? 'bg-white dark:bg-[#252A30] text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {isPowerLayerMode
                      ? `Fixed 0–${activeHallStat.powerCapacityKw} kW`
                      : `Fixed ${HEATMAP_SCALE_LEGEND_MIN_C}–${HEATMAP_SCALE_LEGEND_MAX_C}°C`}
                  </button>
                  <button
                    type="button"
                    data-testid="rack-heatmap-scale-dynamic"
                    onClick={() => setScaleMode('dynamic')}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded-xs cursor-pointer transition-colors whitespace-nowrap ${
                      scaleMode === 'dynamic'
                        ? 'bg-white dark:bg-[#252A30] text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    Auto-Range
                  </button>
                </div>
              )}

              <button
                type="button"
                data-testid="rack-export-csv-btn"
                onClick={handleExportHallCsv}
                title={`Export ${activeHallStat.shortLabel} thermal & BMS sensor snapshot CSV`}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14181D] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3 h-3" aria-hidden="true" />
                Hall CSV
              </button>
            </div>
          </div>

          {/* Rack ID Locator Search Bar */}
          <div className="mt-3 pb-3 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <label htmlFor="rack-map-search" className="sr-only">
                Locate rack IDs on the floorplan map
              </label>
              <input
                id="rack-map-search"
                data-testid="rack-map-search"
                type="text"
                role="searchbox"
                autoComplete="off"
                spellCheck={false}
                value={rackSearchQuery}
                onChange={(e) => setRackSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && rackSearch.firstMatch) {
                    e.preventDefault();
                    handleFocusMatchedRack(rackSearch.firstMatch);
                  } else if (e.key === 'Escape' && rackSearchQuery) {
                    e.preventDefault();
                    setRackSearchQuery('');
                  }
                }}
                placeholder="Locate rack ID (e.g. B-R05-12, B-R05, R12)..."
                className={`w-full pl-8 pr-8 py-1.5 text-xs font-mono rounded border transition-colors bg-slate-50 dark:bg-[#14181D] text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530] ${
                  rackSearch.isActive && rackSearch.allMatches.length === 0
                    ? 'border-amber-400 dark:border-amber-700'
                    : rackSearch.isActive
                    ? 'border-[#009530] dark:border-[#3DCD58]'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              />
              {rackSearchQuery && (
                <button
                  type="button"
                  data-testid="rack-search-clear-btn"
                  aria-label="Clear rack search"
                  onClick={() => setRackSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            <div
              data-testid="rack-search-status"
              role="status"
              aria-live="polite"
              className="flex flex-wrap items-center gap-1.5 text-xs"
            >
              {!rackSearch.isActive ? (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Type a rack ID to highlight matches · Press{' '}
                  <kbd className="px-1 py-0.5 font-mono text-[10px] rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                    Enter
                  </kbd>{' '}
                  to locate
                </span>
              ) : rackSearch.allMatches.length === 0 ? (
                <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  No racks match &ldquo;{rackSearch.normalizedQuery}&rdquo;
                </span>
              ) : rackSearch.activeHallMatches.length > 0 ? (
                <>
                  <span className="font-mono text-[11px] tabular-nums text-[#007A27] dark:text-[#3DCD58] font-semibold whitespace-nowrap">
                    {rackSearch.activeHallMatches.length}{' '}
                    {rackSearch.activeHallMatches.length === 1 ? 'match' : 'matches'} in{' '}
                    {activeHallStat.shortLabel}
                    {rackSearch.allMatches.length > rackSearch.activeHallMatches.length && (
                      <span className="font-normal text-slate-500 dark:text-slate-400">
                        {' '}
                        ({rackSearch.allMatches.length} total)
                      </span>
                    )}
                  </span>
                  {rackSearch.activeHallMatches.length <= 5 ? (
                    rackSearch.activeHallMatches.map((match) => (
                      <button
                        key={match.id}
                        type="button"
                        data-testid={`rack-search-pick-${match.id}`}
                        onClick={() => handleFocusMatchedRack(match)}
                        className={`px-1.5 py-0.5 font-mono text-[11px] rounded-xs border transition-colors cursor-pointer whitespace-nowrap ${
                          match.id === focusedRack.id
                            ? 'bg-[#009530] border-[#009530] text-white'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#14181D] text-slate-700 dark:text-slate-200 hover:border-[#009530]'
                        }`}
                      >
                        {match.id}
                      </button>
                    ))
                  ) : (
                    <button
                      type="button"
                      data-testid="rack-search-jump-btn"
                      onClick={() => handleFocusMatchedRack(rackSearch.activeHallMatches[0])}
                      className="px-2 py-0.5 font-mono text-[11px] font-medium rounded-xs border border-[#009530]/40 bg-[#009530]/10 text-[#007A27] dark:text-[#3DCD58] hover:bg-[#009530]/20 cursor-pointer whitespace-nowrap"
                    >
                      Focus {rackSearch.activeHallMatches[0].id}
                    </button>
                  )}
                </>
              ) : (
                rackSearch.firstMatch && (
                  <>
                    <span className="font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      0 in {activeHallStat.shortLabel} ·{' '}
                      <strong className="text-[#007A27] dark:text-[#3DCD58]">
                        {rackSearch.allMatches.length} in{' '}
                        {HALL_CONFIGS.find((hc) => hc.id === rackSearch.firstMatch!.hallId)
                          ?.shortLabel ?? rackSearch.firstMatch.hallName}
                      </strong>
                    </span>
                    <button
                      type="button"
                      data-testid="rack-search-jump-btn"
                      onClick={() => handleFocusMatchedRack(rackSearch.firstMatch!)}
                      className="px-2 py-0.5 font-mono text-[11px] font-medium rounded-xs bg-[#009530] hover:bg-[#007A27] text-white cursor-pointer whitespace-nowrap transition-colors"
                    >
                      Jump to {rackSearch.firstMatch.id}
                    </button>
                  </>
                )
              )}
            </div>
          </div>

          {/* Floorplan Quick Filter Chips */}
          <div
            role="group"
            aria-label="Floorplan quick filter chips"
            data-testid="rack-quick-filter-bar"
            className="mt-2.5 pb-2.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1">
                <Filter className="w-3 h-3" aria-hidden="true" />
                Quick Filter:
              </span>
              {(
                [
                  { id: 'all', label: 'All Cabinets', count: quickFilterCounts.all, tone: 'neutral' },
                  { id: 'over_cap', label: 'Over Cap', count: quickFilterCounts.over_cap, tone: 'critical' },
                  { id: 'thermal_high', label: 'Thermal >27°C', count: quickFilterCounts.thermal_high, tone: 'warning' },
                  { id: 'util_80', label: '>80% Util', count: quickFilterCounts.util_80, tone: 'indigo' },
                  { id: 'headroom_low', label: 'Headroom <50%', count: quickFilterCounts.headroom_low, tone: 'emerald' },
                ] as const
              ).map((chip) => {
                const active = quickFilter === chip.id;
                const activeCls =
                  chip.tone === 'critical'
                    ? 'bg-red-600 border-red-600 text-white'
                    : chip.tone === 'warning'
                    ? 'bg-amber-600 border-amber-600 text-white'
                    : chip.tone === 'indigo'
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-[#009530] border-[#009530] text-white';
                return (
                  <button
                    key={chip.id}
                    type="button"
                    data-testid={`rack-quick-filter-${chip.id}`}
                    aria-pressed={active}
                    onClick={() => setQuickFilter(chip.id)}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-sm border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      active
                        ? activeCls
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#14181D] text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <span>{chip.label}</span>
                    <span
                      className={`font-mono text-[10px] tabular-nums ${
                        active ? 'text-white/90' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {chip.count}
                    </span>
                  </button>
                );
              })}
            </div>
            {quickFilter !== 'all' && (
              <button
                type="button"
                data-testid="rack-quick-filter-reset"
                onClick={() => setQuickFilter('all')}
                className="text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 underline cursor-pointer whitespace-nowrap"
              >
                Clear Filter
              </button>
            )}

            {/* 2N Power & N+1 Cooling Failover Stress Simulator Toggle */}
            <div
              role="group"
              aria-label="2N power and N+1 cooling failover stress test"
              className="ml-auto inline-flex items-center gap-0.5 p-0.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#14181D]"
            >
              <span className="px-1.5 text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                Failover
              </span>
              {(
                [
                  { id: 'none', label: 'Normal 2N' },
                  { id: 'feed_a_loss', label: 'Feed A Loss' },
                  { id: 'crac_trip', label: 'CRAC Trip' },
                  { id: 'combined', label: 'Combined' },
                ] as Array<{ id: FailoverStressMode; label: string }>
              ).map((m) => {
                const active = activeFailoverMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    data-testid={`failover-mode-${m.id}`}
                    aria-pressed={active}
                    onClick={() => handleSetFailoverMode(m.id)}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded-xs transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? m.id === 'none'
                          ? 'bg-[#009530] text-white'
                          : 'bg-red-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live 2N / N+1 Failover Stress Audit Banner */}
          {activeFailoverMode !== 'none' && (
            <div
              data-testid="failover-audit-banner"
              role="status"
              className="mt-2.5 px-3 py-2 rounded-sm border border-red-300 dark:border-red-900/70 bg-red-50/90 dark:bg-red-950/35 flex flex-wrap items-center justify-between gap-2 text-xs text-red-950 dark:text-red-200"
            >
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" aria-hidden="true" />
                <span className="font-semibold">
                  {activeFailoverMode === 'feed_a_loss'
                    ? '2N Feed A Loss Stress Test'
                    : activeFailoverMode === 'crac_trip'
                    ? 'N+1 CRAC Trip Thermal Ride-Through'
                    : 'Combined 2N Feed A Loss + N+1 CRAC Trip'}:
                </span>
                {(activeFailoverMode === 'feed_a_loss' || activeFailoverMode === 'combined') && (
                  <span className="font-mono tabular-nums">
                    <strong className="text-red-700 dark:text-red-300">{failoverAudit.powerViolationCount}</strong> Feed B overloads (&gt;50% rated)
                    {failoverAudit.worstPowerRackId && (
                      <>
                        {' '}· Peak{' '}
                        <button
                          type="button"
                          onClick={() => setSelectedRackId(failoverAudit.worstPowerRackId!)}
                          className="underline font-semibold cursor-pointer"
                        >
                          {failoverAudit.worstPowerRackId} ({failoverAudit.worstPowerFeedBPct.toFixed(0)}%)
                        </button>
                      </>
                    )}
                  </span>
                )}
                {(activeFailoverMode === 'crac_trip' || activeFailoverMode === 'combined') && (
                  <span className="font-mono tabular-nums">
                    · <strong className="text-red-700 dark:text-red-300">{failoverAudit.coolingViolationCount}</strong> ASHRAE A1 ({ASHRAE_A1_MAX_INLET_C.toFixed(0)}°C) breaches ≤12m
                    {failoverAudit.shortestMinutesToBreach !== null && failoverAudit.worstCoolingRackId && (
                      <>
                        {' '}· Min{' '}
                        <button
                          type="button"
                          onClick={() => setSelectedRackId(failoverAudit.worstCoolingRackId!)}
                          className="underline font-semibold cursor-pointer"
                        >
                          {failoverAudit.worstCoolingRackId} ({failoverAudit.shortestMinutesToBreach.toFixed(1)}m)
                        </button>
                      </>
                    )}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleSetFailoverMode('none')}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border border-red-300 dark:border-red-800 bg-white dark:bg-red-950/60 hover:bg-red-100 dark:hover:bg-red-900/60 cursor-pointer whitespace-nowrap"
              >
                <X className="w-3 h-3" aria-hidden="true" />
                Reset 2N
              </button>
            </div>
          )}

          {/* SLD Blast-Radius Active Trace Banner */}
          {sldBlastHighlight && (
            <div
              data-testid="rack-sld-blast-banner"
              className={`mt-3 px-3 py-2 rounded-sm border flex flex-wrap items-center justify-between gap-2 text-xs ${
                sldBlastHighlight.severity === 'critical'
                  ? 'bg-red-50 dark:bg-red-950/35 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200'
                  : 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Zap className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="font-medium truncate">
                  SLD Blast-Radius Overlay: {sldBlastHighlight.summary}
                </span>
              </div>
              {onClearSldBlast && (
                <button
                  type="button"
                  onClick={onClearSldBlast}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border border-current/25 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer whitespace-nowrap"
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                  Clear Trace
                </button>
              )}
            </div>
          )}

          {/* Physical Security <-> Thermal Correlation Alert Strip */}
          {activeHallCorrelations.length > 0 && (
            <div
              data-testid="rack-security-correlation-banner"
              className="mt-2.5 px-3 py-2 rounded-sm border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/25 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950 dark:text-amber-200"
            >
              <div className="flex items-center gap-2 min-w-0">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  <strong className="font-semibold">Security ↔ Thermal Correlation:</strong>{' '}
                  {activeHallCorrelations[0].summary}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRackId(activeHallCorrelations[0].rackId)}
                className="text-amber-800 dark:text-amber-300 font-medium hover:underline cursor-pointer whitespace-nowrap"
              >
                Focus {activeHallCorrelations[0].rackId}
              </button>
            </div>
          )}

          {/* Critical Power Capacity Exceeded Alert Banner */}
          {activeHallStat.powerSummary.capacityExceededCount > 0 && (
            <div
              data-testid="rack-capacity-exceeded-banner"
              role="alert"
              className="mt-2.5 px-3 py-2 rounded-sm border border-red-300 dark:border-red-900/70 bg-red-50/85 dark:bg-red-950/35 flex flex-wrap items-center justify-between gap-2 text-xs text-red-950 dark:text-red-200"
            >
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <AlertTriangle
                  className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  <strong className="font-semibold">Critical Power Capacity:</strong>{' '}
                  <span className="font-mono tabular-nums font-semibold">
                    {activeHallStat.powerSummary.capacityExceededCount}
                  </span>{' '}
                  {activeHallStat.powerSummary.capacityExceededCount === 1
                    ? 'cabinet exceeds its'
                    : 'cabinets exceed their'}{' '}
                  {activeHallStat.powerCapacityKw} kW rated limit in {activeHallStat.shortLabel}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {activeHallStat.powerSummary.capacityExceededRackIds.slice(0, 4).map((overId) => {
                  const st = bmsPowerStatsMap[overId];
                  return (
                    <button
                      key={overId}
                      type="button"
                      data-testid={`rack-focus-overcap-${overId}`}
                      onClick={() => setSelectedRackId(overId)}
                      className={`px-2 py-0.5 font-mono text-[11px] tabular-nums rounded-xs border transition-colors cursor-pointer whitespace-nowrap ${
                        focusedRack.id === overId
                          ? 'bg-red-600 border-red-600 text-white'
                          : 'bg-white dark:bg-red-950/60 border-red-300 dark:border-red-800 text-red-800 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/60'
                      }`}
                    >
                      {overId} ({st ? `${st.powerKw.toFixed(1)}/${st.powerCapacityKw} kW` : '>100%'})
                    </button>
                  );
                })}
                {onOpenAlerts && (
                  <button
                    type="button"
                    data-testid="rack-overcap-view-alerts-btn"
                    onClick={onOpenAlerts}
                    className="ml-1 text-red-800 dark:text-red-300 font-medium hover:underline cursor-pointer whitespace-nowrap"
                  >
                    View Alerts
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Direct BMS Cooling Coupling Shortcuts (active in BMS Sensor Heatmap mode) */}
          {sensorHeatmapActive && canControlBms && (onBoostHallCrac || onToggleHallExcursion) && (
            <div
              data-testid="rack-bms-cooling-shortcuts"
              className="mt-2.5 px-3 py-1.5 rounded-sm border border-sky-200/80 dark:border-sky-900/60 bg-sky-50/60 dark:bg-sky-950/20 flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 text-xs"
            >
              <div className="flex items-center gap-1.5 text-sky-900 dark:text-sky-200 min-w-0 truncate">
                <Wind className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  Cooling Control:{' '}
                  <strong className="font-mono tabular-nums">
                    {activeHallCrac?.name ?? 'Hall CRAC'} ({activeHallCrac?.mode ?? 'Auto'} ·{' '}
                    {(activeHallCrac?.setpointC ?? 20).toFixed(1)}°C)
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {onBoostHallCrac && (
                  <button
                    type="button"
                    data-testid="rack-boost-crac-btn"
                    onClick={() => onBoostHallCrac(activeHallId)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-sky-600 bg-sky-600 text-white hover:bg-sky-700 cursor-pointer whitespace-nowrap"
                  >
                    <Wind className="w-3 h-3" aria-hidden="true" />
                    {activeHallCrac?.mode === 'Boost' ? 'Return CRAC to Auto' : 'Boost Hall CRAC'}
                  </button>
                )}
                {onToggleHallExcursion && (
                  <button
                    type="button"
                    data-testid="rack-toggle-excursion-btn"
                    onClick={() => onToggleHallExcursion(activeHallId)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border cursor-pointer whitespace-nowrap ${
                      activeHallEnv?.slaExcursionActive
                        ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'border-amber-400 dark:border-amber-700 bg-white dark:bg-[#1B2026] text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                    }`}
                  >
                    <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                    {activeHallEnv?.slaExcursionActive
                      ? 'Clear Cold-Aisle Excursion'
                      : 'Simulate Excursion'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Calibrated Continuous Thermal Legend & Hall Telemetry Strip */}
          <div
            data-testid="rack-heatmap-legend"
            className="mt-3 pb-3 border-b border-slate-100 dark:border-slate-800 space-y-2.5"
          >
            {/* Dedicated 20°C–45°C Temperature Scale Legend for Thermal Heatmap Modes */}
            {!isPowerLayerMode && !isDeltaMode && (
              <RackHeatmapTemperatureLegend
                minC={temperatureLegendBounds.minC}
                maxC={temperatureLegendBounds.maxC}
                ticks={temperatureLegendBounds.ticks}
                scaleLabel={
                  scaleMode === 'fixed'
                    ? isInletFrontPrimaryMode
                      ? 'Fixed 20–45°C · Rack Front Inlet Gradient'
                      : sensorHeatmapActive
                      ? 'Fixed 20–45°C · BMS Cold-Aisle Sensor Array'
                      : 'Fixed 20–45°C · Floorplan Thermal Overlay'
                    : 'Auto-Range · Live Hall Spread'
                }
                hallAvgTempC={
                  sensorHeatmapActive
                    ? activeHallStat.sensorSummary.avgTempC
                    : isInletFrontPrimaryMode
                    ? activeHallStat.inletSummary.avgInletTempC
                    : activeHallStat.thermalSummary.avgTempC
                }
                activeRackId={activeReadoutRackId}
                activeRackTempC={
                  sensorHeatmapActive
                    ? activeReadoutSensor?.sensorTempC
                    : isInletFrontPrimaryMode
                    ? activeReadoutInlet?.avgInletTempC
                    : activeReadoutThermal?.avgTempC
                }
                isHovering={hoveredRackId !== null}
              />
            )}

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex flex-wrap items-center gap-3">
                {(isPowerLayerMode || isDeltaMode) && (
                  <div className="w-44 sm:w-52 shrink-0">
                    <div
                      className="h-2.5 w-full rounded-xs border border-slate-200/80 dark:border-slate-700"
                      style={{ background: legendGradient }}
                      aria-hidden="true"
                    />
                    <div className="mt-1 flex items-center justify-between font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                      {scaleBounds.ticks.map((tick) => (
                        <span key={tick}>
                          {isPowerLayerMode
                            ? `${tick.toFixed(0)} kW`
                            : `${tick > 0 ? '+' : ''}${tick.toFixed(0)}°C`}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {sensorHeatmapActive ? (
                  <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                    <span
                      className="w-2 h-2 rotate-45 bg-white ring-1 ring-sky-800 shrink-0"
                      aria-hidden="true"
                    />
                    <span>BMS Probe (R05/R16)</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                    <span
                      className="w-2 h-2 rounded-full bg-white ring-1 ring-slate-700 shrink-0"
                      aria-hidden="true"
                    />
                    <span>Live Host</span>
                  </div>
                )}
                {powerOverlayActive && (
                  <div
                    data-testid="rack-power-overlay-legend"
                    className="inline-flex items-center gap-1 text-[11px] font-mono text-indigo-700 dark:text-indigo-300 whitespace-nowrap shrink-0"
                  >
                    <Zap className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span>Cell = kW Draw</span>
                  </div>
                )}
                {thermalOverlayActive && (
                  <div
                    data-testid="rack-thermal-overlay-legend"
                    className="inline-flex items-center gap-1 text-[11px] font-mono text-teal-700 dark:text-teal-300 whitespace-nowrap shrink-0"
                  >
                    <Thermometer className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span>Cell = BMS °C (18–27°C SLA)</span>
                  </div>
                )}
                <div
                  data-testid="rack-overcap-legend-item"
                  className="inline-flex items-center gap-1.5 text-[11px] text-red-700 dark:text-red-400 font-medium whitespace-nowrap shrink-0"
                >
                  <span
                    className="inline-flex items-center justify-center w-3 h-3 rounded-[2px] bg-red-600 text-white text-[9px] font-bold leading-none ring-1 ring-white dark:ring-slate-900 shrink-0"
                    aria-hidden="true"
                  >
                    !
                  </span>
                  <span>Over Limit (&gt;100%)</span>
                </div>
              </div>

              {isPowerLayerMode ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  <span className="whitespace-nowrap">
                    Hall Load{' '}
                    <strong className="text-slate-900 dark:text-white">
                      {(activeHallStat.powerSummary.totalKw / 1000).toFixed(2)} MW
                    </strong>{' '}
                    ({activeHallStat.powerSummary.utilizationPct}%)
                  </span>
                  <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                    Avg {activeHallStat.powerSummary.avgRackKw.toFixed(1)} kW/rack
                  </span>
                  <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                    2N Bus {activeHallStat.powerSummary.busASharePct}/
                    {100 - activeHallStat.powerSummary.busASharePct}% · PF{' '}
                    {activeHallStat.powerSummary.avgPowerFactor.toFixed(2)}
                  </span>
                  {activeHallStat.powerSummary.peakRackId && (
                    <button
                      type="button"
                      data-testid="rack-focus-peak-power-btn"
                      onClick={() =>
                        setSelectedRackId(activeHallStat.powerSummary.peakRackId!)
                      }
                      className="text-indigo-700 dark:text-indigo-300 hover:underline font-medium cursor-pointer whitespace-nowrap"
                    >
                      Peak: {activeHallStat.powerSummary.peakRackId} (
                      {activeHallStat.powerSummary.peakRackKw.toFixed(1)} kW)
                    </button>
                  )}
                </div>
              ) : sensorHeatmapActive ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  <span className="whitespace-nowrap">
                    BMS Avg{' '}
                    <strong className="text-slate-900 dark:text-white">
                      {activeHallStat.sensorSummary.avgTempC.toFixed(1)}°C
                    </strong>
                  </span>
                  <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                    Range {activeHallStat.sensorSummary.minTempC.toFixed(1)}–
                    {activeHallStat.sensorSummary.maxTempC.toFixed(1)}°C
                  </span>
                  <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                    RH {activeHallStat.sensorSummary.avgHumidityPct.toFixed(0)}% ·{' '}
                    {activeHallStat.sensorSummary.differentialPressurePa.toFixed(1)} Pa
                  </span>
                  <span
                    className={`whitespace-nowrap ${
                      activeHallStat.sensorSummary.breachedCount > 0
                        ? 'text-red-700 dark:text-red-400 font-semibold'
                        : activeHallStat.sensorSummary.warningCount > 0
                        ? 'text-amber-700 dark:text-amber-400 font-medium'
                        : 'text-[#007A27] dark:text-[#3DCD58]'
                    }`}
                  >
                    {activeHallStat.sensorSummary.breachedCount > 0
                      ? `SLA Breached: ${activeHallStat.sensorSummary.breachedCount}`
                      : activeHallStat.sensorSummary.warningCount > 0
                      ? `SLA Warn: ${activeHallStat.sensorSummary.warningCount}`
                      : 'ASHRAE SLA 100%'}
                  </span>
                  {activeHallStat.sensorSummary.warmestRackId && (
                    <button
                      type="button"
                      data-testid="rack-focus-warmest-sensor-btn"
                      onClick={() =>
                        setSelectedRackId(activeHallStat.sensorSummary.warmestRackId!)
                      }
                      className="text-sky-700 dark:text-sky-400 hover:underline font-medium cursor-pointer whitespace-nowrap"
                    >
                      Warmest: {activeHallStat.sensorSummary.warmestRackId}
                    </button>
                  )}
                </div>
              ) : isInletFrontPrimaryMode ? (
                <div
                  data-testid="rack-inlet-gradient-legend"
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300"
                >
                  <span className="whitespace-nowrap">
                    Hall Inlet Avg{' '}
                    <strong className="text-slate-900 dark:text-white">
                      {activeHallStat.inletSummary.avgInletTempC.toFixed(1)}°C
                    </strong>
                  </span>
                  <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                    Range {activeHallStat.inletSummary.minInletTempC.toFixed(1)}–
                    {activeHallStat.inletSummary.maxInletTempC.toFixed(1)}°C
                  </span>
                  <span className="whitespace-nowrap text-cyan-700 dark:text-cyan-400">
                    ▼ Odd Front S · ▲ Even Front N
                  </span>
                  <span
                    className={`whitespace-nowrap ${
                      activeHallStat.inletSummary.breachedCount > 0
                        ? 'text-red-700 dark:text-red-400 font-semibold'
                        : activeHallStat.inletSummary.elevatedCount > 0
                        ? 'text-amber-700 dark:text-amber-400 font-medium'
                        : 'text-[#007A27] dark:text-[#3DCD58]'
                    }`}
                  >
                    {activeHallStat.inletSummary.breachedCount > 0
                      ? `Inlet >27°C: ${activeHallStat.inletSummary.breachedCount}`
                      : `Elevated (≥24°C): ${activeHallStat.inletSummary.elevatedCount}`}
                  </span>
                  {activeHallStat.inletSummary.warmestRackId && (
                    <button
                      type="button"
                      data-testid="rack-focus-warmest-inlet-btn"
                      onClick={() =>
                        setSelectedRackId(activeHallStat.inletSummary.warmestRackId!)
                      }
                      className="text-cyan-700 dark:text-cyan-400 hover:underline font-medium cursor-pointer whitespace-nowrap"
                    >
                      Warmest Front: {activeHallStat.inletSummary.warmestRackId} (
                      {activeHallStat.inletSummary.warmestInletTempC.toFixed(1)}°C)
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  <span className="whitespace-nowrap">
                    Hall Avg{' '}
                    <strong className="text-slate-900 dark:text-white">
                      {activeHallStat.thermalSummary.avgTempC.toFixed(1)}°C
                    </strong>
                  </span>
                  <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                    Range {activeHallStat.thermalSummary.minTempC.toFixed(1)}–
                    {activeHallStat.thermalSummary.maxTempC.toFixed(1)}°C
                  </span>
                  <span
                    className={`whitespace-nowrap ${
                      activeHallStat.thermalSummary.hotspotCount > 0
                        ? 'text-orange-700 dark:text-orange-400 font-semibold'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Hotspots (≥65°C): {activeHallStat.thermalSummary.hotspotCount}
                  </span>
                  {activeHallStat.thermalSummary.hottestRackId && (
                    <button
                      type="button"
                      data-testid="rack-focus-hottest-btn"
                      onClick={() =>
                        setSelectedRackId(activeHallStat.thermalSummary.hottestRackId!)
                      }
                      className="text-[#007A27] dark:text-[#3DCD58] hover:underline font-medium cursor-pointer whitespace-nowrap"
                    >
                      Hottest: {activeHallStat.thermalSummary.hottestRackId}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Live Rack Hover / Selection Telemetry Readout Bar */}
          {isPowerLayerMode && activeReadoutPower ? (
            <div
              data-testid="rack-power-readout"
              className="mt-2.5 px-3 py-1.5 rounded-sm bg-indigo-50/70 dark:bg-indigo-950/25 border border-indigo-200/70 dark:border-indigo-900/50 flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-slate-700 dark:text-slate-300">
                <span className="font-semibold text-slate-900 dark:text-white">
                  {activeReadoutRackId}
                </span>
                <span aria-hidden="true" className="text-slate-400">·</span>
                <span>
                  BMS Draw:{' '}
                  <strong className={powerBandTextColorClass(activeReadoutPower.powerBand)}>
                    {activeReadoutPower.powerKw.toFixed(2)} / {activeReadoutPower.powerCapacityKw} kW (
                    {activeReadoutPower.utilizationPct}%)
                  </strong>
                </span>
                <span aria-hidden="true" className="text-slate-400">·</span>
                <span className="text-slate-600 dark:text-slate-400">
                  Feed A {activeReadoutPower.feedAKw.toFixed(2)} / B{' '}
                  {activeReadoutPower.feedBKw.toFixed(2)} kW
                </span>
              </div>
              <div className="text-slate-600 dark:text-slate-400 whitespace-nowrap">
                {activeReadoutPower.apparentKva.toFixed(2)} kVA · PF{' '}
                {activeReadoutPower.powerFactor.toFixed(2)} · {activeReadoutPower.busSourceLabel}
              </div>
            </div>
          ) : (sensorHeatmapActive || thermalOverlayActive) && activeReadoutSensor ? (
            <div
              data-testid={
                thermalOverlayActive && !sensorHeatmapActive
                  ? 'rack-bms-thermal-overlay-readout'
                  : 'rack-thermal-readout'
              }
              className={`mt-2.5 px-3 py-1.5 rounded-sm border flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums ${
                thermalOverlayActive && !sensorHeatmapActive
                  ? 'bg-teal-50/75 dark:bg-teal-950/25 border-teal-200/80 dark:border-teal-900/60'
                  : 'bg-sky-50/70 dark:bg-sky-950/25 border-sky-200/70 dark:border-sky-900/50'
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-slate-700 dark:text-slate-300">
                <span className="font-semibold text-slate-900 dark:text-white">
                  {activeReadoutRackId}
                </span>
                <span aria-hidden="true" className="text-slate-400">·</span>
                <span>
                  BMS Sensor Array:{' '}
                  <strong className={sensorBandTextColorClass(activeReadoutSensor.sensorBand)}>
                    {activeReadoutSensor.sensorTempC.toFixed(1)}°C ({activeReadoutSensor.sensorBand} ·{' '}
                    {activeReadoutSensor.slaStatus})
                  </strong>
                </span>
                <span aria-hidden="true" className="text-slate-400">·</span>
                <span className="text-slate-600 dark:text-slate-400">
                  RH {activeReadoutSensor.humidityPct.toFixed(1)}% · Dew{' '}
                  {activeReadoutSensor.dewPointC.toFixed(1)}°C
                </span>
              </div>
              <div className="text-slate-600 dark:text-slate-400">
                {activeReadoutThermal
                  ? `Server Avg ${activeReadoutThermal.avgTempC.toFixed(1)}°C · `
                  : ''}
                {activeReadoutPower ? `${activeReadoutPower.powerKw.toFixed(2)} kW · ` : ''}
                Probe {activeReadoutSensor.nearestProbeId} ({activeReadoutSensor.redundancyPath}
                {activeReadoutSensor.probeMountSlot ? ' · Mounted' : ''})
              </div>
            </div>
          ) : (
            activeReadoutThermal && (
              <div
                data-testid="rack-thermal-readout"
                className="mt-2.5 px-3 py-1.5 rounded-sm bg-slate-50 dark:bg-[#14181D] border border-slate-200/70 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums"
              >
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-slate-700 dark:text-slate-300">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {activeReadoutRackId}
                  </span>
                  {activeReadoutInlet && (
                    <>
                      <span aria-hidden="true" className="text-slate-400">·</span>
                      <span>
                        Front Avg Inlet:{' '}
                        <strong className={sensorBandTextColorClass(activeReadoutInlet.band)}>
                          {activeReadoutInlet.avgInletTempC.toFixed(1)}°C ({activeReadoutInlet.band} ·{' '}
                          {activeReadoutInlet.frontFacing === 'south' ? 'South Front' : 'North Front'})
                        </strong>
                      </span>
                    </>
                  )}
                  <span aria-hidden="true" className="text-slate-400">·</span>
                  <span>
                    Exhaust Avg:{' '}
                    <strong className={bandTextColorClass(activeReadoutThermal.band)}>
                      {activeReadoutThermal.avgTempC.toFixed(1)}°C
                    </strong>
                  </span>
                </div>
                <div className="text-slate-500 dark:text-slate-400">
                  {activeReadoutInlet ? `ΔT ${activeReadoutInlet.deltaTExhaustToInletC.toFixed(1)}°C · ` : ''}
                  {activeReadoutThermal.serverCount}{' '}
                  {activeReadoutThermal.hasLiveServers ? 'live hosts' : 'nodes'} ·{' '}
                  <strong
                    className={
                      activeReadoutPower?.exceedsCapacity
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-slate-800 dark:text-slate-200'
                    }
                  >
                    {(activeReadoutPower?.powerKw ?? activeReadoutMetrics?.powerKw ?? 0).toFixed(2)} kW
                  </strong>
                  {activeReadoutPower ? ` (${activeReadoutPower.utilizationPct}%)` : ''}
                  {activeReadoutPower?.exceedsCapacity && (
                    <span className="ml-1.5 text-red-700 dark:text-red-400 font-semibold">
                      · OVER LIMIT (+{activeReadoutPower.overCapacityKw.toFixed(2)} kW)
                    </span>
                  )}
                </div>
              </div>
            )
          )}

          {/* 20x20 Rack Matrix + Smooth Bilinear Thermal Heatmap Canvas Overlay */}
          <div className="mt-3 overflow-x-auto">
            <div className="min-w-[560px]">
              {/* Column Indices 01..20 */}
              <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-1.5 mb-1.5 text-[10px] font-mono text-slate-400 dark:text-slate-500 text-center">
                <span className="text-left pl-1">Row</span>
                <div className="grid grid-cols-20 gap-1">
                  {Array.from({ length: RACKS_PER_ROW }, (_, i) => {
                    const colNum = i + 1;
                    const highlightCol =
                      rackSearch.isActive &&
                      rackSearch.activeHallMatches.length > 0 &&
                      rackSearch.activeHallMatches.length <= 20 &&
                      matchedRackIndices.has(colNum);
                    return (
                      <span
                        key={i}
                        className={
                          highlightCol
                            ? 'text-[#007A27] dark:text-[#3DCD58] font-bold'
                            : undefined
                        }
                      >
                        {String(colNum).padStart(2, '0')}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Matrix Body: Left Row Labels + Right 20x20 Grid with Draped Heatmap Canvas */}
              <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-1.5 items-stretch">
                {/* Left Row Index Column (always crisp & untinted, pixel-locked to grid rows) */}
                <div className="space-y-1">
                  {activeHallRows.map((_, rowIdx) => {
                    const rowNum = rowIdx + 1;
                    const addAisleGap = rowNum % 2 === 0 && rowNum < ROWS_PER_HALL;
                    const highlightRow = rackSearch.isActive && matchedRowNumbers.has(rowNum);
                    return (
                      <div
                        key={rowNum}
                        className={addAisleGap ? 'pb-2 mb-1 border-b border-transparent' : ''}
                      >
                        <div
                          className={`${powerOverlayActive || thermalOverlayActive ? 'h-6' : 'h-5'} flex items-center pl-1 font-mono text-[10px] ${
                            highlightRow
                              ? 'font-bold text-[#007A27] dark:text-[#3DCD58]'
                              : 'font-medium text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          R{String(rowNum).padStart(2, '0')}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Right 20x20 Interactive Rack Cells + Smooth Heatmap Plume Canvas */}
                <div className="relative">
                  <div className="space-y-1">
                    {activeHallRows.map((rowRacks, rowIdx) => {
                      const rowNum = rowIdx + 1;
                      const addAisleGap = rowNum % 2 === 0 && rowNum < ROWS_PER_HALL;
                      return (
                        <div
                          key={rowNum}
                          className={`grid grid-cols-20 gap-1 items-center ${
                            addAisleGap
                              ? 'pb-2 mb-1 border-b border-dashed border-slate-200/80 dark:border-slate-800'
                              : ''
                          }`}
                        >
                          {rowRacks.map((rack) => {
                            const met = rackMetricsMap[rack.id];
                            const therm = thermalStatsMap[rack.id];
                            const inletStat = inletThermalStatsMap[rack.id];
                            const sensor = bmsSensorStatsMap[rack.id];
                            const powerStat = bmsPowerStatsMap[rack.id];
                            const avgTemp = therm?.avgTempC ?? rack.basePeakTempC - 3.5;
                            const avgInletTemp = inletStat?.avgInletTempC ?? rack.ambientTempC;
                            const frontFacing = inletStat?.frontFacing ?? (rack.rowNumber % 2 === 1 ? 'south' : 'north');
                            const rackFrontGradient = inletFrontGradientActive
                              ? buildRackFrontThermalGradientCss(
                                  { avgInletTempC: avgInletTemp, frontFacing },
                                  inletScaleBounds.minC,
                                  inletScaleBounds.maxC,
                                  isInletFrontPrimaryMode ? 0.94 : 0.58
                                )
                              : null;
                            const sensorTemp = sensor?.sensorTempC ?? activeHallStat.sensorSummary.avgTempC;
                            const thermalOverlaySample = thermalOverlayActive
                              ? buildBmsThermalOverlaySample(sensor, sensorTemp)
                              : null;
                            const hasNumericCellOverlay = powerOverlayActive || thermalOverlayActive;
                            const livePowerKw = powerStat?.powerKw ?? met?.powerKw ?? rack.basePowerKw;
                            const displayVal = isPowerLayerMode
                              ? livePowerKw
                              : isInletFrontPrimaryMode
                              ? avgInletTemp
                              : horizonValuesByRackId[rack.id] ?? (sensorHeatmapActive ? sensorTemp : avgTemp);
                            const thermalColor = isPowerLayerMode
                              ? interpolatePowerColor(livePowerKw, scaleBounds.minC, scaleBounds.maxC)
                              : isInletFrontPrimaryMode
                              ? interpolateInletThermalColor(avgInletTemp, inletScaleBounds.minC, inletScaleBounds.maxC)
                              : pickHeatmapColorSample(
                                  displayVal,
                                  scaleBounds.minC,
                                  scaleBounds.maxC,
                                  timeHorizon,
                                  sensorHeatmapActive
                                );
                            const isSelected = rack.id === focusedRack.id;
                            const isPinned = pinnedRackIds.includes(rack.id);
                            const isSecurityCorrelated = correlatedRackIdSet.has(rack.id);
                            const isCapacityExceeded = Boolean(
                              powerStat?.exceedsCapacity || openCapacityAlertByRackId.has(rack.id)
                            );
                            const isSearchMatch = rackSearch.isActive && rackSearch.activeHallMatchIds.has(rack.id);
                            const isSearchDimmed = rackSearch.isActive && !isSearchMatch;
                            const isQuickFilterActive = quickFilter !== 'all';
                            const isQuickFilterMatch =
                              isQuickFilterActive &&
                              matchesRackQuickFilter(quickFilter, powerStat, sensor);
                            const isQuickFilterDimmed = isQuickFilterActive && !isQuickFilterMatch;
                            const isCellDimmed = isSearchDimmed || isQuickFilterDimmed;
                            const hasLiveServers = (serversByRack.get(rack.id)?.length ?? 0) > 0;
                            const usesCustomBgColor =
                              !isInletFrontPrimaryMode &&
                              (isPowerLayerMode || layer === 'thermal' || sensorHeatmapActive || isDeltaMode);
                            const bgCls = isInletFrontPrimaryMode
                              ? 'bg-slate-800/95 dark:bg-slate-950/95'
                              : usesCustomBgColor
                              ? ''
                              : baseCellColorClass(
                                  layer,
                                  isCapacityExceeded ? 'critical' : met?.status ?? 'nominal',
                                  powerStat?.utilizationPct ?? met?.utilizationPct ?? 45
                                );
                            const cellLabelColor = isInletFrontPrimaryMode
                              ? 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.75)]'
                              : usesCustomBgColor
                              ? thermalColor.contrastText
                              : !isCapacityExceeded && met?.status === 'warning'
                              ? 'text-slate-950'
                              : 'text-white';

                            const hasLocateLed = locateLedRackSet.has(rack.id);
                            const rackFailover = activeFailoverMode !== 'none' ? failoverAudit.byRack[rack.id] : undefined;
                            const isFailoverViolation = rackFailover?.overallVerdict === 'violation';
                            const isFailoverAtRisk = rackFailover?.overallVerdict === 'at_risk';

                            return (
                              <button
                                key={rack.id}
                                type="button"
                                data-testid={`rack-cell-${rack.id}`}
                                data-avg-temp={avgTemp.toFixed(1)}
                                data-inlet-temp={avgInletTemp.toFixed(1)}
                                data-front-facing={frontFacing}
                                data-sensor-temp={sensorTemp.toFixed(1)}
                                data-sensor-band={sensor?.sensorBand ?? ''}
                                data-power-kw={livePowerKw.toFixed(2)}
                                data-capacity-exceeded={isCapacityExceeded ? 'true' : 'false'}
                                data-failover-verdict={rackFailover?.overallVerdict ?? 'none'}
                                data-locate-led={hasLocateLed ? 'true' : 'false'}
                                data-horizon-val={displayVal.toFixed(1)}
                                data-sensor-probe={sensor?.probeMountSlot ?? ''}
                                data-search-match={isSearchMatch ? 'true' : 'false'}
                                data-filter-match={isQuickFilterActive ? (isQuickFilterMatch ? 'true' : 'false') : 'all'}
                                onClick={() => setSelectedRackId(rack.id)}
                                onMouseEnter={() => setHoveredRackId(rack.id)}
                                onMouseLeave={() => setHoveredRackId(null)}
                                onFocus={() => setHoveredRackId(rack.id)}
                                title={
                                  isFailoverViolation && rackFailover
                                    ? `FAILOVER VIOLATION: ${rack.id} · Feed B ${rackFailover.survivingFeedLoadPct.toFixed(0)}% (+${rackFailover.feedBOverloadKw.toFixed(2)} kW) · ASHRAE A1 breach in ${rackFailover.minutesToAshraeBreach !== null ? `${rackFailover.minutesToAshraeBreach.toFixed(1)} min` : 'N/A'}`
                                    : isCapacityExceeded && powerStat
                                    ? `CRITICAL POWER CAPACITY: ${rack.id} drawing ${powerStat.powerKw.toFixed(2)} kW / ${powerStat.effectiveLimitKw.toFixed(1)} kW limit (+${powerStat.overCapacityKw.toFixed(2)} kW · ${powerStat.utilizationPct}%) · Avg Server Inlet ${avgInletTemp.toFixed(1)}°C`
                                    : thermalOverlaySample && sensor
                                    ? `${rack.id} · BMS Sensor Array ${sensor.sensorTempC.toFixed(1)}°C (${sensor.sensorBand} · ${sensor.slaStatus}) · Avg Server Inlet ${avgInletTemp.toFixed(1)}°C · Power ${livePowerKw.toFixed(2)} kW`
                                    : isInletFrontPrimaryMode
                                    ? `${rack.id} · Rack Front Avg Server Inlet ${avgInletTemp.toFixed(1)}°C (${inletStat?.band ?? 'Optimal'} · Facing ${frontFacing === 'south' ? 'South' : 'North'}) · Exhaust Avg ${avgTemp.toFixed(1)}°C · BMS ${livePowerKw.toFixed(2)} kW`
                                    : isPowerLayerMode && powerStat
                                    ? `${rack.id} · BMS Power ${powerStat.powerKw.toFixed(2)} kW / ${powerStat.effectiveLimitKw.toFixed(1)} kW (${powerStat.utilizationPct}% · ${powerStat.powerBand}) · Avg Server Inlet ${avgInletTemp.toFixed(1)}°C`
                                    : isDeltaMode
                                    ? `${rack.id} · Δ vs 1h Ago: ${displayVal >= 0 ? '+' : ''}${displayVal.toFixed(1)}°C · ${livePowerKw.toFixed(2)} kW`
                                    : sensorHeatmapActive && sensor
                                    ? `${rack.id} · BMS Sensor ${displayVal.toFixed(1)}°C (${sensor.sensorBand}) · Avg Server Inlet ${avgInletTemp.toFixed(1)}°C · Probe ${sensor.nearestProbeId}`
                                    : `${rack.id} · Avg ${displayVal.toFixed(1)}°C (${thermalColor.band}) · Avg Inlet ${avgInletTemp.toFixed(1)}°C · BMS ${livePowerKw.toFixed(2)} kW`
                                }
                                aria-label={
                                  isCapacityExceeded && powerStat
                                    ? `Select rack ${rack.id}, Row ${rowNum}, critical power capacity exceeded, drawing ${powerStat.powerKw.toFixed(2)} kilowatts of ${powerStat.effectiveLimitKw.toFixed(1)} kilowatt limit, average server inlet ${avgInletTemp.toFixed(1)} degrees Celsius`
                                    : isInletFrontPrimaryMode
                                    ? `Select rack ${rack.id}, Row ${rowNum}, rack front facing ${frontFacing}, average server inlet temperature ${avgInletTemp.toFixed(1)} degrees Celsius, ${inletStat?.band ?? 'Optimal'}, power draw ${livePowerKw.toFixed(1)} kilowatts`
                                    : thermalOverlaySample && sensor
                                    ? `Select rack ${rack.id}, Row ${rowNum}, BMS sensor array thermal status ${sensor.sensorTempC.toFixed(1)} degrees Celsius, ${sensor.sensorBand}, SLA ${sensor.slaStatus}`
                                    : isPowerLayerMode && powerStat
                                    ? `Select rack ${rack.id}, Row ${rowNum}, real-time BMS power draw ${powerStat.powerKw.toFixed(2)} kilowatts, ${powerStat.utilizationPct} percent utilization, ${powerStat.powerBand}`
                                    : sensorHeatmapActive && sensor
                                    ? `Select rack ${rack.id}, Row ${rowNum}, BMS sensor temperature ${sensor.sensorTempC.toFixed(1)} degrees Celsius, power draw ${livePowerKw.toFixed(1)} kilowatts`
                                    : `Select rack ${rack.id}, Row ${rowNum}, average server temperature ${avgTemp.toFixed(1)} degrees Celsius, average server inlet ${avgInletTemp.toFixed(1)} degrees Celsius`
                                }
                                style={
                                  usesCustomBgColor
                                    ? { backgroundColor: thermalColor.hex }
                                    : undefined
                                }
                                className={`relative overflow-visible ${hasNumericCellOverlay ? 'h-6' : 'h-5'} rounded-[3px] transition-all cursor-pointer flex items-center justify-center ${bgCls} ${
                                  isSearchMatch
                                    ? isSelected
                                      ? 'ring-2 ring-slate-950 dark:ring-white outline-2 outline-[#009530] dark:outline-[#3DCD58] scale-115 z-30 shadow-md opacity-100'
                                      : 'ring-2 ring-white outline-2 outline-slate-950 dark:outline-[#3DCD58] scale-110 z-30 shadow-sm opacity-100'
                                    : isCellDimmed
                                    ? isSelected
                                      ? 'ring-2 ring-slate-950/60 dark:ring-white/60 opacity-45 z-20'
                                      : 'opacity-20 saturate-50 hover:opacity-75 hover:z-20'
                                    : isQuickFilterMatch
                                    ? isSelected
                                      ? 'ring-2 ring-slate-950 dark:ring-white outline-2 outline-[#009530] dark:outline-[#3DCD58] scale-110 z-30 shadow-sm opacity-100'
                                      : 'ring-2 ring-white outline-1 outline-slate-900 dark:outline-[#3DCD58] z-25 shadow-xs opacity-100'
                                    : isSelected
                                    ? hasLocateLed
                                      ? 'ring-2 ring-blue-500 outline-2 outline-slate-950 dark:outline-white scale-110 z-30'
                                      : isCapacityExceeded || isFailoverViolation
                                      ? 'ring-2 ring-slate-950 dark:ring-white outline-2 outline-red-600 dark:outline-red-400 scale-110 z-30'
                                      : 'ring-2 ring-slate-950 dark:ring-white scale-110 z-20'
                                    : hasLocateLed
                                    ? 'ring-2 ring-blue-500 outline-1 outline-white z-25 shadow-xs'
                                    : isFailoverViolation
                                    ? 'ring-2 ring-red-600 dark:ring-red-400 outline-1 outline-white/90 dark:outline-slate-950 z-25 shadow-xs'
                                    : isFailoverAtRisk
                                    ? 'ring-1 ring-amber-400 dark:ring-amber-300 z-15'
                                    : isCapacityExceeded
                                    ? 'ring-2 ring-red-600 dark:ring-red-400 outline-1 outline-white/90 dark:outline-slate-950 z-25 shadow-xs'
                                    : thermalOverlaySample?.isThermalAlert
                                    ? 'ring-1 ring-orange-400 dark:ring-orange-300 z-15'
                                    : isSecurityCorrelated
                                    ? 'ring-2 ring-amber-400 z-10'
                                    : isPinned
                                    ? 'ring-1 ring-sky-400 z-10'
                                    : activeHallBlastImpacted
                                    ? 'ring-1 ring-red-500/70'
                                    : 'opacity-95 hover:opacity-100 hover:ring-1 hover:ring-slate-900/60 dark:hover:ring-white/80 hover:z-20'
                                }`}
                              >
                                {/* Real-Time Rack-Front Server Inlet Thermal Gradient Overlay */}
                                {rackFrontGradient && (
                                  <>
                                    <span
                                      data-testid={`rack-front-gradient-${rack.id}`}
                                      aria-hidden="true"
                                      style={{ backgroundImage: rackFrontGradient.backgroundImage }}
                                      className="absolute inset-0 rounded-[3px] z-10 pointer-events-none transition-all duration-300"
                                    />
                                    <span
                                      data-testid={`rack-front-bezel-${rack.id}`}
                                      aria-hidden="true"
                                      style={{ backgroundColor: rackFrontGradient.frontEdgeColor }}
                                      className={`absolute left-0 right-0 h-[3.5px] z-15 pointer-events-none transition-colors duration-300 ${
                                        rackFrontGradient.frontFacing === 'south'
                                          ? 'bottom-0 rounded-b-[3px]'
                                          : 'top-0 rounded-t-[3px]'
                                      }`}
                                    />
                                  </>
                                )}
                                {hasLocateLed && (
                                  <span
                                    data-testid={`rack-locate-led-dot-${rack.id}`}
                                    aria-hidden="true"
                                    className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-blue-600 ring-1 ring-white dark:ring-slate-950 z-30 pointer-events-none"
                                  />
                                )}
                                {(isCapacityExceeded || isFailoverViolation) && (
                                  <span
                                    data-testid={`rack-overcap-badge-${rack.id}`}
                                    aria-hidden="true"
                                    className="absolute -top-1 -left-1 w-3 h-3 rounded-[2px] bg-red-600 text-white text-[8px] font-bold leading-none flex items-center justify-center ring-1 ring-white dark:ring-slate-950 z-30 pointer-events-none shadow-2xs"
                                  >
                                    !
                                  </span>
                                )}
                                {powerOverlayActive && (
                                  <span
                                    data-testid={`rack-power-label-${rack.id}`}
                                    className={`relative z-20 font-mono text-[9px] font-semibold leading-none tracking-tighter tabular-nums select-none pointer-events-none ${cellLabelColor}`}
                                  >
                                    {livePowerKw.toFixed(1)}
                                  </span>
                                )}
                                {thermalOverlaySample && (
                                  <>
                                    <span
                                      data-testid={`rack-thermal-label-${rack.id}`}
                                      data-thermal-band={thermalOverlaySample.band}
                                      className={`relative z-20 font-mono text-[9px] font-semibold leading-none tracking-tighter tabular-nums select-none pointer-events-none ${cellLabelColor}`}
                                    >
                                      {thermalOverlaySample.tempLabel}
                                    </span>
                                    <span
                                      data-testid={`rack-thermal-status-bar-${rack.id}`}
                                      aria-hidden="true"
                                      className={`absolute bottom-0 left-0 right-0 h-[2.5px] rounded-b-[2px] z-20 pointer-events-none ${thermalOverlaySample.statusBarClass}`}
                                    />
                                  </>
                                )}
                                {sensorHeatmapActive ? (
                                  sensor?.probeMountSlot && (
                                    <span
                                      className={`${
                                        hasNumericCellOverlay
                                          ? 'absolute top-0.5 right-0.5 w-1 h-1'
                                          : 'w-1.5 h-1.5'
                                      } rotate-45 bg-white ring-1 ring-sky-900/70 z-20 pointer-events-none`}
                                      aria-hidden="true"
                                    />
                                  )
                                ) : (
                                  hasLiveServers && (
                                    <span
                                      className={`${
                                        hasNumericCellOverlay
                                          ? 'absolute top-0.5 right-0.5 w-1 h-1'
                                          : 'w-1.5 h-1.5'
                                      } rounded-full bg-white ring-1 ring-slate-900/60 z-20 pointer-events-none`}
                                      aria-hidden="true"
                                    />
                                  )
                                )}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>

                  {/* Continuous Interpolated Thermal / Inlet / BMS Sensor / BMS Power / Delta Heatmap Overlay Canvas */}
                  {heatmapOverlayEnabled && (
                    <RackThermalHeatmapCanvas
                      rows={activeHallRows}
                      thermalStats={thermalStatsMap}
                      valuesByRackId={
                        isPowerLayerMode
                          ? powerValuesByRackId
                          : isInletFrontPrimaryMode
                          ? inletValuesByRackId
                          : horizonValuesByRackId
                      }
                      sourceMode={
                        isPowerLayerMode
                          ? 'power'
                          : isDeltaMode
                          ? 'delta'
                          : isInletFrontPrimaryMode
                          ? 'inlet'
                          : sensorHeatmapActive
                          ? 'bms-sensor'
                          : 'server'
                      }
                      rangeMinC={scaleBounds.minC}
                      rangeMaxC={scaleBounds.maxC}
                      opacity={
                        rackSearch.isActive
                          ? Math.min(heatmapOpacity, 0.2)
                          : isInletFrontPrimaryMode
                          ? Math.min(heatmapOpacity, 0.24)
                          : powerOverlayActive || thermalOverlayActive
                          ? Math.min(heatmapOpacity, 0.42)
                          : heatmapOpacity
                      }
                      hallAvgTempC={
                        isPowerLayerMode
                          ? activeHallStat.powerSummary.avgRackKw
                          : isDeltaMode
                          ? 0
                          : isInletFrontPrimaryMode
                          ? activeHallStat.inletSummary.avgInletTempC
                          : sensorHeatmapActive
                          ? activeHallStat.sensorSummary.avgTempC
                          : activeHallStat.thermalSummary.avgTempC
                      }
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Pin & Compare Cabinets Side-by-Side Tray */}
          {pinnedRackIds.length > 0 && (
            <div
              data-testid="rack-pin-compare-tray"
              className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                  <Pin className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
                  Pinned Cabinet Comparison ({pinnedRackIds.length}/4)
                </div>
                {onClearPinnedRacks && (
                  <button
                    type="button"
                    onClick={onClearPinnedRacks}
                    className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {pinnedRackIds.map((rid) => {
                  const rTherm = thermalStatsMap[rid];
                  const rSens = bmsSensorStatsMap[rid];
                  const rMet = rackMetricsMap[rid];
                  const deltaT = rTherm && rSens ? rTherm.avgTempC - rSens.sensorTempC : 0;
                  return (
                    <div
                      key={rid}
                      className="p-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-[#14181D] text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedRackId(rid)}
                          className="font-mono font-semibold text-slate-900 dark:text-slate-100 hover:underline cursor-pointer"
                        >
                          {rid}
                        </button>
                        {onTogglePinRack && (
                          <button
                            type="button"
                            onClick={() => onTogglePinRack(rid)}
                            aria-label={`Unpin ${rid}`}
                            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      <div className="space-y-1 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        <div className="flex items-center justify-between gap-2">
                          <span>Server Avg</span>
                          <strong className="text-slate-900 dark:text-slate-100">{(rTherm?.avgTempC ?? 0).toFixed(1)}°C</strong>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span>BMS Intake</span>
                          <strong className="text-sky-700 dark:text-sky-400">{(rSens?.sensorTempC ?? 0).toFixed(1)}°C</strong>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span>ΔT / Load</span>
                          <strong className="text-slate-900 dark:text-slate-100">
                            {deltaT.toFixed(1)}°C · {(rMet?.powerKw ?? 0).toFixed(1)} kW
                          </strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Right Column: Selected 42U Cabinet Telemetry & Mounted Chassis */}
        <aside
          aria-label="Selected 42U Cabinet Inspector"
          className="xl:col-span-4 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden"
        >
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-mono text-base font-semibold text-slate-900 dark:text-slate-50">
                  {focusedRack.id}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {focusedRack.hallName} · {focusedRack.row}
                </div>
              </div>
              <NodeStatusLabel
                status={
                  focusedPower?.exceedsCapacity || Boolean(focusedCapacityAlert)
                    ? 'critical'
                    : focusedMetrics?.status ?? 'nominal'
                }
              />
            </div>

            {/* Cabinet Quick Operational Actions: Pin Compare, Create Ticket, Launch MOP */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {onTogglePinRack && (
                <button
                  type="button"
                  data-testid="rack-pin-compare-btn"
                  onClick={() => onTogglePinRack(focusedRack.id)}
                  className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border transition-colors cursor-pointer whitespace-nowrap ${
                    pinnedRackIds.includes(focusedRack.id)
                      ? 'bg-[#009530] border-[#009530] text-white'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14181D] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Pin className="w-3 h-3" aria-hidden="true" />
                  {pinnedRackIds.includes(focusedRack.id) ? 'Pinned' : 'Pin Compare'}
                </button>
              )}
              {onCreateTicketForRack && (
                <button
                  type="button"
                  data-testid="rack-create-ticket-btn"
                  onClick={() =>
                    onCreateTicketForRack(
                      focusedRack.id,
                      `${focusedRack.id} Thermal / Sensor Inspection (Avg ${(focusedThermal?.avgTempC ?? 0).toFixed(1)}°C, BMS ${(focusedSensor?.sensorTempC ?? 0).toFixed(1)}°C)`,
                      focusedMetrics?.status === 'critical' ? 'critical' : 'warning'
                    )
                  }
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14181D] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                >
                  <Ticket className="w-3 h-3 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
                  Create Ticket
                </button>
              )}
              {onLaunchMopForRack && (
                <button
                  type="button"
                  data-testid="rack-launch-mop-btn"
                  onClick={() => onLaunchMopForRack(focusedRack.id)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14181D] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                >
                  <Wrench className="w-3 h-3 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  Launch MOP
                </button>
              )}
            </div>

            {/* Live BMS Environment Sensor Rack Telemetry (highlighted when Sensor Heatmap is active) */}
            {focusedSensor && sensorHeatmapActive && (
              <div
                data-testid="rack-inspector-bms-sensor"
                className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800"
              >
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-sky-700 dark:text-sky-400 font-medium">
                    BMS Environment Sensor
                  </span>
                  <span className={`font-mono tabular-nums ${sensorBandTextColorClass(focusedSensor.sensorBand)}`}>
                    {focusedSensor.sensorTempC.toFixed(1)}°C · {focusedSensor.sensorBand}
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-xs overflow-hidden">
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${Math.max(
                        8,
                        Math.round(
                          interpolateSensorThermalColor(
                            focusedSensor.sensorTempC,
                            16,
                            29
                          ).normalized * 100
                        )
                      )}%`,
                      backgroundColor: interpolateSensorThermalColor(
                        focusedSensor.sensorTempC,
                        16,
                        29
                      ).hex,
                    }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  <span>
                    RH {focusedSensor.humidityPct.toFixed(1)}% · Dew {focusedSensor.dewPointC.toFixed(1)}°C
                  </span>
                  <span>
                    {focusedSensor.nearestProbeId} ({focusedSensor.redundancyPath})
                  </span>
                </div>
              </div>
            )}

            {/* Rack Front Average Server Inlet Thermal Bar */}
            {focusedInlet && (
              <div
                data-testid="rack-inspector-inlet-temp"
                className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800"
              >
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-cyan-700 dark:text-cyan-400 font-medium">
                    Rack Front Avg Server Inlet
                  </span>
                  <span className={`font-mono tabular-nums ${sensorBandTextColorClass(focusedInlet.band)}`}>
                    {focusedInlet.avgInletTempC.toFixed(1)}°C · {focusedInlet.band}
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-xs overflow-hidden">
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${Math.max(
                        8,
                        Math.round(
                          interpolateInletThermalColor(
                            focusedInlet.avgInletTempC,
                            FIXED_INLET_MIN_C,
                            FIXED_INLET_MAX_C
                          ).normalized * 100
                        )
                      )}%`,
                      backgroundColor: interpolateInletThermalColor(
                        focusedInlet.avgInletTempC,
                        FIXED_INLET_MIN_C,
                        FIXED_INLET_MAX_C
                      ).hex,
                    }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  <span>
                    Inlet {focusedInlet.minInletTempC.toFixed(1)}–{focusedInlet.maxInletTempC.toFixed(1)}°C · ΔT{' '}
                    {focusedInlet.deltaTExhaustToInletC.toFixed(1)}°C
                  </span>
                  <span>
                    Front {focusedInlet.frontFacing === 'south' ? 'South ▼' : 'North ▲'}
                  </span>
                </div>
              </div>
            )}

            {/* Cabinet Average Server Temperature Thermal Bar */}
            {focusedThermal && (
              <div
                data-testid="rack-inspector-avg-temp"
                className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800"
              >
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Avg Server Temperature</span>
                  <span className={`font-mono tabular-nums ${bandTextColorClass(focusedThermal.band)}`}>
                    {focusedThermal.avgTempC.toFixed(1)}°C · {focusedThermal.band}
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-xs overflow-hidden">
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${Math.max(
                        8,
                        Math.round(
                          interpolateThermalColor(
                            focusedThermal.avgTempC,
                            35,
                            80
                          ).normalized * 100
                        )
                      )}%`,
                      backgroundColor: interpolateThermalColor(
                        focusedThermal.avgTempC,
                        35,
                        80
                      ).hex,
                    }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  <span>
                    Spread {focusedThermal.minTempC.toFixed(1)}–{focusedThermal.maxTempC.toFixed(1)}°C
                  </span>
                  <span>
                    {focusedThermal.serverCount}{' '}
                    {focusedThermal.hasLiveServers ? 'live hosts' : 'nodes'}
                  </span>
                </div>
              </div>
            )}

            {/* Real-Time BMS Cabinet Power Draw Bar */}
            <div
              data-testid="rack-inspector-bms-power"
              className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800"
            >
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-indigo-700 dark:text-indigo-400 font-medium">
                  BMS Real-Time Power Draw
                </span>
                <span
                  className={`font-mono tabular-nums ${
                    focusedPower
                      ? powerBandTextColorClass(focusedPower.powerBand)
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {(focusedPower?.powerKw ?? focusedMetrics?.powerKw ?? focusedRack.basePowerKw).toFixed(2)} kW /{' '}
                  {focusedRack.powerCapacityKw} kW ({focusedPower?.utilizationPct ?? focusedMetrics?.utilizationPct ?? 45}%)
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-xs overflow-hidden">
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${Math.max(
                      6,
                      Math.min(100, focusedPower?.utilizationPct ?? focusedMetrics?.utilizationPct ?? 45)
                    )}%`,
                    backgroundColor: interpolatePowerColor(
                      focusedPower?.powerKw ?? focusedMetrics?.powerKw ?? focusedRack.basePowerKw,
                      0,
                      focusedRack.powerCapacityKw
                    ).hex,
                  }}
                />
              </div>
              {focusedPower && (
                <div className="mt-1 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  <span>
                    {focusedPower.apparentKva.toFixed(2)} kVA · PF {focusedPower.powerFactor.toFixed(2)}
                  </span>
                  <span>{focusedPower.feedStatus}</span>
                </div>
              )}
              {(focusedPower?.exceedsCapacity || focusedCapacityAlert) && (
                <div
                  data-testid="rack-inspector-capacity-alert"
                  role="alert"
                  className="mt-2.5 px-2.5 py-2 rounded-sm border border-red-300 dark:border-red-900/70 bg-red-50 dark:bg-red-950/35 text-xs text-red-900 dark:text-red-200 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-red-700 dark:text-red-400">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      Critical Power Capacity
                    </span>
                    <span className="font-mono text-[11px] tabular-nums font-semibold text-red-700 dark:text-red-400">
                      +{focusedPower ? focusedPower.overCapacityKw.toFixed(2) : '0.00'} kW over
                    </span>
                  </div>
                  <p className="text-[11px] text-red-800/90 dark:text-red-300/90">
                    Real-time load exceeds effective {focusedPower ? focusedPower.effectiveLimitKw.toFixed(1) : focusedRack.powerCapacityKw} kW limit
                    {focusedPower && focusedPower.thresholdPct !== 100 ? ` (${focusedPower.thresholdPct}% hall policy)` : ''}
                    {focusedCapacityAlert ? ` · Alert ${focusedCapacityAlert.state}` : ''}.
                  </p>
                  {onOpenAlerts && (
                    <button
                      type="button"
                      onClick={onOpenAlerts}
                      className="text-[11px] font-medium text-red-700 dark:text-red-300 hover:underline cursor-pointer"
                    >
                      Inspect in Alerts &amp; Incidents →
                    </button>
                  )}
                </div>
              )}

              {focusedThermalAlert && (
                <div
                  data-testid="rack-inspector-thermal-alert"
                  role="alert"
                  className={`mt-2.5 px-2.5 py-2 rounded-sm border text-xs space-y-1 ${
                    focusedThermalAlert.severity === 'critical'
                      ? 'border-red-300 dark:border-red-900/70 bg-red-50 dark:bg-red-950/35 text-red-900 dark:text-red-200'
                      : 'border-amber-300 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/35 text-amber-900 dark:text-amber-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 font-semibold ${
                        focusedThermalAlert.severity === 'critical'
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      <Thermometer className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      Rack Thermal Sensor Violation
                    </span>
                    <span
                      className={`font-mono text-[11px] tabular-nums font-semibold ${
                        focusedThermalAlert.severity === 'critical'
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {focusedThermalAlert.currentValue.toFixed(1)}°C avg (&ge; {focusedThermalAlert.threshold.toFixed(0)}°C)
                    </span>
                  </div>
                  <p
                    className={`text-[11px] ${
                      focusedThermalAlert.severity === 'critical'
                        ? 'text-red-800/90 dark:text-red-300/90'
                        : 'text-amber-800/90 dark:text-amber-300/90'
                    }`}
                  >
                    {focusedThermalAlert.message} · Alert {focusedThermalAlert.state}.
                  </p>
                  {onOpenAlerts && (
                    <button
                      type="button"
                      onClick={onOpenAlerts}
                      className={`text-[11px] font-medium hover:underline cursor-pointer ${
                        focusedThermalAlert.severity === 'critical'
                          ? 'text-red-700 dark:text-red-300'
                          : 'text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      Inspect in Alerts &amp; Incidents →
                    </button>
                  )}
                </div>
              )}

              {/* Over-Capacity Rebalance Advisor */}
              {focusedRebalancePlan && focusedRebalancePlan.candidates.length > 0 && (
                <div
                  data-testid="rack-rebalance-advisor"
                  className="mt-2.5 p-2.5 rounded-sm border border-[#009530]/35 dark:border-[#3DCD58]/35 bg-emerald-50/60 dark:bg-emerald-950/20 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[#007A27] dark:text-[#3DCD58]">
                      <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      Load Rebalance Advisor
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-slate-600 dark:text-slate-400">
                      Shift {focusedRebalancePlan.recommendedShiftKw.toFixed(2)} kW → {focusedRebalancePlan.sourceProjectedUtilPct}%
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {focusedRebalancePlan.candidates.map((cand) => (
                      <div
                        key={cand.targetRackId}
                        className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-white dark:bg-[#14181D] border border-slate-200 dark:border-slate-800 text-[11px]"
                      >
                        <div className="min-w-0">
                          <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                            {cand.targetRackId}
                            <span className="ml-1.5 font-normal text-slate-500 dark:text-slate-400">
                              {cand.row}
                            </span>
                          </div>
                          <div className="font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                            {cand.currentKw.toFixed(1)} → {cand.projectedKw.toFixed(1)} kW ({cand.projectedUtilPct}%)
                          </div>
                        </div>
                        {onRebalanceRack && (
                          <button
                            type="button"
                            data-testid={`rack-rebalance-execute-${cand.targetRackId}`}
                            onClick={() =>
                              handleExecuteRebalance(
                                focusedRebalancePlan.sourceRackId,
                                cand.targetRackId,
                                cand.shiftKw
                              )
                            }
                            className="px-2 py-1 text-[11px] font-medium rounded-sm bg-[#009530] hover:bg-[#007A27] text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                          >
                            Rebalance
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {rebalanceFeedback && (
                <div
                  role="status"
                  data-testid="rack-rebalance-feedback"
                  className="mt-2 px-2.5 py-1.5 rounded-sm border border-[#009530]/40 bg-[#009530]/10 text-[11px] font-medium text-[#007A27] dark:text-[#3DCD58]"
                >
                  {rebalanceFeedback}
                </div>
              )}
            </div>

            {/* 4-Cell Cabinet Specs with Tier IV 2N Feeds & Cold Aisle SLA Sensor */}
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs pt-3 border-t border-slate-100 dark:border-slate-800">
              <div>
                <dt className="text-slate-500 dark:text-slate-400">2N Feed A ({focusedRack.pduAName})</dt>
                <dd className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {(
                    focusedPower?.feedAKw ??
                    (focusedMetrics?.powerKw ?? focusedRack.basePowerKw) * 0.51
                  ).toFixed(2)}{' '}
                  kW
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">2N Feed B ({focusedRack.pduBName})</dt>
                <dd className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {(
                    focusedPower?.feedBKw ??
                    (focusedMetrics?.powerKw ?? focusedRack.basePowerKw) * 0.49
                  ).toFixed(2)}{' '}
                  kW
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">
                  Cold Aisle SLA ({linkedEnv?.slaProbeAId ?? 'SLA'})
                </dt>
                <dd
                  className={`mt-0.5 font-mono font-semibold tabular-nums ${
                    linkedEnv?.tempSlaStatus === 'Breached' || linkedEnv?.humiditySlaStatus === 'Breached'
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-[#009530] dark:text-[#3DCD58]'
                  }`}
                >
                  {(linkedEnv?.coldAisleTempC ?? linkedCrac?.supplyTempC ?? focusedRack.ambientTempC).toFixed(1)}°C ·{' '}
                  {(linkedEnv?.humidityPct ?? 46).toFixed(0)}% RH
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Peak Exhaust / U-Space</dt>
                <dd
                  className={`mt-0.5 font-mono font-semibold tabular-nums ${
                    (focusedMetrics?.peakTempC ?? 0) >= 78
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {(focusedMetrics?.peakTempC ?? focusedRack.basePeakTempC).toFixed(1)}°C · {focusedUsedU}U/42U
                </dd>
              </div>
              <div className="col-span-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 dark:text-slate-400">
                  2N Cooling Loops ({linkedEnv?.chilledLoopStatus ?? 'Loop A + B Active'})
                </span>
                <span className="font-mono font-medium text-[#009530] dark:text-[#3DCD58]">
                  {linkedEnv?.tempSlaStatus === 'Breached' || linkedEnv?.humiditySlaStatus === 'Breached'
                    ? 'SLA Breached'
                    : `SLA ${linkedEnv?.slaCompliancePct.toFixed(2) ?? '99.99'}%`}
                </span>
              </div>
            </dl>

            {/* Focused Cabinet Failover Stress Audit Readout */}
            {activeFailoverMode !== 'none' && focusedFailoverAudit && (
              <div
                data-testid="rack-inspector-failover-audit"
                className={`mt-3 p-2.5 rounded-sm border text-xs space-y-1 ${
                  focusedFailoverAudit.overallVerdict === 'violation'
                    ? 'border-red-300 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/35 text-red-950 dark:text-red-200'
                    : focusedFailoverAudit.overallVerdict === 'at_risk'
                    ? 'border-amber-300 dark:border-amber-900/70 bg-amber-50/80 dark:bg-amber-950/30 text-amber-950 dark:text-amber-200'
                    : 'border-emerald-300 dark:border-emerald-900/70 bg-emerald-50/70 dark:bg-emerald-950/25 text-emerald-950 dark:text-emerald-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">Failover Stress Verdict</span>
                  <span className="font-mono text-[11px] uppercase font-bold">
                    {focusedFailoverAudit.overallVerdict.replace('_', ' ')}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono tabular-nums pt-0.5">
                  <span>Feed B Load: {focusedFailoverAudit.survivingFeedLoadPct.toFixed(0)}%</span>
                  <span>
                    ASHRAE A1:{' '}
                    {focusedFailoverAudit.minutesToAshraeBreach !== null
                      ? `${focusedFailoverAudit.minutesToAshraeBreach.toFixed(1)} min`
                      : 'Nominal'}
                  </span>
                </div>
              </div>
            )}

            {/* Per-Cabinet 24h Power (kW) & BMS Intake (°C) Sparklines */}
            {focusedPower && (
              <CabinetSparklinesCard
                rack={focusedRack}
                powerStat={focusedPower}
                sensorStat={focusedSensor}
              />
            )}

            {/* 24-Port Feed A / Feed B rPDU Outlet Metering & Guarded Remote Switching */}
            <RackRpduOutletPanel
              rack={focusedRack}
              servers={servers}
              powerStat={focusedPower}
              overrides={rpduOverrides}
              onUpdateOverrides={setRpduOverrides}
              onLogAudit={onLogAudit}
            />
          </div>

          {/* Mounted 42U Chassis List + Interactive MAC Elevation Editor */}
          <div className="p-4 bg-slate-50/50 dark:bg-slate-950/40 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  42U Cabinet Elevation
                </span>
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {focusedServers.length > 0
                    ? `${focusedServers.length} Live Hosts`
                    : `${focusedMetrics?.serverCount ?? 12} Standard Blades`}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {focusedServers.length > 0 && (
                  <button
                    type="button"
                    data-testid="rack-print-qr-sheet-btn"
                    onClick={handlePrintRackQrSheet}
                    title={`Download printable SVG QR label sheet for all ${focusedServers.length} servers in ${focusedRack.id}`}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Printer className="w-3 h-3" aria-hidden="true" />
                    Print QR Sheet
                  </button>
                )}
                {(onMoveServerInRack || onDeployServerInRack || onAddRackReservation) && (
                  <button
                    type="button"
                    data-testid="rack-edit-mac-btn"
                    aria-pressed={macEditMode}
                    onClick={() => {
                      setMacEditMode((prev) => !prev);
                      setMacFeedback(null);
                      setDeployFormOpen(false);
                      setReserveFormOpen(false);
                      setConfirmDecomId(null);
                    }}
                    className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border transition-colors cursor-pointer ${
                      macEditMode
                        ? 'bg-[#009530] border-[#009530] text-white'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <MoveVertical className="w-3 h-3" aria-hidden="true" />
                    {macEditMode ? 'Done MACs' : 'Edit 42U MACs'}
                  </button>
                )}
              </div>
            </div>

            {/* Compact 42U Elevation Occupancy Map */}
            {(focusedServers.length > 0 || focusedReservations.length > 0) && (
              <div
                data-testid="rack-42u-slot-bar"
                title="42U vertical rack occupancy: Emerald = live hosts, Amber = reserved U-space, Slate = open U"
                className="flex items-center gap-0.5 h-2 w-full rounded-xs overflow-hidden bg-slate-200 dark:bg-slate-800"
              >
                {focusedSlotSegments.map((seg, idx) => (
                  <div
                    key={`${seg.kind}-${seg.uStart}-${idx}`}
                    style={{ width: `${(seg.uHeight / focusedRack.totalU) * 100}%` }}
                    title={
                      seg.kind === 'server' && seg.server
                        ? `U${seg.uStart}–U${seg.uEnd}: ${seg.server.hostname}`
                        : seg.kind === 'reservation' && seg.reservation
                        ? `U${seg.uStart}–U${seg.uEnd}: Reserved (${seg.reservation.label})`
                        : `U${seg.uStart}–U${seg.uEnd}: Open (${seg.uHeight}U)`
                    }
                    className={`h-full ${
                      seg.kind === 'server'
                        ? seg.server?.status === 'critical'
                          ? 'bg-red-600'
                          : seg.server?.status === 'warning'
                          ? 'bg-amber-500'
                          : 'bg-[#009530] dark:bg-[#3DCD58]'
                        : seg.kind === 'reservation'
                        ? 'bg-indigo-500'
                        : 'bg-slate-200 dark:bg-slate-800'
                    }`}
                  />
                ))}
              </div>
            )}

            {macEditMode && (
              <div
                data-testid="rack-mac-metrics-bar"
                className="p-2.5 rounded-md border border-[#009530]/35 bg-white dark:bg-[#1B2026] text-[11px] font-mono tabular-nums space-y-2"
              >
                <div className="flex items-center justify-between gap-2 text-slate-700 dark:text-slate-200">
                  <span>
                    Weight:{' '}
                    <strong className={focusedElevationMetrics.estimatedWeightKg > focusedElevationMetrics.weightLimitKg ? 'text-red-600' : 'text-slate-900 dark:text-white'}>
                      {focusedElevationMetrics.estimatedWeightKg} / {focusedElevationMetrics.weightLimitKg} kg
                    </strong>
                  </span>
                  <span>
                    2N Balance:{' '}
                    <strong className={focusedElevationMetrics.feedImbalancePct > 15 ? 'text-amber-600' : 'text-[#007A27] dark:text-[#3DCD58]'}>
                      A {focusedElevationMetrics.feedAKw}kW / B {focusedElevationMetrics.feedBKw}kW ({focusedElevationMetrics.feedImbalancePct}%)
                    </strong>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 font-sans">
                  {onDeployServerInRack && (
                    <button
                      type="button"
                      data-testid="mac-toggle-deploy-btn"
                      onClick={handleOpenDeployForm}
                      className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border cursor-pointer transition-colors ${
                        deployFormOpen
                          ? 'bg-[#009530] border-[#009530] text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Plus className="w-3 h-3" aria-hidden="true" />
                      Deploy Server
                    </button>
                  )}
                  {onAddRackReservation && (
                    <button
                      type="button"
                      data-testid="mac-toggle-reserve-btn"
                      onClick={() => {
                        const openU = findFirstOpenUSlot(focusedRack, focusedServers, focusedReservations, 4) ?? 35;
                        setReserveUStart(String(openU));
                        setDeployFormOpen(false);
                        setReserveFormOpen((prev) => !prev);
                      }}
                      className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border cursor-pointer transition-colors ${
                        reserveFormOpen
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Bookmark className="w-3 h-3" aria-hidden="true" />
                      Reserve U-Space
                    </button>
                  )}
                </div>

                {/* Inline Deploy Server Form */}
                {deployFormOpen && onDeployServerInRack && (
                  <form
                    data-testid="mac-deploy-form"
                    onSubmit={handleDeploySubmit}
                    className="p-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#14181D] space-y-2 font-sans"
                  >
                    <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                      Deploy New Chassis into {focusedRack.id}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        required
                        aria-label="New server hostname"
                        data-testid="mac-deploy-hostname-input"
                        value={deployHostname}
                        onChange={(e) => setDeployHostname(e.target.value)}
                        placeholder="Hostname"
                        className="col-span-2 px-2 py-1 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      />
                      <select
                        aria-label="New server role"
                        data-testid="mac-deploy-role-select"
                        value={deployRole}
                        onChange={(e) => {
                          const nextRole = e.target.value as ServerRole;
                          setDeployRole(nextRole);
                          const def = getRoleDeploymentDefaults(nextRole);
                          setDeployModel(def.model);
                          setDeployUHeight(String(def.uHeight));
                          setDeployRatedW(String(def.ratedPowerW));
                          const openU = findFirstOpenUSlot(focusedRack, focusedServers, focusedReservations, def.uHeight);
                          if (openU !== null) setDeployUStart(String(openU));
                        }}
                        className="px-1.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      >
                        <option value="Compute">Compute</option>
                        <option value="GPU Inference">GPU Inference</option>
                        <option value="NVMe Storage">NVMe Storage</option>
                        <option value="Network Spine">Network Spine</option>
                        <option value="Hypervisor">Hypervisor</option>
                      </select>
                      <input
                        type="number"
                        min={150}
                        max={12000}
                        step={50}
                        aria-label="Rated power watts"
                        value={deployRatedW}
                        onChange={(e) => setDeployRatedW(e.target.value)}
                        className="px-2 py-1 text-xs font-mono tabular-nums rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        placeholder="Rated W"
                      />
                      <label className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400">
                        Start U
                        <input
                          type="number"
                          min={1}
                          max={focusedRack.totalU}
                          data-testid="mac-deploy-ustart-input"
                          value={deployUStart}
                          onChange={(e) => setDeployUStart(e.target.value)}
                          className="w-14 px-1.5 py-0.5 text-xs font-mono tabular-nums rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400">
                        Height U
                        <input
                          type="number"
                          min={1}
                          max={12}
                          value={deployUHeight}
                          onChange={(e) => setDeployUHeight(e.target.value)}
                          className="w-12 px-1.5 py-0.5 text-xs font-mono tabular-nums rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        />
                      </label>
                    </div>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDeployFormOpen(false)}
                        className="px-2 py-1 text-[11px] rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        data-testid="mac-deploy-submit-btn"
                        className="px-2.5 py-1 text-[11px] font-medium rounded bg-[#009530] hover:bg-[#007A27] text-white cursor-pointer"
                      >
                        Confirm Deploy
                      </button>
                    </div>
                  </form>
                )}

                {/* Inline Reserve U-Space Form */}
                {reserveFormOpen && onAddRackReservation && (
                  <form
                    data-testid="mac-reserve-form"
                    onSubmit={handleReserveSubmit}
                    className="p-2 rounded border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2 font-sans"
                  >
                    <div className="text-[11px] font-semibold text-indigo-900 dark:text-indigo-200">
                      Reserve U-Space Block in {focusedRack.id}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        required
                        aria-label="Reservation label"
                        data-testid="mac-reserve-label-input"
                        value={reserveLabel}
                        onChange={(e) => setReserveLabel(e.target.value)}
                        placeholder="Reservation label"
                        className="col-span-2 px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      />
                      <label className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400">
                        Start U
                        <input
                          type="number"
                          min={1}
                          max={focusedRack.totalU}
                          value={reserveUStart}
                          onChange={(e) => setReserveUStart(e.target.value)}
                          className="w-14 px-1.5 py-0.5 text-xs font-mono tabular-nums rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400">
                        Height U
                        <input
                          type="number"
                          min={1}
                          max={12}
                          value={reserveUHeight}
                          onChange={(e) => setReserveUHeight(e.target.value)}
                          className="w-12 px-1.5 py-0.5 text-xs font-mono tabular-nums rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        />
                      </label>
                    </div>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setReserveFormOpen(false)}
                        className="px-2 py-1 text-[11px] rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        data-testid="mac-reserve-submit-btn"
                        className="px-2.5 py-1 text-[11px] font-medium rounded bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                      >
                        Reserve Slots
                      </button>
                    </div>
                  </form>
                )}

                {macFeedback && (
                  <div
                    role="status"
                    data-testid="rack-mac-feedback"
                    className={`px-2 py-1 rounded text-[11px] font-sans font-medium ${
                      macFeedback.ok
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                    }`}
                  >
                    {macFeedback.text}
                  </div>
                )}
              </div>
            )}

            {/* Active Reserved U-Space Rows */}
            {focusedReservations.length > 0 && (
              <div className="space-y-1.5">
                {focusedReservations.map((res) => (
                  <div
                    key={res.id}
                    data-testid={`rack-reservation-row-${res.id}`}
                    className="px-2.5 py-1.5 rounded-md border border-dashed border-indigo-300 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/25 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 tabular-nums">
                        U{res.uStart}–U{res.uStart + res.uHeight - 1} ({res.uHeight}U)
                      </span>
                      <span className="ml-2 text-slate-800 dark:text-slate-200 font-medium truncate">
                        {res.label}
                      </span>
                    </div>
                    {onRemoveRackReservation && (
                      <button
                        type="button"
                        onClick={() => onRemoveRackReservation(res.id)}
                        className="text-[11px] text-indigo-700 dark:text-indigo-300 hover:underline cursor-pointer shrink-0"
                      >
                        Release
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {focusedServers.length > 0 ? (
              focusedServers.map((srv) => {
                const srvHeat = interpolateThermalColor(srv.tempC, 35, 80);
                const srvInletColor = interpolateInletThermalColor(
                  srv.inletTempC,
                  FIXED_INLET_MIN_C,
                  FIXED_INLET_MAX_C
                );
                const draftU = macTargetU[srv.id] ?? String(srv.uStart);
                const draftRack = macTargetRack[srv.id] ?? focusedRack.id;
                const isLocateActive = locateLedServerSet.has(srv.id);
                return (
                  <div
                    key={srv.id}
                    draggable={macEditMode}
                    onDragStart={() => setDragServerId(srv.id)}
                    onDragOver={(e) => {
                      if (macEditMode) e.preventDefault();
                    }}
                    onDrop={() => {
                      if (macEditMode && dragServerId && dragServerId !== srv.id) {
                        const dragged = focusedServers.find((s) => s.id === dragServerId);
                        if (dragged) {
                          handleApplyServerMove(dragged.id, dragged.hostname, srv.uStart);
                        }
                      }
                      setDragServerId(null);
                    }}
                    style={{ borderLeftColor: isLocateActive ? '#2563EB' : srvInletColor.hex, borderLeftWidth: '3px' }}
                    className={`w-full text-left px-3 py-2.5 rounded-md border transition-colors space-y-1.5 ${
                      isLocateActive
                        ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800'
                        : srv.status === 'critical'
                        ? 'bg-red-50/70 dark:bg-red-950/30 border-red-200 dark:border-red-900/60'
                        : srv.status === 'warning'
                        ? 'bg-amber-50/70 dark:bg-amber-950/25 border-amber-200 dark:border-amber-900/60'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onInspectServer(srv.id)}
                        aria-label={`Inspect ${srv.hostname} in ${focusedRack.id}`}
                        className="min-w-0 text-left flex-1 cursor-pointer group"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                            U{srv.uStart} ({srv.uHeight}U)
                          </span>
                          <span className="font-mono text-xs font-medium text-slate-900 dark:text-slate-100 group-hover:text-[#007A27] dark:group-hover:text-[#3DCD58] truncate">
                            {srv.hostname}
                          </span>
                          {isLocateActive && (
                            <span
                              data-testid={`rack-server-locate-badge-${srv.id}`}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-xs bg-blue-600 text-white text-[10px] font-semibold shrink-0"
                            >
                              <Lightbulb className="w-2.5 h-2.5" aria-hidden="true" />
                              LED
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                          {srv.role} · Inlet {srv.inletTempC.toFixed(1)}°C · {srv.powerW}W
                        </div>
                      </button>
                      <div className="text-right shrink-0">
                        <div
                          className={`font-mono text-xs tabular-nums ${
                            srv.tempC >= 78
                              ? 'text-red-700 dark:text-red-400 font-semibold'
                              : srv.tempC >= 68
                              ? 'text-amber-700 dark:text-amber-400 font-medium'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {srv.tempC.toFixed(1)}°C
                        </div>
                        <NodeStatusLabel status={srv.status} />
                      </div>
                    </div>

                    {macEditMode && onMoveServerInRack && (
                      <div className="pt-1.5 border-t border-slate-200/70 dark:border-slate-800 space-y-1.5 text-[11px]">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              data-testid={`mac-up-${srv.id}`}
                              onClick={() => handleApplyServerMove(srv.id, srv.hostname, srv.uStart + 1)}
                              aria-label={`Move ${srv.hostname} up 1U`}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                            >
                              <ArrowUp className="w-3 h-3" aria-hidden="true" />
                              +1U
                            </button>
                            <button
                              type="button"
                              data-testid={`mac-down-${srv.id}`}
                              onClick={() => handleApplyServerMove(srv.id, srv.hostname, srv.uStart - 1)}
                              aria-label={`Move ${srv.hostname} down 1U`}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                            >
                              <ArrowDown className="w-3 h-3" aria-hidden="true" />
                              -1U
                            </button>
                          </div>
                          <div className="inline-flex items-center gap-1">
                            {onMoveServerAcrossRacks && (
                              <select
                                aria-label={`Target cabinet for ${srv.hostname}`}
                                value={draftRack}
                                onChange={(e) =>
                                  setMacTargetRack((prev) => ({ ...prev, [srv.id]: e.target.value }))
                                }
                                className="px-1 py-0.5 text-[11px] font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                              >
                                {sameHallMoveTargets.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.id}
                                  </option>
                                ))}
                              </select>
                            )}
                            <label htmlFor={`mac-u-${srv.id}`} className="text-slate-500 dark:text-slate-400">
                              U:
                            </label>
                            <input
                              id={`mac-u-${srv.id}`}
                              type="number"
                              min={1}
                              max={focusedRack.totalU}
                              value={draftU}
                              onChange={(e) =>
                                setMacTargetU((prev) => ({ ...prev, [srv.id]: e.target.value }))
                              }
                              className="w-11 px-1 py-0.5 text-xs font-mono tabular-nums rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                handleApplyServerMove(srv.id, srv.hostname, Number(draftU), draftRack)
                              }
                              className="px-2 py-0.5 rounded bg-[#009530] hover:bg-[#007A27] text-white font-medium cursor-pointer"
                            >
                              Move
                            </button>
                          </div>
                        </div>

                        {onDecommissionServer && (
                          <div className="flex items-center justify-end gap-1.5">
                            {confirmDecomId === srv.id ? (
                              <>
                                <span className="text-[10px] text-red-700 dark:text-red-400 font-medium">
                                  Decommission {srv.hostname}?
                                </span>
                                <button
                                  type="button"
                                  data-testid={`mac-decom-confirm-${srv.id}`}
                                  onClick={() => {
                                    const res = onDecommissionServer(srv.id);
                                    if (res.ok) {
                                      setMacFeedback({ ok: true, text: `Decommissioned ${srv.hostname} from ${focusedRack.id}.` });
                                    } else {
                                      setMacFeedback({ ok: false, text: res.error ?? 'Decommission failed.' });
                                    }
                                    setConfirmDecomId(null);
                                  }}
                                  className="px-2 py-0.5 rounded bg-red-600 hover:bg-red-700 text-white font-medium cursor-pointer"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDecomId(null)}
                                  className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                data-testid={`mac-decom-${srv.id}`}
                                onClick={() => setConfirmDecomId(srv.id)}
                                className="inline-flex items-center gap-1 text-[10px] font-medium text-red-700 dark:text-red-400 hover:underline cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" aria-hidden="true" />
                                Decommission
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="h-1 w-full bg-slate-100 dark:bg-slate-800 rounded-xs overflow-hidden">
                      <div
                        className="h-full"
                        style={{
                          width: `${Math.max(10, Math.round(srvHeat.normalized * 100))}%`,
                          backgroundColor: srvHeat.hex,
                        }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="space-y-2">
                <div className="px-3 py-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between text-xs">
                  <span className="font-mono text-slate-700 dark:text-slate-300">U41–U42 · Top-of-Rack Leaf Pair</span>
                  <span className="font-mono text-[11px] text-[#009530] dark:text-[#3DCD58]">100GbE</span>
                </div>
                <div className="px-3 py-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between text-xs">
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    U12–U38 · {focusedMetrics?.serverCount ?? 12}× Production Nodes
                  </span>
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {(focusedMetrics?.powerKw ?? focusedRack.basePowerKw).toFixed(1)} kW
                  </span>
                </div>
                <div className="px-3 py-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between text-xs">
                  <span className="font-mono text-slate-700 dark:text-slate-300">U01–U04 · Dual Metered rPDU</span>
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">2N Active</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                  Click &ldquo;Edit 42U MACs&rdquo; above to deploy live hosts or reserve U-space blocks in this cabinet.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* 24-Hour Rack Utilization Trends & Capacity Growth Summary Panel (D3 Line Charts) */}
      <RackUtilizationTrendsPanel
        trends={utilizationTrends24h}
        onSelectHall={handleSelectHall}
      />
    </div>
  );
}


import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  LayoutGrid,
  Power,
  RotateCcw,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import { BmsState } from '../engine/bmsTypes';
import {
  ASHRAE_A1_MAX_INLET_C,
  computeFailoverStressAudit,
  FailoverStressMode,
} from '../engine/failoverStressEngine';
import { resolveSldBlastHighlight, SldBlastHighlight } from '../engine/opsEnhancementsEngine';
import {
  buildPowerChainSnapshot,
  PowerChainNode,
  PowerFaultInjection,
} from '../engine/powerChainEngine';
import { INITIAL_RACKS } from '../engine/seedData';
import { SITE_META_MAP, SiteId } from '../engine/sites';
import { HallPowerPolicyMap, RackDefinition, ServerNode } from '../engine/types';

interface PowerChainSldViewProps {
  activeSiteId: SiteId;
  bms: BmsState;
  servers: ServerNode[];
  racks?: RackDefinition[];
  rackPowerAdjustmentsKw?: Record<string, number>;
  hallPowerPolicies?: HallPowerPolicyMap;
  failoverMode?: FailoverStressMode;
  onSetFailoverMode?: (mode: FailoverStressMode) => void;
  onOpenFailoverOnRackMap?: (mode: FailoverStressMode) => void;
  onLogAudit: (category: 'Power / SLD', action: string, target: string) => void;
  onHighlightBlastOnRackMap?: (highlight: SldBlastHighlight) => void;
}

const NODE_COORDS: Record<string, { x: number; y: number; w: number; h: number }> = {
  'util-a': { x: 24, y: 24, w: 148, h: 64 },
  'gen-bank-a': { x: 24, y: 112, w: 148, h: 64 },
  'ats-a': { x: 214, y: 68, w: 136, h: 64 },
  'ups-bank-a': { x: 392, y: 68, w: 144, h: 64 },
  'pdu-a': { x: 578, y: 68, w: 136, h: 64 },
  'busway-a': { x: 756, y: 68, w: 136, h: 64 },

  'util-b': { x: 24, y: 224, w: 148, h: 64 },
  'gen-bank-b': { x: 24, y: 312, w: 148, h: 64 },
  'ats-b': { x: 214, y: 268, w: 136, h: 64 },
  'ups-bank-b': { x: 392, y: 268, w: 144, h: 64 },
  'pdu-b': { x: 578, y: 268, w: 136, h: 64 },
  'busway-b': { x: 756, y: 268, w: 136, h: 64 },

  'rpdu-hall-a': { x: 944, y: 22, w: 156, h: 72 },
  'rpdu-hall-b': { x: 944, y: 114, w: 156, h: 72 },
  'rpdu-hall-c': { x: 944, y: 206, w: 156, h: 72 },
  'rpdu-hall-d': { x: 944, y: 298, w: 156, h: 72 },
};

function stateStroke(state: PowerChainNode['state']): string {
  switch (state) {
    case 'energized':
      return '#009530';
    case 'standby':
      return '#64748b';
    case 'bypass':
    case 'degraded':
      return '#d97706';
    case 'tripped':
    case 'de_energized':
      return '#dc2626';
  }
}

function stateBadgeText(state: PowerChainNode['state']): string {
  switch (state) {
    case 'energized':
      return 'ENERGIZED';
    case 'standby':
      return 'STANDBY';
    case 'bypass':
      return 'STATIC BYPASS';
    case 'degraded':
      return 'SINGLE FEED';
    case 'tripped':
      return 'BREAKER OPEN';
    case 'de_energized':
      return 'DE-ENERGIZED';
  }
}

export function PowerChainSldView({
  activeSiteId,
  bms,
  servers,
  racks = INITIAL_RACKS,
  rackPowerAdjustmentsKw,
  hallPowerPolicies,
  failoverMode = 'none',
  onSetFailoverMode,
  onOpenFailoverOnRackMap,
  onLogAudit,
  onHighlightBlastOnRackMap,
}: PowerChainSldViewProps) {
  const [faults, setFaults] = useState<PowerFaultInjection>({
    trippedNodeIds: [],
    bypassUpsIds: [],
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string>('ups-bank-a');

  const snapshot = useMemo(
    () =>
      buildPowerChainSnapshot({
        siteId: activeSiteId,
        bms,
        servers,
        faults,
        selectedNodeId,
      }),
    [activeSiteId, bms, servers, faults, selectedNodeId]
  );

  const selectedNode = useMemo(
    () => snapshot.nodes.find((n) => n.id === selectedNodeId) ?? snapshot.nodes[0],
    [snapshot.nodes, selectedNodeId]
  );

  const blastSet = useMemo(() => {
    const s = new Set<string>();
    if (snapshot.blastRadius) {
      for (const id of snapshot.blastRadius.affectedDownstreamIds) s.add(id);
      for (const id of snapshot.blastRadius.affectedUpstreamIds) s.add(id);
    }
    return s;
  }, [snapshot.blastRadius]);

  const toggleBreakerTrip = (node: PowerChainNode) => {
    setFaults((prev) => {
      const exists = prev.trippedNodeIds.includes(node.id);
      const nextTripped = exists
        ? prev.trippedNodeIds.filter((id) => id !== node.id)
        : [...prev.trippedNodeIds, node.id];
      onLogAudit(
        'Power / SLD',
        exists ? `Closed breaker & restored ${node.shortCode}` : `Simulated breaker trip (OPEN) on ${node.shortCode}`,
        node.shortCode
      );
      return { ...prev, trippedNodeIds: nextTripped };
    });
  };

  const toggleUpsBypass = (node: PowerChainNode) => {
    if (node.tier !== 'ups') return;
    setFaults((prev) => {
      const exists = prev.bypassUpsIds.includes(node.id);
      const nextBypass = exists
        ? prev.bypassUpsIds.filter((id) => id !== node.id)
        : [...prev.bypassUpsIds, node.id];
      onLogAudit(
        'Power / SLD',
        exists ? `Returned ${node.shortCode} to Double-Conversion Online` : `Placed ${node.shortCode} onto Static Maintenance Bypass`,
        node.shortCode
      );
      return { ...prev, bypassUpsIds: nextBypass };
    });
  };

  const handleResetAll = () => {
    setFaults({ trippedNodeIds: [], bypassUpsIds: [] });
    onSetFailoverMode?.('none');
    onLogAudit('Power / SLD', 'Cleared all SLD breaker trips & bypass simulations', `${SITE_META_MAP[activeSiteId].code}-SLD`);
  };

  const failoverAudit = useMemo(() => {
    const effectiveMode: FailoverStressMode =
      failoverMode !== 'none'
        ? failoverMode
        : faults.trippedNodeIds.some((id) => id.endsWith('-a'))
        ? 'feed_a_loss'
        : 'feed_a_loss';
    return computeFailoverStressAudit({
      racks,
      bms,
      servers,
      mode: effectiveMode,
      rackPowerAdjustmentsKw,
      hallPowerPolicies,
    });
  }, [racks, bms, servers, failoverMode, faults.trippedNodeIds, rackPowerAdjustmentsKw, hallPowerPolicies]);

  const handleSimulateFeedALoss = () => {
    const feedAActive = faults.trippedNodeIds.includes('util-a') || failoverMode === 'feed_a_loss' || failoverMode === 'combined';
    if (feedAActive) {
      setFaults((prev) => ({
        ...prev,
        trippedNodeIds: prev.trippedNodeIds.filter((id) => id !== 'util-a' && id !== 'ups-bank-a'),
      }));
      onSetFailoverMode?.('none');
      onLogAudit('Power / SLD', 'Restored Feed A utility & UPS-A bus from 2N stress test', `${SITE_META_MAP[activeSiteId].code}-FEED-A`);
    } else {
      setFaults((prev) => ({
        ...prev,
        trippedNodeIds: Array.from(new Set([...prev.trippedNodeIds, 'util-a', 'ups-bank-a'])),
      }));
      setSelectedNodeId('ups-bank-a');
      onSetFailoverMode?.('feed_a_loss');
      onLogAudit(
        'Power / SLD',
        `Executed 2N Feed A Loss stress test (${failoverAudit.powerViolationCount} racks exceed 50% surviving Feed B budget)`,
        `${SITE_META_MAP[activeSiteId].code}-FEED-A`
      );
    }
  };

  const phaseRows = snapshot.nodes.filter((n) => n.phaseBalance);

  return (
    <div className="space-y-5 pb-16" data-testid="power-chain-sld-view">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Interactive Power Chain &amp; Single Line Diagram (SLD)
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            End-to-end 2N electrical path from Utility → Generators → ATS → UPS → PDU → Busway → Rack PDU with blast-radius &amp; L1/L2/L3 phase tracing
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="sld-feed-a-stress-btn"
            onClick={handleSimulateFeedALoss}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
              faults.trippedNodeIds.includes('util-a') || failoverMode === 'feed_a_loss' || failoverMode === 'combined'
                ? 'border-red-600 bg-red-600 text-white hover:bg-red-700'
                : 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/60'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
            {faults.trippedNodeIds.includes('util-a') || failoverMode === 'feed_a_loss' || failoverMode === 'combined'
              ? 'Restore Feed A (2N)'
              : 'Simulate Feed A Loss (2N Audit)'}
          </button>
          {onOpenFailoverOnRackMap && (
            <button
              type="button"
              data-testid="sld-open-failover-map-btn"
              onClick={() => onOpenFailoverOnRackMap(failoverMode === 'none' ? 'feed_a_loss' : failoverMode)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-[#007A27] dark:text-[#3DCD58]" aria-hidden="true" />
              Stress Map ({failoverAudit.powerViolationCount} Overload)
            </button>
          )}
          {(faults.trippedNodeIds.length > 0 || faults.bypassUpsIds.length > 0) && (
            <button
              type="button"
              data-testid="sld-reset-faults-btn"
              onClick={handleResetAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Restore All Breakers ({faults.trippedNodeIds.length + faults.bypassUpsIds.length})
            </button>
          )}
        </div>
      </div>

      {/* Live 2N Surviving Feed B & ASHRAE Thermal Hold-Time Strip */}
      <div
        data-testid="sld-failover-audit-strip"
        className={`px-4 py-2.5 rounded-md border flex flex-wrap items-center justify-between gap-2 text-xs ${
          failoverAudit.powerViolationCount > 0
            ? 'border-amber-300 dark:border-amber-800/70 bg-amber-50/80 dark:bg-amber-950/30 text-amber-950 dark:text-amber-200'
            : 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/25 text-emerald-900 dark:text-emerald-200'
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold">
            2N Single-Feed Survivability Audit ({SITE_META_MAP[activeSiteId].code}):
          </span>
          <span className="font-mono tabular-nums">
            <strong className={failoverAudit.powerViolationCount > 0 ? 'text-red-700 dark:text-red-400' : ''}>
              {failoverAudit.powerViolationCount}
            </strong>{' '}
            racks &gt;50% rated kW (Feed B trip risk)
          </span>
          <span className="text-slate-400" aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            Peak Feed B Load: <strong>{failoverAudit.worstPowerFeedBPct.toFixed(0)}%</strong>
            {failoverAudit.worstPowerRackId ? ` (${failoverAudit.worstPowerRackId})` : ''}
          </span>
          <span className="text-slate-400" aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            N+1 CRAC Loss Margin to {ASHRAE_A1_MAX_INLET_C.toFixed(0)}°C:{' '}
            <strong>
              {failoverAudit.shortestMinutesToBreach !== null
                ? `${failoverAudit.shortestMinutesToBreach.toFixed(1)} min`
                : 'Within ASHRAE A1'}
            </strong>
          </span>
        </div>
      </div>

      {/* 4-Column Live Electrical KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Critical Power Chain Load</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {(snapshot.totalFacilityLoadKw / 1000).toFixed(2)} MW
          </div>
          <div className="mt-0.5 text-xs font-mono text-slate-500 dark:text-slate-400">
            {snapshot.totalFacilityLoadKw.toLocaleString()} kW · {snapshot.siteCode} 2N Active
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">2N Feed A vs Feed B Balance</div>
          <div className="mt-1.5 flex items-baseline flex-wrap gap-x-2 gap-y-0.5 font-mono text-base font-semibold tabular-nums">
            <span className="text-[#007A27] dark:text-[#3DCD58] whitespace-nowrap">
              A: {(snapshot.feedALoadKw / 1000).toFixed(2)} MW
            </span>
            <span className="text-slate-400">/</span>
            <span className="text-sky-600 dark:text-sky-400 whitespace-nowrap">
              B: {(snapshot.feedBLoadKw / 1000).toFixed(2)} MW
            </span>
          </div>
          <div className="mt-1 text-xs font-mono text-slate-500 dark:text-slate-400">
            Imbalance Δ {snapshot.feedBalanceDeltaPct.toFixed(1)}%
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Site 3-Phase Balance (415V L1/L2/L3)</div>
          <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {snapshot.sitePhaseBalance.imbalancePct.toFixed(1)}% Skew
          </div>
          <div className="mt-0.5 text-xs font-mono text-slate-500 dark:text-slate-400">
            N-Current {snapshot.sitePhaseBalance.neutralAmps.toLocaleString()} A · Target &lt; 5.0%
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Blast-Radius Redundancy Verdict</div>
          <div
            data-testid="sld-redundancy-verdict"
            className={`mt-1 text-lg font-semibold ${
              snapshot.blastRadius?.redundantSurvived === false
                ? 'text-red-600 dark:text-red-400'
                : 'text-[#007A27] dark:text-[#3DCD58]'
            }`}
          >
            {snapshot.blastRadius?.redundantSurvived === false ? 'Outage Exposure Detected' : '2N Fault-Tolerant'}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Click any breaker/UPS node to trace or trip
          </div>
        </div>
      </section>

      {/* Interactive SVG Single Line Diagram */}
      <section className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Zap className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
            {snapshot.siteCode} End-to-End 2N Single Line Diagram (Click Any Node to Inspect or Trip)
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#009530]" /> Feed A Energized
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-sky-600" /> Feed B Energized
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" /> Bypass / Single Feed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-red-600" /> Tripped / De-Energized
            </span>
          </div>
        </div>

        <div className="p-3 overflow-x-auto bg-slate-50/70 dark:bg-[#13171B]">
          <svg
            viewBox="0 0 1120 398"
            className="w-full min-w-[920px] h-auto select-none"
            role="img"
            aria-label="Interactive Single Line Diagram from Utility to Rack PDUs"
          >
            {/* Tier Headers */}
            {[
              { x: 98, label: 'UTILITY / GENS' },
              { x: 282, label: 'MV ATS / STS' },
              { x: 464, label: '2N UPS BANKS' },
              { x: 646, label: 'FLOOR PDUs' },
              { x: 824, label: 'BUSWAYS' },
              { x: 1022, label: 'HALL RACK PDUs' },
            ].map((hdr) => (
              <text
                key={hdr.label}
                x={hdr.x}
                y={13}
                textAnchor="middle"
                className="fill-slate-400 dark:fill-slate-500 font-mono text-[9.5px] font-semibold"
              >
                {hdr.label}
              </text>
            ))}

            {/* Edges */}
            {snapshot.edges.map((edge) => {
              const from = NODE_COORDS[edge.fromId];
              const to = NODE_COORDS[edge.toId];
              if (!from || !to) return null;
              const x1 = from.x + from.w;
              const y1 = from.y + from.h / 2;
              const x2 = to.x;
              const y2 = to.y + to.h / 2;
              const midX = (x1 + x2) / 2;
              const isHighlighted =
                edge.fromId === selectedNodeId ||
                edge.toId === selectedNodeId ||
                (blastSet.has(edge.fromId) && blastSet.has(edge.toId));
              const strokeColor = !edge.energized
                ? '#dc2626'
                : edge.feed === 'A'
                ? '#009530'
                : '#0284c7';

              return (
                <path
                  key={edge.id}
                  d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isHighlighted ? 2.8 : 1.7}
                  strokeOpacity={edge.energized ? (isHighlighted ? 0.95 : 0.65) : 0.45}
                  strokeDasharray={!edge.energized || edge.redundantBackup ? '5 4' : undefined}
                />
              );
            })}

            {/* Interactive Equipment Nodes */}
            {snapshot.nodes.map((node) => {
              const box = NODE_COORDS[node.id];
              if (!box) return null;
              const isSelected = node.id === selectedNodeId;
              const inBlast = blastSet.has(node.id);
              const stroke = stateStroke(node.state);

              return (
                <g
                  key={node.id}
                  data-testid={`sld-node-${node.id}`}
                  onClick={() => setSelectedNodeId(node.id)}
                  className="cursor-pointer"
                >
                  <rect
                    x={box.x}
                    y={box.y}
                    width={box.w}
                    height={box.h}
                    rx={5}
                    className="fill-white dark:fill-[#1B2026]"
                    stroke={isSelected ? '#3DCD58' : stroke}
                    strokeWidth={isSelected ? 2.6 : inBlast ? 2 : 1.4}
                  />
                  {/* Top status bar */}
                  <rect
                    x={box.x}
                    y={box.y}
                    width={box.w}
                    height={5}
                    rx={2}
                    fill={stroke}
                  />
                  <text
                    x={box.x + 10}
                    y={box.y + 22}
                    className="fill-slate-900 dark:fill-slate-100 font-mono text-[11px] font-bold"
                  >
                    {node.shortCode}
                  </text>
                  <text
                    x={box.x + box.w - 10}
                    y={box.y + 22}
                    textAnchor="end"
                    fill={stroke}
                    className="font-mono text-[8.5px] font-semibold"
                  >
                    {stateBadgeText(node.state)}
                  </text>
                  <text
                    x={box.x + 10}
                    y={box.y + 39}
                    className="fill-slate-600 dark:fill-slate-400 font-mono text-[10px]"
                  >
                    {(node.loadKw / 1000).toFixed(2)} MW ({node.loadPct}%)
                  </text>
                  <text
                    x={box.x + 10}
                    y={box.y + 54}
                    className="fill-slate-400 dark:fill-slate-500 font-mono text-[9.5px]"
                  >
                    {node.voltageKv >= 1 ? `${node.voltageKv} kV` : `${Math.round(node.voltageKv * 1000)} V`} · Feed {node.feed}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </section>

      {/* Bottom Split: Selected Node Blast Radius Controls + L1/L2/L3 Phase Balancing Table */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Selected Breaker / Blast Radius Inspector */}
        {selectedNode && (
          <section
            data-testid="sld-inspector-panel"
            className="xl:col-span-5 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-4 space-y-4"
          >
            <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="text-[11px] font-mono text-[#007A27] dark:text-[#3DCD58]">
                  {selectedNode.shortCode} · {selectedNode.tier.toUpperCase()} · FEED {selectedNode.feed}
                </div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                  {selectedNode.label}
                </h2>
              </div>
              <span
                className="text-xs font-mono font-semibold"
                style={{ color: stateStroke(selectedNode.state) }}
              >
                {stateBadgeText(selectedNode.state)}
              </span>
            </div>

            {/* Interactive Breaker / Bypass Simulator Controls */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="sld-trip-breaker-btn"
                onClick={() => toggleBreakerTrip(selectedNode)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  selectedNode.breakerClosed
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-[#009530] hover:bg-[#007A27] text-white'
                }`}
              >
                <Power className="w-3.5 h-3.5" aria-hidden="true" />
                {selectedNode.breakerClosed ? 'Simulate Breaker Trip (OPEN)' : 'Close Breaker & Restore'}
              </button>

              {selectedNode.tier === 'ups' && (
                <button
                  type="button"
                  data-testid="sld-bypass-ups-btn"
                  onClick={() => toggleUpsBypass(selectedNode)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-amber-500/50 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 cursor-pointer"
                >
                  <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                  {selectedNode.bypassActive ? 'Exit Static Bypass' : 'Put UPS on Static Bypass'}
                </button>
              )}
            </div>

            {/* Blast Radius Assessment */}
            {snapshot.blastRadius && (
              <div
                data-testid="sld-blast-radius-summary"
                className={`p-3 rounded-md border text-xs space-y-1.5 ${
                  snapshot.blastRadius.redundantSurvived
                    ? 'border-[#009530]/30 bg-[#009530]/[0.05] text-slate-800 dark:text-slate-200'
                    : 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  {snapshot.blastRadius.redundantSurvived ? (
                    <CheckCircle2 className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400" aria-hidden="true" />
                  )}
                  Blast-Radius Trace Analysis
                </div>
                <p className="leading-relaxed">{snapshot.blastRadius.summary}</p>
                <div className="pt-1 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] tabular-nums opacity-90">
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <span>Upstream: {snapshot.blastRadius.affectedUpstreamIds.length} nodes</span>
                    <span>Downstream: {snapshot.blastRadius.affectedDownstreamIds.length} nodes</span>
                    <span>Racks in Path: {snapshot.blastRadius.impactedRackCount}</span>
                  </div>
                  {onHighlightBlastOnRackMap && (
                    <button
                      type="button"
                      data-testid="sld-highlight-rack-map-btn"
                      onClick={() => onHighlightBlastOnRackMap(resolveSldBlastHighlight(selectedNode))}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-sans font-semibold rounded border border-current/30 bg-white/80 dark:bg-slate-900/70 hover:bg-white dark:hover:bg-slate-900 cursor-pointer whitespace-nowrap"
                    >
                      <LayoutGrid className="w-3 h-3" aria-hidden="true" />
                      Highlight Impacted Racks on Map
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* L1 / L2 / L3 Three-Phase Balancing Table */}
        <section className="xl:col-span-7 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Activity className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
              L1 / L2 / L3 Three-Phase Current Balancing (415V Distribution)
            </div>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">IEEE Std 1159 &lt; 5% Skew</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pl-4 pr-3 font-semibold">Distribution Node</th>
                  <th className="py-2.5 px-3 font-semibold text-right">L1 (A)</th>
                  <th className="py-2.5 px-3 font-semibold text-right">L2 (A)</th>
                  <th className="py-2.5 px-3 font-semibold text-right">L3 (A)</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Neutral (A)</th>
                  <th className="py-2.5 pl-3 pr-4 font-semibold text-right">Imbalance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono tabular-nums">
                {phaseRows.map((n) => {
                  const pb = n.phaseBalance!;
                  return (
                    <tr
                      key={n.id}
                      onClick={() => setSelectedNodeId(n.id)}
                      className={`cursor-pointer transition-colors ${
                        n.id === selectedNodeId
                          ? 'bg-[#009530]/[0.06] dark:bg-[#3DCD58]/[0.08]'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2.5 pl-4 pr-3 font-sans font-medium text-slate-900 dark:text-slate-100">
                        {n.shortCode} <span className="text-slate-500 dark:text-slate-400 font-normal">· {n.label}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-800 dark:text-slate-200">{pb.l1Amps.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right text-slate-800 dark:text-slate-200">{pb.l2Amps.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right text-slate-800 dark:text-slate-200">{pb.l3Amps.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-400">{pb.neutralAmps.toLocaleString()}</td>
                      <td
                        className={`py-2.5 pl-3 pr-4 text-right font-semibold ${
                          pb.imbalancePct > 5
                            ? 'text-red-600 dark:text-red-400'
                            : pb.imbalancePct > 3.5
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-[#007A27] dark:text-[#3DCD58]'
                        }`}
                      >
                        {pb.imbalancePct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Cable,
  Network,
  Plus,
  Scissors,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  CableCircuit,
  CableMediaType,
  CableTraySegment,
  computeHopOpticalDom,
  createInitialCableTrays,
  createInitialCircuits,
  evaluateCircuitFailureImpact,
  NewCrossConnectDraft,
  provisionCrossConnect,
  validateCrossConnectDraft,
} from '../engine/physicalLayerEngine';
import { SITE_META_MAP, SiteId } from '../engine/sites';
import { ServerNode } from '../engine/types';

interface CableConnectivityViewProps {
  activeSiteId: SiteId;
  servers?: ServerNode[];
  onLogAudit: (category: 'Capacity', action: string, target: string) => void;
}

export function CableConnectivityView({
  activeSiteId,
  servers = [],
  onLogAudit,
}: CableConnectivityViewProps) {
  const [circuitsBySite, setCircuitsBySite] = useState<Record<SiteId, CableCircuit[]>>(() => {
    const now = Date.now();
    return {
      kl1: createInitialCircuits('kl1', now),
      kl2: createInitialCircuits('kl2', now),
      kl3: createInitialCircuits('kl3', now),
    };
  });

  const [traysBySite, setTraysBySite] = useState<Record<SiteId, CableTraySegment[]>>(() => ({
    kl1: createInitialCableTrays('kl1'),
    kl2: createInitialCableTrays('kl2'),
    kl3: createInitialCableTrays('kl3'),
  }));

  const circuits = circuitsBySite[activeSiteId];
  const trays = traysBySite[activeSiteId];
  const siteCode = SITE_META_MAP[activeSiteId].code;

  const [selectedId, setSelectedId] = useState<string>(circuits[0]?.id ?? '');
  const [selectedHopIndex, setSelectedHopIndex] = useState<number>(1);
  const [simulateCutActive, setSimulateCutActive] = useState<boolean>(false);
  const [cleanedNotice, setCleanedNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<NewCrossConnectDraft>({
    siteId: activeSiteId,
    customerOrService: '',
    carrierName: '',
    mediaType: 'SMF OS2 Fiber',
    bandwidthGbps: 400,
    mmrCage: 'MMR-A · Cage 04',
    aEnd: `${siteCode}-MMR-ODF-01 / Port 28`,
    zEnd: `${siteCode}-HALL-D-R08 / TOR-D08:et-0/0/4`,
    trayId: trays[0]?.id ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setSelectedId(circuitsBySite[activeSiteId][0]?.id ?? '');
    setSelectedHopIndex(1);
    setSimulateCutActive(false);
    setCleanedNotice(null);
  }, [activeSiteId, circuitsBySite]);

  const filteredCircuits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return circuits;
    return circuits.filter(
      (c) =>
        c.circuitCode.toLowerCase().includes(q) ||
        c.customerOrService.toLowerCase().includes(q) ||
        c.carrierName.toLowerCase().includes(q) ||
        c.aEnd.toLowerCase().includes(q) ||
        c.zEnd.toLowerCase().includes(q)
    );
  }, [circuits, search]);

  const selectedCircuit =
    filteredCircuits.find((c) => c.id === selectedId) ?? filteredCircuits[0] ?? null;

  const serverHostnamesByRack = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const s of servers) {
      if (!map[s.rackId]) map[s.rackId] = [];
      map[s.rackId].push(s.hostname);
    }
    return map;
  }, [servers]);

  const activeHop = useMemo(() => {
    if (!selectedCircuit) return null;
    return (
      selectedCircuit.hops.find((h) => h.hopIndex === selectedHopIndex) ??
      selectedCircuit.hops[0] ??
      null
    );
  }, [selectedCircuit, selectedHopIndex]);

  const activeHopDom = useMemo(() => {
    if (!selectedCircuit || !activeHop) return null;
    return computeHopOpticalDom(selectedCircuit, activeHop);
  }, [selectedCircuit, activeHop]);

  const failureImpact = useMemo(() => {
    if (!selectedCircuit) return null;
    return evaluateCircuitFailureImpact({
      circuit: selectedCircuit,
      allCircuits: circuits,
      serverHostnamesByRack,
      cutHopIndex: simulateCutActive ? activeHop?.hopIndex ?? 1 : null,
    });
  }, [selectedCircuit, circuits, serverHostnamesByRack, simulateCutActive, activeHop]);

  const handleOpticalCleanDispatch = () => {
    if (!selectedCircuit || !activeHop) return;
    setCircuitsBySite((prev) => ({
      ...prev,
      [activeSiteId]: prev[activeSiteId].map((c) => {
        if (c.id !== selectedCircuit.id) return c;
        const nextHops = c.hops.map((h) =>
          h.hopIndex === activeHop.hopIndex && h.lossDb !== undefined
            ? { ...h, lossDb: Number(Math.min(h.lossDb, 0.14).toFixed(2)) }
            : h
        );
        const totalLoss = nextHops.reduce((sum, h) => sum + (h.lossDb ?? 0), 0);
        return {
          ...c,
          status: 'Active',
          opticalLossDb: c.opticalLossDb !== null ? Number(totalLoss.toFixed(2)) : null,
          hops: nextHops,
        };
      }),
    }));
    const msg = `Logged optical ferrule cleaning on ${selectedCircuit.circuitCode} Hop ${activeHop.hopIndex} (${activeHop.device} ${activeHop.port}).`;
    setCleanedNotice(msg);
    onLogAudit('Capacity', msg, selectedCircuit.circuitCode);
  };

  const openModal = () => {
    setDraft({
      siteId: activeSiteId,
      customerOrService: '',
      carrierName: '',
      mediaType: 'SMF OS2 Fiber',
      bandwidthGbps: 400,
      mmrCage: 'MMR-A · Cage 04',
      aEnd: `${siteCode}-MMR-ODF-01 / Port 28`,
      zEnd: `${siteCode}-HALL-D-R08 / TOR-D08:et-0/0/4`,
      trayId: trays[0]?.id ?? '',
    });
    setErrors({});
    setModalOpen(true);
  };

  const handleProvision = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateCrossConnectDraft(draft);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    const res = provisionCrossConnect(circuits, trays, draft, Date.now());
    setCircuitsBySite((prev) => ({ ...prev, [activeSiteId]: res.circuits }));
    setTraysBySite((prev) => ({ ...prev, [activeSiteId]: res.trays }));
    setSelectedId(res.created.id);
    setModalOpen(false);
    onLogAudit(
      'Capacity',
      `Provisioned MMR Cross-Connect ${res.created.circuitCode} (${res.created.bandwidthGbps}G ${res.created.mediaType})`,
      res.created.circuitCode
    );
  };

  const maxTrayFill = Math.max(...trays.map((t) => t.fillRatioPct));
  const degradedCount = circuits.filter((c) => c.status === 'Degraded').length;

  return (
    <div className="space-y-5 pb-16" data-testid="cable-connectivity-view">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Physical Layer — Cable, Patch Panel &amp; MMR Connectivity
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            End-to-end port-to-port copper &amp; optical fiber tracing, Meet-Me Room (MMR) cross-connects, and cable tray fill ratios
          </p>
        </div>

        <button
          type="button"
          data-testid="provision-xc-btn"
          onClick={openModal}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white cursor-pointer whitespace-nowrap self-start xl:self-auto"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          Provision Cross-Connect (MAC)
        </button>
      </div>

      {/* 4-Column KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Active Cross-Connects ({siteCode})</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {circuits.length}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">MMR &amp; Spine Fiber/Copper Trunks</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Provisioned Bandwidth</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#007A27] dark:text-[#3DCD58]">
            {circuits.reduce((s, c) => s + c.bandwidthGbps, 0).toLocaleString()} Gbps
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">10G–400G OS2 / OM4 / Cat6A</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Peak Cable Tray Fill Ratio</div>
          <div
            className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${
              maxTrayFill >= 50 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-900 dark:text-slate-50'
            }`}
          >
            {maxTrayFill.toFixed(1)}%
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">TIA-569 / NEC 50% fill ceiling</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Optical Loss Alerts</div>
          <div
            className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${
              degradedCount > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-[#007A27] dark:text-[#3DCD58]'
            }`}
          >
            {degradedCount}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Circuits exceeding 0.75 dB loss</div>
        </div>
      </section>

      {/* Master-Detail: Cross-Connect Registry + Port-to-Port Hop Tracer */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <section className="xl:col-span-7 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Cable className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
              MMR Cross-Connect &amp; Patch Registry ({filteredCircuits.length})
            </div>
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search circuit, carrier, port..."
                className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#111418] text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pl-4 pr-3 font-semibold">Circuit &amp; Service</th>
                  <th className="py-2.5 px-3 font-semibold">Media / Speed</th>
                  <th className="py-2.5 px-3 font-semibold">MMR / Cage</th>
                  <th className="py-2.5 pl-3 pr-4 font-semibold text-right">Status / Loss</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredCircuits.map((c) => {
                  const selected = selectedCircuit?.id === c.id;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => {
                        setSelectedId(c.id);
                        setSelectedHopIndex(1);
                        setCleanedNotice(null);
                      }}
                      className={`cursor-pointer transition-colors ${
                        selected
                          ? 'bg-[#009530]/[0.06] dark:bg-[#3DCD58]/[0.09]'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2.5 pl-4 pr-3">
                        <div className="font-mono text-[11px] font-semibold text-[#007A27] dark:text-[#3DCD58]">
                          {c.circuitCode}
                        </div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">{c.customerOrService}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{c.carrierName}</div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px]">
                        <div className="text-slate-900 dark:text-slate-100 font-semibold">{c.bandwidthGbps} Gbps</div>
                        <div className="text-slate-500 dark:text-slate-400">{c.mediaType}</div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-700 dark:text-slate-300">
                        {c.mmrCage}
                      </td>
                      <td className="py-2.5 pl-3 pr-4 text-right whitespace-nowrap font-mono text-[11px]">
                        <div
                          className={
                            c.status === 'Active'
                              ? 'text-[#007A27] dark:text-[#3DCD58] font-semibold'
                              : 'text-amber-700 dark:text-amber-400 font-semibold'
                          }
                        >
                          {c.status}
                        </div>
                        <div className="text-slate-500 dark:text-slate-400">
                          {c.opticalLossDb !== null ? `${c.opticalLossDb.toFixed(2)} dB · ${c.lengthMeters}m` : `${c.lengthMeters}m Cu`}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Port-to-Port Trace Inspector */}
        {selectedCircuit && (
          <section
            data-testid="circuit-trace-panel"
            className="xl:col-span-5 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-4 space-y-4"
          >
            <div className="pb-3 border-b border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-2 font-mono text-xs">
                <span className="font-semibold text-[#007A27] dark:text-[#3DCD58]">{selectedCircuit.circuitCode}</span>
                <span className="text-slate-500 dark:text-slate-400">
                  {selectedCircuit.bandwidthGbps}G · {selectedCircuit.mediaType}
                </span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                    {selectedCircuit.customerOrService}
                  </h2>
                  <div className="mt-0.5 text-xs font-mono text-slate-500 dark:text-slate-400">
                    A: {selectedCircuit.aEnd} → Z: {selectedCircuit.zEnd}
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="simulate-link-cut-btn"
                  onClick={() => setSimulateCutActive((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    simulateCutActive
                      ? 'border-rose-500 bg-rose-600 text-white hover:bg-rose-700'
                      : 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/50'
                  }`}
                >
                  <Scissors className="w-3.5 h-3.5" aria-hidden="true" />
                  {simulateCutActive ? 'Clear Cut Sim' : 'Simulate Link Cut'}
                </button>
              </div>
            </div>

            {/* Interactive Clickable Hops */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <Network className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
                  Port-to-Port Patch Path ({selectedCircuit.hops.length} Hops)
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Click hop for Optical DOM
                </span>
              </div>
              <div className="space-y-1.5">
                {selectedCircuit.hops.map((hop, idx) => {
                  const isHopSelected = activeHop?.hopIndex === hop.hopIndex;
                  const isCutTarget = simulateCutActive && isHopSelected;
                  return (
                    <div key={hop.hopIndex}>
                      <button
                        type="button"
                        data-testid={`circuit-hop-btn-${hop.hopIndex}`}
                        onClick={() => setSelectedHopIndex(hop.hopIndex)}
                        className={`w-full text-left p-2.5 rounded border flex items-center justify-between gap-2 text-xs cursor-pointer transition-colors ${
                          isCutTarget
                            ? 'border-rose-500 bg-rose-50/80 dark:bg-rose-950/40'
                            : isHopSelected
                            ? 'border-[#009530] dark:border-[#3DCD58] bg-[#009530]/[0.06] dark:bg-[#3DCD58]/[0.1]'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#14181D] hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-mono text-[11px] font-semibold text-slate-900 dark:text-slate-100 truncate">
                            Hop {hop.hopIndex}: {hop.device} ·{' '}
                            <span className="text-[#007A27] dark:text-[#3DCD58]">{hop.port}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {hop.location} · {hop.media}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isCutTarget && (
                            <span className="font-mono text-[10px] font-bold uppercase text-rose-600 dark:text-rose-400 whitespace-nowrap">
                              [CUT]
                            </span>
                          )}
                          {hop.lossDb !== undefined && (
                            <span
                              className={`font-mono text-[11px] font-semibold whitespace-nowrap ${
                                hop.lossDb >= 0.4
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              -{hop.lossDb.toFixed(2)} dB
                            </span>
                          )}
                        </div>
                      </button>
                      {idx < selectedCircuit.hops.length - 1 && (
                        <div className="pl-4 py-0.5 text-slate-400">
                          <ArrowRight className="w-3 h-3 rotate-90" aria-hidden="true" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Live Optical Transceiver DOM Telemetry Card */}
            {activeHop && activeHopDom && (
              <div
                data-testid="optical-dom-card"
                className="rounded-md border border-slate-200 dark:border-slate-700/80 bg-slate-50/80 dark:bg-[#14181D] p-3 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                    <Activity className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    Optical DOM · Hop {activeHop.hopIndex} ({activeHopDom.opticsModule})
                  </div>
                  <span
                    className={`font-mono text-[11px] font-bold ${
                      activeHopDom.domStatus === 'Nominal'
                        ? 'text-[#007A27] dark:text-[#3DCD58]'
                        : activeHopDom.domStatus === 'Marginal'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {activeHopDom.domStatus}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono tabular-nums">
                  <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500">Tx Power</div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {activeHopDom.txPowerDbm.toFixed(2)} dBm
                    </div>
                  </div>
                  <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500">Rx Power</div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {activeHopDom.rxPowerDbm.toFixed(2)} dBm
                    </div>
                  </div>
                  <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500">Optics Temp</div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {activeHopDom.transceiverTempC.toFixed(1)}°C
                    </div>
                  </div>
                  <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500">Loss Budget</div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {activeHopDom.attenuationBudgetPct.toFixed(1)}%
                    </div>
                  </div>
                </div>
                {activeHopDom.domStatus !== 'Nominal' && (
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] text-amber-700 dark:text-amber-300">
                      Elevated insertion loss — connector cleaning advised.
                    </span>
                    <button
                      type="button"
                      data-testid="clean-optical-ferrule-btn"
                      onClick={handleOpticalCleanDispatch}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium whitespace-nowrap cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" aria-hidden="true" />
                      Log Optical Clean
                    </button>
                  </div>
                )}
                {cleanedNotice && (
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                    {cleanedNotice}
                  </div>
                )}
              </div>
            )}

            {/* Single-Link Blast Radius & Redundancy Simulator */}
            {simulateCutActive && failureImpact && (
              <div
                data-testid="link-cut-blast-radius-panel"
                className={`rounded-md border p-3 space-y-2 text-xs ${
                  failureImpact.redundancyStatus === '2N Diverse Failover'
                    ? 'border-emerald-300 dark:border-emerald-700/60 bg-emerald-50/70 dark:bg-emerald-950/30'
                    : 'border-rose-300 dark:border-rose-700/60 bg-rose-50/70 dark:bg-rose-950/30'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold">
                    {failureImpact.redundancyStatus === '2N Diverse Failover' ? (
                      <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    )}
                    <span
                      className={
                        failureImpact.redundancyStatus === '2N Diverse Failover'
                          ? 'text-emerald-900 dark:text-emerald-200'
                          : 'text-rose-900 dark:text-rose-200'
                      }
                    >
                      Blast Radius: {failureImpact.redundancyStatus}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200">
                    -{failureImpact.bandwidthLostGbps} Gbps
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Affected Racks: </span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {failureImpact.affectedRacks.join(', ')}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Failover: </span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {failureImpact.backupCircuitCode
                        ? `${failureImpact.backupCircuitCode} (~${failureImpact.estimatedFailoverMs}ms)`
                        : 'NONE (Hard Outage)'}
                    </span>
                  </div>
                </div>
                <div className="text-[11px] font-mono text-slate-700 dark:text-slate-300">
                  Impacted Nodes: {failureImpact.affectedServers.slice(0, 4).join(', ')}
                  {failureImpact.affectedServers.length > 4
                    ? ` +${failureImpact.affectedServers.length - 4} more`
                    : ''}
                </div>
                <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                  {failureImpact.recommendedAction}
                </p>
              </div>
            )}
          </section>
        )}
      </div>

      {/* Cable Tray Fill Ratios */}
      <section className="bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Overhead Basket &amp; Conduit Cable Tray Fill Ratios ({siteCode})
          </h2>
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
            TIA-569 Max Recommended Fill: 50%
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          {trays.map((t) => {
            const isHigh = t.fillRatioPct >= t.necWarningThresholdPct;
            return (
              <div
                key={t.id}
                className="p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#14181D] space-y-2"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-[11px] font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {t.name.split(' ')[0]}
                  </span>
                  <span
                    className={`font-mono text-xs font-bold ${
                      isHigh ? 'text-amber-600 dark:text-amber-400' : 'text-[#007A27] dark:text-[#3DCD58]'
                    }`}
                  >
                    {t.fillRatioPct.toFixed(1)}%
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{t.zone}</div>
                <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full ${isHigh ? 'bg-amber-500' : 'bg-[#009530]'}`}
                    style={{ width: `${Math.min(100, t.fillRatioPct)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  <span>{t.installedCables}/{t.capacityCables} cables</span>
                  <span>{t.level}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Provision Cross-Connect Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-label="Provision new MMR cross-connect"
            className="w-full max-w-lg bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-700 rounded-md shadow-xl overflow-hidden"
          >
            <div className="px-4 py-3 bg-[#1D2126] text-white flex items-center justify-between">
              <span className="text-sm font-semibold">Provision New Cross-Connect ({siteCode})</span>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1 text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleProvision} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Customer / Service Name *</label>
                <input
                  type="text"
                  value={draft.customerOrService}
                  onChange={(e) => setDraft((d) => ({ ...d, customerOrService: e.target.value }))}
                  placeholder="e.g. Cloud Direct Connect Redundant 400G"
                  className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100"
                />
                {errors.customerOrService && <p className="mt-0.5 text-red-600">{errors.customerOrService}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Carrier / Fabric *</label>
                  <input
                    type="text"
                    value={draft.carrierName}
                    onChange={(e) => setDraft((d) => ({ ...d, carrierName: e.target.value }))}
                    placeholder="e.g. TIME dotCom"
                    className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100"
                  />
                  {errors.carrierName && <p className="mt-0.5 text-red-600">{errors.carrierName}</p>}
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Media Type</label>
                  <select
                    value={draft.mediaType}
                    onChange={(e) => setDraft((d) => ({ ...d, mediaType: e.target.value as CableMediaType }))}
                    className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100"
                  >
                    <option value="SMF OS2 Fiber">SMF OS2 Fiber</option>
                    <option value="MMF OM4 Fiber">MMF OM4 Fiber</option>
                    <option value="Cat6A Copper">Cat6A Copper</option>
                    <option value="DAC 400G Twinax">DAC 400G Twinax</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">A-End Port *</label>
                  <input
                    type="text"
                    value={draft.aEnd}
                    onChange={(e) => setDraft((d) => ({ ...d, aEnd: e.target.value }))}
                    className="w-full px-3 py-2 font-mono rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100"
                  />
                  {errors.aEnd && <p className="mt-0.5 text-red-600">{errors.aEnd}</p>}
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Z-End Port *</label>
                  <input
                    type="text"
                    value={draft.zEnd}
                    onChange={(e) => setDraft((d) => ({ ...d, zEnd: e.target.value }))}
                    className="w-full px-3 py-2 font-mono rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111418] text-slate-900 dark:text-slate-100"
                  />
                  {errors.zEnd && <p className="mt-0.5 text-red-600">{errors.zEnd}</p>}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-md bg-[#009530] hover:bg-[#007A27] text-white font-medium cursor-pointer"
                >
                  Provision Circuit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

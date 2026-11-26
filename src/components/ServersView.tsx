import { useMemo, useState } from 'react';
import { ArrowUpDown, QrCode, Search, SlidersHorizontal } from 'lucide-react';
import {
  INITIAL_RACKS,
  RACK_MANUFACTURERS,
  RACK_POWER_DENSITY_RATINGS,
} from '../engine/seedData';
import { filterServers, sortServers } from '../engine/telemetryEngine';
import {
  HallId,
  NodeStatus,
  RackDefinition,
  RackManufacturer,
  RackPowerDensityRating,
  ServerNode,
  ServerSortKey,
} from '../engine/types';
import { NodeStatusLabel } from './StatusIndicator';

interface ServersViewProps {
  servers: ServerNode[];
  racks?: RackDefinition[];
  hallFilter: HallId | 'all';
  onHallFilterChange: (hall: HallId | 'all') => void;
  onInspectServer: (serverId: string) => void;
  onOpenQrScanner?: () => void;
}

const HALL_FILTERS: Array<{ id: HallId | 'all'; label: string }> = [
  { id: 'all', label: 'All Halls' },
  { id: 'hall-a', label: 'Hall A' },
  { id: 'hall-b', label: 'Hall B' },
  { id: 'hall-c', label: 'Hall C' },
  { id: 'hall-d', label: 'Hall D' },
];

const STATUS_FILTERS: Array<{ id: NodeStatus | 'all'; label: string }> = [
  { id: 'all', label: 'All States' },
  { id: 'critical', label: 'Critical' },
  { id: 'warning', label: 'Warning' },
  { id: 'nominal', label: 'Nominal' },
  { id: 'maintenance', label: 'Maintenance' },
];

export function ServersView({
  servers,
  racks = INITIAL_RACKS,
  hallFilter,
  onHallFilterChange,
  onInspectServer,
  onOpenQrScanner,
}: ServersViewProps) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<NodeStatus | 'all'>('all');
  const [rackSpecFilter, setRackSpecFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<ServerSortKey>('status');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const rackById = useMemo(() => new Map(racks.map((r) => [r.id, r])), [racks]);

  const parsedRackSpec = useMemo<{
    rackManufacturer: RackManufacturer | 'all';
    powerDensityRating: RackPowerDensityRating | 'all';
  }>(() => {
    if (rackSpecFilter.startsWith('manufacturer:')) {
      return {
        rackManufacturer: rackSpecFilter.slice('manufacturer:'.length) as RackManufacturer,
        powerDensityRating: 'all',
      };
    }
    if (rackSpecFilter.startsWith('density:')) {
      return {
        rackManufacturer: 'all',
        powerDensityRating: rackSpecFilter.slice('density:'.length) as RackPowerDensityRating,
      };
    }
    return { rackManufacturer: 'all', powerDensityRating: 'all' };
  }, [rackSpecFilter]);

  const specCounts = useMemo(() => {
    const byMfr = new Map<RackManufacturer, number>();
    const byDensity = new Map<RackPowerDensityRating, number>();
    for (const srv of servers) {
      const rack = rackById.get(srv.rackId);
      if (!rack) continue;
      byMfr.set(rack.manufacturer, (byMfr.get(rack.manufacturer) ?? 0) + 1);
      byDensity.set(rack.powerDensityRating, (byDensity.get(rack.powerDensityRating) ?? 0) + 1);
    }
    return { byMfr, byDensity };
  }, [servers, rackById]);

  const filtered = useMemo(() => {
    const matched = filterServers(
      servers,
      {
        search,
        hallId: hallFilter,
        status,
        rackId: 'all',
        rackManufacturer: parsedRackSpec.rackManufacturer,
        powerDensityRating: parsedRackSpec.powerDensityRating,
      },
      racks
    );
    return sortServers(matched, sortKey, sortDir);
  }, [servers, racks, search, hallFilter, status, parsedRackSpec, sortKey, sortDir]);

  const handleSort = (key: ServerSortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'hostname' || key === 'status' ? 'asc' : 'desc');
    }
  };

  const hasActiveFilters =
    search.trim().length > 0 ||
    hallFilter !== 'all' ||
    status !== 'all' ||
    rackSpecFilter !== 'all';

  const resetFilters = () => {
    setSearch('');
    onHallFilterChange('all');
    setStatus('all');
    setRackSpecFilter('all');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Server Inventory &amp; Live Health
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Showing <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">{filtered.length}</span> of{' '}
            <span className="font-mono tabular-nums">{servers.length}</span> monitored physical nodes
          </p>
        </div>
        {onOpenQrScanner && (
          <button
            type="button"
            data-testid="open-qr-scanner-btn"
            onClick={onOpenQrScanner}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-[#009530]/40 bg-[#009530]/10 dark:bg-[#3DCD58]/15 text-[#007A27] dark:text-[#3DCD58] hover:bg-[#009530]/20 dark:hover:bg-[#3DCD58]/25 transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto cursor-pointer"
          >
            <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
            Scan Asset QR
          </button>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <label htmlFor="server-search" className="sr-only">
              Search servers by hostname, IP, model, rack, or manufacturer
            </label>
            <input
              id="server-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by hostname, IP, rack, OEM..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
            />
          </div>

          <div className="relative w-full sm:w-auto sm:min-w-[250px] shrink-0">
            <SlidersHorizontal
              className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <label htmlFor="server-rack-spec-filter" className="sr-only">
              Filter by rack manufacturer or power density rating
            </label>
            <select
              id="server-rack-spec-filter"
              data-testid="server-rack-spec-filter"
              value={rackSpecFilter}
              onChange={(e) => setRackSpecFilter(e.target.value)}
              aria-label="Filter by rack manufacturer or power density rating"
              className={`w-full pl-8 pr-8 py-2 text-xs font-medium rounded-md border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530] ${
                rackSpecFilter !== 'all'
                  ? 'border-[#009530] bg-[#009530]/5 dark:bg-[#009530]/15 text-[#007A27] dark:text-[#3DCD58]'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200'
              }`}
            >
              <option value="all">All Rack Specs (OEM / Density)</option>
              <optgroup label="Rack Manufacturer">
                {RACK_MANUFACTURERS.map((mfr) => (
                  <option key={mfr} value={`manufacturer:${mfr}`}>
                    {mfr} ({specCounts.byMfr.get(mfr) ?? 0})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Power Density Rating">
                {RACK_POWER_DENSITY_RATINGS.map((rating) => (
                  <option key={rating} value={`density:${rating}`}>
                    {rating} ({specCounts.byDensity.get(rating) ?? 0})
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              data-testid="servers-reset-filters-btn"
              onClick={resetFilters}
              className="sm:ml-auto px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white underline underline-offset-2 cursor-pointer whitespace-nowrap self-start sm:self-center"
            >
              Reset filters
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
          <div
            role="group"
            aria-label="Filter by data hall"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-md"
          >
            {HALL_FILTERS.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => onHallFilterChange(h.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  hallFilter === h.id
                    ? 'bg-white dark:bg-slate-900 text-[#009530] dark:text-[#3DCD58] shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>

          <div
            role="group"
            aria-label="Filter by server status"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-md"
          >
            {STATUS_FILTERS.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setStatus(st.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  status === st.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              No servers match your current filters
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Adjust your search query or hall/status filters to view active nodes.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-4 px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 pl-5 pr-3">
                    <button
                      type="button"
                      onClick={() => handleSort('hostname')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    >
                      Hostname &amp; Hardware
                      <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </th>
                  <th className="py-3 px-3">Rack / Slot</th>
                  <th className="py-3 px-3">
                    <button
                      type="button"
                      onClick={() => handleSort('status')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    >
                      Status
                      <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </th>
                  <th className="py-3 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('cpu')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    >
                      CPU
                      <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </th>
                  <th className="py-3 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('memory')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    >
                      Memory
                      <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </th>
                  <th className="py-3 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('tempC')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    >
                      Exhaust
                      <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </th>
                  <th className="py-3 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('powerW')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    >
                      Power
                      <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </th>
                  <th className="py-3 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('uptimeDays')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    >
                      Uptime
                      <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </th>
                  <th className="py-3 pl-3 pr-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                {filtered.map((srv) => {
                  const rack = rackById.get(srv.rackId);
                  return (
                    <tr
                      key={srv.id}
                      data-testid={`server-row-${srv.id}`}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 pl-5 pr-3">
                        <div className="font-mono text-xs font-medium text-slate-900 dark:text-slate-100">
                          {srv.hostname}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {srv.model} · <span className="font-mono">{srv.ip}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-mono text-xs text-slate-800 dark:text-slate-200 tabular-nums">
                          {srv.rackId} · U{srv.uStart}–U{srv.uStart + srv.uHeight - 1}
                        </div>
                        {rack && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {rack.manufacturer} · <span className="font-mono tabular-nums">{rack.powerDensityRating}</span>
                          </div>
                        )}
                      </td>
                    <td className="py-3 px-3">
                      <NodeStatusLabel status={srv.status} />
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono text-xs tabular-nums ${
                        srv.cpu >= 90
                          ? 'text-red-700 dark:text-red-400 font-semibold'
                          : srv.cpu >= 80
                          ? 'text-amber-700 dark:text-amber-400 font-medium'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {srv.cpu.toFixed(1)}%
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono text-xs tabular-nums ${
                        srv.memory >= 86
                          ? 'text-amber-700 dark:text-amber-400 font-medium'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {srv.memory.toFixed(1)}%
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono text-xs tabular-nums ${
                        srv.tempC >= 78
                          ? 'text-red-700 dark:text-red-400 font-semibold'
                          : srv.tempC >= 68
                          ? 'text-amber-700 dark:text-amber-400 font-medium'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {srv.tempC.toFixed(1)}°C
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                      {srv.powerW} W
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {srv.uptimeDays}d
                    </td>
                      <td className="py-3 pl-3 pr-5 text-right">
                        <button
                          type="button"
                          onClick={() => onInspectServer(srv.id)}
                          aria-label={`Inspect ${srv.hostname}`}
                          className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

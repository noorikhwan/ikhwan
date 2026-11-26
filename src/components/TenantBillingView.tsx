import { useMemo, useState } from 'react';
import { AlertTriangle, Building, CheckCircle2, Download } from 'lucide-react';
import { ColocationTenant, createInitialTenants } from '../engine/enterpriseOpsEngine';
import { SITE_META_MAP, SiteId } from '../engine/sites';

interface TenantBillingViewProps {
  activeSiteId: SiteId;
  scopedTenantName?: string;
}

export function TenantBillingView({ activeSiteId, scopedTenantName }: TenantBillingViewProps) {
  const [tenantsBySite] = useState<Record<SiteId, ColocationTenant[]>>(() => ({
    kl1: createInitialTenants('kl1'),
    kl2: createInitialTenants('kl2'),
    kl3: createInitialTenants('kl3'),
  }));

  const allTenants = tenantsBySite[activeSiteId];
  const tenants = useMemo(() => {
    if (!scopedTenantName) return allTenants;
    const matched = allTenants.filter((t) =>
      t.name.toLowerCase().includes(scopedTenantName.toLowerCase())
    );
    return matched.length > 0 ? matched : allTenants.slice(0, 1);
  }, [allTenants, scopedTenantName]);
  const siteCode = SITE_META_MAP[activeSiteId].code;
  const [selectedId, setSelectedId] = useState<string>(tenants[0]?.id ?? '');

  const selected = tenants.find((t) => t.id === selectedId) ?? tenants[0];

  const totals = useMemo(() => {
    return {
      racks: tenants.reduce((s, t) => s + t.allocatedRacks, 0),
      contractedKw: tenants.reduce((s, t) => s + t.contractedKw, 0),
      liveDrawKw: tenants.reduce((s, t) => s + t.liveDrawKw, 0),
      mtdKwh: tenants.reduce((s, t) => s + t.meteredKwhMtd, 0),
      billUsd: tenants.reduce((s, t) => s + t.estimatedMonthlyBillUsd, 0),
      overages: tenants.filter((t) => t.overageAlert).length,
    };
  }, [tenants]);

  const handleExportBillingCsv = () => {
    const header = 'Site,Tenant,Cage,Tier,Racks,Contracted kW,Live Draw kW,Metered MTD kWh,Tariff USD/kWh,Overage Alert,SLA Actual %,Est Monthly Invoice USD';
    const lines = tenants.map(
      (t) =>
        `${siteCode},"${t.name}",${t.cageCode},"${t.tier}",${t.allocatedRacks},${t.contractedKw},${t.liveDrawKw},${t.meteredKwhMtd},${t.tariffPerKwhUsd},${t.overageAlert ? 'YES' : 'NO'},${t.slaActualPct},${t.estimatedMonthlyBillUsd}`
    );
    const blob = new Blob([`\uFEFF${[header, ...lines].join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orise-colocation-billing-${activeSiteId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 pb-16" data-testid="tenant-billing-view">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            {scopedTenantName
              ? `${selected?.name ?? scopedTenantName} — Customer Colocation Portal`
              : 'Multi-Tenancy — Colocation Portal & Metered Billing'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {scopedTenantName
              ? `Read-only tenant scope · Showing assigned ${siteCode} cages, metered kWh consumption, and SLA compliance`
              : 'Per-customer cage & rack allocation, revenue-grade metered kWh chargeback, contracted power overage alerts, and SLA compliance'}
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportBillingCsv}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white cursor-pointer whitespace-nowrap self-start xl:self-auto"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Export Billing Ledger CSV
        </button>
      </div>

      {scopedTenantName && (
        <div
          data-testid="tenant-scope-banner"
          className="px-4 py-2.5 rounded-md border border-sky-200 dark:border-sky-900/60 bg-sky-50/70 dark:bg-sky-950/25 text-xs text-sky-900 dark:text-sky-200 flex items-center justify-between gap-2"
        >
          <span>
            Active Role: <strong>Colocation Tenant Portal (Read-Only)</strong> — Multi-tenant isolation active for{' '}
            <strong className="font-mono">{selected?.name ?? scopedTenantName}</strong>.
          </span>
        </div>
      )}

      {/* 4-Column KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Active Colocation Tenants ({siteCode})</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {tenants.length} Cages
          </div>
          <div className="mt-0.5 text-xs font-mono text-slate-500 dark:text-slate-400">
            {totals.racks} contracted cabinets
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Metered Energy (Month-to-Date)</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {(totals.mtdKwh / 1000).toLocaleString()} MWh
          </div>
          <div className="mt-0.5 text-xs font-mono text-slate-500 dark:text-slate-400">
            Live {totals.liveDrawKw.toLocaleString()} / {totals.contractedKw.toLocaleString()} kW cap
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Contracted Power Overages</div>
          <div
            data-testid="tenant-overage-count"
            className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${
              totals.overages > 0 ? 'text-red-600 dark:text-red-400' : 'text-[#007A27] dark:text-[#3DCD58]'
            }`}
          >
            {totals.overages} Alert{totals.overages === 1 ? '' : 's'}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Live draw exceeding contracted kW</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Projected Monthly Billing</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#007A27] dark:text-[#3DCD58]">
            ${(totals.billUsd / 1000).toFixed(1)}k
          </div>
          <div className="mt-0.5 text-xs font-mono text-slate-500 dark:text-slate-400">
            ${totals.billUsd.toLocaleString()} USD (Cage + kWh + Overage)
          </div>
        </div>
      </section>

      {/* Master-Detail Tenant Ledger & Invoice Breakdown */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <section className="xl:col-span-8 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Building className="w-4 h-4 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
            Tenant Cages, Metered Power &amp; SLA Compliance — {siteCode}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pl-4 pr-3 font-semibold">Tenant &amp; Cage</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Racks</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Live / Contract kW</th>
                  <th className="py-2.5 px-3 font-semibold text-right">MTD kWh</th>
                  <th className="py-2.5 px-3 font-semibold text-right">SLA %</th>
                  <th className="py-2.5 pl-3 pr-4 font-semibold text-right">Est. Bill</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {tenants.map((t) => {
                  const active = selected?.id === t.id;
                  const utilPct = Math.round((t.liveDrawKw / Math.max(1, t.contractedKw)) * 100);
                  return (
                    <tr
                      key={t.id}
                      onClick={() => setSelectedId(t.id)}
                      className={`cursor-pointer transition-colors ${
                        active
                          ? 'bg-[#009530]/[0.06] dark:bg-[#3DCD58]/[0.09]'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3 pl-4 pr-3">
                        <div className="font-mono text-[11px] font-semibold text-[#007A27] dark:text-[#3DCD58]">
                          {t.cageCode} · {t.tier}
                        </div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">{t.name}</div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                        {t.allocatedRacks}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                        <span className={t.overageAlert ? 'text-red-600 dark:text-red-400 font-bold' : 'text-slate-900 dark:text-slate-100'}>
                          {t.liveDrawKw.toLocaleString()}
                        </span>{' '}
                        <span className="text-slate-400">/ {t.contractedKw.toLocaleString()} kW ({utilPct}%)</span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {t.meteredKwhMtd.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-[#007A27] dark:text-[#3DCD58]">
                        {t.slaActualPct.toFixed(3)}%
                      </td>
                      <td className="py-3 pl-3 pr-4 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                        ${t.estimatedMonthlyBillUsd.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Tenant Chargeback & SLA Inspector */}
        {selected && (
          <section className="xl:col-span-4 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md p-4 space-y-4">
            <div className="pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="font-mono text-xs font-semibold text-[#007A27] dark:text-[#3DCD58]">
                {selected.cageCode} · {selected.hallId.toUpperCase()}
              </div>
              <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-50">
                {selected.name}
              </h2>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {selected.tier} · {selected.allocatedRacks} 42U Cabinets
              </div>
            </div>

            {selected.overageAlert ? (
              <div className="p-3 rounded-md border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-800 dark:text-red-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <strong>Power Overage Active (+{selected.liveDrawKw - selected.contractedKw} kW):</strong>{' '}
                  Draw exceeds contracted {selected.contractedKw} kW ceiling; $42/kW burst surcharge applies.
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-md border border-[#009530]/30 bg-[#009530]/[0.06] text-xs text-[#006B22] dark:text-[#6EE787] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                Within contracted power envelope · Tier IV SLA {selected.slaActualPct.toFixed(3)}% (Target {selected.slaTargetPct}%)
              </div>
            )}

            <div className="space-y-2 text-xs font-mono tabular-nums">
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="font-sans text-slate-500 dark:text-slate-400">Base Cage &amp; Space MRC</span>
                <span className="text-slate-900 dark:text-slate-100">${selected.baseCageFeeUsd.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="font-sans text-slate-500 dark:text-slate-400">
                  Metered kWh (${selected.tariffPerKwhUsd}/kWh)
                </span>
                <span className="text-slate-900 dark:text-slate-100">
                  ${Math.round(selected.meteredKwhMtd * selected.tariffPerKwhUsd).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="font-sans text-slate-500 dark:text-slate-400">Demand Overage Surcharge</span>
                <span className={selected.overageAlert ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-500'}>
                  ${(Math.max(0, selected.liveDrawKw - selected.contractedKw) * 42).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between pt-2 text-sm font-bold">
                <span className="font-sans text-slate-900 dark:text-slate-50">Projected Monthly Total</span>
                <span className="text-[#007A27] dark:text-[#3DCD58]">
                  ${selected.estimatedMonthlyBillUsd.toLocaleString()}
                </span>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

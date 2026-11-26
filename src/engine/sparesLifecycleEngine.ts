import { AssetLifecycleRecord, SparePartItem } from './enterpriseOpsEngine';
import { SITE_META_MAP, SiteId } from './sites';

export interface SiteSpareStock extends SparePartItem {
  stockBySite: Record<SiteId, number>;
}

export interface SpareConsumptionEntry {
  id: string;
  timestamp: number;
  siteId: SiteId;
  sku: string;
  partName: string;
  qty: number;
  linkedRef: string; // Ticket ID or PM Task tag
  actorName: string;
  actionType: 'Consumed' | 'Restocked' | 'Transfer Out' | 'Transfer In';
  notes: string;
}

export type RmaStatus = 'Requested' | 'Vendor Approved' | 'Replacement Shipped' | 'Completed';

export interface HardwareRmaRecord {
  id: string;
  rmaNumber: string;
  siteId: SiteId;
  assetId: string;
  assetTag: string;
  assetName: string;
  vendor: string;
  requestType: 'Hardware RMA' | 'Warranty Renewal' | 'EoL Refresh Quote';
  status: RmaStatus;
  estimatedCostUsd: number;
  requestedBy: string;
  requestedAt: number;
  updatedAt: number;
}

const RMA_FLOW: RmaStatus[] = ['Requested', 'Vendor Approved', 'Replacement Shipped', 'Completed'];

export function createSiteAwareSpares(baseSpares: SparePartItem[]): SiteSpareStock[] {
  return baseSpares.map((part, idx) => {
    const kl1 = part.qtyOnHand;
    const kl2 = Math.max(0, part.qtyOnHand + (idx % 2 === 0 ? 1 : -1));
    const kl3 = Math.max(1, part.qtyOnHand + (idx % 3 === 0 ? 2 : 0));
    return {
      ...part,
      stockBySite: { kl1, kl2, kl3 },
    };
  });
}

export function consumeSpareForWorkOrder(params: {
  spares: SiteSpareStock[];
  partId: string;
  siteId: SiteId;
  qty: number;
  linkedRef: string;
  actorName: string;
  now: number;
}): { ok: boolean; spares: SiteSpareStock[]; entry: SpareConsumptionEntry | null; error?: string } {
  const { spares, partId, siteId, qty, linkedRef, actorName, now } = params;
  const part = spares.find((p) => p.id === partId);
  if (!part) return { ok: false, spares, entry: null, error: 'Spare part not found.' };
  const amount = Math.max(1, Math.round(qty));
  const currentQty = part.stockBySite[siteId] ?? 0;
  if (currentQty < amount) {
    return {
      ok: false,
      spares,
      entry: null,
      error: `Insufficient ${SITE_META_MAP[siteId].code} stock for ${part.sku} (${currentQty} on hand).`,
    };
  }
  const refLabel = linkedRef.trim() || 'Routine CMMS Maintenance';
  const nextSpares = spares.map((p) => {
    if (p.id !== partId) return p;
    const nextSiteQty = currentQty - amount;
    return {
      ...p,
      qtyOnHand: siteId === 'kl1' ? nextSiteQty : p.qtyOnHand,
      stockBySite: { ...p.stockBySite, [siteId]: nextSiteQty },
    };
  });
  const entry: SpareConsumptionEntry = {
    id: `cons-${now.toString(36)}-${part.sku.slice(-4)}`,
    timestamp: now,
    siteId,
    sku: part.sku,
    partName: part.name,
    qty: amount,
    linkedRef: refLabel,
    actorName,
    actionType: 'Consumed',
    notes: `Issued ${amount}x ${part.sku} at ${SITE_META_MAP[siteId].code} for ${refLabel}`,
  };
  return { ok: true, spares: nextSpares, entry };
}

export function transferSpareBetweenSites(params: {
  spares: SiteSpareStock[];
  partId: string;
  fromSiteId: SiteId;
  toSiteId: SiteId;
  qty: number;
  actorName: string;
  now: number;
}): { ok: boolean; spares: SiteSpareStock[]; entries: SpareConsumptionEntry[]; error?: string } {
  const { spares, partId, fromSiteId, toSiteId, qty, actorName, now } = params;
  if (fromSiteId === toSiteId) {
    return { ok: false, spares, entries: [], error: 'Source and destination campuses must differ.' };
  }
  const part = spares.find((p) => p.id === partId);
  if (!part) return { ok: false, spares, entries: [], error: 'Spare part not found.' };
  const amount = Math.max(1, Math.round(qty));
  const available = part.stockBySite[fromSiteId] ?? 0;
  if (available < amount) {
    return {
      ok: false,
      spares,
      entries: [],
      error: `Only ${available} unit(s) available at ${SITE_META_MAP[fromSiteId].code}.`,
    };
  }

  const nextSpares = spares.map((p) => {
    if (p.id !== partId) return p;
    const nextFrom = (p.stockBySite[fromSiteId] ?? 0) - amount;
    const nextTo = (p.stockBySite[toSiteId] ?? 0) + amount;
    const nextBySite = { ...p.stockBySite, [fromSiteId]: nextFrom, [toSiteId]: nextTo };
    return {
      ...p,
      qtyOnHand: nextBySite.kl1,
      stockBySite: nextBySite,
    };
  });

  const fromCode = SITE_META_MAP[fromSiteId].code;
  const toCode = SITE_META_MAP[toSiteId].code;
  const entries: SpareConsumptionEntry[] = [
    {
      id: `xfer-in-${now.toString(36)}-${part.sku.slice(-4)}`,
      timestamp: now,
      siteId: toSiteId,
      sku: part.sku,
      partName: part.name,
      qty: amount,
      linkedRef: `Inter-Site Transfer ${fromCode} → ${toCode}`,
      actorName,
      actionType: 'Transfer In',
      notes: `Received ${amount}x ${part.sku} from ${fromCode} staging cage`,
    },
    {
      id: `xfer-out-${now.toString(36)}-${part.sku.slice(-4)}`,
      timestamp: now,
      siteId: fromSiteId,
      sku: part.sku,
      partName: part.name,
      qty: amount,
      linkedRef: `Inter-Site Transfer ${fromCode} → ${toCode}`,
      actorName,
      actionType: 'Transfer Out',
      notes: `Dispatched ${amount}x ${part.sku} to ${toCode} via courier`,
    },
  ];
  return { ok: true, spares: nextSpares, entries };
}

export function createHardwareRmaRequest(params: {
  existing: HardwareRmaRecord[];
  asset: AssetLifecycleRecord;
  requestType: HardwareRmaRecord['requestType'];
  actorName: string;
  now: number;
}): HardwareRmaRecord {
  const code = SITE_META_MAP[params.asset.siteId].code;
  const seq = 710 + params.existing.length + 1;
  return {
    id: `rma-${params.now.toString(36)}-${seq}`,
    rmaNumber: `RMA-${code}-${seq}`,
    siteId: params.asset.siteId,
    assetId: params.asset.id,
    assetTag: params.asset.assetTag,
    assetName: params.asset.name,
    vendor: params.asset.vendor,
    requestType: params.requestType,
    status: 'Requested',
    estimatedCostUsd:
      params.requestType === 'Warranty Renewal'
        ? Math.round(params.asset.replacementCostUsd * 0.14)
        : params.asset.replacementCostUsd,
    requestedBy: params.actorName,
    requestedAt: params.now,
    updatedAt: params.now,
  };
}

export function advanceRmaStatus(record: HardwareRmaRecord, now: number): HardwareRmaRecord {
  const idx = RMA_FLOW.indexOf(record.status);
  if (idx < 0 || idx >= RMA_FLOW.length - 1) return record;
  return {
    ...record,
    status: RMA_FLOW[idx + 1],
    updatedAt: now,
  };
}

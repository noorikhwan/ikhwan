import QRCode from 'qrcode';
import { SiteId } from './sites';
import { NodeStatus, ServerNode } from './types';

export type ServerQrPayloadMode = 'console-link' | 'json-tag';

export interface ServerQrTagData {
  assetId: string;
  serverId: string;
  hostname: string;
  status: NodeStatus;
  siteId: SiteId;
  siteCode: string;
  rackId: string;
  uSlot: string;
  consoleUrl: string;
}

export interface QrSvgMatrix {
  size: number;
  quietZone: number;
  viewBoxSize: number;
  pathData: string;
  moduleCount: number;
}

/**
 * Deterministically derives a unique, technician-friendly DCIM Asset ID for any server node.
 * Example: AST-KL1-B-R01-01-GPU01
 */
export function deriveServerAssetId(
  server: Pick<ServerNode, 'id' | 'rackId'>,
  siteCode: string = 'KL1'
): string {
  const cleanSite = siteCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || 'KL1';
  const cleanRack = server.rackId.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  const cleanSuffix = server.id
    .trim()
    .toUpperCase()
    .replace(/^SRV[-_]?/, '')
    .replace(/[^A-Z0-9]/g, '');
  return `AST-${cleanSite}-${cleanRack}-${cleanSuffix || 'NODE'}`;
}

/**
 * Builds the scannable DCIM console deep-link URL embedding the server's unique asset ID,
 * hostname, and live operational status so scanning pulls up the exact ServerDetailDrawer.
 */
export function buildServerQrConsoleUrl(
  server: Pick<ServerNode, 'id' | 'hostname' | 'status' | 'rackId' | 'hallId'>,
  siteId: SiteId,
  siteCode: string,
  baseOrigin: string
): string {
  const assetId = deriveServerAssetId(server, siteCode);
  const normalizedBase = baseOrigin.replace(/\/+$/, '');
  const sp = new URLSearchParams();
  sp.set('site', siteId);
  sp.set('tab', 'servers');
  sp.set('server', server.id);
  sp.set('asset', assetId);
  sp.set('hostname', server.hostname);
  sp.set('status', server.status);
  return `${normalizedBase}/?${sp.toString()}`;
}

/**
 * Builds the complete structured metadata record for a server's QR asset tag.
 */
export function buildServerQrTagData(
  server: Pick<ServerNode, 'id' | 'hostname' | 'status' | 'rackId' | 'hallId' | 'uStart' | 'uHeight'>,
  siteId: SiteId,
  siteCode: string,
  baseOrigin: string
): ServerQrTagData {
  const assetId = deriveServerAssetId(server, siteCode);
  const uEnd = server.uStart + server.uHeight - 1;
  const consoleUrl = buildServerQrConsoleUrl(server, siteId, siteCode, baseOrigin);

  return {
    assetId,
    serverId: server.id,
    hostname: server.hostname,
    status: server.status,
    siteId,
    siteCode: siteCode.toUpperCase(),
    rackId: server.rackId,
    uSlot: server.uHeight > 1 ? `U${server.uStart}-U${uEnd}` : `U${server.uStart}`,
    consoleUrl,
  };
}

/**
 * Encodes the QR string payload in either:
 * - 'console-link': direct HTTPS DCIM console deep link containing asset ID, hostname, and current status.
 * - 'json-tag': structured JSON payload for handheld barcode/CMDB scanners.
 */
export function buildServerQrPayload(
  tagData: ServerQrTagData,
  mode: ServerQrPayloadMode = 'console-link'
): string {
  if (mode === 'json-tag') {
    return JSON.stringify({
      assetId: tagData.assetId,
      hostname: tagData.hostname,
      status: tagData.status,
      site: tagData.siteCode,
      rack: tagData.rackId,
      uSlot: tagData.uSlot,
      url: tagData.consoleUrl,
    });
  }
  return tagData.consoleUrl;
}

/**
 * Generates an ISO/IEC 18004 scannable QR code matrix and single-path SVG geometry
 * (with a 4-module quiet zone) using the `qrcode` encoder.
 */
export function generateQrSvgMatrix(payload: string, quietZone: number = 4): QrSvgMatrix {
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const data = qr.modules.data;
  const commands: string[] = [];
  let moduleCount = 0;

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (data[row * size + col]) {
        const x = col + quietZone;
        const y = row + quietZone;
        commands.push(`M${x},${y}h1v1h-1z`);
        moduleCount += 1;
      }
    }
  }

  return {
    size,
    quietZone,
    viewBoxSize: size + quietZone * 2,
    pathData: commands.join(''),
    moduleCount,
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Produces a standalone printable SVG sticker containing the scannable QR matrix
 * alongside Asset ID, Hostname, Rack/U location, and live Status.
 */
export function buildPrintableAssetQrSvg(tagData: ServerQrTagData, matrix: QrSvgMatrix): string {
  const qrPx = 148;
  const scale = qrPx / matrix.viewBoxSize;
  const statusLabel = tagData.status.toUpperCase();

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="180" viewBox="0 0 420 180">`,
    `<rect x="0.5" y="0.5" width="419" height="179" rx="8" fill="#FFFFFF" stroke="#CBD5E1"/>`,
    `<g transform="translate(16, 16) scale(${scale.toFixed(4)})">`,
    `<rect width="${matrix.viewBoxSize}" height="${matrix.viewBoxSize}" fill="#FFFFFF"/>`,
    `<path d="${matrix.pathData}" fill="#0F172A"/>`,
    `</g>`,
    `<text x="180" y="42" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" font-weight="600" fill="#64748B">ORISE DCIM ASSET TAG</text>`,
    `<text x="180" y="66" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="14" font-weight="700" fill="#0F172A">${escapeXml(tagData.assetId)}</text>`,
    `<text x="180" y="92" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12" fill="#1E293B">${escapeXml(tagData.hostname)}</text>`,
    `<text x="180" y="118" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" fill="#475569">Site ${escapeXml(tagData.siteCode)} · Rack ${escapeXml(tagData.rackId)} · ${escapeXml(tagData.uSlot)}</text>`,
    `<text x="180" y="146" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" font-weight="700" fill="#007A27">STATUS: ${escapeXml(statusLabel)}</text>`,
    `</svg>`,
  ].join('');
}

export interface ScannedServerQrResult {
  valid: boolean;
  sourceFormat: 'console-url' | 'json-tag' | 'asset-id' | 'hostname' | 'unknown';
  siteId?: SiteId;
  serverId?: string;
  assetId?: string;
  hostname?: string;
  status?: NodeStatus;
  rackId?: string;
  error?: string;
}

const VALID_SITE_IDS = new Set<SiteId>(['kl1', 'kl2', 'kl3']);
const VALID_NODE_STATUSES = new Set<NodeStatus>(['nominal', 'warning', 'critical', 'maintenance']);

/**
 * Parses a scanned or pasted QR payload in any supported DCIM format:
 * 1. Console deep-link URL (`https://.../?site=kl1&tab=servers&server=srv-b01-01&asset=...`)
 * 2. JSON Asset Tag (`{"assetId":"AST-...","hostname":"...","url":"..."}`)
 * 3. Direct Asset ID (`AST-KL1-B-R01-01-B0101`) or server hostname (`gpu-b01-x01.kl1.orise`)
 */
export function parseScannedServerQrPayload(rawInput: string): ScannedServerQrResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { valid: false, sourceFormat: 'unknown', error: 'Paste or scan a QR payload first.' };
  }

  // 1. JSON Asset Tag
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const assetId = typeof parsed.assetId === 'string' ? parsed.assetId.trim() : undefined;
      const hostname = typeof parsed.hostname === 'string' ? parsed.hostname.trim() : undefined;
      const rackId = typeof parsed.rack === 'string' ? parsed.rack.trim() : undefined;
      const statusRaw = typeof parsed.status === 'string' ? parsed.status.toLowerCase() : undefined;
      const status = statusRaw && VALID_NODE_STATUSES.has(statusRaw as NodeStatus)
        ? (statusRaw as NodeStatus)
        : undefined;

      let siteId: SiteId | undefined;
      let serverId: string | undefined;

      if (typeof parsed.site === 'string') {
        const lower = parsed.site.toLowerCase();
        if (VALID_SITE_IDS.has(lower as SiteId)) siteId = lower as SiteId;
      }

      if (typeof parsed.url === 'string') {
        const nested = parseScannedServerQrPayload(parsed.url);
        if (nested.valid) {
          siteId = siteId ?? nested.siteId;
          serverId = serverId ?? nested.serverId;
        }
      }

      if (assetId || hostname || serverId) {
        return {
          valid: true,
          sourceFormat: 'json-tag',
          siteId,
          serverId,
          assetId,
          hostname,
          status,
          rackId,
        };
      }
      return {
        valid: false,
        sourceFormat: 'unknown',
        error: 'JSON tag is missing assetId, hostname, or console URL.',
      };
    } catch {
      return {
        valid: false,
        sourceFormat: 'unknown',
        error: 'Malformed JSON QR payload.',
      };
    }
  }

  // 2. Console Deep-Link URL or query string
  if (trimmed.includes('server=') || trimmed.includes('asset=') || /^https?:\/\//i.test(trimmed)) {
    try {
      const url = /^https?:\/\//i.test(trimmed)
        ? new URL(trimmed)
        : new URL(trimmed.startsWith('?') ? `https://orise.local/${trimmed}` : `https://orise.local/?${trimmed}`);
      const sp = url.searchParams;
      const serverId = sp.get('server')?.trim() || undefined;
      const assetId = sp.get('asset')?.trim() || undefined;
      const hostname = sp.get('hostname')?.trim() || undefined;
      const siteRaw = sp.get('site')?.trim().toLowerCase();
      const siteId = siteRaw && VALID_SITE_IDS.has(siteRaw as SiteId) ? (siteRaw as SiteId) : undefined;
      const statusRaw = sp.get('status')?.trim().toLowerCase();
      const status = statusRaw && VALID_NODE_STATUSES.has(statusRaw as NodeStatus)
        ? (statusRaw as NodeStatus)
        : undefined;

      if (serverId || assetId || hostname) {
        return {
          valid: true,
          sourceFormat: 'console-url',
          siteId,
          serverId,
          assetId,
          hostname,
          status,
        };
      }
    } catch {
      // fall through to bare identifier checks
    }
  }

  // 3. Direct Asset ID (`AST-KL1-...`)
  if (/^AST-[A-Z0-9-]+$/i.test(trimmed)) {
    const upper = trimmed.toUpperCase();
    const parts = upper.split('-');
    const siteCandidate = parts[1]?.toLowerCase();
    const siteId = siteCandidate && VALID_SITE_IDS.has(siteCandidate as SiteId)
      ? (siteCandidate as SiteId)
      : undefined;
    return {
      valid: true,
      sourceFormat: 'asset-id',
      siteId,
      assetId: upper,
    };
  }

  // 4. Bare Server Hostname (`gpu-b01-x01.kl1.orise`) or Server ID (`srv-b01-01`)
  if (/^[a-z0-9][a-z0-9.-]{2,80}$/i.test(trimmed)) {
    const lower = trimmed.toLowerCase();
    const siteMatch = lower.match(/\.(kl[123])\./);
    const siteId = siteMatch ? (siteMatch[1] as SiteId) : undefined;
    if (lower.startsWith('srv-')) {
      return {
        valid: true,
        sourceFormat: 'asset-id',
        siteId,
        serverId: lower,
      };
    }
    return {
      valid: true,
      sourceFormat: 'hostname',
      siteId,
      hostname: lower,
    };
  }

  return {
    valid: false,
    sourceFormat: 'unknown',
    error: 'Unrecognized QR format. Expecting an Orise DCIM console URL, JSON asset tag, Asset ID, or hostname.',
  };
}

/**
 * Generates a single printable multi-label SVG sticker sheet (2 columns)
 * containing scannable QR asset labels for every server mounted in a rack.
 */
export function buildRackQrSheetSvg(
  rackId: string,
  siteCode: string,
  items: Array<{ tagData: ServerQrTagData; matrix: QrSvgMatrix }>,
  generatedAtIso: string = new Date().toISOString()
): string {
  const cols = 2;
  const cardW = 400;
  const cardH = 164;
  const gap = 16;
  const pad = 24;
  const headerH = 56;
  const rows = Math.max(1, Math.ceil(items.length / cols));
  const width = pad * 2 + cols * cardW + (cols - 1) * gap;
  const height = pad * 2 + headerH + rows * cardH + (rows - 1) * gap;

  const cardsSvg = items
    .map(({ tagData, matrix }, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = pad + col * (cardW + gap);
      const y = pad + headerH + row * (cardH + gap);
      const qrPx = 128;
      const scale = qrPx / matrix.viewBoxSize;
      const statusColor =
        tagData.status === 'critical'
          ? '#DC2626'
          : tagData.status === 'warning'
          ? '#D97706'
          : tagData.status === 'maintenance'
          ? '#475569'
          : '#007A27';

      return [
        `<g transform="translate(${x}, ${y})">`,
        `<rect x="0.5" y="0.5" width="${cardW - 1}" height="${cardH - 1}" rx="6" fill="#FFFFFF" stroke="#94A3B8" stroke-dasharray="4 3"/>`,
        `<g transform="translate(14, 18) scale(${scale.toFixed(4)})">`,
        `<rect width="${matrix.viewBoxSize}" height="${matrix.viewBoxSize}" fill="#FFFFFF"/>`,
        `<path d="${matrix.pathData}" fill="#0F172A"/>`,
        `</g>`,
        `<text x="156" y="38" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="10" font-weight="600" fill="#64748B">ORISE DCIM · ${escapeXml(siteCode)} · ${escapeXml(tagData.uSlot)}</text>`,
        `<text x="156" y="62" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="13" font-weight="700" fill="#0F172A">${escapeXml(tagData.assetId)}</text>`,
        `<text x="156" y="86" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11.5" fill="#1E293B">${escapeXml(tagData.hostname)}</text>`,
        `<text x="156" y="110" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10.5" fill="#475569">Cabinet ${escapeXml(tagData.rackId)}</text>`,
        `<text x="156" y="136" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="10.5" font-weight="700" fill="${statusColor}">STATUS: ${escapeXml(tagData.status.toUpperCase())}</text>`,
        `</g>`,
      ].join('');
    })
    .join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#F8FAFC"/>`,
    `<text x="${pad}" y="${pad + 18}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="16" font-weight="700" fill="#0F172A">Orise DCIM — Cabinet ${escapeXml(rackId)} QR Asset Label Sheet (${escapeXml(siteCode)})</text>`,
    `<text x="${pad}" y="${pad + 38}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" fill="#475569">${items.length} mounted server label${items.length === 1 ? '' : 's'} · Cut along dashed borders · Generated ${escapeXml(generatedAtIso.slice(0, 19))}Z</text>`,
    cardsSvg,
    `</svg>`,
  ].join('');
}

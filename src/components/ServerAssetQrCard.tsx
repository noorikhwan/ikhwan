import { useMemo, useState } from 'react';
import { Check, Copy, Download, QrCode } from 'lucide-react';
import {
  buildPrintableAssetQrSvg,
  buildServerQrPayload,
  buildServerQrTagData,
  generateQrSvgMatrix,
  ServerQrPayloadMode,
} from '../engine/serverQrEngine';
import { SiteId } from '../engine/sites';
import { ServerNode } from '../engine/types';
import { NodeStatusLabel } from './StatusIndicator';

interface ServerAssetQrCardProps {
  server: ServerNode;
  siteId: SiteId;
  siteCode: string;
}

/**
 * Renders a scannable ISO/IEC 18004 QR code asset tag for a server inside ServerDetailDrawer.
 * Encodes the server's unique Asset ID, hostname, and live operational status into a DCIM console
 * deep-link URL (or structured JSON asset payload) so field technicians can scan and pull up the node instantly.
 */
export function ServerAssetQrCard({ server, siteId, siteCode }: ServerAssetQrCardProps) {
  const [payloadMode, setPayloadMode] = useState<ServerQrPayloadMode>('console-link');
  const [copied, setCopied] = useState(false);

  const baseOrigin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://orise-dcim.local';

  const tagData = useMemo(
    () => buildServerQrTagData(server, siteId, siteCode, baseOrigin),
    [server, siteId, siteCode, baseOrigin]
  );

  const payload = useMemo(
    () => buildServerQrPayload(tagData, payloadMode),
    [tagData, payloadMode]
  );

  const qrMatrix = useMemo(() => generateQrSvgMatrix(payload, 4), [payload]);

  const handleCopyPayload = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadSvg = () => {
    const svg = buildPrintableAssetQrSvg(tagData, qrMatrix);
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tagData.assetId.toLowerCase()}-qr-tag.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <section
      data-testid="server-qr-asset-section"
      aria-label={`Technician QR asset tag for ${server.hostname}`}
      className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#14181D] p-4 space-y-3"
    >
      {/* Header + Payload Mode Switch */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <QrCode className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58] shrink-0" aria-hidden="true" />
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
            Technician QR Asset Tag
          </h3>
        </div>

        <div
          role="group"
          aria-label="QR code payload format"
          className="inline-flex items-center gap-0.5 p-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026]"
        >
          <button
            type="button"
            data-testid="server-qr-mode-link"
            aria-pressed={payloadMode === 'console-link'}
            onClick={() => setPayloadMode('console-link')}
            className={`px-2 py-0.5 text-[11px] font-medium rounded-xs cursor-pointer transition-colors whitespace-nowrap ${
              payloadMode === 'console-link'
                ? 'bg-[#009530] text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Console Link
          </button>
          <button
            type="button"
            data-testid="server-qr-mode-json"
            aria-pressed={payloadMode === 'json-tag'}
            onClick={() => setPayloadMode('json-tag')}
            className={`px-2 py-0.5 text-[11px] font-medium rounded-xs cursor-pointer transition-colors whitespace-nowrap ${
              payloadMode === 'json-tag'
                ? 'bg-[#009530] text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            JSON Tag
          </button>
        </div>
      </div>

      {/* Main Split: High-Contrast Scannable QR Plate + Encoded Asset Metadata */}
      <div className="flex flex-col sm:flex-row items-start gap-4">
        {/* Pure White Quiet-Zone QR Plate (always high-contrast for camera scanners in both themes) */}
        <div className="shrink-0 rounded-md bg-white p-2 border border-slate-200 dark:border-slate-700 shadow-2xs">
          <svg
            data-testid="server-qr-svg"
            data-qr-mode={payloadMode}
            data-asset-id={tagData.assetId}
            data-hostname={tagData.hostname}
            data-status={tagData.status}
            data-qr-payload={payload}
            role="img"
            aria-label={`Scannable QR code for asset ${tagData.assetId}, hostname ${tagData.hostname}, status ${tagData.status}`}
            viewBox={`0 0 ${qrMatrix.viewBoxSize} ${qrMatrix.viewBoxSize}`}
            width={124}
            height={124}
            shapeRendering="crispEdges"
            className="block w-[124px] h-[124px]"
          >
            <rect width={qrMatrix.viewBoxSize} height={qrMatrix.viewBoxSize} fill="#FFFFFF" />
            <path d={qrMatrix.pathData} fill="#0F172A" />
          </svg>
        </div>

        {/* Structured Encoded Fields + Actions */}
        <div className="min-w-0 flex-1 space-y-2.5">
          <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
            Scan with a mobile or handheld scanner to open this server&apos;s live DCIM telemetry drawer immediately.
          </p>

          <dl className="grid grid-cols-1 gap-y-1.5 text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-slate-500 dark:text-slate-400 shrink-0">Asset ID</dt>
              <dd
                data-testid="server-qr-asset-id"
                className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums truncate"
                title={tagData.assetId}
              >
                {tagData.assetId}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-slate-500 dark:text-slate-400 shrink-0">Hostname</dt>
              <dd
                data-testid="server-qr-hostname"
                className="font-mono text-slate-800 dark:text-slate-200 truncate"
                title={tagData.hostname}
              >
                {tagData.hostname}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500 dark:text-slate-400 shrink-0">Encoded Status</dt>
              <dd data-testid="server-qr-status">
                <NodeStatusLabel status={tagData.status} />
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-slate-500 dark:text-slate-400 shrink-0">Location</dt>
              <dd className="font-mono text-[11px] text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                {tagData.siteCode} · {tagData.rackId} · {tagData.uSlot}
              </dd>
            </div>
          </dl>

          <div className="pt-1 flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="server-qr-copy-btn"
              onClick={handleCopyPayload}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" aria-hidden="true" />
                  {payloadMode === 'console-link' ? 'Copy Console Link' : 'Copy JSON Payload'}
                </>
              )}
            </button>
            <button
              type="button"
              data-testid="server-qr-download-btn"
              onClick={handleDownloadSvg}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap transition-colors"
            >
              <Download className="w-3 h-3" aria-hidden="true" />
              Download Label SVG
            </button>
          </div>
        </div>
      </div>

      {/* Compact Verified Payload Preview */}
      <div
        data-testid="server-qr-payload-preview"
        title={payload}
        className="pt-2 border-t border-slate-200/70 dark:border-slate-800 font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate"
      >
        {payload}
      </div>
    </section>
  );
}

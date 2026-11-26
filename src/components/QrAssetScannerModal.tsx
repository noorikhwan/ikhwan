import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CameraOff, CheckCircle2, QrCode, Search, Upload, X } from 'lucide-react';
import {
  buildServerQrPayload,
  buildServerQrTagData,
  deriveServerAssetId,
  parseScannedServerQrPayload,
  ScannedServerQrResult,
} from '../engine/serverQrEngine';
import { SITE_META_MAP, SiteId, SiteWorkspaceState } from '../engine/sites';
import { ServerNode } from '../engine/types';
import { NodeStatusLabel } from './StatusIndicator';

interface QrAssetScannerModalProps {
  open: boolean;
  onClose: () => void;
  activeSiteId: SiteId;
  sitesMap: Record<SiteId, SiteWorkspaceState>;
  onResolveServer: (siteId: SiteId, serverId: string) => void;
}

interface ResolvedMatch {
  siteId: SiteId;
  siteCode: string;
  server: ServerNode;
  assetId: string;
}

export function QrAssetScannerModal({
  open,
  onClose,
  activeSiteId,
  sitesMap,
  onResolveServer,
}: QrAssetScannerModalProps) {
  const [rawInput, setRawInput] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  const stopCamera = () => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      stopCamera();
    };
  }, [open, onClose]);

  const parsed: ScannedServerQrResult | null = useMemo(() => {
    if (!rawInput.trim()) return null;
    return parseScannedServerQrPayload(rawInput);
  }, [rawInput]);

  const resolvedMatch: ResolvedMatch | null = useMemo(() => {
    if (!parsed || !parsed.valid) return null;

    const searchSiteOrder: SiteId[] = parsed.siteId
      ? [parsed.siteId, ...(['kl1', 'kl2', 'kl3'] as SiteId[]).filter((id) => id !== parsed.siteId)]
      : [activeSiteId, ...(['kl1', 'kl2', 'kl3'] as SiteId[]).filter((id) => id !== activeSiteId)];

    for (const sid of searchSiteOrder) {
      const siteCode = SITE_META_MAP[sid].code;
      const list = sitesMap[sid]?.servers ?? [];
      for (const srv of list) {
        const computedAssetId = deriveServerAssetId(srv, siteCode);
        if (parsed.serverId && srv.id.toLowerCase() === parsed.serverId.toLowerCase()) {
          return { siteId: sid, siteCode, server: srv, assetId: computedAssetId };
        }
        if (parsed.assetId && computedAssetId.toUpperCase() === parsed.assetId.toUpperCase()) {
          return { siteId: sid, siteCode, server: srv, assetId: computedAssetId };
        }
        if (parsed.hostname && srv.hostname.toLowerCase() === parsed.hostname.toLowerCase()) {
          return { siteId: sid, siteCode, server: srv, assetId: computedAssetId };
        }
      }
    }
    return null;
  }, [parsed, activeSiteId, sitesMap]);

  const sampleServers = useMemo(() => {
    const activeServers = sitesMap[activeSiteId]?.servers ?? [];
    return activeServers.slice(0, 3);
  }, [sitesMap, activeSiteId]);

  const handleStartCamera = async () => {
    setCameraStatus(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('Camera API unavailable in this browser. Paste a QR payload, upload a label SVG/PNG, or select a live sample tag below.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const BarcodeDetectorCtor = (
        window as unknown as {
          BarcodeDetector?: new (opts: { formats: string[] }) => {
            detect: (source: HTMLVideoElement | ImageBitmap) => Promise<Array<{ rawValue: string }>>;
          };
        }
      ).BarcodeDetector;

      if (BarcodeDetectorCtor) {
        const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
        setCameraStatus('Camera live — hold a server QR asset tag in frame.');
        scanTimerRef.current = window.setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0 && codes[0].rawValue) {
              setRawInput(codes[0].rawValue);
              setCameraStatus('QR code captured from camera feed.');
              stopCamera();
            }
          } catch {
            // ignore transient frame read errors
          }
        }, 400);
      } else {
        setCameraStatus('Camera active, but native BarcodeDetector is not enabled in this browser. Paste the scanned payload or upload an SVG tag.');
      }
    } catch {
      setCameraStatus('Camera permission denied or no camera detected. Use payload paste or label upload below.');
      stopCamera();
    }
  };

  const handleUploadLabelFile = async (file: File | null) => {
    if (!file) return;
    setCameraStatus(null);
    // If the user uploads an Orise printable SVG label, extract embedded Asset ID / Hostname cleanly
    if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
      const text = await file.text();
      const assetMatch = text.match(/AST-[A-Z0-9-]+/);
      const hostMatch = text.match(/[a-z0-9-]+\.kl[123]\.orise/i);
      if (assetMatch) {
        setRawInput(assetMatch[0]);
        setCameraStatus(`Extracted Asset ID ${assetMatch[0]} from uploaded SVG label.`);
        return;
      }
      if (hostMatch) {
        setRawInput(hostMatch[0]);
        setCameraStatus(`Extracted hostname ${hostMatch[0]} from uploaded SVG label.`);
        return;
      }
    }

    // Attempt native BarcodeDetector on raster images (PNG/JPEG/WebP)
    const BarcodeDetectorCtor = (
      window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => {
          detect: (source: ImageBitmap) => Promise<Array<{ rawValue: string }>>;
        };
      }
    ).BarcodeDetector;
    if (BarcodeDetectorCtor && typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file);
        const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
        const codes = await detector.detect(bitmap);
        bitmap.close();
        if (codes.length > 0 && codes[0].rawValue) {
          setRawInput(codes[0].rawValue);
          setCameraStatus('Decoded QR payload from uploaded image.');
          return;
        }
      } catch {
        // fall through
      }
    }
    setCameraStatus('Could not decode a QR tag from that file. Paste the Console Link, JSON Tag, or Asset ID directly.');
  };

  const handleLoadSample = (srv: ServerNode, mode: 'console-link' | 'json-tag') => {
    const siteCode = SITE_META_MAP[activeSiteId].code;
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://orise-dcim.local';
    const tagData = buildServerQrTagData(srv, activeSiteId, siteCode, origin);
    setRawInput(buildServerQrPayload(tagData, mode));
    setCameraStatus(null);
  };

  const handleOpenMatched = () => {
    if (!resolvedMatch) return;
    onResolveServer(resolvedMatch.siteId, resolvedMatch.server.id);
    setRawInput('');
    onClose();
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-scanner-modal-title"
      data-testid="qr-scanner-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50"
    >
      <div className="w-full max-w-xl bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <QrCode className="w-4 h-4 text-[#009530] dark:text-[#3DCD58] shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2
                id="qr-scanner-modal-title"
                className="text-sm font-semibold text-slate-900 dark:text-slate-50 truncate"
              >
                Scan Server Asset QR Code
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Decode a chassis QR tag via camera, uploaded label, or handheld scanner input
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close QR asset scanner"
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Camera & Upload Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="qr-camera-toggle-btn"
              onClick={cameraActive ? stopCamera : handleStartCamera}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                cameraActive
                  ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {cameraActive ? (
                <>
                  <CameraOff className="w-3.5 h-3.5" aria-hidden="true" />
                  Stop Camera
                </>
              ) : (
                <>
                  <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                  Start Camera Scanner
                </>
              )}
            </button>

            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap">
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Upload Label SVG / Image</span>
              <input
                type="file"
                accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => {
                  void handleUploadLabelFile(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          {cameraActive && (
            <div className="rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950">
              <video
                ref={videoRef}
                muted
                playsInline
                className="w-full h-44 object-cover"
              />
            </div>
          )}

          {cameraStatus && (
            <div
              role="status"
              className="text-xs px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300"
            >
              {cameraStatus}
            </div>
          )}

          {/* Direct Handheld / Paste Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="qr-payload-input"
              className="block text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              Scanned QR Payload (Console Link, JSON Asset Tag, Asset ID, or Hostname)
            </label>
            <textarea
              id="qr-payload-input"
              data-testid="qr-payload-input"
              rows={3}
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder='Paste console URL, {"assetId":"AST-KL1-..."}, AST-KL1-B-R01-01-B0101, or hostname...'
              className="w-full px-3 py-2 font-mono text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
            />
          </div>

          {/* Quick Live Test Scans */}
          {sampleServers.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Simulate handheld scan ({SITE_META_MAP[activeSiteId].code} live assets)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sampleServers.map((srv, idx) => (
                  <button
                    key={srv.id}
                    type="button"
                    data-testid={`qr-sample-btn-${idx}`}
                    onClick={() => handleLoadSample(srv, idx === 1 ? 'json-tag' : 'console-link')}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-[#009530] hover:text-[#007A27] dark:hover:text-[#3DCD58] cursor-pointer transition-colors"
                  >
                    <Search className="w-3 h-3" aria-hidden="true" />
                    {srv.hostname}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Decoded Result Card */}
          {parsed && (
            <div
              data-testid="qr-scan-result"
              className={`p-3.5 rounded-md border ${
                resolvedMatch
                  ? 'border-emerald-300 dark:border-emerald-800/80 bg-emerald-50/60 dark:bg-emerald-950/30'
                  : 'border-amber-300 dark:border-amber-800/80 bg-amber-50/60 dark:bg-amber-950/30'
              }`}
            >
              {resolvedMatch ? (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="w-4 h-4 text-[#009530] dark:text-[#3DCD58] shrink-0" aria-hidden="true" />
                      <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {resolvedMatch.server.hostname}
                      </span>
                    </div>
                    <NodeStatusLabel status={resolvedMatch.server.status} />
                  </div>
                  <div className="text-xs font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                    {resolvedMatch.assetId} · {resolvedMatch.siteCode} · {resolvedMatch.server.rackId} U{resolvedMatch.server.uStart}–U{resolvedMatch.server.uStart + resolvedMatch.server.uHeight - 1}
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Format: {parsed.sourceFormat} · Live power {resolvedMatch.server.powerW} W · Exhaust {resolvedMatch.server.tempC.toFixed(1)}°C
                    </span>
                    <button
                      type="button"
                      data-testid="qr-open-matched-server-btn"
                      onClick={handleOpenMatched}
                      className="px-3 py-1.5 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Open Server Drawer
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-amber-800 dark:text-amber-300">
                  {parsed.valid
                    ? `Decoded ${parsed.assetId || parsed.hostname || parsed.serverId}, but no matching server was found in KL1, KL2, or KL3.`
                    : parsed.error}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  ChevronDown,
  ChevronUp,
  Flame,
  Layers,
  LayoutGrid,
  RotateCcw,
  Thermometer,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import { BmsState } from '../engine/bmsTypes';
import { computeBmsRackPowerStats } from '../engine/rackPowerEngine';
import { SiteMeta } from '../engine/sites';
import { FacilitySummary, HallId, HallPowerPolicyMap, RackDefinition, ServerNode } from '../engine/types';
import {
  BATTERY_ROOM_PLACEMENTS,
  CAMERA_PRESET_LIST,
  COLD_AISLE_SLA_SENSOR_PLACEMENTS,
  SelectedTwinAsset,
  TELECOM_ROOM_PLACEMENTS,
  TwinCameraPresetId,
  TwinOverlayMode,
  computeBatteryRoomMetrics,
  computeColdAisleSlaSensorMetrics,
  computeRack3DMetrics,
  computeTelecomRoomMetrics,
  getSiteBuildingLayout,
  getSiteCameraPresets,
} from '../engine/twin3dLayout';
import {
  HEATMAP_DEFAULT_SLICE_M,
  HEATMAP_MAX_SLICE_M,
  HEATMAP_MIN_SLICE_M,
  computeThermalHeatmapGrid,
  getSliceHeightLabel,
} from '../engine/thermalHeatmap3d';
import {
  TwinInteractableUserData,
  TwinSceneHandles,
  buildDigitalTwinScene,
} from './twin3d/sceneBuilder';

interface DigitalTwin3DViewProps {
  siteMeta: SiteMeta;
  servers: ServerNode[];
  racks: RackDefinition[];
  bms: BmsState;
  summary: FacilitySummary;
  darkMode: boolean;
  rackPowerAdjustmentsKw?: Record<string, number>;
  hallPowerPolicies?: HallPowerPolicyMap;
  locateLedRackIds?: string[];
  onInspectServer: (serverId: string) => void;
  onOpenBms: (equipmentId?: string) => void;
  onFocusRackOnMap?: (hallId: HallId, rackId: string) => void;
}

const _camTargetPos = new THREE.Vector3();
const _camTargetLook = new THREE.Vector3();
const _pointerNdc = new THREE.Vector2();

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const unmasked = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '') : '';
    const unmaskedVendor = ext ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) ?? '') : '';
    const rendererStr = String(gl.getParameter(gl.RENDERER) ?? '');
    const vendorStr = String(gl.getParameter(gl.VENDOR) ?? '');
    const gpu = `${unmasked} ${unmaskedVendor} ${rendererStr} ${vendorStr}`;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render|Mesa|WARP/i.test(gpu);
  } catch {
    return true;
  }
}

export function DigitalTwin3DView({
  siteMeta,
  servers,
  racks,
  bms,
  summary,
  darkMode,
  rackPowerAdjustmentsKw,
  hallPowerPolicies,
  locateLedRackIds = [],
  onInspectServer,
  onOpenBms,
  onFocusRackOnMap,
}: DigitalTwin3DViewProps) {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  const [activePreset, setActivePreset] = useState<TwinCameraPresetId>('cutaway');
  const [overlay, setOverlay] = useState<TwinOverlayMode>('standard');
  const [showSlaSensors, setShowSlaSensors] = useState<boolean>(true);
  const [showOverCapBeacons, setShowOverCapBeacons] = useState<boolean>(true);
  const [heatmapSliceM, setHeatmapSliceM] = useState<number>(HEATMAP_DEFAULT_SLICE_M);
  const [showHeatmapSlice, setShowHeatmapSlice] = useState<boolean>(true);
  const [showHeatmapPlumes, setShowHeatmapPlumes] = useState<boolean>(true);
  const [showHeatmapContours, setShowHeatmapContours] = useState<boolean>(true);
  const [showAirflowVectors, setShowAirflowVectors] = useState<boolean>(false);
  const [cutawayPct, setCutawayPct] = useState<number>(100);
  const [basementCutawayOpen, setBasementCutawayOpen] = useState<boolean>(false);
  const [dockOpen, setDockOpen] = useState<boolean>(true);
  const [selectedAsset, setSelectedAsset] = useState<SelectedTwinAsset | null>(null);
  const [renderedFrames, setRenderedFrames] = useState<number>(0);

  const siteLayout = useMemo(() => getSiteBuildingLayout(siteMeta.id), [siteMeta.id]);
  const siteCameraPresets = useMemo(() => getSiteCameraPresets(siteMeta.id), [siteMeta.id]);

  const rackMetricsMap = useMemo(() => computeRack3DMetrics(racks, servers, bms), [racks, servers, bms]);
  const rackPowerStatsMap = useMemo(
    () =>
      computeBmsRackPowerStats(racks, bms, servers, {
        rackPowerAdjustmentsKw,
        hallPowerPolicies,
      }),
    [racks, bms, servers, rackPowerAdjustmentsKw, hallPowerPolicies]
  );
  const overCapRackIds = useMemo(
    () => racks.filter((r) => rackPowerStatsMap[r.id]?.exceedsCapacity).map((r) => r.id),
    [racks, rackPowerStatsMap]
  );
  const slaSensorMetricsMap = useMemo(
    () => computeColdAisleSlaSensorMetrics(bms, servers),
    [bms, servers]
  );
  const heatmapGrid = useMemo(
    () =>
      overlay === 'thermal'
        ? computeThermalHeatmapGrid(racks, servers, bms, heatmapSliceM, rackMetricsMap)
        : null,
    [overlay, racks, servers, bms, heatmapSliceM, rackMetricsMap]
  );

  // Refs synced to imperative Three.js controller so React state never tears down WebGL
  const livePropsRef = useRef({
    siteMeta,
    servers,
    racks,
    bms,
    overlay,
    showSlaSensors,
    showOverCapBeacons,
    rackPowerAdjustmentsKw,
    hallPowerPolicies,
    locateLedRackIds,
    heatmapSliceM,
    showHeatmapSlice,
    showHeatmapPlumes,
    showHeatmapContours,
    showAirflowVectors,
    heatmapGrid,
    darkMode,
    selectedAsset,
    activePreset,
  });
  livePropsRef.current = {
    siteMeta,
    servers,
    racks,
    bms,
    overlay,
    showSlaSensors,
    showOverCapBeacons,
    rackPowerAdjustmentsKw,
    hallPowerPolicies,
    locateLedRackIds,
    heatmapSliceM,
    showHeatmapSlice,
    showHeatmapPlumes,
    showHeatmapContours,
    showAirflowVectors,
    heatmapGrid,
    darkMode,
    selectedAsset,
    activePreset,
  };

  const engineApiRef = useRef<{
    flyToPreset: (id: TwinCameraPresetId) => void;
    setTargetCutaway: (value01: number) => void;
    setBasementCutaway: (open: boolean) => void;
    setAirflowVectors: (visible: boolean) => void;
    syncSceneData: () => void;
    syncTheme: (isDark: boolean) => void;
    syncSignage: (tierLabel: string) => void;
  } | null>(null);

  const prevSiteIdRef = useRef<SiteMeta['id']>(siteMeta.id);
  const justMountedSiteRef = useRef<boolean>(true);

  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const switchedSite = prevSiteIdRef.current !== siteMeta.id;
    prevSiteIdRef.current = siteMeta.id;
    justMountedSiteRef.current = true;

    const isSoftwareGl = detectSoftwareWebGL();
    const initialW = Math.max(320, mountEl.clientWidth);
    const initialH = Math.max(320, mountEl.clientHeight);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, initialW / initialH, 0.4, 480);
    const activePresets = getSiteCameraPresets(siteMeta.id);
    const initialPresetId: TwinCameraPresetId = switchedSite
      ? 'campus'
      : livePropsRef.current.activePreset;
    if (switchedSite) {
      setActivePreset('campus');
      setCutawayPct(0);
      setBasementCutawayOpen(false);
    }
    const startPreset = activePresets[initialPresetId] ?? activePresets.cutaway;
    camera.position.set(startPreset.position.x, startPreset.position.y, startPreset.position.z);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(initialW, initialH);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mountEl.appendChild(renderer.domElement);

    // Mandatory Studio PBR Environment Reflection
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmrem.dispose();

    // Warm/Cool 3-point architectural lighting rig scaled to 60m x 94m hyperscale campus
    const hemiLight = new THREE.HemisphereLight(0xdcebff, 0x6b7280, 0.94);
    hemiLight.position.set(0, 75, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff5e4, 1.45);
    keyLight.position.set(55, 72, 48);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 10;
    keyLight.shadow.camera.far = 260;
    keyLight.shadow.camera.left = -105;
    keyLight.shadow.camera.right = 105;
    keyLight.shadow.camera.top = 105;
    keyLight.shadow.camera.bottom = -105;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xc7e0ff, 0.55);
    rimLight.position.set(-55, 42, -45);
    scene.add(rimLight);

    // OrbitControls (damping off on software WebGL per skill guidelines)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 6.0;
    controls.maxDistance = 235;
    controls.target.set(startPreset.target.x, startPreset.target.y, startPreset.target.z);
    controls.update();

    // Build procedural composite 3D Data Center scene tailored to active site architecture (KL1 / KL2 / KL3)
    const sceneHandles: TwinSceneHandles = buildDigitalTwinScene(
      scene,
      livePropsRef.current.racks,
      livePropsRef.current.servers,
      livePropsRef.current.bms,
      isSoftwareGl,
      livePropsRef.current.darkMode,
      livePropsRef.current.siteMeta.tierLabel,
      siteMeta.id
    );
    const initialCutaway01 = startPreset.defaultCutaway;
    sceneHandles.applyCutaway(initialCutaway01);
    sceneHandles.updateLiveTelemetry(
      livePropsRef.current.racks,
      livePropsRef.current.servers,
      livePropsRef.current.bms,
      livePropsRef.current.overlay,
      livePropsRef.current.selectedAsset,
      livePropsRef.current.showSlaSensors,
      {
        sliceHeightM: livePropsRef.current.heatmapSliceM,
        showSlicePlane: livePropsRef.current.showHeatmapSlice,
        showPlumes: livePropsRef.current.showHeatmapPlumes,
        showContours: livePropsRef.current.showHeatmapContours,
      },
      livePropsRef.current.heatmapGrid,
      livePropsRef.current.showOverCapBeacons,
      livePropsRef.current.rackPowerAdjustmentsKw,
      livePropsRef.current.hallPowerPolicies,
      livePropsRef.current.locateLedRackIds
    );

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Smooth transition state (camera glide + roof cutaway lift)
    let cameraAnimating = false;
    let currentCutaway = initialCutaway01;
    let targetCutaway = initialCutaway01;
    let currentPresetId: TwinCameraPresetId = initialPresetId;
    let lastTimestamp = performance.now();
    let frameCounter = 0;

    // On-demand coalesced rendering with software-WebGL afterDraw fence sync
    let disposed = false;
    let frameId = 0;
    let timeoutId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let suppressControlEvent = false;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext | null;
      if (!gl || typeof gl.fenceSync !== 'function') {
        timeoutId = window.setTimeout(cb, 24);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const startedAt = performance.now();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED && performance.now() - startedAt < 140) {
          timeoutId = window.setTimeout(poll, 4);
        } else {
          if (sync) gl.deleteSync(sync);
          timeoutId = window.setTimeout(cb, 12);
        }
      };
      timeoutId = window.setTimeout(poll, 4);
    };

    const requestRender = () => {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = window.requestAnimationFrame((now) => {
        if (disposed) return;
        renderDirty = false;
        const dt = Math.min(0.1, Math.max(0.008, (now - lastTimestamp) / 1000));
        lastTimestamp = now;

        let needsAnotherFrame = false;

        // Smooth camera transition (exponential damping on GPU, crisp snap-assist on software GL)
        if (cameraAnimating) {
          const lambda = isSoftwareGl ? 14 : 7.5;
          camera.position.x = THREE.MathUtils.damp(camera.position.x, _camTargetPos.x, lambda, dt);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, _camTargetPos.y, lambda, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, _camTargetPos.z, lambda, dt);
          controls.target.x = THREE.MathUtils.damp(controls.target.x, _camTargetLook.x, lambda, dt);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, _camTargetLook.y, lambda, dt);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, _camTargetLook.z, lambda, dt);

          const posErr = camera.position.distanceTo(_camTargetPos);
          const lookErr = controls.target.distanceTo(_camTargetLook);
          if (posErr < 0.08 && lookErr < 0.08) {
            camera.position.copy(_camTargetPos);
            controls.target.copy(_camTargetLook);
            cameraAnimating = false;
          } else {
            needsAnotherFrame = true;
          }
        }

        // Smooth cutaway roof lift transition
        if (Math.abs(currentCutaway - targetCutaway) > 0.004) {
          currentCutaway = THREE.MathUtils.damp(
            currentCutaway,
            targetCutaway,
            isSoftwareGl ? 16 : 9,
            dt
          );
          if (Math.abs(currentCutaway - targetCutaway) <= 0.004) {
            currentCutaway = targetCutaway;
          } else {
            needsAnotherFrame = true;
          }
          sceneHandles.applyCutaway(currentCutaway);
        }

        if (livePropsRef.current.showAirflowVectors) {
          sceneHandles.animateAirflow(now * 0.001);
          if (!isSoftwareGl) {
            needsAnotherFrame = true;
          }
        }

        suppressControlEvent = true;
        controls.update();
        suppressControlEvent = false;
        renderer.render(scene, camera);

        frameCounter += 1;
        mountEl.dataset.renderSeq = String(frameCounter);
        mountEl.dataset.renderedPreset = currentPresetId;
        mountEl.dataset.renderedCutaway = String(Math.round(currentCutaway * 100));
        mountEl.dataset.renderedOverlay = livePropsRef.current.overlay;
        mountEl.dataset.renderedSliceM = livePropsRef.current.heatmapSliceM.toFixed(1);
        mountEl.dataset.renderedCamera = `${camera.position.x.toFixed(1)},${camera.position.y.toFixed(1)},${camera.position.z.toFixed(1)}`;
        if (frameCounter <= 2) {
          setRenderedFrames(frameCounter);
        }

        const done = () => {
          if (disposed) return;
          renderBusy = false;
          if (renderDirty || needsAnotherFrame) {
            requestRender();
          }
        };

        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };

    // Cancel camera glide immediately when user grabs OrbitControls
    const onControlStart = () => {
      cameraAnimating = false;
    };
    const onControlChange = () => {
      if (suppressControlEvent) return;
      requestRender();
    };
    controls.addEventListener('start', onControlStart);
    controls.addEventListener('change', onControlChange);

    // Raycast selection (click vs drag detection)
    const raycaster = new THREE.Raycaster();
    let downX = 0;
    let downY = 0;

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      _pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(_pointerNdc, camera);
      const hits = raycaster.intersectObjects(sceneHandles.interactables, false);
      if (hits.length > 0) {
        const hit = hits[0];
        if (hit.object === sceneHandles.overCapHitInst && hit.instanceId !== undefined) {
          const rackId = sceneHandles.overCapBeaconRackIds[hit.instanceId];
          const rackDef = livePropsRef.current.racks.find((r) => r.id === rackId);
          if (rackDef) {
            setSelectedAsset({
              kind: 'rack',
              id: rackDef.id,
              label: `${rackDef.name} (${rackDef.id})`,
              subtitle: `${rackDef.hallName} · ${rackDef.row} · OVER CAPACITY`,
            });
          }
          return;
        }
        if (hit.object === sceneHandles.slaHitInst && hit.instanceId !== undefined) {
          const sp = sceneHandles.slaSensorPlacements[hit.instanceId];
          if (sp) {
            setSelectedAsset({
              kind: 'sla_sensor',
              id: sp.sensorId,
              label: sp.sensorId,
              subtitle: `Hall ${sp.hallCode} · Row ${String(sp.rowNumber).padStart(2, '0')} · ${sp.positionLabel} · ${sp.redundancyPath}`,
            });
          }
          return;
        }
        if (hit.object === sceneHandles.rackBodiesInst && hit.instanceId !== undefined) {
          const rackDef = sceneHandles.rackIndexToDef[hit.instanceId];
          if (rackDef) {
            setSelectedAsset({
              kind: 'rack',
              id: rackDef.id,
              label: `${rackDef.name} (${rackDef.id})`,
              subtitle: `${rackDef.hallName} · ${rackDef.row}`,
            });
          }
          return;
        }
        const data = hit.object.userData as TwinInteractableUserData | undefined;
        if (data?.asset) {
          setSelectedAsset(data.asset);
        }
      } else {
        setSelectedAsset(null);
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // Responsive container resize
    const resizeObserver = new ResizeObserver(() => {
      if (disposed) return;
      const w = Math.max(320, mountEl.clientWidth);
      const h = Math.max(320, mountEl.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    });
    resizeObserver.observe(mountEl);

    engineApiRef.current = {
      flyToPreset: (id: TwinCameraPresetId) => {
        const preset = activePresets[id];
        currentPresetId = id;
        _camTargetPos.set(preset.position.x, preset.position.y, preset.position.z);
        _camTargetLook.set(preset.target.x, preset.target.y, preset.target.z);
        cameraAnimating = true;
        targetCutaway = preset.defaultCutaway;
        if (isSoftwareGl) {
          // On CPU WebGL, jump immediately so camera transitions & roof visibility complete on the next frame
          camera.position.copy(_camTargetPos);
          controls.target.copy(_camTargetLook);
          suppressControlEvent = true;
          controls.update();
          suppressControlEvent = false;
          cameraAnimating = false;
          currentCutaway = targetCutaway;
          sceneHandles.applyCutaway(currentCutaway);
        }
        requestRender();
      },
      setTargetCutaway: (value01: number) => {
        targetCutaway = THREE.MathUtils.clamp(value01, 0, 1);
        if (isSoftwareGl) {
          currentCutaway = targetCutaway;
          sceneHandles.applyCutaway(currentCutaway);
        }
        requestRender();
      },
      setBasementCutaway: (open: boolean) => {
        sceneHandles.applyBasementCutaway(open);
        requestRender();
      },
      setAirflowVectors: (visible: boolean) => {
        sceneHandles.setAirflowVisible(visible);
        requestRender();
      },
      syncSceneData: () => {
        const cur = livePropsRef.current;
        sceneHandles.updateLiveTelemetry(
          cur.racks,
          cur.servers,
          cur.bms,
          cur.overlay,
          cur.selectedAsset,
          cur.showSlaSensors,
          {
            sliceHeightM: cur.heatmapSliceM,
            showSlicePlane: cur.showHeatmapSlice,
            showPlumes: cur.showHeatmapPlumes,
            showContours: cur.showHeatmapContours,
          },
          cur.heatmapGrid,
          cur.showOverCapBeacons,
          cur.rackPowerAdjustmentsKw,
          cur.hallPowerPolicies,
          cur.locateLedRackIds
        );
        requestRender();
      },
      syncTheme: (isDark: boolean) => {
        sceneHandles.applyTheme(isDark);
        requestRender();
      },
      syncSignage: (tierLabel: string) => {
        sceneHandles.updateSiteSignage(tierLabel);
        requestRender();
      },
    };

    // Trigger initial render
    requestRender();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.removeEventListener('change', onControlChange);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      sceneHandles.dispose();
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mountEl) {
        mountEl.removeChild(renderer.domElement);
      }
      engineApiRef.current = null;
    };
  }, [siteMeta.id]);

  // Push live telemetry, overlay, 3D thermal heat map settings, SLA visibility, and selection without tearing down WebGL
  useEffect(() => {
    if (justMountedSiteRef.current) {
      justMountedSiteRef.current = false;
      return;
    }
    engineApiRef.current?.syncSceneData();
  }, [
    servers,
    racks,
    bms,
    overlay,
    showSlaSensors,
    showOverCapBeacons,
    rackPowerAdjustmentsKw,
    hallPowerPolicies,
    locateLedRackIds,
    heatmapSliceM,
    showHeatmapSlice,
    showHeatmapPlumes,
    showHeatmapContours,
    heatmapGrid,
    selectedAsset,
  ]);

  // Push light/dark theme updates
  useEffect(() => {
    if (justMountedSiteRef.current) return;
    engineApiRef.current?.syncTheme(darkMode);
  }, [darkMode]);

  // Push site signage update when switching between KL1, KL2, KL3
  useEffect(() => {
    setSelectedAsset(null);
    if (justMountedSiteRef.current) return;
    engineApiRef.current?.syncSignage(siteMeta.tierLabel);
  }, [siteMeta]);

  useEffect(() => {
    engineApiRef.current?.setBasementCutaway(basementCutawayOpen);
  }, [basementCutawayOpen]);

  useEffect(() => {
    engineApiRef.current?.setAirflowVectors(showAirflowVectors);
  }, [showAirflowVectors]);

  const handleSelectPreset = useCallback(
    (presetId: TwinCameraPresetId) => {
      const preset = siteCameraPresets[presetId];
      setActivePreset(presetId);
      setCutawayPct(Math.round(preset.defaultCutaway * 100));
      if (presetId === 'basement-fuel') {
        setBasementCutawayOpen(true);
      } else if (presetId === 'campus' || presetId === 'chiller-plant') {
        setBasementCutawayOpen(false);
      }
      engineApiRef.current?.flyToPreset(presetId);
    },
    [siteCameraPresets]
  );

  const handleCutawayChange = useCallback((pct: number) => {
    setCutawayPct(pct);
    engineApiRef.current?.setTargetCutaway(pct / 100);
  }, []);

  // Keyboard shortcuts: H hides/shows bottom dock, R resets camera
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'h' || e.key === 'H') {
        setDockOpen((prev) => !prev);
      } else if (e.key === 'r' || e.key === 'R') {
        handleSelectPreset('cutaway');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSelectPreset]);

  // Resolve live telemetry readout for the currently clicked 3D asset
  const selectedDetails = useMemo(() => {
    if (!selectedAsset) return null;
    if (selectedAsset.kind === 'sla_sensor') {
      const m = slaSensorMetricsMap[selectedAsset.id];
      return {
        metrics: m
          ? [
              { label: 'Cold Aisle Temp', value: `${m.tempC.toFixed(1)}°C (SLA 18–27°C)` },
              { label: 'Rel. Humidity', value: `${m.humidityPct.toFixed(1)}% RH (SLA 40–60%)` },
              { label: 'Dew Point', value: `${m.dewPointC.toFixed(1)}°C` },
              { label: 'SLA State', value: m.overallStatus.toUpperCase() },
            ]
          : [],
        actionLabel: 'Open BMS SLA Controls',
        onAction: () => onOpenBms(),
      };
    }
    if (selectedAsset.kind === 'rack') {
      const m = rackMetricsMap[selectedAsset.id];
      const ps = rackPowerStatsMap[selectedAsset.id];
      const rackDef = racks.find((r) => r.id === selectedAsset.id);
      const rackNodes = servers.filter((s) => s.rackId === selectedAsset.id);
      const hotNode = rackNodes.find((n) => n.id === m?.hottestServerId) ?? rackNodes[0] ?? null;
      return {
        metrics: ps
          ? [
              {
                label: 'BMS Power',
                value: `${ps.powerKw.toFixed(1)} / ${ps.effectiveLimitKw.toFixed(1)} kW (${ps.utilizationPct}%)`,
              },
              { label: 'Peak Exhaust', value: `${m?.peakTempC ?? 0}°C` },
              { label: 'Nodes', value: `${m?.serverCount ?? rackNodes.length} servers` },
            ]
          : m
          ? [
              { label: 'Power', value: `${m.powerKw} / ${m.powerCapacityKw} kW` },
              { label: 'Peak Exhaust', value: `${m.peakTempC}°C` },
              { label: 'Nodes', value: `${m.serverCount} servers` },
            ]
          : [],
        actionLabel: hotNode
          ? `Inspect ${hotNode.hostname.split('.')[0]}`
          : rackDef && onFocusRackOnMap
          ? 'Open 2D Rack Map'
          : null,
        onAction: hotNode
          ? () => onInspectServer(hotNode.id)
          : rackDef && onFocusRackOnMap
          ? () => onFocusRackOnMap(rackDef.hallId, rackDef.id)
          : null,
        secondaryActionLabel: hotNode && rackDef && onFocusRackOnMap ? '2D Rack Map' : null,
        onSecondaryAction:
          hotNode && rackDef && onFocusRackOnMap
            ? () => onFocusRackOnMap(rackDef.hallId, rackDef.id)
            : null,
      };
    }
    if (selectedAsset.kind === 'chiller') {
      const ch = bms.chillers.find((c) => c.id === selectedAsset.id);
      return {
        metrics: ch
          ? [
              { label: 'Cooling', value: `${(ch.coolingOutputKw / 1000).toFixed(2)} / ${(ch.capacityKw / 1000).toFixed(1)} MW` },
              { label: 'CHW Sup / Ret', value: `${ch.chwSupplyTempC.toFixed(1)}° / ${ch.chwReturnTempC.toFixed(1)}°C` },
              { label: 'Mode · COP', value: `${ch.mode} · COP ${ch.cop.toFixed(1)}` },
            ]
          : [],
        actionLabel: 'Inspect 3D Model',
        onAction: () => onOpenBms(selectedAsset.id),
      };
    }
    if (selectedAsset.kind === 'chw_tank_pump') {
      const ps = bms.chwTankPumpSets.find((p) => p.id === selectedAsset.id);
      return {
        metrics: ps
          ? [
              { label: 'Buffer Tank', value: `${(ps.tankCapacityLiters / 1000).toFixed(0)}k L · ${ps.tankLevelPct.toFixed(1)}% · ${ps.waterTempC.toFixed(1)}°C` },
              { label: 'Pump Set', value: `${ps.activePumps}/${ps.totalPumps} Active · ${ps.flowRateLps} L/s · ${ps.dischargePressureBar.toFixed(1)} bar` },
              { label: 'VFD / Mode', value: `${ps.vfdSpeedPct}% · ${ps.mode} · ${ps.bufferAutonomyMin}m buffer` },
            ]
          : [],
        actionLabel: 'Inspect 3D Model',
        onAction: () => onOpenBms(selectedAsset.id),
      };
    }
    if (selectedAsset.kind === 'crac') {
      const unit = bms.cracUnits.find((c) => c.id === selectedAsset.id);
      const isLiquid = unit?.coolingType === 'Liquid CDU';
      return {
        metrics: unit
          ? isLiquid
            ? [
                {
                  label: 'Coolant Sup / Ret',
                  value: `${(unit.coolantSupplyTempC ?? unit.supplyTempC).toFixed(1)}° / ${(unit.coolantReturnTempC ?? unit.returnTempC).toFixed(1)}°C`,
                },
                {
                  label: 'Flow · ΔP',
                  value: `${unit.coolantFlowLpm ?? 0} L/min · ${(unit.deltaPBar ?? 1.8).toFixed(2)} bar`,
                },
                {
                  label: 'Mode · Output',
                  value: `${unit.mode.toUpperCase()} · ${(unit.coolingOutputKw / 1000).toFixed(2)} MW`,
                },
              ]
            : [
                { label: 'Supply / Setpoint', value: `${unit.supplyTempC.toFixed(1)}°C / ${unit.setpointC.toFixed(1)}°C` },
                { label: 'Mode', value: unit.mode.toUpperCase() },
                { label: 'Fan / Output', value: `${unit.fanSpeedPct}% · ${unit.coolingOutputKw.toFixed(1)} kW` },
              ]
          : [],
        actionLabel: 'Inspect 3D Model',
        onAction: () => onOpenBms(selectedAsset.id),
      };
    }
    if (selectedAsset.kind === 'diesel_tank') {
      const tank = bms.dieselTanks.find((t) => t.id === selectedAsset.id);
      return {
        metrics: tank
          ? [
              { label: 'Volume', value: `${tank.currentLiters.toLocaleString()} / ${tank.capacityLiters.toLocaleString()} L (${tank.levelPct.toFixed(1)}%)` },
              { label: 'Transfer Pump', value: `${tank.transferPumpMode} · ${tank.supplyPressureBar.toFixed(1)} bar` },
              { label: 'Feeds Generators', value: tank.servedGenerators.join(', ') },
            ]
          : [],
        actionLabel: 'Inspect 3D Model',
        onAction: () => onOpenBms(selectedAsset.id),
      };
    }
    if (selectedAsset.kind === 'hv' || selectedAsset.kind === 'msb' || selectedAsset.kind === 'opswb') {
      const swg = bms.electricalSwitchgear.find((n) => n.id === selectedAsset.id);
      return {
        metrics: swg
          ? [
              { label: 'Active Load', value: `${(swg.activeLoadKw / 1000).toFixed(2)} MW / ${(swg.ratedKva / 1000).toFixed(0)} MVA` },
              { label: 'Elec IT / Mech Split', value: `${(swg.electricalServeKw / 1000).toFixed(2)} MW IT · ${(swg.mechanicalServeKw / 1000).toFixed(2)} MW Mech` },
              { label: 'Breaker · PF', value: `${swg.breakerState} · PF ${swg.powerFactor.toFixed(2)}` },
            ]
          : [],
        actionLabel: 'Inspect 3D Model',
        onAction: () => onOpenBms(selectedAsset.id),
      };
    }
    if (selectedAsset.kind === 'ups') {
      const ups = bms.upsSystems.find((u) => u.id === selectedAsset.id);
      const upsLoadPct = ups ? Math.round((ups.loadKw / Math.max(1, ups.capacityKw)) * 100) : 0;
      return {
        metrics: ups
          ? [
              { label: 'Mode', value: ups.mode },
              { label: 'Load', value: `${ups.loadKw.toFixed(1)} kW (${upsLoadPct}%)` },
              { label: 'Battery SoC', value: `${ups.batterySocPct.toFixed(1)}% · ${ups.runtimeMin}m` },
            ]
          : [],
        actionLabel: 'Inspect 3D Model',
        onAction: () => onOpenBms(selectedAsset.id),
      };
    }
    if (selectedAsset.kind === 'generator') {
      const gen = bms.generators.find((g) => g.id === selectedAsset.id);
      return {
        metrics: gen
          ? [
              { label: 'Status', value: gen.state },
              { label: 'Output', value: `${gen.outputKw.toFixed(1)} / ${gen.ratedKw} kW` },
              { label: 'Diesel Tank', value: `${gen.fuelLevelPct.toFixed(1)}%` },
            ]
          : [],
        actionLabel: 'Inspect 3D Model',
        onAction: () => onOpenBms(selectedAsset.id),
      };
    }
    if (selectedAsset.kind === 'telecom_room') {
      const room = TELECOM_ROOM_PLACEMENTS.find((r) => r.roomId === selectedAsset.id);
      const m = room ? computeTelecomRoomMetrics(room, servers, bms) : null;
      return {
        metrics:
          room && m
            ? [
                {
                  label: 'Optical Load',
                  value: `${m.throughputTbps.toFixed(1)} / ${m.capacityTbps} Tbps (${m.utilizationPct}%)`,
                },
                {
                  label: 'Cross-Connects',
                  value: `${m.activeCrossConnects.toLocaleString()} active · ${m.opticalLossDb.toFixed(2)} dB loss`,
                },
                {
                  label: 'Interconnect',
                  value: m.carrierOrUplinkSummary,
                },
                {
                  label: 'Room Climate',
                  value: `${m.roomTempC.toFixed(1)}°C · ${m.roomHumidityPct.toFixed(1)}% RH · ${room.redundancyPath}`,
                },
              ]
            : [],
        actionLabel: 'Focus Telecom Wing',
        onAction: () => handleSelectPreset('telecom-rooms'),
      };
    }
    if (selectedAsset.kind === 'admin_office') {
      return {
        metrics: [
          { label: 'On-Duty Staff', value: 'Shift A · 6 Engineers + NOC Lead' },
          { label: 'Spaces', value: 'Reception · 6 Desks · Glazed Conference Room' },
          { label: 'Access', value: 'Biometric Mantrap → Data Hall Bridge' },
          { label: 'Climate', value: '22.0°C · 45% RH' },
        ],
        actionLabel: 'Focus Admin & Walkway',
        onAction: () => handleSelectPreset('admin-office'),
      };
    }
    if (selectedAsset.kind === 'datahall_walkway') {
      return {
        metrics: [
          { label: 'Route', value: 'Admin Office → West Mantrap → Halls A, B, C, D' },
          { label: 'Enclosure', value: 'Glazed Security Bridge · 4 Hall Portals' },
          { label: 'Flooring & Safety', value: 'ESD Anti-Static Lane · Illuminated Guide Strips' },
        ],
        actionLabel: 'Focus Admin & Walkway',
        onAction: () => handleSelectPreset('admin-office'),
      };
    }
    if (selectedAsset.kind === 'battery_room') {
      const room = BATTERY_ROOM_PLACEMENTS.find((r) => r.roomId === selectedAsset.id);
      const m = room ? computeBatteryRoomMetrics(room, bms) : null;
      return {
        metrics:
          room && m
            ? [
                {
                  label: 'Bank SoC & Autonomy',
                  value: `${m.avgSocPct.toFixed(1)}% SoC · ${m.minRuntimeMin}m @ ${(m.totalUpsLoadKw / 1000).toFixed(2)} MW`,
                },
                {
                  label: 'DC Bus Output',
                  value: `${m.dcVoltageV.toFixed(1)}V DC · ${m.dcCurrentA} A`,
                },
                {
                  label: 'Operating Mode',
                  value: `${m.operatingMode} · ${m.roomTempC.toFixed(1)}°C`,
                },
                {
                  label: 'Feeds UPS',
                  value: `${room.servedUpsIds.map((id) => id.toUpperCase()).join(', ')} (${room.rackCount} Li-Ion Racks · ${room.capacityKwh} kWh)`,
                },
              ]
            : [],
        actionLabel: room ? 'Open BMS UPS Controls' : null,
        onAction: room ? () => onOpenBms(room.servedUpsIds[0]) : null,
      };
    }
    return null;
  }, [selectedAsset, rackMetricsMap, slaSensorMetricsMap, servers, bms, onInspectServer, onOpenBms, handleSelectPreset]);

  const currentModeLabel =
    activePreset === 'telecom-rooms'
      ? `${siteMeta.code} · MDF · Network · Meet-Me Room (MMR)`
      : activePreset === 'admin-office'
      ? `${siteMeta.code} · ${siteLayout.adminOffice.name} (${siteLayout.adminWingSide} Wing)`
      : activePreset === 'battery-rooms'
      ? `${siteMeta.code} · 2N Battery Rooms (540V DC) → UPS-A/B`
      : activePreset === 'chiller-plant'
      ? `${siteMeta.code} Rooftop Chiller Plant (2 Water + 2×180kL Square Tanks & Pump Sets + 14 Air)`
      : activePreset === 'basement-fuel'
      ? `${siteMeta.code} Basement B1 Diesel Vault (8 Tanks · 400,000 L → 8 Generators)`
      : activePreset === 'mep'
      ? `${siteMeta.code} Electrical Chain (HV → MSB → UPS → OPSWB → IT & Mechanical)`
      : activePreset === 'hall-b'
      ? `${siteMeta.code} · Hall B · Direct-to-Chip Liquid Cooling CDU`
      : cutawayPct <= 15
      ? `${siteMeta.code} · ${siteLayout.architectureName}`
      : activePreset.startsWith('hall-')
      ? `${siteMeta.code} · ${siteCameraPresets[activePreset].label} Interior`
      : `${siteMeta.code} Data Center Cutaway · ${siteLayout.architectureName}`;

  return (
    <div
      data-testid="twin3d-viewport"
      data-site={siteMeta.id}
      data-building-style={siteLayout.styleId}
      data-preset={activePreset}
      data-overlay={overlay}
      data-heatmap-active={overlay === 'thermal' ? 'true' : 'false'}
      data-heatmap-slice-m={heatmapSliceM.toFixed(1)}
      data-heatmap-peak-c={heatmapGrid ? heatmapGrid.hottestRackTempC.toFixed(1) : ''}
      data-cutaway={cutawayPct}
      data-basement-cutaway={basementCutawayOpen ? 'open' : 'closed'}
      data-hall-count="4"
      data-rack-count={racks.length}
      data-sla-sensor-count={COLD_AISLE_SLA_SENSOR_PLACEMENTS.length}
      data-sla-sensors-visible={showSlaSensors || overlay === 'sla' ? 'true' : 'false'}
      data-overcap-beacon-count={overCapRackIds.length}
      data-overcap-beacons-visible={showOverCapBeacons ? 'true' : 'false'}
      data-airflow-vectors={showAirflowVectors ? 'true' : 'false'}
      data-selected-asset={selectedAsset?.id ?? ''}
      data-rendered-frames={renderedFrames}
      className="relative w-full h-[calc(100vh-7.5rem)] min-h-[540px] rounded-md overflow-hidden border border-slate-200 dark:border-slate-800 bg-[#E4EBF3] dark:bg-[#0F141B] select-none"
    >
      {/* Dedicated isolated WebGL canvas mount */}
      <div ref={canvasMountRef} data-testid="twin3d-canvas" className="absolute inset-0" />

      {/* Minimal Top-Left Context Badge (no mid-side occlusion, no backdrop-blur) */}
      <div className="pointer-events-none absolute top-3.5 left-3.5 right-3.5 flex items-start justify-between gap-3 z-10">
        <div className="pointer-events-auto bg-white/95 dark:bg-[#1B2026]/95 border border-slate-200 dark:border-slate-700 rounded-md px-3.5 py-2 shadow-sm max-w-[600px]">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#009530] dark:text-[#3DCD58] shrink-0" aria-hidden="true" />
            <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-50 truncate">
              {currentModeLabel}
            </h1>
          </div>
          <p className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
            {siteMeta.label} · {siteLayout.adminWingSide} Admin · 4 Halls · {racks.length.toLocaleString()} Racks · {(summary.totalItLoadKw / 1000).toFixed(2)} MW
            {overCapRackIds.length > 0 && (
              <span className="ml-1.5 font-semibold text-red-600 dark:text-red-400">
                · ! {overCapRackIds.length} Over Cap
              </span>
            )}
            {locateLedRackIds.length > 0 && (
              <span
                data-testid="twin3d-locate-led-status"
                className="ml-1.5 font-semibold text-blue-600 dark:text-blue-400"
              >
                · Locate LED: {locateLedRackIds.slice(0, 3).join(', ')}
              </span>
            )}
          </p>
        </div>

        {/* Thermal Heat Map / Power / Cold Aisle SLA Scale Legend (only visible when overlay active) */}
        {overlay !== 'standard' && (
          <div
            aria-label="3D overlay legend"
            className="pointer-events-auto hidden sm:flex flex-col gap-1 bg-white/95 dark:bg-[#1B2026]/95 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 shadow-sm text-[11px] font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap"
          >
            {overlay === 'thermal' ? (
              <>
                <div className="flex items-center justify-between gap-4">
                  <span className="font-sans font-semibold text-slate-900 dark:text-slate-100">
                    3D Thermal Heat Map · {heatmapSliceM.toFixed(1)}m ({getSliceHeightLabel(heatmapSliceM)})
                  </span>
                  {heatmapGrid && (
                    <span className="text-[11px] text-red-700 dark:text-red-400 font-semibold tabular-nums">
                      Peak {heatmapGrid.hottestRackTempC.toFixed(1)}°C ({heatmapGrid.hottestRackId})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-sky-700 dark:text-sky-400 tabular-nums">18°C</span>
                  <div
                    className="h-2 w-44 rounded-xs border border-slate-300/60 dark:border-slate-700"
                    style={{
                      background:
                        'linear-gradient(90deg, #1D4ED8 0%, #06B6D4 18%, #10B981 36%, #FACC15 58%, #F97316 78%, #DC2626 100%)',
                    }}
                    aria-hidden="true"
                  />
                  <span className="text-[10px] text-red-700 dark:text-red-400 tabular-nums">80°C+</span>
                  {heatmapGrid && (
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums ml-1">
                      Cold Aisle {heatmapGrid.coldAisleAvgC.toFixed(1)}°C · Avg {heatmapGrid.avgTempC.toFixed(1)}°C
                    </span>
                  )}
                </div>
              </>
            ) : overlay === 'sla' ? (
              <div className="flex items-center gap-2.5">
                <span className="font-sans font-medium">SLA (2/Row · 160)</span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#06B6D4]" aria-hidden="true" />
                  Compliant
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#D97706]" aria-hidden="true" />
                  Near Limit
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#DC2626]" aria-hidden="true" />
                  Breached
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <span className="font-sans font-medium">Rack Power Load</span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#0284C7]" aria-hidden="true" />
                  &lt;30%
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#3DCD58]" aria-hidden="true" />
                  50%
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#D97706]" aria-hidden="true" />
                  70%
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#DC2626]" aria-hidden="true" />
                  80%+
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Unified Collapsible Bottom Stack: Selected Asset Strip + Toggle + Control Dock */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-[min(920px,95%)] flex flex-col items-center pointer-events-none">
        {selectedAsset && selectedDetails && (
          <div
            role="region"
            aria-label="Selected 3D asset telemetry"
            className="pointer-events-auto mb-2 w-[min(680px,100%)] bg-white/96 dark:bg-[#1B2026]/96 border border-slate-200 dark:border-slate-700 rounded-md px-4 py-2.5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-50 truncate">
                  {selectedAsset.label}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {selectedAsset.subtitle}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                {selectedDetails.metrics.map((item) => (
                  <span key={item.label} className="text-slate-600 dark:text-slate-400">
                    {item.label}:{' '}
                    <strong className="font-mono font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                      {item.value}
                    </strong>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {'secondaryActionLabel' in selectedDetails &&
                selectedDetails.secondaryActionLabel &&
                selectedDetails.onSecondaryAction && (
                  <button
                    type="button"
                    onClick={selectedDetails.onSecondaryAction}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-sm border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
                    {selectedDetails.secondaryActionLabel}
                  </button>
                )}
              {selectedDetails.actionLabel && selectedDetails.onAction && (
                <button
                  type="button"
                  onClick={selectedDetails.onAction}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-sm bg-[#009530] hover:bg-[#007A27] text-white transition-colors cursor-pointer whitespace-nowrap"
                >
                  {selectedDetails.actionLabel}
                  <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedAsset(null)}
                aria-label="Clear selected 3D asset"
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-sm cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setDockOpen((prev) => !prev)}
          aria-expanded={dockOpen}
          className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium rounded-t-md bg-[#252A30] text-slate-200 hover:text-white border border-b-0 border-white/15 cursor-pointer"
        >
          {dockOpen ? (
            <>
              <ChevronDown className="w-3.5 h-3.5 text-[#3DCD58]" aria-hidden="true" />
              Hide Controls
            </>
          ) : (
            <>
              <ChevronUp className="w-3.5 h-3.5 text-[#3DCD58]" aria-hidden="true" />
              Show Controls
            </>
          )}
        </button>

        {dockOpen && (
          <div className="pointer-events-auto w-full bg-[#252A30]/96 text-slate-100 border border-white/15 rounded-md shadow-xl px-3.5 py-2.5 flex flex-col gap-2">
            {/* Row 1: Camera & Zone Presets */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div
                role="group"
                aria-label="3D camera views"
                className="flex flex-wrap items-center gap-1 max-w-full"
              >
                {CAMERA_PRESET_LIST.map((preset) => {
                  const active = activePreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset.id)}
                      className={`px-2 py-1 text-[11px] font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'bg-[#009530] text-white'
                          : 'bg-[#1D2126] text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              {/* Overlay Switcher */}
              <div
                role="group"
                aria-label="3D telemetry overlay"
                className="inline-flex items-center gap-1 bg-[#1D2126] p-0.5 rounded-sm shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setOverlay('standard')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-sm transition-colors cursor-pointer ${
                    overlay === 'standard'
                      ? 'bg-[#323840] text-[#3DCD58]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Layers className="w-3 h-3" aria-hidden="true" />
                  Standard
                </button>
                <button
                  type="button"
                  aria-pressed={overlay === 'thermal'}
                  onClick={() => setOverlay((prev) => (prev === 'thermal' ? 'standard' : 'thermal'))}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-sm transition-colors cursor-pointer whitespace-nowrap ${
                    overlay === 'thermal'
                      ? 'bg-orange-600/90 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Flame className="w-3 h-3" aria-hidden="true" />
                  Heat Map
                </button>
                <button
                  type="button"
                  onClick={() => setOverlay('power')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-sm transition-colors cursor-pointer ${
                    overlay === 'power'
                      ? 'bg-[#323840] text-[#3DCD58]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Zap className="w-3 h-3" aria-hidden="true" />
                  Power
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOverlay('sla');
                    setShowSlaSensors(true);
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-sm transition-colors cursor-pointer ${
                    overlay === 'sla'
                      ? 'bg-[#323840] text-[#06B6D4]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Thermometer className="w-3 h-3" aria-hidden="true" />
                  SLA (160)
                </button>
              </div>
            </div>

            {/* Row 2: Building Roof Cutaway Slider + SLA Sensor Visibility Toggle + Quick Focus */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1.5 border-t border-white/10">
              <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                <label
                  htmlFor="building-cutaway-slider"
                  className="text-[11px] font-medium text-slate-300 whitespace-nowrap"
                >
                  Roof / Shell Cutaway
                </label>
                <input
                  id="building-cutaway-slider"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={cutawayPct}
                  onChange={(e) => handleCutawayChange(Number(e.target.value))}
                  className="flex-1 accent-[#3DCD58] cursor-pointer h-1.5"
                />
                <span className="font-mono text-[11px] tabular-nums text-[#3DCD58] w-14 text-right shrink-0">
                  {cutawayPct === 0 ? 'Closed' : cutawayPct === 100 ? 'Open' : `${cutawayPct}%`}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  role="switch"
                  aria-checked={basementCutawayOpen}
                  onClick={() => setBasementCutawayOpen((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-sm border transition-colors cursor-pointer whitespace-nowrap ${
                    basementCutawayOpen
                      ? 'bg-amber-950/80 text-amber-200 border-amber-500/60'
                      : 'bg-[#1D2126] text-slate-400 border-white/10 hover:text-white'
                  }`}
                >
                  Basement Vault: {basementCutawayOpen ? 'Open' : 'Closed'}
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showSlaSensors || overlay === 'sla'}
                  onClick={() => {
                    if (overlay === 'sla') {
                      setOverlay('standard');
                      setShowSlaSensors(false);
                    } else {
                      setShowSlaSensors((prev) => !prev);
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-sm border transition-colors cursor-pointer whitespace-nowrap ${
                    showSlaSensors || overlay === 'sla'
                      ? 'bg-cyan-950/80 text-cyan-200 border-cyan-600/60'
                      : 'bg-[#1D2126] text-slate-400 border-white/10 hover:text-white'
                  }`}
                >
                  <Thermometer className="w-3 h-3" aria-hidden="true" />
                  SLA Probes: {showSlaSensors || overlay === 'sla' ? 'On (2/Row)' : 'Off'}
                </button>
                <button
                  type="button"
                  role="switch"
                  data-testid="twin3d-airflow-toggle"
                  aria-checked={showAirflowVectors}
                  onClick={() => setShowAirflowVectors((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-sm border transition-colors cursor-pointer whitespace-nowrap ${
                    showAirflowVectors
                      ? 'bg-sky-950/85 text-cyan-200 border-cyan-500/70'
                      : 'bg-[#1D2126] text-slate-400 border-white/10 hover:text-white'
                  }`}
                >
                  <Wind className="w-3 h-3" aria-hidden="true" />
                  Airflow Vectors: {showAirflowVectors ? 'On' : 'Off'}
                </button>
                <button
                  type="button"
                  role="switch"
                  data-testid="twin3d-beacons-toggle"
                  aria-checked={showOverCapBeacons}
                  onClick={() => setShowOverCapBeacons((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-sm border transition-colors cursor-pointer whitespace-nowrap ${
                    showOverCapBeacons && overCapRackIds.length > 0
                      ? 'bg-red-950/85 text-red-200 border-red-500/70'
                      : showOverCapBeacons
                      ? 'bg-slate-800 text-slate-200 border-slate-600'
                      : 'bg-[#1D2126] text-slate-400 border-white/10 hover:text-white'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                  Beacons ({overCapRackIds.length}): {showOverCapBeacons ? 'On' : 'Off'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAsset({
                      kind: 'rack',
                      id: 'B-R01-01',
                      label: 'Rack B01-01 (B-R01-01)',
                      subtitle: 'Hall B · AI & GPU Fabric · Row 01 · Liquid Cooled',
                    });
                    handleSelectPreset('hall-b');
                    setOverlay('thermal');
                  }}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-sm bg-red-950/70 hover:bg-red-900/80 text-red-200 border border-red-700/50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Hotspot (B-R01-01)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOverlay('standard');
                    setShowSlaSensors(true);
                    setShowOverCapBeacons(true);
                    setShowAirflowVectors(false);
                    setBasementCutawayOpen(false);
                    setSelectedAsset(null);
                    handleSelectPreset('cutaway');
                  }}
                  aria-label="Reset 3D view"
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-sm bg-[#1D2126] hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  Reset
                </button>
              </div>
            </div>
            {/* Row 2b: 3D Thermal Heat Map Controls (only when Heat Map overlay active) */}
            {overlay === 'thermal' && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1.5 border-t border-white/10">
                <div className="flex items-center gap-2.5 flex-1 min-w-[240px]">
                  <label
                    htmlFor="heatmap-slice-slider"
                    className="text-[11px] font-medium text-orange-300 whitespace-nowrap"
                  >
                    Heat Map Slice Height
                  </label>
                  <input
                    id="heatmap-slice-slider"
                    type="range"
                    min={HEATMAP_MIN_SLICE_M}
                    max={HEATMAP_MAX_SLICE_M}
                    step={0.1}
                    value={heatmapSliceM}
                    onChange={(e) => setHeatmapSliceM(Number(e.target.value))}
                    className="flex-1 accent-orange-500 cursor-pointer h-1.5"
                  />
                  <span className="font-mono text-[11px] tabular-nums text-orange-300 whitespace-nowrap shrink-0">
                    {heatmapSliceM.toFixed(1)}m · {getSliceHeightLabel(heatmapSliceM)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showHeatmapSlice}
                    onClick={() => setShowHeatmapSlice((prev) => !prev)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-sm border transition-colors cursor-pointer whitespace-nowrap ${
                      showHeatmapSlice
                        ? 'bg-emerald-950/80 text-emerald-200 border-emerald-600/60'
                        : 'bg-[#1D2126] text-slate-400 border-white/10 hover:text-white'
                    }`}
                  >
                    Airflow Slice: {showHeatmapSlice ? 'On' : 'Off'}
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showHeatmapPlumes}
                    onClick={() => setShowHeatmapPlumes((prev) => !prev)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-sm border transition-colors cursor-pointer whitespace-nowrap ${
                      showHeatmapPlumes
                        ? 'bg-orange-950/80 text-orange-200 border-orange-600/60'
                        : 'bg-[#1D2126] text-slate-400 border-white/10 hover:text-white'
                    }`}
                  >
                    3D Plumes: {showHeatmapPlumes ? 'On' : 'Off'}
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showHeatmapContours}
                    disabled={!showHeatmapSlice}
                    onClick={() => setShowHeatmapContours((prev) => !prev)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-sm border transition-colors whitespace-nowrap ${
                      !showHeatmapSlice
                        ? 'bg-[#1D2126] text-slate-600 border-white/5 cursor-not-allowed'
                        : showHeatmapContours
                        ? 'bg-sky-950/80 text-sky-200 border-sky-600/60 cursor-pointer'
                        : 'bg-[#1D2126] text-slate-400 border-white/10 hover:text-white cursor-pointer'
                    }`}
                  >
                    Isotherms: {showHeatmapContours ? 'On' : 'Off'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

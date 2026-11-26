import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  Box,
  ChevronDown,
  ChevronUp,
  Cpu,
  Fan,
  Layers,
  RotateCcw,
  Wrench,
  Zap,
} from 'lucide-react';
import {
  BmsEquipment3DItem,
  BmsEquipmentDiscipline,
  buildBmsEquipment3DCatalog,
} from '../engine/bms3dSpecs';
import { BmsState, CracMode } from '../engine/bmsTypes';
import {
  DetailedBmsModelHandle,
  buildDetailedBmsEquipmentModel,
} from './twin3d/bmsEquipmentModels';

interface BmsEquipment3DInspectorProps {
  bms: BmsState;
  darkMode: boolean;
  selectedEquipmentId: string;
  onSelectEquipmentId: (id: string) => void;
  onToggleChillerFault: (chillerId: string) => void;
  onToggleChwPumpSetMode: (pumpSetId: string) => void;
  onSetCracMode: (cracId: string, mode: CracMode) => void;
  onToggleUpsFault: (upsId: string) => void;
  onToggleDieselTankPump: (tankId: string) => void;
  onRefillDieselTank: (tankId: string) => void;
  onToggleGateway: (gatewayId: string) => void;
}

type StudioAngleId = 'iso' | 'front' | 'rear' | 'top';

const _targetCamPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const unmasked = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '') : '';
    const unmaskedVendor = ext ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) ?? '') : '';
    const r = String(gl.getParameter(gl.RENDERER) ?? '');
    const v = String(gl.getParameter(gl.VENDOR) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render|Mesa|WARP/i.test(
      `${unmasked} ${unmaskedVendor} ${r} ${v}`
    );
  } catch {
    return true;
  }
}

function createStudioContactShadow(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 122);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.42)');
    grad.addColorStop(0.65, 'rgba(15, 23, 42, 0.16)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function severityTextClass(sev: BmsEquipment3DItem['severityState']): string {
  switch (sev) {
    case 'critical':
      return 'text-red-700 dark:text-red-400 font-semibold';
    case 'warning':
      return 'text-amber-700 dark:text-amber-400 font-semibold';
    case 'standby':
      return 'text-slate-500 dark:text-slate-400 font-medium';
    default:
      return 'text-[#009530] dark:text-[#3DCD58] font-semibold';
  }
}

function subStatusClass(status: 'Nominal' | 'Warning' | 'Fault' | 'Standby'): string {
  switch (status) {
    case 'Fault':
      return 'text-red-700 dark:text-red-400 font-semibold';
    case 'Warning':
      return 'text-amber-700 dark:text-amber-400 font-semibold';
    case 'Standby':
      return 'text-slate-500 dark:text-slate-400';
    default:
      return 'text-[#009530] dark:text-[#3DCD58] font-medium';
  }
}

export function BmsEquipment3DInspector({
  bms,
  darkMode,
  selectedEquipmentId,
  onSelectEquipmentId,
  onToggleChillerFault,
  onToggleChwPumpSetMode,
  onSetCracMode,
  onToggleUpsFault,
  onToggleDieselTankPump,
  onRefillDieselTank,
  onToggleGateway,
}: BmsEquipment3DInspectorProps) {
  const catalog = useMemo(() => buildBmsEquipment3DCatalog(bms), [bms]);
  const [disciplineFilter, setDisciplineFilter] = useState<'all' | BmsEquipmentDiscipline>('all');
  const [explodePct, setExplodePct] = useState<number>(0);
  const [activeAngle, setActiveAngle] = useState<StudioAngleId>('iso');
  const [dockOpen, setDockOpen] = useState<boolean>(true);
  const [detailTab, setDetailTab] = useState<'subcomponents' | 'specs'>('subcomponents');

  const filteredCatalog = useMemo(() => {
    if (disciplineFilter === 'all') return catalog;
    return catalog.filter((item) => item.discipline === disciplineFilter);
  }, [catalog, disciplineFilter]);

  const selectedItem = useMemo(
    () => catalog.find((item) => item.id === selectedEquipmentId) ?? catalog[0],
    [catalog, selectedEquipmentId]
  );

  const mechCount = useMemo(
    () => catalog.filter((i) => i.discipline === 'mechanical').length,
    [catalog]
  );
  const elecCount = useMemo(
    () => catalog.filter((i) => i.discipline === 'electrical').length,
    [catalog]
  );

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const studioApiRef = useRef<{
    mountModel: (item: BmsEquipment3DItem, resetCam: boolean) => void;
    updateStatus: (hex: number) => void;
    setTargetExplode: (t01: number) => void;
    setAngle: (angle: StudioAngleId) => void;
    setTheme: (isDark: boolean) => void;
  } | null>(null);

  const initialItemRef = useRef(selectedItem);
  initialItemRef.current = selectedItem;
  const initialDarkRef = useRef(darkMode);
  initialDarkRef.current = darkMode;

  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const w = Math.max(320, mountEl.clientWidth);
    const h = Math.max(320, mountEl.clientHeight);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, w / h, 0.2, 120);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mountEl.appendChild(renderer.domElement);

    // Studio PBR environment reflections
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmrem.dispose();

    // 3-Point Warm/Cool Studio Rig
    const hemi = new THREE.HemisphereLight(0xdcebff, 0x64748b, 0.95);
    hemi.position.set(0, 18, 0);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff5e4, 1.5);
    key.position.set(10, 14, 11);
    key.castShadow = !isSoftwareGl;
    scene.add(key);

    const rim = new THREE.DirectionalLight(0xc7e0ff, 0.65);
    rim.position.set(-10, 8, -9);
    scene.add(rim);

    // Ground floor plane + architectural grid + soft radial contact shadow
    const floorGeo = new THREE.PlaneGeometry(46, 46);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xe9eef4,
      roughness: 0.88,
      metalness: 0.04,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.02;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const grid = new THREE.GridHelper(28, 28, 0x94a3b8, 0xcbd5e1);
    grid.position.y = 0.005;
    scene.add(grid);

    const shadowTex = createStudioContactShadow();
    const shadowGeo = new THREE.PlaneGeometry(11.5, 8.0);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.65,
    });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.015;
    scene.add(shadowPlane);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 3.2;
    controls.maxDistance = 24;

    let currentModel: DetailedBmsModelHandle | null = null;
    let currentModelKey = '';
    let currentModelId = '';
    let currentExplode = 0;
    let targetExplode = 0;
    let cameraAnimating = false;
    let disposed = false;
    let frameId = 0;
    let timeoutId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let suppressControl = false;
    let lastTs = performance.now();
    let renderSeq = 0;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext | null;
      if (!gl || typeof gl.fenceSync !== 'function') {
        timeoutId = window.setTimeout(cb, 24);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          timeoutId = window.setTimeout(poll, 4);
        } else {
          if (sync) gl.deleteSync(sync);
          timeoutId = window.setTimeout(cb, 16);
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
        const dt = Math.min(0.1, Math.max(0.008, (now - lastTs) / 1000));
        lastTs = now;
        let needsAnother = false;

        if (cameraAnimating) {
          const lambda = isSoftwareGl ? 16 : 8.0;
          camera.position.x = THREE.MathUtils.damp(camera.position.x, _targetCamPos.x, lambda, dt);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, _targetCamPos.y, lambda, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, _targetCamPos.z, lambda, dt);
          controls.target.x = THREE.MathUtils.damp(controls.target.x, _targetLook.x, lambda, dt);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, _targetLook.y, lambda, dt);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, _targetLook.z, lambda, dt);
          if (
            camera.position.distanceTo(_targetCamPos) < 0.05 &&
            controls.target.distanceTo(_targetLook) < 0.05
          ) {
            camera.position.copy(_targetCamPos);
            controls.target.copy(_targetLook);
            cameraAnimating = false;
          } else {
            needsAnother = true;
          }
        }

        if (Math.abs(currentExplode - targetExplode) > 0.004 && currentModel) {
          currentExplode = THREE.MathUtils.damp(
            currentExplode,
            targetExplode,
            isSoftwareGl ? 18 : 9,
            dt
          );
          if (Math.abs(currentExplode - targetExplode) <= 0.004) {
            currentExplode = targetExplode;
          } else {
            needsAnother = true;
          }
          currentModel.setExplode(currentExplode);
        }

        suppressControl = true;
        controls.update();
        suppressControl = false;
        renderer.render(scene, camera);

        renderSeq += 1;
        mountEl.dataset.studioSeq = String(renderSeq);
        mountEl.dataset.renderedEquipmentId = currentModelId;
        mountEl.dataset.renderedExplode = String(Math.round(currentExplode * 100));

        const done = () => {
          if (disposed) return;
          renderBusy = false;
          if (renderDirty || needsAnother) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };

    const applyTheme = (isDark: boolean) => {
      const bgHex = isDark ? 0x12171e : 0xeef3f8;
      scene.background = new THREE.Color(bgHex);
      scene.fog = new THREE.Fog(bgHex, 20, 48);
      floorMat.color.setHex(isDark ? 0x1a212b : 0xe9eef4);
      const gridMat = grid.material as THREE.Material | THREE.Material[];
      if (Array.isArray(gridMat)) {
        gridMat.forEach((m) => {
          if ('opacity' in m) {
            (m as THREE.LineBasicMaterial).transparent = true;
            (m as THREE.LineBasicMaterial).opacity = isDark ? 0.28 : 0.45;
          }
        });
      }
    };

    const flyToAngle = (angle: StudioAngleId) => {
      const base = currentModel?.recommendedCamera ?? {
        pos: [8.4, 5.2, 8.6] as [number, number, number],
        target: [0, 1.8, 0] as [number, number, number],
      };
      const [bx, by, bz] = base.pos;
      const [tx, ty, tz] = base.target;
      const dist = Math.hypot(bx, bz);

      if (angle === 'iso') {
        _targetCamPos.set(bx, by, bz);
      } else if (angle === 'front') {
        _targetCamPos.set(0.5, by * 0.72, dist * 0.96);
      } else if (angle === 'rear') {
        _targetCamPos.set(-bx * 0.85, by * 0.9, -bz * 0.92);
      } else {
        _targetCamPos.set(0.2, dist * 1.18, 2.2);
      }
      _targetLook.set(tx, ty, tz);

      if (isSoftwareGl) {
        camera.position.copy(_targetCamPos);
        controls.target.copy(_targetLook);
        cameraAnimating = false;
      } else {
        cameraAnimating = true;
      }
      requestRender();
    };

    const mountModel = (item: BmsEquipment3DItem, resetCam: boolean) => {
      const modelKey = `${item.id}|${item.modelKind}|${item.isPathB}`;
      if (modelKey === currentModelKey && currentModel) {
        currentModel.setStatusColor(item.statusColorHex);
        requestRender();
        return;
      }
      if (currentModel) {
        scene.remove(currentModel.root);
        currentModel.dispose();
        currentModel = null;
      }
      currentModel = buildDetailedBmsEquipmentModel(
        item.modelKind,
        item.shortCode,
        item.isPathB,
        item.statusColorHex
      );
      currentModelKey = modelKey;
      currentModelId = item.id;
      if (isSoftwareGl) {
        currentExplode = targetExplode;
      }
      currentModel.setExplode(currentExplode);
      scene.add(currentModel.root);

      if (resetCam) {
        const [bx, by, bz] = currentModel.recommendedCamera.pos;
        const [tx, ty, tz] = currentModel.recommendedCamera.target;
        _targetCamPos.set(bx, by, bz);
        _targetLook.set(tx, ty, tz);
        if (isSoftwareGl) {
          camera.position.set(bx, by, bz);
          controls.target.set(tx, ty, tz);
          suppressControl = true;
          controls.update();
          suppressControl = false;
          cameraAnimating = false;
        } else {
          cameraAnimating = true;
        }
      }
      requestRender();
    };

    const onControlStart = () => {
      cameraAnimating = false;
    };
    const onControlChange = () => {
      if (suppressControl) return;
      requestRender();
    };
    controls.addEventListener('start', onControlStart);
    controls.addEventListener('change', onControlChange);

    const ro = new ResizeObserver(() => {
      if (disposed) return;
      const nw = Math.max(320, mountEl.clientWidth);
      const nh = Math.max(320, mountEl.clientHeight);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
      requestRender();
    });
    ro.observe(mountEl);

    applyTheme(initialDarkRef.current);
    mountModel(initialItemRef.current, true);

    studioApiRef.current = {
      mountModel,
      updateStatus: (hex: number) => {
        currentModel?.setStatusColor(hex);
        requestRender();
      },
      setTargetExplode: (t01: number) => {
        targetExplode = THREE.MathUtils.clamp(t01, 0, 1);
        if (isSoftwareGl && currentModel) {
          currentExplode = targetExplode;
          currentModel.setExplode(currentExplode);
        }
        requestRender();
      },
      setAngle: flyToAngle,
      setTheme: (isDark: boolean) => {
        applyTheme(isDark);
        requestRender();
      },
    };

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
      ro.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.removeEventListener('change', onControlChange);
      controls.dispose();
      if (currentModel) {
        scene.remove(currentModel.root);
        currentModel.dispose();
      }
      floorGeo.dispose();
      floorMat.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
      shadowTex.dispose();
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mountEl) {
        mountEl.removeChild(renderer.domElement);
      }
      studioApiRef.current = null;
    };
  }, []);

  useEffect(() => {
    setDisciplineFilter((prev) =>
      prev !== 'all' && prev !== selectedItem.discipline ? 'all' : prev
    );
    setActiveAngle('iso');
    studioApiRef.current?.mountModel(selectedItem, true);
  }, [selectedItem.id, selectedItem.discipline, selectedItem.modelKind, selectedItem.isPathB]);

  useEffect(() => {
    studioApiRef.current?.updateStatus(selectedItem.statusColorHex);
  }, [selectedItem.statusColorHex]);

  useEffect(() => {
    studioApiRef.current?.setTheme(darkMode);
  }, [darkMode]);

  const handleExplodeChange = useCallback((pct: number) => {
    setExplodePct(pct);
    studioApiRef.current?.setTargetExplode(pct / 100);
  }, []);

  const handleSelectAngle = useCallback((angle: StudioAngleId) => {
    setActiveAngle(angle);
    studioApiRef.current?.setAngle(angle);
  }, []);

  const handleQuickAction = () => {
    if (selectedItem.modelKind === 'water-chiller' || selectedItem.modelKind === 'air-chiller') {
      onToggleChillerFault(selectedItem.id);
    } else if (selectedItem.modelKind === 'chw-tank-pump') {
      onToggleChwPumpSetMode(selectedItem.id);
    } else if (selectedItem.modelKind === 'crac' || selectedItem.modelKind === 'liquid-cdu') {
      onSetCracMode(selectedItem.id, selectedItem.isFault ? 'Auto' : 'Fault');
    } else if (selectedItem.modelKind === 'ups') {
      onToggleUpsFault(selectedItem.id);
    } else if (selectedItem.modelKind === 'diesel-tank') {
      onToggleDieselTankPump(selectedItem.id);
    } else if (selectedItem.modelKind === 'gateway') {
      onToggleGateway(selectedItem.id);
    }
  };

  const hasQuickAction = ![
    'generator',
    'hv-transformer',
    'msb-switchboard',
    'opswb-switchboard',
  ].includes(selectedItem.modelKind);

  return (
    <section
      id="bms-3d-equipment-studio"
      aria-label="3D Electrical and Mechanical Equipment Explorer"
      className="scroll-mt-20 bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden"
    >
      {/* Top Studio Header & Discipline Filter */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-[#009530] dark:text-[#3DCD58] shrink-0" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              3D Electrical &amp; Mechanical Equipment Inspector
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Orbit, inspect internal assemblies with Exploded Cutaway, and verify live nameplate specs across all {catalog.length} BMS units.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Filter BMS 3D equipment by discipline"
            className="inline-flex items-center p-0.5 rounded-md bg-slate-100 dark:bg-[#111418] border border-slate-200 dark:border-slate-800"
          >
            <button
              type="button"
              aria-pressed={disciplineFilter === 'all'}
              onClick={() => setDisciplineFilter('all')}
              className={`px-2.5 py-1 text-xs font-medium rounded-sm transition-colors whitespace-nowrap cursor-pointer ${
                disciplineFilter === 'all'
                  ? 'bg-white dark:bg-[#1B2026] text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              All ({catalog.length})
            </button>
            <button
              type="button"
              aria-pressed={disciplineFilter === 'mechanical'}
              onClick={() => {
                setDisciplineFilter('mechanical');
                if (selectedItem.discipline !== 'mechanical') {
                  const firstMech = catalog.find((i) => i.discipline === 'mechanical');
                  if (firstMech) onSelectEquipmentId(firstMech.id);
                }
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-sm transition-colors whitespace-nowrap cursor-pointer ${
                disciplineFilter === 'mechanical'
                  ? 'bg-white dark:bg-[#1B2026] text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Fan className="w-3 h-3" aria-hidden="true" />
              Mechanical ({mechCount})
            </button>
            <button
              type="button"
              aria-pressed={disciplineFilter === 'electrical'}
              onClick={() => {
                setDisciplineFilter('electrical');
                if (selectedItem.discipline !== 'electrical') {
                  const firstElec = catalog.find((i) => i.discipline === 'electrical');
                  if (firstElec) onSelectEquipmentId(firstElec.id);
                }
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-sm transition-colors whitespace-nowrap cursor-pointer ${
                disciplineFilter === 'electrical'
                  ? 'bg-white dark:bg-[#1B2026] text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Zap className="w-3 h-3" aria-hidden="true" />
              Electrical ({elecCount})
            </button>
          </div>

          <label htmlFor="bms-3d-asset-select" className="sr-only">
            Select BMS equipment unit to inspect in 3D
          </label>
          <select
            id="bms-3d-asset-select"
            value={selectedItem.id}
            onChange={(e) => onSelectEquipmentId(e.target.value)}
            className="px-2.5 py-1.5 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 min-w-[235px]"
          >
            {filteredCatalog.map((item) => (
              <option key={item.id} value={item.id}>
                {item.shortCode} — {item.name} ({item.discipline === 'mechanical' ? 'Mech' : 'Elec'})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Equipment Quick Selector Strip */}
      <div className="px-4 sm:px-5 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#14181D] flex items-center gap-1.5 overflow-x-auto">
        {filteredCatalog.map((item) => {
          const active = item.id === selectedItem.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectEquipmentId(item.id)}
              className={`px-2.5 py-1 text-[11px] font-mono rounded-sm border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'border-[#009530] dark:border-[#3DCD58] bg-[#009530] text-white font-semibold'
                  : item.severityState === 'critical'
                  ? 'border-red-300 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              {item.shortCode}
            </button>
          );
        })}
      </div>

      {/* Main Split Workbench: Interactive 3D Viewport (Left 7 cols) + Engineering Datasheet (Right 5 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12">
        {/* 3D Equipment Studio Canvas */}
        <div className="xl:col-span-7 relative h-[430px] sm:h-[480px] border-b xl:border-b-0 xl:border-r border-slate-200 dark:border-slate-800 overflow-hidden select-none">
          <div
            ref={canvasMountRef}
            data-testid="bms-equipment-3d-canvas"
            data-equipment-id={selectedItem.id}
            data-equipment-kind={selectedItem.modelKind}
            data-explode-pct={explodePct}
            className="w-full h-full"
          />

          {/* Minimal Top-Left Equipment Identification Plate (no backdrop-blur over WebGL) */}
          <div className="pointer-events-none absolute top-3 left-3 max-w-[80%] px-3 py-2 rounded-md bg-white/95 dark:bg-[#14181D]/95 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                {selectedItem.name}
              </span>
              <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
              <span className={severityTextClass(selectedItem.severityState)}>
                {selectedItem.statusLabel}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {selectedItem.subsystemLabel} · {selectedItem.redundancyLabel}
            </div>
          </div>

          {/* Collapsible Bottom Control Dock (Zero Viewport Occlusion) */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 w-[min(94%,540px)] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setDockOpen((prev) => !prev)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-t-md bg-white/95 dark:bg-[#14181D]/95 border border-b-0 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              {dockOpen ? (
                <>
                  <ChevronDown className="w-3 h-3" aria-hidden="true" />
                  Hide 3D Controls
                </>
              ) : (
                <>
                  <ChevronUp className="w-3 h-3" aria-hidden="true" />
                  Show 3D Controls
                </>
              )}
            </button>

            {dockOpen && (
              <div className="w-full px-3 py-2.5 rounded-md bg-white/95 dark:bg-[#14181D]/95 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2.5">
                {/* Exploded / Internal Cutaway Slider */}
                <div className="flex items-center gap-2 flex-1 min-w-[190px]">
                  <Layers className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58] shrink-0" aria-hidden="true" />
                  <label
                    htmlFor="bms-explode-slider"
                    className="text-[11px] font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap"
                  >
                    Exploded
                  </label>
                  <input
                    id="bms-explode-slider"
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={explodePct}
                    onChange={(e) => handleExplodeChange(Number(e.target.value))}
                    className="w-full accent-[#009530] cursor-pointer"
                  />
                  <span className="font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-300 w-8 text-right">
                    {explodePct}%
                  </span>
                </div>

                {/* Camera Angle Controls */}
                <div className="flex items-center gap-1">
                  {(
                    [
                      ['iso', 'Iso 3/4'],
                      ['front', 'Front HMI'],
                      ['rear', 'Piping / Bus'],
                      ['top', 'Top'],
                    ] as Array<[StudioAngleId, string]>
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleSelectAngle(id)}
                      className={`px-2 py-1 text-[11px] font-medium rounded-sm transition-colors whitespace-nowrap cursor-pointer ${
                        activeAngle === id
                          ? 'bg-[#009530] text-white font-semibold'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      handleExplodeChange(0);
                      handleSelectAngle('iso');
                    }}
                    aria-label="Reset 3D view and assembly"
                    className="p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-sm cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Detailed Equipment Engineering Datasheet & Sub-Assemblies */}
        <div className="xl:col-span-5 flex flex-col max-h-[480px] overflow-y-auto">
          {/* Live Telemetry 2x2 Grid */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {selectedItem.discipline === 'mechanical' ? 'MECHANICAL PLANT' : 'ELECTRICAL PLANT'} ·{' '}
                {selectedItem.protocolEndpoint}
              </div>
              {hasQuickAction && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {selectedItem.modelKind === 'diesel-tank' && (
                    <button
                      type="button"
                      onClick={() => onRefillDieselTank(selectedItem.id)}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-sm border border-[#009530] text-[#009530] dark:text-[#3DCD58] hover:bg-[#009530]/10 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Refill Tank
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleQuickAction}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-sm border transition-colors whitespace-nowrap cursor-pointer ${
                      selectedItem.isFault
                        ? 'border-[#009530] text-[#009530] dark:text-[#3DCD58] hover:bg-[#009530]/10'
                        : selectedItem.modelKind === 'chw-tank-pump' || selectedItem.modelKind === 'diesel-tank'
                        ? 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-[#009530] hover:text-[#009530] dark:hover:text-[#3DCD58]'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-red-400 hover:text-red-700 dark:hover:text-red-400'
                    }`}
                  >
                    {selectedItem.modelKind === 'chw-tank-pump'
                      ? selectedItem.isFault
                        ? 'Restore Pump Set'
                        : 'Cycle Pump Mode'
                      : selectedItem.modelKind === 'diesel-tank'
                      ? selectedItem.isFault
                        ? 'Clear Pump Fault'
                        : 'Cycle Transfer Pump'
                      : selectedItem.isFault
                      ? selectedItem.modelKind === 'gateway'
                        ? 'Reconnect Gateway'
                        : 'Clear Fault'
                      : selectedItem.modelKind === 'gateway'
                      ? 'Simulate Link Drop'
                      : 'Simulate Fault'}
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {selectedItem.liveTelemetry.map((metric) => (
                <div
                  key={metric.label}
                  className="p-2.5 rounded-sm bg-slate-50 dark:bg-[#14181D] border border-slate-200/80 dark:border-slate-800"
                >
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {metric.label}
                  </div>
                  <div className="mt-0.5 font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                    {metric.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detail Sub-Tabs: Sub-Components vs Full Electrical & Mechanical Specs */}
          <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/50 dark:bg-[#14181D]/60">
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDetailTab('subcomponents')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-sm cursor-pointer ${
                  detailTab === 'subcomponents'
                    ? 'bg-white dark:bg-[#1B2026] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Wrench className="w-3 h-3" aria-hidden="true" />
                3D Sub-Assemblies ({selectedItem.subComponents.length})
              </button>
              <button
                type="button"
                onClick={() => setDetailTab('specs')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-sm cursor-pointer ${
                  detailTab === 'specs'
                    ? 'bg-white dark:bg-[#1B2026] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Cpu className="w-3 h-3" aria-hidden="true" />
                Elec &amp; Mech Datasheet
              </button>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              {explodePct > 0 ? 'Cutaway Active' : 'Assembled'}
            </span>
          </div>

          {detailTab === 'subcomponents' ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {selectedItem.subComponents.map((sub) => (
                <div key={sub.id} className="px-4 py-3 space-y-1">
                  <div className="flex items-start justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {sub.name}
                    </span>
                    <span className={`text-[11px] whitespace-nowrap ${subStatusClass(sub.status)}`}>
                      {sub.status}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-700 dark:text-slate-300 tabular-nums">
                    {sub.reading}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    {sub.detail}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 space-y-4">
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Electrical Nameplate &amp; Protection
                </h3>
                <dl className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-sm">
                  {selectedItem.electricalSpecs.map((spec) => (
                    <div
                      key={spec.label}
                      className="px-3 py-2 flex items-center justify-between gap-3 text-xs"
                    >
                      <dt className="text-slate-500 dark:text-slate-400 shrink-0">{spec.label}</dt>
                      <dd className="font-mono text-[11px] font-medium text-slate-900 dark:text-slate-100 text-right">
                        {spec.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Mechanical &amp; Thermal Engineering
                </h3>
                <dl className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-sm">
                  {selectedItem.mechanicalSpecs.map((spec) => (
                    <div
                      key={spec.label}
                      className="px-3 py-2 flex items-center justify-between gap-3 text-xs"
                    >
                      <dt className="text-slate-500 dark:text-slate-400 shrink-0">{spec.label}</dt>
                      <dd className="font-mono text-[11px] font-medium text-slate-900 dark:text-slate-100 text-right">
                        {spec.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

import * as THREE from 'three';
import { BmsState } from '../../engine/bmsTypes';
import type { SiteId } from '../../engine/sites';
import {
  BUILDING_BOUNDS,
  CHILLER_3D_PLACEMENTS,
  CHW_TANK_PUMP_3D_PLACEMENTS,
  COLD_AISLE_SLA_SENSOR_PLACEMENTS,
  CRAC_3D_PLACEMENTS,
  ColdAisleSlaSensor3DPlacement,
  DIESEL_TANK_3D_PLACEMENTS,
  ELECTRICAL_CHAIN_3D_PLACEMENTS,
  FACILITY_ASSET_PLACEMENTS,
  HALL_ZONE_BOUNDS,
  RACK_3D_PLACEMENTS,
  SelectedTwinAsset,
  TwinOverlayMode,
  computeColdAisleSlaSensorMetrics,
  computeRack3DMetrics,
  getBmsAssetStatusHex,
  getSiteBuildingLayout,
  powerLoadColorHex,
  slaSensorStatusHex,
  statusColorHex,
} from '../../engine/twin3dLayout';
import { computeBmsRackPowerStats } from '../../engine/rackPowerEngine';
import { HallPowerPolicyMap, RackDefinition, ServerNode } from '../../engine/types';
import {
  HEATMAP_DEFAULT_SLICE_M,
  HEATMAP_GRID_COLS,
  HEATMAP_GRID_ROWS,
  HEATMAP_PLANE_DEPTH,
  HEATMAP_PLANE_WIDTH,
  ThermalHeatmapGrid,
  computeThermalHeatmapGrid,
  extractHotspotPlumes,
  renderHeatmapToRgba,
  temperatureToHeatMapHex,
} from '../../engine/thermalHeatmap3d';
import { createTwinProceduralTextures } from './textures';
import { buildCampusParkingAndLandscaping } from './campusLandscaping';
import { buildTelecomRooms } from './telecomRooms';
import { buildAdminOfficeAndWalkway } from './adminOfficeAndWalkway';
import { buildBatteryRooms } from './batteryRooms';

export interface TwinInteractableUserData {
  asset: SelectedTwinAsset;
}

export interface TwinHeatmapConfig {
  sliceHeightM: number;
  showSlicePlane: boolean;
  showPlumes: boolean;
  showContours: boolean;
}

export interface TwinSceneHandles {
  interactables: THREE.Object3D[];
  rackBodiesInst: THREE.InstancedMesh;
  rackIndexToDef: RackDefinition[];
  slaHitInst: THREE.InstancedMesh;
  slaSensorPlacements: ColdAisleSlaSensor3DPlacement[];
  overCapHitInst: THREE.InstancedMesh;
  overCapBeaconRackIds: string[];
  applyCutaway: (t01: number) => void;
  applyBasementCutaway: (open: boolean) => void;
  applyTheme: (darkMode: boolean) => void;
  updateSiteSignage: (tierLabel: string) => void;
  updateLiveTelemetry: (
    racks: RackDefinition[],
    servers: ServerNode[],
    bms: BmsState,
    overlay: TwinOverlayMode,
    selectedAsset: SelectedTwinAsset | null,
    showSlaSensors?: boolean,
    heatmapConfig?: TwinHeatmapConfig,
    precomputedHeatmapGrid?: ThermalHeatmapGrid | null,
    showOverCapBeacons?: boolean,
    rackPowerAdjustmentsKw?: Record<string, number>,
    hallPowerPolicies?: HallPowerPolicyMap,
    locateLedRackIds?: string[]
  ) => void;
  setAirflowVisible: (visible: boolean) => void;
  animateAirflow: (elapsedSec: number) => void;
  dispose: () => void;
}

interface BmsMeshRef {
  id: string;
  kind:
    | 'crac'
    | 'ups'
    | 'generator'
    | 'chiller'
    | 'chw_tank_pump'
    | 'diesel_tank'
    | 'hv'
    | 'msb'
    | 'opswb';
  beaconMat: THREE.MeshStandardMaterial;
  selectionRing: THREE.Mesh;
}

const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _heatColor = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);
const MAX_THERMAL_PLUMES = 72;
const MAX_OVERCAP_BEACONS = 64;

function createThermalPlumeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 64, 128);
    // Vertical soft convection envelope: soft entry at base, brightest in lower-mid plume, fading cleanly at top
    const grad = ctx.createLinearGradient(0, 128, 0, 0);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.10)');
    grad.addColorStop(0.22, 'rgba(255, 255, 255, 0.88)');
    grad.addColorStop(0.58, 'rgba(255, 255, 255, 0.48)');
    grad.addColorStop(0.85, 'rgba(255, 255, 255, 0.14)');
    grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 128);

    // Subtle vertical thermal convection streaks
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    for (let sx = 6; sx < 64; sx += 14) {
      ctx.fillRect(sx, 20, 4, 96);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds the hyperscale Orise Data Center 3D campus + 4-Hall interior scene:
 * - 4 Data Halls (2x2 Quad) x 20 Rows x 20 Racks = 1,600 real 3D racks rendered via InstancedMesh
 * - Individual raycast picking on all 1,600 racks + 4 CRAC banks + 2N UPS + 2 Standby Generators
 * - Full architectural exterior (glazed NOC lobby, per-site signage, 8 rooftop chillers) with smooth cutaway
 */
export function buildDigitalTwinScene(
  scene: THREE.Scene,
  racks: RackDefinition[],
  servers: ServerNode[],
  bms: BmsState,
  isSoftwareGl: boolean,
  initialDarkMode: boolean,
  initialTierLabel: string,
  siteId: SiteId = 'kl1'
): TwinSceneHandles {
  const siteLayout = getSiteBuildingLayout(siteId);
  const disposablesGeo: THREE.BufferGeometry[] = [];
  const disposablesMat: THREE.Material[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposablesGeo.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposablesMat.push(m);
    return m;
  };

  const textures = createTwinProceduralTextures(isSoftwareGl ? 1 : 4);
  textures.updateSignageText(initialTierLabel);
  textures.raisedFloorMap.repeat.set(20, 30);
  textures.facadePanelMap.repeat.set(10, 2);
  textures.asphaltMap.repeat.set(24, 24);

  // Shared PBR Materials
  const groundMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd8e1ea,
      map: textures.asphaltMap,
      roughness: 0.94,
      metalness: 0.02,
    })
  );
  const lawnMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xbfd0be,
      roughness: 0.95,
      metalness: 0.0,
    })
  );
  const concreteMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd5dce3,
      roughness: 0.88,
      metalness: 0.04,
    })
  );
  const raisedFloorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf4f7fb,
      map: textures.raisedFloorMap,
      roughness: 0.62,
      metalness: 0.08,
    })
  );
  const corridorFloorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdce4ee,
      roughness: 0.72,
      metalness: 0.06,
    })
  );
  const facadeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: siteLayout.facadeColorHex,
      map: textures.facadePanelMap,
      roughness: 0.72,
      metalness: 0.14,
    })
  );
  const darkSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x262d36,
      roughness: 0.44,
      metalness: 0.68,
    })
  );
  const lightSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.36,
      metalness: 0.65,
    })
  );
  const ecoGreenTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: siteLayout.accentTrimHex,
      emissive: siteLayout.accentEmissiveHex,
      emissiveIntensity: 0.35,
      roughness: 0.35,
      metalness: 0.25,
    })
  );
  const buswayGreenMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x009530,
      roughness: 0.38,
      metalness: 0.45,
    })
  );
  const buswayOrangeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.38,
      metalness: 0.45,
    })
  );
  const chilledPipeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.32,
      metalness: 0.55,
    })
  );
  const hotPipeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb91c1c,
      roughness: 0.35,
      metalness: 0.5,
    })
  );
  const cabinetWhiteMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.45,
      metalness: 0.2,
    })
  );
  const copperMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc26d3a,
      roughness: 0.28,
      metalness: 0.85,
    })
  );
  const safetyYellowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xeab308,
      roughness: 0.42,
      metalness: 0.2,
    })
  );
  const hmiScreenMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: 0x0284c7,
      emissiveIntensity: 0.55,
      roughness: 0.2,
      metalness: 0.15,
    })
  );
  const glassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x8cc3e6,
      roughness: 0.14,
      metalness: 0.22,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    })
  );
  const invisibleHitMat = trackMat(
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
  );
  const selectionRingMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x3dcd58,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.94,
    })
  );
  const contactShadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: textures.contactShadowMap,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    })
  );

  const interactables: THREE.Object3D[] = [];
  const bmsRefs = new Map<string, BmsMeshRef>();

  const cduCyanMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      roughness: 0.28,
      metalness: 0.52,
    })
  );
  const cduCoralMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      roughness: 0.3,
      metalness: 0.45,
    })
  );
  const basementWallMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b4450,
      roughness: 0.85,
      metalness: 0.08,
    })
  );
  const basementFloorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x262e38,
      roughness: 0.9,
      metalness: 0.05,
    })
  );
  const vaultLightStripMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
    })
  );

  // --- 1. Extended Campus Ground, Lawn Belt (with East Basement Vault Cutout), Perimeter Fence & Trees ---
  const campusGroup = new THREE.Group();
  scene.add(campusGroup);

  // Exact East Basement Level B1 Fuel Vault opening bounds (unobstructed when deck cover is open)
  const pitMinX = BUILDING_BOUNDS.basementVaultCenterX - BUILDING_BOUNDS.basementVaultWidth / 2; // 30.7
  const pitMaxX = BUILDING_BOUNDS.basementVaultCenterX + BUILDING_BOUNDS.basementVaultWidth / 2; // 44.3
  const pitMinZ = -BUILDING_BOUNDS.basementVaultDepth / 2; // -31.5
  const pitMaxZ = BUILDING_BOUNDS.basementVaultDepth / 2; // +31.5

  const addGroundWithCutout = (
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    y: number,
    mat: THREE.Material
  ) => {
    const rects: Array<[number, number, number, number]> = [
      [minX, pitMinX, minZ, maxZ],
      [pitMaxX, maxX, minZ, maxZ],
      [pitMinX, pitMaxX, minZ, pitMinZ],
      [pitMinX, pitMaxX, pitMaxZ, maxZ],
    ];
    for (const [x0, x1, z0, z1] of rects) {
      const w = x1 - x0;
      const d = z1 - z0;
      if (w <= 0.01 || d <= 0.01) continue;
      const m = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(w, d)), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
      m.receiveShadow = true;
      campusGroup.add(m);
    }
  };

  const eastApronMaxX = siteLayout.eastApronMaxX;
  const eastFenceX = eastApronMaxX - 0.5;
  addGroundWithCutout(-260, 260, -260, 260, -0.05, lawnMat);
  // Operational campus apron framing the building, HV/MSB yard, East generator yard & site-specific Admin wing
  addGroundWithCutout(-60, eastApronMaxX, -54, 57, 0.0, groundMat);

  // High-security perimeter fence (posts + upper & lower rails) enclosing North, West & East operational yards
  const postGeo = trackGeo(new THREE.CylinderGeometry(0.09, 0.09, 2.5, 6));
  const fencePositions: Array<[number, number]> = [];
  for (let x = -59; x <= eastFenceX; x += 6.0) {
    fencePositions.push([x, -53.5]);
  }
  for (let z = -48; z <= 51; z += 6.0) {
    fencePositions.push([-59, z]);
    fencePositions.push([eastFenceX, z]);
  }
  const fencePosts = new THREE.InstancedMesh(postGeo, darkSteelMat, fencePositions.length);
  fencePositions.forEach(([fx, fz], idx) => {
    _pos.set(fx, 1.25, fz);
    _quat.identity();
    _scale.set(1, 1, 1);
    _mat4.compose(_pos, _quat, _scale);
    fencePosts.setMatrixAt(idx, _mat4);
  });
  fencePosts.instanceMatrix.needsUpdate = true;
  fencePosts.computeBoundingSphere();
  campusGroup.add(fencePosts);

  // Horizontal perimeter fence rails linking the security posts
  const northRailLen = eastFenceX - -59.0;
  const northRailCenterX = (-59.0 + eastFenceX) / 2;
  const railNorthGeo = trackGeo(new THREE.BoxGeometry(northRailLen, 0.08, 0.08));
  const railSideGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.08, 105.0));
  for (const ry of [0.65, 2.25]) {
    const rN = new THREE.Mesh(railNorthGeo, darkSteelMat);
    rN.position.set(northRailCenterX, ry, -53.5);
    const rW = new THREE.Mesh(railSideGeo, darkSteelMat);
    rW.position.set(-59.0, ry, -1.0);
    const rE = new THREE.Mesh(railSideGeo, darkSteelMat);
    rE.position.set(eastFenceX, ry, -1.0);
    campusGroup.add(rN, rW, rE);
  }

  // Full South Forecourt Visitor Parking Complex & Architectural Campus Landscaping
  const campusLandscaping = buildCampusParkingAndLandscaping({
    parent: campusGroup,
    textures,
    isSoftwareGl,
    trackGeo,
    trackMat,
    sharedMats: {
      concreteMat,
      darkSteelMat,
      lightSteelMat,
      ecoGreenTrimMat,
      safetyYellowMat,
      contactShadowMat,
    },
  });

  // --- 2. Building Plinth, Raised Floor, Central Cross Spine & 4 Data Hall Partitions ---
  const floorY = BUILDING_BOUNDS.floorY;
  const plinth = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(BUILDING_BOUNDS.mainWidth + 0.8, floorY, BUILDING_BOUNDS.mainDepth + 0.8)),
    concreteMat
  );
  plinth.position.set(0, floorY / 2, 0);
  plinth.receiveShadow = true;
  scene.add(plinth);

  const raisedFloor = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(BUILDING_BOUNDS.mainWidth - 0.6, 0.1, BUILDING_BOUNDS.mainDepth - 0.6)),
    raisedFloorMat
  );
  raisedFloor.position.set(0, floorY + 0.05, 0);
  raisedFloor.receiveShadow = true;
  scene.add(raisedFloor);

  // Central East-West and North-South spine corridors visibly separating the 4 Data Halls
  const spineNS = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.2, 0.12, BUILDING_BOUNDS.mainDepth - 1.2)), corridorFloorMat);
  spineNS.position.set(0, floorY + 0.06, 0);
  const spineEW = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(BUILDING_BOUNDS.mainWidth - 1.2, 0.12, 4.2)), corridorFloorMat);
  spineEW.position.set(0, floorY + 0.06, 0);
  scene.add(spineNS, spineEW);

  // MEP West Wing concrete pad + HV/MSB Outdoor Substation Yard + Path A/B vault divider wall
  const mepPad = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(BUILDING_BOUNDS.mepWidth, floorY, BUILDING_BOUNDS.mepDepth)),
    concreteMat
  );
  mepPad.position.set(BUILDING_BOUNDS.mepCenterX, floorY / 2, BUILDING_BOUNDS.mepCenterZ);
  mepPad.receiveShadow = true;

  const hvMsbPad = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(16.5, 0.28, 56.0)),
    concreteMat
  );
  hvMsbPad.position.set(-48.2, 0.14, 0);
  hvMsbPad.receiveShadow = true;
  const hvMsbDivider = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(15.5, 3.2, 0.45)),
    facadeMat
  );
  hvMsbDivider.position.set(-48.2, 1.74, 0);

  const mepVaultDivider = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(BUILDING_BOUNDS.mepWidth - 0.6, 4.6, 0.45)),
    facadeMat
  );
  mepVaultDivider.position.set(BUILDING_BOUNDS.mepCenterX, floorY + 2.3, 0);
  scene.add(mepPad, hvMsbPad, hvMsbDivider, mepVaultDivider);

  // East Generator Yard Deck Cover (hides cleanly in Basement Fuel Cutaway to reveal 8 Basement Diesel Tanks!)
  const eastYardDeckCoverGroup = new THREE.Group();
  const eastDeckCover = new THREE.Mesh(
    trackGeo(
      new THREE.BoxGeometry(
        BUILDING_BOUNDS.basementVaultWidth + 0.1,
        0.24,
        BUILDING_BOUNDS.basementVaultDepth + 0.1
      )
    ),
    concreteMat
  );
  eastDeckCover.position.set(BUILDING_BOUNDS.basementVaultCenterX, 0.12, 0);
  eastDeckCover.receiveShadow = true;
  eastYardDeckCoverGroup.add(eastDeckCover);
  scene.add(eastYardDeckCoverGroup);

  // Structural Concrete Bridge Beams beneath the 8 Standby Generators (2 columns × 4 rows, always visible over open basement)
  const genBridgeGeo = trackGeo(new THREE.BoxGeometry(11.6, 0.34, 4.4));
  const genPierGeo = trackGeo(new THREE.BoxGeometry(0.7, 5.5, 1.4));
  for (const gz of [-24.0, -10.0, 10.0, 24.0]) {
    const bridge = new THREE.Mesh(genBridgeGeo, concreteMat);
    bridge.position.set(37.4, 0.07, gz);
    const pierW = new THREE.Mesh(genPierGeo, basementWallMat);
    pierW.position.set(31.5, -2.85, gz);
    const pierE = new THREE.Mesh(genPierGeo, basementWallMat);
    pierE.position.set(42.6, -2.85, gz);
    scene.add(bridge, pierW, pierE);
  }
  const genYardDivider = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(12.6, 3.4, 0.45)), facadeMat);
  genYardDivider.position.set(BUILDING_BOUNDS.basementVaultCenterX, 1.82, 0);
  scene.add(genYardDivider);

  // Yellow safety cutaway curb rim around East Basement Fuel Vault opening
  const curbNorth = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(BUILDING_BOUNDS.basementVaultWidth + 0.4, 0.16, 0.35)),
    safetyYellowMat
  );
  curbNorth.position.set(BUILDING_BOUNDS.basementVaultCenterX, 0.08, pitMinZ - 0.15);
  const curbSouth = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(BUILDING_BOUNDS.basementVaultWidth + 0.4, 0.16, 0.35)),
    safetyYellowMat
  );
  curbSouth.position.set(BUILDING_BOUNDS.basementVaultCenterX, 0.08, pitMaxZ + 0.15);
  const curbEast = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.35, 0.16, BUILDING_BOUNDS.basementVaultDepth + 0.6)),
    safetyYellowMat
  );
  curbEast.position.set(pitMaxX + 0.15, 0.08, 0);
  scene.add(curbNorth, curbSouth, curbEast);

  // Permanent interior structural columns & glazed 4-hall partition walls
  const interiorGroup = new THREE.Group();
  scene.add(interiorGroup);

  // Glazed central cross partitions separating Hall A | Hall B | Hall C | Hall D
  const nsGlassGeo = trackGeo(new THREE.BoxGeometry(0.14, 4.2, 39.0));
  const ewGlassGeo = trackGeo(new THREE.BoxGeometry(22.5, 4.2, 0.14));
  const nsBeamGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.22, 39.2));
  const ewBeamGeo = trackGeo(new THREE.BoxGeometry(22.7, 0.22, 0.24));

  for (const zSign of [-1, 1]) {
    const gz = zSign * 22.5;
    const g = new THREE.Mesh(nsGlassGeo, glassMat);
    g.position.set(0, floorY + 2.15, gz);
    g.renderOrder = 3;
    const top = new THREE.Mesh(nsBeamGeo, darkSteelMat);
    top.position.set(0, floorY + 4.3, gz);
    interiorGroup.add(g, top);
  }
  for (const xSign of [-1, 1]) {
    const gx = xSign * 14.5;
    const g = new THREE.Mesh(ewGlassGeo, glassMat);
    g.position.set(gx, floorY + 2.15, 0);
    g.renderOrder = 3;
    const top = new THREE.Mesh(ewBeamGeo, darkSteelMat);
    top.position.set(gx, floorY + 4.3, 0);
    interiorGroup.add(g, top);
  }

  // Structural H-columns via InstancedMesh
  const colPositions: Array<[number, number]> = [];
  for (const cx of [-29.2, -2.2, 2.2, 29.2]) {
    for (const cz of [-45.5, -22.5, -2.2, 2.2, 22.5, 45.5]) {
      colPositions.push([cx, cz]);
    }
  }
  const colInst = new THREE.InstancedMesh(
    trackGeo(new THREE.BoxGeometry(0.42, 5.2, 0.42)),
    darkSteelMat,
    colPositions.length
  );
  colPositions.forEach(([cx, cz], idx) => {
    _pos.set(cx, floorY + 2.6, cz);
    _quat.identity();
    _scale.set(1, 1, 1);
    _mat4.compose(_pos, _quat, _scale);
    colInst.setMatrixAt(idx, _mat4);
  });
  colInst.instanceMatrix.needsUpdate = true;
  colInst.computeBoundingSphere();
  interiorGroup.add(colInst);

  // South Telecom & Interconnect Wing: MDF Room, Core Network Room, & Dual-Diverse Meet-Me Room (MMR)
  const telecomRooms = buildTelecomRooms({
    parent: interiorGroup,
    campusParent: campusGroup,
    isSoftwareGl,
    trackGeo,
    trackMat,
    sharedMats: {
      darkSteelMat,
      lightSteelMat,
      concreteMat,
      glassMat,
      safetyYellowMat,
      ecoGreenTrimMat,
    },
  });
  for (const obj of telecomRooms.interactables) {
    interactables.push(obj);
  }

  // Overhead redundant A/B power busways along every paired row (4 halls x 10 pairs = 40 green + 40 orange runs!)
  const busRunGeo = trackGeo(new THREE.BoxGeometry(19.2, 0.14, 0.16));
  const totalBusRuns = HALL_ZONE_BOUNDS.length * 10;
  const busAInst = new THREE.InstancedMesh(busRunGeo, buswayGreenMat, totalBusRuns);
  const busBInst = new THREE.InstancedMesh(busRunGeo, buswayOrangeMat, totalBusRuns);
  let busIdx = 0;
  for (const hall of HALL_ZONE_BOUNDS) {
    for (let pair = 0; pair < 10; pair++) {
      const pz = hall.centerZ - 16.65 + pair * 3.7;
      _quat.identity();
      _scale.set(1, 1, 1);

      _pos.set(hall.centerX, floorY + 3.25, pz - 0.92);
      _mat4.compose(_pos, _quat, _scale);
      busAInst.setMatrixAt(busIdx, _mat4);

      _pos.set(hall.centerX, floorY + 3.25, pz + 0.92);
      _mat4.compose(_pos, _quat, _scale);
      busBInst.setMatrixAt(busIdx, _mat4);
      busIdx += 1;
    }
  }
  busAInst.instanceMatrix.needsUpdate = true;
  busBInst.instanceMatrix.needsUpdate = true;
  busAInst.computeBoundingSphere();
  busBInst.computeBoundingSphere();
  interiorGroup.add(busAInst, busBInst);

  // Perimeter chilled-water headers along West & East CRAC galleries
  const cwHeaderGeo = trackGeo(new THREE.CylinderGeometry(0.22, 0.22, 86.0, 10));
  for (const hx of [-28.4, 28.4]) {
    const pipe = new THREE.Mesh(cwHeaderGeo, chilledPipeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(hx, floorY + 4.4, 0);
    interiorGroup.add(pipe);
  }

  // --- 3. 1,600 Instanced 42U Server Racks (4 Data Halls x 20 Rows x 20 Racks) ---
  const rackCount = RACK_3D_PLACEMENTS.length;
  const rackBodyGeo = trackGeo(
    new THREE.BoxGeometry(BUILDING_BOUNDS.rackWidth, BUILDING_BOUNDS.rackHeight, BUILDING_BOUNDS.rackDepth)
  );
  const rackBodyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.56,
      metalness: 0.44,
    })
  );
  const rackDoorGeo = trackGeo(
    new THREE.PlaneGeometry(BUILDING_BOUNDS.rackWidth - 0.08, BUILDING_BOUNDS.rackHeight - 0.14)
  );
  const rackDoorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.rackDoorMap,
      roughness: 0.6,
      metalness: 0.45,
    })
  );
  const rackLedGeo = trackGeo(new THREE.PlaneGeometry(0.06, BUILDING_BOUNDS.rackHeight - 0.24));
  const rackLedMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
    })
  );
  // Crisp roof-cap heatmap / power overlay plate (2 tris/rack, zero transparent overdraw)
  const rackOverlayGeo = trackGeo(
    new THREE.PlaneGeometry(BUILDING_BOUNDS.rackWidth + 0.04, BUILDING_BOUNDS.rackDepth + 0.04)
  );
  rackOverlayGeo.rotateX(-Math.PI / 2);
  const rackOverlayMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
    })
  );

  const rackBodiesInst = new THREE.InstancedMesh(rackBodyGeo, rackBodyMat, rackCount);
  const rackDoorsInst = new THREE.InstancedMesh(rackDoorGeo, rackDoorMat, rackCount);
  const rackLedInst = new THREE.InstancedMesh(rackLedGeo, rackLedMat, rackCount);
  const rackOverlayInst = new THREE.InstancedMesh(rackOverlayGeo, rackOverlayMat, rackCount);
  rackOverlayInst.visible = false;
  rackOverlayInst.renderOrder = 6;

  const rackDefMap = new Map(racks.map((r) => [r.id, r]));
  const rackIndexToDef: RackDefinition[] = [];

  for (let i = 0; i < rackCount; i++) {
    const p = RACK_3D_PLACEMENTS[i];
    const def = rackDefMap.get(p.rackId) ?? racks[i];
    rackIndexToDef.push(def);

    _quat.setFromAxisAngle(_yAxis, p.rotationY);
    _scale.set(1, 1, 1);

    // Rack body
    _pos.set(p.x, floorY + 0.1 + BUILDING_BOUNDS.rackHeight / 2, p.z);
    _mat4.compose(_pos, _quat, _scale);
    rackBodiesInst.setMatrixAt(i, _mat4);
    _color.setHex(0x28303b);
    rackBodiesInst.setColorAt(i, _color);

    // Front perforated door plane (facing outward along local +Z)
    const dirZ = p.rotationY === 0 ? 1 : -1;
    _pos.set(p.x, floorY + 0.1 + BUILDING_BOUNDS.rackHeight / 2, p.z + dirZ * (BUILDING_BOUNDS.rackDepth / 2 + 0.015));
    _mat4.compose(_pos, _quat, _scale);
    rackDoorsInst.setMatrixAt(i, _mat4);
    _color.setHex(0x475569);
    rackDoorsInst.setColorAt(i, _color);

    // Vertical status LED bar plane on front-right edge
    _pos.set(
      p.x + dirZ * 0.34,
      floorY + 0.1 + BUILDING_BOUNDS.rackHeight / 2,
      p.z + dirZ * (BUILDING_BOUNDS.rackDepth / 2 + 0.03)
    );
    _mat4.compose(_pos, _quat, _scale);
    rackLedInst.setMatrixAt(i, _mat4);
    _color.setHex(0x3dcd58);
    rackLedInst.setColorAt(i, _color);

    // Top-cap thermal / power overlay indicator plate
    _pos.set(p.x, floorY + 0.1 + BUILDING_BOUNDS.rackHeight + 0.04, p.z);
    _mat4.compose(_pos, _quat, _scale);
    rackOverlayInst.setMatrixAt(i, _mat4);
    rackOverlayInst.setColorAt(i, _color);
  }

  rackBodiesInst.instanceMatrix.needsUpdate = true;
  rackDoorsInst.instanceMatrix.needsUpdate = true;
  rackLedInst.instanceMatrix.needsUpdate = true;
  rackOverlayInst.instanceMatrix.needsUpdate = true;
  if (rackBodiesInst.instanceColor) rackBodiesInst.instanceColor.needsUpdate = true;
  if (rackDoorsInst.instanceColor) rackDoorsInst.instanceColor.needsUpdate = true;
  if (rackLedInst.instanceColor) rackLedInst.instanceColor.needsUpdate = true;
  if (rackOverlayInst.instanceColor) rackOverlayInst.instanceColor.needsUpdate = true;
  rackBodiesInst.computeBoundingSphere();
  rackDoorsInst.computeBoundingSphere();
  rackLedInst.computeBoundingSphere();
  rackOverlayInst.computeBoundingSphere();

  scene.add(rackBodiesInst, rackDoorsInst, rackLedInst, rackOverlayInst);

  // --- 3a. 3D CFD Thermal Heat Map Layer (Dynamic DataTexture Slice + Floor Projection + Rising Plumes) ---
  const heatmapGroup = new THREE.Group();
  heatmapGroup.visible = false;
  scene.add(heatmapGroup);

  const heatmapRgba = new Uint8Array(HEATMAP_GRID_COLS * HEATMAP_GRID_ROWS * 4);
  const heatmapDataTex = new THREE.DataTexture(
    heatmapRgba,
    HEATMAP_GRID_COLS,
    HEATMAP_GRID_ROWS,
    THREE.RGBAFormat
  );
  heatmapDataTex.colorSpace = THREE.SRGBColorSpace;
  heatmapDataTex.minFilter = THREE.LinearFilter;
  heatmapDataTex.magFilter = THREE.LinearFilter;
  heatmapDataTex.generateMipmaps = false;
  heatmapDataTex.needsUpdate = true;

  const heatmapPlaneGeo = trackGeo(new THREE.PlaneGeometry(HEATMAP_PLANE_WIDTH, HEATMAP_PLANE_DEPTH));
  heatmapPlaneGeo.rotateX(-Math.PI / 2);

  const heatmapSliceMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: heatmapDataTex,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  const heatmapSliceMesh = new THREE.Mesh(heatmapPlaneGeo, heatmapSliceMat);
  heatmapSliceMesh.position.set(0, floorY + 0.12 + HEATMAP_DEFAULT_SLICE_M, 0);
  heatmapSliceMesh.renderOrder = 8;
  heatmapGroup.add(heatmapSliceMesh);

  // Crisp perimeter border showing exact vertical elevation of the horizontal thermal slice
  const hw = HEATMAP_PLANE_WIDTH / 2;
  const hd = HEATMAP_PLANE_DEPTH / 2;
  const sliceBorderPts = new Float32Array([
    -hw, 0, -hd,
    hw, 0, -hd,
    hw, 0, hd,
    -hw, 0, hd,
  ]);
  const sliceBorderGeo = trackGeo(new THREE.BufferGeometry());
  sliceBorderGeo.setAttribute('position', new THREE.BufferAttribute(sliceBorderPts, 3));
  const sliceBorderMat = trackMat(
    new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.78,
    })
  );
  const sliceBorderLoop = new THREE.LineLoop(sliceBorderGeo, sliceBorderMat);
  sliceBorderLoop.position.set(0, floorY + 0.13 + HEATMAP_DEFAULT_SLICE_M, 0);
  sliceBorderLoop.renderOrder = 9;
  heatmapGroup.add(sliceBorderLoop);

  // Soft raised-floor thermal anchor projection underneath elevated slices
  const heatmapFloorMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: heatmapDataTex,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const heatmapFloorMesh = new THREE.Mesh(heatmapPlaneGeo, heatmapFloorMat);
  heatmapFloorMesh.position.set(0, floorY + 0.13, 0);
  heatmapFloorMesh.renderOrder = 4;
  heatmapGroup.add(heatmapFloorMesh);

  // Volumetric 3D rising thermal exhaust plumes (outer convection sheath + inner hot core)
  const plumeTex = createThermalPlumeTexture();
  const plumeOuterGeo = trackGeo(new THREE.CylinderGeometry(0.76, 0.34, 1.0, 12, 1, true));
  const plumeCoreGeo = trackGeo(new THREE.CylinderGeometry(0.36, 0.18, 1.0, 10, 1, true));
  const plumeOuterMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: plumeTex,
      color: 0xffffff,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  const plumeCoreMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: plumeTex,
      color: 0xffffff,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  const thermalPlumesInst = new THREE.InstancedMesh(plumeOuterGeo, plumeOuterMat, MAX_THERMAL_PLUMES);
  const thermalPlumeCoresInst = new THREE.InstancedMesh(plumeCoreGeo, plumeCoreMat, MAX_THERMAL_PLUMES);
  _quat.identity();
  _pos.set(0, -100, 0);
  _scale.set(0.01, 0.01, 0.01);
  _mat4.compose(_pos, _quat, _scale);
  _color.setHex(0xf97316);
  for (let i = 0; i < MAX_THERMAL_PLUMES; i++) {
    thermalPlumesInst.setMatrixAt(i, _mat4);
    thermalPlumesInst.setColorAt(i, _color);
    thermalPlumeCoresInst.setMatrixAt(i, _mat4);
    thermalPlumeCoresInst.setColorAt(i, _color);
  }
  thermalPlumesInst.instanceMatrix.needsUpdate = true;
  thermalPlumeCoresInst.instanceMatrix.needsUpdate = true;
  if (thermalPlumesInst.instanceColor) thermalPlumesInst.instanceColor.needsUpdate = true;
  if (thermalPlumeCoresInst.instanceColor) thermalPlumeCoresInst.instanceColor.needsUpdate = true;
  thermalPlumesInst.count = 0;
  thermalPlumeCoresInst.count = 0;
  thermalPlumesInst.frustumCulled = false;
  thermalPlumeCoresInst.frustumCulled = false;
  thermalPlumesInst.renderOrder = 9;
  thermalPlumeCoresInst.renderOrder = 10;
  heatmapGroup.add(thermalPlumesInst, thermalPlumeCoresInst);

  // --- 3b. 160 Cold Aisle SLA Temp & Humidity Sensors (2 per row x 20 rows x 4 halls) via InstancedMesh ---
  const slaCount = COLD_AISLE_SLA_SENSOR_PLACEMENTS.length;
  const slaStalkGeo = trackGeo(new THREE.BoxGeometry(0.06, 0.32, 0.06));
  const slaPodGeo = trackGeo(new THREE.BoxGeometry(0.30, 0.18, 0.18));
  const slaBeaconGeo = trackGeo(new THREE.BoxGeometry(0.34, 0.14, 0.22));
  const slaHitGeo = trackGeo(new THREE.BoxGeometry(0.85, 0.85, 0.60));

  const slaPodMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.35,
      metalness: 0.22,
    })
  );
  const slaBeaconMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const slaHitMat = trackMat(
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false })
  );

  const slaStalkInst = new THREE.InstancedMesh(slaStalkGeo, lightSteelMat, slaCount);
  const slaPodInst = new THREE.InstancedMesh(slaPodGeo, slaPodMat, slaCount);
  const slaBeaconInst = new THREE.InstancedMesh(slaBeaconGeo, slaBeaconMat, slaCount);
  const slaHitInst = new THREE.InstancedMesh(slaHitGeo, slaHitMat, slaCount);

  for (let i = 0; i < slaCount; i++) {
    const sp = COLD_AISLE_SLA_SENSOR_PLACEMENTS[i];
    _quat.setFromAxisAngle(_yAxis, sp.rotationY);
    _scale.set(1, 1, 1);

    // Vertical probe mast anchored from cabinet front bezel into cold aisle intake
    _pos.set(sp.x, sp.y - 0.14, sp.z);
    _mat4.compose(_pos, _quat, _scale);
    slaStalkInst.setMatrixAt(i, _mat4);

    // Calibrated temp + humidity sensor transmitter housing
    _pos.set(sp.x, sp.y, sp.z);
    _mat4.compose(_pos, _quat, _scale);
    slaPodInst.setMatrixAt(i, _mat4);

    // High-contrast SLA compliance status beacon cap
    _pos.set(sp.x, sp.y + 0.15, sp.z);
    _mat4.compose(_pos, _quat, _scale);
    slaBeaconInst.setMatrixAt(i, _mat4);
    _color.setHex(0x06b6d4);
    slaBeaconInst.setColorAt(i, _color);

    // Generous invisible hit volume for effortless click-to-inspect picking
    _pos.set(sp.x, sp.y + 0.06, sp.z);
    _mat4.compose(_pos, _quat, _scale);
    slaHitInst.setMatrixAt(i, _mat4);
  }

  slaStalkInst.instanceMatrix.needsUpdate = true;
  slaPodInst.instanceMatrix.needsUpdate = true;
  slaBeaconInst.instanceMatrix.needsUpdate = true;
  slaHitInst.instanceMatrix.needsUpdate = true;
  if (slaBeaconInst.instanceColor) slaBeaconInst.instanceColor.needsUpdate = true;
  slaStalkInst.computeBoundingSphere();
  slaPodInst.computeBoundingSphere();
  slaBeaconInst.computeBoundingSphere();
  slaHitInst.computeBoundingSphere();

  const slaSensorsGroup = new THREE.Group();
  slaSensorsGroup.add(slaStalkInst, slaPodInst, slaBeaconInst, slaHitInst);
  scene.add(slaSensorsGroup);

  // Register SLA sensor hit boxes ahead of rack bodies so sensor clicks take priority cleanly
  interactables.push(slaHitInst, rackBodiesInst);

  // Floating selection ring & vertical highlight beacon for whichever rack or SLA sensor is selected
  const rackSelectionRing = new THREE.Mesh(
    trackGeo(new THREE.RingGeometry(0.75, 1.05, 24)),
    selectionRingMat
  );
  rackSelectionRing.rotation.x = -Math.PI / 2;
  rackSelectionRing.visible = false;
  scene.add(rackSelectionRing);

  const rackSelectionBeaconMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x3dcd58,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  const rackSelectionBeacon = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.18, 0.36, 4.2, 12, 1, true)),
    rackSelectionBeaconMat
  );
  rackSelectionBeacon.visible = false;
  scene.add(rackSelectionBeacon);

  // --- 4. 8 Cooling Units: Halls A/C/D Air CRACs + Hall B Direct-to-Chip Liquid Cooling CDUs (CDU-B1/B2) ---
  const selectionRingGeo = trackGeo(new THREE.RingGeometry(1.4, 1.75, 24));
  const cracHitGeo = trackGeo(new THREE.BoxGeometry(6.8, 3.8, 2.4));
  const cracCabinetGeo = trackGeo(new THREE.BoxGeometry(6.4, 3.0, 1.6));
  const cracHoodGeo = trackGeo(new THREE.BoxGeometry(6.2, 0.58, 1.52));
  const cracGrilleGeo = trackGeo(new THREE.BoxGeometry(1.75, 1.15, 0.08));
  const cracDoorSeamGeo = trackGeo(new THREE.BoxGeometry(0.05, 2.85, 1.64));
  const cracPipeGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.11, 3.1, 8));
  const cracValveGeo = trackGeo(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10));
  const cracHmiGeo = trackGeo(new THREE.BoxGeometry(0.62, 0.42, 0.08));
  const cracPathBandGeo = trackGeo(new THREE.BoxGeometry(6.44, 0.12, 1.64));

  const cduExpTankGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 2.1, 12));
  const cduPumpGeo = trackGeo(new THREE.CylinderGeometry(0.28, 0.28, 1.05, 12));
  const cduRiserGeo = trackGeo(new THREE.CylinderGeometry(0.12, 0.12, 3.7, 10));

  for (const cp of CRAC_3D_PLACEMENTS) {
    const unit = bms.cracUnits.find((c) => c.id === cp.cracId);
    const isPathB = unit?.redundancyPath === 'Path B' || cp.cracId.endsWith('2');
    const isLiquidCdu = cp.coolingType === 'Liquid CDU' || unit?.coolingType === 'Liquid CDU';
    const pathMat = isPathB ? buswayOrangeMat : buswayGreenMat;

    const cracGroup = new THREE.Group();
    cracGroup.position.set(cp.x, floorY + 0.1, cp.z);
    cracGroup.rotation.y = cp.rotationY;
    scene.add(cracGroup);

    const cShadow = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(7.2, 2.8)), contactShadowMat);
    cShadow.rotation.x = -Math.PI / 2;
    cShadow.position.y = 0.02;
    cracGroup.add(cShadow);

    const beaconMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: isLiquidCdu ? 0x06b6d4 : 0x3dcd58,
        emissive: isLiquidCdu ? 0x06b6d4 : 0x3dcd58,
        emissiveIntensity: 1.1,
        roughness: 0.25,
      })
    );

    if (isLiquidCdu) {
      // Hall B Brushed-Stainless & Cyan/Teal Direct-to-Chip Liquid Cooling CDU Skid
      const skid = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.4, 0.24, 1.95)), lightSteelMat);
      skid.position.y = 0.12;
      const cabinet = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.6, 2.85, 1.65)), lightSteelMat);
      cabinet.position.set(-0.2, 1.65, 0);
      const cyanCap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.72, 0.28, 1.74)), cduCyanMat);
      cyanCap.position.set(-0.2, 3.16, 0);
      const pathBand = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.74, 0.12, 1.76)), pathMat);
      pathBand.position.set(-0.2, 2.96, 0);
      // Visible brazed-plate HX & duplex stainless pump bay on front face
      const hxWindow = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.1, 1.6, 0.12)), darkSteelMat);
      hxWindow.position.set(-1.35, 1.45, 0.82);
      const hxCore = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.4, 1.25, 0.16)), copperMat);
      hxCore.position.set(-1.35, 1.45, 0.86);
      const pump1 = new THREE.Mesh(cduPumpGeo, cduCyanMat);
      pump1.position.set(0.35, 1.05, 0.88);
      const pump2 = new THREE.Mesh(cduPumpGeo, cduCyanMat);
      pump2.position.set(1.15, 1.05, 0.88);
      // Twin vertical expansion vessels mounted at right side of CDU skid
      const exp1 = new THREE.Mesh(cduExpTankGeo, cduCyanMat);
      exp1.position.set(2.9, 1.45, -0.35);
      const exp2 = new THREE.Mesh(cduExpTankGeo, cabinetWhiteMat);
      exp2.position.set(2.9, 1.45, 0.35);
      // Secondary cyan coolant supply + coral-red warm return risers feeding Hall B overhead manifolds
      const supRiser = new THREE.Mesh(cduRiserGeo, cduCyanMat);
      supRiser.position.set(-0.85, 2.65, 0.92);
      const retRiser = new THREE.Mesh(cduRiserGeo, cduCoralMat);
      retRiser.position.set(-0.15, 2.65, 0.92);
      const hmi = new THREE.Mesh(cracHmiGeo, hmiScreenMat);
      hmi.position.set(1.95, 2.05, 0.86);
      const beaconF = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.2, 0.16, 0.1)), beaconMat);
      beaconF.position.set(-0.2, 2.68, 0.86);
      const beaconR = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.2, 0.16, 0.1)), beaconMat);
      beaconR.position.set(-0.2, 2.68, -0.86);
      cracGroup.add(
        skid,
        cabinet,
        cyanCap,
        pathBand,
        hxWindow,
        hxCore,
        pump1,
        pump2,
        exp1,
        exp2,
        supRiser,
        retRiser,
        hmi,
        beaconF,
        beaconR
      );
    } else {
      const cabinet = new THREE.Mesh(cracCabinetGeo, cabinetWhiteMat);
      cabinet.position.y = 1.5;
      cracGroup.add(cabinet);

      // 3-bay service door seams + Path A/B identification stripe
      for (const sx of [-1.1, 1.1]) {
        const seam = new THREE.Mesh(cracDoorSeamGeo, darkSteelMat);
        seam.position.set(sx, 1.5, 0);
        cracGroup.add(seam);
      }
      const pathBand = new THREE.Mesh(cracPathBandGeo, pathMat);
      pathBand.position.y = 2.95;
      cracGroup.add(pathBand);

      // Top return-air plenum hood + recessed louver slats
      const hood = new THREE.Mesh(cracHoodGeo, darkSteelMat);
      hood.position.y = 3.29;
      cracGroup.add(hood);

      // 3 front + 3 rear EC-fan discharge grilles
      for (const gx of [-2.1, 0, 2.1]) {
        const fg = new THREE.Mesh(cracGrilleGeo, darkSteelMat);
        fg.position.set(gx, 0.9, 0.81);
        const rg = new THREE.Mesh(cracGrilleGeo, darkSteelMat);
        rg.position.set(gx, 0.9, -0.81);
        cracGroup.add(fg, rg);
      }

      // Front BACnet/PLC touchscreen HMI & rotary isolator handle
      const hmi = new THREE.Mesh(cracHmiGeo, hmiScreenMat);
      hmi.position.set(2.15, 2.0, 0.82);
      cracGroup.add(hmi);

      // Chilled-water supply (blue) & return (red) manifold risers + butterfly valve actuators
      const pipe1 = new THREE.Mesh(cracPipeGeo, chilledPipeMat);
      pipe1.position.set(3.38, 1.95, -0.24);
      const pipe2 = new THREE.Mesh(cracPipeGeo, hotPipeMat);
      pipe2.position.set(3.38, 1.95, 0.24);
      const valve1 = new THREE.Mesh(cracValveGeo, darkSteelMat);
      valve1.rotation.z = Math.PI / 2;
      valve1.position.set(3.54, 1.45, -0.24);
      const valve2 = new THREE.Mesh(cracValveGeo, darkSteelMat);
      valve2.rotation.z = Math.PI / 2;
      valve2.position.set(3.54, 1.45, 0.24);
      cracGroup.add(pipe1, pipe2, valve1, valve2);

      const beaconF = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.6, 0.14, 0.08)), beaconMat);
      beaconF.position.set(0, 2.62, 0.82);
      const beaconR = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.6, 0.14, 0.08)), beaconMat);
      beaconR.position.set(0, 2.62, -0.82);
      cracGroup.add(beaconF, beaconR);
    }

    const selectionRing = new THREE.Mesh(selectionRingGeo, selectionRingMat);
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.scale.set(2.4, 1.1, 1);
    selectionRing.position.y = 0.04;
    selectionRing.visible = false;
    cracGroup.add(selectionRing);

    const hitMesh = new THREE.Mesh(cracHitGeo, invisibleHitMat);
    hitMesh.position.y = 1.8;
    hitMesh.userData = {
      asset: {
        kind: 'crac',
        id: cp.cracId,
        label: unit ? unit.name : cp.cracId.toUpperCase(),
        subtitle: unit
          ? `${isLiquidCdu ? 'Liquid Cooling CDU' : 'BMS CRAC'} · ${unit.hallLabel} · ${unit.endpoint}`
          : isLiquidCdu
          ? 'Direct-to-Chip Liquid CDU'
          : 'BMS Cooling Unit',
      },
    } satisfies TwinInteractableUserData;
    cracGroup.add(hitMesh);
    interactables.push(hitMesh);

    bmsRefs.set(cp.cracId, { id: cp.cracId, kind: 'crac', beaconMat, selectionRing });
  }

  // --- 4b. Hall B Direct-to-Chip Liquid Cooling Overhead Coolant Manifolds (Cyan Supply + Coral Return) ---
  const hallB = HALL_ZONE_BOUNDS.find((h) => h.hallId === 'hall-b');
  if (hallB) {
    // East gallery vertical collector headers tied into CDU-B1 & CDU-B2
    const cduCollectorSup = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.15, 0.15, 36.0, 10)),
      cduCyanMat
    );
    cduCollectorSup.rotation.x = Math.PI / 2;
    cduCollectorSup.position.set(25.9, floorY + 3.62, hallB.centerZ);

    const cduCollectorRet = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.15, 0.15, 36.0, 10)),
      cduCoralMat
    );
    cduCollectorRet.rotation.x = Math.PI / 2;
    cduCollectorRet.position.set(26.35, floorY + 3.86, hallB.centerZ);
    interiorGroup.add(cduCollectorSup, cduCollectorRet);

    // 10 paired row overhead supply/return branches + vertical rack cold-plate drops
    const branchGeo = trackGeo(new THREE.CylinderGeometry(0.075, 0.075, 20.8, 8));
    branchGeo.rotateZ(Math.PI / 2);
    const dropGeo = trackGeo(new THREE.CylinderGeometry(0.04, 0.04, 1.35, 6));
    const supBranchInst = new THREE.InstancedMesh(branchGeo, cduCyanMat, 10);
    const retBranchInst = new THREE.InstancedMesh(branchGeo, cduCoralMat, 10);
    const supDropsInst = new THREE.InstancedMesh(dropGeo, cduCyanMat, 40);
    const retDropsInst = new THREE.InstancedMesh(dropGeo, cduCoralMat, 40);

    let dropIdx = 0;
    for (let pair = 0; pair < 10; pair++) {
      const pz = hallB.centerZ - 16.65 + pair * 3.7;
      _quat.identity();
      _scale.set(1, 1, 1);

      _pos.set(15.6, floorY + 3.62, pz - 0.22);
      _mat4.compose(_pos, _quat, _scale);
      supBranchInst.setMatrixAt(pair, _mat4);

      _pos.set(15.6, floorY + 3.86, pz + 0.22);
      _mat4.compose(_pos, _quat, _scale);
      retBranchInst.setMatrixAt(pair, _mat4);

      for (const dx of [7.5, 12.2, 16.9, 21.6]) {
        _pos.set(dx, floorY + 2.95, pz - 0.22);
        _mat4.compose(_pos, _quat, _scale);
        supDropsInst.setMatrixAt(dropIdx, _mat4);

        _pos.set(dx, floorY + 3.07, pz + 0.22);
        _mat4.compose(_pos, _quat, _scale);
        retDropsInst.setMatrixAt(dropIdx, _mat4);
        dropIdx += 1;
      }
    }
    supBranchInst.instanceMatrix.needsUpdate = true;
    retBranchInst.instanceMatrix.needsUpdate = true;
    supDropsInst.instanceMatrix.needsUpdate = true;
    retDropsInst.instanceMatrix.needsUpdate = true;
    supBranchInst.computeBoundingSphere();
    retBranchInst.computeBoundingSphere();
    supDropsInst.computeBoundingSphere();
    retDropsInst.computeBoundingSphere();
    interiorGroup.add(supBranchInst, retBranchInst, supDropsInst, retDropsInst);
  }

  // --- 5. West MEP 2(N+1) UPS Systems & East Standby Diesel Generators ---
  const upsInverterGeo = trackGeo(new THREE.BoxGeometry(5.8, 3.2, 2.4));
  const upsBatteryGeo = trackGeo(new THREE.BoxGeometry(3.2, 2.95, 2.3));
  const upsVentGeo = trackGeo(new THREE.BoxGeometry(1.5, 1.9, 0.08));
  const upsBusRiserGeo = trackGeo(new THREE.BoxGeometry(0.22, 1.1, 0.28));
  const upsOverheadBusGeo = trackGeo(new THREE.BoxGeometry(8.6, 0.26, 0.36));

  const genFuelTankGeo = trackGeo(new THREE.BoxGeometry(8.5, 0.9, 3.3));
  const genYellowBandGeo = trackGeo(new THREE.BoxGeometry(8.54, 0.14, 3.34));
  const genCanopyGeo = trackGeo(new THREE.BoxGeometry(8.0, 2.8, 3.0));
  const genDoorLouverGeo = trackGeo(new THREE.BoxGeometry(1.85, 1.55, 0.08));
  const genRadiatorGeo = trackGeo(new THREE.BoxGeometry(0.16, 2.1, 2.5));
  const genMufflerGeo = trackGeo(new THREE.CylinderGeometry(0.48, 0.48, 3.4, 14));
  const genStackGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.28, 2.6, 12));
  const genRainCapGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 12));
  const genAtsBoxGeo = trackGeo(new THREE.BoxGeometry(1.55, 2.2, 0.72));

  for (const fp of FACILITY_ASSET_PLACEMENTS) {
    const group = new THREE.Group();
    group.position.set(fp.x, fp.kind === 'ups' ? floorY + 0.06 : 0.24, fp.z);
    group.rotation.y = fp.rotationY;
    scene.add(group);

    const beaconMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3dcd58,
        emissive: 0x3dcd58,
        emissiveIntensity: 1.1,
        roughness: 0.25,
      })
    );
    const selectionRing = new THREE.Mesh(selectionRingGeo, selectionRingMat);
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.position.y = 0.05;
    selectionRing.visible = false;

    if (fp.kind === 'ups') {
      const ups = bms.upsSystems.find((u) => u.id === fp.assetId);
      const isBusB = ups?.feedBus === 'Bus B' || fp.assetId.includes('-b');
      const busMat = isBusB ? buswayOrangeMat : buswayGreenMat;

      // Double-conversion IGBT inverter & rectifier cabinet + adjacent LiFePO4 battery bank
      const inverter = new THREE.Mesh(upsInverterGeo, darkSteelMat);
      inverter.position.set(-1.2, 1.6, 0);
      const batteryCab = new THREE.Mesh(upsBatteryGeo, cabinetWhiteMat);
      batteryCab.position.set(3.4, 1.48, 0);
      const pathTrim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(9.1, 0.16, 2.46)), busMat);
      pathTrim.position.set(0.45, 3.24, 0);

      // 3 inverter bay grilles + HMI screen on center Static Transfer Switch bay
      for (const vx of [-3.1, -1.2, 0.7]) {
        const vent = new THREE.Mesh(upsVentGeo, lightSteelMat);
        vent.position.set(vx, 1.35, 1.21);
        group.add(vent);
      }
      const hmi = new THREE.Mesh(cracHmiGeo, hmiScreenMat);
      hmi.position.set(-1.2, 2.38, 1.24);
      // Battery rack ventilation tiers
      for (const by of [0.85, 1.55, 2.25]) {
        const tray = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.7, 0.36, 0.08)), darkSteelMat);
        tray.position.set(3.4, by, 1.16);
        group.add(tray);
      }
      // Copper busway risers + overhead Bus A / Bus B feeder duct
      for (const bx of [-2.4, -0.4, 2.6]) {
        const riser = new THREE.Mesh(upsBusRiserGeo, copperMat);
        riser.position.set(bx, 3.78, 0);
        group.add(riser);
      }
      const overheadBus = new THREE.Mesh(upsOverheadBusGeo, busMat);
      overheadBus.position.set(0.2, 4.35, 0);

      const beacon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.2, 0.16, 0.08)), beaconMat);
      beacon.position.set(-1.2, 2.86, 1.23);
      selectionRing.scale.set(3.4, 1.8, 1);
      group.add(inverter, batteryCab, pathTrim, hmi, overheadBus, beacon, selectionRing);

      const hit = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(9.6, 4.4, 3.0)), invisibleHitMat);
      hit.position.set(0.8, 2.1, 0);
      hit.userData = {
        asset: {
          kind: 'ups',
          id: fp.assetId,
          label: ups ? ups.name : fp.assetId.toUpperCase(),
          subtitle: ups ? `Tier IV 2(N+1) · ${ups.feedBus} · ${ups.role} · ${ups.endpoint}` : 'Tier IV 2(N+1) UPS',
        },
      } satisfies TwinInteractableUserData;
      group.add(hit);
      interactables.push(hit);
    } else {
      const gen = bms.generators.find((g) => g.id === fp.assetId);
      const isBusB = gen?.feedBus === 'Bus B' || fp.assetId.includes('-b');
      const busMat = isBusB ? buswayOrangeMat : buswayGreenMat;

      // Double-walled 96h belly diesel tank + yellow safety band + acoustic canopy
      const fuelTank = new THREE.Mesh(genFuelTankGeo, darkSteelMat);
      fuelTank.position.y = 0.45;
      const hazardBand = new THREE.Mesh(genYellowBandGeo, safetyYellowMat);
      hazardBand.position.y = 0.85;
      const canopy = new THREE.Mesh(genCanopyGeo, cabinetWhiteMat);
      canopy.position.y = 2.3;
      const busAccent = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.06, 0.16, 3.06)), busMat);
      busAccent.position.y = 3.68;

      // 3 louvered V16 engine inspection doors along each side
      for (const lx of [-2.4, 0, 2.4]) {
        const doorF = new THREE.Mesh(genDoorLouverGeo, darkSteelMat);
        doorF.position.set(lx, 2.15, 1.51);
        const doorB = new THREE.Mesh(genDoorLouverGeo, darkSteelMat);
        doorB.position.set(lx, 2.15, -1.51);
        group.add(doorF, doorB);
      }

      // Front radiator discharge grille + roof exhaust silencer + rain-capped stack
      const intakeGrille = new THREE.Mesh(genRadiatorGeo, darkSteelMat);
      intakeGrille.position.set(4.02, 2.3, 0);
      const muffler = new THREE.Mesh(genMufflerGeo, lightSteelMat);
      muffler.rotation.z = Math.PI / 2;
      muffler.position.set(-0.9, 4.18, 0);
      const stack = new THREE.Mesh(genStackGeo, darkSteelMat);
      stack.position.set(-2.95, 5.05, 0);
      const rainCap = new THREE.Mesh(genRainCapGeo, lightSteelMat);
      rainCap.position.set(-2.95, 6.46, 0);
      rainCap.rotation.z = 0.18;

      // Rear-side ATS switchgear & paralleling cubicle with HMI screen
      const atsBox = new THREE.Mesh(genAtsBoxGeo, darkSteelMat);
      atsBox.position.set(-3.1, 2.05, 1.82);
      const atsHmi = new THREE.Mesh(cracHmiGeo, hmiScreenMat);
      atsHmi.position.set(-3.1, 2.45, 2.2);

      const beacon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.2, 0.18, 0.1)), beaconMat);
      beacon.position.set(0, 3.46, 1.53);
      selectionRing.scale.set(3.4, 1.8, 1);
      group.add(
        fuelTank,
        hazardBand,
        canopy,
        busAccent,
        intakeGrille,
        muffler,
        stack,
        rainCap,
        atsBox,
        atsHmi,
        beacon,
        selectionRing
      );

      const hit = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(9.0, 6.2, 4.2)), invisibleHitMat);
      hit.position.y = 2.9;
      hit.userData = {
        asset: {
          kind: 'generator',
          id: fp.assetId,
          label: gen ? `${gen.name}` : fp.assetId.toUpperCase(),
          subtitle: gen ? `Tier IV 2(N+1) · ${gen.feedBus} · 96h Fuel · ${gen.endpoint}` : 'Tier IV Standby Generator',
        },
      } satisfies TwinInteractableUserData;
      group.add(hit);
      interactables.push(hit);
    }

    bmsRefs.set(fp.assetId, { id: fp.assetId, kind: fp.kind, beaconMat, selectionRing });
  }

  // --- 5b. Basement Level B1 Bulk Diesel Fuel Vault (8 x 50,000 L UL-2085 Tanks supplying 4 Standby Generators) ---
  const basementGroup = new THREE.Group();
  scene.add(basementGroup);

  const bFloorY = BUILDING_BOUNDS.basementFloorY; // -5.6
  const bHeight = BUILDING_BOUNDS.basementCeilingY - bFloorY; // 5.45
  const bCenterX = BUILDING_BOUNDS.basementVaultCenterX; // 37.5
  const bW = BUILDING_BOUNDS.basementVaultWidth; // 13.6
  const bD = BUILDING_BOUNDS.basementVaultDepth; // 63.0

  // Concrete bunded vault floor + retaining walls + Path A/B center firewall
  const vaultFloor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(bW, 0.24, bD)), basementFloorMat);
  vaultFloor.position.set(bCenterX, bFloorY - 0.12, 0);
  const vaultWestWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.4, bHeight, bD)), basementWallMat);
  vaultWestWall.position.set(pitMinX + 0.2, bFloorY + bHeight / 2, 0);
  const vaultNorthWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(bW, bHeight, 0.4)), basementWallMat);
  vaultNorthWall.position.set(bCenterX, bFloorY + bHeight / 2, pitMinZ + 0.2);
  const vaultSouthWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(bW, bHeight, 0.4)), basementWallMat);
  vaultSouthWall.position.set(bCenterX, bFloorY + bHeight / 2, pitMaxZ - 0.2);
  // Low East retaining lip so East camera looks unobstructed directly into all 8 underground diesel tanks
  const vaultEastLip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.35, 1.35, bD)), basementWallMat);
  vaultEastLip.position.set(pitMaxX - 0.18, bFloorY + 0.68, 0);
  // Half-height concrete bund firewall separating Path A & Path B vaults while keeping all 8 tanks unobstructed
  const vaultCenterFirewall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(bW - 0.8, 1.85, 0.42)), basementWallMat);
  vaultCenterFirewall.position.set(bCenterX, bFloorY + 0.92, 0);
  // High-contrast interior vault strip lighting along West retaining wall
  for (const lz of [-24, -10, 10, 24]) {
    const strip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.12, 0.22, 9.2)), vaultLightStripMat);
    strip.position.set(pitMinX + 0.48, -1.25, lz);
    basementGroup.add(strip);
  }
  basementGroup.add(vaultFloor, vaultWestWall, vaultNorthWall, vaultSouthWall, vaultEastLip, vaultCenterFirewall);

  // Shared geometries for the 8 Basement UL-2085 cylindrical bulk diesel tanks
  const dieselCylGeo = trackGeo(new THREE.CylinderGeometry(1.12, 1.12, 5.4, 20));
  const dieselCapGeo = trackGeo(new THREE.SphereGeometry(1.12, 16, 12));
  const dieselBandGeo = trackGeo(new THREE.CylinderGeometry(1.15, 1.15, 0.34, 20));
  const dieselPathBandGeo = trackGeo(new THREE.CylinderGeometry(1.15, 1.15, 0.18, 20));
  const dieselSaddleGeo = trackGeo(new THREE.BoxGeometry(0.32, 1.0, 2.0));
  const dieselManwayGeo = trackGeo(new THREE.CylinderGeometry(0.36, 0.4, 0.38, 12));
  const dieselPumpGeo = trackGeo(new THREE.CylinderGeometry(0.22, 0.22, 0.65, 10));
  const dieselHitGeo = trackGeo(new THREE.BoxGeometry(8.2, 3.4, 3.2));

  for (const tp of DIESEL_TANK_3D_PLACEMENTS) {
    const tank = bms.dieselTanks.find((d) => d.id === tp.tankId);
    const isPathB = tp.redundancyPath === 'Path B';
    const pathMat = isPathB ? buswayOrangeMat : buswayGreenMat;

    const tankGroup = new THREE.Group();
    tankGroup.position.set(tp.x, tp.y, tp.z);
    basementGroup.add(tankGroup);

    const cyl = new THREE.Mesh(dieselCylGeo, lightSteelMat);
    cyl.rotation.z = Math.PI / 2;
    cyl.position.set(0.2, 1.55, 0);
    const capW = new THREE.Mesh(dieselCapGeo, lightSteelMat);
    capW.scale.set(0.55, 1, 1);
    capW.position.set(-2.5, 1.55, 0);
    const capE = new THREE.Mesh(dieselCapGeo, lightSteelMat);
    capE.scale.set(0.55, 1, 1);
    capE.position.set(2.9, 1.55, 0);
    const yellowBand = new THREE.Mesh(dieselBandGeo, safetyYellowMat);
    yellowBand.rotation.z = Math.PI / 2;
    yellowBand.position.set(0.2, 1.55, 0);
    const pBandW = new THREE.Mesh(dieselPathBandGeo, pathMat);
    pBandW.rotation.z = Math.PI / 2;
    pBandW.position.set(-1.6, 1.55, 0);
    const pBandE = new THREE.Mesh(dieselPathBandGeo, pathMat);
    pBandE.rotation.z = Math.PI / 2;
    pBandE.position.set(2.0, 1.55, 0);

    for (const sx of [-1.6, 0.2, 2.0]) {
      const saddle = new THREE.Mesh(dieselSaddleGeo, darkSteelMat);
      saddle.position.set(sx, 0.55, 0);
      tankGroup.add(saddle);
    }
    const manway = new THREE.Mesh(dieselManwayGeo, darkSteelMat);
    manway.position.set(0.2, 2.82, 0);
    // West-side duplex transfer pump feeding yellow collector header
    const pump = new THREE.Mesh(dieselPumpGeo, safetyYellowMat);
    pump.rotation.z = Math.PI / 2;
    pump.position.set(-3.45, 0.65, 0);
    const branchPipe = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.11, 1.4, 8)), safetyYellowMat);
    branchPipe.rotation.z = Math.PI / 2;
    branchPipe.position.set(-3.9, 0.85, 0);

    const beaconMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3dcd58,
        emissive: 0x3dcd58,
        emissiveIntensity: 1.2,
        roughness: 0.2,
      })
    );
    const levelBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.2, 1.65, 0.14)), beaconMat);
    levelBar.position.set(3.52, 1.55, 0);
    const topBeacon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.4, 0.14, 0.14)), beaconMat);
    topBeacon.position.set(0.2, 2.74, 0.85);

    const selectionRing = new THREE.Mesh(selectionRingGeo, selectionRingMat);
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.scale.set(2.7, 1.35, 1);
    selectionRing.position.set(0.2, 0.08, 0);
    selectionRing.visible = false;

    const hit = new THREE.Mesh(dieselHitGeo, invisibleHitMat);
    hit.position.set(0, 1.6, 0);
    hit.userData = {
      asset: {
        kind: 'diesel_tank',
        id: tp.tankId,
        label: tank ? tank.name : tp.tankId.toUpperCase(),
        subtitle: tank
          ? `Basement B1 · 50,000 L UL-2085 · Feeds ${tank.servedGenerators.join('/')}`
          : 'Basement Diesel Storage Tank',
      },
    } satisfies TwinInteractableUserData;

    tankGroup.add(
      cyl,
      capW,
      capE,
      yellowBand,
      pBandW,
      pBandE,
      manway,
      pump,
      branchPipe,
      levelBar,
      topBeacon,
      selectionRing,
      hit
    );
    interactables.push(hit);
    bmsRefs.set(tp.tankId, { id: tp.tankId, kind: 'diesel_tank', beaconMat, selectionRing });
  }

  // Yellow Diesel Transfer Collector Manifolds (Path A North & Path B South) + 4 Vertical Risers into GEN-A1..B2
  for (const zCenter of [-16.9, 16.9]) {
    const collector = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.16, 0.16, 22.5, 10)),
      safetyYellowMat
    );
    collector.rotation.x = Math.PI / 2;
    collector.position.set(33.7, -4.65, zCenter);
    basementGroup.add(collector);
  }
  for (const gz of [-24.0, -10.0, 10.0, 24.0]) {
    // Vertical yellow supply & copper return risers climbing directly from Basement B1 up into Generator Yard belly tank
    const supRiser = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.15, 0.15, 5.4, 10)),
      safetyYellowMat
    );
    supRiser.position.set(33.7, -1.95, gz - 0.35);
    const retRiser = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.11, 0.11, 5.4, 10)),
      copperMat
    );
    retRiser.position.set(33.7, -1.95, gz + 0.35);
    const genStub = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 7.0, 10)),
      safetyYellowMat
    );
    genStub.rotation.z = Math.PI / 2;
    genStub.position.set(37.2, 0.65, gz - 0.35);

    // Structural steel portal frame grounding each above-ground Generator Pad directly onto Basement B1 floor slab (clears adjacent tanks)
    const portalSpanX = 9.4;
    const portalBeam = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(portalSpanX, 0.46, 0.52)),
      darkSteelMat
    );
    portalBeam.position.set(37.9, -0.35, gz);
    const colWest = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.48, bHeight - 0.1, 0.48)),
      darkSteelMat
    );
    colWest.position.set(33.45, bFloorY + (bHeight - 0.1) / 2, gz);
    const colEast = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.48, bHeight - 0.1, 0.48)),
      darkSteelMat
    );
    colEast.position.set(42.35, bFloorY + (bHeight - 0.1) / 2, gz);

    basementGroup.add(supRiser, retRiser, genStub, portalBeam, colWest, colEast);
  }

  // --- 5c. West Tier IV Electrical Distribution Chain: HV (132kV/11kV) -> MSB (415V) -> OPSWB -> Electrical (IT) + Mechanical ---
  const ceramicMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.28, metalness: 0.12 })
  );
  for (const ep of ELECTRICAL_CHAIN_3D_PLACEMENTS) {
    const node = bms.electricalSwitchgear.find((n) => n.id === ep.nodeId);
    const isPathB = ep.redundancyPath === 'Path B';
    const pathMat = isPathB ? buswayOrangeMat : buswayGreenMat;

    const swgGroup = new THREE.Group();
    swgGroup.position.set(ep.x, ep.stage === 'OPSWB' ? floorY + 0.06 : 0.28, ep.z);
    scene.add(swgGroup);

    const beaconMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3dcd58,
        emissive: 0x3dcd58,
        emissiveIntensity: 1.15,
        roughness: 0.25,
      })
    );
    const selectionRing = new THREE.Mesh(selectionRingGeo, selectionRingMat);
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.position.y = 0.06;
    selectionRing.visible = false;

    if (ep.stage === 'HV') {
      // 132kV / 11kV 20 MVA Step-Down Transformer with Radiators, 3 Tall Ceramic Bushings & Conservator Drum
      const bund = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.6, 0.28, 7.2)), darkSteelMat);
      bund.position.y = 0.14;
      const body = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.2, 3.0, 4.4)), darkSteelMat);
      body.position.y = 1.78;
      const accent = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.26, 0.2, 4.46)), pathMat);
      accent.position.y = 3.24;
      // Finned cooling radiators along North & South sides
      for (const rz of [-2.45, 2.45]) {
        const rad = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.6, 2.35, 0.52)), lightSteelMat);
        rad.position.set(0, 1.75, rz);
        swgGroup.add(rad);
      }
      // 3 Tall Ribbed 132kV HV Ceramic Bushings
      for (const bz of [-1.25, 0, 1.25]) {
        const bush = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.22, 2.05, 10)), ceramicMat);
        bush.position.set(-0.35, 4.3, bz);
        const cap = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.08, 0.35, 8)), copperMat);
        cap.position.set(-0.35, 5.42, bz);
        swgGroup.add(bush, cap);
      }
      // Overhead conservator expansion drum
      const cons = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.45, 0.45, 3.2, 14)), cabinetWhiteMat);
      cons.rotation.x = Math.PI / 2;
      cons.position.set(0.85, 4.15, 0);
      const beacon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 0.22, 3.8)), beaconMat);
      beacon.position.set(-1.64, 2.95, 0);
      selectionRing.scale.set(2.5, 2.9, 1);

      const hit = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.8, 5.8, 7.2)), invisibleHitMat);
      hit.position.y = 2.8;
      hit.userData = {
        asset: {
          kind: 'hv',
          id: ep.nodeId,
          label: node ? node.name : ep.nodeId.toUpperCase(),
          subtitle: node ? `${node.voltageLabel} · Feeds ${node.downstreamTargets.join(', ')}` : 'HV Step-Down Transformer',
        },
      } satisfies TwinInteractableUserData;

      swgGroup.add(bund, body, accent, cons, beacon, selectionRing, hit);
      interactables.push(hit);
      bmsRefs.set(ep.nodeId, { id: ep.nodeId, kind: 'hv', beaconMat, selectionRing });

      // Overhead MV Bus Duct bridge running East from HV Transformer to MSB Switchboard
      const mvBridge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.4, 0.44, 0.8)), pathMat);
      mvBridge.position.set(ep.x + 3.9, 3.85, ep.z);
      const mvCopper = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.44, 0.14, 0.84)), copperMat);
      mvCopper.position.set(ep.x + 3.9, 3.58, ep.z);
      scene.add(mvBridge, mvCopper);
    } else if (ep.stage === 'MSB') {
      // 415V 6300A Form 4B Main Switchboard (MSB) receiving HV + Generator ATS -> feeding UPS & OPSWB
      const cab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.6, 3.2, 8.6)), cabinetWhiteMat);
      cab.position.y = 1.6;
      const topBand = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.66, 0.22, 8.66)), pathMat);
      topBand.position.y = 3.28;
      for (const sz of [-2.1, 0, 2.1]) {
        const seam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.68, 3.1, 0.08)), darkSteelMat);
        seam.position.set(0, 1.6, sz);
        swgGroup.add(seam);
      }
      const hmi = new THREE.Mesh(cracHmiGeo, hmiScreenMat);
      hmi.rotation.y = -Math.PI / 2;
      hmi.position.set(-1.34, 2.1, 0);
      const beacon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.12, 0.2, 7.6)), beaconMat);
      beacon.position.set(-1.34, 2.95, 0);
      const topBus = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.65, 0.35, 8.2)), copperMat);
      topBus.position.y = 3.72;
      selectionRing.scale.set(1.8, 3.4, 1);

      const hit = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.4, 4.2, 9.2)), invisibleHitMat);
      hit.position.y = 2.0;
      hit.userData = {
        asset: {
          kind: 'msb',
          id: ep.nodeId,
          label: node ? node.name : ep.nodeId.toUpperCase(),
          subtitle: node ? `${node.voltageLabel} · ${node.upstreamSource} → UPS & OPSWB` : 'Main Switchboard',
        },
      } satisfies TwinInteractableUserData;

      swgGroup.add(cab, topBand, hmi, beacon, topBus, selectionRing, hit);
      interactables.push(hit);
      bmsRefs.set(ep.nodeId, { id: ep.nodeId, kind: 'msb', beaconMat, selectionRing });

      // Overhead Feeder Ducts from MSB Eastward into UPS Bay (x=-35.0) & through to OPSWB (x=-30.9)
      const msbToUps = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(10.8, 0.34, 0.62)), pathMat);
      msbToUps.position.set(ep.x + 6.4, 4.35, ep.z);
      scene.add(msbToUps);
    } else {
      // 415V Output Switchboard (OPSWB) — Dual Bay serving Electrical (IT) + Mechanical Plant
      const itBay = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.1, 3.1, 4.4)), cabinetWhiteMat);
      itBay.position.set(0, 1.55, -2.25);
      const mechBay = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.1, 3.1, 4.4)), lightSteelMat);
      mechBay.position.set(0, 1.55, 2.25);
      const itBand = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.16, 0.22, 4.46)), pathMat);
      itBand.position.set(0, 3.18, -2.25);
      const mechBand = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.16, 0.22, 4.46)), chilledPipeMat);
      mechBand.position.set(0, 3.18, 2.25);
      const beacon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.12, 0.18, 8.2)), beaconMat);
      beacon.position.set(-1.09, 2.86, 0);
      selectionRing.scale.set(1.6, 3.4, 1);

      const hit = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.8, 4.0, 9.4)), invisibleHitMat);
      hit.position.y = 1.9;
      hit.userData = {
        asset: {
          kind: 'opswb',
          id: ep.nodeId,
          label: node ? node.name : ep.nodeId.toUpperCase(),
          subtitle: node
            ? `Serves Electrical IT (${(node.electricalServeKw / 1000).toFixed(2)} MW) + Mechanical (${(node.mechanicalServeKw / 1000).toFixed(2)} MW)`
            : 'Output Switchboard',
        },
      } satisfies TwinInteractableUserData;

      swgGroup.add(itBay, mechBay, itBand, mechBand, beacon, selectionRing, hit);
      interactables.push(hit);
      bmsRefs.set(ep.nodeId, { id: ep.nodeId, kind: 'opswb', beaconMat, selectionRing });

      // Outgoing Electrical (IT) Busway Trunk from OPSWB Eastward into Data Halls
      const itFeeder = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.6, 0.28, 0.5)), pathMat);
      itFeeder.position.set(ep.x + 3.2, floorY + 3.55, ep.z - 2.25);
      // Outgoing Mechanical Plant Feeder Conduit climbing vertically up West facade to Rooftop Chillers & CHW Pumps
      const mechRiser = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.45, 7.6, 0.45)), chilledPipeMat);
      mechRiser.position.set(ep.x + 0.6, floorY + 5.0, ep.z + 2.25);
      const mechBranch = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.2, 0.34, 0.45)), chilledPipeMat);
      mechBranch.position.set(ep.x + 2.4, floorY + 4.4, ep.z + 2.25);
      scene.add(itFeeder, mechRiser, mechBranch);
    }
  }

  // --- 6. Architectural Data Center Building Shell & 8 Rooftop Chillers (Cutaway Group) ---
  const buildingShellGroup = new THREE.Group();
  scene.add(buildingShellGroup);

  // --- 6a. Site-Specific Admin & Operations Office Pavilion + Enclosed Security Bridge & Data Hall Walkway ---
  const adminAndWalkway = buildAdminOfficeAndWalkway({
    interiorParent: interiorGroup,
    shellParent: buildingShellGroup,
    campusParent: campusGroup,
    isSoftwareGl,
    trackGeo,
    trackMat,
    siteLayout,
    sharedMats: {
      concreteMat,
      facadeMat,
      darkSteelMat,
      lightSteelMat,
      glassMat,
      ecoGreenTrimMat,
      safetyYellowMat,
    },
  });
  interactables.push(...adminAndWalkway.interactables);

  // --- 6b-batt. 2N Battery Rooms A & B Supplying +540V/-540V DC Directly to UPS-A1/A2 & UPS-B1/B2 ---
  const batteryRooms = buildBatteryRooms({
    interiorParent: interiorGroup,
    shellParent: buildingShellGroup,
    isSoftwareGl,
    trackGeo,
    trackMat,
    sharedMats: {
      concreteMat,
      facadeMat,
      darkSteelMat,
      lightSteelMat,
      glassMat,
      ecoGreenTrimMat,
      safetyYellowMat,
    },
  });
  interactables.push(...batteryRooms.interactables);

  const wallH = siteLayout.wallHeight;
  const halfW = BUILDING_BOUNDS.mainWidth / 2;
  const halfD = BUILDING_BOUNDS.mainDepth / 2;

  // Front South facade split around glazed NOC lobby entrance
  const frontLeftWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(23.5, wallH, 0.5)), facadeMat);
  frontLeftWall.position.set(-18.25, floorY + wallH / 2, halfD - 0.25);
  const frontRightWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(23.5, wallH, 0.5)), facadeMat);
  frontRightWall.position.set(18.25, floorY + wallH / 2, halfD - 0.25);

  // Dark tinted glazed NOC lobby entrance + steel mullions + cantilevered canopy
  const lobbyHeader = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(13.2, 2.5, 0.55)), darkSteelMat);
  lobbyHeader.position.set(0, floorY + wallH - 1.25, halfD - 0.22);
  const lobbyCurtainMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1b3347,
      roughness: 0.18,
      metalness: 0.45,
      transparent: true,
      opacity: 0.9,
    })
  );
  const lobbyGlass = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(12.8, 5.1, 0.22)), lobbyCurtainMat);
  lobbyGlass.position.set(0, floorY + 2.55, halfD - 0.12);
  lobbyGlass.renderOrder = 5;
  const mullionGeo = trackGeo(new THREE.BoxGeometry(0.18, 5.1, 0.34));
  for (const mx of [-6.4, -3.2, 0, 3.2, 6.4]) {
    const m = new THREE.Mesh(mullionGeo, darkSteelMat);
    m.position.set(mx, floorY + 2.55, halfD - 0.06);
    buildingShellGroup.add(m);
  }
  const lobbyCanopy = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(14.4, 0.36, 4.2)), darkSteelMat);
  lobbyCanopy.position.set(0, floorY + 5.15, halfD + 1.85);

  const signMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.signageMap,
      roughness: 0.35,
      metalness: 0.15,
    })
  );
  const signMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(11.4, 2.1, 0.16)), signMat);
  signMesh.position.set(0, floorY + 6.45, halfD + 0.16);

  // West, East, and North perimeter walls
  const westWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.5, wallH, BUILDING_BOUNDS.mainDepth)), facadeMat);
  westWall.position.set(-halfW + 0.25, floorY + wallH / 2, 0);
  const eastWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.5, wallH, BUILDING_BOUNDS.mainDepth)), facadeMat);
  eastWall.position.set(halfW - 0.25, floorY + wallH / 2, 0);
  const northWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(BUILDING_BOUNDS.mainWidth, wallH, 0.5)), facadeMat);
  northWall.position.set(0, floorY + wallH / 2, -halfD + 0.25);

  // EcoStruxure-inspired green perimeter parapet fascia
  const fasciaFront = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(BUILDING_BOUNDS.mainWidth + 0.5, 0.42, 0.3)), ecoGreenTrimMat);
  fasciaFront.position.set(0, floorY + wallH - 0.22, halfD + 0.1);
  const fasciaEast = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.3, 0.42, BUILDING_BOUNDS.mainDepth + 0.5)), ecoGreenTrimMat);
  fasciaEast.position.set(halfW + 0.1, floorY + wallH - 0.22, 0);
  const fasciaWest = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.3, 0.42, BUILDING_BOUNDS.mainDepth + 0.5)), ecoGreenTrimMat);
  fasciaWest.position.set(-halfW - 0.1, floorY + wallH - 0.22, 0);

  // Roof deck tinted per site layout
  const roofDeckMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: siteLayout.roofDeckColorHex,
      roughness: 0.62,
      metalness: 0.38,
    })
  );
  const roofDeck = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(BUILDING_BOUNDS.mainWidth + 0.6, 0.5, BUILDING_BOUNDS.mainDepth + 0.6)),
    roofDeckMat
  );
  roofDeck.position.set(0, floorY + wallH + 0.25, 0);

  // West MEP Wing Enclosure
  const mepRoof = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(BUILDING_BOUNDS.mepWidth + 0.3, 0.4, BUILDING_BOUNDS.mepDepth + 0.3)),
    darkSteelMat
  );
  mepRoof.position.set(BUILDING_BOUNDS.mepCenterX, floorY + 5.2, BUILDING_BOUNDS.mepCenterZ);
  const mepWestWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.4, 5.0, BUILDING_BOUNDS.mepDepth)), facadeMat);
  mepWestWall.position.set(BUILDING_BOUNDS.mepCenterX - BUILDING_BOUNDS.mepWidth / 2 + 0.2, floorY + 2.5, BUILDING_BOUNDS.mepCenterZ);
  const mepSouthWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(BUILDING_BOUNDS.mepWidth, 5.0, 0.4)), facadeMat);
  mepSouthWall.position.set(BUILDING_BOUNDS.mepCenterX, floorY + 2.5, BUILDING_BOUNDS.mepDepth / 2 - 0.2);

  // Rooftop Central Chiller Plant per site: 2 Water-Cooled Centrifugal Chillers (2N) + 6 Air-Cooled V-Coil Chillers (2(N+1))
  const roofY = floorY + wallH + 0.52;

  const waterTowerBodyGeo = trackGeo(new THREE.BoxGeometry(11.6, 3.6, 6.2));
  const waterTowerBasinGeo = trackGeo(new THREE.BoxGeometry(12.4, 0.75, 7.0));
  const waterTowerStackGeo = trackGeo(new THREE.CylinderGeometry(1.45, 1.75, 1.4, 18));
  const waterTowerLouverGeo = trackGeo(new THREE.BoxGeometry(10.8, 1.8, 0.16));
  const waterTrimGeo = trackGeo(new THREE.BoxGeometry(11.72, 0.24, 6.32));
  const waterVesselGeo = trackGeo(new THREE.CylinderGeometry(0.68, 0.68, 7.8, 14));
  const waterVfdBoxGeo = trackGeo(new THREE.BoxGeometry(1.7, 2.5, 1.5));
  const waterFanBladeGeo = trackGeo(new THREE.BoxGeometry(2.5, 0.08, 0.28));
  const waterHitGeo = trackGeo(new THREE.BoxGeometry(13.2, 6.2, 7.8));

  const airChillerBaseGeo = trackGeo(new THREE.BoxGeometry(8.6, 0.65, 3.8));
  const airChillerFrameGeo = trackGeo(new THREE.BoxGeometry(8.2, 1.75, 3.4));
  const airVCoilGeo = trackGeo(new THREE.BoxGeometry(7.2, 1.65, 0.14));
  const airFanShroudGeo = trackGeo(new THREE.CylinderGeometry(0.62, 0.72, 0.48, 14));
  const airFanBladeGeo = trackGeo(new THREE.BoxGeometry(1.05, 0.06, 0.16));
  const airMccGeo = trackGeo(new THREE.BoxGeometry(1.2, 1.9, 2.8));
  const airHitGeo = trackGeo(new THREE.BoxGeometry(9.8, 3.6, 4.6));

  const waterBlueMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.36,
      metalness: 0.35,
    })
  );

  for (const cp of CHILLER_3D_PLACEMENTS) {
    const ch = bms.chillers.find((c) => c.id === cp.chillerId);
    const isLoopB = cp.loop === 'Loop B';
    const loopAccentMat = isLoopB ? buswayOrangeMat : buswayGreenMat;

    const beaconMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3dcd58,
        emissive: 0x3dcd58,
        emissiveIntensity: 1.15,
        roughness: 0.25,
      })
    );
    const selectionRing = new THREE.Mesh(selectionRingGeo, selectionRingMat);
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.position.y = 0.08;
    selectionRing.visible = false;

    if (cp.chillerType === 'Water-Cooled') {
      const waterPlant = new THREE.Group();
      waterPlant.position.set(cp.x, roofY, cp.z);

      const basin = new THREE.Mesh(waterTowerBasinGeo, darkSteelMat);
      basin.position.y = 0.38;
      const body = new THREE.Mesh(waterTowerBodyGeo, cabinetWhiteMat);
      body.position.y = 2.55;
      const blueBand = new THREE.Mesh(waterTrimGeo, waterBlueMat);
      blueBand.position.y = 4.28;
      const loopStripe = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(11.74, 0.14, 6.34)), loopAccentMat);
      loopStripe.position.y = 3.98;
      const louverF = new THREE.Mesh(waterTowerLouverGeo, darkSteelMat);
      louverF.position.set(0, 1.9, 3.12);
      const louverB = new THREE.Mesh(waterTowerLouverGeo, darkSteelMat);
      louverB.position.set(0, 1.9, -3.12);

      // Side-mounted evaporator & condenser pressure barrels + VFD electrical drive cabinet
      const evapVessel = new THREE.Mesh(waterVesselGeo, chilledPipeMat);
      evapVessel.rotation.z = Math.PI / 2;
      evapVessel.position.set(-1.1, 1.55, 3.65);
      const condVessel = new THREE.Mesh(waterVesselGeo, lightSteelMat);
      condVessel.rotation.z = Math.PI / 2;
      condVessel.position.set(-1.1, 2.75, 3.65);
      const vfdCab = new THREE.Mesh(waterVfdBoxGeo, darkSteelMat);
      vfdCab.position.set(4.5, 1.95, 3.65);
      const vfdHmi = new THREE.Mesh(cracHmiGeo, hmiScreenMat);
      vfdHmi.position.set(4.5, 2.35, 4.42);

      // Live status beacon bar
      const beacon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(10.8, 0.22, 0.14)), beaconMat);
      beacon.position.set(0, 3.55, 3.16);
      selectionRing.scale.set(4.6, 2.7, 1);

      waterPlant.add(
        basin,
        body,
        blueBand,
        loopStripe,
        louverF,
        louverB,
        evapVessel,
        condVessel,
        vfdCab,
        vfdHmi,
        beacon,
        selectionRing
      );

      // Twin circular induced-draft cooling tower fan stacks with interior cross-blades
      for (const sx of [-2.8, 2.8]) {
        const stack = new THREE.Mesh(waterTowerStackGeo, lightSteelMat);
        stack.position.set(sx, 5.05, 0);
        const blade1 = new THREE.Mesh(waterFanBladeGeo, darkSteelMat);
        blade1.position.set(sx, 5.45, 0);
        const blade2 = new THREE.Mesh(waterFanBladeGeo, darkSteelMat);
        blade2.position.set(sx, 5.45, 0);
        blade2.rotation.y = Math.PI / 2;
        waterPlant.add(stack, blade1, blade2);
      }

      const hit = new THREE.Mesh(waterHitGeo, invisibleHitMat);
      hit.position.set(0, 2.9, 0.4);
      hit.userData = {
        asset: {
          kind: 'chiller',
          id: cp.chillerId,
          label: ch ? ch.name : cp.chillerId.toUpperCase(),
          subtitle: ch
            ? `Water-Cooled Centrifugal · ${ch.chilledLoop} · ${(ch.capacityKw / 1000).toFixed(0)} MW · ${ch.endpoint}`
            : 'Water-Cooled Chiller',
        },
      } satisfies TwinInteractableUserData;
      waterPlant.add(hit);
      interactables.push(hit);
      buildingShellGroup.add(waterPlant);
    } else {
      const chiller = new THREE.Group();
      chiller.position.set(cp.x, roofY, cp.z);

      const base = new THREE.Mesh(airChillerBaseGeo, darkSteelMat);
      base.position.y = 0.34;
      const frame = new THREE.Mesh(airChillerFrameGeo, cabinetWhiteMat);
      frame.position.y = 1.48;
      const loopStripe = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.26, 0.14, 3.46)), loopAccentMat);
      loopStripe.position.y = 2.34;

      // Angled V-coil condenser banks on both long faces
      const coilF = new THREE.Mesh(airVCoilGeo, lightSteelMat);
      coilF.position.set(-0.2, 1.48, 1.72);
      coilF.rotation.x = -0.18;
      const coilB = new THREE.Mesh(airVCoilGeo, lightSteelMat);
      coilB.position.set(-0.2, 1.48, -1.72);
      coilB.rotation.x = 0.18;

      // End-mounted MCC starter & PLC control cubicle
      const mcc = new THREE.Mesh(airMccGeo, darkSteelMat);
      mcc.position.set(4.15, 1.35, 0);
      const mccHmi = new THREE.Mesh(cracHmiGeo, hmiScreenMat);
      mccHmi.rotation.y = Math.PI / 2;
      mccHmi.position.set(4.78, 1.65, 0);

      // 6 top-mounted EC axial condenser fans (2 rows x 3 columns) with cross blades
      for (const fx of [-2.4, 0, 2.4]) {
        for (const fz of [-0.82, 0.82]) {
          const fan = new THREE.Mesh(airFanShroudGeo, darkSteelMat);
          fan.position.set(fx, 2.58, fz);
          const b1 = new THREE.Mesh(airFanBladeGeo, lightSteelMat);
          b1.position.set(fx, 2.68, fz);
          const b2 = new THREE.Mesh(airFanBladeGeo, lightSteelMat);
          b2.position.set(fx, 2.68, fz);
          b2.rotation.y = Math.PI / 2;
          chiller.add(fan, b1, b2);
        }
      }

      const beacon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.0, 0.16, 0.1)), beaconMat);
      beacon.position.set(-0.2, 2.15, 1.78);
      selectionRing.scale.set(3.4, 1.85, 1);

      chiller.add(base, frame, loopStripe, coilF, coilB, mcc, mccHmi, beacon, selectionRing);

      const hit = new THREE.Mesh(airHitGeo, invisibleHitMat);
      hit.position.set(0.2, 1.65, 0);
      hit.userData = {
        asset: {
          kind: 'chiller',
          id: cp.chillerId,
          label: ch ? ch.name : cp.chillerId.toUpperCase(),
          subtitle: ch
            ? `Air-Cooled Free-Cooling · ${ch.chilledLoop} · ${ch.role} · ${ch.endpoint}`
            : 'Air-Cooled Chiller',
        },
      } satisfies TwinInteractableUserData;
      chiller.add(hit);
      interactables.push(hit);
      buildingShellGroup.add(chiller);
    }

    bmsRefs.set(cp.chillerId, { id: cp.chillerId, kind: 'chiller', beaconMat, selectionRing });
  }

  // --- 6b. Rooftop Water Chiller Big Square Thermal Buffer Tanks (2 x 180,000 L) + Complete 3-Pump VFD Pump Sets ---
  const bufTankPlinthGeo = trackGeo(new THREE.BoxGeometry(5.05, 0.55, 5.05));
  const bufTankBodyGeo = trackGeo(new THREE.BoxGeometry(4.8, 5.1, 4.8));
  const bufTankCornerColGeo = trackGeo(new THREE.BoxGeometry(0.24, 5.18, 0.24));
  const bufTankGirthGeo = trackGeo(new THREE.BoxGeometry(4.92, 0.14, 4.92));
  const bufTankBlueBandGeo = trackGeo(new THREE.BoxGeometry(4.88, 0.34, 4.88));
  const bufTankLoopBandGeo = trackGeo(new THREE.BoxGeometry(4.88, 0.22, 4.88));
  const bufTankRoofGeo = trackGeo(new THREE.BoxGeometry(4.96, 0.24, 4.96));
  const bufTankHatchGeo = trackGeo(new THREE.BoxGeometry(1.15, 0.28, 1.15));
  const bufTankVentGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 0.55, 10));
  const bufTankRailPostGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.88, 0.08));
  const bufTankRailBarXGeo = trackGeo(new THREE.BoxGeometry(4.56, 0.06, 0.06));
  const bufTankRailBarZGeo = trackGeo(new THREE.BoxGeometry(0.06, 0.06, 4.56));
  const bufTankLadderRailGeo = trackGeo(new THREE.BoxGeometry(0.07, 5.4, 0.07));
  const bufTankLadderRungGeo = trackGeo(new THREE.BoxGeometry(0.05, 0.05, 0.56));
  const pumpVoluteGeo = trackGeo(new THREE.CylinderGeometry(0.5, 0.5, 0.42, 14));
  const pumpMotorGeo = trackGeo(new THREE.CylinderGeometry(0.42, 0.42, 1.15, 14));
  const pumpSetHitGeo = trackGeo(new THREE.BoxGeometry(12.2, 7.2, 6.8));

  for (const pp of CHW_TANK_PUMP_3D_PLACEMENTS) {
    const ps = bms.chwTankPumpSets.find((item) => item.id === pp.pumpSetId);
    const isLoopB = pp.loop === 'Loop B';
    const loopAccentMat = isLoopB ? buswayOrangeMat : buswayGreenMat;

    const beaconMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        emissive: 0x06b6d4,
        emissiveIntensity: 1.2,
        roughness: 0.22,
      })
    );
    const selectionRing = new THREE.Mesh(selectionRingGeo, selectionRingMat);
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.scale.set(4.5, 2.8, 1);
    selectionRing.position.y = 0.08;
    selectionRing.visible = false;

    const plantSkid = new THREE.Group();
    plantSkid.position.set(pp.x, roofY, pp.z);

    // Concrete / steel inertia skid supporting the square buffer tank + complete 3-pump VFD skid
    const base = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(11.6, 0.38, 6.0)), darkSteelMat);
    base.position.y = 0.19;

    // Massive 180,000 L Square Sectional Insulated Chilled-Water Thermal Buffer Tank (West side of skid)
    const tankX = -2.65;
    const plinth = new THREE.Mesh(bufTankPlinthGeo, darkSteelMat);
    plinth.position.set(tankX, 0.65, 0);
    const shell = new THREE.Mesh(bufTankBodyGeo, lightSteelMat);
    shell.position.set(tankX, 3.48, 0);
    // 4 vertical structural corner angle columns
    for (const sx of [-2.36, 2.36]) {
      for (const sz of [-2.36, 2.36]) {
        const cornerCol = new THREE.Mesh(bufTankCornerColGeo, darkSteelMat);
        cornerCol.position.set(tankX + sx, 3.48, sz);
        plantSkid.add(cornerCol);
      }
    }
    // 2 horizontal panelized girth stiffener bands
    const girthLow = new THREE.Mesh(bufTankGirthGeo, darkSteelMat);
    girthLow.position.set(tankX, 2.25, 0);
    const girthMid = new THREE.Mesh(bufTankGirthGeo, darkSteelMat);
    girthMid.position.set(tankX, 3.9, 0);
    // Square chilled-water blue + Loop A/B identification bands
    const blueBand = new THREE.Mesh(bufTankBlueBandGeo, waterBlueMat);
    blueBand.position.set(tankX, 5.45, 0);
    const loopBand = new THREE.Mesh(bufTankLoopBandGeo, loopAccentMat);
    loopBand.position.set(tankX, 5.08, 0);
    // Flat structural roof deck with raised square access hatch & breather vent
    const roofCap = new THREE.Mesh(bufTankRoofGeo, cabinetWhiteMat);
    roofCap.position.set(tankX, 6.14, 0);
    const accessHatch = new THREE.Mesh(bufTankHatchGeo, darkSteelMat);
    accessHatch.position.set(tankX - 0.85, 6.4, 0.65);
    const breatherVent = new THREE.Mesh(bufTankVentGeo, lightSteelMat);
    breatherVent.position.set(tankX + 1.15, 6.53, -0.95);
    // Square yellow perimeter safety handrail (8 posts + 4 top rails + 4 mid rails around 4.56m square)
    const railHalf = 2.28;
    const postCoords: Array<[number, number]> = [
      [-railHalf, -railHalf],
      [0, -railHalf],
      [railHalf, -railHalf],
      [railHalf, 0],
      [railHalf, railHalf],
      [0, railHalf],
      [-railHalf, railHalf],
      [-railHalf, 0],
    ];
    for (const [px, pz] of postCoords) {
      const post = new THREE.Mesh(bufTankRailPostGeo, safetyYellowMat);
      post.position.set(tankX + px, 6.68, pz);
      plantSkid.add(post);
    }
    for (const ry of [7.1, 6.68]) {
      const railN = new THREE.Mesh(bufTankRailBarXGeo, safetyYellowMat);
      railN.position.set(tankX, ry, -railHalf);
      const railS = new THREE.Mesh(bufTankRailBarXGeo, safetyYellowMat);
      railS.position.set(tankX, ry, railHalf);
      const railW = new THREE.Mesh(bufTankRailBarZGeo, safetyYellowMat);
      railW.position.set(tankX - railHalf, ry, 0);
      const railE = new THREE.Mesh(bufTankRailBarZGeo, safetyYellowMat);
      railE.position.set(tankX + railHalf, ry, 0);
      plantSkid.add(railN, railS, railW, railE);
    }
    // West maintenance ladder
    const ladderL = new THREE.Mesh(bufTankLadderRailGeo, safetyYellowMat);
    ladderL.position.set(tankX - 2.5, 3.65, -0.28);
    const ladderR = new THREE.Mesh(bufTankLadderRailGeo, safetyYellowMat);
    ladderR.position.set(tankX - 2.5, 3.65, 0.28);
    plantSkid.add(ladderL, ladderR);
    for (let r = 0; r < 9; r++) {
      const rung = new THREE.Mesh(bufTankLadderRungGeo, safetyYellowMat);
      rung.position.set(tankX - 2.5, 1.25 + r * 0.6, 0);
      plantSkid.add(rung);
    }
    // Glowing cyan level sight-glass tubes on North & South flat faces of the square buffer tank
    const sightN = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.11, 4.2, 10)), cduCyanMat);
    sightN.position.set(tankX, 3.45, -2.48);
    const sightS = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.11, 4.2, 10)), cduCyanMat);
    sightS.position.set(tankX, 3.45, 2.48);

    // Complete 3-Pump Centrifugal Pump Set (2 Duty + 1 N+1 Standby) with Suction/Discharge Headers & VFD Panel
    const pumpSkidDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.2, 0.24, 5.2)), cabinetWhiteMat);
    pumpSkidDeck.position.set(2.45, 0.5, 0);
    for (const pz of [-1.55, 0, 1.55]) {
      const volute = new THREE.Mesh(pumpVoluteGeo, waterBlueMat);
      volute.rotation.z = Math.PI / 2;
      volute.position.set(1.65, 1.15, pz);
      const motor = new THREE.Mesh(pumpMotorGeo, loopAccentMat);
      motor.rotation.z = Math.PI / 2;
      motor.position.set(2.85, 1.15, pz);
      const coupling = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.22, 0.22, 0.36, 10)), safetyYellowMat);
      coupling.rotation.z = Math.PI / 2;
      coupling.position.set(2.12, 1.15, pz);
      const dischRiser = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 1.45, 10)), chilledPipeMat);
      dischRiser.position.set(1.65, 1.95, pz);
      plantSkid.add(volute, motor, coupling, dischRiser);
    }
    const suctHeader = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 4.6, 12)), cduCyanMat);
    suctHeader.rotation.x = Math.PI / 2;
    suctHeader.position.set(0.6, 1.15, 0);
    const dischHeader = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 4.8, 12)), chilledPipeMat);
    dischHeader.rotation.x = Math.PI / 2;
    dischHeader.position.set(1.65, 2.68, 0);
    const tankTie = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.22, 0.22, 1.6, 10)), cduCyanMat);
    tankTie.rotation.z = Math.PI / 2;
    tankTie.position.set(-0.05, 1.15, 0);
    // Vertical pressurization expansion vessel
    const expVessel = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.42, 0.42, 2.0, 12)), hotPipeMat);
    expVessel.position.set(0.6, 2.2, -2.2);
    // Triplex VFD Pump Control Cabinet + Status Beacon
    const vfdCab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.25, 2.9, 3.8)), darkSteelMat);
    vfdCab.position.set(4.85, 1.85, 0);
    const vfdHmi = new THREE.Mesh(cracHmiGeo, hmiScreenMat);
    vfdHmi.rotation.y = Math.PI / 2;
    vfdHmi.position.set(5.5, 2.2, 0.6);
    const beacon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 0.22, 3.4)), beaconMat);
    beacon.position.set(5.5, 2.95, 0);

    // Pipe bridge linking the Square Buffer Tank & Pump Set directly South into Water Chiller CHW-01 / CHW-02
    const bridgeSup = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 8.4, 10)), chilledPipeMat);
    bridgeSup.rotation.x = Math.PI / 2;
    bridgeSup.position.set(1.65, 2.68, 5.8);
    const bridgeRet = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.22, 0.22, 8.4, 10)), hotPipeMat);
    bridgeRet.rotation.x = Math.PI / 2;
    bridgeRet.position.set(0.6, 1.15, 5.8);

    const hit = new THREE.Mesh(pumpSetHitGeo, invisibleHitMat);
    hit.position.set(0, 3.5, 0);
    hit.userData = {
      asset: {
        kind: 'chw_tank_pump',
        id: pp.pumpSetId,
        label: ps ? ps.name : pp.pumpSetId.toUpperCase(),
        subtitle: ps
          ? `180,000 L Square Buffer Tank + ${ps.pumpConfigLabel} · ${ps.chilledLoop} · ${ps.endpoint}`
          : 'Rooftop Square CHW Buffer Tank & Pump Set',
      },
    } satisfies TwinInteractableUserData;

    plantSkid.add(
      base,
      plinth,
      shell,
      girthLow,
      girthMid,
      blueBand,
      loopBand,
      roofCap,
      accessHatch,
      breatherVent,
      sightN,
      sightS,
      pumpSkidDeck,
      suctHeader,
      dischHeader,
      tankTie,
      expVessel,
      vfdCab,
      vfdHmi,
      beacon,
      bridgeSup,
      bridgeRet,
      selectionRing,
      hit
    );
    interactables.push(hit);
    buildingShellGroup.add(plantSkid);
    bmsRefs.set(pp.pumpSetId, { id: pp.pumpSetId, kind: 'chw_tank_pump', beaconMat, selectionRing });
  }

  // Primary Loop A (West) and Loop B (East) insulated chilled-water headers linking Square Tanks + Pump Sets + 2 Water + 14 Air chillers
  for (const cx of [-14.5, 14.5]) {
    const headerSupply = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.26, 0.26, 84.0, 10)),
      chilledPipeMat
    );
    headerSupply.rotation.x = Math.PI / 2;
    headerSupply.position.set(cx - 5.1, roofY + 0.85, -2.5);
    const headerReturn = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 84.0, 10)),
      hotPipeMat
    );
    headerReturn.rotation.x = Math.PI / 2;
    headerReturn.position.set(cx - 5.7, roofY + 0.85, -2.5);
    buildingShellGroup.add(headerSupply, headerReturn);
  }

  buildingShellGroup.add(
    frontLeftWall,
    frontRightWall,
    lobbyHeader,
    lobbyGlass,
    lobbyCanopy,
    signMesh,
    westWall,
    eastWall,
    northWall,
    fasciaFront,
    fasciaEast,
    fasciaWest,
    roofDeck,
    mepRoof,
    mepWestWall,
    mepSouthWall
  );

  // --- 6c. Distinct Per-Site Architectural Building Elements (KL2 Twin-Wing Sky-Deck & KL3 Modular Fortress) ---
  // KL2: Rhythmic vertical aluminum Brise-Soleil facade fins along South, West, and East exteriors
  if (siteLayout.hasBriseSoleilFins) {
    const finGeoZ = trackGeo(new THREE.BoxGeometry(0.24, wallH - 0.8, 0.85));
    const finGeoX = trackGeo(new THREE.BoxGeometry(0.85, wallH - 0.8, 0.24));
    for (const fx of [-26, -22, -18, -14, -10, 10, 14, 18, 22, 26]) {
      const southFin = new THREE.Mesh(finGeoZ, lightSteelMat);
      southFin.position.set(fx, floorY + wallH / 2, halfD + 0.42);
      buildingShellGroup.add(southFin);
    }
    for (let fz = -40; fz <= 40; fz += 5.0) {
      const westFin = new THREE.Mesh(finGeoX, lightSteelMat);
      westFin.position.set(-halfW - 0.42, floorY + wallH / 2, fz);
      const eastFin = new THREE.Mesh(finGeoX, lightSteelMat);
      eastFin.position.set(halfW + 0.42, floorY + wallH / 2, fz);
      buildingShellGroup.add(westFin, eastFin);
    }
  }

  // KL2: Cantilevered Upper Glazed NOC Sky-Deck Mezzanine projecting over South Lobby
  if (siteLayout.hasCantileverSkyDeck) {
    const skyDeckGroup = new THREE.Group();
    const deckBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(19.6, 0.45, 5.4)), darkSteelMat);
    deckBase.position.set(0, floorY + wallH - 3.3, halfD + 2.7);
    const deckGlass = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(18.8, 2.55, 4.9)), lobbyCurtainMat);
    deckGlass.position.set(0, floorY + wallH - 1.8, halfD + 2.65);
    const deckRoof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(20.2, 0.42, 5.8)), darkSteelMat);
    deckRoof.position.set(0, floorY + wallH - 0.3, halfD + 2.8);
    const deckAccent = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(20.3, 0.26, 0.28)), ecoGreenTrimMat);
    deckAccent.position.set(0, floorY + wallH - 0.3, halfD + 5.72);
    // Twin angled structural V-piers anchoring the cantilevered Sky-Deck
    const pierGeo = trackGeo(new THREE.BoxGeometry(0.55, 6.2, 0.55));
    for (const px of [-7.8, 7.8]) {
      const pier = new THREE.Mesh(pierGeo, lightSteelMat);
      pier.position.set(px, floorY + 3.0, halfD + 3.8);
      pier.rotation.x = -0.22;
      skyDeckGroup.add(pier);
    }
    skyDeckGroup.add(deckBase, deckGlass, deckRoof, deckAccent);
    buildingShellGroup.add(skyDeckGroup);
  }

  // KL2: Perforated Rooftop Chiller Acoustic Parapet Louver Screen framing West/East/North roof edges
  if (siteLayout.hasRoofAcousticScreen) {
    const screenH = 3.1;
    const screenMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.48,
        metalness: 0.52,
      })
    );
    const westScreen = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, screenH, BUILDING_BOUNDS.mainDepth - 4)), screenMat);
    westScreen.position.set(-halfW + 0.4, roofY + screenH / 2, 0);
    const eastScreen = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, screenH, BUILDING_BOUNDS.mainDepth - 4)), screenMat);
    eastScreen.position.set(halfW - 0.4, roofY + screenH / 2, 0);
    const northScreen = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(BUILDING_BOUNDS.mainWidth - 1, screenH, 0.32)), screenMat);
    northScreen.position.set(0, roofY + screenH / 2, -halfD + 0.4);
    const capW = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.45, 0.22, BUILDING_BOUNDS.mainDepth - 4)), ecoGreenTrimMat);
    capW.position.set(-halfW + 0.4, roofY + screenH + 0.1, 0);
    const capE = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.45, 0.22, BUILDING_BOUNDS.mainDepth - 4)), ecoGreenTrimMat);
    capE.position.set(halfW - 0.4, roofY + screenH + 0.1, 0);
    buildingShellGroup.add(westScreen, eastScreen, northScreen, capW, capE);
  }

  // KL2: North-Central Elevated Rooftop Helipad / Emergency Drone Logistics Deck (clear between Square Buffer Tanks)
  if (siteLayout.hasNorthHelipad) {
    const heliGroup = new THREE.Group();
    heliGroup.position.set(0, roofY, -41.5);
    const heliPedestal = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(3.6, 4.1, 0.55, 24)), darkSteelMat);
    heliPedestal.position.y = 0.28;
    const heliPad = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(4.5, 4.5, 0.22, 32)), concreteMat);
    heliPad.position.y = 0.66;
    const heliRing = new THREE.Mesh(trackGeo(new THREE.RingGeometry(3.45, 3.85, 32)), safetyYellowMat);
    heliRing.rotation.x = -Math.PI / 2;
    heliRing.position.y = 0.79;
    const hLeft = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.48, 0.04, 3.4)), cabinetWhiteMat);
    hLeft.position.set(-1.1, 0.79, 0);
    const hRight = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.48, 0.04, 3.4)), cabinetWhiteMat);
    hRight.position.set(1.1, 0.79, 0);
    const hCross = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.2, 0.04, 0.48)), cabinetWhiteMat);
    hCross.position.set(0, 0.79, 0);
    heliGroup.add(heliPedestal, heliPad, heliRing, hLeft, hRight, hCross);
    buildingShellGroup.add(heliGroup);
  }

  // KL3: 4 Bold Chamfered Corner Structural Riser & Exhaust Towers with Amber Crown Bands
  if (siteLayout.hasCornerServiceTowers) {
    const towerH = wallH + 2.6;
    const towerGeo = trackGeo(new THREE.BoxGeometry(4.8, towerH, 4.8));
    const crownGeo = trackGeo(new THREE.BoxGeometry(5.05, 0.45, 5.05));
    const capGeo = trackGeo(new THREE.BoxGeometry(4.4, 0.55, 4.4));
    const corners: Array<[number, number]> = [
      [-halfW + 1.0, -halfD + 1.0],
      [halfW - 1.0, -halfD + 1.0],
      [-halfW + 1.0, halfD - 1.0],
      [halfW - 1.0, halfD - 1.0],
    ];
    for (const [cx, cz] of corners) {
      const tower = new THREE.Mesh(towerGeo, facadeMat);
      tower.position.set(cx, floorY + towerH / 2, cz);
      const crown = new THREE.Mesh(crownGeo, ecoGreenTrimMat);
      crown.position.set(cx, floorY + towerH - 0.55, cz);
      const cap = new THREE.Mesh(capGeo, darkSteelMat);
      cap.position.set(cx, floorY + towerH + 0.25, cz);
      buildingShellGroup.add(tower, crown, cap);
    }
  }

  // KL3: 10-Bay Tilted Central Rooftop Solar PV Canopy along Spine (x = 0, z = -34..+34, clear of x = ±14.5 chillers)
  if (siteLayout.hasCentralRoofSolarArray) {
    const solarPanelMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x0f2544,
        emissive: 0x0b1f3a,
        emissiveIntensity: 0.25,
        roughness: 0.22,
        metalness: 0.72,
      })
    );
    const panelGeo = trackGeo(new THREE.BoxGeometry(8.8, 0.12, 4.6));
    const frameGeo = trackGeo(new THREE.BoxGeometry(9.0, 0.18, 0.16));
    const strutGeo = trackGeo(new THREE.BoxGeometry(0.18, 1.45, 0.18));
    for (let i = 0; i < 10; i++) {
      const pz = -31.5 + i * 7.2;
      const pvBay = new THREE.Group();
      pvBay.position.set(0, roofY, pz);
      const panel = new THREE.Mesh(panelGeo, solarPanelMat);
      panel.position.set(0, 1.45, 0);
      panel.rotation.x = 0.22;
      const trimFront = new THREE.Mesh(frameGeo, ecoGreenTrimMat);
      trimFront.position.set(0, 1.0, 2.25);
      for (const sx of [-3.6, 0, 3.6]) {
        const legN = new THREE.Mesh(strutGeo, lightSteelMat);
        legN.position.set(sx, 0.95, -1.6);
        const legS = new THREE.Mesh(strutGeo, lightSteelMat);
        legS.scale.y = 0.62;
        legS.position.set(sx, 0.52, 1.6);
        pvBay.add(legN, legS);
      }
      pvBay.add(panel, trimFront);
      buildingShellGroup.add(pvBay);
    }
  }

  // KL3: Bold Architectural South Reception Porte-Cochère Portal Arch framing the NOC Entrance
  if (siteLayout.hasSouthPorteCochereArch) {
    const portalGroup = new THREE.Group();
    const colGeo = trackGeo(new THREE.BoxGeometry(1.4, wallH - 0.6, 1.4));
    const leftCol = new THREE.Mesh(colGeo, facadeMat);
    leftCol.position.set(-8.8, floorY + (wallH - 0.6) / 2, halfD + 4.4);
    const rightCol = new THREE.Mesh(colGeo, facadeMat);
    rightCol.position.set(8.8, floorY + (wallH - 0.6) / 2, halfD + 4.4);
    const lintel = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(19.6, 1.15, 2.2)), facadeMat);
    lintel.position.set(0, floorY + wallH - 0.85, halfD + 4.4);
    const amberRibbon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(19.8, 0.34, 0.25)), ecoGreenTrimMat);
    amberRibbon.position.set(0, floorY + wallH - 0.42, halfD + 5.55);
    const roofLink = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(18.2, 0.35, 4.4)), darkSteelMat);
    roofLink.position.set(0, floorY + wallH - 1.1, halfD + 2.2);
    portalGroup.add(leftCol, rightCol, lintel, amberRibbon, roofLink);
    buildingShellGroup.add(portalGroup);
  }

  // --- 6b. 3D CFD Airflow Vectors Overlay (Cold-Supply Cyan & Hot-Exhaust Amber-Red) ---
  const airflowGroup = new THREE.Group();
  airflowGroup.visible = false;
  scene.add(airflowGroup);

  const coldSeeds: Array<{ x: number; z: number; phase: number }> = [];
  const hotSeeds: Array<{ x: number; z: number; phase: number }> = [];
  let seedIdx = 0;
  for (const hall of Object.values(HALL_ZONE_BOUNDS)) {
    const xCols = 5;
    const zRows = 6;
    const minX = hall.centerX - hall.width / 2 + 1.8;
    const maxX = hall.centerX + hall.width / 2 - 1.8;
    const minZ = hall.centerZ - hall.depth / 2 + 1.8;
    const maxZ = hall.centerZ + hall.depth / 2 - 1.8;
    for (let ix = 0; ix < xCols; ix++) {
      const fx = ix / (xCols - 1);
      const px = minX + (maxX - minX) * fx;
      for (let iz = 0; iz < zRows; iz++) {
        const fz = iz / (zRows - 1);
        const pz = minZ + (maxZ - minZ) * fz;
        const phase = ((seedIdx * 0.37) % 1);
        if (iz % 2 === 0) {
          coldSeeds.push({ x: px, z: pz, phase });
        } else {
          hotSeeds.push({ x: px, z: pz, phase });
        }
        seedIdx += 1;
      }
    }
  }

  const coldConeGeo = trackGeo(new THREE.ConeGeometry(0.24, 0.72, 6));
  const hotConeGeo = trackGeo(new THREE.ConeGeometry(0.26, 0.86, 6));
  const coldArrowMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.82,
    })
  );
  const hotArrowMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.86,
    })
  );

  const coldAirflowInst = new THREE.InstancedMesh(coldConeGeo, coldArrowMat, coldSeeds.length);
  const hotAirflowInst = new THREE.InstancedMesh(hotConeGeo, hotArrowMat, hotSeeds.length);
  coldAirflowInst.frustumCulled = false;
  hotAirflowInst.frustumCulled = false;
  airflowGroup.add(coldAirflowInst, hotAirflowInst);

  const animateAirflow = (elapsedSec: number) => {
    _quat.identity();
    for (let i = 0; i < coldSeeds.length; i++) {
      const s = coldSeeds[i];
      const t = (elapsedSec * 0.42 + s.phase) % 1;
      const y = floorY + 0.35 + t * 1.95;
      const sc = 0.72 + Math.sin(t * Math.PI) * 0.45;
      _pos.set(s.x, y, s.z);
      _scale.set(sc, sc, sc);
      _mat4.compose(_pos, _quat, _scale);
      coldAirflowInst.setMatrixAt(i, _mat4);
    }
    coldAirflowInst.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < hotSeeds.length; i++) {
      const s = hotSeeds[i];
      const t = (elapsedSec * 0.55 + s.phase) % 1;
      const y = floorY + 2.15 + t * 2.55;
      const sc = 0.78 + Math.sin(t * Math.PI) * 0.52;
      _pos.set(s.x, y, s.z);
      _scale.set(sc, sc, sc);
      _mat4.compose(_pos, _quat, _scale);
      hotAirflowInst.setMatrixAt(i, _mat4);
    }
    hotAirflowInst.instanceMatrix.needsUpdate = true;
  };
  animateAirflow(0);

  const setAirflowVisible = (visible: boolean) => {
    airflowGroup.visible = visible;
    if (visible) {
      animateAirflow(performance.now() * 0.001);
    }
  };

  // --- 6b. Instanced 3D Over-Capacity Alert Beacons (Crimson Pillars + Diamonds) ---
  const overCapBeaconGroup = new THREE.Group();
  scene.add(overCapBeaconGroup);
  const overCapPillarGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.22, 3.3, 8));
  const overCapPillarMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.78,
    })
  );
  const overCapPillarInst = new THREE.InstancedMesh(
    overCapPillarGeo,
    overCapPillarMat,
    MAX_OVERCAP_BEACONS
  );
  overCapPillarInst.count = 0;
  overCapPillarInst.frustumCulled = false;
  overCapBeaconGroup.add(overCapPillarInst);

  const overCapDiamondGeo = trackGeo(new THREE.OctahedronGeometry(0.42, 0));
  const overCapDiamondMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xdc2626,
    })
  );
  const overCapDiamondInst = new THREE.InstancedMesh(
    overCapDiamondGeo,
    overCapDiamondMat,
    MAX_OVERCAP_BEACONS
  );
  overCapDiamondInst.count = 0;
  overCapDiamondInst.frustumCulled = false;
  overCapBeaconGroup.add(overCapDiamondInst);

  const overCapHitGeo = trackGeo(new THREE.BoxGeometry(1.15, 4.3, 1.15));
  const overCapHitMat = trackMat(
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
  );
  const overCapHitInst = new THREE.InstancedMesh(
    overCapHitGeo,
    overCapHitMat,
    MAX_OVERCAP_BEACONS
  );
  overCapHitInst.count = 0;
  overCapHitInst.frustumCulled = false;
  scene.add(overCapHitInst);
  interactables.unshift(overCapHitInst);
  const overCapBeaconRackIds: string[] = [];

  // --- 6c. Instanced Blue 3D BMC Locate LED Beacons (synced with ServerDetailDrawer) ---
  const MAX_LOCATE_BEACONS = 32;
  const locateBeaconGroup = new THREE.Group();
  locateBeaconGroup.visible = false;
  scene.add(locateBeaconGroup);

  const locatePillarGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.24, 3.8, 10));
  const locatePillarMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x2563eb,
      transparent: true,
      opacity: 0.85,
    })
  );
  const locatePillarInst = new THREE.InstancedMesh(
    locatePillarGeo,
    locatePillarMat,
    MAX_LOCATE_BEACONS
  );
  locatePillarInst.count = 0;
  locatePillarInst.frustumCulled = false;

  const locateOrbGeo = trackGeo(new THREE.OctahedronGeometry(0.46, 1));
  const locateOrbMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
    })
  );
  const locateOrbInst = new THREE.InstancedMesh(
    locateOrbGeo,
    locateOrbMat,
    MAX_LOCATE_BEACONS
  );
  locateOrbInst.count = 0;
  locateOrbInst.frustumCulled = false;
  locateBeaconGroup.add(locatePillarInst, locateOrbInst);

  // --- 7. Cutaway, Basement Vault Cutaway, Theme, Signage & Live Telemetry Updaters ---
  const applyCutaway = (t01: number) => {
    const clamped = Math.max(0, Math.min(1, t01));
    buildingShellGroup.position.y = clamped * 26.0;
    buildingShellGroup.visible = clamped < 0.96;
  };

  const applyBasementCutaway = (open: boolean) => {
    eastYardDeckCoverGroup.visible = !open;
  };

  const applyTheme = (darkMode: boolean) => {
    const skyHex = darkMode ? 0x0f141b : 0xe6edf5;
    scene.background = new THREE.Color(skyHex);
    scene.fog = new THREE.Fog(skyHex, 130, 360);
    groundMat.color.setHex(darkMode ? 0x242c36 : 0xd8e1ea);
    lawnMat.color.setHex(darkMode ? 0x1a2820 : 0x9fc29b);
    raisedFloorMat.color.setHex(darkMode ? 0x26303c : 0xf4f7fb);
    corridorFloorMat.color.setHex(darkMode ? 0x1e2630 : 0xdce4ee);
    concreteMat.color.setHex(darkMode ? 0x2b333e : 0xd5dce3);
    facadeMat.color.setHex(darkMode ? siteLayout.darkFacadeColorHex : siteLayout.facadeColorHex);
    campusLandscaping.applyTheme(darkMode);
    telecomRooms.applyTheme(darkMode);
    adminAndWalkway.applyTheme(darkMode);
    batteryRooms.applyTheme(darkMode);
  };

  const updateSiteSignage = (tierLabel: string) => {
    textures.updateSignageText(tierLabel);
  };

  const placementByRackId = new Map(RACK_3D_PLACEMENTS.map((p) => [p.rackId, p]));
  const placementBySlaId = new Map(COLD_AISLE_SLA_SENSOR_PLACEMENTS.map((p) => [p.sensorId, p]));

  const updateLiveTelemetry = (
    liveRacks: RackDefinition[],
    liveServers: ServerNode[],
    liveBms: BmsState,
    overlay: TwinOverlayMode,
    selectedAsset: SelectedTwinAsset | null,
    showSlaSensors = true,
    heatmapConfig?: TwinHeatmapConfig,
    precomputedHeatmapGrid?: ThermalHeatmapGrid | null,
    showOverCapBeacons = true,
    rackPowerAdjustmentsKw?: Record<string, number>,
    hallPowerPolicies?: HallPowerPolicyMap,
    locateLedRackIds: string[] = []
  ) => {
    const metrics = computeRack3DMetrics(liveRacks, liveServers, liveBms);
    const slaMetrics = computeColdAisleSlaSensorMetrics(liveBms, liveServers);
    const powerStats = computeBmsRackPowerStats(liveRacks, liveBms, liveServers, {
      rackPowerAdjustmentsKw,
      hallPowerPolicies,
    });
    rackOverlayInst.visible = overlay === 'thermal' || overlay === 'power';

    for (let i = 0; i < rackCount; i++) {
      const p = RACK_3D_PLACEMENTS[i];
      const m = metrics[p.rackId];
      if (!m) continue;

      const ledHex = statusColorHex(m.status);
      _color.setHex(ledHex);
      rackLedInst.setColorAt(i, _color);

      if (overlay === 'standard') {
        // Dark slate cabinets with subtle highlight on warning/critical racks
        _color.setHex(
          m.status === 'critical' ? 0x6b2025 : m.status === 'warning' ? 0x5c431f : 0x28303b
        );
        rackBodiesInst.setColorAt(i, _color);
        _color.setHex(
          m.status === 'critical' ? 0x99282e : m.status === 'warning' ? 0x805b24 : 0x475569
        );
        rackDoorsInst.setColorAt(i, _color);
      } else if (overlay === 'sla') {
        // Calm uniform slate cabinets so all 160 Cold Aisle SLA sensors pop vividly row-by-row
        _color.setHex(0x232d3b);
        rackBodiesInst.setColorAt(i, _color);
        _color.setHex(0x334155);
        rackDoorsInst.setColorAt(i, _color);
      } else if (overlay === 'thermal') {
        // Vivid continuous temperature-based heatmap overlay directly on all 1,600 server racks
        const heatHex = temperatureToHeatMapHex(m.peakTempC);
        _heatColor.setHex(heatHex);
        rackOverlayInst.setColorAt(i, _heatColor);
        // Strong thermal heatmap wrap on cabinet bodies and front doors while preserving subtle 3D shading
        _color.setHex(0x1e2530).lerp(_heatColor, m.peakTempC >= 60 ? 0.92 : 0.78);
        rackBodiesInst.setColorAt(i, _color);
        _color.setHex(0x2d3748).lerp(_heatColor, m.peakTempC >= 60 ? 0.95 : 0.84);
        rackDoorsInst.setColorAt(i, _color);
      } else {
        const ovHex = powerLoadColorHex(m.utilizationPct);
        _color.setHex(ovHex);
        rackOverlayInst.setColorAt(i, _color);
        rackBodiesInst.setColorAt(i, _color);
        rackDoorsInst.setColorAt(i, _color);
      }
    }

    if (rackLedInst.instanceColor) rackLedInst.instanceColor.needsUpdate = true;
    if (rackBodiesInst.instanceColor) rackBodiesInst.instanceColor.needsUpdate = true;
    if (rackDoorsInst.instanceColor) rackDoorsInst.instanceColor.needsUpdate = true;
    if (rackOverlayInst.instanceColor) rackOverlayInst.instanceColor.needsUpdate = true;

    // Update 3D CFD Thermal Heat Map plane, elevation frame, floor projection, and rising hotspot plumes
    if (overlay === 'thermal') {
      const sliceH = heatmapConfig?.sliceHeightM ?? HEATMAP_DEFAULT_SLICE_M;
      const showSlicePlane = heatmapConfig?.showSlicePlane ?? true;
      const showPlumes = heatmapConfig?.showPlumes ?? true;
      const showContours = heatmapConfig?.showContours ?? true;

      if (showSlicePlane) {
        const grid =
          precomputedHeatmapGrid ??
          computeThermalHeatmapGrid(liveRacks, liveServers, liveBms, sliceH, metrics);
        renderHeatmapToRgba(grid, { showContours, opacity: 0.84 }, heatmapRgba);
        heatmapDataTex.needsUpdate = true;

        heatmapSliceMesh.position.y = floorY + 0.12 + sliceH;
        sliceBorderLoop.position.y = floorY + 0.13 + sliceH;
        heatmapSliceMesh.visible = true;
        sliceBorderLoop.visible = true;
        heatmapFloorMesh.visible = sliceH > 0.65;
      } else {
        heatmapSliceMesh.visible = false;
        sliceBorderLoop.visible = false;
        heatmapFloorMesh.visible = false;
      }
      heatmapGroup.visible = true;

      if (showPlumes) {
        const plumes = extractHotspotPlumes(
          liveRacks,
          liveServers,
          liveBms,
          MAX_THERMAL_PLUMES,
          metrics
        );
        thermalPlumesInst.count = plumes.length;
        thermalPlumeCoresInst.count = plumes.length;
        const baseY = floorY + 0.1 + BUILDING_BOUNDS.rackHeight;
        _quat.identity();
        for (let i = 0; i < plumes.length; i++) {
          const pl = plumes[i];
          _pos.set(pl.x, baseY + pl.heightM * 0.48, pl.z);
          _scale.set(pl.radiusM, pl.heightM, pl.radiusM);
          _mat4.compose(_pos, _quat, _scale);
          thermalPlumesInst.setMatrixAt(i, _mat4);
          _color.setHex(pl.colorHex);
          thermalPlumesInst.setColorAt(i, _color);

          _pos.set(pl.x, baseY + pl.heightM * 0.42, pl.z);
          _scale.set(pl.radiusM * 0.85, pl.heightM * 0.85, pl.radiusM * 0.85);
          _mat4.compose(_pos, _quat, _scale);
          thermalPlumeCoresInst.setMatrixAt(i, _mat4);
          // Luminous hot inner core inside crimson outer plume sheath
          _color.setHex(pl.tempC >= 74 ? 0xf59e0b : pl.colorHex);
          thermalPlumeCoresInst.setColorAt(i, _color);
        }
        thermalPlumesInst.instanceMatrix.needsUpdate = true;
        thermalPlumeCoresInst.instanceMatrix.needsUpdate = true;
        if (thermalPlumesInst.instanceColor) thermalPlumesInst.instanceColor.needsUpdate = true;
        if (thermalPlumeCoresInst.instanceColor) thermalPlumeCoresInst.instanceColor.needsUpdate = true;
        thermalPlumesInst.visible = plumes.length > 0;
        thermalPlumeCoresInst.visible = plumes.length > 0;
      } else {
        thermalPlumesInst.visible = false;
        thermalPlumeCoresInst.visible = false;
      }
    } else {
      heatmapGroup.visible = false;
    }

    // Update all 160 Cold Aisle SLA sensors (visible whenever enabled OR when SLA overlay is active)
    const sensorsVisible = showSlaSensors || overlay === 'sla';
    slaSensorsGroup.visible = sensorsVisible;
    slaHitInst.visible = sensorsVisible;

    const beaconScaleXZ = overlay === 'sla' ? 1.4 : 1.0;
    const beaconScaleY = overlay === 'sla' ? 1.85 : 1.0;
    for (let i = 0; i < slaCount; i++) {
      const sp = COLD_AISLE_SLA_SENSOR_PLACEMENTS[i];
      const sm = slaMetrics[sp.sensorId];
      const hex = sm ? slaSensorStatusHex(sm.overallStatus) : 0x06b6d4;
      _color.setHex(hex);
      slaBeaconInst.setColorAt(i, _color);

      // Enlarge beacons in SLA overlay or when actively breaching so operators spot excursions instantly
      const isBreached = sm?.overallStatus === 'Breached';
      const sXZ = isBreached ? Math.max(beaconScaleXZ, 1.55) : beaconScaleXZ;
      const sY = isBreached ? Math.max(beaconScaleY, 2.2) : beaconScaleY;
      _quat.setFromAxisAngle(_yAxis, sp.rotationY);
      _scale.set(sXZ, sY, sXZ);
      _pos.set(sp.x, sp.y + 0.13 + (sY - 1) * 0.06, sp.z);
      _mat4.compose(_pos, _quat, _scale);
      slaBeaconInst.setMatrixAt(i, _mat4);
    }
    slaBeaconInst.instanceMatrix.needsUpdate = true;
    if (slaBeaconInst.instanceColor) slaBeaconInst.instanceColor.needsUpdate = true;

    // Update 3D Over-Capacity Beacons above cabinets exceeding configured hall power threshold
    overCapBeaconRackIds.length = 0;
    _quat.identity();
    _scale.set(1, 1, 1);
    for (let i = 0; i < liveRacks.length && overCapBeaconRackIds.length < MAX_OVERCAP_BEACONS; i++) {
      const rack = liveRacks[i];
      const ps = powerStats[rack.id];
      if (!ps?.exceedsCapacity) continue;
      const p = placementByRackId.get(rack.id);
      if (!p) continue;
      const idx = overCapBeaconRackIds.length;
      overCapBeaconRackIds.push(rack.id);

      _pos.set(p.x, floorY + 2.2 + 1.65, p.z);
      _mat4.compose(_pos, _quat, _scale);
      overCapPillarInst.setMatrixAt(idx, _mat4);

      _pos.set(p.x, floorY + 5.95, p.z);
      _mat4.compose(_pos, _quat, _scale);
      overCapDiamondInst.setMatrixAt(idx, _mat4);

      _pos.set(p.x, floorY + 4.1, p.z);
      _mat4.compose(_pos, _quat, _scale);
      overCapHitInst.setMatrixAt(idx, _mat4);
    }
    const beaconCount = overCapBeaconRackIds.length;
    overCapPillarInst.count = beaconCount;
    overCapDiamondInst.count = beaconCount;
    overCapHitInst.count = beaconCount;
    overCapPillarInst.instanceMatrix.needsUpdate = true;
    overCapDiamondInst.instanceMatrix.needsUpdate = true;
    overCapHitInst.instanceMatrix.needsUpdate = true;
    const beaconsVisible = showOverCapBeacons && beaconCount > 0;
    overCapBeaconGroup.visible = beaconsVisible;
    overCapHitInst.visible = beaconsVisible;

    // Update Blue BMC Locate LED Beacons synced from ServerDetailDrawer
    let locateCount = 0;
    const uniqueLocateRacks = Array.from(new Set(locateLedRackIds));
    _quat.identity();
    _scale.set(1, 1, 1);
    for (let i = 0; i < uniqueLocateRacks.length && locateCount < MAX_LOCATE_BEACONS; i++) {
      const p = placementByRackId.get(uniqueLocateRacks[i]);
      if (!p) continue;
      _pos.set(p.x, floorY + 2.3 + 1.9, p.z);
      _mat4.compose(_pos, _quat, _scale);
      locatePillarInst.setMatrixAt(locateCount, _mat4);

      _pos.set(p.x, floorY + 6.45, p.z);
      _mat4.compose(_pos, _quat, _scale);
      locateOrbInst.setMatrixAt(locateCount, _mat4);
      locateCount += 1;
    }
    locatePillarInst.count = locateCount;
    locateOrbInst.count = locateCount;
    locatePillarInst.instanceMatrix.needsUpdate = true;
    locateOrbInst.instanceMatrix.needsUpdate = true;
    locateBeaconGroup.visible = locateCount > 0;

    // Position floating selection ring + vertical beacon on selected rack or selected SLA sensor
    if (selectedAsset?.kind === 'rack') {
      const selP = placementByRackId.get(selectedAsset.id);
      if (selP) {
        rackSelectionBeaconMat.color.setHex(0x3dcd58);
        rackSelectionRing.position.set(selP.x, floorY + 0.14, selP.z);
        rackSelectionRing.visible = true;
        rackSelectionBeacon.position.set(selP.x, floorY + 2.4, selP.z);
        rackSelectionBeacon.visible = true;
      } else {
        rackSelectionRing.visible = false;
        rackSelectionBeacon.visible = false;
      }
    } else if (selectedAsset?.kind === 'sla_sensor') {
      const selS = placementBySlaId.get(selectedAsset.id);
      if (selS) {
        const sm = slaMetrics[selS.sensorId];
        rackSelectionBeaconMat.color.setHex(sm ? slaSensorStatusHex(sm.overallStatus) : 0x06b6d4);
        rackSelectionRing.position.set(selS.x, floorY + 0.14, selS.z);
        rackSelectionRing.visible = true;
        rackSelectionBeacon.position.set(selS.x, selS.y + 1.6, selS.z);
        rackSelectionBeacon.visible = true;
      } else {
        rackSelectionRing.visible = false;
        rackSelectionBeacon.visible = false;
      }
    } else {
      rackSelectionRing.visible = false;
      rackSelectionBeacon.visible = false;
    }

    // Update BMS equipment status beacons & rings
    for (const ref of bmsRefs.values()) {
      const hex = getBmsAssetStatusHex(liveBms, ref.kind, ref.id);
      ref.beaconMat.color.setHex(hex);
      ref.beaconMat.emissive.setHex(hex);
      ref.selectionRing.visible =
        selectedAsset?.kind === ref.kind && selectedAsset?.id === ref.id;
    }

    // Update MDF / Network / Meet-Me Room selection highlights
    for (const ref of telecomRooms.roomRefs.values()) {
      ref.selectionOutline.visible =
        selectedAsset?.kind === 'telecom_room' && selectedAsset?.id === ref.roomId;
    }

    // Update Admin Office, Data Hall Walkway, and 2N Battery Room live states & selection highlights
    adminAndWalkway.adminOutline.visible = selectedAsset?.kind === 'admin_office';
    adminAndWalkway.walkwayOutline.visible = selectedAsset?.kind === 'datahall_walkway';
    batteryRooms.updateLiveTelemetry(
      liveBms,
      selectedAsset?.kind === 'battery_room' ? selectedAsset.id : null
    );
  };

  applyTheme(initialDarkMode);
  updateLiveTelemetry(racks, servers, bms, 'standard', null, true);

  return {
    interactables,
    rackBodiesInst,
    rackIndexToDef,
    slaHitInst,
    slaSensorPlacements: COLD_AISLE_SLA_SENSOR_PLACEMENTS,
    overCapHitInst,
    overCapBeaconRackIds,
    applyCutaway,
    applyBasementCutaway,
    applyTheme,
    updateSiteSignage,
    updateLiveTelemetry,
    setAirflowVisible,
    animateAirflow,
    dispose: () => {
      for (const g of disposablesGeo) g.dispose();
      for (const m of disposablesMat) m.dispose();
      heatmapDataTex.dispose();
      plumeTex.dispose();
      telecomRooms.dispose();
      adminAndWalkway.dispose();
      batteryRooms.dispose();
      textures.dispose();
    },
  };
}

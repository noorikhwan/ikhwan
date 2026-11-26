import * as THREE from 'three';
import {
  ADMIN_OFFICE_BOUNDS,
  DATAHALL_WALKWAY_SEGMENTS,
  SiteBuildingLayoutSpec,
} from '../../engine/twin3dLayout';

export interface AdminOfficeSharedMaterials {
  concreteMat: THREE.MeshStandardMaterial;
  facadeMat: THREE.MeshStandardMaterial;
  darkSteelMat: THREE.MeshStandardMaterial;
  lightSteelMat: THREE.MeshStandardMaterial;
  glassMat: THREE.MeshStandardMaterial;
  ecoGreenTrimMat: THREE.MeshStandardMaterial;
  safetyYellowMat: THREE.MeshStandardMaterial;
}

export interface BuildAdminOfficeParams {
  interiorParent: THREE.Group;
  shellParent: THREE.Group;
  campusParent: THREE.Group;
  isSoftwareGl: boolean;
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T;
  trackMat: <T extends THREE.Material>(m: T) => T;
  sharedMats: AdminOfficeSharedMaterials;
  siteLayout?: SiteBuildingLayoutSpec;
}

export interface AdminOfficeHandles {
  interactables: THREE.Object3D[];
  adminOutline: THREE.LineSegments;
  walkwayOutline: THREE.LineSegments;
  applyTheme: (darkMode: boolean) => void;
  dispose: () => void;
}

function createSignTexture(
  eyebrow: string,
  title: string,
  accentHex = '#3DCD58',
  bgHex = '#141920'
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = bgHex;
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = accentHex;
    ctx.fillRect(0, 0, 12, 128);
    ctx.fillRect(0, 0, 512, 8);

    ctx.fillStyle = accentHex;
    ctx.font = 'bold 20px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(eyebrow, 32, 46);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 32px Inter, system-ui, sans-serif';
    ctx.fillText(title, 32, 92);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 508, 124);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds the Architectural Admin & Operations Office Pavilion (South-West Wing)
 * plus the Enclosed Glazed Security Bridge and Illuminated Personnel Walkway
 * connecting Admin Office & NOC Lobby directly into Data Halls A, B, C, and D.
 */
export function buildAdminOfficeAndWalkway(params: BuildAdminOfficeParams): AdminOfficeHandles {
  const {
    interiorParent,
    shellParent,
    campusParent,
    isSoftwareGl,
    trackGeo,
    trackMat,
    sharedMats,
  } = params;
  const {
    concreteMat,
    facadeMat,
    darkSteelMat,
    lightSteelMat,
    glassMat,
    ecoGreenTrimMat,
    safetyYellowMat,
  } = sharedMats;

  const interactables: THREE.Object3D[] = [];
  const texturesToDispose: THREE.CanvasTexture[] = [];

  const adminBounds = params.siteLayout?.adminOffice ?? ADMIN_OFFICE_BOUNDS;
  const walkwaySegments = params.siteLayout?.walkwaySegments ?? DATAHALL_WALKWAY_SEGMENTS;
  const wingSide = params.siteLayout?.adminWingSide ?? 'SW';
  const accentCss = params.siteLayout?.accentTrimCss ?? '#3DCD58';
  const accentHex = params.siteLayout?.accentTrimHex ?? 0x3dcd58;
  const { centerX: ax, centerZ: az, width: aw, depth: ad, wallHeight: ah, floorY } = adminBounds;
  const halfAW = aw / 2;
  const halfAD = ad / 2;
  const isEastWing = wingSide === 'SE';
  const isNorthWing = wingSide === 'NW';

  // Domain-calibrated PBR materials with clear roughness/metalness contrast
  const officeCarpetMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xd6dee8, roughness: 0.9, metalness: 0.0 })
  );
  const warmWoodMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xb68a5a, roughness: 0.62, metalness: 0.05 })
  );
  const deskSurfaceMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.45, metalness: 0.05 })
  );
  const chairFabricMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.88, metalness: 0.0 })
  );
  const loungeFabricMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e6091, roughness: 0.85, metalness: 0.0 })
  );
  const monitorGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.62,
      roughness: 0.18,
      metalness: 0.2,
    })
  );
  const videoWallMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: 0x10b981,
      emissiveIntensity: 0.52,
      roughness: 0.2,
      metalness: 0.15,
    })
  );
  const interiorWallMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xe6ecf2, roughness: 0.78, metalness: 0.04 })
  );
  const curtainGlassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x244159,
      roughness: 0.16,
      metalness: 0.45,
      transparent: true,
      opacity: 0.78,
    })
  );
  const walkwayFloorMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1f2d38, roughness: 0.68, metalness: 0.1 })
  );
  const walkwayEdgeGreenMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x16a34a,
      emissiveIntensity: 0.35,
      roughness: 0.35,
      metalness: 0.1,
    })
  );
  const walkwayChevronMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x86efac,
      emissive: 0x3dcd58,
      emissiveIntensity: 0.55,
      roughness: 0.3,
      metalness: 0.1,
    })
  );
  const ledStripMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0xe0f2fe,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.0,
    })
  );
  const officeRoofMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.82, metalness: 0.08 })
  );
  const paverPathMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.85, metalness: 0.04 })
  );

  // =========================================================================
  // 1. ADMIN & OPERATIONS OFFICE PAVILION (Permanent Plinth + Full Interior)
  // =========================================================================
  const adminGroup = new THREE.Group();
  adminGroup.position.set(ax, 0, az);
  interiorParent.add(adminGroup);

  // Concrete structural plinth grounded flush at y = 0
  const adminPlinth = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(aw + 0.6, floorY, ad + 0.6)),
    concreteMat
  );
  adminPlinth.position.set(0, floorY / 2, 0);
  adminPlinth.receiveShadow = true;
  adminGroup.add(adminPlinth);

  // Main Office Floor Slab (slate carpet tile)
  const officeFloor = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(aw - 0.3, 0.08, ad - 0.3)),
    officeCarpetMat
  );
  officeFloor.position.set(0, floorY + 0.04, 0);
  officeFloor.receiveShadow = true;
  adminGroup.add(officeFloor);

  // Warm Oak Reception & Corridor Timber Floor Accent Strip
  const lobbyTimberFloor = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(aw - 0.8, 0.03, Math.min(4.2, ad * 0.28))),
    warmWoodMat
  );
  lobbyTimberFloor.position.set(0, floorY + 0.095, (isNorthWing ? -1 : 1) * (halfAD - 2.2));
  const bridgeSideSign = isEastWing ? -1 : 1;
  const eastCorridorTimber = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(3.4, 0.03, ad - 1.2)),
    warmWoodMat
  );
  eastCorridorTimber.position.set(bridgeSideSign * (halfAW - 2.0), floorY + 0.095, 0);
  adminGroup.add(lobbyTimberFloor, eastCorridorTimber);

  // Low permanent perimeter curb walls (1.05m high so interior stays clearly framed in cutaway!)
  const lowWallH = 1.05;
  const northLowWall = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(aw, lowWallH, 0.28)),
    interiorWallMat
  );
  northLowWall.position.set(0, floorY + lowWallH / 2, -halfAD + 0.14);
  const outerSideLowWall = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.28, lowWallH, ad)),
    interiorWallMat
  );
  outerSideLowWall.position.set(-bridgeSideSign * (halfAW - 0.14), floorY + lowWallH / 2, 0);

  // Entrance perimeter wall split cleanly around the 3.4m wide Entrance Door (x = 0)
  for (const side of [-1, 1]) {
    const segW = (aw - 3.6) / 2;
    const sw = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(segW, lowWallH, 0.28)),
      interiorWallMat
    );
    sw.position.set(side * (1.8 + segW / 2), floorY + lowWallH / 2, halfAD - 0.14);
    adminGroup.add(sw);
  }
  // Bridge-facing wall split cleanly around the 3.2m wide Enclosed Bridge Doorway
  const bridgeDoorLocalZ = walkwaySegments[0].centerZ - az;
  const northSegLen = Math.max(0.8, bridgeDoorLocalZ - 1.6 - -halfAD);
  const southSegLen = Math.max(0.8, halfAD - (bridgeDoorLocalZ + 1.6));
  const eastNorthSeg = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.28, lowWallH, northSegLen)),
    interiorWallMat
  );
  eastNorthSeg.position.set(bridgeSideSign * (halfAW - 0.14), floorY + lowWallH / 2, -halfAD + northSegLen / 2);
  const eastSouthSeg = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.28, lowWallH, southSegLen)),
    interiorWallMat
  );
  eastSouthSeg.position.set(bridgeSideSign * (halfAW - 0.14), floorY + lowWallH / 2, halfAD - southSegLen / 2);
  adminGroup.add(northLowWall, outerSideLowWall, eastNorthSeg, eastSouthSeg);

  // --- Interior Zone A: Executive Glass Conference Room (North-West quadrant) ---
  const confCenterX = -4.6;
  const confCenterZ = -3.6;
  // Glazed interior partition walls separating Conference Room from Open Operations Bay
  const confEastGlass = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.1, 2.8, 7.6)),
    glassMat
  );
  confEastGlass.position.set(0.2, floorY + 1.48, confCenterZ);
  confEastGlass.renderOrder = 4;
  const confSouthGlass = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(9.6, 2.8, 0.1)),
    glassMat
  );
  confSouthGlass.position.set(confCenterX, floorY + 1.48, 0.2);
  confSouthGlass.renderOrder = 4;
  const confTopBeamE = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.16, 0.14, 7.7)),
    darkSteelMat
  );
  confTopBeamE.position.set(0.2, floorY + 2.9, confCenterZ);
  const confTopBeamS = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(9.7, 0.14, 0.16)),
    darkSteelMat
  );
  confTopBeamS.position.set(confCenterX, floorY + 2.9, 0.2);
  adminGroup.add(confEastGlass, confSouthGlass, confTopBeamE, confTopBeamS);

  // Walnut Boardroom Table + 8 Chairs + 98" DCIM Operations Wall Display
  const confTableTop = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(5.6, 0.1, 2.1)),
    warmWoodMat
  );
  confTableTop.position.set(confCenterX, floorY + 0.84, confCenterZ);
  confTableTop.castShadow = !isSoftwareGl;
  for (const tx of [-2.1, 2.1]) {
    const leg = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.24, 0.76, 1.3)),
      darkSteelMat
    );
    leg.position.set(confCenterX + tx, floorY + 0.42, confCenterZ);
    adminGroup.add(leg);
  }
  const chairSeatGeo = trackGeo(new THREE.BoxGeometry(0.56, 0.1, 0.54));
  const chairBackGeo = trackGeo(new THREE.BoxGeometry(0.54, 0.56, 0.1));
  for (let i = 0; i < 4; i++) {
    const cx = confCenterX - 2.0 + i * 1.33;
    for (const czSign of [-1, 1]) {
      const seat = new THREE.Mesh(chairSeatGeo, chairFabricMat);
      seat.position.set(cx, floorY + 0.52, confCenterZ + czSign * 1.35);
      const back = new THREE.Mesh(chairBackGeo, chairFabricMat);
      back.position.set(cx, floorY + 0.82, confCenterZ + czSign * 1.58);
      adminGroup.add(seat, back);
    }
  }
  const videoWallFrame = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.14, 1.65, 3.6)),
    darkSteelMat
  );
  videoWallFrame.position.set(-halfAW + 0.36, floorY + 1.85, confCenterZ);
  const videoWallScreen = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.06, 1.48, 3.4)),
    videoWallMat
  );
  videoWallScreen.position.set(-halfAW + 0.44, floorY + 1.85, confCenterZ);
  adminGroup.add(confTableTop, videoWallFrame, videoWallScreen);

  // --- Interior Zone B: Open NOC Admin & Engineering Workstations (North-East & Center-East) ---
  const deskGeo = trackGeo(new THREE.BoxGeometry(1.55, 0.08, 0.78));
  const dividerGeo = trackGeo(new THREE.BoxGeometry(1.55, 0.45, 0.06));
  const monGeo = trackGeo(new THREE.BoxGeometry(0.54, 0.34, 0.05));
  const deskRows = [-5.1, -2.1];
  const deskCols = [1.8, 3.6, 5.4];
  for (const rz of deskRows) {
    for (const rx of deskCols) {
      const top = new THREE.Mesh(deskGeo, deskSurfaceMat);
      top.position.set(rx, floorY + 0.8, rz);
      const div = new THREE.Mesh(dividerGeo, ecoGreenTrimMat);
      div.position.set(rx, floorY + 1.04, rz - 0.36);
      const legL = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.08, 0.72, 0.68)),
        darkSteelMat
      );
      legL.position.set(rx - 0.7, floorY + 0.44, rz);
      const legR = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.08, 0.72, 0.68)),
        darkSteelMat
      );
      legR.position.set(rx + 0.7, floorY + 0.44, rz);
      // Dual glowing admin monitors
      const monL = new THREE.Mesh(monGeo, monitorGlowMat);
      monL.position.set(rx - 0.32, floorY + 1.08, rz - 0.22);
      const monR = new THREE.Mesh(monGeo, monitorGlowMat);
      monR.position.set(rx + 0.32, floorY + 1.08, rz - 0.22);
      // Office chair
      const seat = new THREE.Mesh(chairSeatGeo, chairFabricMat);
      seat.position.set(rx, floorY + 0.5, rz + 0.62);
      const back = new THREE.Mesh(chairBackGeo, chairFabricMat);
      back.position.set(rx, floorY + 0.82, rz + 0.85);
      adminGroup.add(top, div, legL, legR, monL, monR, seat, back);
    }
  }

  // --- Interior Zone C: Visitor Reception Desk, Security Badging & Waiting Lounge (South Lobby) ---
  const recCounter = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(4.4, 1.12, 0.85)),
    darkSteelMat
  );
  recCounter.position.set(0.4, floorY + 0.62, 3.2);
  const recTop = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(4.55, 0.09, 0.96)),
    warmWoodMat
  );
  recTop.position.set(0.4, floorY + 1.2, 3.2);
  const recGreenStrip = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(4.42, 0.14, 0.08)),
    ecoGreenTrimMat
  );
  recGreenStrip.position.set(0.4, floorY + 0.92, 3.64);
  const recMon = new THREE.Mesh(monGeo, monitorGlowMat);
  recMon.position.set(0.4, floorY + 1.42, 3.12);
  adminGroup.add(recCounter, recTop, recGreenStrip, recMon);

  // Visitor Waiting Lounge (South-West corner: L-shaped sofas + coffee table)
  const sofa1 = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(3.2, 0.48, 0.92)),
    loungeFabricMat
  );
  sofa1.position.set(-6.0, floorY + 0.32, 5.4);
  const sofa1Back = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(3.2, 0.45, 0.22)),
    loungeFabricMat
  );
  sofa1Back.position.set(-6.0, floorY + 0.72, 5.78);
  const sofa2 = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.92, 0.48, 2.6)),
    loungeFabricMat
  );
  sofa2.position.set(-8.2, floorY + 0.32, 3.8);
  const coffeeTable = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.6, 0.38, 0.95)),
    warmWoodMat
  );
  coffeeTable.position.set(-6.0, floorY + 0.27, 3.7);
  adminGroup.add(sofa1, sofa1Back, sofa2, coffeeTable);

  // Security Mantrap Turnstile Gates on Bridge Corridor leading straight into the Data Hall Bridge!
  for (const dz of [-1.1, 0, 1.1]) {
    const tz = bridgeDoorLocalZ + dz;
    const gateBody = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.1, 1.05, 0.22)),
      lightSteelMat
    );
    gateBody.position.set(bridgeSideSign * (halfAW - 2.1), floorY + 0.6, tz);
    const gateLed = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.24, 0.08, 0.24)),
      ecoGreenTrimMat
    );
    gateLed.position.set(bridgeSideSign * (halfAW - 2.1), floorY + 1.15, tz);
    adminGroup.add(gateBody, gateLed);
  }

  // Interior Admin Office Overhead Banner Sign (always visible in cutaway!)
  const adminInteriorTex = createSignTexture(
    `${(params.siteLayout?.siteId ?? 'kl1').toUpperCase()} OPERATIONS`,
    wingSide === 'NW' ? 'NW COMMAND ANNEX' : wingSide === 'SE' ? 'EAST ADMIN & NOC' : 'ADMIN OFFICE & NOC',
    accentCss
  );
  texturesToDispose.push(adminInteriorTex);
  const adminBannerMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: adminInteriorTex,
      roughness: 0.35,
      metalness: 0.1,
    })
  );
  const adminInteriorBanner = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(7.2, 1.25, 0.16)),
    adminBannerMat
  );
  adminInteriorBanner.position.set(0, floorY + 3.65, -halfAD + 0.24);
  adminGroup.add(adminInteriorBanner);

  // Exterior Entrance Steps & Covered Sidewalk
  if (!isNorthWing) {
    for (let s = 0; s < 3; s++) {
      const step = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(4.2, 0.18, 1.6 - s * 0.45)),
        concreteMat
      );
      step.position.set(ax, 0.09 + s * 0.18, az + halfAD + 0.3 + (2 - s) * 0.22);
      campusParent.add(step);
    }
    const adminWalkPath = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(4.2, 0.06, 6.2)),
      paverPathMat
    );
    adminWalkPath.position.set(ax, 0.03, az + halfAD + 3.8);
    adminWalkPath.receiveShadow = true;
    campusParent.add(adminWalkPath);
  }

  // =========================================================================
  // 2. ADMIN OFFICE EXTERIOR SHELL & ROOF (Inside shellParent -> lifts cleanly in Cutaway!)
  // =========================================================================
  const adminShellGroup = new THREE.Group();
  adminShellGroup.position.set(ax, 0, az);
  shellParent.add(adminShellGroup);

  // Modern architectural glass curtain walls + precast corner piers + flat roof + green parapet
  const upperWallH = ah - lowWallH;
  const upperCenterY = floorY + lowWallH + upperWallH / 2;

  const shellNorth = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(aw, upperWallH, 0.32)),
    facadeMat
  );
  shellNorth.position.set(0, upperCenterY, -halfAD + 0.16);

  const shellWest = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.32, upperWallH, ad)),
    curtainGlassMat
  );
  shellWest.position.set(-halfAW + 0.16, upperCenterY, 0);

  const shellSouth = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(aw, upperWallH, 0.24)),
    curtainGlassMat
  );
  shellSouth.position.set(0, upperCenterY, halfAD - 0.14);

  const shellEast = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.32, upperWallH, ad)),
    facadeMat
  );
  shellEast.position.set(halfAW - 0.16, upperCenterY, 0);

  // Steel architectural mullions on South curtain facade
  for (let mx = -halfAW + 2.0; mx <= halfAW - 2.0; mx += 3.1) {
    const mullion = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.16, ah, 0.32)),
      darkSteelMat
    );
    mullion.position.set(mx, floorY + ah / 2, halfAD - 0.08);
    adminShellGroup.add(mullion);
  }

  // Cantilevered South Entrance Canopy & Exterior Architectural Signboard
  const officeCanopy = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(6.2, 0.28, 2.8)),
    darkSteelMat
  );
  officeCanopy.position.set(0, floorY + 3.45, halfAD + 1.35);
  const extSign = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(6.8, 1.3, 0.16)),
    adminBannerMat
  );
  extSign.position.set(0, floorY + ah - 0.85, halfAD + 0.16);

  // Roof deck, EcoStruxure green parapet trim, architectural skylight, & VRF HVAC unit
  const officeRoof = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(aw + 0.4, 0.34, ad + 0.4)),
    officeRoofMat
  );
  officeRoof.position.set(0, floorY + ah + 0.17, 0);
  const roofTrimS = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(aw + 0.55, 0.32, 0.22)),
    ecoGreenTrimMat
  );
  roofTrimS.position.set(0, floorY + ah + 0.18, halfAD + 0.2);
  const roofTrimW = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.22, 0.32, ad + 0.55)),
    ecoGreenTrimMat
  );
  roofTrimW.position.set(-halfAW - 0.2, floorY + ah + 0.18, 0);
  const skylight = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(6.4, 0.38, 4.2)),
    curtainGlassMat
  );
  skylight.position.set(-2.5, floorY + ah + 0.5, -1.5);
  const vrfUnit = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(2.4, 1.35, 1.4)),
    lightSteelMat
  );
  vrfUnit.position.set(5.5, floorY + ah + 0.98, -4.5);

  adminShellGroup.add(
    shellNorth,
    shellWest,
    shellSouth,
    shellEast,
    officeCanopy,
    extSign,
    officeRoof,
    roofTrimS,
    roofTrimW,
    skylight,
    vrfUnit
  );

  // =========================================================================
  // 3. ENCLOSED GLAZED SECURITY BRIDGE (Admin Office -> Data Center Building)
  // =========================================================================
  const bridgeSeg = walkwaySegments[0];
  const bridgeGroup = new THREE.Group();
  bridgeGroup.position.set(bridgeSeg.centerX, 0, bridgeSeg.centerZ);
  interiorParent.add(bridgeGroup);

  const bw = bridgeSeg.width;
  const bd = bridgeSeg.depth;
  const bh = 3.6;

  // Grounded plinth & anti-slip green-striped ESD walkway deck
  const bridgePlinth = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(bw + 0.2, floorY, bd + 0.3)),
    concreteMat
  );
  bridgePlinth.position.set(0, floorY / 2, 0);
  bridgePlinth.receiveShadow = true;

  const bridgeDeck = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(bw + 0.1, 0.1, bd)),
    walkwayFloorMat
  );
  bridgeDeck.position.set(0, floorY + 0.05, 0);
  bridgeDeck.receiveShadow = true;

  // High-visibility safety-green walkway edge strips along North & South edges of bridge
  for (const sz of [-bd / 2 + 0.22, bd / 2 - 0.22]) {
    const edge = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(bw, 0.025, 0.16)),
      walkwayEdgeGreenMat
    );
    edge.position.set(0, floorY + 0.115, sz);
    bridgeGroup.add(edge);
  }

  // Glazed side enclosure walls + architectural dark-steel structural ribs (transparent so walkway is visible!)
  for (const sz of [-bd / 2 + 0.06, bd / 2 - 0.06]) {
    const glassWall = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(bw, bh - 0.3, 0.08)),
      glassMat
    );
    glassWall.position.set(0, floorY + (bh - 0.3) / 2 + 0.1, sz);
    glassWall.renderOrder = 4;

    const topFascia = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(bw + 0.2, 0.24, 0.18)),
      ecoGreenTrimMat
    );
    topFascia.position.set(0, floorY + bh, sz);
    bridgeGroup.add(glassWall, topFascia);
  }

  // 4 Portal Steel Rib Frames + Overhead Glazed Skylight Roof Strip + LED Light Bars
  for (let i = 0; i < 4; i++) {
    const rx = -bw / 2 + 0.4 + (i * (bw - 0.8)) / 3;
    for (const sz of [-bd / 2 + 0.08, bd / 2 - 0.08]) {
      const col = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.16, bh, 0.16)),
        darkSteelMat
      );
      col.position.set(rx, floorY + bh / 2, sz);
      bridgeGroup.add(col);
    }
    const beam = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.16, 0.18, bd + 0.1)),
      darkSteelMat
    );
    beam.position.set(rx, floorY + bh, 0);
    bridgeGroup.add(beam);
  }
  const bridgeRoofGlass = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(bw + 0.1, 0.1, bd - 0.1)),
    glassMat
  );
  bridgeRoofGlass.position.set(0, floorY + bh + 0.06, 0);
  bridgeRoofGlass.renderOrder = 5;

  const bridgeLed = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(bw - 0.6, 0.07, 0.22)),
    ledStripMat
  );
  bridgeLed.position.set(0, floorY + bh - 0.14, 0);

  // Wayfinding Sign above the Bridge ("WALKWAY TO DATA HALLS")
  const bridgeSignTex = createSignTexture(
    'SECURITY CORRIDOR',
    'WALKWAY → DATA HALLS',
    accentCss
  );
  texturesToDispose.push(bridgeSignTex);
  const bridgeSignMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: bridgeSignTex,
      roughness: 0.35,
      metalness: 0.1,
    })
  );
  const bridgeSign = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(4.8, 0.9, 0.14)),
    bridgeSignMat
  );
  bridgeSign.position.set(0, floorY + bh + 0.58, bd / 2 + 0.02);

  bridgeGroup.add(bridgePlinth, bridgeDeck, bridgeRoofGlass, bridgeLed, bridgeSign);

  // =========================================================================
  // 4. INTERIOR ILLUMINATED PERSONNEL WALKWAY TO DATA HALLS (A, B, C, D)
  // =========================================================================
  const walkwayGroup = new THREE.Group();
  interiorParent.add(walkwayGroup);
  const walkY = floorY + 0.135; // strictly above raisedFloor (0.70) & corridorFloor (0.72) -> zero Z-fighting!

  for (const seg of walkwaySegments.slice(1)) {
    const lane = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(seg.width, 0.03, seg.depth)),
      walkwayFloorMat
    );
    lane.position.set(seg.centerX, walkY, seg.centerZ);
    lane.receiveShadow = true;
    walkwayGroup.add(lane);

    // Crisp Safety Pedestrian Edge Strips along both sides of each corridor
    if (seg.width >= seg.depth) {
      for (const dz of [-seg.depth / 2 + 0.1, seg.depth / 2 - 0.1]) {
        const stripe = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(seg.width, 0.02, 0.1)),
          walkwayEdgeGreenMat
        );
        stripe.position.set(seg.centerX, walkY + 0.02, seg.centerZ + dz);
        walkwayGroup.add(stripe);
      }
    } else {
      for (const dx of [-seg.width / 2 + 0.1, seg.width / 2 - 0.1]) {
        const stripe = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(0.1, 0.02, seg.depth)),
          walkwayEdgeGreenMat
        );
        stripe.position.set(seg.centerX + dx, walkY + 0.02, seg.centerZ);
        walkwayGroup.add(stripe);
      }
    }
  }

  // Luminous Directional Floor Guidance Chevrons along the Site Promenade & Central Data Hall Spine
  const chevronGeo = trackGeo(new THREE.BoxGeometry(0.55, 0.015, 0.22));
  const promSeg = walkwaySegments[2];
  const promStartX = promSeg.centerX - promSeg.width / 2 + 2.5;
  const promEndX = promSeg.centerX + promSeg.width / 2 - 2.5;
  for (let cx = promStartX; cx <= promEndX; cx += 4.6) {
    const ch = new THREE.Mesh(chevronGeo, walkwayChevronMat);
    ch.position.set(cx, walkY + 0.025, promSeg.centerZ);
    walkwayGroup.add(ch);
  }
  // Along Central Data Hall Spine (z = 41 -> -41 at x = 0)
  for (let cz = 41.0; cz >= -41.0; cz -= 6.5) {
    const ch = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.75, 0.015, 0.24)),
      walkwayChevronMat
    );
    ch.position.set(0, walkY + 0.025, cz);
    walkwayGroup.add(ch);
  }

  // Biometric Glass Mantrap Vestibule Entry Portals along Central Spine into Hall A, Hall B, Hall C & Hall D
  const portalSpecs: Array<{ x: number; z: number; rotY: number }> = [
    { x: -2.05, z: 22.5, rotY: Math.PI / 2 }, // Hall C entry from Central Spine
    { x: 2.05, z: 22.5, rotY: -Math.PI / 2 }, // Hall D entry from Central Spine
    { x: -2.05, z: -22.5, rotY: Math.PI / 2 }, // Hall A entry from Central Spine
    { x: 2.05, z: -22.5, rotY: -Math.PI / 2 }, // Hall B entry from Central Spine
  ];
  for (const p of portalSpecs) {
    const portal = new THREE.Group();
    portal.position.set(p.x, floorY + 0.1, p.z);
    portal.rotation.y = p.rotY;

    const frameL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 2.75, 0.22)), darkSteelMat);
    frameL.position.set(-1.1, 1.375, 0);
    const frameR = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 2.75, 0.22)), darkSteelMat);
    frameR.position.set(1.1, 1.375, 0);
    const header = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.38, 0.28, 0.26)), darkSteelMat);
    header.position.set(0, 2.75, 0);
    const statusStrip = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(2.1, 0.09, 0.28)),
      ecoGreenTrimMat
    );
    statusStrip.position.set(0, 2.68, 0);
    const threshold = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(2.05, 0.03, 0.6)),
      safetyYellowMat
    );
    threshold.position.set(0, 0.04, 0);
    portal.add(frameL, frameR, header, statusStrip, threshold);
    walkwayGroup.add(portal);
  }

  // Overhead Illuminated Wayfinding Gantry Arch at Central Spine Junction
  const hallGantryTex = createSignTexture(
    'PERSONNEL WALKWAY',
    'DATA HALLS A · B · C · D',
    accentCss
  );
  texturesToDispose.push(hallGantryTex);
  const hallGantryMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: hallGantryTex,
      roughness: 0.35,
      metalness: 0.1,
    })
  );
  for (const gz of [promSeg.centerZ, 0.0]) {
    const gantryGroup = new THREE.Group();
    gantryGroup.position.set(0, floorY + 0.1, gz);
    for (const gx of [-1.85, 1.85]) {
      const post = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 3.3, 0.14)), darkSteelMat);
      post.position.set(gx, 1.65, 0);
      gantryGroup.add(post);
    }
    const signBoard = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(3.85, 0.72, 0.16)),
      hallGantryMat
    );
    signBoard.position.set(0, 3.25, 0);
    gantryGroup.add(signBoard);
    walkwayGroup.add(gantryGroup);
  }

  // =========================================================================
  // 5. SELECTION OUTLINES & RAYCASTABLE CLICK PROXIES
  // =========================================================================
  const adminOutline = new THREE.LineSegments(
    trackGeo(new THREE.EdgesGeometry(new THREE.BoxGeometry(aw + 0.3, ah + 0.3, ad + 0.3))),
    trackMat(new THREE.LineBasicMaterial({ color: accentHex }))
  );
  adminOutline.position.set(ax, floorY + ah / 2, az);
  adminOutline.visible = false;
  interiorParent.add(adminOutline);

  const walkwayOutline = new THREE.LineSegments(
    trackGeo(new THREE.EdgesGeometry(new THREE.BoxGeometry(bw + 0.25, bh + 0.25, bd + 0.25))),
    trackMat(new THREE.LineBasicMaterial({ color: accentHex }))
  );
  walkwayOutline.position.set(bridgeSeg.centerX, floorY + bh / 2, bridgeSeg.centerZ);
  walkwayOutline.visible = false;
  interiorParent.add(walkwayOutline);

  const proxyMat = trackMat(
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false })
  );

  const adminProxy = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(aw, ah, ad)),
    proxyMat
  );
  adminProxy.position.set(ax, floorY + ah / 2, az);
  adminProxy.userData = {
    asset: {
      kind: 'admin_office',
      id: adminBounds.id,
      label: adminBounds.name,
      subtitle: adminBounds.subtitle,
    },
  };
  interiorParent.add(adminProxy);
  interactables.push(adminProxy);

  const bridgeProxy = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(bw, bh, bd)),
    proxyMat
  );
  bridgeProxy.position.set(bridgeSeg.centerX, floorY + bh / 2, bridgeSeg.centerZ);
  bridgeProxy.userData = {
    asset: {
      kind: 'datahall_walkway',
      id: bridgeSeg.id,
      label: 'Walkway to Data Halls (A–D)',
      subtitle: 'Enclosed Glazed Security Bridge · Biometric Mantrap · Central Hall Spine',
    },
  };
  interiorParent.add(bridgeProxy);
  interactables.push(bridgeProxy);

  const applyTheme = (darkMode: boolean) => {
    officeCarpetMat.color.setHex(darkMode ? 0x26313e : 0xd6dee8);
    interiorWallMat.color.setHex(darkMode ? 0x2d3744 : 0xe6ecf2);
    officeRoofMat.color.setHex(darkMode ? 0x334155 : 0xcbd5e1);
    paverPathMat.color.setHex(darkMode ? 0x333c48 : 0xd8d3c8);
    walkwayFloorMat.color.setHex(darkMode ? 0x16222c : 0x1f2d38);
  };

  return {
    interactables,
    adminOutline,
    walkwayOutline,
    applyTheme,
    dispose: () => {
      for (const tex of texturesToDispose) tex.dispose();
    },
  };
}

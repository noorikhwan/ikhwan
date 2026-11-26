import * as THREE from 'three';
import {
  BUILDING_BOUNDS,
  TELECOM_ROOM_PLACEMENTS,
  TelecomRoom3DPlacement,
  TelecomRoomId,
} from '../../engine/twin3dLayout';

export interface TelecomRoomsSharedMaterials {
  darkSteelMat: THREE.MeshStandardMaterial;
  lightSteelMat: THREE.MeshStandardMaterial;
  concreteMat: THREE.MeshStandardMaterial;
  glassMat: THREE.MeshStandardMaterial;
  safetyYellowMat: THREE.MeshStandardMaterial;
  ecoGreenTrimMat: THREE.MeshStandardMaterial;
}

export interface BuildTelecomRoomsParams {
  parent: THREE.Group;
  campusParent: THREE.Group;
  isSoftwareGl: boolean;
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T;
  trackMat: <T extends THREE.Material>(m: T) => T;
  sharedMats: TelecomRoomsSharedMaterials;
}

export interface TelecomRoomSelectionRef {
  roomId: TelecomRoomId;
  selectionOutline: THREE.LineSegments;
  beaconMat: THREE.MeshStandardMaterial;
}

export interface TelecomRoomsHandles {
  interactables: THREE.Object3D[];
  roomRefs: Map<TelecomRoomId, TelecomRoomSelectionRef>;
  applyTheme: (darkMode: boolean) => void;
  dispose: () => void;
}

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _color = new THREE.Color();

function createRoomBannerTexture(
  code: string,
  title: string,
  subtitle: string,
  accentHex: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#141920';
    ctx.fillRect(0, 0, 512, 128);

    // Top accent bar
    ctx.fillStyle = accentHex;
    ctx.fillRect(0, 0, 512, 10);

    // Left badge block
    ctx.fillStyle = accentHex;
    ctx.fillRect(16, 26, 98, 76);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 34px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(code, 65, 65);

    // Room title & subtitle
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 28px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(title, 130, 58);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 17px "JetBrains Mono", monospace';
    ctx.fillText(subtitle, 130, 92);

    // Subtle crisp frame border
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
 * Builds the TIA-942-B Rated-4 South Telecom & Interconnect Wing:
 * - MDF Room (Main Distribution Frame): 6 ODF optical patch racks, yellow FiberRunner ducts, FM-200 cylinders, West POE vault
 * - Network Room (Core Spine & DWDM): 5 modular 800G core router racks, NOC telemetry console, dual overhead ladder trays
 * - Meet-Me Room (MMR): Dual-zone Carrier Vault A & B separated by fire/security divider, 10 carrier demarc racks, East POE vault
 * - Continuous overhead optical fiber raceways bridging over the South NOC Lobby and down the central spine into Halls A–D
 */
export function buildTelecomRooms(params: BuildTelecomRoomsParams): TelecomRoomsHandles {
  const { parent, campusParent, isSoftwareGl, trackGeo, trackMat, sharedMats } = params;
  const {
    darkSteelMat,
    lightSteelMat,
    concreteMat,
    glassMat,
    safetyYellowMat,
    ecoGreenTrimMat,
  } = sharedMats;

  const floorY = BUILDING_BOUNDS.floorY;
  const floorSurfaceY = floorY + 0.12;
  const interactables: THREE.Object3D[] = [];
  const roomRefs = new Map<TelecomRoomId, TelecomRoomSelectionRef>();
  const texturesToDispose: THREE.CanvasTexture[] = [];

  // Shared domain materials with strong roughness/metalness contrast
  const esdFloorMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xcbd8e6, roughness: 0.58, metalness: 0.08 })
  );
  const rackBodyMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e2530, roughness: 0.55, metalness: 0.42 })
  );
  const rackTrimCyanMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.45,
      roughness: 0.3,
      metalness: 0.2,
    })
  );
  const rackTrimAmberMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.35,
      roughness: 0.35,
      metalness: 0.2,
    })
  );
  const fiberTrayYellowMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.42, metalness: 0.12 })
  );
  const fiberTrunkCyanMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.38, metalness: 0.18 })
  );
  const conduitOrangeMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.48, metalness: 0.1 })
  );
  const copperGroundMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xb87333, roughness: 0.28, metalness: 0.85 })
  );
  const fm200RedMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.32, metalness: 0.35 })
  );
  const ledStripMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0xe0f2fe,
      emissiveIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.0,
    })
  );
  const screenGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.55,
      roughness: 0.18,
      metalness: 0.2,
    })
  );
  const wallSolidMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.72, metalness: 0.08 })
  );
  const manholeIronMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65, metalness: 0.65 })
  );

  // Reusable small geometries
  const postGeo = trackGeo(new THREE.BoxGeometry(0.14, 3.6, 0.14));
  const ledLightGeo = trackGeo(new THREE.BoxGeometry(2.6, 0.07, 0.18));
  const fmCylinderGeo = trackGeo(new THREE.CylinderGeometry(0.17, 0.17, 1.42, 12));
  const fmValveGeo = trackGeo(new THREE.CylinderGeometry(0.06, 0.1, 0.22, 8));
  const dxCoolerGeo = trackGeo(new THREE.BoxGeometry(1.35, 0.52, 0.36));

  // Build each of the 3 rooms cleanly inside its spatial footprint
  for (const room of TELECOM_ROOM_PLACEMENTS) {
    const roomGroup = new THREE.Group();
    roomGroup.position.set(room.centerX, floorSurfaceY, room.centerZ);
    parent.add(roomGroup);

    const w = room.width;
    const d = room.depth;
    const wallH = 3.55;
    const halfW = w / 2;
    const halfD = d / 2;

    // 1. Dedicated Anti-Static ESD Raised Floor Pad (offset +0.025m above main floor, zero Z-fighting)
    const floorPad = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(w - 0.08, 0.05, d - 0.08)),
      esdFloorMat
    );
    floorPad.position.set(0, 0.025, 0);
    floorPad.receiveShadow = true;
    roomGroup.add(floorPad);

    // Subtle colored floor perimeter zone stripe matching room discipline
    const accentStripeMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: room.accentColorHex,
        emissive: room.accentColorHex,
        emissiveIntensity: 0.25,
        roughness: 0.4,
        metalness: 0.15,
      })
    );
    const northStripe = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(w - 0.12, 0.02, 0.12)),
      accentStripeMat
    );
    northStripe.position.set(0, 0.055, -halfD + 0.12);
    roomGroup.add(northStripe);

    // 2. Architectural Glazed Security Enclosure (North Hall-facing curtain wall with biometric access door)
    const doorWidth = 1.6;
    const sideGlassW = Math.max(0.8, (w - doorWidth - 0.5) / 2);

    // Lower knee-wall + upper glazed vision panels on North wall (-halfD)
    for (const side of [-1, 1]) {
      const segCenterX = side * (doorWidth / 2 + sideGlassW / 2 + 0.12);
      const kneeWall = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(sideGlassW, 0.95, 0.14)),
        wallSolidMat
      );
      kneeWall.position.set(segCenterX, 0.475, -halfD + 0.07);

      const visionGlass = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(sideGlassW, 2.35, 0.07)),
        glassMat
      );
      visionGlass.position.set(segCenterX, 0.95 + 1.175, -halfD + 0.07);
      visionGlass.renderOrder = 4;

      const topRail = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(sideGlassW + 0.08, 0.25, 0.18)),
        darkSteelMat
      );
      topRail.position.set(segCenterX, wallH - 0.125, -halfD + 0.07);

      roomGroup.add(kneeWall, visionGlass, topRail);
    }

    // Biometric mantrap security doorway frame + glass door leaf + green/amber access reader
    const doorHeader = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(doorWidth + 0.32, 0.95, 0.2)),
      darkSteelMat
    );
    doorHeader.position.set(0, wallH - 0.475, -halfD + 0.07);
    const doorLeaf = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(doorWidth - 0.1, 2.55, 0.06)),
      glassMat
    );
    doorLeaf.position.set(0, 1.275, -halfD + 0.07);
    doorLeaf.renderOrder = 4;
    const doorPushBar = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.95, 0.07, 0.12)),
      lightSteelMat
    );
    doorPushBar.position.set(0, 1.05, -halfD + 0.04);
    const badgeReader = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.14, 0.24, 0.08)),
      darkSteelMat
    );
    badgeReader.position.set(doorWidth / 2 + 0.22, 1.25, -halfD - 0.02);
    const badgeLed = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.08, 0.05, 0.09)),
      ecoGreenTrimMat
    );
    badgeLed.position.set(doorWidth / 2 + 0.22, 1.32, -halfD - 0.02);
    roomGroup.add(doorHeader, doorLeaf, doorPushBar, badgeReader, badgeLed);

    // Side segregation walls (West & East ends of room)
    for (const side of [-1, 1]) {
      const sideWall = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.14, wallH, d - 0.12)),
        wallSolidMat
      );
      sideWall.position.set(side * (halfW - 0.07), wallH / 2, 0);
      roomGroup.add(sideWall);
    }

    // Corner & door-jamb structural steel mullions
    for (const px of [-halfW + 0.07, -doorWidth / 2 - 0.08, doorWidth / 2 + 0.08, halfW - 0.07]) {
      const post = new THREE.Mesh(postGeo, darkSteelMat);
      post.position.set(px, wallH / 2, -halfD + 0.07);
      roomGroup.add(post);
    }

    // Overhead Top Transom Signboard Banner facing North (visible in cutaway & telecom-rooms camera!)
    const accentCss =
      room.code === 'MDF' ? '#F59E0B' : room.code === 'NET' ? '#06B6D4' : '#10B981';
    const bannerSubtitle =
      room.code === 'MDF'
        ? '6 ODF RACKS · 128 Tbps · WEST POE'
        : room.code === 'NET'
        ? 'CORE SPINE 800G · DWDM · 256 Tbps'
        : 'CARRIER VAULT A & B · 14 TIER-1 CARRIERS';
    const bannerTex = createRoomBannerTexture(
      room.code,
      room.code === 'MDF'
        ? 'MDF ROOM'
        : room.code === 'NET'
        ? 'NETWORK ROOM'
        : 'MEET-ME ROOM (MMR)',
      bannerSubtitle,
      accentCss
    );
    texturesToDispose.push(bannerTex);
    const bannerMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: bannerTex,
        roughness: 0.38,
        metalness: 0.1,
      })
    );
    const bannerW = Math.min(6.4, w - 1.6);
    const bannerPlate = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(bannerW, 1.05, 0.16)),
      bannerMat
    );
    bannerPlate.position.set(0, wallH + 0.56, -halfD + 0.1);
    roomGroup.add(bannerPlate);

    // Status beacon dot mounted atop the signboard center
    const beaconMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: room.accentColorHex,
        emissive: room.accentColorHex,
        emissiveIntensity: 0.9,
        roughness: 0.25,
        metalness: 0.1,
      })
    );
    const beacon = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.16, 10, 10)), beaconMat);
    beacon.position.set(0, wallH + 1.24, -halfD + 0.1);
    roomGroup.add(beacon);

    // Ceiling task LED lighting bars (suspended along room axis)
    const numLights = room.code === 'MMR' ? 4 : 2;
    for (let li = 0; li < numLights; li++) {
      const lx = -halfW + (w / (numLights + 1)) * (li + 1);
      const bar = new THREE.Mesh(ledLightGeo, ledStripMat);
      bar.position.set(lx, wallH - 0.15, -0.45);
      roomGroup.add(bar);
    }

    // Wall-mounted DX Precision Telecom Cooling Unit + Copper Telecom Grounding Busbar (TGB)
    const dxUnit = new THREE.Mesh(dxCoolerGeo, lightSteelMat);
    dxUnit.position.set(-halfW + 1.4, 2.85, halfD - 0.22);
    const dxGrille = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.18, 0.12, 0.08)),
      darkSteelMat
    );
    dxGrille.position.set(-halfW + 1.4, 2.66, halfD - 0.42);
    const groundBar = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.9, 0.1, 0.05)),
      copperGroundMat
    );
    groundBar.position.set(halfW - 1.35, 1.45, halfD - 0.1);
    roomGroup.add(dxUnit, dxGrille, groundBar);

    // Twin Red FM-200 Clean-Agent Fire Suppression Cylinders in back-east corner
    for (let ci = 0; ci < 2; ci++) {
      const cylX = halfW - 0.55 - ci * 0.44;
      const cylZ = halfD - 0.48;
      const cyl = new THREE.Mesh(fmCylinderGeo, fm200RedMat);
      cyl.position.set(cylX, 0.76, cylZ);
      const valve = new THREE.Mesh(fmValveGeo, lightSteelMat);
      valve.position.set(cylX, 1.56, cylZ);
      roomGroup.add(cyl, valve);
    }

    // 3. Room-Specific High-Detail Composite Equipment Racks
    if (room.code === 'MDF') {
      buildMdfRacks(roomGroup, room, trackGeo, {
        rackBodyMat,
        lightSteelMat,
        fiberTrayYellowMat,
        fiberTrunkCyanMat,
        rackTrimAmberMat,
        isSoftwareGl,
      });
    } else if (room.code === 'NET') {
      buildNetworkCoreEquipment(roomGroup, room, trackGeo, {
        rackBodyMat,
        darkSteelMat,
        lightSteelMat,
        rackTrimCyanMat,
        fiberTrunkCyanMat,
        ecoGreenTrimMat,
        screenGlowMat,
        isSoftwareGl,
      });
    } else {
      buildMeetMeRoomEquipment(roomGroup, room, trackGeo, trackMat, {
        rackBodyMat,
        darkSteelMat,
        lightSteelMat,
        wallSolidMat,
        glassMat,
        fiberTrayYellowMat,
        fiberTrunkCyanMat,
        ecoGreenTrimMat,
        isSoftwareGl,
      });
    }

    // 4. Overhead Yellow FiberRunner Duct inside each room (directly above the rack row)
    const innerTray = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(w - 0.6, 0.16, 0.36)),
      fiberTrayYellowMat
    );
    innerTray.position.set(0, 2.75, 0.55);
    const innerTrunk = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(w - 0.8, 0.09, 0.18)),
      fiberTrunkCyanMat
    );
    innerTrunk.position.set(0, 2.95, 0.55);
    roomGroup.add(innerTray, innerTrunk);

    // 5. Selection Wireframe Outline (toggled when user clicks the room)
    const outlineGeo = trackGeo(new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.15, wallH + 0.15, d + 0.15)));
    const outlineMat = trackMat(
      new THREE.LineBasicMaterial({ color: room.accentColorHex })
    );
    const selectionOutline = new THREE.LineSegments(outlineGeo, outlineMat);
    selectionOutline.position.set(0, wallH / 2, 0);
    selectionOutline.visible = false;
    roomGroup.add(selectionOutline);

    roomRefs.set(room.roomId, {
      roomId: room.roomId,
      selectionOutline,
      beaconMat,
    });

    // 6. Invisible Click Proxy Mesh for Fast Raycasting
    const proxyMat = trackMat(
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false })
    );
    const proxyMesh = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(w, wallH, d)),
      proxyMat
    );
    proxyMesh.position.set(0, wallH / 2, 0);
    proxyMesh.userData = {
      asset: {
        kind: 'telecom_room',
        id: room.roomId,
        label: room.name,
        subtitle: room.subtitle,
      },
    };
    roomGroup.add(proxyMesh);
    interactables.push(proxyMesh);

    // 7. External Diverse Fiber Point-of-Entry (POE) Concrete Telecom Manhole + Orange HDPE Duct Bank
    if (room.poeManhole) {
      buildFiberPoeManhole(campusParent, room, trackGeo, {
        concreteMat,
        manholeIronMat,
        conduitOrangeMat,
        safetyYellowMat,
        darkSteelMat,
      });
    }
  }

  // --- 8. Overhead Campus Optical Fiber Highway (MDF <-> Network <-> MMR -> All 4 Data Halls) ---
  const highwayGroup = new THREE.Group();
  parent.add(highwayGroup);
  const highwayY = floorSurfaceY + 3.45;

  // East-West Cross-Lobby Overhead Fiber Bridge (x = -28.0 to +28.0 at z = 44.0)
  const ewYellowBridge = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(56.0, 0.18, 0.34)),
    fiberTrayYellowMat
  );
  ewYellowBridge.position.set(0, highwayY, 43.95);
  const ewCyanBridge = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(56.0, 0.12, 0.22)),
    fiberTrunkCyanMat
  );
  ewCyanBridge.position.set(0, highwayY + 0.22, 43.95);
  highwayGroup.add(ewYellowBridge, ewCyanBridge);

  // Dual Redundant North-South Optical Spine Trunks running along Central Corridor (x = -1.35 Path A, x = +1.35 Path B)
  // Spanning from South Telecom Wing (z = 44.0) all the way through Halls C/D and Halls A/B (z = -38.0)
  const nsSpineLen = 82.0;
  const nsSpineCenterZ = 3.0;
  for (const sx of [-1.35, 1.35]) {
    const nsYellow = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.28, 0.16, nsSpineLen)),
      fiberTrayYellowMat
    );
    nsYellow.position.set(sx, highwayY, nsSpineCenterZ);
    const nsCyan = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.16, 0.1, nsSpineLen)),
      fiberTrunkCyanMat
    );
    nsCyan.position.set(sx, highwayY + 0.18, nsSpineCenterZ);
    highwayGroup.add(nsYellow, nsCyan);
  }

  // Lateral Fiber Distribution Branch Drops entering Hall A, Hall B, Hall C, and Hall D
  for (const bz of [-22.5, 22.5]) {
    const branchYellow = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(24.0, 0.14, 0.24)),
      fiberTrayYellowMat
    );
    branchYellow.position.set(0, highwayY, bz);
    const branchCyan = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(24.0, 0.09, 0.14)),
      fiberTrunkCyanMat
    );
    branchCyan.position.set(0, highwayY + 0.15, bz);
    highwayGroup.add(branchYellow, branchCyan);
  }

  const applyTheme = (darkMode: boolean) => {
    esdFloorMat.color.setHex(darkMode ? 0x1e2c3a : 0xcbd8e6);
    wallSolidMat.color.setHex(darkMode ? 0x2c3643 : 0xe2e8f0);
  };

  return {
    interactables,
    roomRefs,
    applyTheme,
    dispose: () => {
      for (const tex of texturesToDispose) tex.dispose();
    },
  };
}

function buildMdfRacks(
  roomGroup: THREE.Group,
  room: TelecomRoom3DPlacement,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
  mats: {
    rackBodyMat: THREE.MeshStandardMaterial;
    lightSteelMat: THREE.MeshStandardMaterial;
    fiberTrayYellowMat: THREE.MeshStandardMaterial;
    fiberTrunkCyanMat: THREE.MeshStandardMaterial;
    rackTrimAmberMat: THREE.MeshStandardMaterial;
    isSoftwareGl: boolean;
  }
) {
  const count = room.rackCount; // 6 ODF racks
  const pitch = 1.24;
  const startX = -((count - 1) * pitch) / 2 - 0.35;

  const bodyGeo = trackGeo(new THREE.BoxGeometry(0.86, 2.24, 0.96));
  const odfBayGeo = trackGeo(new THREE.BoxGeometry(0.74, 0.22, 0.08));
  const waterfallGeo = trackGeo(new THREE.BoxGeometry(0.28, 0.45, 0.24));
  const verticalManagerGeo = trackGeo(new THREE.BoxGeometry(0.12, 2.1, 0.14));

  for (let i = 0; i < count; i++) {
    const rx = startX + i * pitch;
    const rz = 0.65;

    const cabinet = new THREE.Mesh(bodyGeo, mats.rackBodyMat);
    cabinet.position.set(rx, 1.17, rz);
    cabinet.castShadow = !mats.isSoftwareGl;
    roomGroup.add(cabinet);

    // Top yellow fiber waterfall chute connecting rack up to overhead FiberRunner
    const chute = new THREE.Mesh(waterfallGeo, mats.fiberTrayYellowMat);
    chute.position.set(rx, 2.5, rz - 0.1);
    roomGroup.add(chute);

    // Amber MDF header accent strips (visible from both North corridor & South cutaway view)
    for (const faceZ of [-0.48, 0.48]) {
      const header = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.82, 0.1, 0.09)),
        mats.rackTrimAmberMat
      );
      header.position.set(rx, 2.22, rz + faceZ);
      roomGroup.add(header);

      // 4 stacked High-Density ODF Optical Patch Cassette Shelves (alternating yellow OS2 & cyan OM4)
      for (let s = 0; s < 4; s++) {
        const shelf = new THREE.Mesh(
          odfBayGeo,
          s % 2 === 0 ? mats.fiberTrayYellowMat : mats.fiberTrunkCyanMat
        );
        shelf.position.set(rx, 0.55 + s * 0.44, rz + faceZ);
        roomGroup.add(shelf);
      }
    }

    // Side vertical fiber cable management spine
    const vMgr = new THREE.Mesh(verticalManagerGeo, mats.lightSteelMat);
    vMgr.position.set(rx + 0.48, 1.12, rz - 0.38);
    roomGroup.add(vMgr);
  }
}

function buildNetworkCoreEquipment(
  roomGroup: THREE.Group,
  room: TelecomRoom3DPlacement,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
  mats: {
    rackBodyMat: THREE.MeshStandardMaterial;
    darkSteelMat: THREE.MeshStandardMaterial;
    lightSteelMat: THREE.MeshStandardMaterial;
    rackTrimCyanMat: THREE.MeshStandardMaterial;
    fiberTrunkCyanMat: THREE.MeshStandardMaterial;
    ecoGreenTrimMat: THREE.MeshStandardMaterial;
    screenGlowMat: THREE.MeshStandardMaterial;
    isSoftwareGl: boolean;
  }
) {
  const count = room.rackCount; // 5 Core Spine / DWDM racks
  const pitch = 1.22;
  const startX = -3.45;

  const chassisGeo = trackGeo(new THREE.BoxGeometry(0.92, 2.28, 1.12));
  const lineCardGeo = trackGeo(new THREE.BoxGeometry(0.78, 0.14, 0.08));
  const psuGeo = trackGeo(new THREE.BoxGeometry(0.34, 0.24, 0.08));

  for (let i = 0; i < count; i++) {
    const rx = startX + i * pitch;
    const rz = 0.6;

    const cabinet = new THREE.Mesh(chassisGeo, mats.rackBodyMat);
    cabinet.position.set(rx, 1.19, rz);
    cabinet.castShadow = !mats.isSoftwareGl;
    roomGroup.add(cabinet);

    // Luminous Cyan Core Spine header bezels + 6 Modular 800G QSFP-DD Line-Card Blades (North & South faces)
    for (const faceZ of [-0.55, 0.55]) {
      const topBezel = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.86, 0.11, 0.1)),
        mats.rackTrimCyanMat
      );
      topBezel.position.set(rx, 2.26, rz + faceZ);
      roomGroup.add(topBezel);

      for (let b = 0; b < 6; b++) {
        const blade = new THREE.Mesh(
          lineCardGeo,
          b % 3 === 0 ? mats.fiberTrunkCyanMat : mats.lightSteelMat
        );
        blade.position.set(rx, 0.62 + b * 0.26, rz + faceZ);
        roomGroup.add(blade);
      }
    }

    // Dual Redundant A/B Power Supply Modules at chassis base
    const psuA = new THREE.Mesh(psuGeo, mats.ecoGreenTrimMat);
    psuA.position.set(rx - 0.2, 0.28, rz + 0.55);
    const psuB = new THREE.Mesh(psuGeo, mats.darkSteelMat);
    psuB.position.set(rx + 0.2, 0.28, rz + 0.55);
    roomGroup.add(psuA, psuB);
  }

  // NOC Network Engineering Console Desk on East side of Network Room
  const deskX = 3.2;
  const deskZ = 0.55;
  const deskTop = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.75, 0.08, 0.85)),
    mats.lightSteelMat
  );
  deskTop.position.set(deskX, 0.82, deskZ);
  for (const lx of [-0.76, 0.76]) {
    const leg = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.08, 0.8, 0.72)),
      mats.darkSteelMat
    );
    leg.position.set(deskX + lx, 0.4, deskZ);
    roomGroup.add(leg);
  }
  // Dual curved telemetry monitors facing North
  for (const mx of [-0.42, 0.42]) {
    const mon = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.72, 0.42, 0.06)),
      mats.screenGlowMat
    );
    mon.position.set(deskX + mx, 1.15, deskZ + 0.14);
    const stand = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.1, 0.26, 0.08)),
      mats.darkSteelMat
    );
    stand.position.set(deskX + mx, 0.94, deskZ + 0.18);
    roomGroup.add(mon, stand);
  }
  roomGroup.add(deskTop);
}

function buildMeetMeRoomEquipment(
  roomGroup: THREE.Group,
  room: TelecomRoom3DPlacement,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
  trackMat: <T extends THREE.Material>(m: T) => T,
  mats: {
    rackBodyMat: THREE.MeshStandardMaterial;
    darkSteelMat: THREE.MeshStandardMaterial;
    lightSteelMat: THREE.MeshStandardMaterial;
    wallSolidMat: THREE.MeshStandardMaterial;
    glassMat: THREE.MeshStandardMaterial;
    fiberTrayYellowMat: THREE.MeshStandardMaterial;
    fiberTrunkCyanMat: THREE.MeshStandardMaterial;
    ecoGreenTrimMat: THREE.MeshStandardMaterial;
    isSoftwareGl: boolean;
  }
) {
  // Central Fire/Security Cage Partition dividing Carrier Zone A (West) and Carrier Zone B (East)
  const dividerKnee = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.16, 1.1, room.depth - 0.5)),
    mats.wallSolidMat
  );
  dividerKnee.position.set(0, 0.55, 0);
  const dividerGlass = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.08, 2.35, room.depth - 0.5)),
    mats.glassMat
  );
  dividerGlass.position.set(0, 2.28, 0);
  dividerGlass.renderOrder = 4;
  roomGroup.add(dividerKnee, dividerGlass);

  // Distinct Tier-1 Carrier accent strips across the 10 demarc racks (5 in Zone A, 5 in Zone B)
  const carrierColors = [0x10b981, 0x0ea5e9, 0x8b5cf6, 0xf59e0b, 0xec4899];
  const carrierMats = carrierColors.map((hex) =>
    trackMat(
      new THREE.MeshStandardMaterial({
        color: hex,
        emissive: hex,
        emissiveIntensity: 0.35,
        roughness: 0.32,
        metalness: 0.2,
      })
    )
  );

  const rackGeo = trackGeo(new THREE.BoxGeometry(0.88, 2.24, 1.0));
  const spliceTrayGeo = trackGeo(new THREE.BoxGeometry(0.76, 0.16, 0.08));
  const riserGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.45, 0.22));

  // Build 5 racks in Carrier Vault A (x = -8.6 .. -2.6) and 5 racks in Carrier Vault B (x = +2.6 .. +8.6)
  const zoneCenters = [-5.4, 5.4];
  zoneCenters.forEach((zoneCenterX, zoneIdx) => {
    for (let i = 0; i < 5; i++) {
      const rx = zoneCenterX + (i - 2) * 1.48;
      const rz = 0.62;
      const cMat = carrierMats[(i + zoneIdx * 2) % carrierMats.length];

      const cab = new THREE.Mesh(rackGeo, mats.rackBodyMat);
      cab.position.set(rx, 1.17, rz);
      cab.castShadow = !mats.isSoftwareGl;
      roomGroup.add(cab);

      // Carrier color-coded top demarc headers & MPO/LC Splice Trays (visible from both North & South angles)
      for (const faceZ of [-0.5, 0.5]) {
        const header = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(0.84, 0.13, 0.1)),
          cMat
        );
        header.position.set(rx, 2.22, rz + faceZ);
        roomGroup.add(header);

        for (let t = 0; t < 4; t++) {
          const tray = new THREE.Mesh(
            spliceTrayGeo,
            t === 0 ? cMat : t % 2 === 1 ? mats.fiberTrayYellowMat : mats.fiberTrunkCyanMat
          );
          tray.position.set(rx, 0.52 + t * 0.44, rz + faceZ);
          roomGroup.add(tray);
        }
      }

      // Vertical fiber riser chute up to overhead FiberRunner
      const riser = new THREE.Mesh(
        riserGeo,
        zoneIdx === 0 ? mats.fiberTrayYellowMat : mats.fiberTrunkCyanMat
      );
      riser.position.set(rx, 2.5, rz - 0.08);
      roomGroup.add(riser);
    }
  });

  // Security Cross-Connect Verification Podium in Zone A front corner
  const podium = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.75, 1.1, 0.55)),
    mats.darkSteelMat
  );
  podium.position.set(-9.4, 0.55, -0.5);
  const podiumTop = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.82, 0.07, 0.62)),
    mats.ecoGreenTrimMat
  );
  podiumTop.position.set(-9.4, 1.12, -0.5);
  roomGroup.add(podium, podiumTop);
}

function buildFiberPoeManhole(
  campusParent: THREE.Group,
  room: TelecomRoom3DPlacement,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
  mats: {
    concreteMat: THREE.MeshStandardMaterial;
    manholeIronMat: THREE.MeshStandardMaterial;
    conduitOrangeMat: THREE.MeshStandardMaterial;
    safetyYellowMat: THREE.MeshStandardMaterial;
    darkSteelMat: THREE.MeshStandardMaterial;
  }
) {
  if (!room.poeManhole) return;
  const { x: mx, z: mz } = room.poeManhole;
  const isWest = mx < 0;

  const poeGroup = new THREE.Group();
  poeGroup.position.set(mx, 0.02, mz);
  campusParent.add(poeGroup);

  // Heavy precast concrete telecom vault pad + recessed heavy-duty iron hatch cover
  const pad = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.6, 0.22, 2.6)), mats.concreteMat);
  pad.position.y = 0.11;
  pad.receiveShadow = true;

  const lid = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.76, 0.8, 0.08, 16)),
    mats.manholeIronMat
  );
  lid.position.y = 0.25;

  const ring = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.88, 0.88, 0.05, 16)),
    mats.conduitOrangeMat
  );
  ring.position.y = 0.23;

  poeGroup.add(pad, ring, lid);

  // 2 High-Visibility Orange Fiber Optic Cable Warning Bollards flanking the manhole
  const bollardGeo = trackGeo(new THREE.CylinderGeometry(0.08, 0.09, 1.15, 8));
  const capGeo = trackGeo(new THREE.CylinderGeometry(0.085, 0.085, 0.14, 8));
  for (const bz of [-1.1, 1.1]) {
    const b = new THREE.Mesh(bollardGeo, mats.conduitOrangeMat);
    b.position.set(isWest ? -1.1 : 1.1, 0.62, bz);
    const cap = new THREE.Mesh(capGeo, mats.safetyYellowMat);
    cap.position.set(isWest ? -1.1 : 1.1, 1.08, bz);
    poeGroup.add(b, cap);
  }

  // 4-Way Orange HDPE Underground/Entry Fiber Conduit Duct Bank entering the building facade wall
  const ductLen = 4.2;
  const ductDir = isWest ? 1 : -1;
  const ductGeo = trackGeo(new THREE.CylinderGeometry(0.085, 0.085, ductLen, 8));
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const pipe = new THREE.Mesh(ductGeo, mats.conduitOrangeMat);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(ductDir * (ductLen / 2), 0.28 + row * 0.22, -0.14 + col * 0.28);
      poeGroup.add(pipe);
    }
  }

  // Steel wall penetration collar at building exterior facade (x = ±30.0)
  const collar = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.28, 0.72, 0.85)),
    mats.darkSteelMat
  );
  collar.position.set(ductDir * 3.45, 0.4, 0);
  poeGroup.add(collar);

  // Unused scratch vars reserved for future instanced extensions
  void _pos;
  void _quat;
  void _scale;
  void _mat4;
  void _color;
}

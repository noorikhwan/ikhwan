import * as THREE from 'three';
import { BmsState } from '../../engine/bmsTypes';
import {
  BATTERY_ROOM_PLACEMENTS,
  BatteryRoom3DPlacement,
  BUILDING_BOUNDS,
  FACILITY_ASSET_PLACEMENTS,
  computeBatteryRoomMetrics,
} from '../../engine/twin3dLayout';

export interface BatteryRoomsSharedMaterials {
  concreteMat: THREE.MeshStandardMaterial;
  facadeMat: THREE.MeshStandardMaterial;
  darkSteelMat: THREE.MeshStandardMaterial;
  lightSteelMat: THREE.MeshStandardMaterial;
  glassMat: THREE.MeshStandardMaterial;
  ecoGreenTrimMat: THREE.MeshStandardMaterial;
  safetyYellowMat: THREE.MeshStandardMaterial;
}

export interface BuildBatteryRoomsParams {
  interiorParent: THREE.Group;
  shellParent: THREE.Group;
  isSoftwareGl: boolean;
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T;
  trackMat: <T extends THREE.Material>(m: T) => T;
  sharedMats: BatteryRoomsSharedMaterials;
}

export interface BatteryRoomVisualRef {
  room: BatteryRoom3DPlacement;
  selectionOutline: THREE.LineSegments;
  statusLedMat: THREE.MeshStandardMaterial;
  dcBusGlowMat: THREE.MeshStandardMaterial;
}

export interface BatteryRoomsHandles {
  interactables: THREE.Object3D[];
  updateLiveTelemetry: (bms: BmsState, selectedRoomId: string | null) => void;
  applyTheme: (darkMode: boolean) => void;
  dispose: () => void;
}

function createBatterySignTexture(
  pathLabel: string,
  title: string,
  upsLabel: string,
  accentHex: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#141920';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = accentHex;
    ctx.fillRect(0, 0, 512, 10);
    ctx.fillRect(0, 0, 14, 128);

    ctx.fillStyle = accentHex;
    ctx.font = 'bold 19px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${pathLabel} · 540V DC LI-ION BANK`, 28, 42);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 31px Inter, system-ui, sans-serif';
    ctx.fillText(title, 28, 82);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '600 17px "JetBrains Mono", monospace';
    ctx.fillText(`SUPPLIES → ${upsLabel}`, 28, 110);

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
 * Builds Dedicated 2N Lithium-Ion Battery Rooms (Path A North & Path B South)
 * flanking the West Electrical Yard, complete with 8 composite battery cabinets per room,
 * DC-MCCB switchboards, Novec 1230 fire suppression, exhaust scrubbers, cutaway roof shells,
 * and visible twin +540V DC (red) / -540V DC (blue) copper busduct feeders supplying UPS-A1/A2 and UPS-B1/B2.
 */
export function buildBatteryRooms(params: BuildBatteryRoomsParams): BatteryRoomsHandles {
  const { interiorParent, shellParent, isSoftwareGl, trackGeo, trackMat, sharedMats } = params;
  const {
    concreteMat,
    facadeMat,
    darkSteelMat,
    lightSteelMat,
    glassMat,
    ecoGreenTrimMat,
    safetyYellowMat,
  } = sharedMats;

  const floorY = BUILDING_BOUNDS.floorY;
  const interactables: THREE.Object3D[] = [];
  const refs: BatteryRoomVisualRef[] = [];
  const texturesToDispose: THREE.CanvasTexture[] = [];

  // Shared domain materials
  const epoxyFloorMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xc2ccd6, roughness: 0.55, metalness: 0.08 })
  );
  const cabinetBodyMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e2530, roughness: 0.52, metalness: 0.45 })
  );
  const cellModuleMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.42, metalness: 0.35 })
  );
  const dcPosRedMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.34, metalness: 0.52 })
  );
  const dcNegBlueMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.34, metalness: 0.52 })
  );
  const copperMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xb87333, roughness: 0.28, metalness: 0.85 })
  );
  const novecRedMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.32, metalness: 0.35 })
  );
  const vaultWallMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xdce3eb, roughness: 0.78, metalness: 0.05 })
  );
  const roofDeckMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.82, metalness: 0.12 })
  );

  // Reusable small geometries
  const cabBodyGeo = trackGeo(new THREE.BoxGeometry(1.02, 2.25, 1.05));
  const cellDrawerGeo = trackGeo(new THREE.BoxGeometry(0.88, 0.24, 0.08));
  const isolatorBoxGeo = trackGeo(new THREE.BoxGeometry(0.45, 0.34, 0.32));
  const fireCylGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.18, 1.5, 12));

  for (const room of BATTERY_ROOM_PLACEMENTS) {
    const isPathA = room.redundancyPath === 'Path A';
    const w = room.width;
    const d = room.depth;
    const h = room.wallHeight;
    const halfW = w / 2;
    const halfD = d / 2;

    const roomGroup = new THREE.Group();
    roomGroup.position.set(room.centerX, 0, room.centerZ);
    interiorParent.add(roomGroup);

    // 1. Fire-Rated Raised Concrete Vault Plinth & Anti-Static Acid-Resistant Epoxy Floor
    const plinth = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(w + 0.5, floorY, d + 0.5)),
      concreteMat
    );
    plinth.position.set(0, floorY / 2, 0);
    plinth.receiveShadow = true;
    roomGroup.add(plinth);

    const floorSlab = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(w - 0.3, 0.08, d - 0.3)),
      epoxyFloorMat
    );
    floorSlab.position.set(0, floorY + 0.04, 0);
    floorSlab.receiveShadow = true;
    roomGroup.add(floorSlab);

    // Safety-yellow perimeter containment curb inside battery vault
    const lowWallH = 1.0;
    const wallN = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, lowWallH, 0.24)), vaultWallMat);
    wallN.position.set(0, floorY + lowWallH / 2, -halfD + 0.12);
    const wallS = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, lowWallH, 0.24)), vaultWallMat);
    wallS.position.set(0, floorY + lowWallH / 2, halfD - 0.12);
    const wallW = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, lowWallH, d)), vaultWallMat);
    wallW.position.set(-halfW + 0.12, floorY + lowWallH / 2, 0);
    const wallE = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, lowWallH, d)), vaultWallMat);
    wallE.position.set(halfW - 0.12, floorY + lowWallH / 2, 0);
    roomGroup.add(wallN, wallS, wallW, wallE);

    // Per-room live status LED & DC busbar glow material
    const statusLedMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: room.accentColorHex,
        emissive: room.accentColorHex,
        emissiveIntensity: 0.85,
        roughness: 0.25,
        metalness: 0.1,
      })
    );
    const dcBusGlowMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: room.accentColorHex,
        emissive: room.accentColorHex,
        emissiveIntensity: 0.55,
        roughness: 0.3,
        metalness: 0.25,
      })
    );

    // 2. 8 High-Density Li-Ion Battery Cabinets arranged in a crisp row facing the front service aisle
    const pitch = 1.38;
    const startX = -5.65;
    const cabZ = isPathA ? -0.95 : 0.95;
    const frontSign = isPathA ? 1 : -1;

    for (let i = 0; i < room.rackCount; i++) {
      const rx = startX + i * pitch;
      const cab = new THREE.Mesh(cabBodyGeo, cabinetBodyMat);
      cab.position.set(rx, floorY + 1.2, cabZ);
      cab.castShadow = !isSoftwareGl;
      roomGroup.add(cab);

      // 6 Stacked Lithium-Ion Battery Cell Pack Drawers (visible on front & back faces!)
      for (let m = 0; m < 6; m++) {
        const my = floorY + 0.38 + m * 0.3;
        for (const fz of [-0.53, 0.53]) {
          const drawer = new THREE.Mesh(cellDrawerGeo, cellModuleMat);
          drawer.position.set(rx, my, cabZ + fz);
          roomGroup.add(drawer);
        }
      }

      // Live SoC Vertical Status LED Strip on front face + top DC breaker isolator box
      const socStrip = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.1, 1.95, 0.06)),
        statusLedMat
      );
      socStrip.position.set(rx + 0.42, floorY + 1.2, cabZ + frontSign * 0.54);
      const isolator = new THREE.Mesh(isolatorBoxGeo, darkSteelMat);
      isolator.position.set(rx, floorY + 2.48, cabZ);
      const copperTap = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.14, 0.28, 0.14)),
        copperMat
      );
      copperTap.position.set(rx, floorY + 2.75, cabZ);
      roomGroup.add(socStrip, isolator, copperTap);
    }

    // Internal Overhead Twin +540V DC (Red) & -540V DC (Blue) Copper Collector Busbars uniting all 8 cabinets
    const busLen = room.rackCount * pitch + 1.2;
    const busCenterX = -0.35;
    const busPos = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(busLen, 0.14, 0.14)),
      dcPosRedMat
    );
    busPos.position.set(busCenterX, floorY + 2.92, cabZ - 0.18);
    const busNeg = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(busLen, 0.14, 0.14)),
      dcNegBlueMat
    );
    busNeg.position.set(busCenterX, floorY + 2.92, cabZ + 0.18);
    roomGroup.add(busPos, busNeg);

    // 3. Main DC-MCCB Switchboard & Battery Management System (BMS) Control Panel (East end of vault)
    const mccb = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.55, 2.35, 1.25)),
      lightSteelMat
    );
    mccb.position.set(halfW - 1.35, floorY + 1.25, 0);
    const mccbHeader = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.42, 0.18, 1.28)),
      dcBusGlowMat
    );
    mccbHeader.position.set(halfW - 1.35, floorY + 2.32, 0);
    roomGroup.add(mccb, mccbHeader);

    // Twin Red Novec 1230 Clean-Agent Fire Suppression Cylinders (West service corner)
    for (let fi = 0; fi < 2; fi++) {
      const cyl = new THREE.Mesh(fireCylGeo, novecRedMat);
      cyl.position.set(-halfW + 0.65, floorY + 0.85, (isPathA ? 1.1 : -1.1) + fi * 0.45 * frontSign);
      roomGroup.add(cyl);
    }

    // Overhead Architectural Signboard Banner ("BATTERY ROOM A · SUPPLIES → UPS-A1 & UPS-A2")
    const accentCss = isPathA ? '#3DCD58' : '#F59E0B';
    const signTex = createBatterySignTexture(
      room.redundancyPath.toUpperCase(),
      isPathA ? 'BATTERY ROOM A' : 'BATTERY ROOM B',
      isPathA ? 'UPS-A1 & UPS-A2' : 'UPS-B1 & UPS-B2',
      accentCss
    );
    texturesToDispose.push(signTex);
    const signMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: signTex,
        roughness: 0.35,
        metalness: 0.1,
      })
    );
    const banner = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.8, 1.15, 0.16)), signMat);
    banner.position.set(0, floorY + 3.55, isPathA ? halfD - 0.12 : -halfD + 0.12);
    roomGroup.add(banner);

    // 4. Cutaway Exterior Fire-Rated Shell & Roof (lifts off cleanly with Building Cutaway!)
    const shellGroup = new THREE.Group();
    shellGroup.position.set(room.centerX, 0, room.centerZ);
    shellParent.add(shellGroup);

    const upperH = h - lowWallH;
    const upperY = floorY + lowWallH + upperH / 2;
    const shN = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, upperH, 0.24)), facadeMat);
    shN.position.set(0, upperY, -halfD + 0.12);
    const shS = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, upperH, 0.24)), facadeMat);
    shS.position.set(0, upperY, halfD - 0.12);
    const shW = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, upperH, d)), facadeMat);
    shW.position.set(-halfW + 0.12, upperY, 0);
    const shE = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, upperH, d)), facadeMat);
    shE.position.set(halfW - 0.12, upperY, 0);
    const roof = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(w + 0.35, 0.28, d + 0.35)),
      roofDeckMat
    );
    roof.position.set(0, floorY + h + 0.14, 0);
    const trimBand = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(w + 0.45, 0.26, d + 0.45)),
      isPathA ? ecoGreenTrimMat : safetyYellowMat
    );
    trimBand.position.set(0, floorY + h - 0.08, 0);
    // Rooftop Hydrogen / Thermal-Runaway Scrubber Exhaust Fan Cowl
    const fanCowl = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.62, 0.72, 0.75, 12)),
      darkSteelMat
    );
    fanCowl.position.set(-4.2, floorY + h + 0.62, 0);
    // Exterior Signboard mounted on West facade so it's readable in Building Exterior view
    const extSign = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.16, 1.15, 4.4)), signMat);
    extSign.position.set(-halfW - 0.14, floorY + h - 1.1, 0);
    shellGroup.add(shN, shS, shW, shE, roof, trimBand, fanCowl, extSign);

    // 5. DIRECT OVERHEAD +540V DC / -540V DC BUSBAR FEEDER BRIDGE → SERVED UPS UNITS!
    // Routes from Battery Room East Wall (x = -40.5, z = room.centerZ) straight to MEP UPS bus spine (x = -38.4)
    // and along the West edge of the UPS Vault directly into UPS-A1/A2 (z = -24, -10) or UPS-B1/B2 (z = +10, +24)!
    const busY = floorY + 3.25;
    const exitX = room.centerX + halfW; // -40.5
    const spineX = -38.4;
    const servedUps = FACILITY_ASSET_PLACEMENTS.filter((f) => room.servedUpsIds.includes(f.assetId));

    // Short horizontal exit bridge from Battery Room East wall to UPS DC Spine (x = -40.5 -> -38.4)
    const bridgeLenX = Math.abs(spineX - exitX) + 0.3;
    const bridgeMidX = (exitX + spineX) / 2;
    const exitTray = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(bridgeLenX, 0.12, 0.72)),
      darkSteelMat
    );
    exitTray.position.set(bridgeMidX, busY - 0.1, room.centerZ);
    const exitPos = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(bridgeLenX, 0.14, 0.14)),
      dcPosRedMat
    );
    exitPos.position.set(bridgeMidX, busY + 0.04, room.centerZ - 0.16);
    const exitNeg = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(bridgeLenX, 0.14, 0.14)),
      dcNegBlueMat
    );
    exitNeg.position.set(bridgeMidX, busY + 0.04, room.centerZ + 0.16);
    interiorParent.add(exitTray, exitPos, exitNeg);

    // Longitudinal DC Feeder Spine running directly to both served UPS units
    if (servedUps.length > 0) {
      const zValues = [room.centerZ, ...servedUps.map((u) => u.z)];
      const minZ = Math.min(...zValues);
      const maxZ = Math.max(...zValues);
      const runLenZ = maxZ - minZ;
      const midZ = (minZ + maxZ) / 2;

      const spineTray = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.68, 0.12, runLenZ + 0.3)),
        darkSteelMat
      );
      spineTray.position.set(spineX, busY - 0.1, midZ);
      const spinePos = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.14, 0.14, runLenZ + 0.3)),
        dcPosRedMat
      );
      spinePos.position.set(spineX - 0.16, busY + 0.04, midZ);
      const spineNeg = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.14, 0.14, runLenZ + 0.3)),
        dcNegBlueMat
      );
      spineNeg.position.set(spineX + 0.16, busY + 0.04, midZ);
      const spineGlow = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.08, 0.06, runLenZ)),
        dcBusGlowMat
      );
      spineGlow.position.set(spineX, busY + 0.14, midZ);
      interiorParent.add(spineTray, spinePos, spineNeg, spineGlow);

      // Steel support stanchions along the DC feeder spine + lateral tap drops directly into each UPS!
      for (const u of servedUps) {
        const tapLenX = Math.abs(u.x - spineX);
        const tapMidX = (u.x + spineX) / 2;
        const tapPos = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(tapLenX, 0.13, 0.13)),
          dcPosRedMat
        );
        tapPos.position.set(tapMidX, busY + 0.04, u.z - 0.16);
        const tapNeg = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(tapLenX, 0.13, 0.13)),
          dcNegBlueMat
        );
        tapNeg.position.set(tapMidX, busY + 0.04, u.z + 0.16);
        // Vertical DC drop riser down into UPS DC input cabinet top
        const dropPos = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(0.12, 1.35, 0.12)),
          dcPosRedMat
        );
        dropPos.position.set(u.x - 0.3, busY - 0.65, u.z - 0.16);
        const dropNeg = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(0.12, 1.35, 0.12)),
          dcNegBlueMat
        );
        dropNeg.position.set(u.x - 0.3, busY - 0.65, u.z + 0.16);
        // Support stanchion post under spine at each tap
        const stanchion = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(0.16, busY - floorY, 0.16)),
          darkSteelMat
        );
        stanchion.position.set(spineX, floorY + (busY - floorY) / 2, u.z);
        interiorParent.add(tapPos, tapNeg, dropPos, dropNeg, stanchion);
      }
    }

    // 6. Selection Outline & Click Proxy
    const selectionOutline = new THREE.LineSegments(
      trackGeo(new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.28, h + 0.28, d + 0.28))),
      trackMat(new THREE.LineBasicMaterial({ color: room.accentColorHex }))
    );
    selectionOutline.position.set(room.centerX, floorY + h / 2, room.centerZ);
    selectionOutline.visible = false;
    interiorParent.add(selectionOutline);

    const proxyMesh = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(w, h, d)),
      trackMat(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false }))
    );
    proxyMesh.position.set(room.centerX, floorY + h / 2, room.centerZ);
    proxyMesh.userData = {
      asset: {
        kind: 'battery_room',
        id: room.roomId,
        label: room.name,
        subtitle: room.subtitle,
      },
    };
    interiorParent.add(proxyMesh);
    interactables.push(proxyMesh);

    refs.push({
      room,
      selectionOutline,
      statusLedMat,
      dcBusGlowMat,
    });
  }

  // Keep glassMat referenced for clean shared contract
  void glassMat;

  const updateLiveTelemetry = (bms: BmsState, selectedRoomId: string | null) => {
    for (const ref of refs) {
      const m = computeBatteryRoomMetrics(ref.room, bms);
      ref.statusLedMat.color.setHex(m.statusColorHex);
      ref.statusLedMat.emissive.setHex(m.statusColorHex);
      ref.dcBusGlowMat.color.setHex(m.statusColorHex);
      ref.dcBusGlowMat.emissive.setHex(m.statusColorHex);
      ref.selectionOutline.visible = selectedRoomId === ref.room.roomId;
    }
  };

  const applyTheme = (darkMode: boolean) => {
    epoxyFloorMat.color.setHex(darkMode ? 0x25303c : 0xc2ccd6);
    vaultWallMat.color.setHex(darkMode ? 0x2d3744 : 0xdce3eb);
    roofDeckMat.color.setHex(darkMode ? 0x334155 : 0x94a3b8);
  };

  return {
    interactables,
    updateLiveTelemetry,
    applyTheme,
    dispose: () => {
      for (const tex of texturesToDispose) tex.dispose();
    },
  };
}

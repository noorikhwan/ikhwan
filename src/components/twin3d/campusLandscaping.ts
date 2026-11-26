import * as THREE from 'three';
import {
  LANDSCAPE_TREE_PLACEMENTS,
  VISITOR_PARKING_BAYS,
  VisitorParkingBay3D,
} from '../../engine/twin3dLayout';
import { TwinProceduralTextures } from './textures';

export interface CampusLandscapingParams {
  parent: THREE.Group;
  textures: TwinProceduralTextures;
  isSoftwareGl: boolean;
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T;
  trackMat: <T extends THREE.Material>(m: T) => T;
  sharedMats: {
    concreteMat: THREE.MeshStandardMaterial;
    darkSteelMat: THREE.MeshStandardMaterial;
    lightSteelMat: THREE.MeshStandardMaterial;
    ecoGreenTrimMat: THREE.MeshStandardMaterial;
    safetyYellowMat: THREE.MeshStandardMaterial;
    contactShadowMat: THREE.MeshBasicMaterial;
  };
}

export interface CampusLandscapingHandles {
  applyTheme: (darkMode: boolean) => void;
}

const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _euler = new THREE.Euler();
const _yAxis = new THREE.Vector3(0, 1, 0);

/**
 * Builds the complete architectural Visitor Parking Complex & Campus Landscaping:
 * - South Forecourt 28-bay Visitor Parking (West & East wings, 4 EV Chargers, 2 Accessible bays, Solar Carport Canopy)
 * - 14 composite multi-part 3D parked visitor vehicles (sedans, SUVs, EV crossovers)
 * - Glazed Security Gatehouse with dual entry/exit barrier arms & Orise Campus Monument Sign
 * - Grand NOC Lobby Travertine Plaza, Entrance Steps & Twin Architectural Reflecting Pools with Cedar Bridges
 * - 53 multi-part architectural trees (Broadleaf Shade, Columnar Cypress, Tropical Courtyard Palms)
 * - Manicured boxwood hedgerows, flowering planter beds, timber benches, and LED campus street lamps
 */
export function buildCampusParkingAndLandscaping({
  parent,
  textures,
  isSoftwareGl,
  trackGeo,
  trackMat,
  sharedMats,
}: CampusLandscapingParams): CampusLandscapingHandles {
  const {
    concreteMat,
    darkSteelMat,
    lightSteelMat,
    ecoGreenTrimMat,
    safetyYellowMat,
    contactShadowMat,
  } = sharedMats;

  // --- Dedicated Campus Parking & Landscape PBR Materials ---
  const parkingAsphaltMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x454d58,
      map: textures.asphaltMap,
      roughness: 0.92,
      metalness: 0.04,
    })
  );
  const boulevardAsphaltMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b424c,
      map: textures.asphaltMap,
      roughness: 0.93,
      metalness: 0.03,
    })
  );
  const paverPlazaMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.paverMap,
      roughness: 0.78,
      metalness: 0.04,
    })
  );
  const graniteCurbMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.82,
      metalness: 0.05,
    })
  );
  const islandTurfMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x6ea36a,
      roughness: 0.94,
      metalness: 0.0,
    })
  );
  const mulchSoilMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5c4636,
      roughness: 0.96,
      metalness: 0.0,
    })
  );
  const roadStripeWhiteMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xf1f5f9,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  const roadStripeYellowMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  const evBaySurfaceMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x15803d,
      roughness: 0.85,
      metalness: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const adaBaySurfaceMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      roughness: 0.85,
      metalness: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const reflectingWaterMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0e6b85,
      roughness: 0.09,
      metalness: 0.34,
    })
  );
  const poolBasinMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.72,
      metalness: 0.14,
    })
  );
  const cedarTimberMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9a643d,
      roughness: 0.76,
      metalness: 0.05,
    })
  );
  const solarPanelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.solarPanelMap,
      roughness: 0.2,
      metalness: 0.45,
    })
  );
  const monumentSignMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.monumentSignMap,
      roughness: 0.36,
      metalness: 0.12,
    })
  );
  const gateGlassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1d3b53,
      roughness: 0.14,
      metalness: 0.48,
      transparent: true,
      opacity: 0.82,
    })
  );
  const barrierRedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.4,
      metalness: 0.15,
    })
  );
  const barrierWhiteMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.4,
      metalness: 0.1,
    })
  );
  const lampGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfff7ed,
      emissive: 0xfde68a,
      emissiveIntensity: 0.85,
      roughness: 0.2,
    })
  );
  const evGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x06b6d4,
      emissiveIntensity: 1.05,
      roughness: 0.25,
    })
  );

  // --- 1. South Visitor Parking Asphalt Deck, Exterior Boulevard & Main Arrival Road ---
  const parkingDeck = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(94.0, 26.0)),
    parkingAsphaltMat
  );
  parkingDeck.rotation.x = -Math.PI / 2;
  parkingDeck.position.set(0, 0.025, 68.5);
  parkingDeck.receiveShadow = true;
  parent.add(parkingDeck);

  // Exterior South Access Boulevard (East-West public road framing the front campus edge)
  const southBoulevard = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(240.0, 9.5)),
    boulevardAsphaltMat
  );
  southBoulevard.rotation.x = -Math.PI / 2;
  southBoulevard.position.set(0, 0.02, 91.5);
  southBoulevard.receiveShadow = true;
  parent.add(southBoulevard);

  // Boulevard dashed yellow center divider
  const dashGeo = trackGeo(new THREE.PlaneGeometry(3.8, 0.22));
  const dashCount = 28;
  const blvdDashes = new THREE.InstancedMesh(dashGeo, roadStripeYellowMat, dashCount);
  _quat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  _scale.set(1, 1, 1);
  for (let i = 0; i < dashCount; i++) {
    const dx = -108 + i * 8.0;
    _pos.set(dx, 0.042, 91.5);
    _mat4.compose(_pos, _quat, _scale);
    blvdDashes.setMatrixAt(i, _mat4);
  }
  blvdDashes.instanceMatrix.needsUpdate = true;
  blvdDashes.computeBoundingSphere();
  parent.add(blvdDashes);

  // Main North-South Visitor Arrival Road connecting South Boulevard (z=87) to Drop-Off Forecourt (z=55.5)
  const arrivalRoad = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(13.6, 33.0)),
    parkingAsphaltMat
  );
  arrivalRoad.rotation.x = -Math.PI / 2;
  arrivalRoad.position.set(0, 0.028, 72.0);
  arrivalRoad.receiveShadow = true;
  parent.add(arrivalRoad);

  // White edge lines along main arrival drive (stopping cleanly at South Boulevard curb)
  const driveEdgeGeo = trackGeo(new THREE.PlaneGeometry(0.18, 25.0));
  for (const ex of [-6.3, 6.3]) {
    const line = new THREE.Mesh(driveEdgeGeo, roadStripeWhiteMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(ex, 0.048, 73.5);
    parent.add(line);
  }

  // --- 2. Grand South NOC Lobby Travertine Plaza, Entrance Steps & Twin Reflecting Pools ---
  const lobbyPlaza = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(62.0, 0.08, 9.6)),
    paverPlazaMat
  );
  lobbyPlaza.position.set(0, 0.04, 52.0);
  lobbyPlaza.receiveShadow = true;
  parent.add(lobbyPlaza);

  // Raised concrete edge apron around plaza perimeter
  const plazaSouthBorder = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(62.4, 0.1, 0.35)),
    graniteCurbMat
  );
  plazaSouthBorder.position.set(0, 0.05, 56.8);
  parent.add(plazaSouthBorder);

  // Grand 3-step stone entrance staircase leading up to NOC Lobby plinth (y = 0.6)
  for (let s = 0; s < 3; s++) {
    const stepH = 0.18 * (s + 1);
    const stepD = 2.0 - s * 0.55;
    const step = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(13.2, 0.18, stepD)),
      graniteCurbMat
    );
    step.position.set(0, stepH - 0.04, 47.4 + stepD / 2);
    step.receiveShadow = true;
    parent.add(step);
  }

  // Architectural stainless-steel security bollards framing the NOC Lobby VIP drop-off edge
  const bollardGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.12, 0.92, 10));
  const bollardCapGeo = trackGeo(new THREE.CylinderGeometry(0.115, 0.115, 0.08, 10));
  const bollardXs = [-10.5, -8.2, -5.9, -3.6, 3.6, 5.9, 8.2, 10.5];
  const bollardInst = new THREE.InstancedMesh(bollardGeo, darkSteelMat, bollardXs.length);
  const bollardGlowInst = new THREE.InstancedMesh(bollardCapGeo, lampGlowMat, bollardXs.length);
  _quat.identity();
  _scale.set(1, 1, 1);
  bollardXs.forEach((bx, idx) => {
    _pos.set(bx, 0.54, 56.2);
    _mat4.compose(_pos, _quat, _scale);
    bollardInst.setMatrixAt(idx, _mat4);
    _pos.set(bx, 0.96, 56.2);
    _mat4.compose(_pos, _quat, _scale);
    bollardGlowInst.setMatrixAt(idx, _mat4);
  });
  bollardInst.instanceMatrix.needsUpdate = true;
  bollardGlowInst.instanceMatrix.needsUpdate = true;
  bollardInst.computeBoundingSphere();
  bollardGlowInst.computeBoundingSphere();
  parent.add(bollardInst, bollardGlowInst);

  // Twin Architectural Reflecting Pools & Stormwater Bioswale Gardens flanking the South NOC Lobby
  for (const side of [-1, 1]) {
    const poolX = side * 19.5;
    const poolZ = 51.6;
    const poolGroup = new THREE.Group();
    poolGroup.position.set(poolX, 0.08, poolZ);

    // Outer granite coping wall frame
    const coping = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(12.6, 0.34, 5.6)),
      graniteCurbMat
    );
    coping.position.y = 0.17;
    coping.receiveShadow = true;

    // Dark recessed basin interior
    const basin = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(11.6, 0.16, 4.6)),
      poolBasinMat
    );
    basin.position.y = 0.24;

    // Shimmering deep-teal reflective water plane
    const water = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(11.4, 4.4)),
      reflectingWaterMat
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.34;

    // Warm cedar timber viewing footbridge across the pool center
    const bridgeDeck = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(2.2, 0.14, 5.8)),
      cedarTimberMat
    );
    bridgeDeck.position.set(0, 0.42, 0);
    const railL = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.08, 0.08, 5.6)),
      darkSteelMat
    );
    railL.position.set(-1.02, 0.52, 0);
    const railR = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.08, 0.08, 5.6)),
      darkSteelMat
    );
    railR.position.set(1.02, 0.52, 0);

    // Twin raised stone-and-grass reed islets inside the reflecting pool
    for (const ix of [-3.4, 3.4]) {
      const islet = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(1.05, 1.2, 0.32, 12)),
        graniteCurbMat
      );
      islet.position.set(ix, 0.3, 0);
      const isletGrass = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.88, 0.96, 0.16, 12)),
        islandTurfMat
      );
      isletGrass.position.set(ix, 0.48, 0);
      poolGroup.add(islet, isletGrass);
    }

    // Architectural timber-slat promenade benches facing the pool along South walkway
    for (const bx of [-3.8, 3.8]) {
      const benchBaseL = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.18, 0.42, 0.55)),
        graniteCurbMat
      );
      benchBaseL.position.set(bx - 0.85, 0.21, 3.45);
      const benchBaseR = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.18, 0.42, 0.55)),
        graniteCurbMat
      );
      benchBaseR.position.set(bx + 0.85, 0.21, 3.45);
      const benchSeat = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(2.1, 0.09, 0.62)),
        cedarTimberMat
      );
      benchSeat.position.set(bx, 0.46, 3.45);
      poolGroup.add(benchBaseL, benchBaseR, benchSeat);
    }

    poolGroup.add(coping, basin, water, bridgeDeck, railL, railR);
    parent.add(poolGroup);
  }

  // Zebra Pedestrian Crosswalks linking West & East Parking Wings to Central NOC Lobby
  const zebraGeo = trackGeo(new THREE.PlaneGeometry(0.55, 3.1));
  const zebraCoords: Array<[number, number, number]> = [];
  // Main arrival road crosswalk at z = 58.6
  for (let x = -5.0; x <= 5.0; x += 1.1) {
    zebraCoords.push([x, 58.6, 0]);
  }
  // West parking aisle crosswalk at x = -16.8
  for (let z = 64.4; z <= 70.0; z += 1.1) {
    zebraCoords.push([-16.8, z, Math.PI / 2]);
  }
  // East parking aisle crosswalk at x = +16.8
  for (let z = 64.4; z <= 70.0; z += 1.1) {
    zebraCoords.push([16.8, z, Math.PI / 2]);
  }
  const zebraInst = new THREE.InstancedMesh(zebraGeo, roadStripeWhiteMat, zebraCoords.length);
  zebraCoords.forEach(([zx, zz, rotY], idx) => {
    _euler.set(-Math.PI / 2, 0, rotY);
    _quat.setFromEuler(_euler);
    _pos.set(zx, 0.052, zz);
    _scale.set(1, 1, 1);
    _mat4.compose(_pos, _quat, _scale);
    zebraInst.setMatrixAt(idx, _mat4);
  });
  zebraInst.instanceMatrix.needsUpdate = true;
  zebraInst.computeBoundingSphere();
  parent.add(zebraInst);

  // --- 3. 28 Visitor Parking Bays (Stripes, EV Green & ADA Blue Markings, Wheel Stops, EV Chargers, Solar Carport) ---
  const stallLineGeo = trackGeo(new THREE.PlaneGeometry(0.14, 5.2));
  const wheelStopGeo = trackGeo(new THREE.BoxGeometry(1.85, 0.16, 0.22));
  const evTintGeo = trackGeo(new THREE.PlaneGeometry(2.65, 5.0));
  const adaTintGeo = trackGeo(new THREE.PlaneGeometry(2.65, 5.0));

  // Build stall divider stripes for all 4 rows (7 bays -> 8 vertical lines per row = 32 stripes)
  const stripePositions: Array<[number, number]> = [];
  const rowConfigs = [
    { startX: -38.5 - 3.15 / 2, z: 60.8 },
    { startX: -38.5 - 3.15 / 2, z: 73.6 },
    { startX: 19.6 - 3.15 / 2, z: 60.8 },
    { startX: 19.6 - 3.15 / 2, z: 73.6 },
  ];
  for (const rc of rowConfigs) {
    for (let i = 0; i <= 7; i++) {
      stripePositions.push([rc.startX + i * 3.15, rc.z]);
    }
  }
  const stallStripesInst = new THREE.InstancedMesh(
    stallLineGeo,
    roadStripeWhiteMat,
    stripePositions.length
  );
  _euler.set(-Math.PI / 2, 0, 0);
  _quat.setFromEuler(_euler);
  _scale.set(1, 1, 1);
  stripePositions.forEach(([sx, sz], idx) => {
    _pos.set(sx, 0.048, sz);
    _mat4.compose(_pos, _quat, _scale);
    stallStripesInst.setMatrixAt(idx, _mat4);
  });
  stallStripesInst.instanceMatrix.needsUpdate = true;
  stallStripesInst.computeBoundingSphere();
  parent.add(stallStripesInst);

  // Wheel stops for all 28 bays
  const wheelStopsInst = new THREE.InstancedMesh(
    wheelStopGeo,
    graniteCurbMat,
    VISITOR_PARKING_BAYS.length
  );
  _quat.identity();
  VISITOR_PARKING_BAYS.forEach((bay, idx) => {
    const stopZ = bay.row === 'North' ? bay.z - 2.0 : bay.z + 2.0;
    _pos.set(bay.x, 0.105, stopZ);
    _mat4.compose(_pos, _quat, _scale);
    wheelStopsInst.setMatrixAt(idx, _mat4);

    // Special tinted bay surfaces for EV Charging & Accessible (ADA) bays
    if (bay.kind === 'ev') {
      const tint = new THREE.Mesh(evTintGeo, evBaySurfaceMat);
      tint.rotation.x = -Math.PI / 2;
      tint.position.set(bay.x, 0.044, bay.z);
      parent.add(tint);
      // Crisp white EV bar badge at bay mouth
      const evBar = new THREE.Mesh(
        trackGeo(new THREE.PlaneGeometry(1.3, 0.24)),
        roadStripeWhiteMat
      );
      evBar.rotation.x = -Math.PI / 2;
      evBar.position.set(bay.x, 0.052, bay.row === 'North' ? bay.z + 1.9 : bay.z - 1.9);
      parent.add(evBar);
    } else if (bay.kind === 'accessible') {
      const tint = new THREE.Mesh(adaTintGeo, adaBaySurfaceMat);
      tint.rotation.x = -Math.PI / 2;
      tint.position.set(bay.x, 0.044, bay.z);
      parent.add(tint);
      // Crisp white ADA icon square
      const adaBox = new THREE.Mesh(
        trackGeo(new THREE.PlaneGeometry(0.95, 0.95)),
        roadStripeWhiteMat
      );
      adaBox.rotation.x = -Math.PI / 2;
      adaBox.position.set(bay.x, 0.052, bay.z + 1.2);
      parent.add(adaBox);
    }
  });
  wheelStopsInst.instanceMatrix.needsUpdate = true;
  wheelStopsInst.computeBoundingSphere();
  parent.add(wheelStopsInst);

  // Dual-Port DC/AC Fast EV Charging Pedestals serving the 4 West-Wing EV Bays
  for (const ez of [57.85, 76.55]) {
    const chargerGroup = new THREE.Group();
    chargerGroup.position.set(-27.48, 0.025, ez);

    const pad = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.2, 0.16, 0.9)), graniteCurbMat);
    pad.position.y = 0.08;
    const body = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.92, 1.85, 0.42)), darkSteelMat);
    body.position.y = 1.08;
    const ecoSideL = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.08, 1.78, 0.44)),
      ecoGreenTrimMat
    );
    ecoSideL.position.set(-0.48, 1.08, 0);
    const ecoSideR = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.08, 1.78, 0.44)),
      ecoGreenTrimMat
    );
    ecoSideR.position.set(0.48, 1.08, 0);
    const statusBar = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.84, 0.14, 0.46)),
      evGlowMat
    );
    statusBar.position.y = 1.86;
    const screen = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.42, 0.34, 0.45)),
      evGlowMat
    );
    screen.position.y = 1.38;
    const guardL = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.07, 0.07, 0.85, 8)),
      safetyYellowMat
    );
    guardL.position.set(-0.85, 0.58, 0);
    const guardR = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.07, 0.07, 0.85, 8)),
      safetyYellowMat
    );
    guardR.position.set(0.85, 0.58, 0);

    chargerGroup.add(pad, body, ecoSideL, ecoSideR, statusBar, screen, guardL, guardR);
    parent.add(chargerGroup);
  }

  // East Wing North Row Covered Solar PV Carport Canopy (22.5m span over 7 visitor bays)
  const carportGroup = new THREE.Group();
  carportGroup.position.set(29.05, 0.025, 60.8);
  const canopyDeck = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(22.6, 0.16, 5.6)),
    solarPanelMat
  );
  canopyDeck.position.set(0, 3.35, 0);
  canopyDeck.rotation.x = 0.11; // 6.3° southward tilt toward sun
  canopyDeck.castShadow = !isSoftwareGl;

  const canopyFrame = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(22.9, 0.14, 5.85)),
    darkSteelMat
  );
  canopyFrame.position.set(0, 3.24, 0);
  canopyFrame.rotation.x = 0.11;

  const canopyEcoTrim = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(22.95, 0.1, 0.14)),
    ecoGreenTrimMat
  );
  canopyEcoTrim.position.set(0, 2.94, 2.92);

  // Under-canopy LED light bar strips
  for (const lx of [-6.5, 0, 6.5]) {
    const strip = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(4.2, 0.06, 0.14)),
      lampGlowMat
    );
    strip.position.set(lx, 3.12, 0.4);
    carportGroup.add(strip);
  }

  // 4 Sculptural cantilevered Y-columns anchored along rear North curb (clear of parked doors!)
  for (const cx of [-9.45, -3.15, 3.15, 9.45]) {
    const footing = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.65, 0.35, 0.65)),
      graniteCurbMat
    );
    footing.position.set(cx, 0.18, -2.55);
    const mast = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.32, 3.45, 0.36)),
      darkSteelMat
    );
    mast.position.set(cx, 1.85, -2.55);
    const arm = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.24, 0.24, 5.4)),
      lightSteelMat
    );
    arm.position.set(cx, 3.15, 0);
    arm.rotation.x = 0.11;
    const brace = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.18, 0.18, 2.4)),
      lightSteelMat
    );
    brace.position.set(cx, 2.6, -1.6);
    brace.rotation.x = -0.62;
    carportGroup.add(footing, mast, arm, brace);
  }
  carportGroup.add(canopyDeck, canopyFrame, canopyEcoTrim);
  parent.add(carportGroup);

  // --- 4. Composite Multi-Part Parked Visitor Vehicles (14 Cars across West & East Wings) ---
  const tireGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12));
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = trackGeo(new THREE.CylinderGeometry(0.19, 0.19, 0.24, 10));
  rimGeo.rotateZ(Math.PI / 2);
  const tireMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x181c22, roughness: 0.92, metalness: 0.05 })
  );
  const rimMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xdbe4ee, roughness: 0.22, metalness: 0.88 })
  );
  const carGlassMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x162230, roughness: 0.09, metalness: 0.42 })
  );
  const headlightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfef9c3,
      emissiveIntensity: 0.7,
      roughness: 0.15,
    })
  );
  const taillightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: 0xb91c1c,
      emissiveIntensity: 0.65,
      roughness: 0.2,
    })
  );
  const carShadowGeo = trackGeo(new THREE.PlaneGeometry(2.4, 4.9));

  const paintMatCache = new Map<number, THREE.MeshStandardMaterial>();
  const getCarPaintMat = (hex: number) => {
    let mat = paintMatCache.get(hex);
    if (!mat) {
      mat = trackMat(
        new THREE.MeshStandardMaterial({
          color: hex,
          roughness: 0.24,
          metalness: 0.62,
        })
      );
      paintMatCache.set(hex, mat);
    }
    return mat;
  };

  const buildParkedVehicle = (bay: VisitorParkingBay3D) => {
    const car = new THREE.Group();
    car.position.set(bay.x, 0.03, bay.z);
    car.rotation.y = bay.facingAngleY;

    const isSuv = bay.vehicleStyle === 'suv';
    const isEv = bay.vehicleStyle === 'ev-crossover';
    const bodyLen = isSuv ? 4.45 : isEv ? 4.35 : 4.28;
    const bodyW = isSuv ? 1.88 : 1.8;
    const lowerH = isSuv ? 0.68 : 0.56;
    const cabinH = isSuv ? 0.66 : isEv ? 0.58 : 0.52;
    const cabinLen = isSuv ? 2.65 : isEv ? 2.45 : 2.18;
    const cabinOffsetZ = isSuv ? -0.25 : -0.18;
    const paintMat = getCarPaintMat(bay.vehicleColorHex ?? 0x94a3b8);

    // Grounded contact shadow disc
    const shadow = new THREE.Mesh(carShadowGeo, contactShadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.025;
    car.add(shadow);

    // Lower sculpted body hull + dark rocker sill skirt
    const skirt = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(bodyW - 0.08, 0.16, bodyLen - 0.16)),
      darkSteelMat
    );
    skirt.position.y = 0.26;
    const lowerBody = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(bodyW, lowerH, bodyLen)),
      paintMat
    );
    lowerBody.position.y = 0.34 + lowerH / 2;
    lowerBody.castShadow = !isSoftwareGl;

    // Upper greenhouse cabin & wraparound tinted glazing
    const cabin = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(bodyW - 0.24, cabinH, cabinLen)),
      paintMat
    );
    cabin.position.set(0, 0.34 + lowerH + cabinH / 2 - 0.02, cabinOffsetZ);
    const glassWrap = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(bodyW - 0.2, cabinH - 0.12, cabinLen - 0.12)),
      carGlassMat
    );
    glassWrap.position.set(0, 0.34 + lowerH + cabinH / 2 - 0.02, cabinOffsetZ);
    const windshield = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(bodyW - 0.32, cabinH - 0.08, 0.12)),
      carGlassMat
    );
    windshield.position.set(0, 0.34 + lowerH + cabinH / 2 - 0.04, cabinOffsetZ + cabinLen / 2 + 0.02);
    windshield.rotation.x = -0.35;

    // Front grille, warm LED headlights & rear crimson tail light bar
    const grille = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(bodyW * 0.56, 0.22, 0.06)),
      darkSteelMat
    );
    grille.position.set(0, 0.52, bodyLen / 2 + 0.01);
    const hlL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.12, 0.08)), headlightMat);
    hlL.position.set(-bodyW * 0.34, 0.64, bodyLen / 2);
    const hlR = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.12, 0.08)), headlightMat);
    hlR.position.set(bodyW * 0.34, 0.64, bodyLen / 2);
    const tailBar = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(bodyW * 0.82, 0.12, 0.08)),
      taillightMat
    );
    tailBar.position.set(0, 0.68, -bodyLen / 2);

    // 4 Rubber tires + metallic alloy rims
    for (const wx of [-bodyW / 2 + 0.02, bodyW / 2 - 0.02]) {
      for (const wz of [-bodyLen * 0.31, bodyLen * 0.31]) {
        const tire = new THREE.Mesh(tireGeo, tireMat);
        tire.position.set(wx, 0.32, wz);
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.position.set(wx, 0.32, wz);
        car.add(tire, rim);
      }
    }

    // Subtle green EV accent stripe on EV crossovers
    if (isEv) {
      const evAccent = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(bodyW + 0.02, 0.06, bodyLen * 0.55)),
        ecoGreenTrimMat
      );
      evAccent.position.set(0, 0.36, 0);
      car.add(evAccent);
    }

    car.add(skirt, lowerBody, cabin, glassWrap, windshield, grille, hlL, hlR, tailBar);
    parent.add(car);
  };

  for (const bay of VISITOR_PARKING_BAYS) {
    if (bay.occupied) {
      buildParkedVehicle(bay);
    }
  }

  // --- 5. Security Gatehouse, Dual Entry/Exit Barrier Arms & Campus Monument Sign ---
  const gatehouseGroup = new THREE.Group();
  gatehouseGroup.position.set(-8.6, 0.025, 80.2);

  const ghPlinth = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(4.4, 0.24, 5.2)),
    graniteCurbMat
  );
  ghPlinth.position.y = 0.12;
  const ghLower = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(3.6, 1.15, 4.2)),
    concreteMat
  );
  ghLower.position.y = 0.8;
  const ghGlass = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(3.52, 1.45, 4.12)),
    gateGlassMat
  );
  ghGlass.position.y = 2.08;
  const ghRoof = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(5.6, 0.32, 6.2)),
    darkSteelMat
  );
  ghRoof.position.set(0.55, 3.05, 0);
  const ghFascia = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(5.68, 0.14, 6.28)),
    ecoGreenTrimMat
  );
  ghFascia.position.set(0.55, 2.9, 0);
  const ghCanopyLight = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.2, 0.06, 3.2)),
    lampGlowMat
  );
  ghCanopyLight.position.set(2.1, 2.88, 0);
  // Corner mullions
  for (const mx of [-1.75, 1.75]) {
    for (const mz of [-2.05, 2.05]) {
      const m = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 2.7, 0.14)), darkSteelMat);
      m.position.set(mx, 1.55, mz);
      gatehouseGroup.add(m);
    }
  }
  gatehouseGroup.add(ghPlinth, ghLower, ghGlass, ghRoof, ghFascia, ghCanopyLight);
  parent.add(gatehouseGroup);

  // Central Median Island + Dual Entry/Exit Automated Boom Barrier Gates
  const medianIsland = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.3, 0.22, 6.4)),
    graniteCurbMat
  );
  medianIsland.position.set(0, 0.13, 80.2);
  parent.add(medianIsland);

  const buildBarrierGate = (x: number, z: number, armDirX: number, openAngleRad: number) => {
    const bg = new THREE.Group();
    bg.position.set(x, 0.24, z);
    const pedestal = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.42, 1.15, 0.42)),
      safetyYellowMat
    );
    pedestal.position.y = 0.58;
    const cap = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.46, 0.14, 0.46)),
      darkSteelMat
    );
    cap.position.y = 1.2;

    const armPivot = new THREE.Group();
    armPivot.position.set(0, 0.96, 0);
    armPivot.rotation.z = openAngleRad;
    // Striped red & white boom arm (4.4m span across lane)
    for (let s = 0; s < 8; s++) {
      const seg = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.55, 0.09, 0.07)),
        s % 2 === 0 ? barrierRedMat : barrierWhiteMat
      );
      seg.position.set(armDirX * (0.35 + s * 0.55), 0, 0);
      armPivot.add(seg);
    }
    bg.add(pedestal, cap, armPivot);
    parent.add(bg);
  };
  // Entry lane (+X): raised gently welcoming visitors; Exit lane (-X): lowered closed
  buildBarrierGate(0.28, 79.4, 1, 0.52);
  buildBarrierGate(-0.28, 81.2, -1, 0.0);

  // Orise Campus Architectural Entrance Monument Sign (East of arrival boulevard)
  const monGroup = new THREE.Group();
  monGroup.position.set(10.6, 0.0, 84.4);
  const monPlinth = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(6.8, 0.42, 1.8)),
    graniteCurbMat
  );
  monPlinth.position.y = 0.21;
  const monBody = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(6.0, 1.95, 0.62)),
    darkSteelMat
  );
  monBody.position.y = 1.38;
  const monPlateF = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(5.6, 1.75)),
    monumentSignMat
  );
  monPlateF.position.set(0, 1.38, 0.32);
  const monPlateB = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(5.6, 1.75)),
    monumentSignMat
  );
  monPlateB.rotation.y = Math.PI;
  monPlateB.position.set(0, 1.38, -0.32);
  const monCap = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(6.2, 0.14, 0.74)),
    ecoGreenTrimMat
  );
  monCap.position.y = 2.42;
  monGroup.add(monPlinth, monBody, monPlateF, monPlateB, monCap);
  parent.add(monGroup);

  // --- 6. Raised Landscaped Parking Islands, Manicured Hedgerows & Vibrant Flowerbeds ---
  const islandSpecs: Array<{ x: number; z: number; w: number; d: number }> = [
    // 8 Visitor Parking Endcap Islands
    { x: -43.5, z: 60.8, w: 3.4, d: 5.5 },
    { x: -43.5, z: 73.6, w: 3.4, d: 5.5 },
    { x: -14.2, z: 60.8, w: 3.2, d: 5.5 },
    { x: -14.2, z: 73.6, w: 3.2, d: 5.5 },
    { x: 14.2, z: 60.8, w: 3.2, d: 5.5 },
    { x: 14.2, z: 73.6, w: 3.2, d: 5.5 },
    { x: 43.5, z: 60.8, w: 3.4, d: 5.5 },
    { x: 43.5, z: 73.6, w: 3.4, d: 5.5 },
    // Front Landscaped Lawn Strips framing South Boulevard entrance
    { x: -30.5, z: 83.2, w: 38.0, d: 4.8 },
    { x: 31.5, z: 83.2, w: 36.0, d: 4.8 },
  ];

  for (const isl of islandSpecs) {
    const curb = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(isl.w, 0.22, isl.d)),
      graniteCurbMat
    );
    curb.position.set(isl.x, 0.11, isl.z);
    curb.receiveShadow = true;
    const turf = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(isl.w - 0.34, 0.08, isl.d - 0.34)),
      islandTurfMat
    );
    turf.position.set(isl.x, 0.24, isl.z);
    turf.receiveShadow = true;
    parent.add(curb, turf);
  }

  // Clipped Architectural Boxwood Hedgerows (InstancedMesh with lush dark-green material)
  const hedgeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x326a3c,
      roughness: 0.9,
      metalness: 0.0,
    })
  );
  const hedgeSpecs: Array<{ x: number; z: number; w: number; h: number; d: number }> = [
    // South Data Center Facade foundation planting beds
    { x: -19.5, z: 47.9, w: 18.0, h: 0.85, d: 1.0 },
    { x: 19.5, z: 47.9, w: 18.0, h: 0.85, d: 1.0 },
    // Parking wing South border hedges (shielding headlights from boulevard)
    { x: -29.0, z: 78.6, w: 28.0, h: 0.92, d: 1.05 },
    { x: 29.0, z: 78.6, w: 28.0, h: 0.92, d: 1.05 },
    // Monument sign & gatehouse backdrop hedges
    { x: 10.6, z: 82.7, w: 7.4, h: 0.85, d: 0.9 },
    { x: -10.8, z: 83.4, w: 4.4, h: 0.8, d: 0.85 },
    // West & East South-Wing parking perimeter hedges
    { x: -46.8, z: 67.2, w: 1.1, h: 0.9, d: 21.0 },
    { x: 46.8, z: 67.2, w: 1.1, h: 0.9, d: 21.0 },
    // North building foundation hedge accents
    { x: -18.0, z: -48.2, w: 20.0, h: 0.85, d: 1.1 },
    { x: 18.0, z: -48.2, w: 20.0, h: 0.85, d: 1.1 },
  ];
  for (const h of hedgeSpecs) {
    const soil = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(h.w + 0.3, 0.16, h.d + 0.3)),
      mulchSoilMat
    );
    soil.position.set(h.x, 0.08, h.z);
    const bush = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(h.w, h.h, h.d)),
      hedgeMat
    );
    bush.position.set(h.x, 0.16 + h.h / 2, h.z);
    parent.add(soil, bush);
  }

  // Ornamental Shrubs & Seasonal Flowerbed Clusters (InstancedMesh for crisp color bursts!)
  const flowerCoords: Array<{ x: number; y: number; z: number; s: number; color: number }> = [];
  const flowerPalette = [0xf59e0b, 0xf472b6, 0xa78bfa, 0xfb7185, 0xfef3c7, 0x4ade80];
  // Around Monument Sign & Entry Lawn
  for (let i = 0; i < 14; i++) {
    flowerCoords.push({
      x: 7.6 + i * 0.46,
      y: 0.24,
      z: 85.45 + (i % 2) * 0.24,
      s: 0.24 + (i % 3) * 0.05,
      color: flowerPalette[i % flowerPalette.length],
    });
  }
  // Along the 8 Parking Landscaped Islands
  for (const isl of islandSpecs.slice(0, 8)) {
    for (const dz of [-1.85, -1.0, 1.0, 1.85]) {
      for (const dx of [-0.75, 0.75]) {
        const idx = flowerCoords.length;
        flowerCoords.push({
          x: isl.x + dx,
          y: 0.34,
          z: isl.z + dz,
          s: 0.26 + (idx % 3) * 0.06,
          color: flowerPalette[idx % flowerPalette.length],
        });
      }
    }
  }
  // Flanking Reflecting Pools & Lobby Promenade
  for (const side of [-1, 1]) {
    for (let i = 0; i < 10; i++) {
      flowerCoords.push({
        x: side * (13.4 + i * 1.32),
        y: 0.22,
        z: 48.2 + (i % 2) * 0.25,
        s: 0.26 + (i % 3) * 0.06,
        color: flowerPalette[(i + (side > 0 ? 2 : 0)) % flowerPalette.length],
      });
    }
  }

  const shrubClusterGeo = trackGeo(new THREE.IcosahedronGeometry(1.0, 1));
  const shrubClusterMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0.0 })
  );
  const flowersInst = new THREE.InstancedMesh(
    shrubClusterGeo,
    shrubClusterMat,
    flowerCoords.length
  );
  _quat.identity();
  flowerCoords.forEach((f, i) => {
    _pos.set(f.x, f.y + f.s * 0.55, f.z);
    _scale.set(f.s * 1.2, f.s * 0.85, f.s * 1.2);
    _mat4.compose(_pos, _quat, _scale);
    flowersInst.setMatrixAt(i, _mat4);
    _color.setHex(f.color);
    flowersInst.setColorAt(i, _color);
  });
  flowersInst.instanceMatrix.needsUpdate = true;
  if (flowersInst.instanceColor) flowersInst.instanceColor.needsUpdate = true;
  flowersInst.computeBoundingSphere();
  parent.add(flowersInst);

  // --- 7. Composite Multi-Part Architectural Trees (Broadleaf, Cypress, Outer Courtyard Palms) ---
  const broadleafTrees = LANDSCAPE_TREE_PLACEMENTS.filter((t) => t.species === 'broadleaf');
  const cypressTrees = LANDSCAPE_TREE_PLACEMENTS.filter((t) => t.species === 'cypress');
  const palmTrees = LANDSCAPE_TREE_PLACEMENTS.filter((t) => t.species === 'palm');

  const barkMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x5c4433, roughness: 0.94, metalness: 0.0 })
  );
  const foliageInstMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84, metalness: 0.0 })
  );

  // 7a. Broadleaf Shade Trees: Tapered trunk + flared root collar + 3 overlapping sculpted foliage crowns
  if (broadleafTrees.length > 0) {
    const bTrunkGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.3, 2.7, 7));
    const bCollarGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.48, 0.45, 7));
    const bCrownGeo = trackGeo(new THREE.IcosahedronGeometry(1.75, 1));

    const bTrunks = new THREE.InstancedMesh(bTrunkGeo, barkMat, broadleafTrees.length);
    const bCollars = new THREE.InstancedMesh(bCollarGeo, barkMat, broadleafTrees.length);
    const bCrowns = new THREE.InstancedMesh(bCrownGeo, foliageInstMat, broadleafTrees.length * 3);
    bCrowns.castShadow = !isSoftwareGl;

    const crownOffsets: Array<[number, number, number, number]> = [
      [0, 3.85, 0, 1.05],
      [0.82, 3.25, 0.42, 0.78],
      [-0.78, 3.35, -0.45, 0.82],
    ];

    broadleafTrees.forEach((t, i) => {
      const s = t.scale;
      _quat.setFromAxisAngle(_yAxis, t.rotationY);
      _scale.set(s, s, s);

      _pos.set(t.x, 1.35 * s, t.z);
      _mat4.compose(_pos, _quat, _scale);
      bTrunks.setMatrixAt(i, _mat4);

      _pos.set(t.x, 0.22 * s, t.z);
      _mat4.compose(_pos, _quat, _scale);
      bCollars.setMatrixAt(i, _mat4);

      const cosR = Math.cos(t.rotationY);
      const sinR = Math.sin(t.rotationY);
      crownOffsets.forEach(([ox, oy, oz, cs], cIdx) => {
        const idx = i * 3 + cIdx;
        const rx = ox * cosR - oz * sinR;
        const rz = ox * sinR + oz * cosR;
        _pos.set(t.x + rx * s, oy * s, t.z + rz * s);
        _scale.set(s * cs * 1.12, s * cs * 0.88, s * cs * 1.08);
        _mat4.compose(_pos, _quat, _scale);
        bCrowns.setMatrixAt(idx, _mat4);

        _color.setHex(t.tintHex);
        if (cIdx === 1) _color.offsetHSL(0.015, 0.02, 0.04);
        if (cIdx === 2) _color.offsetHSL(-0.012, 0, -0.04);
        bCrowns.setColorAt(idx, _color);
      });
    });
    bTrunks.instanceMatrix.needsUpdate = true;
    bCollars.instanceMatrix.needsUpdate = true;
    bCrowns.instanceMatrix.needsUpdate = true;
    if (bCrowns.instanceColor) bCrowns.instanceColor.needsUpdate = true;
    bTrunks.computeBoundingSphere();
    bCollars.computeBoundingSphere();
    bCrowns.computeBoundingSphere();
    parent.add(bTrunks, bCollars, bCrowns);
  }

  // 7b. Sculpted Columnar Cypress / Evergreen Trees: Trunk + 3 stacked tiered foliage cones
  if (cypressTrees.length > 0) {
    const cTrunkGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.22, 1.6, 6));
    const cTierGeo = trackGeo(new THREE.ConeGeometry(1.15, 2.8, 8));

    const cTrunks = new THREE.InstancedMesh(cTrunkGeo, barkMat, cypressTrees.length);
    const cTiers = new THREE.InstancedMesh(cTierGeo, foliageInstMat, cypressTrees.length * 3);
    cTiers.castShadow = !isSoftwareGl;

    const tierConfigs: Array<[number, number, number]> = [
      [2.1, 1.05, 1.0],
      [3.55, 0.82, 0.92],
      [4.85, 0.56, 0.82],
    ];

    cypressTrees.forEach((t, i) => {
      const s = t.scale;
      _quat.setFromAxisAngle(_yAxis, t.rotationY);
      _scale.set(s, s, s);
      _pos.set(t.x, 0.8 * s, t.z);
      _mat4.compose(_pos, _quat, _scale);
      cTrunks.setMatrixAt(i, _mat4);

      tierConfigs.forEach(([ty, sxz, sy], tIdx) => {
        const idx = i * 3 + tIdx;
        _pos.set(t.x, ty * s, t.z);
        _scale.set(s * sxz, s * sy, s * sxz);
        _mat4.compose(_pos, _quat, _scale);
        cTiers.setMatrixAt(idx, _mat4);
        _color.setHex(t.tintHex);
        _color.offsetHSL(0, 0, tIdx * 0.025);
        cTiers.setColorAt(idx, _color);
      });
    });
    cTrunks.instanceMatrix.needsUpdate = true;
    cTiers.instanceMatrix.needsUpdate = true;
    if (cTiers.instanceColor) cTiers.instanceColor.needsUpdate = true;
    cTrunks.computeBoundingSphere();
    cTiers.computeBoundingSphere();
    parent.add(cTrunks, cTiers);
  }

  // 7c. Tropical Courtyard Feature Palms (skipped when 3D trees are removed)
  if (palmTrees.length > 0) {
    const palmRingGeo = trackGeo(new THREE.CylinderGeometry(0.16, 0.24, 4.6, 8));
    const palmCrownShaftGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.16, 0.75, 8));
    const palmFrondGeo = trackGeo(new THREE.BoxGeometry(0.36, 0.07, 2.35));
    const palmCrownMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x4b7f48, roughness: 0.75, metalness: 0.0 })
    );

    for (const pt of palmTrees) {
      const palmGroup = new THREE.Group();
      palmGroup.position.set(pt.x, 0.08, pt.z);
      palmGroup.rotation.y = pt.rotationY;
      palmGroup.scale.setScalar(pt.scale);

      // Architectural square planter box around each courtyard palm
      const planter = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(1.5, 0.45, 1.5)),
        graniteCurbMat
      );
      planter.position.y = 0.22;
      const soil = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(1.26, 0.1, 1.26)),
        mulchSoilMat
      );
      soil.position.y = 0.44;
      const trunk = new THREE.Mesh(palmRingGeo, barkMat);
      trunk.position.y = 2.6;
      const shaft = new THREE.Mesh(palmCrownShaftGeo, palmCrownMat);
      shaft.position.y = 5.15;

      const frondMat = trackMat(
        new THREE.MeshStandardMaterial({ color: pt.tintHex, roughness: 0.8, metalness: 0.0 })
      );
      // 7 radially arranged arching palm fronds
      for (let f = 0; f < 7; f++) {
        const angle = (f / 7) * Math.PI * 2;
        const frondPivot = new THREE.Group();
        frondPivot.position.y = 5.45;
        frondPivot.rotation.y = angle;
        const innerBlade = new THREE.Mesh(palmFrondGeo, frondMat);
        innerBlade.position.set(0, 0.12, 1.15);
        innerBlade.rotation.x = -0.18;
        const outerTip = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(0.24, 0.05, 1.15)),
          frondMat
        );
        outerTip.position.set(0, -0.25, 2.65);
        outerTip.rotation.x = 0.52;
        frondPivot.add(innerBlade, outerTip);
        palmGroup.add(frondPivot);
      }

      palmGroup.add(planter, soil, trunk, shaft);
      parent.add(palmGroup);
    }
  }

  // --- 8. Architectural Campus LED Street Lamps (12 Poles along Parking & Arrival Drive) ---
  const lampLocations: Array<{ x: number; z: number; rotY: number }> = [
    { x: -14.2, z: 58.6, rotY: 0 },
    { x: -14.2, z: 75.8, rotY: Math.PI },
    { x: -43.5, z: 58.6, rotY: 0 },
    { x: -43.5, z: 75.8, rotY: Math.PI },
    { x: 14.2, z: 58.6, rotY: 0 },
    { x: 14.2, z: 75.8, rotY: Math.PI },
    { x: 43.5, z: 58.6, rotY: 0 },
    { x: 43.5, z: 75.8, rotY: Math.PI },
    { x: -7.4, z: 67.2, rotY: Math.PI / 2 },
    { x: 7.4, z: 67.2, rotY: -Math.PI / 2 },
    { x: -7.4, z: 86.2, rotY: Math.PI / 2 },
    { x: 7.4, z: 86.2, rotY: -Math.PI / 2 },
  ];

  const poleGeo = trackGeo(new THREE.CylinderGeometry(0.08, 0.12, 5.4, 8));
  const armGeo = trackGeo(new THREE.BoxGeometry(0.12, 0.1, 1.25));
  const headGeo = trackGeo(new THREE.BoxGeometry(0.34, 0.12, 0.65));
  const lensGeo = trackGeo(new THREE.BoxGeometry(0.26, 0.04, 0.52));

  for (const lp of lampLocations) {
    const lamp = new THREE.Group();
    lamp.position.set(lp.x, 0.025, lp.z);
    lamp.rotation.y = lp.rotY;

    const base = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.18, 0.22, 0.45, 8)),
      graniteCurbMat
    );
    base.position.y = 0.22;
    const pole = new THREE.Mesh(poleGeo, darkSteelMat);
    pole.position.y = 2.9;
    const arm = new THREE.Mesh(armGeo, darkSteelMat);
    arm.position.set(0, 5.55, 0.55);
    const head = new THREE.Mesh(headGeo, darkSteelMat);
    head.position.set(0, 5.56, 1.15);
    const lens = new THREE.Mesh(lensGeo, lampGlowMat);
    lens.position.set(0, 5.48, 1.15);

    lamp.add(base, pole, arm, head, lens);
    parent.add(lamp);
  }

  // --- 9. Theme Synchronization (Light Day Mode vs Dark Evening Mode) ---
  const applyTheme = (darkMode: boolean) => {
    parkingAsphaltMat.color.setHex(darkMode ? 0x1c232d : 0x454d58);
    boulevardAsphaltMat.color.setHex(darkMode ? 0x171d26 : 0x3b424c);
    paverPlazaMat.color.setHex(darkMode ? 0x8f9aa8 : 0xffffff);
    graniteCurbMat.color.setHex(darkMode ? 0x4b5563 : 0xcbd5e1);
    islandTurfMat.color.setHex(darkMode ? 0x264431 : 0x6ea36a);
    hedgeMat.color.setHex(darkMode ? 0x1f4528 : 0x326a3c);
    reflectingWaterMat.color.setHex(darkMode ? 0x083b4c : 0x0e6b85);
    lampGlowMat.emissiveIntensity = darkMode ? 2.2 : 0.7;
  };

  return { applyTheme };
}

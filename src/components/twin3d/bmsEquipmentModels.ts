import * as THREE from 'three';
import { BmsEquipmentModelKind } from '../../engine/bms3dSpecs';

export type EquipmentPartGroup = 'enclosure' | 'core' | 'piping_bus' | 'controls';

interface ExplodablePart {
  object: THREE.Object3D;
  basePos: THREE.Vector3;
  explodeOffset: THREE.Vector3;
  partGroup: EquipmentPartGroup;
}

export interface DetailedBmsModelHandle {
  root: THREE.Group;
  recommendedCamera: { pos: [number, number, number]; target: [number, number, number] };
  setExplode: (t01: number) => void;
  setStatusColor: (hex: number) => void;
  stepFans: (angleDelta: number) => void;
  dispose: () => void;
}

function createHmiCanvasTexture(title: string, subtitle: string, accentHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 256, 160);
    ctx.fillStyle = accentHex;
    ctx.fillRect(0, 0, 256, 10);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(title.slice(0, 18), 14, 40);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px monospace';
    ctx.fillText(subtitle.slice(0, 26), 14, 62);

    // Schematic waveform / bar graph on HMI
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let x = 14; x <= 240; x += 14) {
      const y = 112 + Math.sin(x * 0.08) * 16 + ((x % 28) === 0 ? -6 : 4);
      if (x === 14) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Status bars at bottom
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i < 3 ? accentHex : '#334155';
      ctx.fillRect(14 + i * 58, 138, 48, 10);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds a high-detail, multi-part procedural 3D model for any BMS Electrical or Mechanical equipment class.
 * Grounded at y = 0, centered at (0, 0, 0), with smooth exploded-view internal inspection support.
 */
export function buildDetailedBmsEquipmentModel(
  kind: BmsEquipmentModelKind,
  label: string,
  isPathB: boolean,
  initialStatusHex: number
): DetailedBmsModelHandle {
  const root = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const explodables: ExplodablePart[] = [];
  const fans: THREE.Object3D[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    mats.push(m);
    return m;
  };
  const registerPart = (
    object: THREE.Object3D,
    explodeOffset: [number, number, number],
    partGroup: EquipmentPartGroup
  ) => {
    explodables.push({
      object,
      basePos: object.position.clone(),
      explodeOffset: new THREE.Vector3(...explodeOffset),
      partGroup,
    });
  };

  // Curated industrial PBR materials with clear roughness/metalness contrast
  const cabinetWhite = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xeef2f6, roughness: 0.48, metalness: 0.16 })
  );
  const cabinetSlate = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.42, metalness: 0.58 })
  );
  const darkSteel = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e252e, roughness: 0.36, metalness: 0.72 })
  );
  const brushedSteel = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xa3b1c2, roughness: 0.24, metalness: 0.84 })
  );
  const copperMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xc26d38, roughness: 0.22, metalness: 0.9 })
  );
  const chwBlueMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.32, metalness: 0.45 })
  );
  const cwTealMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x0d9488, roughness: 0.34, metalness: 0.42 })
  );
  const hotRedMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.36, metalness: 0.42 })
  );
  const safetyYellowMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.42, metalness: 0.2 })
  );
  const pathAccentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isPathB ? 0xd97706 : 0x009530,
      roughness: 0.35,
      metalness: 0.4,
    })
  );
  const coilFinMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.3, metalness: 0.78 })
  );
  const louverDarkMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7, metalness: 0.25 })
  );
  const beaconMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: initialStatusHex,
      emissive: initialStatusHex,
      emissiveIntensity: 1.25,
      roughness: 0.2,
      metalness: 0.1,
    })
  );

  const hmiTex = createHmiCanvasTexture(
    label,
    isPathB ? 'PATH B · TIER IV 2N' : 'PATH A · TIER IV 2N',
    isPathB ? '#f59e0b' : '#3dcd58'
  );
  textures.push(hmiTex);
  const hmiMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: hmiTex,
      emissive: 0xffffff,
      emissiveMap: hmiTex,
      emissiveIntensity: 0.55,
      roughness: 0.2,
      metalness: 0.1,
    })
  );

  // Reusable multi-blade axial fan rotor helper
  const buildFanRotor = (radius: number, blades = 5): THREE.Group => {
    const rotor = new THREE.Group();
    const hub = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(radius * 0.22, radius * 0.24, 0.12, 12)),
      darkSteel
    );
    rotor.add(hub);
    const bladeGeo = trackGeo(new THREE.BoxGeometry(radius * 0.78, 0.04, radius * 0.22));
    for (let i = 0; i < blades; i++) {
      const a = (i / blades) * Math.PI * 2;
      const b = new THREE.Mesh(bladeGeo, brushedSteel);
      b.position.set(Math.cos(a) * radius * 0.48, 0, Math.sin(a) * radius * 0.48);
      b.rotation.y = -a;
      b.rotation.x = 0.28;
      rotor.add(b);
    }
    fans.push(rotor);
    return rotor;
  };

  // Reusable butterfly isolation valve with handwheel
  const buildValve = (colorMat: THREE.Material): THREE.Group => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.16, 0.16, 0.2, 12)), colorMat);
    const stem = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.03, 0.03, 0.24, 8)), brushedSteel);
    stem.position.set(0, 0, 0.16);
    stem.rotation.x = Math.PI / 2;
    const wheel = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.12, 0.022, 8, 16)), hotRedMat);
    wheel.position.set(0, 0, 0.28);
    g.add(body, stem, wheel);
    return g;
  };

  let recommendedCamera: { pos: [number, number, number]; target: [number, number, number] } = {
    pos: [7.8, 5.2, 8.2],
    target: [0, 1.8, 0],
  };

  if (kind === 'water-chiller') {
    recommendedCamera = { pos: [9.2, 5.8, 9.6], target: [0, 2.0, 0] };

    // Structural steel skid base
    const skid = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.6, 0.28, 4.4)), darkSteel);
    skid.position.set(0, 0.14, 0);
    root.add(skid);

    // Core Heat Exchangers: Flooded Shell-and-Tube Evaporator (CHW Blue) + Condenser Barrel (CW Teal)
    const coreGroup = new THREE.Group();
    const barrelGeo = trackGeo(new THREE.CylinderGeometry(0.62, 0.62, 4.4, 20));
    const endCapGeo = trackGeo(new THREE.CylinderGeometry(0.7, 0.7, 0.18, 20));
    const saddleGeo = trackGeo(new THREE.BoxGeometry(0.28, 0.72, 1.1));

    const evap = new THREE.Mesh(barrelGeo, chwBlueMat);
    evap.rotation.z = Math.PI / 2;
    evap.position.set(-0.5, 1.05, 0.85);
    const cond = new THREE.Mesh(barrelGeo, cwTealMat);
    cond.rotation.z = Math.PI / 2;
    cond.position.set(-0.5, 1.05, -0.75);
    coreGroup.add(evap, cond);

    for (const bx of [-2.75, 1.75]) {
      for (const bz of [0.85, -0.75]) {
        const cap = new THREE.Mesh(endCapGeo, darkSteel);
        cap.rotation.z = Math.PI / 2;
        cap.position.set(bx, 1.05, bz);
        coreGroup.add(cap);
      }
    }
    for (const sx of [-1.8, 0.8]) {
      for (const bz of [0.85, -0.75]) {
        const saddle = new THREE.Mesh(saddleGeo, darkSteel);
        saddle.position.set(sx, 0.56, bz);
        coreGroup.add(saddle);
      }
    }

    // Twin Magnetic-Bearing Centrifugal Compressors mounted atop barrels
    for (const cx of [-1.4, 0.45]) {
      const compBody = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.42, 0.46, 1.15, 16)),
        brushedSteel
      );
      compBody.rotation.z = Math.PI / 2;
      compBody.position.set(cx, 2.08, 0.05);
      const volute = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.55, 0.55, 0.38, 16)),
        cabinetSlate
      );
      volute.rotation.z = Math.PI / 2;
      volute.position.set(cx + 0.58, 2.08, 0.05);
      const suctionPipe = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.16, 0.16, 0.72, 12)),
        brushedSteel
      );
      suctionPipe.position.set(cx, 1.56, 0.52);
      suctionPipe.rotation.x = 0.55;
      const dischargePipe = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.15, 0.15, 0.72, 12)),
        copperMat
      );
      dischargePipe.position.set(cx + 0.55, 1.56, -0.45);
      dischargePipe.rotation.x = -0.55;
      coreGroup.add(compBody, volute, suctionPipe, dischargePipe);
    }
    root.add(coreGroup);
    registerPart(coreGroup, [0, 0.55, 0], 'core');

    // Coupled Cooling Tower Stack Module at rear-top (lifts upward in exploded view)
    const towerGroup = new THREE.Group();
    const towerDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.0, 1.35, 2.4)), cabinetWhite);
    towerDeck.position.set(-0.5, 3.35, -0.15);
    const towerBand = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.06, 0.18, 2.46)), pathAccentMat);
    towerBand.position.set(-0.5, 3.96, -0.15);
    const louverF = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.4, 0.72, 0.08)), louverDarkMat);
    louverF.position.set(-0.5, 3.25, 1.07);
    const louverB = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.4, 0.72, 0.08)), louverDarkMat);
    louverB.position.set(-0.5, 3.25, -1.37);
    towerGroup.add(towerDeck, towerBand, louverF, louverB);

    // Twin induced-draft cooling tower fan cowls + spinning impellers
    for (const sx of [-1.7, 0.7]) {
      const cowl = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.72, 0.88, 0.65, 18, 1, true)),
        brushedSteel
      );
      cowl.material = brushedSteel.clone();
      (cowl.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      mats.push(cowl.material);
      cowl.position.set(sx, 4.35, -0.15);
      const rotor = buildFanRotor(0.68, 6);
      rotor.position.set(sx, 4.22, -0.15);
      towerGroup.add(cowl, rotor);
    }
    root.add(towerGroup);
    registerPart(towerGroup, [0, 1.65, -0.4], 'enclosure');

    // VFD Starter & Chiller Plant Control Cabinet (right end)
    const vfdGroup = new THREE.Group();
    const vfdCab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.5, 2.7, 2.6)), cabinetWhite);
    vfdCab.position.set(2.9, 1.62, 0);
    const vfdTrim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.54, 0.14, 2.64)), pathAccentMat);
    vfdTrim.position.set(2.9, 2.98, 0);
    const hmiScreen = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.86, 0.54)), hmiMat);
    hmiScreen.position.set(2.9, 2.1, 1.32);
    const breakerHandle = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.42, 0.12)), hotRedMat);
    breakerHandle.position.set(3.38, 1.3, 1.32);
    const beacon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.3, 0.14, 0.12)), beaconMat);
    beacon.position.set(2.9, 2.75, 1.32);
    vfdGroup.add(vfdCab, vfdTrim, hmiScreen, breakerHandle, beacon);
    root.add(vfdGroup);
    registerPart(vfdGroup, [1.15, 0, 0.25], 'controls');

    // Primary CHW & CW Headers + Motorized Butterfly Valves (left end)
    const pipeGroup = new THREE.Group();
    const headerDefs: Array<{ z: number; mat: THREE.Material }> = [
      { z: 1.05, mat: chwBlueMat },
      { z: 0.45, mat: hotRedMat },
      { z: -0.45, mat: cwTealMat },
      { z: -1.05, mat: brushedSteel },
    ];
    for (const hd of headerDefs) {
      const pipe = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.11, 1.25, 10)), hd.mat);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(-3.3, 1.15, hd.z);
      const riser = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.11, 1.7, 10)), hd.mat);
      riser.position.set(-3.88, 1.95, hd.z);
      const valve = buildValve(hd.mat);
      valve.position.set(-3.45, 1.15, hd.z);
      pipeGroup.add(pipe, riser, valve);
    }
    root.add(pipeGroup);
    registerPart(pipeGroup, [-1.2, 0, 0], 'piping_bus');
  } else if (kind === 'air-chiller') {
    recommendedCamera = { pos: [8.8, 5.4, 9.0], target: [0, 1.65, 0] };

    // Galvanized Steel Base Frame
    const frame = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.8, 0.3, 3.6)), darkSteel);
    frame.position.set(0, 0.15, 0);
    root.add(frame);

    // Core: Twin Inverter Screw Compressors + Insulated Evaporator Barrel
    const coreGroup = new THREE.Group();
    const evap = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.45, 0.45, 4.6, 16)),
      chwBlueMat
    );
    evap.rotation.z = Math.PI / 2;
    evap.position.set(-0.3, 0.85, 0);
    coreGroup.add(evap);

    for (const sx of [-1.7, 0.9]) {
      const screw = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.32, 0.36, 1.4, 14)),
        cabinetSlate
      );
      screw.rotation.z = Math.PI / 2;
      screw.position.set(sx, 0.92, 0.88);
      const motorFin = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.38, 0.38, 0.5, 14)),
        brushedSteel
      );
      motorFin.rotation.z = Math.PI / 2;
      motorFin.position.set(sx - 0.55, 0.92, 0.88);
      const oilSep = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 1.1, 12)),
        copperMat
      );
      oilSep.position.set(sx, 1.05, -0.82);
      coreGroup.add(screw, motorFin, oilSep);
    }
    root.add(coreGroup);
    registerPart(coreGroup, [0, 0.35, 0], 'core');

    // Angled Micro-Channel V-Bank Condenser Coils + 6 Top Axial EC Fans
    const coilGroup = new THREE.Group();
    const vCoilGeo = trackGeo(new THREE.BoxGeometry(5.9, 1.7, 0.14));
    const coilFront = new THREE.Mesh(vCoilGeo, coilFinMat);
    coilFront.position.set(-0.35, 2.05, 1.1);
    coilFront.rotation.x = 0.42;
    const coilRear = new THREE.Mesh(vCoilGeo, coilFinMat);
    coilRear.position.set(-0.35, 2.05, -1.1);
    coilRear.rotation.x = -0.42;

    // Top fan deck & 6 axial EC condenser fan cowls + impellers
    const fanDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.1, 0.22, 3.2)), cabinetWhite);
    fanDeck.position.set(-0.35, 2.86, 0);
    const accentRail = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.14, 0.14, 3.24)), pathAccentMat);
    accentRail.position.set(-0.35, 3.0, 0);
    coilGroup.add(coilFront, coilRear, fanDeck, accentRail);

    for (const fx of [-2.35, -0.35, 1.65]) {
      for (const fz of [-0.78, 0.78]) {
        const shroud = new THREE.Mesh(
          trackGeo(new THREE.CylinderGeometry(0.54, 0.62, 0.44, 16, 1, true)),
          darkSteel
        );
        shroud.material = darkSteel.clone();
        (shroud.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
        mats.push(shroud.material);
        shroud.position.set(fx, 3.22, fz);
        const rotor = buildFanRotor(0.5, 5);
        rotor.position.set(fx, 3.16, fz);
        coilGroup.add(shroud, rotor);
      }
    }
    root.add(coilGroup);
    registerPart(coilGroup, [0, 1.45, 0], 'enclosure');

    // IP55 Outdoor Control Panel & MCC (right end)
    const mccGroup = new THREE.Group();
    const mcc = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.35, 2.55, 3.2)), cabinetWhite);
    mcc.position.set(3.22, 1.58, 0);
    const hmi = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.75, 0.46)), hmiMat);
    hmi.position.set(3.91, 1.95, 0.55);
    hmi.rotation.y = Math.PI / 2;
    const beacon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.1, 0.16, 2.8)), beaconMat);
    beacon.position.set(3.92, 2.66, 0);
    const disconnect = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.1, 0.36, 0.14)), safetyYellowMat);
    disconnect.position.set(3.92, 1.4, -0.65);
    mccGroup.add(mcc, hmi, beacon, disconnect);
    root.add(mccGroup);
    registerPart(mccGroup, [1.05, 0, 0], 'controls');

    // CHW Supply / Return Manifold & Isolation Valves (left end)
    const pipeGroup = new THREE.Group();
    for (const [pz, mat] of [
      [0.55, chwBlueMat],
      [-0.55, hotRedMat],
    ] as const) {
      const stub = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.12, 0.12, 1.0, 10)), mat);
      stub.rotation.z = Math.PI / 2;
      stub.position.set(-3.75, 0.95, pz);
      const valve = buildValve(mat);
      valve.position.set(-4.05, 0.95, pz);
      pipeGroup.add(stub, valve);
    }
    root.add(pipeGroup);
    registerPart(pipeGroup, [-1.0, 0, 0], 'piping_bus');
  } else if (kind === 'crac') {
    recommendedCamera = { pos: [8.8, 5.2, 9.2], target: [0, 1.9, 0] };

    // Raised floor plinth base
    const base = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.6, 0.24, 2.2)), darkSteel);
    base.position.set(0, 0.12, 0);
    root.add(base);

    // Core: Slanted 4-Row CHW Cooling Coil + 3 Underfloor EC Plug Fans
    const coreGroup = new THREE.Group();
    const coilBank = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.1, 1.55, 0.24)), coilFinMat);
    coilBank.position.set(-0.4, 2.15, 0.05);
    coilBank.rotation.x = 0.45;
    const drainPan = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.2, 0.12, 1.45)), brushedSteel);
    drainPan.position.set(-0.4, 1.32, 0);
    coreGroup.add(coilBank, drainPan);

    for (const fx of [-1.75, -0.4, 0.95]) {
      const fanHousing = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.46, 0.5, 0.48, 16, 1, true)),
        cabinetSlate
      );
      fanHousing.material = cabinetSlate.clone();
      (fanHousing.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      mats.push(fanHousing.material);
      fanHousing.position.set(fx, 0.68, 0);
      const rotor = buildFanRotor(0.42, 6);
      rotor.position.set(fx, 0.68, 0);
      coreGroup.add(fanHousing, rotor);
    }
    root.add(coreGroup);
    registerPart(coreGroup, [0, 0.2, 0], 'core');

    // Outer Insulated Enclosure Doors + Top Acoustic Return Plenum
    const encGroup = new THREE.Group();
    const rearPanel = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.4, 2.9, 0.14)), cabinetWhite);
    rearPanel.position.set(-0.4, 1.69, -0.92);
    const frontLeftDoor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.1, 2.86, 0.12)), cabinetWhite);
    frontLeftDoor.position.set(-1.5, 1.69, 0.92);
    const frontRightDoor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.1, 2.86, 0.12)), cabinetWhite);
    frontRightDoor.position.set(0.7, 1.69, 0.92);
    const frontGrille = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.8, 0.88, 0.06)), louverDarkMat);
    frontGrille.position.set(-0.4, 0.82, 0.99);
    const hood = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.5, 0.65, 1.95)), darkSteel);
    hood.position.set(-0.4, 3.46, 0);
    const hoodIntake = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.0, 0.42, 0.08)), louverDarkMat);
    hoodIntake.position.set(-0.4, 3.46, 0.99);
    encGroup.add(rearPanel, frontLeftDoor, frontRightDoor, frontGrille, hood, hoodIntake);
    root.add(encGroup);
    registerPart(encGroup, [0, 0.9, 0.85], 'enclosure');

    // Side Electrical Control Section + HMI + Live Status Bar
    const ctrlGroup = new THREE.Group();
    const ctrlCab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.05, 2.95, 1.95)), cabinetSlate);
    ctrlCab.position.set(2.28, 1.72, 0);
    const pathStripe = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.08, 0.14, 1.98)), pathAccentMat);
    pathStripe.position.set(2.28, 3.24, 0);
    const hmi = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.68, 0.44)), hmiMat);
    hmi.position.set(2.28, 2.15, 0.99);
    const beacon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.84, 0.14, 0.1)), beaconMat);
    beacon.position.set(2.28, 2.85, 0.99);
    ctrlGroup.add(ctrlCab, pathStripe, hmi, beacon);
    root.add(ctrlGroup);
    registerPart(ctrlGroup, [0.95, 0, 0.25], 'controls');

    // Hydronic CHW Supply/Return Risers + 3-Way Modulating Control Valve (left side)
    const pipeGroup = new THREE.Group();
    const supplyRiser = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.1, 0.1, 3.4, 10)),
      chwBlueMat
    );
    supplyRiser.position.set(-2.95, 1.95, 0.35);
    const returnRiser = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.1, 0.1, 3.4, 10)),
      hotRedMat
    );
    returnRiser.position.set(-2.95, 1.95, -0.35);
    const valve = buildValve(chwBlueMat);
    valve.position.set(-2.95, 1.35, 0.35);
    const actuator = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 0.28, 0.24)), safetyYellowMat);
    actuator.position.set(-2.95, 1.35, 0.0);
    pipeGroup.add(supplyRiser, returnRiser, valve, actuator);
    root.add(pipeGroup);
    registerPart(pipeGroup, [-0.95, 0, 0], 'piping_bus');
  } else if (kind === 'ups') {
    recommendedCamera = { pos: [9.8, 5.5, 10.2], target: [0, 2.0, 0] };

    // Raised Floor Seismic Base
    const base = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.8, 0.22, 2.6)), darkSteel);
    base.position.set(0, 0.11, 0);
    root.add(base);

    // Core Power Electronics: 4 Hot-Swap IGBT Rectifier/Inverter Drawers + LiFePO4 Battery Trays
    const coreGroup = new THREE.Group();
    for (let row = 0; row < 4; row++) {
      const y = 0.65 + row * 0.62;
      const igbtBay = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.6, 0.46, 1.85)), cabinetSlate);
      igbtBay.position.set(-1.6, y, 0);
      const heatsink = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.4, 0.36, 0.12)), copperMat);
      heatsink.position.set(-1.6, y, 0.94);
      const led = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.08, 0.08)), beaconMat);
      led.position.set(-0.55, y + 0.12, 0.99);
      coreGroup.add(igbtBay, heatsink, led);

      // Matching LiFePO4 battery string trays on right cabinet
      const battTray = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.2, 0.44, 1.8)), darkSteel);
      battTray.position.set(2.35, y, 0);
      const cellBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.9, 0.12, 0.08)), pathAccentMat);
      cellBar.position.set(2.35, y, 0.92);
      coreGroup.add(battTray, cellBar);
    }
    root.add(coreGroup);
    registerPart(coreGroup, [0, 0.25, 0], 'core');

    // Outer Cabinets + Static Transfer Switch (STS) Middle Bypass Bay
    const encGroup = new THREE.Group();
    const powerShell = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.0, 3.05, 2.2)), darkSteel);
    powerShell.position.set(-1.6, 1.75, -0.08);
    const stsCab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.15, 3.05, 2.2)), cabinetSlate);
    stsCab.position.set(0.52, 1.75, 0);
    const battShell = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.6, 2.95, 2.2)), cabinetWhite);
    battShell.position.set(2.45, 1.7, -0.08);
    const topCap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.2, 0.18, 2.3)), pathAccentMat);
    topCap.position.set(0.35, 3.34, 0);
    encGroup.add(powerShell, stsCab, battShell, topCap);
    root.add(encGroup);
    registerPart(encGroup, [0, 0.9, -1.15], 'enclosure');

    // Front HMI Mimic Panel, Bypass Rotary Switch & Guarded EPO Button
    const ctrlGroup = new THREE.Group();
    const hmi = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.92, 0.56)), hmiMat);
    hmi.position.set(0.52, 2.35, 1.12);
    const beacon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.8, 0.14, 0.08)), beaconMat);
    beacon.position.set(-1.6, 3.08, 1.12);
    const epoBox = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.28, 0.28, 0.12)), safetyYellowMat);
    epoBox.position.set(0.52, 1.55, 1.12);
    const epoBtn = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 12)), hotRedMat);
    epoBtn.rotation.x = Math.PI / 2;
    epoBtn.position.set(0.52, 1.55, 1.2);
    ctrlGroup.add(hmi, beacon, epoBox, epoBtn);
    root.add(ctrlGroup);
    registerPart(ctrlGroup, [0, 0, 1.05], 'controls');

    // Overhead Laminated Copper Busway Risers & Top Bus Duct
    const busGroup = new THREE.Group();
    for (const bx of [-2.2, -1.0, 0.52]) {
      const riser = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 1.1, 0.24)), copperMat);
      riser.position.set(bx, 3.88, -0.35);
      busGroup.add(riser);
    }
    const overheadBus = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.6, 0.26, 0.42)), pathAccentMat);
    overheadBus.position.set(0.2, 4.45, -0.35);
    const copperRail = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.62, 0.08, 0.46)), copperMat);
    copperRail.position.set(0.2, 4.3, -0.35);
    busGroup.add(overheadBus, copperRail);
    root.add(busGroup);
    registerPart(busGroup, [0, 0.9, 0], 'piping_bus');
  } else if (kind === 'generator') {
    recommendedCamera = { pos: [10.8, 6.0, 11.2], target: [0, 2.2, 0] };

    // Double-Walled 96h Bunded Sub-Base Belly Diesel Fuel Tank
    const fuelGroup = new THREE.Group();
    const bellyTank = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.2, 0.85, 3.1)), darkSteel);
    bellyTank.position.set(0, 0.42, 0);
    const tankStripe = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.24, 0.12, 3.14)), safetyYellowMat);
    tankStripe.position.set(0, 0.82, 0);
    const fillNeck = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 0.35, 10)), brushedSteel);
    fillNeck.position.set(-3.4, 0.95, 1.2);
    fuelGroup.add(bellyTank, tankStripe, fillNeck);
    root.add(fuelGroup);
    registerPart(fuelGroup, [0, -0.45, 0], 'piping_bus');

    // Internal Core: V16 Twin-Turbo Diesel Engine Block + Brushless Alternator + Front Radiator Fan
    const coreGroup = new THREE.Group();
    const engineBlock = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.4, 1.35, 1.65)), cabinetSlate);
    engineBlock.position.set(0.4, 1.65, 0);
    // V16 angled cylinder banks + twin turbochargers
    const bankGeo = trackGeo(new THREE.BoxGeometry(3.1, 0.55, 0.65));
    const bankL = new THREE.Mesh(bankGeo, darkSteel);
    bankL.position.set(0.4, 2.35, 0.58);
    bankL.rotation.x = 0.45;
    const bankR = new THREE.Mesh(bankGeo, darkSteel);
    bankR.position.set(0.4, 2.35, -0.58);
    bankR.rotation.x = -0.45;
    const turbo1 = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.28, 0.28, 0.6, 12)), copperMat);
    turbo1.rotation.z = Math.PI / 2;
    turbo1.position.set(-0.9, 2.65, 0.42);
    const turbo2 = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.28, 0.28, 0.6, 12)), copperMat);
    turbo2.rotation.z = Math.PI / 2;
    turbo2.position.set(-0.9, 2.65, -0.42);
    // Brushless 4-Pole Alternator drum
    const alternator = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.76, 0.76, 1.65, 18)),
      pathAccentMat
    );
    alternator.rotation.z = Math.PI / 2;
    alternator.position.set(-2.1, 1.68, 0);
    // Front Radiator Core & Spinning Fan
    const radiator = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 1.95, 2.2)), coilFinMat);
    radiator.position.set(3.2, 1.9, 0);
    const radFan = buildFanRotor(0.75, 6);
    radFan.rotation.z = Math.PI / 2;
    radFan.position.set(2.85, 1.9, 0);
    coreGroup.add(engineBlock, bankL, bankR, turbo1, turbo2, alternator, radiator, radFan);
    root.add(coreGroup);
    registerPart(coreGroup, [0, 0.35, 0], 'core');

    // Weatherproof Acoustic ISO Canopy Enclosure (lifts up in exploded view to reveal V16 + Alternator!)
    const canopyGroup = new THREE.Group();
    const canopyShell = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.7, 2.55, 2.85)), cabinetWhite);
    canopyShell.position.set(0, 2.15, 0);
    const frontGrille = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.12, 1.85, 2.25)), louverDarkMat);
    frontGrille.position.set(3.88, 2.15, 0);
    const sideLouvers = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.6, 1.15, 2.9)), louverDarkMat);
    sideLouvers.position.set(0.3, 2.15, 0);
    const canopyTrim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.74, 0.16, 2.88)), pathAccentMat);
    canopyTrim.position.set(0, 3.45, 0);
    canopyGroup.add(canopyShell, frontGrille, sideLouvers, canopyTrim);
    root.add(canopyGroup);
    registerPart(canopyGroup, [0, 1.45, 0], 'enclosure');

    // Roof Acoustic Exhaust Silencer Muffler & Vertical Rain-Capped Stack
    const exhaustGroup = new THREE.Group();
    const muffler = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.46, 0.46, 3.2, 16)),
      brushedSteel
    );
    muffler.rotation.z = Math.PI / 2;
    muffler.position.set(-0.8, 3.92, 0);
    const stack = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.24, 0.28, 2.15, 14)),
      darkSteel
    );
    stack.position.set(-2.75, 4.75, 0);
    const rainCap = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.34, 0.22, 14)), brushedSteel);
    rainCap.position.set(-2.75, 5.9, 0);
    exhaustGroup.add(muffler, stack, rainCap);
    root.add(exhaustGroup);
    registerPart(exhaustGroup, [-0.45, 1.85, 0], 'piping_bus');

    // Side Paralleling Switchgear & ATS Controller Cubicle
    const atsGroup = new THREE.Group();
    const atsBox = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.5, 2.1, 0.65)), cabinetSlate);
    atsBox.position.set(-2.6, 2.0, 1.65);
    const hmi = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.78, 0.48)), hmiMat);
    hmi.position.set(-2.6, 2.35, 1.99);
    const beacon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.8, 0.16, 0.1)), beaconMat);
    beacon.position.set(0, 3.3, 1.48);
    atsGroup.add(atsBox, hmi, beacon);
    root.add(atsGroup);
    registerPart(atsGroup, [0, 0, 1.05], 'controls');
  } else if (kind === 'chw-tank-pump') {
    // Rooftop 180,000 L Vertical Insulated Chilled-Water Thermal Buffer Tank + Complete 3-Pump VFD Pump Skid
    recommendedCamera = { pos: [10.6, 6.2, 10.6], target: [0, 2.3, 0] };

    const cyanCoolantMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.28, metalness: 0.55 })
    );

    // Concrete inertia base skid supporting both Buffer Tank & 3-Pump VFD Set
    const inertiaBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(9.4, 0.3, 5.0)), darkSteel);
    inertiaBase.position.set(0, 0.15, 0);
    root.add(inertiaBase);

    // Left: Massive 180,000 L Square Sectional Insulated Chilled Water Buffer Tank
    const tankGroup = new THREE.Group();
    const tankX = -2.3;
    const tankPlinth = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(3.68, 0.48, 3.68)),
      darkSteel
    );
    tankPlinth.position.set(tankX, 0.54, 0);
    const tankShell = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(3.5, 4.35, 3.5)),
      brushedSteel
    );
    tankShell.position.set(tankX, 2.95, 0);
    // 4 vertical corner reinforcement angle ribs
    const cornerRibGeo = trackGeo(new THREE.BoxGeometry(0.18, 4.42, 0.18));
    for (const sx of [-1.72, 1.72]) {
      for (const sz of [-1.72, 1.72]) {
        const rib = new THREE.Mesh(cornerRibGeo, darkSteel);
        rib.position.set(tankX + sx, 2.95, sz);
        tankGroup.add(rib);
      }
    }
    // 2 horizontal panel girth stiffener bands
    const girthGeo = trackGeo(new THREE.BoxGeometry(3.6, 0.11, 3.6));
    const girthLow = new THREE.Mesh(girthGeo, darkSteel);
    girthLow.position.set(tankX, 1.9, 0);
    const girthMid = new THREE.Mesh(girthGeo, darkSteel);
    girthMid.position.set(tankX, 3.25, 0);
    // Square chilled-water blue + redundancy path bands
    const tankStripeTop = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(3.56, 0.26, 3.56)),
      chwBlueMat
    );
    tankStripeTop.position.set(tankX, 4.66, 0);
    const tankStripePath = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(3.56, 0.18, 3.56)),
      pathAccentMat
    );
    tankStripePath.position.set(tankX, 4.36, 0);
    // Flat square structural roof deck, raised square inspection hatch & breather vent
    const tankRoof = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(3.64, 0.2, 3.64)),
      cabinetWhite
    );
    tankRoof.position.set(tankX, 5.22, 0);
    const tankHatch = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.92, 0.24, 0.92)),
      darkSteel
    );
    tankHatch.position.set(tankX - 0.65, 5.44, 0.5);
    const tankVent = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.11, 0.11, 0.45, 10)),
      brushedSteel
    );
    tankVent.position.set(tankX + 0.85, 5.54, -0.7);
    // Square yellow perimeter safety handrail (8 posts + top & mid bars)
    const railHalf = 1.66;
    const postGeo = trackGeo(new THREE.BoxGeometry(0.06, 0.74, 0.06));
    const barXGeo = trackGeo(new THREE.BoxGeometry(3.34, 0.05, 0.05));
    const barZGeo = trackGeo(new THREE.BoxGeometry(0.05, 0.05, 3.34));
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
      const post = new THREE.Mesh(postGeo, safetyYellowMat);
      post.position.set(tankX + px, 5.68, pz);
      tankGroup.add(post);
    }
    for (const ry of [6.02, 5.66]) {
      const railN = new THREE.Mesh(barXGeo, safetyYellowMat);
      railN.position.set(tankX, ry, -railHalf);
      const railS = new THREE.Mesh(barXGeo, safetyYellowMat);
      railS.position.set(tankX, ry, railHalf);
      const railW = new THREE.Mesh(barZGeo, safetyYellowMat);
      railW.position.set(tankX - railHalf, ry, 0);
      const railE = new THREE.Mesh(barZGeo, safetyYellowMat);
      railE.position.set(tankX + railHalf, ry, 0);
      tankGroup.add(railN, railS, railW, railE);
    }
    // Sight glass level column on front flat face of square buffer tank
    const sightTube = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.08, 0.08, 3.55, 10)),
      cyanCoolantMat
    );
    sightTube.position.set(tankX, 2.92, 1.82);
    // West vertical maintenance ladder with rungs
    const ladderL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.06, 4.75, 0.06)), safetyYellowMat);
    ladderL.position.set(tankX - 1.84, 2.95, -0.22);
    const ladderR = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.06, 4.75, 0.06)), safetyYellowMat);
    ladderR.position.set(tankX - 1.84, 2.95, 0.22);
    const rungGeo = trackGeo(new THREE.BoxGeometry(0.04, 0.04, 0.44));
    for (let r = 0; r < 9; r++) {
      const rung = new THREE.Mesh(rungGeo, safetyYellowMat);
      rung.position.set(tankX - 1.84, 0.95 + r * 0.5, 0);
      tankGroup.add(rung);
    }
    tankGroup.add(
      tankPlinth,
      tankShell,
      girthLow,
      girthMid,
      tankStripeTop,
      tankStripePath,
      tankRoof,
      tankHatch,
      tankVent,
      sightTube,
      ladderL,
      ladderR
    );
    root.add(tankGroup);
    registerPart(tankGroup, [-0.95, 0.65, 0], 'enclosure');

    // Center-Right Core: Complete 3-Pump End-Suction Centrifugal Pump Skid (2 Duty + 1 N+1 Standby)
    const pumpCoreGroup = new THREE.Group();
    const skidPlate = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.8, 0.2, 4.2)), cabinetSlate);
    skidPlate.position.set(1.55, 0.4, 0);
    pumpCoreGroup.add(skidPlate);

    for (const pz of [-1.28, 0, 1.28]) {
      // Heavy TEFC IE4 motor
      const motor = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.36, 0.36, 1.05, 16)),
        pathAccentMat
      );
      motor.rotation.z = Math.PI / 2;
      motor.position.set(2.35, 0.92, pz);
      // Coupling guard
      const coupling = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.18, 0.18, 0.34, 12)),
        safetyYellowMat
      );
      coupling.rotation.z = Math.PI / 2;
      coupling.position.set(1.66, 0.92, pz);
      // Cast-iron centrifugal pump volute casing
      const volute = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.46, 0.46, 0.34, 16)),
        chwBlueMat
      );
      volute.rotation.z = Math.PI / 2;
      volute.position.set(1.25, 0.92, pz);
      // Vertical discharge riser + isolation valve into top discharge header
      const disch = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.11, 1.35, 10)), chwBlueMat);
      disch.position.set(1.25, 1.62, pz);
      const val = buildValve(chwBlueMat);
      val.position.set(1.25, 1.55, pz);
      // Horizontal suction branch from lower manifold
      const suct = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.12, 0.12, 0.85, 10)), cwTealMat);
      suct.rotation.z = Math.PI / 2;
      suct.position.set(0.68, 0.92, pz);
      pumpCoreGroup.add(motor, coupling, volute, disch, val, suct);
    }
    root.add(pumpCoreGroup);
    registerPart(pumpCoreGroup, [0.4, 0.35, 0], 'core');

    // DN300 Suction & Discharge Collector Headers + Buffer Tank Tie-In Bridges + Pressurization Vessel
    const pipeGroup = new THREE.Group();
    const suctionHeader = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.2, 0.2, 3.8, 14)),
      cwTealMat
    );
    suctionHeader.rotation.x = Math.PI / 2;
    suctionHeader.position.set(0.22, 0.92, 0);
    const dischargeHeader = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.2, 0.2, 4.1, 14)),
      chwBlueMat
    );
    dischargeHeader.rotation.x = Math.PI / 2;
    dischargeHeader.position.set(1.25, 2.28, 0);
    const tankTieLower = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.18, 0.18, 1.2, 12)),
      cwTealMat
    );
    tankTieLower.rotation.z = Math.PI / 2;
    tankTieLower.position.set(-0.35, 0.92, 0);
    const tankTieUpper = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.18, 0.18, 2.2, 12)),
      chwBlueMat
    );
    tankTieUpper.rotation.z = Math.PI / 2;
    tankTieUpper.position.set(0.15, 2.28, -1.4);
    const expVessel = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.38, 0.38, 1.65, 14)),
      hotRedMat
    );
    expVessel.position.set(0.22, 1.75, -1.95);
    pipeGroup.add(suctionHeader, dischargeHeader, tankTieLower, tankTieUpper, expVessel);
    root.add(pipeGroup);
    registerPart(pipeGroup, [0, 1.15, -0.55], 'piping_bus');

    // Right End: Triplex VFD Pump Control Cabinet + HMI + Beacon
    const ctrlGroup = new THREE.Group();
    const vfdCab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.15, 2.65, 3.2)), cabinetWhite);
    vfdCab.position.set(4.02, 1.62, 0);
    const vfdTrim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.18, 0.14, 3.24)), pathAccentMat);
    vfdTrim.position.set(4.02, 2.96, 0);
    const hmi = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.84, 0.52)), hmiMat);
    hmi.rotation.y = Math.PI / 2;
    hmi.position.set(4.61, 2.05, 0.45);
    const beacon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.1, 0.16, 2.8)), beaconMat);
    beacon.position.set(4.62, 2.66, 0);
    ctrlGroup.add(vfdCab, vfdTrim, hmi, beacon);
    root.add(ctrlGroup);
    registerPart(ctrlGroup, [1.2, 0, 0], 'controls');
  } else if (kind === 'liquid-cdu') {
    // Hall B Direct-to-Chip Liquid Cooling CDU (1.6 MW Coolant Distribution Unit)
    recommendedCamera = { pos: [7.6, 4.6, 8.2], target: [0, 1.85, 0] };

    const cyanPipeMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.25, metalness: 0.65 })
    );
    const coralPipeMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.28, metalness: 0.55 })
    );

    // Stainless steel drip-tray skid base
    const base = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.8, 0.24, 2.2)), brushedSteel);
    base.position.set(0, 0.12, 0);
    root.add(base);

    // Core: 316L Brazed-Plate Heat Exchanger Stack + Duplex Stainless VFD Circulating Pumps + 25µm Filters
    const coreGroup = new THREE.Group();
    const plateHx = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.15, 1.75, 1.1)), brushedSteel);
    plateHx.position.set(-0.95, 1.25, -0.15);
    for (let i = 0; i < 6; i++) {
      const plate = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.18, 0.05, 1.14)), copperMat);
      plate.position.set(-0.95, 0.58 + i * 0.26, -0.15);
      coreGroup.add(plate);
    }
    // Duplex stainless VFD pumps (2N)
    for (const px of [0.35, 1.15]) {
      const pumpBody = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.26, 0.28, 0.95, 14)),
        cyanPipeMat
      );
      pumpBody.position.set(px, 0.85, 0.22);
      const motorHead = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.22, 0.24, 0.52, 14)),
        cabinetSlate
      );
      motorHead.position.set(px, 1.56, 0.22);
      coreGroup.add(pumpBody, motorHead);
    }
    // Twin vertical pressurized coolant expansion tanks
    for (const ex of [-1.75, -1.2]) {
      const exp = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.22, 0.22, 1.45, 14)),
        cwTealMat
      );
      exp.position.set(ex, 2.2, -0.45);
      coreGroup.add(exp);
    }
    // Twin 25-micron cartridge filter canisters
    for (const fx of [0.35, 1.15]) {
      const filt = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.16, 0.16, 0.72, 12)),
        brushedSteel
      );
      filt.position.set(fx, 2.38, -0.35);
      coreGroup.add(filt);
    }
    root.add(coreGroup);
    registerPart(coreGroup, [0, 0.25, 0], 'core');

    // Outer Brushed Stainless & Clean-Room White Enclosure Panels
    const encGroup = new THREE.Group();
    const rearWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.4, 2.95, 0.14)), cabinetWhite);
    rearWall.position.set(0, 1.72, -0.95);
    const leftDoor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.7, 2.9, 0.1)), brushedSteel);
    leftDoor.position.set(-1.32, 1.72, 0.92);
    const rightDoor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.7, 2.9, 0.1)), cabinetWhite);
    rightDoor.position.set(0.45, 1.72, 0.92);
    const topCap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.5, 0.22, 2.02)), cyanPipeMat);
    topCap.position.set(0, 3.24, 0);
    const pathStripe = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.54, 0.12, 2.06)), pathAccentMat);
    pathStripe.position.set(0, 3.08, 0);
    encGroup.add(rearWall, leftDoor, rightDoor, topCap, pathStripe);
    root.add(encGroup);
    registerPart(encGroup, [0, 0.85, 0.9], 'enclosure');

    // Right PLC & Dew-Point / ΔP Controller Bay
    const ctrlGroup = new THREE.Group();
    const ctrlBox = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.95, 2.95, 1.95)), cabinetSlate);
    ctrlBox.position.set(1.85, 1.72, 0);
    const hmi = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.72, 0.46)), hmiMat);
    hmi.position.set(1.85, 2.15, 0.99);
    const beacon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.82, 0.14, 0.1)), beaconMat);
    beacon.position.set(1.85, 2.86, 0.99);
    ctrlGroup.add(ctrlBox, hmi, beacon);
    root.add(ctrlGroup);
    registerPart(ctrlGroup, [0.95, 0, 0.2], 'controls');

    // Overhead Cyan Direct-to-Chip Supply & Coral-Red Warm Return Stainless Manifold Risers + Primary CHW Tie-in
    const pipeGroup = new THREE.Group();
    const secSupply = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.11, 1.55, 12)), cyanPipeMat);
    secSupply.position.set(-0.6, 3.95, 0.38);
    const secReturn = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.11, 1.55, 12)), coralPipeMat);
    secReturn.position.set(0.25, 3.95, 0.38);
    const overheadSup = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.1, 0.1, 4.4, 12)), cyanPipeMat);
    overheadSup.rotation.z = Math.PI / 2;
    overheadSup.position.set(-0.2, 4.68, 0.38);
    const overheadRet = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.1, 0.1, 4.4, 12)), coralPipeMat);
    overheadRet.rotation.z = Math.PI / 2;
    overheadRet.position.set(-0.2, 4.68, -0.25);
    const primChwSup = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.1, 0.1, 3.2, 10)), chwBlueMat);
    primChwSup.position.set(-2.48, 1.82, 0.32);
    const primChwRet = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.1, 0.1, 3.2, 10)), hotRedMat);
    primChwRet.position.set(-2.48, 1.82, -0.32);
    const valve = buildValve(cyanPipeMat);
    valve.position.set(-2.48, 1.25, 0.32);
    pipeGroup.add(secSupply, secReturn, overheadSup, overheadRet, primChwSup, primChwRet, valve);
    root.add(pipeGroup);
    registerPart(pipeGroup, [-0.55, 0.95, 0], 'piping_bus');
  } else if (kind === 'diesel-tank') {
    // Basement Level B1 50,000 L Double-Walled UL-2085 Cylindrical Bulk Diesel Tank
    recommendedCamera = { pos: [9.4, 5.2, 9.2], target: [0, 1.9, 0] };

    // Bunded concrete containment plinth + seismic steel saddle cradles
    const bund = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.6, 0.34, 3.8)), darkSteel);
    bund.position.set(0, 0.17, 0);
    root.add(bund);

    // Core Double-Walled Horizontal Cylindrical Tank with Hemispherical End Caps
    const tankCoreGroup = new THREE.Group();
    const cylinder = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(1.22, 1.22, 5.4, 24)),
      cabinetSlate
    );
    cylinder.rotation.z = Math.PI / 2;
    cylinder.position.set(-0.4, 1.88, 0);
    const capL = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(1.22, 20, 14)), cabinetSlate);
    capL.scale.set(0.58, 1, 1);
    capL.position.set(-3.1, 1.88, 0);
    const capR = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(1.22, 20, 14)), cabinetSlate);
    capR.scale.set(0.58, 1, 1);
    capR.position.set(2.3, 1.88, 0);
    // High-visibility diesel hazard band + Path A/B ring
    const yellowBand = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(1.245, 1.245, 0.36, 24)),
      safetyYellowMat
    );
    yellowBand.rotation.z = Math.PI / 2;
    yellowBand.position.set(-0.4, 1.88, 0);
    const pathBandL = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(1.245, 1.245, 0.18, 24)),
      pathAccentMat
    );
    pathBandL.rotation.z = Math.PI / 2;
    pathBandL.position.set(-2.25, 1.88, 0);
    const pathBandR = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(1.245, 1.245, 0.18, 24)),
      pathAccentMat
    );
    pathBandR.rotation.z = Math.PI / 2;
    pathBandR.position.set(1.45, 1.88, 0);
    // Seismic steel support saddles
    for (const sx of [-2.2, -0.4, 1.4]) {
      const saddle = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.95, 2.25)), darkSteel);
      saddle.position.set(sx, 0.82, 0);
      tankCoreGroup.add(saddle);
    }
    tankCoreGroup.add(cylinder, capL, capR, yellowBand, pathBandL, pathBandR);
    root.add(tankCoreGroup);
    registerPart(tankCoreGroup, [0, 0.45, 0], 'core');

    // Top Inspection Manway Hatch, Interstitial Leak Mast, Vent Flame Arrestor & Side Level Gauge
    const encGroup = new THREE.Group();
    const manway = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.46, 0.5, 0.42, 16)), brushedSteel);
    manway.position.set(-0.4, 3.24, 0);
    const ventMast = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.08, 1.45, 10)), brushedSteel);
    ventMast.position.set(-1.75, 3.72, 0);
    const flameArrestor = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.18, 0.12, 0.28, 12)), hotRedMat);
    flameArrestor.position.set(-1.75, 4.48, 0);
    const levelMast = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 1.9, 0.12)), beaconMat);
    levelMast.position.set(-0.4, 1.88, 1.28);
    encGroup.add(manway, ventMast, flameArrestor, levelMast);
    root.add(encGroup);
    registerPart(encGroup, [0, 1.25, 0], 'enclosure');

    // Right End: Duplex Diesel Transfer Pump Skid + Vertical Yellow Risers to Above-Ground Generator
    const pipeGroup = new THREE.Group();
    const pumpSkid = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.5, 0.22, 2.2)), darkSteel);
    pumpSkid.position.set(3.45, 0.44, 0);
    for (const pz of [-0.55, 0.55]) {
      const pump = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 0.72, 12)), safetyYellowMat);
      pump.rotation.z = Math.PI / 2;
      pump.position.set(3.35, 0.85, pz);
      const val = buildValve(safetyYellowMat);
      val.position.set(2.85, 0.85, pz);
      pipeGroup.add(pump, val);
    }
    const supplyRiser = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.11, 0.11, 4.4, 12)),
      safetyYellowMat
    );
    supplyRiser.position.set(3.85, 2.7, 0.42);
    const returnRiser = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.09, 0.09, 4.4, 12)),
      copperMat
    );
    returnRiser.position.set(3.85, 2.7, -0.42);
    pipeGroup.add(pumpSkid, supplyRiser, returnRiser);
    root.add(pipeGroup);
    registerPart(pipeGroup, [1.05, 0.3, 0], 'piping_bus');

    // Front Fuel-Farm Telemetry & Leak-Detection Control Box
    const ctrlGroup = new THREE.Group();
    const ctrlBox = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.1, 1.55, 0.55)), cabinetWhite);
    ctrlBox.position.set(3.45, 1.95, 1.45);
    const hmi = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.76, 0.48)), hmiMat);
    hmi.position.set(3.45, 2.18, 1.74);
    const beacon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.92, 0.14, 0.08)), beaconMat);
    beacon.position.set(3.45, 2.6, 1.74);
    ctrlGroup.add(ctrlBox, hmi, beacon);
    root.add(ctrlGroup);
    registerPart(ctrlGroup, [0.4, 0, 0.95], 'controls');
  } else if (kind === 'hv-transformer') {
    // 132kV/11kV 20 MVA Step-Down Power Transformer & HV GIS Incomer
    recommendedCamera = { pos: [9.4, 5.8, 9.6], target: [0, 2.3, 0] };

    // Concrete oil-containment bund pad
    const bund = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.2, 0.32, 5.2)), darkSteel);
    bund.position.set(0, 0.16, 0);
    root.add(bund);

    // Core Main Mineral-Oil Tank + Finned Radiator Cooling Banks
    const coreGroup = new THREE.Group();
    const mainTank = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.4, 2.75, 2.4)), cabinetSlate);
    mainTank.position.set(-0.3, 1.7, 0);
    const tankAccent = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.46, 0.18, 2.46)), pathAccentMat);
    tankAccent.position.set(-0.3, 2.98, 0);
    coreGroup.add(mainTank, tankAccent);

    // Finned oil radiator cooling banks along Front & Rear faces
    for (const rz of [-1.58, 1.58]) {
      for (let rx = -1.65; rx <= 1.05; rx += 0.34) {
        const fin = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.08, 2.15, 0.65)), brushedSteel);
        fin.position.set(rx, 1.68, rz);
        coreGroup.add(fin);
      }
    }
    root.add(coreGroup);
    registerPart(coreGroup, [0, 0.25, 0], 'core');

    // Top 3 Tall Ribbed Ceramic 132kV HV Bushings + Conservator Expansion Drum
    const hvTopGroup = new THREE.Group();
    const ceramicMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.26, metalness: 0.12 })
    );
    for (const bx of [-1.35, -0.3, 0.75]) {
      const turret = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.24, 0.3, 0.45, 12)), darkSteel);
      turret.position.set(bx, 3.25, 0.35);
      const insulator = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.17, 1.75, 12)), ceramicMat);
      insulator.position.set(bx, 4.3, 0.35);
      const cap = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.06, 0.06, 0.35, 8)), copperMat);
      cap.position.set(bx, 5.28, 0.35);
      for (let r = 0; r < 5; r++) {
        const shed = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.22, 0.2, 0.08, 12)), ceramicMat);
        shed.position.set(bx, 3.68 + r * 0.3, 0.35);
        hvTopGroup.add(shed);
      }
      hvTopGroup.add(turret, insulator, cap);
    }
    // Overhead cylindrical conservator oil expansion drum + Buchholz pipe
    const conservator = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.46, 0.46, 2.6, 16)),
      cabinetWhite
    );
    conservator.rotation.z = Math.PI / 2;
    conservator.position.set(-0.3, 4.15, -0.85);
    const buchholz = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.08, 1.05, 10)), copperMat);
    buchholz.position.set(-0.3, 3.45, -0.85);
    hvTopGroup.add(conservator, buchholz);
    root.add(hvTopGroup);
    registerPart(hvTopGroup, [0, 1.35, 0], 'enclosure');

    // Outgoing MV Busbar Duct to MSB Switchboard
    const busGroup = new THREE.Group();
    const mvDuct = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.9, 0.52, 0.65)), pathAccentMat);
    mvDuct.position.set(2.25, 2.45, 0);
    const copperBus = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.94, 0.14, 0.7)), copperMat);
    copperBus.position.set(2.25, 2.15, 0);
    busGroup.add(mvDuct, copperBus);
    root.add(busGroup);
    registerPart(busGroup, [1.1, 0.35, 0], 'piping_bus');

    // IEC 61850 Protection Relay & OLTC Tap-Changer Marshalling Cabinet
    const ctrlGroup = new THREE.Group();
    const marshCab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.05, 2.15, 1.25)), cabinetWhite);
    marshCab.position.set(2.35, 1.38, 1.15);
    const hmi = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.72, 0.46)), hmiMat);
    hmi.position.set(2.35, 1.85, 1.79);
    const beacon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.86, 0.14, 0.08)), beaconMat);
    beacon.position.set(2.35, 2.3, 1.79);
    ctrlGroup.add(marshCab, hmi, beacon);
    root.add(ctrlGroup);
    registerPart(ctrlGroup, [0.55, 0, 0.95], 'controls');
  } else if (kind === 'msb-switchboard') {
    // 415V 6300A Form 4B Main Switchboard (MSB) — HV Incomer + Generator Sync ATS -> UPS & OPSWB
    recommendedCamera = { pos: [9.2, 5.0, 9.4], target: [0, 1.9, 0] };

    const plinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.6, 0.24, 2.4)), darkSteel);
    plinth.position.set(0, 0.12, 0);
    root.add(plinth);

    // Core: 4 Draw-Out 6300A ACB Breaker Carriages + Exposed Laminated Copper Main Busbars
    const coreGroup = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const cx = -2.4 + i * 1.6;
      const acb = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.25, 1.15, 1.55)), darkSteel);
      acb.position.set(cx, 1.35, 0);
      const lever = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 0.42, 0.18)), i === 1 ? safetyYellowMat : hotRedMat);
      lever.position.set(cx + 0.35, 1.35, 0.85);
      coreGroup.add(acb, lever);
    }
    // 3-Phase Laminated Copper Horizontal Main Busbars
    for (const [idx, by] of [2.52, 2.74, 2.96].entries()) {
      const busbar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.8, 0.1, 0.18)), copperMat);
      busbar.position.set(0, by, -0.35 + idx * 0.22);
      coreGroup.add(busbar);
    }
    root.add(coreGroup);
    registerPart(coreGroup, [0, 0.2, 0], 'core');

    // Outer Form 4B Steel Switchgear Cubicles (lifts backward in exploded view)
    const encGroup = new THREE.Group();
    const shell = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.2, 3.05, 1.95)), cabinetWhite);
    shell.position.set(0, 1.76, -0.1);
    const pathBand = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.24, 0.16, 1.98)), pathAccentMat);
    pathBand.position.set(0, 3.34, -0.1);
    for (const sx of [-1.6, 0, 1.6]) {
      const divider = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.06, 3.0, 2.0)), darkSteel);
      divider.position.set(sx, 1.76, -0.1);
      encGroup.add(divider);
    }
    encGroup.add(shell, pathBand);
    root.add(encGroup);
    registerPart(encGroup, [0, 0.85, -1.1], 'enclosure');

    // Front Mimic HMI, Protection Relays & Status Beacon Bar
    const ctrlGroup = new THREE.Group();
    const hmi = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(1.15, 0.68)), hmiMat);
    hmi.position.set(-0.8, 2.25, 0.92);
    const beacon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.6, 0.14, 0.08)), beaconMat);
    beacon.position.set(0, 3.06, 0.92);
    ctrlGroup.add(hmi, beacon);
    root.add(ctrlGroup);
    registerPart(ctrlGroup, [0, 0, 1.05], 'controls');

    // Overhead Incoming HV-to-MSB & Outgoing MSB-to-UPS/OPSWB Bus Ducts
    const busGroup = new THREE.Group();
    for (const bx of [-2.4, -0.8, 0.8, 2.4]) {
      const riser = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 1.05, 0.34)), copperMat);
      riser.position.set(bx, 3.85, -0.15);
      busGroup.add(riser);
    }
    const trunk = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.4, 0.3, 0.5)), pathAccentMat);
    trunk.position.set(0, 4.46, -0.15);
    busGroup.add(trunk);
    root.add(busGroup);
    registerPart(busGroup, [0, 1.05, 0], 'piping_bus');
  } else if (kind === 'opswb-switchboard') {
    // 415V Output Switchboard (OPSWB) — Dual-Bay Serving Electrical (IT Halls) + Mechanical Plant
    recommendedCamera = { pos: [9.4, 5.2, 9.6], target: [0, 2.0, 0] };

    const plinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.8, 0.24, 2.4)), darkSteel);
    plinth.position.set(0, 0.12, 0);
    root.add(plinth);

    // Core: Left Electrical (IT) MCCB Distribution Bay + Right Mechanical Plant Feeder Bay
    const coreGroup = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const fx = -2.75 + i * 1.1;
      const isMech = i >= 3;
      const feeder = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.86, 1.55, 1.45)),
        isMech ? chwBlueMat : cabinetSlate
      );
      feeder.position.set(fx, 1.45, 0);
      const busTap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 0.85, 0.2)), copperMat);
      busTap.position.set(fx, 2.65, -0.2);
      coreGroup.add(feeder, busTap);
    }
    root.add(coreGroup);
    registerPart(coreGroup, [0, 0.2, 0], 'core');

    // Outer Dual-Section Enclosure with Distinct Electrical (Green/Amber) & Mechanical (Blue/Teal) Headers
    const encGroup = new THREE.Group();
    const itBay = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.65, 3.05, 1.95)), cabinetWhite);
    itBay.position.set(-1.85, 1.76, -0.1);
    const mechBay = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.65, 3.05, 1.95)), brushedSteel);
    mechBay.position.set(1.85, 1.76, -0.1);
    const itHeader = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.68, 0.18, 2.0)), pathAccentMat);
    itHeader.position.set(-1.85, 3.36, -0.1);
    const mechHeader = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.68, 0.18, 2.0)), chwBlueMat);
    mechHeader.position.set(1.85, 3.36, -0.1);
    encGroup.add(itBay, mechBay, itHeader, mechHeader);
    root.add(encGroup);
    registerPart(encGroup, [0, 0.85, -1.1], 'enclosure');

    // Front Dual Metering HMI & Status Bar
    const ctrlGroup = new THREE.Group();
    const hmiIt = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.95, 0.58)), hmiMat);
    hmiIt.position.set(-1.85, 2.25, 0.92);
    const hmiMech = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.95, 0.58)), hmiMat);
    hmiMech.position.set(1.85, 2.25, 0.92);
    const beacon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.8, 0.14, 0.08)), beaconMat);
    beacon.position.set(0, 3.08, 0.92);
    ctrlGroup.add(hmiIt, hmiMech, beacon);
    root.add(ctrlGroup);
    registerPart(ctrlGroup, [0, 0, 1.05], 'controls');

    // Overhead Outgoing Dual Distribution Trunks: Left = Electrical IT Busway, Right = Mechanical Plant Feeder Conduit
    const busGroup = new THREE.Group();
    const itRiser = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.42, 1.05, 0.42)), copperMat);
    itRiser.position.set(-1.85, 3.88, -0.1);
    const itTrunk = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.8, 0.3, 0.52)), pathAccentMat);
    itTrunk.position.set(-1.85, 4.5, -0.1);
    const mechRiser = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.42, 1.05, 0.42)), cwTealMat);
    mechRiser.position.set(1.85, 3.88, -0.1);
    const mechTrunk = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.8, 0.3, 0.52)), chwBlueMat);
    mechTrunk.position.set(1.85, 4.5, -0.1);
    busGroup.add(itRiser, itTrunk, mechRiser, mechTrunk);
    root.add(busGroup);
    registerPart(busGroup, [0, 1.05, 0], 'piping_bus');
  } else {
    // 'gateway': 2N BMS Protocol Gateway & SCADA Marshalling Cabinet
    recommendedCamera = { pos: [5.4, 3.6, 5.8], target: [0, 1.6, 0] };

    const plinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.6, 0.2, 1.5)), darkSteel);
    plinth.position.set(0, 0.1, 0);
    root.add(plinth);

    // Core DIN-Rail Dual PLC Blades + Redundant 24VDC PSUs + Copper Earth Bar
    const coreGroup = new THREE.Group();
    const backplane = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.1, 2.5, 0.14)), brushedSteel);
    backplane.position.set(0, 1.55, -0.35);
    coreGroup.add(backplane);
    for (let i = 0; i < 6; i++) {
      const blade = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.24, 0.62, 0.42)),
        i < 2 ? pathAccentMat : cabinetSlate
      );
      blade.position.set(-0.78 + i * 0.31, 2.05, -0.08);
      coreGroup.add(blade);
    }
    for (const px of [-0.55, 0.55]) {
      const psu = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.72, 0.48, 0.42)), darkSteel);
      psu.position.set(px, 1.05, -0.08);
      coreGroup.add(psu);
    }
    const earthBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.9, 0.1, 0.12)), copperMat);
    earthBar.position.set(0, 0.55, 0.05);
    coreGroup.add(earthBar);
    root.add(coreGroup);
    registerPart(coreGroup, [0, 0.2, 0], 'core');

    // Outer IP54 Cabinet Enclosure
    const encGroup = new THREE.Group();
    const body = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.4, 2.9, 1.25)), cabinetWhite);
    body.position.set(0, 1.65, -0.05);
    const door = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.26, 2.74, 0.1)), cabinetSlate);
    door.position.set(0, 1.65, 0.6);
    const stripe = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.44, 0.14, 1.28)), pathAccentMat);
    stripe.position.set(0, 3.12, -0.05);
    encGroup.add(body, door, stripe);
    root.add(encGroup);
    registerPart(encGroup, [0, 0.6, -0.85], 'enclosure');

    // Front Mimic HMI + Status Beacon
    const ctrlGroup = new THREE.Group();
    const hmi = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(1.1, 0.66)), hmiMat);
    hmi.position.set(0, 2.1, 0.67);
    const beacon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.8, 0.14, 0.08)), beaconMat);
    beacon.position.set(0, 2.82, 0.67);
    ctrlGroup.add(hmi, beacon);
    root.add(ctrlGroup);
    registerPart(ctrlGroup, [0, 0, 0.95], 'controls');

    // Top Armored Conduit & Fiber Risers
    const pipeGroup = new THREE.Group();
    for (const cx of [-0.7, -0.25, 0.25, 0.7]) {
      const conduit = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8)),
        cx < 0 ? pathAccentMat : brushedSteel
      );
      conduit.position.set(cx, 3.65, -0.1);
      pipeGroup.add(conduit);
    }
    root.add(pipeGroup);
    registerPart(pipeGroup, [0, 0.95, 0], 'piping_bus');
  }

  return {
    root,
    recommendedCamera,
    setExplode: (t01: number) => {
      const clamped = Math.max(0, Math.min(1, t01));
      for (const p of explodables) {
        p.object.position.copy(p.basePos).addScaledVector(p.explodeOffset, clamped);
      }
    },
    setStatusColor: (hex: number) => {
      beaconMat.color.setHex(hex);
      beaconMat.emissive.setHex(hex);
    },
    stepFans: (angleDelta: number) => {
      for (const f of fans) {
        f.rotation.y += angleDelta;
      }
    },
    dispose: () => {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of textures) t.dispose();
    },
  };
}

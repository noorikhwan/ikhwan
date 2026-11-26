import * as THREE from 'three';

export interface TwinProceduralTextures {
  raisedFloorMap: THREE.CanvasTexture;
  facadePanelMap: THREE.CanvasTexture;
  rackDoorMap: THREE.CanvasTexture;
  asphaltMap: THREE.CanvasTexture;
  paverMap: THREE.CanvasTexture;
  solarPanelMap: THREE.CanvasTexture;
  monumentSignMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  signageMap: THREE.CanvasTexture;
  updateSignageText: (tierLabel: string) => void;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas context unavailable for procedural textures');
  }
  return [canvas, ctx];
}

export function createTwinProceduralTextures(maxAnisotropy: number): TwinProceduralTextures {
  const aniso = Math.max(1, Math.min(8, maxAnisotropy));

  // 1. Raised 600mm perforated data hall floor tiles
  const [floorCanvas, fCtx] = makeCanvas(256, 256);
  fCtx.fillStyle = '#d9dfe6';
  fCtx.fillRect(0, 0, 256, 256);
  // Subtle speckled anti-static laminate grain
  fCtx.fillStyle = 'rgba(100, 116, 139, 0.08)';
  for (let i = 0; i < 420; i++) {
    const x = (i * 73) % 256;
    const y = (i * 131) % 256;
    fCtx.fillRect(x, y, 2, 2);
  }
  // 2x2 tile seam grid
  fCtx.strokeStyle = '#9aa5b4';
  fCtx.lineWidth = 2;
  fCtx.strokeRect(1, 1, 126, 126);
  fCtx.strokeRect(129, 1, 126, 126);
  fCtx.strokeRect(1, 129, 126, 126);
  fCtx.strokeRect(129, 129, 126, 126);
  // Subtle micro corner fasteners
  fCtx.fillStyle = '#7c8796';
  for (const cx of [8, 120, 136, 248]) {
    for (const cy of [8, 120, 136, 248]) {
      fCtx.fillRect(cx - 1, cy - 1, 2, 2);
    }
  }
  const raisedFloorMap = new THREE.CanvasTexture(floorCanvas);
  raisedFloorMap.colorSpace = THREE.SRGBColorSpace;
  raisedFloorMap.wrapS = THREE.RepeatWrapping;
  raisedFloorMap.wrapT = THREE.RepeatWrapping;
  raisedFloorMap.repeat.set(16, 11);
  raisedFloorMap.anisotropy = aniso;

  // 2. Insulated architectural precast / corrugated facade panels
  const [facadeCanvas, faCtx] = makeCanvas(256, 256);
  faCtx.fillStyle = '#e5e9ef';
  faCtx.fillRect(0, 0, 256, 256);
  // Vertical architectural ribbing
  for (let x = 0; x < 256; x += 16) {
    faCtx.fillStyle = 'rgba(148, 163, 184, 0.16)';
    faCtx.fillRect(x, 0, 3, 256);
    faCtx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    faCtx.fillRect(x + 3, 0, 2, 256);
  }
  // Horizontal panel seams
  faCtx.fillStyle = '#b9c2ce';
  faCtx.fillRect(0, 84, 256, 2);
  faCtx.fillRect(0, 170, 256, 2);
  const facadePanelMap = new THREE.CanvasTexture(facadeCanvas);
  facadePanelMap.colorSpace = THREE.SRGBColorSpace;
  facadePanelMap.wrapS = THREE.RepeatWrapping;
  facadePanelMap.wrapT = THREE.RepeatWrapping;
  facadePanelMap.repeat.set(8, 2);
  facadePanelMap.anisotropy = aniso;

  // 3. Perforated server rack front door mesh
  const [doorCanvas, dCtx] = makeCanvas(128, 256);
  dCtx.fillStyle = '#1b2026';
  dCtx.fillRect(0, 0, 128, 256);
  // Perforated honeycomb dots
  dCtx.fillStyle = '#0d1014';
  for (let y = 6; y < 250; y += 6) {
    for (let x = 8; x < 120; x += 6) {
      dCtx.fillRect(x + ((y / 6) % 2) * 2, y, 3, 3);
    }
  }
  // Subtle frame borders
  dCtx.strokeStyle = '#363f4a';
  dCtx.lineWidth = 6;
  dCtx.strokeRect(3, 3, 122, 250);
  const rackDoorMap = new THREE.CanvasTexture(doorCanvas);
  rackDoorMap.colorSpace = THREE.SRGBColorSpace;
  rackDoorMap.anisotropy = aniso;

  // 4. Campus asphalt apron
  const [asphaltCanvas, aCtx] = makeCanvas(256, 256);
  aCtx.fillStyle = '#4c545e';
  aCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1200; i++) {
    const x = (i * 97) % 256;
    const y = (i * 53) % 256;
    aCtx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.08)';
    aCtx.fillRect(x, y, 2, 2);
  }
  const asphaltMap = new THREE.CanvasTexture(asphaltCanvas);
  asphaltMap.colorSpace = THREE.SRGBColorSpace;
  asphaltMap.wrapS = THREE.RepeatWrapping;
  asphaltMap.wrapT = THREE.RepeatWrapping;
  asphaltMap.repeat.set(6, 6);
  asphaltMap.anisotropy = aniso;

  // 4b. Architectural travertine / granite plaza pavers
  const [paverCanvas, pCtx] = makeCanvas(256, 256);
  pCtx.fillStyle = '#dfe3e8';
  pCtx.fillRect(0, 0, 256, 256);
  const tileShades = ['#e4e7ec', '#d7dce3', '#dde1e7', '#cfd6df'];
  for (let row = 0; row < 4; row++) {
    const offset = (row % 2) * 32;
    for (let col = -1; col < 5; col++) {
      pCtx.fillStyle = tileShades[(row * 3 + col + 4) % tileShades.length];
      pCtx.fillRect(col * 64 + offset + 2, row * 64 + 2, 60, 60);
    }
  }
  pCtx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
  pCtx.lineWidth = 2;
  for (let row = 0; row < 4; row++) {
    pCtx.beginPath();
    pCtx.moveTo(0, row * 64);
    pCtx.lineTo(256, row * 64);
    pCtx.stroke();
  }
  const paverMap = new THREE.CanvasTexture(paverCanvas);
  paverMap.colorSpace = THREE.SRGBColorSpace;
  paverMap.wrapS = THREE.RepeatWrapping;
  paverMap.wrapT = THREE.RepeatWrapping;
  paverMap.repeat.set(6, 3);
  paverMap.anisotropy = aniso;

  // 4c. Monocrystalline photovoltaic solar carport panel grid
  const [solarCanvas, spCtx] = makeCanvas(256, 256);
  spCtx.fillStyle = '#0f2342';
  spCtx.fillRect(0, 0, 256, 256);
  spCtx.strokeStyle = 'rgba(148, 197, 255, 0.34)';
  spCtx.lineWidth = 2;
  for (let x = 0; x <= 256; x += 32) {
    spCtx.beginPath();
    spCtx.moveTo(x, 0);
    spCtx.lineTo(x, 256);
    spCtx.stroke();
  }
  for (let y = 0; y <= 256; y += 64) {
    spCtx.beginPath();
    spCtx.moveTo(0, y);
    spCtx.lineTo(256, y);
    spCtx.stroke();
  }
  spCtx.strokeStyle = 'rgba(226, 232, 240, 0.65)';
  spCtx.lineWidth = 4;
  spCtx.strokeRect(2, 2, 252, 252);
  const solarPanelMap = new THREE.CanvasTexture(solarCanvas);
  solarPanelMap.colorSpace = THREE.SRGBColorSpace;
  solarPanelMap.wrapS = THREE.RepeatWrapping;
  solarPanelMap.wrapT = THREE.RepeatWrapping;
  solarPanelMap.repeat.set(8, 2);
  solarPanelMap.anisotropy = aniso;

  // 4d. Campus Entrance Monument Sign ("ORISE CAMPUS · VISITOR PARKING")
  const [monCanvas, mCtx] = makeCanvas(512, 160);
  mCtx.fillStyle = '#182028';
  mCtx.fillRect(0, 0, 512, 160);
  mCtx.fillStyle = '#3dcd58';
  mCtx.fillRect(0, 0, 14, 160);
  mCtx.fillRect(36, 118, 440, 4);
  mCtx.fillStyle = '#f8fafc';
  mCtx.font = 'bold 36px "Plus Jakarta Sans", system-ui, sans-serif';
  mCtx.fillText('ORISE CAMPUS', 36, 62);
  mCtx.fillStyle = '#cbd5e1';
  mCtx.font = '600 20px "IBM Plex Mono", monospace';
  mCtx.fillText('VISITOR PARKING · EV · NOC', 36, 100);
  mCtx.fillStyle = '#3dcd58';
  mCtx.font = '600 16px "IBM Plex Mono", monospace';
  mCtx.fillText('P  AUTHORIZED GUESTS & VIP', 36, 144);
  const monumentSignMap = new THREE.CanvasTexture(monCanvas);
  monumentSignMap.colorSpace = THREE.SRGBColorSpace;
  monumentSignMap.anisotropy = aniso;

  // 5. Soft radial contact shadow
  const [shadowCanvas, sCtx] = makeCanvas(128, 128);
  const grad = sCtx.createRadialGradient(64, 64, 12, 64, 64, 62);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.45)');
  grad.addColorStop(0.65, 'rgba(15, 23, 42, 0.16)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 128, 128);
  const contactShadowMap = new THREE.CanvasTexture(shadowCanvas);

  // 6. Orise Building Signage Plate (dynamic per KL1 / KL2 / KL3 site)
  const [signCanvas, sgCtx] = makeCanvas(512, 96);
  const drawSignage = (tierLabel: string) => {
    sgCtx.fillStyle = '#1d2126';
    sgCtx.fillRect(0, 0, 512, 96);
    // Green EcoStruxure-inspired pulse mark
    sgCtx.fillStyle = '#3dcd58';
    sgCtx.fillRect(22, 22, 52, 52);
    sgCtx.strokeStyle = '#1d2126';
    sgCtx.lineWidth = 5;
    sgCtx.lineCap = 'round';
    sgCtx.lineJoin = 'round';
    sgCtx.beginPath();
    sgCtx.moveTo(30, 48);
    sgCtx.lineTo(39, 48);
    sgCtx.lineTo(44, 34);
    sgCtx.lineTo(52, 62);
    sgCtx.lineTo(57, 48);
    sgCtx.lineTo(66, 48);
    sgCtx.stroke();
    // Typography
    sgCtx.fillStyle = '#f8fafc';
    sgCtx.font = 'bold 34px "Plus Jakarta Sans", system-ui, sans-serif';
    sgCtx.fillText('ORISE DCIM', 92, 50);
    sgCtx.fillStyle = '#3dcd58';
    sgCtx.font = '600 17px "IBM Plex Mono", monospace';
    sgCtx.fillText(tierLabel.toUpperCase(), 92, 74);
  };
  drawSignage('KL1 · TIER IV PRIMARY');

  const signageMap = new THREE.CanvasTexture(signCanvas);
  signageMap.colorSpace = THREE.SRGBColorSpace;
  signageMap.anisotropy = aniso;

  const updateSignageText = (tierLabel: string) => {
    drawSignage(tierLabel);
    signageMap.needsUpdate = true;
  };

  return {
    raisedFloorMap,
    facadePanelMap,
    rackDoorMap,
    asphaltMap,
    paverMap,
    solarPanelMap,
    monumentSignMap,
    contactShadowMap,
    signageMap,
    updateSignageText,
    dispose: () => {
      raisedFloorMap.dispose();
      facadePanelMap.dispose();
      rackDoorMap.dispose();
      asphaltMap.dispose();
      paverMap.dispose();
      solarPanelMap.dispose();
      monumentSignMap.dispose();
      contactShadowMap.dispose();
      signageMap.dispose();
    },
  };
}

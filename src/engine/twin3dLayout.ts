import { BmsState, ColdAisleRowSensorMetric, SlaComplianceStatus } from './bmsTypes';
import { computeDewPointC, evaluateSlaMetricStatus } from './bmsEngine';
import { INITIAL_RACKS, RACKS_PER_ROW, ROWS_PER_HALL } from './seedData';
import type { SiteId } from './sites';
import { HallId, NodeStatus, RackDefinition, ServerNode } from './types';

export type TwinViewMode = 'building' | 'cutaway' | 'datahall';
export type TwinOverlayMode = 'standard' | 'thermal' | 'power' | 'sla';

export type TwinCameraPresetId =
  | 'campus'
  | 'visitor-parking'
  | 'admin-office'
  | 'cutaway'
  | 'telecom-rooms'
  | 'battery-rooms'
  | 'chiller-plant'
  | 'hall-a'
  | 'hall-b'
  | 'hall-c'
  | 'hall-d'
  | 'mep'
  | 'basement-fuel'
  | 'top';

export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

export interface CameraPreset {
  id: TwinCameraPresetId;
  label: string;
  position: Vec3Tuple;
  target: Vec3Tuple;
  defaultCutaway: number; // 0 = building closed, 1 = roof & outer shell fully cut away
  defaultViewMode: TwinViewMode;
}

export interface HallZoneBounds {
  hallId: HallId;
  code: 'A' | 'B' | 'C' | 'D';
  label: string;
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
}

export interface Rack3DPlacement {
  index: number;
  rackId: string;
  hallId: HallId;
  rowNumber: number;
  rackIndex: number;
  x: number;
  z: number;
  rotationY: number;
}

export interface Crac3DPlacement {
  cracId: string;
  hallId: HallId;
  coolingType: 'CRAC' | 'Liquid CDU';
  x: number;
  z: number;
  rotationY: number;
}

export interface FacilityAsset3DPlacement {
  assetId: string;
  kind: 'ups' | 'generator';
  x: number;
  z: number;
  rotationY: number;
}

export interface Chiller3DPlacement {
  chillerId: string;
  chillerType: 'Water-Cooled' | 'Air-Cooled';
  loop: 'Loop A' | 'Loop B';
  x: number;
  z: number;
}

export interface ChwTankPump3DPlacement {
  pumpSetId: string;
  loop: 'Loop A' | 'Loop B';
  servedChillerId: string;
  x: number;
  z: number;
}

export interface DieselTank3DPlacement {
  tankId: string;
  redundancyPath: 'Path A' | 'Path B';
  servedGeneratorId: string;
  x: number;
  y: number;
  z: number;
}

export interface ElectricalChain3DPlacement {
  nodeId: string;
  stage: 'HV' | 'MSB' | 'OPSWB';
  redundancyPath: 'Path A' | 'Path B';
  x: number;
  z: number;
}

export type ParkingBayKind = 'standard' | 'ev' | 'accessible';

export interface VisitorParkingBay3D {
  bayId: string;
  wing: 'West' | 'East';
  row: 'North' | 'South';
  kind: ParkingBayKind;
  hasSolarCanopy: boolean;
  occupied: boolean;
  vehicleStyle?: 'sedan' | 'suv' | 'ev-crossover';
  vehicleColorHex?: number;
  x: number;
  z: number;
  width: number;
  depth: number;
  facingAngleY: number;
}

export interface LandscapeTree3D {
  x: number;
  z: number;
  species: 'broadleaf' | 'cypress' | 'palm';
  scale: number;
  rotationY: number;
  tintHex: number;
}

export interface Rack3DMetric {
  rackId: string;
  hallId: HallId;
  rowNumber: number;
  rackIndex: number;
  status: NodeStatus;
  powerKw: number;
  powerCapacityKw: number;
  utilizationPct: number;
  peakTempC: number;
  serverCount: number;
  hottestServerId: string | null;
}

export interface ColdAisleSlaSensor3DPlacement {
  index: number;
  sensorId: string;
  hallId: HallId;
  hallCode: 'A' | 'B' | 'C' | 'D';
  hallLabel: string;
  rowNumber: number;
  rowLabel: string;
  slot: 'A' | 'B';
  rackIndex: number;
  positionLabel: 'West · Rack 05' | 'East · Rack 16';
  redundancyPath: 'Path A' | 'Path B';
  x: number;
  y: number;
  z: number;
  rotationY: number;
}

export type TelecomRoomId = 'mdf-room' | 'network-room' | 'mmr-room';

export interface TelecomRoom3DPlacement {
  roomId: TelecomRoomId;
  code: 'MDF' | 'NET' | 'MMR';
  name: string;
  subtitle: string;
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  rackCount: number;
  fiberCapacityTbps: number;
  carrierCount: number;
  redundancyPath: 'Path A · West POE' | 'Dual Core A+B' | 'Dual-Diverse Carrier A+B';
  accentColorHex: number;
  poeManhole?: { x: number; z: number; label: string };
}

export interface TelecomRoomTelemetryMetric {
  roomId: TelecomRoomId;
  throughputTbps: number;
  capacityTbps: number;
  utilizationPct: number;
  activeCrossConnects: number;
  carrierOrUplinkSummary: string;
  roomTempC: number;
  roomHumidityPct: number;
  opticalLossDb: number;
  status: 'Nominal' | 'Warning';
}

export interface AdminOfficeBounds {
  id: 'admin-office';
  name: string;
  subtitle: string;
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  wallHeight: number;
  floorY: number;
}

export interface DataHallWalkwaySegment3D {
  id: string;
  label: string;
  zone: 'exterior-bridge' | 'interior-connector' | 'central-spine' | 'cross-spine';
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
}

export type SiteBuildingStyleId = 'hyperscale-quad' | 'twin-wing-campus' | 'modular-fortress';

export interface SiteBuildingLayoutSpec {
  siteId: SiteId;
  styleId: SiteBuildingStyleId;
  architectureName: string;
  architectureSummary: string;
  wallHeight: number;
  facadeColorHex: number;
  darkFacadeColorHex: number;
  accentTrimHex: number;
  accentTrimCss: string;
  accentEmissiveHex: number;
  roofDeckColorHex: number;
  eastApronMaxX: number;
  adminWingSide: 'SW' | 'SE' | 'NW';
  adminOffice: AdminOfficeBounds;
  walkwaySegments: DataHallWalkwaySegment3D[];
  hasBriseSoleilFins: boolean;
  hasCantileverSkyDeck: boolean;
  hasRoofAcousticScreen: boolean;
  hasNorthHelipad: boolean;
  hasCornerServiceTowers: boolean;
  hasCentralRoofSolarArray: boolean;
  hasSouthPorteCochereArch: boolean;
}

export interface BatteryRoom3DPlacement {
  roomId: 'batt-room-a' | 'batt-room-b';
  name: string;
  subtitle: string;
  redundancyPath: 'Path A' | 'Path B';
  servedUpsIds: [string, string];
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  wallHeight: number;
  rackCount: number;
  capacityKwh: number;
  dcBusVoltageV: number;
  accentColorHex: number;
}

export interface BatteryRoomTelemetryMetric {
  roomId: 'batt-room-a' | 'batt-room-b';
  avgSocPct: number;
  minRuntimeMin: number;
  totalUpsLoadKw: number;
  dcVoltageV: number;
  dcCurrentA: number;
  operatingMode: 'Float Charge · Standby' | 'Discharging → UPS' | 'Generator Sync · Recharging' | 'Fault';
  roomTempC: number;
  statusColorHex: number;
}

export interface SelectedTwinAsset {
  kind:
    | 'rack'
    | 'crac'
    | 'ups'
    | 'generator'
    | 'chiller'
    | 'chw_tank_pump'
    | 'diesel_tank'
    | 'hv'
    | 'msb'
    | 'opswb'
    | 'sla_sensor'
    | 'telecom_room'
    | 'admin_office'
    | 'datahall_walkway'
    | 'battery_room';
  id: string;
  label: string;
  subtitle: string;
}

/**
 * Hyperscale 4-Hall (2x2 Quad) Building Spatial Coordinates (1 unit = 1 meter).
 * Each Data Hall contains 20 rows x 20 racks = 400 racks (1,600 racks per site).
 */
export const BUILDING_BOUNDS = {
  mainWidth: 60.0,
  mainDepth: 94.0,
  wallHeight: 7.6,
  floorY: 0.6,
  mepWidth: 10.0,
  mepDepth: 64.0,
  mepCenterX: -35.0,
  mepCenterZ: 0.0,
  genPadX: 36.5,
  genPadZ: 0.0,
  basementFloorY: -5.6,
  basementCeilingY: -0.15,
  basementVaultCenterX: 37.5,
  basementVaultWidth: 13.6,
  basementVaultDepth: 63.0,
  rackWidth: 0.82,
  rackDepth: 1.05,
  rackHeight: 2.25,
};

export const HALL_ZONE_BOUNDS: HallZoneBounds[] = [
  { hallId: 'hall-a', code: 'A', label: 'Hall A · Core Compute', centerX: -14.5, centerZ: -22.5, width: 22.0, depth: 39.0 },
  { hallId: 'hall-b', code: 'B', label: 'Hall B · AI & GPU Fabric', centerX: 14.5, centerZ: -22.5, width: 22.0, depth: 39.0 },
  { hallId: 'hall-c', code: 'C', label: 'Hall C · Storage & Edge', centerX: -14.5, centerZ: 22.5, width: 22.0, depth: 39.0 },
  { hallId: 'hall-d', code: 'D', label: 'Hall D · Cloud & Interconnect', centerX: 14.5, centerZ: 22.5, width: 22.0, depth: 39.0 },
];

const HALL_CENTER_MAP: Record<HallId, { x: number; z: number }> = {
  'hall-a': { x: -14.5, z: -22.5 },
  'hall-b': { x: 14.5, z: -22.5 },
  'hall-c': { x: -14.5, z: 22.5 },
  'hall-d': { x: 14.5, z: 22.5 },
};

const RACK_PITCH_X = 0.94;
const PAIR_PITCH_Z = 3.7;
const COLD_AISLE_HALF_Z = 0.92;

function buildRack3DPlacements(): Rack3DPlacement[] {
  const placements: Rack3DPlacement[] = [];
  const halfRowSpanX = ((RACKS_PER_ROW - 1) * RACK_PITCH_X) / 2;
  const pairsCount = ROWS_PER_HALL / 2; // 10 hot/cold aisle pairs
  const halfHallSpanZ = ((pairsCount - 1) * PAIR_PITCH_Z) / 2;

  INITIAL_RACKS.forEach((rack, idx) => {
    const hallCenter = HALL_CENTER_MAP[rack.hallId];
    const colIdx = rack.rackIndex - 1; // 0..19
    const rowIdx = rack.rowNumber - 1; // 0..19
    const pairIdx = Math.floor(rowIdx / 2); // 0..9
    const isSecondInPair = rowIdx % 2 === 1;

    const localX = -halfRowSpanX + colIdx * RACK_PITCH_X;
    const pairCenterZ = -halfHallSpanZ + pairIdx * PAIR_PITCH_Z;
    const localZ = pairCenterZ + (isSecondInPair ? COLD_AISLE_HALF_Z : -COLD_AISLE_HALF_Z);

    placements.push({
      index: idx,
      rackId: rack.id,
      hallId: rack.hallId,
      rowNumber: rack.rowNumber,
      rackIndex: rack.rackIndex,
      x: Number((hallCenter.x + localX).toFixed(3)),
      z: Number((hallCenter.z + localZ).toFixed(3)),
      rotationY: isSecondInPair ? Math.PI : 0,
    });
  });

  return placements;
}

export const RACK_3D_PLACEMENTS: Rack3DPlacement[] = buildRack3DPlacements();

export const SLA_SENSORS_PER_ROW = 2;
export const SLA_SENSORS_PER_HALL = ROWS_PER_HALL * SLA_SENSORS_PER_ROW; // 40 sensors per Data Hall
export const TOTAL_SLA_SENSORS_PER_SITE = HALL_ZONE_BOUNDS.length * SLA_SENSORS_PER_HALL; // 160 sensors per Site

/**
 * Generates deterministic 3D coordinates for 2 Cold Aisle SLA Temp & Humidity sensors per rack row
 * across all 4 Data Halls (4 halls x 20 rows x 2 sensors = 160 sensors per site).
 * Sensor A (Path A) mounts at West Rack 05; Sensor B (Path B) mounts at East Rack 16,
 * projecting slightly into the cold aisle intake face above the cabinet front rail.
 */
function buildColdAisleSlaSensorPlacements(): ColdAisleSlaSensor3DPlacement[] {
  const placements: ColdAisleSlaSensor3DPlacement[] = [];
  const halfRowSpanX = ((RACKS_PER_ROW - 1) * RACK_PITCH_X) / 2;
  const pairsCount = ROWS_PER_HALL / 2;
  const halfHallSpanZ = ((pairsCount - 1) * PAIR_PITCH_Z) / 2;
  const sensorSlots: Array<{
    slot: 'A' | 'B';
    rackIndex: number;
    positionLabel: 'West · Rack 05' | 'East · Rack 16';
    redundancyPath: 'Path A' | 'Path B';
  }> = [
    { slot: 'A', rackIndex: 5, positionLabel: 'West · Rack 05', redundancyPath: 'Path A' },
    { slot: 'B', rackIndex: 16, positionLabel: 'East · Rack 16', redundancyPath: 'Path B' },
  ];

  const mountY = Number(
    (BUILDING_BOUNDS.floorY + 0.1 + BUILDING_BOUNDS.rackHeight + 0.22).toFixed(3)
  );
  const coldAisleFaceOffset = BUILDING_BOUNDS.rackDepth / 2 + 0.18;

  let index = 0;
  for (const hall of HALL_ZONE_BOUNDS) {
    for (let rowNumber = 1; rowNumber <= ROWS_PER_HALL; rowNumber++) {
      const rowIdx = rowNumber - 1;
      const pairIdx = Math.floor(rowIdx / 2);
      const isSecondInPair = rowIdx % 2 === 1;
      const pairCenterZ = -halfHallSpanZ + pairIdx * PAIR_PITCH_Z;
      const rowCenterZ = pairCenterZ + (isSecondInPair ? COLD_AISLE_HALF_Z : -COLD_AISLE_HALF_Z);
      // Row 1 of a pair faces +Z into the cold aisle; Row 2 faces -Z into the cold aisle
      const coldAisleDirZ = isSecondInPair ? -1 : 1;
      const sensorZ = Number((hall.centerZ + rowCenterZ + coldAisleDirZ * coldAisleFaceOffset).toFixed(3));
      const rowCode = `R${String(rowNumber).padStart(2, '0')}`;
      const rowLabel = `${hall.code}-${rowCode}`;

      for (const s of sensorSlots) {
        const colIdx = s.rackIndex - 1;
        const localX = -halfRowSpanX + colIdx * RACK_PITCH_X;
        placements.push({
          index: index++,
          sensorId: `SLA-${hall.code}-${rowCode}-${s.slot}`,
          hallId: hall.hallId,
          hallCode: hall.code,
          hallLabel: hall.label,
          rowNumber,
          rowLabel,
          slot: s.slot,
          rackIndex: s.rackIndex,
          positionLabel: s.positionLabel,
          redundancyPath: s.redundancyPath,
          x: Number((hall.centerX + localX).toFixed(3)),
          y: mountY,
          z: sensorZ,
          rotationY: isSecondInPair ? Math.PI : 0,
        });
      }
    }
  }

  return placements;
}

export const COLD_AISLE_SLA_SENSOR_PLACEMENTS: ColdAisleSlaSensor3DPlacement[] =
  buildColdAisleSlaSensorPlacements();

// Certified Tier IV 2N Cooling Galleries: Halls A/C/D Air CRACs + Hall B Direct-to-Chip Liquid Cooling CDUs (CDU-B1/B2)
export const CRAC_3D_PLACEMENTS: Crac3DPlacement[] = [
  { cracId: 'crac-a1', hallId: 'hall-a', coolingType: 'CRAC', x: -27.2, z: -32.0, rotationY: Math.PI / 2 },
  { cracId: 'crac-a2', hallId: 'hall-a', coolingType: 'CRAC', x: -27.2, z: -13.0, rotationY: Math.PI / 2 },
  { cracId: 'crac-b1', hallId: 'hall-b', coolingType: 'Liquid CDU', x: 27.2, z: -32.0, rotationY: -Math.PI / 2 },
  { cracId: 'crac-b2', hallId: 'hall-b', coolingType: 'Liquid CDU', x: 27.2, z: -13.0, rotationY: -Math.PI / 2 },
  { cracId: 'crac-c1', hallId: 'hall-c', coolingType: 'CRAC', x: -27.2, z: 13.0, rotationY: Math.PI / 2 },
  { cracId: 'crac-c2', hallId: 'hall-c', coolingType: 'CRAC', x: -27.2, z: 32.0, rotationY: Math.PI / 2 },
  { cracId: 'crac-d1', hallId: 'hall-d', coolingType: 'CRAC', x: 27.2, z: 13.0, rotationY: -Math.PI / 2 },
  { cracId: 'crac-d2', hallId: 'hall-d', coolingType: 'CRAC', x: 27.2, z: 32.0, rotationY: -Math.PI / 2 },
];

// Certified Tier IV 2(N+1) Critical Power: 4 UPS bays (Bus A & Bus B vaults) + 8 Diesel Generators (East Yards A & B, 2 columns x 4 rows)
export const FACILITY_ASSET_PLACEMENTS: FacilityAsset3DPlacement[] = [
  { assetId: 'ups-a1', kind: 'ups', x: -35.0, z: -24.0, rotationY: Math.PI / 2 },
  { assetId: 'ups-a2', kind: 'ups', x: -35.0, z: -10.0, rotationY: Math.PI / 2 },
  { assetId: 'ups-b1', kind: 'ups', x: -35.0, z: 10.0, rotationY: Math.PI / 2 },
  { assetId: 'ups-b2', kind: 'ups', x: -35.0, z: 24.0, rotationY: Math.PI / 2 },
  // West Generator Column (x = 34.4)
  { assetId: 'gen-a1', kind: 'generator', x: 34.4, z: -24.0, rotationY: -Math.PI / 2 },
  { assetId: 'gen-a2', kind: 'generator', x: 34.4, z: -10.0, rotationY: -Math.PI / 2 },
  { assetId: 'gen-b1', kind: 'generator', x: 34.4, z: 10.0, rotationY: -Math.PI / 2 },
  { assetId: 'gen-b2', kind: 'generator', x: 34.4, z: 24.0, rotationY: -Math.PI / 2 },
  // East Generator Column (x = 40.4)
  { assetId: 'gen-a3', kind: 'generator', x: 40.4, z: -24.0, rotationY: -Math.PI / 2 },
  { assetId: 'gen-a4', kind: 'generator', x: 40.4, z: -10.0, rotationY: -Math.PI / 2 },
  { assetId: 'gen-b3', kind: 'generator', x: 40.4, z: 10.0, rotationY: -Math.PI / 2 },
  { assetId: 'gen-b4', kind: 'generator', x: 40.4, z: 24.0, rotationY: -Math.PI / 2 },
];

// Basement Level B1 Bulk Diesel Fuel Vault: 8 Double-Walled UL-2085 Cylindrical Tanks paired 1:1 with the 8 East-Yard Generators
export const DIESEL_TANK_3D_PLACEMENTS: DieselTank3DPlacement[] = [
  { tankId: 'diesel-a1', redundancyPath: 'Path A', servedGeneratorId: 'gen-a1', x: 38.2, y: -5.5, z: -26.8 },
  { tankId: 'diesel-a2', redundancyPath: 'Path A', servedGeneratorId: 'gen-a2', x: 38.2, y: -5.5, z: -20.2 },
  { tankId: 'diesel-a3', redundancyPath: 'Path A', servedGeneratorId: 'gen-a3', x: 38.2, y: -5.5, z: -13.6 },
  { tankId: 'diesel-a4', redundancyPath: 'Path A', servedGeneratorId: 'gen-a4', x: 38.2, y: -5.5, z: -7.0 },
  { tankId: 'diesel-b1', redundancyPath: 'Path B', servedGeneratorId: 'gen-b1', x: 38.2, y: -5.5, z: 7.0 },
  { tankId: 'diesel-b2', redundancyPath: 'Path B', servedGeneratorId: 'gen-b2', x: 38.2, y: -5.5, z: 13.6 },
  { tankId: 'diesel-b3', redundancyPath: 'Path B', servedGeneratorId: 'gen-b3', x: 38.2, y: -5.5, z: 20.2 },
  { tankId: 'diesel-b4', redundancyPath: 'Path B', servedGeneratorId: 'gen-b4', x: 38.2, y: -5.5, z: 26.8 },
];

// West Electrical Yard & MEP Progression: HV (132kV/11kV) -> MSB (415V 6300A) -> OPSWB (415V) -> Electrical (IT) + Mechanical
export const ELECTRICAL_CHAIN_3D_PLACEMENTS: ElectricalChain3DPlacement[] = [
  { nodeId: 'hv-a', stage: 'HV', redundancyPath: 'Path A', x: -51.0, z: -17.0 },
  { nodeId: 'hv-b', stage: 'HV', redundancyPath: 'Path B', x: -51.0, z: 17.0 },
  { nodeId: 'msb-a', stage: 'MSB', redundancyPath: 'Path A', x: -43.2, z: -17.0 },
  { nodeId: 'msb-b', stage: 'MSB', redundancyPath: 'Path B', x: -43.2, z: 17.0 },
  { nodeId: 'opswb-a', stage: 'OPSWB', redundancyPath: 'Path A', x: -30.9, z: -17.0 },
  { nodeId: 'opswb-b', stage: 'OPSWB', redundancyPath: 'Path B', x: -30.9, z: 17.0 },
];

// Rooftop Central Chiller Plant: 2 Water-Cooled Centrifugal Chillers (2N) + 14 Air-Cooled Chillers (7× Loop A + 7× Loop B)
export const CHILLER_3D_PLACEMENTS: Chiller3DPlacement[] = [
  { chillerId: 'chw-01', chillerType: 'Water-Cooled', loop: 'Loop A', x: -14.5, z: -31.0 },
  { chillerId: 'chw-02', chillerType: 'Water-Cooled', loop: 'Loop B', x: 14.5, z: -31.0 },
  // Loop A Air Chillers (7 units spaced 9.2m along Z)
  { chillerId: 'cha-a1', chillerType: 'Air-Cooled', loop: 'Loop A', x: -14.5, z: -18.5 },
  { chillerId: 'cha-a2', chillerType: 'Air-Cooled', loop: 'Loop A', x: -14.5, z: -9.3 },
  { chillerId: 'cha-a3', chillerType: 'Air-Cooled', loop: 'Loop A', x: -14.5, z: -0.1 },
  { chillerId: 'cha-a4', chillerType: 'Air-Cooled', loop: 'Loop A', x: -14.5, z: 9.1 },
  { chillerId: 'cha-a5', chillerType: 'Air-Cooled', loop: 'Loop A', x: -14.5, z: 18.3 },
  { chillerId: 'cha-a6', chillerType: 'Air-Cooled', loop: 'Loop A', x: -14.5, z: 27.5 },
  { chillerId: 'cha-a7', chillerType: 'Air-Cooled', loop: 'Loop A', x: -14.5, z: 36.7 },
  // Loop B Air Chillers (7 units spaced 9.2m along Z)
  { chillerId: 'cha-b1', chillerType: 'Air-Cooled', loop: 'Loop B', x: 14.5, z: -18.5 },
  { chillerId: 'cha-b2', chillerType: 'Air-Cooled', loop: 'Loop B', x: 14.5, z: -9.3 },
  { chillerId: 'cha-b3', chillerType: 'Air-Cooled', loop: 'Loop B', x: 14.5, z: -0.1 },
  { chillerId: 'cha-b4', chillerType: 'Air-Cooled', loop: 'Loop B', x: 14.5, z: 9.1 },
  { chillerId: 'cha-b5', chillerType: 'Air-Cooled', loop: 'Loop B', x: 14.5, z: 18.3 },
  { chillerId: 'cha-b6', chillerType: 'Air-Cooled', loop: 'Loop B', x: 14.5, z: 27.5 },
  { chillerId: 'cha-b7', chillerType: 'Air-Cooled', loop: 'Loop B', x: 14.5, z: 36.7 },
];

// Rooftop Water Chiller Big Square Thermal Buffer Tanks (2 x 180,000 L) + Complete 3-Pump VFD Pump Sets directly paired with CHW-01 & CHW-02
export const CHW_TANK_PUMP_3D_PLACEMENTS: ChwTankPump3DPlacement[] = [
  { pumpSetId: 'chw-tank-a', loop: 'Loop A', servedChillerId: 'chw-01', x: -14.5, z: -41.5 },
  { pumpSetId: 'chw-tank-b', loop: 'Loop B', servedChillerId: 'chw-02', x: 14.5, z: -41.5 },
];

// South Telecom & Interconnect Wing (z = 42.3..46.4, flanking the South NOC Lobby Entrance x = -6.8..+6.8)
// TIA-942-B Rated-4 physically segregated MDF Room, Core Network Room, and Dual-Diverse Carrier Meet-Me Room (MMR)
export const TELECOM_ROOM_PLACEMENTS: TelecomRoom3DPlacement[] = [
  {
    roomId: 'mdf-room',
    code: 'MDF',
    name: 'MDF Room · Main Distribution Frame',
    subtitle: '6 High-Density ODF Racks · 13,824 OS2/OM4 Fiber Ports · West POE Vault',
    centerX: -23.2,
    centerZ: 44.35,
    width: 10.8,
    depth: 4.1,
    rackCount: 6,
    fiberCapacityTbps: 128,
    carrierCount: 4,
    redundancyPath: 'Path A · West POE',
    accentColorHex: 0xf59e0b,
    poeManhole: { x: -33.5, z: 44.35, label: 'West Diverse Fiber POE-A' },
  },
  {
    roomId: 'network-room',
    code: 'NET',
    name: 'Network Room · Core Spine & DWDM',
    subtitle: '5 Core 800G Spine/DWDM Racks · NOC Routing Console · 2N Optical Fabric',
    centerX: -12.3,
    centerZ: 44.35,
    width: 10.2,
    depth: 4.1,
    rackCount: 5,
    fiberCapacityTbps: 256,
    carrierCount: 8,
    redundancyPath: 'Dual Core A+B',
    accentColorHex: 0x06b6d4,
  },
  {
    roomId: 'mmr-room',
    code: 'MMR',
    name: 'Meet-Me Room (MMR) · Carrier Interconnect',
    subtitle: '10 Dual-Zone Carrier Demarc Racks · 14 Tier-1 Carriers · East POE Vault',
    centerX: 17.9,
    centerZ: 44.35,
    width: 21.4,
    depth: 4.1,
    rackCount: 10,
    fiberCapacityTbps: 400,
    carrierCount: 14,
    redundancyPath: 'Dual-Diverse Carrier A+B',
    accentColorHex: 0x10b981,
    poeManhole: { x: 33.5, z: 44.35, label: 'East Diverse Fiber POE-B' },
  },
];

// South-West Architectural Admin & Operations Office Pavilion (clear of HV/MSB, MEP Wing, West POE, and Visitor Parking)
export const ADMIN_OFFICE_BOUNDS: AdminOfficeBounds = {
  id: 'admin-office',
  name: 'Admin & Operations Office',
  subtitle: 'NOC Reception · 8 Engineer Desks · Executive Conference Room · Biometric Access',
  centerX: -46.25,
  centerZ: 43.5,
  width: 19.5,
  depth: 16.0,
  wallHeight: 5.4,
  floorY: 0.6,
};

// Enclosed Glazed Security Bridge + Interior Illuminated Personnel Walkway feeding Halls A, B, C & D
export const DATAHALL_WALKWAY_SEGMENTS: DataHallWalkwaySegment3D[] = [
  {
    id: 'walkway-admin-bridge',
    label: 'Enclosed Glazed Admin → Data Center Security Bridge',
    zone: 'exterior-bridge',
    centerX: -33.25,
    centerZ: 38.6,
    width: 6.5,
    depth: 3.2,
  },
  {
    id: 'walkway-west-gallery',
    label: 'West Mantrap Vestibule → South Data Hall Promenade',
    zone: 'interior-connector',
    centerX: -27.2,
    centerZ: 40.0,
    width: 5.2,
    depth: 2.8,
  },
  {
    id: 'walkway-south-promenade',
    label: 'South Personnel Walkway (Admin Bridge → Central Spine)',
    zone: 'interior-connector',
    centerX: -14.8,
    centerZ: 41.45,
    width: 29.6,
    depth: 1.35,
  },
  {
    id: 'walkway-central-spine',
    label: 'Central North-South Data Hall Spine Walkway (Halls A–D)',
    zone: 'central-spine',
    centerX: 0.0,
    centerZ: 2.0,
    width: 2.6,
    depth: 86.0,
  },
  {
    id: 'walkway-cross-spine',
    label: 'Central East-West Cross-Hall Walkway (Hall A/C ↔ Hall B/D)',
    zone: 'cross-spine',
    centerX: 0.0,
    centerZ: 0.0,
    width: 52.0,
    depth: 2.4,
  },
];

// Distinct architectural building layouts & campus wing configurations per Data Center Site (KL1, KL2, KL3)
export const SITE_BUILDING_LAYOUTS: Record<SiteId, SiteBuildingLayoutSpec> = {
  kl1: {
    siteId: 'kl1',
    styleId: 'hyperscale-quad',
    architectureName: 'Hyperscale Quad Flagship',
    architectureSummary: 'Pearl Insulated Cladding · EcoStruxure Green Fascia · SW Admin Pavilion',
    wallHeight: 7.6,
    facadeColorHex: 0xeff3f7,
    darkFacadeColorHex: 0x3b4450,
    accentTrimHex: 0x3dcd58,
    accentTrimCss: '#3DCD58',
    accentEmissiveHex: 0x009530,
    roofDeckColorHex: 0x262d36,
    eastApronMaxX: 50.0,
    adminWingSide: 'SW',
    adminOffice: ADMIN_OFFICE_BOUNDS,
    walkwaySegments: DATAHALL_WALKWAY_SEGMENTS,
    hasBriseSoleilFins: false,
    hasCantileverSkyDeck: false,
    hasRoofAcousticScreen: false,
    hasNorthHelipad: false,
    hasCornerServiceTowers: false,
    hasCentralRoofSolarArray: false,
    hasSouthPorteCochereArch: false,
  },
  kl2: {
    siteId: 'kl2',
    styleId: 'twin-wing-campus',
    architectureName: 'Twin-Wing Brise-Soleil & Sky-Deck',
    architectureSummary: 'Titanium Graphite Louvered Facade · Cobalt Cyan Trim · Elevated NOC Sky-Deck · SE Admin Wing & Helipad',
    wallHeight: 9.2,
    facadeColorHex: 0x475569,
    darkFacadeColorHex: 0x1e293b,
    accentTrimHex: 0x0ea5e9,
    accentTrimCss: '#0EA5E9',
    accentEmissiveHex: 0x0284c7,
    roofDeckColorHex: 0x1e293b,
    eastApronMaxX: 59.0,
    adminWingSide: 'SE',
    adminOffice: {
      id: 'admin-office',
      name: 'KL2 East Admin & Sky-Deck Annex',
      subtitle: 'SE Operations Wing · East Security Bridge · NOC Reception · Conference Suite',
      centerX: 46.25,
      centerZ: 43.5,
      width: 19.5,
      depth: 16.0,
      wallHeight: 5.8,
      floorY: 0.6,
    },
    walkwaySegments: [
      {
        id: 'walkway-admin-bridge',
        label: 'Enclosed Glazed East Admin → Data Center Security Bridge',
        zone: 'exterior-bridge',
        centerX: 33.25,
        centerZ: 38.6,
        width: 6.5,
        depth: 3.2,
      },
      {
        id: 'walkway-west-gallery',
        label: 'East Mantrap Vestibule → South Data Hall Promenade',
        zone: 'interior-connector',
        centerX: 27.2,
        centerZ: 40.0,
        width: 5.2,
        depth: 2.8,
      },
      {
        id: 'walkway-south-promenade',
        label: 'South-East Personnel Walkway (East Bridge → Central Spine)',
        zone: 'interior-connector',
        centerX: 14.8,
        centerZ: 41.45,
        width: 29.6,
        depth: 1.35,
      },
      {
        id: 'walkway-central-spine',
        label: 'Central North-South Data Hall Spine Walkway (Halls A–D)',
        zone: 'central-spine',
        centerX: 0.0,
        centerZ: 2.0,
        width: 2.6,
        depth: 86.0,
      },
      {
        id: 'walkway-cross-spine',
        label: 'Central East-West Cross-Hall Walkway (Hall A/C ↔ Hall B/D)',
        zone: 'cross-spine',
        centerX: 0.0,
        centerZ: 0.0,
        width: 52.0,
        depth: 2.4,
      },
    ],
    hasBriseSoleilFins: true,
    hasCantileverSkyDeck: true,
    hasRoofAcousticScreen: true,
    hasNorthHelipad: true,
    hasCornerServiceTowers: false,
    hasCentralRoofSolarArray: false,
    hasSouthPorteCochereArch: false,
  },
  kl3: {
    siteId: 'kl3',
    styleId: 'modular-fortress',
    architectureName: 'Modular Solar Fortress & Corner Towers',
    architectureSummary: 'Sandstone Precast Concrete · Amber Gold Fascia · 4 Corner Riser Towers · Central Roof Solar PV · NW Command Annex',
    wallHeight: 7.0,
    facadeColorHex: 0xd8d0c2,
    darkFacadeColorHex: 0x44403c,
    accentTrimHex: 0xf59e0b,
    accentTrimCss: '#F59E0B',
    accentEmissiveHex: 0xb45309,
    roofDeckColorHex: 0x292524,
    eastApronMaxX: 50.0,
    adminWingSide: 'NW',
    adminOffice: {
      id: 'admin-office',
      name: 'KL3 North-West Command & Operations Annex',
      subtitle: 'NW Edge Ops Annex · North Security Bridge · 8 Workstations · Biometric Access',
      centerX: -46.25,
      centerZ: -43.5,
      width: 19.5,
      depth: 13.0,
      wallHeight: 5.2,
      floorY: 0.6,
    },
    walkwaySegments: [
      {
        id: 'walkway-admin-bridge',
        label: 'Enclosed Glazed NW Command Annex → Data Center Bridge',
        zone: 'exterior-bridge',
        centerX: -33.25,
        centerZ: -43.5,
        width: 6.5,
        depth: 3.2,
      },
      {
        id: 'walkway-west-gallery',
        label: 'North-West Mantrap Vestibule → North Data Hall Promenade',
        zone: 'interior-connector',
        centerX: -27.2,
        centerZ: -43.5,
        width: 5.2,
        depth: 2.8,
      },
      {
        id: 'walkway-south-promenade',
        label: 'North Personnel Walkway (NW Bridge → Central Spine)',
        zone: 'interior-connector',
        centerX: -14.8,
        centerZ: -43.5,
        width: 29.6,
        depth: 1.55,
      },
      {
        id: 'walkway-central-spine',
        label: 'Central North-South Data Hall Spine Walkway (Halls A–D)',
        zone: 'central-spine',
        centerX: 0.0,
        centerZ: 0.0,
        width: 2.6,
        depth: 89.0,
      },
      {
        id: 'walkway-cross-spine',
        label: 'Central East-West Cross-Hall Walkway (Hall A/C ↔ Hall B/D)',
        zone: 'cross-spine',
        centerX: 0.0,
        centerZ: 0.0,
        width: 52.0,
        depth: 2.4,
      },
    ],
    hasBriseSoleilFins: false,
    hasCantileverSkyDeck: false,
    hasRoofAcousticScreen: false,
    hasNorthHelipad: false,
    hasCornerServiceTowers: true,
    hasCentralRoofSolarArray: true,
    hasSouthPorteCochereArch: true,
  },
};

export function getSiteBuildingLayout(siteId: SiteId): SiteBuildingLayoutSpec {
  return SITE_BUILDING_LAYOUTS[siteId] ?? SITE_BUILDING_LAYOUTS.kl1;
}

export function getSiteCameraPresets(siteId: SiteId): Record<TwinCameraPresetId, CameraPreset> {
  const layout = getSiteBuildingLayout(siteId);
  if (layout.adminWingSide === 'SE') {
    return {
      ...CAMERA_PRESETS,
      'admin-office': {
        ...CAMERA_PRESETS['admin-office'],
        position: { x: 64.0, y: 36.0, z: 86.0 },
        target: { x: 33.0, y: 1.8, z: 39.0 },
      },
      'chiller-plant': {
        ...CAMERA_PRESETS['chiller-plant'],
        target: { x: 0.0, y: 12.0, z: -26.0 },
      },
    };
  }
  if (layout.adminWingSide === 'NW') {
    return {
      ...CAMERA_PRESETS,
      'admin-office': {
        ...CAMERA_PRESETS['admin-office'],
        position: { x: -64.0, y: 36.0, z: -82.0 },
        target: { x: -33.0, y: 1.8, z: -43.0 },
      },
    };
  }
  return CAMERA_PRESETS;
}

// Dedicated 2N Lithium-Ion Battery Rooms flanking the West Electrical Yard & feeding UPS-A1/A2 (Path A) and UPS-B1/B2 (Path B)
export const BATTERY_ROOM_PLACEMENTS: BatteryRoom3DPlacement[] = [
  {
    roomId: 'batt-room-a',
    name: 'Battery Room A · Path A DC Bank',
    subtitle: '8 Li-Ion Cabinets · 3.2 MWh · 540V DC Bus → UPS-A1 & UPS-A2',
    redundancyPath: 'Path A',
    servedUpsIds: ['ups-a1', 'ups-a2'],
    centerX: -48.0,
    centerZ: -31.4,
    width: 15.0,
    depth: 5.2,
    wallHeight: 4.4,
    rackCount: 8,
    capacityKwh: 3200,
    dcBusVoltageV: 540,
    accentColorHex: 0x3dcd58,
  },
  {
    roomId: 'batt-room-b',
    name: 'Battery Room B · Path B DC Bank',
    subtitle: '8 Li-Ion Cabinets · 3.2 MWh · 540V DC Bus → UPS-B1 & UPS-B2',
    redundancyPath: 'Path B',
    servedUpsIds: ['ups-b1', 'ups-b2'],
    centerX: -48.0,
    centerZ: 31.4,
    width: 15.0,
    depth: 5.2,
    wallHeight: 4.4,
    rackCount: 8,
    capacityKwh: 3200,
    dcBusVoltageV: 540,
    accentColorHex: 0xf59e0b,
  },
];

// South Forecourt Visitor Parking Complex (28 bays: 14 West Wing + 14 East Wing, with 4 EV Chargers, 2 Accessible, & East Solar Carport)
function buildVisitorParkingBays(): VisitorParkingBay3D[] {
  const bays: VisitorParkingBay3D[] = [];
  const bayWidth = 2.85;
  const bayDepth = 5.3;
  const pitchX = 3.15;
  const palette = [
    0xf1f5f9, // Pearl White
    0x1e293b, // Midnight Slate
    0x94a3b8, // Metallic Silver
    0x1d4ed8, // Cobalt Blue
    0x0f766e, // Emerald Teal
    0x334155, // Graphite Grey
    0x991b1b, // Deep Crimson
    0xe2e8f0, // Glacier Silver
  ];

  // West Wing: 7 bays North row (z = 60.8, facing South toward drive aisle z = 67.2) + 7 bays South row (z = 73.6, facing North)
  const westXs = [-38.5, -35.35, -32.2, -29.05, -25.9, -22.75, -19.6];
  westXs.forEach((bx, idx) => {
    const num = idx + 1;
    // North row: closest to lobby -> 2 Accessible bays on right (idx 5,6), 2 EV bays (idx 3,4), 3 Standard (idx 0..2)
    const northKind: ParkingBayKind =
      idx >= 5 ? 'accessible' : idx >= 3 ? 'ev' : 'standard';
    const northOccupied = idx === 0 || idx === 2 || idx === 3 || idx === 5;
    bays.push({
      bayId: `VP-W-N${num}`,
      wing: 'West',
      row: 'North',
      kind: northKind,
      hasSolarCanopy: false,
      occupied: northOccupied,
      vehicleStyle: idx === 3 ? 'ev-crossover' : idx % 2 === 0 ? 'suv' : 'sedan',
      vehicleColorHex: palette[idx % palette.length],
      x: Number(bx.toFixed(2)),
      z: 60.8,
      width: bayWidth,
      depth: bayDepth,
      facingAngleY: 0,
    });

    // South row: 2 EV bays (idx 3,4), 5 Standard
    const southKind: ParkingBayKind = idx === 3 || idx === 4 ? 'ev' : 'standard';
    const southOccupied = idx === 1 || idx === 4 || idx === 6;
    bays.push({
      bayId: `VP-W-S${num}`,
      wing: 'West',
      row: 'South',
      kind: southKind,
      hasSolarCanopy: false,
      occupied: southOccupied,
      vehicleStyle: idx === 4 ? 'ev-crossover' : idx === 1 ? 'sedan' : 'suv',
      vehicleColorHex: palette[(idx + 3) % palette.length],
      x: Number(bx.toFixed(2)),
      z: 73.6,
      width: bayWidth,
      depth: bayDepth,
      facingAngleY: Math.PI,
    });
  });

  // East Wing: 7 bays North row (covered by Solar Carport Canopy) + 7 bays South row
  const eastXs = [19.6, 22.75, 25.9, 29.05, 32.2, 35.35, 38.5];
  eastXs.forEach((bx, idx) => {
    const num = idx + 1;
    const northOccupied = idx === 0 || idx === 2 || idx === 4 || idx === 6;
    bays.push({
      bayId: `VP-E-N${num}`,
      wing: 'East',
      row: 'North',
      kind: 'standard',
      hasSolarCanopy: true,
      occupied: northOccupied,
      vehicleStyle: idx % 3 === 0 ? 'ev-crossover' : idx % 2 === 0 ? 'sedan' : 'suv',
      vehicleColorHex: palette[(idx + 5) % palette.length],
      x: Number(bx.toFixed(2)),
      z: 60.8,
      width: bayWidth,
      depth: bayDepth,
      facingAngleY: 0,
    });

    const southOccupied = idx === 1 || idx === 3 || idx === 5;
    bays.push({
      bayId: `VP-E-S${num}`,
      wing: 'East',
      row: 'South',
      kind: 'standard',
      hasSolarCanopy: false,
      occupied: southOccupied,
      vehicleStyle: idx === 3 ? 'suv' : 'sedan',
      vehicleColorHex: palette[(idx + 2) % palette.length],
      x: Number(bx.toFixed(2)),
      z: 73.6,
      width: bayWidth,
      depth: bayDepth,
      facingAngleY: Math.PI,
    });
  });

  // Keep pitch reference clear for spacing verification
  void pitchX;
  return bays;
}

export const VISITOR_PARKING_BAYS: VisitorParkingBay3D[] = buildVisitorParkingBays();

// 3D campus landscape trees removed per user request (grounds, reflecting pools, hedges, flowerbeds, and visitor parking preserved)
export const LANDSCAPE_TREE_PLACEMENTS: LandscapeTree3D[] = [];

export const CAMERA_PRESETS: Record<TwinCameraPresetId, CameraPreset> = {
  cutaway: {
    id: 'cutaway',
    label: 'Cutaway',
    position: { x: 64.0, y: 54.0, z: 72.0 },
    target: { x: 0.0, y: 1.5, z: 0.0 },
    defaultCutaway: 1,
    defaultViewMode: 'cutaway',
  },
  campus: {
    id: 'campus',
    label: 'Building',
    position: { x: 84.0, y: 44.0, z: 108.0 },
    target: { x: 0.0, y: 2.5, z: 16.0 },
    defaultCutaway: 0,
    defaultViewMode: 'building',
  },
  'visitor-parking': {
    id: 'visitor-parking',
    label: 'Visitor Parking',
    position: { x: 47.0, y: 24.5, z: 113.0 },
    target: { x: -2.0, y: 1.8, z: 62.5 },
    defaultCutaway: 0,
    defaultViewMode: 'building',
  },
  'admin-office': {
    id: 'admin-office',
    label: 'Admin & Walkway',
    position: { x: -64.0, y: 36.0, z: 86.0 },
    target: { x: -33.0, y: 1.8, z: 39.0 },
    defaultCutaway: 1,
    defaultViewMode: 'cutaway',
  },
  'telecom-rooms': {
    id: 'telecom-rooms',
    label: 'MDF / Net / MMR',
    position: { x: 0.0, y: 34.0, z: 96.0 },
    target: { x: 0.0, y: 1.5, z: 43.0 },
    defaultCutaway: 1,
    defaultViewMode: 'cutaway',
  },
  'battery-rooms': {
    id: 'battery-rooms',
    label: 'Battery → UPS',
    position: { x: -94.0, y: 44.0, z: 10.0 },
    target: { x: -41.0, y: 1.5, z: -2.0 },
    defaultCutaway: 1,
    defaultViewMode: 'cutaway',
  },
  'chiller-plant': {
    id: 'chiller-plant',
    label: 'Chiller Plant',
    position: { x: 40.0, y: 31.0, z: -68.0 },
    target: { x: 0.0, y: 10.5, z: -26.0 },
    defaultCutaway: 0,
    defaultViewMode: 'building',
  },
  'hall-a': {
    id: 'hall-a',
    label: 'Hall A',
    position: { x: -14.5, y: 24.0, z: 12.0 },
    target: { x: -14.5, y: 1.2, z: -22.5 },
    defaultCutaway: 1,
    defaultViewMode: 'datahall',
  },
  'hall-b': {
    id: 'hall-b',
    label: 'Hall B · CDU',
    position: { x: 2.0, y: 15.0, z: -3.5 },
    target: { x: 16.5, y: 1.8, z: -24.0 },
    defaultCutaway: 1,
    defaultViewMode: 'datahall',
  },
  'hall-c': {
    id: 'hall-c',
    label: 'Hall C',
    position: { x: -14.5, y: 24.0, z: 58.0 },
    target: { x: -14.5, y: 1.2, z: 22.5 },
    defaultCutaway: 1,
    defaultViewMode: 'datahall',
  },
  'hall-d': {
    id: 'hall-d',
    label: 'Hall D',
    position: { x: 14.5, y: 24.0, z: 58.0 },
    target: { x: 14.5, y: 1.2, z: 22.5 },
    defaultCutaway: 1,
    defaultViewMode: 'datahall',
  },
  mep: {
    id: 'mep',
    label: 'HV→MSB→OPSWB',
    position: { x: -72.0, y: 26.0, z: 36.0 },
    target: { x: -40.0, y: 2.0, z: 0.0 },
    defaultCutaway: 0.9,
    defaultViewMode: 'cutaway',
  },
  'basement-fuel': {
    id: 'basement-fuel',
    label: 'Basement Fuel',
    position: { x: 69.0, y: 18.5, z: 36.0 },
    target: { x: 37.5, y: -1.6, z: 0.0 },
    defaultCutaway: 1,
    defaultViewMode: 'cutaway',
  },
  top: {
    id: 'top',
    label: 'Top Plan',
    position: { x: 0.0, y: 126.0, z: 18.0 },
    target: { x: 0.0, y: 0.0, z: 12.0 },
    defaultCutaway: 1,
    defaultViewMode: 'cutaway',
  },
};

export const CAMERA_PRESET_LIST: CameraPreset[] = [
  CAMERA_PRESETS.campus,
  CAMERA_PRESETS['visitor-parking'],
  CAMERA_PRESETS['admin-office'],
  CAMERA_PRESETS.cutaway,
  CAMERA_PRESETS['telecom-rooms'],
  CAMERA_PRESETS['battery-rooms'],
  CAMERA_PRESETS['chiller-plant'],
  CAMERA_PRESETS['hall-a'],
  CAMERA_PRESETS['hall-b'],
  CAMERA_PRESETS['hall-c'],
  CAMERA_PRESETS['hall-d'],
  CAMERA_PRESETS.mep,
  CAMERA_PRESETS['basement-fuel'],
  CAMERA_PRESETS.top,
];

/**
 * Deterministic thermal color ramp (hex) for 3D rack overlays and exhaust plumes.
 */
export function thermalColorHex(tempC: number): number {
  if (tempC >= 76) return 0xdc2626; // Critical Red
  if (tempC >= 64) return 0xd97706; // Warm Amber
  if (tempC >= 50) return 0x3dcd58; // EcoStruxure Nominal Green
  return 0x0284c7; // Cool Blue
}

/**
 * Deterministic power utilization color ramp (hex) for 3D power load overlay.
 */
export function powerLoadColorHex(utilizationPct: number): number {
  if (utilizationPct >= 80) return 0xdc2626;
  if (utilizationPct >= 60) return 0xd97706;
  if (utilizationPct >= 30) return 0x3dcd58;
  return 0x0284c7;
}

/**
 * Node status LED hex color.
 */
export function statusColorHex(status: NodeStatus): number {
  switch (status) {
    case 'critical':
      return 0xdc2626;
    case 'warning':
      return 0xd97706;
    case 'maintenance':
      return 0x64748b;
    default:
      return 0x3dcd58;
  }
}

/**
 * Aggregates live per-rack telemetry across all 1,600 racks for 3D coloring and asset inspection.
 * Racks with deeply monitored servers inherit exact server metrics; standard racks smoothly
 * couple to hall ambient/CRAC thermal shifts.
 */
export function computeRack3DMetrics(
  racks: RackDefinition[],
  servers: ServerNode[],
  bms?: BmsState
): Record<string, Rack3DMetric> {
  const serversByRack = new Map<string, ServerNode[]>();
  for (const s of servers) {
    const arr = serversByRack.get(s.rackId);
    if (arr) arr.push(s);
    else serversByRack.set(s.rackId, [s]);
  }

  const cracShiftByHall = new Map<HallId, number>();
  if (bms) {
    const byHall = new Map<HallId, typeof bms.cracUnits>();
    for (const c of bms.cracUnits) {
      const arr = byHall.get(c.hallId) ?? [];
      arr.push(c);
      byHall.set(c.hallId, arr);
    }
    for (const [hallId, units] of byHall) {
      const healthy = units.filter((c) => c.mode !== 'Fault');
      const dualFault = units.length > 0 && healthy.length === 0;
      const active = healthy.length > 0 ? healthy : units;
      const avgSupply = active.reduce((s, c) => s + c.supplyTempC, 0) / Math.max(1, active.length);
      const shift = (avgSupply - 20.6) * 0.85 + (dualFault ? 12.0 : 0);
      cracShiftByHall.set(hallId, shift);
    }
  }

  const map: Record<string, Rack3DMetric> = {};

  for (const rack of racks) {
    const nodes = serversByRack.get(rack.id);
    const hallShift = cracShiftByHall.get(rack.hallId) ?? 0;

    if (nodes && nodes.length > 0) {
      const powerKw = Number((nodes.reduce((sum, n) => sum + n.powerW, 0) / 1000).toFixed(2));
      const utilizationPct = Math.min(100, Math.round((powerKw / Math.max(1, rack.powerCapacityKw)) * 100));
      let hottest: ServerNode = nodes[0];
      for (const n of nodes) {
        if (n.tempC > hottest.tempC) hottest = n;
      }
      const status: NodeStatus = nodes.some((n) => n.status === 'critical')
        ? 'critical'
        : nodes.some((n) => n.status === 'warning')
        ? 'warning'
        : nodes.every((n) => n.status === 'maintenance')
        ? 'maintenance'
        : 'nominal';

      map[rack.id] = {
        rackId: rack.id,
        hallId: rack.hallId,
        rowNumber: rack.rowNumber,
        rackIndex: rack.rackIndex,
        status,
        powerKw,
        powerCapacityKw: rack.powerCapacityKw,
        utilizationPct,
        peakTempC: Number(hottest.tempC.toFixed(1)),
        serverCount: nodes.length,
        hottestServerId: hottest.id,
      };
    } else {
      const powerKw = rack.basePowerKw;
      const utilizationPct = Math.min(100, Math.round((powerKw / Math.max(1, rack.powerCapacityKw)) * 100));
      const peakTempC = Number(Math.max(30, Math.min(88, rack.basePeakTempC + hallShift)).toFixed(1));
      const status: NodeStatus =
        peakTempC >= 78 ? 'critical' : peakTempC >= 68 ? 'warning' : 'nominal';

      map[rack.id] = {
        rackId: rack.id,
        hallId: rack.hallId,
        rowNumber: rack.rowNumber,
        rackIndex: rack.rackIndex,
        status,
        powerKw,
        powerCapacityKw: rack.powerCapacityKw,
        utilizationPct,
        peakTempC,
        serverCount: Math.max(6, Math.round(rack.baseUsedU / 2)),
        hottestServerId: null,
      };
    }
  }

  return map;
}

/**
 * Status hex color for Cold Aisle SLA Temperature & Humidity sensors in 3D view.
 * Compliant uses crisp cyan-teal (#06b6d4) so sensors stand out clearly against dark racks & green LEDs.
 */
export function slaSensorStatusHex(status: SlaComplianceStatus): number {
  if (status === 'Breached') return 0xdc2626; // Crimson Red
  if (status === 'Warning') return 0xd97706; // Amber Near Limit
  return 0x06b6d4; // Calibrated Cyan-Teal Compliant
}

/**
 * Computes live per-sensor Cold Aisle Temperature, Relative Humidity, Dew Point, and ASHRAE Class A1
 * SLA compliance across all 160 row sensors (4 halls x 20 rows x 2 sensors/row).
 */
export function computeColdAisleSlaSensorMetrics(
  bms: BmsState,
  servers: ServerNode[]
): Record<string, ColdAisleRowSensorMetric> {
  const envByHall = new Map(bms.envSensors.map((e) => [e.hallId, e]));

  // Detect any localized row thermal hotspot from live server telemetry
  const peakTempByRowKey = new Map<string, number>();
  for (const srv of servers) {
    if (srv.status === 'maintenance') continue;
    const match = srv.rackId.match(/^([A-D])-R(\d{2})-/);
    if (!match) continue;
    const key = `${match[1]}-R${match[2]}`;
    const prev = peakTempByRowKey.get(key) ?? 0;
    if (srv.tempC > prev) peakTempByRowKey.set(key, srv.tempC);
  }

  const result: Record<string, ColdAisleRowSensorMetric> = {};

  for (const p of COLD_AISLE_SLA_SENSOR_PLACEMENTS) {
    const env = envByHall.get(p.hallId);
    const baseTemp = env ? (p.slot === 'A' ? env.probeATempC : env.probeBTempC) : 21.4;
    const baseHum = env ? (p.slot === 'A' ? env.probeAHumidityPct : env.probeBHumidityPct) : 46.0;
    const slaTempMin = env ? env.slaTempMinC : 18.0;
    const slaTempMax = env ? env.slaTempMaxC : 27.0;
    const slaHumMin = env ? env.slaHumidityMinPct : 40.0;
    const slaHumMax = env ? env.slaHumidityMaxPct : 60.0;

    // Subtle deterministic spatial gradient across rows + slot A/B offset
    const rowOffsetTemp = ((p.rowNumber % 5) - 2) * 0.14 + (p.slot === 'B' ? 0.12 : -0.08);
    const rowOffsetHum = ((p.rowNumber % 4) - 1.5) * 0.35 + (p.slot === 'B' ? -0.2 : 0.2);

    // Localized hotspot coupling if a monitored server in this row is critically hot
    const rowPeak = peakTempByRowKey.get(p.rowLabel) ?? 0;
    const hotspotLift = rowPeak >= 80 ? 0.7 : rowPeak >= 72 ? 0.35 : 0;

    const tempC = Number((baseTemp + rowOffsetTemp + hotspotLift).toFixed(1));
    const humidityPct = Number(
      Math.max(25, Math.min(75, baseHum + rowOffsetHum - hotspotLift * 0.6)).toFixed(1)
    );
    const dewPointC = computeDewPointC(tempC, humidityPct);

    const tempSlaStatus: SlaComplianceStatus =
      tempC < slaTempMin || tempC > slaTempMax
        ? 'Breached'
        : tempC < slaTempMin + 0.8 || tempC > slaTempMax - 1.5
        ? 'Warning'
        : 'Compliant';
    const humiditySlaStatus = evaluateSlaMetricStatus(humidityPct, slaHumMin, slaHumMax, 3.0);
    const overallStatus: SlaComplianceStatus =
      tempSlaStatus === 'Breached' || humiditySlaStatus === 'Breached'
        ? 'Breached'
        : tempSlaStatus === 'Warning' || humiditySlaStatus === 'Warning'
        ? 'Warning'
        : 'Compliant';

    result[p.sensorId] = {
      sensorId: p.sensorId,
      hallId: p.hallId,
      hallLabel: p.hallLabel,
      rowNumber: p.rowNumber,
      rowLabel: p.rowLabel,
      slot: p.slot,
      positionLabel: p.positionLabel,
      redundancyPath: p.redundancyPath,
      tempC,
      humidityPct,
      dewPointC,
      tempSlaStatus,
      humiditySlaStatus,
      overallStatus,
    };
  }

  return result;
}

/**
 * Resolves live status color for BMS equipment meshes across all electrical & mechanical subsystems.
 */
export function getBmsAssetStatusHex(
  bms: BmsState,
  kind: 'crac' | 'ups' | 'generator' | 'chiller' | 'chw_tank_pump' | 'diesel_tank' | 'hv' | 'msb' | 'opswb',
  id: string
): number {
  if (kind === 'chiller') {
    const ch = bms.chillers.find((c) => c.id === id);
    if (!ch) return 0x3dcd58;
    if (ch.mode === 'Fault' || ch.status === 'critical') return 0xdc2626;
    if (ch.mode === 'Standby') return 0x64748b;
    if (ch.mode === 'Boost' || ch.status === 'warning') return 0xd97706;
    return 0x3dcd58;
  }
  if (kind === 'chw_tank_pump') {
    const ps = bms.chwTankPumpSets.find((p) => p.id === id);
    if (!ps) return 0x06b6d4;
    if (ps.mode === 'Fault' || ps.status === 'critical') return 0xdc2626;
    if (ps.mode === 'Boost' || ps.status === 'warning') return 0xd97706;
    return 0x06b6d4;
  }
  if (kind === 'crac') {
    const unit = bms.cracUnits.find((c) => c.id === id);
    if (!unit) return 0x3dcd58;
    if (unit.mode === 'Fault' || unit.status === 'critical') return 0xdc2626;
    if (unit.coolingType === 'Liquid CDU') {
      return unit.mode === 'Boost' ? 0x06b6d4 : 0x10b981;
    }
    if (unit.mode === 'Boost' || unit.status === 'warning') return 0xd97706;
    return 0x3dcd58;
  }
  if (kind === 'diesel_tank') {
    const tank = bms.dieselTanks.find((t) => t.id === id);
    if (!tank) return 0xeab308;
    if (tank.interstitialLeakDetected || tank.levelPct < 25 || tank.transferPumpMode === 'Fault') return 0xdc2626;
    if (tank.transferPumpMode === 'Transferring') return 0xf59e0b;
    if (tank.transferPumpMode === 'Polishing') return 0x06b6d4;
    return 0x3dcd58;
  }
  if (kind === 'hv' || kind === 'msb' || kind === 'opswb') {
    const node = bms.electricalSwitchgear.find((n) => n.id === id);
    if (!node) return 0x3dcd58;
    if (node.status === 'critical') return 0xdc2626;
    if (node.breakerState === 'Open' || node.breakerState === 'Gen Sync' || node.status === 'warning') {
      return 0xd97706;
    }
    return 0x3dcd58;
  }
  if (kind === 'ups') {
    const ups = bms.upsSystems.find((u) => u.id === id);
    if (!ups) return 0x3dcd58;
    if (ups.mode === 'Fault' || ups.mode === 'On Battery') return 0xdc2626;
    if (ups.mode === 'Generator Sync' || ups.mode === 'Bypass') return 0xd97706;
    return 0x3dcd58;
  }
  const gen = bms.generators.find((g) => g.id === id);
  if (!gen) return 0x64748b;
  if (gen.state === 'Running · On Load') return 0x3dcd58;
  if (gen.state === 'Cranking') return 0xd97706;
  return 0x64748b;
}

/**
 * Computes live site-coupled optical throughput, cross-connect count, and climate telemetry
 * for the MDF Room, Network Core Room, and Meet-Me Room (MMR).
 */
export function computeTelecomRoomMetrics(
  room: TelecomRoom3DPlacement,
  servers: ServerNode[],
  bms: BmsState
): TelecomRoomTelemetryMetric {
  const avgNetGbps =
    servers.length > 0
      ? servers.reduce((acc, s) => acc + s.networkGbps, 0) / servers.length
      : 42;
  const loadFactor = Math.max(0.28, Math.min(0.88, 0.34 + avgNetGbps / 145));

  const hallC = bms.envSensors.find((h) => h.hallId === 'hall-c');
  const hallD = bms.envSensors.find((h) => h.hallId === 'hall-d');
  const baseAmbientC =
    room.code === 'MMR'
      ? (hallD?.coldAisleTempC ?? 21.8) - 0.6
      : (hallC?.coldAisleTempC ?? 21.6) - 0.4;
  const baseHumidity =
    room.code === 'MMR'
      ? hallD?.humidityPct ?? 46.5
      : hallC?.humidityPct ?? 45.8;

  const throughputTbps = Number((room.fiberCapacityTbps * loadFactor).toFixed(1));
  const utilizationPct = Math.round((throughputTbps / room.fiberCapacityTbps) * 100);
  const activeCrossConnects =
    room.code === 'MDF'
      ? Math.round(1420 + loadFactor * 640)
      : room.code === 'NET'
      ? Math.round(860 + loadFactor * 420)
      : Math.round(2180 + loadFactor * 920);
  const carrierOrUplinkSummary =
    room.code === 'MDF'
      ? '4 Backbone Risers · OS2/OM4 Trunking'
      : room.code === 'NET'
      ? '8 × 800G Core Spines · BGP/DWDM Active'
      : `${room.carrierCount} Tier-1 Carriers · Dual Zone A+B`;
  const opticalLossDb =
    room.code === 'MDF' ? 0.32 : room.code === 'NET' ? 0.24 : 0.38;

  return {
    roomId: room.roomId,
    throughputTbps,
    capacityTbps: room.fiberCapacityTbps,
    utilizationPct,
    activeCrossConnects,
    carrierOrUplinkSummary,
    roomTempC: Number(Math.max(18.5, Math.min(26.5, baseAmbientC)).toFixed(1)),
    roomHumidityPct: Number(Math.max(38, Math.min(58, baseHumidity)).toFixed(1)),
    opticalLossDb,
    status: baseAmbientC > 25.5 || utilizationPct > 84 ? 'Warning' : 'Nominal',
  };
}

/**
 * Computes live UPS-coupled Battery Room telemetry (State of Charge, DC Bus Voltage/Current,
 * runtime autonomy, and discharging status) for Path A and Path B battery vaults.
 */
export function computeBatteryRoomMetrics(
  room: BatteryRoom3DPlacement,
  bms: BmsState
): BatteryRoomTelemetryMetric {
  const served = bms.upsSystems.filter((u) => room.servedUpsIds.includes(u.id));
  const avgSocPct =
    served.length > 0
      ? Number(
          (served.reduce((acc, u) => acc + u.batterySocPct, 0) / served.length).toFixed(1)
        )
      : 98.5;
  const minRuntimeMin =
    served.length > 0 ? Math.min(...served.map((u) => u.runtimeMin)) : 18;
  const totalUpsLoadKw = Number(
    served.reduce((acc, u) => acc + u.loadKw, 0).toFixed(1)
  );

  const anyFault = served.some((u) => u.mode === 'Fault');
  const anyOnBattery = served.some((u) => u.mode === 'On Battery');
  const anyGenSync = served.some((u) => u.mode === 'Generator Sync');

  const operatingMode: BatteryRoomTelemetryMetric['operatingMode'] = anyFault
    ? 'Fault'
    : anyOnBattery
    ? 'Discharging → UPS'
    : anyGenSync
    ? 'Generator Sync · Recharging'
    : 'Float Charge · Standby';

  const dcVoltageV = anyOnBattery
    ? Number((room.dcBusVoltageV - (100 - avgSocPct) * 0.45).toFixed(1))
    : Number((room.dcBusVoltageV + 4.2).toFixed(1));
  const dcCurrentA = anyOnBattery
    ? Math.round((totalUpsLoadKw * 1000) / Math.max(400, dcVoltageV))
    : anyGenSync
    ? 185
    : 12;
  const roomTempC = Number((anyOnBattery ? 24.6 : 21.4).toFixed(1));
  const statusColorHex = anyFault
    ? 0xdc2626
    : anyOnBattery
    ? 0xf97316
    : anyGenSync
    ? 0xd97706
    : room.accentColorHex;

  return {
    roomId: room.roomId,
    avgSocPct,
    minRuntimeMin,
    totalUpsLoadKw,
    dcVoltageV,
    dcCurrentA,
    operatingMode,
    roomTempC,
    statusColorHex,
  };
}



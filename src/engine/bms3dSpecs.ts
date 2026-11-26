import {
  BackupGenerator,
  BmsGateway,
  BmsState,
  ChillerUnit,
  ChwTankPumpSet,
  CracUnit,
  DieselTankUnit,
  ElectricalSwitchgearNode,
  UpsSystem,
} from './bmsTypes';

export type BmsEquipmentDiscipline = 'mechanical' | 'electrical';

export type BmsEquipmentModelKind =
  | 'water-chiller'
  | 'chw-tank-pump'
  | 'air-chiller'
  | 'liquid-cdu'
  | 'crac'
  | 'diesel-tank'
  | 'hv-transformer'
  | 'msb-switchboard'
  | 'opswb-switchboard'
  | 'ups'
  | 'generator'
  | 'gateway';

export interface EquipmentSubComponent {
  id: string;
  name: string;
  partGroup: 'enclosure' | 'core' | 'piping_bus' | 'controls';
  status: 'Nominal' | 'Warning' | 'Fault' | 'Standby';
  reading: string;
  detail: string;
}

export interface EquipmentSpecPair {
  label: string;
  value: string;
}

export interface BmsEquipment3DItem {
  id: string;
  name: string;
  shortCode: string;
  discipline: BmsEquipmentDiscipline;
  modelKind: BmsEquipmentModelKind;
  subsystemLabel: string;
  redundancyLabel: string;
  protocolEndpoint: string;
  statusLabel: string;
  severityState: 'nominal' | 'warning' | 'critical' | 'standby';
  statusColorHex: number;
  summaryLine: string;
  liveTelemetry: EquipmentSpecPair[];
  electricalSpecs: EquipmentSpecPair[];
  mechanicalSpecs: EquipmentSpecPair[];
  subComponents: EquipmentSubComponent[];
  // Operational animation / state drivers for the 3D model
  fanSpeedRatio: number; // 0..1
  loadRatio: number; // 0..1
  isFault: boolean;
  isPathB: boolean;
}

function buildWaterChillerItem(ch: ChillerUnit): BmsEquipment3DItem {
  const isFault = ch.mode === 'Fault' || ch.status === 'critical';
  const isStandby = ch.mode === 'Standby';
  const loadRatio = Math.min(1, ch.coolingOutputKw / Math.max(1, ch.capacityKw));
  const deltaT = Number((ch.chwReturnTempC - ch.chwSupplyTempC).toFixed(1));
  const powerDrawKw = isFault || isStandby || ch.cop <= 0 ? 0 : ch.coolingOutputKw / ch.cop;
  const flowLs = ch.waterFlowLps;
  const approachC = Number((isFault ? 4.8 : 1.4 + loadRatio * 0.6).toFixed(1));
  const vibrationMmS = Number((isFault ? 6.4 : 1.1 + loadRatio * 0.9).toFixed(2));
  const severityState = isFault
    ? 'critical'
    : isStandby
    ? 'standby'
    : ch.status === 'warning'
    ? 'warning'
    : 'nominal';

  return {
    id: ch.id,
    name: ch.name,
    shortCode: ch.id.toUpperCase(),
    discipline: 'mechanical',
    modelKind: 'water-chiller',
    subsystemLabel: 'Water-Cooled Centrifugal Chiller + Cooling Tower',
    redundancyLabel: `${ch.chilledLoop} · 2N (${ch.role})`,
    protocolEndpoint: `${ch.protocol} · ${ch.endpoint}`,
    statusLabel: ch.mode,
    severityState,
    statusColorHex: isFault ? 0xdc2626 : isStandby ? 0x64748b : ch.status === 'warning' ? 0xd97706 : 0x3dcd58,
    summaryLine: `${(ch.coolingOutputKw / 1000).toFixed(2)} / ${(ch.capacityKw / 1000).toFixed(1)} MW · COP ${ch.cop.toFixed(2)} · CHW ${ch.chwSupplyTempC.toFixed(1)}°C`,
    liveTelemetry: [
      { label: 'Cooling Output', value: `${(ch.coolingOutputKw / 1000).toFixed(2)} MW (${Math.round(loadRatio * 100)}%)` },
      { label: 'CHW Supply / Return', value: `${ch.chwSupplyTempC.toFixed(1)}°C / ${ch.chwReturnTempC.toFixed(1)}°C (ΔT ${deltaT}°C)` },
      { label: 'Condenser Water', value: `${ch.condenserOrAmbientTempC.toFixed(1)}°C · Approach ${approachC}°C` },
      { label: 'Plant COP / Power', value: `${ch.cop.toFixed(2)} COP · ${powerDrawKw.toFixed(0)} kW` },
    ],
    electricalSpecs: [
      { label: 'Motor Drive', value: '415V 3-Ph Active Front-End VFD' },
      { label: 'Compressor Draw', value: `${powerDrawKw.toFixed(0)} kW · PF 0.98` },
      { label: 'Starter Protection', value: '1600A ACB · Harmonic Filter <3% THD' },
      { label: 'Control Feed', value: `2N UPS Backed (${ch.chilledLoop})` },
    ],
    mechanicalSpecs: [
      { label: 'Compressor Type', value: 'Dual Magnetic-Bearing Centrifugal (Oil-Free)' },
      { label: 'Refrigerant', value: 'R-1234ze(E) Low-GWP HFO' },
      { label: 'CHW Flow Rate', value: `${flowLs} L/s · 4.2 bar Header` },
      { label: 'Vibration / Acoustic', value: `${vibrationMmS} mm/s RMS · 74 dBA` },
    ],
    subComponents: [
      {
        id: `${ch.id}-comp`,
        name: 'Magnetic-Bearing Centrifugal Compressors (×2)',
        partGroup: 'core',
        status: isFault ? 'Fault' : isStandby ? 'Standby' : 'Nominal',
        reading: isFault ? 'Trip · Surge' : `${Math.round(ch.compressorLoadPct)}% Speed · ${vibrationMmS} mm/s`,
        detail: 'Oil-free levitated impeller shafts with active axial/radial position sensors',
      },
      {
        id: `${ch.id}-evap`,
        name: 'Flooded Shell-and-Tube Evaporator & Condenser',
        partGroup: 'core',
        status: isFault ? 'Warning' : 'Nominal',
        reading: `CHW ${ch.chwSupplyTempC.toFixed(1)}°C · CW ${ch.condenserOrAmbientTempC.toFixed(1)}°C`,
        detail: 'High-flux copper-nickel enhanced heat exchanger tubes with ASME flanged heads',
      },
      {
        id: `${ch.id}-tower`,
        name: 'Dual-Cell Induced-Draft Cooling Tower Stack',
        partGroup: 'enclosure',
        status: isFault ? 'Warning' : isStandby ? 'Standby' : 'Nominal',
        reading: isStandby ? 'Standby · 0% Fan' : `${ch.fanSpeedPct}% EC Fan · ${approachC}°C App`,
        detail: 'FRP corrosion-resistant casing, PVC fill media, drift eliminators & basin makeup valve',
      },
      {
        id: `${ch.id}-piping`,
        name: 'Primary CHW & CW Headers + Isolation Valves',
        partGroup: 'piping_bus',
        status: 'Nominal',
        reading: `${flowLs} L/s · 4.2 bar · Motorized Butterfly`,
        detail: 'Insulated DN300 supply/return headers with VFD primary pumps & strainers',
      },
      {
        id: `${ch.id}-vfd`,
        name: 'VFD Power Cabinet & Chiller Plant HMI',
        partGroup: 'controls',
        status: isFault ? 'Fault' : 'Nominal',
        reading: `${ch.protocol} · ${ch.endpoint}`,
        detail: 'Closed-loop PID staging controller with auto-failover to Loop peer',
      },
    ],
    fanSpeedRatio: isFault || isStandby ? 0 : Math.max(0.35, loadRatio),
    loadRatio,
    isFault,
    isPathB: ch.chilledLoop === 'Loop B',
  };
}

function buildAirChillerItem(ch: ChillerUnit): BmsEquipment3DItem {
  const isFault = ch.mode === 'Fault' || ch.status === 'critical';
  const isStandby = ch.mode === 'Standby';
  const loadRatio = Math.min(1, ch.coolingOutputKw / Math.max(1, ch.capacityKw));
  const deltaT = Number((ch.chwReturnTempC - ch.chwSupplyTempC).toFixed(1));
  const powerDrawKw = isFault || isStandby || ch.cop <= 0 ? 0 : ch.coolingOutputKw / ch.cop;
  const flowLs = ch.waterFlowLps;
  const fanPct = isFault || isStandby ? 0 : ch.fanSpeedPct;
  const severityState = isFault
    ? 'critical'
    : isStandby
    ? 'standby'
    : ch.status === 'warning'
    ? 'warning'
    : 'nominal';

  return {
    id: ch.id,
    name: ch.name,
    shortCode: ch.id.toUpperCase(),
    discipline: 'mechanical',
    modelKind: 'air-chiller',
    subsystemLabel: 'Air-Cooled V-Coil Free-Cooling Chiller',
    redundancyLabel: `${ch.chilledLoop} · 2(N+1) (${ch.role})`,
    protocolEndpoint: `${ch.protocol} · ${ch.endpoint}`,
    statusLabel: ch.mode,
    severityState,
    statusColorHex: isFault ? 0xdc2626 : isStandby ? 0x64748b : ch.status === 'warning' ? 0xd97706 : 0x3dcd58,
    summaryLine: `${(ch.coolingOutputKw / 1000).toFixed(2)} / ${(ch.capacityKw / 1000).toFixed(1)} MW · COP ${ch.cop.toFixed(2)} · Ambient ${ch.condenserOrAmbientTempC.toFixed(1)}°C`,
    liveTelemetry: [
      { label: 'Cooling Output', value: `${(ch.coolingOutputKw / 1000).toFixed(2)} MW (${Math.round(loadRatio * 100)}%)` },
      { label: 'CHW Supply / Return', value: `${ch.chwSupplyTempC.toFixed(1)}°C / ${ch.chwReturnTempC.toFixed(1)}°C` },
      { label: 'Condenser Air / Fans', value: `${ch.condenserOrAmbientTempC.toFixed(1)}°C · 6× EC Fans ${fanPct}%` },
      { label: 'Efficiency / Draw', value: `COP ${ch.cop.toFixed(2)} · ${powerDrawKw.toFixed(0)} kW` },
    ],
    electricalSpecs: [
      { label: 'Power Feed', value: `415V 3-Ph Dual Feed · ${ch.chilledLoop}` },
      { label: 'Electrical Load', value: `${powerDrawKw.toFixed(0)} kW · Rapid Restart <45s` },
      { label: 'Fan Array Drive', value: '6× Brushless DC EC Motors (0–950 RPM)' },
      { label: 'Panel Protection', value: 'IP55 Outdoor MCC · 800A MCCB' },
    ],
    mechanicalSpecs: [
      { label: 'Coil Architecture', value: 'Micro-Channel Aluminum V-Bank Coils + E-Coat' },
      { label: 'Compressor Stage', value: 'Twin Inverter Screw Compressors (Independent Circuits)' },
      { label: 'Glycol / CHW Flow', value: `${flowLs} L/s · 3.8 bar Differential` },
      { label: 'Free-Cooling', value: 'Integrated Airside Economizer Bypass' },
    ],
    subComponents: [
      {
        id: `${ch.id}-vcoil`,
        name: 'Micro-Channel V-Bank Condenser Coils (×6)',
        partGroup: 'enclosure',
        status: isFault ? 'Warning' : 'Nominal',
        reading: `Air-On ${ch.condenserOrAmbientTempC.toFixed(1)}°C · ΔP 42 Pa`,
        detail: 'Anti-corrosion e-coated aluminum finned coils angled at 32° for high heat rejection',
      },
      {
        id: `${ch.id}-fans`,
        name: 'Top-Discharge Axial EC Condenser Fans (×6)',
        partGroup: 'enclosure',
        status: isFault ? 'Fault' : isStandby ? 'Standby' : 'Nominal',
        reading: `${fanPct}% Speed · ${Math.round(fanPct * 9.2)} RPM`,
        detail: 'Aerodynamic composite impellers with acoustic diffuser shrouds & variable speed control',
      },
      {
        id: `${ch.id}-screw`,
        name: 'Twin Inverter Screw Compressors & Evaporator',
        partGroup: 'core',
        status: isFault ? 'Fault' : isStandby ? 'Standby' : 'Nominal',
        reading: `${Math.round(ch.compressorLoadPct)}% Load · CHW ${ch.chwSupplyTempC.toFixed(1)}°C`,
        detail: 'Dual independent refrigeration circuits with electronic expansion valves (EEV)',
      },
      {
        id: `${ch.id}-manifold`,
        name: 'Insulated CHW Manifold & Motorized Isolation Valves',
        partGroup: 'piping_bus',
        status: 'Nominal',
        reading: `${flowLs} L/s · ΔT ${deltaT}°C`,
        detail: 'Victaulic grooved stainless headers with ultrasonic flowmeter & relief valves',
      },
      {
        id: `${ch.id}-mcc`,
        name: 'IP55 Outdoor Control Panel & BMS Gateway',
        partGroup: 'controls',
        status: isFault ? 'Fault' : 'Nominal',
        reading: `${ch.protocol} · ${ch.endpoint}`,
        detail: 'Fast-restart ultracapacitor PLC bridge maintaining telemetry during utility transfer',
      },
    ],
    fanSpeedRatio: isFault || isStandby ? 0 : Math.max(0.3, loadRatio),
    loadRatio,
    isFault,
    isPathB: ch.chilledLoop === 'Loop B',
  };
}

function buildChwTankPumpItem(ps: ChwTankPumpSet): BmsEquipment3DItem {
  const isFault = ps.mode === 'Fault' || ps.status === 'critical';
  const isBoost = ps.mode === 'Boost';
  const loadRatio = Math.min(1, ps.vfdSpeedPct / 100);
  const storedLiters = Math.round((ps.tankCapacityLiters * ps.tankLevelPct) / 100);
  const severityState = isFault ? 'critical' : isBoost ? 'warning' : 'nominal';

  return {
    id: ps.id,
    name: ps.name,
    shortCode: ps.id.toUpperCase(),
    discipline: 'mechanical',
    modelKind: 'chw-tank-pump',
    subsystemLabel: 'Rooftop 180kL Square Thermal Buffer Tank + Complete 3-Pump VFD Skid',
    redundancyLabel: `${ps.chilledLoop} · 2(N+1) · Feeds ${ps.servedChillerId.toUpperCase()}`,
    protocolEndpoint: `${ps.protocol} · ${ps.endpoint}`,
    statusLabel: `${ps.mode} (${ps.activePumps}/${ps.totalPumps} Pumps)`,
    severityState,
    statusColorHex: isFault ? 0xdc2626 : isBoost ? 0xd97706 : 0x06b6d4,
    summaryLine: `${(storedLiters / 1000).toFixed(1)}k / ${(ps.tankCapacityLiters / 1000).toFixed(0)}k L · ${ps.flowRateLps} L/s @ ${ps.dischargePressureBar.toFixed(1)} bar`,
    liveTelemetry: [
      { label: 'Square Buffer Tank', value: `${ps.tankLevelPct.toFixed(1)}% (${(storedLiters / 1000).toFixed(1)}k L)` },
      { label: 'Water Temp / Autonomy', value: `${ps.waterTempC.toFixed(1)}°C · ${ps.bufferAutonomyMin} min Ride-Through` },
      { label: 'Active VFD Pumps', value: `${ps.activePumps} / ${ps.totalPumps} Running · ${ps.vfdSpeedPct}% VFD` },
      { label: 'Header Flow / Head', value: `${ps.flowRateLps} L/s · ${ps.dischargePressureBar.toFixed(1)} bar (${ps.pumpPowerKw.toFixed(0)} kW)` },
    ],
    electricalSpecs: [
      { label: 'Pump Motor Set', value: ps.pumpConfigLabel },
      { label: 'OPSWB Mech Feed', value: `415V 3-Ph Dual MCC Feeder (${ps.redundancyPath})` },
      { label: 'VFD Drive Cabinet', value: '3× IP54 Active-Harmonic VFD Drives w/ Bypass' },
      { label: 'Control Interlock', value: `${ps.protocol} · Differential Pressure PID` },
    ],
    mechanicalSpecs: [
      { label: 'Tank Vessel', value: '180,000 L Square Sectional Insulated Steel Tank + 100mm PIR Cladding' },
      { label: 'Pump Architecture', value: '3× End-Suction Horizontal Centrifugal Pumps (2 Duty + 1 N+1)' },
      { label: 'Valves & Strainers', value: 'DN300 Suction Strainers, Check & Triple-Duty Valves' },
      { label: 'Expansion & Air Sep', value: 'Pressurized Bladder Expansion Vessel + Microbubble Air Sep' },
    ],
    subComponents: [
      {
        id: `${ps.id}-vessel`,
        name: '180,000 L Square Insulated Sectional Chilled-Water Tank',
        partGroup: 'enclosure',
        status: 'Nominal',
        reading: `${ps.tankLevelPct.toFixed(1)}% · ${ps.waterTempC.toFixed(1)}°C · ${ps.bufferAutonomyMin}m Buffer`,
        detail: 'Square panelized thermally stratified steel water tank with external corner ribs, girth bands, top inspection hatch & safety rail',
      },
      {
        id: `${ps.id}-pumps`,
        name: 'Triplex VFD Centrifugal Pump Skid (2 Duty + 1 N+1)',
        partGroup: 'core',
        status: isFault ? 'Fault' : isBoost ? 'Warning' : 'Nominal',
        reading: `${ps.activePumps}/${ps.totalPumps} Active · ${ps.flowRateLps} L/s · ${ps.vfdSpeedPct}%`,
        detail: 'Heavy steel inertia base with vibration isolators, bronze impellers, and mechanical shaft seals',
      },
      {
        id: `${ps.id}-headers`,
        name: 'Suction / Discharge Headers, Y-Strainers & Valves',
        partGroup: 'piping_bus',
        status: 'Nominal',
        reading: `${ps.dischargePressureBar.toFixed(1)} bar · DN300 Insulated`,
        detail: 'Twin welded carbon-steel suction/discharge manifolds tied directly into CHW-01/CHW-02 and roof ring',
      },
      {
        id: `${ps.id}-vfd`,
        name: 'Weatherproof Triplex VFD & Lead-Lag PLC Cabinet',
        partGroup: 'controls',
        status: isFault ? 'Fault' : 'Nominal',
        reading: `${ps.pumpPowerKw.toFixed(0)} kW · ${ps.endpoint}`,
        detail: 'Automatic duty/standby rotation, soft-start ramp control, and differential pressure feedback',
      },
    ],
    fanSpeedRatio: isFault ? 0 : Math.max(0.35, loadRatio),
    loadRatio,
    isFault,
    isPathB: ps.chilledLoop === 'Loop B',
  };
}

function buildLiquidCduItem(c: CracUnit): BmsEquipment3DItem {
  const isFault = c.mode === 'Fault' || c.status === 'critical';
  const isBoost = c.mode === 'Boost';
  const loadRatio = Math.min(1, c.coolingOutputKw / Math.max(1, c.maxCoolingKw));
  const flowLpm = c.coolantFlowLpm ?? 1420;
  const supC = c.coolantSupplyTempC ?? 24.4;
  const retC = c.coolantReturnTempC ?? 36.6;
  const deltaP = c.deltaPBar ?? 1.84;
  const hxEff = c.heatExchangerEffPct ?? 94.7;
  const severityState = isFault ? 'critical' : isBoost ? 'warning' : 'nominal';

  return {
    id: c.id,
    name: `${c.name} · Liquid Cooling CDU`,
    shortCode: c.name.toUpperCase(),
    discipline: 'mechanical',
    modelKind: 'liquid-cdu',
    subsystemLabel: 'Hall B Direct-to-Chip Liquid Cooling Distribution Unit (2N)',
    redundancyLabel: `${c.hallLabel} · ${c.redundancyPath} (${c.chilledLoop})`,
    protocolEndpoint: `${c.protocol} · ${c.endpoint}`,
    statusLabel: `${c.mode} · Direct-to-Chip`,
    severityState,
    statusColorHex: isFault ? 0xdc2626 : isBoost ? 0x06b6d4 : 0x10b981,
    summaryLine: `Coolant ${supC.toFixed(1)}°C → ${retC.toFixed(1)}°C · ${flowLpm} L/min · ΔP ${deltaP.toFixed(2)} bar · ${(c.coolingOutputKw / 1000).toFixed(2)} MW`,
    liveTelemetry: [
      { label: 'Secondary Coolant', value: `${supC.toFixed(1)}°C Sup / ${retC.toFixed(1)}°C Ret` },
      { label: 'Coolant Flow / ΔP', value: `${flowLpm} L/min · ${deltaP.toFixed(2)} bar` },
      { label: 'Heat Rejection', value: `${(c.coolingOutputKw / 1000).toFixed(2)} / ${(c.maxCoolingKw / 1000).toFixed(1)} MW` },
      { label: 'VFD Pumps / HX Eff', value: `${c.fanSpeedPct}% VFD · ${hxEff.toFixed(1)}% Plate HX` },
    ],
    electricalSpecs: [
      { label: 'Dual OPSWB Feed', value: `415V 3-Ph Mechanical Feeder (${c.redundancyPath})` },
      { label: 'Circulating Pumps', value: '2× Redundant VFD Magnet-Drive Stainless Pumps' },
      { label: 'Dew-Point Guard', value: 'Auto Anti-Condensation Supply Tracking (>+2°C DP)' },
      { label: 'BMS Telemetry', value: `${c.protocol} (${c.endpoint})` },
    ],
    mechanicalSpecs: [
      { label: 'Heat Exchanger', value: '316L Stainless Brazed-Plate Liquid-to-Liquid HX' },
      { label: 'Coolant Chemistry', value: `PG${c.glycolMixPct ?? 25} Inhibited Propylene Glycol + DI Water` },
      { label: 'Filtration', value: 'Duplex 25-Micron Stainless Mesh Cartridges' },
      { label: 'Hall B Manifolds', value: 'Overhead Supply/Return Stainless Headers + Quick-Disconnects' },
    ],
    subComponents: [
      {
        id: `${c.id}-hx`,
        name: '316L Brazed-Plate Liquid-to-Liquid Heat Exchanger',
        partGroup: 'core',
        status: isFault ? 'Fault' : 'Nominal',
        reading: `Eff ${hxEff.toFixed(1)}% · Primary CHW ${c.chilledWaterValvePct}%`,
        detail: 'Separates facility chilled water (Loop A/B) from ultra-clean secondary GPU cold-plate coolant',
      },
      {
        id: `${c.id}-pumps`,
        name: 'Duplex VFD Coolant Circulating Pumps (N+1)',
        partGroup: 'core',
        status: isFault ? 'Fault' : isBoost ? 'Warning' : 'Nominal',
        reading: `${flowLpm} L/min · ${deltaP.toFixed(2)} bar · ${c.fanSpeedPct}%`,
        detail: 'Seal-less magnetically coupled stainless impellers delivering constant differential pressure to GPU racks',
      },
      {
        id: `${c.id}-expansion`,
        name: 'Twin Expansion Vessels & 25µm Filter Canisters',
        partGroup: 'enclosure',
        status: 'Nominal',
        reading: `PG${c.glycolMixPct ?? 25} Coolant · Zero Air Entrainment`,
        detail: 'Automatic de-aeration, pressure stabilization, and micro-particulate protection for GPU micro-channels',
      },
      {
        id: `${c.id}-manifolds`,
        name: 'Hall B Overhead Supply/Return Manifolds & Drip Pan',
        partGroup: 'piping_bus',
        status: 'Nominal',
        reading: `Sup ${supC.toFixed(1)}°C · Ret ${retC.toFixed(1)}°C · Leak Pan Dry`,
        detail: 'Cyan supply and coral-red return headers spanning all 10 Hall B GPU row pairs with blind-mate drops',
      },
      {
        id: `${c.id}-plc`,
        name: 'CDU Touch HMI & Dew-Point Tracking Controller',
        partGroup: 'controls',
        status: isFault ? 'Fault' : 'Nominal',
        reading: `SP ${c.setpointC.toFixed(1)}°C · ${c.mode}`,
        detail: 'Real-time leak detection, conductivity monitoring, and automatic peer CDU-B1/B2 failover',
      },
    ],
    fanSpeedRatio: isFault ? 0 : c.fanSpeedPct / 100,
    loadRatio,
    isFault,
    isPathB: c.redundancyPath === 'Path B',
  };
}

function buildDieselTankItem(tank: DieselTankUnit): BmsEquipment3DItem {
  const isFault = tank.interstitialLeakDetected || tank.levelPct < 25 || tank.transferPumpMode === 'Fault';
  const isTransfer = tank.transferPumpMode === 'Transferring';
  const loadRatio = Math.min(1, tank.levelPct / 100);
  const severityState = isFault ? 'critical' : isTransfer ? 'warning' : 'nominal';

  return {
    id: tank.id,
    name: `${tank.name} · 50,000 L Basement Diesel Tank`,
    shortCode: tank.name,
    discipline: 'mechanical',
    modelKind: 'diesel-tank',
    subsystemLabel: 'Basement Level B1 Double-Walled UL-2085 Bulk Diesel Tank',
    redundancyLabel: `${tank.vaultZone} · Supplies ${tank.servedGenerators.join(' & ')}`,
    protocolEndpoint: `${tank.protocol} · ${tank.endpoint}`,
    statusLabel: `${tank.levelPct.toFixed(1)}% · ${tank.transferPumpMode}`,
    severityState,
    statusColorHex: isFault ? 0xdc2626 : isTransfer ? 0xf59e0b : 0x3dcd58,
    summaryLine: `${tank.currentLiters.toLocaleString()} / ${tank.capacityLiters.toLocaleString()} L · ${tank.supplyPressureBar.toFixed(1)} bar → ${tank.servedGenerators.join('/')}`,
    liveTelemetry: [
      { label: 'Diesel Volume', value: `${tank.currentLiters.toLocaleString()} / ${tank.capacityLiters.toLocaleString()} L` },
      { label: 'Reserve Level', value: `${tank.levelPct.toFixed(1)}% (Site 96h Pool)` },
      { label: 'Transfer Pump Skid', value: `${tank.transferPumpMode} · ${tank.supplyPressureBar.toFixed(1)} bar` },
      { label: 'Fuel Temp / Bund', value: `${tank.fuelTempC.toFixed(1)}°C · ${tank.interstitialLeakDetected ? 'LEAK ALARM' : 'Dry Interstitial'}` },
    ],
    electricalSpecs: [
      { label: 'OPSWB Mech Feed', value: `415V 3-Ph Essential Mechanical Bus (${tank.redundancyPath})` },
      { label: 'Transfer Motors', value: 'Duplex 7.5 kW Ex-d Explosion-Proof Gear Pumps' },
      { label: 'Level & Leak Gauge', value: 'Magnetostrictive Radar Level + Optical Interstitial Probe' },
      { label: 'SCADA Interface', value: `${tank.protocol} (${tank.endpoint})` },
    ],
    mechanicalSpecs: [
      { label: 'Tank Construction', value: 'UL-2085 Fire-Rated Double-Walled Steel Cylinder' },
      { label: 'Containment Vault', value: 'Basement B1 110% Bunded Reinforced Concrete Vault' },
      { label: 'Riser Pipework', value: `Dual-Contained DN80 Supply/Return Risers to ${tank.servedGenerators.join(' & ')}` },
      { label: 'Fuel Quality', value: 'Automated 5µm Water-Separator Polishing Loop' },
    ],
    subComponents: [
      {
        id: `${tank.id}-vessel`,
        name: '50,000 L Double-Walled Cylindrical Pressure Shell',
        partGroup: 'enclosure',
        status: isFault ? 'Fault' : 'Nominal',
        reading: `${tank.levelPct.toFixed(1)}% · ${tank.currentLiters.toLocaleString()} L`,
        detail: '2-hour fire-rated concrete-interstitial secondary containment tank on seismic steel saddles',
      },
      {
        id: `${tank.id}-pumpskid`,
        name: 'Duplex Fuel Transfer & Polishing Pump Skid',
        partGroup: 'core',
        status: isFault ? 'Fault' : isTransfer ? 'Warning' : 'Nominal',
        reading: `${tank.transferPumpMode} · ${tank.supplyPressureBar.toFixed(1)} bar`,
        detail: 'Duty/standby positive-displacement transfer pumps with coalescing water separator filters',
      },
      {
        id: `${tank.id}-risers`,
        name: 'Vertical Supply/Return Risers to Generator Day Tanks',
        partGroup: 'piping_bus',
        status: 'Nominal',
        reading: `Feeds ${tank.servedGenerators.join(' & ')}`,
        detail: 'Fire-damped shaft risers delivering pressurized ultra-low-sulfur diesel from Basement B1 to Ground Yard',
      },
      {
        id: `${tank.id}-gauge`,
        name: 'ATG Level Mast, Interstitial Leak Sensor & Vent',
        partGroup: 'controls',
        status: tank.interstitialLeakDetected ? 'Fault' : 'Nominal',
        reading: `${tank.fuelTempC.toFixed(1)}°C · ${tank.interstitialLeakDetected ? 'Alarm' : 'Dry'}`,
        detail: 'Continuous automatic tank gauging (ATG) with high/low overfill shutoff & Modbus RTU telemetry',
      },
    ],
    fanSpeedRatio: isTransfer ? 0.9 : tank.transferPumpMode === 'Polishing' ? 0.45 : 0,
    loadRatio,
    isFault,
    isPathB: tank.redundancyPath === 'Path B',
  };
}

function buildSwitchgearItem(node: ElectricalSwitchgearNode): BmsEquipment3DItem {
  const isFault = node.status === 'critical';
  const isWarn = node.status === 'warning' || node.breakerState !== 'Closed';
  const loadRatio = Math.min(1, node.activeLoadKw / Math.max(1, node.ratedKva));
  const modelKind: BmsEquipmentModelKind =
    node.stage === 'HV'
      ? 'hv-transformer'
      : node.stage === 'MSB'
      ? 'msb-switchboard'
      : 'opswb-switchboard';

  const subsystemLabel =
    node.stage === 'HV'
      ? '132kV / 11kV GIS Switchgear & 20 MVA Step-Down Transformer'
      : node.stage === 'MSB'
      ? '415V 6300A Form 4B Main Switchboard (HV + Gen Closed-Transition ATS)'
      : '415V Output Switchboard — Dual Electrical (IT) & Mechanical Distribution';

  const severityState = isFault ? 'critical' : isWarn ? 'warning' : 'nominal';

  return {
    id: node.id,
    name: node.name,
    shortCode: node.id.toUpperCase(),
    discipline: 'electrical',
    modelKind,
    subsystemLabel,
    redundancyLabel: `${node.redundancyPath} (${node.feedBus}) · 2N Tier IV Chain`,
    protocolEndpoint: `${node.protocol} · ${node.endpoint}`,
    statusLabel: `${node.breakerState} · ${(node.activeLoadKw / 1000).toFixed(2)} MW`,
    severityState,
    statusColorHex: isFault ? 0xdc2626 : isWarn ? 0xd97706 : 0x3dcd58,
    summaryLine: `${node.voltageLabel} · Total ${(node.activeLoadKw / 1000).toFixed(2)} MW (Elec ${(node.electricalServeKw / 1000).toFixed(2)} MW + Mech ${(node.mechanicalServeKw / 1000).toFixed(2)} MW)`,
    liveTelemetry: [
      { label: 'Total Bus Load', value: `${(node.activeLoadKw / 1000).toFixed(2)} / ${(node.ratedKva / 1000).toFixed(0)} MVA` },
      { label: 'Electrical (IT) Serve', value: `${(node.electricalServeKw / 1000).toFixed(2)} MW` },
      { label: 'Mechanical Serve', value: `${(node.mechanicalServeKw / 1000).toFixed(2)} MW` },
      { label: 'Breaker / PQ', value: `${node.breakerState} · PF ${node.powerFactor.toFixed(2)} · ${node.thdPct.toFixed(1)}% THD` },
    ],
    electricalSpecs: [
      { label: 'Voltage / Rating', value: `${node.voltageLabel} · ${(node.ratedKva / 1000).toFixed(0)} MVA` },
      { label: 'Upstream Source', value: node.upstreamSource },
      { label: 'Downstream Feeders', value: node.downstreamTargets.join(' | ') },
      { label: 'Protection Relay', value: 'IEC 61850 / Modbus TCP Numerical Differential & Arc-Flash Relay' },
    ],
    mechanicalSpecs: [
      { label: 'Enclosure Class', value: node.stage === 'HV' ? 'IP55 Outdoor Oil-Free / ONAN Finned Tank' : 'IEC 61439 Form 4B Type 7 Segregated Steel' },
      { label: 'Busbar System', value: node.stage === 'HV' ? 'SF6-Free Vacuum GIS + Cast-Resin HV Bushings' : 'Tin-Plated Laminated Copper Main Bus (100kA 1s)' },
      { label: 'Thermal Monitoring', value: 'Continuous IR Fiber-Optic Busbar Hot-Spot Sensors' },
      { label: 'Seismic & Safety', value: 'Arc-Flash Exhaust Plenum + Interlocked Earth Switches' },
    ],
    subComponents:
      node.stage === 'HV'
        ? [
            {
              id: `${node.id}-bushings`,
              name: '132kV Porcelain HV Bushings & Surge Arrestors (×3)',
              partGroup: 'enclosure',
              status: isWarn ? 'Warning' : 'Nominal',
              reading: `${node.breakerState} · ${node.upstreamSource}`,
              detail: 'High-creepage outdoor insulator sheds accepting redundant utility grid intake',
            },
            {
              id: `${node.id}-core`,
              name: '20 MVA Step-Down Core & Finned Cooling Radiator Banks',
              partGroup: 'core',
              status: isFault ? 'Fault' : 'Nominal',
              reading: `${(node.activeLoadKw / 1000).toFixed(2)} MW · ONAN/ONAF Cooling`,
              detail: 'Low-loss grain-oriented silicon steel windings with Buchholz gas & winding temperature relays',
            },
            {
              id: `${node.id}-conservator`,
              name: 'Overhead Conservator Drum & MV Output Bus Duct',
              partGroup: 'piping_bus',
              status: 'Nominal',
              reading: `Feeds ${node.downstreamTargets.join(', ')}`,
              detail: 'Sealed nitrogen-cushion expansion drum and armored bus duct feeding MSB incoming ACB',
            },
            {
              id: `${node.id}-relay`,
              name: 'IEC 61850 HV Protection & SCADA Marshalling Panel',
              partGroup: 'controls',
              status: isWarn ? 'Warning' : 'Nominal',
              reading: `PF ${node.powerFactor.toFixed(2)} · ${node.endpoint}`,
              detail: 'Differential protection, tap-changer OLTC control, and automatic utility-loss trip signaling',
            },
          ]
        : node.stage === 'MSB'
        ? [
            {
              id: `${node.id}-incomer`,
              name: '6300A Draw-Out Incomer ACB & Generator Sync ATS',
              partGroup: 'core',
              status: isWarn ? 'Warning' : 'Nominal',
              reading: `${node.breakerState} · ${node.upstreamSource}`,
              detail: 'Closed-transition motorized Air Circuit Breakers seamlessly syncing Utility HV and Standby Generators',
            },
            {
              id: `${node.id}-busbar`,
              name: 'Laminated Copper Main Busbar Chamber (100kA Rated)',
              partGroup: 'piping_bus',
              status: 'Nominal',
              reading: `${(node.activeLoadKw / 1000).toFixed(2)} MW Active Throughput`,
              detail: 'Fully shrouded Form 4B tin-plated copper busbars feeding UPS modules & OPSWB switchgear',
            },
            {
              id: `${node.id}-split`,
              name: 'Outgoing Feeder Cubicles (UPS + Mechanical Tie)',
              partGroup: 'enclosure',
              status: 'Nominal',
              reading: `Elec ${(node.electricalServeKw / 1000).toFixed(2)} MW · Mech ${(node.mechanicalServeKw / 1000).toFixed(2)} MW`,
              detail: 'Dedicated selective-coordinated breakers isolating critical IT UPS and essential mechanical plants',
            },
            {
              id: `${node.id}-meter`,
              name: 'Power Quality Analyzer & Mimic Control HMI',
              partGroup: 'controls',
              status: 'Nominal',
              reading: `THD ${node.thdPct.toFixed(1)}% · ${node.endpoint}`,
              detail: 'Class 0.2S revenue metering, waveform capture, and automated load-shedding PLC',
            },
          ]
        : [
            {
              id: `${node.id}-elec-sec`,
              name: 'Electrical / IT Distribution Bay (Hall A–D Busways)',
              partGroup: 'core',
              status: 'Nominal',
              reading: `${(node.electricalServeKw / 1000).toFixed(2)} MW → 4 Data Halls`,
              detail: 'UPS-backed 415V distribution breakers feeding overhead Busway A/B and 1,600 rack rPDUs',
            },
            {
              id: `${node.id}-mech-sec`,
              name: 'Mechanical Plant Distribution Bay (Chillers/CDU/Fuel)',
              partGroup: 'core',
              status: 'Nominal',
              reading: `${(node.mechanicalServeKw / 1000).toFixed(2)} MW → HVAC & Fuel`,
              detail: 'Dedicated breakers serving Rooftop Chillers, CHW Pump Skids, Hall B Liquid CDUs, CRACs & Basement Diesel Pumps',
            },
            {
              id: `${node.id}-risers`,
              name: 'Dual Overhead Copper Busways & Mechanical Feeder Ducts',
              partGroup: 'piping_bus',
              status: 'Nominal',
              reading: `${node.feedBus} · Dual Segregated Risers`,
              detail: 'Color-coded green/orange IT bus ducts plus teal/blue essential mechanical cable ladders',
            },
            {
              id: `${node.id}-scada`,
              name: 'OPSWB Branch Metering & Arc-Flash Protection HMI',
              partGroup: 'controls',
              status: isWarn ? 'Warning' : 'Nominal',
              reading: `${node.breakerState} · PF ${node.powerFactor.toFixed(2)}`,
              detail: 'Per-branch kW/kVA/harmonic telemetry feeding BMS PUE & Tier IV power path validation',
            },
          ],
    fanSpeedRatio: isFault ? 0 : Math.max(0.25, loadRatio),
    loadRatio,
    isFault,
    isPathB: node.redundancyPath === 'Path B',
  };
}

function buildCracItem(c: CracUnit): BmsEquipment3DItem {
  const isFault = c.mode === 'Fault' || c.status === 'critical';
  const isBoost = c.mode === 'Boost';
  const loadRatio = Math.min(1, c.coolingOutputKw / Math.max(1, c.maxCoolingKw));
  const airflowCfm = Math.round((c.fanSpeedPct / 100) * 32000);
  const deltaT = Number((c.returnTempC - c.supplyTempC).toFixed(1));
  const severityState = isFault
    ? 'critical'
    : isBoost || c.status === 'warning'
    ? 'warning'
    : 'nominal';

  return {
    id: c.id,
    name: c.name,
    shortCode: c.id.toUpperCase(),
    discipline: 'mechanical',
    modelKind: 'crac',
    subsystemLabel: 'Precision Downflow CRAH / CRAC Gallery Unit',
    redundancyLabel: `${c.hallLabel} · ${c.redundancyPath} (${c.chilledLoop}) · 2N`,
    protocolEndpoint: `${c.protocol} · ${c.endpoint}`,
    statusLabel: c.mode,
    severityState,
    statusColorHex: isFault ? 0xdc2626 : isBoost || c.status === 'warning' ? 0xd97706 : 0x3dcd58,
    summaryLine: `Supply ${c.supplyTempC.toFixed(1)}°C (SP ${c.setpointC.toFixed(1)}°C) · Fan ${c.fanSpeedPct}% · ${c.coolingOutputKw.toFixed(0)} kW`,
    liveTelemetry: [
      { label: 'Supply / Return Air', value: `${c.supplyTempC.toFixed(1)}°C / ${c.returnTempC.toFixed(1)}°C (ΔT ${deltaT}°C)` },
      { label: 'Setpoint / Mode', value: `${c.setpointC.toFixed(1)}°C · ${c.mode}` },
      { label: 'EC Plug Fans', value: `${c.fanSpeedPct}% (${airflowCfm.toLocaleString()} CFM)` },
      { label: 'CHW Valve / Load', value: `${c.chilledWaterValvePct}% Open · ${c.coolingOutputKw.toFixed(0)} / ${c.maxCoolingKw} kW` },
    ],
    electricalSpecs: [
      { label: 'Dual ATS Input', value: `415V 3-Ph (${c.redundancyPath} Primary + Peer STS)` },
      { label: 'Blower Motors', value: '3× High-Efficiency EC Backward-Curved Plug Fans' },
      { label: 'Static Control', value: 'Underfloor Pressure Transducer (25 Pa Target)' },
      { label: 'BMS Interface', value: `${c.protocol} (${c.endpoint})` },
    ],
    mechanicalSpecs: [
      { label: 'Airflow Config', value: 'Raised-Floor Downflow with Top Return Plenum' },
      { label: 'Heat Exchanger', value: '4-Row Hydrophilic Aluminum Fin Chilled-Water Coil' },
      { label: 'Filtration', value: 'MERV-13 Pleated Bank + Differential ΔP Switch' },
      { label: 'Hydronic Loop', value: `${c.chilledLoop} · 3-Way Characterized Control Valve` },
    ],
    subComponents: [
      {
        id: `${c.id}-plenum`,
        name: 'Top Return Acoustic Plenum & MERV-13 Filter Bank',
        partGroup: 'enclosure',
        status: 'Nominal',
        reading: `Return ${c.returnTempC.toFixed(1)}°C · ΔP 118 Pa`,
        detail: 'Sound-attenuated top intake hood capturing hot-aisle ceiling return airflow',
      },
      {
        id: `${c.id}-coil`,
        name: 'Slanted Chilled-Water Cooling Coil Assembly',
        partGroup: 'core',
        status: isFault ? 'Fault' : isBoost ? 'Warning' : 'Nominal',
        reading: `ΔT ${deltaT}°C · ${c.coolingOutputKw.toFixed(0)} kW`,
        detail: 'Stainless drain pan with condensate leak rope sensor & copper-tube coil bank',
      },
      {
        id: `${c.id}-blowers`,
        name: 'Underfloor EC Plug-Fan Array (×3)',
        partGroup: 'core',
        status: isFault ? 'Fault' : isBoost ? 'Warning' : 'Nominal',
        reading: `${c.fanSpeedPct}% · ${airflowCfm.toLocaleString()} CFM`,
        detail: 'Variable-speed electronically commutated impellers pressurizing raised floor',
      },
      {
        id: `${c.id}-valve`,
        name: 'Chilled-Water Risers & Modulating Control Valve',
        partGroup: 'piping_bus',
        status: isFault ? 'Warning' : 'Nominal',
        reading: `Valve ${c.chilledWaterValvePct}% · ${c.chilledLoop}`,
        detail: 'Insulated supply/return headers with Belimo actuator & balancing circuit setter',
      },
      {
        id: `${c.id}-hmi`,
        name: 'Microprocessor Controller & Cold-Aisle PID Link',
        partGroup: 'controls',
        status: isFault ? 'Fault' : 'Nominal',
        reading: `SP ${c.setpointC.toFixed(1)}°C · ${c.mode}`,
        detail: 'Closed-loop feedback linked to 40 hall cold-aisle ASHRAE Class A1 SLA probes',
      },
    ],
    fanSpeedRatio: isFault ? 0 : c.fanSpeedPct / 100,
    loadRatio,
    isFault,
    isPathB: c.redundancyPath === 'Path B',
  };
}

function buildUpsItem(u: UpsSystem): BmsEquipment3DItem {
  const isFault = u.mode === 'Fault';
  const isBattery = u.mode === 'On Battery';
  const isBypassOrSync = u.mode === 'Bypass' || u.mode === 'Generator Sync';
  const loadPct = Math.round((u.loadKw / Math.max(1, u.capacityKw)) * 100);
  const loadRatio = Math.min(1, u.loadKw / Math.max(1, u.capacityKw));
  const outputVoltageV = isFault ? 0 : 415;
  const efficiencyPct = isFault ? 0 : Number((96.8 - (1 - loadRatio) * 0.6).toFixed(1));
  const dcBusV = isFault ? 0 : isBattery ? 472 : 540;
  const thdiPct = isFault ? 0 : Number((1.8 + loadRatio * 0.9).toFixed(1));
  const severityState =
    isFault || isBattery ? 'critical' : isBypassOrSync ? 'warning' : 'nominal';

  return {
    id: u.id,
    name: u.name,
    shortCode: u.id.toUpperCase(),
    discipline: 'electrical',
    modelKind: 'ups',
    subsystemLabel: 'Tier IV 2(N+1) Double-Conversion Modular UPS & Battery Vault',
    redundancyLabel: `${u.feedBus} · ${u.redundancyPath} · ${u.role}`,
    protocolEndpoint: `${u.protocol} · ${u.endpoint}`,
    statusLabel: u.mode,
    severityState,
    statusColorHex:
      isFault || isBattery ? 0xdc2626 : isBypassOrSync ? 0xd97706 : 0x3dcd58,
    summaryLine: `${(u.loadKw / 1000).toFixed(2)} / ${(u.capacityKw / 1000).toFixed(1)} MW (${loadPct}%) · SoC ${u.batterySocPct.toFixed(0)}% · ${u.runtimeMin} min`,
    liveTelemetry: [
      { label: 'Operating Mode', value: u.mode },
      { label: 'Active Load', value: `${u.loadKw.toFixed(0)} / ${u.capacityKw} kW (${loadPct}%)` },
      { label: 'Input / Output AC', value: `${u.inputVoltageV.toFixed(0)}V → ${outputVoltageV}V · ${u.outputFreqHz.toFixed(1)} Hz` },
      { label: 'Battery Bank', value: `${u.batterySocPct.toFixed(1)}% SoC · ${u.runtimeMin} min · DC ${dcBusV}V` },
    ],
    electricalSpecs: [
      { label: 'Topology', value: 'VFI-SS-111 True Online Double-Conversion' },
      { label: 'Efficiency / THDi', value: `${efficiencyPct.toFixed(1)}% · Input THDi ${thdiPct}%` },
      { label: 'Power Modules', value: '4× Hot-Swappable IGBT Rectifier/Inverter Bays' },
      { label: 'Switchgear & Bus', value: `${u.feedBus} · 4000A Copper Busway + STS Bypass` },
    ],
    mechanicalSpecs: [
      { label: 'Battery Chemistry', value: 'LiFePO4 Modular String Cabinets (BMS Monitored)' },
      { label: 'Cabinet Cooling', value: 'Front-to-Top Redundant Variable-Speed Cooling Fans' },
      { label: 'Seismic / Enclosure', value: 'IP20 Powder-Coated Steel · Zone 2 Anchored' },
      { label: 'Thermal Sensor', value: `Battery Rack ${isBattery ? '28.4°C' : '22.6°C'} (Nominal)` },
    ],
    subComponents: [
      {
        id: `${u.id}-igbt`,
        name: 'Modular IGBT Rectifier & Inverter Stack (×4 Bays)',
        partGroup: 'core',
        status: isFault ? 'Fault' : isBypassOrSync ? 'Warning' : 'Nominal',
        reading: `${efficiencyPct.toFixed(1)}% Eff · ${outputVoltageV}V Out`,
        detail: 'Three-level IGBT conversion modules delivering clean sine wave at unity power factor',
      },
      {
        id: `${u.id}-batt`,
        name: 'LiFePO4 Battery String Cabinets & DC Breaker',
        partGroup: 'core',
        status: isBattery ? 'Warning' : isFault ? 'Fault' : 'Nominal',
        reading: `${u.batterySocPct.toFixed(1)}% SoC · ${dcBusV} VDC · ${u.runtimeMin}m`,
        detail: 'Cell-level thermal & voltage balancing strings providing ride-through to generator sync',
      },
      {
        id: `${u.id}-sts`,
        name: 'Static Transfer Switch (STS) & Maintenance Bypass',
        partGroup: 'enclosure',
        status: isBypassOrSync ? 'Warning' : 'Nominal',
        reading: `${u.feedBus} · <4 ms Transfer`,
        detail: 'Make-before-break wrap-around bypass enabling concurrent Tier IV maintenance',
      },
      {
        id: `${u.id}-busway`,
        name: 'Overhead Copper Busway Risers & Surge Arrestor',
        partGroup: 'piping_bus',
        status: 'Nominal',
        reading: `${u.redundancyPath} · 4000A Rated`,
        detail: 'Color-coded Path A (Green) / Path B (Orange) laminated copper bus duct to Hall PDUs',
      },
      {
        id: `${u.id}-hmi`,
        name: 'Mimic HMI Panel, EPO & Modbus TCP Interface',
        partGroup: 'controls',
        status: isFault ? 'Fault' : 'Nominal',
        reading: `${u.protocol} · ${u.endpoint}`,
        detail: 'Real-time waveform harmonic analyzer with guarded Emergency Power Off switch',
      },
    ],
    fanSpeedRatio: isFault ? 0 : Math.max(0.3, loadRatio),
    loadRatio,
    isFault,
    isPathB: u.redundancyPath === 'Path B',
  };
}

function buildGeneratorItem(g: BackupGenerator): BmsEquipment3DItem {
  const isRunning = g.state === 'Running · On Load';
  const isCranking = g.state === 'Cranking';
  const loadRatio = Math.min(1, g.outputKw / Math.max(1, g.ratedKw));
  const oilPressureBar = isRunning ? 4.8 : isCranking ? 3.2 : 0.0;
  const jacketWaterTempC = g.coolantTempC;
  const batteryVoltageV = isCranking ? 24.4 : 26.8;
  const rpm = isRunning ? 1500 : isCranking ? 680 : 0;
  const severityState = isCranking ? 'warning' : isRunning ? 'nominal' : 'standby';

  return {
    id: g.id,
    name: g.name,
    shortCode: g.id.toUpperCase(),
    discipline: 'electrical',
    modelKind: 'generator',
    subsystemLabel: 'Tier IV 2(N+1) 11kV / 415V Standby Diesel Generator & ATS',
    redundancyLabel: `${g.feedBus} · ${g.redundancyPath} · ${g.role} · ${g.fuelAutonomyHours}h Fuel`,
    protocolEndpoint: `${g.protocol} · ${g.endpoint}`,
    statusLabel: g.state,
    severityState,
    statusColorHex: isRunning ? 0x3dcd58 : isCranking ? 0xd97706 : 0x64748b,
    summaryLine: `${g.state} · ${(g.outputKw / 1000).toFixed(2)} / ${(g.ratedKw / 1000).toFixed(1)} MW · Diesel ${g.fuelLevelPct.toFixed(1)}%`,
    liveTelemetry: [
      { label: 'Operating State', value: g.state },
      { label: 'Active Output', value: `${g.outputKw.toFixed(0)} / ${g.ratedKw} kW (${Math.round(loadRatio * 100)}%)` },
      { label: 'Engine Speed / Oil', value: `${rpm} RPM · ${oilPressureBar.toFixed(1)} bar · Jacket ${jacketWaterTempC.toFixed(0)}°C` },
      { label: 'Belly Tank / Battery', value: `${g.fuelLevelPct.toFixed(1)}% (~${g.fuelAutonomyHours}h) · ${batteryVoltageV.toFixed(1)}V` },
    ],
    electricalSpecs: [
      { label: 'Alternator Rating', value: `${(g.ratedKw / 1000).toFixed(1)} MW Prime Continuous · 1500 RPM 50Hz` },
      { label: 'Excitation & AVR', value: 'PMG Brushless Digital AVR (±0.25% Voltage Reg)' },
      { label: 'Sync & Switchgear', value: `${g.feedBus} Closed-Transition Paralleling ATS` },
      { label: 'Crank Batteries', value: `Dual 24VDC Redundant Starter Banks (${batteryVoltageV.toFixed(1)}V)` },
    ],
    mechanicalSpecs: [
      { label: 'Prime Mover', value: 'V16 Twin-Turbocharged Aftercooled Diesel Engine' },
      { label: 'Belly Fuel Storage', value: `Double-Walled Sub-Base Tank (${g.fuelLevelPct.toFixed(1)}% / ${g.fuelAutonomyHours}h)` },
      { label: 'Exhaust Treatment', value: 'Hospital-Grade Silencer + Vertical Rain-Capped Stack' },
      { label: 'Acoustic Canopy', value: 'Weatherproof ISO Container (72 dBA @ 7m)' },
    ],
    subComponents: [
      {
        id: `${g.id}-engine`,
        name: 'V16 Twin-Turbo Diesel Engine & Brushless Alternator',
        partGroup: 'core',
        status: isRunning ? 'Nominal' : isCranking ? 'Warning' : 'Standby',
        reading: `${rpm} RPM · Jacket ${jacketWaterTempC.toFixed(0)}°C`,
        detail: 'Pre-heated block jacket (42°C standby) ready for <10 second NFPA-110 full-load acceptance',
      },
      {
        id: `${g.id}-radiator`,
        name: 'Front Finned Radiator Core & Belt-Driven Cooling Fan',
        partGroup: 'enclosure',
        status: isRunning ? 'Nominal' : 'Standby',
        reading: isRunning ? 'Airflow 100% · 50°C Ambient Rated' : 'Idle · Dampers Closed',
        detail: 'Tropicalized Kuala Lumpur 50°C ambient cooling core with motorized intake louvers',
      },
      {
        id: `${g.id}-exhaust`,
        name: 'Acoustic Exhaust Silencer Muffler & Vertical Stack',
        partGroup: 'piping_bus',
        status: isRunning ? 'Nominal' : 'Standby',
        reading: isRunning ? 'Exhaust 412°C · Backpressure OK' : 'Cold Standby',
        detail: 'Thermal-blanketed roof silencer attenuating exhaust noise by 35 dBA',
      },
      {
        id: `${g.id}-fuel`,
        name: 'Double-Walled 96h Belly Fuel Tank & Day Pump',
        partGroup: 'piping_bus',
        status: g.fuelLevelPct < 40 ? 'Warning' : 'Nominal',
        reading: `${g.fuelLevelPct.toFixed(1)}% · ${g.fuelAutonomyHours}h Autonomy`,
        detail: 'Interstitial leak-monitored bunded sub-base tank with duplex fuel polishing pumps',
      },
      {
        id: `${g.id}-ats`,
        name: 'Paralleling Switchgear & ATS Controller Cubicle',
        partGroup: 'controls',
        status: isCranking ? 'Warning' : 'Nominal',
        reading: `${g.feedBus} · ${g.protocol}`,
        detail: 'Auto-synchronizer matching phase, frequency & voltage before closing onto critical bus',
      },
    ],
    fanSpeedRatio: isRunning ? 1.0 : isCranking ? 0.5 : 0,
    loadRatio,
    isFault: false,
    isPathB: g.redundancyPath === 'Path B',
  };
}

function buildGatewayItem(gw: BmsGateway): BmsEquipment3DItem {
  const isFault = !gw.connected;
  return {
    id: gw.id,
    name: gw.name,
    shortCode: gw.id.toUpperCase(),
    discipline: 'electrical',
    modelKind: 'gateway',
    subsystemLabel: '2N BMS Protocol Gateway & SCADA Marshalling Panel',
    redundancyLabel: `${gw.redundancyPath} · ${gw.role} · 2N Redundant`,
    protocolEndpoint: `${gw.protocol} · ${gw.endpoint}`,
    statusLabel: gw.connected ? 'Online' : 'Offline',
    severityState: isFault ? 'critical' : 'nominal',
    statusColorHex: isFault ? 0xdc2626 : 0x3dcd58,
    summaryLine: `${gw.protocol} · ${gw.mappedPoints} Points · ${gw.connected ? `${gw.latencyMs} ms` : 'Link Down'}`,
    liveTelemetry: [
      { label: 'Link State', value: gw.connected ? `Connected (${gw.latencyMs} ms)` : 'Disconnected (Failover Active)' },
      { label: 'Protocol / Poll', value: `${gw.protocol} · ${gw.pollIntervalSec}s Cycle` },
      { label: 'Mapped I/O Points', value: `${gw.mappedPoints} Telemetry & Command Registers` },
      { label: 'Peer Failover', value: `${gw.role} ↔ ${gw.peerGatewayId.toUpperCase()}` },
    ],
    electricalSpecs: [
      { label: 'Control Power', value: 'Dual 24VDC / 230VAC Diode-OR Redundant PSUs' },
      { label: 'Network Uplinks', value: '2× 1000BASE-LX Dual-Ring Fiber Optic Transceivers' },
      { label: 'Isolation', value: '2.5 kV Galvanic Optical Isolation on RS-485 / Modbus' },
      { label: 'Earthing', value: 'Dedicated Copper Instrumentation Ground Bar' },
    ],
    mechanicalSpecs: [
      { label: 'Cabinet Rating', value: 'IP54 Wall/Floor Steel Marshalling Enclosure' },
      { label: 'Thermal Mgmt', value: 'Passive Finned Heatsink + Door Louver Filter' },
      { label: 'Backplane', value: 'DIN-Rail Hot-Swap Dual PLC Controller Chassis' },
      { label: 'Cable Entry', value: 'Top Armored Fire-Rated Conduit Glands' },
    ],
    subComponents: [
      {
        id: `${gw.id}-plc`,
        name: 'Redundant SCADA / BMS Controller Blades',
        partGroup: 'core',
        status: isFault ? 'Fault' : 'Nominal',
        reading: gw.connected ? `${gw.latencyMs} ms · ${gw.mappedPoints} pts` : 'Heartbeat Lost',
        detail: 'Deterministic real-time processor polling chillers, CRACs, UPS & ATS switchgear',
      },
      {
        id: `${gw.id}-psu`,
        name: 'Dual 24VDC Redundant Power Supply Modules',
        partGroup: 'core',
        status: 'Nominal',
        reading: '24.1 VDC · Path A + B OK',
        detail: 'Diode-OR redundant industrial power supplies backed by station battery',
      },
      {
        id: `${gw.id}-fiber`,
        name: 'Dual-Ring Fiber Patch Shelf & Surge Protectors',
        partGroup: 'piping_bus',
        status: isFault ? 'Fault' : 'Nominal',
        reading: gw.connected ? 'Rx -6.4 dBm · Ring Closed' : 'LOS Alarm',
        detail: 'Redundant fiber uplinks isolating BMS OT VLAN from corporate IT networks',
      },
      {
        id: `${gw.id}-panel`,
        name: 'Front Mimic Annunciator & Local Maintenance Port',
        partGroup: 'controls',
        status: isFault ? 'Warning' : 'Nominal',
        reading: `${gw.protocol} · ${gw.endpoint}`,
        detail: 'Key-switched local override & alarm acknowledge LED matrix',
      },
    ],
    fanSpeedRatio: gw.connected ? 0.4 : 0,
    loadRatio: gw.connected ? 0.55 : 0,
    isFault,
    isPathB: gw.redundancyPath === 'Path B',
  };
}

/**
 * Builds the complete catalog of 46 BMS Electrical & Mechanical equipment items for a site:
 * - Mechanical (26): 2 Water Chillers + 2 Rooftop CHW Buffer Tanks & Pump Sets + 6 Air Chillers
 *                    + 2 Hall B Liquid Cooling CDUs + 6 CRACs + 8 Basement Diesel Tanks
 * - Electrical (20): 2 HV Transformers + 2 MSB Switchboards + 2 OPSWB Switchboards
 *                    + 4 UPS Modules + 4 Standby Generators + 6 BMS Gateways
 */
export function buildBmsEquipment3DCatalog(bms: BmsState): BmsEquipment3DItem[] {
  const items: BmsEquipment3DItem[] = [];

  for (const ch of bms.chillers) {
    items.push(
      ch.chillerType === 'Water-Cooled' ? buildWaterChillerItem(ch) : buildAirChillerItem(ch)
    );
  }
  for (const ps of bms.chwTankPumpSets) {
    items.push(buildChwTankPumpItem(ps));
  }
  for (const c of bms.cracUnits) {
    items.push(c.coolingType === 'Liquid CDU' ? buildLiquidCduItem(c) : buildCracItem(c));
  }
  for (const tank of bms.dieselTanks) {
    items.push(buildDieselTankItem(tank));
  }
  for (const swg of bms.electricalSwitchgear) {
    items.push(buildSwitchgearItem(swg));
  }
  for (const u of bms.upsSystems) {
    items.push(buildUpsItem(u));
  }
  for (const g of bms.generators) {
    items.push(buildGeneratorItem(g));
  }
  for (const gw of bms.gateways) {
    items.push(buildGatewayItem(gw));
  }

  return items;
}

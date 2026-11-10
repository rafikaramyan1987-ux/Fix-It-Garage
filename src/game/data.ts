/**
 * Static game data: cars, diagnosis tools, findings, faults, parts, upgrades and the 40 career jobs.
 * Pure data (no DOM / three.js). All player-facing text is an i18n key (see src/i18n/), never a literal.
 *
 * Symptom-clue logic: a fault changes the readings of some tools (its findings); every other tool reads healthy.
 * Several faults combine as the union of their findings, except that a car that will not start cannot be driven
 * and its engine cannot be heard or sniffed (findings that need a running engine are hidden). The job validator
 * (src/game/validate.ts, run in CI) checks that every job's readings identify its faults uniquely.
 */

export type CarType = 'hatchback' | 'sedan' | 'van' | 'pickup' | 'sports' | 'classic' | 'electric';
export type ToolId = 'tester' | 'obd' | 'listen' | 'lift' | 'drive' | 'gauge' | 'exhaust';
export type ActionKind = 'battery' | 'bay' | 'under' | 'wheel' | 'brake' | 'fluid' | 'paint';
export type PartId =
  | 'battery' | 'alternator' | 'starter' | 'plugs' | 'fuelpump' | 'airfilter' | 'pads' | 'disc' | 'tyre' | 'tierod'
  | 'muffler' | 'gasket' | 'hose' | 'thermostat' | 'catalyst' | 'shock' | 'oil' | 'coolant' | 'chargeport' | 'paint';
export type FaultId =
  | 'dead-battery' | 'alternator' | 'starter' | 'spark-plugs' | 'fuel-pump' | 'air-filter' | 'brake-pads'
  | 'brake-disc' | 'flat-tyre' | 'tie-rod' | 'exhaust-leak' | 'oil-leak' | 'coolant-leak' | 'thermostat'
  | 'catalyst' | 'shock' | 'low-oil' | 'ev-charger' | 'scratch';
export type UpgradeId = 'gauge' | 'exhaust' | 'wrench' | 'delivery' | 'lift2' | 'booth' | 'plants' | 'neon' | 'lounge';
export type Modifier = 'misleading' | 'rush' | 'picky' | 'vip';

export interface CarDef {
  /** Kenney Car Kit model */
  model: string;
  /** career job number (1-based) from which this car type appears */
  unlock: number;
  /** repaint (hex) applied to the body colour of the model */
  repaint?: string;
  ev?: boolean;
  /** classic cars predate on-board diagnostics: the OBD scanner has nowhere to plug in */
  noObd?: boolean;
  /** labour multiplier */
  labor: number;
}

export const CARS: Record<CarType, CarDef> = {
  hatchback: { model: 'hatchback-sports', unlock: 1, labor: 1 },
  sedan: { model: 'sedan', unlock: 1, labor: 1 },
  van: { model: 'van', unlock: 3, labor: 1.1 },
  pickup: { model: 'truck', unlock: 9, labor: 1.15 },
  sports: { model: 'sedan-sports', unlock: 14, labor: 1.3 },
  classic: { model: 'sedan', unlock: 19, repaint: '#79cdb8', noObd: true, labor: 1.4 },
  electric: { model: 'suv-luxury', unlock: 26, repaint: '#eef2f5', ev: true, labor: 1.35 },
};
export const CAR_TYPES = Object.keys(CARS) as CarType[];

export interface ToolDef {
  minutes: number;
  /** tools bought in the garage */
  upgrade?: UpgradeId;
}
export const TOOLS: Record<ToolId, ToolDef> = {
  tester: { minutes: 10 },
  obd: { minutes: 15 },
  listen: { minutes: 5 },
  lift: { minutes: 20 },
  drive: { minutes: 15 },
  gauge: { minutes: 5, upgrade: 'gauge' },
  exhaust: { minutes: 10, upgrade: 'exhaust' },
};
export const TOOL_IDS = Object.keys(TOOLS) as ToolId[];
/** the tools every garage starts with: jobs must be solvable with these alone */
export const BASE_TOOLS: ToolId[] = TOOL_IDS.filter((t) => !TOOLS[t].upgrade);

export interface FindingDef {
  tool: ToolId;
  /** value on the tool's screen: a reading (kept as is) or an i18n key (`v.*`) */
  value: string;
  /** only shows with the engine running */
  run?: boolean;
}

/** each finding's clue text is the i18n key `finding.<id>` */
export const FINDINGS = {
  low_volt: { tool: 'tester', value: '11.2 V' },
  not_charging: { tool: 'tester', value: '12.1 V', run: true },
  p0562: { tool: 'obd', value: 'P0562' },
  p0620: { tool: 'obd', value: 'P0620' },
  p0300: { tool: 'obd', value: 'P0300' },
  p0087: { tool: 'obd', value: 'P0087' },
  p0101: { tool: 'obd', value: 'P0101' },
  p0217: { tool: 'obd', value: 'P0217' },
  p0128: { tool: 'obd', value: 'P0128' },
  p0420: { tool: 'obd', value: 'P0420' },
  p0d27: { tool: 'obd', value: 'P0D27' },
  clicking: { tool: 'listen', value: 'v.click' },
  cranks: { tool: 'listen', value: 'v.cranks' },
  rough: { tool: 'listen', value: 'v.rough', run: true },
  squeal: { tool: 'listen', value: 'v.squeal', run: true },
  roar: { tool: 'listen', value: 'v.loud', run: true },
  clunk: { tool: 'listen', value: 'v.clunk', run: true },
  thin_pads: { tool: 'lift', value: 'v.worn' },
  scored_disc: { tool: 'lift', value: 'v.worn' },
  nail: { tool: 'lift', value: 'v.damage' },
  loose_tierod: { tool: 'lift', value: 'v.loose' },
  rust_hole: { tool: 'lift', value: 'v.damage' },
  oil_drip: { tool: 'lift', value: 'v.leak' },
  coolant_drip: { tool: 'lift', value: 'v.leak' },
  shock_leak: { tool: 'lift', value: 'v.leak' },
  no_start: { tool: 'drive', value: 'v.nostart' },
  battery_light: { tool: 'drive', value: 'v.warning', run: true },
  hesitation: { tool: 'drive', value: 'v.shaky', run: true },
  weak_power: { tool: 'drive', value: 'v.weak', run: true },
  long_brake: { tool: 'drive', value: 'v.brakes', run: true },
  pedal_vibe: { tool: 'drive', value: 'v.brakes', run: true },
  pulls: { tool: 'drive', value: 'v.pulls', run: true },
  oil_light: { tool: 'drive', value: 'v.warning', run: true },
  overheat: { tool: 'drive', value: '118 °C', run: true },
  cold_heater: { tool: 'drive', value: '55 °C', run: true },
  egg_smell: { tool: 'drive', value: 'v.smell', run: true },
  bouncy: { tool: 'drive', value: 'v.bouncy', run: true },
  no_charge: { tool: 'drive', value: 'v.nocharge' },
  low_pressure: { tool: 'gauge', value: '1.2 bar' },
  rich: { tool: 'exhaust', value: 'CO 3.1%', run: true },
  high_hc: { tool: 'exhaust', value: 'HC 640', run: true },
} satisfies Record<string, FindingDef>;
export type FindingId = keyof typeof FINDINGS;

export interface FaultDef {
  part: PartId;
  findings: FindingId[];
  /** the car will not start */
  noStart?: boolean;
  /** which cars can have it */
  cars: 'all' | 'fuel' | 'ev';
  /** visible to anyone (a scratch): told by the customer, not deduced */
  declared?: boolean;
  /** has a misleading customer line `fault.<id>.mislead` */
  misleads?: boolean;
}

/** text keys: `fault.<id>.name`, `.symptom`, `.book`, optional `.mislead` */
export const FAULTS: Record<FaultId, FaultDef> = {
  'dead-battery': { part: 'battery', findings: ['low_volt', 'p0562', 'clicking', 'no_start'], noStart: true, cars: 'all' },
  alternator: { part: 'alternator', findings: ['not_charging', 'p0620', 'squeal', 'battery_light'], cars: 'fuel', misleads: true },
  starter: { part: 'starter', findings: ['clicking', 'no_start'], noStart: true, cars: 'fuel', misleads: true },
  'spark-plugs': { part: 'plugs', findings: ['p0300', 'rough', 'hesitation', 'high_hc'], cars: 'fuel' },
  'fuel-pump': { part: 'fuelpump', findings: ['p0087', 'cranks', 'no_start'], noStart: true, cars: 'fuel', misleads: true },
  'air-filter': { part: 'airfilter', findings: ['p0101', 'weak_power', 'rich'], cars: 'fuel' },
  'brake-pads': { part: 'pads', findings: ['squeal', 'long_brake', 'thin_pads'], cars: 'all' },
  'brake-disc': { part: 'disc', findings: ['pedal_vibe', 'scored_disc'], cars: 'all' },
  'flat-tyre': { part: 'tyre', findings: ['low_pressure', 'pulls', 'nail'], cars: 'all' },
  'tie-rod': { part: 'tierod', findings: ['pulls', 'loose_tierod', 'clunk'], cars: 'all', misleads: true },
  'exhaust-leak': { part: 'muffler', findings: ['roar', 'rust_hole'], cars: 'fuel' },
  'oil-leak': { part: 'gasket', findings: ['oil_drip', 'oil_light'], cars: 'fuel', misleads: true },
  'coolant-leak': { part: 'hose', findings: ['p0217', 'overheat', 'coolant_drip'], cars: 'all' },
  thermostat: { part: 'thermostat', findings: ['p0128', 'cold_heater'], cars: 'fuel', misleads: true },
  catalyst: { part: 'catalyst', findings: ['p0420', 'egg_smell', 'high_hc'], cars: 'fuel', misleads: true },
  shock: { part: 'shock', findings: ['clunk', 'bouncy', 'shock_leak'], cars: 'all' },
  'low-oil': { part: 'oil', findings: ['oil_light'], cars: 'fuel' },
  'ev-charger': { part: 'chargeport', findings: ['p0d27', 'no_charge'], cars: 'ev' },
  scratch: { part: 'paint', findings: [], cars: 'all', declared: true },
};
export const FAULT_IDS = Object.keys(FAULTS) as FaultId[];

export type PartCat = 'bay' | 'wheels' | 'under' | 'fluids';
export interface PartDef {
  price: number;
  action: ActionKind;
  cat: PartCat;
  /** a fluid top-up that follows the swap (oil after a new gasket, coolant after a new hose) */
  then?: PartId;
}
/** text key: `part.<id>` */
export const PARTS: Record<PartId, PartDef> = {
  battery: { price: 80, action: 'battery', cat: 'bay' },
  alternator: { price: 120, action: 'bay', cat: 'bay' },
  starter: { price: 140, action: 'bay', cat: 'bay' },
  plugs: { price: 40, action: 'bay', cat: 'bay' },
  airfilter: { price: 25, action: 'bay', cat: 'bay' },
  hose: { price: 35, action: 'bay', cat: 'bay', then: 'coolant' },
  thermostat: { price: 45, action: 'bay', cat: 'bay' },
  chargeport: { price: 260, action: 'bay', cat: 'bay' },
  pads: { price: 50, action: 'brake', cat: 'wheels' },
  disc: { price: 90, action: 'brake', cat: 'wheels' },
  tyre: { price: 70, action: 'wheel', cat: 'wheels' },
  tierod: { price: 60, action: 'under', cat: 'under' },
  shock: { price: 85, action: 'under', cat: 'under' },
  muffler: { price: 110, action: 'under', cat: 'under' },
  catalyst: { price: 220, action: 'under', cat: 'under' },
  fuelpump: { price: 130, action: 'under', cat: 'under' },
  gasket: { price: 30, action: 'under', cat: 'under', then: 'oil' },
  oil: { price: 20, action: 'fluid', cat: 'fluids' },
  coolant: { price: 15, action: 'fluid', cat: 'fluids' },
  paint: { price: 60, action: 'paint', cat: 'fluids' },
};
export const PART_IDS = Object.keys(PARTS) as PartId[];

/** workshop minutes for each repair kind (before upgrades) */
export const ACTION_MINUTES: Record<ActionKind, number> = { battery: 16, bay: 14, under: 18, wheel: 14, brake: 20, fluid: 5, paint: 20 };
export const DELIVERY_MINUTES = { normal: 10, fast: 2 };
export const TEST_MINUTES = 5;

export interface UpgradeDef {
  price: number;
  kind: 'tool' | 'speed' | 'decor';
}
/** text keys: `upgrade.<id>.name`, `upgrade.<id>.desc` */
export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  gauge: { price: 150, kind: 'tool' },
  wrench: { price: 250, kind: 'speed' },
  delivery: { price: 200, kind: 'speed' },
  exhaust: { price: 300, kind: 'tool' },
  booth: { price: 450, kind: 'speed' },
  lift2: { price: 550, kind: 'speed' },
  plants: { price: 120, kind: 'decor' },
  neon: { price: 180, kind: 'decor' },
  lounge: { price: 260, kind: 'decor' },
};
export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];
/** each decoration makes customers tip this share of the labour */
export const DECOR_TIP = 0.05;

export interface Customer {
  name: string;
  hair: string;
  skin: string;
  shirt: string;
}
/** invented names (not translated) */
export const CUSTOMERS: Customer[] = [
  { name: 'Mrs. Pebble', hair: '#c9c9d6', skin: '#f2c9a5', shirt: '#7c5cff' },
  { name: 'Theo Sprocket', hair: '#5a3418', skin: '#c98b5e', shirt: '#2fa39b' },
  { name: 'Dot Marigold', hair: '#e2603a', skin: '#f6d3b5', shirt: '#ffb238' },
  { name: 'Amara Bolt', hair: '#2b1d16', skin: '#8d5a3b', shirt: '#e85a4f' },
  { name: 'Grandpa Otto', hair: '#ececec', skin: '#efc39e', shirt: '#3d6fb6' },
  { name: 'Lina Fizz', hair: '#f2c94c', skin: '#f5d1b8', shirt: '#56c596' },
  { name: 'Kenji Wren', hair: '#1f1f2a', skin: '#e8c19a', shirt: '#ff7a45' },
  { name: 'Rosa Quill', hair: '#8a3b2b', skin: '#d9a07a', shirt: '#9b6bd6' },
  { name: 'Felix Bramble', hair: '#a8743f', skin: '#f3cfae', shirt: '#2f6fd6' },
  { name: 'Nia Comet', hair: '#3a2416', skin: '#6e432a', shirt: '#ffcf33' },
  { name: 'Uncle Barnaby', hair: '#6b6b6b', skin: '#e2b48f', shirt: '#c0605a' },
  { name: 'Pip Tumble', hair: '#d9773a', skin: '#f7d8c0', shirt: '#4ab3ff' },
];

export interface JobSpec {
  car: CarType;
  faults: FaultId[];
  mod?: Modifier;
}

/** the 40 career jobs, in order. Every 5th job is a tricky customer. */
export const CAREER: JobSpec[] = [
  { car: 'sedan', faults: ['dead-battery'] },
  { car: 'hatchback', faults: ['brake-pads'] },
  { car: 'van', faults: ['low-oil'] },
  { car: 'sedan', faults: ['flat-tyre'] },
  { car: 'hatchback', faults: ['alternator'], mod: 'misleading' },
  { car: 'van', faults: ['exhaust-leak'] },
  { car: 'sedan', faults: ['spark-plugs'] },
  { car: 'hatchback', faults: ['brake-disc'] },
  { car: 'pickup', faults: ['starter'] },
  { car: 'van', faults: ['flat-tyre'], mod: 'rush' },
  { car: 'pickup', faults: ['air-filter'] },
  { car: 'sedan', faults: ['coolant-leak'] },
  { car: 'hatchback', faults: ['thermostat'] },
  { car: 'sports', faults: ['shock'] },
  { car: 'pickup', faults: ['tie-rod'], mod: 'misleading' },
  { car: 'sports', faults: ['fuel-pump'] },
  { car: 'sedan', faults: ['brake-pads', 'scratch'] },
  { car: 'van', faults: ['oil-leak'] },
  { car: 'classic', faults: ['dead-battery'] },
  { car: 'hatchback', faults: ['catalyst'], mod: 'picky' },
  { car: 'pickup', faults: ['alternator', 'flat-tyre'] },
  { car: 'sports', faults: ['spark-plugs', 'brake-pads'] },
  { car: 'classic', faults: ['exhaust-leak', 'scratch'] },
  { car: 'sedan', faults: ['fuel-pump'] },
  { car: 'van', faults: ['brake-disc', 'shock'], mod: 'rush' },
  { car: 'electric', faults: ['ev-charger'] },
  { car: 'classic', faults: ['tie-rod'] },
  { car: 'pickup', faults: ['oil-leak', 'air-filter'] },
  { car: 'electric', faults: ['flat-tyre', 'brake-pads'] },
  { car: 'sports', faults: ['catalyst'], mod: 'misleading' },
  { car: 'sedan', faults: ['starter'] },
  { car: 'electric', faults: ['dead-battery'] },
  { car: 'hatchback', faults: ['alternator', 'exhaust-leak'] },
  { car: 'classic', faults: ['fuel-pump'] },
  { car: 'van', faults: ['tie-rod', 'shock'], mod: 'picky' },
  { car: 'electric', faults: ['shock', 'scratch'] },
  { car: 'pickup', faults: ['spark-plugs', 'catalyst'] },
  { car: 'sports', faults: ['brake-disc', 'flat-tyre'] },
  { car: 'classic', faults: ['thermostat', 'brake-pads'] },
  { car: 'electric', faults: ['ev-charger', 'tie-rod'], mod: 'vip' },
];

export interface AchievementDef {
  /** progress target */
  goal: number;
}
/** text keys: `ach.<id>.name`, `ach.<id>.desc` */
export const ACHIEVEMENTS = {
  first_fix: { goal: 1 },
  jobs_10: { goal: 10 },
  career: { goal: 40 },
  perfect_5: { goal: 5 },
  streak_5: { goal: 5 },
  no_waste_10: { goal: 10 },
  tricky_5: { goal: 5 },
  all_cars: { goal: 7 },
  book_full: { goal: 18 },
  daily_1: { goal: 1 },
  first_upgrade: { goal: 1 },
  all_upgrades: { goal: 9 },
  rich: { goal: 1000 },
} satisfies Record<string, AchievementDef>;
export type AchievementId = keyof typeof ACHIEVEMENTS;

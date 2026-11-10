/**
 * Static game data: tools, parts, faults and jobs. Pure data, no DOM / three.js, so the job logic can be unit tested
 * (and, in Phase B, validated in CI: every job solvable, clues uniquely identify its faults).
 */

export type CarType = 'sedan' | 'hatchback' | 'van';
export type ToolId = 'tester' | 'obd' | 'listen' | 'lift';
export type PartId = 'battery' | 'starter' | 'plugs' | 'alternator';
export type FaultId = 'dead-battery';

/** what a tool shows: `bad` points at a fault, `ok` rules something out */
export interface Reading {
  verdict: 'bad' | 'ok';
  /** short value for the readout, e.g. "11.2 V" */
  value: string;
  /** one line for the clipboard */
  text: string;
}

export interface ToolDef {
  id: ToolId;
  name: string;
  /** workshop minutes it takes to use */
  minutes: number;
  /** reading on a healthy car (used when no fault affects this tool) */
  healthy: Reading;
}

export interface PartDef {
  id: PartId;
  name: string;
  price: number;
}

export interface FaultDef {
  id: FaultId;
  name: string;
  /** the part that fixes it */
  part: PartId;
  /** what the customer says */
  symptom: string;
  /** readings that differ from healthy */
  readings: Partial<Record<ToolId, Reading>>;
  /** repair book entry */
  book: string;
}

export interface JobDef {
  id: string;
  car: CarType;
  customer: { name: string; hair: string; skin: string; shirt: string };
  faults: FaultId[];
  /** workshop minutes for the full time bonus */
  targetMinutes: number;
  labor: number;
  timeBonus: number;
}

export const TOOLS: Record<ToolId, ToolDef> = {
  tester: { id: 'tester', name: 'Battery tester', minutes: 10, healthy: { verdict: 'ok', value: '12.6 V', text: 'Battery: 12.6 V, healthy' } },
  obd: { id: 'obd', name: 'OBD scanner', minutes: 15, healthy: { verdict: 'ok', value: 'No codes', text: 'Scanner: no fault codes' } },
  listen: { id: 'listen', name: 'Listen', minutes: 5, healthy: { verdict: 'ok', value: 'Smooth', text: 'Engine sounds smooth' } },
  lift: { id: 'lift', name: 'Look under', minutes: 20, healthy: { verdict: 'ok', value: 'All good', text: 'Underside: no leaks, no damage' } },
};

export const PARTS: Record<PartId, PartDef> = {
  battery: { id: 'battery', name: 'Battery', price: 80 },
  starter: { id: 'starter', name: 'Starter motor', price: 140 },
  plugs: { id: 'plugs', name: 'Spark plugs', price: 40 },
  alternator: { id: 'alternator', name: 'Alternator', price: 120 },
};

export const FAULTS: Record<FaultId, FaultDef> = {
  'dead-battery': {
    id: 'dead-battery',
    name: 'Worn-out battery',
    part: 'battery',
    symptom: "Won't start, just a clicking sound when I turn the key.",
    readings: {
      tester: { verdict: 'bad', value: '11.2 V', text: 'Battery: 11.2 V, too weak to crank' },
      obd: { verdict: 'bad', value: 'P0562', text: 'Scanner: P0562, system voltage low' },
      listen: { verdict: 'bad', value: 'Click-click', text: 'Fast clicking, starter gets no power' },
    },
    book: 'Clicking but no crank + low voltage on the tester = worn-out battery. Replace it: (−) off first, (+) on first.',
  },
};

export const JOBS: JobDef[] = [
  {
    id: 'job-1',
    car: 'sedan',
    customer: { name: 'Mrs. Pebble', hair: '#c9c9d6', skin: '#f2c9a5', shirt: '#7c5cff' },
    faults: ['dead-battery'],
    targetMinutes: 60,
    labor: 90,
    timeBonus: 40,
  },
];

/** minutes each repair step takes */
export const STEP_MINUTES = { bolt: 3, swap: 4, hood: 1, test: 2, quickInstall: 12 } as const;

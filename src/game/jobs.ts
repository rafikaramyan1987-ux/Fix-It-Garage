/**
 * Builds playable jobs: the 40 career jobs, endless jobs after the career, and the daily job. Rewards and target
 * times come from one formula, so the validator can check the progression curve.
 */
import { ACTION_MINUTES, CAREER, CARS, CAR_TYPES, CUSTOMERS, DELIVERY_MINUTES, FAULTS, PARTS, TEST_MINUTES, type CarType, type Customer, type FaultId, type JobSpec, type Modifier } from './data';
import { bestDiagnosis, faultFits, INFERABLE, lookalikes } from './rules';
import { BASE_TOOLS } from './data';

export interface JobDef {
  id: string;
  /** career number (1-based); daily jobs use 0 */
  n: number;
  car: CarType;
  faults: FaultId[];
  mod?: Modifier;
  customer: Customer;
  targetMinutes: number;
  labor: number;
  timeBonus: number;
  daily?: boolean;
}

export const CAREER_LENGTH = CAREER.length;
const round5 = (v: number) => Math.max(5, Math.round(v / 5) * 5);

/** minutes to repair one fault (part delivery, the swap, a fluid top-up) */
export function repairMinutes(f: FaultId) {
  const p = PARTS[FAULTS[f].part];
  return DELIVERY_MINUTES.normal + ACTION_MINUTES[p.action] + (p.then ? ACTION_MINUTES.fluid : 0);
}

/** fastest possible job with the base tools and no upgrades */
export function optimalMinutes(car: CarType, faults: FaultId[]) {
  const d = bestDiagnosis(faults, car);
  if (!d) return Infinity;
  return d.minutes + faults.reduce((s, f) => s + repairMinutes(f), 0) + TEST_MINUTES;
}

/** labour for career job n (1-based) */
export function laborFor(n: number, car: CarType, faults: FaultId[], mod?: Modifier) {
  const step = Math.min(n, 60);
  let l = (55 + step * 6) * CARS[car].labor * (faults.length > 1 ? 1.5 : 1);
  if (mod === 'misleading') l *= 1.2;
  if (mod === 'vip') l *= 2;
  return round5(l);
}

export function buildJob(n: number, spec: JobSpec, extra: Partial<JobDef> = {}): JobDef {
  const opt = optimalMinutes(spec.car, spec.faults);
  let target = round5(opt * 1.5);
  if (spec.mod === 'rush') target = round5(opt * 1.15);
  const bonus = round5((20 + Math.min(n, 60) * 1.5) * (spec.mod === 'rush' ? 2 : 1));
  return {
    id: `job-${n}`,
    n,
    car: spec.car,
    faults: spec.faults,
    mod: spec.mod,
    customer: CUSTOMERS[(n * 7 + spec.faults.length) % CUSTOMERS.length],
    targetMinutes: target,
    labor: laborFor(n, spec.car, spec.faults, spec.mod),
    timeBonus: bonus,
    ...extra,
  };
}

/** small deterministic RNG */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** a random job that is fair: its readings identify its faults with the base tools */
export function randomSpec(r: () => number, cars: CarType[], faults: FaultId[], allowTwo: boolean): JobSpec {
  for (let tries = 0; tries < 200; tries++) {
    const car = cars[Math.floor(r() * cars.length)];
    const pool = faults.filter((f) => faultFits(f, car));
    if (!pool.length) continue;
    const a = pool[Math.floor(r() * pool.length)];
    const fs: FaultId[] = [a];
    if (allowTwo && r() < 0.45) {
      const b = pool[Math.floor(r() * pool.length)];
      if (b !== a && !(FAULTS[a].noStart && FAULTS[b].noStart)) fs.push(b);
    }
    if (lookalikes(fs, car, BASE_TOOLS).length === 0 && Number.isFinite(optimalMinutes(car, fs))) return { car, faults: fs };
  }
  return { car: 'sedan', faults: ['dead-battery'] };
}

/** faults met in the career up to job n */
export function faultsSeen(n: number): FaultId[] {
  const s = new Set<FaultId>();
  CAREER.slice(0, Math.max(1, n)).forEach((j) => j.faults.forEach((f) => s.add(f)));
  return [...s];
}

export function carsUnlocked(n: number): CarType[] {
  return CAR_TYPES.filter((c) => CARS[c].unlock <= Math.max(1, n));
}

/** career job n (1-based); after the career, endless generated jobs */
export function careerJob(n: number): JobDef {
  if (n <= CAREER.length) return buildJob(n, CAREER[n - 1]);
  const r = rng(n * 7919);
  const spec = randomSpec(r, CAR_TYPES, INFERABLE.concat(r() < 0.2 ? ['scratch'] : []), true);
  const mod: Modifier | undefined = n % 5 === 0 ? (['misleading', 'rush', 'picky', 'vip'] as Modifier[])[Math.floor(r() * 4)] : undefined;
  if (mod === 'misleading' && !spec.faults.some((f) => FAULTS[f].misleads)) return buildJob(n, { ...spec, mod: 'rush' });
  return buildJob(n, { ...spec, mod });
}

export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** the daily job: same for everyone on a given day, from the cars and faults met so far, double pay */
export function dailyJob(day: string, progress: number): JobDef {
  const seed = day.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const r = rng(seed);
  const n = Math.max(6, progress);
  const spec = randomSpec(r, carsUnlocked(n), faultsSeen(n).filter((f) => !FAULTS[f].declared), n > 12);
  const job = buildJob(Math.max(1, progress), spec, { id: `daily-${day}`, daily: true });
  job.labor *= 2;
  job.n = 0;
  return job;
}

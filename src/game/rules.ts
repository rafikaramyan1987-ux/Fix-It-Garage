/**
 * Symptom-clue rules shared by the game and the job validator: what each tool reads on a car with a given set of
 * faults, whether a set of readings identifies the faults uniquely, and the fastest way to diagnose a job.
 */
import { BASE_TOOLS, CARS, FAULTS, FAULT_IDS, FINDINGS, TOOLS, type CarType, type FaultId, type FindingId, type ToolId } from './data';

/** can this tool be used on this car? (no OBD port on a classic, no exhaust on an electric car) */
export function toolWorks(tool: ToolId, car: CarType) {
  if (tool === 'obd' && CARS[car].noObd) return false;
  if (tool === 'exhaust' && CARS[car].ev) return false;
  return true;
}

export function faultFits(f: FaultId, car: CarType) {
  const c = FAULTS[f].cars;
  return c === 'all' || (c === 'ev') === !!CARS[car].ev;
}

/** faults the player has to deduce (a scratch is simply told) */
export const INFERABLE: FaultId[] = FAULT_IDS.filter((f) => !FAULTS[f].declared);

/** findings a tool shows on this car; [] = healthy reading */
export function toolFindings(tool: ToolId, faults: FaultId[], car: CarType): FindingId[] {
  if (!toolWorks(tool, car)) return [];
  const noStart = faults.some((f) => FAULTS[f].noStart);
  const out = new Set<FindingId>();
  for (const f of faults) {
    for (const id of FAULTS[f].findings) {
      const d = FINDINGS[id];
      if (d.tool !== tool) continue;
      if (noStart && 'run' in d && d.run) continue; // the engine does not run
      out.add(id);
    }
  }
  if (noStart && tool === 'drive') return ['no_start'];
  return [...out].sort();
}

/** canonical text of what the given tools show (for comparing fault sets) */
export function signature(faults: FaultId[], car: CarType, tools: ToolId[]) {
  return tools.map((t) => `${t}:${toolWorks(t, car) ? toolFindings(t, faults, car).join(',') : 'n/a'}`).join('|');
}

/** all inferable fault sets of a given size that fit the car */
export function candidateSets(car: CarType, size: number): FaultId[][] {
  const pool = INFERABLE.filter((f) => faultFits(f, car));
  if (size === 1) return pool.map((f) => [f]);
  const out: FaultId[][] = [];
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) out.push([pool[i], pool[j]]);
  return out;
}

const key = (fs: FaultId[]) => [...fs].sort().join('+');

/** other fault sets (same size) that the given tools cannot tell apart from `faults` */
export function lookalikes(faults: FaultId[], car: CarType, tools: ToolId[]) {
  const inf = faults.filter((f) => !FAULTS[f].declared);
  if (!inf.length) return [];
  const sig = signature(inf, car, tools);
  return candidateSets(car, inf.length).filter((g) => key(g) !== key(inf) && signature(g, car, tools) === sig);
}

/** the cheapest set of tools (in minutes) whose readings identify the job's faults; null if none does */
export function bestDiagnosis(faults: FaultId[], car: CarType, tools: ToolId[] = BASE_TOOLS) {
  const usable = tools.filter((t) => toolWorks(t, car));
  const inf = faults.filter((f) => !FAULTS[f].declared);
  if (!inf.length) return { tools: [] as ToolId[], minutes: 0 };
  let best: { tools: ToolId[]; minutes: number } | null = null;
  for (let mask = 1; mask < 1 << usable.length; mask++) {
    const set = usable.filter((_, i) => mask & (1 << i));
    const minutes = set.reduce((s, t) => s + TOOLS[t].minutes, 0);
    if (best && minutes >= best.minutes) continue;
    if (lookalikes(inf, car, set).length === 0) best = { tools: set, minutes };
  }
  return best;
}

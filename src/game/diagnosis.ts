/**
 * Friendly diagnosis (pure, shared by the game and the job validator):
 * - clue tones: every finding is a clear problem (red) or a suspicious sign that fits several faults (orange)
 * - the suspects list: parts sorted by how well they match the collected clues, with the matching clues as the reason
 * - the guided hint: which tool to use next and why, or which part the clues point to
 * - why a wrong part was not the cause (gentle mistakes in the first jobs)
 */
import { CARS, FAULTS, FINDINGS, PARTS, PART_IDS, TOOLS, type CarType, type FaultId, type FindingId, type PartId, type ToolId } from './data';
import { faultFits, INFERABLE, lookalikes, toolFindings, toolWorks } from './rules';

export type Difficulty = 'relaxed' | 'expert';

/** career jobs up to this number: only 3 suspects, wrong parts refunded with an explanation */
export const GENTLE_JOBS = 10;
/** how many suspects the first jobs show */
export const FEW_SUSPECTS = 3;
/** price of a hint after the free one */
export const HINT_PRICE = 20;
/** Expert mode pays more */
export const EXPERT_BONUS = 1.25;

/** a gentle job: the first ten career jobs (not daily or endless jobs) */
export const gentleJob = (n: number) => n >= 1 && n <= GENTLE_JOBS;

export type Tone = 'bad' | 'warn';
/** red: points to one fault; orange (suspicious): a sign that several different faults give */
export function findingTone(id: FindingId): Tone {
  return INFERABLE.filter((f) => FAULTS[f].findings.includes(id)).length > 1 ? 'warn' : 'bad';
}

/** a card's colour: green = normal, red = problem, orange = suspicious, grey = cannot be used */
export function readingTone(r: { verdict: 'bad' | 'ok' | 'na'; findings: FindingId[] }): 'ok' | 'na' | Tone {
  if (r.verdict !== 'bad') return r.verdict;
  return r.findings.some((f) => findingTone(f) === 'bad') ? 'bad' : 'warn';
}

/** can this part be fitted to this car? (no fuel parts on an electric car, no charging module on a fuel car) */
export function partFits(p: PartId, car: CarType) {
  if (p === 'chargeport') return !!CARS[car].ev;
  if (['alternator', 'starter', 'plugs', 'airfilter', 'thermostat', 'fuelpump', 'muffler', 'catalyst', 'gasket', 'oil'].includes(p)) return !CARS[car].ev;
  return true;
}

/** the parts the parts sheet offers (coolant only comes with a new hose) */
export const SHEET_PARTS: PartId[] = PART_IDS.filter((p) => p !== 'coolant');

export interface Clue {
  tool: ToolId;
  findings: FindingId[];
  verdict: 'bad' | 'ok' | 'na';
}

export interface SuspectCtx {
  car: CarType;
  /** every fault of the job (the player knows how many: the ticket says "two problems") */
  faults: FaultId[];
  /** faults already repaired (the sparkle told the player) */
  fixed: FaultId[];
  clues: Iterable<Clue>;
}

export interface Suspect {
  part: PartId;
  fault: FaultId | null;
  score: number;
  /** collected findings this part's fault explains (the reason under the top suspects) */
  matched: FindingId[];
  /** the customer told it (a scratch) */
  declared: boolean;
}

const inter = (a: readonly FindingId[], b: readonly FindingId[]) => a.filter((x) => b.includes(x)).length;
const diff = (a: readonly FindingId[], b: readonly FindingId[]) => a.filter((x) => !b.includes(x)).length + b.filter((x) => !a.includes(x)).length;

/** how well a set of faults explains the collected clues (higher is better; stale clues from before a fix are allowed) */
function setScore(g: FaultId[], ctx: SuspectCtx, clues: Clue[]) {
  let s = 0;
  for (const c of clues) {
    if (c.verdict === 'na') continue;
    const now = toolFindings(c.tool, g, ctx.car);
    const before = ctx.fixed.length ? toolFindings(c.tool, [...g, ...ctx.fixed], ctx.car) : now;
    const a = inter(now, c.findings) - 2 * diff(now, c.findings);
    const b = inter(before, c.findings) - 2 * diff(before, c.findings);
    s += Math.max(a, b);
  }
  return s;
}

/** the parts sorted by how well they match the clues: best first */
export function rankSuspects(ctx: SuspectCtx): Suspect[] {
  const clues = [...ctx.clues];
  const seen = new Set(clues.flatMap((c) => c.findings));
  const pool = INFERABLE.filter((f) => faultFits(f, ctx.car) && !ctx.fixed.includes(f));
  const left = ctx.faults.filter((f) => !FAULTS[f].declared && !ctx.fixed.includes(f)).length;
  const best = new Map<FaultId, number>();
  if (left >= 1) {
    const sets: FaultId[][] = left === 1 ? pool.map((f) => [f]) : pool.flatMap((a, i) => pool.slice(i + 1).map((b) => [a, b]));
    for (const g of sets) {
      if (g.filter((f) => FAULTS[f].noStart).length > 1) continue;
      const s = setScore(g, ctx, clues);
      for (const f of g) best.set(f, Math.max(best.get(f) ?? -Infinity, s));
    }
  }
  const declaredLeft = ctx.faults.filter((f) => FAULTS[f].declared && !ctx.fixed.includes(f));
  const out: Suspect[] = SHEET_PARTS.filter((p) => partFits(p, ctx.car)).map((part) => {
    const declared = declaredLeft.find((f) => FAULTS[f].part === part);
    if (declared) return { part, fault: declared, score: Infinity, matched: [], declared: true };
    const fault = pool.find((f) => FAULTS[f].part === part) ?? null;
    const matched = fault ? FAULTS[fault].findings.filter((x) => seen.has(x)) : [];
    return { part, fault, score: fault ? (best.get(fault) ?? -Infinity) : -Infinity, matched, declared: false };
  });
  const order = (p: PartId) => SHEET_PARTS.indexOf(p);
  return out.sort((a, b) => b.score - a.score || b.matched.length - a.matched.length || order(a.part) - order(b.part));
}

/**
 * How many suspects at the top clearly lead (each gets a "best match" badge): with `left` faults still to find (the
 * ticket says "two problems"), the top `left` suspects lead when they all score above the next one (no clues: all tie). 0 = none.
 */
export function clearLeaders(list: Suspect[], left = 1) {
  // a scratch the customer showed always leads; then the faults to deduce
  const declared = list.filter((s) => s.declared).length;
  const rest = list.slice(declared);
  if (left < 1) return declared;
  const k = Math.min(left, rest.length);
  const next = rest[k];
  if (next && rest.slice(0, k).some((s) => s.score <= next.score)) return declared;
  return declared + k;
}

/** the top suspect clearly leads (a "best match" badge) */
export function clearLeader(list: Suspect[]) {
  return clearLeaders(list, 1) > 0;
}

/** faults still to find (not counting a declared scratch) */
export const faultsLeft = (faults: FaultId[], fixed: FaultId[]) => faults.filter((f) => !FAULTS[f].declared && !fixed.includes(f)).length;

/** at least one tool has been used */
export const hasClues = (clues: Iterable<Clue>) => [...clues].some((c) => c.verdict !== 'na');

export type Hint =
  | { kind: 'tool'; tool: ToolId; fault: FaultId }
  | { kind: 'repair'; part: PartId; fault: FaultId }
  | { kind: 'test' };

export interface HintCtx {
  car: CarType;
  faults: FaultId[];
  fixed: FaultId[];
  /** tools already used */
  used: ToolId[];
  /** tools the garage owns */
  tools: ToolId[];
  /** a part was fitted since the last test drive */
  untested: boolean;
}

/**
 * The guided hint: test a fresh repair; else the cheapest next tool(s) that, with the tools already used, identify the
 * remaining faults (the most telling one first); once the clues identify them, the part to order.
 */
export function nextHint(h: HintCtx): Hint {
  if (h.untested) return { kind: 'test' };
  const left = h.faults.filter((f) => !h.fixed.includes(f));
  const inf = left.filter((f) => !FAULTS[f].declared);
  if (!inf.length) {
    const f = left[0];
    return f ? { kind: 'repair', part: FAULTS[f].part, fault: f } : { kind: 'test' };
  }
  const used = h.used.filter((t) => toolWorks(t, h.car));
  if (lookalikes(inf, h.car, used).length === 0) {
    // the fault whose sign is the clearest in the clues goes first; a declared scratch last
    const shown = (f: FaultId) => FAULTS[f].findings.filter((x) => used.some((t) => toolFindings(t, inf, h.car).includes(x))).length;
    const f = [...inf].sort((a, b) => shown(b) - shown(a))[0];
    return { kind: 'repair', part: FAULTS[f].part, fault: f };
  }
  const free = h.tools.filter((t) => toolWorks(t, h.car) && !used.includes(t));
  let best: { set: ToolId[]; minutes: number } | null = null;
  for (let mask = 1; mask < 1 << free.length; mask++) {
    const set = free.filter((_, i) => mask & (1 << i));
    const minutes = set.reduce((s, t) => s + TOOLS[t].minutes, 0);
    if (best && minutes >= best.minutes) continue;
    if (lookalikes(inf, h.car, [...used, ...set]).length === 0) best = { set, minutes };
  }
  const cands = best ? best.set : free;
  const shows = (t: ToolId) => toolFindings(t, inf, h.car).length;
  const tool = [...cands].sort((a, b) => shows(b) - shows(a) || TOOLS[a].minutes - TOOLS[b].minutes)[0];
  if (!tool) {
    const f = inf[0];
    return { kind: 'repair', part: FAULTS[f].part, fault: f };
  }
  // the fault this tool tells about (the one it shows a sign of, else the first)
  const fault = inf.find((f) => toolFindings(tool, [f], h.car).length > 0) ?? inf[0];
  return { kind: 'tool', tool, fault };
}

export type WrongWhy = { key: 'gentle.notExplain' | 'gentle.notShown'; clue: FindingId } | { key: 'gentle.generic' };

/** one line why a fitted part was not the cause */
export function whyWrong(part: PartId, car: CarType, remaining: FaultId[], clues: Iterable<Clue>): WrongWhy {
  const seen = [...clues].flatMap((c) => c.findings);
  const fault = INFERABLE.find((f) => FAULTS[f].part === part && faultFits(f, car));
  const own = fault ? FAULTS[fault].findings : [];
  // a clue the player collected that this part's fault does not cause
  const unexplained = seen.find((x) => remaining.some((f) => FAULTS[f].findings.includes(x)) && !own.includes(x));
  if (unexplained) return { key: 'gentle.notExplain', clue: unexplained };
  // a sign this part's fault would give that the car does not have
  const truth = new Set((Object.keys(TOOLS) as ToolId[]).flatMap((t) => toolFindings(t, remaining, car)));
  const missing = own.find((x) => !truth.has(x) && toolWorks(FINDINGS[x].tool, car));
  if (missing) return { key: 'gentle.notShown', clue: missing };
  return { key: 'gentle.generic' };
}

/** the price of the parts a job pays for (refunds) */
export const partPrice = (p: PartId) => PARTS[p].price;

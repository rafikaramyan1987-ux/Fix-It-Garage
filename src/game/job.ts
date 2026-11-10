/**
 * The rules of one repair job while it is played: tool readings, workshop minutes, parts, repairs, the test drive
 * and the payout. Pure logic, driven by the play flow and covered by unit tests.
 */
import { ACTION_MINUTES, DECOR_TIP, DELIVERY_MINUTES, FAULTS, PARTS, TEST_MINUTES, TOOLS, type FaultId, type FindingId, type PartId, type ToolId } from './data';
import type { JobDef } from './jobs';
import { toolFindings, toolWorks } from './rules';

export interface Reading {
  tool: ToolId;
  findings: FindingId[];
  /** bad = something found; ok = healthy; na = the tool cannot be used on this car */
  verdict: 'bad' | 'ok' | 'na';
}

/** what the garage owns that changes a job */
export interface GarageCtx {
  wrench: boolean;
  delivery: boolean;
  lift2: boolean;
  booth: boolean;
  decor: number;
}
export const NO_UPGRADES: GarageCtx = { wrench: false, delivery: false, lift2: false, booth: false, decor: 0 };

export interface Payout {
  labor: number;
  parts: number;
  timeBonus: number;
  tips: number;
  wasted: number;
  total: number;
  stars: 1 | 2 | 3;
  /** i18n keys of why stars were lost */
  notes: string[];
}

export class Job {
  minutes = 0;
  readonly clues = new Map<ToolId, Reading>();
  readonly bought: PartId[] = [];
  readonly fixed = new Set<FaultId>();
  /** wrong parts fitted (paid by the garage) */
  readonly wrong: PartId[] = [];
  /** wrong parts refunded (gentle mistakes in the first jobs): not charged to the garage */
  readonly refunded: PartId[] = [];
  freeParts = 0;
  tests = 0;
  hintUsed = false;
  /** hints taken this job (the first one is free in Relaxed mode) */
  hints = 0;
  done = false;

  constructor(
    readonly def: JobDef,
    readonly ctx: GarageCtx = NO_UPGRADES,
  ) {}

  get faults() {
    return this.def.faults;
  }

  /** the faults still to fix */
  get remaining() {
    return this.faults.filter((f) => !this.fixed.has(f));
  }

  toolMinutes(t: ToolId) {
    if (t === 'lift' && this.ctx.lift2) return 10;
    return TOOLS[t].minutes;
  }

  /** what a tool reads now (fixed faults no longer show) */
  reading(tool: ToolId): Reading {
    if (!toolWorks(tool, this.def.car)) return { tool, findings: [], verdict: 'na' };
    const f = toolFindings(tool, this.remaining, this.def.car);
    return { tool, findings: f, verdict: f.length ? 'bad' : 'ok' };
  }

  /** use a diagnosis tool: costs its minutes the first time */
  useTool(tool: ToolId, free = false): Reading {
    const r = this.reading(tool);
    if (!this.clues.has(tool) && !free) this.minutes += this.toolMinutes(tool);
    this.clues.set(tool, r);
    return r;
  }

  /** the hint: the not-yet-used base tool that shows the most, revealed for free */
  hintTool(available: ToolId[]): ToolId | null {
    const options = available.filter((t) => !this.clues.has(t) && toolWorks(t, this.def.car));
    options.sort((a, b) => this.reading(b).findings.length - this.reading(a).findings.length);
    return options[0] ?? null;
  }

  /** the fault this part would fix, if any */
  fixes(part: PartId): FaultId | null {
    return this.remaining.find((f) => FAULTS[f].part === part) ?? null;
  }

  buy(part: PartId, free = false) {
    this.bought.push(part);
    if (free) this.freeParts++;
    this.minutes += this.ctx.delivery ? DELIVERY_MINUTES.fast : DELIVERY_MINUTES.normal;
    return free ? 0 : PARTS[part].price;
  }

  /** minutes the repair of this part takes with the current upgrades */
  repairMinutes(part: PartId) {
    const p = PARTS[part];
    let m = ACTION_MINUTES[p.action] + (p.then ? ACTION_MINUTES.fluid : 0);
    if (p.action === 'paint' && this.ctx.booth) m = 8;
    if (this.ctx.wrench && p.action !== 'fluid' && p.action !== 'paint') m = Math.round(m * 0.7);
    if (p.action === 'under' && this.ctx.lift2) m -= 4;
    return m;
  }

  /** the part is fitted: fixes its fault, or is wasted */
  install(part: PartId): FaultId | null {
    this.minutes += this.repairMinutes(part);
    const f = this.fixes(part);
    if (f) this.fixed.add(f);
    else this.wrong.push(part);
    return f;
  }

  /** a wrong part goes back to the supplier: the garage does not pay for it */
  refund(part: PartId) {
    if (this.wrong.filter((p) => p === part).length > this.refunded.filter((p) => p === part).length) this.refunded.push(part);
  }

  addMinutes(m: number) {
    this.minutes += m;
  }

  get allFixed() {
    return this.remaining.length === 0;
  }

  /** the test drive: ok when everything is fixed; otherwise what is still wrong */
  test(): { ok: boolean; remaining: FaultId[] } {
    this.minutes += TEST_MINUTES;
    this.tests++;
    const ok = this.allFixed;
    if (ok) this.done = true;
    return { ok, remaining: this.remaining };
  }

  timeBonusNow() {
    const { targetMinutes: t, timeBonus: b } = this.def;
    if (this.minutes <= t) return b;
    if (this.minutes <= t * 1.5) return Math.round(b / 2);
    return 0;
  }

  /** what the customer pays for the parts the job needed (incl. fluid top-ups) */
  partsBill() {
    return this.faults.reduce((s, f) => {
      const p = PARTS[FAULTS[f].part];
      return s + p.price + (p.then ? PARTS[p.then].price : 0);
    }, 0);
  }

  payout(): Payout {
    const notes: string[] = [];
    let stars = 3;
    if (this.wrong.length) {
      stars--;
      notes.push('pay.note.wrong');
    }
    if (this.minutes > this.def.targetMinutes) {
      stars--;
      notes.push('pay.note.slow');
    }
    stars = Math.max(1, stars);
    const labor = this.def.labor;
    let tips = Math.round(labor * DECOR_TIP * this.ctx.decor);
    if (this.def.mod === 'picky') {
      if (stars === 3) tips += Math.round(labor * 0.5);
      else notes.push('pay.note.picky');
    }
    if (this.ctx.booth && this.faults.includes('scratch')) tips += 20;
    const wasted = this.wrong.reduce((s, p) => s + PARTS[p].price, 0) - this.refunded.reduce((s, p) => s + PARTS[p].price, 0);
    const parts = this.partsBill();
    const timeBonus = this.timeBonusNow();
    return { labor, parts, timeBonus, tips, wasted, total: labor + parts + timeBonus + tips, stars: stars as 1 | 2 | 3, notes };
  }
}

/** the steps of the battery swap: what may be done next and what the player did wrong */
export type BatteryStep = 'hood-open' | 'loosen' | 'clamp-off' | 'remove' | 'place' | 'clamp-on' | 'tighten' | 'hood-close' | 'done';
export type BatteryTarget = 'hood' | 'neg' | 'pos' | 'clamp' | 'old' | 'new';

export class BatterySwap {
  step: BatteryStep = 'hood-open';
  loose = new Set<'neg' | 'pos'>();

  targets(): BatteryTarget[] {
    switch (this.step) {
      case 'hood-open':
      case 'hood-close':
        return ['hood'];
      case 'loosen':
        return (['neg', 'pos'] as const).filter((t) => !this.loose.has(t));
      case 'clamp-off':
      case 'clamp-on':
        return ['clamp'];
      case 'remove':
        return ['old'];
      case 'place':
        return ['new'];
      case 'tighten':
        return (['pos', 'neg'] as const).filter((t) => this.loose.has(t));
      default:
        return [];
    }
  }

  next(): BatteryTarget | null {
    if (this.step === 'loosen') return this.loose.has('neg') ? 'pos' : 'neg';
    if (this.step === 'tighten') return this.loose.has('pos') ? 'pos' : 'neg';
    return this.targets()[0] ?? null;
  }

  /** `wrong-order`: (+) before (−) when disconnecting, or (−) before (+) when reconnecting: refused */
  act(t: BatteryTarget): 'ok' | 'wrong-order' | 'ignored' {
    if (!this.targets().includes(t)) return 'ignored';
    if (t !== this.next()) return 'wrong-order';
    switch (this.step) {
      case 'hood-open':
        this.step = 'loosen';
        break;
      case 'loosen':
        this.loose.add(t as 'neg' | 'pos');
        if (this.loose.size === 2) this.step = 'clamp-off';
        break;
      case 'clamp-off':
        this.step = 'remove';
        break;
      case 'remove':
        this.step = 'place';
        break;
      case 'place':
        this.step = 'clamp-on';
        break;
      case 'clamp-on':
        this.step = 'tighten';
        break;
      case 'tighten':
        this.loose.delete(t as 'neg' | 'pos');
        if (this.loose.size === 0) this.step = 'hood-close';
        break;
      case 'hood-close':
        this.step = 'done';
        break;
    }
    return 'ok';
  }
}

/** wheel nuts in a star pattern: the order around the circle for 5 nuts */
export const STAR_ORDER = [0, 2, 4, 1, 3];

export class StarPattern {
  private i = 0;
  constructor(readonly count = 5) {}
  get next() {
    return STAR_ORDER[this.i] ?? null;
  }
  get done() {
    return this.i >= this.count;
  }
  /** true if this is the right nut now */
  act(nut: number) {
    if (nut !== this.next) return false;
    this.i++;
    return true;
  }
}

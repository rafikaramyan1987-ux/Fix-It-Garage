/**
 * The rules of one repair job: diagnosis clues, workshop minutes, parts, the test start and the payout.
 * Pure logic (no rendering), driven by the play flow and covered by unit tests.
 */
import { FAULTS, PARTS, STEP_MINUTES, TOOLS, type FaultId, type JobDef, type PartId, type Reading, type ToolId } from './data';

export interface Payout {
  labor: number;
  parts: number;
  timeBonus: number;
  wasted: number;
  total: number;
  stars: 1 | 2 | 3;
  /** why stars were lost */
  notes: string[];
}

export class Job {
  minutes = 0;
  readonly clues = new Map<ToolId, Reading>();
  /** parts bought for this car (charged when ordered) */
  readonly bought: PartId[] = [];
  readonly installed = new Set<PartId>();
  /** wrong parts fitted (paid by the garage, not the customer) */
  readonly wrong: PartId[] = [];
  failedTests = 0;
  hintUsed = false;
  done = false;

  constructor(readonly def: JobDef) {}

  get faults() {
    return this.def.faults.map((f) => FAULTS[f]);
  }

  /** what a tool reads on this car: the first fault that changes it, else the healthy reading */
  reading(tool: ToolId): Reading {
    for (const f of this.faults) {
      const r = f.readings[tool];
      if (r) return r;
    }
    return TOOLS[tool].healthy;
  }

  /** use a diagnosis tool: costs its minutes the first time; returns the reading */
  useTool(tool: ToolId, free = false): Reading {
    const r = this.reading(tool);
    if (!this.clues.has(tool)) {
      if (!free) this.minutes += TOOLS[tool].minutes;
      this.clues.set(tool, r);
    }
    return r;
  }

  /** the rewarded "hint": reveals the most telling clue not found yet, for free */
  hintTool(): ToolId | null {
    const order: ToolId[] = ['tester', 'obd', 'listen', 'lift'];
    const telling = order.filter((t) => !this.clues.has(t) && this.reading(t).verdict === 'bad');
    const rest = order.filter((t) => !this.clues.has(t));
    return telling[0] ?? rest[0] ?? null;
  }

  needs(part: PartId) {
    return this.faults.some((f) => f.part === part);
  }

  buy(part: PartId) {
    this.bought.push(part);
    return PARTS[part].price;
  }

  install(part: PartId) {
    this.installed.add(part);
    if (!this.needs(part)) {
      this.wrong.push(part);
      this.minutes += STEP_MINUTES.quickInstall;
    }
  }

  addMinutes(m: number) {
    this.minutes += m;
  }

  get fixed() {
    return this.faults.every((f) => this.installed.has(f.part));
  }

  /** the test start: true if every fault is fixed */
  test(): boolean {
    this.minutes += STEP_MINUTES.test;
    if (this.fixed) {
      this.done = true;
      return true;
    }
    this.failedTests++;
    return false;
  }

  /** remaining time bonus for the current minutes */
  timeBonusNow() {
    const { targetMinutes: t, timeBonus: b } = this.def;
    if (this.minutes <= t) return b;
    if (this.minutes <= t * 1.5) return Math.round(b / 2);
    return 0;
  }

  payout(): Payout {
    const needed = this.faults.map((f) => f.part);
    const parts = needed.reduce((s, p) => s + PARTS[p].price, 0);
    const wasted = this.wrong.reduce((s, p) => s + PARTS[p].price, 0);
    const timeBonus = this.timeBonusNow();
    const notes: string[] = [];
    let stars = 3;
    if (this.wrong.length) {
      stars--;
      notes.push('Wrong part fitted');
    }
    if (this.minutes > this.def.targetMinutes) {
      stars--;
      notes.push('Over the target time');
    }
    if (stars === 3 && this.failedTests > 0) {
      stars--;
      notes.push('Failed test start');
    }
    return { labor: this.def.labor, parts, timeBonus, wasted, total: this.def.labor + parts + timeBonus, stars: Math.max(1, stars) as 1 | 2 | 3, notes };
  }
}

/** the battery swap, step by step: what may be done next and what the player did wrong */
export type BatteryStep = 'hood-open' | 'loosen' | 'clamp-off' | 'remove' | 'place' | 'clamp-on' | 'tighten' | 'hood-close' | 'done';
export type BatteryTarget = 'hood' | 'neg' | 'pos' | 'clamp' | 'old' | 'new';

export class BatterySwap {
  step: BatteryStep = 'hood-open';
  loose = new Set<'neg' | 'pos'>();

  /** targets the player may act on now (the UI highlights them) */
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

  /** the target the procedure expects next (for hints / the marker) */
  next(): BatteryTarget | null {
    if (this.step === 'loosen') return this.loose.has('neg') ? 'pos' : 'neg';
    if (this.step === 'tighten') return this.loose.has('pos') ? 'pos' : 'neg';
    return this.targets()[0] ?? null;
  }

  /**
   * Try an action. `wrong-order`: the (+) terminal before the (−) one when disconnecting, or the (−) before the (+)
   * when reconnecting: refused, it would short against the body.
   */
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

export type { FaultId };

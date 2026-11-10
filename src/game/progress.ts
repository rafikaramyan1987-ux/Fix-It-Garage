/**
 * Player progress: money, career position, upgrades, repair book, achievements, daily job and settings, stored under
 * one known localStorage key (or the portal's cloud storage). Pure logic + a tolerant loader.
 */
import { ACHIEVEMENTS, CAR_TYPES, FAULT_IDS, UPGRADES, UPGRADE_IDS, type AchievementId, type CarType, type FaultId, type UpgradeId } from './data';
import type { GarageCtx, Payout } from './job';
import type { JobDef } from './jobs';

export const SAVE_KEY = 'fixitgarage.save.v1';

export interface Stats {
  jobs: number;
  perfect: number;
  streak: number;
  noWaste: number;
  tricky: number;
  cars: CarType[];
  earned: number;
  daily: number;
}

export interface Settings {
  music: boolean;
  sfx: boolean;
  /** chosen language, null = automatic */
  lang: string | null;
}

export interface SaveData {
  money: number;
  /** next career job number (1-based) */
  career: number;
  /** best stars per career job number */
  stars: Record<string, number>;
  upgrades: UpgradeId[];
  book: FaultId[];
  ach: AchievementId[];
  stats: Stats;
  daily: { day: string; done: boolean };
  settings: Settings;
  tutorialDone: boolean;
  /** step hints the player has already followed (they are not shown again) */
  hintsSeen: string[];
}

export function newSave(): SaveData {
  return {
    money: 150,
    career: 1,
    stars: {},
    upgrades: [],
    book: [],
    ach: [],
    stats: { jobs: 0, perfect: 0, streak: 0, noWaste: 0, tricky: 0, cars: [], earned: 0, daily: 0 },
    daily: { day: '', done: false },
    settings: { music: true, sfx: true, lang: null },
    tutorialDone: false,
    hintsSeen: [],
  };
}

export interface KeyValueStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function local(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const list = <T extends string>(v: unknown, allowed: readonly T[]) => (Array.isArray(v) ? (v.filter((x) => allowed.includes(x)) as T[]) : []);

/** read the save; anything missing or broken falls back to the defaults */
export function loadSave(portal?: KeyValueStore | null): SaveData {
  const d = newSave();
  try {
    const raw = (portal ?? local())?.getItem(SAVE_KEY);
    if (!raw) return d;
    const s = JSON.parse(raw) as Partial<SaveData>;
    const st = (s.stats ?? {}) as Partial<Stats>;
    const set = (s.settings ?? {}) as Partial<Settings>;
    return {
      money: Math.max(0, num(s.money, d.money)),
      career: Math.max(1, Math.floor(num(s.career, 1))),
      stars: s.stars && typeof s.stars === 'object' ? Object.fromEntries(Object.entries(s.stars).filter(([, v]) => typeof v === 'number')) : {},
      upgrades: list(s.upgrades, UPGRADE_IDS),
      book: list(s.book, FAULT_IDS),
      ach: list(s.ach, Object.keys(ACHIEVEMENTS) as AchievementId[]),
      stats: {
        jobs: num(st.jobs, 0),
        perfect: num(st.perfect, 0),
        streak: num(st.streak, 0),
        noWaste: num(st.noWaste, 0),
        tricky: num(st.tricky, 0),
        cars: list(st.cars, CAR_TYPES),
        earned: num(st.earned, 0),
        daily: num(st.daily, 0),
      },
      daily: { day: typeof s.daily?.day === 'string' ? s.daily.day : '', done: !!s.daily?.done },
      settings: { music: set.music !== false, sfx: set.sfx !== false, lang: typeof set.lang === 'string' ? set.lang : null },
      tutorialDone: !!s.tutorialDone,
      hintsSeen: Array.isArray(s.hintsSeen) ? s.hintsSeen.filter((x): x is string => typeof x === 'string' && x.length < 40).slice(0, 80) : [],
    };
  } catch {
    return d;
  }
}

export function writeSave(d: SaveData, portal?: KeyValueStore | null) {
  try {
    (portal ?? local())?.setItem(SAVE_KEY, JSON.stringify(d));
  } catch {}
}

export const owns = (s: SaveData, u: UpgradeId) => s.upgrades.includes(u);

export function garageCtx(s: SaveData): GarageCtx {
  return {
    wrench: owns(s, 'wrench'),
    delivery: owns(s, 'delivery'),
    lift2: owns(s, 'lift2'),
    booth: owns(s, 'booth'),
    decor: (['plants', 'neon', 'lounge'] as UpgradeId[]).filter((u) => owns(s, u)).length,
  };
}

/** progress toward an achievement */
export function achProgress(s: SaveData, id: AchievementId): number {
  const st = s.stats;
  switch (id) {
    case 'first_fix':
      return st.jobs;
    case 'jobs_10':
      return st.jobs;
    case 'career':
      return s.career - 1;
    case 'perfect_5':
      return st.perfect;
    case 'streak_5':
      return st.streak;
    case 'no_waste_10':
      return st.noWaste;
    case 'tricky_5':
      return st.tricky;
    case 'all_cars':
      return st.cars.length;
    case 'book_full':
      return s.book.length;
    case 'daily_1':
      return st.daily;
    case 'first_upgrade':
      return s.upgrades.length;
    case 'all_upgrades':
      return s.upgrades.length;
    case 'rich':
      return st.earned;
  }
}

/** unlock achievements that reached their goal; returns the new ones */
export function checkAchievements(s: SaveData): AchievementId[] {
  const out: AchievementId[] = [];
  for (const id of Object.keys(ACHIEVEMENTS) as AchievementId[]) {
    if (!s.ach.includes(id) && achProgress(s, id) >= ACHIEVEMENTS[id].goal) {
      s.ach.push(id);
      out.push(id);
    }
  }
  return out;
}

/** record a finished job: money, career, stats, repair book; returns new achievements */
export function finishJob(s: SaveData, job: JobDef, p: Payout, paid: number, wrongParts: number, today: string): AchievementId[] {
  s.money += paid;
  s.stats.earned += paid;
  s.stats.jobs++;
  if (p.stars === 3) {
    s.stats.perfect++;
    s.stats.streak++;
  } else s.stats.streak = 0;
  s.stats.noWaste = wrongParts ? 0 : s.stats.noWaste + 1;
  if (job.mod) s.stats.tricky++;
  if (!s.stats.cars.includes(job.car)) s.stats.cars.push(job.car);
  for (const f of job.faults) if (!s.book.includes(f) && f !== 'scratch') s.book.push(f);
  if (job.daily) {
    s.daily = { day: today, done: true };
    s.stats.daily++;
  } else if (job.n === s.career) {
    s.stars[job.n] = Math.max(s.stars[job.n] ?? 0, p.stars);
    s.career++;
  }
  return checkAchievements(s);
}

export function canBuy(s: SaveData, u: UpgradeId) {
  return !owns(s, u) && s.money >= UPGRADES[u].price;
}

export function buyUpgrade(s: SaveData, u: UpgradeId): AchievementId[] | null {
  if (!canBuy(s, u)) return null;
  s.money -= UPGRADES[u].price;
  s.upgrades.push(u);
  return checkAchievements(s);
}

export function dailyDone(s: SaveData, today: string) {
  return s.daily.day === today && s.daily.done;
}

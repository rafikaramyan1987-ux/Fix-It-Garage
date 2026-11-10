/** Progress saved to localStorage under one known key (portal cloud storage when the platform provides it). */
import type { FaultId } from '../game/data';
import type { KeyValueStore } from './platform/types';

export const SAVE_KEY = 'fixitgarage.save.v1';

export interface SaveData {
  money: number;
  jobsDone: number;
  stars: number;
  /** faults discovered, for the repair book */
  book: FaultId[];
  muted: boolean;
}

export const NEW_SAVE: SaveData = { money: 150, jobsDone: 0, stars: 0, book: [], muted: false };

function local(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** `store`: the portal's cloud storage, or null / omitted for localStorage */
export function loadSave(portal?: KeyValueStore | null): SaveData {
  const store = portal ?? local();
  try {
    const raw = store?.getItem(SAVE_KEY);
    if (!raw) return { ...NEW_SAVE, book: [] };
    const d = JSON.parse(raw) as Partial<SaveData>;
    return {
      money: Number.isFinite(d.money) ? Math.max(0, Number(d.money)) : NEW_SAVE.money,
      jobsDone: Number.isFinite(d.jobsDone) ? Number(d.jobsDone) : 0,
      stars: Number.isFinite(d.stars) ? Number(d.stars) : 0,
      book: Array.isArray(d.book) ? (d.book.filter((x) => typeof x === 'string') as FaultId[]) : [],
      muted: !!d.muted,
    };
  } catch {
    return { ...NEW_SAVE, book: [] };
  }
}

export function writeSave(d: SaveData, portal?: KeyValueStore | null) {
  const store = portal ?? local();
  try {
    store?.setItem(SAVE_KEY, JSON.stringify(d));
  } catch {}
}

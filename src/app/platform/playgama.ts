/**
 * Playgama Bridge (https://github.com/Playgama/bridge) wrapper. index.html of the Playgama build loads Bridge from
 * Playgama's CDN (https://bridge.playgama.com/v2/stable/playgama-bridge.js) as its first script and initializes it
 * before the game bundle runs (vite.config.ts, scripts/playgama/boot.js); outside Playgama, Bridge runs its mock
 * platform (no ads, local storage).
 * - init (before the menu / the first job): `bridge.initialize()` (called by index.html's boot script, see initBridge),
 *   then `platform.language` (Bridge's own fallback is the browser language; the game falls back to English), the
 *   save through Bridge Storage (one `storage.get([...])` of every key), `platform.isAudioEnabled`, and the AUDIO_STATE_CHANGED / PAUSE_STATE_CHANGED events
 * - `game_ready` once the loading screen is gone and the player can play (`gameReady()`, called by main.ts)
 * - gameplay start → `level_started`; a repaired car paid (payment screen) → `level_completed`, a job left from the pause menu →
 *   `level_failed` (Bridge has no gameplay start / stop)
 * - interstitials (`advertisement.showInterstitial()`) only at the break between jobs (after Next on the payment screen),
 *   at most one per ~2 minutes (MIDGAME_GAP, plus `minimumDelayBetweenInterstitial: 120` in
 *   playgama-bridge-config.json); never during a level, no pre-roll
 * - rewarded (`advertisement.showRewarded()`) only from the labelled ad buttons (`available` is Bridge's
 *   `isRewardedSupported`, so the buttons are hidden where Bridge has no rewarded ads); the reward is granted only
 *   when Bridge reports the `rewarded` state; closed / failed without it: no reward
 * - every ad request settles exactly once (closed / failed, or not opened within AD_TIMEOUT)
 * - an ad opening, Bridge's pause state and the page being hidden pause the level and mute all audio; Bridge's audio
 *   state mutes without pausing; audio comes back only when nothing keeps the game silent, and then through the
 *   player's own sound / music settings (audio.ts)
 */

import { AD_TIMEOUT, MIDGAME_GAP, type AdSlot, type KeyValueStore, type Platform } from './types';

/** every storage key the game uses (src/game/progress.ts SAVE_KEY), read in one `storage.get([...])` at startup */
export const PLAYGAMA_STORAGE_KEYS = ['fixitgarage.save.v1'];

/**
 * Bridge after `bridge.initialize()`, or null when it failed (logged with console.error, never silent; the game then
 * plays on without the SDK). In the Playgama build index.html's boot script (scripts/playgama/boot.js) already called
 * initialize() and started the game only once it settled: its outcome is `window.__playgamaBridgeInit`. No timeout of
 * the game's own: Bridge settles the promise itself (Playgama: wait for initialization before anything else).
 */
export async function initBridge(): Promise<BridgeSdk | null> {
  if (typeof window === 'undefined') return null;
  const b = window.bridge;
  if (!b?.initialize) {
    console.error('[Playgama Bridge] window.bridge is missing: the game runs WITHOUT Playgama Bridge (no ads, no Bridge storage, no game_ready)');
    return null;
  }
  const booted = window.__playgamaBridgeInit;
  const err = booted
    ? await booted
    : await b.initialize().then(
        () => null,
        (e: unknown) => e ?? new Error('bridge.initialize() rejected'),
      );
  if (err) {
    // the boot script has logged it already
    if (!booted) console.error('[Playgama Bridge] bridge.initialize() failed; the game runs WITHOUT Playgama Bridge (no ads, no Bridge storage, no game_ready):', err);
    return null;
  }
  return b;
}

type Listener = (v: never) => void;
export interface BridgeSdk {
  initialize(): Promise<unknown>;
  EVENT_NAME: Record<'INTERSTITIAL_STATE_CHANGED' | 'REWARDED_STATE_CHANGED' | 'AUDIO_STATE_CHANGED' | 'PAUSE_STATE_CHANGED', string>;
  platform: {
    id: string;
    language: string;
    isAudioEnabled: boolean;
    sendMessage(message: string, options?: Record<string, unknown>): unknown;
    on(event: string, fn: Listener): void;
  };
  advertisement: {
    isInterstitialSupported: boolean;
    isRewardedSupported: boolean;
    showInterstitial(placement?: string): void;
    showRewarded(placement?: string): void;
    on(event: string, fn: Listener): void;
  };
  storage: {
    get(keys: string[]): Promise<unknown[]>;
    set(key: string, value: string): Promise<unknown>;
  };
}

declare global {
  interface Window {
    bridge?: BridgeSdk;
    /** the Playgama platform, for scripts/playgama/test.mjs */
    __playgama?: PlaygamaPlatform;
    /** set by the Playgama build's boot script: bridge.initialize()'s outcome (null = initialized, else the error) */
    __playgamaBridgeInit?: Promise<unknown>;
  }
}

type PauseReason = 'sdk' | 'hidden' | 'ad';
type AdType = 'interstitial' | 'rewarded';
interface Pending {
  type: AdType;
  opened: boolean;
  earned: boolean;
  finish: (ok: boolean) => void;
}

export class PlaygamaPlatform implements Platform {
  readonly name = 'playgama';
  readonly autoResume = false;
  private b: BridgeSdk | null = null;
  private playing = false;
  private levelOn = false;
  private readySent = false;
  private lastMidgame = Date.now(); // no interstitial right after loading (as in the other builds)
  private pausedBy = new Set<PauseReason>();
  private paused = false;
  /** Bridge says the platform's audio is off (independent of pauses) */
  private soundOff = false;
  private lang: string | null = null;
  private store: KeyValueStore | null = null;
  private pending: Pending | null = null;
  muted = false;
  /** what was sent to / received from Bridge (messages, ad states), for scripts/playgama/test.mjs */
  readonly log: string[] = [];
  onMute: (m: boolean) => void = () => {};
  onAdPause: (paused: boolean) => void = () => {};

  async init() {
    if (typeof window !== 'undefined') window.__playgama = this;
    this.b = await initBridge();
    const s = this.b;
    if (s) {
      try {
        this.lang = s.platform.language || null;
      } catch {
        this.lang = null;
      }
      await this.loadStore(s);
      const E = s.EVENT_NAME;
      try {
        this.soundOff = s.platform.isAudioEnabled === false;
        s.platform.on(E.AUDIO_STATE_CHANGED, ((on: boolean) => this.setSound(on !== false)) as Listener);
        s.platform.on(E.PAUSE_STATE_CHANGED, ((p: boolean) => this.setPaused('sdk', !!p)) as Listener);
        s.advertisement.on(E.INTERSTITIAL_STATE_CHANGED, ((st: string) => this.onAdState('interstitial', st)) as Listener);
        s.advertisement.on(E.REWARDED_STATE_CHANGED, ((st: string) => this.onAdState('rewarded', st)) as Listener);
      } catch {
        /* no events: play on */
      }
      this.updateMute();
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => this.setPaused('hidden', document.hidden));
      // Playgama 1.4.5: a long press on the game opens no context menu, callout or magnifier
      document.addEventListener('contextmenu', (e) => e.preventDefault());
      document.documentElement?.style?.setProperty('-webkit-touch-callout', 'none');
    }
  }

  /** every key in one `storage.get([...])`, kept in memory; writes go to Bridge Storage (its default storage type) */
  private async loadStore(s: BridgeSdk) {
    const mem = new Map<string, string>();
    try {
      const vals = await s.storage.get(PLAYGAMA_STORAGE_KEYS);
      PLAYGAMA_STORAGE_KEYS.forEach((k, i) => {
        const v = Array.isArray(vals) ? vals[i] : null;
        if (v !== null && v !== undefined) mem.set(k, typeof v === 'string' ? v : JSON.stringify(v));
      });
    } catch {
      /* nothing saved yet / storage unavailable: defaults */
    }
    this.store = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => {
        if (mem.get(k) === v) return;
        mem.set(k, v);
        try {
          void Promise.resolve(s.storage.set(k, v)).catch(() => {});
        } catch {
          /* keep playing; the in-memory copy stays */
        }
      },
    };
  }

  /** rewarded ads exist here: Bridge is up and supports them (otherwise the rewarded buttons are hidden) */
  get available() {
    try {
      return !!this.b && this.b.advertisement.isRewardedSupported === true;
    } catch {
      return false;
    }
  }

  /** pause the level + mute; idempotent, reasons tracked separately */
  setPaused(reason: PauseReason, on: boolean) {
    if (on === this.pausedBy.has(reason)) return;
    if (on) this.pausedBy.add(reason);
    else this.pausedBy.delete(reason);
    const p = this.pausedBy.size > 0;
    if (p !== this.paused) {
      this.paused = p;
      this.onAdPause(p);
    }
    this.updateMute();
  }

  /** the platform's audio state: off mutes (no pause), on restores only if nothing else keeps the game silent */
  setSound(on: boolean) {
    if (this.soundOff === !on) return;
    this.soundOff = !on;
    this.updateMute();
  }

  private updateMute() {
    const m = this.paused || this.soundOff;
    if (m === this.muted) return;
    this.muted = m;
    this.onMute(m);
  }

  private onAdState(type: AdType, state: string) {
    this.log.push(`${type}:${state}`);
    const p = this.pending;
    if (!p || p.type !== type) return;
    if (state === 'opened') {
      p.opened = true;
      this.setPaused('ad', true);
    } else if (state === 'rewarded') p.earned = true;
    else if (state === 'closed') p.finish(type === 'rewarded' ? p.earned : true);
    else if (state === 'failed') p.finish(false);
  }

  locale() {
    return this.lang;
  }
  data() {
    return this.store;
  }
  loadingStart() {}
  loadingStop() {}
  /** the loading screen is gone and the first playable frame is up: Bridge's `game_ready`, once */
  gameReady() {
    if (this.readySent || !this.b) return;
    this.readySent = true;
    this.send('game_ready');
  }
  gameplayStart() {
    this.playing = true;
    if (this.levelOn) return;
    this.levelOn = true;
    this.send('level_started');
  }
  gameplayStop() {
    this.playing = false;
  }
  /** a level ended (result screen): the next gameplayStart is a new level */
  levelEnd(won: boolean) {
    if (!this.levelOn) return;
    this.levelOn = false;
    this.send(won ? 'level_completed' : 'level_failed');
  }
  happytime() {}
  sadMoment() {}
  private send(m: string) {
    this.log.push(m);
    try {
      void Promise.resolve(this.b?.platform.sendMessage(m)).catch(() => {});
    } catch {
      /* ignore */
    }
  }

  /** Show an ad and settle exactly once: closed / failed, or not opened within AD_TIMEOUT. Resumes the game after. */
  private requestAd(type: AdType): Promise<boolean> {
    const s = this.b;
    if (!s || this.pending) return Promise.resolve(false);
    return new Promise((res) => {
      let done = false;
      const pending: Pending = {
        type,
        opened: false,
        earned: false,
        finish: (ok) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (this.pending === pending) this.pending = null;
          this.setPaused('ad', false);
          res(ok);
        },
      };
      this.pending = pending;
      const timer = setTimeout(() => {
        if (!pending.opened) pending.finish(false);
      }, AD_TIMEOUT);
      try {
        if (type === 'rewarded') s.advertisement.showRewarded();
        else s.advertisement.showInterstitial();
      } catch {
        pending.finish(false);
      }
    });
  }

  /** no pre-roll: Play on the title continues at once. Interstitials at the result-screen breaks between levels. */
  adSlot(slot: AdSlot) {
    return slot !== 'preroll';
  }

  /** Interstitial between levels, at most once per ~2 minutes (MIDGAME_GAP). Never in a level, one at a time. */
  async midgame(slot: AdSlot = 'between'): Promise<void> {
    if (!this.adSlot(slot) || this.playing || !this.b || this.pending) return;
    try {
      if (!this.b.advertisement.isInterstitialSupported) return;
    } catch {
      return;
    }
    if (Date.now() - this.lastMidgame < MIDGAME_GAP) return;
    this.lastMidgame = Date.now();
    await this.requestAd('interstitial');
  }

  /** Rewarded ad; true only when Bridge reported the `rewarded` state before the ad closed. */
  async rewarded(): Promise<boolean> {
    if (!this.available) return false;
    const ok = await this.requestAd('rewarded');
    // a finished rewarded ad also counts as the interstitial break (same as the other builds)
    if (ok) this.lastMidgame = Date.now();
    return ok;
  }
}

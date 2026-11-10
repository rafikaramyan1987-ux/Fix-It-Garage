/**
 * GamePix JS SDK v3 wrapper. The SDK is loaded by index.html in the GamePix build only (manual lifecycle, see
 * vite.config.ts), before the game bundle, so `window.GamePix` is there when the game boots (or missing if blocked).
 * - lifecycle: loading(0..100) during boot, `await loaded()` before the menu shows, gameStart() once, when the
 *   first level starts
 * - `pause` / `resume` SDK events and document visibility (hidden / visible): pause the level and mute all audio;
 *   resume restores audio only through the player's own sound settings. Idempotent, reasons are tracked separately.
 * - interstitials (`GamePix.ads.interstitial()`) only at natural breaks after a click (Next / Retry / Menu on the
 *   result screens), at most one per ~2 minutes (none in the first ~2 minutes after loading); never during a level,
 *   one at a time. No pre-roll (the Play slot continues at once).
 * - rewarded (`GamePix.ads.reward()`): the reward is granted only when `success === true`; never rate-limited (a
 *   completed one counts as the interstitial break, as in the GD build)
 * - every ad request settles exactly once (result, rejection, or not started within 8 s)
 * - happyMoment / sadMoment signals, GamePix.lang() as the locale, plain localStorage for saves
 */

import { AD_TIMEOUT, MIDGAME_GAP, type AdSlot, type Platform } from './types';

export const GPX_SDK_URL = 'https://integration.gamepix.com/sdk/v3/gamepix.sdk.js';
/** a rewarded ad whose `resume` came without a result gets this long for a late result (ms) */
export const REWARD_GRACE = 600;

export interface GamePixAdResult {
  success: boolean;
  message?: string;
}
export interface GamePixSdk {
  lifecycle: { loading(p: number): void; loaded(): Promise<unknown>; gameStart(): void };
  events: { on(name: 'pause' | 'resume', fn: () => void): void };
  ads: { interstitial(): Promise<GamePixAdResult>; reward(): Promise<GamePixAdResult> };
  lang?(): string;
  happyMoment?(name: string): void;
  sadMoment?(name: string): void;
}

declare global {
  interface Window {
    GamePix?: GamePixSdk;
    GamePixConfig?: { lifecycle?: 'manual' | 'auto' };
  }
}

type PauseReason = 'sdk' | 'hidden';
type AdType = 'interstitial' | 'reward';
interface Pending {
  started: boolean;
  start: () => void;
  resumed: () => void;
}

export class GamePixPlatform implements Platform {
  readonly name = 'gamepix';
  readonly autoResume = true;
  private s: GamePixSdk | null = null;
  private progress = 0;
  private loaded = false;
  private started = false;
  private playing = false;
  private lastMidgame = Date.now(); // no interstitial right after loading (as in the other builds)
  private pausedBy = new Set<PauseReason>();
  private paused = false;
  private pending: Pending | null = null;
  muted = false;
  onMute: (m: boolean) => void = () => {};
  onAdPause: (paused: boolean) => void = () => {};

  async init() {
    const s = typeof window !== 'undefined' ? window.GamePix : undefined;
    if (s?.lifecycle && s.events && s.ads) {
      this.s = s;
      try {
        s.events.on('pause', () => {
          this.pending?.start();
          this.setPaused('sdk', true);
        });
        s.events.on('resume', () => this.onResume());
      } catch {
        /* no events: play on */
      }
    }
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', () => this.setPaused('hidden', document.hidden));
    this.loading(10);
  }

  get available() {
    return !!this.s;
  }

  /** progress 0..100, integer, only increasing */
  private loading(p: number) {
    p = Math.round(Math.min(100, Math.max(0, p)));
    if (p <= this.progress) return;
    this.progress = p;
    try {
      this.s?.lifecycle.loading(p);
    } catch {
      /* ignore */
    }
  }

  /** the SDK's pause / document hidden: pause the level + mute; idempotent */
  setPaused(reason: PauseReason, on: boolean) {
    if (on) this.pausedBy.add(reason);
    else this.pausedBy.delete(reason);
    const p = this.pausedBy.size > 0;
    if (p === this.paused) return;
    this.paused = p;
    this.muted = p;
    this.onMute(p);
    this.onAdPause(p);
  }

  private onResume() {
    this.setPaused('sdk', false);
    this.pending?.resumed();
  }

  locale() {
    try {
      return this.s?.lang?.() ?? null;
    } catch {
      return null;
    }
  }
  data() {
    return null;
  }
  loadingStart() {
    this.loading(30);
  }
  /** end of loading: 100 %, then wait for `loaded()` (it resolves even without a Player; capped so it never blocks) */
  async ready() {
    this.loading(100);
    const s = this.s;
    if (s && !this.loaded) {
      try {
        await Promise.race([s.lifecycle.loaded(), new Promise((r) => setTimeout(r, 5000))]);
      } catch {
        /* play on */
      }
    }
    this.loaded = true;
  }
  loadingStop() {
    this.loading(100);
  }
  gameplayStart() {
    this.playing = true;
    if (this.started || !this.s || !this.loaded) return;
    this.started = true;
    try {
      this.s.lifecycle.gameStart();
    } catch {
      /* ignore */
    }
  }
  gameplayStop() {
    this.playing = false;
  }
  happytime(name = 'level_complete') {
    if (!this.loaded) return;
    try {
      this.s?.happyMoment?.(name);
    } catch {
      /* ignore */
    }
  }
  sadMoment(name: string) {
    if (!this.loaded) return;
    try {
      this.s?.sadMoment?.(name);
    } catch {
      /* ignore */
    }
  }

  /**
   * Show an ad and settle exactly once: true only on `success === true`; false on `success: false`, rejection,
   * a throw, a `resume` without a result (after a short grace), or nothing started within AD_TIMEOUT. The SDK
   * pauses / resumes the game itself around the ad; settling always resumes the game and its audio too.
   */
  private requestAd(type: AdType): Promise<boolean> {
    const s = this.s;
    if (!s || !this.loaded || this.pending) return Promise.resolve(false);
    return new Promise((res) => {
      let done = false;
      let grace: ReturnType<typeof setTimeout> | undefined;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearTimeout(grace);
        if (this.pending === pending) this.pending = null;
        this.setPaused('sdk', false);
        res(ok);
      };
      const pending: Pending = {
        started: false,
        // the ad started (the SDK paused the game): wait for its result, however long it plays
        start: () => {
          pending.started = true;
          clearTimeout(timer);
        },
        resumed: () => {
          if (!pending.started || done || grace !== undefined) return;
          grace = setTimeout(() => finish(false), REWARD_GRACE);
        },
      };
      this.pending = pending;
      const timer = setTimeout(() => {
        if (!pending.started) finish(false);
      }, AD_TIMEOUT);
      try {
        const r = type === 'reward' ? s.ads.reward() : s.ads.interstitial();
        Promise.resolve(r).then(
          (v) => finish(!!v && v.success === true),
          () => finish(false),
        );
      } catch {
        finish(false);
      }
    });
  }

  /** GamePix has no pre-roll: Play on the title continues at once. Interstitials at the result-screen breaks. */
  adSlot(slot: AdSlot) {
    return slot !== 'preroll';
  }

  /** Interstitial at a natural break, at most once per ~2 minutes (MIDGAME_GAP). Never in a level, one at a time. */
  async midgame(slot: AdSlot = 'between'): Promise<void> {
    if (!this.adSlot(slot) || this.playing || !this.s || !this.loaded || this.pending) return;
    if (Date.now() - this.lastMidgame < MIDGAME_GAP) return;
    this.lastMidgame = Date.now();
    await this.requestAd('interstitial');
  }

  /** Rewarded ad (not rate-limited); true only when the SDK reports `success: true`. Without the SDK there is no reward. */
  async rewarded(): Promise<boolean> {
    const ok = await this.requestAd('reward');
    // a finished rewarded ad also counts as the interstitial break (same as the GD build)
    if (ok) this.lastMidgame = Date.now();
    return ok;
  }
}

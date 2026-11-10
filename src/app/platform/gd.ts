/**
 * GameDistribution HTML5 SDK wrapper (https://github.com/GameDistribution/GD-HTML5/wiki/SDK-Implementation).
 * - `window.GD_OPTIONS` + main.min.js loaded once while the game boots (never from a click)
 * - SDK_GAME_PAUSE: pause the game and mute all audio; SDK_GAME_START: resume and restore audio
 * - interstitials (`gdsdk.showAd()`) only from user input outside gameplay: Play on the title (pre-roll) and the
 *   result-screen buttons, at most one per ~2 minutes
 * - rewarded ads (`gdsdk.showAd('rewarded')`): the reward is granted only after SDK_REWARDED_WATCH_COMPLETE
 * - every ad request settles exactly once (completion, rejection / AD_ERROR / AD_SDK_CANCELED, or not started in 8 s)
 * - saves use localStorage (no portal storage); if the SDK fails to load the game plays on without ads
 */

import { AD_TIMEOUT, MIDGAME_GAP, loadScript, type AdSlot, type Platform } from './types';

/** Fix It Garage's GameDistribution game ID (checked in CI by scripts/submission/check.mjs) */
export const GD_GAME_ID = 'ca104008d4054b3b9652dd239bc9893f';
export const GD_SDK_URL = 'https://html5.api.gamedistribution.com/main.min.js';
export const GD_SCRIPT_ID = 'gamedistribution-jssdk';
/** a rewarded ad that closed without SDK_REWARDED_WATCH_COMPLETE gets this long for a late event (ms) */
export const REWARD_GRACE = 600;

export interface GDEvent {
  name: string;
  message?: string;
  status?: string;
}
export interface GDSdk {
  showAd(type?: 'interstitial' | 'rewarded'): Promise<unknown> | void;
  preloadAd?(type?: string): Promise<unknown>;
}

declare global {
  interface Window {
    GD_OPTIONS?: { gameId: string; onEvent: (e: GDEvent) => void };
    gdsdk?: GDSdk;
  }
}

type AdType = 'interstitial' | 'rewarded';
interface Pending {
  type: AdType;
  started: boolean;
  finish: (ok: boolean) => void;
  closed: () => void;
}

export class GDPlatform implements Platform {
  readonly name = 'gd';
  readonly autoResume = true;
  private playing = false;
  private lastMidgame = Date.now(); // no mid-game ad right after loading (the pre-roll is separate)
  private prerollDone = false;
  private adPaused = false;
  private pending: Pending | null = null;
  muted = false;
  onMute: (m: boolean) => void = () => {};
  onAdPause: (paused: boolean) => void = () => {};

  constructor(private readonly gameId = GD_GAME_ID) {}

  async init(timeoutMs = 3500) {
    window.GD_OPTIONS = { gameId: this.gameId, onEvent: (e) => this.onEvent(e) };
    if (document.getElementById(GD_SCRIPT_ID) || window.gdsdk) return;
    try {
      await loadScript(GD_SDK_URL, timeoutMs, GD_SCRIPT_ID);
    } catch {
      /* blocked / offline / slow: play on without ads (a late load still enables them) */
    }
  }

  get available() {
    return typeof window.gdsdk?.showAd === 'function';
  }
  locale() {
    return null;
  }
  data() {
    return null;
  }
  loadingStart() {}
  loadingStop() {}
  gameplayStart() {
    this.playing = true;
  }
  gameplayStop() {
    this.playing = false;
  }
  happytime() {}

  /** SDK events (also fired for ads the SDK shows by itself) */
  onEvent(e: GDEvent) {
    const p = this.pending;
    switch (e?.name) {
      case 'SDK_GAME_PAUSE':
        if (p) p.started = true;
        this.setAdPaused(true);
        break;
      case 'SDK_GAME_START':
        this.setAdPaused(false);
        if (p?.started) p.closed();
        break;
      case 'SDK_REWARDED_WATCH_COMPLETE':
        if (p?.type === 'rewarded') p.finish(true);
        break;
      case 'AD_ERROR':
      case 'AD_SDK_CANCELED':
        p?.finish(false);
        break;
    }
  }

  private setAdPaused(p: boolean) {
    if (this.adPaused === p) return;
    this.adPaused = p;
    this.muted = p;
    this.onMute(p);
    this.onAdPause(p);
  }

  /**
   * Show an ad and settle exactly once: true on completion (rewarded: SDK_REWARDED_WATCH_COMPLETE), false on
   * rejection, AD_ERROR, AD_SDK_CANCELED, a rewarded ad closed early, or nothing started within AD_TIMEOUT.
   * Settling always resumes the game and its audio.
   */
  private requestAd(type: AdType): Promise<boolean> {
    const s = window.gdsdk;
    if (!s || this.pending) return Promise.resolve(false);
    return new Promise((res) => {
      let done = false;
      let grace: ReturnType<typeof setTimeout> | undefined;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearTimeout(grace);
        if (this.pending === pending) this.pending = null;
        this.setAdPaused(false);
        res(ok);
      };
      const pending: Pending = {
        type,
        started: false,
        finish,
        // the ad closed: an interstitial is complete; a rewarded ad without the watch-complete event is not
        closed: () => {
          if (type === 'interstitial') finish(true);
          else if (!done && grace === undefined) grace = setTimeout(() => finish(false), REWARD_GRACE);
        },
      };
      this.pending = pending;
      const timer = setTimeout(() => {
        if (!pending.started) finish(false);
      }, AD_TIMEOUT);
      try {
        const r = type === 'rewarded' ? s.showAd('rewarded') : s.showAd();
        if (r && typeof (r as Promise<unknown>).then === 'function')
          (r as Promise<unknown>).then(
            () => pending.closed(),
            () => finish(false),
          );
      } catch {
        finish(false);
      }
    });
  }

  adSlot(_slot: AdSlot) {
    return true;
  }

  /** Interstitial: the first Play on the title is the pre-roll, the rest at most once per ~2 minutes. Never in a level. */
  async midgame(slot: AdSlot = 'between'): Promise<void> {
    if (!this.available || this.playing) return;
    if (slot === 'preroll' && !this.prerollDone) this.prerollDone = true;
    else if (Date.now() - this.lastMidgame < MIDGAME_GAP) return;
    this.lastMidgame = Date.now();
    await this.requestAd('interstitial');
  }

  /** Rewarded ad; true only after SDK_REWARDED_WATCH_COMPLETE. Without the SDK there is no reward (button says "no ad"). */
  async rewarded(): Promise<boolean> {
    if (!this.available) return false;
    const ok = await this.requestAd('rewarded');
    // a finished rewarded ad also counts as the interstitial break
    if (ok) this.lastMidgame = Date.now();
    return ok;
  }
}

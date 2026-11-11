/**
 * GameMonetize.com HTML5 SDK wrapper (https://github.com/GameMonetize/GameMonetize.com-SDK).
 * - `window.SDK_OPTIONS = { gameId, onEvent }`, then https://api.gamemonetize.com/sdk.js injected once while the game
 *   boots (never from a click), as the README's loader does it: a `<script id="gamemonetize-sdk">` inserted before the
 *   first script of the page, only if no element with that id exists yet
 * - SDK_GAME_PAUSE: pause the game and mute all audio (no game audio under the ad); SDK_GAME_START: resume and restore
 *   audio through the player's own settings; SDK_READY: interstitials can be shown
 * - interstitials (`sdk.showBanner()`) only from user input outside gameplay, at the same breaks as the GD build: Play on
 *   the title (pre-roll) and Next on the payment screen, at most one per ~2 minutes; never in a level, never on a timer
 * - every ad request settles exactly once (SDK_GAME_START, a throwing showBanner(), or not started within AD_TIMEOUT)
 * - rewarded: the SDK documents no rewarded API and no completion event, so there is none: `available` is false and the
 *   game hides every "watch an ad" button in this build (showBanner() is never used as a fake rewarded ad)
 * - saves use localStorage (no portal storage); if the SDK fails to load the game plays on without ads
 */

import { AD_TIMEOUT, MIDGAME_GAP, type AdSlot, type Platform } from './types';

export const GM_GAME_ID = '13mqh7opto5pk2mgoctppra0kqiz1mue';
export const GM_SDK_URL = 'https://api.gamemonetize.com/sdk.js';
export const GM_SCRIPT_ID = 'gamemonetize-sdk';
/** a started ad that never sends SDK_GAME_START is given up after this long, so the game cannot stay paused (ms) */
export const AD_MAX = 120_000;

export interface GMEvent {
  name: string;
}
export interface GMSdk {
  showBanner(): unknown;
}

declare global {
  interface Window {
    SDK_OPTIONS?: { gameId: string; onEvent: (e: GMEvent) => void };
    sdk?: GMSdk;
  }
}

interface Pending {
  started: boolean;
  finish: () => void;
}

export class GameMonetizePlatform implements Platform {
  readonly name = 'gamemonetize';
  readonly autoResume = true;
  /** no rewarded ads on GameMonetize: the game hides every rewarded button */
  readonly available = false;
  private sdkReady = false;
  private playing = false;
  private lastMidgame = Date.now(); // no mid-game ad right after loading (the pre-roll is separate)
  private prerollDone = false;
  private adPaused = false;
  private pending: Pending | null = null;
  muted = false;
  onMute: (m: boolean) => void = () => {};
  onAdPause: (paused: boolean) => void = () => {};

  constructor(private readonly gameId = GM_GAME_ID) {}

  /** README loader: SDK_OPTIONS first, then sdk.js once. Waits for SDK_READY (or the script load) at most `timeoutMs`. */
  async init(timeoutMs = 3500) {
    window.SDK_OPTIONS = { gameId: this.gameId, onEvent: (e) => this.onEvent(e) };
    if (document.getElementById(GM_SCRIPT_ID)) return;
    await new Promise<void>((res) => {
      const done = () => {
        clearTimeout(to);
        res();
      };
      const to = setTimeout(done, timeoutMs);
      try {
        const first = document.getElementsByTagName('script')[0];
        const el = document.createElement('script');
        el.id = GM_SCRIPT_ID;
        el.src = GM_SDK_URL;
        el.onload = done;
        el.onerror = done; // blocked / offline: play on without ads
        if (first?.parentNode) first.parentNode.insertBefore(el, first);
        else document.head.appendChild(el);
      } catch {
        done();
      }
    });
  }

  /** SDK_READY seen and `sdk.showBanner` present */
  get adsReady() {
    return this.sdkReady && typeof window.sdk?.showBanner === 'function';
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
  onEvent(e: GMEvent) {
    const p = this.pending;
    switch (e?.name) {
      case 'SDK_READY':
        this.sdkReady = true;
        break;
      case 'SDK_GAME_PAUSE':
        if (p) p.started = true;
        this.setAdPaused(true);
        break;
      case 'SDK_GAME_START':
        this.setAdPaused(false);
        // the ad is done (or there was none to show): the request settles
        p?.finish();
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

  /** showBanner() and settle exactly once: SDK_GAME_START, a throw, nothing started in AD_TIMEOUT, or AD_MAX in all */
  private requestAd(): Promise<void> {
    const s = window.sdk;
    if (!s || this.pending) return Promise.resolve();
    return new Promise((res) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(notStarted);
        clearTimeout(cap);
        if (this.pending === pending) this.pending = null;
        this.setAdPaused(false);
        res();
      };
      const pending: Pending = { started: false, finish };
      this.pending = pending;
      const notStarted = setTimeout(() => {
        if (!pending.started) finish();
      }, AD_TIMEOUT);
      const cap = setTimeout(finish, AD_MAX);
      try {
        s.showBanner();
      } catch {
        finish();
      }
    });
  }

  adSlot(_slot: AdSlot) {
    return true;
  }

  /** Interstitial: the first Play on the title is the pre-roll, the rest at most once per ~2 minutes. Never in a level. */
  async midgame(slot: AdSlot = 'between'): Promise<void> {
    if (!this.adsReady || this.playing) return;
    if (slot === 'preroll' && !this.prerollDone) this.prerollDone = true;
    else if (Date.now() - this.lastMidgame < MIDGAME_GAP) return;
    this.lastMidgame = Date.now();
    await this.requestAd();
  }

  /** no rewarded API in the GameMonetize SDK: never shows an ad, never grants a reward */
  async rewarded(): Promise<boolean> {
    return false;
  }
}

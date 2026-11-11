/**
 * Y8 SDK wrapper (https://docs.y8.com/sdk/intro/, /sdk/advertising/, /sdk/ad-placement-guidelines/,
 * /studio/game-requirements/).
 * - the SDK comes only from Y8's CDN: `<script src="https://cdn.y8.com/minimal-sdk/2-0/y8.min.js" async>` in <head>
 *   (vite.config.ts, Y8 build only), never bundled
 * - initialized once, exactly as the portal snippet: a `y8sdk.ready` listener ({ once: true }) that runs
 *   `y8Sdk = y8.sdk()`, `y8Sdk.init(appConfig, adConfig)` and `y8Sdk.onAuth(…)`, then `window.y8.emitReadyEvent()` in
 *   case the SDK had already loaded. Guest play always works: onAuth only logs, nothing waits for a login.
 * - no ad call before init; with an ad blocker (no SDK) the game plays on without ads and hides rewarded buttons
 * - interstitials, only from a click outside gameplay: `start` on the first Play of the title, `next` on Next / Menu of
 *   the payment screen (a job cannot be failed in Fix It Garage, so there is no Retry). No frequency cap of our own: the SDK paces them, and a break that shows nothing
 *   continues at once.
 * - pause + mute in beforeAd, resume + restore audio (player settings) in afterAd. adBreakDone settles the request;
 *   so do .catch() and a timeout (nothing started within AD_TIMEOUT, or AD_MAX in all), each exactly once.
 * - rewarded (`reward`): beforeReward(showAdFn) calls showAdFn(); the reward only after adViewed; adDismissed or no
 *   beforeReward (no ad) = no reward, the button says "No ad available right now, try later"
 * - Y8 requirement: pause and mute while the page is hidden (visibilitychange) or the window has lost focus (blur),
 *   resume on return
 * - saves use localStorage (no portal storage); no external links
 */

import { AD_TIMEOUT, type AdSlot, type Platform } from './types';

export const Y8_APP_ID = '6af4b1977eafcdc5d5d7a543';
export const Y8_GAME_ID = '292547';
export const Y8_SDK_URL = 'https://cdn.y8.com/minimal-sdk/2-0/y8.min.js';
/** a started ad whose break never ends is given up after this long, so the game cannot stay paused (ms) */
export const AD_MAX = 120_000;

export interface Y8AdBreakInfo {
  breakStatus?: string;
}
export interface Y8ShowAdOptions {
  type: 'start' | 'next' | 'reward';
  name: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  beforeReward?: (showAdFn: () => void) => void;
  adViewed?: () => void;
  adDismissed?: () => void;
  adBreakDone?: (info: Y8AdBreakInfo) => void;
}
export interface Y8Sdk {
  init(appConfig: { appId: string; autoLogin: boolean }, adConfig: { gameId: string; preloadAdBreaks: string; sound: string; onReady: () => void }): unknown;
  onAuth(cb: (user: unknown, error: unknown) => void): unknown;
  showAd(opts: Y8ShowAdOptions): Promise<unknown> | unknown;
}

declare global {
  interface Window {
    y8?: { sdk(): Y8Sdk; emitReadyEvent?: () => void };
  }
}

type PauseReason = 'ad' | 'hidden' | 'blur';

export class Y8Platform implements Platform {
  readonly name = 'y8';
  readonly autoResume = true;
  /** the SDK instance, set only once `init()` has been called on it */
  private y8Sdk: Y8Sdk | null = null;
  private adsReady = false;
  private playing = false;
  private startShown = false;
  private busy = false;
  private pausedBy = new Set<PauseReason>();
  muted = false;
  onMute: (m: boolean) => void = () => {};
  onAdPause: (paused: boolean) => void = () => {};

  constructor(
    private readonly appId = Y8_APP_ID,
    private readonly gameId = Y8_GAME_ID,
  ) {}

  /** the portal snippet; waits for `y8sdk.ready` at most `timeoutMs` (an ad blocker: never), a late SDK still initializes */
  async init(timeoutMs = 3500) {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => this.setPaused('hidden', document.hidden));
      window.addEventListener('blur', () => this.setPaused('blur', true));
      window.addEventListener('focus', () => this.setPaused('blur', false));
    }
    await new Promise<void>((res) => {
      const to = setTimeout(res, timeoutMs);
      window.addEventListener(
        'y8sdk.ready',
        () => {
          try {
            const y8Sdk = window.y8!.sdk();
            const appConfig = { appId: this.appId, autoLogin: true };
            const adConfig = { gameId: this.gameId, preloadAdBreaks: 'on', sound: 'on', onReady: () => (this.adsReady = true) };
            y8Sdk.init(appConfig, adConfig);
            // guest play needs nothing: a signed-in player is just recognised
            y8Sdk.onAuth((_user, error) => {
              if (error) console.warn('Y8 auth:', error);
            });
            this.y8Sdk = y8Sdk;
          } catch (e) {
            console.warn('Y8 SDK init failed, playing without ads', e);
          }
          clearTimeout(to);
          res();
        },
        { once: true },
      );
      // the SDK may have loaded before this listener: ask it to announce itself again
      try {
        if (window.y8 && window.y8.emitReadyEvent) window.y8.emitReadyEvent();
      } catch {
        /* play on */
      }
    });
  }

  /** rewarded buttons are offered once the SDK is initialized (not with an ad blocker) */
  get available() {
    return this.y8Sdk !== null;
  }
  /** the ad system reported ready (adConfig.onReady) */
  get adSystemReady() {
    return this.adsReady;
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

  /** ad, hidden page or lost focus: the game pauses and is silent while any of them holds */
  setPaused(reason: PauseReason, on: boolean) {
    if (on === this.pausedBy.has(reason)) return;
    const was = this.pausedBy.size > 0;
    if (on) this.pausedBy.add(reason);
    else this.pausedBy.delete(reason);
    const p = this.pausedBy.size > 0;
    if (p === was) return;
    this.muted = p;
    this.onMute(p);
    this.onAdPause(p);
  }

  /** one showAd() call, settled exactly once: adBreakDone, .catch(), a throw, not started in AD_TIMEOUT, or AD_MAX */
  private showAd(type: Y8ShowAdOptions['type'], name: string): Promise<boolean> {
    const s = this.y8Sdk;
    if (!s || this.busy) return Promise.resolve(false);
    this.busy = true;
    return new Promise((res) => {
      let done = false;
      let started = false;
      let viewed = false;
      const settle = () => {
        if (done) return;
        done = true;
        clearTimeout(notStarted);
        clearTimeout(cap);
        this.busy = false;
        this.setPaused('ad', false);
        // a reward only after adViewed
        res(type === 'reward' && viewed);
      };
      const notStarted = setTimeout(() => {
        if (!started) settle();
      }, AD_TIMEOUT);
      const cap = setTimeout(settle, AD_MAX);
      const opts: Y8ShowAdOptions = {
        type,
        name,
        beforeAd: () => {
          if (done) return;
          started = true;
          this.setPaused('ad', true);
        },
        afterAd: () => this.setPaused('ad', false),
        adBreakDone: () => settle(),
      };
      if (type === 'reward') {
        opts.beforeReward = (showAdFn) => {
          if (done) return;
          started = true;
          showAdFn();
        };
        opts.adViewed = () => {
          if (!done) viewed = true;
        };
        opts.adDismissed = () => {
          /* closed early: no reward */
        };
      }
      try {
        const r = s.showAd(opts);
        if (r && typeof (r as Promise<unknown>).then === 'function') (r as Promise<unknown>).catch(() => settle());
      } catch {
        settle();
      }
    });
  }

  adSlot(_slot: AdSlot) {
    return true;
  }

  /** `start` on the first Play of the title, `next` on the result-screen buttons; the SDK alone paces them */
  async midgame(slot: AdSlot = 'between'): Promise<void> {
    if (!this.y8Sdk || this.playing) return;
    if (slot === 'preroll') {
      if (this.startShown) return;
      this.startShown = true;
      await this.showAd('start', 'start-game');
    } else await this.showAd('next', slot === 'menu' ? 'payment-menu' : 'next-job');
  }

  /** rewarded: true only after adViewed */
  async rewarded(): Promise<boolean> {
    if (!this.y8Sdk) return false;
    return this.showAd('reward', 'reward');
  }
}

/**
 * CrazyGames SDK v3 wrapper with safe fallbacks (works offline / on other hosts).
 * - gameplayStart/Stop, loadingStart/Stop, happytime
 * - midgame ads (rate-limited to one per ~2 min, only between jobs), rewarded ads
 * - Data Module for saves, mute setting, locale
 */

import { AD_TIMEOUT, MIDGAME_GAP, loadScript, type AdSlot, type Platform } from './types';

interface CGSdk {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  game: {
    gameplayStart(): void;
    gameplayStop(): void;
    loadingStart(): void;
    loadingStop(): void;
    happytime(): void;
    settings?: { muteAudio?: boolean };
    addSettingsChangeListener?(cb: (s: { muteAudio?: boolean }) => void): void;
  };
  ad: {
    requestAd(type: 'midgame' | 'rewarded', cb: { adStarted?: () => void; adFinished?: () => void; adError?: (e: unknown) => void }): void;
  };
  data?: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
  user?: { systemInfo?: { locale?: string; countryCode?: string } };
}

declare global {
  interface Window {
    CrazyGames?: { SDK: CGSdk };
  }
}

export class CrazyGamesPlatform implements Platform {
  readonly name = 'crazygames';
  readonly autoResume = false;
  private s: CGSdk | null = null;
  private playing = false;
  private lastMidgame = Date.now(); // no ad right after loading
  muted = false;
  onMute: (m: boolean) => void = () => {};
  onAdPause: (paused: boolean) => void = () => {};

  async init(timeoutMs = 3500) {
    try {
      if (!window.CrazyGames) await loadScript('https://sdk.crazygames.com/crazygames-sdk-v3.js', timeoutMs);
      const s = window.CrazyGames?.SDK;
      if (!s) return;
      await Promise.race([s.init(), new Promise((_, rej) => setTimeout(() => rej(new Error('sdk timeout')), timeoutMs))]);
      if (s.environment === 'disabled') return;
      this.s = s;
      this.muted = !!s.game.settings?.muteAudio;
      s.game.addSettingsChangeListener?.((st) => {
        if (st.muteAudio !== undefined) {
          this.muted = st.muteAudio;
          this.onMute(this.muted);
        }
      });
    } catch {
      this.s = null;
    }
  }

  get available() {
    return !!this.s;
  }
  locale(): string | null {
    return this.s?.user?.systemInfo?.locale ?? null;
  }
  data() {
    return this.s?.data ?? null;
  }
  loadingStart() {
    this.s?.game.loadingStart();
  }
  loadingStop() {
    this.s?.game.loadingStop();
  }
  gameplayStart() {
    if (this.playing) return;
    this.playing = true;
    this.s?.game.gameplayStart();
  }
  gameplayStop() {
    if (!this.playing) return;
    this.playing = false;
    this.s?.game.gameplayStop();
  }
  happytime() {
    this.s?.game.happytime();
  }

  /**
   * Request an ad and settle exactly once: on adFinished / adError, when requestAd throws, or when the ad has not
   * started within AD_TIMEOUT (no fill, blocked, SDK stuck) — so the game never hangs waiting for an ad.
   */
  private requestAd(type: 'midgame' | 'rewarded'): Promise<boolean> {
    const s = this.s!;
    return new Promise((res) => {
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.onAdPause(false);
        res(ok);
      };
      const timer = setTimeout(() => finish(false), AD_TIMEOUT);
      try {
        s.ad.requestAd(type, {
          adStarted: () => {
            if (done) return;
            clearTimeout(timer); // the ad is playing: wait for it to finish
            this.onAdPause(true);
          },
          adFinished: () => finish(true),
          adError: () => finish(false),
        });
      } catch {
        finish(false);
      }
    });
  }

  /** CrazyGames: midgame ads only in the between-jobs slot (Next / Retry / skip) */
  adSlot(slot: AdSlot) {
    return slot === 'between';
  }

  /** Midgame ad between jobs, at most once per ~2 minutes. Resolves when done, skipped, failed or timed out. */
  async midgame(slot: AdSlot = 'between'): Promise<void> {
    if (!this.adSlot(slot) || !this.s || Date.now() - this.lastMidgame < MIDGAME_GAP) return;
    this.lastMidgame = Date.now();
    await this.requestAd('midgame');
  }

  /** Rewarded ad; resolves true only if the ad completed (false on error / timeout). Always optional for the player. */
  async rewarded(): Promise<boolean> {
    if (!this.s) {
      // no SDK (local dev / tests): grant the reward so the flow can be tested
      return true;
    }
    const ok = await this.requestAd('rewarded');
    // a finished rewarded ad also counts as the midgame break
    if (ok) this.lastMidgame = Date.now();
    return ok;
  }
}

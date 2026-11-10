/**
 * The platform layer: everything the game needs from a web-game portal (gameplay events, ads, saves, mute).
 * One implementation per portal, chosen at build time (`__PLATFORM__`, see vite.config.ts).
 */

export type PlatformName = 'crazygames' | 'gd' | 'web' | 'gamepix' | 'playgama';

declare global {
  /** the build target, a string literal at build time (vite.config.ts `define`), so other platforms' branches are dropped */
  const __PLATFORM__: PlatformName;
}

/**
 * Where an interstitial may be shown. All of them are outside gameplay and follow a user input:
 * - `between`: Next / Retry on the result screens 
 * - `menu`: Menu on the result screens
 * - `preroll`: Play on the title screen
 */
export type AdSlot = 'between' | 'menu' | 'preroll';

export interface KeyValueStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export interface Platform {
  readonly name: PlatformName;
  /** load / init the portal SDK; never throws, never blocks longer than about `timeoutMs` */
  init(timeoutMs?: number): Promise<void>;
  readonly available: boolean;
  /** the portal asks for silence (portal mute setting, or an ad is playing) */
  muted: boolean;
  onMute: (m: boolean) => void;
  /** an ad started (true) / ended (false): pause the game and its audio */
  onAdPause: (paused: boolean) => void;
  /** after an ad that paused a running job, the game resumes by itself (otherwise the pause menu stays) */
  readonly autoResume: boolean;
  locale(): string | null;
  /** portal cloud save, or null for localStorage */
  data(): KeyValueStore | null;
  loadingStart(): void;
  loadingStop(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  happytime(): void;
  /** does this platform use the interstitial slot at all (false: the caller continues synchronously) */
  adSlot(slot: AdSlot): boolean;
  /** interstitial, rate-limited. Resolves when done, skipped, failed or timed out. */
  midgame(slot?: AdSlot): Promise<void>;
  /** rewarded ad; resolves true only if the reward was earned */
  rewarded(): Promise<boolean>;
  /** GamePix only: report the end of loading and wait until the portal lets the game show its menu (never blocks) */
  ready?(): Promise<void>;
  /** GamePix only: a sad moment (job failed) */
  sadMoment?(name: string): void;
  /** Playgama only: the loading screen is gone and the player can play (Bridge `game_ready`) */
  gameReady?(): void;
  /** Playgama only: a job ended (Bridge `level_completed` / `level_failed`) */
  levelEnd?(won: boolean): void;
}

/** at most one interstitial per ~2 minutes */
export const MIDGAME_GAP = 120_000;
/** an ad that has not started after this long is treated as unavailable (ms) */
export const AD_TIMEOUT = 8000;

export function loadScript(src: string, timeoutMs: number, id?: string) {
  return new Promise<void>((res, rej) => {
    const el = document.createElement('script');
    if (id) el.id = id;
    el.src = src;
    el.async = true;
    const to = setTimeout(() => rej(new Error('timeout')), timeoutMs);
    el.onload = () => {
      clearTimeout(to);
      res();
    };
    el.onerror = () => {
      clearTimeout(to);
      rej(new Error('load failed'));
    };
    document.head.appendChild(el);
  });
}

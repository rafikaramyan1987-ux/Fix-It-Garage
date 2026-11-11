import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Y8Platform, Y8_APP_ID, Y8_GAME_ID, AD_MAX, type Y8ShowAdOptions } from '../../src/app/platform/y8';
import { AD_TIMEOUT } from '../../src/app/platform/types';

type Handler = (e?: unknown) => void;
/** minimal window / document with event listeners, a `y8` global and a recordable showAd */
function env(behave: (o: Y8ShowAdOptions) => Promise<unknown> | unknown = () => new Promise(() => {}), opts: { sdk?: boolean; loadedEarly?: boolean } = {}) {
  const on: Record<string, { fn: Handler; once?: boolean }[]> = {};
  const target = () => ({
    addEventListener: (t: string, fn: Handler, o?: { once?: boolean }) => (on[t] ??= []).push({ fn, once: o?.once }),
  });
  const fire = (t: string) => {
    const hs = on[t] ?? [];
    on[t] = hs.filter((h) => !h.once);
    hs.forEach((h) => h.fn());
  };
  const calls: string[] = [];
  const showAd = vi.fn((o: Y8ShowAdOptions) => {
    calls.push(`showAd:${o.type}`);
    return behave(o);
  });
  const sdk = {
    init: vi.fn((_app: unknown, ad: { onReady: () => void }) => {
      calls.push('init');
      ad.onReady();
    }),
    onAuth: vi.fn(),
    showAd,
  };
  const win = {
    ...target(),
    y8:
      opts.sdk === false
        ? undefined
        : {
            sdk: () => sdk,
            // the real SDK re-dispatches y8sdk.ready when asked (only once it has loaded)
            emitReadyEvent: () => opts.loadedEarly && fire('y8sdk.ready'),
          },
  };
  const doc = { ...target(), hidden: false };
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  const y8 = new Y8Platform();
  const log: string[] = [];
  y8.onAdPause = (p) => log.push(p ? 'pause' : 'resume');
  y8.onMute = (m) => log.push(m ? 'mute' : 'unmute');
  return { y8, sdk, showAd, calls, log, fire, doc };
}

async function ready(e: ReturnType<typeof env>) {
  const p = e.y8.init(1000);
  e.fire('y8sdk.ready');
  await p;
}

describe('Y8 SDK', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('init: the portal snippet (appId, autoLogin, gameId, preloadAdBreaks, sound, onReady, onAuth); no ad call before init', async () => {
    const e = env();
    await e.y8.midgame('preroll');
    expect(await e.y8.rewarded()).toBe(false);
    expect(e.showAd).not.toHaveBeenCalled();
    expect(e.y8.available).toBe(false);
    await ready(e);
    expect(e.sdk.init).toHaveBeenCalledWith(
      { appId: Y8_APP_ID, autoLogin: true },
      expect.objectContaining({ gameId: Y8_GAME_ID, preloadAdBreaks: 'on', sound: 'on', onReady: expect.any(Function) }),
    );
    expect(e.sdk.onAuth).toHaveBeenCalledTimes(1);
    expect(e.y8.available).toBe(true);
    // y8sdk.ready is handled once
    e.fire('y8sdk.ready');
    expect(e.sdk.init).toHaveBeenCalledTimes(1);
  });

  it('init: an SDK that loaded first is picked up through emitReadyEvent()', async () => {
    const e = env(undefined, { loadedEarly: true });
    await e.y8.init(1000);
    expect(e.calls).toEqual(['init']);
  });

  it('init: no SDK (ad blocker) → resolves after the timeout, no ads, no rewarded buttons, never throws', async () => {
    const e = env(undefined, { sdk: false });
    const p = e.y8.init(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await p;
    expect(e.y8.available).toBe(false);
    await e.y8.midgame('preroll');
    expect(await e.y8.rewarded()).toBe(false);
  });

  it('interstitial: pause + mute in beforeAd, resume + unmute in afterAd, settles on adBreakDone', async () => {
    let o!: Y8ShowAdOptions;
    const e = env((x) => {
      o = x;
      return new Promise(() => {});
    });
    await ready(e);
    let done = false;
    e.y8.midgame('preroll').then(() => (done = true));
    expect(e.showAd).toHaveBeenCalledWith(expect.objectContaining({ type: 'start' }));
    expect(e.log).toEqual([]); // no pause before the SDK says an ad starts
    o.beforeAd!();
    expect(e.log).toEqual(['mute', 'pause']);
    expect(e.y8.muted).toBe(true);
    await vi.advanceTimersByTimeAsync(AD_TIMEOUT * 3); // a started ad may run long
    expect(done).toBe(false);
    o.afterAd!();
    expect(e.log).toEqual(['mute', 'pause', 'unmute', 'resume']);
    o.adBreakDone!({ breakStatus: 'viewed' });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
  });

  it('start only on the first Play; next on the result buttons, every time (no cap of our own); never in a level', async () => {
    const e = env((o) => o.adBreakDone?.({ breakStatus: 'frequencyCapped' }));
    await ready(e);
    await e.y8.midgame('preroll');
    await e.y8.midgame('preroll');
    await e.y8.midgame('between');
    await e.y8.midgame('menu');
    await e.y8.midgame('between');
    e.y8.gameplayStart();
    await e.y8.midgame('between');
    expect(e.calls).toEqual(['init', 'showAd:start', 'showAd:next', 'showAd:next', 'showAd:next']);
    expect(e.log).toEqual([]); // a skipped break never paused anything
  });

  it('settles exactly once: adBreakDone twice, .catch(), a throw, nothing started in AD_TIMEOUT, AD_MAX', async () => {
    for (const how of ['double', 'reject', 'throw', 'timeout', 'hung']) {
      let o!: Y8ShowAdOptions;
      const e = env((x) => {
        o = x;
        if (how === 'throw') throw new Error('boom');
        if (how === 'reject') return Promise.reject(new Error('no ad'));
        if (how === 'double') {
          x.adBreakDone!({ breakStatus: 'noAdPreloaded' });
          x.adBreakDone!({ breakStatus: 'other' });
        }
        if (how === 'hung') x.beforeAd!();
        return new Promise(() => {});
      });
      await ready(e);
      const settled: number[] = [];
      e.y8.midgame('between').then(() => settled.push(1));
      await vi.advanceTimersByTimeAsync(how === 'timeout' ? AD_TIMEOUT : how === 'hung' ? AD_MAX : 0);
      expect(settled, how).toEqual([1]);
      // late callbacks change nothing; the game is not paused
      o.adBreakDone?.({});
      o.beforeAd?.();
      await vi.advanceTimersByTimeAsync(AD_MAX);
      expect(settled, how).toEqual([1]);
      expect(e.y8.muted, how).toBe(false);
      vi.unstubAllGlobals();
    }
  });

  it('rewarded: showAdFn() called in beforeReward; reward only after adViewed', async () => {
    const e = env((o) => {
      o.beforeReward!(() => {
        o.beforeAd!();
        o.adViewed!();
        o.afterAd!();
        o.adBreakDone!({ breakStatus: 'viewed' });
      });
    });
    await ready(e);
    expect(await e.y8.rewarded()).toBe(true);
    expect(e.showAd).toHaveBeenCalledWith(expect.objectContaining({ type: 'reward' }));
    expect(e.log).toEqual(['mute', 'pause', 'unmute', 'resume']);
  });

  it('rewarded: adDismissed, no beforeReward (no ad), .catch() or a timeout → no reward', async () => {
    for (const how of ['dismissed', 'noAd', 'reject', 'timeout']) {
      const e = env((o) => {
        if (how === 'reject') return Promise.reject(new Error('x'));
        if (how === 'timeout') return new Promise(() => {});
        if (how === 'noAd') return o.adBreakDone!({ breakStatus: 'noAdPreloaded' });
        o.beforeReward!(() => {
          o.beforeAd!();
          o.adDismissed!();
          o.afterAd!();
          o.adBreakDone!({ breakStatus: 'dismissed' });
        });
      });
      await ready(e);
      const r = e.y8.rewarded();
      await vi.advanceTimersByTimeAsync(AD_TIMEOUT);
      expect(await r, how).toBe(false);
      expect(e.y8.muted, how).toBe(false);
      vi.unstubAllGlobals();
    }
  });

  it('a hidden page or a lost focus pauses + mutes; back → resumes; an ad during it keeps it paused', async () => {
    let o!: Y8ShowAdOptions;
    const e = env((x) => {
      o = x;
      return new Promise(() => {});
    });
    await ready(e);
    e.doc.hidden = true;
    e.fire('visibilitychange');
    expect(e.log).toEqual(['mute', 'pause']);
    e.doc.hidden = false;
    e.fire('visibilitychange');
    expect(e.log).toEqual(['mute', 'pause', 'unmute', 'resume']);
    e.log.length = 0;
    e.fire('blur');
    expect(e.log).toEqual(['mute', 'pause']);
    e.y8.midgame('between');
    o.beforeAd!();
    e.fire('focus');
    expect(e.y8.muted).toBe(true); // the ad still runs
    o.afterAd!();
    o.adBreakDone!({});
    expect(e.log).toEqual(['mute', 'pause', 'unmute', 'resume']);
  });
});

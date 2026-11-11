import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameMonetizePlatform, GM_GAME_ID, GM_SDK_URL, GM_SCRIPT_ID, AD_MAX } from '../../src/app/platform/gamemonetize';
import { AD_TIMEOUT, MIDGAME_GAP } from '../../src/app/platform/types';

/** a GameMonetize `sdk` stand-in: `behave` decides what showBanner() does with the SDK's event callback */
type Emit = (name: string) => void;
function setup(behave: (emit: Emit) => void = () => {}) {
  const gm = new GameMonetizePlatform();
  const emit: Emit = (name) => gm.onEvent({ name });
  const showBanner = vi.fn(() => behave(emit));
  vi.stubGlobal('window', { sdk: { showBanner } });
  const log: string[] = [];
  gm.onAdPause = (p) => log.push(p ? 'pause' : 'resume');
  gm.onMute = (m) => log.push(m ? 'mute' : 'unmute');
  emit('SDK_READY');
  return { gm, emit, showBanner, log };
}

describe('GameMonetize ads', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('SDK_GAME_PAUSE pauses + mutes; SDK_GAME_START resumes, unmutes and settles the interstitial', async () => {
    let emit: Emit = () => {};
    const { gm, showBanner, log } = setup((e) => (emit = e));
    let done = false;
    gm.midgame('preroll').then(() => (done = true));
    expect(showBanner).toHaveBeenCalledTimes(1);
    emit('SDK_GAME_PAUSE');
    expect(log).toEqual(['mute', 'pause']);
    expect(gm.muted).toBe(true);
    // a started ad may run longer than the 8 s "not started" timeout
    await vi.advanceTimersByTimeAsync(AD_TIMEOUT * 3);
    expect(done).toBe(false);
    emit('SDK_GAME_START');
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    expect(log).toEqual(['mute', 'pause', 'unmute', 'resume']);
    expect(gm.muted).toBe(false);
  });

  it('pause / resume also follow ads the SDK shows by itself', () => {
    const { gm, emit, log } = setup();
    emit('SDK_GAME_PAUSE');
    emit('SDK_GAME_PAUSE');
    expect(gm.muted).toBe(true);
    emit('SDK_GAME_START');
    expect(log).toEqual(['mute', 'pause', 'unmute', 'resume']);
  });

  it('nothing started within AD_TIMEOUT settles exactly once; later events cannot settle it again', async () => {
    let emit: Emit = () => {};
    const { gm, log } = setup((e) => (emit = e));
    const settled: number[] = [];
    gm.midgame('preroll').then(() => settled.push(1));
    await vi.advanceTimersByTimeAsync(AD_TIMEOUT - 1);
    expect(settled).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toEqual([1]);
    // a late ad still pauses / resumes the game but the request is long settled
    emit('SDK_GAME_PAUSE');
    emit('SDK_GAME_START');
    emit('SDK_GAME_START');
    await vi.advanceTimersByTimeAsync(AD_MAX * 2);
    expect(settled).toEqual([1]);
    expect(log).toEqual(['mute', 'pause', 'unmute', 'resume']);
  });

  it('a throwing showBanner() and a started ad that never ends both settle (the game never gets stuck)', async () => {
    const t = setup(() => {
      throw new Error('boom');
    });
    let a = false;
    t.gm.midgame('preroll').then(() => (a = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(a).toBe(true);

    const h = setup((e) => e('SDK_GAME_PAUSE'));
    let b = false;
    h.gm.midgame('preroll').then(() => (b = true));
    await vi.advanceTimersByTimeAsync(AD_MAX - 1);
    expect(b).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(b).toBe(true);
    expect(h.gm.muted).toBe(false);
    expect(h.log).toEqual(['mute', 'pause', 'unmute', 'resume']);
  });

  it('interstitials: pre-roll once, then at most one per MIDGAME_GAP, never during gameplay, none before SDK_READY', async () => {
    const { gm, showBanner } = setup((e) => {
      e('SDK_GAME_PAUSE');
      e('SDK_GAME_START');
    });
    await gm.midgame('preroll');
    expect(showBanner).toHaveBeenCalledTimes(1);
    await gm.midgame('between');
    await gm.midgame('menu');
    expect(showBanner).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(MIDGAME_GAP);
    gm.gameplayStart();
    await gm.midgame('between');
    expect(showBanner).toHaveBeenCalledTimes(1);
    gm.gameplayStop();
    await gm.midgame('between');
    expect(showBanner).toHaveBeenCalledTimes(2);

    const fresh = new GameMonetizePlatform();
    await fresh.midgame('preroll');
    expect(showBanner).toHaveBeenCalledTimes(2);
  });

  it('rewarded: no API in the SDK, so it is hidden (available=false) and never grants or shows anything', async () => {
    const { gm, showBanner } = setup();
    expect(gm.available).toBe(false);
    expect(await gm.rewarded()).toBe(false);
    expect(showBanner).not.toHaveBeenCalled();
    expect(gm.data()).toBeNull();
  });

  it('init: SDK_OPTIONS set before sdk.js is inserted once, before the first script (the README loader)', async () => {
    const order: string[] = [];
    const inserted: { id: string; src: string; onerror?: () => void }[] = [];
    const first = { parentNode: { insertBefore: (el: (typeof inserted)[number]) => (order.push(`insert:${win.SDK_OPTIONS?.gameId}`), inserted.push(el)) } };
    const win: { SDK_OPTIONS?: { gameId: string } } = {};
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', {
      getElementById: (id: string) => inserted.find((e) => e.id === id) ?? null,
      getElementsByTagName: () => [first],
      createElement: () => ({}),
      head: { appendChild: () => {} },
    });
    const gm = new GameMonetizePlatform();
    const p = gm.init(1000);
    expect(order).toEqual([`insert:${GM_GAME_ID}`]);
    expect(inserted.map((e) => [e.id, e.src])).toEqual([[GM_SCRIPT_ID, GM_SDK_URL]]);
    inserted[0].onerror?.(); // blocked: the game plays on
    await p;
    await gm.init(1000);
    expect(inserted).toHaveLength(1);
  });
});

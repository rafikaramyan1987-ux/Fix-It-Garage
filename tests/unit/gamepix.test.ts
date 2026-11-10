import { afterEach, describe, expect, it, vi } from 'vitest';
import { GamePixPlatform, type GamePixSdk } from '../../src/app/platform/gamepix';

type Ev = 'pause' | 'resume' | 'soundOff' | 'soundOn';

/** a fake GamePix SDK v3: records the event handlers, lang() reports `lang` */
function fakeSdk(lang: string | null = 'de') {
  const handlers: Partial<Record<Ev, () => void>> = {};
  const sdk: GamePixSdk = {
    lifecycle: { loading: vi.fn(), loaded: vi.fn(() => Promise.resolve()), gameStart: vi.fn() },
    events: { on: (name, fn) => (handlers[name] = fn) },
    ads: { interstitial: vi.fn(), reward: vi.fn() },
    lang: vi.fn(() => lang as string),
  };
  return { sdk, handlers };
}

async function setup(lang: string | null = 'de') {
  const { sdk, handlers } = fakeSdk(lang);
  (globalThis as { window?: unknown }).window = { GamePix: sdk };
  const p = new GamePixPlatform();
  const mutes: boolean[] = [];
  const pauses: boolean[] = [];
  p.onMute = (m) => mutes.push(m);
  p.onAdPause = (v) => pauses.push(v);
  await p.init();
  /** fire a portal signal through the event (`ev`) or the legacy property (`prop`) */
  const fire = (name: Ev, via: 'ev' | 'prop') => (via === 'ev' ? handlers[name]!() : sdk[name]!());
  return { p, sdk, handlers, mutes, pauses, fire };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

const ORDERS: ['ev' | 'prop', 'ev' | 'prop'][] = [
  ['ev', 'prop'],
  ['prop', 'ev'],
  ['ev', 'ev'],
  ['prop', 'prop'],
];

describe('GamePix legacy handlers', () => {
  it('assigns GamePix.soundOff / soundOn / pause / resume during init, before loaded()', async () => {
    const { sdk } = await setup();
    expect(typeof sdk.soundOff).toBe('function');
    expect(typeof sdk.soundOn).toBe('function');
    expect(typeof sdk.pause).toBe('function');
    expect(typeof sdk.resume).toBe('function');
    expect(sdk.lifecycle.loaded).not.toHaveBeenCalled();
  });

  it('the legacy properties point to the same handlers as the events', async () => {
    const { sdk, handlers } = await setup();
    expect(sdk.soundOff).toBe(handlers.soundOff);
    expect(sdk.soundOn).toBe(handlers.soundOn);
    expect(sdk.pause).toBe(handlers.pause);
    expect(sdk.resume).toBe(handlers.resume);
  });

  for (const [a, b] of ORDERS) {
    it(`soundOff (${a} then ${b}) mutes once, soundOn (${b} then ${a}) unmutes once`, async () => {
      const { p, mutes, fire } = await setup();
      fire('soundOff', a);
      fire('soundOff', b);
      expect(p.muted).toBe(true);
      expect(mutes).toEqual([true]);
      fire('soundOn', b);
      fire('soundOn', a);
      expect(p.muted).toBe(false);
      expect(mutes).toEqual([true, false]);
    });

    it(`pause (${a} then ${b}) pauses once, resume (${b} then ${a}) resumes once`, async () => {
      const { p, mutes, pauses, fire } = await setup();
      fire('pause', a);
      fire('pause', b);
      expect(p.muted).toBe(true);
      expect(mutes).toEqual([true]);
      expect(pauses).toEqual([true]);
      fire('resume', b);
      fire('resume', a);
      expect(p.muted).toBe(false);
      expect(mutes).toEqual([true, false]);
      expect(pauses).toEqual([true, false]);
    });
  }

  it('portal sound on does not unmute while the game is paused, in any order', async () => {
    for (const [a, b] of ORDERS) {
      const { p, mutes, fire } = await setup();
      fire('pause', a);
      fire('soundOff', b);
      fire('soundOff', a);
      fire('soundOn', a);
      fire('soundOn', b);
      expect(p.muted).toBe(true); // still paused
      fire('resume', b);
      fire('resume', a);
      expect(p.muted).toBe(false);
      expect(mutes).toEqual([true, false]);
    }
  });

  it('resume does not unmute while the portal sound is off, in any order', async () => {
    for (const [a, b] of ORDERS) {
      const { p, mutes, pauses, fire } = await setup();
      fire('soundOff', a);
      fire('pause', b);
      fire('pause', a);
      fire('resume', a);
      fire('resume', b);
      expect(p.muted).toBe(true); // portal sound still off
      expect(pauses).toEqual([true, false]);
      fire('soundOn', b);
      fire('soundOn', a);
      expect(p.muted).toBe(false);
      expect(mutes).toEqual([true, false]);
    }
  });

  it('interleaved event / legacy signals end in the right state', async () => {
    const { p, mutes, pauses, fire } = await setup();
    fire('pause', 'prop');
    fire('soundOff', 'ev');
    fire('pause', 'ev');
    fire('resume', 'prop');
    fire('soundOff', 'prop');
    fire('resume', 'ev');
    expect(p.muted).toBe(true);
    fire('soundOn', 'prop');
    expect(p.muted).toBe(false);
    fire('pause', 'ev');
    fire('soundOn', 'ev');
    expect(p.muted).toBe(true); // paused
    fire('resume', 'ev');
    fire('resume', 'prop');
    expect(p.muted).toBe(false);
    expect(mutes).toEqual([true, false, true, false]);
    expect(pauses).toEqual([true, false, true, false]);
  });
});

describe('GamePix language', () => {
  it('calls GamePix.lang() once during init, before loaded(), and uses it as the locale', async () => {
    const { p, sdk } = await setup('fr');
    expect(sdk.lang).toHaveBeenCalledTimes(1);
    expect(sdk.lifecycle.loaded).not.toHaveBeenCalled();
    expect(p.locale()).toBe('fr');
    expect(p.locale()).toBe('fr');
    await p.ready();
    expect(sdk.lang).toHaveBeenCalledTimes(1);
  });

  it('no language when lang() throws or reports nothing', async () => {
    const { p } = await setup(null);
    expect(p.locale()).toBeNull();
    const { sdk } = fakeSdk();
    sdk.lang = () => {
      throw new Error('no lang');
    };
    (globalThis as { window?: unknown }).window = { GamePix: sdk };
    const q = new GamePixPlatform();
    await q.init();
    expect(q.locale()).toBeNull();
  });
});

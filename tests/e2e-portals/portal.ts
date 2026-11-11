import type { Page } from '@playwright/test';
import { Driver } from '../../scripts/driver';
import { FAULT_PART, jobFaults, KEY, richSave } from '../e2e/helpers';

declare global {
  interface Window {
    /** target gain of the two audio buses (sound effects, music) the game creates first, recorded by the test */
    __bus?: { target: number | null }[];
  }
}

/**
 * open a portal build in capture mode (frame-stepped clock) with the portal SDK at `sdkUrl` answered by `stub`
 * (or failing to load: `null`); collects page errors, console errors and every request
 */
export async function openPortal(page: Page, sdkUrl: string, stub: string | null, save: object = richSave()) {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // a blocked SDK shows up as a failed resource load: that is the case under test, not a game error
    if (m.type() === 'error' && !(stub === null && /Failed to load resource/.test(m.text()))) errors.push(m.text());
  });
  page.on('request', (r) => requests.push(r.url()));
  await page.addInitScript(([k, v]) => localStorage.getItem(k) ?? localStorage.setItem(k, v), [KEY, JSON.stringify(save)] as [string, string]);
  // record the gains of the effects and music buses (the first two GainNodes the game creates)
  await page.addInitScript(() => {
    const create = AudioContext.prototype.createGain;
    window.__bus = [];
    AudioContext.prototype.createGain = function (this: AudioContext) {
      const g = create.call(this);
      if (window.__bus!.length < 2) {
        const rec = { target: null as number | null };
        window.__bus!.push(rec);
        const set = g.gain.setTargetAtTime.bind(g.gain);
        g.gain.setTargetAtTime = (v: number, t: number, c: number) => ((rec.target = v), set(v, t, c));
      }
      return g;
    };
  });
  await page.route(sdkUrl, (r) => (stub === null ? r.abort() : r.fulfill({ contentType: 'application/javascript', body: stub })));
  const d = new Driver(page);
  d.fps = 10;
  await page.goto('/?capture&lang=en');
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });
  return { d, errors, requests };
}

/** the audio buses are silent (portal / ad mute) */
export const silent = (page: Page) => page.evaluate(() => window.__bus!.length === 2 && window.__bus!.every((b) => b.target === 0));
/** the audio buses play at the player's settings (music + effects on) */
export const audible = (page: Page) => page.evaluate(() => window.__bus!.length === 2 && window.__bus!.every((b) => !!b.target && b.target > 0));

/** play the current job to the payment screen: order and fit every faulty part, then the test drive */
export async function playJob(page: Page, d: Driver) {
  await d.until(() => !!document.querySelector('.toolbar'), 40);
  for (const f of await jobFaults(page)) {
    await d.order(FAULT_PART[f]);
    await d.repair({ beat: 0.05 });
    await d.until(() => !!document.querySelector('.toolbar'), 40);
  }
  if (!(await d.test())) throw new Error('the test drive failed');
  await d.until(() => !!document.querySelector('[data-action=next]'), 20);
}

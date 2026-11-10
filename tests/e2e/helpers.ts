import type { Page } from '@playwright/test';
import { Driver } from '../../scripts/driver';

export const KEY = 'fixitgarage.save.v1';

/** open the game with an optional prepared save */
export async function open(page: Page, query = '', save?: object) {
  if (save) await page.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, [KEY, JSON.stringify(save)] as [string, string]);
  const d = new Driver(page);
  d.fps = 10;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await d.open('/', query);
  return { d, errors };
}

export const saved = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), KEY);

/** UI text that overflows its box, or anything sticking out of the viewport sideways */
export function overflow(page: Page) {
  return page.evaluate(() => {
    const bad: string[] = [];
    const vw = window.innerWidth;
    for (const e of document.querySelectorAll<HTMLElement>('#ui *')) {
      if (e.closest('.hidden, .coin, .toast')) continue;
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const txt = (e.textContent ?? '').trim().slice(0, 40);
      if (r.right > vw + 1 || r.left < -1) bad.push(`outside viewport: <${e.className}> "${txt}"`);
      if (e.matches('.fit, button, .btn, .lang, .tab, .nm, h2, .un') && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX !== 'auto') bad.push(`text overflows: <${e.className}> "${txt}" ${e.scrollWidth}>${e.clientWidth}`);
    }
    return [...new Set(bad)];
  });
}

export const FAULT_PART: Record<string, string> = { 'dead-battery': 'battery', alternator: 'alternator', starter: 'starter', 'spark-plugs': 'plugs', 'fuel-pump': 'fuelpump', 'air-filter': 'airfilter', 'brake-pads': 'pads', 'brake-disc': 'disc', 'flat-tyre': 'tyre', 'tie-rod': 'tierod', 'exhaust-leak': 'muffler', 'oil-leak': 'gasket', 'coolant-leak': 'hose', thermostat: 'thermostat', catalyst: 'catalyst', shock: 'shock', 'low-oil': 'oil', 'ev-charger': 'chargeport', scratch: 'paint' };

export const jobFaults = (page: Page) => page.evaluate(() => (window.__game!.play as unknown as { job: { def: { faults: string[] } } }).job.def.faults);

export function richSave(extra: object = {}) {
  return { money: 5000, career: 1, stars: {}, upgrades: [], book: [], ach: [], stats: { jobs: 0, perfect: 0, streak: 0, noWaste: 0, tricky: 0, cars: [], earned: 0, daily: 0 }, daily: { day: '', done: false }, settings: { music: true, sfx: true, lang: null }, tutorialDone: true, ...extra };
}

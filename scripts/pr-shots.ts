/**
 * Phase B screenshots for the PR: main menu, settings with the language list, the same job ticket in English, French
 * and German, and the payment screen of the GamePix build with "Double payment".
 * usage: npx tsx scripts/pr-shots.ts [webUrl] [gamepixUrl] [outDir]
 */
import { mkdirSync } from 'node:fs';
import type { Browser } from 'playwright';
import { chromium, GL_ARGS } from './pw.mjs';
import { Driver } from './driver';

const [web = 'http://127.0.0.1:4173/', gpx = 'http://127.0.0.1:4174/', out = 'docs/phase-b'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const KEY = 'fixitgarage.save.v1';
const save = (extra: object = {}) => ({
  money: 1840, career: 15, stars: {}, upgrades: ['gauge', 'plants', 'neon', 'lounge', 'lift2'], book: ['dead-battery', 'brake-pads', 'flat-tyre', 'low-oil', 'alternator', 'spark-plugs'],
  ach: ['first_fix', 'jobs_10', 'first_upgrade'], stats: { jobs: 14, perfect: 9, streak: 3, noWaste: 6, tricky: 2, cars: ['sedan', 'hatchback', 'van', 'pickup', 'sports'], earned: 2600, daily: 1 },
  daily: { day: '', done: false }, settings: { music: true, sfx: true, lang: null }, tutorialDone: true, ...extra,
});

async function session(b: Browser, base: string, w: number, h: number, scale: number, query: string, s: object) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, hasTouch: w < h, isMobile: w < h });
  await ctx.route('**/gamepix.sdk.js', (r) => r.abort());
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(s)] as [string, string]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  const d = new Driver(page);
  d.fps = 15;
  await d.open(base, query);
  return { d, ctx };
}
const shot = async (d: Driver, name: string) => {
  await d.screenshot(`${out}/${name}.png`);
  console.log('wrote', `${out}/${name}.png`);
};

const browser = await chromium.launch({ args: GL_ARGS });
{
  const { d, ctx } = await session(browser, web, 1920, 1080, 1, '&lang=en', save());
  await d.tick(0.6);
  await shot(d, '1-main-menu');
  await d.click('[data-action=settings]');
  await d.tick(0.5);
  await shot(d, '2-settings-languages');
  await ctx.close();
}
for (const [i, lang] of [['3', 'en'], ['4', 'fr'], ['5', 'de']] as const) {
  const { d, ctx } = await session(browser, web, 390, 844, 2, `&lang=${lang}`, save({ settings: { music: true, sfx: true, lang } }));
  await d.tick(0.4);
  await d.click('[data-action=play]');
  await d.until(() => !!document.querySelector('.toolbar'), 40);
  await d.useTool('drive', 0.2);
  await d.useTool('lift', 0.2);
  await d.tick(0.8);
  await shot(d, `${i}-ticket-${lang}`);
  await ctx.close();
}
{
  const { d, ctx } = await session(browser, gpx, 1920, 1080, 1, '&lang=en&job=4', save({ career: 4 }));
  await d.until(() => !!document.querySelector('.toolbar'), 40);
  await d.useTool('lift', 0.2);
  await d.order('tyre');
  await d.repair({ beat: 0.05 });
  await d.until(() => !!document.querySelector('.toolbar'), 40);
  await d.test();
  await d.tick(1.6);
  await shot(d, '6-gamepix-payment-double');
  await ctx.close();
}
await browser.close();

/**
 * Phase A preview screenshots from real play: 3 at desktop 1920x1080 and 3 at phone 390x844 (rendered at 2x).
 * usage: npx tsx scripts/preview-shots.ts [baseUrl] [outDir]
 */
import { mkdirSync } from 'node:fs';
import { chromium, GL_ARGS } from './pw.mjs';
import { Driver } from './driver';

const [base = 'http://127.0.0.1:4173/', out = 'docs/preview'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: GL_ARGS });

async function session(w: number, h: number, scale: number) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, hasTouch: w < h, isMobile: w < h });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  const d = new Driver(page);
  d.fps = 20;
  await d.open(base);
  return { d, page, ctx };
}
const shot = async (d: Driver, name: string) => {
  await d.screenshot(`${out}/${name}.png`);
  console.log('wrote', `${out}/${name}.png`);
};

// desktop: garage + ticket with a clue, battery tester reading, ratchet on a terminal
{
  const { d, page, ctx } = await session(1920, 1080, 1);
  await d.startShift();
  await d.until(() => !!document.querySelector('.toolbar'));
  await d.useTool('listen', 0.6);
  await d.tick(1.0);
  await shot(d, 'desktop-1-garage');
  await d.click('[data-tool=tester]');
  for (let i = 0; i < 2; i++) {
    const id = await d.expected();
    await d.tick(0.3);
    await d.tap(id);
  }
  await d.until(() => !!document.querySelector('.readout'), 20);
  await d.tick(0.5);
  await shot(d, 'desktop-2-battery-tester');
  await d.readoutClose(0.2);
  await d.click('[data-tool=repair]');
  await d.click('[data-part=battery]');
  await d.until(() => window.__game!.play.expected === 'hood', 20);
  await d.tick(0.3);
  await d.tap('hood');
  const t = await d.target('neg');
  await d.until(() => window.__game!.play.expected === 'neg', 10);
  await page.mouse.move(t.x, t.y);
  await page.mouse.down();
  await d.tick(0.6);
  await shot(d, 'desktop-3-unscrew-terminal');
  await page.mouse.up();
  await ctx.close();
}

// phone: garage + ticket, new battery going in, payment
{
  const { d, ctx } = await session(390, 844, 2);
  await d.startShift();
  await d.until(() => !!document.querySelector('.toolbar'));
  await d.useTool('tester', 0.4);
  await d.tick(1.0);
  await shot(d, 'phone-1-garage');
  await d.click('[data-tool=repair]');
  await d.click('[data-part=battery]');
  // run the swap until the old battery is out and the new one is the target
  for (;;) {
    const id = await d.expected();
    await d.tick(0.2);
    if (id === 'new') break;
    if (id === 'hood') await d.tap(id);
    else if (id === 'old') await d.lift(id);
    else await d.hold(id);
  }
  await d.tick(0.6);
  await shot(d, 'phone-2-battery-swap');
  await d.batterySwap();
  await d.click('[data-action=center]');
  await d.waitPhase('payment', 30);
  await d.tick(1.6);
  await shot(d, 'phone-3-payment');
  await ctx.close();
}
await browser.close();

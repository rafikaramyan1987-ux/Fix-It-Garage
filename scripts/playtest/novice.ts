/**
 * A non-mechanic in Relaxed mode: it knows nothing about cars and decides every tap from what the screen shows: the
 * difficulty choice, the tutorial glow, the free hint and its glowing button, the coloured clue cards, the suspects
 * list ("Best match"), the gesture hand, the pulsing Test button and the toasts. It never reads job data.
 * Records one video of the given career jobs (each from its own start) at 390x844.
 *
 * usage: npx tsx scripts/playtest/novice.ts <baseUrl> <jobs, e.g. 1,5,15,21> <out.mp4>
 *   job 1 starts from an empty save (first start: difficulty choice + tutorial), the others with `?job=N`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { chromium, GL_ARGS } from '../pw.mjs';

const [base = 'http://127.0.0.1:4173/', jobsArg = '1,5,15,21', out = 'docs/preview/relaxed-mode-390x844.mp4'] = process.argv.slice(2);
const W = 390,
  H = 844,
  FPS = 12;
const frames = join(process.env.FRAMES_DIR ?? tmpdir(), 'novice-frames');
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });
let frame = 0;
const log = (s: string) => console.log(s);

const browser = await chromium.launch({ args: GL_ARGS });

/** a save for a player who reached job n in Relaxed mode (only for jobs > 1) */
function saveAt(n: number) {
  const book = ['dead-battery', 'brake-pads', 'low-oil', 'flat-tyre', 'alternator', 'exhaust-leak', 'spark-plugs', 'brake-disc', 'starter', 'air-filter', 'coolant-leak', 'thermostat', 'shock', 'tie-rod'].slice(0, Math.max(0, n - 1));
  return { money: 150 + n * 40, career: n, stars: {}, upgrades: [], book, ach: [], stats: { jobs: n - 1, perfect: 0, streak: 0, noWaste: 0, tricky: 0, cars: [], earned: 0, daily: 0 }, daily: { day: '', done: false }, settings: { music: true, sfx: true, lang: 'en', difficulty: 'relaxed' }, tutorialDone: true, hintsSeen: [] };
}

async function playJob(n: number) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page: Page = await ctx.newPage();
  page.on('pageerror', (e) => log(`PAGEERROR ${e.message}`));
  if (n > 1) await page.addInitScript(([k, v]) => localStorage.setItem(k, v), ['fixitgarage.save.v1', JSON.stringify(saveAt(n))] as [string, string]);
  await page.goto(`${base}?nosdk&capture&lang=en&pr=0.6${n > 1 ? `&job=${n}` : ''}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });
  await page.addStyleTag({
    content: `.fx-tap{position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(255,255,255,.55);border:3px solid rgba(74,46,26,.55);pointer-events:none;z-index:99;animation:fxTap .5s ease-out forwards}@keyframes fxTap{from{transform:scale(.5);opacity:1}to{transform:scale(1.3);opacity:0}}`,
  });

  const tick = async (sec = 1 / FPS) => {
    for (let i = 0; i < Math.max(1, Math.round(sec * FPS)); i++) {
      await page.evaluate((dt) => window.__game!.tick(dt, true), 1 / FPS);
      await page.screenshot({ path: join(frames, `f${String(frame++).padStart(6, '0')}.jpg`), type: 'jpeg', quality: 88, timeout: 180_000 });
    }
  };
  const tapAt = async (x: number, y: number) => {
    await page.evaluate(([x, y]) => {
      const d = document.createElement('div');
      d.className = 'fx-tap';
      d.style.left = `${x}px`;
      d.style.top = `${y}px`;
      document.body.append(d);
      setTimeout(() => d.remove(), 3000);
    }, [x, y]);
    await page.mouse.click(x, y);
  };
  /** tap a visible element (scrolled into view inside a list) */
  const tap = async (sel: string) => {
    const el = page.locator(sel).first();
    await el.evaluate((e) => e.closest('.parts') && e.scrollIntoView({ block: 'nearest' }));
    const b = await el.boundingBox();
    if (!b) return false;
    await tapAt(b.x + b.width / 2, b.y + b.height / 2);
    return true;
  };
  const has = (sel: string) => page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
  }, sel);
  const text = (sel: string) => page.evaluate((s) => document.querySelector(s)?.textContent ?? '', sel);

  let cluesSinceLook = 0;
  let paidDone = false;
  let lastClues = 0;
  for (let step = 0; step < 4000; step++) {
    if (await has('.paycard')) {
      log(`job ${n}: paid (${(await text('.paycard .tot')).trim()}), stars ${await page.locator('.stars .s.on').count()}`);
      await tick(2.5);
      break;
    }
    if (await has('.diffpick')) {
      await tick(1.2);
      log(`job ${n}: picks Relaxed (recommended)`);
      await tap('.diffpick [data-difficulty=relaxed]');
      await tick(0.4);
      continue;
    }
    if (await has('.skipchip:not(.fast)')) {
      await tapAt(W / 2, H * 0.4);
      await tick(0.2);
      continue;
    }
    if (await has('.readout button')) {
      await tick(1.1); // reading the card
      log(`job ${n}: reads "${(await text('.readout .txt')).trim()}"`);
      await tap('.readout button');
      await tick(0.3);
      cluesSinceLook++;
      continue;
    }
    if (await has('.dialog.hint-offer')) {
      if (await has('[data-action=hint-pay]:not([disabled])')) {
        log(`job ${n}: pays for another hint`);
        await tap('[data-action=hint-pay]');
      } else await tap('.dialog .btn.ghost');
      await tick(0.3);
      continue;
    }
    if (await has('.parts-sheet')) {
      await tick(0.9); // looking at the list
      const glow = (await has('.parts-sheet .part.tut-glow')) ? '.parts-sheet .part.tut-glow' : (await has('.parts-sheet .part.top')) ? '.parts-sheet .part.top' : null;
      if (!glow) {
        log(`job ${n}: no clear best match yet, keeps checking`);
        await tap('.sheet .btn.ghost');
        cluesSinceLook = 0;
        await tick(0.3);
        continue;
      }
      log(`job ${n}: orders the ${(await text(`${glow} .nm`)).trim()} (${(await text(`${glow} .why`)).trim() || 'glowing'})`);
      await tap(glow);
      await tick(0.4);
      await tap('[data-action=order]');
      cluesSinceLook = 0;
      await tick(0.3);
      continue;
    }
    if (await has('[data-action=center]')) {
      await tick(0.4);
      await tap('[data-action=center]');
      await tick(0.3);
      continue;
    }
    // a hands-on step: follow the gesture hand
    const g = await page.evaluate(() => {
      const e = document.querySelector<HTMLElement>('.gesture:not(.hidden)');
      if (!e) return null;
      return { x: parseFloat(e.style.left), y: parseFloat(e.style.top), kind: [...e.classList].find((c) => c.startsWith('g-'))?.slice(2) ?? 'tap' };
    });
    if (g) {
      await tick(0.25);
      if (g.kind === 'tap') await tapAt(g.x, g.y);
      else {
        await page.evaluate(([x, y]) => {
          const d = document.createElement('div');
          d.className = 'fx-tap';
          d.style.left = `${x}px`;
          d.style.top = `${y}px`;
          document.body.append(d);
        }, [g.x, g.y]);
        await page.mouse.move(g.x, g.y);
        await page.mouse.down();
        for (let i = 0; i < 60; i++) {
          if (g.kind === 'lift') await page.mouse.move(g.x, g.y - Math.min(8, i + 1) * 14);
          else if (g.kind === 'rub') await page.mouse.move(g.x + (i % 2 ? -30 : 30), g.y + ((i % 4) - 1.5) * 5, { steps: 3 });
          await tick();
          const st = await page.evaluate(() => {
            const m = document.querySelector('.meter');
            const lvl = m ? parseFloat((m.querySelector('.lvl') as HTMLElement).style.height) : null;
            const lo = m ? parseFloat((m.querySelector('.zone') as HTMLElement).style.bottom) : null;
            return { ring: !!document.querySelector('.ring:not(.hidden)'), lvl, lo, gesture: document.querySelector('.gesture:not(.hidden)')?.className ?? '' };
          });
          if (st.lvl !== null && st.lo !== null) {
            if (st.lvl >= st.lo + 4) break;
          } else if (g.kind === 'hold' && i > 3 && !st.ring) break;
          else if (g.kind === 'lift' && i >= 8) break;
          else if (g.kind === 'rub' && !st.gesture.includes('g-rub')) break;
        }
        await page.mouse.up();
      }
      await tick(0.15);
      continue;
    }
    if (await has('.toolbar')) {
      await tick(0.3);
      const clueCount = await page.locator('.clues li.card').count();
      if (clueCount !== lastClues) {
        lastClues = clueCount;
      }
      // the tutorial or the hint makes a button glow: tap it
      if (await has('.toolbar .tut-glow')) {
        await tap('.toolbar .tut-glow');
        await tick(0.3);
        continue;
      }
      // a part was just fitted: the Test button pulses
      if (await has('.toolbar [data-tool=test].pulse')) {
        await tap('.toolbar [data-tool=test]');
        await tick(0.3);
        continue;
      }
      // the free hint
      if ((await text('.toolbar [data-tool=hint]')).includes('Free')) {
        log(`job ${n}: takes the free hint`);
        await tap('.toolbar [data-tool=hint]');
        await tick(0.6);
        log(`job ${n}: hint says "${(await text('.hintbar')).trim()}"`);
        continue;
      }
      // a red or orange clue card appeared since the last look: open the suspects list
      const problem = await page.locator('.clues li.card.bad').count();
      if (problem > 0 && cluesSinceLook > 0) {
        await tap('.toolbar [data-tool=repair]');
        await tick(0.3);
        continue;
      }
      // otherwise: one more hint (coins) once, else the next tool not used yet
      if (!paidDone && (await has('.toolbar [data-tool=hint]'))) {
        paidDone = true;
        await tap('.toolbar [data-tool=hint]');
        await tick(0.4);
        continue;
      }
      const next = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.toolbar .tool')].find((b) => !b.classList.contains('used') && !b.classList.contains('locked'))?.dataset.tool ?? null);
      if (next) {
        log(`job ${n}: tries the ${next}`);
        await tap(`.toolbar [data-tool=${next}]`);
        await tick(0.3);
        continue;
      }
      // every tool used and still unsure: ask for another hint
      log(`job ${n}: asks for another hint`);
      await tap('.toolbar [data-tool=hint]');
      await tick(0.4);
      continue;
    }
    await tick();
  }
  await ctx.close();
}

for (const n of jobsArg.split(',').map(Number)) await playJob(n);
await browser.close();
const count = readdirSync(frames).length;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(frames, 'f%06d.jpg'), '-vf', `scale=${W}:${H}:flags=lanczos`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-r', String(FPS), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out]);
log(`wrote ${out}: ${count} frames, ${(count / FPS).toFixed(0)} s`);

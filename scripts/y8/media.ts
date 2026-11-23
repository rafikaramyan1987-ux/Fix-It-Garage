/**
 * Y8 media (docs.y8.com/studio/media) into release/y8/media/, from the real game (the ad-free web build,
 * `?nosdk&capture`: frame-stepped clock, real pointer input through scripts/driver.ts):
 *  - standard-{1..6}.png (Standard, 760x570, < 2 MB) and widescreen-{1..6}.png (Widescreen, 1280x720, < 5 MB): six
 *    mid-gameplay moments from six career jobs with six different cars (tools in use, car on the lift, parts being
 *    repaired), each rendered natively at both sizes. Y8 rule: no main menu, title screen, tutorial, loading / splash
 *    screen, level select, popup or caption; so the hint banners, the pointing hand / arrows, the steps bar and the
 *    toasts are hidden, and no frame shows a menu, a readout popup or the payment card.
 *  - promo-landscape.png (1920x1080), promo-portrait.png (1080x1920), promo-gamecard.png (760x570, < 2 MB): the 3D
 *    title scene (`?view=cover`) with the game logo as the only text (the tagline is hidden), rendered natively.
 *  - gameplay-1280x720.mp4 / gameplay-960x720.mp4 (approved by Y8, kept): `--only video` re-records them.
 * usage: npx vite preview --outDir dist-web --port 4173 &  npx tsx scripts/y8/media.ts [baseUrl] [--only shots,promos,video]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { Driver } from '../driver';
import { chromium, GL_ARGS } from '../pw.mjs';

const args = process.argv.slice(2);
const base = args[0] && !args[0].startsWith('--') ? args[0] : 'http://127.0.0.1:4173/';
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : ['shots', 'promos'];
const OUT = 'release/y8/media';
const MB = 1024 * 1024;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: GL_ARGS });

/** a returning player on Relaxed (tutorial done, money and upgrades): jobs open straight away */
const SAVE = { money: 1840, career: 30, stars: {}, upgrades: ['gauge', 'exhaust', 'wrench'], book: [], ach: [], stats: { jobs: 29, perfect: 20, streak: 4, noWaste: 25, tricky: 3, cars: ['sedan', 'hatchback', 'van', 'pickup', 'sports', 'classic'], earned: 6000, daily: 0 }, daily: { day: '', done: false }, settings: { music: true, sfx: true, lang: 'en', difficulty: 'relaxed' }, tutorialDone: true };
/** screenshots: no hint banner, pointing hand / arrow, steps bar, toast or keyboard help (Y8: no tutorials) */
const NO_HINTS = '.hintbar, .prompt, .gesture, .hand, .marker, .steps, .toast, .tut, .skipchip, .kbtn, .kpanel, .fx-tap { display: none !important; } .tut-glow { outline: none !important; }';

/** PNG, optimised losslessly, under the slot's limit */
function png(src: string, out: string, w: number, h: number, limit: number) {
  execFileSync('convert', [src, '-strip', '-define', 'png:compression-level=9', `PNG24:${out}`]);
  const [iw, ih] = execFileSync('identify', ['-format', '%w %h', out], { encoding: 'utf8' }).split(' ').map(Number);
  const s = statSync(out).size;
  if (iw !== w || ih !== h) throw new Error(`${out}: ${iw}x${ih}, want ${w}x${h}`);
  if (s >= limit) throw new Error(`${out}: ${s} bytes, limit ${limit}`);
  console.log(`wrote ${out} (${(s / 1024).toFixed(0)} KB)`);
}

async function session(w: number, h: number, job: number, fps = 20) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.addInitScript((s) => localStorage.setItem('fixitgarage.save.v1', s), JSON.stringify(SAVE));
  const d = new Driver(page);
  d.fps = fps;
  await d.open(base, `&job=${job}&lang=en`);
  return { ctx, page, d };
}

class Shot extends Error {}
/** run the repair up to its k-th mini-action and stop in the middle of it (bolt turning, part lifting, sanding) */
async function midRepair(d: Driver, page: Page, k: number) {
  let n = 0;
  d.onStep = async (id, mode) => {
    if (++n < k) return;
    const t = await d.target(id);
    await page.mouse.move(t.x, t.y);
    await page.mouse.down();
    if (mode === 'lift')
      for (let i = 1; i <= 3; i++) {
        await page.mouse.move(t.x, t.y - i * 14);
        await d.tick(1 / d.fps);
      }
    else if (mode === 'rub')
      for (let i = 0; i < 10; i++) {
        await page.mouse.move(t.x + (i % 2 ? -35 : 35), t.y, { steps: 3 });
        await d.tick(1 / d.fps);
      }
    else await d.tick(0.5);
    throw new Shot();
  };
  try {
    await d.repair({ beat: 0.05 });
  } catch (e) {
    if (!(e instanceof Shot)) throw e;
  }
  d.onStep = null;
}

/** each moment: the career job (a different car each) and the play up to the frame to capture */
const SHOTS: { name: string; job: number; run: (d: Driver, page: Page) => Promise<void> }[] = [
  {
    name: 'job 19, classic car: the battery tester clipped on the terminals',
    job: 19,
    run: async (d) => {
      await d.click('[data-tool=tester]');
      for (let i = 0; i < 2; i++) {
        const id = await d.expected();
        await d.tick(0.3);
        await d.tap(id);
      }
      await d.tick(0.25);
    },
  },
  {
    name: 'job 33, hatchback up on the lift: unbolting the leaking exhaust',
    job: 33,
    run: async (d, page) => {
      await d.useTool('lift', 0.2);
      await d.order('muffler');
      await midRepair(d, page, 2);
    },
  },
  { name: 'job 21, pickup on the lift: wheel nuts off in a star pattern', job: 21, run: (d, page) => d.order('tyre').then(() => midRepair(d, page, 3)) },
  { name: 'job 22, sports car: wheel off, the worn brake pads coming out', job: 22, run: (d, page) => d.order('pads').then(() => midRepair(d, page, 6)) },
  { name: 'job 17, sedan: spraying fresh paint over the scratch', job: 17, run: (d, page) => d.order('paint').then(() => midRepair(d, page, 2)) },
  { name: 'job 3, van: pouring oil into the engine', job: 3, run: (d, page) => d.order('oil').then(() => midRepair(d, page, 3)) },
];

if (only.includes('shots'))
  for (const [w, h, limit, slot] of [
    [760, 570, 2 * MB, 'standard'],
    [1280, 720, 5 * MB, 'widescreen'],
  ] as const)
    for (const [i, s] of SHOTS.entries()) {
      const { ctx, page, d } = await session(w, h, s.job);
      await page.addStyleTag({ content: NO_HINTS });
      await d.until(() => !!document.querySelector('.toolbar'), 40);
      await d.tick(0.3);
      await s.run(d, page);
      const phase = await page.evaluate(() => window.__game!.play.phase);
      if (!/^(tool:|fit:)/.test(phase)) throw new Error(`${s.name}: not mid-gameplay (phase ${phase})`);
      if (await page.evaluate(() => !!document.querySelector('.readout, .paycard, .screen, .title, .dialog, .sheet'))) throw new Error(`${s.name}: a popup or menu is open`);
      const tmp = `${OUT}/.tmp.png`;
      await d.screenshot(tmp);
      await ctx.close();
      png(tmp, `${OUT}/${slot}-${i + 1}.png`, w, h, limit);
      rmSync(tmp);
      console.log(`  ${s.name}`);
    }

if (only.includes('promos'))
  for (const [w, h, file, limit] of [
    [1920, 1080, 'promo-landscape.png', 5 * MB],
    [1080, 1920, 'promo-portrait.png', 5 * MB],
    [760, 570, 'promo-gamecard.png', 2 * MB],
  ] as const) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.goto(`${base}?nosdk&capture&view=cover&lang=en`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });
    // Y8: the game logo / title is the only text (no tagline, no buttons)
    await page.addStyleTag({ content: '.logo3d .l2, #ui button { display: none !important; }' });
    // …and the "FIX IT GARAGE" sign painted above the garage door goes too, so the logo is not doubled or overlapped
    const hidden = await page.evaluate(() => {
      type Obj = { visible: boolean; geometry?: { type: string; parameters?: { width: number; height: number } }; material?: { map?: unknown } };
      const scene = (window.__game!.play as unknown as { stage: { scene: { traverse(f: (o: Obj) => void): void } } }).stage.scene;
      let n = 0;
      scene.traverse((o) => {
        const g = o.geometry;
        if (g?.type === 'PlaneGeometry' && g.parameters?.width === 2.4 && g.parameters.height === 0.6 && o.material?.map) {
          o.visible = false;
          n++;
        }
      });
      return n;
    });
    if (hidden !== 1) throw new Error(`garage sign not found (${hidden})`);
    for (let i = 0; i < 12; i++) await page.evaluate(() => window.__game!.tick(1 / 30));
    await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch { /* looping */ } }));
    const texts = await page.evaluate(() => {
      const out: string[] = [];
      const walk = document.createTreeWalker(document.getElementById('ui')!, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.textContent!.trim() && n.parentElement!.checkVisibility({ visibilityProperty: true, opacityProperty: true })) out.push(n.textContent!.trim());
      return out;
    });
    if (texts.join(' ').replace(/\s+/g, ' ') !== 'Fix It Garage') throw new Error(`${file}: text other than the logo: ${JSON.stringify(texts)}`);
    await page.evaluate(() => window.__game!.render());
    const tmp = `${OUT}/.tmp.png`;
    await page.screenshot({ path: tmp, timeout: 180_000 });
    await page.close();
    png(tmp, `${OUT}/${file}`, w, h, limit);
    rmSync(tmp);
  }

if (only.includes('video'))
  for (const [w, h] of [
    [1280, 720],
    [960, 720],
  ]) {
    const FPS = 30;
    const dir = `${OUT}/.frames-${w}x${h}`;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const { ctx, page, d } = await session(w, h, 4, FPS);
    d.showTaps = true;
    await page.addStyleTag({ content: `.fx-tap{position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(255,255,255,.55);border:3px solid rgba(74,46,26,.55);pointer-events:none;z-index:99;animation:fxTap .5s ease-out forwards}@keyframes fxTap{from{transform:scale(.5);opacity:1}to{transform:scale(1.3);opacity:0}}` });
    let n = 0;
    d.onFrame = async () => {
      await page.screenshot({ path: join(dir, `f${String(n++).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 93, timeout: 180_000 });
      if (n % 150 === 0) console.log(`  ${w}x${h} ${(n / FPS).toFixed(0)} s`);
    };
    await d.until(() => !!document.querySelector('.toolbar'), 40);
    await d.tick(0.4);
    await d.useTool('lift', 0.8);
    await d.order('tyre');
    await d.repair({ beat: 0.12 });
    await d.until(() => !!document.querySelector('.toolbar'), 40);
    if (!(await d.test())) throw new Error('test drive failed');
    await d.tick(3);
    d.onFrame = null;
    await ctx.close();
    const frames = readdirSync(dir).length;
    const dur = frames / FPS;
    // Y8: 20–30 s; a longer take is sped up evenly to 28 s (never cut), a shorter one would fail here
    const speed = dur > 30 ? 28 / dur : 1;
    if (dur * speed < 20) throw new Error(`take is only ${dur.toFixed(1)} s`);
    const out = `${OUT}/gameplay-${w}x${h}.mp4`;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, 'f%05d.jpg'), '-vf', `setpts=${speed.toFixed(4)}*PTS,fps=${FPS},scale=${w}:${h}:flags=lanczos`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out]);
    rmSync(dir, { recursive: true, force: true });
    const s = statSync(out).size;
    if (s >= 50 * MB) throw new Error(`${out}: ${s} bytes (limit 50 MB)`);
    console.log(`wrote ${out} (${(s / MB).toFixed(1)} MB, take ${dur.toFixed(1)} s${speed < 1 ? `, sped x${(1 / speed).toFixed(2)}` : ''})`);
  }
await browser.close();

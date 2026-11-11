/**
 * Y8 media (docs.y8.com/studio/media), all JPG / MP4 into submission-y8/media/, from the real game (the ad-free web
 * build, `?nosdk&capture`: frame-stepped clock, real pointer input through scripts/driver.ts):
 *  - screenshot-760x570-{1..4}.jpg (Standard) and screenshot-1280x720-{1..4}.jpg (Widescreen): four gameplay moments,
 *    each rendered natively at both sizes (no menus / title screens)
 *  - promo-landscape-1920x1080.jpg, promo-portrait-1080x1920.jpg, promo-card-760x570.jpg: the 3D title scene with the
 *    logo (`?view=cover`, as scripts/submission/covers.ts), rendered natively at each size
 *  - gameplay-1280x720.mp4 and gameplay-960x720.mp4: one continuous take of real play (career job 4: a car rolls in,
 *    look under on the lift, order a tyre, unscrew the wheel nuts in a star pattern, swap the wheel, test drive,
 *    3-star payment), the same scripted take recorded at both sizes, 30 fps, no edits, no sound
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
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : ['shots', 'promos', 'video'];
const OUT = 'submission-y8/media';
const MB = 1024 * 1024;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: GL_ARGS });

/** a returning player on Relaxed (tutorial done, some money and upgrades): jobs open straight away */
const SAVE = { money: 420, career: 4, stars: { 1: 3, 2: 3, 3: 2 }, upgrades: [], book: ['dead-battery', 'brake-pads', 'low-oil'], ach: [], stats: { jobs: 3, perfect: 2, streak: 2, noWaste: 3, tricky: 0, cars: ['sedan', 'hatchback', 'van'], earned: 275, daily: 0 }, daily: { day: '', done: false }, settings: { music: true, sfx: true, lang: 'en', difficulty: 'relaxed' }, tutorialDone: true };

function jpg(png: string, out: string, limit: number) {
  execFileSync('convert', [png, '-strip', '-sampling-factor', '4:2:0', '-quality', '90', '-interlace', 'JPEG', out]);
  const s = statSync(out).size;
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

/** each moment: the job to open and the play up to the frame to capture */
const SHOTS: { name: string; job: number; run: (d: Driver, page: Page) => Promise<void> }[] = [
  {
    name: 'battery tester on the terminals: the reading shows the fault',
    job: 5,
    run: async (d) => {
      await d.until(() => !!document.querySelector('.toolbar'), 40);
      await d.click('[data-tool=tester]');
      for (let i = 0; i < 2; i++) {
        const id = await d.expected();
        await d.tick(0.3);
        await d.tap(id);
      }
      await d.until(() => !!document.querySelector('.readout'), 20);
      await d.tick(0.6);
    },
  },
  {
    name: 'the car up on the lift: looking under for clues',
    job: 4,
    run: async (d) => {
      await d.until(() => !!document.querySelector('.toolbar'), 40);
      await d.click('[data-tool=lift]');
      await d.until(() => !!document.querySelector('.readout'), 30);
      await d.tick(1.6);
    },
  },
  {
    name: 'the tyre change: wheel nuts off in a star pattern',
    job: 4,
    run: async (d) => {
      await d.until(() => !!document.querySelector('.toolbar'), 40);
      await d.useTool('lift', 0.2);
      await d.order('tyre');
      let step = 0;
      const stop = new Error('shot');
      d.onStep = async () => {
        if (++step === 4) throw stop;
      };
      try {
        await d.repair({ beat: 0.1 });
      } catch (e) {
        if (e !== stop) throw e;
      }
      d.onStep = null;
      await d.tick(0.15);
    },
  },
  {
    name: 'payment: 3 stars and a happy customer',
    job: 4,
    run: async (d) => {
      await d.until(() => !!document.querySelector('.toolbar'), 40);
      await d.useTool('lift', 0.2);
      await d.order('tyre');
      await d.repair({ beat: 0.05 });
      await d.until(() => !!document.querySelector('.toolbar'), 40);
      if (!(await d.test())) throw new Error('test drive failed');
      await d.tick(2.4);
    },
  },
];

if (only.includes('shots'))
  for (const [w, h, limit] of [
    [760, 570, 2 * MB],
    [1280, 720, 5 * MB],
  ])
    for (const [i, s] of SHOTS.entries()) {
      const { ctx, page, d } = await session(w, h, s.job);
      await s.run(d, page);
      const png = `${OUT}/.tmp.png`;
      await d.screenshot(png);
      await ctx.close();
      jpg(png, `${OUT}/screenshot-${w}x${h}-${i + 1}.jpg`, limit);
      rmSync(png);
      console.log(`  ${s.name}`);
    }

if (only.includes('promos'))
  for (const [w, h, file, limit] of [
    [1920, 1080, 'promo-landscape-1920x1080.jpg', 5 * MB],
    [1080, 1920, 'promo-portrait-1080x1920.jpg', 5 * MB],
    [760, 570, 'promo-card-760x570.jpg', 2 * MB],
  ] as const) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.goto(`${base}?nosdk&capture&view=cover&lang=en`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });
    for (let i = 0; i < 12; i++) await page.evaluate(() => window.__game!.tick(1 / 30));
    await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch { /* looping */ } }));
    await page.evaluate(() => window.__game!.render());
    const png = `${OUT}/.tmp.png`;
    await page.screenshot({ path: png, timeout: 180_000 });
    await page.close();
    jpg(png, `${OUT}/${file}`, limit);
    rmSync(png);
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

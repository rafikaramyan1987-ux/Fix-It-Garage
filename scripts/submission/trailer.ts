/**
 * CrazyGames trailer: real play recorded frame by frame (cover, a car drives in, look under on the lift, a tyre change
 * with the nuts in a star pattern, test drive, payment, cover), sped up to 18 s, no sound.
 * usage: npx tsx scripts/submission/trailer.ts <width> <height> [baseUrl]
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, GL_ARGS } from '../pw.mjs';
import { Driver } from '../driver';

const [W = '1920', H = '1080', base = 'http://127.0.0.1:4173/'] = process.argv.slice(2);
const FPS = 15;
const LEN = 18;
const dir = join(process.env.FRAMES_DIR ?? tmpdir(), `trailer-${W}x${H}`);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
mkdirSync('submission/videos', { recursive: true });
const browser = await chromium.launch({ args: GL_ARGS });
const portrait = +W < +H;
let n = 0;
const frame = () => join(dir, `f${String(n++).padStart(5, '0')}.jpg`);

// cover still (first frame of the trailer)
async function still(sec: number) {
  const page = await browser.newPage({ viewport: { width: +W, height: +H } });
  await page.goto(`${base}?nosdk&capture&view=cover&lang=en&pr=0.6`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });
  for (let i = 0; i < 12; i++) await page.evaluate(() => window.__game!.tick(1 / 30));
  await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch {} }));
  await page.evaluate(() => window.__game!.render());
  const first = frame();
  await page.screenshot({ path: first, type: 'jpeg', quality: 92, timeout: 180_000 });
  for (let i = 1; i < sec * FPS; i++) copyFileSync(first, frame());
  await page.close();
}

await still(1.4);
const page = await browser.newPage({ viewport: { width: +W, height: +H }, hasTouch: portrait, isMobile: portrait });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const d = new Driver(page);
d.fps = FPS;
d.showTaps = true;
await d.open(base, '&job=3&lang=en&pr=0.6');
d.onFrame = async () => {
  await page.screenshot({ path: frame(), type: 'jpeg', quality: 92, timeout: 180_000 });
  if (n % 60 === 0) console.log('frames', n);
};
await d.until(() => !!document.querySelector('.toolbar'), 40);
await d.tick(0.3);
await d.useTool('lift', 0.6);
await d.order('tyre');
await d.repair({ beat: 0.1 });
await d.until(() => !!document.querySelector('.toolbar'), 40);
await d.test();
await d.tick(1.8);
d.onFrame = null;
await page.close();
await still(1.4);
await browser.close();

const frames = readdirSync(dir).length;
const speed = LEN / (frames / FPS);
const out = `submission/videos/trailer-${W}x${H}.mp4`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, 'f%05d.jpg'), '-vf', `setpts=${speed.toFixed(4)}*PTS,fps=30,scale=${W}:${H}`, '-t', String(LEN), '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out]);
console.log(`wrote ${out}: ${frames} frames, sped x${(1 / speed).toFixed(2)}`);

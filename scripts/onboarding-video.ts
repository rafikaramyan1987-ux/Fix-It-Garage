/**
 * Onboarding video: a first-time player (empty save) lands in job 1, follows the in-game tutorial (battery tester,
 * battery swap, test), gets paid, then plays job 2 (brake pads, wheel nuts) without help. 390x844, real input.
 * usage: npx tsx scripts/onboarding-video.ts [baseUrl] [out.mp4]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, GL_ARGS } from './pw.mjs';
import { Driver } from './driver';

const [base = 'http://127.0.0.1:4173/', out = 'docs/preview/onboarding-v2-390x844.mp4'] = process.argv.slice(2);
const W = 390,
  H = 844,
  FPS = 15,
  SPEED = 1.4;
const dir = join(process.env.FRAMES_DIR ?? tmpdir(), 'onboarding-frames');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ args: GL_ARGS });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const d = new Driver(page);
d.fps = FPS;
d.showTaps = true;
await d.open(base, '&lang=en&pr=0.6');
let n = 0;
d.onFrame = async () => {
  await page.screenshot({ path: join(dir, `f${String(n++).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 90, timeout: 180_000 });
  if (n % 60 === 0) console.log('frames', n);
};
// job 1: the tutorial guides every step
await d.until(() => !!document.querySelector('.toolbar'), 40);
await d.tick(1.0);
await d.useTool('tester', 1.2);
await d.tick(0.6);
await d.click('[data-tool=repair]');
await d.tick(0.6);
await d.click('[data-part=battery]');
await d.tick(0.3);
await d.click('[data-action=order]');
await d.repair({ beat: 0.35 });
await d.until(() => !!document.querySelector('[data-tool=test]'), 40);
await d.tick(0.6);
await d.test();
await d.tick(2.2);
await d.click('[data-action=next]');
// job 2: no tutorial any more; the glow + hand show each step
await d.until(() => !!document.querySelector('.toolbar'), 60);
await d.tick(0.8);
await d.useTool('listen', 1.0);
await d.useTool('lift', 1.0);
await d.order('pads');
await d.repair({ beat: 0.3 });
await d.until(() => !!document.querySelector('[data-tool=test]'), 40);
await d.tick(0.5);
await d.test();
await d.tick(2.2);
await browser.close();
const frames = readdirSync(dir).length;
mkdirSync('docs/preview', { recursive: true });
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, 'f%05d.jpg'), '-vf', `setpts=${(1 / SPEED).toFixed(4)}*PTS,fps=30,scale=${W}:${H}:flags=lanczos`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out]);
console.log(`wrote ${out}: ${frames} frames, ${(frames / FPS / SPEED).toFixed(1)} s`);

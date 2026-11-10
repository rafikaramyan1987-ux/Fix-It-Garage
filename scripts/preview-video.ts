/**
 * Phase A preview video: one complete job played through real input at phone size (390x844), frame by frame,
 * encoded with ffmpeg to an MP4 of about 30 s.
 * usage: npx tsx scripts/preview-video.ts [baseUrl] [out.mp4]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, GL_ARGS } from './pw.mjs';
import { Driver } from './driver';

const [base = 'http://127.0.0.1:4173/', out = 'docs/preview/playable-job-390x844.mp4'] = process.argv.slice(2);
const W = 390,
  H = 844,
  FPS = 30,
  TARGET = 30;
const dir = join(process.env.FRAMES_DIR ?? tmpdir(), 'fig-frames');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({ args: GL_ARGS });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const d = new Driver(page);
d.fps = FPS;
d.showTaps = true;
await d.open(base);
let n = 0;
d.onFrame = async () => {
  await page.screenshot({ path: join(dir, `f${String(n++).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92, timeout: 180_000 });
  if (n % 60 === 0) console.log('frames', n);
};

await d.tick(0.6); // title
await d.startShift();
await d.until(() => !!document.querySelector('.toolbar'), 30);
await d.tick(0.4);
await d.useTool('tester', 0.9);
await d.tick(0.3);
await d.click('[data-tool=repair]');
await d.tick(0.5);
await d.click('[data-part=battery]');
await d.batterySwap({ wrongOrderOnce: true, beat: 0.15 });
await d.tick(0.3);
await d.click('[data-action=center]');
await d.waitPhase('payment', 30);
await d.tick(2.2);
await browser.close();

const frames = readdirSync(dir).length;
const dur = frames / FPS;
const speed = dur > TARGET ? TARGET / dur : 1;
console.log(`frames ${frames}, ${dur.toFixed(1)} s, speed x${(1 / speed).toFixed(2)}`);
mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, 'f%05d.jpg'),
  '-vf', `setpts=${speed.toFixed(4)}*PTS,scale=${W}:${H}:flags=lanczos,fps=${FPS}`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out,
]);
console.log('wrote', out);

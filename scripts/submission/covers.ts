/**
 * Store art rendered from the real 3D title scene (`?view=cover`): CrazyGames covers (PNG), GameDistribution thumbnails
 * (JPG) and GamePix icon + cover (JPG). usage: npx tsx scripts/submission/covers.ts [baseUrl]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, GL_ARGS } from '../pw.mjs';

const [base = 'http://127.0.0.1:4173/'] = process.argv.slice(2);
const browser = await chromium.launch({ args: GL_ARGS });

async function render(w: number, h: number, out: string) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto(`${base}?nosdk&capture&view=cover&lang=en`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });
  for (let i = 0; i < 12; i++) await page.evaluate(() => window.__game!.tick(1 / 30));
  await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch {} }));
  await page.evaluate(() => window.__game!.render());
  await page.screenshot({ path: out, timeout: 180_000 });
  await page.close();
  console.log('wrote', out);
}
const jpg = (src: string, out: string, size: string) => execFileSync('convert', [src, '-resize', `${size}^`, '-gravity', 'center', '-extent', size, '-quality', '90', out]);

mkdirSync('submission/covers', { recursive: true });
mkdirSync('submission-gd/thumbnails', { recursive: true });
mkdirSync('submission-gamepix', { recursive: true });
await render(1920, 1080, 'submission/covers/cover-1920x1080.png');
await render(800, 1200, 'submission/covers/cover-800x1200.png');
await render(800, 800, 'submission/covers/cover-800x800.png');
await render(1280, 550, join(tmpdir(), 'fig-1280x550.png'));
await render(1360, 850, join(tmpdir(), 'fig-1360x850.png'));
await browser.close();
const wide = 'submission/covers/cover-1920x1080.png';
const sq = 'submission/covers/cover-800x800.png';
jpg(wide, 'submission-gd/thumbnails/thumb-1280x720.jpg', '1280x720');
jpg(wide, 'submission-gd/thumbnails/thumb-512x384.jpg', '512x384');
jpg(wide, 'submission-gd/thumbnails/thumb-200x120.jpg', '200x120');
jpg(sq, 'submission-gd/thumbnails/thumb-512x512.jpg', '512x512');
jpg(join(tmpdir(), 'fig-1280x550.png'), 'submission-gd/thumbnails/thumb-1280x550.jpg', '1280x550');
jpg(sq, 'submission-gamepix/icon-256x256.jpg', '256x256');
jpg(join(tmpdir(), 'fig-1360x850.png'), 'submission-gamepix/cover-1360x850.jpg', '1360x850');
console.log('thumbnails done');

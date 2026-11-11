/**
 * GameMonetize thumbnails (512x384, 512x512, 512x340 JPG, each < 300 KB) rendered from the real 3D title scene
 * (`?view=cover`, as scripts/submission/covers.ts) with NO text and NO logo: the title overlay (#ui) is removed and the
 * "FIX IT GARAGE" sign above the garage door is hidden. Rendered at 2x, downscaled with Lanczos.
 * usage: npx vite preview --outDir dist-web --port 4173 &  npx tsx scripts/gamemonetize/images.ts [baseUrl]
 * out:   submission-gamemonetize/fix-it-garage-{512x384,512x512,512x340}.jpg
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { chromium, GL_ARGS } from '../pw.mjs';

type Obj = { visible: boolean; geometry?: { type: string; parameters?: { width: number; height: number } }; material?: { map?: unknown }; traverse(fn: (o: Obj) => void): void };

const [base = 'http://127.0.0.1:4173/'] = process.argv.slice(2);
const OUT = 'submission-gamemonetize';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: GL_ARGS });
for (const [w, h] of [
  [512, 384],
  [512, 512],
  [512, 340],
]) {
  const page = await browser.newPage({ viewport: { width: w * 2, height: h * 2 }, deviceScaleFactor: 1 });
  await page.goto(`${base}?nosdk&capture&view=cover&lang=en`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });
  for (let i = 0; i < 12; i++) await page.evaluate(() => window.__game!.tick(1 / 30));
  const hidden = await page.evaluate(() => {
    // no text or logo: drop the DOM overlay (title logo, tagline, menu) and hide the lettered garage sign
    document.querySelectorAll('#ui > *').forEach((e) => e.remove());
    let n = 0;
    const scene = (window.__game!.play as unknown as { stage: { scene: Obj } }).stage.scene;
    scene.traverse((o) => {
      const p = o.geometry?.type === 'PlaneGeometry' ? o.geometry.parameters : undefined;
      if (p && p.width === 2.4 && p.height === 0.6 && o.material?.map) {
        o.visible = false;
        n++;
      }
    });
    window.__game!.render();
    return n;
  });
  if (hidden !== 1) throw new Error(`expected to hide 1 garage sign, hid ${hidden}`);
  const png = `${OUT}/.tmp-${w}x${h}.png`;
  await page.screenshot({ path: png, timeout: 180_000 });
  await page.close();
  const jpg = `${OUT}/fix-it-garage-${w}x${h}.jpg`;
  execFileSync('convert', [png, '-filter', 'Lanczos', '-resize', `${w}x${h}!`, '-strip', '-sampling-factor', '4:2:0', '-quality', '88', '-interlace', 'JPEG', jpg]);
  rmSync(png);
  const size = statSync(jpg).size;
  if (size >= 300 * 1024) throw new Error(`${jpg}: ${size} bytes (limit 300 KB)`);
  console.log(`wrote ${jpg} (${(size / 1024).toFixed(0)} KB)`);
}
await browser.close();

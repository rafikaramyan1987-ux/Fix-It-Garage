// Game-specific settings for the open-portal web zip (scripts/web/zip.mjs) and its checker (scripts/web/check.mjs).
const SAVE_KEY = 'fixitgarage.save.v1';

const game = {
  slug: 'fix-it-garage',
  /** the ad-free web build: no portal SDK, and `ads()` (src/play/play.ts) is false, so no rewarded-ad buttons and no interstitials */
  build: 'npm run build:web',
  dist: 'dist-web',
  /** nothing to leave out of dist-web (zip.mjs passes these to `zip -x`, which needs at least one pattern) */
  exclude: ['*.DS_Store'],
  /** the only localStorage key the game writes (src/game/progress.ts) */
  storageKeys: [SAVE_KEY],
  /** `capture`: the game clock only moves when the checker ticks it (software WebGL is slow), like the e2e tests */
  query: '?capture',
  canvasSelector: 'canvas#game',
  /** every rewarded-ad button of the portal builds: extra hint (in the hint offer), free spare part, double payment.
   *  The Hint button itself is not an ad: its first use per job is free, the next ones cost coins. */
  adSelector: '.btn.ad, [data-action=hint-ad], [data-action=free-part], [data-action=double]',
  async ready(frame) {
    await frame.waitForFunction(() => window.__ready === true && window.__game, null, { timeout: 120_000 });
  },
  /** job 1 for a new player, with the tutorial: battery tester, order the battery, swap it, test drive, payment */
  async play(frame, page) {
    const d = new FrameDriver(frame, page);
    // first start: the difficulty choice (Relaxed, recommended)
    await d.until(() => !!document.querySelector('.diffpick, .toolbar'), 15);
    if (await d.has('[data-difficulty=relaxed]')) await d.click('[data-difficulty=relaxed]');
    await d.until(() => !!document.querySelector('.toolbar'), 15);
    await d.useTool('tester', 0.2);
    await d.order('battery');
    await d.repair(0.1);
    await d.until(() => !!document.querySelector('[data-tool=test]'), 40);
    const paid = await d.test();
    await d.tick(1.5);
    await d.until(() => !document.querySelector('.toast'), 8); // the tutorial's "Well done" toast is gone
    await d.settle();
    await frame.evaluate(() => window.__game.render());
    const stars = await frame.locator('.paycard .stars .s.on').count();
    return { won: paid && stars > 0, why: paid ? 'no stars on the payment card' : 'the test drive failed', note: `job 1 repaired (battery), test drive passed, paid with ${stars} stars` };
  },
  // ---------------------------------------------------------------- store images (scripts/web/store.mjs)
  /** the main cover (submission/covers, rendered from the title scene), cropped to 630:500 around the title */
  cover: { src: 'submission/covers/cover-1920x1080.png', crop: '1260x1000+340+40' },
  /** the square cover (title + garage), scaled down */
  icon: 'submission/covers/cover-800x800.png',
  /** 1280x720 shots of the web build, played through the game's own input (capture mode, as in the e2e tests) */
  shots: [
    {
      name: 'start: the main menu of a returning player',
      query: '?capture',
      save: returning(1),
      run: async (f, p) => {
        const d = new FrameDriver(f, p);
        await d.until(() => !!document.querySelector('[data-action=play]'), 10);
        await d.tick(1.5);
        await d.shot();
      },
    },
    {
      name: 'mid-level: a brake job, the clues on the ticket after a test drive and a look under the lift',
      query: '?capture&job=4',
      save: returning(4),
      run: async (f, p) => {
        const d = new FrameDriver(f, p);
        await d.until(() => !!document.querySelector('.toolbar'), 40);
        for (const t of ['drive', 'lift']) if (await d.has(`[data-tool=${t}]`)) await d.useTool(t, 0.6);
        await d.tick(1);
        await d.shot();
      },
    },
    {
      name: 'a mechanic: undoing a battery terminal with the ratchet',
      query: '?capture',
      save: returning(1),
      run: async (f, p) => {
        const d = new FrameDriver(f, p);
        await d.click('[data-action=play]');
        await d.until(() => !!document.querySelector('.toolbar'), 40);
        await d.order('battery');
        for (let i = 0; i < 40; i++) {
          const id = await d.expected();
          await d.tick(0.3);
          if (id === 'neg') break;
          await d.tap(id);
        }
        const t = await d.target('neg');
        const o = await d.offset();
        await p.mouse.move(o.x + t.x, o.y + t.y);
        await p.mouse.down();
        await d.tick(0.6);
        await d.shot();
        await p.mouse.up();
      },
    },
    {
      name: 'win screen: job 1 paid, three stars',
      query: '?capture',
      run: async (f, p) => {
        await game.play(f, p);
        await new FrameDriver(f, p).shot();
      },
    },
  ],
};
export default game;

/** a returning player at career job `career`: tutorial done, some money, settings default (so the main menu shows) */
function returning(career) {
  const save = { money: 900, career, stars: { 1: 3, 2: 3, 3: 2 }, upgrades: [], book: ['dead-battery', 'flat-tyre'], ach: ['first_fix'], stats: { jobs: career - 1, perfect: 2, streak: 2, noWaste: 2, tricky: 0, cars: [], earned: 400, daily: 0 }, daily: { day: '', done: false }, settings: { music: true, sfx: true, lang: null, difficulty: 'relaxed' }, tutorialDone: true };
  return new Function(`localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(JSON.stringify(save))})`);
}

/**
 * Plays through real pointer input, like scripts/driver.ts (the e2e driver), but on a frame (the game in the
 * checker's iframe, or the page itself): page mouse coordinates are offset by the iframe's position.
 */
export class FrameDriver {
  fps = 10;
  constructor(frame, page) {
    this.f = frame;
    this.p = page;
  }
  async offset() {
    if (!this.f.parentFrame()) return { x: 0, y: 0 };
    const b = await (await this.f.frameElement()).boundingBox();
    return { x: b.x, y: b.y };
  }
  /** advance the game clock without drawing (like the e2e driver); `shot()` draws the frame */
  async tick(sec) {
    const n = Math.max(1, Math.round(sec * this.fps));
    for (let i = 0; i < n; i++) await this.f.evaluate((dt) => window.__game.tick(dt, false), 1 / this.fps);
  }
  async until(fn, maxSec = 20) {
    for (let t = 0; t < maxSec; t += 1 / this.fps) {
      if (await this.f.evaluate(fn)) return;
      await this.tick(1 / this.fps);
    }
    throw new Error(`timed out waiting for ${fn.toString().replace(/\s+/g, ' ')}`);
  }
  has(sel) {
    return this.f.evaluate((s) => !!document.querySelector(s), sel);
  }
  /** let pop-in UI animations finish (they run on the game clock in capture mode) */
  async settle() {
    for (let i = 0; i < 20; i++) {
      const busy = await this.f.evaluate(() =>
        document.getAnimations().some((a) => {
          const tm = a.effect?.getComputedTiming();
          return tm && tm.iterations !== Infinity && (tm.progress ?? 1) < 1 && a.animationName !== 'toast';
        }),
      );
      if (!busy) return;
      await this.tick(1 / this.fps);
    }
  }
  /** finish pop-in transitions and draw the current frame (capture mode has no render loop) */
  async shot() {
    await this.f.evaluate(() => {
      for (const a of document.getAnimations()) {
        try {
          if (a.effect?.getTiming().iterations !== Infinity && a.animationName !== 'toast') a.finish();
        } catch {}
      }
      window.__game.render();
    });
  }
  async click(sel) {
    await this.until(new Function(`return !!document.querySelector(${JSON.stringify(sel)})`), 30);
    await this.settle();
    const b = await this.f.locator(sel).first().boundingBox();
    if (!b) throw new Error(`no box for ${sel}`);
    // locator boxes are already in page coordinates
    await this.p.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  }
  async target(id) {
    await this.until(new Function(`return window.__game.targets().some(t => t.id === ${JSON.stringify(id)})`), 30);
    return (await this.f.evaluate(() => window.__game.targets())).find((t) => t.id === id);
  }
  async expected() {
    await this.until(() => !!window.__game.play.expected, 30);
    return this.f.evaluate(() => window.__game.play.expected);
  }
  async tap(id) {
    const t = await this.target(id), o = await this.offset();
    await this.p.mouse.click(o.x + t.x, o.y + t.y);
  }
  async hold(id, sec = 1.05) {
    const t = await this.target(id), o = await this.offset();
    await this.p.mouse.move(o.x + t.x, o.y + t.y);
    await this.p.mouse.down();
    await this.tick(Math.max(sec, 0.05));
    await this.p.mouse.up();
  }
  async lift(id) {
    const t = await this.target(id), o = await this.offset();
    await this.p.mouse.move(o.x + t.x, o.y + t.y);
    await this.p.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await this.p.mouse.move(o.x + t.x, o.y + t.y - i * 14);
      await this.tick(1 / this.fps);
    }
    await this.p.mouse.up();
  }
  async rub(id) {
    const t = await this.target(id), o = await this.offset();
    await this.p.mouse.move(o.x + t.x, o.y + t.y);
    await this.p.mouse.down();
    for (let i = 0; i < 80; i++) {
      if (!(await this.f.evaluate((x) => window.__game.targets().some((q) => q.id === x), id))) break;
      await this.p.mouse.move(o.x + t.x + (i % 2 ? -35 : 35), o.y + t.y + ((i % 4) - 1.5) * 6, { steps: 4 });
      await this.tick(1 / this.fps);
    }
    await this.p.mouse.up();
  }
  async useTool(tool, pause = 1.2) {
    await this.click(`[data-tool=${tool}]`);
    if (tool === 'tester')
      for (let i = 0; i < 2; i++) {
        const id = await this.expected();
        await this.tick(0.35);
        await this.tap(id);
      }
    await this.until(() => !!document.querySelector('.readout'), 30);
    await this.tick(pause);
    await this.click('.readout button');
    await this.until(() => !!document.querySelector('.toolbar'), 40);
  }
  /** pick a part in the parts sheet and order it */
  async order(part) {
    const cats = { battery: 'bay', pads: 'wheels', tyre: 'wheels', disc: 'wheels' };
    await this.click('[data-tool=repair]');
    await this.tick(0.3);
    if (await this.has(`.tab[data-cat=${cats[part]}]`)) await this.click(`.tab[data-cat=${cats[part]}]`);
    // Relaxed mode: one list sorted by the clues (the first jobs show the top 3, the rest behind "Show all parts")
    else if (!(await this.has(`.parts-sheet [data-part=${part}]`))) await this.click('[data-action=all-parts]');
    await this.click(`[data-part=${part}]`);
    await this.tick(0.2);
    await this.click('[data-action=order]');
  }
  /** every repair mini-action, acting on whatever the game expects next */
  async repair(beat = 0.25) {
    for (let guard = 0; guard < 400; guard++) {
      if (!(await this.f.evaluate(() => window.__game.play.phase)).startsWith('fit:')) return;
      const list = await this.f.evaluate(() => window.__game.targets());
      const exp = await this.f.evaluate(() => window.__game.play.expected);
      if (!list.length || !exp) {
        await this.tick(1 / this.fps);
        continue;
      }
      const tg = list.find((x) => x.id === exp) ?? list[0];
      await this.tick(beat);
      if (tg.mode === 'tap') await this.tap(tg.id);
      else if (tg.mode === 'lift') await this.lift(tg.id);
      else if (tg.mode === 'rub') await this.rub(tg.id);
      else await this.hold(tg.id);
      await this.tick(0.05);
    }
    throw new Error('repair did not finish');
  }
  /** test drive; true when the job went to payment */
  async test() {
    await this.click('[data-tool=test]');
    await this.click('[data-action=center]');
    for (let i = 0; i < 40 * this.fps; i++) {
      const ph = await this.f.evaluate(() => window.__game.play.phase);
      if (ph === 'payment') return true;
      if (ph === 'diagnose' && (await this.has('.toolbar'))) return false;
      await this.tick(1 / this.fps);
    }
    throw new Error('test drive did not finish');
  }
}

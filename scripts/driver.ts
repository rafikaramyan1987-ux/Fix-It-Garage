/**
 * Plays the game through real pointer input in a Playwright page running with `?capture` (frame-stepped clock).
 * Shared by the preview screenshots, the preview video and the e2e tests.
 */
import type { Page } from 'playwright';

type ToolId = 'tester' | 'obd' | 'listen' | 'lift';

declare global {
  interface Window {
    __ready?: boolean;
    __game?: { tick(dt: number, render?: boolean): void; render(): void; targets(): { id: string; x: number; y: number; mode: string }[]; play: { phase: string; expected: string | null }; setLang(l: string): Promise<void> };
  }
}

export class Driver {
  /** called after every rendered frame (the video recorder grabs it) */
  onFrame: (() => Promise<void>) | null = null;
  fps = 30;
  /** show a soft finger dot where the player taps (video) */
  showTaps = false;

  constructor(readonly page: Page) {}

  /** draw the current frame and take a screenshot */
  async screenshot(path: string) {
    await this.page.evaluate(() => {
      // settle finite UI transitions (pop-ins), keep looping ones and toasts as they are
      for (const a of document.getAnimations()) {
        try {
          const it = a.effect?.getTiming().iterations;
          const name = (a as CSSAnimation).animationName;
          if (it !== Infinity && name !== 'toast') a.finish();
        } catch {}
      }
      window.__game!.render();
    });
    await this.page.screenshot({ path, timeout: 180_000 });
  }

  async open(base: string, extra = '') {
    await this.page.goto(`${base}?nosdk&capture${extra}`);
    await this.page.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });
    if (this.showTaps)
      await this.page.addStyleTag({
        content: `.fx-tap{position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(255,255,255,.55);border:3px solid rgba(74,46,26,.55);pointer-events:none;z-index:99;animation:fxTap .5s ease-out forwards}@keyframes fxTap{from{transform:scale(.5);opacity:1}to{transform:scale(1.3);opacity:0}}`,
      });
  }

  async tick(sec: number) {
    const n = Math.max(1, Math.round(sec * this.fps));
    for (let i = 0; i < n; i++) {
      await this.page.evaluate(([dt, r]) => window.__game!.tick(dt, r), [1 / this.fps, !!this.onFrame] as [number, boolean]);
      if (this.onFrame) await this.onFrame();
    }
  }

  /** tick until `fn` is true in the page */
  async until(fn: () => boolean, maxSec = 20) {
    for (let t = 0; t < maxSec; t += 1 / this.fps) {
      if (await this.page.evaluate(fn)) return;
      await this.tick(1 / this.fps);
    }
    throw new Error(`timed out waiting for ${fn.toString()}`);
  }

  private async tapDot(x: number, y: number) {
    if (!this.showTaps) return;
    await this.page.evaluate(
      ([x, y]) => {
        const d = document.createElement('div');
        d.className = 'fx-tap';
        d.style.left = `${x}px`;
        d.style.top = `${y}px`;
        document.body.append(d);
        setTimeout(() => d.remove(), 3000);
      },
      [x, y],
    );
  }

  /** let pop-in UI animations finish (they run on the game clock in capture mode) */
  async settle() {
    for (let i = 0; i < 20; i++) {
      const busy = await this.page.evaluate(() =>
        document.getAnimations().some((a) => {
          const tm = a.effect?.getComputedTiming();
          return tm && tm.iterations !== Infinity && (tm.progress ?? 1) < 1 && (a as CSSAnimation).animationName !== 'toast';
        }),
      );
      if (!busy) return;
      await this.tick(1 / this.fps);
    }
  }

  async click(selector: string) {
    await this.until(new Function(`return !!document.querySelector(${JSON.stringify(selector)})`) as () => boolean, 30);
    await this.settle();
    const box = await this.page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`no box for ${selector}`);
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await this.tapDot(x, y);
    await this.page.mouse.click(x, y);
  }

  async target(id: string) {
    const fn = new Function(`return window.__game.targets().some(t => t.id === ${JSON.stringify(id)})`) as () => boolean;
    await this.until(fn, 30);
    const list = await this.page.evaluate(() => window.__game!.targets());
    return list.find((t) => t.id === id)!;
  }

  async expected() {
    await this.until(() => !!window.__game!.play.expected, 30);
    return this.page.evaluate(() => window.__game!.play.expected!);
  }

  async tap(id: string) {
    const t = await this.target(id);
    await this.tapDot(t.x, t.y);
    await this.page.mouse.click(t.x, t.y);
  }

  async hold(id: string, sec = 1.05) {
    sec = Math.max(sec, 0.05);
    const t = await this.target(id);
    await this.tapDot(t.x, t.y);
    await this.page.mouse.move(t.x, t.y);
    await this.page.mouse.down();
    await this.tick(sec);
    await this.page.mouse.up();
  }

  async lift(id: string) {
    const t = await this.target(id);
    await this.tapDot(t.x, t.y);
    await this.page.mouse.move(t.x, t.y);
    await this.page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await this.page.mouse.move(t.x, t.y - i * 14);
      await this.tick(1 / this.fps);
    }
    await this.page.mouse.up();
  }

  async readoutClose(pause = 1.2) {
    await this.until(() => !!document.querySelector('.readout'), 30);
    await this.tick(pause);
    await this.click('.readout button');
  }

  async useTool(t: ToolId, pause = 1.2) {
    await this.click(`[data-tool=${t}]`);
    if (t === 'tester') {
      for (let i = 0; i < 2; i++) {
        const id = await this.expected();
        await this.tick(0.35);
        await this.tap(id);
      }
    }
    await this.readoutClose(pause);
    await this.until(() => !!document.querySelector('.toolbar'), 40);
  }

  /** pick a part in the parts sheet and order it */
  async order(part: string, free = false) {
    await this.click('[data-tool=repair]');
    await this.tick(0.3);
    const cat = await this.page.evaluate((p) => {
      const cats: Record<string, string> = { battery: 'bay', alternator: 'bay', starter: 'bay', plugs: 'bay', airfilter: 'bay', hose: 'bay', thermostat: 'bay', chargeport: 'bay', pads: 'wheels', disc: 'wheels', tyre: 'wheels', tierod: 'under', shock: 'under', muffler: 'under', catalyst: 'under', fuelpump: 'under', gasket: 'under', oil: 'fluids', paint: 'fluids' };
      return cats[p];
    }, part);
    await this.click(`.tab[data-cat=${cat}]`);
    await this.click(`[data-part=${part}]`);
    await this.tick(0.2);
    await this.click(free ? '[data-action=free-part]' : '[data-action=order]');
  }

  private async rub(id: string) {
    const t = await this.target(id);
    await this.tapDot(t.x, t.y);
    await this.page.mouse.move(t.x, t.y);
    await this.page.mouse.down();
    for (let i = 0; i < 80; i++) {
      const has = await this.page.evaluate((x) => window.__game!.targets().some((q) => q.id === x), id);
      if (!has) break;
      await this.page.mouse.move(t.x + (i % 2 ? -35 : 35), t.y + ((i % 4) - 1.5) * 6, { steps: 4 });
      await this.tick(1 / this.fps);
    }
    await this.page.mouse.up();
  }

  private async pour() {
    const t = await this.target('pour');
    await this.page.mouse.move(t.x, t.y);
    await this.page.mouse.down();
    for (let i = 0; i < 200; i++) {
      const ok = await this.page.evaluate(() => {
        const m = document.querySelector('.meter');
        if (!m) return true;
        const lvl = (m.querySelector('.lvl') as HTMLElement).style.height;
        const z = m.querySelector('.zone') as HTMLElement;
        return parseFloat(lvl) >= parseFloat(z.style.bottom) + 5;
      });
      if (ok) break;
      await this.tick(1 / this.fps);
    }
    await this.page.mouse.up();
  }

  /** called before each repair step with the step's target id (screenshots) */
  onStep: ((id: string, mode: string) => Promise<void>) | null = null;

  /** run every repair mini-action, acting on whatever the game expects next */
  async repair(opts: { wrongOrderOnce?: boolean; beat?: number } = {}) {
    let wrongDone = !opts.wrongOrderOnce;
    const beat = opts.beat ?? 0.25;
    for (let guard = 0; guard < 400; guard++) {
      const phase = await this.page.evaluate(() => window.__game!.play.phase);
      if (!phase.startsWith('fit:')) return;
      const list = await this.page.evaluate(() => window.__game!.targets());
      const exp = await this.page.evaluate(() => window.__game!.play.expected);
      if (!list.length || !exp) {
        await this.tick(1 / this.fps);
        continue;
      }
      const tg = list.find((x) => x.id === exp) ?? list[0];
      await this.tick(beat);
      if (this.onStep) await this.onStep(tg.id, tg.mode);
      if (tg.id === 'pour') await this.pour();
      else if (tg.mode === 'tap') await this.tap(tg.id);
      else if (tg.mode === 'lift') await this.lift(tg.id);
      else if (tg.mode === 'rub') await this.rub(tg.id);
      else {
        if (!wrongDone && tg.id === 'neg') {
          await this.hold('pos', 0.2);
          await this.tick(1.0);
          wrongDone = true;
        }
        await this.hold(tg.id);
      }
      await this.tick(0.05);
    }
    throw new Error('repair did not finish');
  }

  /** compat: the battery job */
  async batterySwap(opts: { wrongOrderOnce?: boolean; beat?: number } = {}) {
    await this.repair(opts);
  }

  /** test drive; resolves with true when the job went to payment */
  async test() {
    await this.click('[data-tool=test]');
    await this.click('[data-action=center]');
    for (let i = 0; i < 40 * this.fps; i++) {
      const ph = await this.page.evaluate(() => window.__game!.play.phase);
      if (ph === 'payment') return true;
      if (ph === 'diagnose' && (await this.page.evaluate(() => !!document.querySelector('.toolbar')))) return false;
      await this.tick(1 / this.fps);
    }
    throw new Error('test drive did not finish');
  }

  async startShift() {
    await this.tick(0.5);
    await this.click('[data-action=play]');
  }

  /** skip the first-job tutorial bubble if it is there */
  async skipTutorial() {
    if (await this.page.evaluate(() => !!document.querySelector('[data-action=skip-tutorial]'))) await this.click('[data-action=skip-tutorial]');
  }

  async waitPhase(p: string, maxSec = 30) {
    await this.until(new Function(`return window.__game.play.phase === ${JSON.stringify(p)}`) as () => boolean, maxSec);
  }
}

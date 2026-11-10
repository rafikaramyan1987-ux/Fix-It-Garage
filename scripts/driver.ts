/**
 * Plays the game through real pointer input in a Playwright page running with `?capture` (frame-stepped clock).
 * Shared by the preview screenshots, the preview video and the e2e tests.
 */
import type { Page } from 'playwright';

type ToolId = 'tester' | 'obd' | 'listen' | 'lift';

declare global {
  interface Window {
    __ready?: boolean;
    __game?: { tick(dt: number, render?: boolean): void; render(): void; targets(): { id: string; x: number; y: number }[]; play: { phase: string; expected: string | null } };
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

  async click(selector: string) {
    await this.until(new Function(`return !!document.querySelector(${JSON.stringify(selector)})`) as () => boolean, 30);
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
    await this.until(() => !!document.querySelector('.toolbar'), 30);
  }

  /** the whole battery swap, acting on whatever the game expects next */
  async batterySwap(opts: { wrongOrderOnce?: boolean; beat?: number } = {}) {
    let wrongDone = !opts.wrongOrderOnce;
    const beat = opts.beat ?? 0.25;
    for (;;) {
      const phase = await this.page.evaluate(() => window.__game!.play.phase);
      if (!phase.startsWith('fit:')) return;
      const has = await this.page.evaluate(() => !!window.__game!.play.expected);
      if (!has) {
        await this.tick(1 / this.fps);
        continue;
      }
      const id = await this.expected();
      await this.tick(beat);
      if (id === 'hood' || id === 'new') await this.tap(id);
      else if (id === 'old') await this.lift(id);
      else {
        if (!wrongDone && id === 'neg') {
          // try the (+) terminal first: refused with sparks
          await this.hold('pos', 0.2);
          await this.tick(1.0);
          wrongDone = true;
        }
        await this.hold(id);
      }
      await this.tick(0.05);
    }
  }

  async startShift() {
    await this.tick(0.5);
    await this.click('[data-action=start]');
  }

  async waitPhase(p: string, maxSec = 30) {
    await this.until(new Function(`return window.__game.play.phase === ${JSON.stringify(p)}`) as () => boolean, maxSec);
  }
}

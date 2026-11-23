/**
 * Every button fits the frame and no two overlap, in every overlay, at every size and in every language.
 * (GamePix rejected v1.1.0: "At 800x450 the Réparer button of the bottom bar is cut off at the right edge".)
 *
 * For each frame size x language the game is played through its overlays: main menu, the job HUD (top bar) with the
 * full bottom bar (all 7 tools bought, hint, Repair and Test), a tool readout, the guided hint, the hint offer, the
 * parts sheet, pause, the leave-job confirmation and the payment card (with the double-payment ad button). In each,
 * every visible button must lie inside the viewport, and every button of the overlay in front must be tappable (its
 * centre hits it) and must not overlap another tappable button. Dialog cards must fit the viewport too.
 */
import { expect, test, type Page } from '@playwright/test';
import { open, richSave } from '../e2e/helpers';

/** every language of the game (src/i18n/index.ts LANGS) */
const LANGS = ['en', 'fr', 'de', 'it', 'es', 'pt', 'nl', 'pl', 'tr', 'ru'] as const;

const SIZES: { w: number; h: number }[] = [
  // landscape (GamePix / Y8 / phone-in-landscape frames)
  { w: 480, h: 320 },
  { w: 568, h: 320 },
  { w: 640, h: 360 },
  { w: 800, h: 450 },
  { w: 1024, h: 576 },
  { w: 1280, h: 720 },
  { w: 1366, h: 768 },
  { w: 1920, h: 1080 },
  // portrait
  { w: 320, h: 480 },
  { w: 360, h: 640 },
  { w: 390, h: 844 },
  { w: 450, h: 800 },
  { w: 768, h: 1024 },
  { w: 1080, h: 1920 },
];

type Box = { name: string; l: number; t: number; r: number; b: number };

/** layout problems of the current screen; `front` = the overlay in front (its buttons must all be tappable) */
function problems(page: Page, front: string, cards: string) {
  return page.evaluate(
    ([front, cards]) => {
      // measure the resting layout: settle pop-ins, put looping pulses at their rest frame
      for (const a of document.getAnimations()) {
        try {
          if (a.effect?.getTiming().iterations === Infinity) {
            a.pause();
            a.currentTime = 0;
          } else a.finish();
        } catch {}
      }
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const bad: string[] = [];
      const name = (e: Element) => {
        const h = e as HTMLElement;
        const id = h.dataset.tool ?? h.dataset.action ?? h.dataset.part ?? h.dataset.cat ?? '';
        return `<button.${h.className.replace(/ /g, '.')}${id ? ` ${id}` : ''}> "${(h.textContent ?? '').trim().slice(0, 30)}"`;
      };
      const visible = (e: Element) => {
        const r = e.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        for (let p: Element | null = e; p; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
        }
        return true;
      };
      // a part in the scrolling parts list counts by the piece of it the list shows (scroll to reach the rest);
      // any other button must not be cut by a scrolling box
      const scroller = (e: Element) => {
        for (let p = e.parentElement; p; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (/(auto|scroll)/.test(s.overflowY + s.overflowX)) return p;
        }
        return null;
      };
      const boxes: (Box & { el: Element; front: boolean; hit: boolean })[] = [];
      for (const e of document.querySelectorAll('#ui button')) {
        if (!visible(e)) continue;
        let r = e.getBoundingClientRect();
        const n = name(e);
        const sc = scroller(e);
        if (sc) {
          const c = sc.getBoundingClientRect();
          const l = Math.max(r.left, c.left), t = Math.max(r.top, c.top), rr = Math.min(r.right, c.right), b = Math.min(r.bottom, c.bottom);
          if (sc.matches('.parts')) {
            if (rr - l < 1 || b - t < 1) continue; // scrolled out of the parts list
            r = new DOMRect(l, t, rr - l, b - t);
          } else if (l > r.left + 0.5 || t > r.top + 0.5 || rr < r.right - 0.5 || b < r.bottom - 0.5) bad.push(`cut by the scrolling <${(sc as HTMLElement).className}>: ${n}`);
        }
        if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) bad.push(`outside the ${vw}x${vh} viewport: ${n} at ${Math.round(r.left)},${Math.round(r.top)}-${Math.round(r.right)},${Math.round(r.bottom)}`);
        const cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2));
        const cy = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
        const at = document.elementFromPoint(cx, cy);
        const hit = !!at && (at === e || e.contains(at));
        const isFront = !!e.closest(front);
        if (isFront && !hit) bad.push(`not tappable (covered by <${at?.tagName.toLowerCase()}.${(at as HTMLElement | null)?.className}>): ${n}`);
        boxes.push({ el: e, name: n, l: r.left, t: r.top, r: r.right, b: r.bottom, front: isFront, hit });
      }
      const live = boxes.filter((b) => b.hit || b.front);
      for (let i = 0; i < live.length; i++)
        for (let j = i + 1; j < live.length; j++) {
          const a = live[i], b = live[j];
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
          const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
          const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
          if (ox > 0.5 && oy > 0.5) bad.push(`overlap ${Math.round(ox)}x${Math.round(oy)}px: ${a.name} / ${b.name}`);
        }
      if (front && !boxes.some((b) => b.front)) bad.push(`no button of ${front} on screen`);
      for (const e of document.querySelectorAll(cards)) {
        if (!visible(e)) continue;
        const r = e.getBoundingClientRect();
        if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) bad.push(`card cut off by the ${vw}x${vh} viewport: <${(e as HTMLElement).className}> at ${Math.round(r.left)},${Math.round(r.top)}-${Math.round(r.right)},${Math.round(r.bottom)}`);
      }
      return bad;
    },
    [front, cards] as [string, string],
  );
}

const CARDS = '.toolbar, .hud, .ticket, .panel, .dialog, .paycard, .readout, .sheet, .title .menu, .center-action, .kpanel';

for (const { w, h } of SIZES) {
  for (const lang of LANGS) {
    test(`${w}x${h} ${lang}: every button fits and none overlap`, async ({ browser }) => {
      const portrait = h > w;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: portrait, isMobile: portrait });
      const page = await ctx.newPage();
      await page.route('**/gamepix.sdk.js', (r) => r.abort());
      // job 21, every tool bought (the longest bottom bar), Relaxed (hint button), rewarded ads offered
      const { d, errors } = await open(page, `&lang=${lang}`, richSave({ career: 21, upgrades: ['gauge', 'exhaust'], book: ['dead-battery', 'alternator', 'flat-tyre'] }));
      const report: string[] = [];
      const check = async (where: string, front: string) => {
        await d.tick(0.5);
        await d.settle();
        for (const p of await problems(page, front, CARDS)) report.push(`${where}: ${p}`);
      };

      await d.until(() => !!document.querySelector('.title [data-action=play]'), 30);
      await check('main menu', '.title');
      await d.click('[data-action=play]');
      await d.until(() => !!document.querySelector('.toolbar [data-tool=exhaust]'), 40);
      await check('job: top bar + bottom bar', '.toolbar, .hud');

      // a part fitted (so Test joins the bar), then a tool reading
      await page.evaluate(() => (window.__game!.play as unknown as { job: { wrong: string[] } }).job.wrong.push('battery'));
      await d.click('[data-tool=listen]');
      await d.until(() => !!document.querySelector('.readout'), 40);
      await check('tool readout', '.readout');
      await d.click('.readout button');
      await d.until(() => !!document.querySelector('.toolbar [data-tool=test]'), 40);
      await check('job: full bottom bar (7 tools, hint, repair, test)', '.toolbar, .hud');

      await d.click('[data-tool=hint]');
      await d.until(() => !!document.querySelector('.hintbar.is-guide'), 20);
      await check('guided hint over the bottom bar', '.toolbar, .hud');
      await d.click('[data-tool=hint]');
      await d.until(() => !!document.querySelector('.dialog'), 20);
      await check('hint offer dialog', '.dialog');
      await d.click('.dialog .btn.ghost');
      await d.until(() => !!document.querySelector('.toolbar'), 20);

      await d.click('[data-tool=repair]');
      await d.until(() => !!document.querySelector('.sheet'), 20);
      await check('parts sheet', '.sheet');
      await d.click('.sheet .btn.ghost');
      await d.until(() => !!document.querySelector('.toolbar'), 20);

      await d.click('[data-action=pause]');
      await d.until(() => !!document.querySelector('.screen.pause'), 20);
      await check('pause', '.screen.pause');
      await d.click('.screen.pause [data-action=menu]');
      await d.until(() => !!document.querySelector('.dialog'), 20);
      await check('leave-job confirmation', '.dialog');
      await d.click('.dialog .btn.ghost');
      await d.until(() => !!document.querySelector('.screen.pause'), 20);
      await d.click('.screen.pause [data-action=resume]');
      await d.until(() => !!document.querySelector('.toolbar'), 20);

      // the win popup, with the longest content it can have (tips, wasted parts, star notes, the double-payment ad)
      await page.evaluate(() => {
        const ui = (window.__game!.play as unknown as { ui: { payment(...a: unknown[]): Promise<unknown>; toolbar(o: null): void; steps(s: null): void; prompt(s: null): void } }).ui;
        // as the game does before the payment: no bottom bar, steps or prompt
        ui.toolbar(null);
        ui.steps(null);
        ui.prompt(null);
        void ui.payment({ labor: 180, parts: 95, timeBonus: 40, tips: 18, wasted: 60, total: 273, stars: 2, notes: ['pay.note.wrong', 'pay.note.slow'] }, 'Grandpa Otto', 'pay.thanks1', true, () => {}, '');
      });
      await d.until(() => !!document.querySelector('.paycard [data-action=next]'), 20);
      await check('payment (win) card', '.paycard');

      expect(report, report.join('\n')).toEqual([]);
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
}

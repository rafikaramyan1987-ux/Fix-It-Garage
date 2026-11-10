import { expect, test } from '@playwright/test';
import { open, overflow, richSave } from './helpers';

const SIZES = [
  { width: 390, height: 844, mobile: true },
  { width: 1920, height: 1080, mobile: false },
];

for (const lang of ['de', 'ru', 'fr', 'pl', 'tr', 'en', 'it', 'es', 'pt', 'nl']) {
  for (const size of SIZES) {
    test(`${lang} at ${size.width}x${size.height}: no text overflows`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: size.mobile, isMobile: size.mobile });
      const page = await ctx.newPage();
      const base = richSave({ career: 21, book: ['dead-battery', 'alternator', 'flat-tyre'], tutorialDone: false }) as ReturnType<typeof richSave> & { settings: object };
      const { d, errors } = await open(page, `&lang=${lang}`, { ...base, settings: { ...base.settings, difficulty: null } });
      const check = async (where: string) => {
        await d.tick(0.6);
        await page.evaluate(() => document.getAnimations().forEach((a) => { try { if (a.effect?.getTiming().iterations !== Infinity) a.finish(); } catch {} }));
        expect(await overflow(page), `${lang} ${where}`).toEqual([]);
      };
      // the first-start difficulty choice
      await d.until(() => !!document.querySelector('.diffpick'), 20);
      await check('difficulty choice');
      await d.click('[data-difficulty=relaxed]');
      await check('menu');
      for (const s of ['settings', 'garage', 'book', 'achievements', 'daily']) {
        await d.click(`[data-action=${s}]`);
        await check(s);
        await d.click('[data-action=close]');
      }
      await d.click('[data-action=play]');
      await d.until(() => !!document.querySelector('.toolbar'), 40);
      await check('job + toolbar + ticket');
      await d.click('[data-tool=hint]');
      await d.until(() => !!document.querySelector('.hintbar.is-guide'), 20);
      await check('guided hint');
      await d.click('[data-action=quick-book]');
      await check('repair book shortcut');
      await d.click('[data-action=book-back]');
      await d.click('[data-tool=hint]');
      await check('hint offer');
      await d.click('.dialog .btn.ghost');
      await d.click('[data-tool=drive]');
      await d.until(() => !!document.querySelector('.readout'), 40);
      await check('readout');
      await d.click('.readout button');
      await d.until(() => !!document.querySelector('.toolbar'), 40);
      await d.click('[data-tool=repair]');
      // Relaxed from job 11: every part in one list sorted by the clues, reasons under the top ones
      await d.click('[data-part=alternator]');
      await check('suspects list');
      await d.click('.sheet .btn.ghost');
      await d.until(() => !!document.querySelector('.toolbar'), 40);
      await check('hint banner over the toolbar');
      await d.click('[data-action=pause]');
      await check('pause');
      await d.click('[data-action=resume]');
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
}

/** every guided hint sentence and every repair-book line fits the phone's hint banner in every language */
for (const lang of ['de', 'ru', 'fr', 'pl', 'tr', 'en', 'it', 'es', 'pt', 'nl']) {
  test(`${lang} at 390x844: every guided hint fits the hint banner`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const { d } = await open(page, `&lang=${lang}&job=21`, richSave({ career: 21 }));
    await d.until(() => !!document.querySelector('.toolbar'), 40);
    const bad = await page.evaluate(() => {
      const play = window.__game!.play as unknown as { hintText(h: object): string; ui: { guide(t: string | null): void } };
      const faults = ['dead-battery', 'alternator', 'starter', 'spark-plugs', 'fuel-pump', 'air-filter', 'brake-pads', 'brake-disc', 'flat-tyre', 'tie-rod', 'exhaust-leak', 'oil-leak', 'coolant-leak', 'thermostat', 'catalyst', 'shock', 'low-oil', 'ev-charger'];
      const tools = ['tester', 'obd', 'listen', 'lift', 'drive', 'gauge', 'exhaust'];
      const parts = ['battery', 'alternator', 'starter', 'plugs', 'fuelpump', 'airfilter', 'pads', 'disc', 'tyre', 'tierod', 'muffler', 'gasket', 'hose', 'thermostat', 'catalyst', 'shock', 'oil', 'chargeport', 'paint'];
      const hints: object[] = [{ kind: 'test' }, ...parts.map((part) => ({ kind: 'repair', part, fault: 'scratch' }))];
      for (const fault of faults) for (const tool of tools) hints.push({ kind: 'tool', tool, fault });
      const out: string[] = [];
      for (const h of hints) {
        const text = play.hintText(h);
        play.ui.guide(text);
        const e = document.querySelector<HTMLElement>('.hintbar .ht')!;
        if (e.scrollHeight > e.clientHeight + 2 || e.getBoundingClientRect().right > window.innerWidth) out.push(text);
      }
      play.ui.guide(null);
      return out;
    });
    expect(bad).toEqual([]);
    await ctx.close();
  });
}

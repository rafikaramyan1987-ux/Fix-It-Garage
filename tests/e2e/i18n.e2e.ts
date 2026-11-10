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
      const { d, errors } = await open(page, `&lang=${lang}`, richSave({ career: 21, book: ['dead-battery', 'alternator', 'flat-tyre'], tutorialDone: false }));
      const check = async (where: string) => {
        await d.tick(0.6);
        await page.evaluate(() => document.getAnimations().forEach((a) => { try { if (a.effect?.getTiming().iterations !== Infinity) a.finish(); } catch {} }));
        expect(await overflow(page), `${lang} ${where}`).toEqual([]);
      };
      await check('menu');
      for (const s of ['settings', 'garage', 'book', 'achievements', 'daily']) {
        await d.click(`[data-action=${s}]`);
        await check(s);
        await d.click('[data-action=close]');
      }
      await d.click('[data-action=play]');
      await d.until(() => !!document.querySelector('.toolbar'), 40);
      await check('job + toolbar + ticket');
      await d.click('[data-tool=drive]');
      await d.until(() => !!document.querySelector('.readout'), 40);
      await check('readout');
      await d.click('.readout button');
      await d.until(() => !!document.querySelector('.toolbar'), 40);
      await d.click('[data-tool=repair]');
      await d.click('[data-part=alternator]');
      await check('parts sheet');
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

import { expect, test } from '@playwright/test';
import { audible, openPortal, playJob, silent } from './portal';

declare global {
  interface Window {
    __y8?: { calls: string[]; mode: 'viewed' | 'noAd' | 'dismissed'; hold: boolean; finish?: () => void };
  }
}

const Y8_SDK = 'https://cdn.y8.com/minimal-sdk/2-0/y8.min.js';
const hints = () => (window.__game!.play as unknown as { job: { hints: number } }).job.hints;

/**
 * stand-in for y8.min.js: fires `y8sdk.ready` on load (and again on emitReadyEvent); showAd() records the call (marked
 * BEFORE-INIT if init() had not run, IN-JOB for an interstitial while a job is on screen), then plays the documented
 * callbacks: beforeAd → (reward: adViewed / adDismissed) → afterAd → adBreakDone, or only adBreakDone (no ad)
 */
const STUB = `(() => {
  const g = (window.__y8 = window.__y8 || { calls: [], mode: 'viewed', hold: false });
  let inited = false;
  const sdk = {
    init(app, ad) { g.calls.push('init:' + app.appId + ':' + app.autoLogin + ':' + ad.gameId + ':' + ad.preloadAdBreaks + ':' + ad.sound); inited = true; setTimeout(() => ad.onReady && ad.onReady(), 0); },
    onAuth(cb) { setTimeout(() => cb(null, null), 0); },
    showAd(o) {
      const inJob = o.type !== 'reward' && !!document.querySelector('.toolbar');
      g.calls.push((inited ? '' : 'BEFORE-INIT:') + (inJob ? 'IN-JOB:' : '') + o.type);
      return new Promise((res) => {
        if (g.mode === 'noAd') { o.adBreakDone && o.adBreakDone({ breakStatus: 'noAdPreloaded' }); return res(); }
        const play = () => {
          o.beforeAd && o.beforeAd();
          g.finish = () => {
            if (o.type === 'reward') (g.mode === 'viewed' ? o.adViewed : o.adDismissed)();
            o.afterAd && o.afterAd();
            o.adBreakDone && o.adBreakDone({ breakStatus: g.mode });
            res();
          };
          if (!g.hold) setTimeout(g.finish, 300);
        };
        if (o.type === 'reward') o.beforeReward(play); else play();
      });
    },
  };
  const ready = () => window.dispatchEvent(new Event('y8sdk.ready'));
  window.y8 = { sdk: () => sdk, emitReadyEvent: ready };
  ready();
})();`;

test('Y8 build: y8.min.js from the CDN (async, once), initialized with App ID + Game ID, no ad before Play; start ad pauses + mutes, a job is played, Menu = next ad', async ({ page }) => {
  const { d, errors, requests } = await openPortal(page, Y8_SDK, STUB);
  expect(await page.locator(`head script[src="${Y8_SDK}"][async]`).count()).toBe(1);
  expect(requests.filter((u) => u === Y8_SDK)).toHaveLength(1);
  expect(requests.filter((u) => !u.startsWith('http://127.0.0.1') && !u.startsWith('data:') && u !== Y8_SDK)).toEqual([]);
  await d.tick(0.5);
  expect(await page.evaluate(() => window.__y8!.calls)).toEqual(['init:6af4b1977eafcdc5d5d7a543:true:292547:on:on']);

  await page.evaluate(() => (window.__y8!.hold = true));
  await d.click('[data-action=play]');
  await expect.poll(() => page.evaluate(() => window.__y8!.calls.slice(1))).toEqual(['start']);
  await expect.poll(() => silent(page)).toBe(true);
  await d.tick(0.5);
  expect(await page.evaluate(() => !!document.querySelector('.toolbar'))).toBe(false);
  await page.evaluate(() => window.__y8!.finish!());
  await expect.poll(() => audible(page)).toBe(true);
  await page.evaluate(() => (window.__y8!.hold = false));
  await playJob(page, d);
  await d.click('[data-action=menu]');
  await d.until(() => !!document.querySelector('[data-action=play]'), 30);
  // Play again: `start` only on the first Play
  await d.click('[data-action=play]');
  await d.until(() => !!document.querySelector('.toolbar'), 60);
  expect(await page.evaluate(() => window.__y8!.calls.slice(1))).toEqual(['start', 'next']);
  expect(errors).toEqual([]);
});

test('Y8 build: rewarded hint only after adViewed; no ad / dismissed → "No ad available right now, try later" and the job goes on; Next = next ad', async ({ page }) => {
  const { d, errors } = await openPortal(page, Y8_SDK, STUB);
  await d.click('[data-action=play]');
  await d.until(() => !!document.querySelector('.toolbar'), 60);
  await d.click('[data-tool=hint]'); // the first hint of a job is free
  await d.until(() => !!document.querySelector('.hintbar.is-guide'), 20);
  const free = await page.evaluate(hints);
  for (const mode of ['noAd', 'dismissed'] as const) {
    await page.evaluate((m) => (window.__y8!.mode = m), mode);
    await d.click('[data-tool=hint]');
    // the button says what the reward is before the ad
    await expect(page.locator('[data-action=hint-ad]')).toContainText('Watch an ad');
    await d.click('[data-action=hint-ad]');
    await d.until(() => !!document.querySelector('.toast'), 20);
    await expect(page.locator('.toast')).toContainText('No ad available right now, try later');
    await d.until(() => !document.querySelector('.toast') && !!document.querySelector('.toolbar'), 20);
    expect(await page.evaluate(hints)).toBe(free);
    expect(await audible(page)).toBe(true);
  }
  await page.evaluate(() => (window.__y8!.mode = 'viewed'));
  await d.click('[data-tool=hint]');
  await d.click('[data-action=hint-ad]');
  await d.until(new Function(`return window.__game.play.job.hints === ${free + 1}`) as () => boolean, 30);
  await playJob(page, d);
  await d.click('[data-action=next]');
  await d.until(() => !!document.querySelector('.toolbar'), 60);
  const calls = await page.evaluate(() => window.__y8!.calls.slice(1));
  expect(calls).toEqual(['start', 'reward', 'reward', 'reward', 'next']);
  expect(errors).toEqual([]);
});

test('Y8 build: a hidden page pauses + mutes the game, coming back resumes it', async ({ page }) => {
  const { d, errors } = await openPortal(page, Y8_SDK, STUB);
  await d.click('[data-action=play]');
  await d.until(() => !!document.querySelector('.toolbar'), 60);
  await expect.poll(() => audible(page)).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await silent(page)).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await audible(page)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await silent(page)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect(await audible(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('Y8 build: fully playable with the SDK blocked (ad blocker), no rewarded buttons', async ({ page }) => {
  const { d, errors } = await openPortal(page, Y8_SDK, null);
  await d.click('[data-action=play]');
  await d.until(() => !!document.querySelector('.toolbar'), 60);
  await d.click('[data-tool=hint]');
  await d.until(() => !!document.querySelector('.hintbar.is-guide'), 20);
  await d.click('[data-tool=hint]');
  await expect(page.locator('[data-action=hint-ad]')).toHaveCount(0);
  await d.click('.dialog .btn.ghost');
  await playJob(page, d);
  await expect(page.locator('[data-action=double]')).toHaveCount(0);
  await d.click('[data-action=next]');
  await d.until(() => !!document.querySelector('.toolbar'), 60);
  expect(errors).toEqual([]);
});

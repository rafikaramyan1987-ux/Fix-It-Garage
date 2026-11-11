import { expect, test } from '@playwright/test';
import { audible, openPortal, playJob, silent } from './portal';

declare global {
  interface Window {
    __gm?: { calls: { inJob: boolean }[]; hold: boolean; finish?: () => void };
  }
}

const GM_SDK = 'https://api.gamemonetize.com/sdk.js';
const GAME_ID = '13mqh7opto5pk2mgoctppra0kqiz1mue';

/**
 * stand-in for GameMonetize's sdk.js: SDK_READY once loaded; showBanner() records whether a job was on screen, sends
 * SDK_GAME_PAUSE, then SDK_GAME_START (after 300 ms, or when the test calls finish() with `hold`)
 */
const STUB = `(() => {
  const ev = (name) => window.SDK_OPTIONS && window.SDK_OPTIONS.onEvent({ name });
  const g = (window.__gm = window.__gm || { calls: [], hold: false });
  window.sdk = {
    showBanner() {
      g.calls.push({ inJob: !!document.querySelector('.toolbar') });
      ev('SDK_GAME_PAUSE');
      g.finish = () => ev('SDK_GAME_START');
      if (!g.hold) setTimeout(g.finish, 300);
    },
  };
  ev('SDK_READY');
})();`;

test('GameMonetize build: SDK_OPTIONS + sdk.js once at boot, no ad before Play, Play shows one interstitial (paused + muted), then a job is played', async ({ page }) => {
  const { d, errors, requests } = await openPortal(page, GM_SDK, STUB);
  expect(await page.evaluate(() => window.SDK_OPTIONS?.gameId)).toBe(GAME_ID);
  expect(await page.locator('script#gamemonetize-sdk').count()).toBe(1);
  expect(requests.filter((u) => u === GM_SDK)).toHaveLength(1);
  expect(requests.filter((u) => !u.startsWith('http://127.0.0.1') && !u.startsWith('data:') && u !== GM_SDK)).toEqual([]);
  await d.tick(0.5);
  expect(await page.evaluate(() => window.__gm!.calls.length)).toBe(0);

  await page.evaluate(() => (window.__gm!.hold = true));
  await d.click('[data-action=play]');
  await expect.poll(() => page.evaluate(() => window.__gm!.calls.length)).toBe(1);
  // the game waits under the ad, silent
  await expect.poll(() => silent(page)).toBe(true);
  await d.tick(0.5);
  expect(await page.evaluate(() => !!document.querySelector('.toolbar'))).toBe(false);
  await page.evaluate(() => window.__gm!.finish!());
  // SDK_GAME_START: back to the player's own sound settings, the job opens
  await expect.poll(() => audible(page)).toBe(true);
  await page.evaluate(() => (window.__gm!.hold = false));
  await playJob(page, d);
  // no rewarded ads in this build: no "watch an ad" button on the payment screen
  await expect(page.locator('[data-action=double]')).toHaveCount(0);
  await d.click('[data-action=next]');
  await d.until(() => !!document.querySelector('.toolbar'), 60);
  // every interstitial came from a click outside a job, at most the pre-roll + one more
  const calls = await page.evaluate(() => window.__gm!.calls);
  expect(calls.length).toBeLessThanOrEqual(2);
  expect(calls.every((c) => !c.inJob)).toBe(true);
  expect(errors).toEqual([]);
});

test('GameMonetize build: no "watch an ad" button anywhere (hint offer, parts)', async ({ page }) => {
  const { d, errors } = await openPortal(page, GM_SDK, STUB);
  await d.click('[data-action=play]');
  await d.until(() => !!document.querySelector('.toolbar'), 60);
  await d.click('[data-tool=hint]');
  await d.until(() => !!document.querySelector('.hintbar.is-guide'), 20);
  await d.click('[data-tool=hint]');
  await expect(page.locator('.dialog.hint-offer')).toBeVisible();
  await expect(page.locator('[data-action=hint-ad], .btn.ad')).toHaveCount(0);
  await d.click('.dialog .btn.ghost');
  await d.click('[data-tool=repair]');
  await d.click('[data-action=all-parts]');
  await d.click('[data-part=battery]');
  await expect(page.locator('[data-action=free-part]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('GameMonetize build: fully playable when sdk.js fails to load (ad blocker)', async ({ page }) => {
  const { d, errors } = await openPortal(page, GM_SDK, null);
  await d.click('[data-action=play]');
  await playJob(page, d);
  await d.click('[data-action=next]');
  await d.until(() => !!document.querySelector('.toolbar'), 60);
  expect(errors).toEqual([]);
});

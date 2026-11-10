import { expect, test } from '@playwright/test';
import { FAULT_PART, jobFaults, open, richSave } from './helpers';

test.beforeEach(async ({ page }) => {
  // no network in tests: the GamePix SDK is unavailable, the game must play on
  await page.route('**/gamepix.sdk.js', (r) => r.abort());
});

test('gamepix build: rewarded buttons are offered (hint, free part, double payment) and never block play', async ({ page }) => {
  const { d, errors } = await open(page, '', richSave());
  await d.startShift();
  await d.until(() => !!document.querySelector('.toolbar'), 40);
  await expect(page.locator('[data-tool=hint]')).toContainText('Watch an ad');
  // the first rewarded ad of the session shows one short notice; without an ad the player gets a friendly toast
  await d.click('[data-tool=hint]');
  await expect(page.locator('.dialog')).toContainText('Optional: watch a short ad');
  await d.click('[data-action=watch]');
  await d.until(() => !!document.querySelector('.toast'), 20);
  await expect(page.locator('.toast')).toContainText('No ad available right now, try later');
  await d.until(() => !!document.querySelector('.toolbar'), 40);
  await d.click('[data-tool=repair]');
  await d.click('[data-part=battery]');
  await expect(page.locator('[data-action=free-part]')).toContainText('Watch an ad');
  await d.click('.sheet .btn.ghost');
  for (const f of await jobFaults(page)) {
    await d.order(FAULT_PART[f]);
    await d.repair({ beat: 0.05 });
    await d.until(() => !!document.querySelector('.toolbar'), 40);
  }
  expect(await d.test()).toBe(true);
  await d.tick(1.5);
  await expect(page.locator('[data-action=double]')).toContainText('Watch an ad: double payment');
  expect(errors).toEqual([]);
});

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
  // the first hint of a job is free; the next one costs coins or a rewarded ad (TV icon, clearly labelled)
  await expect(page.locator('[data-tool=hint]')).toContainText('Free');
  await d.click('[data-tool=hint]');
  await d.until(() => !!document.querySelector('.hintbar.is-guide'), 20);
  await d.click('[data-tool=hint]');
  await expect(page.locator('[data-action=hint-ad]')).toContainText('Watch an ad');
  await expect(page.locator('[data-action=hint-ad] svg')).toHaveCount(1);
  // without an ad the player gets a friendly toast
  await d.click('[data-action=hint-ad]');
  await d.until(() => !!document.querySelector('.toast'), 20);
  await expect(page.locator('.toast')).toContainText('No ad available right now, try later');
  await d.until(() => !!document.querySelector('.toolbar'), 40);
  await d.click('[data-tool=repair]');
  await d.click('[data-action=all-parts]');
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

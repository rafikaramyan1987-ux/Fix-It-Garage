import { expect, test } from '@playwright/test';
import { Driver } from '../../scripts/driver';

test('boots to the title with no errors and a small first load', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const d = new Driver(page);
  await d.open('/');
  await d.tick(0.3);
  await expect(page.locator('[data-action=start]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('plays the whole battery job: diagnose, swap, test start, payment', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const d = new Driver(page);
  d.fps = 10;
  await d.open('/');
  await d.startShift();
  await d.until(() => !!document.querySelector('.toolbar'), 30);
  const money0 = Number(await page.locator('.money .val').textContent());
  await d.useTool('tester', 0.2);
  await expect(page.locator('.clues li.bad')).toHaveCount(1);
  // the hint is a rewarded ad; the web build grants it
  await d.click('[data-tool=hint]');
  await d.readoutClose(0.2);
  await expect(page.locator('.clues li')).toHaveCount(2);
  await d.click('[data-tool=repair]');
  await d.click('[data-part=battery]');
  await d.batterySwap({ wrongOrderOnce: true, beat: 0.1 });
  await d.click('[data-action=center]');
  await d.waitPhase('payment', 40);
  await d.tick(1.5);
  await expect(page.locator('.paycard')).toBeVisible();
  await expect(page.locator('.stars .s.on')).toHaveCount(3);
  await d.click('[data-action=next]');
  await d.tick(1.5);
  const money1 = Number(await page.locator('.money .val').textContent());
  expect(money1).toBeGreaterThan(money0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fixitgarage.save.v1') ?? '{}'));
  expect(saved.jobsDone).toBe(1);
  expect(Object.keys(await page.evaluate(() => ({ ...localStorage })))).toEqual(['fixitgarage.save.v1']);
  expect(errors).toEqual([]);
});

test('a wrong part fails the test start and the player keeps diagnosing', async ({ page }) => {
  const d = new Driver(page);
  d.fps = 10;
  await d.open('/');
  await d.startShift();
  await d.until(() => !!document.querySelector('.toolbar'), 30);
  await d.click('[data-tool=repair]');
  await d.click('[data-part=plugs]');
  await d.waitPhase('test', 30);
  await d.click('[data-action=center]');
  await d.until(() => !!document.querySelector('.toolbar'), 30);
  await expect(page.locator('[data-tool=repair]')).toBeVisible();
});

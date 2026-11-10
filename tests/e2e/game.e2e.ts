import { expect, test } from '@playwright/test';
import { FAULT_PART, jobFaults, open, richSave, saved } from './helpers';

test('a returning player boots to the main menu; no errors, no ads anywhere in the web build', async ({ page }) => {
  const { d, errors } = await open(page, '', richSave());
  await d.tick(0.3);
  for (const a of ['play', 'garage', 'book', 'daily', 'settings', 'achievements']) await expect(page.locator(`[data-action=${a}]`)).toBeVisible();
  await d.click('[data-action=play]');
  await d.until(() => !!document.querySelector('.toolbar'), 40);
  await expect(page.locator('[data-tool=hint]')).toHaveCount(0);
  await expect(page.locator('.btn.ad, .act.hint')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a new player lands straight in the first job; tutorial: battery tester, battery swap, test drive, payment', async ({ page }) => {
  const { d, errors } = await open(page);
  await d.until(() => !!document.querySelector('.toolbar'), 15);
  await expect(page.locator('[data-action=play]')).toHaveCount(0);
  await expect(page.locator('.tut')).toBeVisible();
  await expect(page.locator('.hand:not(.hidden)')).toBeVisible();
  await expect(page.locator('[data-tool=tester].tut-glow')).toBeVisible();
  await expect(page.locator('.ticket .reward')).toContainText('$');
  await d.useTool('tester', 0.2);
  await expect(page.locator('.clues li.bad')).toHaveCount(1);
  await d.order('battery');
  await d.repair({ wrongOrderOnce: true, beat: 0.1 });
  await d.until(() => !!document.querySelector('[data-tool=test]'), 40);
  expect(await d.test()).toBe(true);
  await d.tick(1.5);
  await expect(page.locator('.paycard')).toBeVisible();
  await expect(page.locator('.stars .s.on')).toHaveCount(3);
  await expect(page.locator('[data-action=double]')).toHaveCount(0);
  await d.click('[data-action=next]');
  await d.until(() => window.__game!.play.phase === 'diagnose', 60);
  const s = await saved(page);
  expect(s.career).toBe(2);
  expect(s.tutorialDone).toBe(true);
  expect(s.book).toContain('dead-battery');
  expect(s.ach).toContain('first_fix');
  expect(Object.keys(await page.evaluate(() => ({ ...localStorage })))).toEqual(['fixitgarage.save.v1']);
  expect(errors).toEqual([]);
});

test('a wrong part is fitted and wasted; the test drive says what is still wrong', async ({ page }) => {
  const { d } = await open(page, '', richSave({ career: 3 }));
  await d.startShift();
  await d.until(() => !!document.querySelector('.toolbar'), 40);
  await d.order('battery');
  await d.repair({ beat: 0.1 });
  await d.until(() => !!document.querySelector('[data-tool=test]'), 40);
  expect(await d.test()).toBe(false);
  await expect(page.locator('[data-tool=repair]')).toBeVisible();
});

for (const n of [2, 4, 7, 12, 18, 23, 26]) {
  test(`career job ${n} can be repaired end to end`, async ({ page }) => {
    const { d, errors } = await open(page, `&job=${n}`, richSave({ career: n }));
    await d.until(() => !!document.querySelector('.toolbar'), 40);
    for (const f of await jobFaults(page)) {
      await d.order(FAULT_PART[f]);
      await d.repair({ beat: 0.05 });
      await d.until(() => !!document.querySelector('.toolbar'), 40);
    }
    expect(await d.test()).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('pause: resume, settings, and back to the main menu', async ({ page }) => {
  const { d } = await open(page, '', richSave());
  await d.startShift();
  await d.until(() => !!document.querySelector('.toolbar'), 40);
  await d.click('[data-action=pause]');
  await expect(page.locator('.screen.pause')).toBeVisible();
  await d.click('[data-action=resume]');
  await expect(page.locator('.screen.pause')).toHaveCount(0);
  await d.click('[data-action=pause]');
  await d.click('[data-action=menu]');
  await d.click('[data-action=confirm]');
  await d.tick(0.5);
  await expect(page.locator('[data-action=play]')).toBeVisible();
  await expect(page.locator('.ticket')).toHaveCount(0);
});

test('settings: language, music, sound and reset are saved', async ({ page }) => {
  const { d } = await open(page, '', richSave());
  await d.tick(0.3);
  await d.click('[data-action=settings]');
  await d.click('[data-lang=fr]');
  await expect(page.locator('.phead h2')).toHaveText('Réglages');
  await d.click('[data-action=music]');
  await d.click('[data-action=sfx]');
  let s = await saved(page);
  expect(s.settings).toEqual({ music: false, sfx: false, lang: 'fr' });
  await d.click('[data-action=reset]');
  await d.click('[data-action=confirm]');
  s = await saved(page);
  expect(s.money).toBe(150);
  expect(s.settings.lang).toBe('fr');
  await d.click('[data-action=close]');
  await expect(page.locator('[data-action=play]')).toContainText('Jouer');
  // after a reset the player is new again: a reload goes straight to the first job, still in French
  await page.reload();
  await page.waitForFunction(() => window.__ready === true);
  await d.until(() => !!document.querySelector('.toolbar'), 30);
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('fr');
  await expect(page.locator('[data-tool=repair]')).toContainText('Réparer');
});

test('garage: buying the tyre gauge unlocks the tool and shows it in the garage', async ({ page }) => {
  const { d } = await open(page, '', richSave());
  await d.tick(0.3);
  await d.click('[data-action=garage]');
  await d.click('[data-upgrade=gauge]');
  await expect(page.locator('[data-upgrade=gauge]')).toBeDisabled();
  await d.click('[data-action=close]');
  const s = await saved(page);
  expect(s.upgrades).toEqual(['gauge']);
  expect(s.money).toBe(4850);
  await d.click('[data-action=play]');
  await d.until(() => !!document.querySelector('.toolbar'), 40);
  await expect(page.locator('[data-tool=gauge]')).not.toHaveClass(/locked/);
  await expect(page.locator('[data-tool=exhaust]')).toHaveClass(/locked/);
});

test('daily job: plays once per day at double pay', async ({ page }) => {
  const { d } = await open(page, '', richSave({ career: 10 }));
  await d.tick(0.3);
  await d.click('[data-action=daily]');
  await d.click('[data-action=daily-start]');
  await d.until(() => !!document.querySelector('.toolbar'), 40);
  await expect(page.locator('.ticket .car')).toContainText('Daily job');
  for (const f of await jobFaults(page)) {
    await d.order(FAULT_PART[f]);
    await d.repair({ beat: 0.05 });
    await d.until(() => !!document.querySelector('.toolbar'), 40);
  }
  expect(await d.test()).toBe(true);
  await d.tick(1);
  await d.click('[data-action=menu]');
  await d.tick(1);
  const s = await saved(page);
  expect(s.daily.done).toBe(true);
  expect(s.career).toBe(10);
  await d.click('[data-action=daily]');
  await expect(page.locator('.screen.daily .done')).toBeVisible();
});

test('keyboard (optional): number keys pick tools, Space acts, Enter confirms, R repairs, P pauses, Escape does nothing', async ({ page }) => {
  const { d } = await open(page, '', richSave());
  await d.tick(0.3);
  await page.keyboard.press('Enter');
  await d.until(() => !!document.querySelector('.toolbar'), 40);
  await page.keyboard.press('Digit1');
  for (let i = 0; i < 2; i++) {
    await d.until(() => !!window.__game!.play.expected, 30);
    await d.tick(0.3);
    await page.keyboard.press('Space');
  }
  await d.until(() => !!document.querySelector('.readout'), 30);
  await d.tick(0.4);
  await page.keyboard.press('Enter');
  await d.until(() => !!document.querySelector('.toolbar'), 30);
  await expect(page.locator('.clues li')).toHaveCount(1);
  await page.keyboard.press('KeyP');
  await expect(page.locator('.screen.pause')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.screen.pause')).toBeVisible();
  await page.keyboard.press('KeyP');
  await expect(page.locator('.screen.pause')).toHaveCount(0);
  await page.keyboard.press('KeyR');
  await expect(page.locator('.parts-sheet')).toBeVisible();
});

test('impact wrench: one hold turns all the wheel nuts at once', async ({ page }) => {
  const { d } = await open(page, '&job=3', richSave({ career: 3, upgrades: ['wrench'] }));
  await d.until(() => !!document.querySelector('.toolbar'), 40);
  await d.order('tyre');
  const ids: string[] = [];
  d.onStep = async (id) => void ids.push(id);
  await d.repair({ beat: 0.05 });
  expect(ids.filter((i) => i.startsWith('nut'))).toEqual([]);
  expect(ids.filter((i) => i === 'all').length).toBe(2);
});

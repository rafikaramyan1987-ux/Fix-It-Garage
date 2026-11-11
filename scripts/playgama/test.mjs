// Local test of the Playgama zip with the real Playgama Bridge 2.4.1 inside it, in two modes:
//  1. Bridge's mock platform (what Bridge runs outside Playgama, e.g. on localhost): the game boots, sends game_ready,
//     plays job 1, saves through Bridge Storage, shows no rewarded buttons (mock has no rewarded ads) and the
//     between-levels slot shows no interstitial (the next job opens); no request leaves the local server.
//  2. Bridge's `playgama` platform (`?platform_id=playgama`) against a stub of the Playgama platform SDK that Bridge
//     loads (https://playgama.com/platform-sdk/v1.js is answered locally by Playwright, nothing goes out): the
//     language comes from the platform, a rewarded ad that is cancelled gives nothing (and says so), one watched to
//     the end gives the reward, the interstitial between levels shows, and the game is muted (its synthesized
//     WebAudio goes silent through audio.ts setMuted) and its clock paused while each ad is open, audible again after.
// The game runs with `?capture` (its clock moves only when the test ticks it; software WebGL is slow); ads run in
// real time from Bridge's events.
// Usage: node scripts/playgama/test.mjs [zip] [--only mock|playgama]
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import game from './game.mjs';
import { serve } from '../web/serve.mjs';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const zip = resolve(args[0] && !args[0].startsWith('--') ? args[0] : `submission-playgama/${game.slug}-playgama-v1.zip`);
const dir = mkdtempSync(join(tmpdir(), 'playgama-test-'));
execFileSync('unzip', ['-q', zip, '-d', dir]);
const server = await serve(dir);
const errors = [];
const fail = (m) => {
  errors.push(m);
  console.log(`  ✗ ${m}`);
};
const ok = (m) => console.log(`  ✓ ${m}`);
const expect = (cond, msg, detail = '') => (cond ? ok(msg) : fail(`${msg}${detail ? ` (${detail})` : ''}`));

/** the Playgama platform SDK as Bridge's playgama adapter uses it; ads open for 3 s, the rewarded outcome is set by the test */
const STUB = `(() => {
  let f = () => {};
  const log = (window.__stubLog = []);
  // the game's audio state 300 ms into each ad, sampled in the page (independent of how busy the test machine is)
  window.__adSamples = {};
  const cb = (type, state) => {
    f(type, state);
    if (state === 'open')
      setTimeout(() => (window.__adSamples[type] = { muted: window.__playgama.muted, paused: window.__playgama.paused, ctx: (window.__ctxs || []).map((c) => c.state) }), 300);
  };
  window.__rewardedOutcome = 'complete';
  window.PLAYGAMA_SDK = {
    platformService: {
      getLanguage: () => 'de',
      isReady: Promise.resolve(),
      getIsPaymentsSupported: () => false,
      getIsPlayerAuthorizationSupported: () => false,
      getIsCloudSaveSupported: () => false,
      getAdditionalParams: () => ({}),
    },
    advService: {
      configureAdFrequency: async () => true,
      subscribeToAdStateChanges: (g) => (f = g),
      showInterstitial() {
        log.push('showInterstitial');
        setTimeout(() => cb('interstitial', 'open'), 50);
        setTimeout(() => cb('interstitial', 'close'), 3000);
      },
      showRewarded() {
        const outcome = window.__rewardedOutcome;
        log.push('showRewarded:' + outcome);
        setTimeout(() => cb('rewarded', 'open'), 50);
        if (outcome === 'complete') setTimeout(() => cb('rewarded', 'rewarded'), 2900);
        setTimeout(() => cb('rewarded', 'close'), 3000);
      },
      showAdvancedBanners: async () => {},
      hideAdvancedBanners() {},
      checkAdBlock: async () => false,
    },
    gameService: { gameReady: () => log.push('gameReady'), sendMessage: (m) => log.push('sendMessage:' + m) },
    cloudSaveApi: { getState: async () => ({}), setItems: async () => {} },
  };
})();`;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

async function open(query, { stub = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const external = [];
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => {
    const u = route.request().url();
    if (stub && u === 'https://playgama.com/platform-sdk/v1.js') return route.fulfill({ contentType: 'text/javascript', body: STUB });
    external.push(u);
    return route.abort();
  });
  // every AudioContext the game makes, to see it suspended during ads
  await page.addInitScript(() => {
    const AC = window.AudioContext;
    window.__ctxs = [];
    window.AudioContext = class extends AC {
      constructor(...a) {
        super(...a);
        window.__ctxs.push(this);
      }
    };
  });
  await page.goto(`${server.origin}/?w=960&h=600&q=${encodeURIComponent('?' + query)}`);
  const frame = await (await page.waitForSelector('#f')).contentFrame();
  return { ctx, page, frame, external, pageErrors };
}

/** what the game and Bridge were doing when a step failed */
const debug = (frame) =>
  frame
    .evaluate(() => JSON.stringify({ log: window.__playgama?.log, stub: window.__stubLog, phase: window.__game?.play.phase, job: window.__game?.play.job?.def.n, interstitial: window.bridge?.advertisement.interstitialState }))
    .catch((e) => `debug failed: ${e.message}`);

/** the game's silence for the platform (`muted` → audio.ts setMuted) and its paused clock (`onAdPause`) */
const state = (frame) => frame.evaluate(() => ({ muted: window.__playgama.muted, paused: window.__playgama.paused }));
const waitLog = (frame, entry) => frame.waitForFunction((e) => window.__playgama.log.includes(e), entry, { timeout: 15_000 });

// ---------------------------------------------------------------- 1. Bridge mock platform
if (only !== 'playgama') {
  console.log('Bridge mock platform (no platform_id, localhost)');
  const s = await open(game.query);
  const { frame, page } = s;
  try {
    await game.ready(frame, page);
    const info = await frame.evaluate(() => ({ id: window.bridge.platform.id, lang: document.documentElement.lang, platform: window.__playgama.name }));
    expect(info.id === 'mock' && info.platform === 'playgama', 'Bridge initialized (mock platform) before the game', JSON.stringify(info));
    await frame.waitForFunction(() => window.__playgama.log.includes('game_ready'), null, { timeout: 10_000 }).catch(() => {});
    const log0 = await frame.evaluate(() => window.__playgama.log.slice());
    expect(log0.includes('game_ready'), 'game_ready sent after the loading screen', log0.join(','));
    expect(info.lang === 'en', 'language from Bridge platform.language (browser language in mock) → English', info.lang);
    const res = await game.play(frame, page, { w: 960, h: 600 });
    expect(res?.won !== false, `first level played to its result screen (${res?.note ?? res?.why})`);
    const log1 = await frame.evaluate(() => window.__playgama.log.slice());
    expect(log1.includes('level_started') && log1.includes('level_completed'), 'level_started / level_completed sent', log1.join(','));
    expect((await frame.locator(game.rewardSelector).count()) === 0, 'no rewarded buttons (mock: isRewardedSupported = false)');
    const saved = await frame.evaluate(async () => {
      const [v] = await window.bridge.storage.get(['fixitgarage.save.v1']);
      return { v: typeof v === 'string' ? v.slice(0, 40) : v };
    });
    expect(saved.v, 'progress saved through Bridge Storage (storage.get returns the save)', JSON.stringify(saved));
    await frame.evaluate(() => (window.__playgama.lastMidgame = 0));
    await game.next(frame, page);
    await game.nextLevelOpened(frame, page);
    const log2 = await frame.evaluate(() => window.__playgama.log.slice());
    const sup = await frame.evaluate(() => window.bridge.advertisement.isInterstitialSupported);
    expect(!log2.some((x) => x.startsWith('interstitial:opened')), `between-levels slot: no interstitial (mock isInterstitialSupported = ${sup}), the next level opened`, log2.join(','));
    expect((await frame.locator(game.rewardSelector).count()) === 0, 'no rewarded hint button in the next job (mock)');
    expect(!s.external.length, 'no external requests (mock)', s.external.join(', '));
    expect(!s.pageErrors.length, 'no page errors (mock)', s.pageErrors.join(' | '));
  } catch (e) {
    fail(`mock: ${e.message.split('\n')[0]}`);
    console.log(await debug(frame));
  }
  await s.ctx.close();
}

// ---------------------------------------------------------------- 2. Bridge playgama platform + stubbed platform SDK
if (only !== 'mock') {
  console.log('Bridge playgama platform (?platform_id=playgama, stubbed Playgama SDK)');
  const s = await open(`platform_id=playgama&${game.query}`, { stub: true });
  const { frame, page } = s;
  const d = game.driver(frame, page);
  try {
    await game.ready(frame, page);
    const info = await frame.evaluate(() => ({ id: window.bridge.platform.id, lang: document.documentElement.lang, rewarded: window.bridge.advertisement.isRewardedSupported }));
    expect(info.id === 'playgama', 'Bridge runs its playgama adapter', info.id);
    expect(info.lang === 'de', 'the game starts in the platform language (de) from Bridge', info.lang);
    await frame.waitForFunction(() => window.__stubLog?.includes('gameReady'), null, { timeout: 10_000 }).catch(() => {});
    expect(await frame.evaluate(() => window.__stubLog.includes('gameReady')), 'game_ready reached the platform');
    await game.play(frame, page, { w: 960, h: 600 });
    const btn = frame.locator('[data-action=double]');
    expect((await btn.count()) === 1 && /\S/.test(await btn.innerText()), 'labelled rewarded button on the payment screen', await btn.innerText().catch(() => ''));
    const total = Number((await frame.locator('.paycard .tot span').last().innerText()).replace(/\D/g, ''));

    // cancelled: no reward (paid once, not twice), "Gerade keine Werbung da" for 2.5 s, the game goes on
    const v0 = await game.money(frame);
    await frame.evaluate(() => (window.__rewardedOutcome = 'cancel'));
    await frame.evaluate(() => (window.__playgama.lastMidgame = 0)); // the 2-minute gap is skipped for the test
    await d.click('[data-action=double]');
    await d.click('[data-action=watch]'); // the game's one-line notice before the first rewarded ad
    await waitLog(frame, 'rewarded:closed');
    const during1 = await frame.evaluate(() => window.__adSamples.rewarded);
    await d.tick(0.2);
    const toast = await frame.locator('.toast').allInnerTexts();
    await d.tick(1.6);
    const v1 = await game.money(frame);
    expect(v1 === v0 + total, 'cancelled rewarded ad: no reward (payment not doubled)', `${v0} + ${total} → ${v1}`);
    expect(during1?.muted && during1.paused, 'muted + game paused while the rewarded ad is open', JSON.stringify(during1));
    expect(toast.some((x) => /werbung/i.test(x)), 'the game says no ad is available right now (2.5 s)', toast.join(' | '));

    // between levels: the interstitial
    await d.tick(1.5);
    await waitLog(frame, 'interstitial:closed');
    const during2 = await frame.evaluate(() => window.__adSamples.interstitial);
    expect(during2?.muted && during2.paused, 'muted + game paused while the interstitial is open', JSON.stringify(during2));
    await game.nextLevelOpened(frame, page);
    const log3 = await frame.evaluate(() => window.__playgama.log.slice());
    expect(log3.includes('interstitial:closed'), 'interstitial between levels shown and closed, next level opened', log3.join(','));

    // watched to the end: the part for free
    await d.click('[data-tool=repair]');
    await d.tick(0.3);
    // Relaxed mode, no clue yet: every part is one tap away behind "Show all parts"
    if (await d.has('.tab[data-cat=bay]')) await d.click('.tab[data-cat=bay]');
    else await d.click('[data-action=all-parts]');
    await d.click('[data-part=battery]');
    await d.tick(0.2);
    const free = frame.locator('[data-action=free-part]');
    expect((await free.count()) === 1 && /\S/.test(await free.innerText()), 'labelled rewarded button in the parts sheet', await free.innerText().catch(() => ''));
    await frame.evaluate(() => (window.__rewardedOutcome = 'complete'));
    await frame.evaluate(() => (window.__playgama.log.length = 0));
    const m0 = await game.money(frame);
    await d.click('[data-action=free-part]');
    await waitLog(frame, 'rewarded:closed');
    await d.tick(0.5);
    const m1 = await game.money(frame);
    const log = await frame.evaluate(() => window.__playgama.log.slice());
    const phase = await frame.evaluate(() => window.__game.play.phase);
    expect(m1 === m0 && phase.startsWith('fit:') && log.includes('rewarded:rewarded'), 'completed rewarded ad: the part is fitted for free after the `rewarded` state', `$${m0} → $${m1}, ${phase}; ${log.join(',')}`);
    const after = await state(frame);
    expect(!after.muted && !after.paused, 'audio back and game running after the ad (player sound settings on)', JSON.stringify(after));
    const stub = await frame.evaluate(() => window.__stubLog.slice());
    expect(stub.filter((x) => x === 'showInterstitial').length === 1, 'exactly one interstitial request', stub.join(','));
    expect(!s.external.length, 'no other external requests', s.external.join(', '));
    expect(!s.pageErrors.length, 'no page errors', s.pageErrors.join(' | '));
  } catch (e) {
    fail(`playgama: ${e.message.split('\n')[0]}`);
    console.log(await debug(frame));
  }
  await s.ctx.close();
}

await browser.close();
server.close();
console.log(errors.length ? `\nFAILED: ${errors.length} problem(s)` : '\nall Playgama tests passed');
process.exit(errors.length ? 1 : 0);

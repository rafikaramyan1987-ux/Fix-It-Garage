// Game-specific settings for the Playgama zip (scripts/playgama/zip.mjs) and its tests (scripts/playgama/test.mjs).
import web, { FrameDriver } from '../web/game.mjs';

export default {
  slug: web.slug,
  title: 'Fix It Garage',
  dist: 'dist-playgama',
  exclude: web.exclude,
  /** the game's query for the tests: `capture` (the test steps the game clock, as in scripts/web/check.mjs) */
  query: 'capture',
  ready: web.ready,
  /** job 1 (tutorial) played through real input to its payment screen */
  play: web.play,
  /** the clearly labelled rewarded buttons: "Watch an ad: double payment" (payment screen), "Watch an ad: get this part free" (parts sheet) */
  rewardSelector: '[data-action=double], [data-action=free-part], [data-action=hint-ad]',
  driver: (frame, page) => new FrameDriver(frame, page),
  money: (frame) => frame.evaluate(() => window.__game.play.save.money),
  /** the payment screen's "Next customer": the between-levels interstitial slot, then the next job opens */
  async next(frame, page) {
    await new FrameDriver(frame, page).click('[data-action=next]');
  },
  async nextLevelOpened(frame, page) {
    const d = new FrameDriver(frame, page);
    await d.until(() => window.__game.play.job?.def.n === 2 && !!document.querySelector('.toolbar'), 60);
  },
};

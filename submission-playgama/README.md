# Fix It Garage — Playgama

## Description

Customers bring broken cars to your cozy garage. Read the ticket, use the battery tester, OBD scanner, test drive and lift to collect clues, then deduce the faulty part. Unscrew wheel nuts in a star pattern, swap batteries, brakes and exhausts, top up oil and paint scratches. 40 jobs, 7 car types, 18 faults, garage upgrades, a daily job, a repair book and achievements. Plays in 10 languages.

## Controls

- **Mouse / touch:** tap a tool to find clues, tap Repair and order the part, then follow the arrow: tap, hold to turn
  bolts, drag parts out and in. Tap Test to start the car.
- **Keyboard (optional):** number keys pick tools, R repairs, T tests, Space acts, Enter confirms, P pauses. No Esc
  key is used.

## Tags

simulation, car, mechanic, repair, garage, puzzle, casual, 3d, family, mobile

## Files

| File | What |
|---|---|
| `fix-it-garage-playgama-v3.zip` (v1.1.0 of the game: Relaxed / Expert diagnosis) | **upload this one.** The Playgama build: `index.html` at the zip root, `playgama-bridge-config.json` beside it, `assets/`; Playgama Bridge from Playgama's CDN, initialized before the game bundle runs; otherwise relative paths only |
| `fix-it-garage-playgama-v2.zip` | the same game (1.1.0) with the old Bridge setup, kept for reference: **do not upload** (see below: Playgama's archive check reports "Playgama Bridge never initialized in this archive") |
| `fix-it-garage-playgama-v1.zip` | the previous version (1.0), old Bridge setup too, kept for reference: **do not upload** |
| `cover-800x800.png`, `cover-1080x1920.png`, `cover-1920x1080.png` | the three covers Playgama's form takes (square, portrait, landscape), made with Playgama's own covers script from 1920x1080 / 1080x1920 screenshots of real play and the game's title font (Fredoka) |
| `icon-512x512.png` | icon (same as submission-web/) |

## Playgama Bridge

- **Include:** `<script src="https://bridge.playgama.com/v2/stable/playgama-bridge.js"></script>`, the first script
  in `<head>`, loaded normally: the CDN option Playgama's setup page recommends (wiki.playgama.com/playgama/bridge-sdk/setup;
  `v2/stable` served Bridge 2.4.1 when v3 was built). It loads the adapter of the platform the game runs on, including
  the QA Tool's `qa_tool` adapter that Playgama's archive check uses. Requirement 1.2.5 allows the Bridge, and only it,
  from Playgama's CDN.
- **Why v1 and v2 fail the archive check:** they ship a custom single-platform build (`build-dist.ts --type=standalone
  --platform=playgama`), which bundles only the `playgama`, `standalone` and `playgama_sandbox` adapters. Playgama's
  archive check and QA Tool run the game with `?platform_id=qa_tool`; that build has no `qa_tool` adapter, so Bridge
  falls back to its generic base platform (`platform.id` "mock") and never sends the QA Tool its `initialize`
  handshake. The game's own 10 s `Promise.race` and silent catch hid this.
- **Initialization:** index.html's inline boot (scripts/playgama/boot.js) calls `bridge.initialize()` right after the
  Bridge script; the game bundle is held (`<script type="text/plain" data-playgama-game data-src="./assets/…">`) and
  starts only once initialize() has settled, so nothing of the game runs or loads before it (Playgama's required step
  2). There is no timeout of the game's own (a console.warn after 15 s if it is still pending). If initialize() fails,
  or the Bridge script does not load, `console.error("[Playgama Bridge] bridge.initialize() failed; the game runs
  WITHOUT Playgama Bridge …")` and the game plays on with no ads and no Bridge storage.
- **Config:** `playgama-bridge-config.json` beside `index.html` (Bridge loads `./playgama-bridge-config.json`); `game_ready` once the loading screen is gone; language from `platform.language`
  only (English fallback, or the language the player picked in Settings); progress through Bridge Storage only (key
  `fixitgarage.save.v1`); `level_started` / `level_completed` (car paid) / `level_failed` (job left from the pause
  menu); interstitials only between jobs (after "Next customer", at most one per 2 minutes, no pre-roll); rewarded ads
  only from the labelled "Watch an ad: double payment / get this part free / hint" buttons, shown only where Bridge
  supports rewarded ads, with the reward only after Bridge's `rewarded` state; audio muted and the game paused during
  ads, on Bridge's pause event and when the page is hidden; Bridge's audio event mutes.

## Rebuild

```sh
npm ci
npm run submission:playgama   # vite --mode playgama → submission-playgama/fix-it-garage-playgama-v3.zip
npm run check:playgama        # zip checks + Playgama's precheck (no FAIL, no WARN)
npm run qa:playgama           # Playgama QA Tool harness: ?platform_id=qa_tool, Bridge's initialize handshake, game_ready
npm run test:playgama         # Bridge mock + stubbed Playgama SDK test (Playwright)
node scripts/playgama/shots.mjs /tmp/pg-shots   # gameplay shots for the covers (then Playgama's covers.mjs)
```

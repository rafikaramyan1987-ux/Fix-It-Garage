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
| `fix-it-garage-playgama-v2.zip` (v1.1.0 of the game: Relaxed / Expert diagnosis) | the Playgama build: `index.html` at the zip root, `playgama-bridge.js` (Bridge 2.4.1) + `playgama-bridge-config.json` beside it, `assets/`; relative paths only |
| `fix-it-garage-playgama-v1.zip` | the previous version (1.0), kept for reference |
| `cover-800x800.png`, `cover-1080x1920.png`, `cover-1920x1080.png` | the three covers Playgama's form takes (square, portrait, landscape), made with Playgama's own covers script from 1920x1080 / 1080x1920 screenshots of real play and the game's title font (Fredoka) |
| `icon-512x512.png` | icon (same as submission-web/) |

## Playgama Bridge

- **Version: 2.4.1** (pinned): the official standalone `playgama` build from github.com/Playgama/bridge tag `v2.4.1`,
  vendored in `vendor/playgama-bridge/` (sha256 `b016a8d6…adc25`, checked in CI, reproducible with
  `bash scripts/playgama/build-bridge.sh`). Shipped inside the zip, so the game loads nothing from outside.
- Init before the game shows anything; `game_ready` once the loading screen is gone; language from `platform.language`
  only (English fallback, or the language the player picked in Settings); progress through Bridge Storage only (key
  `fixitgarage.save.v1`); `level_started` / `level_completed` (car paid) / `level_failed` (job left from the pause
  menu); interstitials only between jobs (after "Next customer", at most one per 2 minutes, no pre-roll); rewarded ads
  only from the labelled "Watch an ad: double payment / get this part free / hint" buttons, shown only where Bridge
  supports rewarded ads, with the reward only after Bridge's `rewarded` state; audio muted and the game paused during
  ads, on Bridge's pause event and when the page is hidden; Bridge's audio event mutes.

## Rebuild

```sh
npm ci
npm run submission:playgama   # vite --mode playgama → submission-playgama/fix-it-garage-playgama-v2.zip
npm run check:playgama        # zip checks + Playgama's precheck
npm run test:playgama         # Bridge mock + stubbed Playgama SDK test (Playwright)
node scripts/playgama/shots.mjs /tmp/pg-shots   # gameplay shots for the covers (then Playgama's covers.mjs)
```

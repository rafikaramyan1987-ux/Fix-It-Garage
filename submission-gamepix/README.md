# Fix It Garage — GamePix submission

- **Build:** `fix-it-garage-gamepix-v1.0.1.zip` (`npm run build:gamepix`): `index.html` at the root, relative paths only.
  `window.GamePixConfig = { lifecycle: 'manual' }` and the GamePix SDK v3 script come first in `<head>`, before the game.
  Lifecycle: loading(0-100) during boot, `loaded()` before the menu, `gameStart()` at the first job. The SDK's
  `pause`/`resume` events pause the game and its audio, `soundOff`/`soundOn` silence it (the same handlers are also
  assigned as the legacy `GamePix.pause`/`resume`/`soundOff`/`soundOn` before `loaded()`). Interstitials only between
  jobs (at most one per 2 minutes), rewarded ads only from player taps, reward only on `success: true`.
  Language from `GamePix.lang()` (read once at boot), unless the player picked one in Settings. Older zips are kept for reference.
- **Icon / cover:** `icon-256x256.jpg`, `cover-1360x850.jpg` (rendered from the real 3D title scene).

## Name
Fix It Garage

## Description (385 characters, 100-500)
Customers bring broken cars to your cozy garage. Read the ticket, use the battery tester, OBD scanner, test drive and lift to collect clues, then deduce the faulty part. Unscrew wheel nuts in a star pattern, swap batteries, brakes and exhausts, top up oil and paint scratches. 40 jobs, 7 car types, 18 faults, garage upgrades, a daily job, a repair book and achievements. 10 languages.

## How to play (347 characters, max 500)
Tap a tool to find clues: each one costs workshop time. When you know the faulty part, tap Repair and order it. Follow the arrow: tap, hold to turn bolts, drag parts out and in. Then tap Test to start the car. Fast, correct repairs without wrong parts earn 3 stars. Spend your money on tools and upgrades in the Garage. Works with mouse and touch.

## Tags
simulation, car, mechanic, repair, garage, puzzle, casual, 3d, family, kids, mobile, html5

## Category
Simulation

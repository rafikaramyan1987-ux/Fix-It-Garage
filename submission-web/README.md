# Fix It Garage

**Tagline:** Find the fault, swap the part and hand happy customers their cars back!

## Description

Customers bring broken cars to your cozy garage. Read the ticket, use the battery tester, OBD scanner, test drive and lift to collect clues, then deduce the faulty part. Unscrew wheel nuts in a star pattern, swap batteries, brakes and exhausts, top up oil and paint scratches. 40 jobs, 7 car types, 18 faults, garage upgrades, a daily job, a repair book and achievements. Plays in 10 languages.

## Controls

- **Mouse / touch:** tap a tool to find clues, tap Repair and order the part, then follow the arrow: tap, hold to turn
  bolts, drag parts out and in. Tap Test to start the car.
- **Keyboard (optional):** number keys pick tools, R repairs, T tests, Space acts, Enter confirms, P pauses.

## Genre

Simulation / puzzle (casual, 3D)

## Tags

simulation, car, mechanic, repair, garage, puzzle, casual, 3d, family, mobile

## Ad-free build

This web build contains **no ads and no portal SDK**: no interstitials, no rewarded-ad buttons (the hint, free part
and double payment buttons of the portal builds are not there; the game is fully playable without them), no
analytics, no external requests (fonts and all assets are in the zip), no external links.

## Files

| File | What |
|---|---|
| `fix-it-garage-web-v2.zip` (v1.1.0 of the game: Relaxed / Expert diagnosis) | the game: `index.html` at the zip root + `assets/`, relative paths only (upload as an HTML5 game, "played in the browser") |
| `fix-it-garage-web-v1.zip` | the previous version (1.0), kept for reference |
| `cover-630x500.png` | itch.io cover, from the main cover art (`submission/covers/cover-1920x1080.png`) |
| `icon-512x512.png` | icon, from the square cover |
| `screenshot-1.png` … `screenshot-4.png` | 1280x720 gameplay: the main menu, a brake job's clues (mid-level), undoing a battery terminal with the ratchet, the payment screen of job 1 |
| `checks/iframe-<w>x<h>.png` | the zip in an iframe at 640x480, 960x600, 1280x720 and 390x844 after job 1 was played (scripts/web/check.mjs) |

- **Embed size:** any; the game fills its frame (landscape and portrait). Suggested itch.io viewport 960x600,
  "mobile friendly" on, no fullscreen button needed (the game has none of its own; itch.io's works).
- **Saves:** localStorage, key `fixitgarage.save.v1` only (a JSON document; settings, progress, money).

## Rebuild

```sh
npm ci
npm run submission:web     # web build (vite --mode web) → submission-web/fix-it-garage-web-v2.zip
npm run check:web -- submission-web/fix-it-garage-web-v2.zip --shots submission-web/checks
npm run store:web          # cover, icon and the four screenshots
```

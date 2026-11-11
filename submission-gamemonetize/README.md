# Fix It Garage — GameMonetize submission

- **Game ID:** `13mqh7opto5pk2mgoctppra0kqiz1mue` (`GM_GAME_ID` in `src/app/platform/gamemonetize.ts`; CI checks the zip carries it)
- **Upload:** `fix-it-garage-gamemonetize-v1.zip`: `index.html` and `assets/` at the zip root, relative paths only
  (Game Management > My games > the game > drop the file; then "Verify Game" and "Request activation").
- **Images:** `fix-it-garage-512x384.jpg`, `fix-it-garage-512x512.jpg`, `fix-it-garage-512x340.jpg`: the real 3D
  title scene with no text and no logo (the title overlay is removed and the lettered garage sign hidden), JPG, each
  under 300 KB.

## Form fields (ready to paste)

**Name**

```
Fix It Garage
```

**Categories** (3): Puzzles, 3D, Hypercasual

**Tags**

```
car, mechanic, repair, garage, simulation, puzzle, casual, 3d, kids, family, cars, html5, mobile
```

**Width / Height:** `1280` x `720` (16:9; the game fills any frame size, landscape or portrait)

**Optimized for Mobile Devices:** Yes (touch controls, portrait and landscape)

**Description** (542 characters, max 600)

```
Customers bring broken cars to your cozy 3D garage. Read the ticket, then use the battery tester, OBD scanner, listening, test drive and lift to find clues and work out the faulty part. Swap batteries, brakes, tyres and exhausts, unscrew wheel nuts in a star pattern, top up oil, paint scratches, then test drive and get paid. Career mode: 40 jobs, then endless jobs, plus a daily job. Relaxed or Expert difficulty. 7 cars from hatchback to electric, 18 faults, chatty customers, garage upgrades, a repair book and achievements. 10 languages.
```

**Controls** (292 characters, max 350)

```
Desktop: click a tool to find clues, Repair to pick a part, Test to drive. Click, hold to turn bolts, drag parts out and in. Keys: 1-7 tools, R repair, T test, H hint, Space act, P pause.
Mobile: tap tools and parts, hold to turn bolts, drag parts out and in. Plays in portrait and landscape.
```

## Ads in this build (GameMonetize SDK)

- `window.SDK_OPTIONS = { gameId, onEvent }` is set, then `https://api.gamemonetize.com/sdk.js` is inserted once
  while the game boots (`<script id="gamemonetize-sdk">`, as the SDK README's loader), never from a click. If it
  fails to load (ad blocker, offline), the game plays on without ads.
- `SDK_GAME_PAUSE`: the game pauses and all audio is muted. `SDK_GAME_START`: the game resumes and audio comes
  back through the player's own music / sound settings. `SDK_READY`: interstitials can be shown.
- Interstitials (`sdk.showBanner()`) only at the same natural breaks as the GameDistribution build, always right
  after a click and never during a repair job: Play on the title screen and Next customer on the payment screen, at
  most one every ~2 minutes, never on a timer. Every request settles once (`SDK_GAME_START`, an error, or not
  started within 8 s), so the game cannot get stuck.
- **No rewarded ads:** the GameMonetize SDK has no rewarded API, so this build has no "watch an ad" buttons (the
  extra hint, the free spare part and the double payment offers are hidden; hints can still be bought with coins).
- No other ad networks, no "More games" buttons, no external links. Saves stay in localStorage
  (`fixitgarage.save.v1`).

## Rebuild

```sh
npm ci
npm run submission:gamemonetize    # vite --mode gamemonetize → dist-gamemonetize/ → zip + checks
npm run test:e2e:gamemonetize      # Playwright smoke test of dist-gamemonetize with a stubbed SDK
npm run build:web && npx vite preview --outDir dist-web --port 4173 &  npm run images:gamemonetize   # the 3 JPGs
node scripts/gamemonetize/readme.mjs   # this README from scripts/gamemonetize/texts.mjs
```

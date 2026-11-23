# Fix It Garage — Y8 submission

- **App ID:** `6af4b1977eafcdc5d5d7a543` · **Game ID:** `292547` (both already in the build: `src/app/platform/y8.ts`)
- **Hosting:** direct upload of the zip (a single-player game; docs.y8.com/studio/iframe-game-hosting reserves iframe
  hosting for complex multiplayer games).

## Which file goes in which Y8 slot

Media resubmission (Y8 returned the Standard and 3 of 4 Widescreen screenshots, "Avoid: main menus, title screens,
tutorials, loading or splash screens", and the promos, "Promo images should only have the game logo/title as texts and
nothing more"; the gameplay video was approved and is unchanged). All media now live in `release/y8/media/` and in
`release/y8/fix-it-garage-y8-media.zip` (`npm run release`).

| Y8 Studio tab → slot | File | Spec (checked by `scripts/y8/check.mjs` in CI) |
|---|---|---|
| **Builds** → upload build | `submission-y8/fix-it-garage-y8-v1.zip` (copy: `release/y8/`) | `index.html` + `assets/` at the zip root, relative paths only |
| **Media** → Standard Screenshot (4:3) ×6 | `release/y8/media/standard-1.png` … `standard-6.png` | 760x570 PNG, < 2 MB |
| **Media** → Widescreen Screenshot (16:9) ×6 | `release/y8/media/widescreen-1.png` … `widescreen-6.png` | 1280x720 PNG, < 5 MB |
| **Media** → Landscape Promo | `release/y8/media/promo-landscape.png` | 1920x1080 PNG, < 5 MB |
| **Media** → Portrait Promo | `release/y8/media/promo-portrait.png` | 1080x1920 PNG, < 5 MB |
| **Media** → Game Card Promo | `release/y8/media/promo-gamecard.png` | 760x570 PNG, < 2 MB |
| **Media** → Gameplay Video (16:9) — approved, keep | `release/y8/media/gameplay-1280x720.mp4` | H.264 MP4 1280x720, 28 s, < 50 MB |
| **Media** → Gameplay Video (4:3), if asked | `release/y8/media/gameplay-960x720.mp4` | H.264 MP4 960x720, the same take, < 50 MB |

Screenshots (the same six moments at both sizes; six career jobs, six cars; all mid-gameplay: no main menu, title
screen, tutorial hint or arrow, loading screen, level select, popup or caption):
1. Job 19, classic car: the battery tester clipped on the terminals
2. Job 33, hatchback up on the lift: unbolting the leaking exhaust
3. Job 21, pickup on the lift: the wheel nuts coming off in a star pattern
4. Job 22, sports car: wheel off, the worn brake pads coming out
5. Job 17, sedan: spraying fresh paint over the scratch
6. Job 3, van: pouring oil into the engine

Promos: the real 3D garage scene rendered natively at 1920x1080, 1080x1920 and 760x570, with the game logo
"Fix It Garage" as the only text (no tagline, no buttons; the painted sign above the garage door is hidden).

Video: one continuous recording of real play (career job 4, a sedan with a flat tyre), no cuts, no intro, no menus,
no sound; the 33.9 s take is evenly sped up ×1.21 to fit Y8's 20–30 s. The car rolls in at once, the lift reveals the nail in the tyre, the tyre is ordered and the wheel nuts come
off in a star pattern, all inside Y8's first 20 seconds; then the new wheel goes on, the test drive and the 3-star
payment. The 960x720 clip is the same scripted take rendered at 4:3, so the interface stays in frame.

## Basic Info (ready to paste)

**Game name**
```
Fix It Garage
```

**Description**
```
Customers bring broken cars to your cozy 3D garage, and it's your job to send them home happy. Read the customer's ticket, then collect clues: check the battery with the tester, plug in the OBD scanner, listen to the engine, take a test drive or put the car up on the lift to look underneath. Green clues are normal, red ones point to the problem. Work out the faulty part, order it and fit it yourself: unscrew wheel nuts in a star pattern, swap batteries, brake pads and exhausts, top up the oil and paint over scratches. Then start the car for the final test and collect your pay.

Career mode has 40 jobs, then endless jobs, plus a new daily job every day. Play on Relaxed (colour-coded clues, a suspects list and a free hint in every job) or Expert. 7 car types from hatchback and van to sports, classic and electric cars, 18 different faults, garage upgrades, a repair book that fills up as you learn, and achievements. Fast, correct repairs without wrong parts earn 3 stars. Progress is saved automatically. Plays in 10 languages.
```

**Instructions**
```
Tap or click a tool to find clues: each one costs workshop time. Green clues are normal, red ones show a problem. Stuck? The first hint of every job is free. Tap Repair: the parts that match your clues come first. Follow the arrow: tap, hold to turn bolts, drag parts out and in. Then tap Test to start the car. Fast, correct repairs without wrong parts earn 3 stars. Spend your money on upgrades in the Garage.
Keyboard: 1-7 tools, R repair, T test, H hint, Space / Enter act, P pause.
```

**Supported platforms:** Desktop (mouse and keyboard) and mobile / tablet (touch), in any modern browser with WebGL.
Landscape and portrait; the game fills any frame size (suggested 1280x720, 16:9).

**Languages:** English (default), German, Spanish, French, Italian, Dutch, Polish, Portuguese, Russian, Turkish.

**Multiplayer:** no (single player). **Login:** not required, guests play everything. **In-app purchases:** none.

## Ads in this build (Y8 SDK)

- The SDK loads only from Y8's CDN (`<script src="https://cdn.y8.com/minimal-sdk/2-0/y8.min.js" async>` in
  `<head>`), never bundled. It is initialized as the portal snippet: a `y8sdk.ready` listener (once) calls
  `y8.sdk()`, then `init({ appId, autoLogin: true }, { gameId, preloadAdBreaks: 'on', sound: 'on', onReady })`, then
  `onAuth` (guests always play), and `window.y8.emitReadyEvent()` covers an SDK that loaded first. No ad call
  happens before init.
- Interstitials: `showAd({ type: 'start' })` on the player's first Play click, `showAd({ type: 'next' })` on Next
  customer / Main menu of the payment screen (a job cannot be failed, so there is no Retry). Never automatic, never
  during a repair job, no frequency cap of our own (the SDK paces them); a break without an ad continues at once.
- Pause + mute in `beforeAd`, resume + the player's own audio settings in `afterAd`. `adBreakDone` settles each
  request; `.catch()` and a timeout also settle it, exactly once, so the game never gets stuck.
- Rewarded (`type: 'reward'`): only from optional buttons that name the reward first (extra hint, free spare part,
  double payment). `beforeReward` calls `showAdFn()`, the reward is granted only in `adViewed`; `adDismissed` or no
  ad = no reward and "No ad available right now, try later", and the job goes on. Nothing essential is behind an ad.
- Pause + mute when the tab is hidden (`visibilitychange`) or the window loses focus (`blur`), resume on return.
- No other ad networks, no external links, no "More games". Saves in localStorage (`fixitgarage.save.v1`). With an
  ad blocker the game is fully playable and the rewarded buttons are hidden.

## Rebuild

```sh
npm ci
npm run submission:y8   # vite --mode y8 → dist-y8/ → fix-it-garage-y8-v1.zip + checks (zip and media)
npm run test:e2e:y8     # Playwright smoke test of dist-y8 with a stubbed Y8 SDK
npm run build:web && npx vite preview --outDir dist-web --port 4173 &  npm run media:y8   # screenshots + promos (--only video: the video)
npm run release         # every portal zip + media zip into release/ (Y8: release/y8/)
```

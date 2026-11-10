# Fix It Garage

A cozy 3D car repair workshop game for desktop and mobile browsers (landscape and portrait). Customers bring broken cars;
you read the ticket, collect clues with your tools, deduce the faulty part, swap it with short tactile mini-actions,
test-drive the car and hand it back for money and stars.

- **40 career jobs** (then endless free play), **7 car types** (hatchback, sedan, van, pickup, sports car, classic car,
  electric car), **18 faults + paint jobs** with consistent symptom → clue logic. Early jobs have one fault and obvious
  clues; later jobs have two faults, misleading customers and rare parts. Every 5th job is a tricky customer
  (misleading, in a rush, picky or VIP). Classic cars have no OBD port; electric cars have no exhaust.
- **Tools:** battery tester, OBD scanner, listen, look under (lift), test drive; tyre gauge and exhaust analyser bought
  in the garage. Each tool costs workshop minutes; the job has a time bonus.
- **Repairs:** battery swap ((−) off first, (+) on first), engine-bay parts, underside parts on the lift, wheel change with
  the nuts in a star pattern, brake pads and discs, oil and coolant top-ups, sand/spray/polish paint.
- **Garage upgrades** (tools, impact wrench, express parts, second lift, paint booth, decorations), **daily job** (double
  pay), **repair book**, **13 achievements**, first-job **tutorial**, progress saved under one localStorage key.
- **10 languages** (en, fr, de, it, es, pt, nl, pl, tr, ru), one JSON file each in `src/i18n/`.
- **Ads only in the portal builds**, never in the web build: interstitials only between jobs (at most one per 2 minutes),
  rewarded ads only from buttons the player taps (hint, free spare part, double payment).

Play the web build: https://rafikaramyan1987-ux.github.io/Fix-It-Garage/

## Tech

TypeScript, Vite, three.js. Build-time platform layer (`VITE_PLATFORM` = `web | crazygames | gd | gamepix`, or
`--mode`), `base: './'`, same approach as the other games in this account.

```bash
npm install
npm run dev            # http://localhost:5173 (?job=N jumps to career job N, ?lang=de forces a language)
npm run build          # dist/          CrazyGames (SDK v3)
npm run build:web      # dist-web/      GitHub Pages, no ads
npm run build:gd       # dist-gd/       GameDistribution
npm run build:gamepix  # dist-gamepix/  GamePix (SDK v3, manual lifecycle)
npm run lint && npm run typecheck && npm test
npm run validate:jobs  # job validator -> docs/jobs-report.md
npm run check:i18n     # every language has every key
npm run build:web && npm run build:gamepix && npm run test:e2e
npm run submission && npm run submission:check
```

## Layout

- `src/game/`: pure rules: data (cars, tools, findings, faults, parts, upgrades, 40 jobs), symptom-clue rules, jobs,
  payout, progress/save, validator (unit tested)
- `src/render/`: stage, garage + upgrade props, cars (Kenney Car Kit), engine bay, part slots, parts, particles, camera
- `src/play/`: the game flow (menu, jobs, tools, test drive, payment, pause, ads, tutorial) and the repair mini-actions
- `src/ui/`: DOM overlay (HUD, ticket, toolbar, parts, payment) and screens (menu, settings, garage, book, daily, achievements)
- `src/i18n/`: translations; `src/app/`: clock, audio (synthesised sounds + music), input, platform SDK wrappers
- `scripts/`: asset pipeline, job validator, i18n check, capture driver, store art, trailers, submission zips
- `submission/`, `submission-gd/`, `submission-gamepix/`: portal packages; `docs/`: previews and the jobs report

Credits: [CREDITS.md](CREDITS.md).

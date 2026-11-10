# Fix It Garage

A cozy 3D car repair workshop game for desktop and mobile browsers. Customers bring broken cars; you read the
ticket, collect clues with your tools, deduce the faulty part, swap it with short tactile mini-actions, test-start
the car and hand it back for money and stars.

**Status: Phase A (art & feel preview)**: garage scene, one lift, 3 cars, tool bench, parts shelf and one complete
playable job ("won't start" → battery tester → battery swap → test start → payment). See [docs/preview](docs/preview/).

## Tech

TypeScript, Vite, three.js. Build-time platform layer (`VITE_PLATFORM` = `web | crazygames | gd | gamepix`, or
`--mode`), `base: './'`, same approach as the other games in this account.

```bash
npm install
npm run dev            # http://localhost:5173
npm run build:web      # dist-web/  (GitHub Pages)
npm run build          # dist/      (CrazyGames)
npm run build:gd       # dist-gd/
npm run build:gamepix  # dist-gamepix/
npm run lint && npm run typecheck && npm test
npm run test:e2e       # Playwright, plays the job in the web build
```

Assets: `npm run assets` rebuilds the shipped car GLBs from `assets-src/kenney-car-kit/` (only the models used,
texture embedded, quantized + meshopt-compressed, ~38 KB each).

Preview media: `npx tsx scripts/preview-shots.ts <url>` and `npx tsx scripts/preview-video.ts <url>` play the game
through real pointer input in a frame-stepped browser (`?capture`) and write to `docs/preview/`.

## Layout

- `src/game/`: pure rules (data, job, battery-swap procedure), unit tested
- `src/render/`: stage, garage, cars, engine bay, particles, camera
- `src/ui/`: DOM overlay (HUD, ticket, toolbar, parts, payment)
- `src/app/`: clock, audio, input, save, platform SDK wrappers
- `src/play.ts`: the job flow

Credits: [CREDITS.md](CREDITS.md).

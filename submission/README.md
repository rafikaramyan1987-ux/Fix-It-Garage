# Fix It Garage — CrazyGames submission

## Short description
Diagnose broken cars from clues, swap the right part and hand them back to happy customers. A cozy 3D car repair workshop.

## Description
Customers bring broken cars to your cozy garage. Read the ticket, use the battery tester, OBD scanner, test drive and lift to collect clues, then deduce the faulty part. Unscrew wheel nuts in a star pattern, swap batteries, brakes and exhausts, top up oil and paint scratches. 40 jobs, 7 car types, 18 faults, garage upgrades, a daily job, a repair book and achievements. 10 languages.

## How to play
Tap a tool to find clues: each one costs workshop time. Green clues are normal, red ones show a problem. Stuck? The first hint of every job is free. Tap Repair: the parts that match your clues come first. Follow the arrow: tap, hold to turn bolts, drag parts out and in. Then tap Test to start the car. Fast, correct repairs without wrong parts earn 3 stars. Spend your money on tools and upgrades in the Garage. Works with mouse and touch.

## Tags
simulation, car, mechanic, repair, garage, puzzle, casual, 3d, family, kids, mobile, html5

## Files
- `fix-it-garage-crazygames-v1.1.0.zip` — the CrazyGames build (`npm run build`), `index.html` at the root, relative paths only.
  Uses the CrazyGames SDK v3: gameplayStart/Stop, loadingStart/Stop, happytime, midgame ads only between jobs
  (at most one per 2 minutes, never during a repair), rewarded ads only from buttons the player taps (hint, free spare
  part, double payment), granted only when the ad completed; 8 s timeout, then "No ad available right now, try later"
  for 2.5 s. Language from the SDK locale (10 languages), saves in the SDK data module.
- Older versions (kept for reference): `fix-it-garage-crazygames-v1.0.0.zip`.
- `covers/cover-1920x1080.png`, `covers/cover-800x1200.png`, `covers/cover-800x800.png` — rendered from the real 3D title scene.
- `videos/trailer-1920x1080.mp4`, `videos/trailer-1080x1920.mp4` — 18 s, no sound, recorded from real play.

Regenerate: `npm run build && npm run build:web`, `npx vite preview --outDir dist-web --port 4173`, then
`npx tsx scripts/submission/covers.ts`, `npx tsx scripts/submission/trailer.ts 1920 1080`,
`npx tsx scripts/submission/trailer.ts 1080 1920` and `node scripts/submission/build.mjs`.

// Portal submission folders. Run after the builds (npm run build && npm run build:gd && npm run build:gamepix):
//   node scripts/submission/build.mjs
// - submission/          CrazyGames: zip of dist/ (index.html at the root), covers + trailers (scripts/submission/covers.ts, trailer.ts)
// - submission-gd/       GameDistribution: zip of dist-gd/, JPG thumbnails, description (max 500 chars)
// - submission-gamepix/  GamePix: zip of dist-gamepix/, icon + cover, description (100-500) and how-to-play (max 500)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { DESCRIPTION, HOW_TO_PLAY, NAME, SHORT, TAGS } from './texts.mjs';

const version = JSON.parse((await import('node:fs')).readFileSync('package.json', 'utf8')).version;
function zip(dir, out) {
  if (!existsSync(`${dir}/index.html`)) throw new Error(`${dir}/index.html missing: build first`);
  rmSync(out, { force: true });
  execFileSync('zip', ['-r', '-9', '-X', '-q', `${process.cwd()}/${out}`, '.'], { cwd: dir });
  console.log('wrote', out);
}
for (const d of ['submission', 'submission-gd', 'submission-gamepix']) mkdirSync(d, { recursive: true });
zip('dist', `submission/fix-it-garage-crazygames-v${version}.zip`);
zip('dist-gd', `submission-gd/fix-it-garage-gd-v${version}.zip`);
zip('dist-gamepix', `submission-gamepix/fix-it-garage-gamepix-v${version}.zip`);

writeFileSync('submission/README.md', `# ${NAME} — CrazyGames submission

## Short description
${SHORT}

## Description
${DESCRIPTION}

## How to play
${HOW_TO_PLAY}

## Tags
${TAGS.join(', ')}

## Files
- \`fix-it-garage-crazygames-v${version}.zip\` — the CrazyGames build (\`npm run build\`), \`index.html\` at the root, relative paths only.
  Uses the CrazyGames SDK v3: gameplayStart/Stop, loadingStart/Stop, happytime, midgame ads only between jobs
  (at most one per 2 minutes, never during a repair), rewarded ads only from buttons the player taps (hint, free spare
  part, double payment), granted only when the ad completed; 8 s timeout, then "No ad available right now, try later"
  for 2.5 s. Language from the SDK locale (10 languages), saves in the SDK data module.
- \`covers/cover-1920x1080.png\`, \`covers/cover-800x1200.png\`, \`covers/cover-800x800.png\` — rendered from the real 3D title scene.
- \`videos/trailer-1920x1080.mp4\`, \`videos/trailer-1080x1920.mp4\` — 18 s, no sound, recorded from real play.

Regenerate: \`npm run build && npm run build:web\`, \`npx vite preview --outDir dist-web --port 4173\`, then
\`npx tsx scripts/submission/covers.ts\`, \`npx tsx scripts/submission/trailer.ts 1920 1080\`,
\`npx tsx scripts/submission/trailer.ts 1080 1920\` and \`node scripts/submission/build.mjs\`.
`);

writeFileSync('submission-gd/README.md', `# ${NAME} — GameDistribution submission

- **Build:** \`fix-it-garage-gd-v${version}.zip\` (\`npm run build:gd\`): \`index.html\` at the root of the zip, assets in \`assets/\`,
  relative paths only. Loads the GameDistribution HTML5 SDK at runtime (interstitials only between jobs, at most one per
  2 minutes; rewarded ads only after SDK_REWARDED_WATCH_COMPLETE). Language from the browser.
- **Game ID:** \`ca104008d4054b3b9652dd239bc9893f\` (\`GD_GAME_ID\` in \`src/app/platform/gd.ts\`; CI checks the zip carries it).
- **Thumbnails:** \`thumbnails/thumb-512x384.jpg\`, \`thumb-512x512.jpg\`, \`thumb-200x120.jpg\`, \`thumb-1280x720.jpg\`, \`thumb-1280x550.jpg\`.
- **Orientation:** landscape and portrait, desktop and mobile.

## Name
${NAME}

## Description (${DESCRIPTION.length} characters, max 500)
${DESCRIPTION}

## Instructions
${HOW_TO_PLAY}

## Tags
${TAGS.join(', ')}
`);

writeFileSync('submission-gamepix/README.md', `# ${NAME} — GamePix submission

- **Build:** \`fix-it-garage-gamepix-v${version}.zip\` (\`npm run build:gamepix\`): \`index.html\` at the root, relative paths only.
  \`window.GamePixConfig = { lifecycle: 'manual' }\` and the GamePix SDK v3 script come first in \`<head>\`, before the game.
  Lifecycle: loading(0-100) during boot, \`loaded()\` before the menu, \`gameStart()\` at the first job. The SDK's
  \`pause\`/\`resume\` events pause the game and its audio, \`soundOff\`/\`soundOn\` silence it. Interstitials only between
  jobs (at most one per 2 minutes), rewarded ads only from player taps, reward only on \`success: true\`.
  Language from \`GamePix.lang()\`.
- **Icon / cover:** \`icon-256x256.jpg\`, \`cover-1360x850.jpg\` (rendered from the real 3D title scene).

## Name
${NAME}

## Description (${DESCRIPTION.length} characters, 100-500)
${DESCRIPTION}

## How to play (${HOW_TO_PLAY.length} characters, max 500)
${HOW_TO_PLAY}

## Tags
${TAGS.join(', ')}

## Category
Simulation
`);
console.log('READMEs written');

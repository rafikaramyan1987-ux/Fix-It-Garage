// npm run release: rebuilds every portal build and game zip (each with its static checks), then writes release/:
// one folder per portal with the game zip to upload and the portal's media zip (store images / videos).
//   release/<portal>/<game zip>                     the build to upload (a copy of the newest zip in submission-*/)
//   release/<portal>/fix-it-garage-<portal>-media.zip  that portal's media, files at the zip root
//   release/y8/media/                               the Y8 media slots (scripts/y8/media.ts), also in the Y8 media zip
// The browser checks run separately (README "Release"): npm run test:e2e, test:layout, test:e2e:gamemonetize,
// test:e2e:y8, check:web, qa:playgama / test:playgama.
// usage: node scripts/release.mjs [--no-build]   (--no-build: only re-assemble release/ from the existing zips)
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const version = JSON.parse((await import('node:fs')).readFileSync('package.json', 'utf8')).version;
const run = (cmd, args) => {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit' });
};

if (!process.argv.includes('--no-build')) {
  // CrazyGames, GameDistribution, GamePix (zips of this version) + their checks (the checks read dist-gd too)
  for (const s of ['build', 'build:web', 'build:gd', 'build:gamepix']) run('npm', ['run', s]);
  run('node', ['scripts/submission/build.mjs']);
  run('node', ['scripts/submission/check.mjs']);
  // open-portal web zip, Playgama, GameMonetize, Y8 (each zip script builds and, where it has one, runs its check)
  run('npm', ['run', 'submission:web']);
  run('node', ['scripts/web/check.mjs', 'submission-web/fix-it-garage-web-v2.zip', '--static']);
  run('npm', ['run', 'submission:playgama']);
  run('node', ['scripts/playgama/check.mjs', 'submission-playgama/fix-it-garage-playgama-v3.zip']);
  run('npm', ['run', 'submission:gamemonetize']);
  run('npm', ['run', 'submission:y8']);
}

const newest = (dir, re) => {
  const z = readdirSync(dir).filter((f) => re.test(f)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).pop();
  if (!z) throw new Error(`no zip matching ${re} in ${dir}`);
  return join(dir, z);
};
const files = (dir, re) => readdirSync(dir).filter((f) => re.test(f)).sort().map((f) => join(dir, f));

const PORTALS = [
  { id: 'crazygames', name: 'CrazyGames', game: newest('submission', /^fix-it-garage-crazygames-v[\d.]+\.zip$/), media: [...files('submission/covers', /\.png$/), ...files('submission/videos', /\.mp4$/)] },
  { id: 'gamedistribution', name: 'GameDistribution', game: newest('submission-gd', /^fix-it-garage-gd-v[\d.]+\.zip$/), media: files('submission-gd/thumbnails', /\.jpg$/) },
  { id: 'gamepix', name: 'GamePix', game: newest('submission-gamepix', /^fix-it-garage-gamepix-v[\d.]+\.zip$/), media: files('submission-gamepix', /\.jpg$/) },
  { id: 'playgama', name: 'Playgama', game: 'submission-playgama/fix-it-garage-playgama-v3.zip', media: files('submission-playgama', /\.png$/) },
  { id: 'gamemonetize', name: 'GameMonetize', game: 'submission-gamemonetize/fix-it-garage-gamemonetize-v1.zip', media: files('submission-gamemonetize', /\.jpg$/) },
  { id: 'web', name: 'Open portals (itch.io, Newgrounds, …)', game: 'submission-web/fix-it-garage-web-v2.zip', media: files('submission-web', /\.png$/) },
  { id: 'y8', name: 'Y8', game: 'submission-y8/fix-it-garage-y8-v1.zip', media: files('release/y8/media', /\.(png|jpg|mp4)$/) },
];

const kb = (f) => `${(statSync(f).size / 1024).toFixed(0)} KB`;
const rows = [];
for (const p of PORTALS) {
  const dir = `release/${p.id}`;
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (f.endsWith('.zip')) rmSync(join(dir, f));
  if (!existsSync(p.game)) throw new Error(`${p.game} missing`);
  if (!p.media.length) throw new Error(`${p.id}: no media files`);
  const game = join(dir, basename(p.game));
  copyFileSync(p.game, game);
  const media = join(dir, `fix-it-garage-${p.id}-media.zip`);
  // -j: files at the zip root, -X: no extra attributes; -0 for videos / PNG / JPG (already compressed)
  execFileSync('zip', ['-j', '-X', '-q', '-0', media, ...p.media]);
  console.log(`${dir}: ${basename(game)} (${kb(game)}), ${basename(media)} (${p.media.length} files, ${kb(media)})`);
  rows.push(`| ${p.name} | \`${p.id}/${basename(game)}\` | \`${p.id}/${basename(media)}\`: ${p.media.map((f) => basename(f)).join(', ')} |`);
}
// the Y8 media zip must hold exactly release/y8/media (checked with the rest of the Y8 rules)
run('node', ['scripts/y8/check.mjs', 'release/y8/fix-it-garage-y8-v1.zip']);

writeFileSync(
  'release/README.md',
  `# Fix It Garage ${version} — release

Written by \`npm run release\` (\`scripts/release.mjs\`): every portal build is rebuilt and zipped with its static checks,
then each portal folder gets the game zip to upload and a media zip with that portal's store images / videos (files at
the zip root). Store texts and per-portal notes: the README in each \`submission*/\` folder.

| Portal | Game zip (upload) | Media zip |
|---|---|---|
${rows.join('\n')}

## Y8 media slots (\`y8/media/\`, also in \`y8/fix-it-garage-y8-media.zip\`)

| Y8 Studio → Media slot | File | Spec |
|---|---|---|
| Standard Screenshot (4:3) ×6 | \`standard-1.png\` … \`standard-6.png\` | 760x570 PNG, < 2 MB |
| Widescreen Screenshot (16:9) ×6 | \`widescreen-1.png\` … \`widescreen-6.png\` | 1280x720 PNG, < 5 MB |
| Landscape Promo | \`promo-landscape.png\` | 1920x1080 PNG, < 5 MB |
| Portrait Promo | \`promo-portrait.png\` | 1080x1920 PNG, < 5 MB |
| Game Card Promo | \`promo-gamecard.png\` | 760x570 PNG, < 2 MB |
| Gameplay Video (16:9) — approved, unchanged | \`gameplay-1280x720.mp4\` | H.264 1280x720, 28 s |
| Gameplay Video (4:3) — the same take, if asked | \`gameplay-960x720.mp4\` | H.264 960x720, 28 s |

Screenshots \`N\` are the same moment at both sizes, each a different career job and car, all mid-gameplay (no menu,
title, tutorial hint or arrow, loading screen, level select, popup or caption):
1. Job 19, classic car: the battery tester clipped on the terminals
2. Job 33, hatchback up on the lift: unbolting the leaking exhaust
3. Job 21, pickup on the lift: the wheel nuts coming off in a star pattern
4. Job 22, sports car: wheel off, the worn brake pads coming out
5. Job 17, sedan: spraying fresh paint over the scratch
6. Job 3, van: pouring oil into the engine

Promos: the 3D garage scene with the game logo "Fix It Garage" as the only text (no tagline, no buttons, no sign).
`,
);
console.log('\nwrote release/README.md');

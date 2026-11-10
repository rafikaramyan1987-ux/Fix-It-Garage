// CI check of the submission rules: zips have index.html at the root, store texts fit the portals' limits,
// the GD and GamePix builds load only their own SDK.  usage: node scripts/submission/check.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { DESCRIPTION, HOW_TO_PLAY } from './texts.mjs';

let bad = 0;
const fail = (m) => (bad++, console.log('FAIL', m));
if (DESCRIPTION.length > 500 || DESCRIPTION.length < 100) fail(`description is ${DESCRIPTION.length} chars (100-500)`);
if (HOW_TO_PLAY.length > 500) fail(`how-to-play is ${HOW_TO_PLAY.length} chars (max 500)`);
// the newest zip of each folder (older versions are kept next to it)
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const newest = (dir) => readdirSync(dir).filter((f) => f.endsWith('.zip')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).pop();
const dirs = ['submission', 'submission-gd', 'submission-gamepix', 'submission-web', ...(existsSync('submission-playgama') ? ['submission-playgama'] : [])];
for (const dir of dirs) {
  const z = newest(dir);
  if (z && !z.endsWith(`-v${version}.zip`)) fail(`${dir}: the newest zip ${z} is not version ${version} (run npm run submission)`);
  if (!z) {
    fail(`${dir}: no zip`);
    continue;
  }
  const list = execFileSync('unzip', ['-Z1', `${dir}/${z}`], { encoding: 'utf8' }).split('\n');
  if (!list.includes('index.html')) fail(`${dir}/${z}: index.html is not at the root`);
  const html = execFileSync('unzip', ['-p', `${dir}/${z}`, 'index.html'], { encoding: 'utf8' });
  if (/(src|href)="\//.test(html)) fail(`${dir}/${z}: absolute paths in index.html`);
  if (dir === 'submission-gamepix' && !html.includes('gamepix.sdk.js')) fail('gamepix build does not load the GamePix SDK');
  if (dir === 'submission-gamepix' && html.indexOf('GamePixConfig') > html.indexOf('type="module"')) fail('GamePixConfig must come before the game bundle');
  if (dir === 'submission-web' && /gamepix\.sdk|crazygames|gamedistribution/i.test(html)) fail('the web zip must not load a portal SDK');
  console.log('ok', `${dir}/${z}`, list.filter(Boolean).length, 'files');
}
// the GameDistribution zip must carry Fix It Garage's real game ID (never the placeholder)
export const GD_GAME_ID = 'ca104008d4054b3b9652dd239bc9893f';
{
  const z = newest('submission-gd');
  const js = z ? execFileSync('unzip', ['-Z1', `submission-gd/${z}`], { encoding: 'utf8' }).split('\n').filter((f) => f.endsWith('.js')) : [];
  const code = js.map((f) => execFileSync('unzip', ['-p', `submission-gd/${z}`, f], { encoding: 'utf8' })).join('\n');
  if (!code.includes(GD_GAME_ID)) fail(`the GD zip does not contain the game ID ${GD_GAME_ID}`);
  if (/['"]0{32}['"]/.test(code)) fail('the GD zip still contains the placeholder game ID');
  else if (code.includes(GD_GAME_ID)) console.log('ok GD game ID', GD_GAME_ID);
}
const gd = readFileSync('dist-gd/assets/' + readdirSync('dist-gd/assets').find((f) => f.endsWith('.js')), 'utf8');
if (gd.includes('sdk.crazygames.com')) fail('GD build contains the CrazyGames SDK');
process.exit(bad ? 1 : 0);

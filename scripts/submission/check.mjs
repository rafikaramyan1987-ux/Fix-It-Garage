// CI check of the submission rules: zips have index.html at the root, store texts fit the portals' limits,
// the GD and GamePix builds load only their own SDK.  usage: node scripts/submission/check.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { DESCRIPTION, HOW_TO_PLAY } from './texts.mjs';

let bad = 0;
const fail = (m) => (bad++, console.log('FAIL', m));
if (DESCRIPTION.length > 500 || DESCRIPTION.length < 100) fail(`description is ${DESCRIPTION.length} chars (100-500)`);
if (HOW_TO_PLAY.length > 500) fail(`how-to-play is ${HOW_TO_PLAY.length} chars (max 500)`);
for (const dir of ['submission', 'submission-gd', 'submission-gamepix']) {
  const z = readdirSync(dir).find((f) => f.endsWith('.zip'));
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
  console.log('ok', `${dir}/${z}`, list.filter(Boolean).length, 'files');
}
const gd = readFileSync('dist-gd/assets/' + readdirSync('dist-gd/assets').find((f) => f.endsWith('.js')), 'utf8');
if (gd.includes('sdk.crazygames.com')) fail('GD build contains the CrazyGames SDK');
process.exit(bad ? 1 : 0);

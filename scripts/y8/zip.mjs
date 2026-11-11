// Y8 upload (Builds tab): zips dist-y8/ (run `npm run build:y8` first) with index.html and assets/ at the zip root,
// relative paths only, then runs the static checks (scripts/y8/check.mjs). The game is a regular single-player game,
// so it is uploaded directly to Y8 (docs.y8.com/studio/iframe-game-hosting: iframe hosting is for complex
// multiplayer games only).
// Usage: node scripts/y8/zip.mjs [out.zip]   (default submission-y8/fix-it-garage-y8-v1.zip)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const out = resolve(process.argv[2] ?? 'submission-y8/fix-it-garage-y8-v1.zip');
const dist = resolve('dist-y8');
if (!existsSync(`${dist}/index.html`)) throw new Error('dist-y8/index.html missing: run `npm run build:y8` first');
mkdirSync(dirname(out), { recursive: true });
rmSync(out, { force: true });
// the folder's *contents* (cwd = dist): index.html at the root; -X: no extra attributes, -D: no directory entries
execFileSync('zip', ['-r', '-9', '-X', '-D', '-q', out, '.'], { cwd: dist, stdio: 'inherit' });
console.log(`${out} (${(statSync(out).size / 1024).toFixed(0)} KB)`);
execFileSync('node', ['scripts/y8/check.mjs', out], { stdio: 'inherit' });

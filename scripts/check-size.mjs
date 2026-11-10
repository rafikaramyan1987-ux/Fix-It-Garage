// Fails if a build folder is bigger than the budget (default 8 MB).
// usage: node scripts/check-size.mjs dist-web [maxBytes]
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [dir = 'dist-web', max = String(8 * 1024 * 1024)] = process.argv.slice(2);
const walk = (d) => readdirSync(d).reduce((s, f) => {
  const p = join(d, f);
  const st = statSync(p);
  return s + (st.isDirectory() ? walk(p) : st.size);
}, 0);
const total = walk(dir);
console.log(`${dir}: ${(total / 1024).toFixed(0)} KB (budget ${(+max / 1024).toFixed(0)} KB)`);
if (total > +max) process.exit(1);

// CI check: every language file has exactly the keys of en.json, no empty strings, and the same {placeholders}.
// usage: node scripts/check-i18n.mjs
import { readFileSync, readdirSync } from 'node:fs';

const dir = 'src/i18n';
const en = JSON.parse(readFileSync(`${dir}/en.json`, 'utf8'));
const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const tags = (s) => (s.match(/<b>/g) || []).length;
let bad = 0;
const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'en.json');
for (const f of files) {
  const t = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  const missing = Object.keys(en).filter((k) => !(k in t));
  const extra = Object.keys(t).filter((k) => !(k in en));
  const empty = Object.keys(t).filter((k) => typeof t[k] !== 'string' || !t[k].trim());
  const placeholders = Object.keys(en).filter((k) => k in t && ph(en[k]) !== ph(t[k]));
  const markup = Object.keys(en).filter((k) => k in t && tags(t[k]) !== tags(en[k]) && tags(en[k]) > 0 && tags(t[k]) === 0);
  for (const [what, list] of [['missing', missing], ['extra', extra], ['empty', empty], ['placeholder mismatch', placeholders], ['lost <b> markup', markup]]) {
    if (list.length) {
      bad += list.length;
      console.log(`${f}: ${what}: ${list.join(', ')}`);
    }
  }
}
console.log(`${files.length + 1} languages, ${Object.keys(en).length} keys each${bad ? `, ${bad} problem(s)` : ', all complete'}`);
process.exit(bad ? 1 : 0);

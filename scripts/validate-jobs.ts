/** Job validator: writes docs/jobs-report.md and fails (exit 1) on any issue. usage: npx tsx scripts/validate-jobs.ts */
import { writeFileSync } from 'node:fs';
import { reportMarkdown, validate } from '../src/game/validate';

const r = validate();
writeFileSync('docs/jobs-report.md', reportMarkdown(r));
console.log(`checked 40 career jobs, ${r.checked.endless} endless jobs, ${r.checked.daily} daily jobs`);
for (const i of r.issues) console.log('ISSUE', i);
console.log(r.issues.length ? `${r.issues.length} issue(s)` : 'all checks passed');
process.exit(r.issues.length ? 1 : 0);

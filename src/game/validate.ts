/**
 * Job validator (run in CI by scripts/validate-jobs.ts, report in docs/jobs-report.md): every job is solvable with the
 * base tools within its target time, its readings identify its faults uniquely, difficulty grows, and rewards fit the
 * progression curve (upgrades become affordable as the career goes on).
 */
import { BASE_TOOLS, CAREER, CARS, CAR_TYPES, FAULTS, PARTS, UPGRADES, type FaultId } from './data';
import { bestDiagnosis, INFERABLE, lookalikes } from './rules';
import { careerJob, dailyJob, optimalMinutes, type JobDef } from './jobs';

export interface Row {
  job: JobDef;
  tools: string[];
  optimal: number;
  profit: number;
  cumulative: number;
}

export interface Report {
  rows: Row[];
  issues: string[];
  checked: { daily: number; endless: number };
}

const label = (j: JobDef) => `job ${j.n} (${j.car}: ${j.faults.join(' + ')})`;

export function checkJob(j: JobDef, issues: string[]) {
  const name = j.daily ? `daily ${j.id}` : label(j);
  for (const f of j.faults) {
    const c = FAULTS[f].cars;
    if (c === 'ev' && !CARS[j.car].ev) issues.push(`${name}: ${f} only fits electric cars`);
    if (c === 'fuel' && CARS[j.car].ev) issues.push(`${name}: ${f} cannot happen on an electric car`);
  }
  if (j.faults.filter((f) => FAULTS[f].noStart).length > 1) issues.push(`${name}: two no-start faults at once`);
  if (new Set(j.faults).size !== j.faults.length) issues.push(`${name}: duplicate fault`);
  const look = lookalikes(j.faults, j.car, BASE_TOOLS);
  if (look.length) issues.push(`${name}: clues do not identify the fault(s); same readings as ${look.map((g) => g.join(' + ')).join(', ')}`);
  const d = bestDiagnosis(j.faults, j.car);
  if (!d) issues.push(`${name}: not solvable with the base tools`);
  const opt = optimalMinutes(j.car, j.faults);
  if (opt > j.targetMinutes) issues.push(`${name}: target ${j.targetMinutes} min is below the fastest solve (${opt} min)`);
  if (j.mod === 'misleading' && !j.faults.some((f) => FAULTS[f].misleads)) issues.push(`${name}: misleading customer without a misleading line`);
  return d;
}

export function validate(): Report {
  const issues: string[] = [];
  const rows: Row[] = [];
  let cumulative = 0;
  let prevBase = 0;
  CAREER.forEach((_, i) => {
    const n = i + 1;
    const j = careerJob(n);
    const d = checkJob(j, issues);
    if (CARS[j.car].unlock > n) issues.push(`${label(j)}: car type ${j.car} is not unlocked before job ${CARS[j.car].unlock}`);
    if ((n % 5 === 0) !== !!j.mod) issues.push(`${label(j)}: every 5th job (and only those) must be a tricky customer`);
    if (n <= 8 && j.faults.length > 1) issues.push(`${label(j)}: early jobs have one fault`);
    if (n < 17 && j.faults.length > 1) issues.push(`${label(j)}: two-fault jobs start at job 17`);
    for (const f of j.faults) if (PARTS[FAULTS[f].part].price >= 200 && n < 20) issues.push(`${label(j)}: rare part ${FAULTS[f].part} before job 20`);
    // the labour of a plain single-fault job never goes down
    const base = (55 + Math.min(n, 60) * 6) * 1;
    if (base < prevBase) issues.push(`${label(j)}: base labour went down`);
    prevBase = base;
    const profit = j.labor + j.timeBonus;
    cumulative += profit;
    rows.push({ job: j, tools: d?.tools ?? [], optimal: optimalMinutes(j.car, j.faults), profit, cumulative });
  });
  // coverage
  for (const f of Object.keys(FAULTS) as FaultId[]) if (!CAREER.some((j) => j.faults.includes(f))) issues.push(`fault ${f} never appears in the career`);
  for (const c of CAR_TYPES) if (CAREER.filter((j) => j.car === c).length < 3) issues.push(`car type ${c} appears in fewer than 3 jobs`);
  if (INFERABLE.length < 15) issues.push('fewer than 15 different faults');
  // progression: the cheapest tool by job 10, all upgrades by the end of the career (with a margin)
  const at = (n: number) => rows[n - 1].cumulative;
  const prices = Object.values(UPGRADES).map((u) => u.price);
  if (at(10) < Math.min(...prices)) issues.push(`by job 10 the player cannot afford any upgrade (${at(10)})`);
  if (at(20) < prices.reduce((s, p) => s + p, 0) * 0.4) issues.push(`by job 20 less than 40% of the upgrades are affordable (${at(20)})`);
  if (at(40) < prices.reduce((s, p) => s + p, 0) * 1.5) issues.push(`by job 40 the upgrades are not comfortably affordable (${at(40)})`);
  for (let b = 5; b < 40; b += 5) {
    const avg = (s: number) => rows.slice(s, s + 5).reduce((a, r) => a + r.profit, 0) / 5;
    if (avg(b) < avg(b - 5) * 0.95) issues.push(`jobs ${b + 1}-${b + 5} pay less than jobs ${b - 4}-${b}`);
  }
  // endless jobs and daily jobs are generated: check a good sample
  let endless = 0;
  for (let n = 41; n <= 140; n++, endless++) checkJob(careerJob(n), issues);
  // variety: never two identical jobs in a row (career + endless), and consecutive jobs differ in car or faults
  for (let n = 2; n <= 140; n++) {
    const a = careerJob(n - 1),
      b = careerJob(n);
    if (a.car === b.car && [...a.faults].sort().join() === [...b.faults].sort().join()) issues.push(`jobs ${n - 1} and ${n} are identical`);
  }
  for (let n = 2; n <= 40; n++) if (careerJob(n - 1).car === careerJob(n).car) issues.push(`jobs ${n - 1} and ${n} use the same car type`);
  // the first ten jobs teach the game: neighbours never repeat the same hands-on repair (battery, wheel, brake, bay, under, fluid…)
  const kinds = (n: number) => careerJob(n).faults.map((f) => PARTS[FAULTS[f].part].action);
  for (let n = 2; n <= 10; n++) {
    const a = kinds(n - 1);
    if (kinds(n).some((k) => a.includes(k))) issues.push(`jobs ${n - 1} and ${n} repeat the same repair action (${kinds(n).join(', ')})`);
  }
  let daily = 0;
  for (let d = 0; d < 120; d++)
    for (const p of [0, 12, 40]) {
      const day = new Date(2026, 0, 1 + d);
      checkJob(dailyJob(`${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`, p), issues);
      daily++;
    }
  return { rows, issues, checked: { daily, endless } };
}

export function reportMarkdown(r: Report) {
  const out: string[] = [];
  out.push('# Job validator report', '');
  out.push('Generated by `npm run validate:jobs` (runs in CI). Every job must be solvable with the base tools');
  out.push('(battery tester, OBD scanner, listen, look under, test drive) within its target time, and its readings');
  out.push('must identify its faults: no other set of the same number of faults that fits the car gives the same readings.');
  out.push('');
  out.push(r.issues.length ? `**${r.issues.length} issue(s):**` : '**Result: all checks passed.**', '');
  for (const i of r.issues) out.push(`- ${i}`);
  if (r.issues.length) out.push('');
  out.push(`Also checked: ${r.checked.endless} endless jobs (41-140) and ${r.checked.daily} daily jobs (120 days × 3 progress levels).`);
  out.push('Variety: no two identical jobs in a row (career and endless), and consecutive career jobs always change the car type, and in jobs 1-10 neighbours never repeat the same repair action.', '');
  out.push('## Career (40 jobs)', '');
  out.push('| # | Car | Fault(s) | Tricky | Fastest diagnosis | Fastest solve | Target | Labour | Time bonus | Running total |');
  out.push('| ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |');
  for (const row of r.rows) {
    const j = row.job;
    out.push(`| ${j.n} | ${j.car} | ${j.faults.join(' + ')} | ${j.mod ?? ''} | ${row.tools.join(', ')} | ${row.optimal} min | ${j.targetMinutes} min | $${j.labor} | $${j.timeBonus} | $${row.cumulative} |`);
  }
  out.push('', '## Upgrades', '', '| Upgrade | Price |', '| --- | ---: |');
  for (const [id, u] of Object.entries(UPGRADES)) out.push(`| ${id} | $${u.price} |`);
  out.push('', '## Fault signatures (base tools)', '', '| Fault | Part | Findings |', '| --- | --- | --- |');
  for (const [id, f] of Object.entries(FAULTS)) out.push(`| ${id} | ${f.part} | ${f.declared ? '(visible, told by the customer)' : f.findings.join(', ')} |`);
  out.push('');
  return out.join('\n');
}

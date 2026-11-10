/**
 * Job validator (run in CI by scripts/validate-jobs.ts, report in docs/jobs-report.md): every job is solvable with the
 * base tools within its target time, its readings identify its faults uniquely, difficulty grows, and rewards fit the
 * progression curve (upgrades become affordable as the career goes on).
 */
import { BASE_TOOLS, CAREER, CARS, CAR_TYPES, FAULTS, PARTS, UPGRADES, type CarType, type FaultId, type ToolId } from './data';
import { bestDiagnosis, INFERABLE, lookalikes, toolFindings, toolWorks } from './rules';
import { FEW_SUSPECTS, nextHint, rankSuspects, type Clue } from './diagnosis';
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
  checked: { daily: number; endless: number; relaxed: number };
}

const label = (j: JobDef) => `job ${j.n} (${j.car}: ${j.faults.join(' + ')})`;

const clueOf = (tool: ToolId, faults: FaultId[], car: CarType): Clue => {
  if (!toolWorks(tool, car)) return { tool, findings: [], verdict: 'na' };
  const findings = toolFindings(tool, faults, car);
  return { tool, findings, verdict: findings.length ? 'bad' : 'ok' };
};

/**
 * Relaxed mode: the suspects list puts every true fault in the top 3 (after the fastest diagnosis, after using every
 * base tool, and after one of two faults was fixed, with old or fresh clues), and following the guided hints alone
 * solves the job (the hinted part is always right and in the top 3).
 */
export function checkRelaxed(j: JobDef, issues: string[]) {
  const name = j.daily ? `daily ${j.id}` : label(j);
  const top = (fixed: FaultId[], clues: Clue[]) => rankSuspects({ car: j.car, faults: j.faults, fixed, clues }).slice(0, FEW_SUSPECTS).map((s) => s.part);
  const d = bestDiagnosis(j.faults, j.car);
  const sets: [string, ToolId[]][] = [['fastest diagnosis', d?.tools ?? []], ['all base tools', BASE_TOOLS]];
  for (const [what, tools] of sets) {
    const t3 = top([], tools.map((t) => clueOf(t, j.faults, j.car)));
    for (const f of j.faults) if (!t3.includes(FAULTS[f].part)) issues.push(`${name}: relaxed suspects after the ${what} miss ${FAULTS[f].part} (top 3: ${t3.join(', ')})`);
    for (const fixed of j.faults) {
      if (j.faults.length < 2) break;
      const left = j.faults.filter((f) => f !== fixed);
      for (const [when, clues] of [
        ['old', tools.map((t) => clueOf(t, j.faults, j.car))],
        ['fresh', tools.map((t) => clueOf(t, left, j.car))],
      ] as [string, Clue[]][]) {
        const t = top([fixed], clues);
        for (const f of left) if (!t.includes(FAULTS[f].part)) issues.push(`${name}: after fixing ${fixed}, relaxed suspects (${when} clues, ${what}) miss ${FAULTS[f].part}`);
      }
    }
  }
  const used: ToolId[] = [];
  const fixed: FaultId[] = [];
  let untested = false;
  for (let step = 0; ; step++) {
    if (step > 20) {
      issues.push(`${name}: following the hints does not finish the job`);
      break;
    }
    const h = nextHint({ car: j.car, faults: j.faults, fixed, used, tools: BASE_TOOLS, untested });
    if (h.kind === 'test') {
      if (fixed.length === j.faults.length) break;
      untested = false;
    } else if (h.kind === 'tool') used.push(h.tool);
    else {
      if (!j.faults.includes(h.fault) || fixed.includes(h.fault)) {
        issues.push(`${name}: the hint points to ${h.part}, which is not a fault left`);
        break;
      }
      if (!top(fixed, used.map((t) => clueOf(t, j.faults.filter((f) => !fixed.includes(f)), j.car))).includes(h.part)) issues.push(`${name}: the hinted part ${h.part} is not in the top 3 suspects`);
      fixed.push(h.fault);
      untested = true;
    }
  }
}

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
  checkRelaxed(j, issues);
  relaxedChecked++;
  return d;
}

let relaxedChecked = 0;

export function validate(): Report {
  relaxedChecked = 0;
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
  return { rows, issues, checked: { daily, endless, relaxed: relaxedChecked } };
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
  out.push(`Relaxed mode (${r.checked.relaxed} jobs): the suspects list puts every true fault in the top ${FEW_SUSPECTS} after the fastest diagnosis, after all base tools, and after one of two faults is fixed (old or fresh clues); following only the guided hints solves every job.`);
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

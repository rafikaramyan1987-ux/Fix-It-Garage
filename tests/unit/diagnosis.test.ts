import { describe, expect, it } from 'vitest';
import { BASE_TOOLS, type FaultId, type ToolId } from '../../src/game/data';
import { clearLeader, findingTone, gentleJob, nextHint, rankSuspects, readingTone, whyWrong, type Clue } from '../../src/game/diagnosis';
import { Job } from '../../src/game/job';
import { careerJob, withDifficulty } from '../../src/game/jobs';
import { loadSave, newSave } from '../../src/game/progress';
import { toolFindings } from '../../src/game/rules';
import { validate } from '../../src/game/validate';

const clue = (tool: ToolId, faults: FaultId[], car = 'sedan' as const): Clue => {
  const findings = toolFindings(tool, faults, car);
  return { tool, findings, verdict: findings.length ? 'bad' : 'ok' };
};

describe('clue colours', () => {
  it('a sign of one fault is red, a sign several faults give is orange', () => {
    expect(findingTone('low_volt')).toBe('bad');
    expect(findingTone('clicking')).toBe('warn');
    expect(findingTone('squeal')).toBe('warn');
    expect(readingTone({ verdict: 'ok', findings: [] })).toBe('ok');
    expect(readingTone({ verdict: 'bad', findings: ['squeal'] })).toBe('warn');
    expect(readingTone({ verdict: 'bad', findings: ['squeal', 'thin_pads'] })).toBe('bad');
  });
});

describe('suspects list', () => {
  it('clicking + low voltage puts the battery first, with both clues as the reason', () => {
    const list = rankSuspects({ car: 'sedan', faults: ['dead-battery'], fixed: [], clues: [clue('tester', ['dead-battery']), clue('listen', ['dead-battery'])] });
    expect(list[0].part).toBe('battery');
    expect(list[0].matched.sort()).toEqual(['clicking', 'low_volt']);
    expect(clearLeader(list)).toBe(true);
  });
  it('clicking with a healthy battery points to the starter', () => {
    const list = rankSuspects({ car: 'pickup', faults: ['starter'], fixed: [], clues: [clue('tester', ['starter']), clue('listen', ['starter'])] });
    expect(list[0].part).toBe('starter');
  });
  it('a scratch the customer showed is always on top', () => {
    const list = rankSuspects({ car: 'sedan', faults: ['brake-pads', 'scratch'], fixed: [], clues: [] });
    expect(list[0].part).toBe('paint');
  });
  it('only parts that fit the car (no fuel parts on an electric car)', () => {
    const parts = rankSuspects({ car: 'electric', faults: ['ev-charger'], fixed: [], clues: [] }).map((s) => s.part);
    expect(parts).toContain('chargeport');
    expect(parts).not.toContain('alternator');
    expect(parts).not.toContain('coolant');
  });
});

describe('guided hint', () => {
  it('names the next tool, then the part, then the test', () => {
    const base = { car: 'sedan' as const, faults: ['dead-battery'] as FaultId[], fixed: [] as FaultId[], tools: BASE_TOOLS, untested: false };
    const h1 = nextHint({ ...base, used: [] });
    expect(h1.kind).toBe('tool');
    const h2 = nextHint({ ...base, used: ['tester', 'listen'] });
    expect(h2).toMatchObject({ kind: 'repair', part: 'battery' });
    expect(nextHint({ ...base, used: ['tester'], untested: true }).kind).toBe('test');
  });
});

describe('gentle mistakes and difficulty', () => {
  it('jobs 1-10 are gentle; a refunded part is not charged to the garage', () => {
    expect(gentleJob(1) && gentleJob(10)).toBe(true);
    expect(gentleJob(11) || gentleJob(0)).toBe(false);
    const j = new Job(careerJob(3));
    j.buy('battery');
    j.install('battery');
    j.refund('battery');
    j.buy('oil');
    j.install('oil');
    j.test();
    expect(j.payout().wasted).toBe(0);
    expect(j.payout().notes).toContain('pay.note.wrong');
  });
  it('one line why a wrong part was not the cause', () => {
    expect(whyWrong('pads', 'hatchback', ['alternator'], [clue('drive', ['alternator'], 'hatchback' as 'sedan')])).toEqual({ key: 'gentle.notExplain', clue: 'battery_light' });
    expect(whyWrong('battery', 'van', ['low-oil'], [])).toMatchObject({ key: 'gentle.notShown' });
  });
  it('Expert pays more; old saves load with the difficulty still to choose', () => {
    const j = careerJob(5);
    expect(withDifficulty(j, 'expert').labor).toBeGreaterThan(j.labor);
    expect(withDifficulty(j, 'relaxed')).toBe(j);
    const old = { ...newSave(), settings: { music: true, sfx: false, lang: 'de' } };
    const store = { getItem: () => JSON.stringify(old), setItem: () => {} };
    expect(loadSave(store).settings).toEqual({ music: true, sfx: false, lang: 'de', difficulty: null });
  });
  it('the validator checks the relaxed suspects and hints on every job', () => {
    const r = validate();
    expect(r.issues).toEqual([]);
    expect(r.checked.relaxed).toBeGreaterThanOrEqual(500);
  });
});

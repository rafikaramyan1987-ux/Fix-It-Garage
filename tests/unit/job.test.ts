import { describe, expect, it } from 'vitest';
import { FAULTS, JOBS, PARTS, TOOLS } from '../../src/game/data';
import { BatterySwap, Job } from '../../src/game/job';
import { loadSave, NEW_SAVE, SAVE_KEY, writeSave } from '../../src/app/save';

const job = () => new Job(JOBS[0]);

describe('diagnosis', () => {
  it('each tool costs its minutes once', () => {
    const j = job();
    j.useTool('tester');
    j.useTool('tester');
    expect(j.minutes).toBe(TOOLS.tester.minutes);
    expect(j.clues.size).toBe(1);
  });
  it('the dead battery shows on the tester, scanner and when listening, not under the car', () => {
    const j = job();
    expect(j.reading('tester').verdict).toBe('bad');
    expect(j.reading('obd').verdict).toBe('bad');
    expect(j.reading('listen').verdict).toBe('bad');
    expect(j.reading('lift').verdict).toBe('ok');
  });
  it('the hint reveals a telling clue for free', () => {
    const j = job();
    const t = j.hintTool()!;
    expect(j.reading(t).verdict).toBe('bad');
    j.useTool(t, true);
    expect(j.minutes).toBe(0);
  });
});

describe('repair and payout', () => {
  it('correct part, fast: 3 stars and the customer pays parts + labour + time bonus', () => {
    const j = job();
    j.useTool('tester');
    j.buy('battery');
    j.install('battery');
    expect(j.test()).toBe(true);
    const p = j.payout();
    expect(p.stars).toBe(3);
    expect(p.total).toBe(JOBS[0].labor + PARTS.battery.price + JOBS[0].timeBonus);
    expect(p.wasted).toBe(0);
  });
  it('a wrong part fails the test start, is not paid by the customer and costs a star', () => {
    const j = job();
    j.buy('starter');
    j.install('starter');
    expect(j.test()).toBe(false);
    j.install('battery');
    expect(j.test()).toBe(true);
    const p = j.payout();
    expect(p.wasted).toBe(PARTS.starter.price);
    expect(p.stars).toBeLessThan(3);
  });
  it('the time bonus halves past the target and vanishes past 1.5x', () => {
    const j = job();
    j.addMinutes(JOBS[0].targetMinutes + 1);
    expect(j.timeBonusNow()).toBe(JOBS[0].timeBonus / 2);
    j.addMinutes(JOBS[0].targetMinutes);
    expect(j.timeBonusNow()).toBe(0);
  });
  it('every fault is fixed by a known part', () => {
    for (const f of Object.values(FAULTS)) expect(PARTS[f.part]).toBeTruthy();
  });
});

describe('battery swap procedure', () => {
  it('runs in order: hood, (−) off, (+) off, clamp, out, in, clamp, (+) on, (−) on, hood', () => {
    const s = new BatterySwap();
    const order = ['hood', 'neg', 'pos', 'clamp', 'old', 'new', 'clamp', 'pos', 'neg', 'hood'] as const;
    for (const t of order) expect(s.act(t)).toBe('ok');
    expect(s.step).toBe('done');
  });
  it('refuses (+) before (−) when disconnecting, and (−) before (+) when reconnecting', () => {
    const s = new BatterySwap();
    s.act('hood');
    expect(s.act('pos')).toBe('wrong-order');
    expect(s.step).toBe('loosen');
    for (const t of ['neg', 'pos', 'clamp', 'old', 'new', 'clamp'] as const) s.act(t);
    expect(s.act('neg')).toBe('wrong-order');
    expect(s.act('pos')).toBe('ok');
  });
  it('ignores targets that are not active', () => {
    const s = new BatterySwap();
    expect(s.act('old')).toBe('ignored');
  });
});

describe('save', () => {
  it('round-trips and only uses one known key', () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(loadSave(store)).toEqual(NEW_SAVE);
    writeSave({ ...NEW_SAVE, money: 321, book: ['dead-battery'] }, store);
    expect([...m.keys()]).toEqual([SAVE_KEY]);
    expect(loadSave(store).money).toBe(321);
  });
  it('survives garbage', () => {
    const store = { getItem: () => '{nope', setItem: () => {} };
    expect(loadSave(store).money).toBe(NEW_SAVE.money);
  });
});

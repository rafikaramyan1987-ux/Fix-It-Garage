import { describe, expect, it } from 'vitest';
import { CAREER, FAULTS, PARTS, TOOLS } from '../../src/game/data';
import { BatterySwap, Job, NO_UPGRADES, StarPattern } from '../../src/game/job';
import { careerJob, dailyJob } from '../../src/game/jobs';
import { lookalikes, toolFindings } from '../../src/game/rules';
import { BASE_TOOLS } from '../../src/game/data';
import { buyUpgrade, finishJob, loadSave, newSave, SAVE_KEY, writeSave } from '../../src/game/progress';
import { validate } from '../../src/game/validate';

describe('symptom-clue rules', () => {
  it('a car that will not start cannot be driven or heard running', () => {
    expect(toolFindings('drive', ['dead-battery', 'brake-pads'], 'sedan')).toEqual(['no_start']);
    expect(toolFindings('listen', ['dead-battery', 'brake-pads'], 'sedan')).toEqual(['clicking']);
  });
  it('a classic car has no OBD port, an electric car no exhaust', () => {
    const j = new Job(careerJob(19));
    expect(j.def.car).toBe('classic');
    expect(j.useTool('obd').verdict).toBe('na');
    expect(new Job(careerJob(26)).reading('exhaust').verdict).toBe('na');
  });
  it('battery and starter sound the same: the tester tells them apart', () => {
    expect(toolFindings('listen', ['starter'], 'sedan')).toEqual(toolFindings('listen', ['dead-battery'], 'sedan'));
    expect(lookalikes(['starter'], 'sedan', ['listen', 'drive']).map((g) => g[0])).toContain('dead-battery');
    expect(lookalikes(['starter'], 'sedan', BASE_TOOLS)).toEqual([]);
  });
});

describe('a job', () => {
  it('each tool costs its minutes once', () => {
    const j = new Job(careerJob(1));
    j.useTool('tester');
    j.useTool('tester');
    expect(j.minutes).toBe(TOOLS.tester.minutes);
  });
  it('correct part, fast: 3 stars, the customer pays parts + labour + bonus', () => {
    const j = new Job(careerJob(1));
    j.useTool('tester');
    j.buy('battery');
    expect(j.install('battery')).toBe('dead-battery');
    expect(j.test().ok).toBe(true);
    const p = j.payout();
    expect(p.stars).toBe(3);
    expect(p.total).toBe(j.def.labor + PARTS.battery.price + j.def.timeBonus);
  });
  it('a wrong part is wasted, costs a star, and the test drive says what is left', () => {
    const j = new Job(careerJob(1));
    j.buy('starter');
    expect(j.install('starter')).toBeNull();
    const t = j.test();
    expect(t.ok).toBe(false);
    expect(t.remaining).toEqual(['dead-battery']);
    j.install('battery');
    expect(j.test().ok).toBe(true);
    expect(j.payout().wasted).toBe(PARTS.starter.price);
    expect(j.payout().stars).toBeLessThan(3);
  });
  it('fixed faults stop showing on the tools', () => {
    const j = new Job(careerJob(21));
    expect(j.reading('drive').findings.length).toBe(2);
    j.install('tyre');
    expect(j.reading('drive').findings).toEqual(['battery_light']);
  });
  it('a gasket comes with an oil top-up on the bill', () => {
    const j = new Job(careerJob(18));
    expect(j.partsBill()).toBe(PARTS.gasket.price + PARTS.oil.price);
  });
  it('upgrades make repairs faster and decor brings tips', () => {
    const slow = new Job(careerJob(3), NO_UPGRADES);
    const fast = new Job(careerJob(3), { ...NO_UPGRADES, wrench: true, decor: 2 });
    expect(fast.repairMinutes('tyre')).toBeLessThan(slow.repairMinutes('tyre'));
    fast.install('tyre');
    expect(fast.payout().tips).toBeGreaterThan(0);
  });
  it('picky customers tip only for 3 stars', () => {
    const j = new Job(careerJob(20));
    j.install('catalyst');
    expect(j.payout().tips).toBeGreaterThan(0);
  });
});

describe('mini-action procedures', () => {
  it('battery: (−) off first, (+) on first', () => {
    const s = new BatterySwap();
    s.act('hood');
    expect(s.act('pos')).toBe('wrong-order');
    for (const t of ['neg', 'pos', 'clamp', 'old', 'new', 'clamp'] as const) expect(s.act(t)).toBe('ok');
    expect(s.act('neg')).toBe('wrong-order');
    expect(s.act('pos')).toBe('ok');
    expect(s.act('neg')).toBe('ok');
    expect(s.act('hood')).toBe('ok');
    expect(s.step).toBe('done');
  });
  it('wheel nuts follow the star pattern', () => {
    const p = new StarPattern();
    expect(p.act(1)).toBe(false);
    for (const n of [0, 2, 4, 1, 3]) expect(p.act(n)).toBe(true);
    expect(p.done).toBe(true);
  });
});

describe('career and generated jobs', () => {
  it('has 40 jobs, all 7 car types and at least 15 faults', () => {
    expect(CAREER.length).toBe(40);
    expect(new Set(CAREER.map((j) => j.car)).size).toBe(7);
    expect(Object.values(FAULTS).filter((f) => !f.declared).length).toBeGreaterThanOrEqual(15);
  });
  it('the daily job is the same all day and pays double', () => {
    expect(dailyJob('2026-11-10', 10)).toEqual(dailyJob('2026-11-10', 10));
    expect(dailyJob('2026-11-10', 10).daily).toBe(true);
  });
  it('the validator finds no issue', () => {
    expect(validate().issues).toEqual([]);
  });
});

describe('progress', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { m, store: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } };
  };
  it('round-trips under one known key and survives garbage', () => {
    const { m, store } = mem();
    expect(loadSave(store)).toEqual(newSave());
    const s = newSave();
    s.money = 999;
    writeSave(s, store);
    expect([...m.keys()]).toEqual([SAVE_KEY]);
    expect(loadSave(store).money).toBe(999);
    expect(loadSave({ getItem: () => '{oops', setItem: () => {} }).money).toBe(newSave().money);
  });
  it('finishing a career job advances the career, fills the book and unlocks achievements', () => {
    const s = newSave();
    const j = new Job(careerJob(1));
    j.install('battery');
    j.test();
    const ach = finishJob(s, j.def, j.payout(), j.payout().total, 0, '2026-11-10');
    expect(s.career).toBe(2);
    expect(s.book).toContain('dead-battery');
    expect(ach).toContain('first_fix');
  });
  it('upgrades cost money once', () => {
    const s = newSave();
    s.money = 1000;
    expect(buyUpgrade(s, 'gauge')).toContain('first_upgrade');
    expect(buyUpgrade(s, 'gauge')).toBeNull();
    expect(s.money).toBe(850);
  });
});

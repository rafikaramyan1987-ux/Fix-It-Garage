/**
 * A "first-time player" bot for playtests. It decides every tap only from what is visible on screen: the hint line,
 * the glowing tutorial button, the animated gesture hand (position + kind), buttons, the ticket text, tool readouts
 * and toasts. It never reads job data or the game's internal targets. While it plays it logs every moment a player
 * would hesitate: no visible next action, waits, more than one hint, a hint covering the action, empty screen space.
 *
 * usage: npx tsx scripts/playtest/player.ts <baseUrl> <width>x<height> <jobs> <outDir> [--video] [--start=N] [--daily]
 *   jobs: how many jobs to play from the start (fresh save), e.g. 10
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { chromium, GL_ARGS } from '../pw.mjs';

const args = process.argv.slice(2);
const [base = 'http://127.0.0.1:4173/', size = '390x844', jobsArg = '10', outDir = 'docs/playtest/run'] = args.filter((a) => !a.startsWith('--'));
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}`));
const [W, H] = size.split('x').map(Number);
const JOBS = Number(jobsArg);
const VIDEO = !!flag('video');
const START = Number(flag('start')?.split('=')[1] ?? 0);
const DAILY = !!flag('daily');
const FPS = Number(flag('fps')?.split('=')[1] ?? 10);
const frames = join(outDir, 'frames');
mkdirSync(outDir, { recursive: true });
if (VIDEO) {
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
}

interface Note {
  job: number;
  t: number;
  kind: string;
  what: string;
}
const notes: Note[] = [];
let gameT = 0;
let job = START || 1;
const note = (kind: string, what: string) => {
  notes.push({ job, t: Math.round(gameT * 10) / 10, kind, what });
  console.log(`[job ${job} t=${gameT.toFixed(1)}] ${kind}: ${what}`);
};

const browser = await chromium.launch({ args: GL_ARGS });
const portrait = W < H;
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: portrait ? 2 : 1, hasTouch: portrait, isMobile: portrait });
const page: Page = await ctx.newPage();
await page.addInitScript("window.__name = (f) => f;");
page.on('pageerror', (e) => note('error', e.message));
const q = START ? `&job=${START}` : '';
await page.goto(`${base}?nosdk&capture&lang=en&pr=0.6${q}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });
let frame = 0;

async function tick(sec = 1 / FPS) {
  const n = Math.max(1, Math.round(sec * FPS));
  for (let i = 0; i < n; i++) {
    await page.evaluate(([dt, r]) => {
      window.__game!.tick(dt, r);
    }, [1 / FPS, VIDEO] as [number, boolean]);
    gameT += 1 / FPS;
    if (VIDEO) await page.screenshot({ path: join(frames, `f${String(frame++).padStart(6, '0')}.jpg`), type: 'jpeg', quality: 85, timeout: 180_000 });
  }
}

/** what the screen shows right now (DOM only: what a player can see) */
async function look() {
  return page.evaluate(() => {
    const vis = (e: Element | null) => {
      if (!e) return null;
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      if (!r.width || !r.height || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom, text: (e.textContent ?? '').trim() };
    };
    const all = (sel: string) => [...document.querySelectorAll(sel)].map(vis).filter(Boolean) as NonNullable<ReturnType<typeof vis>>[];
    const g = document.querySelector('.gesture:not(.hidden)');
    const gesture = g ? { ...vis(g)!, kind: [...g.classList].find((c) => c.startsWith('g-'))?.slice(2) ?? 'tap', x: parseFloat((g as HTMLElement).style.left), y: parseFloat((g as HTMLElement).style.top) } : null;
    const hints = all('.hintbar');
    const toolbar = vis(document.querySelector('.toolbar'));
    const tools = [...document.querySelectorAll<HTMLElement>('.toolbar [data-tool]')].map((b) => ({ id: b.dataset.tool!, used: b.classList.contains('used'), locked: b.classList.contains('locked'), pulse: b.classList.contains('pulse'), glow: b.classList.contains('tut-glow'), ...vis(b)! }));
    return {
      menu: vis(document.querySelector('.title [data-action=play]')),
      pay: vis(document.querySelector('.paycard')),
      next: vis(document.querySelector('[data-action=next]')),
      readout: vis(document.querySelector('.readout')),
      readoutBtn: vis(document.querySelector('.readout button')),
      sheet: vis(document.querySelector('.parts-sheet')),
      dialog: vis(document.querySelector('.dialog')),
      center: vis(document.querySelector('[data-action=center]')),
      glow: vis(document.querySelector('.tut-glow')),
      gesture,
      ring: vis(document.querySelector('.ring:not(.hidden)')),
      meter: (() => {
        const m = document.querySelector('.meter');
        if (!m) return null;
        const lvl = parseFloat((m.querySelector('.lvl') as HTMLElement).style.height);
        const z = m.querySelector('.zone') as HTMLElement;
        return { lvl, lo: parseFloat(z.style.bottom), hi: parseFloat(z.style.bottom) + parseFloat(z.style.height) };
      })(),
      hints,
      toasts: all('.toast'),
      toolbar,
      tools,
      ticket: (document.querySelector('.ticket .quote') ?? document.querySelector('.ticket .sq'))?.textContent ?? '',
      twoFaults: !!document.querySelector('.ticket .badge'),
      steps: document.querySelector('.steps')?.getAttribute('data-step') ?? null,
      daily: vis(document.querySelector('[data-action=daily]')),
      skip: vis(document.querySelector('.skipchip:not(.fast)')),
    };
  });
}
type Look = Awaited<ReturnType<typeof look>>;

// ---- the player's car knowledge: visible clue text -> the part a mechanic would order ----
const CLUE_PARTS: [RegExp, string][] = [
  [/too weak to crank|battery voltage too low/i, 'battery'],
  [/not charging|alternator|battery warning light/i, 'alternator'],
  [/misfire|shakes when idling|jerks and hesitates/i, 'plugs'],
  [/fuel pressure|cranks and cranks/i, 'fuelpump'],
  [/too little air|sluggish|not enough air/i, 'airfilter'],
  [/brake pads worn|squeal/i, 'pads'],
  [/brake disc|pedal shakes/i, 'disc'],
  [/nail|1\.2 bar/i, 'tyre'],
  [/tie rod/i, 'tierod'],
  [/very loud roar|rusty hole/i, 'muffler'],
  [/oil dripping/i, 'gasket'],
  [/too hot|118 °C|green coolant/i, 'hose'],
  [/too cold|55 °C/i, 'thermostat'],
  [/catalytic|rotten eggs/i, 'catalyst'],
  [/bounces|shock absorber leaking/i, 'shock'],
  [/charger is broken|will not charge/i, 'chargeport'],
];
const clues: string[] = [];
const fitted: string[] = [];
let toolTries = 0;

function guessParts(l: Look): string[] {
  const text = clues.join(' | ');
  const out = new Set<string>();
  for (const [re, p] of CLUE_PARTS) if (re.test(text)) out.add(p);
  // clicking but the battery tests healthy: the starter
  if (/clicking/i.test(text) && /12\.6 V, healthy/i.test(text)) out.add('starter');
  // oil light but nothing drips: just low oil
  if (/oil pressure light/i.test(text) && /no leaks/i.test(text) && !out.has('gasket')) out.add('oil');
  if (/scratch/i.test(l.ticket)) out.add('paint');
  if (out.has('tierod') && /nail|1\.2 bar/i.test(text) === false) out.delete('tyre');
  return [...out].filter((p) => !fitted.includes(p));
}

async function click(target: { x: number; y: number }) {
  await page.mouse.click(target.x, target.y);
}

async function hold(at: { x: number; y: number }, until: () => Promise<boolean>, max = 4) {
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  for (let t = 0; t < max * FPS; t++) {
    await tick();
    if (await until()) break;
  }
  await page.mouse.up();
}

let idle = 0;
const TRACE = !!flag('trace');
let lastPhase = '';
const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
let dailyStarted = false;
/** time the player spends on purpose (reading a readout, looking through the parts): not a wait */
let selfT = 0;
async function selfTick(sec: number) {
  selfT += sec;
  await tick(sec);
}
let lastGesture = '';
let gestureSeenAt = -1;
let stepStart = 0;
let lastHintCheck = '';

async function act(l: Look): Promise<boolean> {
  // more than one hint line, or a hint over the thing to touch
  if (l.hints.length > 1) note('two hints', l.hints.map((h) => h.text).join(' / '));
  if (l.gesture) {
    for (const h of [...l.hints, ...l.toasts]) {
      if (l.gesture.x > h.l - 10 && l.gesture.x < h.r + 10 && l.gesture.y > h.t - 10 && l.gesture.y < h.b + 10) note('hint covers action', h.text);
    }
  }
  const hk = l.hints.map((h) => h.text).join('');
  if (hk && hk !== lastHintCheck) {
    lastHintCheck = hk;
    for (const h of l.hints) if (h.b - h.t > 48) note('hint wraps', h.text);
  }
  // a failed test drive names what is still wrong: remember it as a clue
  for (const tt of l.toasts) if (/not fixed/i.test(tt.text) && !clues.includes(tt.text)) clues.push(tt.text);
  // "tap to speed up": a player taps right away
  if (l.skip) {
    await page.mouse.click(W / 2, H * 0.4);
    note('skip', 'tapped to speed up a wait');
    return true;
  }
  if (l.dialog) {
    const cancel = await page.$('.dialog .btn.ghost');
    if (cancel) await cancel.click();
    return true;
  }
  if (l.pay && l.next) {
    note('step', `paid: ${l.pay.text.slice(0, 80)}`);
    clues.length = 0;
    fitted.length = 0;
    toolTries = 0;
    if (job >= JOBS + (START ? START - 1 : 0)) {
      const menu = await page.$('[data-action=menu]');
      if (menu) await menu.click();
      return false;
    }
    await selfTick(0.6);
    await click(l.next);
    // count the job once the pay card has really gone (a click during its pop-in animation can miss)
    await tick();
    if (!(await page.$('.paycard'))) job++;
    stepStart = gameT;
    return true;
  }
  if (l.readout && l.readoutBtn) {
    clues.push(l.readout.text);
    await selfTick(0.8); // reading time
    await click(l.readoutBtn);
    return true;
  }
  if (l.sheet) {
    const want = guessParts(l)[0];
    if (!want) {
      note('stuck', 'parts sheet open but the clues do not point to a part yet');
      await page.click('.sheet .btn.ghost');
      return true;
    }
    // look through the tabs for the part
    const tabs = await page.$$('.tabs .tab');
    let tries = 0;
    for (const tab of tabs) {
      const found = await page.$(`.part[data-part=${want}]`);
      if (found) break;
      await tab.click();
      tries++;
      await selfTick(0.3);
    }
    if (tries > 1) note('hesitation', `looked through ${tries} part tabs to find "${want}"`);
    await page.click(`.part[data-part=${want}]`);
    await selfTick(0.3);
    await page.click('[data-action=order]');
    fitted.push(want);
    return true;
  }
  if (l.center) {
    await click(l.center);
    return true;
  }
  if (l.gesture) {
    const key = `${l.gesture.kind}@${Math.round(l.gesture.x / 20)},${Math.round(l.gesture.y / 20)}`;
    if (key !== lastGesture) {
      lastGesture = key;
      gestureSeenAt = gameT;
    }
    const at = { x: l.gesture.x, y: l.gesture.y };
    if (l.meter) {
      await hold(at, async () => {
        const m = (await look()).meter;
        return !m || m.lvl >= m.lo + 4;
      }, 6);
      return true;
    }
    if (l.gesture.kind === 'tap') await click(at);
    else if (l.gesture.kind === 'hold') {
      await hold(at, async () => !(await look()).ring, 3);
    } else if (l.gesture.kind === 'lift') {
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) {
        await page.mouse.move(at.x, at.y - i * 14);
        await tick();
      }
      await page.mouse.up();
    } else if (l.gesture.kind === 'rub') {
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      for (let i = 0; i < 60; i++) {
        await page.mouse.move(at.x + (i % 2 ? -30 : 30), at.y + ((i % 4) - 1.5) * 5, { steps: 3 });
        await tick();
        const g = (await look()).gesture;
        if (!g || g.kind !== 'rub') break;
      }
      await page.mouse.up();
    }
    return true;
  }
  if (l.toolbar && l.tools.length) {
    const glow = l.tools.find((t) => t.glow);
    if (glow) {
      await click(glow);
      return true;
    }
    const test = l.tools.find((t) => t.id === 'test');
    // a pulsing Test button is the obvious next move
    if (test && test.pulse && fitted.length) {
      await click(test);
      return true;
    }
    const parts = guessParts(l);
    const need = l.twoFaults ? 2 : 1;
    const repair = l.tools.find((t) => t.id === 'repair')!;
    if (parts.length && (parts.length >= need - fitted.length || toolTries >= 5)) {
      await click(repair);
      return true;
    }
    const order = ['tester', 'listen', 'lift', 'obd', 'drive', 'gauge', 'exhaust'];
    const next = order.map((id) => l.tools.find((t) => t.id === id)).find((t) => t && !t.used && !t.locked);
    if (next) {
      toolTries++;
      await click(next);
      return true;
    }
    if (parts.length) {
      await click(repair);
      return true;
    }
    note('stuck', `all tools used, clues do not point to a part: ${clues.join(' | ').slice(0, 160)}`);
    return false;
  }
  if (l.menu && DAILY && l.daily && !dailyStarted) {
    dailyStarted = true;
    await click(l.daily);
    await tick(0.4);
    const start = await page.$('[data-action=daily-start]');
    if (start) await start.click();
    return true;
  }
  return false;
}

const deadline = 60 * 60; // game seconds
let waitStart = gameT;
const waitPhases: string[] = [];
let ended = false;
while (gameT < deadline && !ended) {
  const l = await look();
  if (l.menu && !DAILY) {
    note('step', 'back at the main menu');
    break;
  }
  const did = await act(l);
  if (did) {
    const waited = gameT - waitStart - selfT;
    // (the game phase is read only to label the note, never to decide what to tap)
    if (waited > 2.05) note('wait', `${waited.toFixed(1)} s with nothing to do (${l.steps ?? 'menu'}; ${waitPhases.join(' > ')})`);
    idle = 0;
    await tick(0.2); // a player reacts in ~0.2 s
    waitStart = gameT;
    selfT = 0;
    waitPhases.length = 0;
  } else {
    if (l.menu && DAILY && dailyStarted) ended = true;
    idle++;
    const ph = await page.evaluate(() => String(window.__game?.play.phase ?? ''));
    if (waitPhases[waitPhases.length - 1] !== ph) waitPhases.push(ph);
    if (TRACE && ph !== lastPhase) console.log(`[trace ${fmt(gameT)}] job ${job} ${ph}`);
    lastPhase = ph;
    await tick();
    if (idle > 40 * FPS) {
      note('stuck', 'nothing on screen tells what to do for 40 s');
      break;
    }
  }
  if (l.gesture && gestureSeenAt >= 0 && gameT - gestureSeenAt > 6) {
    note('slow step', 'the same gesture stayed for more than 6 s');
    gestureSeenAt = gameT;
  }
  void stepStart;
}
await browser.close();
writeFileSync(join(outDir, 'notes.json'), JSON.stringify(notes, null, 2));
console.log(`played ${job - (START || 1) + 1} job(s) in ${gameT.toFixed(0)} s game time, ${notes.length} notes`);
if (VIDEO) {
  const n = readdirSync(frames).length;
  const out = flag('out')?.split('=')[1] ?? join(outDir, 'video.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(frames, 'f%06d.jpg'), '-vf', `scale=${W}:${H}:flags=lanczos`, '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', W >= 1280 ? '35' : '28', '-r', String(FPS), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out]);
  console.log(`wrote ${out} (${n} frames, ${(n / FPS).toFixed(0)} s)`);
}

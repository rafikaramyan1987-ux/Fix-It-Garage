/**
 * Sound effects, synthesised at runtime with the Web Audio API (no audio files to download).
 * The AudioContext starts on the first user input (browser autoplay rules).
 */

let ctx: AudioContext | null = null;
/** sound effects bus */
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
/** the portal / an ad asks for silence */
let muted = false;
let sfxOn = true;
let musicOn = true;
let musicTimer: ReturnType<typeof setInterval> | null = null;
let nextBar = 0;
let bar = 0;
let engineLoop: { stop: () => void } | null = null;

export function unlockAudio() {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      musicBus = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);
      musicBus.connect(comp);
      applyGains();
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
  }
  if (ctx?.state === 'suspended') void ctx.resume();
  startMusic();
}

function applyGains() {
  if (!ctx || !master || !musicBus) return;
  master.gain.setTargetAtTime(muted || !sfxOn ? 0 : 0.8, ctx.currentTime, 0.02);
  musicBus.gain.setTargetAtTime(muted || !musicOn ? 0 : 0.22, ctx.currentTime, 0.05);
}

/** portal / ad silence (overrides the player's settings while on) */
export function setMuted(m: boolean) {
  muted = m;
  applyGains();
}
export function setSfx(on: boolean) {
  sfxOn = on;
  applyGains();
}
export function setMusic(on: boolean) {
  musicOn = on;
  applyGains();
}
export const isMuted = () => muted;

// ---------- music: a gentle, looping lo-fi tune, scheduled a little ahead ----------
const CHORDS = [
  [57, 60, 64, 67],
  [53, 57, 60, 64],
  [55, 59, 62, 65],
  [52, 55, 59, 62],
];
const MELODY = [76, 74, 72, 74, 76, 79, 76, 74, 72, 71, 72, 74, 72, 69, 67, 69];
const BEAT = 0.5;
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

function note(freq: number, t: number, dur: number, vol: number, type: OscillatorType) {
  if (!ctx || !musicBus) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function scheduleBar(t: number) {
  const ch = CHORDS[bar % CHORDS.length];
  for (const n of ch) note(midi(n), t, BEAT * 4, 0.05, 'triangle');
  note(midi(ch[0] - 12), t, BEAT * 1.8, 0.12, 'sine');
  note(midi(ch[0] - 12), t + BEAT * 2, BEAT * 1.8, 0.1, 'sine');
  for (let i = 0; i < 4; i++) {
    const m = MELODY[(bar * 4 + i) % MELODY.length];
    if ((bar + i) % 3 !== 2) note(midi(m), t + i * BEAT, BEAT * 0.9, 0.05, 'sine');
  }
  bar++;
}

function startMusic() {
  if (!ctx || musicTimer) return;
  nextBar = ctx.currentTime + 0.2;
  musicTimer = setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    while (nextBar < ctx.currentTime + 1.2) {
      scheduleBar(nextBar);
      nextBar += BEAT * 4;
    }
  }, 250);
}

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, delay = 0, slideTo?: number) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  env(g, t, 0.005, vol, dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, vol = 0.3, freq = 2000, q = 1, delay = 0, type: BiquadFilterType = 'bandpass', attack = 0.003) {
  if (!ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, attack, vol, dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + attack + 0.05);
}

export const sfx = {
  tap: () => tone(660, 0.08, 'sine', 0.16, 0, 880),
  /** a tap on nothing in particular */
  miss: () => tone(300, 0.06, 'sine', 0.08, 0, 240),
  pop: () => {
    tone(520, 0.1, 'triangle', 0.22, 0, 1040);
  },
  /** one ratchet click */
  ratchet: () => {
    noise(0.03, 0.25, 4200, 4);
    tone(1800, 0.02, 'square', 0.04);
  },
  /** bolt comes loose / reaches torque */
  clink: () => {
    tone(1900, 0.25, 'sine', 0.16);
    tone(2850, 0.18, 'sine', 0.08, 0.01);
  },
  torque: () => {
    noise(0.05, 0.35, 3000, 3);
    tone(1500, 0.3, 'sine', 0.14, 0.02);
    tone(2250, 0.22, 'sine', 0.07, 0.03);
  },
  thud: () => {
    tone(110, 0.25, 'sine', 0.34, 0, 55);
    noise(0.12, 0.2, 400, 1, 0, 'lowpass');
  },
  lift: () => noise(0.6, 0.12, 900, 2, 0, 'bandpass', 0.1),
  hood: () => {
    tone(240, 0.3, 'triangle', 0.08, 0, 300);
    noise(0.15, 0.1, 1200, 2);
  },
  hoodShut: () => {
    tone(90, 0.3, 'sine', 0.32, 0, 50);
    noise(0.1, 0.22, 700, 1, 0, 'lowpass');
  },
  beep: () => tone(1320, 0.12, 'square', 0.08),
  bad: () => {
    tone(330, 0.18, 'triangle', 0.15, 0, 260);
    tone(260, 0.25, 'triangle', 0.15, 0.15, 200);
  },
  good: () => {
    tone(660, 0.12, 'triangle', 0.18);
    tone(990, 0.2, 'triangle', 0.18, 0.1);
  },
  spark: () => {
    noise(0.12, 0.26, 6000, 0.7, 0, 'highpass');
    noise(0.06, 0.2, 3000, 2, 0.08);
  },
  /** starter solenoid clicking on a flat battery */
  clicking: (n = 8) => {
    for (let i = 0; i < n; i++) {
      noise(0.025, 0.28, 2600, 3, i * 0.09);
      tone(180, 0.03, 'square', 0.05, i * 0.09);
    }
  },
  /** cranking + catch, then idle loop until engineStop() */
  engineStart: () => {
    if (!ctx || !master) return;
    for (let i = 0; i < 6; i++) noise(0.09, 0.3, 300, 1.5, i * 0.13, 'bandpass', 0.02);
    tone(70, 0.8, 'sawtooth', 0.12, 0, 120);
    const t = ctx.currentTime + 0.75;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(30, t);
    o.frequency.exponentialRampToValueAtTime(95, t + 0.35);
    o.frequency.exponentialRampToValueAtTime(42, t + 1.2);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 22;
    const lg = ctx.createGain();
    lg.gain.value = 6;
    lfo.connect(lg).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.24, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.12, t + 1.2);
    o.connect(f).connect(g).connect(master);
    o.start(t);
    lfo.start(t);
    const c = ctx;
    engineLoop = {
      stop: () => {
        const n = c.currentTime;
        g.gain.cancelScheduledValues(n);
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), n);
        g.gain.exponentialRampToValueAtTime(0.0001, n + 0.4);
        o.stop(n + 0.5);
        lfo.stop(n + 0.5);
      },
    };
  },
  engineStop: () => {
    engineLoop?.stop();
    engineLoop = null;
  },
  /** short drive-by engine for arrivals / departures */
  drive: (dur = 2.2) => {
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(45, t);
    o.frequency.linearRampToValueAtTime(70, t + dur * 0.4);
    o.frequency.linearRampToValueAtTime(40, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.1);
  },
  coin: (delay = 0) => {
    tone(1568, 0.08, 'square', 0.06, delay);
    tone(2093, 0.25, 'square', 0.06, delay + 0.07);
  },
  cash: () => {
    noise(0.08, 0.25, 3000, 2);
    tone(2637, 0.6, 'sine', 0.15, 0.05);
    tone(3520, 0.5, 'sine', 0.1, 0.09);
  },
  star: (i: number) => {
    const f = [880, 1109, 1319][i] ?? 1319;
    tone(f, 0.35, 'triangle', 0.2);
    tone(f * 2, 0.25, 'sine', 0.06, 0.02);
  },
  whoosh: () => noise(0.25, 0.15, 1500, 0.8, 0, 'bandpass', 0.08),
  /** the engine turns over and over but never catches */
  cranking: () => {
    for (let i = 0; i < 12; i++) {
      noise(0.08, 0.28, 320, 1.5, i * 0.1, 'bandpass', 0.02);
      tone(85, 0.08, 'sawtooth', 0.06, i * 0.1, 70);
    }
  },
  /** an electric car switching on */
  evOn: () => {
    tone(440, 0.25, 'sine', 0.12, 0, 880);
    tone(660, 0.35, 'sine', 0.08, 0.15, 1320);
  },
  /** impact wrench */
  buzz: () => {
    noise(0.05, 0.2, 2200, 3);
    tone(240, 0.05, 'square', 0.05);
  },
  sand: () => noise(0.12, 0.12, 5000, 0.7, 0, 'highpass', 0.03),
  spray: () => noise(0.18, 0.1, 7000, 0.5, 0, 'highpass', 0.04),
};

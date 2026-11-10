/**
 * Game clock: every animation, delay and tween runs on this clock (not setTimeout / CSS time), so the game can be
 * paused for ads and stepped frame by frame for screenshots and the preview video.
 */

type Task = { at: number; fn: () => void };
type Tw = { t0: number; dur: number; fn: (k: number) => void; ease: (k: number) => number; done: () => void };

export const ease = {
  linear: (k: number) => k,
  out: (k: number) => 1 - (1 - k) ** 3,
  inOut: (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2),
  back: (k: number) => {
    const c = 1.70158;
    return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2;
  },
  in: (k: number) => k * k * k,
};

class Clock {
  t = 0;
  /** fast-forward factor (a tap during a skippable wait speeds the game up) */
  scale = 1;
  private tasks: Task[] = [];
  private tweens: Tw[] = [];
  private frameFns = new Set<(dt: number, t: number) => void>();

  update(dt: number) {
    dt *= this.scale;
    this.t += dt;
    const due = this.tasks.filter((x) => x.at <= this.t);
    if (due.length) this.tasks = this.tasks.filter((x) => x.at > this.t);
    for (const x of due) x.fn();
    for (const tw of [...this.tweens]) {
      const k = Math.min(1, (this.t - tw.t0) / tw.dur);
      tw.fn(tw.ease(k));
      if (k >= 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.done();
      }
    }
    for (const f of [...this.frameFns]) f(dt, this.t);
  }

  wait(sec: number) {
    return new Promise<void>((res) => this.tasks.push({ at: this.t + sec, fn: res }));
  }

  later(sec: number, fn: () => void) {
    this.tasks.push({ at: this.t + sec, fn });
  }

  tween(dur: number, fn: (k: number) => void, e: (k: number) => number = ease.inOut) {
    return new Promise<void>((done) => {
      if (dur <= 0) {
        fn(1);
        done();
        return;
      }
      fn(e(0));
      this.tweens.push({ t0: this.t, dur, fn, ease: e, done });
    });
  }

  /** drop every pending wait, tween and frame callback without resolving them (abandoning a job) */
  cancelAll() {
    this.tasks = [];
    this.tweens = [];
    this.frameFns.clear();
  }

  /** run every frame until the returned function is called */
  every(fn: (dt: number, t: number) => void) {
    this.frameFns.add(fn);
    return () => this.frameFns.delete(fn);
  }
}

export const clock = new Clock();
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

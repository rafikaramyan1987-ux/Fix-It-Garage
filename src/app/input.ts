/**
 * Pointer input on 3D targets: tap, press-and-hold (ratchet a bolt) and lift-drag (pull a battery out).
 * The play flow awaits `interact()`; holds advance on the game clock so they also work in frame-stepped capture.
 */
import type * as THREE from 'three';
import { clock } from './clock';
import type { Stage } from '../render/stage';

export interface Target {
  id: string;
  obj: THREE.Object3D;
  mode: 'tap' | 'hold' | 'lift';
  /** seconds to hold */
  hold?: number;
  /** called on press: return false to refuse (wrong order etc.) */
  guard?: () => boolean;
  onHoldStart?: () => void;
  onHold?: (k: number, t: number) => void;
  onHoldCancel?: () => void;
  /** lift: 0..1 as the pointer drags upward */
  onLift?: (k: number) => void;
}

export class Input {
  private targets: Target[] = [];
  private resolve: ((id: string) => void) | null = null;
  private active: { t: Target; x0: number; y0: number; t0: number; k: number; stop?: () => void } | null = null;
  enabled = true;
  /** last pointer position (for the hold ring) */
  x = 0;
  y = 0;

  constructor(private stage: Stage) {
    const c = stage.canvas;
    c.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', () => this.up());
    window.addEventListener('pointercancel', () => this.up(true));
  }

  /** wait until the player completes an action on one of the targets */
  interact(targets: Target[]): Promise<string> {
    this.cancel();
    this.targets = targets;
    return new Promise((res) => (this.resolve = res));
  }

  /** the targets currently waiting for input (for markers / tests) */
  current() {
    return this.targets;
  }

  cancel() {
    this.active?.stop?.();
    this.active = null;
    this.targets = [];
    this.resolve = null;
  }

  private finish(id: string) {
    const r = this.resolve;
    this.active?.stop?.();
    this.active = null;
    this.targets = [];
    this.resolve = null;
    r?.(id);
  }

  private down(e: PointerEvent) {
    this.x = e.clientX;
    this.y = e.clientY;
    if (!this.enabled || !this.targets.length || this.active) return;
    const hit = this.stage.pickNear(e.clientX, e.clientY, this.targets.map((t) => t.obj));
    const t = this.targets.find((x) => x.obj === hit);
    if (!t) return;
    if (t.guard && !t.guard()) return;
    const a = { t, x0: e.clientX, y0: e.clientY, t0: clock.t, k: 0 } as NonNullable<Input['active']>;
    this.active = a;
    if (t.mode === 'tap') {
      this.finish(t.id);
      return;
    }
    if (t.mode === 'hold') {
      t.onHoldStart?.();
      const need = t.hold ?? 0.8;
      a.stop = clock.every((_dt, now) => {
        a.k = Math.min(1, (now - a.t0) / need);
        t.onHold?.(a.k, now);
        if (a.k >= 1) this.finish(t.id);
      });
    }
  }

  private move(e: PointerEvent) {
    this.x = e.clientX;
    this.y = e.clientY;
    const a = this.active;
    if (!a || a.t.mode !== 'lift') return;
    a.k = Math.max(0, Math.min(1, (a.y0 - e.clientY) / 90));
    a.t.onLift?.(a.k);
  }

  private up(cancelled = false) {
    const a = this.active;
    if (!a) return;
    if (a.t.mode === 'hold') {
      a.stop?.();
      this.active = null;
      a.t.onHoldCancel?.();
      return;
    }
    if (a.t.mode === 'lift') {
      const quickTap = clock.t - a.t0 < 0.35 || a.k === 0;
      if (!cancelled && (a.k >= 0.5 || quickTap)) this.finish(a.t.id);
      else {
        a.t.onLift?.(0);
        this.active = null;
      }
    }
  }
}

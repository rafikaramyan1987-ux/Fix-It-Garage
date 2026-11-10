/** Camera rig: named shots framed for any aspect ratio (16:9 landscape or phone portrait), smooth moves between them. */
import * as THREE from 'three';
import { clock, ease } from '../app/clock';

export interface Shot {
  target: THREE.Vector3;
  /** direction from the target toward the camera */
  dir: THREE.Vector3;
  /** radius of the subject that must stay in frame */
  radius: number;
  /** portrait: move the framed point up (+) / down (-) in world units, to clear the UI */
  portraitShift?: number;
  landscapeShift?: number;
  /** portrait (phone) only: a different viewing direction (usually steeper, so the subject fills a tall screen) */
  portraitDir?: THREE.Vector3;
  /** portrait only: a different radius (tighter: the free area of a phone is narrow but tall) */
  portraitRadius?: number;
}

export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.05, 80);
  private pos = new THREE.Vector3(4, 3.5, 8);
  private look = new THREE.Vector3(0, 1, 0);
  private shot: Shot | null = null;
  private moving = 0;
  /** gentle idle sway */
  sway = 1;
  /** screen size in CSS px */
  private vw = 1;
  private vh = 1;
  /** the screen strips covered by UI (top HUD, bottom toolbar), in CSS px: the subject is framed in what is left */
  private inset = { top: 0, bottom: 0 };
  private want = { top: 0, bottom: 0 };

  /** tell the rig which strips of the screen are covered by UI; the framing follows smoothly */
  setInsets(top: number, bottom: number) {
    // never give away more than 55% of the screen, the subject must stay big
    const max = this.vh * 0.55;
    const k = top + bottom > max ? max / (top + bottom) : 1;
    this.want.top = Math.max(0, top * k);
    this.want.bottom = Math.max(0, bottom * k);
  }

  resize(w: number, h: number) {
    const portrait = h > w;
    this.vw = w;
    this.vh = h;
    this.camera.aspect = w / h;
    this.camera.fov = portrait ? 52 : 38;
    this.camera.updateProjectionMatrix();
    if (this.shot && !this.moving) this.snap(this.shot);
  }

  /** the point the camera looks at */
  get target() {
    return this.look;
  }

  get portrait() {
    return this.camera.aspect < 1;
  }

  frame(s: Shot, inset = this.want) {
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    // the subject is fitted into the free band between the top and bottom UI
    const free = Math.max(0.3, 1 - (inset.top + inset.bottom) / this.vh);
    const vFree = Math.atan(Math.tan(vHalf) * free);
    const lim = Math.min(vFree, hHalf);
    const portrait = this.portrait;
    const dist = (portrait ? (s.portraitRadius ?? s.radius) : s.radius) / Math.sin(lim);
    const target = s.target.clone();
    const shift = portrait ? (s.portraitShift ?? 0) : (s.landscapeShift ?? 0);
    target.y -= shift;
    const dir = (portrait && s.portraitDir ? s.portraitDir : s.dir).clone().normalize();
    return { pos: target.clone().addScaledVector(dir, dist), look: target };
  }

  /** move the projection centre to the middle of the free band (an off-centre view, no camera move needed) */
  private offset() {
    const oy = (this.inset.bottom - this.inset.top) / 2;
    if (Math.abs(oy) < 0.5) {
      if (this.camera.view) this.camera.clearViewOffset();
      return;
    }
    this.camera.setViewOffset(this.vw, this.vh, 0, oy, this.vw, this.vh);
  }

  snap(s: Shot) {
    this.shot = s;
    this.inset.top = this.want.top;
    this.inset.bottom = this.want.bottom;
    this.offset();
    const f = this.frame(s);
    this.pos.copy(f.pos);
    this.look.copy(f.look);
    this.apply(0);
  }

  private gen = 0;
  async go(s: Shot, dur = 0.9) {
    this.shot = s;
    const f = this.frame(s);
    const p0 = this.pos.clone();
    const l0 = this.look.clone();
    // a newer move takes over from one still running
    const g = ++this.gen;
    // moves stay short: the player is waiting for them
    dur *= 0.8;
    this.moving++;
    await clock.tween(dur, (k) => {
      if (g !== this.gen) return;
      this.pos.lerpVectors(p0, f.pos, k);
      this.look.lerpVectors(l0, f.look, k);
    }, ease.inOut);
    this.moving--;
  }

  /** a short camera shake (thud, engine catching) */
  private shakeT = 0;
  private shakeAmp = 0;
  shake(amp = 0.03, dur = 0.3) {
    this.shakeAmp = amp;
    this.shakeT = dur;
  }

  apply(t: number, dt = 0) {
    // the framing follows the UI strips smoothly (a toolbar sliding in, a sheet closing)
    const k = 1 - Math.exp(-dt * 7);
    const di = Math.abs(this.inset.top - this.want.top) + Math.abs(this.inset.bottom - this.want.bottom);
    if (di > 0.2) {
      this.inset.top += (this.want.top - this.inset.top) * k;
      this.inset.bottom += (this.want.bottom - this.inset.bottom) * k;
      this.offset();
    }
    if (this.shot && !this.moving && dt > 0) {
      const f = this.frame(this.shot, this.inset);
      this.pos.lerp(f.pos, k);
      this.look.lerp(f.look, k);
    }
    this.camera.position.copy(this.pos);
    const s = this.sway * 0.04;
    this.camera.position.x += Math.sin(t * 0.35) * s;
    this.camera.position.y += Math.sin(t * 0.5) * s * 0.5;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeT) * 3;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
    }
    this.camera.lookAt(this.look);
    this.camera.updateMatrixWorld();
  }
}

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
}

export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.05, 80);
  private pos = new THREE.Vector3(4, 3.5, 8);
  private look = new THREE.Vector3(0, 1, 0);
  private shot: Shot | null = null;
  private moving = 0;
  /** gentle idle sway */
  sway = 1;

  resize(w: number, h: number) {
    const portrait = h > w;
    this.camera.aspect = w / h;
    this.camera.fov = portrait ? 52 : 38;
    this.camera.updateProjectionMatrix();
    if (this.shot && !this.moving) this.snap(this.shot);
  }

  get portrait() {
    return this.camera.aspect < 1;
  }

  frame(s: Shot) {
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    const lim = Math.min(vHalf, hHalf);
    const dist = s.radius / Math.sin(lim);
    const target = s.target.clone();
    const shift = this.portrait ? (s.portraitShift ?? 0) : (s.landscapeShift ?? 0);
    target.y -= shift;
    return { pos: target.clone().addScaledVector(s.dir.clone().normalize(), dist), look: target };
  }

  snap(s: Shot) {
    this.shot = s;
    const f = this.frame(s);
    this.pos.copy(f.pos);
    this.look.copy(f.look);
    this.apply(0);
  }

  async go(s: Shot, dur = 0.9) {
    this.shot = s;
    const f = this.frame(s);
    const p0 = this.pos.clone();
    const l0 = this.look.clone();
    this.moving++;
    await clock.tween(dur, (k) => {
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

/**
 * A slot: a place on the car where one part sits, held by bolts. The same swap routine works in the engine bay
 * (bolts face up) and under the car (bolts face down): loosen bolts, pull the old part out, put the new one in,
 * tighten bolts.
 */
import * as THREE from 'three';
import { clock, ease, lerp } from '../app/clock';
import type { PartId } from '../game/data';
import { cyl, mat, shade } from './geom';
import { buildPart } from './parts';

export interface Slot {
  part: PartId;
  parent: THREE.Object3D;
  home: THREE.Vector3;
  rotY: number;
  rotX: number;
  obj: THREE.Group;
  bolts: THREE.Group[];
  boltHome: THREE.Vector3[];
  /** direction (parent space) the part comes out */
  out: THREE.Vector3;
  /** bolts face down (under the car) */
  down: boolean;
}

export function makeNut() {
  const g = new THREE.Group();
  g.add(cyl(0.022, 0.022, 0.022, mat('#c9ced6', 0.3, 0.8), 6));
  const stud = cyl(0.008, 0.008, 0.045, mat('#9aa1aa', 0.3, 0.8), 8);
  g.add(stud);
  return shade(g);
}

export function makeSlot(parent: THREE.Object3D, part: PartId, home: THREE.Vector3, boltOffsets: [number, number, number][], opts: { rotY?: number; rotX?: number; down?: boolean; out?: THREE.Vector3 } = {}): Slot {
  const obj = buildPart(part, false);
  obj.position.copy(home);
  obj.rotation.set(opts.rotX ?? 0, opts.rotY ?? 0, 0);
  parent.add(obj);
  const down = !!opts.down;
  const bolts: THREE.Group[] = [];
  const boltHome: THREE.Vector3[] = [];
  for (const [x, y, z] of boltOffsets) {
    const n = makeNut();
    const p = home.clone().add(new THREE.Vector3(x, y, z));
    n.position.copy(p);
    if (down) n.rotation.x = Math.PI;
    parent.add(n);
    bolts.push(n);
    boltHome.push(p);
  }
  return { part, parent, home: home.clone(), rotY: opts.rotY ?? 0, rotX: opts.rotX ?? 0, obj, bolts, boltHome, out: opts.out ?? new THREE.Vector3(0, down ? -1 : 1, 0), down };
}

/** nut spin while the ratchet works it: 0..1 */
export function spinBolt(s: Slot, i: number, k: number, loosening: boolean) {
  const n = s.bolts[i];
  n.rotation.y = k * Math.PI * 6 * (loosening ? 1 : -1);
  const lift = (loosening ? k : 1 - k) * 0.025 * (s.down ? -1 : 1);
  n.position.copy(s.boltHome[i]).add(new THREE.Vector3(0, lift, 0));
}

/** a loosened bolt pops out of the way (or back in) */
export async function boltOut(s: Slot, i: number, out: boolean) {
  const n = s.bolts[i];
  const from = n.position.clone();
  const to = out ? s.boltHome[i].clone().add(new THREE.Vector3(0, s.down ? -0.06 : 0.06, 0)) : s.boltHome[i].clone();
  await clock.tween(0.18, (k) => n.position.lerpVectors(from, to, k));
  n.visible = !out;
}

/** lift the old part out of the slot and drop it at a world point */
export async function removePart(s: Slot, worldDrop: THREE.Vector3, scene: THREE.Object3D) {
  const o = s.obj;
  const start = o.getWorldPosition(new THREE.Vector3());
  const outW = s.out.clone().transformDirection(s.parent.matrixWorld).multiplyScalar(0.3);
  scene.attach(o);
  const mid = start.clone().add(outW);
  await clock.tween(0.3, (k) => o.position.lerpVectors(start, mid, k), ease.out);
  const r0 = o.rotation.y;
  await clock.tween(0.5, (k) => {
    o.position.lerpVectors(mid, worldDrop, k);
    o.position.y += Math.sin(k * Math.PI) * 0.2;
    o.rotation.y = lerp(r0, r0 + 0.6, k);
  });
}

/** the new part flies from where it is into the slot */
export async function placePart(s: Slot, fresh: THREE.Group, scene: THREE.Object3D) {
  const startW = fresh.getWorldPosition(new THREE.Vector3());
  const endW = s.parent.localToWorld(s.home.clone());
  const outW = s.out.clone().transformDirection(s.parent.matrixWorld).multiplyScalar(0.3);
  const approach = endW.clone().add(outW);
  scene.attach(fresh);
  const q0 = fresh.quaternion.clone();
  const target = new THREE.Quaternion();
  s.parent.getWorldQuaternion(target).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(s.rotX, s.rotY, 0)));
  await clock.tween(0.55, (k) => {
    fresh.position.lerpVectors(startW, approach, k);
    fresh.position.y += Math.sin(k * Math.PI) * 0.25;
    fresh.quaternion.slerpQuaternions(q0, target, k);
  });
  await clock.tween(0.22, (k) => fresh.position.lerpVectors(approach, endW, k), ease.in);
  s.parent.attach(fresh);
  fresh.position.copy(s.home);
  fresh.rotation.set(s.rotX, s.rotY, 0);
  s.obj = fresh;
}

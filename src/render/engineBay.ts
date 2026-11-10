/**
 * The open engine bay drawn on top of a car's hood for the close-up repair: engine, battery with terminals and
 * hold-down clamp, the hinged hood panel, plus the hand tools used on it (ratchet, battery tester).
 */
import * as THREE from 'three';
import { clock, ease, lerp } from '../app/clock';
import type { Car } from './cars';
import { at, cyl, mat, rbox, shade } from './geom';
import { labelTexture, ScreenTexture } from './textures';
import type { PartId } from '../game/data';
import { makeSlot, type Slot } from './slots';

export type BayTarget = 'hood' | 'neg' | 'pos' | 'clamp' | 'old' | 'new';

function nut(m: THREE.Material) {
  const g = new THREE.Group();
  const hex = cyl(0.022, 0.022, 0.022, m, 6);
  const stud = cyl(0.008, 0.008, 0.05, mat('#9aa1aa', 0.3, 0.8), 8);
  stud.position.y = 0.0;
  g.add(hex, stud);
  return shade(g);
}

export function buildBattery(fresh: boolean) {
  const g = new THREE.Group();
  const caseM = mat(fresh ? '#1d2230' : '#3a3c40', fresh ? 0.35 : 0.75);
  g.add(rbox(0.3, 0.18, 0.2, caseM, 0.018));
  const lid = rbox(0.3, 0.03, 0.2, mat(fresh ? '#283044' : '#4a4c50', 0.6), 0.012);
  lid.position.y = 0.09;
  g.add(lid);
  const lab = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.1),
    new THREE.MeshStandardMaterial({
      map: labelTexture('12V', fresh ? '#22c27a' : '#8c8f94', fresh ? '#ffffff' : '#e8e8e8', 256, 128, 'bold 64px Fredoka, Nunito, sans-serif'),
      roughness: 0.6,
    }),
  );
  at(lab, 0, -0.01, 0.1015);
  g.add(lab);
  // posts (+ toward the engine, − toward the fender)
  for (const [x, c] of [
    [0.09, '#d6453b'],
    [-0.09, '#30333a'],
  ] as [number, string][]) {
    const post = cyl(0.02, 0.022, 0.035, mat('#b9a77a', 0.4, 0.6), 12);
    at(post, x, 0.12, 0.05);
    const ring = cyl(0.032, 0.032, 0.008, mat(c, 0.5), 14);
    at(ring, x, 0.105, 0.05);
    g.add(post, ring);
  }
  // corrosion on the old one
  if (!fresh) {
    const crust = mat('#e8f1e6', 0.9);
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.008 + (i % 3) * 0.004, 6, 5), crust);
      s.position.set(0.09 + Math.sin(i * 2.1) * 0.03, 0.115, 0.05 + Math.cos(i * 1.7) * 0.03);
      g.add(s);
    }
  }
  return shade(g);
}

/** cable clamp on a battery post, with its nut */
class Terminal {
  readonly group = new THREE.Group();
  readonly nut: THREE.Group;
  readonly clampMesh: THREE.Mesh;
  readonly cable: THREE.Mesh;
  private curve: THREE.CatmullRomCurve3;
  readonly home = new THREE.Vector3();
  constructor(
    readonly sign: 1 | -1,
    color: string,
    cableEnd: THREE.Vector3,
  ) {
    const m = mat(color, 0.5, 0.1);
    this.clampMesh = rbox(0.07, 0.03, 0.06, m, 0.012);
    this.nut = nut(mat('#c9ced6', 0.3, 0.8));
    this.nut.position.set(0, 0.03, 0.022);
    this.group.add(this.clampMesh, this.nut);
    this.curve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), cableEnd.clone()]);
    this.cable = new THREE.Mesh(new THREE.TubeGeometry(this.curve, 16, 0.014, 6), mat(color, 0.6));
    this.cable.castShadow = true;
  }
  /** rebuild the cable from the clamp (in bay coords) to its fixed end */
  updateCable() {
    const p = this.group.position;
    const end = this.curve.points[3];
    this.curve.points[0].set(p.x, p.y, p.z - 0.02);
    this.curve.points[1].set(p.x + this.sign * 0.02, p.y - 0.01, p.z - 0.09);
    this.curve.points[2].set(lerp(p.x, end.x, 0.6), Math.max(p.y, end.y) + 0.03, lerp(p.z, end.z, 0.6) - 0.05);
    this.curve.updateArcLengths();
    this.cable.geometry.dispose();
    this.cable.geometry = new THREE.TubeGeometry(this.curve, 16, 0.014, 6);
  }
}

export class EngineBay {
  readonly group = new THREE.Group();
  readonly hoodPivot = new THREE.Group();
  readonly hoodPanel: THREE.Mesh;
  oldBattery: THREE.Group;
  newBattery: THREE.Group | null = null;
  readonly batteryHome = new THREE.Vector3();
  readonly clampBar = new THREE.Group();
  readonly clampNut: THREE.Group;
  readonly neg: Terminal;
  readonly pos: Terminal;
  readonly W: number;
  readonly L: number;
  /** swappable parts in the bay */
  readonly slots: Partial<Record<PartId, Slot>> = {};
  /** fluid caps (tap to open) */
  oilCap: THREE.Mesh | null = null;
  coolantCap!: THREE.Mesh;
  private hoodOpen = 0;
  private pulseOff: (() => void) | null = null;
  private pulsing: THREE.Object3D[] = [];

  constructor(readonly car: Car) {
    const W = Math.min(car.size.x - 0.32, 1.1);
    const L = Math.max(0.5, car.frontZ - 0.1 - car.hoodBackZ);
    this.W = W;
    this.L = L;
    const g = this.group;
    g.position.set(0, car.hoodY - 0.01, car.hoodBackZ + L / 2 + 0.02);
    const paint = new THREE.MeshStandardMaterial({ color: car.paint, roughness: 0.38, metalness: 0.15 });
    const dark = mat('#2c3038', 0.85);
    // tray: floor + painted rim
    const floor = rbox(W, 0.1, L, dark, 0.01);
    floor.position.y = -0.02;
    g.add(floor);
    for (const [w, d, x, z] of [
      [W + 0.06, 0.04, 0, L / 2],
      [W + 0.06, 0.04, 0, -L / 2],
      [0.04, L, W / 2, 0],
      [0.04, L, -W / 2, 0],
    ] as const) {
      const wall = rbox(w, 0.2, d, paint, 0.015);
      at(wall, x, -0.04, z);
      g.add(wall);
    }
    if (car.ev) this.buildEv(W, L);
    else this.buildEngine(W, L);
    shade(g);

    // battery at the front-left
    this.batteryHome.set(-W / 2 + 0.2, 0.12, L / 2 - 0.16);
    this.oldBattery = buildBattery(false);
    this.oldBattery.position.copy(this.batteryHome);
    g.add(this.oldBattery);
    // terminals (positions in bay coords)
    const bh = this.batteryHome;
    this.pos = new Terminal(1, '#d6453b', new THREE.Vector3(W * 0.05, 0.12, -L * 0.2));
    this.neg = new Terminal(-1, '#30333a', new THREE.Vector3(-W / 2 + 0.03, 0.08, -L * 0.25));
    for (const t of [this.pos, this.neg]) {
      t.home.set(bh.x + t.sign * 0.09, bh.y + 0.13, bh.z + 0.05);
      t.group.position.copy(t.home);
      t.updateCable();
      shade(t.group);
      g.add(t.group, t.cable);
    }
    // hold-down clamp bar with its nut
    const bar = rbox(0.05, 0.02, 0.24, mat('#7d8590', 0.4, 0.6), 0.008);
    this.clampNut = nut(mat('#c9ced6', 0.3, 0.8));
    this.clampNut.position.set(0, 0.02, 0.09);
    this.clampBar.add(bar, this.clampNut);
    this.clampBar.position.set(bh.x - 0.01, bh.y + 0.115, bh.z - 0.02);
    shade(this.clampBar);
    g.add(this.clampBar);

    // hinged hood panel
    this.hoodPanel = rbox(W + 0.14, 0.035, L + 0.08, paint, 0.03);
    this.hoodPanel.position.set(0, 0, L / 2 + 0.02);
    this.hoodPivot.position.set(0, 0.08, -L / 2 - 0.02);
    this.hoodPivot.add(this.hoodPanel);
    const inner = rbox(W * 0.8, 0.01, L * 0.8, mat('#8b93a1', 0.7), 0.01);
    inner.position.set(0, -0.022, L / 2 + 0.02);
    this.hoodPivot.add(inner);
    shade(this.hoodPivot);
    g.add(this.hoodPivot);

    car.body.add(g);
    this.group.visible = false;
  }

  /** a fuel engine: block, plug rail, alternator, starter, air box, thermostat, hose, reservoir, fuse box */
  private buildEngine(W: number, L: number) {
    const g = this.group;
    const ex = W * 0.12;
    const block = rbox(W * 0.42, 0.13, L * 0.62, mat('#8d949e', 0.45, 0.6), 0.02);
    at(block, ex, 0.1, -0.02);
    const cover = rbox(W * 0.36, 0.05, L * 0.5, mat('#ff8a3d', 0.35, 0.2), 0.02);
    at(cover, ex, 0.185, -0.02);
    g.add(block, cover);
    this.oilCap = cyl(0.03, 0.03, 0.025, mat('#ffd23f', 0.4), 14);
    at(this.oilCap, ex + W * 0.12, 0.222, L * 0.16);
    g.add(this.oilCap);
    this.slots.plugs = makeSlot(g, 'plugs', new THREE.Vector3(ex - 0.02, 0.222, -0.04), [[-0.17, 0, 0], [0.17, 0, 0]]);
    this.slots.alternator = makeSlot(g, 'alternator', new THREE.Vector3(ex - W * 0.12, 0.12, L / 2 - 0.1), [[-0.07, 0.07, 0], [0.07, 0.07, 0]]);
    this.slots.starter = makeSlot(g, 'starter', new THREE.Vector3(ex - W * 0.3, 0.09, -0.02), [[0, 0.06, -0.06], [0, 0.06, 0.06]], { rotY: Math.PI / 2 });
    this.slots.thermostat = makeSlot(g, 'thermostat', new THREE.Vector3(ex + W * 0.17, 0.235, L * 0.17), [[-0.06, 0, 0], [0.06, 0, 0]]);
    this.slots.hose = makeSlot(g, 'hose', new THREE.Vector3(W * 0.34, 0.12, L / 2 - 0.06), [[-0.15, 0.03, 0], [0.15, 0.03, 0]]);
    // air box with the filter on top
    const airbox = rbox(W * 0.2, 0.08, L * 0.42, mat('#25282e', 0.6), 0.03);
    at(airbox, W * 0.38, 0.06, -L * 0.12);
    g.add(airbox);
    this.slots.airfilter = makeSlot(g, 'airfilter', new THREE.Vector3(W * 0.38, 0.115, -L * 0.12), [[0, 0, -0.1], [0, 0, 0.1]], { rotY: Math.PI / 2 });
    this.buildReservoir(-W * 0.12, -L * 0.3);
    const fuse = rbox(0.14, 0.08, 0.11, mat('#25282e', 0.6), 0.02);
    at(fuse, -W * 0.36, 0.07, -L * 0.28);
    g.add(fuse);
  }

  /** an electric car: drive unit with orange high-voltage cables, charging module, reservoir */
  private buildEv(W: number, L: number) {
    const g = this.group;
    const unit = rbox(W * 0.4, 0.12, L * 0.55, mat('#59647a', 0.4, 0.5), 0.03);
    at(unit, W * 0.05, 0.09, -0.04);
    const lid = rbox(W * 0.34, 0.03, L * 0.45, mat('#2f6fd6', 0.4, 0.3), 0.02);
    at(lid, W * 0.05, 0.165, -0.04);
    g.add(unit, lid);
    for (const dz of [-0.06, 0.06]) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(W * 0.25, 0.12, dz), new THREE.Vector3(W * 0.3, 0.2, dz), new THREE.Vector3(W * 0.36, 0.16, dz - 0.05)]);
      const hv = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.016, 6), mat('#ff8a3d', 0.5));
      g.add(hv);
    }
    this.slots.chargeport = makeSlot(g, 'chargeport', new THREE.Vector3(W * 0.33, 0.1, -L * 0.18), [[-0.11, 0.06, 0.07], [0.11, 0.06, -0.07]]);
    this.slots.hose = makeSlot(g, 'hose', new THREE.Vector3(W * 0.3, 0.1, L / 2 - 0.07), [[-0.15, 0.03, 0], [0.15, 0.03, 0]]);
    this.buildReservoir(-W * 0.12, -L * 0.3);
  }

  private buildReservoir(x: number, z: number) {
    const g = this.group;
    const res = rbox(0.12, 0.1, 0.1, new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.2, transparent: true, opacity: 0.75 }), 0.02);
    at(res, x, 0.09, z);
    const liquid = rbox(0.1, 0.05, 0.08, mat('#ff5fa2', 0.3), 0.015);
    at(liquid, x, 0.065, z);
    this.coolantCap = cyl(0.026, 0.026, 0.022, mat('#2f6fd6', 0.4), 12);
    at(this.coolantCap, x, 0.15, z);
    g.add(res, liquid, this.coolantCap);
  }

  /** world-space position of a bay-local point */
  world(v: THREE.Vector3) {
    return this.group.localToWorld(v.clone());
  }

  /** the object a target id refers to (for picking, markers and the progress ring) */
  object(t: BayTarget): THREE.Object3D {
    switch (t) {
      case 'hood':
        return this.hoodPanel;
      case 'neg':
        return this.neg.group;
      case 'pos':
        return this.pos.group;
      case 'clamp':
        return this.clampBar;
      case 'old':
        return this.oldBattery;
      case 'new':
        return this.newBattery ?? this.oldBattery;
    }
  }

  setHood(k: number) {
    this.hoodOpen = k;
    this.hoodPivot.rotation.x = -1.2 * k;
  }

  async openHood() {
    this.group.visible = true;
    await clock.tween(0.55, (k) => this.setHood(k), ease.back);
  }

  async closeHood() {
    const from = this.hoodOpen;
    await clock.tween(0.35, (k) => this.setHood(from * (1 - k)), ease.in);
  }

  hide() {
    this.group.visible = false;
  }



  /** loosen (`up`) or tighten a terminal clamp: the nut climbs / sinks, the clamp lifts off the post */
  async terminal(t: 'neg' | 'pos', loose: boolean) {
    const term = t === 'neg' ? this.neg : this.pos;
    const g = term.group;
    const from = g.position.clone();
    const to = loose ? term.home.clone().add(new THREE.Vector3(term.sign * 0.05, 0.05, 0.02)) : term.home.clone();
    const r0 = g.rotation.z;
    const r1 = loose ? -term.sign * 0.5 : 0;
    await clock.tween(0.3, (k) => {
      g.position.lerpVectors(from, to, k);
      g.rotation.z = lerp(r0, r1, k);
      term.updateCable();
    });
  }

  /** nut animation while the ratchet works it */
  spinNut(t: 'neg' | 'pos' | 'clamp', progress: number, loosening: boolean) {
    const n = t === 'clamp' ? this.clampNut : (t === 'neg' ? this.neg : this.pos).nut;
    n.rotation.y = progress * Math.PI * 6 * (loosening ? 1 : -1);
    const base = t === 'clamp' ? 0.02 : 0.03;
    n.position.y = base + (loosening ? progress : 1 - progress) * 0.015;
  }

  async clamp(off: boolean) {
    const b = this.clampBar;
    const home = new THREE.Vector3(this.batteryHome.x - 0.01, this.batteryHome.y + 0.115, this.batteryHome.z - 0.02);
    const aside = new THREE.Vector3(-this.W / 2 - 0.02, 0.2, -this.L / 2 + 0.1);
    const from = b.position.clone();
    const to = off ? aside : home;
    await clock.tween(0.45, (k) => {
      b.position.lerpVectors(from, to, k);
      b.position.y += Math.sin(k * Math.PI) * 0.12;
      b.rotation.y = off ? k * 1.2 : (1 - k) * 1.2;
    });
  }

  /** the old battery is pulled up and out, onto the floor next to the car */
  async removeOld(floorWorld: THREE.Vector3) {
    const b = this.oldBattery;
    const start = b.getWorldPosition(new THREE.Vector3());
    const parent = this.car.root.parent!;
    parent.attach(b);
    const up = start.clone().add(new THREE.Vector3(0, 0.35, 0));
    await clock.tween(0.35, (k) => b.position.lerpVectors(start, up, k), ease.out);
    await clock.tween(0.55, (k) => {
      b.position.lerpVectors(up, floorWorld, k);
      b.position.y += Math.sin(k * Math.PI) * 0.25;
      b.rotation.y = k * 0.6;
    });
  }

  /** the new battery flies from the cart into the tray */
  async placeNew(bat: THREE.Group) {
    this.newBattery = bat;
    const startW = bat.getWorldPosition(new THREE.Vector3());
    const endW = this.world(this.batteryHome);
    const aboveW = endW.clone().add(new THREE.Vector3(0, 0.35, 0));
    const parent = this.car.root.parent!;
    parent.attach(bat);
    const r0 = bat.rotation.y;
    await clock.tween(0.6, (k) => {
      bat.position.lerpVectors(startW, aboveW, k);
      bat.position.y += Math.sin(k * Math.PI) * 0.3;
      bat.rotation.y = lerp(r0, this.car.root.rotation.y, k);
    });
    await clock.tween(0.25, (k) => bat.position.lerpVectors(aboveW, endW, k), ease.in);
    this.group.attach(bat);
    bat.position.copy(this.batteryHome);
    bat.rotation.set(0, 0, 0);
  }

  /** pulse the given targets so the player sees what can be touched */
  pulse(objs: THREE.Object3D[]) {
    this.pulseOff?.();
    this.pulseOff = null;
    for (const o of this.pulsing) setEmissive(o, 0);
    this.pulsing = objs;
    if (!this.pulsing.length) return;
    this.pulseOff = clock.every((_dt, t) => {
      const k = 0.5 + 0.5 * Math.sin(t * 7);
      for (const o of this.pulsing) setEmissive(o, 0.03 + k * 0.12);
    });
  }
}

const emissiveOwned = new WeakSet<THREE.Material>();
function setEmissive(o: THREE.Object3D, k: number) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    let mm = m.material as THREE.MeshStandardMaterial;
    if (!emissiveOwned.has(mm)) {
      mm = mm.clone();
      emissiveOwned.add(mm);
      m.material = mm;
    }
    mm.emissive.set('#fff4cc');
    mm.emissiveIntensity = k;
  });
}

/** the ratchet wrench that appears on a nut while the player holds it */
export class Ratchet {
  readonly group = new THREE.Group();
  private handle = new THREE.Group();
  constructor() {
    const steel = mat('#d5dae1', 0.25, 0.85);
    const socket = cyl(0.028, 0.028, 0.06, steel, 14);
    socket.position.y = 0.03;
    const head = cyl(0.04, 0.04, 0.03, steel, 16);
    head.position.y = 0.07;
    const bar = rbox(0.24, 0.025, 0.035, steel, 0.01);
    bar.position.set(0.13, 0.07, 0);
    const grip = rbox(0.12, 0.04, 0.045, mat('#e4473c', 0.5), 0.015);
    grip.position.set(0.22, 0.07, 0);
    this.handle.add(head, bar, grip);
    this.group.add(socket, this.handle);
    shade(this.group);
    this.group.visible = false;
  }
  showAt(world: THREE.Vector3, parent: THREE.Object3D) {
    parent.add(this.group);
    this.group.position.copy(parent.worldToLocal(world.clone()));
    this.group.visible = true;
    this.group.scale.setScalar(0.01);
    void clock.tween(0.15, (k) => this.group.scale.setScalar(Math.max(0.01, k)), ease.back);
  }
  /** swing the handle back and forth */
  swing(t: number) {
    this.handle.rotation.y = 0.6 + Math.sin(t * 14) * 0.45;
  }
  hide() {
    this.group.visible = false;
  }
}

/** the handheld battery tester with its two leads */
export class Tester {
  readonly group = new THREE.Group();
  readonly screen = new ScreenTexture();
  readonly leads: { mesh: THREE.Mesh; end: THREE.Mesh; curve: THREE.CatmullRomCurve3 }[] = [];
  constructor() {
    const body = rbox(0.2, 0.05, 0.28, mat('#ffcf33', 0.45), 0.03);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.094), new THREE.MeshBasicMaterial({ map: this.screen.texture, toneMapped: false }));
    face.rotation.x = -Math.PI / 2;
    face.position.set(0, 0.027, -0.04);
    const btn = cyl(0.022, 0.022, 0.012, mat('#2f6fd6', 0.4), 12);
    btn.position.set(0, 0.03, 0.07);
    this.group.add(body, face, btn);
    for (const c of ['#d6453b', '#30333a']) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.008, 5), mat(c, 0.5));
      const end = rbox(0.035, 0.03, 0.06, mat(c, 0.4), 0.01);
      this.group.add(mesh, end);
      this.leads.push({ mesh, end, curve });
    }
    shade(this.group);
    this.group.visible = false;
  }
  /** place lead i's clamp at a point in the tester's local frame; the lead arches from the nearest end of the device */
  setLead(i: number, local: THREE.Vector3) {
    const L = this.leads[i];
    const sz = local.z >= 0 ? 1 : -1;
    const start = new THREE.Vector3(i === 0 ? 0.045 : -0.045, 0.03, sz * 0.13);
    L.end.position.copy(local).add(new THREE.Vector3(0, 0.015, 0));
    L.curve.points[0].copy(start);
    L.curve.points[1].set(start.x, start.y + 0.06, start.z + sz * 0.05);
    L.curve.points[2].set(lerp(start.x, local.x, 0.6), Math.max(start.y, local.y) + 0.09, lerp(start.z, local.z, 0.6));
    L.curve.points[3].copy(local).add(new THREE.Vector3(0, 0.03, 0));
    L.curve.updateArcLengths();
    L.mesh.geometry.dispose();
    L.mesh.geometry = new THREE.TubeGeometry(L.curve, 20, 0.011, 6);
  }
  rest() {
    this.setLead(0, new THREE.Vector3(0.07, 0, -0.22));
    this.setLead(1, new THREE.Vector3(-0.07, 0, -0.22));
  }
}

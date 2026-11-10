/** The garage: room, lighting props, tool bench, parts shelf, two-post lift and decorations. All procedural. */
import * as THREE from 'three';
import type { UpgradeId } from '../game/data';
import { at, blob, box, cyl, group, mat, rbox, shade } from './geom';
import { brickTexture, floorTexture, labelTexture, outsideTexture, pegboardTexture, posterTexture, wallTexture, woodTexture } from './textures';

export const ROOM = { x0: -7, x1: 7, z0: -5, z1: 4.5, h: 3.8, doorW: 3.6, doorH: 2.6 };

export interface Lift {
  group: THREE.Group;
  /** moves up and down with the car */
  carriage: THREE.Group;
  arms: THREE.Object3D[];
  /** control box buttons: raise (green) / lower (red) */
  up: THREE.Object3D;
  down: THREE.Object3D;
}

export interface Garage {
  root: THREE.Group;
  lift: Lift;
  cart: THREE.Group;
  /** spot on the cart where a delivered part sits */
  cartTop: THREE.Vector3;
  shelfBattery: THREE.Object3D;
  lamps: THREE.Mesh[];
  /** the bought upgrades, shown in the garage (hidden until owned) */
  upgrades: Record<UpgradeId, THREE.Object3D>;
}

function room(root: THREE.Group) {
  const { x0, x1, z0, z1, h, doorW, doorH } = ROOM;
  const w = x1 - x0;
  const d = z1 - z0;
  // floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w + 2, d + 4), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.42, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, (z0 + z1) / 2 + 1);
  floor.receiveShadow = true;
  root.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.9 });
  const brickMat = new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.85 });
  const wainH = 1.0;
  // back wall, in pieces around the door
  const sideW = (w - doorW) / 2;
  for (const s of [-1, 1]) {
    const cx = s * (doorW / 2 + sideW / 2);
    const upper = new THREE.Mesh(new THREE.PlaneGeometry(sideW, h - wainH), wallMat);
    at(upper, cx, wainH + (h - wainH) / 2, z0);
    const lower = new THREE.Mesh(new THREE.PlaneGeometry(sideW, wainH), brickMat);
    at(lower, cx, wainH / 2, z0 + 0.001);
    upper.receiveShadow = lower.receiveShadow = true;
    root.add(upper, lower);
    // door jamb
    const jamb = rbox(0.18, doorH, 0.3, mat('#f2b134', 0.5), 0.03);
    at(jamb, s * (doorW / 2 + 0.09), doorH / 2, z0);
    root.add(jamb);
  }
  const lintel = new THREE.Mesh(new THREE.PlaneGeometry(doorW, h - doorH), wallMat);
  at(lintel, 0, doorH + (h - doorH) / 2, z0);
  root.add(lintel);
  const header = rbox(doorW + 0.36, 0.2, 0.3, mat('#f2b134', 0.5), 0.03);
  at(header, 0, doorH + 0.1, z0);
  root.add(header);
  // rolled-up door drum
  const drum = cyl(0.22, 0.22, doorW, mat('#9aa3ad', 0.4, 0.5));
  drum.rotation.z = Math.PI / 2;
  at(drum, 0, doorH + 0.45, z0 + 0.3);
  root.add(drum);
  // wall trim line
  const trim = box(w, 0.06, 0.04, mat('#ffffff', 0.5));
  at(trim, 0, wainH, z0 + 0.02);
  root.add(trim);

  // side walls: full height at the back, low at the front so the camera sees in
  for (const s of [-1, 1]) {
    const x = s > 0 ? x1 : x0;
    const zFull = s > 0 ? z0 + 2.2 : -0.2;
    const fullD = zFull - z0;
    const upper = new THREE.Mesh(new THREE.PlaneGeometry(fullD, h - wainH), wallMat);
    upper.rotation.y = -s * (Math.PI / 2);
    upper.position.set(x, wainH + (h - wainH) / 2, (z0 + zFull) / 2);
    const lower = new THREE.Mesh(new THREE.PlaneGeometry(d, wainH), brickMat);
    lower.rotation.y = -s * (Math.PI / 2);
    lower.position.set(x - s * 0.001, wainH / 2, (z0 + z1) / 2);
    upper.receiveShadow = lower.receiveShadow = true;
    const t2 = box(0.04, 0.06, d, mat('#ffffff', 0.5));
    t2.position.set(x - s * 0.02, wainH, (z0 + z1) / 2);
    root.add(upper, lower, t2);
  }
  // diorama wall caps (the room is seen cut away from above)
  const capM = mat('#8a5a3c', 0.7);
  const capB = rbox(w + 0.5, 0.18, 0.3, capM, 0.04);
  at(capB, 0, h + 0.09, z0 - 0.1);
  root.add(capB);
  for (const s of [-1, 1]) {
    const zFull = s > 0 ? z0 + 2.2 : -0.2;
    const fullD = zFull - z0;
    const cap = rbox(0.3, 0.18, fullD + 0.2, capM, 0.04);
    at(cap, s * (x1 + 0.1), h + 0.09, (z0 + zFull) / 2);
    const side = box(0.2, h, fullD, mat('#e9dcc4', 0.9));
    at(side, s * (x1 + 0.1), h / 2, (z0 + zFull) / 2);
    const step = rbox(0.3, h - wainH + 0.18, 0.3, capM, 0.04);
    at(step, s * (x1 + 0.1), wainH + (h - wainH + 0.18) / 2, zFull);
    const lowD = z1 - zFull;
    const low = box(0.2, wainH, lowD, mat('#e9dcc4', 0.9));
    at(low, s * (x1 + 0.1), wainH / 2, zFull + lowD / 2);
    const lowCap = rbox(0.3, 0.14, lowD + 0.15, capM, 0.04);
    at(lowCap, s * (x1 + 0.1), wainH + 0.07, zFull + lowD / 2);
    root.add(cap, side, step, low, lowCap);
  }

  // outside: lawn, driveway and the street backdrop seen through the door
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), mat('#a9d98f', 0.95));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(0, -0.02, -10);
  lawn.receiveShadow = true;
  root.add(lawn);
  const drive = new THREE.Mesh(new THREE.PlaneGeometry(doorW + 1.2, 6), mat('#9a9ca3', 0.9));
  drive.rotation.x = -Math.PI / 2;
  drive.position.set(0, -0.005, z0 - 3);
  drive.receiveShadow = true;
  root.add(drive);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.4), new THREE.MeshBasicMaterial({ map: outsideTexture(), toneMapped: false }));
  back.position.set(0, 1.45, z0 - 3.4);
  root.add(back);
}

function hazard() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f7c531';
  g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#222';
  for (let x = -32; x < 160; x += 32) {
    g.beginPath();
    g.moveTo(x, 32);
    g.lineTo(x + 16, 32);
    g.lineTo(x + 32, 0);
    g.lineTo(x + 16, 0);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function lift(): Lift {
  const g = new THREE.Group();
  const blue = mat('#2f6fd6', 0.35, 0.2);
  const dark = mat('#3b4250', 0.5, 0.4);
  const yellow = mat('#f7c531', 0.45);
  const hz = new THREE.MeshStandardMaterial({ map: hazard(), roughness: 0.6 });
  const carriage = new THREE.Group();
  const arms: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const x = s * 1.32;
    const base = rbox(0.5, 0.06, 0.5, hz, 0.02);
    at(base, x, 0.03, 0);
    const post = rbox(0.24, 2.7, 0.3, blue, 0.04);
    at(post, x, 1.38, 0);
    const cap = rbox(0.3, 0.1, 0.36, dark, 0.03);
    at(cap, x, 2.76, 0);
    g.add(base, post, cap);
    // carriage + two swing arms per post
    const car = rbox(0.18, 0.4, 0.36, yellow, 0.03);
    at(car, x - s * 0.18, 0.28, 0);
    carriage.add(car);
    for (const dz of [-1, 1]) {
      const arm = new THREE.Group();
      const bar = rbox(0.62, 0.07, 0.11, dark, 0.02);
      bar.position.x = -s * 0.31;
      const pad = cyl(0.08, 0.08, 0.06, mat('#222', 0.8), 14);
      pad.position.set(-s * 0.6, 0.06, 0);
      arm.add(bar, pad);
      arm.position.set(x - s * 0.2, 0.1, dz * 0.12);
      arm.rotation.y = dz * s * 0.75;
      carriage.add(arm);
      arms.push(arm);
    }
  }
  // overhead beam
  const beam = rbox(2.9, 0.16, 0.22, blue, 0.04);
  at(beam, 0, 2.76, 0);
  g.add(beam);
  // control box
  const ctrl = rbox(0.18, 0.26, 0.1, mat('#e9ecef', 0.4), 0.02);
  at(ctrl, 1.32, 1.3, 0.2);
  const btn = cyl(0.03, 0.03, 0.02, mat('#2ecc71', 0.3, 0, { emissive: '#2ecc71', emissiveIntensity: 0.6 }));
  btn.rotation.x = Math.PI / 2;
  at(btn, 1.32, 1.34, 0.26);
  const btn2 = btn.clone();
  btn2.material = mat('#e74c3c', 0.3, 0, { emissive: '#e74c3c', emissiveIntensity: 0.6 });
  btn2.position.y = 1.25;
  g.add(ctrl, btn, btn2);
  g.add(carriage);
  shade(g);
  return { group: g, carriage, arms, up: btn, down: btn2 };
}

function bench(root: THREE.Group) {
  const g = new THREE.Group();
  const top = rbox(2.6, 0.08, 0.7, new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.7 }), 0.02);
  top.position.y = 0.58;
  g.add(top);
  const red = mat('#e4473c', 0.4, 0.1);
  const steel = mat('#cfd5dc', 0.35, 0.6);
  // drawer cabinets
  for (const s of [-1, 1]) {
    const cab = rbox(0.7, 0.54, 0.62, red, 0.03);
    at(cab, s * 0.9, 0.27, 0);
    g.add(cab);
    for (let i = 0; i < 3; i++) {
      const handle = rbox(0.3, 0.025, 0.03, steel, 0.01);
      at(handle, s * 0.9, 0.12 + i * 0.16, 0.32);
      const line = box(0.66, 0.008, 0.005, mat('#a8302a', 0.6));
      at(line, s * 0.9, 0.2 + i * 0.16, 0.311);
      g.add(handle, line);
    }
  }
  const shelf = rbox(1.1, 0.04, 0.55, mat('#8a5a3c', 0.7), 0.01);
  at(shelf, 0, 0.12, 0);
  g.add(shelf);
  // vice
  const vice = group(rbox(0.16, 0.1, 0.2, mat('#3d6fb6', 0.4, 0.3), 0.02), at(rbox(0.16, 0.08, 0.04, steel, 0.01), 0, 0.08, 0.1));
  at(vice, 1.0, 0.68, 0.1);
  // radio
  const radio = group(
    rbox(0.32, 0.18, 0.12, mat('#f39c45', 0.5), 0.03),
    at(cyl(0.05, 0.05, 0.02, mat('#333', 0.7)), -0.07, 0, 0.065),
    at(rbox(0.1, 0.05, 0.01, mat('#bff0d0', 0.3, 0, { emissive: '#7fdc9f', emissiveIntensity: 0.4 }), 0.005), 0.07, 0.03, 0.062),
  );
  (radio.children[1] as THREE.Mesh).rotation.x = Math.PI / 2;
  at(radio, -0.85, 0.71, -0.12, 0.15);
  // oil can + rag
  const can = group(cyl(0.06, 0.06, 0.16, mat('#2a9d8f', 0.4, 0.3)), at(cyl(0.012, 0.02, 0.12, mat('#2a9d8f', 0.4, 0.3)), 0.05, 0.1, 0));
  (can.children[1] as THREE.Mesh).rotation.z = -0.8;
  at(can, -0.3, 0.7, 0.05);
  const rag = rbox(0.24, 0.02, 0.16, mat('#5a8de0', 0.95), 0.008);
  at(rag, 0.3, 0.63, 0.12, 0.4);
  g.add(vice, radio, can, rag);
  shade(g);
  at(g, -4.4, 0, ROOM.z0 + 0.4);
  root.add(g, at(blob(3.2, 1.2, 0.55), -4.4, 0, ROOM.z0 + 0.45));

  // pegboard with tools
  const peg = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.15), new THREE.MeshStandardMaterial({ map: pegboardTexture(), roughness: 0.85 }));
  peg.receiveShadow = true;
  at(peg, -4.4, 1.5, ROOM.z0 + 0.02);
  root.add(peg);
  const toolMat = [mat('#c7ccd3', 0.3, 0.7), mat('#e4473c', 0.5), mat('#2f6fd6', 0.5), mat('#f2b134', 0.5)];
  const tools = new THREE.Group();
  // wrenches of growing size
  for (let i = 0; i < 6; i++) {
    const len = 0.22 + i * 0.04;
    const wr = group(rbox(0.035, len, 0.015, toolMat[0], 0.006), at(cyl(0.035, 0.035, 0.015, toolMat[0], 12), 0, len / 2, 0));
    (wr.children[1] as THREE.Mesh).rotation.x = Math.PI / 2;
    at(wr, -5.5 + i * 0.12, 1.55, ROOM.z0 + 0.04);
    tools.add(wr);
  }
  // screwdrivers
  for (let i = 0; i < 4; i++) {
    const sd = group(at(rbox(0.04, 0.12, 0.04, toolMat[1 + (i % 3)], 0.015), 0, 0.06, 0), at(cyl(0.008, 0.008, 0.16, toolMat[0], 8), 0, -0.08, 0));
    at(sd, -4.6 + i * 0.12, 1.55, ROOM.z0 + 0.05);
    tools.add(sd);
  }
  // hammer
  const ham = group(at(rbox(0.035, 0.32, 0.03, mat('#b5793e', 0.7), 0.01), 0, 0, 0), at(rbox(0.16, 0.06, 0.05, toolMat[0], 0.01), 0, 0.17, 0));
  at(ham, -3.85, 1.5, ROOM.z0 + 0.05, 0);
  ham.rotation.z = 0.2;
  // pliers
  const pl = group(at(rbox(0.03, 0.2, 0.02, toolMat[1], 0.01), -0.02, 0, 0), at(rbox(0.03, 0.2, 0.02, toolMat[1], 0.01), 0.02, 0, 0));
  (pl.children[0] as THREE.Mesh).rotation.z = 0.15;
  (pl.children[1] as THREE.Mesh).rotation.z = -0.15;
  at(pl, -3.55, 1.5, ROOM.z0 + 0.05);
  // tape measure + spray can on hooks
  const tape = at(cyl(0.07, 0.07, 0.05, toolMat[3], 18), -3.3, 1.75, ROOM.z0 + 0.06);
  tape.rotation.x = Math.PI / 2;
  tools.add(ham, pl, tape);
  shade(tools, true, false);
  root.add(tools);
}

function shelf(root: THREE.Group) {
  const g = new THREE.Group();
  const steel = mat('#5b6577', 0.45, 0.5);
  const W = 2.4,
    D = 0.55,
    H = 2.1;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const up = rbox(0.05, H, 0.05, steel, 0.01);
      at(up, (sx * W) / 2, H / 2, (sz * D) / 2);
      g.add(up);
    }
  const levels = [0.12, 0.65, 1.2, 1.75];
  for (const y of levels) {
    const s = rbox(W, 0.035, D, mat('#8e99ab', 0.5, 0.4), 0.01);
    s.position.y = y;
    g.add(s);
  }
  const card = [mat('#d8a86a', 0.85), mat('#c9965a', 0.85), mat('#e2b779', 0.85)];
  const r = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
  // top shelves: boxes with labels
  let i = 0;
  for (const y of [1.2, 1.75]) {
    let x = -W / 2 + 0.12;
    while (x < W / 2 - 0.3) {
      const w = 0.28 + r(i++) * 0.18,
        h = 0.2 + r(i++) * 0.18,
        d = 0.36 + r(i++) * 0.1;
      const b = rbox(w, h, d, card[i % 3], 0.012);
      at(b, x + w / 2, y + h / 2 + 0.02, 0, (r(i++) - 0.5) * 0.15);
      const tape = box(w * 0.98, 0.012, 0.06, mat('#c78c4a', 0.6));
      at(tape, x + w / 2, y + h + 0.025, 0, b.rotation.y);
      g.add(b, tape);
      x += w + 0.05;
    }
  }
  // batteries row (one is the replacement that gets picked)
  let shelfBattery: THREE.Object3D = g;
  for (let k = 0; k < 4; k++) {
    const bat = miniBattery(k === 0 ? '#22a36b' : '#2b3a55');
    at(bat, -W / 2 + 0.3 + k * 0.42, 0.67, 0.02, Math.PI / 2);
    g.add(bat);
    if (k === 0) shelfBattery = bat;
  }
  // oil bottles
  for (let k = 0; k < 5; k++) {
    const bottle = group(rbox(0.1, 0.22, 0.07, mat(['#ffd166', '#ef476f', '#06d6a0'][k % 3], 0.35), 0.02), at(cyl(0.02, 0.02, 0.04, mat('#222', 0.5), 10), 0, 0.13, 0));
    at(bottle, 0.3 + k * 0.15, 0.78, 0.05, Math.PI / 2);
    g.add(bottle);
  }
  // tyres on the bottom
  for (let k = 0; k < 4; k++) {
    const t = tyre();
    t.rotation.y = Math.PI / 2;
    at(t, -W / 2 + 0.35 + k * 0.52, 0.42, 0);
    t.rotation.y = 0;
    t.rotation.x = 0;
    g.add(t);
  }
  shade(g);
  g.rotation.y = Math.PI / 2;
  g.position.set(ROOM.x0 + 0.4, 0, -1.6);
  root.add(g, at(blob(1.1, 3.0, 0.55), ROOM.x0 + 0.45, 0, -1.6));
  return shelfBattery;
}

export function tyre(r = 0.27, w = 0.18) {
  const g = new THREE.Group();
  const rubber = mat('#2b2d33', 0.85);
  const t = new THREE.Mesh(new THREE.TorusGeometry(r - 0.07, 0.085, 10, 24), rubber);
  t.scale.z = w / 0.17;
  const rim = cyl(r - 0.1, r - 0.1, w * 0.7, mat('#c3c9d1', 0.3, 0.6), 18);
  rim.rotation.x = Math.PI / 2;
  g.add(t, rim);
  return shade(g);
}

export function miniBattery(labelCol = '#2b3a55') {
  const g = new THREE.Group();
  g.add(rbox(0.3, 0.2, 0.2, mat('#23262d', 0.5), 0.02));
  const lab = rbox(0.31, 0.08, 0.205, mat(labelCol, 0.5), 0.01);
  g.add(lab);
  const p = cyl(0.025, 0.025, 0.04, mat('#e74c3c', 0.4), 10);
  at(p, 0.09, 0.12, 0);
  const n = cyl(0.025, 0.025, 0.04, mat('#222', 0.4), 10);
  at(n, -0.09, 0.12, 0);
  g.add(p, n);
  return shade(g);
}

function cart(root: THREE.Group) {
  const g = new THREE.Group();
  const blue = mat('#2f6fd6', 0.4, 0.2);
  const steel = mat('#cfd5dc', 0.35, 0.6);
  for (const y of [0.18, 0.5]) {
    const tray = rbox(0.7, 0.05, 0.45, blue, 0.02);
    tray.position.y = y;
    const lip = rbox(0.72, 0.05, 0.47, blue, 0.02);
    lip.position.y = y + 0.03;
    lip.scale.set(1, 0.6, 1);
    g.add(tray);
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = cyl(0.015, 0.015, 0.48, steel, 8);
      at(leg, sx * 0.32, 0.31, sz * 0.2);
      const wheel = cyl(0.04, 0.04, 0.03, mat('#222', 0.8), 10);
      wheel.rotation.x = Math.PI / 2;
      at(wheel, sx * 0.32, 0.04, sz * 0.2);
      g.add(leg, wheel);
    }
  const handle = cyl(0.015, 0.015, 0.45, steel, 8);
  handle.rotation.x = Math.PI / 2;
  at(handle, 0.4, 0.62, 0);
  g.add(handle);
  // a few loose bits on the lower tray
  g.add(at(rbox(0.16, 0.06, 0.1, mat('#e4473c', 0.5), 0.015), -0.15, 0.24, 0.05));
  shade(g);
  at(g, -1.6, 0, 1.95, 0.35);
  root.add(g, at(blob(0.95, 0.75, 0.45), -1.6, 0, 1.95));
  return { cart: g, top: new THREE.Vector3(0, 0.55, 0) };
}

function chest(root: THREE.Group) {
  const g = new THREE.Group();
  const red = mat('#e4473c', 0.35, 0.15);
  const steel = mat('#cfd5dc', 0.3, 0.7);
  g.add(at(rbox(1.0, 0.75, 0.5, red, 0.03), 0, 0.45, 0));
  g.add(at(rbox(1.0, 0.3, 0.48, red, 0.03), 0, 1.0, 0));
  for (let i = 0; i < 5; i++) {
    const y = 0.18 + i * 0.13;
    g.add(at(rbox(0.5, 0.025, 0.03, steel, 0.01), 0, y + 0.05, 0.26));
    g.add(at(box(0.96, 0.006, 0.005, mat('#a8302a', 0.6)), 0, y - 0.01, 0.251));
  }
  g.add(at(rbox(0.5, 0.025, 0.03, steel, 0.01), 0, 1.0, 0.25));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const w = cyl(0.045, 0.045, 0.04, mat('#222', 0.8), 10);
      w.rotation.x = Math.PI / 2;
      g.add(at(w, sx * 0.42, 0.05, sz * 0.18));
    }
  shade(g);
  at(g, -2.9, 0, -2.6, 0.35);
  root.add(g, at(blob(1.4, 0.9, 0.5), -2.9, 0, -2.6));
}

function decor(root: THREE.Group) {
  // posters
  const posters: ['tyres' | 'oil' | 'smile', number, number][] = [
    ['smile', 3.1, 1.95],
    ['oil', 4.4, 1.85],
    ['tyres', 5.7, 1.95],
  ];
  for (const [k, x, y] of posters) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.12), new THREE.MeshStandardMaterial({ map: posterTexture(k), roughness: 0.8 }));
    p.rotation.z = (x - 4.4) * 0.04;
    at(p, x, y, ROOM.z0 + 0.015);
    root.add(p);
  }
  // garage sign above the door
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshStandardMaterial({ map: labelTexture('FIX IT GARAGE', '#ff7a45', '#ffffff', 512, 128, 'bold 64px Fredoka, Nunito, sans-serif'), roughness: 0.6 }));
  at(sign, 0, ROOM.doorH + 0.75, ROOM.z0 + 0.03);
  root.add(sign);
  // clock
  const clockG = group(cyl(0.22, 0.22, 0.05, mat('#ffffff', 0.4), 24), at(cyl(0.24, 0.24, 0.04, mat('#2f6fd6', 0.4), 24), 0, -0.01, 0));
  const hand1 = box(0.02, 0.14, 0.01, mat('#222', 0.5));
  hand1.position.set(0, 0.03, 0.06);
  hand1.geometry.translate(0, 0.07, 0);
  hand1.rotation.z = -0.9;
  const hand2 = box(0.02, 0.1, 0.01, mat('#e4473c', 0.5));
  hand2.geometry.translate(0, 0.05, 0);
  hand2.position.set(0, 0.03, 0.065);
  hand2.rotation.z = 2.1;
  clockG.children.forEach((c) => (c.rotation.x = Math.PI / 2));
  clockG.add(hand1, hand2);
  at(clockG, -2.5, 2.6, ROOM.z0 + 0.04);
  root.add(clockG);
  // oil drums
  for (const [x, z, c] of [
    [5.9, -4.3, '#2f6fd6'],
    [6.35, -3.7, '#2a9d8f'],
  ] as [number, number, string][]) {
    const d = group(cyl(0.3, 0.3, 0.88, mat(c, 0.45, 0.3), 24));
    for (const y of [-0.25, 0.25]) d.add(at(cyl(0.31, 0.31, 0.03, mat(c, 0.35, 0.4), 24), 0, y, 0));
    d.add(at(cyl(0.05, 0.05, 0.02, mat('#ddd', 0.4, 0.5), 10), 0.15, 0.45, 0));
    shade(d);
    at(d, x, 0.44, z);
    root.add(d, at(blob(0.9, 0.9, 0.5), x, 0, z));
  }
  // tyre stack
  for (let i = 0; i < 4; i++) {
    const t = tyre(0.3, 0.2);
    at(t, 6.2 + Math.sin(i * 2.3) * 0.03, 0.11 + i * 0.2, -2.4);
    t.rotation.set(Math.PI / 2, 0, i * 0.4);
    root.add(t);
  }
  root.add(at(blob(0.9, 0.9, 0.55), 6.2, 0, -2.4));
  // cones
  for (const [x, z] of [
    [1.2, 3.6],
    [-1.9, 3.3],
  ]) {
    const c = group(cyl(0.02, 0.15, 0.42, mat('#ff7a2f', 0.5), 16), at(cyl(0.085, 0.11, 0.08, mat('#ffffff', 0.5), 16), 0, 0.02, 0), at(rbox(0.36, 0.04, 0.36, mat('#ff7a2f', 0.5), 0.015), 0, -0.21, 0));
    shade(c);
    at(c, x, 0.23, z);
    root.add(c);
  }
  // plant
  const pot = group(cyl(0.2, 0.15, 0.32, mat('#d9734e', 0.7), 16));
  const leaf = mat('#4caf61', 0.7);
  for (let i = 0; i < 7; i++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), leaf);
    l.scale.set(0.6, 1.4, 0.35);
    const a = (i / 7) * Math.PI * 2;
    l.position.set(Math.cos(a) * 0.1, 0.35 + (i % 2) * 0.08, Math.sin(a) * 0.1);
    l.rotation.set(Math.sin(a) * 0.5, -a, Math.cos(a) * 0.5);
    pot.add(l);
  }
  shade(pot);
  at(pot, -6.4, 0.16, -4.4);
  root.add(pot, at(blob(0.7, 0.7, 0.5), -6.4, 0, -4.4));
  // fire extinguisher on the right wall
  const ext = group(cyl(0.08, 0.08, 0.4, mat('#e3342f', 0.35, 0.1), 16), at(rbox(0.08, 0.06, 0.06, mat('#222', 0.5), 0.01), 0, 0.23, 0));
  shade(ext);
  at(ext, ROOM.x1 - 0.12, 1.45, -3.6);
  root.add(ext);
  // floor markings around the lift bay
  const lineMat = mat('#f7c531', 0.6);
  for (const [w, d, x, z] of [
    [0.08, 5.4, -2.1, 0.5],
    [0.08, 5.4, 2.1, 0.5],
  ] as const) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
    l.rotation.x = -Math.PI / 2;
    at(l, x, 0.003, z);
    l.receiveShadow = true;
    root.add(l);
  }
  // parking bay on the right
  for (const x of [3.0, 5.9]) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 4.2), mat('#ffffff', 0.6));
    l.rotation.x = -Math.PI / 2;
    at(l, x, 0.003, 0.4);
    l.receiveShadow = true;
    root.add(l);
  }
}

export function buildGarage(): Garage {
  const root = new THREE.Group();
  room(root);
  const lampMeshes: THREE.Mesh[] = [];
  bench(root);
  const shelfBattery = shelf(root);
  chest(root);
  decor(root);
  const lf = lift();
  root.add(lf.group);
  const c = cart(root);
  const upgrades = upgradeProps(root);
  return { root, lift: lf, cart: c.cart, cartTop: c.top, shelfBattery, lamps: lampMeshes, upgrades };
}

/** what each upgrade looks like in the garage */
function upgradeProps(root: THREE.Group): Record<UpgradeId, THREE.Object3D> {
  const add = (o: THREE.Object3D) => {
    shade(o);
    o.visible = false;
    root.add(o);
    return o;
  };
  // second lift in the right bay
  const l2 = lift().group;
  l2.position.set(4.45, 0, 0.7);
  // paint booth, front left
  const booth = new THREE.Group();
  const frame = mat('#e9ecef', 0.4, 0.3);
  for (const [x, z] of [
    [-1.2, -1],
    [1.2, -1],
    [-1.2, 1],
    [1.2, 1],
  ])
    booth.add(at(rbox(0.08, 2.2, 0.08, frame, 0.02), x, 1.1, z));
  booth.add(at(rbox(2.5, 0.12, 2.1, frame, 0.03), 0, 2.2, 0));
  const curtain = new THREE.MeshStandardMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.35, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.1), curtain);
  at(back, 0, 1.1, -1);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.1), curtain);
  side.rotation.y = Math.PI / 2;
  at(side, -1.2, 1.1, 0);
  booth.add(back, side);
  booth.add(at(rbox(2.3, 0.04, 1.9, mat('#d9e3ea', 0.5), 0.01), 0, 0.03, 0));
  const gun = group(rbox(0.06, 0.12, 0.16, mat('#2f6fd6', 0.4), 0.02), at(cyl(0.035, 0.035, 0.08, mat('#cfd5dc', 0.3, 0.6), 10), 0, 0.09, 0));
  at(gun, 0.9, 1.3, -0.95);
  booth.add(gun);
  booth.position.set(-5.3, 0, 2.3);
  // plants by the door
  const plants = new THREE.Group();
  for (const x of [-2.4, 2.4]) {
    const pot = group(cyl(0.26, 0.2, 0.42, mat('#d9734e', 0.7), 16));
    for (let i = 0; i < 9; i++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat(i % 2 ? '#4caf61' : '#5fc274', 0.7));
      l.scale.set(0.55, 1.5, 0.35);
      const a = (i / 9) * Math.PI * 2;
      l.position.set(Math.cos(a) * 0.12, 0.5 + (i % 3) * 0.1, Math.sin(a) * 0.12);
      l.rotation.set(Math.sin(a) * 0.5, -a, Math.cos(a) * 0.5);
      pot.add(l);
    }
    at(pot, x, 0.21, ROOM.z0 + 0.45);
    plants.add(pot, at(blob(0.8, 0.8, 0.5), x, 0, ROOM.z0 + 0.45));
  }
  // neon sign: a glowing wrench and heart, no words
  const neon = new THREE.Group();
  const glow = (c: string) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.4, toneMapped: false });
  const wrenchCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.5, -0.3, 0), new THREE.Vector3(0.2, 0.25, 0)]);
  neon.add(new THREE.Mesh(new THREE.TubeGeometry(wrenchCurve, 8, 0.035, 8), glow('#5ef0ff')));
  neon.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 20, Math.PI * 1.5), glow('#5ef0ff')), 0.32, 0.36, 0));
  const heart = new THREE.Shape();
  heart.moveTo(0, -0.18);
  heart.bezierCurveTo(-0.3, 0.02, -0.12, 0.25, 0, 0.1);
  heart.bezierCurveTo(0.12, 0.25, 0.3, 0.02, 0, -0.18);
  const hp = heart.getPoints(24).map((p) => new THREE.Vector3(p.x, p.y, 0));
  neon.add(at(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hp, true), 40, 0.03, 6, true), glow('#ff6fae')), 0.85, 0, 0));
  neon.add(at(rbox(2.0, 0.9, 0.04, mat('#2a2f3a', 0.6), 0.04), 0.2, 0.05, -0.04));
  neon.position.set(4.3, 3.1, ROOM.z0 + 0.06);
  const neonLight = new THREE.PointLight('#8ff4ff', 2, 4, 2);
  neonLight.position.set(4.3, 3.0, ROOM.z0 + 0.6);
  neon.add(neonLight);
  // waiting lounge: sofa, coffee table, mug
  const lounge = new THREE.Group();
  const sofaM = mat('#7c5cff', 0.85);
  lounge.add(at(rbox(1.6, 0.28, 0.7, sofaM, 0.08), 0, 0.22, 0));
  lounge.add(at(rbox(1.6, 0.5, 0.2, sofaM, 0.08), 0, 0.45, -0.28));
  for (const x of [-0.8, 0.8]) lounge.add(at(rbox(0.18, 0.42, 0.7, sofaM, 0.07), x, 0.3, 0));
  lounge.add(at(rbox(0.36, 0.08, 0.3, mat('#ffcf33', 0.8), 0.04), -0.4, 0.42, 0.02));
  lounge.add(at(rbox(0.9, 0.06, 0.5, new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.6 }), 0.02), 0, 0.36, 0.75));
  for (const [x, z] of [
    [-0.38, 0.55],
    [0.38, 0.55],
    [-0.38, 0.95],
    [0.38, 0.95],
  ])
    lounge.add(at(cyl(0.025, 0.025, 0.33, mat('#2a2f3a', 0.5), 8), x, 0.17, z));
  lounge.add(at(cyl(0.05, 0.045, 0.1, mat('#ffffff', 0.4), 12), 0.2, 0.44, 0.75));
  lounge.add(at(blob(2.2, 1.8, 0.5), 0, 0, 0.3));
  lounge.position.set(5.4, 0, 3.4);
  lounge.rotation.y = -Math.PI / 2 + 0.3;
  // tools that show up when bought
  const gauge = group(cyl(0.05, 0.05, 0.03, mat('#e4473c', 0.4), 16), at(rbox(0.03, 0.12, 0.03, mat('#2a2f3a', 0.5), 0.01), 0.06, 0, 0));
  (gauge.children[0] as THREE.Mesh).rotation.x = Math.PI / 2;
  at(gauge, -3.75, 0.68, ROOM.z0 + 0.45);
  const analyser = group(rbox(0.5, 0.7, 0.4, mat('#2fa39b', 0.45, 0.1), 0.04), at(rbox(0.36, 0.2, 0.02, mat('#16302a', 0.3, 0, { emissive: '#3fd18a', emissiveIntensity: 0.3 }), 0.01), 0, 0.15, 0.21));
  for (const x of [-0.18, 0.18]) analyser.add(at(cyl(0.05, 0.05, 0.04, mat('#222', 0.8), 10), x, -0.36, 0.12));
  const hosePath = new THREE.CatmullRomCurve3([new THREE.Vector3(0.2, 0, 0), new THREE.Vector3(0.5, -0.2, 0.2), new THREE.Vector3(0.6, -0.33, 0.5)]);
  analyser.add(new THREE.Mesh(new THREE.TubeGeometry(hosePath, 10, 0.02, 6), mat('#2a2f3a', 0.7)));
  at(analyser, -1.9, 0.4, ROOM.z0 + 0.5, 0.2);
  const wrench = group(rbox(0.1, 0.18, 0.08, mat('#ffcf33', 0.4), 0.03), at(cyl(0.025, 0.025, 0.08, mat('#cfd5dc', 0.3, 0.7), 10), 0, 0.02, 0.07));
  (wrench.children[1] as THREE.Mesh).rotation.x = Math.PI / 2;
  at(wrench, -2.9, 1.24, -2.6, 0.4);
  const parcels = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const p = rbox(0.42 - i * 0.05, 0.25, 0.34, mat(i % 2 ? '#d8a86a' : '#c9965a', 0.85), 0.015);
    at(p, 0, 0.13 + i * 0.25, 0, i * 0.3);
    parcels.add(p);
    parcels.add(at(rbox(0.1, 0.012, 0.1, mat('#22c27a', 0.4), 0.004), 0, 0.26 + i * 0.25, 0.04, i * 0.3));
  }
  parcels.add(at(blob(0.8, 0.8, 0.5), 0, 0, 0));
  parcels.position.set(2.6, 0, ROOM.z0 + 0.6);
  return {
    lift2: add(l2),
    booth: add(booth),
    plants: add(plants),
    neon: add(neon),
    lounge: add(lounge),
    gauge: add(gauge),
    exhaust: add(analyser),
    wrench: add(wrench),
    delivery: add(parcels),
  };
}

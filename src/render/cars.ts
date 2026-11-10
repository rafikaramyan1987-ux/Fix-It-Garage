/**
 * Car models from the Kenney Car Kit (CC0), loaded from compressed GLBs and wrapped in a rig: body pivot, wheels,
 * the underbody parts (slots), the front wheel with its nuts, brake disc and caliper, and an optional paint scratch.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { CARS, type CarType, type PartId } from '../game/data';
import { blob, cyl, mat, rbox, shade } from './geom';
import { buildPart } from './parts';
import { makeNut, makeSlot, type Slot } from './slots';
import sedanUrl from '../assets/cars/sedan.glb?url';
import hatchUrl from '../assets/cars/hatchback-sports.glb?url';
import vanUrl from '../assets/cars/van.glb?url';
import truckUrl from '../assets/cars/truck.glb?url';
import sportsUrl from '../assets/cars/sedan-sports.glb?url';
import suvUrl from '../assets/cars/suv-luxury.glb?url';

const URLS: Record<string, string> = { sedan: sedanUrl, 'hatchback-sports': hatchUrl, van: vanUrl, truck: truckUrl, 'sedan-sports': sportsUrl, 'suv-luxury': suvUrl };
const templates = new Map<string, THREE.Group>();

export async function loadCars(onProgress: (k: number) => void) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const names = Object.keys(URLS);
  let done = 0;
  await Promise.all(
    names.map(async (n) => {
      const gltf = await loader.loadAsync(URLS[n]);
      templates.set(n, gltf.scene);
      onProgress(++done / names.length);
    }),
  );
}

/** the front wheel on the camera side, ready to come off */
export interface WheelRig {
  wheel: THREE.Object3D;
  /** wheel node home transform */
  home: THREE.Vector3;
  /** hub centre and outer face (body space) */
  center: THREE.Vector3;
  outerX: number;
  nuts: THREE.Group[];
  nutHome: THREE.Vector3[];
  disc: THREE.Group;
  caliper: THREE.Group;
  pads: THREE.Group;
  caliperBolts: THREE.Group[];
}

export class Car {
  readonly root = new THREE.Group();
  /** body pivot: shakes when the engine runs, follows the lift */
  readonly body = new THREE.Group();
  readonly wheels: THREE.Object3D[] = [];
  readonly size = new THREE.Vector3();
  readonly ev: boolean;
  hoodY = 0.7;
  frontZ = 1.2;
  hoodBackZ = 0.4;
  paint = new THREE.Color('#3aa55d');
  readonly shadow: THREE.Mesh;
  readonly under: Partial<Record<PartId, Slot>> = {};
  wheel!: WheelRig;
  scratch: THREE.Mesh | null = null;
  private bodyMesh: THREE.Mesh | null = null;

  constructor(readonly type: CarType) {
    const def = CARS[type];
    this.ev = !!def.ev;
    const src = templates.get(def.model);
    if (!src) throw new Error(`car ${def.model} not loaded`);
    const model = src.clone(true);
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        const mm = (m.material as THREE.MeshStandardMaterial).clone();
        mm.roughness = 0.38;
        mm.metalness = 0.15;
        mm.envMapIntensity = 0.9;
        m.material = mm;
      }
      if (o.name.startsWith('wheel')) this.wheels.push(o);
    });
    this.body.add(model);
    this.root.add(this.body);
    const bb = new THREE.Box3().setFromObject(model);
    bb.getSize(this.size);
    this.shadow = blob(this.size.x * 1.5, this.size.z * 1.25, 0.75);
    this.root.add(this.shadow);
    this.measure(model);
    if (def.repaint) this.repaint(def.repaint);
    if (type === 'classic') this.chrome();
    this.underbody();
    this.wheelRig();
  }

  /** hood height/length (rays down the centre line) and paint colour (colour map under the hood) */
  private measure(model: THREE.Object3D) {
    model.updateMatrixWorld(true);
    const body = model.getObjectByName('body') as THREE.Mesh | undefined;
    let mesh: THREE.Mesh | undefined;
    (body ?? model).traverse((o) => {
      if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
    });
    if (!mesh) return;
    this.bodyMesh = mesh;
    const pos = mesh.geometry.getAttribute('position');
    const v = new THREE.Vector3();
    let maxZ = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      maxZ = Math.max(maxZ, v.z);
    }
    this.frontZ = maxZ;
    const ray = new THREE.Raycaster();
    const heightAt = (z: number) => {
      ray.set(new THREE.Vector3(0, 5, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(mesh!, false)[0];
      return hit ? hit.point.y : 0;
    };
    this.hoodY = Math.max(heightAt(maxZ - 0.3), heightAt(maxZ - 0.4));
    let back = maxZ - 0.5;
    for (let z = maxZ - 0.3; z > -0.5; z -= 0.02) {
      if (heightAt(z) > this.hoodY + 0.05) break;
      back = z;
    }
    this.hoodBackZ = back;
    ray.set(new THREE.Vector3(0, 5, maxZ - 0.3), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(mesh, false)[0];
    const px = this.texel(mesh, hit?.uv);
    if (px) this.paint = new THREE.Color().setRGB(px[0] / 255, px[1] / 255, px[2] / 255, THREE.SRGBColorSpace);
  }

  private texel(mesh: THREE.Mesh, uv: THREE.Vector2 | undefined) {
    const material = mesh.material as THREE.MeshStandardMaterial;
    const img = material.map?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
    if (!img || !uv) return null;
    try {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, 0, 0);
      const t = material.map!;
      const u = uv.x * t.repeat.x + t.offset.x;
      const vv = uv.y * t.repeat.y + t.offset.y;
      const x = Math.min(img.width - 1, Math.max(0, Math.floor(u * img.width)));
      const y = Math.min(img.height - 1, Math.max(0, Math.floor((t.flipY ? 1 - vv : vv) * img.height)));
      return g.getImageData(x, y, 1, 1).data;
    } catch {
      return null;
    }
  }

  /** repaint: copy the colour map and swap the body colour cell for a new colour */
  private repaint(hex: string) {
    const mesh = this.bodyMesh;
    if (!mesh) return;
    const material = mesh.material as THREE.MeshStandardMaterial;
    const src = material.map;
    const img = src?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
    if (!src || !img) return;
    try {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, 0, 0);
      const data = g.getImageData(0, 0, c.width, c.height);
      // every shade of the body colour (same hue, saturated) takes the new colour, keeping its lightness
      const fromHsl = { h: 0, s: 0, l: 0 };
      this.paint.getHSL(fromHsl, THREE.SRGBColorSpace);
      const to = new THREE.Color(hex);
      const toHsl = { h: 0, s: 0, l: 0 };
      to.getHSL(toHsl, THREE.SRGBColorSpace);
      const px = new THREE.Color();
      const hsl = { h: 0, s: 0, l: 0 };
      const d = data.data;
      for (let i = 0; i < d.length; i += 4) {
        px.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, THREE.SRGBColorSpace);
        px.getHSL(hsl, THREE.SRGBColorSpace);
        const dh = Math.min(Math.abs(hsl.h - fromHsl.h), 1 - Math.abs(hsl.h - fromHsl.h));
        if (dh < 0.045 && hsl.s > 0.35) {
          px.setHSL(toHsl.h, toHsl.s, Math.min(0.97, toHsl.l * (hsl.l / Math.max(0.05, fromHsl.l))), THREE.SRGBColorSpace);
          const o = { r: 0, g: 0, b: 0 };
          px.getRGB(o, THREE.SRGBColorSpace);
          d[i] = o.r * 255;
          d[i + 1] = o.g * 255;
          d[i + 2] = o.b * 255;
        }
      }
      g.putImageData(data, 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.flipY = src.flipY;
      t.offset.copy(src.offset);
      t.repeat.copy(src.repeat);
      t.magFilter = src.magFilter;
      t.minFilter = src.minFilter;
      this.body.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && !o.name.startsWith('wheel') && (m.material as THREE.MeshStandardMaterial).map) (m.material as THREE.MeshStandardMaterial).map = t;
      });
      this.paint = to;
    } catch {}
  }

  /** chrome bumpers for the classic */
  private chrome() {
    const c = mat('#e9edf2', 0.15, 1);
    for (const z of [this.frontZ + 0.01, -this.size.z / 2 + 0.03]) {
      const bar = rbox(this.size.x * 0.95, 0.06, 0.06, c, 0.025);
      bar.position.set(0, 0.32, z);
      this.body.add(shade(bar));
    }
  }

  /** exhaust, oil pan, fuel tank, axles (fuel cars) or a flat battery pack (EV), with swappable slots */
  private underbody() {
    const b = this.body;
    const dark = mat('#2b2e35', 0.7, 0.2);
    const steel = mat('#8f969f', 0.4, 0.6);
    const L = this.size.z;
    const front = this.frontZ;
    for (const z of [front - 0.55, -L * 0.3]) {
      const axle = cyl(0.03, 0.03, this.size.x * 0.75, dark, 8);
      axle.rotation.z = Math.PI / 2;
      axle.position.set(0, 0.3, z);
      b.add(axle);
    }
    if (this.ev) {
      const pack = rbox(this.size.x * 0.7, 0.06, L * 0.5, mat('#3a4560', 0.5, 0.3), 0.02);
      pack.position.set(0, 0.17, -0.1);
      b.add(shade(pack));
    } else {
      const pipe = cyl(0.03, 0.03, L * 0.75, steel, 10);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(0.22, 0.13, -0.1);
      const tank = rbox(0.5, 0.1, 0.36, dark, 0.03);
      tank.position.set(-0.2, 0.16, -L * 0.22);
      b.add(shade(pipe), shade(tank));
      this.under.muffler = makeSlot(b, 'muffler', new THREE.Vector3(0.22, 0.13, -L * 0.36), [[0, -0.06, 0.15], [0, -0.06, -0.15]], { down: true });
      this.under.catalyst = makeSlot(b, 'catalyst', new THREE.Vector3(0.22, 0.13, 0.08), [[0, -0.05, 0.13], [0, -0.05, -0.13]], { down: true });
      this.under.gasket = makeSlot(b, 'gasket', new THREE.Vector3(0, 0.2, front - 0.62), [[-0.15, -0.08, 0.15], [0.15, -0.08, -0.15]], { down: true });
      this.under.fuelpump = makeSlot(b, 'fuelpump', new THREE.Vector3(-0.2, 0.1, -L * 0.22), [[-0.06, -0.01, 0], [0.06, -0.01, 0]], { down: true, rotX: Math.PI });
    }
    this.under.tierod = makeSlot(b, 'tierod', new THREE.Vector3(0.2, 0.24, front - 0.45), [[-0.12, -0.03, 0], [0.12, -0.03, 0]], { down: true });
    const rearZ = this.wheels.find((w) => w.position.x > 0 && w.position.z < 0)?.position.z ?? -L * 0.3;
    this.under.shock = makeSlot(b, 'shock', new THREE.Vector3(0.16, 0.34, rearZ + 0.2), [[0, -0.12, 0], [0, 0.2, 0]], { down: true, out: new THREE.Vector3(-0.3, -1, 0) });
  }

  /** front wheel on the +x side: nuts on the hub, and the brake disc + caliper hidden behind it */
  private wheelRig() {
    const w = this.wheels.find((o) => o.position.x > 0 && o.position.z > 0) ?? this.wheels[0];
    this.body.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(w);
    const inv = new THREE.Matrix4().copy(this.body.matrixWorld).invert();
    bb.applyMatrix4(inv);
    const center = bb.getCenter(new THREE.Vector3());
    const outerX = bb.max.x;
    const nuts: THREE.Group[] = [];
    const nutHome: THREE.Vector3[] = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const n = makeNut();
      const p = new THREE.Vector3(outerX + 0.006, center.y + Math.sin(a) * 0.075, center.z + Math.cos(a) * 0.075);
      n.position.copy(p);
      n.rotation.z = -Math.PI / 2;
      this.body.add(n);
      nuts.push(n);
      nutHome.push(p);
    }
    const disc = buildPart('disc', false);
    disc.position.set(center.x - 0.04, center.y, center.z);
    const caliper = new THREE.Group();
    caliper.add(rbox(0.07, 0.12, 0.14, mat('#e4473c', 0.4, 0.1), 0.02));
    caliper.position.set(center.x - 0.03, center.y + 0.13, center.z - 0.05);
    caliper.rotation.x = -0.35;
    const pads = buildPart('pads', false);
    pads.rotation.y = Math.PI / 2;
    pads.position.set(center.x - 0.04, center.y + 0.13, center.z - 0.05);
    const caliperBolts = [-0.05, 0.05].map((dz) => {
      const n = makeNut();
      n.rotation.z = -Math.PI / 2;
      n.position.set(center.x + 0.01, center.y + 0.13, center.z - 0.05 + dz);
      this.body.add(n);
      return n;
    });
    this.body.add(disc, shade(caliper), pads);
    this.wheel = { wheel: w, home: w.position.clone(), center, outerX, nuts, nutHome, disc, caliper, pads, caliperBolts };
  }

  /** a scratch on the side door (paint jobs) */
  addScratch() {
    if (this.scratch) return this.scratch;
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const g = c.getContext('2d')!;
    g.strokeStyle = 'rgba(235,235,240,0.95)';
    g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      g.lineWidth = 6 - i;
      g.beginPath();
      g.moveTo(20, 70 + i * 8);
      g.bezierCurveTo(90, 40 + i * 6, 150, 90 - i * 4, 236, 50 + i * 7);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.24), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
    // stick it on the body side, found with a ray from outside
    const ray = new THREE.Raycaster(new THREE.Vector3(3, 0.62, 0.12), new THREE.Vector3(-1, 0, 0));
    this.body.updateMatrixWorld(true);
    const hit = this.bodyMesh ? ray.intersectObject(this.bodyMesh, false)[0] : undefined;
    const x = hit ? this.body.worldToLocal(hit.point.clone()).x : this.size.x / 2;
    m.position.set(x + 0.004, 0.62, 0.12);
    m.rotation.y = Math.PI / 2;
    this.body.add(m);
    this.scratch = m;
    return m;
  }

  world(x: number, y: number, z: number) {
    return this.body.localToWorld(new THREE.Vector3(x, y, z));
  }

  spinWheels(dist: number) {
    for (const w of this.wheels) w.rotation.x += dist / 0.3;
  }

  /** exhaust tailpipe (world) */
  tailpipe() {
    return this.world(0.22, 0.16, -this.size.z / 2);
  }
}



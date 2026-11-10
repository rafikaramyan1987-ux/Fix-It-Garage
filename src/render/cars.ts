/** Car models from the Kenney Car Kit (CC0), loaded from compressed GLBs, wrapped in a small rig. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { CarType } from '../game/data';
import { blob, cyl, mat, rbox } from './geom';
import sedanUrl from '../assets/cars/sedan.glb?url';
import hatchbackUrl from '../assets/cars/hatchback.glb?url';
import vanUrl from '../assets/cars/van.glb?url';

const URLS: Record<CarType, string> = { sedan: sedanUrl, hatchback: hatchbackUrl, van: vanUrl };
const templates = new Map<CarType, THREE.Group>();

export async function loadCars(types: CarType[], onProgress: (k: number) => void) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  let done = 0;
  await Promise.all(
    types.map(async (t) => {
      const gltf = await loader.loadAsync(URLS[t]);
      templates.set(t, gltf.scene);
      onProgress(++done / types.length);
    }),
  );
}

export class Car {
  readonly root = new THREE.Group();
  /** body pivot: shakes when the engine runs, follows the lift */
  readonly body = new THREE.Group();
  readonly wheels: THREE.Object3D[] = [];
  readonly size = new THREE.Vector3();
  /** height of the hood surface and the z of the front bumper (local) */
  hoodY = 0.7;
  frontZ = 1.2;
  /** z where the windscreen starts (back end of the hood) */
  hoodBackZ = 0.4;
  paint = new THREE.Color('#3aa55d');
  readonly shadow: THREE.Mesh;

  constructor(readonly type: CarType) {
    const src = templates.get(type);
    if (!src) throw new Error(`car ${type} not loaded`);
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
    this.underbody();
  }

  /** find the hood height + paint colour from the body mesh vertices */
  private measure(model: THREE.Object3D) {
    model.updateMatrixWorld(true);
    const body = model.getObjectByName('body') as THREE.Mesh | undefined;
    let mesh: THREE.Mesh | undefined;
    (body ?? model).traverse((o) => {
      if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
    });
    if (!mesh) return;
    const pos = mesh.geometry.getAttribute('position');
    const v = new THREE.Vector3();
    let maxZ = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      maxZ = Math.max(maxZ, v.z);
    }
    this.frontZ = maxZ;
    // hood height and length: cast rays straight down along the centre line
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
    const hoodHit = ray.intersectObject(mesh, false)[0];
    // paint colour: sample the colour map where the hood vertex maps to
    const material = mesh.material as THREE.MeshStandardMaterial;
    const img = material.map?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
    if (img && hoodHit?.uv) {
      try {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext('2d', { willReadFrequently: true })!;
        g.drawImage(img, 0, 0);
        const t = material.map!;
        const u = hoodHit.uv.x * t.repeat.x + t.offset.x;
        const vv = hoodHit.uv.y * t.repeat.y + t.offset.y;
        const px = Math.min(img.width - 1, Math.max(0, Math.floor(u * img.width)));
        const py = Math.min(img.height - 1, Math.max(0, Math.floor((t.flipY ? 1 - vv : vv) * img.height)));
        const d = g.getImageData(px, py, 1, 1).data;
        this.paint = new THREE.Color().setRGB(d[0] / 255, d[1] / 255, d[2] / 255, THREE.SRGBColorSpace);
      } catch {}
    }
  }

  /** exhaust, oil pan and axles, seen from below on the lift */
  private underbody() {
    const g = new THREE.Group();
    const steel = mat('#8f969f', 0.4, 0.6);
    const dark = mat('#2b2e35', 0.7, 0.2);
    const pipe = cyl(0.035, 0.035, this.size.z * 0.75, steel, 10);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(0.22, 0.17, -0.1);
    const muff = rbox(0.3, 0.12, 0.42, steel, 0.05);
    muff.position.set(0.22, 0.17, -this.size.z * 0.33);
    const pan = rbox(0.4, 0.08, 0.4, dark, 0.03);
    pan.position.set(0, 0.17, this.frontZ - 0.6);
    g.add(pipe, muff, pan);
    for (const z of [this.frontZ - 0.55, -this.size.z * 0.3]) {
      const axle = cyl(0.03, 0.03, this.size.x * 0.75, dark, 8);
      axle.rotation.z = Math.PI / 2;
      axle.position.set(0, 0.3, z);
      g.add(axle);
    }
    this.body.add(g);
  }

  /** world position of a point on the car (local coords) */
  world(x: number, y: number, z: number) {
    return this.body.localToWorld(new THREE.Vector3(x, y, z));
  }

  spinWheels(dist: number) {
    for (const w of this.wheels) w.rotation.x += dist / 0.3;
  }
}

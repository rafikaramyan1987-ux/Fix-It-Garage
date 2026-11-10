/** Small helpers for building polished low-poly props from rounded primitives. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { blobTexture } from './textures';

const matCache = new Map<string, THREE.MeshStandardMaterial>();

export function mat(color: string | number, rough = 0.6, metal = 0, extra: THREE.MeshStandardMaterialParameters = {}) {
  const key = `${color}|${rough}|${metal}|${JSON.stringify(extra)}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
    matCache.set(key, m);
  }
  return m;
}

export function shade<T extends THREE.Object3D>(o: T, cast = true, receive = true): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
  return o;
}

export function rbox(w: number, h: number, d: number, m: THREE.Material, r = 0.03, seg = 2) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2)), m);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export function box(w: number, h: number, d: number, m: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export function cyl(rt: number, rb: number, h: number, m: THREE.Material, seg = 20) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0): T {
  o.position.set(x, y, z);
  o.rotation.y = ry;
  return o;
}

let blobTex: THREE.Texture | null = null;
/** soft contact shadow on the floor: fakes ambient occlusion under props */
export function blob(w: number, d: number, opacity = 0.6) {
  blobTex ??= blobTexture();
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false, toneMapped: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.004;
  m.renderOrder = 1;
  return m;
}

export function group(...children: THREE.Object3D[]) {
  const g = new THREE.Group();
  for (const c of children) g.add(c);
  return g;
}

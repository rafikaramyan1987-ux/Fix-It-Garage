/** Small particle effects: sparks, exhaust smoke, dust puffs and sparkles. One point cloud, soft round sprites. */
import * as THREE from 'three';

const MAX = 600;

interface P {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  age: number;
  size: number;
  grow: number;
  color: THREE.Color;
  alpha: number;
  gravity: number;
  drag: number;
  additive: boolean;
}

function makeLayer(additive: boolean) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX * 4), 4));
  geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(MAX), 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { scale: { value: 400 } },
    vertexShader: `attribute float size; attribute vec4 color; varying vec4 vC; uniform float scale;
      void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
      float a = smoothstep(0.5, 0.1, r); gl_FragColor = vec4(vC.rgb, vC.a * a); }`,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(geo, m);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  return pts;
}

export class Fx {
  readonly group = new THREE.Group();
  private ps: P[] = [];
  private normal = makeLayer(false);
  private glow = makeLayer(true);

  constructor() {
    this.group.add(this.normal, this.glow);
  }

  setScale(px: number) {
    for (const l of [this.normal, this.glow]) (l.material as THREE.ShaderMaterial).uniforms.scale.value = px;
  }

  private add(p: Partial<P> & { pos: THREE.Vector3 }) {
    if (this.ps.length >= MAX) this.ps.shift();
    this.ps.push({
      vel: new THREE.Vector3(),
      life: 1,
      age: 0,
      size: 0.05,
      grow: 0,
      color: new THREE.Color('#fff'),
      alpha: 1,
      gravity: 0,
      drag: 0,
      additive: false,
      ...p,
    });
  }

  sparks(at: THREE.Vector3, n = 22) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.3, Math.random() - 0.5).normalize().multiplyScalar(1 + Math.random() * 1.6);
      this.add({ pos: at.clone(), vel: v, life: 0.35 + Math.random() * 0.35, size: 0.035 + Math.random() * 0.02, color: new THREE.Color().setHSL(0.1 + Math.random() * 0.06, 1, 0.65), gravity: 6, drag: 1.5, additive: true });
    }
  }

  smoke(at: THREE.Vector3, dir: THREE.Vector3, n = 6, color = '#e8eaee') {
    for (let i = 0; i < n; i++) {
      const v = dir.clone().multiplyScalar(0.6 + Math.random() * 0.6).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.25 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3));
      this.add({ pos: at.clone(), vel: v, life: 1.2 + Math.random() * 0.8, size: 0.12, grow: 0.5, color: new THREE.Color(color), alpha: 0.55, gravity: -0.15, drag: 1.2 });
    }
  }

  dust(at: THREE.Vector3, n = 14) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a), 0.15 + Math.random() * 0.2, Math.sin(a)).multiplyScalar(0.6 + Math.random() * 0.4);
      this.add({ pos: at.clone().add(new THREE.Vector3(0, 0.02, 0)), vel: v, life: 0.7 + Math.random() * 0.4, size: 0.07, grow: 0.25, color: new THREE.Color('#d8cdb8'), alpha: 0.6, drag: 3 });
    }
  }

  sparkle(at: THREE.Vector3, n = 16, color = '#fff3a0') {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(1.4);
      this.add({ pos: at.clone(), vel: v, life: 0.6 + Math.random() * 0.5, size: 0.05 + Math.random() * 0.04, color: new THREE.Color(color), drag: 2.5, gravity: -0.3, additive: true });
    }
  }

  update(dt: number) {
    for (const p of this.ps) {
      p.age += dt;
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.01 && p.gravity > 0) {
        p.pos.y = 0.01;
        p.vel.y *= -0.35;
      }
    }
    this.ps = this.ps.filter((p) => p.age < p.life);
    for (const [layer, additive] of [
      [this.normal, false],
      [this.glow, true],
    ] as const) {
      const list = this.ps.filter((p) => p.additive === additive);
      const pos = layer.geometry.getAttribute('position') as THREE.BufferAttribute;
      const col = layer.geometry.getAttribute('color') as THREE.BufferAttribute;
      const size = layer.geometry.getAttribute('size') as THREE.BufferAttribute;
      list.forEach((p, i) => {
        const k = p.age / p.life;
        pos.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
        col.setXYZW(i, p.color.r, p.color.g, p.color.b, p.alpha * (1 - k) * Math.min(1, p.age * 12));
        size.setX(i, p.size * (1 + p.grow * k * 4));
      });
      layer.geometry.setDrawRange(0, list.length);
      pos.needsUpdate = col.needsUpdate = size.needsUpdate = true;
    }
  }
}

/** Renderer, scene, lights and picking. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CameraRig } from './camera';
import { Fx } from './fx';
import { buildGarage, type Garage } from './garage';

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig = new CameraRig();
  readonly fx = new Fx();
  readonly garage: Garage;
  private ray = new THREE.Raycaster();
  readonly sun: THREE.DirectionalLight;
  width = 1;
  height = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;

    const s = this.scene;
    s.background = new THREE.Color('#bfe6ff');
    const pmrem = new THREE.PMREMGenerator(r);
    s.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.35;

    const hemi = new THREE.HemisphereLight('#fff7ea', '#a8927a', 0.6);
    s.add(hemi);
    const sun = new THREE.DirectionalLight('#fff1dc', 2.8);
    sun.position.set(-4.5, 9, 6.5);
    sun.castShadow = true;
    const mobile = Math.min(window.innerWidth, window.innerHeight) < 700;
    sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    const sc = sun.shadow.camera;
    sc.left = -8.5;
    sc.right = 8.5;
    sc.top = 7;
    sc.bottom = -7;
    sc.near = 1;
    sc.far = 25;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
    s.add(sun, sun.target);
    this.sun = sun;
    // daylight spilling in through the open door
    const door = new THREE.PointLight('#dff1ff', 5, 8, 1.6);
    door.position.set(0, 2.2, -4.2);
    s.add(door);
    // warm bounce from the lamps
    for (const x of [-3.2, 3.2]) {
      const p = new THREE.PointLight('#ffe2b8', 2.5, 7, 1.8);
      p.position.set(x, 3.0, -0.8);
      s.add(p);
    }
    // soft front fill so the car side facing the camera is never flat black
    const fill = new THREE.DirectionalLight('#e6f0ff', 0.55);
    fill.position.set(6, 3, 8);
    s.add(fill);

    this.garage = buildGarage();
    s.add(this.garage.root);
    s.add(this.fx.group);
  }

  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.rig.resize(w, h);
    this.fx.setScale((h * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(this.rig.camera.fov / 2))));
  }

  render() {
    this.renderer.render(this.scene, this.rig.camera);
  }

  /** the first of `roots` hit under the pointer (client px) */
  pick(x: number, y: number, roots: THREE.Object3D[]): THREE.Object3D | null {
    if (!roots.length) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.rig.camera);
    const hits = this.ray.intersectObjects(roots, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        if (roots.includes(o)) return o;
        o = o.parent;
      }
    }
    return null;
  }

  /** nearest target within `slop` px of the pointer (generous touch targets) */
  pickNear(x: number, y: number, roots: THREE.Object3D[], slop = 44): THREE.Object3D | null {
    const direct = this.pick(x, y, roots);
    if (direct) return direct;
    let best: THREE.Object3D | null = null;
    let bd = slop;
    for (const r of roots) {
      const p = this.project(r.getWorldPosition(new THREE.Vector3()));
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  }

  /** world point -> client px */
  project(v: THREE.Vector3) {
    const p = v.clone().project(this.rig.camera);
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  }
}

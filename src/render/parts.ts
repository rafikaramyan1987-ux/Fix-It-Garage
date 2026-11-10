/** Procedural low-poly models of every spare part, in a worn (installed) and a new version. */
import * as THREE from 'three';
import type { PartId } from '../game/data';
import { buildBattery } from './engineBay';
import { at, cyl, mat, rbox, shade } from './geom';
import { tyre } from './garage';

const steel = (fresh: boolean) => mat(fresh ? '#d3d9e0' : '#8e8a80', fresh ? 0.3 : 0.8, fresh ? 0.75 : 0.3);
const dark = (fresh: boolean) => mat(fresh ? '#2a2f3a' : '#3b3a37', fresh ? 0.45 : 0.85);
const rust = mat('#9b5a32', 0.95);

/** a new part gets a little green tag so it reads "new" without any text */
function tag(g: THREE.Object3D, y: number) {
  const t = rbox(0.05, 0.012, 0.035, mat('#22c27a', 0.4), 0.004);
  t.position.set(0, y, 0);
  g.add(t);
}

export function buildPart(id: PartId, fresh: boolean): THREE.Group {
  const g = new THREE.Group();
  switch (id) {
    case 'battery':
      return buildBattery(fresh);
    case 'alternator': {
      const body = cyl(0.07, 0.07, 0.1, steel(fresh), 18);
      body.rotation.z = Math.PI / 2;
      const pulley = cyl(0.035, 0.035, 0.03, dark(fresh), 14);
      pulley.rotation.z = Math.PI / 2;
      pulley.position.x = 0.065;
      g.add(body, pulley);
      for (let i = 0; i < 6; i++) {
        const fin = rbox(0.1, 0.008, 0.02, dark(fresh), 0.003);
        fin.position.set(0, Math.cos(i) * 0.072, Math.sin(i) * 0.072);
        fin.rotation.x = i;
        g.add(fin);
      }
      break;
    }
    case 'starter': {
      const motor = cyl(0.05, 0.05, 0.14, steel(fresh), 16);
      motor.rotation.z = Math.PI / 2;
      const sol = cyl(0.028, 0.028, 0.1, dark(fresh), 12);
      sol.rotation.z = Math.PI / 2;
      sol.position.set(0.01, 0.06, 0);
      const gear = cyl(0.03, 0.03, 0.03, mat('#c9a24a', 0.4, 0.6), 10);
      gear.rotation.z = Math.PI / 2;
      gear.position.x = 0.085;
      g.add(motor, sol, gear);
      break;
    }
    case 'plugs': {
      const rail = rbox(0.3, 0.025, 0.05, dark(fresh), 0.01);
      g.add(rail);
      for (let i = 0; i < 4; i++) {
        const coil = rbox(0.045, 0.06, 0.045, mat(fresh ? '#d6453b' : '#7a4a40', 0.5), 0.012);
        coil.position.set(-0.11 + i * 0.075, 0.03, 0);
        g.add(coil);
      }
      break;
    }
    case 'airfilter': {
      g.add(rbox(0.22, 0.03, 0.16, mat(fresh ? '#f7f3e3' : '#5d5446', 0.9), 0.01));
      for (let i = 0; i < 7; i++) g.add(at(rbox(0.2, 0.012, 0.012, mat(fresh ? '#e9e0c4' : '#4a4237', 0.9), 0.004), 0, 0.02, -0.065 + i * 0.022));
      g.add(at(rbox(0.23, 0.012, 0.17, mat('#ff8a3d', 0.6), 0.004), 0, -0.016, 0));
      break;
    }
    case 'hose': {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.15, 0, 0), new THREE.Vector3(-0.05, 0.05, 0.03), new THREE.Vector3(0.06, 0.02, -0.02), new THREE.Vector3(0.15, 0.04, 0)]);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.022, 8), mat(fresh ? '#2a2f3a' : '#3a3530', fresh ? 0.5 : 0.95));
      tube.castShadow = true;
      g.add(tube);
      if (!fresh) g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), mat('#6fd18a', 0.3)), 0.02, 0.0, 0.0));
      for (const x of [-0.15, 0.15]) g.add(at(cyl(0.027, 0.027, 0.012, steel(fresh), 12), x, 0, 0));
      (g.children[g.children.length - 1] as THREE.Mesh).rotation.z = Math.PI / 2;
      (g.children[g.children.length - 2] as THREE.Mesh).rotation.z = Math.PI / 2;
      break;
    }
    case 'thermostat': {
      g.add(cyl(0.05, 0.06, 0.05, steel(fresh), 14));
      g.add(at(cyl(0.025, 0.025, 0.06, steel(fresh), 10), 0, 0.05, 0));
      break;
    }
    case 'chargeport': {
      g.add(rbox(0.26, 0.1, 0.18, mat(fresh ? '#3a6fd8' : '#4b5466', 0.45, 0.2), 0.02));
      for (let i = 0; i < 3; i++) g.add(at(rbox(0.22, 0.008, 0.012, mat('#2a3550', 0.5), 0.003), 0, 0.054, -0.06 + i * 0.06));
      const plug = cyl(0.03, 0.03, 0.04, mat('#ff8a3d', 0.45), 14);
      plug.rotation.x = Math.PI / 2;
      plug.position.set(0.09, 0.0, 0.1);
      g.add(plug);
      break;
    }
    case 'pads': {
      for (const s of [-1, 1]) {
        const plate = rbox(0.12, 0.06, 0.012, steel(fresh), 0.006);
        const lining = rbox(0.11, 0.05, fresh ? 0.018 : 0.005, mat(fresh ? '#4d4740' : '#2a2724', 0.95), 0.004);
        plate.position.z = s * 0.03;
        lining.position.z = s * (0.03 - 0.014);
        g.add(plate, lining);
      }
      break;
    }
    case 'disc': {
      const d = cyl(0.17, 0.17, 0.025, fresh ? mat('#c9ced6', 0.35, 0.8) : mat('#7d6a58', 0.8, 0.3), 28);
      d.rotation.z = Math.PI / 2;
      const hub = cyl(0.07, 0.07, 0.05, dark(fresh), 16);
      hub.rotation.z = Math.PI / 2;
      g.add(d, hub);
      if (!fresh) {
        // rust rings on a worn disc
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 6, 28), rust);
        ring.rotation.y = Math.PI / 2;
        ring.position.x = 0.014;
        g.add(ring);
      }
      break;
    }
    case 'tyre': {
      const t = tyre(0.3, 0.2);
      t.rotation.y = Math.PI / 2;
      g.add(t);
      break;
    }
    case 'tierod': {
      const rod = cyl(0.018, 0.018, 0.36, steel(fresh), 10);
      rod.rotation.z = Math.PI / 2;
      const end = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), dark(fresh));
      end.position.x = 0.19;
      const boot = cyl(0.03, 0.02, 0.06, mat('#1d1f24', 0.9), 10);
      boot.rotation.z = Math.PI / 2;
      boot.position.x = -0.15;
      g.add(rod, end, boot);
      break;
    }
    case 'shock': {
      g.add(cyl(0.035, 0.035, 0.22, mat(fresh ? '#f7c531' : '#6e6a5e', 0.45, 0.2), 14));
      g.add(at(cyl(0.015, 0.015, 0.16, steel(fresh), 10), 0, 0.17, 0));
      g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 16), mat('#d6453b', 0.5)), 0, 0.12, 0));
      (g.children[2] as THREE.Mesh).rotation.x = Math.PI / 2;
      if (!fresh) g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), mat('#4a3420', 0.3)), 0.03, -0.05, 0));
      break;
    }
    case 'muffler': {
      g.add(rbox(0.22, 0.12, 0.36, fresh ? steel(true) : mat('#7d6656', 0.9, 0.2), 0.05));
      const pipe = cyl(0.025, 0.025, 0.2, fresh ? steel(true) : mat('#7d6656', 0.9), 10);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.z = -0.26;
      g.add(pipe);
      if (!fresh) g.add(at(rbox(0.06, 0.02, 0.05, mat('#1a1410', 0.9), 0.01), 0.04, -0.06, 0.05));
      break;
    }
    case 'catalyst': {
      g.add(rbox(0.16, 0.1, 0.3, steel(fresh), 0.04));
      g.add(at(rbox(0.17, 0.02, 0.24, mat(fresh ? '#e8edf2' : '#a19a8c', 0.4, 0.6), 0.005), 0, 0.055, 0));
      break;
    }
    case 'fuelpump': {
      g.add(cyl(0.07, 0.07, 0.02, steel(fresh), 18));
      g.add(at(cyl(0.04, 0.04, 0.14, dark(fresh), 14), 0, 0.08, 0));
      g.add(at(cyl(0.012, 0.012, 0.06, steel(fresh), 8), 0.03, -0.03, 0));
      break;
    }
    case 'gasket': {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 4), mat(fresh ? '#2a2f3a' : '#3d3226', 0.7));
      ring.rotation.x = Math.PI / 2;
      ring.rotation.z = Math.PI / 4;
      const pan = rbox(0.36, 0.07, 0.36, dark(fresh), 0.03);
      pan.position.y = -0.04;
      g.add(pan, ring);
      if (!fresh) g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), mat('#141210', 0.2)), 0.1, -0.085, 0.08));
      break;
    }
    case 'oil':
    case 'coolant': {
      const c = id === 'oil' ? '#f2b134' : '#ff5fa2';
      g.add(rbox(0.12, 0.2, 0.07, mat(c, 0.4), 0.025));
      g.add(at(cyl(0.02, 0.02, 0.04, mat('#2a2f3a', 0.5), 10), 0.03, 0.12, 0));
      g.add(at(rbox(0.1, 0.07, 0.072, mat('#ffffff', 0.5), 0.01), 0, 0, 0));
      break;
    }
    case 'paint': {
      g.add(cyl(0.04, 0.04, 0.16, mat('#2f6fd6', 0.4, 0.2), 14));
      g.add(at(cyl(0.025, 0.03, 0.03, mat('#ffffff', 0.4), 12), 0, 0.095, 0));
      g.add(at(rbox(0.012, 0.02, 0.012, mat('#222', 0.5), 0.004), 0, 0.12, 0.015));
      break;
    }
  }
  if (fresh) tag(g, 0.1);
  return shade(g);
}

/** Procedural canvas textures (no image files): floor, walls, pegboard, labels, soft shadows, the street outside. */
import * as THREE from 'three';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function tex(c: HTMLCanvasElement, repeat?: [number, number]) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

/** deterministic noise so screenshots are stable */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function floorTexture() {
  const [c, g] = canvas(512, 512);
  const r = rng(7);
  g.fillStyle = '#b9bcc1';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const v = 180 + Math.floor(r() * 50);
    g.fillStyle = `rgba(${v},${v},${v + 4},${0.25 + r() * 0.3})`;
    g.fillRect(r() * 512, r() * 512, 1 + r() * 2, 1 + r() * 2);
  }
  // soft stains
  for (let i = 0; i < 6; i++) {
    const x = r() * 512,
      y = r() * 512,
      rad = 30 + r() * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(120,120,130,0.10)');
    gr.addColorStop(1, 'rgba(120,120,130,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // tile joints
  g.strokeStyle = 'rgba(90,95,105,0.35)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 510, 510);
  return tex(c, [7, 5]);
}

export function wallTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#f4e8d2';
  g.fillRect(0, 0, 256, 256);
  const r = rng(3);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(200,180,150,${r() * 0.12})`;
    g.fillRect(r() * 256, r() * 256, 2, 2);
  }
  g.fillStyle = 'rgba(190,165,130,0.35)';
  g.fillRect(0, 0, 3, 256);
  return tex(c, [10, 2]);
}

export function brickTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#2f7f7b';
  g.fillRect(0, 0, 256, 256);
  const r = rng(11);
  const bh = 32,
    bw = 64;
  for (let row = 0; row < 8; row++) {
    for (let col = -1; col < 5; col++) {
      const x = col * bw + (row % 2 ? bw / 2 : 0);
      const v = r() * 0.1 - 0.05;
      g.fillStyle = `rgb(${50 + v * 255},${135 + v * 255},${130 + v * 255})`;
      g.fillRect(x + 2, row * bh + 2, bw - 4, bh - 4);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(x + 2, row * bh + 2, bw - 4, 4);
    }
  }
  return tex(c, [12, 1]);
}

export function pegboardTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#d9b98c';
  g.fillRect(0, 0, 256, 256);
  for (let y = 8; y < 256; y += 16)
    for (let x = 8; x < 256; x += 16) {
      g.fillStyle = '#7a5c3a';
      g.beginPath();
      g.arc(x, y, 2.6, 0, Math.PI * 2);
      g.fill();
    }
  return tex(c, [3, 1.5]);
}

export function woodTexture() {
  const [c, g] = canvas(256, 64);
  const r = rng(5);
  g.fillStyle = '#c98e55';
  g.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(120,70,30,${0.08 + r() * 0.12})`;
    g.lineWidth = 1 + r() * 2;
    g.beginPath();
    const y = r() * 64;
    g.moveTo(0, y);
    g.bezierCurveTo(80, y + r() * 8 - 4, 170, y + r() * 8 - 4, 256, y);
    g.stroke();
  }
  for (let x = 0; x < 256; x += 64) {
    g.fillStyle = 'rgba(90,50,20,0.35)';
    g.fillRect(x, 0, 2, 64);
  }
  return tex(c);
}

/** soft round contact shadow (alpha) */
export function blobTexture() {
  const [c, g] = canvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)');
  gr.addColorStop(0.5, 'rgba(0,0,0,0.3)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/** the sunny street seen through the open garage door */
export function outsideTexture() {
  const [c, g] = canvas(1024, 512);
  const sky = g.createLinearGradient(0, 0, 0, 330);
  sky.addColorStop(0, '#7cc4f2');
  sky.addColorStop(1, '#dff3ff');
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 512);
  const r = rng(21);
  // clouds
  for (let i = 0; i < 5; i++) {
    const x = r() * 1024,
      y = 40 + r() * 120;
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      g.arc(x + k * 26 - 50, y + Math.sin(k * 2) * 8, 22 + r() * 14, 0, Math.PI * 2);
      g.fill();
    }
  }
  // houses
  const houseCols = ['#f7c8a0', '#bfe3c6', '#f6e2a1', '#d6c8f2', '#f4b6b6'];
  for (let i = 0; i < 7; i++) {
    const x = i * 150 - 20 + r() * 30,
      w = 110 + r() * 30,
      h = 90 + r() * 50,
      base = 330;
    g.fillStyle = houseCols[i % houseCols.length];
    g.fillRect(x, base - h, w, h);
    g.fillStyle = '#c0605a';
    g.beginPath();
    g.moveTo(x - 10, base - h);
    g.lineTo(x + w / 2, base - h - 45);
    g.lineTo(x + w + 10, base - h);
    g.fill();
    g.fillStyle = '#fffbe8';
    g.fillRect(x + 15, base - h + 20, 26, 26);
    g.fillRect(x + w - 41, base - h + 20, 26, 26);
    g.fillStyle = '#8a5a3c';
    g.fillRect(x + w / 2 - 12, base - 45, 24, 45);
  }
  // trees
  for (let i = 0; i < 9; i++) {
    const x = r() * 1024;
    g.fillStyle = '#7a5236';
    g.fillRect(x - 5, 280, 10, 50);
    g.fillStyle = ['#5fb760', '#4fa457', '#77c46a'][i % 3];
    g.beginPath();
    g.arc(x, 265, 32 + r() * 12, 0, Math.PI * 2);
    g.fill();
  }
  // pavement + road
  g.fillStyle = '#d9d4ca';
  g.fillRect(0, 330, 1024, 40);
  g.fillStyle = '#6d7077';
  g.fillRect(0, 370, 1024, 142);
  g.fillStyle = '#f2f2f2';
  for (let x = 0; x < 1024; x += 90) g.fillRect(x, 436, 50, 8);
  return tex(c);
}

/** sticker / label: a rounded rectangle with text */
export function labelTexture(text: string, bg: string, fg: string, w = 256, h = 128, font = 'bold 54px Fredoka, Nunito, sans-serif', sub?: string) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(4, 4, w - 8, h - 8, 18);
  g.fill();
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, sub ? h * 0.4 : h / 2);
  if (sub) {
    g.font = `600 ${Math.round(h * 0.18)}px Fredoka, Nunito, sans-serif`;
    g.fillText(sub, w / 2, h * 0.75);
  }
  return tex(c);
}

/** an original poster for the garage wall */
/** an original poster for the garage wall (pictures only, no words, so it suits every language) */
export function posterTexture(kind: 'tyres' | 'oil' | 'smile') {
  const [c, g] = canvas(256, 360);
  const bg = { tyres: '#ffcf4a', oil: '#4ab3ff', smile: '#ff7a59' }[kind];
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 360);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillRect(10, 10, 236, 340);
  g.fillStyle = bg;
  g.fillRect(18, 18, 220, 324);
  g.fillStyle = '#1f2a44';
  g.textAlign = 'center';
  if (kind === 'tyres') {
    g.lineWidth = 22;
    g.strokeStyle = '#1f2a44';
    g.beginPath();
    g.arc(128, 150, 70, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(128, 150, 30, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1f2a44';
  } else if (kind === 'oil') {
    g.beginPath();
    g.moveTo(128, 60);
    g.bezierCurveTo(200, 160, 190, 240, 128, 240);
    g.bezierCurveTo(66, 240, 56, 160, 128, 60);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(108, 190, 12, 22, -0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1f2a44';
  } else {
    g.fillStyle = '#fff3c4';
    g.beginPath();
    g.arc(128, 150, 80, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1f2a44';
    g.beginPath();
    g.arc(100, 130, 10, 0, Math.PI * 2);
    g.arc(156, 130, 10, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = '#1f2a44';
    g.beginPath();
    g.arc(128, 160, 40, 0.2, Math.PI - 0.2);
    g.stroke();
  }
  return tex(c);
}

/** live screen of the battery tester */
export class ScreenTexture {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private g: CanvasRenderingContext2D;
  constructor() {
    const [c, g] = canvas(256, 160);
    this.canvas = c;
    this.g = g;
    this.texture = tex(c);
    this.draw('--.-', '#9fe7b5', 'READY');
  }
  draw(value: string, color: string, sub: string) {
    const g = this.g;
    g.fillStyle = '#16302a';
    g.fillRect(0, 0, 256, 160);
    g.fillStyle = color;
    g.font = 'bold 76px Fredoka, Nunito, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(value, 128, 66);
    g.font = '600 32px Fredoka, Nunito, sans-serif';
    g.fillText(sub, 128, 130);
    this.texture.needsUpdate = true;
  }
}

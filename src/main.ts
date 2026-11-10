/** Boot: fonts, scene, car models, portal SDK, then the game loop. */
import f500 from '@fontsource/fredoka/files/fredoka-latin-500-normal.woff2?url';
import f600 from '@fontsource/fredoka/files/fredoka-latin-600-normal.woff2?url';
import f700 from '@fontsource/fredoka/files/fredoka-latin-700-normal.woff2?url';
import { clock } from './app/clock';
import { sdk } from './app/sdk';
import { CAR_ORDER, Play } from './play';
import { loadCars } from './render/cars';
import { Stage } from './render/stage';
import { UI } from './ui/ui';

declare global {
  interface Window {
    __ready?: boolean;
    __game?: {
      /** advance the game clock; `render: false` skips drawing (fast-forward in capture scripts) */
      tick(dt: number, render?: boolean): void;
      render(): void;
      play: Play;
      /** screen position of a named 3D target (for capture scripts and e2e) */
      targets(): { id: string; x: number; y: number }[];
    };
  }
}

const params = new URLSearchParams(location.search);
const capture = params.has('capture');
const fill = document.getElementById('boot-fill');
const progress = (k: number) => fill && (fill.style.width = `${Math.round(4 + k * 96)}%`);

async function loadFonts() {
  try {
    const faces = [
      [f500, '500'],
      [f600, '600'],
      [f700, '700'],
    ].map(([u, w]) => new FontFace('Fredoka', `url(${u})`, { weight: w }));
    await Promise.all(
      faces.map(async (f) => {
        await f.load();
        document.fonts.add(f);
      }),
    );
  } catch {}
}

async function boot() {
  sdk.loadingStart();
  const sdkReady = params.has('nosdk') ? Promise.resolve() : sdk.init(3500);
  await loadFonts();
  progress(0.15);
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const stage = new Stage(canvas);
  progress(0.3);
  await loadCars(CAR_ORDER, (k) => progress(0.3 + k * 0.6));
  await sdkReady;
  const ui = new UI(document.getElementById('ui')!);
  const play = new Play(stage, ui);
  const resize = () => stage.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', resize);
  resize();

  let paused = false;
  sdk.onAdPause = (p) => (paused = p);
  const tick = (dt: number, draw = true) => {
    clock.update(dt);
    if (draw) stage.render();
  };
  window.__game = {
    render: () => stage.render(),
    tick: (dt, draw = true) => {
      tick(dt, draw);
      // CSS animations follow the game clock in capture mode
      for (const a of document.getAnimations()) {
        a.pause();
        a.currentTime = (Number(a.currentTime) || 0) + dt * 1000;
      }
    },
    play,
    targets: () =>
      play.input.current().map((t) => {
        const p = stage.project(t.obj.getWorldPosition(t.obj.position.clone().set(0, 0, 0)));
        return { id: t.id, x: p.x, y: p.y };
      }),
  };
  void play.run();
  // let the title scene settle before revealing
  tick(0);
  progress(1);
  const bootEl = document.getElementById('boot')!;
  bootEl.style.opacity = '0';
  setTimeout(() => bootEl.remove(), capture ? 0 : 400);
  if (capture) bootEl.remove();
  window.__ready = true;
  if (capture) return;
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused && !document.hidden) tick(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

void boot();

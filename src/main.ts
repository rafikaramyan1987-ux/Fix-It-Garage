/** Boot: fonts, scene, car models, portal SDK, language, then the game loop. */
import f500 from '@fontsource/fredoka/files/fredoka-latin-500-normal.woff2?url';
import f600 from '@fontsource/fredoka/files/fredoka-latin-600-normal.woff2?url';
import f700 from '@fontsource/fredoka/files/fredoka-latin-700-normal.woff2?url';
import x500 from '@fontsource/fredoka/files/fredoka-latin-ext-500-normal.woff2?url';
import x600 from '@fontsource/fredoka/files/fredoka-latin-ext-600-normal.woff2?url';
import x700 from '@fontsource/fredoka/files/fredoka-latin-ext-700-normal.woff2?url';
import c600 from '@fontsource/nunito/files/nunito-cyrillic-600-normal.woff2?url';
import c800 from '@fontsource/nunito/files/nunito-cyrillic-800-normal.woff2?url';
import { clock } from './app/clock';
import { sdk } from './app/sdk';
import { onLang, setLang, type Lang } from './i18n';
import { Play } from './play/play';
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
      /** screen position of the targets waiting for input (for capture scripts and e2e) */
      targets(): { id: string; x: number; y: number; mode: string }[];
      setLang(l: Lang): Promise<void>;
    };
  }
}

const params = new URLSearchParams(location.search);
const capture = params.has('capture');
const fill = document.getElementById('boot-fill');
const progress = (k: number) => fill && (fill.style.width = `${Math.round(4 + k * 96)}%`);

const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD, U+25B2-25BC';
const LATIN_EXT = 'U+0100-02AF, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';
const CYRILLIC = 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116';

/** register the font subsets; the browser downloads a subset only when text needs it */
function registerFonts() {
  const faces: FontFace[] = [];
  const add = (family: string, url: string, weight: string, range: string) => {
    const f = new FontFace(family, `url(${url})`, { weight, unicodeRange: range, display: 'swap' });
    document.fonts.add(f);
    faces.push(f);
    return f;
  };
  const latin = [add('Fredoka', f500, '500', LATIN), add('Fredoka', f600, '600', LATIN), add('Fredoka', f700, '700', LATIN)];
  const ext = [add('Fredoka', x500, '500', LATIN_EXT), add('Fredoka', x600, '600', LATIN_EXT), add('Fredoka', x700, '700', LATIN_EXT)];
  const cyr = [add('Nunito', c600, '500 600', CYRILLIC), add('Nunito', c800, '700 800', CYRILLIC)];
  return { latin, ext, cyr };
}

async function loadFontsFor(fonts: ReturnType<typeof registerFonts>, l: Lang) {
  const need = [...fonts.latin, ...(l === 'pl' || l === 'tr' ? fonts.ext : []), ...(l === 'ru' ? fonts.cyr : [])];
  try {
    await Promise.all(need.map((f) => f.load()));
  } catch {}
}

async function boot() {
  sdk.loadingStart();
  const sdkReady = params.has('nosdk') ? Promise.resolve() : sdk.init(3500);
  const fonts = registerFonts();
  await loadFontsFor(fonts, 'en');
  progress(0.15);
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const stage = new Stage(canvas);
  progress(0.3);
  await loadCars((k) => progress(0.3 + k * 0.6));
  await sdkReady;
  const ui = new UI(document.getElementById('ui')!);
  const play = new Play(stage, ui);
  const lang = (params.get('lang') as Lang | null) ?? Play.chooseLang(play.save);
  await loadFontsFor(fonts, lang);
  setLang(lang);
  onLang((l) => void loadFontsFor(fonts, l));
  const resize = () => stage.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', resize);
  resize();

  let adPaused = false;
  sdk.onAdPause = (p) => (adPaused = p);
  const tick = (dt: number, draw = true) => {
    if (!play.paused && !adPaused) clock.update(dt);
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
        return { id: t.id, x: p.x, y: p.y, mode: t.mode };
      }),
    setLang: async (l) => {
      await loadFontsFor(fonts, l);
      setLang(l);
    },
  };
  if (params.get('view') === 'cover') document.getElementById('ui')!.classList.add('cover-mode');
  // open-portal web and Playgama builds: the toolbar shrinks to fit narrow landscape frames (style.css `.fit-toolbar`)
  if (__PLATFORM__ === 'web' || __PLATFORM__ === 'playgama') document.getElementById('ui')!.classList.add('fit-toolbar');
  void play.start(params.has('job') ? Number(params.get('job')) : null);
  tick(0);
  progress(1);
  const bootEl = document.getElementById('boot')!;
  bootEl.style.opacity = '0';
  if (capture) bootEl.remove();
  else setTimeout(() => bootEl.remove(), 400);
  // Playgama: Bridge's game_ready once the loading screen has faded out and the player can play
  if (__PLATFORM__ === 'playgama') setTimeout(() => sdk.gameReady?.(), 500);
  window.__ready = true;
  if (capture) return;
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!document.hidden) tick(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

void boot();

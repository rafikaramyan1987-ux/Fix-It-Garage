import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const PLATFORMS = ['crazygames', 'gd', 'web', 'gamepix', 'playgama'] as const;
type PlatformName = (typeof PLATFORMS)[number];

/** GamePix JS SDK v3 (manual lifecycle): an external script, loaded before the game bundle, in the GamePix build only */
export const GAMEPIX_SDK_URL = 'https://integration.gamepix.com/sdk/v3/gamepix.sdk.js';

/**
 * Build target portal: `VITE_PLATFORM=crazygames|gd|web|gamepix|playgama`, or `--mode gd` / `--mode web` / `--mode gamepix` /
 * `--mode playgama`;
 * default CrazyGames. The CrazyGames build goes to dist/, the others to dist-<platform>/.
 */
function platformFor(mode: string): PlatformName {
  const p = process.env.VITE_PLATFORM || (PLATFORMS.includes(mode as PlatformName) ? mode : 'crazygames');
  if (!PLATFORMS.includes(p as PlatformName)) throw new Error(`unknown VITE_PLATFORM "${p}" (crazygames | gd | web | gamepix | playgama)`);
  return p as PlatformName;
}

/** index.html of the GamePix build: `GamePixConfig` + the SDK script at the top of <head>, before the game bundle */
function gamepixSdk(): Plugin {
  return {
    name: 'gamepix-sdk',
    transformIndexHtml: {
      order: 'pre',
      handler: () => [
        { tag: 'script', children: "window.GamePixConfig = { lifecycle: 'manual' };", injectTo: 'head-prepend' },
        { tag: 'script', attrs: { src: GAMEPIX_SDK_URL }, injectTo: 'head-prepend' },
      ],
    },
  };
}

/**
 * Playgama build, as Playgama's docs set it up for plain JS (wiki.playgama.com/playgama/bridge-sdk/setup and
 * bridge-sdk/api "Required steps"):
 * - Bridge from Playgama's CDN, `https://bridge.playgama.com/v2/stable/playgama-bridge.js` (the recommended option: it
 *   loads the adapter of the platform the game runs on, the QA Tool's `qa_tool` one included), the first script in
 *   <head>, loaded normally (not async / defer / module);
 * - right after it, scripts/playgama/boot.js inlined: `bridge.initialize()`, and the game bundle starts only once that
 *   has settled (its module script is held as <script type="text/plain" data-playgama-game data-src="…"> until then);
 * - `playgama-bridge-config.json` beside index.html (Bridge loads it from `./playgama-bridge-config.json`).
 */
export const PLAYGAMA_BRIDGE_CDN = 'https://bridge.playgama.com/v2/stable/playgama-bridge.js';
/** scripts/playgama/boot.js without its comment lines (they name the tags it handles) */
const playgamaBoot = () => readFileSync('scripts/playgama/boot.js', 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n').trim();
function playgamaBridge(): Plugin {
  return {
    name: 'playgama-bridge',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        { tag: 'script', attrs: { src: PLAYGAMA_BRIDGE_CDN }, injectTo: 'head-prepend' },
        { tag: 'script', children: playgamaBoot(), injectTo: 'head-prepend' },
      ],
    },
    // hold every game module script until boot.js starts it
    generateBundle: { order: 'post', handler(_o, bundle) {
      this.emitFile({ type: 'asset', fileName: 'playgama-bridge-config.json', source: readFileSync('scripts/playgama/playgama-bridge-config.json') });
      const html = Object.values(bundle).find((a) => a.type === 'asset' && a.fileName.endsWith('.html'));
      if (!html || html.type !== 'asset' || typeof html.source !== 'string') return;
      let held = 0;
      html.source = html.source.replace(/<script type="module"([^>]*)>/g, (_m, attrs: string) => {
        held++;
        const src = attrs.match(/\ssrc="([^"]+)"/)?.[1];
        return `<script type="text/plain" data-playgama-game${src ? ` data-src="${src}"` : ''}>`;
      });
      if (!held) throw new Error('playgama build: no game module script to hold until bridge.initialize()');
    } },
  };
}

export default defineConfig(({ mode }) => {
  const platform = platformFor(mode);
  return {
    base: './',
    plugins: platform === 'gamepix' ? [gamepixSdk()] : platform === 'playgama' ? [playgamaBridge()] : [],
    define: { __PLATFORM__: JSON.stringify(platform) },
    assetsInclude: ['**/*.glb'],
    build: {
      target: 'es2020',
      outDir: platform === 'crazygames' ? 'dist' : `dist-${platform}`,
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 1200,
    },
    server: { host: true },
  };
});

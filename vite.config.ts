import { defineConfig, type Plugin } from 'vite';

const PLATFORMS = ['crazygames', 'gd', 'web', 'gamepix'] as const;
type PlatformName = (typeof PLATFORMS)[number];

/** GamePix JS SDK v3 (manual lifecycle): an external script, loaded before the game bundle, in the GamePix build only */
export const GAMEPIX_SDK_URL = 'https://integration.gamepix.com/sdk/v3/gamepix.sdk.js';

/**
 * Build target portal: `VITE_PLATFORM=crazygames|gd|web|gamepix`, or `--mode gd` / `--mode web` / `--mode gamepix`;
 * default CrazyGames. The CrazyGames build goes to dist/, the others to dist-<platform>/.
 */
function platformFor(mode: string): PlatformName {
  const p = process.env.VITE_PLATFORM || (PLATFORMS.includes(mode as PlatformName) ? mode : 'crazygames');
  if (!PLATFORMS.includes(p as PlatformName)) throw new Error(`unknown VITE_PLATFORM "${p}" (crazygames | gd | web | gamepix)`);
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

export default defineConfig(({ mode }) => {
  const platform = platformFor(mode);
  return {
    base: './',
    plugins: platform === 'gamepix' ? [gamepixSdk()] : [],
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

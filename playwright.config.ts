import { defineConfig } from '@playwright/test';

const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const preview = (dir: string, port: number) => ({ command: `npx vite preview --outDir ${dir} --host 127.0.0.1 --port ${port} --strictPort`, url: `http://127.0.0.1:${port}/`, reuseExistingServer: !process.env.CI, timeout: 60_000 });

/** e2e on the web build (desktop + phone) and the GamePix build (rewarded ad buttons); `npm run build:web && npm run build:gamepix` first */
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 300_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { trace: 'off', launchOptions: { args: GL } },
  webServer: [preview('dist-web', 4173), preview('dist-gamepix', 4174)],
  projects: [
    { name: 'desktop', testIgnore: /gamepix/, use: { browserName: 'chromium', baseURL: 'http://127.0.0.1:4173/', viewport: { width: 1280, height: 720 } } },
    { name: 'phone', testIgnore: /gamepix|i18n/, use: { browserName: 'chromium', baseURL: 'http://127.0.0.1:4173/', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } },
    { name: 'gamepix', testMatch: /gamepix\.e2e\.ts/, use: { browserName: 'chromium', baseURL: 'http://127.0.0.1:4174/', viewport: { width: 1280, height: 720 } } },
  ],
});

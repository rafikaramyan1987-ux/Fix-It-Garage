import { defineConfig } from '@playwright/test';

const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

/**
 * Layout test (tests/layout): every button of every overlay fits the viewport and no two overlap, at 14 frame sizes
 * from 320x480 to 1920x1080 in every language, on the GamePix build (its rewarded-ad buttons are the longest set).
 * `npm run build:gamepix` first; `npm run test:layout`.
 */
export default defineConfig({
  testDir: 'tests/layout',
  testMatch: '**/*.e2e.ts',
  timeout: 180_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { trace: 'off', browserName: 'chromium', baseURL: 'http://127.0.0.1:4175/', launchOptions: { args: GL } },
  webServer: { command: 'npx vite preview --outDir dist-gamepix --host 127.0.0.1 --port 4175 --strictPort', url: 'http://127.0.0.1:4175/', reuseExistingServer: !process.env.CI, timeout: 60_000 },
});

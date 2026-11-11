import { defineConfig } from '@playwright/test';

/** smoke test of the y8 build (dist-y8/, `npm run build:y8` first) with a stubbed portal SDK: `npm run test:e2e:y8` */
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: 'tests/e2e-portals',
  testMatch: 'y8.e2e.ts',
  timeout: 300_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4176/', trace: 'off', launchOptions: { args: GL }, browserName: 'chromium', viewport: { width: 1280, height: 720 } },
  webServer: { command: 'npx vite preview --outDir dist-y8 --host 127.0.0.1 --port 4176 --strictPort', url: 'http://127.0.0.1:4176/', reuseExistingServer: !process.env.CI, timeout: 60_000 },
});

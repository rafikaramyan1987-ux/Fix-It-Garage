import { defineConfig } from '@playwright/test';

const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const DIST = process.env.E2E_DIST ?? 'dist-web';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173/', trace: 'off', launchOptions: { args: GL } },
  webServer: { command: `npx vite preview --outDir ${DIST} --host 127.0.0.1 --port 4173 --strictPort`, url: 'http://127.0.0.1:4173/', reuseExistingServer: !process.env.CI, timeout: 60_000 },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 720 } } },
    { name: 'phone-portrait', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } },
  ],
});

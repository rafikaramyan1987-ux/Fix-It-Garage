// Shared Playwright launch settings: software WebGL (SwiftShader) so the 3D scene renders headless.
export { chromium } from 'playwright';
export const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

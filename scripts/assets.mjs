// Builds the shipped car models from the Kenney Car Kit (CC0) in assets-src/.
// Only the models the game actually uses are shipped: the shared colour-map texture is embedded,
// geometry is welded, quantized and meshopt-compressed (decoded at runtime by three's MeshoptDecoder).
// usage: node scripts/assets.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { mkdirSync, statSync } from 'node:fs';

const SRC = 'assets-src/kenney-car-kit/Models/GLB format';
const OUT = 'src/assets/cars';
/** Kenney models used by the 7 car types (see CARS in src/game/data.ts; the classic is a repainted sedan) */
export const MODELS = ['sedan', 'hatchback-sports', 'van', 'truck', 'sedan-sports', 'suv-luxury'];

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
mkdirSync(OUT, { recursive: true });
let total = 0;
for (const file of MODELS) {
  const name = file;
  const doc = await io.read(`${SRC}/${file}.glb`); // resolves Textures/colormap.png and embeds it on write
  await doc.transform(dedup(), weld(), prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = `${OUT}/${name}.glb`;
  await io.write(out, doc);
  const s = statSync(out).size;
  total += s;
  console.log(out, (s / 1024).toFixed(1) + ' KB');
}
console.log('total', (total / 1024).toFixed(1) + ' KB');

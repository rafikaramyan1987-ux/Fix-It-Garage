# Credits & licences

Fix It Garage is an original game. No names, logos or art from any existing game or car brand are used.

| Asset | Source | Licence |
| --- | --- | --- |
| Car models (sedan, hatchback, van) | **Kenney Car Kit 3.1** by Kenney ([kenney.nl](https://www.kenney.nl)), source pack in `assets-src/kenney-car-kit/` (see its `License.txt`). Only the models the game uses are shipped, compressed by `scripts/assets.mjs` into `src/assets/cars/` | CC0 1.0 |
| Garage, lift, tool bench, parts shelf, tools, engine bay, battery, tester, ratchet, props | Procedural low-poly geometry in code (`src/render/*`) | Project licence |
| Textures (floor, walls, bricks, pegboard, wood, posters, labels, street) | Procedural canvas drawing (`src/render/textures.ts`) | Project licence |
| UI icons and customer avatars | Hand-written inline SVG (`src/ui/icons.ts`) | Project licence |
| Sound effects | Synthesised at runtime with the Web Audio API (`src/app/audio.ts`) | Project licence |
| Font: **Fredoka** (`@fontsource/fredoka`, Latin subset) | Milena Brandão / Google Fonts | SIL Open Font License 1.1 |
| Engine: **three.js** | mrdoob & contributors | MIT |
| CrazyGames SDK v3 | Loaded at runtime from `sdk.crazygames.com` (CrazyGames build only) | CrazyGames terms |
| GameDistribution HTML5 SDK | Loaded at runtime (GD build only) | GameDistribution terms |
| GamePix SDK v3 | Loaded at runtime (GamePix build only) | GamePix terms |

Kenney and Quaternius garage/prop packs were not downloaded (not reachable from the build environment); all props are modelled in code instead.

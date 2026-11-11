/**
 * The portal platform for this build, chosen at build time: `vite build` = CrazyGames, `--mode gd` = GameDistribution,
 * `--mode gamepix` = GamePix, `--mode playgama` = Playgama (Bridge), `--mode gamemonetize` = GameMonetize, `--mode y8` = Y8, `--mode web` = no portal (see vite.config.ts). `__PLATFORM__` is a literal, so the bundler drops the other
 * implementations (the GD build has no CrazyGames code and vice versa).
 */
import { CrazyGamesPlatform } from './platform/crazygames';
import { GDPlatform } from './platform/gd';
import { GamePixPlatform } from './platform/gamepix';
import { PlaygamaPlatform } from './platform/playgama';
import { GameMonetizePlatform } from './platform/gamemonetize';
import { Y8Platform } from './platform/y8';
import { WebPlatform } from './platform/web';
import type { Platform } from './platform/types';

export { AD_TIMEOUT } from './platform/types';
export type { Platform, AdSlot } from './platform/types';

export const sdk: Platform =
  __PLATFORM__ === 'gd'
    ? new GDPlatform()
    : __PLATFORM__ === 'web'
      ? new WebPlatform()
      : __PLATFORM__ === 'gamepix'
        ? new GamePixPlatform()
        : __PLATFORM__ === 'playgama'
          ? new PlaygamaPlatform()
          : __PLATFORM__ === 'gamemonetize'
            ? new GameMonetizePlatform()
            : __PLATFORM__ === 'y8'
              ? new Y8Platform()
              : new CrazyGamesPlatform();

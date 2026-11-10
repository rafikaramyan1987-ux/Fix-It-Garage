import type { AdSlot, Platform } from './types';

/** Plain web build (self-hosting, local dev): no portal SDK, no ads; optional rewards are granted so they can be tried. */
export class WebPlatform implements Platform {
  readonly name = 'web';
  readonly autoResume = false;
  readonly available = false;
  muted = false;
  onMute: (m: boolean) => void = () => {};
  onAdPause: (paused: boolean) => void = () => {};
  async init() {}
  locale() {
    return null;
  }
  data() {
    return null;
  }
  loadingStart() {}
  loadingStop() {}
  gameplayStart() {}
  gameplayStop() {}
  happytime() {}
  adSlot(_slot: AdSlot) {
    return false;
  }
  async midgame() {}
  async rewarded() {
    return true;
  }
}

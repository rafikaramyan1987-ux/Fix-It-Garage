/**
 * The game flow: main menu, career / daily jobs, diagnosis with tools, repairs, the test drive, payment, upgrades,
 * pause, rewarded ads (platform builds only) and the first-job tutorial.
 */
import * as THREE from 'three';
import { sfx, setMusic, setMuted, setSfx, unlockAudio } from '../app/audio';
import { clock, ease, lerp } from '../app/clock';
import { Input } from '../app/input';
import { sdk } from '../app/sdk';
import { BASE_TOOLS, CARS, CAR_TYPES, FAULTS, PARTS, TOOLS, TOOL_IDS, UPGRADES, type CarType, type FaultId, type PartCat, type ToolId, type UpgradeId } from '../game/data';
import { Job } from '../game/job';
import { CAREER_LENGTH, careerJob, dailyJob, todayKey, type JobDef } from '../game/jobs';
import { buyUpgrade, dailyDone, finishJob, garageCtx, loadSave, newSave, owns, writeSave, type SaveData } from '../game/progress';
import { getLang, pickLang, setLang, t, type Lang } from '../i18n';
import { Car } from '../render/cars';
import { fadePosts } from '../render/garage';
import type { Shot } from '../render/camera';
import { EngineBay, Ratchet, Tester } from '../render/engineBay';
import type { Stage } from '../render/stage';
import { achievementsScreen, adNotice, bookScreen, confirm, dailyScreen, garageScreen, mainMenu, pauseScreen, settingsScreen } from '../ui/screens';
import type { UI } from '../ui/ui';
import { Repairs } from './repairs';

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const LIFT_UP = 1.3;
/**
 * rewarded ads exist only in the portal builds (never in the plain web build); in the Playgama build only where
 * Bridge supports them (otherwise the rewarded buttons are hidden)
 */
export const ads = () => __PLATFORM__ !== 'web' && (__PLATFORM__ !== 'playgama' || sdk.available);

export class Play {
  readonly input: Input;
  readonly repairs: Repairs;
  save: SaveData;
  car!: Car;
  bay!: EngineBay;
  job!: Job;
  parked: Car | null = null;
  waiting: Car | null = null;
  readonly ratchet = new Ratchet();
  readonly tester = new Tester();
  lift = 0;
  engineOn = false;
  markerFor: THREE.Object3D | null = null;
  tagsFor: { obj: THREE.Object3D; text: string; color: string }[] = [];
  props: THREE.Object3D[] = [];
  /** state for tests / capture scripts */
  phase = 'boot';
  expected: string | null = null;
  paused = false;
  private adNoticeShown = false;
  private firstRunDone = false;
  private garageHinted = false;
  private tut: { step: string; close: () => void } | null = null;
  private frameFn = (dt: number, tt: number) => this.frame(dt, tt);

  constructor(
    readonly stage: Stage,
    readonly ui: UI,
  ) {
    this.input = new Input(stage);
    this.repairs = new Repairs(this);
    this.save = loadSave(sdk.data());
    this.applySound();
    setMuted(sdk.muted);
    sdk.onMute = (m) => setMuted(m);
    ui.onPause = () => void this.pause();
    ui.setMoney(this.save.money);
    window.addEventListener('pointerdown', () => unlockAudio(), { capture: true });
    // a tap during a wait (car arriving, a tool at work, the test drive) fast-forwards it
    window.addEventListener('pointerdown', () => this.speedUp(), { capture: true });
    // instant feedback on every tap: a soft click on any button, a ring where the 3D view was tapped
    ui.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) sfx.tap();
    });
    this.input.onHit = (x, y) => ui.ripple(x, y);
    this.input.onMiss = (x, y) => {
      ui.ripple(x, y, true);
      sfx.miss();
    };
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    clock.every(this.frameFn);
    this.refreshGarage();
  }

  /** the language: the player's choice, else the portal's / browser's, else English */
  static chooseLang(save: SaveData): Lang {
    const portal = __PLATFORM__ === 'gamepix' || __PLATFORM__ === 'crazygames' || __PLATFORM__ === 'playgama' ? sdk.locale() : null;
    // Playgama: the language comes only from Bridge's platform.language (or the player's own choice), else English
    const nav = __PLATFORM__ !== 'playgama' && typeof navigator !== 'undefined' ? [...(navigator.languages ?? []), navigator.language] : [];
    return pickLang(save.settings.lang, portal, ...nav);
  }

  applySound() {
    setMusic(this.save.settings.music);
    setSfx(this.save.settings.sfx);
  }

  persist() {
    writeSave(this.save, sdk.data());
  }

  get ctx() {
    return garageCtx(this.save);
  }

  // ---------- keyboard (optional): KeyboardEvent.code, so QWERTY / AZERTY alike; P pauses, Escape is never used ----------
  private key(e: KeyboardEvent, down: boolean) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.code === 'Escape') return;
    const root = this.ui.root;
    const click = (sel: string) => {
      const b = root.querySelector<HTMLElement>(sel);
      if (!b) return false;
      b.click();
      return true;
    };
    const act = e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter';
    if (act) e.preventDefault();
    if (!down) {
      if (act) this.input.keyUp();
      return;
    }
    if (e.repeat) return;
    unlockAudio();
    if (e.code === 'KeyP') {
      if (!click('.screen.pause [data-action=resume]')) void this.pause();
      return;
    }
    if (root.querySelector('.screen, .dialog')) return;
    const digit = /^(Digit|Numpad)([1-7])$/.exec(e.code);
    if (digit) {
      click(`.toolbar [data-tool=${TOOL_IDS[Number(digit[2]) - 1]}]`);
      return;
    }
    if (e.code === 'KeyR') click('.toolbar [data-tool=repair]');
    else if (e.code === 'KeyT') click('.toolbar [data-tool=test]');
    else if (e.code === 'KeyH') click('.toolbar [data-tool=hint]');
    else if (act) {
      if (click('.readout button') || click('[data-action=center]') || click('.paycard [data-action=next]') || click('.title [data-action=play]')) return;
      this.input.keyDown(this.expected);
    }
  }

  // ---------- camera shots ----------
  shots() {
    const c = this.car;
    const bayC = c.world(0, c.hoodY + 0.08, (c.hoodBackZ + c.frontZ) / 2);
    const w = c.wheel.center;
    return {
      title: { target: V(0.4, 1.2, -1.2), dir: V(0.55, 0.38, 1), radius: 4.6, portraitShift: -0.4 } as Shot,
      garage: { target: V(0.1, 0.9, -0.2), dir: V(0.5, 0.4, 1), radius: 2.8, portraitRadius: 2.0, portraitDir: V(0.45, 0.62, 1), portraitShift: 0.15, landscapeShift: 0.35 } as Shot,
      engine: { target: bayC, dir: V(-0.15, 1.6, 0.75), radius: 0.78, portraitRadius: 0.68, portraitShift: 0.04 } as Shot,
      under: { target: V(0, LIFT_UP + 0.15, 0), dir: V(1.4, -0.75, 1.9), radius: 1.5, portraitShift: 0.2 } as Shot,
      side: { target: V(0.4, 0.75, 0.15), dir: V(0.55, 0.45, 1.25), radius: 1.0, portraitDir: V(0.3, 0.5, 1.3), portraitRadius: 1.05, portraitShift: 0.1 } as Shot,
      listen: { target: V(0, 0.6, c.frontZ - 0.3), dir: V(0.35, 0.35, 1), radius: 1.2, portraitShift: 0.2 } as Shot,
      test: { target: V(0, 0.7, 0.2), dir: V(0.75, 0.32, 1), radius: 1.7, portraitRadius: 1.5, portraitDir: V(0.75, 0.5, 1), portraitShift: 0.1 } as Shot,
      wheel: { target: c.world(w.x + 0.15, w.y, w.z), dir: V(1, 0.3, 0.45), radius: 0.62, portraitRadius: 0.55, portraitShift: 0 } as Shot,
      rear: { target: V(0.2, 0.3, -c.size.z / 2), dir: V(0.8, 0.45, -1), radius: 0.9, portraitShift: 0.15 } as Shot,
      door: { target: c.world(c.size.x / 2, 0.6, 0.12), dir: V(0.9, 0.38, 1.0), radius: 0.95, portraitShift: 0.1 } as Shot,
      drive: { target: V(0, 0.8, -4), dir: V(0.5, 0.5, 1), radius: 4.2, portraitRadius: 3.0, portraitShift: 0.3 } as Shot,
    };
  }

  // ---------- per frame ----------
  private frame(dt: number, tt: number) {
    const s = this.stage;
    s.fx.update(dt);
    if (this.car) {
      this.car.body.position.y = this.lift + (this.engineOn ? Math.sin(tt * 60) * 0.006 : 0);
      this.car.body.rotation.z = this.engineOn ? Math.sin(tt * 47) * 0.004 : 0;
      s.garage.lift.carriage.position.y = this.lift;
      if (this.engineOn && !this.car.ev && Math.random() < dt * 5) s.fx.smoke(this.car.tailpipe(), V(0, 0, -1), 1, '#f0f0f0');
    }
    this.frameInsets();
    this.skipFrame();
    s.rig.apply(tt, dt);
    fadePosts(s.garage.lift, s.rig.camera.position, s.rig.target, dt || 1);
    this.ui.marker(null);
    const mp = this.markerFor ? s.project(this.markerFor.getWorldPosition(V(0, 0, 0))) : null;
    const target = this.input.current().find((x) => x.id === this.expected) ?? this.input.current()[0];
    // the gesture hand shows how to act (hidden while the player is already holding / rubbing)
    this.ui.gesture(mp && target && !this.input.busy ? mp : null, target?.mode ?? 'tap');
    this.halo.visible = !!this.markerFor;
    if (this.markerFor) {
      this.markerFor.getWorldPosition(this.halo.position);
      const k = 0.5 + 0.5 * Math.sin(tt * 6);
      this.halo.scale.setScalar(this.haloSize * (0.9 + 0.25 * k));
      (this.halo.material as THREE.SpriteMaterial).opacity = 0.55 + 0.35 * k;
    }
    this.ui.placeHint(mp);
    const te = this.tutTarget ? this.ui.root.querySelector(this.tutTarget) : null;
    const tr = te?.getBoundingClientRect();
    this.ui.hand(tr && tr.width ? { x: tr.left + tr.width / 2, y: tr.top + tr.height / 2 } : null);
    this.ui.tags(
      this.tagsFor.map((g) => {
        const p = s.project(g.obj.getWorldPosition(V(0, 0, 0)).add(V(0, 0.07, 0)));
        return { x: p.x, y: p.y, text: g.text, color: g.color };
      }),
    );
  }

  /** the camera frames the subject in the band between the top HUD strips and the bottom toolbar / action button */
  private frameInsets() {
    const H = window.innerHeight;
    let top = 0;
    let bottom = 0;
    for (const e of this.ui.root.querySelectorAll<HTMLElement>('.hud, .steps, .ticket.compact')) {
      const b = e.getBoundingClientRect();
      if (b.height && b.bottom < H / 2) top = Math.max(top, b.bottom);
    }
    for (const e of this.ui.root.querySelectorAll<HTMLElement>('.toolbar, .center-action')) {
      const b = e.getBoundingClientRect();
      if (b.height && b.top > H / 2) bottom = Math.max(bottom, H - b.top);
    }
    this.stage.rig.setInsets(top + 4, bottom + 4);
  }

  /*
   * Skippable waits: nothing to do for the player, so a tap anywhere plays the rest 4x faster.
   * A small "tap to speed up" chip appears when the wait is more than a moment.
   */
  private skipN = 0;
  /** game time since the player last had something to do inside a skippable stretch */
  private skipIdle = 0;
  async skippable<T>(p: Promise<T>): Promise<T> {
    if (this.skipN++ === 0) this.skipIdle = clock.t;
    try {
      return await p;
    } finally {
      if (--this.skipN === 0) {
        clock.scale = 1;
        this.ui.skipChip(null);
      }
    }
  }

  /** the player's turn (something to touch) inside a skippable stretch: back to normal speed, no chip */
  private get playerTurn() {
    return this.input.current().length > 0 || this.paused;
  }

  speedUp() {
    if (this.skipN <= 0 || this.playerTurn) return;
    clock.scale = 4;
    this.ui.skipChip('fast');
  }

  private skipFrame() {
    if (this.skipN <= 0) return;
    if (this.playerTurn) {
      this.skipIdle = clock.t;
      clock.scale = 1;
      this.ui.skipChip(null);
    } else if (clock.t - this.skipIdle > 0.5) this.ui.skipChip(clock.scale > 1 ? 'fast' : 'on');
  }

  /** parts fitted at the last failed test drive (-1: not tested yet) */
  private testedFits = -1;

  /** a soft glow behind the object to touch */
  private halo = makeHalo();
  private haloSize = 0.25;
  /** mark the object to touch: glow halo + gesture hand (size from the object) */
  mark(obj: THREE.Object3D | null) {
    this.markerFor = obj;
    if (!obj) return;
    if (!this.halo.parent) this.stage.scene.add(this.halo);
    const r = new THREE.Box3().setFromObject(obj).getBoundingSphere(new THREE.Sphere()).radius;
    this.haloSize = Math.min(0.42, Math.max(0.09, r * 2.4));
  }

  // ---------- the one hint line ----------
  /** show a step's hint unless the player already did that step correctly before */
  hint(key: string | null, params?: Record<string, string | number>) {
    if (!key || this.save.hintsSeen.includes(key)) {
      this.ui.prompt(null);
      return;
    }
    this.ui.prompt(t(key, params));
  }

  /** the player did the step right: hide its hint, now and next time */
  hintDone(key: string | null) {
    this.ui.prompt(null);
    if (key && !this.save.hintsSeen.includes(key)) {
      this.save.hintsSeen.push(key);
      this.persist();
    }
  }

  setClock() {
    this.ui.setClock(this.job.minutes, this.job.def.targetMinutes, this.job.timeBonusNow());
  }

  /** show bought upgrades in the garage */
  refreshGarage() {
    const ups = this.stage.garage.upgrades;
    for (const u of Object.keys(ups) as UpgradeId[]) ups[u].visible = owns(this.save, u);
  }

  // ---------- scene setup ----------
  placeCars(type: CarType, next: CarType, other: CarType) {
    for (const c of [this.car, this.parked, this.waiting]) c?.root.removeFromParent();
    for (const p of this.props) p.removeFromParent();
    this.props = [];
    this.stage.garage.cart.children.filter((c) => c.userData.part).forEach((c) => c.removeFromParent());
    this.car = new Car(type);
    this.car.root.position.set(0, 0, -12);
    this.stage.scene.add(this.car.root);
    this.bay = new EngineBay(this.car);
    this.parked = new Car(next);
    this.parked.root.position.set(4.45, 0, 0.7);
    this.parked.root.rotation.y = -0.12;
    this.waiting = new Car(other);
    this.waiting.root.position.set(2.7, 0, -9.6);
    this.waiting.root.rotation.y = 0.35;
    this.stage.scene.add(this.parked.root, this.waiting.root);
    this.lift = 0;
    this.engineOn = false;
  }

  private sceneryCars(n: number): [CarType, CarType] {
    const open = CAR_TYPES.filter((c) => CARS[c].unlock <= Math.max(1, n));
    return [open[(n + 1) % open.length], open[(n + 3) % open.length]];
  }

  // ---------- menu loop ----------
  /** capture / test entry: start a given career job at once (`?job=N`) */
  async start(job: number | null) {
    if (job) {
      this.save.tutorialDone = this.save.tutorialDone || job > 1;
      sdk.loadingStop();
      await this.playJob(careerJob(job), false);
      return;
    }
    await this.run();
  }

  async run() {
    this.phase = 'menu';
    this.ui.clearJob();
    this.ui.showMoney(true);
    this.ui.setMoney(this.save.money);
    const [a, b] = this.sceneryCars(this.save.career);
    this.placeCars(careerJob(Math.min(this.save.career, CAREER_LENGTH)).car, a, b);
    this.car.root.position.z = 0;
    this.stage.rig.snap(this.shots().title);
    sdk.loadingStop();
    await sdk.ready?.();
    this.ui.keysHelp(ads());
    // a brand-new player lands straight in the first job: the tutorial happens inside gameplay
    const cover = this.ui.root.classList.contains('cover-mode');
    if (!cover && this.save.stats.jobs === 0 && this.save.career === 1 && !this.save.tutorialDone && !this.firstRunDone) {
      this.firstRunDone = true;
      await this.career();
      return;
    }
    for (;;) {
      this.phase = 'menu';
      const choice = await mainMenu(this.ui.root, { career: this.save.career, total: CAREER_LENGTH, dailyDone: dailyDone(this.save, todayKey()) });
      unlockAudio();
      if (choice === 'play') {
        await sdk.midgame('preroll');
        await this.career();
        return;
      }
      if (choice === 'daily') {
        const today = todayKey();
        const d = dailyJob(today, this.save.career);
        if (await dailyScreen(this.ui.root, dailyDone(this.save, today), t(`car.${d.car}`))) {
          await this.playJob(d, false);
          return;
        }
      }
      if (choice === 'garage') await garageScreen(this.ui.root, this.save, (u) => this.buy(u));
      if (choice === 'book') await bookScreen(this.ui.root, this.save);
      if (choice === 'achievements') await achievementsScreen(this.ui.root, this.save);
      if (choice === 'settings') await this.settings();
    }
  }

  private async career() {
    await this.playJob(careerJob(this.save.career), true);
  }

  buy(u: UpgradeId) {
    if (this.save.money < UPGRADES[u].price) {
      this.ui.toast(t('toast.noMoney'), 'bad');
      sfx.bad();
      return false;
    }
    const ach = buyUpgrade(this.save, u);
    if (!ach) return false;
    sfx.cash();
    this.ui.setMoney(this.save.money);
    this.refreshGarage();
    this.persist();
    this.ui.toast(t('toast.bought', { name: t(`upgrade.${u}.name`) }), 'good');
    this.announce(ach);
    return true;
  }

  announce(ach: string[]) {
    ach.forEach((a, i) => clock.later(0.6 + i * 2, () => (this.ui.toast(t('toast.achievement', { name: t(`ach.${a}.name`) }), 'good', 2.2), sfx.star(2))));
  }

  async settings() {
    await settingsScreen(this.ui.root, {
      settings: this.save.settings,
      lang: getLang(),
      onMusic: (v) => {
        this.save.settings.music = v;
        this.applySound();
        this.persist();
      },
      onSfx: (v) => {
        this.save.settings.sfx = v;
        this.applySound();
        this.persist();
      },
      onLang: (l) => {
        this.save.settings.lang = l;
        setLang(Play.chooseLang(this.save));
        this.persist();
      },
      onReset: () => {
        const keep = this.save.settings;
        this.save = newSave();
        this.save.settings = keep;
        this.persist();
        this.ui.setMoney(this.save.money);
        this.refreshGarage();
        this.ui.toast(t('settings.resetDone'), 'info');
      },
    });
  }

  // ---------- pause ----------
  private async pause() {
    if (this.paused || !this.phase.match(/^(arrive|diagnose|tool|fit|test|handback)/)) return;
    this.paused = true;
    sdk.gameplayStop();
    for (;;) {
      const c = await pauseScreen(this.ui.root);
      if (c === 'settings') {
        await this.settings();
        continue;
      }
      if (c === 'menu' && !(await confirm(this.ui.root, t('pause.leave'), t('pause.leaveYes')))) continue;
      this.paused = false;
      if (c === 'menu') {
        // Playgama: Bridge's level_failed (the job was left unfinished)
        if (__PLATFORM__ === 'playgama') sdk.levelEnd?.(false);
        this.abandon();
        return;
      }
      sdk.gameplayStart();
      return;
    }
  }

  /** leave the current job: freeze its flow and go back to the menu */
  private abandon() {
    clock.cancelAll();
    this.input.cancel();
    sfx.engineStop();
    this.endTutorial(false);
    clock.every(this.frameFn);
    this.markerFor = null;
    this.tagsFor = [];
    this.expected = null;
    this.ratchet.hide();
    void this.run();
  }

  // ---------- rewarded ads ----------
  /** a rewarded ad the player asked for; true only when it really completed */
  async rewarded(label: string) {
    if (!ads()) return false;
    if (!this.adNoticeShown) {
      const ok = await adNotice(this.ui.root, label);
      if (!ok) return false;
      this.adNoticeShown = true;
    }
    const ok = await sdk.rewarded();
    // "No ad available right now, try later" for 2.5 s when the ad did not complete (no fill, error, 8 s timeout)
    if (!ok) this.ui.toast(t('toast.noAd'), 'info', 2.5);
    return ok;
  }

  // ---------- tutorial ----------
  private tutorial(step: string, target?: string | THREE.Object3D) {
    if (this.save.tutorialDone || this.job?.def.n !== 1) return;
    this.tut?.close();
    this.ui.tutorialHint(t(`tut.${step}`), () => this.endTutorial(true));
    this.tut = { step, close: () => this.ui.tutorialHint(null) };
    this.ui.root.querySelectorAll('.tut-glow').forEach((e) => e.classList.remove('tut-glow'));
    this.tutTarget = typeof target === 'string' ? target : null;
    if (this.tutTarget) this.ui.root.querySelector(this.tutTarget)?.classList.add('tut-glow');
    this.ui.hand(null);
  }

  /** the first-job tutorial is running */
  private get tutOn() {
    return !this.save.tutorialDone && this.job?.def.n === 1;
  }

  /** the button the tutorial points at (its hand follows it while it is on screen) */
  private tutTarget: string | null = null;

  private endTutorial(save: boolean) {
    this.tutTarget = null;
    this.ui.root.querySelectorAll('.tut-glow').forEach((e) => e.classList.remove('tut-glow'));
    this.tut?.close();
    this.tut = null;
    this.ui.hand(null);
    if (save) {
      this.save.tutorialDone = true;
      this.persist();
    }
  }

  // ---------- one job ----------
  async playJob(def: JobDef, careerMode: boolean) {
    for (let d: JobDef | null = def; d; ) {
      const next = await this.runJob(d);
      if (next === 'menu') break;
      await sdk.midgame('between');
      d = careerMode || !d.daily ? careerJob(this.save.career) : null;
    }
    void this.run();
  }

  /** returns what the player picked on the payment screen */
  private async runJob(def: JobDef): Promise<'next' | 'menu'> {
    this.ui.clearJob();
    document.querySelector('.title')?.remove();
    const [a, b] = this.sceneryCars(def.n || this.save.career);
    this.placeCars(def.car, a, b);
    if (def.faults.includes('scratch')) this.car.addScratch();
    this.job = new Job(def, this.ctx);
    this.testedFits = -1;
    sdk.gameplayStart();
    this.ui.showMoney(false);
    this.ui.showHud(true);
    this.ui.keysHelp(ads() && !this.job.hintUsed);
    this.setClock();
    this.stage.rig.snap(this.shots().garage);
    await this.skippable(this.driveIn());
    this.phase = 'diagnose';
    const symptoms = def.faults.map((f) => t(def.mod === 'misleading' && FAULTS[f].misleads ? `fault.${f}.mislead` : `fault.${f}.symptom`));
    this.ui.showTicket(def, symptoms);
    sfx.whoosh();
    await clock.wait(0.3);
    while (!(await this.diagnoseLoop()));
    return this.handBack();
  }

  private async driveIn() {
    this.phase = 'arrive';
    const r = this.car.root;
    sfx.drive(1.5);
    let last = -12;
    await clock.tween(1.5, (k) => {
      r.position.z = lerp(-12, 0, k);
      this.car.spinWheels(r.position.z - last);
      last = r.position.z;
    }, ease.out);
    await clock.tween(0.25, (k) => (this.car.body.rotation.x = Math.sin(k * Math.PI) * 0.03));
  }

  private toolsFor(): ToolId[] {
    return TOOL_IDS;
  }

  /** the diagnose phase. Resolves true once the test drive passed. */
  private async diagnoseLoop(): Promise<boolean> {
    this.phase = 'diagnose';
    const j = this.job;
    const anyFixed = j.fixed.size > 0;
    if (window.innerHeight > window.innerWidth) this.ui.compactTicket(j.clues.size === 0 && !anyFixed);
    const installed = anyFixed || j.wrong.length > 0;
    // a part was fitted since the last test drive: testing is the next move
    const fits = j.fixed.size + j.wrong.length;
    const newFit = installed && fits > this.testedFits;
    // the last test drive failed and nothing changed since: find the fault that is left
    const failed = this.testedFits >= 0 && !newFit;
    this.ui.steps(newFit ? 'test' : 'diagnose');
    const hintKey = newFit ? 'prompt.fixedMore' : failed ? null : j.clues.size ? 'prompt.diagnoseMore' : 'prompt.diagnose';
    if (failed) this.ui.prompt(t('prompt.oneMore'));
    else this.hint(hintKey);
    const choice = await new Promise<{ k: 'tool'; t: ToolId } | { k: 'hint' } | { k: 'repair' } | { k: 'test' }>((res) => {
      this.ui.toolbar({
        tools: this.toolsFor().map((id) => ({ id, used: j.clues.has(id), locked: !!TOOLS[id].upgrade && !owns(this.save, TOOLS[id].upgrade!), minutes: j.toolMinutes(id) })),
        onTool: (tt) => res({ k: 'tool', t: tt }),
        onLocked: (tt) => {
          sfx.bad();
          this.ui.toast(t('tool.lockedToast', { tool: t(`tool.${tt}`) }), 'info');
        },
        hint: ads() && !j.hintUsed,
        onHint: () => res({ k: 'hint' }),
        onRepair: () => res({ k: 'repair' }),
        onTest: () => res({ k: 'test' }),
        repairReady: j.clues.size > 0 && !newFit,
        testReady: installed,
        testPulse: newFit,
      });
      if (this.tutOn) {
        if (!j.clues.size) this.tutorial('tool', '[data-tool=tester]');
        else if (!anyFixed) this.tutorial('repair', '[data-tool=repair]');
        else this.tutorial('test', '[data-tool=test]');
      }
    });
    this.ui.toolbar(null);
    // the tutorial line of this step is done once the player pressed a button
    if (this.tut) this.tut.close();
    this.tutTarget = null;
    // the hint is done once the player made the move it asked for
    if ((choice.k === 'tool' && hintKey === 'prompt.diagnose') || (choice.k === 'repair' && hintKey === 'prompt.diagnoseMore') || (choice.k === 'test' && hintKey === 'prompt.fixedMore')) this.hintDone(hintKey);
    else this.ui.prompt(null);
    if (choice.k === 'tool') {
      await this.useTool(choice.t, false);
      return false;
    }
    if (choice.k === 'hint') {
      const ok = await this.rewarded(t('ad.hint'));
      if (!ok) return false;
      const tool = j.hintTool(BASE_TOOLS);
      j.hintUsed = true;
      if (tool) {
        this.ui.toast(t('toast.hint', { tool: t(`tool.${tool}`) }), 'info');
        await clock.wait(0.6);
        await this.useTool(tool, true);
      }
      return false;
    }
    if (choice.k === 'test') return this.testDrive();
    const sheet = this.ui.partsSheet(this.save.money, j.def.car, ads(), this.partsTab());
    if (this.tutOn) this.tutorial('part', '[data-part=battery]');
    const pick = await sheet;
    if (this.tut) this.tut.close();
    this.tutTarget = null;
    if (!pick) return false;
    let free = false;
    if (pick.free) {
      free = await this.rewarded(t('ad.free'));
      if (!free) return false;
      this.ui.toast(t('toast.freePart'), 'good');
    }
    // the whole fitting is skippable between the player's own moves (part drop, camera moves, bolts spinning)
    await this.skippable(this.repairs.orderAndFit(pick.part, free));
    return false;
  }

  /** the parts sheet opens where the latest problem was found (no hunting through the tabs) */
  private partsTab(): PartCat | undefined {
    const bad = [...this.job.clues.values()].filter((r) => r.verdict === 'bad').pop();
    if (!bad) return undefined;
    const ev = !!CARS[this.job.def.car].ev;
    let best = 0;
    let cat: PartCat | undefined;
    for (const f of Object.keys(FAULTS) as FaultId[]) {
      const d = FAULTS[f];
      if (d.cars === (ev ? 'fuel' : 'ev')) continue;
      const k = d.findings.filter((x) => bad.findings.includes(x)).length / d.findings.length;
      if (k > best) {
        best = k;
        cat = PARTS[d.part].cat;
      }
    }
    return cat;
  }

  // ---------- diagnosis tools ----------
  async useTool(tool: ToolId, free: boolean) {
    this.phase = `tool:${tool}`;
    const j = this.job;
    const r = j.useTool(tool, free);
    this.ui.compactTicket(true);
    const na = r.verdict === 'na';
    if (tool === 'tester') await this.testerScene();
    else await this.skippable(this.toolScene(tool, r.findings, na));
    this.ui.prompt(null);
    sfx[r.verdict === 'bad' ? 'bad' : 'good']();
    await this.ui.readout(tool, r, j.def.car);
    this.ui.setClue(r, j.def.car);
    this.setClock();
    if (tool === 'tester') await this.testerDone();
    // back to the garage view while the toolbar is already up (no wait)
    void this.stage.rig.go(this.shots().garage, 0.8);
    if (tool === 'lift') void this.raise(false);
    this.ui.compactTicket(false);
  }

  /** what a diagnosis tool shows while it works (skippable: no input needed) */
  private async toolScene(tool: ToolId, findings: readonly string[], na: boolean) {
    const sh = this.shots();
    if (tool === 'obd') {
      await this.stage.rig.go(sh.side, 0.8);
      this.ui.prompt(t('prompt.obd'));
      for (let i = 0; i < 3; i++) {
        if (!na) sfx.beep();
        await clock.wait(0.35);
      }
    } else if (tool === 'listen') {
      await this.stage.rig.go(sh.listen, 0.8);
      this.ui.prompt(t('prompt.listen'));
      await clock.wait(0.4);
      await this.crank(findings.includes('clicking') ? 'click' : findings.includes('cranks') ? 'crank' : 'run', 1.6);
    } else if (tool === 'lift') {
      await this.raise(true);
      await this.stage.rig.go(sh.under, 1.0);
      this.ui.prompt(t('prompt.lift'));
      await clock.wait(0.9);
    } else if (tool === 'drive') {
      this.ui.prompt(t('prompt.drive'));
      await this.driveLoop(findings.includes('no_start'));
    } else if (tool === 'gauge') {
      await this.stage.rig.go(sh.wheel, 0.8);
      this.ui.prompt(t('prompt.gauge'));
      const g = this.stage.garage.upgrades.gauge.clone();
      g.visible = true;
      const w = this.car.wheel;
      g.position.copy(this.car.world(w.outerX + 0.05, w.center.y - 0.16, w.center.z + 0.08));
      this.stage.scene.add(g);
      for (let i = 0; i < 4; i++) {
        sfx.lift();
        g.rotation.z = Math.sin(i) * 0.2;
        await clock.wait(0.3);
      }
      g.removeFromParent();
    } else if (tool === 'exhaust') {
      await this.stage.rig.go(sh.rear, 0.8);
      this.ui.prompt(t('prompt.exhaust'));
      const probe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 0, 0), V(0.25, 0.1, -0.3), V(0.6, 0.05, -0.5)]), 12, 0.018, 6), new THREE.MeshStandardMaterial({ color: '#2a2f3a', roughness: 0.7 }));
      if (!na) probe.position.copy(this.car.tailpipe());
      this.stage.scene.add(probe);
      if (!na) await this.crank(this.job.remaining.some((f) => FAULTS[f].noStart) ? 'click' : 'run', 1.4);
      else await clock.wait(0.6);
      probe.removeFromParent();
    }
  }

  /** turn the key: clicking, cranking without catching, or a short run */
  async crank(kind: 'click' | 'crank' | 'run', runFor: number) {
    if (kind === 'click') {
      sfx.clicking(9);
      for (let i = 0; i < 9; i++) {
        this.car.body.rotation.x = 0.004;
        await clock.wait(0.045);
        this.car.body.rotation.x = 0;
        await clock.wait(0.045);
      }
      return;
    }
    if (kind === 'crank') {
      sfx.cranking();
      for (let i = 0; i < 12; i++) {
        this.car.body.rotation.z = i % 2 ? 0.006 : -0.006;
        await clock.wait(0.1);
      }
      this.car.body.rotation.z = 0;
      return;
    }
    if (this.car.ev) sfx.evOn();
    else sfx.engineStart();
    await clock.wait(this.car.ev ? 0.3 : 0.75);
    this.engineOn = !this.car.ev;
    await clock.wait(runFor);
    sfx.engineStop();
    this.engineOn = false;
  }

  private liftGen = 0;
  async raise(up: boolean, height = LIFT_UP) {
    sfx.lift();
    const from = this.lift;
    const to = up ? height : 0;
    // a newer lift move takes over from one still running
    const g = ++this.liftGen;
    await clock.tween((1.4 * Math.abs(to - from)) / LIFT_UP + 0.2, (k) => g === this.liftGen && (this.lift = lerp(from, to, k)), ease.inOut);
  }

  /** a short drive: out of the door backwards and back in (or a failed start) */
  async driveLoop(noStart: boolean) {
    if (noStart) {
      await this.stage.rig.go(this.shots().listen, 0.7);
      await this.crank(this.job.remaining.some((f) => f === 'fuel-pump') ? 'crank' : 'click', 0);
      return;
    }
    await this.stage.rig.go(this.shots().drive, 0.8);
    if (this.car.ev) sfx.evOn();
    else sfx.engineStart();
    await clock.wait(0.6);
    this.engineOn = !this.car.ev;
    const r = this.car.root;
    let last = 0;
    sfx.drive(4);
    await clock.tween(1.8, (k) => {
      r.position.z = lerp(0, -9, k);
      this.car.spinWheels(r.position.z - last);
      last = r.position.z;
    }, ease.inOut);
    await clock.wait(0.3);
    await clock.tween(1.8, (k) => {
      r.position.z = lerp(-9, 0, k);
      this.car.spinWheels(r.position.z - last);
      last = r.position.z;
    }, ease.inOut);
    sfx.engineStop();
    this.engineOn = false;
  }

  private async testerScene() {
    const sh = this.shots();
    // the hood opens while the camera is still moving in
    const cam = this.stage.rig.go(sh.engine, 0.8);
    await clock.wait(0.3);
    this.bay.group.visible = true;
    sfx.hood();
    await Promise.all([cam, this.bay.openHood()]);
    const tst = this.tester;
    this.bay.group.add(tst.group);
    tst.group.position.set(-this.bay.W / 2 + 0.42, 0.1, this.bay.L / 2 + 0.12);
    tst.group.rotation.set(0.25, -0.35, 0);
    tst.rest();
    tst.screen.draw('--.-', '#9fe7b5', t('screen.ready'));
    tst.group.visible = true;
    sfx.pop();
    const reading = this.job.reading('tester');
    for (const [i, term, key] of [
      [0, 'pos', 'prompt.testerPos'],
      [1, 'neg', 'prompt.testerNeg'],
    ] as const) {
      this.hint(key);
      const obj = this.bay.object(term);
      this.mark(obj);
      this.expected = term;
      if (this.tut) this.tut.close();
      this.tagsFor = [
        { obj: this.bay.pos.group, text: '+', color: '#d6453b' },
        { obj: this.bay.neg.group, text: '−', color: '#30333a' },
      ];
      const other = term === 'pos' ? 'neg' : 'pos';
      await this.input.interact([
        { id: term, obj, mode: 'tap' },
        {
          id: other,
          obj: this.bay.object(other),
          mode: 'tap',
          guard: () => {
            sfx.bad();
            this.ui.flashHint(t(i === 0 ? 'toast.redPos' : 'toast.blackNeg'));
            return false;
          },
        },
      ]);
      this.expected = null;
      this.hintDone(key);
      sfx.clink();
      tst.group.updateMatrixWorld(true);
      const local = tst.group.worldToLocal(obj.getWorldPosition(V(0, 0, 0)).add(V(0, 0.02, 0)));
      const start = tst.leads[i].end.position.clone();
      await clock.tween(0.3, (k) => tst.setLead(i, start.clone().lerp(local, k)), ease.out);
    }
    this.markerFor = null;
    this.tagsFor = [];
    this.ui.hand(null);
    this.ui.prompt(t('prompt.measuring'));
    const value = reading.verdict === 'bad' ? parseFloat(String(reading.findings.includes('low_volt') ? 11.2 : 12.1)) : 12.6;
    await clock.tween(0.7, (k) => tst.screen.draw((value * k).toFixed(1), '#9fe7b5', t('screen.volts')));
    sfx.beep();
    const bad = reading.verdict === 'bad';
    tst.screen.draw(value.toFixed(1), bad ? '#ff8a7a' : '#9fe7b5', t(bad ? 'screen.weak' : 'screen.good'));
    await clock.wait(0.35);
    this.ui.prompt(null);
    if (this.tutOn) this.tutorial('clue');
  }

  private async testerDone() {
    this.tester.group.visible = false;
    await this.bay.closeHood();
    sfx.hoodShut();
    this.bay.hide();
  }

  // ---------- test drive ----------
  private async testDrive(): Promise<boolean> {
    this.phase = 'test';
    this.ui.steps('test');
    this.ui.compactTicket(true);
    this.endTutorialStep('test');
    await this.stage.rig.go(this.shots().test, 0.9);
    await this.ui.centerAction(`<svg width="34" height="34" viewBox="0 0 64 64"><circle cx="20" cy="32" r="12" fill="none" stroke="#fff" stroke-width="7"/><path d="M31 32h25M48 32v9M56 32v7" stroke="#fff" stroke-width="7" stroke-linecap="round"/></svg> ${t('action.test')}`, 'green', t('prompt.test'));
    return this.skippable(this.testRun());
  }

  /** the car starts (or not) and the result shows: no input needed, so skippable */
  private async testRun(): Promise<boolean> {
    const res = this.job.test();
    this.setClock();
    const noStart = res.remaining.some((f) => FAULTS[f].noStart);
    if (noStart) {
      await this.crank(res.remaining.includes('fuel-pump') ? 'crank' : 'click', 0);
    } else {
      if (this.car.ev) sfx.evOn();
      else sfx.engineStart();
      await clock.wait(0.75);
      this.engineOn = !this.car.ev;
      this.stage.rig.shake(0.03, 0.4);
      if (!this.car.ev) this.stage.fx.smoke(this.car.tailpipe(), V(0, 0, -1), 14, '#e6e6e6');
    }
    if (res.ok) {
      this.stage.fx.sparkle(this.car.world(0, this.car.size.y + 0.1, 0), 24);
      this.ui.toast(t('toast.runs'), 'good');
      sdk.happytime();
      await clock.wait(0.9);
      return true;
    }
    await clock.wait(0.8);
    sfx.engineStop();
    this.engineOn = false;
    sfx.bad();
    sdk.sadMoment?.('test_failed');
    this.ui.toast(t('toast.notFixed', { symptom: t(`fault.${res.remaining[0]}.symptom`) }), 'bad', 2.6);
    this.testedFits = this.job.fixed.size + this.job.wrong.length;
    await clock.wait(1.2);
    void this.stage.rig.go(this.shots().garage, 0.8);
    return false;
  }

  endTutorialStep(step: string) {
    if (this.tut?.step === step) this.ui.hand(null);
  }

  // ---------- hand back + payment ----------
  private async handBack(): Promise<'next' | 'menu'> {
    this.phase = 'handback';
    this.ui.steps(null);
    this.ui.hideTicket();
    const r = this.car.root;
    sfx.drive(1.6);
    let last = 0;
    // the customer drives off while the camera pulls back (skippable)
    await this.skippable(
      Promise.all([
        this.stage.rig.go(this.shots().garage, 0.9),
        clock.tween(1.6, (k) => {
          r.position.z = lerp(0, -12, k);
          this.car.spinWheels(r.position.z - last);
          last = r.position.z;
        }, ease.in),
      ]),
    );
    sfx.engineStop();
    this.engineOn = false;
    sdk.gameplayStop();
    // Playgama: Bridge's level_completed (the car is fixed and paid)
    if (__PLATFORM__ === 'playgama') sdk.levelEnd?.(true);
    const j = this.job;
    const p = j.payout();
    this.phase = 'payment';
    if (this.tutOn) {
      this.endTutorial(true);
      clock.later(1.2, () => this.ui.toast(t('tut.done'), 'good', 3));
    }
    sfx.cash();
    const before = this.save.career;
    const thanks = `pay.thanks${1 + ((j.def.n + j.minutes) % 4)}`;
    const extra = before === CAREER_LENGTH && !j.def.daily ? t('pay.careerDone') : '';
    const choice = await this.ui.payment(p, j.def.customer.name, thanks, ads(), (i) => sfx.star(i), extra);
    let total = p.total;
    if (choice === 'double' && (await this.rewarded(t('ad.double')))) total *= 2;
    const mid = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    this.ui.coins(mid.x, mid.y, 10);
    for (let i = 0; i < 6; i++) sfx.coin(i * 0.08);
    await this.ui.countMoney(this.ui.money + total, 0.9);
    const ach = finishJob(this.save, j.def, p, total, j.wrong.length, todayKey());
    this.save.money = this.ui.money;
    this.persist();
    this.announce(ach);
    // introduce the garage when the first upgrade becomes affordable
    if (!this.garageHinted && !this.save.upgrades.length && this.save.money >= Math.min(...Object.values(UPGRADES).map((u) => u.price))) {
      this.garageHinted = true;
      clock.later(1.2, () => this.ui.toast(t('toast.garageHint'), 'info', 3));
    }
    for (const c of CAR_TYPES) if (CARS[c].unlock === this.save.career && before < this.save.career && !j.def.daily) clock.later(0.3, () => this.ui.toast(t('toast.newCar', { car: t(`car.${c}`) }), 'good', 2.4));
    await clock.wait(choice === 'menu' ? 0.3 : 0.6);
    return choice === 'menu' ? 'menu' : 'next';
  }

}

/** a soft round glow sprite (drawn on top) that marks the object to touch */
function makeHalo() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,240,150,0.0)');
  gr.addColorStop(0.45, 'rgba(255,225,90,0.55)');
  gr.addColorStop(0.62, 'rgba(255,215,60,0.9)');
  gr.addColorStop(1, 'rgba(255,200,40,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  sp.renderOrder = 10;
  sp.visible = false;
  return sp;
}

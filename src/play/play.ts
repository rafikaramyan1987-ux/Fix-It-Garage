/**
 * The game flow: main menu, career / daily jobs, diagnosis with tools, repairs, the test drive, payment, upgrades,
 * pause, rewarded ads (platform builds only) and the first-job tutorial.
 */
import * as THREE from 'three';
import { sfx, setMusic, setMuted, setSfx, unlockAudio } from '../app/audio';
import { clock, ease, lerp } from '../app/clock';
import { Input } from '../app/input';
import { sdk } from '../app/sdk';
import { BASE_TOOLS, CARS, CAR_TYPES, FAULTS, PARTS, TOOLS, TOOL_IDS, UPGRADES, type CarType, type FaultId, type PartId, type ToolId, type UpgradeId } from '../game/data';
import { Job } from '../game/job';
import { CAREER_LENGTH, careerJob, dailyJob, todayKey, type JobDef } from '../game/jobs';
import { buyUpgrade, dailyDone, finishJob, garageCtx, loadSave, newSave, owns, writeSave, type SaveData } from '../game/progress';
import { getLang, pickLang, setLang, t, type Lang } from '../i18n';
import { Car } from '../render/cars';
import type { Shot } from '../render/camera';
import { EngineBay, Ratchet, Tester } from '../render/engineBay';
import type { Stage } from '../render/stage';
import { achievementsScreen, adNotice, bookScreen, confirm, dailyScreen, garageScreen, mainMenu, pauseScreen, settingsScreen, tutorialBubble } from '../ui/screens';
import type { UI } from '../ui/ui';
import { Repairs } from './repairs';

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const LIFT_UP = 1.3;
/** rewarded ads exist only in the portal builds (never in the plain web build) */
export const ADS = __PLATFORM__ !== 'web';

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
    sdk.onMute = (m) => setMuted(m);
    ui.onPause = () => void this.pause();
    ui.setMoney(this.save.money);
    window.addEventListener('pointerdown', () => unlockAudio(), { capture: true });
    clock.every(this.frameFn);
    this.refreshGarage();
  }

  /** the language: the player's choice, else the portal's / browser's, else English */
  static chooseLang(save: SaveData): Lang {
    const portal = __PLATFORM__ === 'gamepix' || __PLATFORM__ === 'crazygames' ? sdk.locale() : null;
    const nav = typeof navigator !== 'undefined' ? [...(navigator.languages ?? []), navigator.language] : [];
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

  // ---------- camera shots ----------
  shots() {
    const c = this.car;
    const bayC = c.world(0, c.hoodY + 0.08, (c.hoodBackZ + c.frontZ) / 2);
    const w = c.wheel.center;
    return {
      title: { target: V(0.4, 1.2, -1.2), dir: V(0.55, 0.38, 1), radius: 4.6, portraitShift: -0.4 } as Shot,
      garage: { target: V(0.1, 0.9, -0.2), dir: V(0.5, 0.4, 1), radius: 3.4, portraitShift: 0.55, landscapeShift: 0.35 } as Shot,
      engine: { target: bayC, dir: V(-0.15, 1.6, 0.75), radius: 0.78, portraitShift: 0.1 } as Shot,
      under: { target: V(0, LIFT_UP + 0.15, 0), dir: V(1.4, -0.75, 1.9), radius: 1.5, portraitShift: 0.2 } as Shot,
      side: { target: V(0.7, 0.75, 0.15), dir: V(1, 0.35, 0.25), radius: 1.0, portraitShift: 0.2 } as Shot,
      listen: { target: V(0, 0.6, c.frontZ - 0.3), dir: V(0.35, 0.35, 1), radius: 1.2, portraitShift: 0.2 } as Shot,
      test: { target: V(0, 0.7, 0.2), dir: V(0.75, 0.32, 1), radius: 2.0, portraitShift: 0.35 } as Shot,
      wheel: { target: c.world(w.x + 0.15, w.y, w.z), dir: V(1, 0.3, 0.45), radius: 0.62, portraitShift: 0.05 } as Shot,
      rear: { target: V(0.2, 0.3, -c.size.z / 2), dir: V(0.8, 0.45, -1), radius: 0.9, portraitShift: 0.15 } as Shot,
      door: { target: c.world(c.size.x / 2, 0.6, 0.12), dir: V(0.9, 0.38, 1.0), radius: 0.95, portraitShift: 0.1 } as Shot,
      drive: { target: V(0, 0.8, -4), dir: V(0.5, 0.5, 1), radius: 4.2, portraitShift: 0.5 } as Shot,
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
    s.rig.apply(tt, dt);
    this.ui.marker(this.markerFor ? s.project(this.markerFor.getWorldPosition(V(0, 0, 0)).add(V(0, 0.03, 0))) : null);
    this.ui.tags(
      this.tagsFor.map((g) => {
        const p = s.project(g.obj.getWorldPosition(V(0, 0, 0)).add(V(0, 0.07, 0)));
        return { x: p.x, y: p.y, text: g.text, color: g.color };
      }),
    );
    if (this.tut && this.markerFor && (this.tut.step === 'swap' || this.tut.step === 'leads')) {
      const p = s.project(this.markerFor.getWorldPosition(V(0, 0, 0)));
      this.ui.hand({ x: p.x + 18, y: p.y + 22 });
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
    for (;;) {
      this.phase = 'menu';
      const choice = await mainMenu(this.ui.root, { career: this.save.career, total: CAREER_LENGTH, dailyDone: dailyDone(this.save, todayKey()) });
      unlockAudio();
      sfx.tap();
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
    if (!ADS) return false;
    if (!this.adNoticeShown) {
      const ok = await adNotice(this.ui.root, label);
      if (!ok) return false;
      this.adNoticeShown = true;
    }
    const wasPlaying = !this.paused;
    const ok = await sdk.rewarded();
    if (!ok) this.ui.toast(t('toast.noAd'), 'info', 2.5);
    void wasPlaying;
    return ok;
  }

  // ---------- tutorial ----------
  private tutorial(step: string, target?: string | THREE.Object3D) {
    if (this.save.tutorialDone || this.job?.def.n !== 1) return;
    this.tut?.close();
    const close = tutorialBubble(this.ui.root, t(`tut.${step}`), () => this.endTutorial(true));
    this.tut = { step, close };
    if (typeof target === 'string') {
      const r = this.ui.root.querySelector(target)?.getBoundingClientRect();
      this.ui.hand(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null);
    } else this.ui.hand(null);
  }

  private endTutorial(save: boolean) {
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
    sdk.gameplayStart();
    this.ui.showMoney(false);
    this.ui.showHud(true);
    this.setClock();
    this.stage.rig.snap(this.shots().garage);
    await this.driveIn();
    this.phase = 'diagnose';
    const symptoms = def.faults.map((f) => t(def.mod === 'misleading' && FAULTS[f].misleads ? `fault.${f}.mislead` : `fault.${f}.symptom`));
    this.ui.showTicket(def, symptoms);
    sfx.whoosh();
    this.tutorial('ticket');
    await clock.wait(0.3);
    while (!(await this.diagnoseLoop()));
    return this.handBack();
  }

  private async driveIn() {
    this.phase = 'arrive';
    const r = this.car.root;
    sfx.drive(2.6);
    let last = -12;
    await clock.tween(2.6, (k) => {
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
    this.ui.prompt(anyFixed ? t('prompt.fixedMore') : j.clues.size ? t('prompt.diagnoseMore') : t('prompt.diagnose'));
    const choice = await new Promise<{ k: 'tool'; t: ToolId } | { k: 'hint' } | { k: 'repair' } | { k: 'test' }>((res) => {
      this.ui.toolbar({
        tools: this.toolsFor().map((id) => ({ id, used: j.clues.has(id), locked: !!TOOLS[id].upgrade && !owns(this.save, TOOLS[id].upgrade!), minutes: j.toolMinutes(id) })),
        onTool: (tt) => res({ k: 'tool', t: tt }),
        onLocked: (tt) => {
          sfx.bad();
          this.ui.toast(t('tool.lockedToast', { tool: t(`tool.${tt}`) }), 'info');
        },
        hint: ADS && !j.hintUsed,
        onHint: () => res({ k: 'hint' }),
        onRepair: () => res({ k: 'repair' }),
        onTest: () => res({ k: 'test' }),
        repairReady: j.clues.size > 0 && !anyFixed,
        testReady: anyFixed || j.wrong.length > 0,
      });
      if (this.tut) {
        if (!j.clues.size) this.tutorial('tool', '[data-tool=tester]');
        else if (!anyFixed) this.tutorial('repair', '[data-tool=repair]');
        else this.tutorial('test', '[data-tool=test]');
      }
    });
    sfx.tap();
    this.ui.toolbar(null);
    this.ui.prompt(null);
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
    if (this.tut) this.tutorial('part', '[data-part=battery]');
    const pick = await this.ui.partsSheet(this.ui.money, j.def.car, ADS);
    if (!pick) return false;
    let free = false;
    if (pick.free) {
      free = await this.rewarded(t('ad.free'));
      if (!free) return false;
      this.ui.toast(t('toast.freePart'), 'good');
    }
    await this.repairs.orderAndFit(pick.part, free);
    return false;
  }

  // ---------- diagnosis tools ----------
  async useTool(tool: ToolId, free: boolean) {
    this.phase = `tool:${tool}`;
    const j = this.job;
    const already = j.clues.has(tool);
    const r = j.useTool(tool, free);
    this.ui.compactTicket(true);
    const sh = this.shots();
    const na = r.verdict === 'na';
    if (tool === 'tester') await this.testerScene();
    else if (tool === 'obd') {
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
      await this.crank(r.findings.includes('clicking') ? 'click' : r.findings.includes('cranks') ? 'crank' : 'run', 1.6);
    } else if (tool === 'lift') {
      await this.raise(true);
      await this.stage.rig.go(sh.under, 1.0);
      this.ui.prompt(t('prompt.lift'));
      await clock.wait(0.9);
    } else if (tool === 'drive') {
      this.ui.prompt(t('prompt.drive'));
      await this.driveLoop(r.findings.includes('no_start'));
    } else if (tool === 'gauge') {
      await this.stage.rig.go(sh.wheel, 0.8);
      this.ui.prompt(t('prompt.gauge'));
      for (let i = 0; i < 4; i++) {
        sfx.lift();
        await clock.wait(0.3);
      }
    } else if (tool === 'exhaust') {
      await this.stage.rig.go(sh.rear, 0.8);
      this.ui.prompt(t('prompt.exhaust'));
      if (!na) await this.crank(this.job.remaining.some((f) => FAULTS[f].noStart) ? 'click' : 'run', 1.4);
      else await clock.wait(0.6);
    }
    this.ui.prompt(null);
    sfx[r.verdict === 'bad' ? 'bad' : 'good']();
    await this.ui.readout(tool, r, j.def.car);
    if (!already || r.verdict !== j.clues.get(tool)?.verdict) this.ui.setClue(r, j.def.car);
    this.ui.setClue(r, j.def.car);
    this.setClock();
    if (tool === 'tester') await this.testerDone();
    await this.stage.rig.go(this.shots().garage, 0.8);
    if (tool === 'lift') await this.raise(false);
    this.ui.compactTicket(false);
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

  async raise(up: boolean, height = LIFT_UP) {
    sfx.lift();
    const from = this.lift;
    const to = up ? height : 0;
    await clock.tween(1.4 * Math.abs(to - from) / LIFT_UP + 0.2, (k) => (this.lift = lerp(from, to, k)), ease.inOut);
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
    await this.stage.rig.go(sh.engine, 0.9);
    this.bay.group.visible = true;
    sfx.hood();
    await this.bay.openHood();
    const tst = this.tester;
    this.bay.group.add(tst.group);
    tst.group.position.set(-this.bay.W / 2 + 0.42, 0.1, this.bay.L / 2 + 0.12);
    tst.group.rotation.set(0.25, -0.35, 0);
    tst.rest();
    tst.screen.draw('--.-', '#9fe7b5', t('screen.ready'));
    tst.group.visible = true;
    sfx.pop();
    const reading = this.job.reading('tester');
    const bat = this.bay.slots.battery ? null : this.bay.oldBattery;
    void bat;
    for (const [i, term, key] of [
      [0, 'pos', 'prompt.testerPos'],
      [1, 'neg', 'prompt.testerNeg'],
    ] as const) {
      this.ui.prompt(t(key));
      const obj = this.bay.object(term);
      this.markerFor = obj;
      this.expected = term;
      if (this.tut) this.tutorial('leads');
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
            this.ui.toast(t(i === 0 ? 'toast.redPos' : 'toast.blackNeg'), 'bad');
            return false;
          },
        },
      ]);
      this.expected = null;
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
    await clock.tween(1.0, (k) => tst.screen.draw((value * k).toFixed(1), '#9fe7b5', t('screen.volts')));
    sfx.beep();
    const bad = reading.verdict === 'bad';
    tst.screen.draw(value.toFixed(1), bad ? '#ff8a7a' : '#9fe7b5', t(bad ? 'screen.weak' : 'screen.good'));
    await clock.wait(0.5);
    this.ui.prompt(null);
    if (this.tut) this.tutorial('clue');
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
    this.ui.compactTicket(true);
    this.endTutorialStep('test');
    await this.stage.rig.go(this.shots().test, 0.9);
    await this.ui.centerAction(`<svg width="34" height="34" viewBox="0 0 64 64"><circle cx="20" cy="32" r="12" fill="none" stroke="#fff" stroke-width="7"/><path d="M31 32h25M48 32v9M56 32v7" stroke="#fff" stroke-width="7" stroke-linecap="round"/></svg> ${t('action.test')}`, 'green', t('prompt.test'));
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
      await clock.wait(1.6);
      return true;
    }
    await clock.wait(0.8);
    sfx.engineStop();
    this.engineOn = false;
    sfx.bad();
    sdk.sadMoment?.('test_failed');
    this.ui.toast(t('toast.notFixed', { symptom: t(`fault.${res.remaining[0]}.symptom`) }), 'bad', 2.6);
    await clock.wait(1.2);
    await this.stage.rig.go(this.shots().garage, 0.8);
    return false;
  }

  endTutorialStep(step: string) {
    if (this.tut?.step === step) this.ui.hand(null);
  }

  // ---------- hand back + payment ----------
  private async handBack(): Promise<'next' | 'menu'> {
    this.phase = 'handback';
    this.ui.hideTicket();
    await this.stage.rig.go(this.shots().garage, 0.9);
    const r = this.car.root;
    sfx.drive(2.4);
    let last = 0;
    await clock.tween(2.4, (k) => {
      r.position.z = lerp(0, -12, k);
      this.car.spinWheels(r.position.z - last);
      last = r.position.z;
    }, ease.inOut);
    sfx.engineStop();
    this.engineOn = false;
    sdk.gameplayStop();
    const j = this.job;
    const p = j.payout();
    this.phase = 'payment';
    if (this.tut) {
      this.endTutorial(true);
      clock.later(1.2, () => this.ui.toast(t('tut.done'), 'good', 3));
    }
    sfx.cash();
    const before = this.save.career;
    const thanks = `pay.thanks${1 + ((j.def.n + j.minutes) % 4)}`;
    const extra = before === CAREER_LENGTH && !j.def.daily ? t('pay.careerDone') : '';
    const choice = await this.ui.payment(p, j.def.customer.name, thanks, ADS, (i) => sfx.star(i), extra);
    let total = p.total;
    if (choice === 'double' && (await this.rewarded(t('ad.double')))) total *= 2;
    const mid = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    this.ui.coins(mid.x, mid.y, 10);
    for (let i = 0; i < 6; i++) sfx.coin(i * 0.08);
    await this.ui.countMoney(this.ui.money + total - this.partsSpentRefund(), 0.9);
    const ach = finishJob(this.save, j.def, p, total, j.wrong.length, todayKey());
    this.save.money = this.ui.money;
    this.persist();
    this.announce(ach);
    for (const c of CAR_TYPES) if (CARS[c].unlock === this.save.career && before < this.save.career && !j.def.daily) clock.later(0.3, () => this.ui.toast(t('toast.newCar', { car: t(`car.${c}`) }), 'good', 2.4));
    await clock.wait(choice === 'menu' ? 0.3 : 0.6);
    return choice === 'menu' ? 'menu' : 'next';
  }

  /** money already shown on the HUD includes the parts bought: nothing to correct */
  private partsSpentRefund() {
    return 0;
  }

  /** part names for the parts sheet tests */
  static partName(p: PartId) {
    return t(`part.${p}`);
  }
}

export { PARTS };
export type { FaultId };

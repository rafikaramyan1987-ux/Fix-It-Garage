/**
 * The play flow of the Phase A preview: a customer drives in, the player diagnoses with tools, orders a part,
 * swaps the battery step by step, test-starts the car and gets paid.
 */
import * as THREE from 'three';
import { sfx, setMuted, isMuted, unlockAudio } from './app/audio';
import { clock, ease, lerp } from './app/clock';
import { Input, type Target } from './app/input';
import { loadSave, writeSave, type SaveData } from './app/save';
import { sdk } from './app/sdk';
import { FAULTS, JOBS, PARTS, STEP_MINUTES, TOOLS, type CarType, type JobDef, type PartId, type ToolId } from './game/data';
import { BatterySwap, Job, type BatteryTarget } from './game/job';
import { Car } from './render/cars';
import type { Shot } from './render/camera';
import { buildBattery, EngineBay, Ratchet, Tester } from './render/engineBay';
import type { Stage } from './render/stage';
import type { UI } from './ui/ui';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const CAR_ORDER: CarType[] = ['sedan', 'hatchback', 'van'];
const CUSTOMERS: JobDef['customer'][] = [
  { name: 'Mrs. Pebble', hair: '#c9c9d6', skin: '#f2c9a5', shirt: '#7c5cff' },
  { name: 'Theo Sprocket', hair: '#5a3418', skin: '#c98b5e', shirt: '#2fa39b' },
  { name: 'Dot Marigold', hair: '#e2603a', skin: '#f6d3b5', shirt: '#ffb238' },
];
const LIFT_UP = 1.3;

export class Play {
  readonly input: Input;
  save: SaveData;
  car!: Car;
  bay!: EngineBay;
  job!: Job;
  private parked: Car | null = null;
  private waiting: Car | null = null;
  private ratchet = new Ratchet();
  private tester = new Tester();
  private lift = 0;
  private engineOn = false;
  private markerFor: THREE.Object3D | null = null;
  private tagsFor: { obj: THREE.Object3D; text: string; color: string }[] = [];
  private props: THREE.Object3D[] = [];
  round = 0;
  /** state for tests / capture scripts */
  phase = 'boot';
  /** the target the player should act on next (marker; read by capture scripts) */
  expected: string | null = null;

  constructor(
    readonly stage: Stage,
    readonly ui: UI,
  ) {
    this.input = new Input(stage);
    this.save = loadSave(sdk.data());
    setMuted(this.save.muted || sdk.muted);
    sdk.onMute = (m) => setMuted(m || this.save.muted);
    ui.onMute = () => {
      this.save.muted = !isMuted();
      setMuted(this.save.muted);
      writeSave(this.save, sdk.data());
      return this.save.muted;
    };
    ui.setMoney(this.save.money);
    window.addEventListener('pointerdown', () => unlockAudio(), { capture: true });
    clock.every((dt, t) => this.frame(dt, t));
  }

  // ---------- camera shots ----------
  private shots() {
    const c = this.car;
    const bayC = c.world(0, c.hoodY + 0.08, (c.hoodBackZ + c.frontZ) / 2);
    return {
      title: { target: V(0.4, 1.2, -1.2), dir: V(0.55, 0.38, 1), radius: 4.6, portraitShift: -0.4 } as Shot,
      garage: { target: V(0.1, 0.9, -0.2), dir: V(0.5, 0.4, 1), radius: 3.4, portraitShift: 0.55, landscapeShift: 0.35 } as Shot,
      engine: { target: bayC, dir: V(-0.15, 1.6, 0.75), radius: 0.78, portraitShift: 0.1 } as Shot,
      under: { target: V(0, LIFT_UP + 0.15, 0), dir: V(1.4, -0.75, 1.9), radius: 1.5, portraitShift: 0.2 } as Shot,
      side: { target: V(0.7, 0.75, 0.15), dir: V(1, 0.35, 0.25), radius: 1.0, portraitShift: 0.2 } as Shot,
      listen: { target: V(0, 0.6, c.frontZ - 0.3), dir: V(0.35, 0.35, 1), radius: 1.2, portraitShift: 0.2 } as Shot,
      test: { target: V(0, 0.7, 0.2), dir: V(0.75, 0.32, 1), radius: 2.0, portraitShift: 0.35 } as Shot,
    };
  }

  // ---------- per-frame ----------
  private frame(dt: number, t: number) {
    const s = this.stage;
    s.fx.update(dt);
    if (this.car) {
      // idle shake while the engine runs
      this.car.body.position.y = this.lift + (this.engineOn ? Math.sin(t * 60) * 0.006 : 0);
      this.car.body.rotation.z = this.engineOn ? Math.sin(t * 47) * 0.004 : 0;
      s.garage.lift.carriage.position.y = this.lift;
      if (this.engineOn && Math.random() < dt * 5) {
        const ex = this.car.world(0.22, 0.2, -this.car.size.z / 2);
        s.fx.smoke(ex, V(0, 0, -1), 1, '#f0f0f0');
      }
    }
    s.rig.apply(t, dt);
    this.ui.marker(this.markerFor ? s.project(this.markerFor.getWorldPosition(V(0, 0, 0)).add(V(0, 0.03, 0))) : null);
    this.ui.tags(
      this.tagsFor.map((g) => {
        const p = s.project(g.obj.getWorldPosition(V(0, 0, 0)).add(V(0, 0.07, 0)));
        return { x: p.x, y: p.y, text: g.text, color: g.color };
      }),
    );
  }

  private setClock() {
    this.ui.setClock(this.job.minutes, this.job.def.targetMinutes, this.job.timeBonusNow());
  }

  private persist() {
    writeSave(this.save, sdk.data());
  }

  // ---------- scene setup ----------
  private placeCars(i: number) {
    for (const c of [this.car, this.parked, this.waiting]) c?.root.removeFromParent();
    for (const p of this.props) p.removeFromParent();
    this.props = [];
    const type = CAR_ORDER[i % 3];
    this.car = new Car(type);
    this.car.root.position.set(0, 0, -12);
    this.stage.scene.add(this.car.root);
    this.bay = new EngineBay(this.car);
    this.parked = new Car(CAR_ORDER[(i + 1) % 3]);
    this.parked.root.position.set(4.45, 0, 0.7);
    this.parked.root.rotation.y = -0.12;
    this.waiting = new Car(CAR_ORDER[(i + 2) % 3]);
    this.waiting.root.position.set(2.7, 0, -9.6);
    this.waiting.root.rotation.y = 0.35;
    this.stage.scene.add(this.parked.root, this.waiting.root);
    this.lift = 0;
  }

  /** title screen: the garage with a car on the lift */
  async title() {
    this.phase = 'title';
    this.placeCars(0);
    this.car.root.position.z = 0;
    this.stage.rig.snap(this.shots().title);
    sdk.loadingStop();
    await sdk.ready?.();
    await this.ui.title();
    unlockAudio();
    sfx.pop();
    await sdk.midgame('preroll');
  }

  async run() {
    await this.title();
    this.stage.rig.go(this.shots().garage, 1.0);
    let first = true;
    for (;;) {
      await this.runJob(this.round, first);
      first = false;
      this.round++;
      await sdk.midgame('between');
    }
  }

  // ---------- one job ----------
  async runJob(i: number, carAlreadyIn: boolean) {
    if (!carAlreadyIn) this.placeCars(i);
    const def: JobDef = { ...JOBS[0], car: this.car.type, customer: CUSTOMERS[i % CUSTOMERS.length] };
    this.job = new Job(def);
    sdk.gameplayStart();
    this.ui.showHud(true);
    this.setClock();
    if (!carAlreadyIn) {
      this.stage.rig.snap(this.shots().garage);
      await this.driveIn();
    } else await this.stage.rig.go(this.shots().garage, 0.8);
    this.phase = 'diagnose';
    const symptom = this.job.faults[0].symptom;
    this.ui.showTicket(def, symptom, this.car.type);
    sfx.whoosh();
    await clock.wait(0.3);
    for (;;) {
      const fixed = await this.diagnoseLoop();
      if (fixed) break;
    }
    await this.handBack();
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
    // nose dip on braking
    await clock.tween(0.25, (k) => (this.car.body.rotation.x = Math.sin(k * Math.PI) * 0.03));
  }

  /** the diagnose phase: tools, hint, repair. Resolves true once the car is fixed. */
  private async diagnoseLoop(): Promise<boolean> {
    this.phase = 'diagnose';
    if (window.innerHeight > window.innerWidth) this.ui.compactTicket(this.job.clues.size === 0);
    this.ui.prompt(this.job.clues.size ? 'Check more, or tap <b>Repair</b> when you know the faulty part' : 'What is wrong? <b>Use a tool</b> to find clues');
    const choice = await new Promise<{ k: 'tool'; t: ToolId } | { k: 'hint' } | { k: 'repair' }>((res) =>
      this.ui.toolbar({
        used: new Set(this.job.clues.keys()),
        hintLeft: !this.job.hintUsed,
        repairReady: this.job.clues.size > 0,
        onTool: (t) => res({ k: 'tool', t }),
        onHint: () => res({ k: 'hint' }),
        onRepair: () => res({ k: 'repair' }),
      }),
    );
    sfx.tap();
    this.ui.toolbar(null);
    this.ui.prompt(null);
    if (choice.k === 'tool') {
      await this.useTool(choice.t, false);
      return false;
    }
    if (choice.k === 'hint') {
      const ok = await sdk.rewarded();
      if (!ok) {
        this.ui.toast('No ad available right now, try later', 'info');
        return false;
      }
      const t = this.job.hintTool();
      this.job.hintUsed = true;
      if (t) {
        this.ui.toast(`Hint: try the ${TOOLS[t].name.toLowerCase()}!`, 'info');
        await clock.wait(0.6);
        await this.useTool(t, true);
      }
      return false;
    }
    const part = await this.ui.partsSheet(this.ui.money);
    if (!part) return false;
    await this.orderAndFit(part);
    return this.testStart();
  }

  // ---------- diagnosis tools ----------
  async useTool(t: ToolId, free: boolean) {
    this.phase = `tool:${t}`;
    const already = this.job.clues.has(t);
    const r = this.job.useTool(t, free);
    this.ui.compactTicket(true);
    const sh = this.shots();
    if (t === 'tester') await this.testerScene();
    else if (t === 'obd') {
      await this.stage.rig.go(sh.side, 0.8);
      this.ui.prompt('Plugging the scanner in under the dashboard…');
      for (let i = 0; i < 3; i++) {
        sfx.beep();
        await clock.wait(0.35);
      }
      this.ui.prompt(null);
    } else if (t === 'listen') {
      await this.stage.rig.go(sh.listen, 0.8);
      this.ui.prompt('Turning the key… <b>listen!</b>');
      await clock.wait(0.4);
      if (r.verdict === 'bad') {
        sfx.clicking(9);
        for (let i = 0; i < 9; i++) {
          this.car.body.rotation.x = 0.004;
          await clock.wait(0.045);
          this.car.body.rotation.x = 0;
          await clock.wait(0.045);
        }
      } else {
        sfx.engineStart();
        this.engineOn = true;
        await clock.wait(1.6);
        sfx.engineStop();
        this.engineOn = false;
      }
      await clock.wait(0.4);
      this.ui.prompt(null);
    } else if (t === 'lift') {
      await this.raise(true);
      await this.stage.rig.go(sh.under, 1.0);
      this.ui.prompt('Looking under the car…');
      await clock.wait(0.9);
      this.ui.prompt(null);
    }
    sfx[r.verdict === 'bad' ? 'bad' : 'good']();
    await this.ui.readout(t, r);
    if (!already) {
      this.ui.addClue(r);
      if (r.verdict === 'bad' && !this.save.book.includes(this.job.faults[0].id)) {
        this.save.book.push(this.job.faults[0].id);
        this.persist();
      }
    }
    this.setClock();
    if (t === 'tester') await this.testerDone();
    if (t === 'lift') {
      await this.stage.rig.go(this.shots().garage, 0.8);
      await this.raise(false);
    } else await this.stage.rig.go(this.shots().garage, 0.8);
    this.ui.compactTicket(false);
  }

  private async raise(up: boolean) {
    sfx.lift();
    const from = this.lift;
    const to = up ? LIFT_UP : 0;
    await clock.tween(1.4, (k) => (this.lift = lerp(from, to, k)), ease.inOut);
  }

  private async testerScene() {
    const sh = this.shots();
    await this.stage.rig.go(sh.engine, 0.9);
    this.bay.group.visible = true;
    sfx.hood();
    await this.bay.openHood();
    // the tester sits on the left fender
    const tst = this.tester;
    this.bay.group.add(tst.group);
    // the tester rests on the front of the bay, just in front of the battery
    tst.group.position.set(-this.bay.W / 2 + 0.42, 0.1, this.bay.L / 2 + 0.12);
    tst.group.rotation.set(0.25, -0.35, 0);
    tst.rest();
    tst.screen.draw('--.-', '#9fe7b5', 'READY');
    tst.group.visible = true;
    sfx.pop();
    const reading = this.job.reading('tester');
    for (const [i, term, label] of [
      [0, 'pos', 'Clip the <b>red lead</b> on the <b>(+)</b> terminal'],
      [1, 'neg', 'Now the <b>black lead</b> on the <b>(−)</b> terminal'],
    ] as const) {
      this.ui.prompt(label);
      const obj = this.bay.object(term);
      this.markerFor = obj;
      this.expected = term;
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
            this.ui.toast(i === 0 ? 'Red goes on (+)!' : 'Black goes on (−)!', 'bad');
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
    this.expected = null;
    this.tagsFor = [];
    this.ui.prompt('Measuring…');
    const target = parseFloat(reading.value);
    await clock.tween(1.0, (k) => tst.screen.draw((target * k).toFixed(1), '#9fe7b5', 'VOLTS'));
    sfx.beep();
    const bad = reading.verdict === 'bad';
    tst.screen.draw(reading.value.replace(' V', ''), bad ? '#ff8a7a' : '#9fe7b5', bad ? 'WEAK' : 'GOOD');
    await clock.wait(0.5);
    this.ui.prompt(null);
  }

  private async testerDone() {
    this.tester.group.visible = false;
    await this.bay.closeHood();
    sfx.hoodShut();
    this.bay.hide();
  }

  // ---------- parts + repair ----------
  private async orderAndFit(part: PartId) {
    this.phase = `fit:${part}`;
    const price = this.job.buy(part);
    await this.ui.countMoney(this.ui.money - price, 0.5);
    this.save.money = this.ui.money;
    this.persist();
    sfx.cash();
    this.ui.toast(`${PARTS[part].name} delivered!`, 'info');
    // the part lands on the cart
    const g = this.stage.garage;
    const box = part === 'battery' ? buildBattery(true) : partBox(part);
    g.cart.add(box);
    box.position.copy(g.cartTop).add(V(0, 0.8, 0));
    box.rotation.y = 0.2;
    await clock.tween(0.45, (k) => (box.position.y = g.cartTop.y + 0.1 + 0.8 * (1 - k)), ease.in);
    sfx.thud();
    this.stage.fx.dust(box.getWorldPosition(V(0, 0, 0)).add(V(0, -0.08, 0)), 10);
    await clock.wait(0.3);
    if (part === 'battery') await this.batterySwap(box);
    else await this.quickFit(part, box);
    this.job.install(part);
    this.setClock();
  }

  /** a wrong (unneeded) part: a short fitting montage */
  private async quickFit(part: PartId, box: THREE.Object3D) {
    await this.stage.rig.go(this.shots().engine, 0.8);
    this.bay.group.visible = true;
    sfx.hood();
    await this.bay.openHood();
    box.removeFromParent();
    this.ui.prompt(`Fitting the ${PARTS[part].name.toLowerCase()}…`);
    const spot = this.bay.world(V(this.bay.W * 0.12, 0.25, 0));
    this.ratchet.showAt(spot, this.stage.scene);
    const stop = clock.every((_d, t) => this.ratchet.swing(t));
    for (let i = 0; i < 10; i++) {
      sfx.ratchet();
      await clock.wait(0.12);
    }
    stop();
    this.ratchet.hide();
    sfx.torque();
    this.stage.fx.sparkle(spot, 12);
    this.ui.prompt(null);
    await clock.wait(0.3);
    await this.bay.closeHood();
    sfx.hoodShut();
    this.bay.hide();
  }

  /** the battery swap mini-game */
  private async batterySwap(newBat: THREE.Group) {
    const bay = this.bay;
    const swap = new BatterySwap();
    const rig = this.stage.rig;
    this.ui.compactTicket(true);
    await rig.go(this.shots().engine, 0.9);
    bay.group.visible = true;
    bay.setHood(0);
    const prompts: Record<string, string> = {
      'hood-open': 'Tap the <b>hood</b> to open it',
      loosen: 'Hold to loosen the <b>black (−)</b> terminal first',
      loosen2: 'Now hold to loosen the <b>red (+)</b> terminal',
      'clamp-off': 'Hold the <b>clamp bolt</b> to undo it',
      remove: '<b>Drag the old battery up</b> to lift it out',
      place: 'Tap the <b>new battery</b> on the cart',
      'clamp-on': 'Hold the <b>clamp bolt</b> to tighten it',
      tighten: 'Connect the <b>red (+)</b> terminal first: hold to tighten',
      tighten2: 'Now the <b>black (−)</b> terminal',
      'hood-close': 'Tap the <b>hood</b> to close it',
    };
    while (swap.step !== 'done') {
      const step = swap.step;
      const key = (step === 'loosen' && swap.loose.size === 1) || (step === 'tighten' && swap.loose.size === 1) ? `${step}2` : step;
      this.ui.prompt(prompts[key]);
      const next = swap.next()!;
      const targets = swap.targets();
      const terminalStep = step === 'loosen' || step === 'tighten';
      this.tagsFor = terminalStep
        ? [
            { obj: bay.pos.group, text: '+', color: '#d6453b' },
            { obj: bay.neg.group, text: '−', color: '#30333a' },
          ]
        : [];
      if (step === 'place') {
        // frame the bay and the cart together
        const a = bay.world(bay.batteryHome);
        const b = newBat.getWorldPosition(V(0, 0, 0));
        await rig.go({ target: a.clone().lerp(b, 0.5), dir: V(-0.35, 1.5, 0.9), radius: a.distanceTo(b) / 2 + 0.45, portraitShift: 0.05 }, 0.7);
      }
      if (step === 'clamp-on') await rig.go(this.shots().engine, 0.6);
      const objOf = (t: BatteryTarget): THREE.Object3D => (t === 'new' ? newBat : t === 'clamp' ? bay.clampNut : bay.object(t));
      this.markerFor = objOf(next);
      this.expected = next;
      bay.pulse(targets.map(objOf));
      const list: Target[] = targets.map((t) => this.targetFor(t, objOf(t), swap));
      const id = (await this.input.interact(list)) as BatteryTarget;
      this.markerFor = null;
      this.expected = null;
      bay.pulse([]);
      this.ui.hideRing();
      swap.act(id);
      await this.afterAction(step, id, newBat);
    }
    this.tagsFor = [];
    this.ui.prompt(null);
    bay.hide();
  }

  private targetFor(t: BatteryTarget, obj: THREE.Object3D, swap: BatterySwap): Target {
    const bay = this.bay;
    const refuse = () => {
      // refused: the (+) side would short against the body
      const p = obj.getWorldPosition(V(0, 0, 0));
      this.stage.fx.sparks(p, 26);
      sfx.spark();
      this.stage.rig.shake(0.04, 0.3);
      this.ui.toast(swap.step === 'loosen' ? 'Zap! Always take the (−) off first' : 'Zap! Always connect (+) first', 'bad');
      this.job.addMinutes(1);
      this.setClock();
      return false;
    };
    if (t === 'hood') return { id: t, obj, mode: 'tap' };
    if (t === 'old')
      return {
        id: t,
        obj,
        mode: 'lift',
        onLift: (k) => {
          bay.oldBattery.position.y = bay.batteryHome.y + k * 0.12;
        },
      };
    if (t === 'new') return { id: t, obj, mode: 'tap' };
    // bolts: press and hold with the ratchet
    const loosening = swap.step === 'loosen' || swap.step === 'clamp-off';
    let lastClick = 0;
    let stopSwing: (() => void) | null = null;
    return {
      id: t,
      obj,
      mode: 'hold',
      hold: 0.9,
      guard: () => !((t === 'neg' || t === 'pos') && this.peekWrong(swap, t)) || refuse(),
      onHoldStart: () => {
        const nutObj = t === 'clamp' ? bay.clampNut : (t === 'neg' ? bay.neg : bay.pos).nut;
        this.ratchet.showAt(nutObj.getWorldPosition(V(0, 0, 0)).add(V(0, 0.005, 0)), this.stage.scene);
        stopSwing = clock.every((_d, now) => this.ratchet.swing(now));
        lastClick = 0;
      },
      onHold: (k, now) => {
        if (now - lastClick > 0.11) {
          sfx.ratchet();
          lastClick = now;
        }
        bay.spinNut(t as 'neg' | 'pos' | 'clamp', k, loosening);
        const p = this.stage.project(obj.getWorldPosition(V(0, 0, 0)));
        this.ui.ring(p.x, p.y - 4, k);
        if (k >= 1) {
          stopSwing?.();
          this.ratchet.hide();
        }
      },
      onHoldCancel: () => {
        stopSwing?.();
        this.ratchet.hide();
        this.ui.hideRing();
        bay.spinNut(t as 'neg' | 'pos' | 'clamp', 0, loosening);
      },
    };
  }

  /** would acting on this terminal now be the wrong order (without changing state)? */
  private peekWrong(swap: BatterySwap, t: 'neg' | 'pos') {
    return swap.targets().includes(t) && swap.next() !== t;
  }

  private async afterAction(step: string, id: BatteryTarget, newBat: THREE.Group) {
    const bay = this.bay;
    const fx = this.stage.fx;
    switch (step) {
      case 'hood-open':
        sfx.hood();
        await bay.openHood();
        this.job.addMinutes(STEP_MINUTES.hood);
        break;
      case 'loosen':
        sfx.clink();
        await bay.terminal(id as 'neg' | 'pos', true);
        this.job.addMinutes(STEP_MINUTES.bolt);
        break;
      case 'clamp-off':
        sfx.clink();
        await bay.clamp(true);
        this.job.addMinutes(STEP_MINUTES.bolt);
        break;
      case 'remove': {
        sfx.whoosh();
        const floor = this.car.world(-this.car.size.x / 2 - 0.35, 0.1, 0.3);
        floor.y = 0.1;
        await bay.removeOld(floor);
        this.props.push(bay.oldBattery);
        sfx.thud();
        this.stage.rig.shake(0.02, 0.2);
        fx.dust(V(floor.x, 0.02, floor.z), 16);
        this.job.addMinutes(STEP_MINUTES.swap);
        break;
      }
      case 'place':
        sfx.whoosh();
        await bay.placeNew(newBat);
        sfx.thud();
        fx.sparkle(bay.world(bay.batteryHome).add(V(0, 0.15, 0)), 18);
        this.job.addMinutes(STEP_MINUTES.swap);
        await bay.clamp(false);
        break;
      case 'clamp-on':
        sfx.torque();
        this.job.addMinutes(STEP_MINUTES.bolt);
        break;
      case 'tighten': {
        await bay.terminal(id as 'neg' | 'pos', false);
        sfx.torque();
        if (bay.pos.group.position.distanceTo(bay.pos.home) < 0.001 && bay.neg.group.position.distanceTo(bay.neg.home) < 0.001) {
          // the last connection gives a tiny, harmless spark: power is back
          fx.sparks(bay.neg.group.getWorldPosition(V(0, 0, 0)), 10);
          sfx.spark();
          this.ui.toast('Power restored!', 'good');
        }
        this.job.addMinutes(STEP_MINUTES.bolt);
        break;
      }
      case 'hood-close':
        await bay.closeHood();
        sfx.hoodShut();
        this.stage.rig.shake(0.025, 0.25);
        this.job.addMinutes(STEP_MINUTES.hood);
        break;
    }
    this.setClock();
  }

  // ---------- test start ----------
  private async testStart(): Promise<boolean> {
    this.phase = 'test';
    await this.stage.rig.go(this.shots().test, 0.9);
    await this.ui.centerAction(`${'<svg width="34" height="34" viewBox="0 0 64 64"><circle cx="20" cy="32" r="12" fill="none" stroke="#fff" stroke-width="7"/><path d="M31 32h25M48 32v9M56 32v7" stroke="#fff" stroke-width="7" stroke-linecap="round"/></svg>'} Test start`, 'green', 'Turn the key to see if it worked');
    const ok = this.job.test();
    this.setClock();
    if (ok) {
      sfx.engineStart();
      await clock.wait(0.75);
      this.engineOn = true;
      this.stage.rig.shake(0.03, 0.4);
      const ex = this.car.world(0.22, 0.2, -this.car.size.z / 2);
      this.stage.fx.smoke(ex, V(0, 0, -1), 14, '#e6e6e6');
      this.stage.fx.sparkle(this.car.world(0, this.car.size.y + 0.1, 0), 24);
      this.ui.toast('Vroom! It runs!', 'good');
      sdk.happytime();
      await clock.wait(1.6);
      return true;
    }
    sfx.clicking(8);
    await clock.wait(0.8);
    sfx.bad();
    this.ui.toast('Still just clicking… keep diagnosing!', 'bad');
    await clock.wait(1.0);
    await this.stage.rig.go(this.shots().garage, 0.8);
    return false;
  }

  // ---------- hand back + payment ----------
  private async handBack() {
    this.phase = 'handback';
    this.ui.hideTicket();
    await this.stage.rig.go(this.shots().garage, 0.9);
    // reverse out of the door
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
    const p = this.job.payout();
    this.phase = 'payment';
    sfx.cash();
    const choice = await this.ui.payment(p, this.job.def.customer.name, true, (i) => sfx.star(i));
    let total = p.total;
    if (choice === 'double') {
      const ok = await sdk.rewarded();
      if (ok) total *= 2;
      else this.ui.toast('No ad available right now, try later', 'info');
    }
    const mid = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    this.ui.coins(mid.x, mid.y, 10);
    for (let i = 0; i < 6; i++) sfx.coin(i * 0.08);
    await this.ui.countMoney(this.ui.money + total, 0.9);
    this.save.money = this.ui.money;
    this.save.jobsDone++;
    this.save.stars += p.stars;
    this.persist();
    void FAULTS;
  }
}

/** a cardboard box for parts other than the battery */
function partBox(_part: PartId) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.24), new THREE.MeshStandardMaterial({ color: '#d8a86a', roughness: 0.85 }));
  m.castShadow = true;
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.012, 0.06), new THREE.MeshStandardMaterial({ color: '#c78c4a', roughness: 0.6 }));
  tape.position.y = 0.1;
  g.add(m, tape);
  return g;
}

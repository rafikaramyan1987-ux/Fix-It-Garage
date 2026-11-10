/**
 * Repair mini-actions: battery swap, engine-bay part swap, underside part swap, wheel change with nuts in a star
 * pattern, brake pads / disc, fluid top-ups and paint. Short tactile steps: tap, press-and-hold, drag, rub.
 */
import * as THREE from 'three';
import { sfx } from '../app/audio';
import { clock, ease, lerp } from '../app/clock';
import type { Target } from '../app/input';
import { PARTS, type PartId } from '../game/data';
import { BatterySwap, StarPattern, type BatteryTarget } from '../game/job';
import { t } from '../i18n';
import { buildBattery } from '../render/engineBay';
import { buildPart } from '../render/parts';
import { boltOut, placePart, removePart, spinBolt, type Slot } from '../render/slots';
import type { Play } from './play';
import { LIFT_UP, V } from './play';

export class Repairs {
  constructor(private p: Play) {}

  private get bay() {
    return this.p.bay;
  }
  private get rig() {
    return this.p.stage.rig;
  }
  private get fx() {
    return this.p.stage.fx;
  }
  private get holdTime() {
    return this.p.ctx.wrench ? 0.45 : 0.9;
  }

  /** order a part, it lands on the cart, then the matching mini-action */
  async orderAndFit(part: PartId, free: boolean) {
    const p = this.p;
    p.phase = `fit:${part}`;
    const price = p.job.buy(part, free);
    if (price) {
      await p.ui.countMoney(p.ui.money - price, 0.5);
      p.save.money = p.ui.money;
      p.persist();
      sfx.cash();
    }
    p.ui.toast(t('parts.delivered', { part: t(`part.${part}`) }), 'info');
    const g = p.stage.garage;
    const box = part === 'battery' ? buildBattery(true) : buildPart(part, true);
    box.userData.part = part;
    g.cart.add(box);
    box.position.copy(g.cartTop).add(V(0, 0.8, 0));
    box.rotation.y = 0.2;
    await clock.tween(0.45, (k) => (box.position.y = g.cartTop.y + 0.1 + 0.8 * (1 - k)), ease.in);
    sfx.thud();
    this.fx.dust(box.getWorldPosition(V(0, 0, 0)).add(V(0, -0.08, 0)), 10);
    await clock.wait(0.3);
    p.ui.compactTicket(true);
    // a wrong part is still fitted the proper way (and wasted), except where the car has no place for it
    const action = PARTS[part].action;
    if (part === 'battery') await this.battery(box);
    else if (action === 'bay' && this.bay.slots[part]) await this.baySwap(part, box);
    else if (action === 'under' && p.car.under[part]) await this.underSwap(part, box);
    else if (action === 'wheel') await this.wheel(box, null);
    else if (action === 'brake') await this.wheel(box, part as 'pads' | 'disc');
    else if (action === 'fluid') await this.fluid(part as 'oil' | 'coolant', box);
    else if (action === 'paint') await this.paint(box);
    else await this.quickFit(part, box);
    const then = PARTS[part].then;
    if (then && p.job.fixes(part)) await this.fluid(then as 'oil' | 'coolant', null);
    const fixed = p.job.install(part);
    p.setClock();
    p.markerFor = null;
    p.expected = null;
    p.tagsFor = [];
    p.ui.prompt(null);
    if (fixed) {
      sfx.good();
      this.fx.sparkle(p.car.world(0, p.car.size.y + 0.1, 0), 14);
    }
    await this.rig.go(p.shots().garage, 0.8);
  }

  // ---------- generic helpers ----------
  /** wait for the player on targets, showing marker + tags; returns the id acted on */
  private async act(promptKey: string, targets: Target[], expected: string | null, marker: THREE.Object3D | null) {
    const p = this.p;
    p.ui.prompt(t(promptKey));
    p.expected = expected ?? targets[0]?.id ?? null;
    p.markerFor = marker ?? targets[0]?.obj ?? null;
    this.bay.pulse(targets.map((x) => x.obj));
    const id = await p.input.interact(targets);
    this.bay.pulse([]);
    p.markerFor = null;
    p.expected = null;
    p.ui.hideRing();
    return id;
  }

  /** a press-and-hold target that runs the ratchet on a nut */
  private boltTarget(id: string, nut: THREE.Object3D, onProgress: (k: number) => void, onCancel: () => void, guard?: () => boolean): Target {
    const p = this.p;
    let last = 0;
    let stop: (() => void) | null = null;
    return {
      id,
      obj: nut,
      mode: 'hold',
      hold: this.holdTime,
      guard,
      onHoldStart: () => {
        p.ratchet.showAt(nut.getWorldPosition(V(0, 0, 0)), p.stage.scene);
        const q = new THREE.Quaternion();
        nut.getWorldQuaternion(q);
        p.ratchet.group.quaternion.copy(q);
        stop = clock.every((_d, now) => p.ratchet.swing(now));
        last = 0;
      },
      onHold: (k, now) => {
        if (now - last > (p.ctx.wrench ? 0.05 : 0.11)) {
          if (p.ctx.wrench) sfx.buzz();
          else sfx.ratchet();
          last = now;
        }
        onProgress(k);
        const s = p.stage.project(nut.getWorldPosition(V(0, 0, 0)));
        p.ui.ring(s.x, s.y - 4, k);
        if (k >= 1) {
          stop?.();
          p.ratchet.hide();
        }
      },
      onHoldCancel: () => {
        stop?.();
        p.ratchet.hide();
        p.ui.hideRing();
        onCancel();
      },
    };
  }

  /** with the impact wrench, one hold turns every nut of a group at once */
  private async allAtOnce(nuts: THREE.Object3D[], loosen: boolean, spin: (i: number, k: number) => void, after: (i: number) => void) {
    const id = await this.act(
      loosen ? 'prompt.boltsOff' : 'prompt.boltsOn',
      [this.boltTarget('all', nuts[0], (k) => nuts.forEach((_, i) => spin(i, k)), () => nuts.forEach((_, i) => spin(i, 0)))],
      'all',
      nuts[0],
    );
    void id;
    nuts.forEach((_, i) => after(i));
    if (loosen) sfx.clink();
    else sfx.torque();
    this.p.job.addMinutes(1);
    this.p.setClock();
  }

  /** loosen or tighten all bolts of a slot, in any order */
  private async slotBolts(s: Slot, loosen: boolean) {
    if (this.p.ctx.wrench) {
      await this.allAtOnce(s.bolts, loosen, (i, k) => spinBolt(s, i, k, loosen), (i) => void (loosen ? boltOut(s, i, true) : 0));
      return;
    }
    const left = new Set(s.bolts.map((_, i) => i));
    while (left.size) {
      const targets = [...left].map((i) =>
        this.boltTarget(
          `bolt${i}`,
          s.bolts[i],
          (k) => spinBolt(s, i, k, loosen),
          () => spinBolt(s, i, 0, loosen),
        ),
      );
      const id = await this.act(loosen ? 'prompt.boltsOff' : 'prompt.boltsOn', targets, null, null);
      const i = Number(id.slice(4));
      left.delete(i);
      if (loosen) {
        sfx.clink();
        await boltOut(s, i, true);
      } else sfx.torque();
      this.p.job.addMinutes(1);
      this.p.setClock();
    }
  }

  private async liftOut(obj: THREE.Object3D, promptKey = 'prompt.removeOld') {
    const y0 = obj.position.y;
    await this.act(promptKey, [{ id: 'old', obj, mode: 'lift', onLift: (k) => (obj.position.y = y0 + k * 0.1) }], 'old', obj);
  }

  private async tapNew(fresh: THREE.Object3D, promptKey = 'prompt.placeNew', frameWith?: THREE.Vector3) {
    if (frameWith) {
      const b = fresh.getWorldPosition(V(0, 0, 0));
      await this.rig.go({ target: frameWith.clone().lerp(b, 0.5), dir: V(-0.35, 1.5, 0.9), radius: frameWith.distanceTo(b) / 2 + 0.45, portraitShift: 0.05 }, 0.7);
    }
    await this.act(promptKey, [{ id: 'new', obj: fresh, mode: 'tap' }], 'new', fresh);
  }

  private async hood(open: boolean) {
    await this.act(open ? 'prompt.hoodOpen' : 'prompt.hoodClose', [{ id: 'hood', obj: this.bay.hoodPanel, mode: 'tap' }], 'hood', this.bay.hoodPanel);
    if (open) {
      sfx.hood();
      await this.bay.openHood();
    } else {
      await this.bay.closeHood();
      sfx.hoodShut();
      this.rig.shake(0.025, 0.25);
      this.bay.hide();
    }
  }

  private async openBay() {
    await this.rig.go(this.p.shots().engine, 0.9);
    this.bay.group.visible = true;
    this.bay.setHood(0);
    await this.hood(true);
  }

  private floorSpot(side = 1) {
    const c = this.p.car;
    const w = c.world(side * (c.size.x / 2 + 0.4), 0, 0.3);
    w.y = 0.1;
    return w;
  }

  private async liftButton(up: boolean, height = LIFT_UP) {
    const lift = this.p.stage.garage.lift;
    const btn = up ? lift.up : lift.down;
    await this.rig.go({ target: btn.getWorldPosition(V(0, 0, 0)).add(V(-0.6, -0.2, 0)), dir: V(0.9, 0.5, 1), radius: 1.3, portraitShift: 0.1 }, 0.7);
    await this.act(up ? 'prompt.raise' : 'prompt.lower', [{ id: up ? 'up' : 'down', obj: btn, mode: 'tap' }], up ? 'up' : 'down', btn);
    sfx.tap();
    await this.p.raise(up, height);
  }

  // ---------- battery ----------
  private async battery(newBat: THREE.Group) {
    const p = this.p;
    const bay = this.bay;
    const swap = new BatterySwap();
    await this.rig.go(p.shots().engine, 0.9);
    bay.group.visible = true;
    bay.setHood(0);
    const prompts: Record<string, string> = {
      'hood-open': 'prompt.hoodOpen',
      loosen: 'prompt.negOff',
      loosen2: 'prompt.posOff',
      'clamp-off': 'prompt.clampOff',
      remove: 'prompt.removeOld',
      place: 'prompt.placeNew',
      'clamp-on': 'prompt.clampOn',
      tighten: 'prompt.posOn',
      tighten2: 'prompt.negOn',
      'hood-close': 'prompt.hoodClose',
    };
    while (swap.step !== 'done') {
      const step = swap.step;
      const key = (step === 'loosen' || step === 'tighten') && swap.loose.size === 1 ? `${step}2` : step;
      const next = swap.next()!;
      if (step === 'place') {
        const a = bay.world(bay.batteryHome);
        const b = newBat.getWorldPosition(V(0, 0, 0));
        await this.rig.go({ target: a.clone().lerp(b, 0.5), dir: V(-0.35, 1.5, 0.9), radius: a.distanceTo(b) / 2 + 0.45, portraitShift: 0.05 }, 0.7);
      }
      if (step === 'clamp-on') await this.rig.go(p.shots().engine, 0.6);
      const terminalStep = step === 'loosen' || step === 'tighten';
      p.tagsFor = terminalStep
        ? [
            { obj: bay.pos.group, text: '+', color: '#d6453b' },
            { obj: bay.neg.group, text: '−', color: '#30333a' },
          ]
        : [];
      const objOf = (tt: BatteryTarget): THREE.Object3D => (tt === 'new' ? newBat : tt === 'clamp' ? bay.clampNut : bay.object(tt));
      const list: Target[] = swap.targets().map((tt) => this.batteryTarget(tt, objOf(tt), swap));
      const id = (await this.act(prompts[key], list, next, objOf(next))) as BatteryTarget;
      swap.act(id);
      await this.afterBattery(step, id, newBat);
    }
    p.tagsFor = [];
    bay.hide();
  }

  private batteryTarget(tt: BatteryTarget, obj: THREE.Object3D, swap: BatterySwap): Target {
    const p = this.p;
    const bay = this.bay;
    if (tt === 'hood' || tt === 'new') return { id: tt, obj, mode: 'tap' };
    if (tt === 'old') return { id: tt, obj, mode: 'lift', onLift: (k) => (bay.oldBattery.position.y = bay.batteryHome.y + k * 0.12) };
    const loosening = swap.step === 'loosen' || swap.step === 'clamp-off';
    const refuse = () => {
      this.fx.sparks(obj.getWorldPosition(V(0, 0, 0)), 26);
      sfx.spark();
      this.rig.shake(0.04, 0.3);
      p.ui.toast(t(swap.step === 'loosen' ? 'toast.negFirst' : 'toast.posFirst'), 'bad');
      p.job.addMinutes(1);
      p.setClock();
      return false;
    };
    const wrong = () => (tt === 'neg' || tt === 'pos') && swap.targets().includes(tt) && swap.next() !== tt;
    return this.boltTarget(
      tt,
      tt === 'clamp' ? bay.clampNut : obj,
      (k) => bay.spinNut(tt as 'neg' | 'pos' | 'clamp', k, loosening),
      () => bay.spinNut(tt as 'neg' | 'pos' | 'clamp', 0, loosening),
      () => !wrong() || refuse(),
    );
  }

  private async afterBattery(step: string, id: BatteryTarget, newBat: THREE.Group) {
    const p = this.p;
    const bay = this.bay;
    switch (step) {
      case 'hood-open':
        sfx.hood();
        await bay.openHood();
        break;
      case 'loosen':
        sfx.clink();
        await bay.terminal(id as 'neg' | 'pos', true);
        break;
      case 'clamp-off':
        sfx.clink();
        await bay.clamp(true);
        break;
      case 'remove': {
        sfx.whoosh();
        const floor = this.floorSpot(-1);
        await bay.removeOld(floor);
        p.props.push(bay.oldBattery);
        sfx.thud();
        this.rig.shake(0.02, 0.2);
        this.fx.dust(V(floor.x, 0.02, floor.z), 16);
        break;
      }
      case 'place':
        sfx.whoosh();
        await bay.placeNew(newBat);
        sfx.thud();
        this.fx.sparkle(bay.world(bay.batteryHome).add(V(0, 0.15, 0)), 18);
        await bay.clamp(false);
        break;
      case 'clamp-on':
        sfx.torque();
        break;
      case 'tighten':
        await bay.terminal(id as 'neg' | 'pos', false);
        sfx.torque();
        if (bay.pos.group.position.distanceTo(bay.pos.home) < 0.001 && bay.neg.group.position.distanceTo(bay.neg.home) < 0.001) {
          this.fx.sparks(bay.neg.group.getWorldPosition(V(0, 0, 0)), 10);
          sfx.spark();
          p.ui.toast(t('toast.power'), 'good');
        }
        break;
      case 'hood-close':
        await bay.closeHood();
        sfx.hoodShut();
        this.rig.shake(0.025, 0.25);
        break;
    }
  }

  // ---------- engine bay part ----------
  private async baySwap(part: PartId, fresh: THREE.Group) {
    const s = this.bay.slots[part]!;
    await this.openBay();
    await this.slotBolts(s, true);
    sfx.whoosh();
    await this.liftOut(s.obj);
    const old = s.obj;
    await removePart(s, this.floorSpot(-1), this.p.stage.scene);
    this.p.props.push(old);
    sfx.thud();
    this.fx.dust(this.floorSpot(-1), 12);
    await this.tapNew(fresh, 'prompt.placeNew', s.parent.localToWorld(s.home.clone()));
    sfx.whoosh();
    await placePart(s, fresh, this.p.stage.scene);
    sfx.thud();
    this.fx.sparkle(fresh.getWorldPosition(V(0, 0, 0)).add(V(0, 0.1, 0)), 14);
    for (let i = 0; i < s.bolts.length; i++) {
      s.bolts[i].visible = true;
      spinBolt(s, i, 0, false);
      s.bolts[i].position.y += 0.03;
    }
    await this.rig.go(this.p.shots().engine, 0.6);
    await this.slotBolts(s, false);
    if (PARTS[part].then && this.p.job.fixes(part)) return; // the fluid top-up follows with the hood open
    await this.hood(false);
  }

  // ---------- underside part ----------
  private async underSwap(part: PartId, fresh: THREE.Group) {
    const p = this.p;
    const s = p.car.under[part]!;
    await this.liftButton(true);
    const home = s.parent.localToWorld(s.home.clone());
    const look = { target: home, dir: V(1.1, -0.9, 1.3), radius: 0.75, portraitShift: 0.05 };
    await this.rig.go(look, 0.9);
    await this.slotBolts(s, true);
    sfx.whoosh();
    await this.act('prompt.removeOld', [{ id: 'old', obj: s.obj, mode: 'lift', onLift: (k) => (s.obj.position.y = s.home.y - k * 0.08) }], 'old', s.obj);
    const old = s.obj;
    await removePart(s, this.floorSpot(1), p.stage.scene);
    p.props.push(old);
    sfx.thud();
    this.fx.dust(this.floorSpot(1), 12);
    const b = fresh.getWorldPosition(V(0, 0, 0));
    await this.rig.go({ target: home.clone().lerp(b, 0.5), dir: V(0.8, -0.2, 1.4), radius: home.distanceTo(b) / 2 + 0.5, portraitShift: 0.05 }, 0.7);
    await this.act('prompt.placeNew', [{ id: 'new', obj: fresh, mode: 'tap' }], 'new', fresh);
    sfx.whoosh();
    await placePart(s, fresh, p.stage.scene);
    sfx.thud();
    for (let i = 0; i < s.bolts.length; i++) {
      s.bolts[i].visible = true;
      spinBolt(s, i, 0, false);
    }
    await this.rig.go(look, 0.6);
    await this.slotBolts(s, false);
    this.fx.sparkle(home, 14);
    await this.liftButton(false);
    if (PARTS[part].then && p.job.fixes(part)) await this.openBay();
  }

  // ---------- wheel: tyre, or brake pads / disc behind it ----------
  private async wheel(fresh: THREE.Group, brake: 'pads' | 'disc' | null) {
    const p = this.p;
    const c = p.car;
    const w = c.wheel;
    await this.liftButton(true, 0.45);
    await this.rig.go(p.shots().wheel, 0.8);
    await this.nuts(true);
    // the wheel comes off
    const wheelObj = w.wheel;
    const y0 = wheelObj.position.x;
    await this.act('prompt.wheelOff', [{ id: 'wheel', obj: wheelObj, mode: 'lift', onLift: (k) => (wheelObj.position.x = y0 + k * 0.08) }], 'wheel', wheelObj);
    sfx.whoosh();
    const start = wheelObj.getWorldPosition(V(0, 0, 0));
    p.stage.scene.attach(wheelObj);
    const lean = c.world(c.size.x / 2 + 0.55, 0, w.center.z + 0.5);
    lean.y = 0.3;
    await clock.tween(0.6, (k) => {
      wheelObj.position.lerpVectors(start, lean, k);
      wheelObj.position.y += Math.sin(k * Math.PI) * 0.15;
    });
    sfx.thud();
    this.fx.dust(V(lean.x, 0.02, lean.z), 10);
    let newWheel: THREE.Object3D;
    if (!brake) {
      // a whole new wheel from the cart
      newWheel = wheelObj.clone(true);
      fresh.visible = false;
      const cartPos = fresh.getWorldPosition(V(0, 0, 0));
      newWheel.position.copy(cartPos).add(V(0, 0.15, 0));
      p.stage.scene.add(newWheel);
      fresh.removeFromParent();
      await this.tapNew(newWheel, 'prompt.newWheel', c.world(w.center.x, w.center.y, w.center.z));
      p.props.push(wheelObj);
    } else {
      await this.rig.go(p.shots().wheel, 0.6);
      await this.brakeSwap(brake, fresh);
      newWheel = wheelObj;
      await this.act('prompt.wheelOn', [{ id: 'wheel', obj: wheelObj, mode: 'tap' }], 'wheel', wheelObj);
    }
    // wheel back onto the hub
    sfx.whoosh();
    const from = newWheel.getWorldPosition(V(0, 0, 0));
    const hubW = c.body.localToWorld(w.home.clone());
    const q0 = newWheel.quaternion.clone();
    const q1 = c.body.getWorldQuaternion(new THREE.Quaternion());
    await clock.tween(0.6, (k) => {
      newWheel.position.lerpVectors(from, hubW, k);
      newWheel.position.y += Math.sin(k * Math.PI) * 0.15;
      newWheel.quaternion.slerpQuaternions(q0, q1, k);
    });
    c.body.attach(newWheel);
    newWheel.position.copy(w.home);
    newWheel.rotation.set(0, 0, 0);
    const idx = c.wheels.indexOf(w.wheel);
    if (idx >= 0) c.wheels[idx] = newWheel;
    w.wheel = newWheel;
    sfx.thud();
    await this.rig.go(p.shots().wheel, 0.5);
    await this.nuts(false);
    await this.liftButton(false);
  }

  /** the five wheel nuts, in a star pattern */
  private async nuts(loosen: boolean) {
    const p = this.p;
    const w = p.car.wheel;
    const star = new StarPattern();
    if (!loosen) w.nuts.forEach((n, i) => ((n.visible = true), n.position.copy(w.nutHome[i]).add(V(0.03, 0, 0))));
    if (p.ctx.wrench) {
      // the impact wrench spins all five nuts at once
      await this.allAtOnce(
        w.nuts,
        loosen,
        (i, k) => {
          w.nuts[i].rotation.x = k * Math.PI * 6 * (loosen ? 1 : -1);
          w.nuts[i].position.x = w.nutHome[i].x + (loosen ? k : 1 - k) * 0.03;
        },
        (i) => {
          if (loosen) w.nuts[i].visible = false;
          else w.nuts[i].position.x = w.nutHome[i].x;
        },
      );
      return;
    }
    while (!star.done) {
      const next = star.next!;
      const left = w.nuts.map((_, i) => i).filter((i) => (loosen ? w.nuts[i].visible : w.nuts[i].position.x > w.nutHome[i].x + 0.001));
      const targets = left.map((i) =>
        this.boltTarget(
          `nut${i}`,
          w.nuts[i],
          (k) => {
            w.nuts[i].rotation.x = k * Math.PI * 6 * (loosen ? 1 : -1);
            w.nuts[i].position.x = w.nutHome[i].x + (loosen ? k : 1 - k) * 0.03;
          },
          () => (w.nuts[i].position.x = w.nutHome[i].x + (loosen ? 0 : 0.03)),
          () => {
            if (i === star.next) return true;
            sfx.bad();
            p.ui.toast(t('toast.star'), 'info');
            return false;
          },
        ),
      );
      const id = await this.act(loosen ? 'prompt.nutsOff' : 'prompt.nutsOn', targets, `nut${next}`, w.nuts[next]);
      star.act(Number(id.slice(3)));
      if (loosen) {
        sfx.clink();
        w.nuts[next].visible = false;
      } else sfx.torque();
      p.job.addMinutes(1);
      p.setClock();
    }
  }

  private async brakeSwap(brake: 'pads' | 'disc', fresh: THREE.Group) {
    const p = this.p;
    const w = p.car.wheel;
    // caliper bolts
    for (const loosen of [true]) {
      const left = new Set([0, 1]);
      while (left.size) {
        const id = await this.act(
          'prompt.boltsOff',
          [...left].map((i) =>
            this.boltTarget(
              `cb${i}`,
              w.caliperBolts[i],
              (k) => (w.caliperBolts[i].rotation.x = k * 12),
              () => {},
            ),
          ),
          null,
          null,
        );
        left.delete(Number(id.slice(2)));
        sfx.clink();
        void loosen;
      }
    }
    w.caliperBolts.forEach((b) => (b.visible = false));
    // caliper swings up out of the way
    const c0 = w.caliper.position.clone();
    await clock.tween(0.4, (k) => {
      w.caliper.position.set(c0.x + k * 0.08, c0.y + k * 0.12, c0.z);
      w.pads.position.set(c0.x - 0.01 + k * 0.08, c0.y + k * 0.12, c0.z);
    });
    const oldObj = brake === 'pads' ? w.pads : w.disc;
    const y0 = oldObj.position.x;
    await this.act('prompt.removeOld', [{ id: 'old', obj: oldObj, mode: 'lift', onLift: (k) => (oldObj.position.x = y0 + k * 0.05) }], 'old', oldObj);
    sfx.whoosh();
    const s = p.stage.scene;
    const start = oldObj.getWorldPosition(V(0, 0, 0));
    s.attach(oldObj);
    const drop = this.floorSpot(1).add(V(0, 0, -0.5));
    await clock.tween(0.5, (k) => {
      oldObj.position.lerpVectors(start, drop, k);
      oldObj.position.y += Math.sin(k * Math.PI) * 0.2;
    });
    p.props.push(oldObj);
    sfx.thud();
    await this.tapNew(fresh, 'prompt.placeNew', start);
    sfx.whoosh();
    const homeLocal = p.car.body.worldToLocal(start.clone());
    const fstart = fresh.getWorldPosition(V(0, 0, 0));
    s.attach(fresh);
    await clock.tween(0.55, (k) => {
      fresh.position.lerpVectors(fstart, start, k);
      fresh.position.y += Math.sin(k * Math.PI) * 0.2;
    });
    p.car.body.attach(fresh);
    fresh.position.copy(homeLocal);
    fresh.rotation.copy(oldObj.rotation);
    if (brake === 'pads') {
      fresh.rotation.set(0, Math.PI / 2, 0);
      w.pads = fresh;
    } else {
      fresh.rotation.set(0, 0, 0);
      w.disc = fresh;
    }
    sfx.thud();
    this.fx.sparkle(start, 12);
    await clock.tween(0.4, (k) => {
      w.caliper.position.set(c0.x + (1 - k) * 0.08, c0.y + (1 - k) * 0.12, c0.z);
      if (brake === 'pads') w.pads.position.set(c0.x - 0.01 + (1 - k) * 0.08, c0.y + (1 - k) * 0.12, c0.z);
      else w.pads.position.set(c0.x - 0.01 + (1 - k) * 0.08, c0.y + (1 - k) * 0.12, c0.z);
    });
    w.caliperBolts.forEach((b) => (b.visible = true));
    const left = new Set([0, 1]);
    while (left.size) {
      const id = await this.act(
        'prompt.boltsOn',
        [...left].map((i) => this.boltTarget(`cb${i}`, w.caliperBolts[i], (k) => (w.caliperBolts[i].rotation.x = -k * 12), () => {})),
        null,
        null,
      );
      left.delete(Number(id.slice(2)));
      sfx.torque();
    }
  }

  // ---------- fluids ----------
  private async fluid(kind: 'oil' | 'coolant', bottle: THREE.Group | null) {
    const p = this.p;
    if (!this.bay.group.visible || this.bay.hoodPivot.rotation.x > -0.5) await this.openBay();
    const cap = kind === 'oil' ? (this.bay.oilCap ?? this.bay.coolantCap) : this.bay.coolantCap;
    await this.act('prompt.capOpen', [{ id: 'cap', obj: cap, mode: 'tap' }], 'cap', cap);
    sfx.pop();
    const capHome = cap.position.clone();
    await clock.tween(0.3, (k) => {
      cap.position.set(capHome.x + k * 0.08, capHome.y + Math.sin(k * Math.PI) * 0.08, capHome.z);
      cap.rotation.z = k * 2;
    });
    // the bottle hovers over the filler, tilted
    const b = bottle ?? buildPart(kind, true);
    const capW = cap.getWorldPosition(V(0, 0, 0));
    const above = capW.clone().add(V(-0.08, 0.2, 0));
    const startW = b.parent ? b.getWorldPosition(V(0, 0, 0)) : above.clone().add(V(0, 0.5, 0));
    p.stage.scene.attach(b);
    if (!b.parent) p.stage.scene.add(b);
    await clock.tween(0.5, (k) => {
      b.position.lerpVectors(startW, above, k);
      b.rotation.z = -k * 2.0;
    });
    const color = kind === 'oil' ? '#f2b134' : '#ff5fa2';
    let level = 0.3;
    const lo = 0.7,
      hi = 0.86;
    p.ui.meter(level, lo, hi, color);
    for (;;) {
      let pouring: (() => void) | null = null;
      const target: Target = {
        id: 'pour',
        obj: b,
        mode: 'hold',
        hold: 99,
        onHoldStart: () => {
          pouring = clock.every((dt) => {
            level = Math.min(1.05, level + dt * 0.32);
            p.ui.meter(level, lo, hi, color);
            if (Math.random() < 0.5) this.fx.sparkle(capW.clone().add(V(0, 0.05, 0)), 1, color);
          });
        },
        onHoldCancel: () => pouring?.(),
      };
      // release ends the hold: watch the level ourselves
      p.ui.prompt(t('prompt.pour'));
      p.expected = 'pour';
      p.markerFor = b;
      await new Promise<void>((res) => {
        target.onHoldCancel = () => {
          pouring?.();
          res();
        };
        void p.input.interact([target]);
      });
      p.input.cancel();
      p.expected = null;
      p.markerFor = null;
      if (level >= lo && level <= hi) break;
      if (level > hi) {
        sfx.bad();
        p.ui.toast(t('toast.overfill'), 'bad');
        p.job.addMinutes(2);
        await clock.tween(0.6, (k) => {
          level = lerp(level, 0.55, k);
          p.ui.meter(level, lo, hi, color);
        });
      }
    }
    sfx.good();
    p.ui.meter(null);
    b.removeFromParent();
    await this.act('prompt.capClose', [{ id: 'cap', obj: cap, mode: 'tap' }], 'cap', cap);
    await clock.tween(0.25, (k) => {
      cap.position.set(capHome.x + (1 - k) * 0.08, capHome.y, capHome.z);
      cap.rotation.z = (1 - k) * 2;
    });
    sfx.clink();
    await this.hood(false);
  }

  // ---------- paint ----------
  private async paint(can: THREE.Group) {
    const p = this.p;
    const sc = p.car.addScratch();
    await this.rig.go(p.shots().door, 0.9);
    const m = sc.material as THREE.MeshStandardMaterial;
    const fast = p.ctx.booth;
    const need = fast ? 380 : 700;
    // 1 sand
    await this.act('prompt.sand', [{ id: 'sand', obj: sc, mode: 'rub', rub: need, onRub: (k) => ((m.opacity = 1 - k * 0.7), Math.random() < 0.3 && this.fx.dust(sc.getWorldPosition(V(0, 0, 0)), 2), Math.random() < 0.25 && sfx.sand()) }], 'sand', sc);
    // 2 spray (base colour patch)
    can.removeFromParent();
    m.map = null;
    m.color.set('#c7c9cc');
    m.opacity = 0.9;
    m.needsUpdate = true;
    await this.act('prompt.spray', [{ id: 'spray', obj: sc, mode: 'rub', rub: need, onRub: (k) => (m.color.lerpColors(new THREE.Color('#c7c9cc'), p.car.paint, k), Math.random() < 0.6 && this.fx.smoke(sc.getWorldPosition(V(0, 0, 0)).add(V(0.15, 0, 0)), V(-1, 0, 0), 1, '#' + p.car.paint.getHexString()), Math.random() < 0.3 && sfx.spray()) }], 'spray', sc);
    // 3 polish
    await this.act('prompt.polish', [{ id: 'polish', obj: sc, mode: 'rub', rub: need * 0.7, onRub: (k) => ((m.roughness = 0.6 - k * 0.5), (m.opacity = 0.9 - k * 0.9), Math.random() < 0.3 && this.fx.sparkle(sc.getWorldPosition(V(0, 0, 0)), 2)) }], 'polish', sc);
    sc.visible = false;
    p.car.scratch = null;
    sfx.good();
  }

  /** a part the car has no place for (e.g. a fuel part on an electric car): it simply does not fit */
  private async quickFit(part: PartId, box: THREE.Object3D) {
    const p = this.p;
    await this.openBay();
    box.removeFromParent();
    p.ui.prompt(t('prompt.fitting', { part: t(`part.${part}`) }));
    const spot = this.bay.world(V(this.bay.W * 0.12, 0.25, 0));
    p.ratchet.showAt(spot, p.stage.scene);
    const stop = clock.every((_d, tt) => p.ratchet.swing(tt));
    for (let i = 0; i < 10; i++) {
      sfx.ratchet();
      await clock.wait(0.12);
    }
    stop();
    p.ratchet.hide();
    sfx.torque();
    p.ui.prompt(null);
    await this.hood(false);
  }
}


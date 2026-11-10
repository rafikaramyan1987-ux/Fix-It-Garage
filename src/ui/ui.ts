/** DOM overlay for a job: HUD, ticket, toolbar, readouts, parts sheet, payment, prompts, markers. All text via t(). */
import { clock } from '../app/clock';
import { CARS, FINDINGS, PARTS, PART_IDS, type CarType, type PartCat, type PartId, type ToolId } from '../game/data';
import type { Payout, Reading } from '../game/job';
import type { JobDef } from '../game/jobs';
import { esc, t } from '../i18n';
import { avatar, icons } from './icons';
import './style.css';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export const fmtTime = (m: number) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}`;

/** a finding's value on a tool screen: a reading or a translated word */
export const findingValue = (id: keyof typeof FINDINGS) => {
  const v = FINDINGS[id].value;
  return v.startsWith('v.') ? t(v) : v;
};

/** the clue lines of a reading */
export function readingLines(r: Reading, car: CarType): string[] {
  if (r.verdict === 'na') return [t(`tool.na.${r.tool}`)];
  if (r.verdict === 'ok') return [t(r.tool === 'listen' && CARS[car].ev ? 'tool.listen.okEv' : `tool.${r.tool}.ok`)];
  return r.findings.map((f) => t(`finding.${f}`));
}

export interface ToolButton {
  id: ToolId;
  used: boolean;
  locked: boolean;
  minutes: number;
}
export interface ToolbarOpts {
  tools: ToolButton[];
  onTool: (t: ToolId) => void;
  onLocked: (t: ToolId) => void;
  /** show the rewarded hint button (platform builds only) */
  hint: boolean;
  onHint: () => void;
  onRepair: () => void;
  onTest: () => void;
  repairReady: boolean;
  testReady: boolean;
}

export class UI {
  readonly root: HTMLElement;
  private hud: HTMLElement;
  private moneyVal: HTMLElement;
  private clockPill: HTMLElement;
  private ticketEl: HTMLElement | null = null;
  private cluesEl: HTMLElement | null = null;
  private promptEl: HTMLElement | null = null;
  private toolbarEl: HTMLElement | null = null;
  private ringEl: HTMLElement;
  private ringFg: SVGCircleElement;
  private markerEl: HTMLElement;
  private handEl: HTMLElement;
  private tagEls: HTMLElement[] = [];
  private meterEl: HTMLElement | null = null;
  money = 0;
  onPause: () => void = () => {};

  constructor(root: HTMLElement) {
    this.root = root;
    this.hud = el('div', 'hud hidden');
    const money = el('div', 'pill money', `<span class="ic">${icons.coin}</span><span class="val">0</span>`);
    this.moneyVal = money.querySelector('.val')!;
    this.clockPill = el('div', 'pill clock', `<span class="ic">${icons.clock}</span><span class="val">0:00</span><span class="bonus"></span>`);
    const pause = el('button', 'iconbtn', icons.pause);
    pause.dataset.action = 'pause';
    pause.setAttribute('aria-label', 'Pause');
    pause.addEventListener('click', () => this.onPause());
    this.hud.append(money, el('div', 'grow'), this.clockPill, pause);
    root.append(this.hud);
    this.ringEl = el('div', 'ring hidden', `<svg viewBox="0 0 84 84"><circle class="bg" cx="42" cy="42" r="34"/><circle class="fg" cx="42" cy="42" r="34" stroke-dasharray="213.6" stroke-dashoffset="213.6"/></svg>`);
    this.ringFg = this.ringEl.querySelector('.fg')!;
    this.markerEl = el('div', 'marker hidden', icons.arrow);
    this.handEl = el('div', 'hand hidden', icons.hand);
    root.append(this.ringEl, this.markerEl, this.handEl);
  }

  showHud(on: boolean) {
    this.hud.classList.toggle('hidden', !on);
  }

  /** the money pill alone (menus) */
  showMoney(on: boolean) {
    this.hud.classList.toggle('hidden', !on);
    this.hud.classList.toggle('menu-hud', on);
  }

  setMoney(n: number) {
    this.money = n;
    this.moneyVal.textContent = String(Math.round(n));
  }

  async countMoney(to: number, dur = 0.8) {
    const from = this.money;
    await clock.tween(dur, (k) => this.setMoney(from + (to - from) * k));
  }

  setClock(minutes: number, target: number, bonus: number) {
    this.clockPill.querySelector('.val')!.textContent = fmtTime(minutes);
    this.clockPill.querySelector('.bonus')!.textContent = bonus > 0 ? `+$${bonus}` : '';
    this.clockPill.classList.toggle('warn', minutes > target);
  }

  showTicket(job: JobDef, symptoms: string[]) {
    this.ticketEl?.remove();
    const c = job.customer;
    const title = job.daily ? t('hud.daily') : t('hud.job', { n: job.n });
    const tricky = job.mod ? `<div class="tricky"><b>${esc(t('hud.tricky'))}</b> ${esc(t(`mod.${job.mod}`))}</div>` : '';
    const two = job.faults.filter((f) => f !== 'scratch').length > 1 ? `<span class="badge">${esc(t('hud.twoFaults'))}</span>` : '';
    const tk = el(
      'div',
      `ticket${job.mod ? ' is-tricky' : ''}`,
      `<button class="toggle fit">${esc(t('hud.show'))}</button><div class="head"><div class="avatar">${avatar(c.hair, c.skin, c.shirt)}</div><div class="meta"><div class="who">${esc(c.name)}</div><div class="car fit">${esc(t(`car.${job.car}`))} · ${esc(title)}</div></div></div>
      ${tricky}<div class="quote">${symptoms.map((s) => `“${esc(s)}”`).join('<br>')} ${two}</div><div class="clues-wrap"><h4><span>${esc(t('hud.clues'))}</span><span>${esc(t('hud.target', { time: fmtTime(job.targetMinutes) }))}</span></h4><ul class="clues"><li class="empty">${esc(t('hud.noClues'))}</li></ul></div>`,
    );
    tk.querySelector('.toggle')!.addEventListener('click', () => this.compactTicket(!tk.classList.contains('compact')));
    this.ticketEl = tk;
    this.cluesEl = tk.querySelector('.clues');
    this.root.append(tk);
  }

  compactTicket(on: boolean) {
    if (!this.ticketEl) return;
    this.ticketEl.classList.toggle('compact', on);
    this.ticketEl.querySelector('.toggle')!.textContent = on ? t('hud.show') : t('hud.hide');
  }

  hideTicket() {
    this.ticketEl?.remove();
    this.ticketEl = null;
  }

  /** add or update the clue lines of one tool */
  setClue(r: Reading, car: CarType) {
    if (!this.cluesEl) return;
    this.cluesEl.querySelector('.empty')?.remove();
    this.cluesEl.querySelector(`[data-tool="${r.tool}"]`)?.remove();
    const cls = r.verdict === 'bad' ? 'bad' : r.verdict === 'ok' ? 'ok' : 'na';
    const li = el('li', cls, `<span class="dot">${r.verdict === 'bad' ? icons.cross : icons.check}</span><span class="lines">${readingLines(r, car).map(esc).join('<br>')}</span>`);
    li.dataset.tool = r.tool;
    this.cluesEl.append(li);
  }

  prompt(html: string | null) {
    this.promptEl?.remove();
    this.promptEl = null;
    if (!html) return;
    this.promptEl = el('div', 'prompt', html);
    this.root.append(this.promptEl);
  }

  toolbar(o: ToolbarOpts | null) {
    this.toolbarEl?.remove();
    this.toolbarEl = null;
    if (!o) return;
    const bar = el('div', 'toolbar');
    const tools = el('div', 'tools');
    for (const tb of o.tools) {
      const b = el(
        'button',
        `tool${tb.used ? ' used' : ''}${tb.locked ? ' locked' : ''}`,
        `<span class="ic">${tb.locked ? icons.lock : icons[tb.id]}</span><span class="nm fit">${esc(t(`tool.${tb.id}`))}</span><span class="cost fit">${esc(tb.locked ? t('tool.locked') : t('tool.min', { n: tb.minutes }))}</span>`,
      );
      b.dataset.tool = tb.id;
      b.addEventListener('click', () => (tb.locked ? o.onLocked(tb.id) : o.onTool(tb.id)));
      tools.append(b);
    }
    const acts = el('div', 'acts');
    if (o.hint) {
      const h = el('button', 'act hint', `<span class="ic">${icons.tv}</span><span class="nm fit">${esc(t('ad.hint'))}</span>`);
      h.dataset.tool = 'hint';
      h.addEventListener('click', o.onHint);
      acts.append(h);
    }
    const r = el('button', `act repair${o.repairReady ? ' pulse' : ''}`, `<span class="ic">${icons.wrench}</span><span class="nm fit">${esc(t('action.repair'))}</span><span class="cost fit">${esc(t('action.repairSub'))}</span>`);
    r.dataset.tool = 'repair';
    r.addEventListener('click', o.onRepair);
    acts.append(r);
    if (o.testReady) {
      const ts = el('button', 'act test pulse', `<span class="ic">${icons.key}</span><span class="nm fit">${esc(t('action.test'))}</span><span class="cost fit">${esc(t('action.testSub'))}</span>`);
      ts.dataset.tool = 'test';
      ts.addEventListener('click', o.onTest);
      acts.append(ts);
    }
    bar.append(tools, acts);
    this.toolbarEl = bar;
    this.root.append(bar);
  }

  /** a tool reading in a popup; resolves when closed */
  readout(tool: ToolId, r: Reading, car: CarType) {
    return new Promise<void>((res) => {
      const shade = el('div', 'shade');
      const value = r.verdict === 'bad' ? r.findings.map((f) => findingValue(f)).join(' · ') : r.verdict === 'ok' ? t('v.ok') : t('v.na');
      const tag = r.verdict === 'bad' ? t('readout.problem') : r.verdict === 'ok' ? t('readout.fine') : t('readout.na');
      const card = el(
        'div',
        `readout ${r.verdict}`,
        `<div class="tname">${icons[tool]}<span class="fit">${esc(t(`tool.${tool}`))}</span></div><div class="lcd">${esc(value)}</div><div class="tag">${esc(tag)}</div><div class="txt">${readingLines(r, car).map(esc).join('<br>')}</div><button class="btn teal">${esc(t('readout.ok'))}</button>`,
      );
      const close = () => {
        shade.remove();
        card.remove();
        res();
      };
      card.querySelector('button')!.addEventListener('click', close);
      shade.addEventListener('click', close);
      this.root.append(shade, card);
    });
  }

  /** pick a part, then order it (or get it free with a rewarded ad); null = cancelled */
  partsSheet(money: number, car: CarType, freeAd: boolean) {
    return new Promise<{ part: PartId; free: boolean } | null>((res) => {
      const shade = el('div', 'shade');
      const sheet = el('div', 'sheet parts-sheet', `<h3>${esc(t('parts.title'))}</h3><p>${esc(t('parts.desc'))}</p>`);
      const tabs = el('div', 'tabs');
      const grid = el('div', 'parts');
      const row = el('div', 'row');
      let sel: PartId | null = null;
      const cats: PartCat[] = ['bay', 'wheels', 'under', 'fluids'];
      const fits = (p: PartId) => {
        if (p === 'chargeport') return !!CARS[car].ev;
        if (['alternator', 'starter', 'plugs', 'airfilter', 'thermostat', 'fuelpump', 'muffler', 'catalyst', 'gasket', 'oil'].includes(p)) return !CARS[car].ev;
        return true;
      };
      const renderRow = () => {
        row.innerHTML = '';
        const cancel = el('button', 'btn ghost', esc(t('parts.keep')));
        cancel.addEventListener('click', () => done(null));
        row.append(cancel);
        if (!sel) return;
        const p = PARTS[sel];
        if (freeAd) {
          const ad = el('button', 'btn ad small', `${icons.tv.replace('<svg', '<svg width="26" height="26"')}<span class="fit">${esc(t('ad.free'))}</span>`);
          ad.dataset.action = 'free-part';
          ad.addEventListener('click', () => done({ part: sel!, free: true }));
          row.append(ad);
        }
        const buy = el('button', 'btn green', esc(t('parts.order', { price: p.price })));
        buy.dataset.action = 'order';
        if (p.price > money) buy.setAttribute('disabled', '');
        buy.addEventListener('click', () => done({ part: sel!, free: false }));
        row.append(buy);
      };
      const renderCat = (cat: PartCat) => {
        tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.cat === cat));
        grid.innerHTML = '';
        for (const id of PART_IDS.filter((p) => PARTS[p].cat === cat && p !== 'coolant')) {
          const ok = fits(id);
          const b = el('button', `part${sel === id ? ' sel' : ''}${ok ? '' : ' off'}`, `<span class="ic">${icons[id]}</span><span class="pt"><span class="nm fit">${esc(t(`part.${id}`))}</span><span class="pr">$${PARTS[id].price}</span></span>`);
          b.dataset.part = id;
          if (!ok) b.title = t(CARS[car].ev ? 'parts.fuelOnly' : 'parts.evOnly');
          b.addEventListener('click', () => {
            if (!ok) return;
            sel = id;
            grid.querySelectorAll('.part').forEach((x) => x.classList.toggle('sel', (x as HTMLElement).dataset.part === id));
            renderRow();
          });
          grid.append(b);
        }
      };
      for (const c of cats) {
        const b = el('button', 'tab fit', esc(t(`cat.${c}`)));
        b.dataset.cat = c;
        b.addEventListener('click', () => renderCat(c));
        tabs.append(b);
      }
      sheet.append(tabs, grid, row);
      renderCat('bay');
      renderRow();
      const done = (v: { part: PartId; free: boolean } | null) => {
        shade.remove();
        sheet.remove();
        res(v);
      };
      shade.addEventListener('click', () => done(null));
      this.root.append(shade, sheet);
    });
  }

  toast(text: string, kind: 'good' | 'bad' | 'info' = 'info', dur = 1.8) {
    const tt = el('div', `toast ${kind}`, esc(text));
    tt.style.animationDuration = `${dur}s`;
    this.root.append(tt);
    clock.later(dur, () => tt.remove());
  }

  ring(x: number, y: number, k: number) {
    this.ringEl.classList.remove('hidden');
    this.ringEl.style.left = `${x}px`;
    this.ringEl.style.top = `${y}px`;
    this.ringFg.setAttribute('stroke-dashoffset', String(213.6 * (1 - k)));
  }
  hideRing() {
    this.ringEl.classList.add('hidden');
  }

  marker(p: { x: number; y: number } | null) {
    this.markerEl.classList.toggle('hidden', !p);
    if (p) {
      this.markerEl.style.left = `${p.x}px`;
      this.markerEl.style.top = `${p.y}px`;
    }
  }

  /** the tutorial's pointing hand at a screen point (null hides it) */
  hand(p: { x: number; y: number } | null) {
    this.handEl.classList.toggle('hidden', !p);
    if (p) {
      this.handEl.style.left = `${p.x}px`;
      this.handEl.style.top = `${p.y}px`;
    }
  }

  tags(list: { x: number; y: number; text: string; color?: string }[]) {
    while (this.tagEls.length > list.length) this.tagEls.pop()!.remove();
    list.forEach((tg, i) => {
      let e = this.tagEls[i];
      if (!e) {
        e = el('div', 'tag3d');
        this.root.append(e);
        this.tagEls.push(e);
      }
      e.textContent = tg.text;
      e.style.color = tg.color ?? '';
      e.style.left = `${tg.x}px`;
      e.style.top = `${tg.y}px`;
    });
  }

  /** a vertical level gauge for pouring (0..1, green zone lo..hi) */
  meter(level: number | null, lo = 0.7, hi = 0.85, color = '#f2b134') {
    if (level === null) {
      this.meterEl?.remove();
      this.meterEl = null;
      return;
    }
    if (!this.meterEl) {
      this.meterEl = el('div', 'meter', `<div class="zone"></div><div class="lvl"></div><div class="mark"></div>`);
      this.root.append(this.meterEl);
    }
    const z = this.meterEl.querySelector<HTMLElement>('.zone')!;
    z.style.bottom = `${lo * 100}%`;
    z.style.height = `${(hi - lo) * 100}%`;
    const l = this.meterEl.querySelector<HTMLElement>('.lvl')!;
    l.style.height = `${Math.min(1, level) * 100}%`;
    l.style.background = color;
  }

  centerAction(html: string, cls = 'green', note = '') {
    return new Promise<void>((res) => {
      const wrap = el('div', 'center-action');
      const b = el('button', `btn big ${cls}`, html);
      b.dataset.action = 'center';
      b.addEventListener('click', () => {
        wrap.remove();
        res();
      });
      wrap.append(b);
      if (note) wrap.append(el('div', 'prompt pass', note));
      this.root.append(wrap);
    });
  }

  payment(p: Payout, customer: string, thanksKey: string, canDouble: boolean, onStar: (i: number) => void, extra = '') {
    return new Promise<'next' | 'double' | 'menu'>((res) => {
      const wrap = el('div', 'pay');
      const lines: [string, string][] = [
        [t('pay.labor'), `$${p.labor}`],
        [t('pay.parts'), `$${p.parts}`],
        [t('pay.timeBonus'), `$${p.timeBonus}`],
      ];
      if (p.tips) lines.push([t('pay.tips'), `$${p.tips}`]);
      const card = el(
        'div',
        'paycard',
        `<h2>${esc(t('pay.title'))}</h2><div class="thanks">“${esc(t(thanksKey))}” – ${esc(customer)}</div>
        <div class="stars">${[0, 1, 2].map((i) => `<span class="s" data-i="${i}">${i < p.stars ? icons.star : icons.starOff}</span>`).join('')}</div>
        <div class="lines">${lines.map(([a, b]) => `<div><span class="fit">${esc(a)}</span><span>${b}</span></div>`).join('')}${p.wasted ? `<div class="neg"><span class="fit">${esc(t('pay.wasted'))}</span><span>-$${p.wasted}</span></div>` : ''}<div class="tot"><span class="fit">${esc(t('pay.total'))}</span><span>$${p.total}</span></div></div>
        ${p.notes.length ? `<div class="notes">${p.notes.map((n) => esc(t(n))).join(' · ')}</div>` : ''}${extra ? `<div class="notes good">${esc(extra)}</div>` : ''}<div class="row"></div>`,
      );
      const row = card.querySelector('.row')!;
      if (canDouble) {
        const d = el('button', 'btn ad', `${icons.tv.replace('<svg', '<svg width="30" height="30"')}<span class="fit">${esc(t('ad.double'))}</span>`);
        d.dataset.action = 'double';
        d.addEventListener('click', () => {
          wrap.remove();
          res('double');
        });
        row.append(d);
      }
      const n = el('button', 'btn green big', esc(t('pay.next')));
      n.dataset.action = 'next';
      n.addEventListener('click', () => {
        wrap.remove();
        res('next');
      });
      const m = el('button', 'btn ghost', esc(t('pay.menu')));
      m.dataset.action = 'menu';
      m.addEventListener('click', () => {
        wrap.remove();
        res('menu');
      });
      row.append(n, m);
      wrap.append(card);
      this.root.append(wrap);
      card.querySelectorAll<HTMLElement>('.s').forEach((s, i) => clock.later(0.35 + i * 0.25, () => (s.classList.add('on'), i < p.stars && onStar(i))));
    });
  }

  coins(fromX: number, fromY: number, n = 8) {
    const to = this.moneyVal.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const c = el('div', 'coin', icons.coin);
      this.root.append(c);
      const dx = (Math.random() - 0.5) * 120,
        dy = -60 - Math.random() * 80;
      void clock.wait(i * 0.06).then(() =>
        clock
          .tween(0.75, (k) => {
            const x = fromX + dx * Math.sin(k * Math.PI) * (1 - k) + (to.left - fromX) * k * k;
            const y = fromY + dy * Math.sin(k * Math.PI) + (to.top - fromY) * k * k;
            c.style.transform = `translate(${x - 14}px, ${y - 14}px) scale(${1 - k * 0.3})`;
          })
          .then(() => c.remove()),
      );
    }
  }

  /** clear every in-job element (leaving a job) */
  clearJob() {
    this.hideTicket();
    this.prompt(null);
    this.toolbar(null);
    this.hideRing();
    this.marker(null);
    this.hand(null);
    this.tags([]);
    this.meter(null);
    this.root.querySelectorAll('.readout, .shade, .sheet, .center-action, .pay, .toast').forEach((e) => e.remove());
  }
}


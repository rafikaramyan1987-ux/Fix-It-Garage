/** DOM overlay: HUD, job ticket, toolbar, readouts, parts sheet, payment and title screens. */
import { clock } from '../app/clock';
import { PARTS, TOOLS, type JobDef, type PartId, type Reading, type ToolId } from '../game/data';
import type { Payout } from '../game/job';
import { avatar, icons } from './icons';
import './style.css';

const CAR_NAMES = { sedan: 'Family sedan', hatchback: 'Sporty hatchback', van: 'Delivery van' } as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

const fmtTime = (m: number) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}`;

export interface ToolbarOpts {
  used: Set<ToolId>;
  onTool: (t: ToolId) => void;
  onHint: () => void;
  onRepair: () => void;
  hintLeft: boolean;
  repairReady: boolean;
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
  private tagEls: HTMLElement[] = [];
  money = 0;
  onMute: () => boolean = () => false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.hud = el('div', 'hud hidden');
    const money = el('div', 'pill money', `<span class="ic">${icons.coin}</span><span class="val">0</span>`);
    this.moneyVal = money.querySelector('.val')!;
    this.clockPill = el('div', 'pill clock', `<span class="ic">${icons.clock}</span><span class="val">0:00</span><span class="bonus"></span>`);
    const mute = el('button', 'iconbtn', icons.sound);
    mute.setAttribute('aria-label', 'Sound on/off');
    mute.addEventListener('click', () => {
      mute.innerHTML = this.onMute() ? icons.mute : icons.sound;
    });
    this.hud.append(money, el('div', 'grow'), this.clockPill, mute);
    root.append(this.hud);
    this.ringEl = el('div', 'ring hidden', `<svg viewBox="0 0 84 84"><circle class="bg" cx="42" cy="42" r="34"/><circle class="fg" cx="42" cy="42" r="34" stroke-dasharray="213.6" stroke-dashoffset="213.6"/></svg>`);
    this.ringFg = this.ringEl.querySelector('.fg')!;
    this.markerEl = el('div', 'marker hidden', icons.arrow);
    root.append(this.ringEl, this.markerEl);
  }

  showHud(on: boolean) {
    this.hud.classList.toggle('hidden', !on);
  }

  setMoney(n: number) {
    this.money = n;
    this.moneyVal.textContent = String(Math.round(n));
  }

  /** count the money up/down over time */
  async countMoney(to: number, dur = 0.8) {
    const from = this.money;
    await clock.tween(dur, (k) => this.setMoney(from + (to - from) * k));
  }

  setClock(minutes: number, target: number, bonus: number) {
    this.clockPill.querySelector('.val')!.textContent = fmtTime(minutes);
    this.clockPill.querySelector('.bonus')!.textContent = bonus > 0 ? `+$${bonus}` : '';
    this.clockPill.classList.toggle('warn', minutes > target);
  }

  showTicket(job: JobDef, symptom: string, car: keyof typeof CAR_NAMES) {
    this.ticketEl?.remove();
    const c = job.customer;
    const t = el(
      'div',
      'ticket',
      `<button class="toggle">Clues ▾</button><div class="head"><div class="avatar">${avatar(c.hair, c.skin, c.shirt)}</div><div class="meta"><div class="who">${c.name}</div><div class="car">${CAR_NAMES[car]} · Job #1</div></div></div>
      <div class="quote">“${symptom}”</div><div class="clues-wrap"><h4><span>Clues</span><span>Target ${fmtTime(job.targetMinutes)}</span></h4><ul class="clues"><li class="empty">Use a tool to find clues</li></ul></div>`,
    );
    t.querySelector('.toggle')!.addEventListener('click', () => this.compactTicket(!t.classList.contains('compact')));
    this.ticketEl = t;
    this.cluesEl = t.querySelector('.clues');
    this.root.append(t);
  }

  compactTicket(on: boolean) {
    if (!this.ticketEl) return;
    this.ticketEl.classList.toggle('compact', on);
    this.ticketEl.querySelector('.toggle')!.textContent = on ? 'Clues ▾' : 'Hide ▴';
  }

  hideTicket() {
    this.ticketEl?.remove();
    this.ticketEl = null;
  }

  addClue(r: Reading) {
    if (!this.cluesEl) return;
    this.cluesEl.querySelector('.empty')?.remove();
    const li = el('li', r.verdict, `<span class="dot">${r.verdict === 'bad' ? icons.cross : icons.check}</span><span>${r.text}</span>`);
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
    for (const id of ['tester', 'obd', 'listen', 'lift'] as ToolId[]) {
      const d = TOOLS[id];
      const b = el('button', `tool${o.used.has(id) ? ' used' : ''}`, `<span class="ic">${icons[id]}</span><span class="nm">${d.name}</span><span class="cost">+${d.minutes} min</span>`);
      b.dataset.tool = id;
      b.addEventListener('click', () => o.onTool(id));
      bar.append(b);
    }
    bar.append(el('div', 'sep'));
    if (o.hintLeft) {
      const h = el('button', 'tool hint', `<span class="ic">${icons.bulb}</span><span class="nm">Hint</span><span class="cost"><span class="adtag" style="background:#8b5cf6;color:#fff">AD</span></span>`);
      h.dataset.tool = 'hint';
      h.addEventListener('click', o.onHint);
      bar.append(h);
    }
    const r = el('button', `tool repair${o.repairReady ? ' pulse' : ''}`, `<span class="ic">${icons.wrench}</span><span class="nm">Repair</span><span class="cost">pick a part</span>`);
    r.dataset.tool = 'repair';
    r.addEventListener('click', o.onRepair);
    bar.append(r);
    this.toolbarEl = bar;
    this.root.append(bar);
  }

  /** a tool reading in a popup; resolves when closed */
  readout(tool: ToolId, r: Reading) {
    return new Promise<void>((res) => {
      const shade = el('div', 'shade');
      const card = el(
        'div',
        `readout ${r.verdict}`,
        `<div class="tname">${icons[tool]}${TOOLS[tool].name}</div><div class="screen">${r.value}</div><div class="tag">${r.verdict === 'bad' ? 'Problem found' : 'Looks fine'}</div><div class="txt">${r.text}</div><button class="btn teal">Got it</button>`,
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

  /** pick a part to order; null = cancelled */
  partsSheet(money: number) {
    return new Promise<PartId | null>((res) => {
      const shade = el('div', 'shade');
      const sheet = el('div', 'sheet', `<h3>Which part is faulty?</h3><p>Order the part your clues point to. Wrong parts are paid by the garage.</p>`);
      const grid = el('div', 'parts');
      for (const p of Object.values(PARTS)) {
        const b = el('button', 'part', `<span class="ic">${icons[p.id]}</span><span><div class="nm">${p.name}</div><div class="pr">$${p.price}</div></span>`);
        b.dataset.part = p.id;
        if (p.price > money) b.setAttribute('disabled', '');
        b.addEventListener('click', () => done(p.id));
        grid.append(b);
      }
      const row = el('div', 'row');
      const cancel = el('button', 'btn ghost', 'Keep checking');
      cancel.addEventListener('click', () => done(null));
      row.append(cancel);
      sheet.append(grid, row);
      const done = (v: PartId | null) => {
        shade.remove();
        sheet.remove();
        res(v);
      };
      shade.addEventListener('click', () => done(null));
      this.root.append(shade, sheet);
    });
  }

  toast(text: string, kind: 'good' | 'bad' | 'info' = 'info') {
    const t = el('div', `toast ${kind}`, text);
    this.root.append(t);
    clock.later(1.8, () => t.remove());
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

  /** small floating labels on 3D points (terminal signs) */
  tags(list: { x: number; y: number; text: string; color?: string }[]) {
    while (this.tagEls.length > list.length) this.tagEls.pop()!.remove();
    list.forEach((t, i) => {
      let e = this.tagEls[i];
      if (!e) {
        e = el('div', 'tag3d');
        this.root.append(e);
        this.tagEls.push(e);
      }
      e.textContent = t.text;
      e.style.color = t.color ?? '';
      e.style.left = `${t.x}px`;
      e.style.top = `${t.y}px`;
    });
  }

  /** one big button at the bottom; resolves when tapped */
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

  /** payment screen; resolves with the player's choice */
  payment(p: Payout, customer: string, canDouble: boolean, onCoins: (n: number) => void) {
    return new Promise<'next' | 'double'>((res) => {
      const wrap = el('div', 'pay');
      const lines = [
        ['Labour', `$${p.labor}`],
        ['Parts', `$${p.parts}`],
        ['Time bonus', `$${p.timeBonus}`],
      ];
      const card = el(
        'div',
        'paycard',
        `<h2>Job done!</h2><div class="thanks">“Purrs like a kitten! Thank you!” – ${customer}</div>
        <div class="stars">${[0, 1, 2].map((i) => `<span class="s" data-i="${i}">${i < p.stars ? icons.star : icons.starOff}</span>`).join('')}</div>
        <div class="lines">${lines.map(([a, b]) => `<div><span>${a}</span><span>${b}</span></div>`).join('')}${p.wasted ? `<div class="neg"><span>Wrong parts (garage pays)</span><span>-$${p.wasted}</span></div>` : ''}<div class="tot"><span>Customer pays</span><span>$${p.total}</span></div></div>
        ${p.notes.length ? `<div class="notes">${p.notes.join(' · ')}</div>` : ''}<div class="row"></div>`,
      );
      const row = card.querySelector('.row')!;
      if (canDouble) {
        const d = el('button', 'btn ad', `${icons.tv.replace('<svg', '<svg width="30" height="30"')} Double payment <span class="adtag">AD</span>`);
        d.dataset.action = 'double';
        d.addEventListener('click', () => {
          wrap.remove();
          res('double');
        });
        row.append(d);
      }
      const n = el('button', 'btn green big', 'Next customer');
      n.dataset.action = 'next';
      n.addEventListener('click', () => {
        wrap.remove();
        res('next');
      });
      row.append(n);
      wrap.append(card);
      this.root.append(wrap);
      // stars pop in one by one
      card.querySelectorAll<HTMLElement>('.s').forEach((s, i) => clock.later(0.35 + i * 0.25, () => (s.classList.add('on'), i < p.stars && onCoins(i))));
    });
  }

  /** coins flying from a screen point to the money pill */
  coins(fromX: number, fromY: number, n = 8) {
    const to = this.moneyVal.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const c = el('div', 'coin', icons.coin);
      this.root.append(c);
      const dx = (Math.random() - 0.5) * 120,
        dy = -60 - Math.random() * 80;
      const delay = i * 0.06;
      void clock.wait(delay).then(() =>
        clock.tween(0.75, (k) => {
          const x = fromX + dx * Math.sin(k * Math.PI) * (1 - k) + (to.left - fromX) * k * k;
          const y = fromY + dy * Math.sin(k * Math.PI) + (to.top - fromY) * k * k;
          c.style.transform = `translate(${x - 14}px, ${y - 14}px) scale(${1 - k * 0.3})`;
        }).then(() => c.remove()),
      );
    }
  }

  title() {
    return new Promise<void>((res) => {
      const t = el(
        'div',
        'title',
        `<div class="logo3d"><div class="l1">Fix It<br><span>Garage</span></div><div class="l2">Car repair workshop</div></div><div class="sub">Find the fault. Swap the part. Make them smile.</div>`,
      );
      const b = el('button', 'btn big', 'Start shift');
      b.dataset.action = 'start';
      b.addEventListener('click', () => {
        t.remove();
        res();
      });
      t.append(b);
      this.root.append(t);
    });
  }
}

/** DOM overlay for a job: HUD, ticket, toolbar, readouts, parts sheet, payment, prompts, markers. All text via t(). */
import { clock } from '../app/clock';
import { CARS, FINDINGS, PARTS, PART_IDS, type CarType, type PartCat, type PartId, type ToolId } from '../game/data';
import { findingTone, partFits, readingTone } from '../game/diagnosis';
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

export interface SuspectsView {
  /** every part that fits the car, best match first */
  items: { part: PartId; reason: string | null; best: boolean }[];
  /** show only this many (first jobs), null = all */
  limit: number | null;
  /** at least one clue collected */
  clues: boolean;
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
  /** the hint button: "Free" for the free first hint, else its price (null hides it) */
  hint: { free: boolean; price: number } | null;
  onHint: () => void;
  onRepair: () => void;
  onTest: () => void;
  repairReady: boolean;
  testReady: boolean;
  /** pulse the Test button (a new part was fitted since the last test) */
  testPulse?: boolean;
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
  /** Relaxed mode: coloured clue cards and readouts (Expert: plain) */
  colours = true;
  onPause: () => void = () => {};
  onBook: () => void = () => {};
  private bookBtn: HTMLElement;

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
    // the repair book shortcut (during diagnosis only)
    this.bookBtn = el('button', 'iconbtn bookbtn hidden', icons.book);
    this.bookBtn.dataset.action = 'quick-book';
    this.bookBtn.addEventListener('click', () => this.onBook());
    this.hud.append(money, el('div', 'grow'), this.clockPill, this.bookBtn, pause);
    root.append(this.hud);
    this.ringEl = el('div', 'ring hidden', `<svg viewBox="0 0 84 84"><circle class="bg" cx="42" cy="42" r="34"/><circle class="fg" cx="42" cy="42" r="34" stroke-dasharray="213.6" stroke-dashoffset="213.6"/></svg>`);
    this.ringFg = this.ringEl.querySelector('.fg')!;
    this.markerEl = el('div', 'marker hidden', icons.arrow);
    this.handEl = el('div', 'hand hidden', icons.hand);
    root.append(this.ringEl, this.markerEl, this.handEl);
  }

  /** small keyboard-shortcut overlay (desktop pointers only): a corner button that opens the list */
  keysHelp(withHint: boolean) {
    if (typeof matchMedia === 'undefined' || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    this.root.querySelector('.kbtn')?.remove();
    this.root.querySelector('.kpanel')?.remove();
    const btn = el('button', 'kbtn', '⌨');
    btn.setAttribute('aria-label', t('kb.title'));
    btn.dataset.action = 'keys';
    const rows: [string, string][] = [
      ['1–7', t('kb.tools')],
      ['R', t('kb.repair')],
      ['T', t('kb.test')],
      ...(withHint ? ([['H', t('kb.hint')]] as [string, string][]) : []),
      ['␣ / ↵', t('kb.act')],
      ['P', t('kb.pause')],
    ];
    const panel = el('div', 'kpanel hidden', `<h4>${esc(t('kb.title'))}</h4>${rows.map(([k, v]) => `<div class="krow"><kbd>${k}</kbd><span class="fit">${esc(v)}</span></div>`).join('')}`);
    btn.addEventListener('click', () => panel.classList.toggle('hidden'));
    this.root.append(btn, panel);
  }

  /** a soft ring where the player tapped (instant feedback) */
  ripple(x: number, y: number, miss = false) {
    const r = el('div', `ripple${miss ? ' miss' : ''}`);
    r.style.left = `${x}px`;
    r.style.top = `${y}px`;
    this.root.append(r);
    clock.later(0.5, () => r.remove());
  }

  showHud(on: boolean) {
    this.hud.classList.toggle('hidden', !on);
  }

  /** the repair book button in the HUD */
  showBook(on: boolean) {
    this.bookBtn.classList.toggle('hidden', !on);
    this.bookBtn.setAttribute('aria-label', t('book.title'));
  }

  /** the money pill alone (menus) */
  showMoney(on: boolean) {
    this.hud.classList.toggle('hidden', !on);
    this.hud.classList.toggle('menu-hud', on);
  }

  setMoney(n: number) {
    this.money = n;
    const v = Math.round(n);
    this.moneyVal.textContent = v < 0 ? `−${-v}` : String(v);
    this.moneyVal.classList.toggle('neg', v < 0);
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
    const quote = symptoms.map((s) => `“${esc(s)}”`).join(' ');
    const tk = el(
      'div',
      `ticket${job.mod ? ' is-tricky' : ''}${this.portrait ? ' compact' : ''}${this.colours ? '' : ' plain'}`,
      `<button class="strip" data-action="ticket"><span class="avatar">${avatar(c.hair, c.skin, c.shirt)}</span><span class="sq">${quote}</span><span class="clue-count hidden">0</span><span class="pay-pill">$${job.labor}</span></button>
      <div class="details"><div class="head"><div class="avatar">${avatar(c.hair, c.skin, c.shirt)}</div><div class="meta"><div class="who">${esc(c.name)}</div><div class="car fit">${esc(t(`car.${job.car}`))} · ${esc(title)}</div><div class="reward fit">${esc(t('hud.reward', { pay: job.labor, bonus: job.timeBonus }))}</div></div><button class="toggle" aria-label="${esc(t('hud.hide'))}">▴</button></div>
      ${tricky}<div class="quote">${symptoms.map((s) => `“${esc(s)}”`).join('<br>')} ${two}</div><div class="clues-wrap"><h4><span>${esc(t('hud.clues'))}</span><span>${esc(t('hud.target', { time: fmtTime(job.targetMinutes) }))}</span></h4><ul class="clues"><li class="empty">${esc(t('hud.noClues'))}</li></ul></div></div>`,
    );
    tk.querySelector('.strip')!.addEventListener('click', () => this.compactTicket(false, true));
    tk.querySelector('.toggle')!.addEventListener('click', () => this.compactTicket(true, true));
    this.ticketEl = tk;
    this.cluesEl = tk.querySelector('.clues');
    this.root.append(tk);
  }

  get portrait() {
    return window.innerHeight > window.innerWidth;
  }

  /** collapse the ticket to its strip / open it. On phones (portrait) only the player opens it. */
  compactTicket(on: boolean, user = false) {
    if (!this.ticketEl) return;
    if (this.portrait && !user && !on) return;
    this.ticketEl.classList.toggle('compact', on);
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
    // a clue card: the tool, its reading in plain words, and a colour (green normal, red problem, orange suspicious)
    const tone = readingTone(r);
    const cls = r.verdict === 'bad' ? `bad ${tone}` : r.verdict;
    const lines =
      r.verdict === 'bad'
        ? r.findings.map((f) => `<span class="cl ${this.colours ? findingTone(f) : ''}">${esc(t(`finding.${f}`))}</span>`).join('')
        : `<span class="cl">${esc(readingLines(r, car)[0])}</span>`;
    const chip = this.colours ? `<span class="tone">${esc(t(`clue.tone.${tone}`))}</span>` : '';
    const li = el('li', `card ${cls}`, `<span class="dot">${icons[r.tool]}</span><span class="lines"><span class="tl"><span class="tn">${esc(t(`tool.${r.tool}`))}</span>${chip}</span>${lines}</span>`);
    li.dataset.tool = r.tool;
    this.cluesEl.append(li);
    const n = this.cluesEl.querySelectorAll('li:not(.empty)').length;
    const cc = this.ticketEl?.querySelector<HTMLElement>('.clue-count');
    if (cc) {
      cc.textContent = `🔍 ${n}`;
      cc.classList.remove('hidden');
      cc.classList.remove('bump');
      void cc.offsetWidth;
      cc.classList.add('bump');
    }
  }

  /*
   * The one hint line: a slim, semi-transparent banner at the top or bottom edge (never two hints at once).
   * Priority: a short flash (after a mistake) > the tutorial line > the step prompt.
   */
  private promptHtml: string | null = null;
  private tutHtml: string | null = null;
  private tutSkip: (() => void) | null = null;
  private flashHtml: string | null = null;
  private guideHtml: string | null = null;
  private flashUntil = 0;
  private hintEdge: 'top' | 'bottom' = 'bottom';

  prompt(html: string | null) {
    this.promptHtml = html;
    this.renderHint();
  }

  /** the tutorial's line (replaces the step prompt while set) with a small skip button */
  tutorialHint(html: string | null, onSkip?: () => void) {
    this.tutHtml = html;
    this.tutSkip = onSkip ?? null;
    this.renderHint();
  }

  /** the guided hint line (stays until the player acts; above the step prompt) */
  guide(text: string | null) {
    this.guideHtml = text ? `💡 ${esc(text)}` : null;
    this.renderHint();
  }

  /** a short line after a mistake, shown in place of the hint for a moment */
  flashHint(text: string, dur = 1.8) {
    this.flashHtml = esc(text);
    this.flashUntil = clock.t + dur;
    this.renderHint();
    clock.later(dur, () => {
      if (clock.t >= this.flashUntil - 0.01) {
        this.flashHtml = null;
        this.renderHint();
      }
    });
  }

  private renderHint() {
    const html = this.flashHtml ?? this.tutHtml ?? this.guideHtml ?? this.promptHtml;
    if (!html) {
      this.promptEl?.remove();
      this.promptEl = null;
      return;
    }
    if (!this.promptEl) {
      this.promptEl = el('div', 'hintbar');
      this.root.append(this.promptEl);
    }
    const e = this.promptEl;
    e.className = `hintbar ${this.hintEdge}${this.flashHtml ? ' flash' : this.tutHtml ? ' is-tut' : this.guideHtml ? ' is-guide' : ''}`;
    e.innerHTML = `<span class="ht">${html}</span>`;
    if (this.tutHtml && !this.flashHtml && this.tutSkip) {
      const sk = el('button', 'skip', esc(t('tut.skip')));
      sk.dataset.action = 'skip-tutorial';
      const f = this.tutSkip;
      sk.addEventListener('click', () => f());
      e.append(sk);
    }
    this.placeHint(null);
  }

  /** keep the hint at the edge away from the object to touch, clear of the ticket and the toolbar */
  placeHint(avoid: { x: number; y: number } | null) {
    const e = this.promptEl;
    if (!e) return;
    const h = window.innerHeight;
    const edge: 'top' | 'bottom' = avoid ? (avoid.y > h * 0.5 ? 'top' : 'bottom') : this.toolbarEl ? 'bottom' : this.hintEdge;
    this.hintEdge = edge;
    e.classList.toggle('top', edge === 'top');
    e.classList.toggle('bottom', edge === 'bottom');
    if (edge === 'top') {
      const stack = [this.stepsEl, this.ticketEl, this.hud].filter((x): x is HTMLElement => !!x && !x.classList.contains('hidden')).map((x) => x.getBoundingClientRect().bottom);
      e.style.top = `${Math.max(8, ...stack) + 6}px`;
      e.style.bottom = '';
    } else {
      // layout position (offsetTop ignores the toolbar's slide-in transform, so the line never lands on the tools)
      const tb = this.toolbarEl;
      e.style.bottom = `${tb ? h - tb.offsetTop + 6 : 12}px`;
      e.style.top = '';
    }
  }

  /** the three-step journey of a job: find the fault, repair, test (null hides it) */
  private stepsEl: HTMLElement | null = null;
  steps(cur: 'diagnose' | 'repair' | 'test' | null) {
    if (!cur) {
      this.stepsEl?.remove();
      this.stepsEl = null;
      return;
    }
    if (!this.stepsEl) {
      this.stepsEl = el('div', 'steps');
      this.root.append(this.stepsEl);
    }
    const order = ['diagnose', 'repair', 'test'] as const;
    const at = order.indexOf(cur);
    this.stepsEl.dataset.step = cur;
    this.stepsEl.innerHTML = order
      .map((k, i) => `<span class="st${i < at ? ' done' : i === at ? ' on' : ''}" data-step="${k}"><i>${i < at ? '✓' : i + 1}</i><span class="fit">${esc(t(`step.${k}`))}</span></span>`)
      .join('<span class="sep">›</span>');
  }

  /** the animated hand that shows the gesture on the object to touch (tap / hold / lift / rub) */
  private gestureEl: HTMLElement | null = null;
  gesture(p: { x: number; y: number } | null, kind: string) {
    if (!p) {
      this.gestureEl?.classList.add('hidden');
      return;
    }
    if (!this.gestureEl) {
      this.gestureEl = el('div', 'gesture', `<span class="gring"></span><span class="ghand">${icons.hand}</span>`);
      this.root.append(this.gestureEl);
    }
    const g = this.gestureEl;
    const cls = `gesture g-${kind}`;
    if (g.className !== cls) g.className = cls;
    g.style.left = `${p.x}px`;
    g.style.top = `${p.y}px`;
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
      b.title = t(`tool.${tb.id}.what`);
      // a long press shows a one-word hint of what the tool checks (and does not use the tool)
      let timer: ReturnType<typeof setTimeout> | null = null;
      let longPressed = false;
      const tip = el('span', 'tooltip hidden', esc(t(`tool.${tb.id}.what`)));
      b.append(tip);
      b.addEventListener('pointerdown', () => {
        longPressed = false;
        timer = setTimeout(() => {
          longPressed = true;
          tip.classList.remove('hidden');
        }, 450);
      });
      const endPress = () => {
        if (timer) clearTimeout(timer);
        timer = null;
        setTimeout(() => tip.classList.add('hidden'), 900);
      };
      b.addEventListener('pointerup', endPress);
      b.addEventListener('pointerleave', endPress);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      b.addEventListener('click', () => {
        if (longPressed) {
          longPressed = false;
          return;
        }
        if (tb.locked) o.onLocked(tb.id);
        else o.onTool(tb.id);
      });
      tools.append(b);
    }
    const acts = el('div', 'acts');
    if (o.hint) {
      const sub = o.hint.free ? t('hint.free') : `$${o.hint.price}`;
      const h = el('button', `act hint${o.hint.free ? ' free' : ''}`, `<span class="ic">${icons.bulb}</span><span class="nm fit">${esc(t('hint.btn'))}</span><span class="cost fit">${esc(sub)}</span>`);
      h.dataset.tool = 'hint';
      h.addEventListener('click', o.onHint);
      acts.append(h);
    }
    const r = el('button', `act repair${o.repairReady ? ' pulse' : ''}`, `<span class="ic">${icons.wrench}</span><span class="nm fit">${esc(t('action.repair'))}</span><span class="cost fit">${esc(t('action.repairSub'))}</span>`);
    r.dataset.tool = 'repair';
    r.addEventListener('click', o.onRepair);
    acts.append(r);
    if (o.testReady) {
      const ts = el('button', `act test${o.testPulse !== false ? ' pulse' : ''}`, `<span class="ic">${icons.key}</span><span class="nm fit">${esc(t('action.test'))}</span><span class="cost fit">${esc(t('action.testSub'))}</span>`);
      ts.dataset.tool = 'test';
      ts.addEventListener('click', o.onTest);
      acts.append(ts);
    }
    bar.append(tools, acts);
    this.toolbarEl = bar;
    this.root.append(bar);
    this.placeHint(null);
  }

  /** a tool reading in a popup; resolves when closed */
  readout(tool: ToolId, r: Reading, car: CarType) {
    return new Promise<void>((res) => {
      const shade = el('div', 'shade');
      const value = r.verdict === 'bad' ? r.findings.map((f) => findingValue(f)).join(' · ') : r.verdict === 'ok' ? t('v.ok') : t('v.na');
      const tone = readingTone(r);
      const tag = r.verdict === 'bad' ? t(tone === 'warn' ? 'clue.tone.warn' : 'readout.problem') : r.verdict === 'ok' ? t('readout.fine') : t('readout.na');
      // Expert mode: the raw reading and its words only (no colour, no verdict)
      const card = el(
        'div',
        `readout ${r.verdict}${r.verdict === 'bad' ? ` ${tone}` : ''}${this.colours ? '' : ' plain'}`,
        `<div class="tname">${icons[tool]}<span class="fit">${esc(t(`tool.${tool}`))}</span></div><div class="lcd">${esc(value)}</div>${this.colours ? `<div class="tag">${esc(tag)}</div>` : ''}<div class="txt">${readingLines(r, car).map(esc).join('<br>')}</div><button class="btn teal">${esc(t('readout.ok'))}</button>`,
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

  /**
   * pick a part, then order it (or get it free with a rewarded ad); null = cancelled.
   * With `suspects` (Relaxed mode) the parts come as one list sorted by how well they match the clues, the top ones
   * with their reason; `limit` shows only the first few, with a button for the rest.
   */
  partsSheet(money: number, car: CarType, freeAd: boolean, open: PartCat = 'bay', suspects?: SuspectsView) {
    return new Promise<{ part: PartId; free: boolean } | null>((res) => {
      const shade = el('div', 'shade');
      const sheet = el('div', 'sheet parts-sheet', `<h3>${esc(t('parts.title'))}</h3><p>${esc(t('parts.desc'))}</p>`);
      const tabs = el('div', 'tabs');
      const grid = el('div', 'parts');
      const row = el('div', 'row');
      let sel: PartId | null = null;
      const cats: PartCat[] = ['bay', 'wheels', 'under', 'fluids'];
      const fits = (p: PartId) => partFits(p, car);
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
        buy.addEventListener('click', () => done({ part: sel!, free: false }));
        row.append(buy);
        // never a dead end: short of cash, the part is bought on credit (the customer pays parts back)
        if (p.price > money) row.append(el('div', 'credit fit', esc(t('parts.credit'))));
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
      const pick = (id: PartId) => {
        sel = id;
        grid.querySelectorAll('.part').forEach((x) => x.classList.toggle('sel', (x as HTMLElement).dataset.part === id));
        renderRow();
      };
      const renderList = (all: boolean) => {
        const v = suspects!;
        grid.innerHTML = '';
        grid.classList.add('list');
        const items = all || v.limit === null ? v.items : v.items.slice(0, v.limit);
        if (!v.clues && !all) grid.append(el('div', 'noclues', esc(t('parts.noClues'))));
        else
          items.forEach((it, i) => {
            const why = it.reason ? `<span class="why fit">${esc(it.reason)}</span>` : '';
            const badge = i === 0 && it.best ? `<span class="best">${esc(t('suspect.best'))}</span>` : '';
            const b = el('button', `part${sel === it.part ? ' sel' : ''}${i === 0 && it.best ? ' top' : ''}`, `<span class="ic">${icons[it.part]}</span><span class="pt"><span class="nm fit">${esc(t(`part.${it.part}`))}</span>${why}</span><span class="side"><span class="pr">$${PARTS[it.part].price}</span>${badge}</span>`);
            b.dataset.part = it.part;
            b.addEventListener('click', () => pick(it.part));
            grid.append(b);
          });
        if (!all && (!v.clues || items.length < v.items.length)) {
          const more = el('button', 'more fit', esc(t('parts.all')));
          more.dataset.action = 'all-parts';
          more.addEventListener('click', () => renderList(true));
          grid.append(more);
        }
      };
      if (suspects) {
        sheet.querySelector('p')!.textContent = t('parts.descRelaxed');
        sheet.append(grid, row);
        renderList(false);
      } else {
        sheet.append(tabs, grid, row);
        renderCat(open);
      }
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

  /** the "tap to speed up" chip of a skippable wait (null hides it) */
  private skipEl: HTMLElement | null = null;
  skipChip(state: 'on' | 'fast' | null) {
    if (!state) {
      this.skipEl?.remove();
      this.skipEl = null;
      return;
    }
    if (!this.skipEl) {
      this.skipEl = el('div', 'skipchip', `<span class="ff">▶▶</span><span class="fit">${esc(t('ui.skip'))}</span>`);
      this.root.append(this.skipEl);
    }
    this.skipEl.classList.toggle('fast', state === 'fast');
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

  /** the old arrow marker, replaced by the gesture hand: always hidden */
  marker(_p: { x: number; y: number } | null) {
    this.markerEl.classList.add('hidden');
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
    this.tutHtml = null;
    this.flashHtml = null;
    this.guideHtml = null;
    this.prompt(null);
    this.showBook(false);
    this.steps(null);
    this.gesture(null, 'tap');
    this.toolbar(null);
    this.hideRing();
    this.marker(null);
    this.hand(null);
    this.tags([]);
    this.meter(null);
    this.root.querySelectorAll('.readout, .shade, .sheet, .center-action, .pay, .toast').forEach((e) => e.remove());
  }
}


/** Full screens and dialogs: main menu, settings, pause, garage upgrades, repair book, daily job, achievements. */
import { ACHIEVEMENTS, CARS, CAR_TYPES, FAULTS, UPGRADES, UPGRADE_IDS, type AchievementId, type UpgradeId } from '../game/data';
import { INFERABLE as INFERABLE_IDS } from '../game/rules';
import { achProgress, owns, type SaveData } from '../game/progress';
import { esc, LANGS, LANG_NAMES, t, type Lang } from '../i18n';
import { icons } from './icons';
import { el } from './ui';

function panel(root: HTMLElement, cls: string, title: string, onClose: () => void) {
  const wrap = el('div', `screen ${cls}`);
  const card = el('div', 'panel');
  const head = el('div', 'phead', `<h2 class="fit">${esc(title)}</h2>`);
  const x = el('button', 'iconbtn close', '✕');
  x.setAttribute('aria-label', t('common.close'));
  x.dataset.action = 'close';
  x.addEventListener('click', onClose);
  head.append(x);
  const body = el('div', 'pbody');
  card.append(head, body);
  wrap.append(card);
  root.append(wrap);
  return { wrap, body };
}

export interface MenuState {
  career: number;
  total: number;
  dailyDone: boolean;
}

export type MenuChoice = 'play' | 'garage' | 'book' | 'daily' | 'settings' | 'achievements';

export function mainMenu(root: HTMLElement, s: MenuState) {
  return new Promise<MenuChoice>((res) => {
    const w = el(
      'div',
      'title',
      `<div class="logo3d"><div class="l1">Fix It<br><span>Garage</span></div><div class="l2 fit">${esc(t('menu.tagline'))}</div></div>`,
    );
    const menu = el('div', 'menu');
    const go = (c: MenuChoice) => {
      w.remove();
      res(c);
    };
    const next = s.career <= s.total ? t('menu.jobOf', { n: s.career, total: s.total }) : t('menu.freeplay', { n: s.career });
    const play = el('button', 'btn big play', `${icons.play.replace('<svg', '<svg width="28" height="28"')}<span class="col"><span class="fit">${esc(t(s.career > 1 ? 'menu.continue' : 'menu.play'))}</span><small class="fit">${esc(next)}</small></span>`);
    play.dataset.action = 'play';
    play.addEventListener('click', () => go('play'));
    menu.append(play);
    const grid = el('div', 'menu-grid');
    const items: [MenuChoice, string, string, string][] = [
      ['garage', icons.garage, t('menu.garage'), 'teal'],
      ['book', icons.book, t('menu.book'), 'teal'],
      ['daily', icons.calendar, t('menu.daily') + (s.dailyDone ? ' ✓' : ''), 'teal'],
      ['settings', icons.gear, t('menu.settings'), 'teal'],
    ];
    for (const [c, ic, label, cls] of items) {
      const b = el('button', `btn ${cls} mbtn`, `<span class="mic">${ic}</span><span class="fit">${esc(label)}</span>`);
      b.dataset.action = c;
      b.addEventListener('click', () => go(c));
      grid.append(b);
    }
    menu.append(grid);
    const ach = el('button', 'iconbtn trophy', icons.trophy);
    ach.dataset.action = 'achievements';
    ach.setAttribute('aria-label', t('menu.achievements'));
    ach.addEventListener('click', () => go('achievements'));
    w.append(menu, ach);
    root.append(w);
  });
}

export interface SettingsHooks {
  settings: SaveData['settings'];
  lang: Lang;
  onMusic: (on: boolean) => void;
  onSfx: (on: boolean) => void;
  onLang: (l: Lang | null) => void;
  onReset: () => void;
}

export function settingsScreen(root: HTMLElement, h: SettingsHooks) {
  return new Promise<void>((res) => {
    const render = () => {
      root.querySelector('.screen.settings')?.remove();
      const { wrap, body } = panel(root, 'settings', t('settings.title'), () => (wrap.remove(), res()));
      const toggle = (label: string, on: boolean, act: string, f: (v: boolean) => void) => {
        const r = el('div', 'srow', `<span class="fit">${esc(label)}</span>`);
        const b = el('button', `switch${on ? ' on' : ''}`, `<span>${esc(t(on ? 'common.on' : 'common.off'))}</span>`);
        b.dataset.action = act;
        b.addEventListener('click', () => {
          f(!on);
          render();
        });
        r.append(b);
        body.append(r);
      };
      toggle(t('settings.music'), h.settings.music, 'music', (v) => h.onMusic(v));
      toggle(t('settings.sfx'), h.settings.sfx, 'sfx', (v) => h.onSfx(v));
      body.append(el('h4', 'fit', esc(t('settings.language'))));
      const langs = el('div', 'langs');
      const auto = el('button', `lang${h.settings.lang === null ? ' on' : ''}`, esc(t('settings.auto')));
      auto.dataset.lang = 'auto';
      auto.addEventListener('click', () => {
        h.onLang(null);
        render();
      });
      langs.append(auto);
      for (const l of LANGS) {
        const b = el('button', `lang${h.settings.lang === l ? ' on' : ''}`, esc(LANG_NAMES[l]));
        b.dataset.lang = l;
        b.lang = l;
        b.addEventListener('click', () => {
          h.onLang(l);
          render();
        });
        langs.append(b);
      }
      body.append(langs);
      const reset = el('button', 'btn ghost danger', esc(t('settings.reset')));
      reset.dataset.action = 'reset';
      reset.addEventListener('click', async () => {
        if (await confirm(root, t('settings.resetConfirm'), t('settings.resetYes'))) {
          h.onReset();
          render();
        }
      });
      body.append(reset);
    };
    render();
  });
}

export function confirm(root: HTMLElement, text: string, yes: string) {
  return new Promise<boolean>((res) => {
    const shade = el('div', 'shade top');
    const card = el('div', 'dialog', `<p>${esc(text)}</p>`);
    const row = el('div', 'row');
    const no = el('button', 'btn ghost', esc(t('common.cancel')));
    const ok = el('button', 'btn danger-btn', esc(yes));
    ok.dataset.action = 'confirm';
    const done = (v: boolean) => {
      shade.remove();
      card.remove();
      res(v);
    };
    no.addEventListener('click', () => done(false));
    ok.addEventListener('click', () => done(true));
    row.append(no, ok);
    card.append(row);
    root.append(shade, card);
  });
}

/** one short line before the first rewarded ad of the session: watch or skip */
export function adNotice(root: HTMLElement, label: string) {
  return new Promise<boolean>((res) => {
    const shade = el('div', 'shade top');
    const card = el('div', 'dialog', `<div class="adicon">${icons.tv}</div><p>${esc(t('ad.notice'))}</p>`);
    const row = el('div', 'row');
    const no = el('button', 'btn ghost', esc(t('common.cancel')));
    const ok = el('button', 'btn ad', `${icons.tv.replace('<svg', '<svg width="26" height="26"')}<span class="fit">${esc(label)}</span>`);
    ok.dataset.action = 'watch';
    const done = (v: boolean) => {
      shade.remove();
      card.remove();
      res(v);
    };
    no.addEventListener('click', () => done(false));
    ok.addEventListener('click', () => done(true));
    row.append(no, ok);
    card.append(row);
    root.append(shade, card);
  });
}

export type PauseChoice = 'resume' | 'settings' | 'menu';
export function pauseScreen(root: HTMLElement) {
  return new Promise<PauseChoice>((res) => {
    const { wrap, body } = panel(root, 'pause', t('pause.title'), () => (wrap.remove(), res('resume')));
    for (const [c, cls] of [
      ['resume', 'green big'],
      ['settings', 'teal'],
      ['menu', 'ghost'],
    ] as [PauseChoice, string][]) {
      const b = el('button', `btn ${cls} wide`, esc(t(`pause.${c}`)));
      b.dataset.action = c;
      b.addEventListener('click', () => {
        wrap.remove();
        res(c);
      });
      body.append(b);
    }
  });
}

export function garageScreen(root: HTMLElement, save: SaveData, buy: (u: UpgradeId) => boolean) {
  return new Promise<void>((res) => {
    const render = () => {
      root.querySelector('.screen.garage')?.remove();
      const { wrap, body } = panel(root, 'garage', t('garage.title'), () => (wrap.remove(), res()));
      body.append(el('p', 'pdesc', esc(t('garage.desc'))));
      const list = el('div', 'cards');
      for (const u of UPGRADE_IDS) {
        const have = owns(save, u);
        const c = el('div', `ucard${have ? ' owned' : ''}`, `<div class="uic">${icons[upIcon(u)]}</div><div class="ut"><div class="un fit">${esc(t(`upgrade.${u}.name`))}</div><div class="ud">${esc(t(`upgrade.${u}.desc`))}</div></div>`);
        const b = el('button', `btn ${have ? 'ghost' : 'green'} small`, esc(have ? t('garage.owned') : t('garage.buy', { price: UPGRADES[u].price })));
        b.dataset.upgrade = u;
        if (have) b.setAttribute('disabled', '');
        else if (save.money < UPGRADES[u].price) b.classList.add('poor');
        b.addEventListener('click', () => {
          if (buy(u)) render();
        });
        c.append(b);
        list.append(c);
      }
      body.append(list, el('h4', 'fit', esc(t('garage.cars'))));
      const cars = el('div', 'cars');
      for (const c of CAR_TYPES) {
        const open = CARS[c].unlock <= save.career;
        cars.append(el('div', `carchip${open ? '' : ' locked'}`, `<span class="fit">${esc(t(`car.${c}`))}</span><small class="fit">${open ? '✓' : esc(t('garage.carLocked', { n: CARS[c].unlock }))}</small>`));
      }
      body.append(cars);
    };
    render();
  });
}

function upIcon(u: UpgradeId): keyof typeof icons {
  return ({ gauge: 'gauge', exhaust: 'exhaust', wrench: 'wrench', delivery: 'oil', lift2: 'lift', booth: 'paint', plants: 'garage', neon: 'bulb', lounge: 'star' } as const)[u] as keyof typeof icons;
}

export function bookScreen(root: HTMLElement, save: SaveData) {
  return new Promise<void>((res) => {
    const { wrap, body } = panel(root, 'book', t('book.title'), () => (wrap.remove(), res()));
    body.append(el('p', 'pdesc', esc(t('book.desc')) + ' ' + esc(t('book.count', { n: save.book.filter((f) => f !== 'scratch').length, total: INFERABLE_IDS.length }))));
    const list = el('div', 'cards');
    for (const f of INFERABLE_IDS) {
      const known = save.book.includes(f);
      const part = FAULTS[f].part;
      list.append(
        el(
          'div',
          `bcard${known ? '' : ' locked'}`,
          known
            ? `<div class="uic">${icons[part as keyof typeof icons] ?? icons.wrench}</div><div class="ut"><div class="un fit">${esc(t(`fault.${f}.name`))}</div><div class="ud">“${esc(t(`fault.${f}.symptom`))}”</div><div class="ud tip">${esc(t(`fault.${f}.book`))}</div></div>`
            : `<div class="uic">${icons.lock}</div><div class="ut"><div class="un">???</div><div class="ud fit">${esc(t('book.locked'))}</div></div>`,
        ),
      );
    }
    body.append(list);
  });
}

export function dailyScreen(root: HTMLElement, done: boolean, carName: string) {
  return new Promise<boolean>((res) => {
    const { wrap, body } = panel(root, 'daily', t('daily.title'), () => (wrap.remove(), res(false)));
    body.append(el('div', 'dailyic', icons.calendar), el('p', 'pdesc center', esc(t('daily.desc'))));
    if (done) body.append(el('p', 'center done', esc(t('daily.done'))));
    else {
      body.append(el('p', 'center', esc(carName)));
      const b = el('button', 'btn green big wide', esc(t('daily.play')));
      b.dataset.action = 'daily-start';
      b.addEventListener('click', () => {
        wrap.remove();
        res(true);
      });
      body.append(b);
    }
  });
}

export function achievementsScreen(root: HTMLElement, save: SaveData) {
  return new Promise<void>((res) => {
    const { wrap, body } = panel(root, 'achievements', t('ach.title'), () => (wrap.remove(), res()));
    const list = el('div', 'cards');
    for (const id of Object.keys(ACHIEVEMENTS) as AchievementId[]) {
      const got = save.ach.includes(id);
      const goal = ACHIEVEMENTS[id].goal;
      const p = Math.min(goal, achProgress(save, id));
      list.append(
        el(
          'div',
          `acard${got ? ' got' : ''}`,
          `<div class="uic">${got ? icons.trophy : icons.lock}</div><div class="ut"><div class="un fit">${esc(t(`ach.${id}.name`))}</div><div class="ud">${esc(t(`ach.${id}.desc`))}</div><div class="bar"><i style="width:${(p / goal) * 100}%"></i></div></div><div class="cnt">${p}/${goal}</div>`,
        ),
      );
    }
    body.append(list);
  });
}

/** a tutorial bubble with a skip button; returns a function that removes it */
export function tutorialBubble(root: HTMLElement, html: string, onSkip: () => void) {
  root.querySelector('.tut')?.remove();
  root.classList.add('tut-on');
  const b = el('div', 'tut', `<div class="ttxt">${html}</div>`);
  const skip = el('button', 'skip fit', esc(t('tut.skip')));
  skip.dataset.action = 'skip-tutorial';
  skip.addEventListener('click', () => {
    b.remove();
    root.classList.remove('tut-on');
    onSkip();
  });
  b.append(skip);
  root.append(b);
  return () => {
    b.remove();
    root.classList.remove('tut-on');
  };
}

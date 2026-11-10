/**
 * Translations: one JSON file per language, English is the reference (every other file must have all its keys,
 * checked in CI by scripts/check-i18n.mjs). `t(key, params)` with `{name}` placeholders; missing keys fall back to
 * English.
 */
import en from './en.json';
import fr from './fr.json';
import de from './de.json';
import it from './it.json';
import es from './es.json';
import pt from './pt.json';
import nl from './nl.json';
import pl from './pl.json';
import tr from './tr.json';
import ru from './ru.json';

export const LANGS = ['en', 'fr', 'de', 'it', 'es', 'pt', 'nl', 'pl', 'tr', 'ru'] as const;
export type Lang = (typeof LANGS)[number];
/** language names in their own language (never translated) */
export const LANG_NAMES: Record<Lang, string> = {
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  es: 'Español',
  pt: 'Português',
  nl: 'Nederlands',
  pl: 'Polski',
  tr: 'Türkçe',
  ru: 'Русский',
};

type Table = Record<string, string>;
const TABLES: Record<Lang, Table> = { en, fr, de, it, es, pt, nl, pl, tr, ru };

let lang: Lang = 'en';
const listeners = new Set<(l: Lang) => void>();

/** map any locale ("pt-BR", "de_DE", "RU") to a supported language, or null */
export function normalize(locale: string | null | undefined): Lang | null {
  if (!locale) return null;
  const base = locale.toLowerCase().replace('_', '-').split('-')[0];
  return (LANGS as readonly string[]).includes(base) ? (base as Lang) : null;
}

/** first supported language among the candidates, else English */
export function pickLang(...candidates: (string | null | undefined)[]): Lang {
  for (const c of candidates) {
    const l = normalize(c);
    if (l) return l;
  }
  return 'en';
}

export function getLang() {
  return lang;
}

export function setLang(l: Lang) {
  lang = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  for (const f of listeners) f(l);
}

export function onLang(f: (l: Lang) => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

export function has(key: string) {
  return key in TABLES.en;
}

export function t(key: string, params?: Record<string, string | number>): string {
  let s = TABLES[lang][key] ?? TABLES.en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** escape a value for innerHTML (prompts use a little markup: <b>) */
export function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

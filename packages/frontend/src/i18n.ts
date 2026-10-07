// Language selection and string lookup for the glasses and the phone page.
//
// Resolution order (preference "auto"):
//   1. the Even app's device locale, if the bridge reports one
//   2. navigator.languages / navigator.language (the phone WebView)
//   3. English
// Each candidate is snapped to the 8 languages Even Hub allows; anything
// else (pt, nl, …) falls through to the next candidate. A manual choice in
// Settings is saved in localStorage and always wins.
import { DIRECTIONS, LANGS, LOOKING_AT, STRINGS, type Lang, type StringKey } from './i18n-strings';

export { LANGS, type Lang, type StringKey };

export type LangPreference = Lang | 'auto';

const PREF_KEY = 'wondereye-lang';

/** Native names for the language picker. */
export const LANGUAGE_NAMES: Record<Lang, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  zh: '中文（简体）',
  ja: '日本語',
  ko: '한국어',
};

/** BCP 47 locale for Intl APIs and the <html lang> attribute. */
const INTL_LOCALES: Record<Lang, string> = {
  en: 'en', de: 'de', fr: 'fr', es: 'es', it: 'it', zh: 'zh-CN', ja: 'ja', ko: 'ko',
};

/** Snap a locale tag ("ja-JP", "zh_Hant_TW", "de") to a supported language, or null. */
export function snapLocale(tag: unknown): Lang | null {
  if (typeof tag !== 'string') return null;
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
  return (LANGS as readonly string[]).includes(primary) ? (primary as Lang) : null;
}

let deviceLocale: string | null = null;
let current: Lang = 'en';
const listeners = new Set<(lang: Lang) => void>();

function readPreference(): LangPreference {
  try {
    const v = localStorage.getItem(PREF_KEY);
    if (v && (v === 'auto' || snapLocale(v) === v)) return v as LangPreference;
  } catch { /* storage unavailable */ }
  return 'auto';
}

function navigatorLocales(): string[] {
  if (typeof navigator === 'undefined') return [];
  const list = Array.isArray(navigator.languages) ? [...navigator.languages] : [];
  if (navigator.language) list.push(navigator.language);
  return list;
}

/** The language "auto" resolves to right now. */
export function autoLang(): Lang {
  for (const tag of [deviceLocale, ...navigatorLocales()]) {
    const lang = snapLocale(tag);
    if (lang) return lang;
  }
  return 'en';
}

function resolve(): Lang {
  const pref = readPreference();
  return pref === 'auto' ? autoLang() : pref;
}

function apply(next: Lang): void {
  const changed = next !== current;
  current = next;
  if (typeof document !== 'undefined') document.documentElement.lang = INTL_LOCALES[next];
  if (changed) listeners.forEach((fn) => fn(next));
}

export function getLang(): Lang {
  return current;
}

export function getLangPreference(): LangPreference {
  return readPreference();
}

export function setLangPreference(pref: LangPreference): void {
  try { localStorage.setItem(PREF_KEY, pref); } catch { /* ignore */ }
  apply(resolve());
}

export function onLangChange(fn: (lang: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function intlLocale(lang: Lang = current): string {
  return INTL_LOCALES[lang];
}

/** Look up a string and fill {placeholders}. Falls back to English. */
export function t(key: StringKey, params?: Record<string, string | number>): string {
  let s = STRINGS[current][key] ?? STRINGS.en[key];
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Localized 8-point compass label for a bearing in degrees. */
export function directionLabel(bearing: number): string {
  const idx = Math.round(((bearing % 360) + 360) % 360 / 45) % 8;
  return DIRECTIONS[current][idx];
}

const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** True when a voice query means "what am I looking at?" (English always counts). */
export function isLookingAtPhrase(query: string): boolean {
  const q = stripAccents(query.toLowerCase()).replace(/[\u2019]/g, "'");
  const phrases = current === 'en' ? LOOKING_AT.en : [...LOOKING_AT.en, ...LOOKING_AT[current]];
  return phrases.some((p) => q.includes(p));
}

/**
 * Find a locale in a raw bridge payload. The SDK 0.0.14 DeviceInfo type has
 * no locale field, but the Even Hub FAQ says getDeviceInfo().locale is the
 * way to localize, so look for it (and a few likely spellings) defensively.
 */
export function findLocaleField(raw: unknown, depth = 0): string | null {
  if (typeof raw === 'string' && raw.trim().startsWith('{')) {
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  if (!raw || typeof raw !== 'object' || depth > 2) return null;
  const obj = raw as Record<string, unknown>;
  for (const key of ['locale', 'language', 'lang', 'languageCode', 'systemLanguage', 'appLanguage']) {
    if (typeof obj[key] === 'string' && obj[key]) return obj[key] as string;
  }
  for (const key of ['data', 'deviceInfo', 'info', 'status']) {
    const found = findLocaleField(obj[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

type BridgeLike = {
  getDeviceInfo?: () => Promise<unknown>;
  callEvenApp?: (method: string, params?: unknown) => Promise<unknown>;
};

/**
 * Ask the Even app for its locale (best effort, ~1 s cap) and re-resolve.
 * Returns the raw value found, if any, for logging.
 */
export async function detectDeviceLocale(bridge: BridgeLike): Promise<string | null> {
  let found: string | null = null;
  try {
    const info = await withTimeout(Promise.resolve(bridge.getDeviceInfo?.()), 600);
    found = findLocaleField(info) ?? findLocaleField((info as { toJson?: () => unknown })?.toJson?.());
  } catch { /* not available */ }
  if (!found && bridge.callEvenApp) {
    try {
      // Raw host payload behind getDeviceInfo(); unknown fields survive here.
      found = findLocaleField(await withTimeout(bridge.callEvenApp('getGlassesInfo'), 400));
    } catch { /* not available */ }
  }
  deviceLocale = found;
  apply(resolve());
  return found;
}

// Resolve synchronously at load so the phone page and first glasses frame
// already use the stored or WebView language.
apply(resolve());

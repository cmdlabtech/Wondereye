/**
 * Output language for Grok-written landmark text. English is the default and
 * the only language written to the public map; every other language is
 * glasses-only and cached under its own keys.
 */
export const SUPPORTED_LANGS = ['en', 'de', 'fr', 'es', 'it', 'zh', 'ja', 'ko'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

const LANGUAGE_NAMES: Record<Lang, string> = {
  en: 'English',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  zh: 'Simplified Chinese (简体中文)',
  ja: 'Japanese',
  ko: 'Korean',
};

/** Whitelist a client-supplied language; anything unknown falls back to English. */
export function parseLang(value: unknown): Lang {
  if (typeof value !== 'string') return 'en';
  const primary = value.trim().toLowerCase().split(/[-_]/)[0];
  return (SUPPORTED_LANGS as readonly string[]).includes(primary) ? (primary as Lang) : 'en';
}

export function languageName(lang: Lang): string {
  return LANGUAGE_NAMES[lang];
}

/**
 * Length budgets per script, in characters. One glasses reading page is about
 * 7 lines of 566 px: ~340 Latin characters, ~155 CJK characters (20 px each),
 * or ~200 Hangul characters (18 px each, with spaces between words).
 */
export interface LengthBudget {
  snippetTarget: number;
  snippetMax: number;
  detailTarget: number;
  detailCap: number;
}

const LATIN: LengthBudget = { snippetTarget: 320, snippetMax: 340, detailTarget: 800, detailCap: 900 };
const CJK: LengthBudget = { snippetTarget: 140, snippetMax: 155, detailTarget: 350, detailCap: 400 };
const HANGUL: LengthBudget = { snippetTarget: 180, snippetMax: 200, detailTarget: 450, detailCap: 520 };

export function lengthBudget(lang: Lang): LengthBudget {
  if (lang === 'zh' || lang === 'ja') return CJK;
  if (lang === 'ko') return HANGUL;
  return LATIN;
}

/** Extra snippet instructions for a non-English language ('' for English). */
export function snippetLanguageInstruction(lang: Lang): string {
  if (lang === 'en') return '';
  const name = languageName(lang);
  return `
Language: write every "snippet" in ${name}. The example above is English; use the same plain, factual style in natural ${name}, not a word-for-word translation.
- Keep the "name" field exactly as the candidate name="..." value. Never translate or rewrite it.
- Inside the snippet, write proper names of places, people, and institutions in their local or official form. Add the established ${name} name only when one is in wide use.
- All accuracy rules above apply unchanged. The descriptions are your own words from your own knowledge: do not translate or copy any source text, and never use Wikipedia text.
- Use normal ${name} punctuation.`;
}

/** Extra detail (guide) instructions for a non-English language ('' for English). */
export function detailLanguageInstruction(lang: Lang): string {
  if (lang === 'en') return '';
  const name = languageName(lang);
  return ` Write the whole answer in natural ${name}. Keep proper names of places, people, and institutions in their local or official form, adding the established ${name} name only when one is in wide use. Do not translate or copy source text; write in your own words.`;
}

const CACHE_GEN = 'v6';

/** Area cache key. English keys are unchanged from before languages existed. */
export function areaCacheKey(lat: number, lng: number, radius: number, lang: Lang = 'en'): string {
  const scope = lang === 'en' ? CACHE_GEN : `${CACHE_GEN}:${lang}`;
  return `landmarks:${scope}:${lat.toFixed(3)}:${lng.toFixed(3)}:${radius}`;
}

/** Detail cache key. English keys are unchanged from before languages existed. */
export function detailCacheKey(name: string, unitSystem: string, lat?: number, lng?: number, lang: Lang = 'en'): string {
  const scope = lang === 'en' ? CACHE_GEN : `${CACHE_GEN}:${lang}`;
  const slug = slugify(name);
  if (typeof lat === 'number' && typeof lng === 'number') {
    return `detail:${scope}:${slug}:${lat.toFixed(3)}:${lng.toFixed(3)}:${unitSystem}`;
  }
  return `detail:${scope}:${slug}:${unitSystem}`;
}

// Non-Latin names (e.g. CJK) have no a-z0-9 characters, so the ASCII slug
// collapses to empty and distinct names would otherwise collide on the same
// key. Fall back to a short deterministic hash of the full name in that case.
export function slugify(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
  if (slug) return slug;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return `n${(hash >>> 0).toString(36)}`;
}

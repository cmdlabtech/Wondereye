import { describe, expect, it, beforeEach } from 'vitest';
import { STRINGS, DIRECTIONS, LANGS, type StringKey, type Lang } from '../src/i18n-strings';
import {
  snapLocale, findLocaleField, detectDeviceLocale, getLang, setLangPreference,
  t, directionLabel, isLookingAtPhrase, intlLocale,
} from '../src/i18n';
import {
  BORDERED_INNER, CONTENT_INNER, PAGE_LINES, missingGlyphs, paginateByLines, spreadLine, alignRight, textWidth, fitWidth,
} from '../src/text-fit';
import { measureTextWrap } from '@evenrealities/pretext';

// Node has no localStorage; give i18n.ts a tiny in-memory one.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const keys = Object.keys(STRINGS.en) as StringKey[];
const glassesKeys = keys.filter((k) => k.startsWith('g.') || k.startsWith('e.'));
const bytes = (s: string) => new TextEncoder().encode(s).length;

describe('locale snapping', () => {
  it('maps tags to the 8 supported codes', () => {
    expect(snapLocale('ja-JP')).toBe('ja');
    expect(snapLocale('zh_Hant_TW')).toBe('zh');
    expect(snapLocale('DE')).toBe('de');
    expect(snapLocale('ko-KR')).toBe('ko');
    expect(snapLocale('pt-BR')).toBeNull();
    expect(snapLocale('')).toBeNull();
    expect(snapLocale(undefined)).toBeNull();
  });

  it('finds a locale in raw bridge payloads, including nested ones', () => {
    expect(findLocaleField({ locale: 'fr-FR' })).toBe('fr-FR');
    expect(findLocaleField({ data: { systemLanguage: 'ko' } })).toBe('ko');
    expect(findLocaleField(JSON.stringify({ deviceInfo: { language: 'es_ES' } }))).toBe('es_ES');
    expect(findLocaleField({ sn: 'X', model: 'G2' })).toBeNull();
  });

  it('device locale wins over navigator; a saved choice wins over both', async () => {
    store.clear();
    setLangPreference('auto');
    const bridge = { getDeviceInfo: async () => ({ toJson: () => ({ locale: 'ja-JP' }) }) };
    expect(await detectDeviceLocale(bridge as any)).toBe('ja-JP');
    expect(getLang()).toBe('ja');
    setLangPreference('de');
    expect(getLang()).toBe('de');
    setLangPreference('auto');
    expect(getLang()).toBe('ja');
  });

  it('a bridge without a locale leaves navigator/en in charge', async () => {
    const bridge = { getDeviceInfo: async () => ({ sn: '1' }), callEvenApp: async () => ({}) };
    expect(await detectDeviceLocale(bridge as any)).toBeNull();
  });
});

describe('dictionaries', () => {
  beforeEach(() => setLangPreference('en'));

  it.each(LANGS)('%s has every key, non-empty, with the same placeholders', (lang) => {
    for (const k of keys) {
      const s = STRINGS[lang][k];
      expect(s, `${lang} ${k}`).toBeTruthy();
      const ph = (x: string) => (x.match(/\{\w+\}/g) ?? []).sort().join();
      expect(ph(s), `${lang} ${k}`).toBe(ph(STRINGS.en[k]));
    }
    expect(DIRECTIONS[lang]).toHaveLength(8);
  });

  it('t() fills placeholders and intl locale maps zh to zh-CN', () => {
    setLangPreference('es');
    expect(t('e.http', { status: 503 })).toContain('503');
    setLangPreference('zh');
    expect(intlLocale()).toBe('zh-CN');
    expect(directionLabel(0)).toBe(DIRECTIONS.zh[0]);
    setLangPreference('en');
  });

  it('voice "what am I looking at" works in the active language and English', () => {
    setLangPreference('es');
    expect(isLookingAtPhrase('¿Qué estoy mirando?')).toBe(true);
    expect(isLookingAtPhrase('what am I looking at')).toBe(true);
    // A named search must not be mistaken for "this landmark".
    expect(isLookingAtPhrase('háblame del Museo del Prado')).toBe(false);
    setLangPreference('it');
    expect(isLookingAtPhrase('parlami di Colosseo')).toBe(false);
    expect(isLookingAtPhrase('Cosa sto guardando?')).toBe(true);
    setLangPreference('en');
  });
});

describe('glasses font coverage and fit (pretext)', () => {
  it.each(LANGS)('%s: every glasses string has glyphs in the built-in font', (lang) => {
    const all = [...glassesKeys.map((k) => STRINGS[lang][k]), ...DIRECTIONS[lang]].join('');
    expect(missingGlyphs(all.replace(/\n/g, ''))).toEqual([]);
  });

  it.each(LANGS)('%s: footers and headers fit one 566 px line', (lang) => {
    const s = STRINGS[lang];
    const footers = [
      spreadLine(s['g.pleaseWait'], 'Wondereye'),
      spreadLine(s['g.tapRetry'], 'Wondereye'),
      spreadLine(s['g.tapStop'], 'Wondereye'),
      spreadLine(s['g.loadingDetails'], 'Wondereye'),
      spreadLine(s['g.loadMore'], 'Wondereye'),
      spreadLine(s['g.scroll'], 'Wondereye'),
      spreadLine(s['g.listHint'], DIRECTIONS[lang][1]),
      spreadLine(s['g.nearby'], 'Wondereye'),
      alignRight('Wondereye'),
    ];
    for (const f of footers) expect(textWidth(f), `${lang}: ${f}`).toBeLessThanOrEqual(BORDERED_INNER);
    // The left labels must not need truncating (no "..." added).
    for (const k of ['g.pleaseWait', 'g.tapRetry', 'g.tapStop', 'g.loadingDetails', 'g.loadMore', 'g.scroll', 'g.listHint', 'g.nearby'] as const) {
      expect(textWidth(s[k]) + textWidth('Wondereye') + 10, `${lang} ${k}`).toBeLessThanOrEqual(BORDERED_INNER);
    }
  });

  it.each(LANGS)('%s: multi-line glasses messages fit the content area', (lang) => {
    for (const k of glassesKeys) {
      const { lineCount } = measureTextWrap(STRINGS[lang][k], CONTENT_INNER);
      expect(lineCount, `${lang} ${k}`).toBeLessThanOrEqual(PAGE_LINES);
    }
  });
});

describe('pixel pagination', () => {
  const samples: Record<string, string> = {
    en: 'The Royal Palace of Madrid is the official residence of the Spanish royal family. '.repeat(8),
    ja: 'マドリード王宮はスペイン王室の公式の住居です。儀式や国の行事に使われています。'.repeat(8),
    ko: '마드리드 왕궁은 스페인 왕실의 공식 거처입니다. 국가 행사와 의식에 사용됩니다. '.repeat(8),
    zh: '马德里王宫是西班牙王室的官方住所，用于国家典礼和仪式。'.repeat(8),
  };
  it.each(Object.keys(samples))('%s: every page fits 7 lines and the 999-byte text limit', (k) => {
    const pages = paginateByLines(samples[k]);
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages) {
      expect(measureTextWrap(p, CONTENT_INNER).lineCount).toBeLessThanOrEqual(PAGE_LINES);
      expect(bytes(p)).toBeLessThan(999);
    }
    expect(pages.join('').replace(/\s/g, '')).toBe(samples[k].replace(/\s/g, ''));
  });

  it('CJK pages break at 。 rather than mid-sentence', () => {
    const pages = paginateByLines(samples.ja);
    expect(pages[0].endsWith('。')).toBe(true);
  });

  it('long CJK names are truncated by pixels, not characters', () => {
    const name = '東京都庁第一本庁舎展望室南展望台東京都庁第一本庁舎';
    const out = fitWidth(name, 503);
    expect(textWidth(out)).toBeLessThanOrEqual(503);
  });

  it('flags glyphs the font lacks', () => {
    expect(missingGlyphs('กข')).toEqual(['ก', 'ข']);
    expect(missingGlyphs('한국어 日本語 中文')).toEqual([]);
  });
});

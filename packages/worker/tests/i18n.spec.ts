import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/places', () => ({
  findNearbyPOIs: vi.fn(async () => [
    { name: 'Catedral de Santa María', type: 'cathedral', lat: 40.4155, lng: -3.7144, distance: 120 },
    { name: 'Palacio Real', type: 'palace', lat: 40.418, lng: -3.7143, distance: 300 },
  ]),
}));
vi.mock('../src/wikidata', () => ({ fetchWikidataDescriptions: vi.fn(async () => new Map()) }));

import app from '../src/index';
import { cleanSnippet, descriptionRules, DESCRIPTION_RULES } from '../src/grok';
import { areaCacheKey, detailCacheKey, lengthBudget, parseLang, snippetLanguageInstruction } from '../src/lang';

class FakeKV {
  store = new Map<string, string>();
  async get(k: string, type?: string) {
    const v = this.store.get(k);
    if (v == null) return null;
    return type === 'json' ? JSON.parse(v) : v;
  }
  async put(k: string, v: string) { this.store.set(k, v); }
  async list() { return { keys: [], list_complete: true }; }
}

let kv: FakeKV;
let env: Record<string, unknown>;
let pending: Promise<unknown>[];
let grokBodies: any[];
let ipn = 0;

const ctx = () => ({ waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException: () => {} }) as unknown as ExecutionContext;

async function post(path: string, body: unknown) {
  const res = await app.fetch(
    new Request(`https://api.wondereye.app${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': `198.51.100.${++ipn}`, origin: 'https://wondereye.app' },
      body: JSON.stringify(body),
    }),
    env,
    ctx(),
  );
  await Promise.all(pending);
  return res;
}

beforeEach(() => {
  kv = new FakeKV();
  pending = [];
  grokBodies = [];
  env = { ALLOWED_ORIGIN: 'https://wondereye.app', LANDMARKS_CACHE: kv, XAI_API_KEY: 'test' };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const u = String(url);
    if (u === 'https://api.x.ai/v1/chat/completions') {
      grokBodies.push(JSON.parse(String(init.body)));
      const content = JSON.stringify([
        { name: 'Catedral de Santa María', snippet: 'La Catedral de Santa María es el templo principal de la ciudad. Su construcción empezó en el siglo XIX.' },
      ]);
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    }
    if (u === 'https://api.x.ai/v1/responses') {
      grokBodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ output_text: '大聖堂は街の中心にある。十九世紀に建設が始まった。' }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${u}`);
  }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('parseLang', () => {
  it('whitelists the 8 languages and defaults to English', () => {
    expect(parseLang('es')).toBe('es');
    expect(parseLang('ja-JP')).toBe('ja');
    expect(parseLang('zh_Hans_CN')).toBe('zh');
    expect(parseLang('KO')).toBe('ko');
    expect(parseLang('pt')).toBe('en');
    expect(parseLang('<script>')).toBe('en');
    expect(parseLang(undefined)).toBe('en');
    expect(parseLang(42)).toBe('en');
  });
});

describe('cache keys', () => {
  it('leaves English keys unchanged and scopes other languages', () => {
    expect(areaCacheKey(40.4155, -3.7144, 500)).toBe('landmarks:v6:40.416:-3.714:500');
    expect(areaCacheKey(40.4155, -3.7144, 500, 'en')).toBe('landmarks:v6:40.416:-3.714:500');
    expect(areaCacheKey(40.4155, -3.7144, 500, 'ja')).toBe('landmarks:v6:ja:40.416:-3.714:500');
    expect(detailCacheKey('Palacio Real', 'metric', 40.418, -3.7143)).toBe('detail:v6:palacio-real:40.418:-3.714:metric');
    expect(detailCacheKey('Palacio Real', 'metric', 40.418, -3.7143, 'es')).toBe('detail:v6:es:palacio-real:40.418:-3.714:metric');
  });
});

describe('prompts', () => {
  it('keeps the English prompt byte-identical', () => {
    expect(descriptionRules('en')).toBe(DESCRIPTION_RULES);
    expect(snippetLanguageInstruction('en')).toBe('');
    expect(DESCRIPTION_RULES).toContain('about 320 characters and never more than 340');
  });

  it('adds a language block with name, proper-name, and no-Wikipedia rules', () => {
    const rules = descriptionRules('ja');
    expect(rules).toContain('about 140 characters and never more than 155');
    expect(rules).toContain('write every "snippet" in Japanese');
    expect(rules).toContain('Keep the "name" field exactly as the candidate name="..." value');
    expect(rules).toContain('local or official form');
    expect(rules).toContain('never use Wikipedia text');
  });

  it('uses per-script length budgets', () => {
    expect(lengthBudget('de').snippetMax).toBe(340);
    expect(lengthBudget('zh').snippetMax).toBe(155);
    expect(lengthBudget('ko').snippetMax).toBe(200);
  });

  it('caps CJK snippets at a full stop', () => {
    const long = '東京タワーは東京都港区にある電波塔である。'.repeat(12);
    const out = cleanSnippet(long, 155);
    expect(out.length).toBeLessThanOrEqual(156);
    expect(out.endsWith('。')).toBe(true);
  });
});

describe('POST /api/landmarks with lang', () => {
  it('English: unchanged key, writes the public map', async () => {
    const res = await post('/api/landmarks', { lat: 40.4155, lng: -3.7144, radius: 500 });
    expect(res.status).toBe(200);
    expect(kv.store.has('landmarks:v6:40.416:-3.714:500')).toBe(true);
    expect([...kv.store.keys()].some((k) => k.startsWith('mapplace:'))).toBe(true);
    expect([...kv.store.keys()].some((k) => k.startsWith('place:'))).toBe(true);
    expect(grokBodies[0].messages[1].content).not.toContain('Language: write every');
  });

  it('Spanish: own key, Spanish prompt, never writes the public map', async () => {
    const res = await post('/api/landmarks', { lat: 40.4155, lng: -3.7144, radius: 500, lang: 'es' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { landmarks: { name: string; snippet: string }[] };
    expect(body.landmarks[0].name).toBe('Catedral de Santa María');
    expect(kv.store.has('landmarks:v6:es:40.416:-3.714:500')).toBe(true);
    expect(kv.store.has('landmarks:v6:40.416:-3.714:500')).toBe(false);
    expect([...kv.store.keys()].some((k) => k.startsWith('mapplace:') || k.startsWith('place:'))).toBe(false);
    expect(grokBodies[0].messages[1].content).toContain('write every "snippet" in Spanish');
  });

  it('Spanish cache hit never backfills the public map', async () => {
    kv.store.set('landmarks:v6:es:40.416:-3.714:500', JSON.stringify({
      landmarks: [{ name: 'Palacio Real', type: 'palace', lat: 40.418, lng: -3.7143, distance: 300, snippet: 'Texto en español.' }],
    }));
    const res = await post('/api/landmarks', { lat: 40.4155, lng: -3.7144, radius: 500, lang: 'es' });
    expect(res.status).toBe(200);
    expect(grokBodies).toHaveLength(0);
    expect([...kv.store.keys()].some((k) => k.startsWith('mapplace:'))).toBe(false);
  });

  it('unknown lang falls back to English', async () => {
    await post('/api/landmarks', { lat: 40.4155, lng: -3.7144, radius: 500, lang: 'xx' });
    expect(kv.store.has('landmarks:v6:40.416:-3.714:500')).toBe(true);
  });
});

describe('POST /api/landmark-detail with lang', () => {
  it('Japanese: own key and Japanese instruction', async () => {
    const res = await post('/api/landmark-detail', { name: 'Palacio Real', lat: 40.418, lng: -3.7143, units: 'metric', lang: 'ja' });
    expect(((await res.json()) as { detail: string }).detail).toContain('大聖堂');
    expect(kv.store.has('detail:v6:ja:palacio-real:40.418:-3.714:metric')).toBe(true);
    const system = grokBodies[0].input[0].content as string;
    expect(system).toContain('Write the whole answer in natural Japanese');
    expect(system).toContain('Do not use Wikipedia as a source');
    expect(grokBodies[0].input[1].content).toContain('under 350 characters');
  });

  it('English detail prompt and key unchanged', async () => {
    await post('/api/landmark-detail', { name: 'Palacio Real', lat: 40.418, lng: -3.7143, units: 'metric' });
    expect(kv.store.has('detail:v6:palacio-real:40.418:-3.714:metric')).toBe(true);
    expect(grokBodies[0].input[0].content).not.toContain('Write the whole answer');
    expect(grokBodies[0].input[1].content).toContain('under 800 characters');
  });
});

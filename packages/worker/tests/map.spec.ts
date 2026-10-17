import { describe, expect, it } from 'vitest';
import app from '../src/index';

class FakeKV {
  store = new Map<string, string>();
  meta = new Map<string, unknown>();
  async get(k: string, type?: string) {
    const v = this.store.get(k);
    if (v == null) return null;
    return type === 'json' ? JSON.parse(v) : v;
  }
  async put(k: string, v: string) { this.store.set(k, v); }
  async delete(k: string) { this.store.delete(k); }
  async list({ prefix }: { prefix: string }) {
    const keys = [...this.meta.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name, metadata: this.meta.get(name) }));
    return { keys, list_complete: true };
  }
}

function get(kv: FakeKV) {
  const env = { ALLOWED_ORIGIN: 'https://wondereye.app', LANDMARKS_CACHE: kv, XAI_API_KEY: 'unused' };
  const req = new Request('https://api.wondereye.app/api/map', { headers: { origin: 'https://wondereye.app' } });
  return app.fetch(req, env, { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext);
}

describe('GET /api/map caching', () => {
  it('sets a short public cache on a fresh aggregate', async () => {
    const kv = new FakeKV();
    kv.meta.set('mapplace:x:1.000:2.000', { name: 'X', type: 'museum', lat: 1, lng: 2, snippet: 'A note.' });
    const res = await get(kv);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=300, max-age=60');
    const data = (await res.json()) as { landmarks: unknown[] };
    expect(data.landmarks).toHaveLength(1);
  });

  it('sets the same cache header when serving the KV map-cache', async () => {
    const kv = new FakeKV();
    kv.store.set('map-cache', JSON.stringify({ landmarks: [] }));
    const res = await get(kv);
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=300, max-age=60');
  });

  it('returns one Eiffel pin when KV holds the English and French names', async () => {
    const kv = new FakeKV();
    kv.meta.set('mapplace:eiffel-tower:48.858:2.295', {
      name: 'Eiffel Tower', type: 'landmark', lat: 48.85822222, lng: 2.2945, snippet: 'The tower.',
    });
    kv.meta.set('mapplace:tour-eiffel:48.858:2.295', {
      name: 'Tour Eiffel', type: 'monument', lat: 48.8582603, lng: 2.2945008, snippet: 'La tour.',
    });
    kv.meta.set('mapplace:bureau-de-gustave-eiffel:48.858:2.295', {
      name: 'Bureau de Gustave Eiffel', type: 'attraction', lat: 48.8582685, lng: 2.2945812, snippet: 'His office.',
    });
    const res = await get(kv);
    const data = (await res.json()) as { landmarks: { name: string }[] };
    expect(data.landmarks.map((p) => p.name)).toEqual(['Eiffel Tower', 'Bureau de Gustave Eiffel']);
  });

  it('collapses a translated twin that is still sitting in map-cache', async () => {
    const kv = new FakeKV();
    kv.store.set('map-cache', JSON.stringify({
      landmarks: [
        { name: 'Tour Eiffel', type: 'monument', lat: 48.8582603, lng: 2.2945008, snippet: 'La tour.' },
        { name: 'Eiffel Tower', type: 'landmark', lat: 48.85822222, lng: 2.2945, snippet: 'The tower.' },
      ],
    }));
    const res = await get(kv);
    const data = (await res.json()) as { landmarks: { name: string }[] };
    expect(data.landmarks.map((p) => p.name)).toEqual(['Eiffel Tower']);
  });
});

describe('anonymous explorer label', () => {
  it('returns a valid by and drops malformed ones', async () => {
    const kv = new FakeKV();
    kv.meta.set('mapplace:a:1.000:2.000', { name: 'A', type: 'museum', lat: 1, lng: 2, snippet: '', by: 'Explorer #0042', at: '2026-10-17' });
    kv.meta.set('mapplace:b:3.000:4.000', { name: 'B', type: 'museum', lat: 3, lng: 4, snippet: '', by: 'Cameron' });
    kv.meta.set('mapplace:c:5.000:6.000', { name: 'C', type: 'museum', lat: 5, lng: 6, snippet: '' });
    const data = (await (await get(kv)).json()) as { landmarks: any[] };
    const by = Object.fromEntries(data.landmarks.map((l) => [l.name, l.by]));
    expect(by).toEqual({ A: 'Explorer #0042', B: undefined, C: undefined });
  });

  async function post(kv: FakeKV, explorer: unknown) {
    const waits: Promise<unknown>[] = [];
    const env = { ALLOWED_ORIGIN: 'https://wondereye.app', LANDMARKS_CACHE: kv, XAI_API_KEY: 'unused', DEV: 'true' };
    const req = new Request('https://api.wondereye.app/api/landmarks', {
      method: 'POST',
      headers: { origin: 'https://wondereye.app', 'content-type': 'application/json', 'cf-connecting-ip': `10.0.0.${Math.floor(Math.random() * 250)}` },
      body: JSON.stringify({ lat: 10, lng: 20, radius: 500, lang: 'en', explorer }),
    });
    const res = await app.fetch(req, env, { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException: () => {} } as unknown as ExecutionContext);
    await Promise.all(waits);
    return res;
  }


  it('stamps new records only and never overwrites existing ones', async () => {
    const kv = new FakeKV();
    const metaPut = kv.put.bind(kv);
    (kv as any).put = async (k: string, v: string, o?: { metadata?: unknown }) => { await metaPut(k, v); if (o?.metadata) kv.meta.set(k, o.metadata); };
    const landmarks = [
      { name: 'New Place', type: 'museum', lat: 10, lng: 20, snippet: 'n', distance: 0 },
      { name: 'Old Place', type: 'museum', lat: 10.001, lng: 20.001, snippet: 'o', distance: 1 },
    ];
    // Serve the landmark list as a cached area response (backfill path).
    const realGet = kv.get.bind(kv);
    (kv as any).get = async (k: string, t?: string) => (k.startsWith('mapplace:') || k.startsWith('place:') ? realGet(k, t) : t === 'json' ? { landmarks } : JSON.stringify({ landmarks }));
    kv.store.set('mapplace:old-place:10.001:20.001', JSON.stringify({ name: 'Old Place', type: 'museum', lat: 10.001, lng: 20.001, snippet: 'o' }));
    const res = await post(kv, 'Explorer #1234');
    expect(res.status).toBe(200);
    expect(JSON.parse(kv.store.get('mapplace:new-place:10.000:20.000')!)).toMatchObject({ by: 'Explorer #1234', at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(JSON.parse(kv.store.get('mapplace:old-place:10.001:20.001')!).by).toBeUndefined();
  });

  it('ignores a malformed explorer value', async () => {
    const kv = new FakeKV();
    const landmarks = [{ name: 'Fresh', type: 'museum', lat: 10, lng: 20, snippet: 'f', distance: 0 }];
    const realGet = kv.get.bind(kv);
    (kv as any).get = async (k: string, t?: string) => (k.startsWith('mapplace:') ? realGet(k, t) : t === 'json' ? { landmarks } : null);
    await post(kv, 'Explorer #12345<script>');
    const rec = JSON.parse(kv.store.get('mapplace:fresh:10.000:20.000')!);
    expect(rec.by).toBeUndefined();
    expect(rec.at).toBeUndefined();
  });
});

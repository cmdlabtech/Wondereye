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
});

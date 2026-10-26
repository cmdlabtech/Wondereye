import { describe, expect, it } from 'vitest';
import { mergePOIs } from '../src/places';
import { dedupePlaces } from '../src/place-dedupe';
import type { RawPOI } from '../src/types';
import app from '../src/index';
import { areaCacheKey } from '../src/lang';

function poi(name: string, lat: number, lng: number, extra: Partial<RawPOI> = {}): RawPOI {
  return { name, type: extra.type ?? 'landmark', lat, lng, distance: extra.distance ?? 0, ...extra };
}

// Coordinates and names from the live map and from Overpass / Wikipedia geosearch.
const eiffelTower = poi('Eiffel Tower', 48.85822222, 2.2945, {
  type: 'landmark',
  wikidata: 'Q243',
  wikipedia: 'en:Eiffel Tower',
  distance: 20,
});
const tourEiffel = poi('Tour Eiffel', 48.8582603, 2.2945008, {
  type: 'monument',
  architect: 'Gustave Eiffel',
  distance: 16,
});
const gustaveOffice = poi('Bureau de Gustave Eiffel', 48.8582685, 2.2945812, { type: 'attraction', distance: 18 });
const gustaveMemorial = poi('Gustave Eiffel', 48.8587307, 2.2944894, { type: 'memorial', wikidata: 'Q2928782', distance: 40 });
const carousel = poi('Le Carrousel de la Tour Eiffel', 48.8589211, 2.2926215, { type: 'attraction', distance: 150 });

describe('landmark pin dedupe', () => {
  it('collapses Tour Eiffel and Eiffel Tower when only one record has a Wikidata id', () => {
    const merged = mergePOIs([tourEiffel], [eiffelTower]);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('Eiffel Tower');
    expect(merged[0].wikidata).toBe('Q243');
    expect(merged[0].type).toBe('monument');
    expect(merged[0].architect).toBe('Gustave Eiffel');
    expect(merged[0].wikipedia).toBe('en:Eiffel Tower');
  });

  it('collapses the same pair with no Wikidata ids, from translated type words within 50 m', () => {
    const french = poi('Tour Eiffel', 48.8582603, 2.2945008, { type: 'monument' });
    const english = poi('Eiffel Tower', 48.85822222, 2.2945, { type: 'landmark' });
    expect(dedupePlaces([french, english])).toHaveLength(1);
    expect(dedupePlaces([poi('Musée du Louvre', 48.8606, 2.3376, { type: 'museum' }), poi('Louvre Museum', 48.8607, 2.3377, { type: 'landmark' })])).toHaveLength(1);
  });

  it('collapses two records that share a Wikidata id even when the names and distance differ', () => {
    const czech = poi('Katedrála svatého Víta, Václava a Vojtěcha', 50.0908638, 14.4005536, { type: 'cathedral', wikidata: 'Q5949', distance: 80 });
    const english = poi('St. Vitus Cathedral', 50.0944, 14.4006, { wikidata: 'q5949', distance: 400 });
    const [kept] = dedupePlaces([czech, english]);
    expect(kept.wikidata?.toUpperCase()).toBe('Q5949');
    expect(kept.type).toBe('cathedral');
    expect(dedupePlaces([czech, english])).toHaveLength(1);
  });

  it('does not merge records that carry different Wikidata ids', () => {
    const french = { ...tourEiffel, wikidata: 'Q1' };
    const english = { ...eiffelTower, wikidata: 'Q999' };
    expect(dedupePlaces([french, english])).toHaveLength(2);
  });

  it('keeps distinct neighbors of the tower, including ones a few meters away', () => {
    const deck = poi('Tour Eiffel 3e étage', 48.8582648, 2.2944947, { type: 'viewpoint', distance: 17 });
    const names = dedupePlaces([eiffelTower, tourEiffel, gustaveOffice, gustaveMemorial, carousel, deck]).map((p) => p.name);
    expect(names).toEqual([
      'Eiffel Tower',
      'Bureau de Gustave Eiffel',
      'Gustave Eiffel',
      'Le Carrousel de la Tour Eiffel',
      'Tour Eiffel 3e étage',
    ]);
  });

  it('treats a trailing city qualifier as the same name, and an English Wikipedia title as a link', () => {
    expect(dedupePlaces([
      poi("St. Mary's Church", 51.752, -1.257, { type: 'church' }),
      poi("St. Mary's Church, Oxford", 51.7522, -1.2571, { type: 'church' }),
    ])).toHaveLength(1);
    const osm = poi('Tour Eiffel', 48.85826, 2.2945, { type: 'monument', wikipedia: 'en:Eiffel_Tower', distance: 10 });
    const wiki = poi('Eiffel Tower', 48.862, 2.2945, { wikipedia: 'en:Eiffel Tower', distance: 400 });
    const [kept] = mergePOIs([osm], [wiki]);
    expect(kept.name).toBe('Eiffel Tower');
    expect(kept.type).toBe('monument');
  });

  it('does not merge other close places, or the same name far apart', () => {
    expect(dedupePlaces([
      poi('Faneuil Hall Marketplace', 42.3600766, -71.0547394, { type: 'attraction' }),
      poi('Quincy Market', 42.3602163, -71.0547993, { type: 'marketplace' }),
    ])).toHaveLength(2);
    expect(dedupePlaces([
      poi('Christ Church Cathedral', 38.2519383, -85.7534945, { type: 'cathedral' }),
      poi('Christ Church Cathedral', 45.4177225, -75.708141, { type: 'church' }),
    ])).toHaveLength(2);
  });
});

class FakeKV {
  store = new Map<string, string>();
  meta = new Map<string, unknown>();
  async get(k: string, type?: string) {
    const v = this.store.get(k);
    if (v == null) return null;
    return type === 'json' ? JSON.parse(v) : v;
  }
  async put(k: string, v: string) { this.store.set(k, v); }
  async delete(k: string) { this.store.delete(k); this.meta.delete(k); }
  async list({ prefix }: { prefix: string }) {
    const keys = [...this.meta.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name, metadata: this.meta.get(name) }));
    return { keys, list_complete: true };
  }
}

function mapGet(kv: FakeKV) {
  const env = { ALLOWED_ORIGIN: 'https://wondereye.app', LANDMARKS_CACHE: kv, XAI_API_KEY: 'unused' };
  const req = new Request('https://api.wondereye.app/api/map', { headers: { origin: 'https://wondereye.app' } });
  return app.fetch(req, env, { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext);
}

describe('GET /api/map translated pins', () => {
  it('returns one Eiffel Tower pin from stored Tour Eiffel and Eiffel Tower records', async () => {
    const kv = new FakeKV();
    kv.meta.set('mapplace:eiffel-tower:48.858:2.295', {
      name: 'Eiffel Tower', type: 'landmark', lat: 48.85822222, lng: 2.2945,
      snippet: 'The Eiffel Tower is a wrought-iron lattice tower standing on the Champ de Mars in Paris.',
    });
    kv.meta.set('mapplace:tour-eiffel:48.858:2.295', {
      name: 'Tour Eiffel', type: 'monument', lat: 48.8582603, lng: 2.2945008,
      snippet: 'Iron lattice icon piercing the sky.', by: 'Explorer #0042',
    });
    kv.meta.set('mapplace:bureau:48.858:2.295', {
      name: 'Bureau de Gustave Eiffel', type: 'attraction', lat: 48.8582685, lng: 2.2945812, snippet: 'Office.',
    });
    const data = (await (await mapGet(kv)).json()) as { landmarks: { name: string; type: string; by?: string }[] };
    const towerPins = data.landmarks.filter((p) => p.name === 'Eiffel Tower' || p.name === 'Tour Eiffel');
    expect(towerPins).toHaveLength(1);
    expect(towerPins[0].name).toBe('Eiffel Tower');
    expect(towerPins[0].type).toBe('monument');
    expect(towerPins[0].by).toBe('Explorer #0042');
    expect(data.landmarks.map((p) => p.name)).toContain('Bureau de Gustave Eiffel');
  });

  it('folds the same pair when the response is served from map-cache', async () => {
    const kv = new FakeKV();
    kv.store.set('map-cache', JSON.stringify({
      landmarks: [
        { name: 'Tour Eiffel', type: 'monument', lat: 48.8582603, lng: 2.2945008, snippet: 'French pin.' },
        { name: 'Eiffel Tower', type: 'landmark', lat: 48.85822222, lng: 2.2945, snippet: 'English pin.' },
      ],
    }));
    const data = (await (await mapGet(kv)).json()) as { landmarks: { name: string }[] };
    expect(data.landmarks).toHaveLength(1);
    expect(data.landmarks[0].name).toBe('Eiffel Tower');
  });
});

describe('POST /api/landmarks cached list', () => {
  it('returns one Eiffel pin when a cached glasses list stored both names', async () => {
    const kv = new FakeKV();
    kv.store.set(areaCacheKey(48.858, 2.295, 500), JSON.stringify({
      landmarks: [
        { name: 'Tour Eiffel', type: 'monument', lat: 48.8582603, lng: 2.2945008, distance: 16, snippet: 'French pin.', architect: 'Gustave Eiffel' },
        { name: 'Eiffel Tower', type: 'landmark', lat: 48.85822222, lng: 2.2945, distance: 20, snippet: 'English pin.', wikidata: 'Q243', wikipedia: 'en:Eiffel Tower' },
        { name: 'Bureau de Gustave Eiffel', type: 'attraction', lat: 48.8582685, lng: 2.2945812, distance: 18, snippet: 'Office.' },
      ],
    }));
    const env = { ALLOWED_ORIGIN: 'https://wondereye.app', LANDMARKS_CACHE: kv, XAI_API_KEY: 'unused', DEV: 'true' };
    const req = new Request('https://api.wondereye.app/api/landmarks', {
      method: 'POST',
      headers: { origin: 'https://wondereye.app', 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.20' },
      body: JSON.stringify({ lat: 48.8584, lng: 2.2945, radius: 500, lang: 'en' }),
    });
    const res = await app.fetch(req, env, { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext);
    const data = (await res.json()) as { landmarks: { name: string; type: string; wikidata?: string; architect?: string }[] };
    expect(res.status).toBe(200);
    expect(data.landmarks.map((p) => p.name)).toEqual(['Eiffel Tower', 'Bureau de Gustave Eiffel']);
    expect(data.landmarks[0].type).toBe('monument');
    expect(data.landmarks[0].wikidata).toBe('Q243');
    expect(data.landmarks[0].architect).toBe('Gustave Eiffel');
  });
});

/**
 * One-off cleanup for landmark pins already stored in KV.
 *
 * The live map can hold two keys for one landmark ("Eiffel Tower" and
 * "Tour Eiffel") because those records were written before translated names
 * were folded together. This script prints the keys to delete. It does not
 * write unless --apply is set, and this change does not run --apply.
 *
 * Dry-run against a saved GET /api/map body (no Cloudflare writes):
 *   cd packages/worker
 *   npx vite-node scripts/cleanup-duplicate-map-places.ts --input map.json
 *   npx vite-node scripts/cleanup-duplicate-map-places.ts --input map.json --wikidata
 *
 * --wikidata also collapses full translations that share one nearby Wikidata
 * item (St. Vitus Cathedral / Katedrála svatého Víta…). That calls
 * wikidata.org. It still does not write KV.
 *
 * --apply deletes the duplicate mapplace keys and the map-cache entry.
 * Refused unless WONDEREYE_KV_APPLY=yes and --namespace-id are both set.
 * Do not point --namespace-id at production unless you mean to delete those
 * keys. Prefer a dry-run first and read the printed list.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { USER_AGENT } from '../src/geo';
import { distanceMeters, isSamePlace, type PlaceIdentity } from '../src/place-dedupe';
import { planDuplicateCleanup, type QidHit } from '../src/map-cleanup';

interface StoredPlace extends PlaceIdentity {
  name: string;
  lat: number;
  lng: number;
  type?: string;
  snippet?: string;
}

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function loadPlaces(path: string): StoredPlace[] {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { landmarks?: StoredPlace[] } | StoredPlace[];
  const list = Array.isArray(parsed) ? parsed : parsed.landmarks;
  if (!Array.isArray(list)) throw new Error(`${path} has no landmarks array`);
  return list.filter((place) => place && typeof place.name === 'string' && Number.isFinite(place.lat) && Number.isFinite(place.lng));
}

async function wikiGet(params: Record<string, string>): Promise<any> {
  const url = `${WIKIDATA_API}?${new URLSearchParams({ ...params, format: 'json' })}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Wikidata ${res.status}`);
  return res.json();
}

function hitNames(hit: any): string[] {
  const names: string[] = [];
  if (typeof hit?.label === 'string') names.push(hit.label);
  if (typeof hit?.match?.text === 'string') names.push(hit.match.text);
  if (Array.isArray(hit?.aliases)) {
    for (const alias of hit.aliases) {
      if (typeof alias === 'string') names.push(alias);
    }
  }
  return names;
}

async function searchPlace(name: string): Promise<QidHit[]> {
  const data = await wikiGet({
    action: 'wbsearchentities',
    search: name,
    language: 'en',
    type: 'item',
    limit: '8',
  });
  const hits: QidHit[] = [];
  for (const hit of data?.search ?? []) {
    if (typeof hit?.id !== 'string') continue;
    hits.push({ id: hit.id, names: hitNames(hit) });
  }
  return hits;
}

function coordinateOf(entity: any): { lat: number; lng: number } | undefined {
  const value = entity?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
  if (!value || typeof value.latitude !== 'number' || typeof value.longitude !== 'number') return undefined;
  return { lat: value.latitude, lng: value.longitude };
}

async function attachCoordinates(hits: QidHit[]): Promise<void> {
  const ids = [...new Set(hits.map((hit) => hit.id))];
  const coords = new Map<string, { lat: number; lng: number }>();
  for (let i = 0; i < ids.length; i += 50) {
    const data = await wikiGet({
      action: 'wbgetentities',
      ids: ids.slice(i, i + 50).join('|'),
      props: 'claims',
    });
    for (const [id, entity] of Object.entries<any>(data?.entities ?? {})) {
      const coord = coordinateOf(entity);
      if (coord) coords.set(id, coord);
    }
  }
  for (const hit of hits) {
    const coord = coords.get(hit.id);
    if (!coord) continue;
    hit.lat = coord.lat;
    hit.lng = coord.lng;
  }
}

/** Names that sit within 50 m of a different pin and are not already the same place. */
function namesWorthResolving(places: StoredPlace[]): string[] {
  const names = new Set<string>();
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      if (distanceMeters(places[i].lat, places[i].lng, places[j].lat, places[j].lng) > 50) continue;
      if (isSamePlace(places[i], places[j])) continue;
      names.add(places[i].name);
      names.add(places[j].name);
    }
  }
  return [...names];
}

async function resolveHits(places: StoredPlace[]): Promise<Map<string, QidHit[]>> {
  const out = new Map<string, QidHit[]>();
  const all: QidHit[] = [];
  for (const name of namesWorthResolving(places)) {
    const queries = [name];
    const stripped = name.replace(/\s*\([^)]*\)\s*$/, '').replace(/,\s*\S+$/, '').trim();
    if (stripped && stripped !== name) queries.push(stripped);
    const hits: QidHit[] = [];
    for (const query of queries) {
      try {
        hits.push(...await searchPlace(query));
      } catch (err) {
        console.warn(`[cleanup] search failed for ${query}:`, err instanceof Error ? err.message : String(err));
      }
    }
    out.set(name, hits);
    all.push(...hits);
  }
  try {
    await attachCoordinates(all);
  } catch (err) {
    console.warn('[cleanup] coordinates unavailable:', err instanceof Error ? err.message : String(err));
  }
  return out;
}

function applyDeletes(namespaceId: string, keys: string[]): void {
  if (process.env.WONDEREYE_KV_APPLY !== 'yes') {
    throw new Error('Refusing to write KV. Set WONDEREYE_KV_APPLY=yes to delete keys. Dry-run is the default.');
  }
  if (!namespaceId || namespaceId === 'YOUR_KV_NAMESPACE_ID') {
    throw new Error('Pass a real --namespace-id. Refusing the placeholder.');
  }
  for (const key of keys) {
    const result = spawnSync(
      'npx',
      ['wrangler', 'kv', 'key', 'delete', key, `--namespace-id=${namespaceId}`, '--remote'],
      { stdio: 'inherit' },
    );
    if (result.status !== 0) throw new Error(`Failed to delete ${key}`);
  }
}

async function main(): Promise<void> {
  if (hasFlag('--help') || process.argv.length <= 2) {
    console.log('Usage: npx vite-node scripts/cleanup-duplicate-map-places.ts --input map.json [--wikidata] [--apply --namespace-id ID]');
    console.log('Dry-run is the default. --apply deletes keys and is refused without WONDEREYE_KV_APPLY=yes.');
    return;
  }
  const input = arg('--input');
  if (!input) throw new Error('Pass --input path/to/map.json (a saved /api/map body).');
  const places = loadPlaces(input);
  const hits = hasFlag('--wikidata') ? await resolveHits(places) : undefined;
  const groups = planDuplicateCleanup(places, hits ? (name) => hits.get(name) ?? [] : undefined);
  const dropKeys = [...new Set(groups.flatMap((group) => group.dropKeys))];
  console.log(JSON.stringify({
    places: places.length,
    groups: groups.map((group) => ({
      keep: group.survivor.name,
      survivorKey: group.survivorKey,
      drop: group.drop.map((place) => place.name),
      dropKeys: group.dropKeys,
    })),
    deleteKeys: dropKeys.length ? [...dropKeys, 'map-cache'] : [],
  }, null, 2));
  if (!hasFlag('--apply')) {
    console.log('Dry-run only. No KV writes.');
    return;
  }
  if (dropKeys.length === 0) {
    console.log('Nothing to delete.');
    return;
  }
  applyDeletes(arg('--namespace-id') ?? '', [...dropKeys, 'map-cache']);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

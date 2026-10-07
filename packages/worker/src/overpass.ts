import { RawPOI } from './types';
import { haversineDistance, USER_AGENT } from './geo';

// Healthy instances answer in 1–4 s. Anything slower is almost always an
// overloaded server that will end in a 504/timeout anyway.
const ENDPOINT_TIMEOUT_MS = 6_000;

export interface OverpassOptions {
  /** Epoch ms after which no new attempt is started and in-flight ones are cut short. */
  deadline?: number;
  /** Aborts the whole lookup (e.g. once the caller has settled on other results). */
  signal?: AbortSignal;
}

/**
 * Query public Overpass instances ONE AT A TIME until one answers.
 * Resolves with the (possibly empty) POI list from the first instance that
 * answers; rejects if every instance fails or the deadline passes.
 */
export async function queryOverpass(
  lat: number,
  lng: number,
  radius: number,
  options: OverpassOptions = {}
): Promise<RawPOI[]> {
  // [timeout:10]: the server-side budget also sets scheduling priority on
  // overpass-api.de, and we never wait longer than ENDPOINT_TIMEOUT_MS anyway.
  const query = `
    [out:json][timeout:10];
    (
      nwr["name"]["tourism"~"museum|attraction|viewpoint|artwork|gallery"](around:${radius},${lat},${lng});
      nwr["name"]["historic"~"monument|memorial|castle|archaeological_site"](around:${radius},${lat},${lng});
      nwr["name"]["amenity"~"place_of_worship|theatre|library"](around:${radius},${lat},${lng});
      nwr["name"]["building"~"cathedral|church|mosque|synagogue|temple"](around:${radius},${lat},${lng});
    );
    out center body qt;
  `;

  // Planet-wide public instances, tried ONE AT A TIME. The overpass-api.de
  // usage policy forbids fanning a query out to several servers in parallel
  // ("do NOT work around that rule by distributing load over multiple
  // servers"), and parallel fan-out is a fast way to get banned.
  // overpass.kumi.systems is a CNAME of overpass.private.coffee (same box),
  // so listing both only doubled load on one server.
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ];
  // Regional mirror with Switzerland-only data — useless (200 + 0 elements)
  // anywhere else, so only consult it for Swiss coordinates.
  if (isInSwitzerland(lat, lng)) endpoints.push('https://overpass.osm.ch/api/interpreter');

  const body = `data=${encodeURIComponent(query)}`;
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    // Overpass instances require an identifying UA per OSM usage policy
    // (overpass-api.de returns 406 without one)
    'User-Agent': USER_AGENT,
  };

  let elements: any[] | null = null;
  for (const endpoint of endpoints) {
    if (options.signal?.aborted) break;
    const remaining = options.deadline ? options.deadline - Date.now() : ENDPOINT_TIMEOUT_MS;
    if (remaining < 500) break; // not enough time left for a useful attempt
    const signals = [AbortSignal.timeout(Math.min(ENDPOINT_TIMEOUT_MS, remaining))];
    if (options.signal) signals.push(options.signal);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body,
        headers,
        signal: AbortSignal.any(signals),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const parsed: any = await response.json();
      if (!parsed || !Array.isArray(parsed.elements)) throw new Error('unexpected body');
      elements = parsed.elements;
      break;
    } catch (err) {
      if (options.signal?.aborted) break;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[overpass] ${endpoint} failed: ${msg}`);
    }
  }

  if (!elements) {
    throw new Error(options.signal?.aborted ? 'Overpass lookup cancelled' : 'Overpass API error: all instances failed');
  }

  const seen = new Set<string>();
  const pois: RawPOI[] = [];

  for (const element of elements) {
    const name = element.tags?.name;
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const elLat = element.lat ?? element.center?.lat;
    const elLng = element.lon ?? element.center?.lon;
    if (!elLat || !elLng) continue;

    // Prefer specific building types (cathedral, church, etc.) over generic tourism=attraction
    const specificBuilding = ['cathedral', 'church', 'mosque', 'synagogue', 'temple'].includes(element.tags.building)
      ? element.tags.building : null;
    const type = specificBuilding || element.tags.amenity || element.tags.historic || element.tags.tourism || 'landmark';

    const distance = haversineDistance(lat, lng, elLat, elLng);
    const tags = element.tags as Record<string, string> | undefined;

    pois.push({
      name,
      type,
      lat: elLat,
      lng: elLng,
      distance: Math.round(distance),
      ...(optionalTag(tags, 'wikipedia', 150, 'wikipedia')),
      ...(optionalTag(tags, 'wikidata', 40, 'wikidata')),
      ...(optionalTag(tags, 'description:en', 240, 'description')
        ?? optionalTag(tags, 'description', 240, 'description')),
      ...(optionalTag(tags, 'start_date', 40, 'startDate')),
      ...(optionalTag(tags, 'architect', 80, 'architect')
        ?? optionalTag(tags, 'artist_name', 80, 'architect')),
      ...(optionalTag(tags, 'addr:city', 80, 'city')
        ?? optionalTag(tags, 'addr:suburb', 80, 'city')
        ?? optionalTag(tags, 'is_in:city', 80, 'city')),
    });
  }

  return pois.sort((a, b) => a.distance - b.distance).slice(0, 20);
}

function optionalTag(
  tags: Record<string, string> | undefined,
  osmKey: string,
  max: number,
  field: string,
): Record<string, string> | undefined {
  const value = tags?.[osmKey]?.trim();
  if (!value) return undefined;
  return { [field]: value.slice(0, max) };
}

// Rough bounding box for Switzerland (overpass.osm.ch only holds Swiss data).
function isInSwitzerland(lat: number, lng: number): boolean {
  return lat >= 45.8 && lat <= 47.9 && lng >= 5.9 && lng <= 10.6;
}

import { RawPOI } from './types';
import { haversineDistance, USER_AGENT } from './geo';

const GEOSEARCH_TIMEOUT_MS = 5_000;
const MAX_RESULTS = 20;

// Titles that geotag to a point but are not something to look at.
const WIKI_SKIP = /^(area codes?|list of|postal code|zip code|\d{4,5}\b)|\b(school district|township|census|metropolitan area|county)\b/i;

/**
 * Wikipedia GeoSearch (en): free, fast, and not rate-limited like public
 * Overpass. Articles with coordinates are by definition "notable", which
 * suits landmark discovery. Used for DISCOVERY ONLY: names, coordinates,
 * article title and Wikidata id (for dedupe against OSM and for the Wikidata
 * hint lookup in wikidata.ts). No article text or enwiki short description
 * is fetched; every description comes from Grok.
 */
export async function queryWikipediaGeosearch(
  lat: number,
  lng: number,
  radius: number,
  signal?: AbortSignal
): Promise<RawPOI[]> {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'geosearch',
    ggscoord: `${lat}|${lng}`,
    ggsradius: String(Math.min(10_000, Math.max(10, Math.round(radius)))),
    ggslimit: String(MAX_RESULTS),
    prop: 'coordinates|pageprops',
    ppprop: 'wikibase_item',
    colimit: 'max',
    codistancefrompoint: `${lat}|${lng}`,
    format: 'json',
    formatversion: '2',
  });
  const signals = [AbortSignal.timeout(GEOSEARCH_TIMEOUT_MS)];
  if (signal) signals.push(signal);
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT },
    signal: AbortSignal.any(signals),
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const data: any = await res.json();
  if (data?.error) throw new Error(`api error ${data.error.code ?? ''}`.trim());
  const pages: any[] = Array.isArray(data?.query?.pages) ? data.query.pages : [];
  const pois: RawPOI[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    const title = typeof page?.title === 'string' ? page.title.trim() : '';
    if (!title || seen.has(title) || WIKI_SKIP.test(title)) continue;
    const coord = Array.isArray(page.coordinates) ? page.coordinates[0] : undefined;
    if (!Number.isFinite(coord?.lat) || !Number.isFinite(coord?.lon)) continue;
    seen.add(title);
    const wikidata = typeof page.pageprops?.wikibase_item === 'string' ? page.pageprops.wikibase_item : undefined;
    pois.push({
      name: title,
      type: 'landmark',
      lat: coord.lat,
      lng: coord.lon,
      distance: Math.round(Number.isFinite(coord.dist) ? coord.dist : haversineDistance(lat, lng, coord.lat, coord.lon)),
      wikipedia: `en:${title}`.slice(0, 150),
      ...(wikidata ? { wikidata } : {}),
    });
  }
  return pois.sort((a, b) => a.distance - b.distance).slice(0, MAX_RESULTS);
}

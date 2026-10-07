import { RawPOI } from './types';
import { haversineDistance } from './geo';
import { queryOverpass } from './overpass';
import { queryWikipediaGeosearch } from './wikipedia';
import { fetchWikidataDescriptions } from './wikidata';

// Hard ceiling for the whole POI lookup. Grok snippet generation follows, so
// this plus SNIPPET_TIMEOUT_MS must stay well inside the app's 30 s timeout.
const LOOKUP_BUDGET_MS = 8_000;
// If Wikipedia already has results, keep waiting for Overpass (richer OSM
// tags) only until this point after the start. Healthy Overpass answers in
// 1–4 s; a hung one must not hold up a good Wikipedia answer.
const OVERPASS_PREFERRED_MS = 4_500;
// If Overpass answers first, give the (normally sub-second) Wikipedia call
// this much longer so notable articles still get merged in.
const WIKIPEDIA_GRACE_MS = 1_500;
const MAX_CANDIDATES = 30;

type Outcome = { ok: true; pois: RawPOI[] } | { ok: false; error: string };

function settle(p: Promise<RawPOI[]>): Promise<Outcome> {
  return p.then(
    (pois) => ({ ok: true as const, pois }),
    (err) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) })
  );
}

/** Resolves with the outcome, or undefined if `ms` elapses first. */
function within(p: Promise<Outcome>, ms: number): Promise<Outcome | undefined> {
  if (ms <= 0) return Promise.race([p, Promise.resolve(undefined)]);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

const hasResults = (o: Outcome | undefined): o is { ok: true; pois: RawPOI[] } => !!o && o.ok && o.pois.length > 0;

/**
 * Nearby landmark candidates from two co-primary sources, raced and merged:
 * Wikipedia GeoSearch and public Overpass (instances tried one at a time).
 * Public Overpass is overloaded and has been answering Workers with
 * 521/504/timeouts, which surfaced as HTTP 502; Wikipedia keeps the app
 * working when that happens, and Overpass results are merged in whenever
 * they arrive in time.
 *
 * Resolves [] only when a source actually answered and nothing is nearby;
 * rejects when no source produced an answer.
 */
export async function findNearbyPOIs(lat: number, lng: number, radius: number): Promise<RawPOI[]> {
  const started = Date.now();
  const deadline = started + LOOKUP_BUDGET_MS;
  const controller = new AbortController();

  const wiki = settle(queryWikipediaGeosearch(lat, lng, radius, controller.signal));
  const osm = settle(queryOverpass(lat, lng, radius, { deadline, signal: controller.signal }));

  let wikiOut: Outcome | undefined;
  let osmOut: Outcome | undefined;

  const first = await Promise.race([
    wiki.then((o) => ({ source: 'wikipedia' as const, o })),
    osm.then((o) => ({ source: 'overpass' as const, o })),
  ]);

  if (first.source === 'wikipedia') {
    wikiOut = first.o;
    // Good Wikipedia answer: wait for Overpass only within its preferred
    // window. Otherwise Overpass is all we have — give it the full budget.
    const until = hasResults(wikiOut) ? started + OVERPASS_PREFERRED_MS : deadline;
    osmOut = await within(osm, until - Date.now());
  } else {
    osmOut = first.o;
    const until = hasResults(osmOut) ? Math.min(deadline, Date.now() + WIKIPEDIA_GRACE_MS) : deadline;
    wikiOut = await within(wiki, until - Date.now());
  }
  controller.abort(); // cancel whatever is still in flight

  const elapsed = Date.now() - started;
  const describe = (o: Outcome | undefined) => (!o ? 'no answer in time' : o.ok ? `${o.pois.length} POIs` : `failed (${o.error})`);
  console.log(`[places] ${elapsed} ms — overpass: ${describe(osmOut)}; wikipedia: ${describe(wikiOut)}`);

  const osmPois = osmOut?.ok ? osmOut.pois : [];
  const wikiPois = wikiOut?.ok ? wikiOut.pois : [];
  if (osmPois.length === 0 && wikiPois.length === 0) {
    // Overpass is the broader source, so its genuine "nothing here" is
    // trusted; an empty Wikipedia answer alone is not proof of that.
    if (osmOut?.ok) return [];
    throw new Error(`No usable landmark source (overpass: ${describe(osmOut)}; wikipedia: ${describe(wikiOut)})`);
  }
  const merged = mergePOIs(osmPois, wikiPois);
  await addWikidataHints(merged);
  return merged;
}

/**
 * Fill `hint` (English Wikidata short description) for every candidate
 * with a Wikidata id. One request, 1.5 s cap, failure tolerant; skipped
 * when no candidate has an id.
 */
async function addWikidataHints(pois: RawPOI[]): Promise<void> {
  const missing = pois.filter((p) => p.wikidata && !p.hint);
  if (missing.length === 0) return;
  const t0 = Date.now();
  const hints = await fetchWikidataDescriptions(missing.map((p) => p.wikidata!));
  for (const p of missing) {
    const hint = hints.get(p.wikidata!.toUpperCase());
    if (hint) p.hint = hint;
  }
  console.log(`[places] wikidata hints: ${hints.size}/${missing.length} in ${Date.now() - t0} ms`);
}

/** Loose name key: case/diacritics/punctuation-insensitive, no trailing "(…)" or leading "The". */
function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/^the\s+/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function wikiTitleKey(tag: string | undefined): string | undefined {
  if (!tag) return undefined;
  const m = tag.match(/^en:(.+)$/i);
  return m ? nameKey(m[1].replace(/_/g, ' ')) : undefined;
}

function isSamePlace(osm: RawPOI, wiki: RawPOI): boolean {
  // Same Wikidata item: "Tour Eiffel" (OSM, fr tag) and "Eiffel Tower" (en article) are Q243.
  if (osm.wikidata && wiki.wikidata && osm.wikidata.toUpperCase() === wiki.wikidata.toUpperCase()) return true;
  const wikiKey = nameKey(wiki.name);
  if (wikiTitleKey(osm.wikipedia) === wikiKey) return true;
  const osmKey = nameKey(osm.name);
  if (!osmKey || !wikiKey) return false;
  const meters = haversineDistance(osm.lat, osm.lng, wiki.lat, wiki.lng);
  if (osmKey === wikiKey) return meters <= 1_000;
  // "St. Mary's Church" vs "St. Mary's Church, Oxford" etc.
  const contains = osmKey.length >= 4 && wikiKey.length >= 4 && (osmKey.includes(wikiKey) || wikiKey.includes(osmKey));
  return contains && meters <= 250;
}

/**
 * Overpass entries win (they carry type, dates, architect…); Wikipedia adds
 * notable places OSM missed and lends its English article title and Wikidata
 * id (identifiers only, never text) to matching OSM entries (matched by
 * Wikidata id, English title, or name plus proximity).
 */
export function mergePOIs(osmPois: RawPOI[], wikiPois: RawPOI[]): RawPOI[] {
  const merged = osmPois.map((p) => ({ ...p }));
  for (const w of wikiPois) {
    const match = merged.find((p) => isSamePlace(p, w));
    if (match) {
      // Prefer the English title as the identifier Grok sees.
      if (w.wikipedia && (!match.wikipedia || !/^en:/i.test(match.wikipedia))) match.wikipedia = w.wikipedia;
      if (!match.wikidata && w.wikidata) match.wikidata = w.wikidata;
      continue;
    }
    merged.push(w);
  }
  return merged.sort((a, b) => a.distance - b.distance).slice(0, MAX_CANDIDATES);
}

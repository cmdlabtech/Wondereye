import { RawPOI } from './types';
import { queryOverpass } from './overpass';
import { queryWikipediaGeosearch } from './wikipedia';
import { fetchWikidataDescriptions } from './wikidata';
import { dedupePlaces } from './place-dedupe';

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

/**
 * Overpass entries carry type, dates, and architect. Wikipedia adds notable
 * places OSM missed. Records of one landmark collapse to one pin: a shared
 * Wikidata id wins, including across languages; otherwise the names must
 * match (a translated type word counts) and the pins must be close together.
 * The kept record prefers the Wikidata id and the English name, and keeps
 * the more specific type and facts.
 */
export function mergePOIs(osmPois: RawPOI[], wikiPois: RawPOI[]): RawPOI[] {
  return dedupePlaces([...osmPois, ...wikiPois])
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_CANDIDATES);
}

/**
 * Identity for one landmark pin. Wikidata id wins when both records have one.
 * Otherwise two records are the same place only when they sit within
 * TRANSLATED_NAME_METERS and their names match, including a translated
 * type word ("Tour Eiffel" / "Eiffel Tower"). Distinct neighbors stay apart.
 */
export interface PlaceIdentity {
  name: string;
  lat: number;
  lng: number;
  wikidata?: string;
  wikipedia?: string;
  type?: string;
  distance?: number;
  snippet?: string;
  description?: string;
  startDate?: string;
  architect?: string;
  city?: string;
  hint?: string;
}

/** Labels and aliases keyed by upper-case Wikidata id (Q243). */
export type AliasIndex = ReadonlyMap<string, readonly string[]>;

/** About 50 m: close enough for two pins of one landmark, not the next one. */
export const TRANSLATED_NAME_METERS = 50;

const QID = /^Q\d+$/;
const GENERIC_TYPES = new Set(['', 'landmark', 'yes']);

const ARTICLES = new Set([
  'a', 'an', 'the', 'le', 'la', 'les', 'l', 'de', 'du', 'des', 'd',
  'di', 'del', 'della', 'dei', 'degli', 'der', 'die', 'das', 'den', 'dem',
  'el', 'los', 'las', 'het', 'een', 'van', 'von', 'of', 'y', 'e', 'und', 'et',
  'da', 'do', 'dos', 'i', 'il', 'al', 'aux', 'au', 'un', 'une', 'and', 'ng', 'mga',
]);

/** Foreign or variant type words mapped to one English token. Proper names stay as-is. */
const TYPE_WORDS: Readonly<Record<string, string>> = {
  tower: 'tower', tour: 'tower', torre: 'tower', turm: 'tower', toren: 'tower', torn: 'tower',
  museum: 'museum', musee: 'museum', museo: 'museum', museu: 'museum',
  church: 'church', eglise: 'church', iglesia: 'church', kirche: 'church', chiesa: 'church', igreja: 'church', kerk: 'church', kirke: 'church',
  cathedral: 'cathedral', cathedrale: 'cathedral', catedral: 'cathedral', kathedrale: 'cathedral', duomo: 'cathedral', katedrala: 'cathedral', katedral: 'cathedral',
  bridge: 'bridge', pont: 'bridge', puente: 'bridge', brucke: 'bridge', ponte: 'bridge', brug: 'bridge', bro: 'bridge',
  palace: 'palace', palais: 'palace', palacio: 'palace', palazzo: 'palace', palast: 'palace', palac: 'palace',
  castle: 'castle', chateau: 'castle', castillo: 'castle', castello: 'castle', schloss: 'castle', hrad: 'castle',
  square: 'square', platz: 'square', piazza: 'square', plaza: 'square', plein: 'square',
  park: 'park', parc: 'park', parque: 'park',
  garden: 'garden', jardin: 'garden', garten: 'garden', giardino: 'garden',
  chapel: 'chapel', chapelle: 'chapel', capilla: 'chapel', cappella: 'chapel', kapelle: 'chapel',
  abbey: 'abbey', abbaye: 'abbey', abadia: 'abbey', abtei: 'abbey',
  basilica: 'basilica', basilique: 'basilica', basilika: 'basilica', bazilika: 'basilica',
  temple: 'temple', templo: 'temple', tempel: 'temple', tempio: 'temple',
  mosque: 'mosque', mosquee: 'mosque', mezquita: 'mosque', moschee: 'mosque',
  synagogue: 'synagogue', synagoge: 'synagogue', sinagoga: 'synagogue',
  library: 'library', bibliotheque: 'library', biblioteca: 'library', bibliothek: 'library',
  theatre: 'theatre', theater: 'theatre', teatro: 'theatre',
  gallery: 'gallery', galerie: 'gallery', galeria: 'gallery',
  monument: 'monument', monumento: 'monument', denkmal: 'monument',
  statue: 'statue', estatua: 'statue', statua: 'statue',
  fountain: 'fountain', fontaine: 'fountain', fuente: 'fountain', fontana: 'fountain', brunnen: 'fountain',
  market: 'market', marche: 'market', mercado: 'market', markt: 'market',
  gate: 'gate', porte: 'gate', puerta: 'gate', poort: 'gate',
  house: 'house', maison: 'house', casa: 'house', haus: 'house',
  fort: 'fort', forte: 'fort', festung: 'fort',
  cemetery: 'cemetery', cimetiere: 'cemetery', cementerio: 'cemetery', friedhof: 'cemetery',
  saint: 'saint', st: 'saint', ste: 'saint', sainte: 'saint', san: 'saint', santa: 'saint', santo: 'saint', sankt: 'saint', sao: 'saint', svateho: 'saint', sv: 'saint',
  mary: 'mary', marie: 'mary', maria: 'mary',
};

const ENGLISH_TYPE_WORDS = new Set(
  Object.entries(TYPE_WORDS).filter(([word, canon]) => word === canon).map(([word]) => word),
);
const FOREIGN_TYPE_WORDS = new Set(
  Object.entries(TYPE_WORDS).filter(([word, canon]) => word !== canon).map(([word]) => word),
);

export interface PlaceCluster<T extends PlaceIdentity> {
  survivor: T;
  members: T[];
}

/** Case, diacritics, and punctuation insensitive, for exact title comparison. */
export function looseNameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/^the\s+/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Drop a trailing "(disambiguator)" or a single-word ", City" suffix. */
export function stripPlaceQualifiers(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').replace(/,\s*\S+$/, '').trim();
}

export function foldName(name: string): string {
  return looseNameKey(stripPlaceQualifiers(name));
}

function rawTokens(name: string): string[] {
  const folded = looseNameKey(stripPlaceQualifiers(name));
  if (!folded) return [];
  const tokens: string[] = [];
  for (const token of folded.split(' ')) {
    if (token.length <= 1 || ARTICLES.has(token)) continue;
    tokens.push(token);
  }
  return tokens;
}

/** Order-insensitive name key with translated type words folded together. */
export function canonicalNameKey(name: string): string {
  return rawTokens(name).map((token) => TYPE_WORDS[token] ?? token).sort().join(' ');
}

export function normalizeQid(value: string | undefined): string | undefined {
  const id = value?.trim().toUpperCase();
  return id && QID.test(id) ? id : undefined;
}

/** Sphere distance in meters. Same radius as geo.ts. */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earth = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function englishBias(name: string): number {
  let score = 0;
  for (const token of rawTokens(name)) {
    if (ENGLISH_TYPE_WORDS.has(token)) score += 1;
    else if (FOREIGN_TYPE_WORDS.has(token)) score -= 1;
  }
  return score;
}

function wikiTitle(tag: string | undefined): string | undefined {
  if (!tag) return undefined;
  const match = tag.match(/^[a-z]{2,3}(?:-[a-z]+)?:(.+)$/i);
  return match ? match[1].replace(/_/g, ' ') : undefined;
}

function wikipediaLinks(a: PlaceIdentity, b: PlaceIdentity): boolean {
  const left = wikiTitle(a.wikipedia);
  const right = wikiTitle(b.wikipedia);
  if (left && looseNameKey(left) === looseNameKey(b.name)) return true;
  if (right && looseNameKey(right) === looseNameKey(a.name)) return true;
  return false;
}

function aliasHit(qid: string | undefined, otherName: string, aliases: AliasIndex | undefined): boolean {
  if (!qid || !aliases) return false;
  const wanted = canonicalNameKey(otherName);
  if (!wanted) return false;
  const names = aliases.get(qid);
  if (!names) return false;
  return names.some((name) => canonicalNameKey(name) === wanted);
}

export function isSamePlace(a: PlaceIdentity, b: PlaceIdentity, aliases?: AliasIndex): boolean {
  const qa = normalizeQid(a.wikidata);
  const qb = normalizeQid(b.wikidata);
  if (qa && qb) return qa === qb;
  if (wikipediaLinks(a, b)) return true;
  if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng) || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return false;
  if (distanceMeters(a.lat, a.lng, b.lat, b.lng) > TRANSLATED_NAME_METERS) return false;
  const left = canonicalNameKey(a.name);
  const right = canonicalNameKey(b.name);
  if (left && left === right) return true;
  return aliasHit(qa, b.name, aliases) || aliasHit(qb, a.name, aliases);
}

function isGenericType(type: string | undefined): boolean {
  return !type || GENERIC_TYPES.has(type);
}

function shouldPrefer(candidate: PlaceIdentity, incumbent: PlaceIdentity): boolean {
  const candidateQ = normalizeQid(candidate.wikidata);
  const incumbentQ = normalizeQid(incumbent.wikidata);
  if (candidateQ && !incumbentQ) return true;
  if (incumbentQ && !candidateQ) return false;
  return englishBias(candidate.name) > englishBias(incumbent.name);
}

function copyIfBlank<T extends PlaceIdentity, K extends keyof PlaceIdentity>(keep: T, fill: PlaceIdentity, key: K): void {
  const current = keep[key];
  const next = fill[key];
  if ((typeof current !== 'string' || !current.trim()) && typeof next === 'string' && next.trim()) {
    keep[key] = next as T[K];
  }
}

/** Keep the Wikidata-backed record, then the English name, and fill empty fields from the other. */
export function mergePlaceRecords<T extends PlaceIdentity>(current: T, incoming: T): T {
  const preferIncoming = shouldPrefer(incoming, current);
  const keep = (preferIncoming ? { ...incoming } : { ...current }) as T;
  const fill = preferIncoming ? current : incoming;
  if (!normalizeQid(keep.wikidata) && normalizeQid(fill.wikidata)) keep.wikidata = fill.wikidata;
  copyIfBlank(keep, fill, 'wikipedia');
  if (fill.wikipedia && /^en:/i.test(fill.wikipedia) && (!keep.wikipedia || !/^en:/i.test(keep.wikipedia))) {
    keep.wikipedia = fill.wikipedia;
  }
  if (isGenericType(keep.type) && !isGenericType(fill.type)) keep.type = fill.type;
  if (typeof fill.distance === 'number' && (typeof keep.distance !== 'number' || fill.distance < keep.distance)) {
    keep.distance = fill.distance;
  }
  copyIfBlank(keep, fill, 'snippet');
  copyIfBlank(keep, fill, 'description');
  copyIfBlank(keep, fill, 'startDate');
  copyIfBlank(keep, fill, 'architect');
  copyIfBlank(keep, fill, 'city');
  copyIfBlank(keep, fill, 'hint');
  return keep;
}

export function clusterPlaces<T extends PlaceIdentity>(places: T[], aliases?: AliasIndex): PlaceCluster<T>[] {
  const clusters: { survivor: T; anchor: PlaceIdentity; members: T[] }[] = [];
  for (const place of places) {
    const cluster = clusters.find((group) => isSamePlace(group.anchor, place, aliases));
    if (!cluster) {
      clusters.push({
        survivor: { ...place },
        anchor: { name: place.name, lat: place.lat, lng: place.lng, wikidata: place.wikidata, wikipedia: place.wikipedia },
        members: [place],
      });
      continue;
    }
    cluster.members.push(place);
    cluster.survivor = mergePlaceRecords(cluster.survivor, place);
    if (!normalizeQid(cluster.anchor.wikidata) && normalizeQid(cluster.survivor.wikidata)) {
      cluster.anchor.wikidata = cluster.survivor.wikidata;
    }
    if (!cluster.anchor.wikipedia && cluster.survivor.wikipedia) cluster.anchor.wikipedia = cluster.survivor.wikipedia;
  }
  return clusters.map(({ survivor, members }) => ({ survivor, members }));
}

export function dedupePlaces<T extends PlaceIdentity>(places: T[], aliases?: AliasIndex): T[] {
  return clusterPlaces(places, aliases).map((cluster) => cluster.survivor);
}

/** Fold clusters whose survivors `same` says are one landmark. `same` must be symmetric. */
export function mergeClusters<T extends PlaceIdentity>(
  clusters: PlaceCluster<T>[],
  same: (a: T, b: T) => boolean,
): PlaceCluster<T>[] {
  const groups = clusters.map((cluster) => ({ survivor: cluster.survivor, members: [...cluster.members] }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        if (!same(groups[i].survivor, groups[j].survivor)) continue;
        groups[i].members.push(...groups[j].members);
        groups[i].survivor = mergePlaceRecords(groups[i].survivor, groups[j].survivor);
        groups.splice(j, 1);
        changed = true;
        break;
      }
      if (changed) break;
    }
  }
  return groups;
}

import { haversineDistance } from './geo';

/**
 * One landmark pin. Two records are the same place when they share a Wikidata
 * id, or when neither id conflicts and the names match after normalization.
 * A translated type word counts as the same name only within about 50 m
 * ("Tour Eiffel" / "Eiffel Tower"). Different Wikidata ids never merge.
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
  by?: string;
  at?: string;
}

/** Close enough for two labels of one landmark, not the next building. */
export const TRANSLATED_NAME_METERS = 50;
/** Same normalized name, including a single trailing city qualifier. */
const SAME_NAME_METERS = 1_000;
const QUALIFIED_NAME_METERS = 250;

const QID = /^Q\d+$/;
const GENERIC_TYPES = new Set(['', 'landmark', 'yes']);

const ARTICLES = new Set([
  'a', 'an', 'the', 'le', 'la', 'les', 'l', 'de', 'du', 'des', 'd',
  'di', 'del', 'della', 'dei', 'degli', 'der', 'die', 'das', 'den', 'dem',
  'el', 'los', 'las', 'het', 'een', 'van', 'von', 'of', 'y', 'e', 'und', 'et',
  'da', 'do', 'dos', 'i', 'il', 'al', 'aux', 'au', 'un', 'une', 'and',
]);

/**
 * Type words that are the same place-kind in another language. Proper names
 * are left unchanged, so this never treats one landmark as a special case.
 */
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

/** Case, diacritics, and punctuation insensitive, with a trailing "(…)" and leading "The" removed. */
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

function rawTokens(name: string): string[] {
  const folded = looseNameKey(name.replace(/,\s*\S+$/, ''));
  if (!folded) return [];
  const tokens: string[] = [];
  for (const token of folded.split(' ')) {
    if (token.length <= 1 || ARTICLES.has(token)) continue;
    tokens.push(token);
  }
  return tokens;
}

/** Order-insensitive name key. Translated type words fold to one token. */
export function canonicalNameKey(name: string): string {
  return rawTokens(name).map((token) => TYPE_WORDS[token] ?? token).sort().join(' ');
}

export function normalizeQid(value: string | undefined): string | undefined {
  const id = value?.trim().toUpperCase();
  return id && QID.test(id) ? id : undefined;
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

function finitePoint(place: PlaceIdentity): boolean {
  return Number.isFinite(place.lat) && Number.isFinite(place.lng);
}

export function isSamePlace(a: PlaceIdentity, b: PlaceIdentity): boolean {
  const qa = normalizeQid(a.wikidata);
  const qb = normalizeQid(b.wikidata);
  if (qa && qb) return qa === qb;
  if (wikipediaLinks(a, b)) return true;
  if (!finitePoint(a) || !finitePoint(b)) return false;
  const meters = haversineDistance(a.lat, a.lng, b.lat, b.lng);
  const left = looseNameKey(a.name);
  const right = looseNameKey(b.name);
  if (left && left === right && meters <= SAME_NAME_METERS) return true;
  const qualifiedLeft = looseNameKey(a.name.replace(/,\s*\S+$/, ''));
  const qualifiedRight = looseNameKey(b.name.replace(/,\s*\S+$/, ''));
  if (qualifiedLeft && qualifiedLeft === qualifiedRight && meters <= QUALIFIED_NAME_METERS) return true;
  const canonicalLeft = canonicalNameKey(a.name);
  const canonicalRight = canonicalNameKey(b.name);
  return !!canonicalLeft && canonicalLeft === canonicalRight && meters <= TRANSLATED_NAME_METERS;
}

function isGenericType(type: string | undefined): boolean {
  return !type || GENERIC_TYPES.has(type);
}

function englishBias(name: string): number {
  let score = 0;
  for (const token of rawTokens(name)) {
    if (ENGLISH_TYPE_WORDS.has(token)) score += 1;
    else if (FOREIGN_TYPE_WORDS.has(token)) score -= 1;
  }
  return score;
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

/** Keep the Wikidata-backed record, then the English name, and fill empty facts from the other. */
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
  if ((fill.snippet?.trim().length ?? 0) > (keep.snippet?.trim().length ?? 0)) keep.snippet = fill.snippet;
  copyIfBlank(keep, fill, 'description');
  copyIfBlank(keep, fill, 'startDate');
  copyIfBlank(keep, fill, 'architect');
  copyIfBlank(keep, fill, 'city');
  copyIfBlank(keep, fill, 'hint');
  copyIfBlank(keep, fill, 'by');
  copyIfBlank(keep, fill, 'at');
  return keep;
}

/** Collapse records of one landmark. Order follows the first record of each group. */
export function dedupePlaces<T extends PlaceIdentity>(places: readonly T[]): T[] {
  const clusters: { survivor: T; anchor: PlaceIdentity }[] = [];
  for (const place of places) {
    const cluster = clusters.find((group) => isSamePlace(group.anchor, place));
    if (!cluster) {
      clusters.push({
        survivor: { ...place },
        anchor: {
          name: place.name,
          lat: place.lat,
          lng: place.lng,
          wikidata: place.wikidata,
          wikipedia: place.wikipedia,
        },
      });
      continue;
    }
    cluster.survivor = mergePlaceRecords(cluster.survivor, place);
    if (!normalizeQid(cluster.anchor.wikidata) && normalizeQid(cluster.survivor.wikidata)) {
      cluster.anchor.wikidata = cluster.survivor.wikidata;
    }
    if (!cluster.anchor.wikipedia && cluster.survivor.wikipedia) cluster.anchor.wikipedia = cluster.survivor.wikipedia;
  }
  return clusters.map((group) => group.survivor);
}

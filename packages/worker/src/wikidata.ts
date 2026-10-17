import { USER_AGENT } from './geo';

const WIKIDATA_TIMEOUT_MS = 1_500;
const MAX_IDS = 50; // wbgetentities limit per request
const HINT_MAX = 120;
const QID = /^Q\d+$/;

/** Normalize a Wikidata short description for use as a disambiguation hint. */
export function cleanHint(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, HINT_MAX);
  return text || undefined;
}

/**
 * English Wikidata short descriptions ("historic train station in Carmel,
 * Indiana") for the given item ids, in ONE request. Used only as a hint so
 * Grok knows which place is meant; never shown to users or copied. Failure
 * tolerant: any error or timeout returns what is known (usually nothing).
 */
export async function fetchWikidataDescriptions(ids: string[], signal?: AbortSignal): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids.map((id) => id.trim().toUpperCase()).filter((id) => QID.test(id)))].slice(0, MAX_IDS);
  if (unique.length === 0) return out;
  const params = new URLSearchParams({
    action: 'wbgetentities',
    ids: unique.join('|'),
    props: 'descriptions',
    languages: 'en',
    format: 'json',
  });
  const signals = [AbortSignal.timeout(WIKIDATA_TIMEOUT_MS)];
  if (signal) signals.push(signal);
  try {
    const res = await fetch(`https://www.wikidata.org/w/api.php?${params}`, {
      headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT },
      signal: AbortSignal.any(signals),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data: any = await res.json();
    for (const [id, entity] of Object.entries<any>(data?.entities ?? {})) {
      const hint = cleanHint(entity?.descriptions?.en?.value);
      if (hint) out.set(id.toUpperCase(), hint);
    }
  } catch (err) {
    console.warn('[wikidata] descriptions unavailable:', err instanceof Error ? err.message : String(err));
  }
  return out;
}

export interface WikidataInfo {
  hints: Map<string, string>;
  /** Labels and aliases, keyed by upper-case QID, used to merge a translated neighbor. */
  names: Map<string, string[]>;
}

const NAME_LANGS = 'en|fr|de|es|it|pt|cs|nl|pl|zh|ja|ko';

function entityNames(entity: any): string[] {
  const names: string[] = [];
  for (const label of Object.values<any>(entity?.labels ?? {})) {
    if (typeof label?.value === 'string' && label.value.trim()) names.push(label.value);
  }
  for (const list of Object.values<any>(entity?.aliases ?? {})) {
    if (!Array.isArray(list)) continue;
    for (const alias of list) {
      if (typeof alias?.value === 'string' && alias.value.trim()) names.push(alias.value);
    }
  }
  return names;
}

/**
 * English descriptions plus labels and aliases, in ONE request. Descriptions
 * are Grok hints. Labels and aliases let a Wikidata id absorb a nearby pin
 * whose name is the same place in another language. Failure tolerant.
 */
export async function fetchWikidataInfo(ids: string[], signal?: AbortSignal): Promise<WikidataInfo> {
  const hints = new Map<string, string>();
  const names = new Map<string, string[]>();
  const unique = [...new Set(ids.map((id) => id.trim().toUpperCase()).filter((id) => QID.test(id)))].slice(0, MAX_IDS);
  if (unique.length === 0) return { hints, names };
  const params = new URLSearchParams({
    action: 'wbgetentities',
    ids: unique.join('|'),
    props: 'descriptions|labels|aliases',
    languages: NAME_LANGS,
    format: 'json',
  });
  const signals = [AbortSignal.timeout(WIKIDATA_TIMEOUT_MS)];
  if (signal) signals.push(signal);
  try {
    const res = await fetch(`https://www.wikidata.org/w/api.php?${params}`, {
      headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT },
      signal: AbortSignal.any(signals),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data: any = await res.json();
    for (const [id, entity] of Object.entries<any>(data?.entities ?? {})) {
      if (!entity || entity.missing != null) continue;
      const key = id.toUpperCase();
      const hint = cleanHint(entity?.descriptions?.en?.value);
      if (hint) hints.set(key, hint);
      const labels = entityNames(entity);
      if (labels.length) names.set(key, labels);
    }
  } catch (err) {
    console.warn('[wikidata] entity info unavailable:', err instanceof Error ? err.message : String(err));
  }
  return { hints, names };
}

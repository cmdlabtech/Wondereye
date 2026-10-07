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

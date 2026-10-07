import { Landmark, LandmarkDetailInput, RawPOI } from './types';
import { fetchWikidataDescriptions } from './wikidata';
import { detailLanguageInstruction, Lang, lengthBudget, snippetLanguageInstruction } from './lang';

export const GROK_SNIPPET_MODEL = 'grok-4.3';
// This xAI team cannot call grok-4.6; 4.3 + web search + low reasoning is the
// strongest detail path the current API key can actually serve.
export const GROK_DETAIL_MODEL = 'grok-4.3';
export const GROK_MATCH_MODEL = 'grok-4.3';

const XAI_CHAT = 'https://api.x.ai/v1/chat/completions';
const XAI_RESPONSES = 'https://api.x.ai/v1/responses';
// POI lookup (≤ 8 s, see places.ts) + this must stay well inside the app's 30 s timeout.
const SNIPPET_TIMEOUT_MS = 15_000;
const DETAIL_TIMEOUT_MS = 25_000;

const sanitize = (s: string, max = 100) =>
  s.replace(/[^\p{L}\p{N}\s\-'.,&():;]/gu, '').slice(0, max);

function authHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

export function formatCandidate(p: RawPOI): string {
  const bits = [
    `name="${sanitize(p.name)}"`,
    `type=${sanitize(p.type)}`,
    `distance=${p.distance}m`,
    `at ${p.lat.toFixed(4)},${p.lng.toFixed(4)}`,
  ];
  if (p.city) bits.push(`city=${sanitize(p.city, 80)}`);
  if (p.wikipedia) bits.push(`wikipedia=${sanitize(p.wikipedia, 150)}`);
  if (p.wikidata) bits.push(`wikidata=${sanitize(p.wikidata, 40)}`);
  if (p.hint) bits.push(`hint=${sanitize(p.hint, 120)}`);
  if (p.startDate) bits.push(`since=${sanitize(p.startDate, 40)}`);
  if (p.architect) bits.push(`architect=${sanitize(p.architect, 80)}`);
  if (p.description) bits.push(sanitize(p.description, 180));
  return `- ${bits.join(' | ')}`;
}

/** Strip a trailing parenthetical so "Eiffel Tower (attraction)" matches "Eiffel Tower". */
export function normalizeLandmarkName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchPoi(pois: RawPOI[], name: string): RawPOI | undefined {
  const raw = name.toLowerCase().trim();
  const exact = pois.find((p) => p.name.toLowerCase() === raw);
  if (exact) return exact;
  const normalized = normalizeLandmarkName(name);
  if (!normalized) return undefined;
  return (
    pois.find((p) => normalizeLandmarkName(p.name) === normalized) ??
    pois.find((p) => p.name.toLowerCase() === normalized)
  );
}

/**
 * Snippet length budget. One glasses reading page holds CHARS_PER_PAGE = 350
 * characters (about 7 lines of 60 characters at 576 px), so a snippet up to
 * SNIPPET_MAX_CHARS always renders on a single page. The same text is the
 * web map card, where 2 to 3 sentences read comfortably.
 */
export const SNIPPET_TARGET_CHARS = 320;
export const SNIPPET_MAX_CHARS = 340;

/** Replace em and en dashes with plain punctuation (house style: no dashes as separators). */
export function replaceDashes(text: string): string {
  return text
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, '$1-$2') // 1344–1929 -> 1344-1929
    .replace(/\s*[\u2014\u2013]\s*/g, ', ')
    .replace(/,\s*([.!?,;:])/g, '$1');
}

/** Index of the last sentence-ending mark in `cut` (Latin ". " or CJK "。！？"), or -1. */
function lastSentenceStop(cut: string): number {
  return Math.max(
    cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '),
    cut.endsWith('.') ? cut.length - 1 : -1,
    cut.lastIndexOf('\u3002'), cut.lastIndexOf('\uff01'), cut.lastIndexOf('\uff1f'),
  );
}

/** Cap at the last full sentence that fits; fall back to a word boundary. */
function capAtSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const stop = lastSentenceStop(cut);
  if (stop >= max * 0.5) return cut.slice(0, stop + 1).trim();
  const space = text.lastIndexOf(' ', max - 1);
  return `${text.slice(0, space > 0 ? space : max - 1).replace(/[,;:\u3001\uff0c]$/, '')}\u2026`;
}

/** Reader/distance references that do not belong on a public map card. */
const DISTANCE_CLAUSE = /,?\s*(?:(?:that|which)\s+)?(?:(?:stands|sits|lies|is|is located|is situated)\s+)?(?:(?:about|roughly|some|just|only|around)\s+)?\d[\d,.]*\s*(?:m|meters|metres|feet|ft|yards|yd|km|kilometers|kilometres|miles|mi)\s+(?:away\s+)?from\s+(?:your\s+(?:location|position|spot)|you|here|where\s+you\s+(?:are|stand))\b/gi;
const READER_REF = /\b(?:you|your|you're|yourself)\b|\bthe visitor\b|\bfrom here\b/i;

/** Split into sentences without breaking after abbreviations ("St. Vitus", "U.S. Army"). */
function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?])\s+(?=[\p{Lu}\p{N}"'])/u);
  const out: string[] = [];
  for (const part of parts) {
    const prev = out[out.length - 1];
    if (prev && /\b(?:(?:[A-Z]\.){1,3}|[A-Z][a-z]{0,2}\.)$/.test(prev)) out[out.length - 1] = `${prev} ${part}`;
    else out.push(part);
  }
  return out;
}

/**
 * Safeguard for the "never mention the reader" rule. First strips a
 * distance clause in place ("...station that stands 25 meters from your
 * location." -> "...station."). Then drops any remaining sentence that
 * addresses the reader, but only when it is not the first sentence and at
 * least two sentences remain; otherwise the text is left as is.
 */
export function stripReaderReferences(text: string): string {
  let s = text.replace(DISTANCE_CLAUSE, '').replace(/\s+([.!?,])/g, '$1');
  if (!READER_REF.test(s)) return s;
  const sentences = splitSentences(s);
  const kept = sentences.filter((sentence, i) => i === 0 || !READER_REF.test(sentence));
  if (kept.length >= 2 && kept.length < sentences.length) s = kept.join(' ');
  return s;
}

/**
 * Normalize a HUD snippet: drop "(123 chars)" artifacts and trivia-card
 * labels ("The most interesting fact is that…", "Fun fact:", "It matters as…")
 * that the model sometimes adds, replace em/en dashes, strip references to
 * the reader's location (public map card), restore sentence capitalization,
 * and cap the length so it fits one glasses page.
 */
export function cleanSnippet(raw: string, max: number = SNIPPET_MAX_CHARS): string {
  let s = raw.replace(/\s*\(\d+\s*chars?\)\.?/gi, '').replace(/\s+/g, ' ').trim();
  if (!s) return s;
  s = s.replace(
    /(?:^|(?<=[.!?]\s))(?:it\s+)?matters\s+(?:as|for)\s+[^.!?]+[.!?]?\s*/gi,
    ''
  );
  s = s.replace(
    /(?:^|(?<=[.!?]\s)|(?<=,\s))(?:its\s+)?(?:(?:the\s+)?(?:single\s+)?most\s+interesting(?:\s+(?:historical|cultural))?\s+(?:fact|hook|feature)|(?:an?\s+)?interesting\s+fact|fun\s+fact|did\s+you\s+know)(?:\s+(?:about|for)\s+[^:,.]{1,60})?\s*(?::\s*|[\u2014\u2013-]\s*|\s+is\s+that\s+|\s+is\s+|\s+that\s+)/gi,
    ''
  );
  s = replaceDashes(s);
  s = stripReaderReferences(s);
  s = s.replace(/\s+/g, ' ').replace(/\s+([.!?])/g, '$1').replace(/^[.!?,\s]+/, '').trim();
  if (!s) return s;
  const letter = s.search(/[\p{L}]/u);
  if (letter >= 0) s = s.slice(0, letter) + s.charAt(letter).toUpperCase() + s.slice(letter + 1);
  s = capAtSentence(s, max);
  return s.replace(/([.!?])(\s+)(\p{Ll})/gu, (full, punc: string, space: string, ch: string, offset: number, src: string) => {
    const before = String(src).slice(0, Number(offset) + 1);
    // Leave abbreviations alone ("St. john", "U.S. army").
    if (/\b(?:(?:[A-Z]\.){1,3}|[A-Z][a-z]{0,2}\.)$/.test(before)) return full;
    return punc + space + String(ch).toUpperCase();
  });
}

/**
 * Shared description rules: used for the glasses snippet (which is also the
 * web map card) and by the offline map regeneration script, so both produce
 * the same style and length.
 */
export function descriptionRules(lang: Lang = 'en'): string {
  const budget = lengthBudget(lang);
  return `For each place write a short description in 2 or 3 complete sentences, about ${budget.snippetTarget} characters and never more than ${budget.snippetMax}. It is shown on the glasses and on the public Wondereye map, so it must be informative on its own:
1. What it is: the kind of place and one identifying detail (style, setting, or purpose).
2. When and by whom it was built, founded, or made, if you are certain.
3. One notable fact or why it matters: a record, a historic event, its purpose, or a visible feature.

Accuracy comes first. People read this at the place itself and on a public map, so a wrong fact is worse than a plain one:
- Use only facts you are confident are true for this exact named place at these coordinates, not a different place with a similar name.
- wikipedia= and wikidata= are identifiers only; use them to be sure which place is meant, not as a source of text.
- hint= is a short Wikidata label to identify which place this is; do not copy it, write your own description. If the name could mean several things (for example a station, school, or church), the hint tells you which one it is.
- The since=, architect= and description fields come from OpenStreetMap; do not contradict them.
- Only state facts you are certain of. Give a specific year, number, or person only when you are certain of it. Otherwise leave it out.
- Leave out physical details (materials, colors, dimensions, heights, seat counts, capacities) unless you are certain of them. When unsure, omit them rather than guess.
- If the place no longer exists (demolished, destroyed, or a temporary exhibition structure), say so and use the past tense.
- If you are unsure or know little about a place, describe it plainly in two sentences (what it is and what can be seen) rather than inventing detail.

Never mention the reader or their position: no "you", "your", "the visitor", their location, or distances. The same text is a public map card read from anywhere.

Style: plain and factual, like the opening of an encyclopedia entry read aloud by a guide. Every sentence must be a full sentence with a verb. No slogans, taglines, or sentence fragments. No marketing or hype words such as iconic, stunning, breathtaking, must-see, or hidden gem, and no superlatives unless you are certain they are true. Do not use em dashes or en dashes; use commas or periods.

Example: "St. Vitus Cathedral is the Gothic cathedral inside Prague Castle and the seat of the Archbishop of Prague. Charles IV began it in 1344, and it was completed only in 1929. The Bohemian Crown Jewels are kept in a chamber above its Chapel of St. Wenceslas."

Write each fact directly. Do not announce, rank, or label it. Never use "the most interesting fact", "interesting fact", "fun fact", "did you know", or "it matters as/for". Do not write a full history; more background is available on request.
No markdown, no bullet points, no character counts. Return ONLY a JSON array of objects with "name" and "snippet" fields. The "name" must exactly match the candidate name="..." value. Do not append the type or other fields.${snippetLanguageInstruction(lang)}`;
}

export const DESCRIPTION_RULES = descriptionRules('en');

export function parseSnippetList(text: string): Array<{ name: string; snippet: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return [];
    }
  }
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { landmarks?: unknown }).landmarks)
      ? (parsed as { landmarks: unknown[] }).landmarks
      : Array.isArray((parsed as { places?: unknown }).places)
        ? (parsed as { places: unknown[] }).places
        : [];
  return list.filter(
    (s): s is { name: string; snippet: string } =>
      !!s && typeof (s as { name?: unknown }).name === 'string' && typeof (s as { snippet?: unknown }).snippet === 'string'
  );
}

function copyPoiContext(poi: RawPOI): Partial<Landmark> {
  const extra: Partial<Landmark> = {};
  if (poi.wikipedia) extra.wikipedia = poi.wikipedia;
  if (poi.wikidata) extra.wikidata = poi.wikidata;
  if (poi.description) extra.description = poi.description;
  if (poi.startDate) extra.startDate = poi.startDate;
  if (poi.architect) extra.architect = poi.architect;
  if (poi.city) extra.city = poi.city;
  return extra;
}

export async function generateSnippets(
  pois: RawPOI[],
  apiKey: string,
  origin: { lat: number; lng: number },
  lang: Lang = 'en'
): Promise<Landmark[]> {
  const budget = lengthBudget(lang);
  const nameList = pois.map(formatCandidate).join('\n');

  const response = await fetch(XAI_CHAT, {
    method: 'POST',
    headers: authHeaders(apiKey),
    signal: AbortSignal.timeout(SNIPPET_TIMEOUT_MS),
    body: JSON.stringify({
      model: GROK_SNIPPET_MODEL,
      reasoning_effort: 'none',
      max_completion_tokens: 1000,
      messages: [
        {
          role: 'system',
          content:
            'You are a knowledgeable, factual tour guide writing for a smart-glasses display and a public landmark map. Return ONLY valid JSON with no other text.',
        },
        {
          role: 'user',
          content: `The visitor is at ${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}. Distances below are from that point.
From the list, pick up to 5 places they would actually want to look at from here. Rank by a mix of notability and proximity: famous landmarks and historic sites that are nearby first, then notable local places if fewer than 5 major ones are close.

${descriptionRules(lang)}

Candidates:
${nameList}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Grok API error: ${response.status} — ${body.slice(0, 200)}`);
  }

  const result: any = await response.json();
  const text = result.choices?.[0]?.message?.content || '';
  const snippets = parseSnippetList(text);

  return snippets
    .map((s) => {
      const poi = matchPoi(pois, s.name);
      if (!poi) return null;
      return {
        name: poi.name,
        type: poi.type,
        distance: poi.distance,
        lat: poi.lat,
        lng: poi.lng,
        snippet: cleanSnippet(s.snippet, budget.snippetMax),
        ...copyPoiContext(poi),
      };
    })
    .filter((l): l is Landmark => l !== null && l.snippet.length > 0)
    .slice(0, 5);
}

function responsesOutputText(data: any): string {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const parts: string[] = [];
  for (const item of data?.output ?? []) {
    if (item?.type !== 'message') continue;
    for (const c of item.content ?? []) {
      if ((c?.type === 'output_text' || c?.type === 'text') && typeof c.text === 'string') {
        parts.push(c.text);
      }
    }
  }
  return parts.join('\n').trim();
}

function toPlainGuideText(text: string, cap = 900): string {
  const cleaned = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\[\d+\]\]\([^)]*\)/g, '')
    .replace(/\[\d+\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const out = replaceDashes(cleaned);
  if (out.length <= cap) return out;
  const sliced = out.slice(0, cap);
  const last = lastSentenceStop(sliced);
  return (last > Math.round((cap * 2) / 9) ? sliced.slice(0, last + 1) : sliced).trim();
}

export async function generateDetail(
  input: LandmarkDetailInput,
  apiKey: string,
  lang: Lang = 'en'
): Promise<string> {
  const budget = lengthBudget(lang);
  const unitHint = input.units === 'metric'
    ? 'Use metric units (meters, kilometers) for any distances or measurements.'
    : 'Use imperial units (feet, miles) for any distances or measurements.';

  const facts: string[] = [
    `Name: ${sanitize(input.name, 200)}`,
  ];
  if (input.type) facts.push(`Type: ${sanitize(input.type, 80)}`);
  if (typeof input.lat === 'number' && typeof input.lng === 'number') {
    facts.push(`Coordinates: ${input.lat.toFixed(5)}, ${input.lng.toFixed(5)}`);
  }
  if (typeof input.distance === 'number' && Number.isFinite(input.distance)) {
    facts.push(`Distance from visitor: ${Math.round(input.distance)} m`);
  }
  if (input.city) facts.push(`City: ${sanitize(input.city, 80)}`);
  if (input.wikipedia) facts.push(`Article title (identifier only, not a source): ${sanitize(input.wikipedia, 150)}`);
  if (input.wikidata) facts.push(`Wikidata: ${sanitize(input.wikidata, 40)}`);
  if (input.wikidata) {
    // One small request (1.5 s cap, failure tolerant): which place is meant, not a text source.
    const hint = (await fetchWikidataDescriptions([input.wikidata])).get(input.wikidata.trim().toUpperCase());
    if (hint) facts.push(`Wikidata label (identifies which place this is; do not copy it): ${sanitize(hint, 120)}`);
  }
  if (input.startDate) facts.push(`OSM start_date: ${sanitize(input.startDate, 40)}`);
  if (input.architect) facts.push(`Architect/artist: ${sanitize(input.architect, 80)}`);
  if (input.description) facts.push(`OSM description: ${sanitize(input.description, 240)}`);

  const snippet = input.snippet?.trim();
  const alreadyRead = snippet
    ? `The visitor already read this HUD snippet and must not see it repeated:\n"${sanitize(cleanSnippet(snippet), 400)}"\n\n`
    : '';

  const response = await fetch(XAI_RESPONSES, {
    method: 'POST',
    headers: authHeaders(apiKey),
    signal: AbortSignal.timeout(DETAIL_TIMEOUT_MS),
    body: JSON.stringify({
      model: GROK_DETAIL_MODEL,
      reasoning: { effort: 'low' },
      max_output_tokens: 1600,
      max_turns: 4,
      store: false,
      tools: [
        {
          type: 'web_search',
          filters: { allowed_domains: ['grokipedia.com'] },
        },
      ],
      input: [
        {
          role: 'system',
          content: `You are a knowledgeable tour guide standing with a visitor at this exact place. Use your own knowledge and, if needed, search Grokipedia for THIS specific site at the given coordinates, not a different place that shares the name. Do not use Wikipedia as a source. Only state facts you are certain of; if sources disagree or you cannot confirm a date, number, or name, leave it out. Saying less is better than guessing. Write plain text only: no markdown, no bullet points, no citation markers, no URLs, no headings. Speak as a guide, not a trivia card: state details directly with no fact labels. Plain factual tone; no slogans, hype words, or em dashes. ${unitHint}${detailLanguageInstruction(lang)}`,
        },
        {
          role: 'user',
          content: `${alreadyRead}Give the next layer of background on this landmark in full sentences. Add facts the snippet did not cover: history and the people involved, why this specific site is notable, and one thing they can notice in person. Keep it under ${budget.detailTarget} characters. Do not use "the most interesting fact", "fun fact", or "it matters as" phrasing. Leave out physical details (materials, colors, dimensions, heights, seat counts, capacities) unless you are certain of them; when unsure, omit them rather than guess. If the place no longer exists (demolished, destroyed, or a temporary exhibition structure), say so and use the past tense. Do not state the visitor's distance or position. If little is reliably known about this place, keep it short and descriptive instead of filling space.

${facts.join('\n')}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Grok API error: ${response.status} — ${body.slice(0, 200)}`);
  }

  const data: any = await response.json();
  return toPlainGuideText(responsesOutputText(data), budget.detailCap);
}

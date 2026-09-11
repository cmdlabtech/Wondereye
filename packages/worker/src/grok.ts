import { Landmark, LandmarkDetailInput, RawPOI } from './types';

export const GROK_SNIPPET_MODEL = 'grok-4.3';
// This xAI team cannot call grok-4.6; 4.3 + web search + low reasoning is the
// strongest detail path the current API key can actually serve.
export const GROK_DETAIL_MODEL = 'grok-4.3';
export const GROK_MATCH_MODEL = 'grok-4.3';

const XAI_CHAT = 'https://api.x.ai/v1/chat/completions';
const XAI_RESPONSES = 'https://api.x.ai/v1/responses';
const SNIPPET_TIMEOUT_MS = 20_000;
const DETAIL_TIMEOUT_MS = 25_000;

const sanitize = (s: string, max = 100) =>
  s.replace(/[^\p{L}\p{N}\s\-'.,&():;]/gu, '').slice(0, max);

function authHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

function formatCandidate(p: RawPOI): string {
  const bits = [
    `name="${sanitize(p.name)}"`,
    `type=${sanitize(p.type)}`,
    `distance=${p.distance}m`,
    `at ${p.lat.toFixed(4)},${p.lng.toFixed(4)}`,
  ];
  if (p.city) bits.push(`city=${sanitize(p.city, 80)}`);
  if (p.wikipedia) bits.push(`wikipedia=${sanitize(p.wikipedia, 150)}`);
  if (p.wikidata) bits.push(`wikidata=${sanitize(p.wikidata, 40)}`);
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

function parseSnippetList(text: string): Array<{ name: string; snippet: string }> {
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
  origin: { lat: number; lng: number }
): Promise<Landmark[]> {
  const nameList = pois.map(formatCandidate).join('\n');

  const response = await fetch(XAI_CHAT, {
    method: 'POST',
    headers: authHeaders(apiKey),
    signal: AbortSignal.timeout(SNIPPET_TIMEOUT_MS),
    body: JSON.stringify({
      model: GROK_SNIPPET_MODEL,
      reasoning_effort: 'none',
      max_completion_tokens: 600,
      messages: [
        {
          role: 'system',
          content:
            'You are a concise tour guide for smart glasses with a tiny display. Return ONLY valid JSON with no other text.',
        },
        {
          role: 'user',
          content: `The visitor is at ${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}. Distances below are from that point.
From the list, pick up to 5 places they would actually want to look at from here. Rank by a mix of notability and proximity — famous landmarks and historic sites that are nearby first, then local gems if fewer than 5 majors are close.
For each chosen place, write a HUD one-liner (max 280 characters): what they are looking at and the single most interesting hook. Do not write a history, dates dump, or full background — that comes later if they tap for more.
No markdown, no bullet points, no character counts. Return ONLY a JSON array of objects with "name" and "snippet" fields. The "name" must exactly match the candidate name="..." value — do not append type or other fields.

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
        snippet: s.snippet.replace(/\s*\(\d+\s*chars?\)\.?/gi, '').trim(),
        ...copyPoiContext(poi),
      };
    })
    .filter((l): l is Landmark => l !== null)
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

function toPlainGuideText(text: string): string {
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
  if (cleaned.length <= 900) return cleaned;
  const sliced = cleaned.slice(0, 900);
  const last = Math.max(sliced.lastIndexOf('. '), sliced.lastIndexOf('! '), sliced.lastIndexOf('? '));
  return (last > 200 ? sliced.slice(0, last + 1) : sliced).trim();
}

export async function generateDetail(
  input: LandmarkDetailInput,
  apiKey: string
): Promise<string> {
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
  if (input.wikipedia) facts.push(`OpenStreetMap wikipedia tag: ${sanitize(input.wikipedia, 150)}`);
  if (input.wikidata) facts.push(`Wikidata: ${sanitize(input.wikidata, 40)}`);
  if (input.startDate) facts.push(`OSM start_date: ${sanitize(input.startDate, 40)}`);
  if (input.architect) facts.push(`Architect/artist: ${sanitize(input.architect, 80)}`);
  if (input.description) facts.push(`OSM description: ${sanitize(input.description, 240)}`);

  const snippet = input.snippet?.trim();
  const alreadyRead = snippet
    ? `The visitor already read this HUD snippet and must not see it repeated:\n"${sanitize(snippet, 320)}"\n\n`
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
          filters: { allowed_domains: ['grokipedia.com', 'wikipedia.org', 'en.wikipedia.org'] },
        },
      ],
      input: [
        {
          role: 'system',
          content: `You are a knowledgeable tour guide standing with a visitor at this exact place. Search Grokipedia and Wikipedia for THIS specific site at the given coordinates — not a different place that shares the name. Write plain text only: no markdown, no bullet points, no citation markers, no URLs, no headings. ${unitHint}`,
        },
        {
          role: 'user',
          content: `${alreadyRead}Give the next layer of background on this landmark. Cover who built it or when it dates from, why this specific site is notable, and one thing they can notice in person. Keep it under 800 characters.

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
  return toPlainGuideText(responsesOutputText(data));
}

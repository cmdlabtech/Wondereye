import { RawPOI, Landmark } from './types';

export async function generateSnippets(
  pois: RawPOI[],
  apiKey: string
): Promise<Landmark[]> {
  // Sanitize POI names to prevent prompt injection
  const sanitize = (s: string) => s.replace(/[^\w\s\-'.,&()]/g, '').slice(0, 100);
  const nameList = pois.map((p) => `- ${sanitize(p.name)} (${sanitize(p.type)})`).join('\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are a concise tour guide for smart glasses with a tiny display.
From the list below, pick up to 5 of the most interesting places a visitor would want to see. Rank by notability — prioritize famous landmarks, popular museums, and historic sites, but include local gems if fewer than 5 major landmarks are available.
For each chosen place, write a 1-2 sentence snippet (max 120 characters).
Focus on the single most interesting fact. No markdown, no bullet points.
Return ONLY a JSON array of objects with "name" and "snippet" fields. The "name" must exactly match the candidate name.

Candidates:
${nameList}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const result: any = await response.json();
  const text = result.content[0].text;

  let snippets: Array<{ name: string; snippet: string }>;
  try {
    const parsed = JSON.parse(text);
    snippets = Array.isArray(parsed) ? parsed : [];
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    snippets = match ? JSON.parse(match[0]) : [];
  }
  // Validate each snippet has required string fields
  snippets = snippets.filter(
    (s) => s && typeof s.name === 'string' && typeof s.snippet === 'string'
  );

  return snippets
    .map((s) => {
      const poi = pois.find(
        (p) => p.name.toLowerCase() === s.name.toLowerCase()
      );
      if (!poi) return null;
      return {
        name: poi.name,
        type: poi.type,
        distance: poi.distance,
        snippet: s.snippet,
      };
    })
    .filter((l): l is Landmark => l !== null)
    .slice(0, 5);
}

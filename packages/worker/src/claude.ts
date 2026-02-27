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
For each landmark below, write a 1-2 sentence snippet (max 120 characters).
Focus on the single most interesting fact. No markdown, no bullet points.
Return ONLY a JSON array of objects with "name" and "snippet" fields.

Landmarks:
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
    snippets = JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    snippets = match ? JSON.parse(match[0]) : [];
  }

  return pois.map((poi) => {
    const found = snippets.find(
      (s) => s.name.toLowerCase() === poi.name.toLowerCase()
    );
    return {
      name: poi.name,
      type: poi.type,
      distance: poi.distance,
      snippet: found?.snippet ?? `A notable ${poi.type} nearby.`,
    };
  });
}

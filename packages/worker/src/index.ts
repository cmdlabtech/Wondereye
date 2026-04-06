import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { queryOverpass } from './overpass';
import { generateSnippets } from './grok';
import { Bindings, LandmarkResponse } from './types';

const MAX_RADIUS = 2000;
const MIN_RADIUS = 50;
const CACHE_TTL = 7776000; // 90 days
const DETAIL_CACHE_TTL = 7776000; // 90 days
const PLACE_TTL = 7776000; // 90 days — short-term accumulator
const MAP_CACHE_TTL = 3600; // 1 hour — aggregated /api/map response

function cacheKey(lat: number, lng: number, radius: number): string {
  return `landmarks:${lat.toFixed(3)}:${lng.toFixed(3)}:${radius}`;
}

function placeKey(name: string): string {
  return `place:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100)}`;
}

// Permanent map record — no TTL, survives 90-day cache resets
function mapPlaceKey(name: string): string {
  return `mapplace:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100)}`;
}

const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10; // requests per window per IP

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

const app = new Hono<{ Bindings: Bindings }>();

app.use('/*', async (c, next) => {
  await next();
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('X-Frame-Options', 'DENY');
  c.res.headers.set('Referrer-Policy', 'no-referrer');
  c.res.headers.set('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
});

app.use('/*', async (c, next) => {
  const allowed = c.env.ALLOWED_ORIGIN;
  if (!allowed) {
    return c.json({ error: 'Service misconfigured' }, 500);
  }
  const origins = allowed.split(',').map((o) => o.trim());
  const middleware = cors({
    origin: (reqOrigin) => origins.includes(reqOrigin) ? reqOrigin : '',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  });
  return middleware(c, next);
});

app.post('/api/landmarks', async (c) => {
  const ip = c.req.header('cf-connecting-ip');
  if (!ip && c.env.DEV !== 'true') return c.json({ error: 'Too many requests. Try again shortly.' }, 429);
  if (ip && !checkRateLimit(ip)) {
    return c.json({ error: 'Too many requests. Try again shortly.' }, 429);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { lat, lng } = body;
  let radius = body.radius ?? 500;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return c.json({ error: 'lat and lng are required numbers' }, 400);
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return c.json({ error: 'Invalid coordinates' }, 400);
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return c.json({ error: 'Invalid coordinates' }, 400);
  }

  radius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, Number(radius) || 500));

  // Round coordinates to ~110m precision for privacy (3 decimal places)
  const safeLat = Math.round(lat * 1000) / 1000;
  const safeLng = Math.round(lng * 1000) / 1000;

  const key = cacheKey(safeLat, safeLng, radius);

  const cached = await c.env.LANDMARKS_CACHE.get(key, 'json');
  if (cached) {
    const response = cached as LandmarkResponse;
    if (response.landmarks.length > 0) {
      if (response.landmarks[0].lat == null) {
        // Old cached data without coordinates — backfill via Overpass
        c.executionCtx.waitUntil(
          (async () => {
            const existing = await Promise.all(
              response.landmarks.map(lm => c.env.LANDMARKS_CACHE.get(placeKey(lm.name)))
            );
            const missing = response.landmarks.filter((_, i) => existing[i] === null);
            if (missing.length === 0) return;
            const pois = await queryOverpass(safeLat, safeLng, radius);
            await Promise.all([
              ...missing.flatMap(lm => {
                const poi = pois.find(p => p.name.toLowerCase() === lm.name.toLowerCase());
                if (!poi) return [];
                const entry = JSON.stringify({ name: lm.name, type: lm.type, lat: poi.lat, lng: poi.lng, snippet: lm.snippet });
                return [
                  c.env.LANDMARKS_CACHE.put(placeKey(lm.name), entry, { expirationTtl: PLACE_TTL }),
                  c.env.LANDMARKS_CACHE.put(mapPlaceKey(lm.name), entry),
                ];
              }),
              c.env.LANDMARKS_CACHE.delete('map-cache'),
            ]);
          })().catch(() => {})
        );
      } else {
        // Cached data has coordinates — backfill mapplace: if missing (one read as proxy for all)
        c.executionCtx.waitUntil(
          (async () => {
            const exists = await c.env.LANDMARKS_CACHE.get(mapPlaceKey(response.landmarks[0].name));
            if (exists) return;
            await Promise.all([
              ...response.landmarks.map(lm =>
                c.env.LANDMARKS_CACHE.put(
                  mapPlaceKey(lm.name),
                  JSON.stringify({ name: lm.name, type: lm.type, lat: lm.lat, lng: lm.lng, snippet: lm.snippet })
                )
              ),
              c.env.LANDMARKS_CACHE.delete('map-cache'),
            ]);
          })().catch(() => {})
        );
      }
    }
    return c.json(response);
  }

  let pois;
  try {
    pois = await queryOverpass(safeLat, safeLng, radius);
  } catch (err) {
    console.error('[api] Overpass error:', err);
    return c.json({ error: 'Failed to fetch nearby places. Please try again.' }, 502);
  }

  if (pois.length === 0) {
    // Do not cache empty results — could be a transient Overpass issue
    return c.json({ landmarks: [] });
  }

  try {
    const landmarks = await generateSnippets(pois, c.env.XAI_API_KEY);
    const response: LandmarkResponse = { landmarks };
    if (landmarks.length === 0) {
      return c.json(response);
    }
    c.executionCtx.waitUntil(
      Promise.all([
        c.env.LANDMARKS_CACHE.put(key, JSON.stringify(response), { expirationTtl: CACHE_TTL }),
        c.env.LANDMARKS_CACHE.delete('map-cache'),
        ...landmarks.flatMap(lm => {
          const entry = JSON.stringify({ name: lm.name, type: lm.type, lat: lm.lat, lng: lm.lng, snippet: lm.snippet });
          return [
            c.env.LANDMARKS_CACHE.put(placeKey(lm.name), entry, { expirationTtl: PLACE_TTL }),
            c.env.LANDMARKS_CACHE.put(mapPlaceKey(lm.name), entry), // no TTL — permanent
          ];
        }),
      ])
    );
    return c.json(response);
  } catch (err) {
    console.error('[api] Grok error:', err);
    return c.json({ error: 'Failed to generate landmark info. Please try again.' }, 502);
  }
});

app.post('/api/landmark-detail', async (c) => {
  const ip = c.req.header('cf-connecting-ip');
  if (!ip && c.env.DEV !== 'true') return c.json({ error: 'Too many requests. Try again shortly.' }, 429);
  if (ip && !checkRateLimit(ip)) {
    return c.json({ error: 'Too many requests. Try again shortly.' }, 429);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { name, units } = body;
  if (typeof name !== 'string' || name.length === 0 || name.length > 200) {
    return c.json({ error: 'name is required (string, max 200 chars)' }, 400);
  }
  const unitSystem: 'imperial' | 'metric' = units === 'metric' ? 'metric' : 'imperial';
  const unitHint = unitSystem === 'metric'
    ? 'Use metric units (meters, kilometers) for any distances or measurements.'
    : 'Use imperial units (feet, miles) for any distances or measurements.';

  const detailKey = `detail:${name.toLowerCase().trim()}:${unitSystem}`;
  const cachedDetail = await c.env.LANDMARKS_CACHE.get(detailKey, 'json');
  if (cachedDetail) {
    return c.json(cachedDetail);
  }

  const safeName = name.replace(/["\\]/g, ' ').replace(/[\r\n]/g, ' ').trim();

  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${c.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4-1-fast-non-reasoning',
        max_tokens: 400,
        messages: [
          {
            role: 'system',
            content: `You are a knowledgeable tour guide. Look up every landmark in Grokipedia first to ensure accurate, factual information. Write in plain text with no markdown, no bullet points, no special formatting. ${unitHint}`,
          },
          {
            role: 'user',
            content: `Using Grokipedia, give a concise background on the landmark "${safeName}". Include what it is, its history, why it's notable, and one interesting fact. Keep it under 800 characters.`,
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error('[api] Grok API error:', res.status);
      return c.json({ detail: '' });
    }

    const data: any = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    if (text) {
      c.executionCtx.waitUntil(
        c.env.LANDMARKS_CACHE.put(detailKey, JSON.stringify({ detail: text }), {
          expirationTtl: DETAIL_CACHE_TTL,
        })
      );
    }
    return c.json({ detail: text });
  } catch (err) {
    console.error('[api] landmark-detail error:', err);
    return c.json({ detail: '' });
  }
});

app.post('/api/transcribe', async (c) => {
  const ip = c.req.header('cf-connecting-ip');
  if (!ip && c.env.DEV !== 'true') return c.json({ error: 'Too many requests. Try again shortly.' }, 429);
  if (ip && !checkRateLimit(ip)) {
    return c.json({ error: 'Too many requests. Try again shortly.' }, 429);
  }

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: 'Invalid multipart body' }, 400);
  }

  const file = formData.get('file');
  const landmarksRaw = formData.get('landmarks');

  if (!file || typeof file === 'string') return c.json({ error: 'file is required' }, 400);
  const audioFile = file as File;
  if (audioFile.size > 2_000_000) return c.json({ error: 'Audio file too large (max 2MB)' }, 400);

  let landmarks: { name: string }[] = [];
  try {
    const parsed = JSON.parse(landmarksRaw as string);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error();
    landmarks = parsed.slice(0, 10).filter((l: any) => typeof l.name === 'string' && l.name.length > 0);
  } catch {
    return c.json({ error: 'landmarks must be a non-empty JSON array' }, 400);
  }

  // Forward audio to xAI Whisper-compatible STT endpoint
  const sttForm = new FormData();
  sttForm.append('file', audioFile, 'audio.wav');
  sttForm.append('model', 'whisper-1');

  let transcribedText = '';
  try {
    const sttRes = await fetch('https://api.x.ai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${c.env.XAI_API_KEY}` },
      body: sttForm,
    });
    if (!sttRes.ok) {
      console.error('[transcribe] STT error:', sttRes.status, await sttRes.text().catch(() => ''));
      return c.json({ error: 'Speech recognition failed. Please try again.' }, 502);
    }
    const sttData: any = await sttRes.json();
    transcribedText = (sttData.text || '').trim();
  } catch (err) {
    console.error('[transcribe] STT fetch error:', err);
    return c.json({ error: 'Speech recognition failed. Please try again.' }, 502);
  }

  if (!transcribedText) {
    return c.json({ matched: null, query: '' });
  }

  // Fuzzy-match the transcribed text against the provided landmark names using Grok
  const nameList = landmarks.map(l => `"${l.name.replace(/["\\]/g, ' ').trim()}"`).join(', ');
  const safQuery = transcribedText.replace(/["\\]/g, ' ').replace(/[\r\n]/g, ' ').trim();

  let matched: string | null = null;
  try {
    const grokRes = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${c.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4-1-fast-non-reasoning',
        max_tokens: 60,
        messages: [
          {
            role: 'system',
            content: 'You match voice queries to landmark names. Return ONLY valid JSON with no other text.',
          },
          {
            role: 'user',
            content: `Voice query: "${safQuery}"\nLandmark names: [${nameList}]\nReturn JSON: {"matched": "<exact name from list, or null if no match>"}`,
          },
        ],
      }),
    });
    if (grokRes.ok) {
      const grokData: any = await grokRes.json();
      const content = (grokData.choices?.[0]?.message?.content || '').trim();
      try {
        const parsed = JSON.parse(content);
        if (typeof parsed.matched === 'string' && parsed.matched !== 'null') {
          matched = parsed.matched;
        }
      } catch {
        // Fallback: substring match on raw transcription
        const lowerQuery = transcribedText.toLowerCase();
        matched = landmarks.find(l => lowerQuery.includes(l.name.toLowerCase()))?.name ?? null;
      }
    }
  } catch (err) {
    console.error('[transcribe] Grok match error:', err);
    // Fall through with matched = null — caller gets the transcription without a match
  }

  // No KV cache — each audio recording is unique and not worth caching
  return c.json({ matched, query: transcribedText });
});

async function hashUid(uid: number): Promise<string> {
  const data = new TextEncoder().encode(uid.toString());
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

app.get('/api/location', async (c) => {
  const uid = c.req.query('uid');
  if (!uid || !/^\d+$/.test(uid)) {
    return c.json({ error: 'uid is required' }, 400);
  }
  const key = `user-location:${await hashUid(parseInt(uid, 10))}`;
  const data = await c.env.LANDMARKS_CACHE.get(key, 'json') as { lat: number; lng: number } | null;
  if (!data) return c.json({ error: 'Not found' }, 404);
  return c.json(data);
});

app.post('/api/location', async (c) => {
  const origin = c.req.header('origin');
  const allowedOrigins = (c.env.ALLOWED_ORIGIN || '').split(',').map((o) => o.trim());
  if (!origin || !allowedOrigins.includes(origin)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { uid, lat, lng } = body;
  if (!uid || typeof uid !== 'number' || !Number.isInteger(uid) || uid <= 0) {
    return c.json({ error: 'uid must be a positive integer' }, 400);
  }
  if (typeof lat !== 'number' || typeof lng !== 'number' ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180 ||
      !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return c.json({ error: 'Invalid coordinates' }, 400);
  }

  const key = `user-location:${await hashUid(uid)}`;
  await c.env.LANDMARKS_CACHE.put(
    key,
    JSON.stringify({ lat, lng }),
    { expirationTtl: 31536000 } // 1 year
  );
  return c.json({ ok: true });
});

app.get('/api/map', async (c) => {
  const cached = await c.env.LANDMARKS_CACHE.get('map-cache', 'json');
  if (cached) return c.json(cached);

  // Paginate through all mapplace: entries (KV list returns max 1000 per call)
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page: any = await c.env.LANDMARKS_CACHE.list({ prefix: 'mapplace:', cursor, limit: 1000 });
    keys.push(...page.keys.map((k: any) => k.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  const entries = await Promise.all(keys.map(k => c.env.LANDMARKS_CACHE.get(k, 'json')));
  const seen = new Set<string>();
  const landmarks = entries.filter((e: any) => {
    if (!e || !e.name) return false;
    const key = e.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const response = { landmarks };
  c.executionCtx.waitUntil(
    c.env.LANDMARKS_CACHE.put('map-cache', JSON.stringify(response), { expirationTtl: MAP_CACHE_TTL })
  );
  return c.json(response);
});

app.get('/health', (c) => c.json({ status: 'ok' }));

export default app;

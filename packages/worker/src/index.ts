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
const MAP_CACHE_TTL = 3600; // 1 hour — aggregated /api/map response; expires naturally (writes no longer bust it)

function cacheKey(lat: number, lng: number, radius: number): string {
  return `landmarks:${lat.toFixed(3)}:${lng.toFixed(3)}:${radius}`;
}

// Non-Latin names (e.g. CJK) have no a-z0-9 characters, so the ASCII slug
// collapses to empty and distinct names would otherwise collide on the same
// key. Fall back to a short deterministic hash of the full name in that case.
function slugify(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
  if (slug) return slug;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return `n${(hash >>> 0).toString(36)}`;
}

function placeKey(name: string): string {
  return `place:${slugify(name)}`;
}

// Permanent map record — no TTL, survives 90-day cache resets.
// Keyed by slug + rounded coordinates so same-named places worldwide
// (City Hall, Trinity Church, …) get distinct records instead of
// overwriting each other.
function mapPlaceKey(name: string, lat: number, lng: number): string {
  return `mapplace:${slugify(name)}:${lat.toFixed(3)}:${lng.toFixed(3)}`;
}

interface MapPlace {
  name: string;
  type: string;
  lat: number;
  lng: number;
  snippet: string;
}

// Write a permanent map record. The full record is duplicated into KV list
// metadata (1024-byte cap) so /api/map can aggregate from list() pages alone,
// with no per-key get() — keeping it under the Workers subrequest limit as
// the dataset grows.
function putMapPlace(kv: KVNamespace, lm: MapPlace): Promise<void> {
  if (!Number.isFinite(lm.lat) || !Number.isFinite(lm.lng)) return Promise.resolve();
  const entry: MapPlace = { name: lm.name, type: lm.type, lat: lm.lat, lng: lm.lng, snippet: lm.snippet };
  const metadata: MapPlace = { ...entry };
  while (new TextEncoder().encode(JSON.stringify(metadata)).length > 1000 && metadata.snippet.length > 0) {
    metadata.snippet = metadata.snippet.slice(0, Math.max(0, metadata.snippet.length - 50)).trim();
  }
  return kv.put(mapPlaceKey(lm.name, lm.lat, lm.lng), JSON.stringify(entry), { metadata });
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
    origin: (reqOrigin) => {
      // null origin = file/WebView with no origin. Loopback = EvenHub serves the
      // installed EHPK from http://127.0.0.1:<random port>, so the origin's port
      // varies per launch and must be matched by pattern. Neither can be forged
      // from a normal page on the public web, and this API is public + read-only.
      if (!reqOrigin || reqOrigin === 'null') return '*';
      if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(reqOrigin)) return reqOrigin;
      return origins.includes(reqOrigin) ? reqOrigin : '';
    },
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
            await Promise.all(
              missing.flatMap(lm => {
                const poi = pois.find(p => p.name.toLowerCase() === lm.name.toLowerCase());
                if (!poi) return [];
                const place = { name: lm.name, type: lm.type, lat: poi.lat, lng: poi.lng, snippet: lm.snippet };
                return [
                  c.env.LANDMARKS_CACHE.put(placeKey(lm.name), JSON.stringify(place), { expirationTtl: PLACE_TTL }),
                  putMapPlace(c.env.LANDMARKS_CACHE, place),
                ];
              })
            );
          })().catch(() => {})
        );
      } else {
        // Cached data has coordinates — backfill mapplace: if missing (one read as proxy for all)
        c.executionCtx.waitUntil(
          (async () => {
            const first = response.landmarks[0];
            const exists = await c.env.LANDMARKS_CACHE.get(mapPlaceKey(first.name, first.lat, first.lng));
            if (exists) return;
            await Promise.all(
              response.landmarks.map(lm => putMapPlace(c.env.LANDMARKS_CACHE, lm))
            );
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
        ...landmarks.flatMap(lm => {
          const place = { name: lm.name, type: lm.type, lat: lm.lat, lng: lm.lng, snippet: lm.snippet };
          return [
            c.env.LANDMARKS_CACHE.put(placeKey(lm.name), JSON.stringify(place), { expirationTtl: PLACE_TTL }),
            putMapPlace(c.env.LANDMARKS_CACHE, place), // no TTL — permanent
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


// How many legacy (pre-metadata) mapplace: keys to read+migrate per request.
// Keeps a cold /api/map bounded well under the Workers subrequest cap; any
// remainder migrates on subsequent cache misses.
const LEGACY_MIGRATE_LIMIT = 300;

app.get('/api/map', async (c) => {
  const cached = await c.env.LANDMARKS_CACHE.get('map-cache', 'json');
  if (cached) return c.json(cached);

  // Paginate through all mapplace: keys (KV list returns max 1000 per call).
  // The landmark record rides in each key's list metadata, so aggregation
  // needs no per-key get() and stays flat-cost as the dataset grows.
  const keys: { name: string; metadata?: MapPlace }[] = [];
  let cursor: string | undefined;
  do {
    const page: any = await c.env.LANDMARKS_CACHE.list({ prefix: 'mapplace:', cursor, limit: 1000 });
    keys.push(...page.keys);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  const seen = new Set<string>();
  const landmarks: MapPlace[] = [];
  const addLandmark = (e: any): boolean => {
    if (!e || typeof e.name !== 'string' || !e.name || !Number.isFinite(e.lat) || !Number.isFinite(e.lng)) return false;
    const dedupeKey = mapPlaceKey(e.name, e.lat, e.lng);
    if (seen.has(dedupeKey)) return false;
    seen.add(dedupeKey);
    landmarks.push({ name: e.name, type: e.type, lat: e.lat, lng: e.lng, snippet: e.snippet });
    return true;
  };

  for (const k of keys) {
    if (k.metadata) addLandmark(k.metadata);
  }

  // Legacy keys predate list metadata (and location-suffixed key names):
  // read their values once, fold them in, and rewrite them in the new
  // format so future cache misses need no per-key reads.
  const legacyKeys = keys.filter(k => !k.metadata).slice(0, LEGACY_MIGRATE_LIMIT);
  if (legacyKeys.length > 0) {
    const legacyValues = await Promise.all(legacyKeys.map(k => c.env.LANDMARKS_CACHE.get(k.name, 'json')));
    const migrations: Promise<void>[] = [];
    legacyKeys.forEach((k, i) => {
      const e: any = legacyValues[i];
      if (!e || typeof e.name !== 'string' || !Number.isFinite(e.lat) || !Number.isFinite(e.lng)) return;
      addLandmark(e);
      migrations.push(putMapPlace(c.env.LANDMARKS_CACHE, e));
      if (mapPlaceKey(e.name, e.lat, e.lng) !== k.name) {
        migrations.push(c.env.LANDMARKS_CACHE.delete(k.name));
      }
    });
    c.executionCtx.waitUntil(Promise.all(migrations).catch(() => {}));
  }

  const response = { landmarks };
  c.executionCtx.waitUntil(
    c.env.LANDMARKS_CACHE.put('map-cache', JSON.stringify(response), { expirationTtl: MAP_CACHE_TTL })
  );
  return c.json(response);
});

app.get('/health', (c) => c.json({ status: 'ok' }));

export default app;

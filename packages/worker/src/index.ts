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
  const ip = c.req.header('cf-connecting-ip') || 'unknown';
  if (!checkRateLimit(ip)) {
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
    // Backfill place: entries for old cached data that lacks coordinates
    if (response.landmarks.length > 0 && response.landmarks[0].lat == null) {
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
              const entry = JSON.stringify({ name: lm.name, type: lm.type, lat: poi.lat, lng: poi.lng, snippet: lm.snippet });
              return [
                c.env.LANDMARKS_CACHE.put(placeKey(lm.name), entry, { expirationTtl: PLACE_TTL }),
                c.env.LANDMARKS_CACHE.put(mapPlaceKey(lm.name), entry), // no TTL — permanent
              ];
            })
          );
        })().catch(() => {})
      );
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
  const ip = c.req.header('cf-connecting-ip') || 'unknown';
  if (!checkRateLimit(ip)) {
    return c.json({ error: 'Too many requests. Try again shortly.' }, 429);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { name } = body;
  if (typeof name !== 'string' || name.length === 0 || name.length > 200) {
    return c.json({ error: 'name is required (string, max 200 chars)' }, 400);
  }

  const detailKey = `detail:${name.toLowerCase().trim()}`;
  const cachedDetail = await c.env.LANDMARKS_CACHE.get(detailKey, 'json');
  if (cachedDetail) {
    return c.json(cachedDetail);
  }

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
            content: 'You are a knowledgeable tour guide. Look up every landmark in Grokipedia first to ensure accurate, factual information. Write in plain text with no markdown, no bullet points, no special formatting.',
          },
          {
            role: 'user',
            content: `Using Grokipedia, give a concise background on the landmark "${name}". Include what it is, its history, why it's notable, and one interesting fact. Keep it under 800 characters.`,
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

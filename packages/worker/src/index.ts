import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { queryOverpass } from './overpass';
import { generateSnippets } from './grok';
import { Bindings, LandmarkResponse } from './types';

const MAX_RADIUS = 2000;
const MIN_RADIUS = 50;
const CACHE_TTL = 86400; // 24 hours in seconds

function cacheKey(lat: number, lng: number, radius: number): string {
  return `landmarks:${lat.toFixed(3)}:${lng.toFixed(3)}:${radius}`;
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
    return c.json(cached as LandmarkResponse);
  }

  try {
    const pois = await queryOverpass(safeLat, safeLng, radius);

    if (pois.length === 0) {
      const emptyResponse: LandmarkResponse = { landmarks: [] };
      await c.env.LANDMARKS_CACHE.put(key, JSON.stringify(emptyResponse), {
        expirationTtl: CACHE_TTL,
      });
      return c.json(emptyResponse);
    }

    const landmarks = await generateSnippets(pois, c.env.XAI_API_KEY);
    const response: LandmarkResponse = { landmarks };
    c.executionCtx.waitUntil(
      c.env.LANDMARKS_CACHE.put(key, JSON.stringify(response), {
        expirationTtl: CACHE_TTL,
      })
    );
    return c.json(response);
  } catch (err) {
    console.error('[api] landmarks error:', err);
    return c.json({ error: 'Failed to fetch landmarks. Please try again.' }, 502);
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

  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${c.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4-1-fast-non-reasoning',
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
    return c.json({ detail: text });
  } catch (err) {
    console.error('[api] landmark-detail error:', err);
    return c.json({ detail: '' });
  }
});

app.get('/health', (c) => c.json({ status: 'ok' }));

export default app;

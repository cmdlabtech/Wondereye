import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { queryOverpass } from './overpass';
import { generateSnippets } from './claude';
import { Bindings } from './types';

const MAX_RADIUS = 2000;
const MIN_RADIUS = 50;
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
  const origin = c.env.ALLOWED_ORIGIN;
  if (!origin) {
    return c.json({ error: 'Service misconfigured' }, 500);
  }
  const middleware = cors({ origin });
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

  try {
    const pois = await queryOverpass(safeLat, safeLng, radius);

    if (pois.length === 0) {
      return c.json({ landmarks: [] });
    }

    const landmarks = await generateSnippets(pois, c.env.ANTHROPIC_API_KEY);
    return c.json({ landmarks });
  } catch (err) {
    console.error('[api] landmarks error:', err);
    return c.json({ error: 'Failed to fetch landmarks. Please try again.' }, 502);
  }
});

app.get('/health', (c) => c.json({ status: 'ok' }));

export default app;

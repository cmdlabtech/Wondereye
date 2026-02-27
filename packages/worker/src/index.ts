import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { queryOverpass } from './overpass';
import { generateSnippets } from './claude';
import { Bindings } from './types';

const app = new Hono<{ Bindings: Bindings }>();

app.use('/*', cors());

app.post('/api/landmarks', async (c) => {
  const body = await c.req.json();
  const { lat, lng, radius = 500 } = body;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return c.json({ error: 'lat and lng are required numbers' }, 400);
  }

  const pois = await queryOverpass(lat, lng, radius);

  if (pois.length === 0) {
    return c.json({ landmarks: [] });
  }

  const landmarks = await generateSnippets(pois, c.env.ANTHROPIC_API_KEY);

  return c.json({ landmarks });
});

app.get('/health', (c) => c.json({ status: 'ok' }));

export default app;

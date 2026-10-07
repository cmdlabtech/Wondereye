import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { buildIssue, checkAndCountRate, cleanText, validateFeedback, FEEDBACK_LIMITS } from '../src/feedback';

class FakeKV {
  store = new Map<string, string>();
  async get(k: string) { return this.store.get(k) ?? null; }
  async put(k: string, v: string) { this.store.set(k, v); }
}

const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
function body(over: Record<string, unknown> = {}) {
  return {
    category: 'bug',
    message: 'The globe stops spinning after I open a place card.',
    title: 'Spin stops',
    source: 'map',
    page: '/map',
    turnstileToken: TOKEN,
    elapsedMs: 9000,
    website: '',
    ...over,
  };
}

let kv: FakeKV;
let env: Record<string, unknown>;
let fetchMock: ReturnType<typeof vi.fn>;
let ipCounter = 0;

function turnstileOk(hostname = 'wondereye.app') {
  return new Response(JSON.stringify({ success: true, hostname }), { status: 200 });
}

function post(payload: unknown, opts: { origin?: string; ip?: string; raw?: string; contentType?: string } = {}) {
  const headers: Record<string, string> = {
    'content-type': opts.contentType ?? 'application/json',
    'cf-connecting-ip': opts.ip ?? `203.0.113.${++ipCounter}`,
    'user-agent': 'Mozilla/5.0 test',
  };
  if (opts.origin !== '') headers.origin = opts.origin ?? 'https://wondereye.app';
  const req = new Request('https://api.wondereye.app/api/feedback', {
    method: 'POST',
    headers,
    body: opts.raw ?? JSON.stringify(payload),
  });
  return app.fetch(req, env, { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext);
}

beforeEach(() => {
  kv = new FakeKV();
  env = {
    ALLOWED_ORIGIN: 'https://wondereye.app',
    LANDMARKS_CACHE: kv,
    XAI_API_KEY: 'unused',
    FEEDBACK_ENABLED: 'true',
    TURNSTILE_SECRET: 'test-secret',
    GITHUB_FEEDBACK_TOKEN: 'test-gh-token',
  };
  fetchMock = vi.fn(async (url: string | URL | Request) => {
    const u = String(url instanceof Request ? url.url : url);
    if (u.includes('siteverify')) return turnstileOk();
    if (u.startsWith('https://api.github.com/')) return new Response('{"number":1}', { status: 201 });
    throw new Error(`unexpected fetch ${u}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const githubCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).startsWith('https://api.github.com/'));
const turnstileCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes('siteverify'));

describe('POST /api/feedback happy path', () => {
  it('creates one labelled GitHub issue with no IP or email', async () => {
    const res = await post(body());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(githubCalls()).toHaveLength(1);
    const [url, init] = githubCalls()[0];
    expect(String(url)).toBe('https://api.github.com/repos/cmdlabtech/Wondereye/issues');
    const sent = JSON.parse(init.body);
    expect(sent.labels).toEqual(['feedback', 'needs-triage', 'source:map']);
    expect(sent.title).toBe('[Feedback] Spin stops');
    expect(sent.body).toContain('**Category:** bug');
    expect(sent.body).toContain('Mozilla/5.0 test');
    expect(sent.body).not.toMatch(/203\.0\.113/);
    expect(init.headers.Authorization).toBe('Bearer test-gh-token');
  });

  it('never calls GitHub in dry-run mode', async () => {
    env.FEEDBACK_DRY_RUN = 'true';
    const res = await post(body());
    expect(res.status).toBe(200);
    expect(githubCalls()).toHaveLength(0);
  });
});

describe('gates before any GitHub call', () => {
  it('is off unless FEEDBACK_ENABLED=true', async () => {
    env.FEEDBACK_ENABLED = undefined;
    expect((await post(body())).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed without secrets', async () => {
    env.TURNSTILE_SECRET = undefined;
    expect((await post(body())).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a foreign or missing Origin', async () => {
    expect((await post(body(), { origin: 'https://evil.example' })).status).toBe(403);
    expect((await post(body(), { origin: '' })).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows the loopback origin only for the app source', async () => {
    expect((await post(body(), { origin: 'http://127.0.0.1:51234' })).status).toBe(403);
    fetchMock.mockClear();
    const res = await post(body({ source: 'app', page: '/app', appVersion: '1.6.6' }), { origin: 'http://127.0.0.1:51234' });
    expect(res.status).toBe(200);
  });

  it('rejects non-JSON and oversized bodies', async () => {
    expect((await post(body(), { contentType: 'text/plain' })).status).toBe(415);
    expect((await post(null, { raw: '{"a":' })).status).toBe(400);
    expect((await post(null, { raw: JSON.stringify(body({ message: 'x'.repeat(7000) })) })).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unknown keys such as email', async () => {
    expect((await post(body({ email: 'a@b.c' }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('drops a filled honeypot with a fake success', async () => {
    const res = await post(body({ website: 'http://spam.example' }));
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects forms submitted too fast', async () => {
    expect((await post(body({ elapsedMs: 800 }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects messages with more than one link', async () => {
    const m = 'See https://a.example and https://b.example for details please';
    expect((await post(body({ message: m }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not file an issue when Turnstile fails', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('siteverify')
        ? new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), { status: 200 })
        : new Response('{}', { status: 201 }),
    );
    const res = await post(body());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "Feedback couldn't be sent. Please try again later." });
    expect(githubCalls()).toHaveLength(0);
  });

  it('does not file an issue when the Turnstile hostname is wrong', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('siteverify') ? turnstileOk('evil.example') : new Response('{}', { status: 201 }),
    );
    expect((await post(body())).status).toBe(403);
    expect(githubCalls()).toHaveLength(0);
  });

  it('treats an unreachable Turnstile as a failure', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('siteverify')) throw new Error('network');
      return new Response('{}', { status: 201 });
    });
    expect((await post(body())).status).toBe(403);
    expect(githubCalls()).toHaveLength(0);
  });
});

describe('rate limits and dedupe', () => {
  it('allows 3 per hour per IP, then 429 without calling Turnstile', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await post(body({ message: `Distinct feedback message number ${i}` }), { ip: '198.51.100.7' });
      expect(res.status).toBe(200);
    }
    const before = turnstileCalls().length;
    const res = await post(body({ message: 'Fourth distinct feedback message' }), { ip: '198.51.100.7' });
    expect(res.status).toBe(429);
    expect(turnstileCalls().length).toBe(before);
    expect(githubCalls()).toHaveLength(3);
  });

  it('enforces 10 per day per IP', async () => {
    const now = Date.UTC(2026, 9, 7, 0, 0, 0);
    for (let i = 0; i < 10; i++) {
      expect((await checkAndCountRate(kv as unknown as KVNamespace, '1.2.3.4', now + i * 3_600_000)).ok).toBe(true);
    }
    expect((await checkAndCountRate(kv as unknown as KVNamespace, '1.2.3.4', now + 10 * 3_600_000)).reason).toBe('rate_day');
  });

  it('stores no raw IP in KV keys', async () => {
    await post(body(), { ip: '198.51.100.99' });
    for (const k of kv.store.keys()) expect(k).not.toContain('198.51.100.99');
  });

  it('files an identical message only once', async () => {
    await post(body(), { ip: '192.0.2.1' });
    const res = await post(body({ message: 'the globe STOPS spinning after I open a place card!' }), { ip: '192.0.2.2' });
    expect(res.status).toBe(200);
    expect(githubCalls()).toHaveLength(1);
  });

  it('stops at the global daily cap', async () => {
    const day = Math.floor(Date.now() / 86_400_000);
    kv.store.set(`fb:rl:g:${day}`, String(FEEDBACK_LIMITS.globalPerDay));
    expect((await post(body())).status).toBe(429);
    expect(githubCalls()).toHaveLength(0);
  });
});

describe('sanitizing', () => {
  it('strips HTML and control characters', () => {
    expect(cleanText('<b>hi</b>\u0000 <script>x</script>there')).toBe('hi xthere');
  });

  it('fences user text so it cannot break out', () => {
    const v = validateFeedback(body({ message: 'Break ``` out @cmdlabtech ![x](https://a.example/i.png)' }));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const issue = buildIssue(v.value, 'UA');
    expect(issue.body).toContain('````text\nBreak ``` out @cmdlabtech');
  });

  it('requires strict types', () => {
    expect(validateFeedback(body({ category: 'spam' })).ok).toBe(false);
    expect(validateFeedback(body({ page: 'https://evil.example' })).ok).toBe(false);
    expect(validateFeedback(body({ appVersion: '1.6.6-beta<script>' })).ok).toBe(false);
    expect(validateFeedback(body({ title: 'x'.repeat(81) })).ok).toBe(false);
    expect(validateFeedback(body({ message: 'short' })).ok).toBe(false);
  });
});

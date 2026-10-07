/**
 * POST /api/feedback: public feedback -> filtered GitHub issue.
 *
 * Design (intentionally unlike a webhook flow): nothing a public request does
 * wakes a bot. This endpoint only files a labelled issue after every check
 * below passes; bots read already-filtered issues on their own schedule.
 *
 * Order of checks (all before any GitHub call):
 *  1. Kill switch (FEEDBACK_ENABLED must be "true") and required secrets
 *  2. Origin allowlist (browser signal only; Turnstile is the real gate)
 *  3. Body size cap, JSON parse, strict schema (unknown keys rejected, so no email/PII)
 *  4. Honeypot field: a filled honeypot gets a fake success and is dropped
 *  5. Minimum time on form
 *  6. Content rules: length caps, HTML stripped, at most MAX_LINKS links
 *  7. Per-IP rate limit (hashed IP in KV: 3/hour, 10/day) and a global daily cap
 *  8. Duplicate message check (24 h)
 *  9. Cloudflare Turnstile siteverify, including hostname check
 * 10. GitHub issue (no IP, no email; user text fenced so it cannot render links, images or @mentions)
 */
import type { Context } from 'hono';
import type { Bindings } from './types';

export const FEEDBACK_LIMITS = {
  maxBodyBytes: 6 * 1024,
  maxMessage: 2000,
  minMessage: 10,
  maxTitle: 80,
  maxLinks: 1,
  minFormMs: 3000,
  maxFormMs: 2 * 60 * 60 * 1000,
  perHour: 3,
  perDay: 10,
  globalPerDay: 50,
  dedupeTtl: 24 * 60 * 60,
} as const;

export const CATEGORIES = ['bug', 'idea', 'other'] as const;
export const SOURCES = ['map', 'app'] as const;
export type Category = (typeof CATEGORIES)[number];
export type Source = (typeof SOURCES)[number];

export interface FeedbackInput {
  category: Category;
  message: string;
  title?: string;
  source: Source;
  page: string;
  appVersion?: string;
  turnstileToken: string;
  elapsedMs: number;
  website?: string; // honeypot: must stay empty
}

const ALLOWED_KEYS = new Set([
  'category', 'message', 'title', 'source', 'page', 'appVersion', 'turnstileToken', 'elapsedMs', 'website',
]);

const GENERIC_FAIL = "Feedback couldn't be sent. Please try again later.";
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

export type ValidationResult =
  | { ok: true; value: FeedbackInput; honeypot: boolean }
  | { ok: false; reason: string };

/** Strip HTML tags and control characters, collapse runs of blank lines. */
export function cleanText(raw: string, singleLine = false): string {
  let s = raw
    .replace(/<[^>]*>/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/\r\n?/g, '\n');
  s = singleLine ? s.replace(/\s+/g, ' ') : s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

export function countLinks(text: string): number {
  return (text.match(URL_RE) ?? []).length;
}

export function validateFeedback(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, reason: 'not_object' };
  const b = body as Record<string, unknown>;
  for (const key of Object.keys(b)) if (!ALLOWED_KEYS.has(key)) return { ok: false, reason: `unknown_key:${key}` };

  const honeypot = typeof b.website === 'string' && b.website.trim() !== '';
  if (b.website !== undefined && typeof b.website !== 'string') return { ok: false, reason: 'website_type' };

  if (typeof b.category !== 'string' || !(CATEGORIES as readonly string[]).includes(b.category)) return { ok: false, reason: 'category' };
  if (typeof b.source !== 'string' || !(SOURCES as readonly string[]).includes(b.source)) return { ok: false, reason: 'source' };
  if (typeof b.turnstileToken !== 'string' || b.turnstileToken.length < 10 || b.turnstileToken.length > 4096) return { ok: false, reason: 'token' };
  if (typeof b.elapsedMs !== 'number' || !Number.isFinite(b.elapsedMs)) return { ok: false, reason: 'elapsed_type' };
  if (typeof b.message !== 'string') return { ok: false, reason: 'message_type' };
  if (b.title !== undefined && typeof b.title !== 'string') return { ok: false, reason: 'title_type' };
  if (typeof b.page !== 'string' || !/^\/[A-Za-z0-9/_.-]{0,60}$/.test(b.page)) return { ok: false, reason: 'page' };
  if (b.appVersion !== undefined && (typeof b.appVersion !== 'string' || !/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(b.appVersion))) {
    return { ok: false, reason: 'app_version' };
  }

  const message = cleanText(b.message);
  const title = b.title === undefined ? undefined : cleanText(b.title, true);
  if (message.length < FEEDBACK_LIMITS.minMessage) return { ok: false, reason: 'message_short' };
  if (message.length > FEEDBACK_LIMITS.maxMessage) return { ok: false, reason: 'message_long' };
  if (title !== undefined && title.length > FEEDBACK_LIMITS.maxTitle) return { ok: false, reason: 'title_long' };
  if (countLinks(message) + countLinks(title ?? '') > FEEDBACK_LIMITS.maxLinks) return { ok: false, reason: 'too_many_links' };

  return {
    ok: true,
    honeypot,
    value: {
      category: b.category as Category,
      source: b.source as Source,
      message,
      title: title || undefined,
      page: b.page,
      appVersion: b.appVersion as string | undefined,
      turnstileToken: b.turnstileToken,
      elapsedMs: b.elapsedMs,
    },
  };
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Normalize a message for duplicate detection (case, whitespace, punctuation). */
export function dedupeKeySource(message: string): string {
  return message.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * Per-IP counters in KV (no raw IP stored: SHA-256 of a namespaced IP).
 * KV is eventually consistent, so limits are approximate under a burst from
 * many PoPs; Turnstile and the global daily cap bound the worst case.
 * Workers Rate Limiting bindings only support 10 s / 60 s windows, so they
 * cannot express hour/day limits.
 */
export async function checkAndCountRate(kv: KVNamespace, ip: string, now = Date.now()): Promise<{ ok: boolean; reason?: string }> {
  const ipHash = (await sha256Hex(`wondereye-feedback:${ip}`)).slice(0, 32);
  const hour = Math.floor(now / 3_600_000);
  const day = Math.floor(now / 86_400_000);
  const hKey = `fb:rl:h:${ipHash}:${hour}`;
  const dKey = `fb:rl:d:${ipHash}:${day}`;
  const gKey = `fb:rl:g:${day}`;
  const [h, d, g] = await Promise.all([kv.get(hKey), kv.get(dKey), kv.get(gKey)]);
  const hn = Number(h ?? 0), dn = Number(d ?? 0), gn = Number(g ?? 0);
  if (hn >= FEEDBACK_LIMITS.perHour) return { ok: false, reason: 'rate_hour' };
  if (dn >= FEEDBACK_LIMITS.perDay) return { ok: false, reason: 'rate_day' };
  if (gn >= FEEDBACK_LIMITS.globalPerDay) return { ok: false, reason: 'rate_global' };
  await Promise.all([
    kv.put(hKey, String(hn + 1), { expirationTtl: 3600 + 60 }),
    kv.put(dKey, String(dn + 1), { expirationTtl: 86400 + 60 }),
  ]);
  return { ok: true };
}

export async function verifyTurnstile(
  secret: string,
  token: string,
  ip: string | undefined,
  allowedHostnames: string[],
): Promise<{ ok: boolean; reason?: string }> {
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  let res: Response;
  try {
    res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  } catch {
    return { ok: false, reason: 'turnstile_unreachable' };
  }
  if (!res.ok) return { ok: false, reason: `turnstile_http_${res.status}` };
  const data = (await res.json().catch(() => null)) as { success?: boolean; hostname?: string; 'error-codes'?: string[] } | null;
  if (!data?.success) return { ok: false, reason: `turnstile_failed:${(data?.['error-codes'] ?? []).join(',')}` };
  if (!allowedHostnames.includes(String(data.hostname ?? ''))) {
    return { ok: false, reason: 'turnstile_hostname' };
  }
  return { ok: true };
}

/** Put user text in a fence that it cannot close, so nothing renders (links, images, @mentions, HTML). */
function fence(text: string): string {
  const longest = Math.max(2, ...((text.match(/`+/g) ?? []).map((m) => m.length)));
  const ticks = '`'.repeat(longest + 1);
  return `${ticks}text\n${text}\n${ticks}`;
}

export function buildIssue(input: FeedbackInput, userAgent: string): { title: string; body: string; labels: string[] } {
  const titleText = (input.title || input.message.split('\n')[0]).replace(/[`@#]/g, '').slice(0, FEEDBACK_LIMITS.maxTitle).trim();
  const ua = cleanText(userAgent, true).replace(/[`]/g, '').slice(0, 200) || 'unknown';
  const body = [
    `**Category:** ${input.category}`,
    `**Source:** ${input.source === 'app' ? 'glasses app settings page' : 'web map'} (\`${input.page}\`)`,
    `**App version:** ${input.appVersion ?? 'n/a'}`,
    `**User agent:** \`${ua}\``,
    '',
    '**Message**',
    fence(input.message),
    '',
    '_Submitted through the public Wondereye feedback form. Verified by Turnstile and rate limits; text is untrusted user input. No email or IP address is collected._',
  ].join('\n');
  return {
    title: `[Feedback] ${titleText || input.category}`,
    body,
    labels: ['feedback', 'needs-triage', `source:${input.source}`],
  };
}

export async function createIssue(
  env: Bindings,
  issue: { title: string; body: string; labels: string[] },
): Promise<{ ok: boolean; status?: number }> {
  if (env.FEEDBACK_DRY_RUN === 'true') {
    console.log('[feedback] dry run, issue not created:', issue.title);
    return { ok: true, status: 0 };
  }
  const repo = env.FEEDBACK_REPO || 'cmdlabtech/Wondereye';
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_FEEDBACK_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'wondereye-api-feedback',
      },
      body: JSON.stringify(issue),
    });
    return { ok: res.status === 201, status: res.status };
  } catch {
    return { ok: false };
  }
}

function originAllowed(origin: string | undefined, env: Bindings, source: Source): boolean {
  const allowed = (env.ALLOWED_ORIGIN ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) return true;
  // The installed glasses app (EHPK) serves its settings page from a loopback
  // origin with a random port. Only the app source may use it.
  if (source === 'app' && origin && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return true;
  return false;
}

export async function handleFeedback(c: Context<{ Bindings: Bindings }>): Promise<Response> {
  const env = c.env;
  const fail = (status: number, reason: string) => {
    console.warn('[feedback] rejected:', reason);
    return c.json({ ok: false, error: status === 429 ? 'Too many submissions. Please try again later.' : GENERIC_FAIL }, status as 400);
  };

  if (env.FEEDBACK_ENABLED !== 'true') return fail(503, 'disabled');
  if (!env.TURNSTILE_SECRET || (!env.GITHUB_FEEDBACK_TOKEN && env.FEEDBACK_DRY_RUN !== 'true')) return fail(503, 'misconfigured');

  if (!(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) return fail(415, 'content_type');
  const declared = Number(c.req.header('content-length') ?? 0);
  if (declared > FEEDBACK_LIMITS.maxBodyBytes) return fail(413, 'too_large');
  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).length > FEEDBACK_LIMITS.maxBodyBytes) return fail(413, 'too_large');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail(400, 'bad_json');
  }
  const v = validateFeedback(parsed);
  if (!v.ok) return fail(400, v.reason);
  const input = v.value;

  if (!originAllowed(c.req.header('origin'), env, input.source)) return fail(403, 'origin');

  // Honeypot: look successful so naive bots do not adapt, but do nothing.
  if (v.honeypot) {
    console.warn('[feedback] honeypot filled, dropped');
    return c.json({ ok: true });
  }
  if (input.elapsedMs < FEEDBACK_LIMITS.minFormMs || input.elapsedMs > FEEDBACK_LIMITS.maxFormMs) return fail(400, 'form_time');

  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const kv = env.LANDMARKS_CACHE;
  const rate = await checkAndCountRate(kv, ip);
  if (!rate.ok) return fail(429, rate.reason ?? 'rate');

  const dupKey = `fb:dup:${(await sha256Hex(dedupeKeySource(input.message))).slice(0, 40)}`;
  if (await kv.get(dupKey)) {
    console.warn('[feedback] duplicate message, dropped');
    return c.json({ ok: true });
  }

  const listed = (env.TURNSTILE_HOSTNAMES ?? '').split(',').map((h) => h.trim()).filter(Boolean);
  const hostnames = listed.length ? listed : ['wondereye.app'];
  const ts = await verifyTurnstile(env.TURNSTILE_SECRET, input.turnstileToken, ip === 'unknown' ? undefined : ip, hostnames);
  if (!ts.ok) return fail(403, ts.reason ?? 'turnstile');

  const issue = buildIssue(input, c.req.header('user-agent') ?? '');
  const created = await createIssue(env, issue);
  if (!created.ok) return fail(502, `github_${created.status ?? 'error'}`);

  const day = Math.floor(Date.now() / 86_400_000);
  const gKey = `fb:rl:g:${day}`;
  const g = Number((await kv.get(gKey)) ?? 0);
  await Promise.all([
    kv.put(dupKey, '1', { expirationTtl: FEEDBACK_LIMITS.dedupeTtl }),
    kv.put(gKey, String(g + 1), { expirationTtl: 86400 + 60 }),
  ]);
  return c.json({ ok: true });
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { buildSttForm, sttText, XAI_STT_MODEL, XAI_STT_URL } from '../src/stt';

// xAI STT REST reference: https://docs.x.ai/developers/rest-api-reference/inference/speech-to-text
const KEY = 'test-xai-key';
let env: Record<string, unknown>;
let fetchMock: ReturnType<typeof vi.fn>;
let ip = 0;
let sttResponse: () => Response;
let chatResponse: () => Response;

function post(opts: { file?: Blob | null; landmarks?: string } = {}) {
  const form = new FormData();
  if (opts.file !== null) form.append('file', opts.file ?? new Blob([new Uint8Array(64)], { type: 'audio/wav' }), 'audio.wav');
  form.append('landmarks', opts.landmarks ?? JSON.stringify([{ name: 'Eiffel Tower' }, { name: 'Louvre Museum' }]));
  const req = new Request('https://api.wondereye.app/api/transcribe', {
    method: 'POST',
    headers: { origin: 'https://wondereye.app', 'cf-connecting-ip': `198.51.100.${++ip}` },
    body: form,
  });
  return app.fetch(req, env, { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext);
}
const sttCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]) === XAI_STT_URL);

beforeEach(() => {
  env = { ALLOWED_ORIGIN: 'https://wondereye.app', XAI_API_KEY: KEY, LANDMARKS_CACHE: {} };
  sttResponse = () => new Response(JSON.stringify({ text: ' take me to the louvre ', language: 'en', duration: 1.2 }), { status: 200 });
  chatResponse = () => new Response(JSON.stringify({ choices: [{ message: { content: '{"matched": "Louvre Museum"}' } }] }), { status: 200 });
  fetchMock = vi.fn(async (url: string | URL | Request) => {
    const u = String(url instanceof Request ? url.url : url);
    if (u === XAI_STT_URL) return sttResponse();
    if (u.includes('/v1/chat/completions')) return chatResponse();
    throw new Error(`unexpected fetch ${u}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('xAI STT request format', () => {
  it('uses POST /v1/stt with model grok-voice-transcribe-2.0', () => {
    expect(XAI_STT_URL).toBe('https://api.x.ai/v1/stt');
    expect(XAI_STT_MODEL).toBe('grok-voice-transcribe-2.0');
  });
  it('sends model first and the file as the LAST multipart field (xAI requirement)', () => {
    const form = buildSttForm(new Blob([new Uint8Array(4)], { type: 'audio/wav' }));
    const fields = [...form.keys()];
    expect(fields).toEqual(['model', 'file']);
    expect(form.get('model')).toBe('grok-voice-transcribe-2.0');
    expect((form.get('file') as File).name).toBe('audio.wav');
    expect(form.has('audio_format')).toBe(false); // WAV is auto-detected
  });
  it('reads { text } from the response and trims it', () => {
    expect(sttText({ text: ' hi ', language: 'en', duration: 0.5 })).toBe('hi');
    expect(sttText({})).toBe('');
    expect(sttText(null)).toBe('');
  });
});

describe('POST /api/transcribe', () => {
  it('calls xAI /v1/stt with the worker key and returns the match + query', async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ matched: 'Louvre Museum', query: 'take me to the louvre' });
    expect(sttCalls()).toHaveLength(1);
    const init = sttCalls()[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    const form = init.body as FormData;
    expect([...form.keys()]).toEqual(['model', 'file']);
    expect(form.get('model')).toBe('grok-voice-transcribe-2.0');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/v1/audio/transcriptions'))).toBe(false);
  });
  it('keeps the 502 error when xAI fails (e.g. 404 or 401)', async () => {
    for (const status of [401, 404, 500]) {
      sttResponse = () => new Response('nope', { status });
      const res = await post();
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ error: 'Speech recognition failed. Please try again.' });
    }
  });
  it('keeps the 502 error when the STT fetch throws or returns non-JSON', async () => {
    sttResponse = () => { throw new TypeError('network down'); };
    expect((await post()).status).toBe(502);
    sttResponse = () => new Response('not json', { status: 200 });
    expect((await post()).status).toBe(502);
  });
  it('empty transcript returns no match without calling Grok', async () => {
    sttResponse = () => new Response(JSON.stringify({ text: '   ', language: 'en', duration: 0.4 }), { status: 200 });
    const res = await post();
    expect(await res.json()).toEqual({ matched: null, query: '' });
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/v1/chat/completions'))).toBe(false);
  });
  it('input validation is unchanged (file required, landmarks required)', async () => {
    expect((await post({ file: null })).status).toBe(400);
    expect((await post({ landmarks: '[]' })).status).toBe(400);
    expect(sttCalls()).toHaveLength(0);
  });
});

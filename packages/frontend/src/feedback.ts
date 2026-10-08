// Phone settings page: Send Feedback form. Posts to the Worker's
// POST /api/feedback; all abuse checks (Turnstile, rate limits, honeypot,
// schema, origin) run server-side. No secret lives in this bundle; the
// Turnstile sitekey is public by design.
import { API_BASE_URL } from './constants';
import { getLang, t } from './i18n';

// Turnstile can't run on this page inside the Even Realities App: the
// installed .ehpk is served from http://127.0.0.1:<random port>, and Turnstile
// only authorizes real domain names (it fails with 110200, "Unable to connect
// to website"). So the widget runs in a small frame hosted on wondereye.app,
// which hands the token back with postMessage. The Worker still verifies every
// token (siteverify + hostname), so the server-side defenses are unchanged.
export const VERIFY_ORIGIN = 'https://wondereye.app';
const VERIFY_PATH = '/verify-frame';
const VERIFY_TIMEOUT_MS = 15000;
// Turnstile codes that a retry won't fix in this WebView: offer the web form.
const FATAL = /^(load|timeout|110[125]\d\d|200500|400\d{3})$/;

type VerifyMessage = { source?: string; event?: string; token?: string; code?: string };

export function verifyFrameUrl(parentOrigin: string, lang: string): string {
  const q = new URLSearchParams({ parent: parentOrigin, lang: lang === 'zh' ? 'zh-cn' : lang });
  return `${VERIFY_ORIGIN}${VERIFY_PATH}?${q.toString()}`;
}

/** True only for messages from our verify frame (right origin, right window). */
export function isVerifyMessage(e: Pick<MessageEvent, 'origin' | 'source' | 'data'>, frame: Window | null): boolean {
  const d = e.data as VerifyMessage | null;
  return e.origin === VERIFY_ORIGIN && !!frame && e.source === frame && !!d && d.source === 'wondereye-verify';
}

export function isFatalVerifyCode(code: string | undefined): boolean {
  return FATAL.test(String(code ?? ''));
}

export function initFeedbackForm(): void {
  const form = document.getElementById('feedback-form') as HTMLFormElement | null;
  const toggle = document.getElementById('feedback-toggle');
  if (!form || !toggle) return;

  const message = form.querySelector<HTMLTextAreaElement>('#feedback-message')!;
  const title = form.querySelector<HTMLInputElement>('#feedback-title')!;
  const honeypot = form.querySelector<HTMLInputElement>('input[name="website"]')!;
  const widget = form.querySelector<HTMLElement>('#feedback-turnstile')!;
  const submit = form.querySelector<HTMLButtonElement>('#feedback-submit')!;
  const status = document.getElementById('feedback-status')!;
  const fallback = document.getElementById('feedback-fallback');
  const count = document.getElementById('feedback-count')!;
  const catButtons = Array.from(form.querySelectorAll<HTMLButtonElement>('[data-category]'));

  let category = 'bug';
  let token = '';
  let openedAt = 0;
  let frame: HTMLIFrameElement | undefined;
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  let sending = false;

  const refresh = () => {
    count.textContent = `${message.value.length} / 2000`;
    submit.disabled = sending || !token || message.value.trim().length < 10;
  };

  catButtons.forEach((b) =>
    b.addEventListener('click', () => {
      category = b.dataset.category!;
      catButtons.forEach((x) => x.classList.toggle('active', x === b));
    }),
  );
  message.addEventListener('input', refresh);

  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    form.hidden = open;
    if (open || frame) return;
    openedAt = Date.now();
    mountVerifyFrame();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submit.disabled) return;
    sending = true;
    refresh();
    status.textContent = t('p.sending');
    let ok = false;
    let httpStatus = 0;
    try {
      const res = await fetch(`${API_BASE_URL}/api/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          category,
          message: message.value.trim(),
          title: title.value.trim() || undefined,
          source: 'app',
          page: '/app',
          appVersion: __APP_VERSION__,
          website: honeypot.value,
          elapsedMs: Date.now() - openedAt,
          turnstileToken: token,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      ok = res.ok && !!data.ok;
      httpStatus = res.status;
    } catch {
      /* network failure */
    }
    sending = false;
    if (ok) {
      form.reset();
      Array.from(form.children).forEach((el) => {
        if (el !== status) (el as HTMLElement).hidden = true;
      });
      status.textContent = t('p.thanks');
      return;
    }
    // The API's error text is English; show the localized equivalent.
    status.textContent = httpStatus === 429 ? t('p.fbTooMany') : t('p.fbError');
    token = '';
    frame?.contentWindow?.postMessage({ source: 'wondereye-verify', cmd: 'reset' }, VERIFY_ORIGIN);
    refresh();
  });

  const showFallback = () => {
    status.textContent = t('p.verifyFail');
    if (fallback) fallback.hidden = false;
  };

  const mountVerifyFrame = () => {
    frame = document.createElement('iframe');
    frame.className = 'feedback-verify';
    frame.title = 'Cloudflare Turnstile';
    frame.src = verifyFrameUrl(location.origin, getLang());
    widget.appendChild(frame);
    readyTimer = setTimeout(showFallback, VERIFY_TIMEOUT_MS);
  };

  window.addEventListener('message', (e) => {
    if (!isVerifyMessage(e, frame?.contentWindow ?? null)) return;
    const d = e.data as VerifyMessage;
    if (d.event === 'ready') {
      clearTimeout(readyTimer);
    } else if (d.event === 'token' && typeof d.token === 'string') {
      token = d.token.slice(0, 4096);
      if (status.textContent === t('p.verifyFail')) status.textContent = '';
    } else if (d.event === 'expired') {
      token = '';
    } else if (d.event === 'error') {
      token = '';
      clearTimeout(readyTimer);
      if (isFatalVerifyCode(d.code)) showFallback();
    }
    refresh();
  });

  refresh();
}

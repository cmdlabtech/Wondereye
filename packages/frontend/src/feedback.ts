// Phone settings page: Send Feedback form. Posts to the Worker's
// POST /api/feedback; all abuse checks (Turnstile, rate limits, honeypot,
// schema, origin) run server-side. No secret lives in this bundle; the
// Turnstile sitekey is public by design.
import { API_BASE_URL } from './constants';

const SITEKEY: string = import.meta.env.VITE_TURNSTILE_SITEKEY || '1x00000000000000000000AA'; // Cloudflare test key
const GENERIC_ERROR = "Feedback couldn't be sent. Please try again later.";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
};

function loadTurnstile(): Promise<TurnstileApi> {
  const w = window as unknown as { turnstile?: TurnstileApi };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error('turnstile')));
    s.onerror = () => reject(new Error('turnstile'));
    document.head.appendChild(s);
  });
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
  const count = document.getElementById('feedback-count')!;
  const catButtons = Array.from(form.querySelectorAll<HTMLButtonElement>('[data-category]'));

  let category = 'bug';
  let token = '';
  let openedAt = 0;
  let widgetId: string | undefined;
  let ts: TurnstileApi | undefined;
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
    if (open || widgetId) return;
    openedAt = Date.now();
    loadTurnstile()
      .then((api) => {
        ts = api;
        widgetId = api.render(widget, {
          sitekey: SITEKEY,
          theme: 'dark',
          size: 'flexible',
          action: 'feedback',
          callback: (t: string) => { token = t; refresh(); },
          'expired-callback': () => { token = ''; refresh(); },
          'error-callback': () => { token = ''; refresh(); },
        });
      })
      .catch(() => { status.textContent = 'Verification could not load. Please try again later.'; });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submit.disabled) return;
    sending = true;
    refresh();
    status.textContent = 'Sending…';
    let ok = false;
    let error = '';
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
      error = data.error ?? '';
    } catch {
      /* network failure */
    }
    sending = false;
    if (ok) {
      form.reset();
      Array.from(form.children).forEach((el) => {
        if (el !== status) (el as HTMLElement).hidden = true;
      });
      status.textContent = 'Thank you. Your feedback has been received and will be reviewed.';
      return;
    }
    status.textContent = error || GENERIC_ERROR;
    token = '';
    ts?.reset(widgetId);
    refresh();
  });

  refresh();
}

// Client side of POST /api/feedback. Every real check runs on the Worker;
// nothing here holds a secret. The Turnstile sitekey is public by design.

export const TURNSTILE_SITEKEY: string =
  import.meta.env.VITE_TURNSTILE_SITEKEY || "0x4AAAAAAFQyWWYVPcIJm6E7"; // public Turnstile sitekey (widget hostname: wondereye.app)
export const FEEDBACK_API: string = import.meta.env.VITE_FEEDBACK_API || "https://api.wondereye.app";

export type FeedbackCategory = "bug" | "idea" | "other";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loader: Promise<TurnstileApi> | null = null;

export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.defer = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    s.onerror = () => {
      loader = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(s);
  });
  return loader;
}

export async function sendFeedback(payload: {
  category: FeedbackCategory;
  message: string;
  title?: string;
  website: string;
  elapsedMs: number;
  turnstileToken: string;
  /** "app" when the glasses app sent the visitor here (/map?feedback=1&from=app). */
  source?: "map" | "app";
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${FEEDBACK_API}/api/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, title: payload.title || undefined, source: payload.source ?? "map", page: "/map" }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    return res.ok && data.ok ? { ok: true } : { ok: false, error: data.error };
  } catch {
    return { ok: false };
  }
}

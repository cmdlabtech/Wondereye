import { useEffect, useRef, useState } from "react";
import { Check, Loader2, MessageSquare, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { loadTurnstile, sendFeedback, TURNSTILE_SITEKEY, type FeedbackCategory } from "@/lib/feedback";

const CATEGORIES: { id: FeedbackCategory; label: string }[] = [
  { id: "bug", label: "Bug" },
  { id: "idea", label: "Idea" },
  { id: "other", label: "Other" },
];
const MAX_MESSAGE = 2000;
const MAX_TITLE = 80;
const GENERIC_ERROR = "Feedback couldn't be sent. Please try again later.";

export function FeedbackButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("pointer-events-auto", className)}>
      {open ? (
        <FeedbackForm onClose={() => setOpen(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="chrome flex h-9 items-center gap-2 rounded-full px-3.5 text-xs text-muted transition-colors duration-150 ease-out hover:text-fg active:scale-[0.96]"
        >
          <MessageSquare className="size-3.5" />
          Feedback
        </button>
      )}
    </div>
  );
}

function FeedbackForm({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot, hidden from people
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const openedAt = useRef(Date.now());
  const widgetEl = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((ts) => {
        if (cancelled || !widgetEl.current) return;
        widgetId.current = ts.render(widgetEl.current, {
          sitekey: TURNSTILE_SITEKEY,
          theme: "light",
          size: "flexible",
          action: "feedback",
          callback: (t: string) => setToken(t),
          "expired-callback": () => setToken(""),
          "error-callback": () => setToken(""),
        });
      })
      .catch(() => !cancelled && setError("Verification couldn't load. Please try again later."));
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
    };
  }, []);

  const canSend = message.trim().length >= 10 && !!token && status !== "sending";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    setStatus("sending");
    setError("");
    const res = await sendFeedback({
      category,
      message: message.trim(),
      title: title.trim(),
      website,
      elapsedMs: Date.now() - openedAt.current,
      turnstileToken: token,
    });
    if (res.ok) {
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = undefined;
      setStatus("sent");
      return;
    }
    setStatus("error");
    setError(res.error || GENERIC_ERROR);
    setToken("");
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
  }

  return (
    <article className="pin-card w-[min(22.5rem,calc(100vw-1.5rem))] px-5 pt-4 pb-4" aria-label="Send feedback">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <p className="flex items-center gap-2.5 pt-1.5 text-xs tracking-[0.18em] text-ink/45 uppercase">
          <MessageSquare className="size-3.5 text-primary" />
          Feedback
        </p>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="-mt-1 -mr-1.5 flex size-11 items-center justify-center text-ink/40 transition-colors duration-150 ease-out hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>

      {status === "sent" ? (
        <div className="pin-card-copy">
          <h2 className="mt-2 flex items-center gap-2 font-display text-2xl font-medium leading-[1.15] tracking-tight text-ink">
            <Check className="size-5 text-primary" />
            Thank you
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-pretty text-ink/65">
            Your feedback has been received and will be reviewed.
          </p>
          <div className="mt-4 flex justify-end">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      ) : (
        <form className="pin-card-copy mt-2" onSubmit={submit} noValidate>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Category">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={category === c.id}
                onClick={() => setCategory(c.id)}
                className={cn("place-chip", category === c.id && "is-on")}
              >
                {c.label}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={title}
            maxLength={MAX_TITLE}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            aria-label="Title (optional)"
            className="mt-3 h-10 w-full rounded-lg bg-surface px-3 text-sm text-ink shadow-[var(--shadow-ring)] outline-none placeholder:text-muted focus:bg-surface-2"
          />
          <textarea
            value={message}
            maxLength={MAX_MESSAGE}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What happened, or what would you like to see?"
            aria-label="Message"
            rows={4}
            required
            className="mt-2 w-full resize-none rounded-lg bg-surface px-3 py-2.5 text-sm leading-relaxed text-ink shadow-[var(--shadow-ring)] outline-none placeholder:text-muted focus:bg-surface-2"
          />
          {/* Honeypot: off-screen and skipped by keyboard/screen readers. */}
          <input
            type="text"
            name="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute -left-[9999px] h-px w-px opacity-0"
          />
          <p className="mt-1 text-right text-xs text-ink/40 tabular-nums">
            {message.length} / {MAX_MESSAGE}
          </p>

          <div ref={widgetEl} className="mt-2 min-h-[65px]" />

          {error ? (
            <p className="mt-2 text-xs text-primary" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs leading-snug text-ink/40">Posted publicly on GitHub. Please leave out personal details.</p>
            <button type="submit" className="btn btn-solid" disabled={!canSend}>
              {status === "sending" ? <Loader2 className="size-4 animate-spin" /> : null}
              Send
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

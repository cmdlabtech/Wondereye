import { useLayoutEffect, useMemo, useRef } from "react";
import { ArrowRight, Heart } from "lucide-react";
import { PinIcon, Wordmark } from "@/components/wordmark";
import { useGlobeSession, useOpenLandmark, useOpenMap } from "@/lib/globe-session";
import { formatType, pickFeatured } from "@/lib/landmarks";
import { cn } from "@/lib/cn";

// Locked PayPal donate button (same link as the glasses app settings page and /support).
const DONATE_URL = "https://www.paypal.com/donate/?hosted_button_id=Z5SDZULELYGNS";
const EVEN_REALITIES_URL = "https://www.evenrealities.com/";
const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";

const STEPS = [
  {
    title: "Browse",
    copy: "Scroll the list, pick a type, or search a name.",
  },
  {
    title: "Fly",
    copy: "The globe eases to the mark. Continents stay readable.",
  },
  {
    title: "Read",
    copy: "A short note waits on the pin.",
  },
];

export function LandingPage() {
  const slotRef = useRef<HTMLButtonElement>(null);
  const setSlot = useGlobeSession((s) => s.setSlot);
  const mode = useGlobeSession((s) => s.mode);
  const ready = useGlobeSession((s) => s.ready);
  const landmarks = useGlobeSession((s) => s.landmarks);
  const openMap = useOpenMap();
  const openLandmark = useOpenLandmark();
  const leaving = mode === "opening";
  const featured = useMemo(() => pickFeatured(landmarks, 4), [landmarks]);

  useLayoutEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    const report = () => {
      const r = el.getBoundingClientRect();
      const next = { x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.min(r.width, r.height) / 2 };
      if (next.r < 8) return;
      const prev = useGlobeSession.getState().slot;
      if (
        prev &&
        Math.abs(prev.x - next.x) < 0.5 &&
        Math.abs(prev.y - next.y) < 0.5 &&
        Math.abs(prev.r - next.r) < 0.5
      ) {
        return;
      }
      setSlot(next);
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    const host = el.closest("main") ?? el.parentElement;
    if (host && host !== el) ro.observe(host);
    window.addEventListener("resize", report);
    window.addEventListener("scroll", report, { passive: true });
    void document.fonts?.ready.then(report);
    const late = window.setTimeout(report, 350);
    return () => {
      window.clearTimeout(late);
      ro.disconnect();
      window.removeEventListener("resize", report);
      window.removeEventListener("scroll", report);
    };
  }, [setSlot]);

  return (
    <div className={cn("relative min-h-dvh bg-transparent text-fg", leaving && "is-leaving")}>
      <header className="landing-leave sticky top-0 z-20 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Wordmark />
          <button type="button" className="btn btn-solid pr-3.5" onClick={openMap} disabled={!ready}>
            Open the globe
            <ArrowRight className="size-4" />
          </button>
        </div>
      </header>

      <main>
        <section className="px-4 pt-12 pb-10 sm:px-6 sm:pt-20 sm:pb-16">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
            <div className="landing-leave relative z-20">
              <p className="rise flex items-center gap-2.5 text-xs tracking-[0.2em] text-muted uppercase">
                <PinIcon className="h-3 text-primary" />
                A globe of places
              </p>
              <h1 className="rise rise-2 mt-5 max-w-xl text-5xl leading-[1.05] text-fg sm:text-6xl lg:text-7xl">
                Come take a look.
              </h1>
              <p className="rise rise-3 mt-5 max-w-md text-base leading-relaxed text-muted sm:text-lg">
                Spin a sunlit earth, tap a mark, and read a short note. Each place was found by someone using
                Wondereye.
              </p>
              <p className="rise rise-3 mt-3 max-w-md text-sm leading-relaxed text-muted">
                Wondereye is an app for{" "}
                <a
                  href={EVEN_REALITIES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-fg underline-offset-4 hover:underline"
                >
                  Even Realities G2
                </a>{" "}
                smart glasses. It finds landmarks nearby and shows a short note about each one as text on the glasses
                display. Notes are written by Grok.
              </p>
              <div className="rise rise-4 mt-8 flex flex-wrap items-center gap-3">
                <button type="button" className="btn btn-solid pr-3.5" onClick={openMap} disabled={!ready}>
                  Open the globe
                  <ArrowRight className="size-4" />
                </button>
                <a href="#places" className="btn btn-ghost">
                  Start anywhere
                </a>
              </div>
            </div>

            <div className="mx-auto w-full max-w-md lg:max-w-none">
              <button
                ref={slotRef}
                type="button"
                onClick={openMap}
                disabled={!ready}
                className="hero-orb bg-transparent"
                aria-label={ready ? "Open the globe" : "Bringing the globe in"}
              />
              <p className="landing-leave relative z-20 mt-5 flex items-center justify-center gap-2.5 text-xs tracking-[0.2em] text-muted uppercase tabular-nums">
                <PinIcon className="h-2.5 text-primary" />
                {landmarks.length ? `${landmarks.length} places` : "Places"}
              </p>
            </div>
          </div>
        </section>

        {featured.length ? (
          <section id="places" className="landing-leave border-t border-border bg-bg px-4 py-14 sm:px-6 sm:py-16">
            <div className="mx-auto max-w-6xl">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-3xl text-fg sm:text-4xl">Start anywhere.</h2>
                  <p className="mt-3 max-w-md text-muted">Four notes from around the globe. The rest wait on the map.</p>
                </div>
                <button type="button" className="btn btn-ghost" onClick={openMap} disabled={!ready}>
                  Browse all
                </button>
              </div>
              <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {featured.map((m) => (
                  <li key={`${m.name}-${m.lat}`}>
                    <button
                      type="button"
                      className="feature-card flex h-full w-full flex-col px-5 py-5"
                      onClick={() => openLandmark(m)}
                      disabled={!ready}
                    >
                      <p className="flex items-center gap-2 text-xs tracking-[0.16em] text-muted uppercase">
                        <PinIcon className="h-3.5 text-primary" />
                        {formatType(m.type)}
                      </p>
                      <h3 className="mt-3 text-xl leading-snug text-fg">{m.name}</h3>
                      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{m.snippet}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        <section id="how" className="landing-leave border-t border-border bg-bg px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-3xl text-fg sm:text-4xl">Find a place.</h2>
            <p className="mt-3 max-w-md text-muted">Browse the list, or click a pin on the globe.</p>
            <ul className="mt-10 grid gap-3 sm:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="rounded-xl bg-paper px-5 py-6 shadow-ring sm:px-7 sm:py-8">
                  <p className="flex items-center gap-2.5 text-xs tracking-[0.18em] text-muted uppercase">
                    <PinIcon className="h-3 text-primary" />
                    0{i + 1}
                  </p>
                  <h3 className="mt-5 text-2xl text-fg">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{step.copy}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="landing-leave border-t border-border bg-bg px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2">
            <PinIcon className="h-2.5 text-primary" />
            Wondereye &copy; 2026 CMDLAB LLC
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <p>
              Earth: NASA Blue Marble · Place data{" "}
              <a
                href={OSM_COPYRIGHT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-4 hover:text-fg hover:underline"
              >
                &copy; OpenStreetMap contributors
              </a>{" "}
              · Drag to orbit · scroll to zoom
            </p>
            <a
              href={DONATE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 transition-colors hover:text-primary-dim hover:underline"
            >
              <Heart className="h-3 w-3" aria-hidden="true" />
              Support Wondereye
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

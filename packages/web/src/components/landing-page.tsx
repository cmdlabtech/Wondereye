import { useLayoutEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { PinIcon, Wordmark } from "@/components/wordmark";
import { useGlobeSession, useOpenMap } from "@/lib/globe-session";
import { cn } from "@/lib/cn";

const STEPS = [
  {
    title: "Search",
    copy: "A landmark by name, or any place on Earth.",
  },
  {
    title: "Fly",
    copy: "The globe eases to the mark. Continents stay readable.",
  },
  {
    title: "Read",
    copy: "A short note waits on the diamond.",
  },
];

export function LandingPage() {
  const slotRef = useRef<HTMLButtonElement>(null);
  const setSlot = useGlobeSession((s) => s.setSlot);
  const mode = useGlobeSession((s) => s.mode);
  const ready = useGlobeSession((s) => s.ready);
  const count = useGlobeSession((s) => s.landmarks.length);
  const openMap = useOpenMap();
  const leaving = mode === "opening";

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
    window.addEventListener("resize", report);
    window.addEventListener("scroll", report, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", report);
      window.removeEventListener("scroll", report);
    };
  }, [setSlot]);

  return (
    <div className={cn("relative min-h-dvh bg-transparent text-fg", leaving && "is-leaving")}>
      <header className="landing-leave sticky top-0 z-20 border-b border-border bg-bg px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Wordmark />
          <button type="button" className="btn btn-solid pr-3.5" onClick={openMap} disabled={!ready}>
            Open the map
            <ArrowRight className="size-4" />
          </button>
        </div>
      </header>

      <main>
        <section className="px-4 pt-12 pb-10 sm:px-6 sm:pt-20 sm:pb-16">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
            <div className="landing-leave relative z-20">
              <p className="rise flex items-center gap-2.5 text-xs tracking-[0.2em] text-muted uppercase">
                <PinIcon className="size-2.5 text-fg" />
                A globe of places
              </p>
              <h1 className="rise rise-2 mt-5 max-w-xl text-5xl leading-[1.05] text-fg sm:text-6xl lg:text-7xl">
                Look closer.
              </h1>
              <p className="rise rise-3 mt-5 max-w-md text-base leading-relaxed text-muted sm:text-lg">
                Search a place, spin the earth, land on the story. White diamonds mark the notes.
              </p>
              <div className="rise rise-4 mt-8 flex flex-wrap items-center gap-3">
                <button type="button" className="btn btn-solid pr-3.5" onClick={openMap} disabled={!ready}>
                  Open the map
                  <ArrowRight className="size-4" />
                </button>
                <a href="#how" className="btn btn-ghost">
                  How it works
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
                aria-label={ready ? "Open the map" : "Lighting the globe"}
              />
              <p className="landing-leave relative z-20 mt-5 flex items-center justify-center gap-2.5 text-xs tracking-[0.2em] text-muted uppercase tabular-nums">
                <PinIcon className="size-2 text-fg" />
                {count ? `${count} places` : "Places"}
              </p>
            </div>
          </div>
        </section>

        <section id="how" className="landing-leave landing-leave-slow border-t border-border bg-bg px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-3xl text-fg sm:text-4xl">Three motions.</h2>
            <p className="mt-3 max-w-md text-muted">Everything else stays out of the way.</p>
            <ul className="mt-10 grid gap-px bg-border sm:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="bg-bg p-5 sm:p-7">
                  <p className="flex items-center gap-2.5 text-xs tracking-[0.18em] text-muted uppercase">
                    <PinIcon className="size-2.5 text-fg" />
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

      <footer className="landing-leave landing-leave-slow border-t border-border bg-bg px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2">
            <PinIcon className="size-2 text-fg" />
            Wondereye
          </p>
          <p>Drag to orbit · scroll to zoom · click a mark</p>
        </div>
      </footer>
    </div>
  );
}

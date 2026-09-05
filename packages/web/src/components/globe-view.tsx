import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Pause, Play, Search } from "lucide-react";
import { FLY_LANDMARK_DIST, FLY_PLACE_DIST, type MarkerPick } from "@/lib/globe-types";
import { formatType, type Landmark } from "@/lib/landmarks";
import { Wordmark } from "@/components/wordmark";
import { PinCard } from "@/components/pin-card";
import { cn } from "@/lib/cn";
import { useCloseMap, useGlobeSession } from "@/lib/globe-session";

export function GlobeView() {
  const globe = useGlobeSession((s) => s.globe);
  const landmarks = useGlobeSession((s) => s.landmarks);
  const ready = useGlobeSession((s) => s.ready);
  const opening = useGlobeSession((s) => s.mode === "opening");
  const chromeZ = opening ? "z-20" : "z-30";
  const closeMap = useCloseMap();
  const popupRef = useRef<HTMLDivElement>(null);
  const hoverTipRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const pickRef = useRef<MarkerPick | null>(null);
  const hoverRef = useRef<MarkerPick | null>(null);

  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(-1);
  const [openResults, setOpenResults] = useState(false);
  const [pick, setPick] = useState<MarkerPick | null>(null);
  const [hover, setHover] = useState<MarkerPick | null>(null);
  const [spinning, setSpinning] = useState(true);

  pickRef.current = pick;
  hoverRef.current = hover;

  useEffect(() => {
    const g = globe;
    if (!g) return;
    g.holdIdleSpin(!!pick);
    if (pick) {
      g.setSpin(false);
      setSpinning(false);
    }
  }, [pick, globe]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return landmarks.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [landmarks, query]);

  useEffect(() => {
    if (!globe) return;
    globe.setHandlers({
      onPick: (p) => {
        setPick(p);
        if (p?.kind === "pin" && p.landmark) {
          globe.setFocus(p.landmark);
          setSpinning(false);
          void globe.flyTo(p.lat, p.lng, FLY_LANDMARK_DIST, 1000);
        } else {
          globe.setFocus(null);
        }
      },
      onHover: setHover,
    });
    setSpinning(globe.spinning);
    return () => {
      globe.setHandlers({
        onPick: () => {},
        onHover: () => {},
      });
    };
  }, [globe]);

  useEffect(() => {
    if (!globe) return;
    let raf = 0;
    const boxSize = (node: HTMLDivElement) => {
      const cached = node.dataset.box;
      if (cached) {
        const [w, h] = cached.split(",");
        return { w: Number(w) || 320, h: Number(h) || 200 };
      }
      const w = node.offsetWidth || 320;
      const h = node.offsetHeight || 200;
      node.dataset.box = `${w},${h}`;
      return { w, h };
    };
    const place = (node: HTMLDivElement | null, lat: number, lng: number, lift: number) => {
      if (!node) return;
      const pos = globe.project(lat, lng, lift);
      if (!pos || !pos.visible) {
        node.style.visibility = "hidden";
        return;
      }
      node.style.visibility = "visible";
      const { w: boxW, h: boxH } = boxSize(node);
      const header = 88;
      const stageH = window.innerHeight;
      const stageW = window.innerWidth;
      const gap = 16;
      const belowBottom = pos.y + gap + boxH;
      const aboveTop = pos.y - gap - boxH;
      const placeBelow = belowBottom <= stageH - 12 && (aboveTop < header || pos.y < stageH * 0.55);
      let top = placeBelow ? pos.y + gap : pos.y - gap - boxH;
      top = Math.min(Math.max(top, header), Math.max(header, stageH - boxH - 12));
      const half = boxW / 2;
      const left = Math.min(Math.max(pos.x, half + 10), stageW - half - 10);
      node.style.left = `${left}px`;
      node.style.top = `${top}px`;
      node.style.transform = "translate(-50%, 0)";
    };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const currentPick = pickRef.current;
      const currentHover = hoverRef.current;
      if (currentPick) place(popupRef.current, currentPick.lat, currentPick.lng, 0.048);
      if (currentHover) place(hoverTipRef.current, currentHover.lat, currentHover.lng, 0.036);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [globe]);

  useEffect(() => {
    delete popupRef.current?.dataset.box;
  }, [pick]);

  useEffect(() => {
    delete hoverTipRef.current?.dataset.box;
  }, [hover]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return;
      if (resultsRef.current?.contains(e.target)) return;
      const input = document.getElementById("we-search");
      if (input?.contains(e.target)) return;
      setOpenResults(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const selectLandmark = (lm: Landmark) => {
    setQuery(lm.name);
    setOpenResults(false);
    setPick({ kind: "pin", lat: lm.lat, lng: lm.lng, landmark: lm });
    const g = globe;
    if (!g) return;
    g.suppressPicks(700);
    g.setFocus(lm);
    setSpinning(false);
    void g.flyTo(lm.lat, lm.lng, FLY_LANDMARK_DIST);
  };

  const searchPlace = async (q: string) => {
    setOpenResults(false);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const results = (await res.json()) as { lat: string; lon: string; display_name?: string }[];
      const place = results?.[0];
      if (!place) return;
      const lat = parseFloat(place.lat);
      const lng = parseFloat(place.lon);
      const label = String(place.display_name ?? q);
      globe?.dropGeocode(lat, lng, label);
      setPick({ kind: "geocode", lat, lng, label });
      globe?.setFocus(null);
      setSpinning(false);
      void globe?.flyTo(lat, lng, FLY_PLACE_DIST);
    } catch {
      /* nominatim can block unnamed clients */
    }
  };

  const hoverLabel =
    hover?.landmark?.name ?? hover?.label ?? "";

  return (
    <div className="pointer-events-none">

      <header className={cn("map-chrome-enter pointer-events-none fixed inset-x-0 top-0 p-3 sm:p-4", chromeZ)}>
        <div className="mx-auto flex max-w-5xl items-center gap-2 sm:gap-3">
          <div className="pointer-events-auto hidden min-w-0 shrink-0 sm:block">
            <Wordmark
              to="/"
              size="md"
              kicker="Places"
              onClick={(e) => {
                e.preventDefault();
                closeMap();
              }}
            />
          </div>

          <div className="pointer-events-auto min-w-0 shrink-0 sm:hidden">
            <Wordmark
              to="/"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                closeMap();
              }}
            />
          </div>

          <div className="pointer-events-auto relative min-w-0 flex-1">
            <div className="chrome relative flex h-12 items-center">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
              <input
                id="we-search"
                type="text"
                inputMode="search"
                value={query}
                placeholder="Search landmarks or a place…"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpenResults(true);
                  setActiveIdx(-1);
                }}
                onFocus={() => query.trim() && setOpenResults(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (activeIdx >= 0 && activeIdx < matches.length) selectLandmark(matches[activeIdx]);
                    else if (matches[0]) selectLandmark(matches[0]);
                    else if (query.trim()) void searchPlace(query);
                  } else if (e.key === "Escape") {
                    setOpenResults(false);
                    (e.target as HTMLInputElement).blur();
                  } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    const max = matches.length;
                    setOpenResults(true);
                    setActiveIdx((i) =>
                      e.key === "ArrowDown" ? Math.min(i + 1, max) : Math.max(i - 1, 0),
                    );
                  }
                }}
                className="h-full w-full bg-transparent pr-4 pl-10 text-sm text-fg outline-none placeholder:text-muted"
              />
            </div>
            {openResults && query.trim() && (
              <div
                ref={resultsRef}
                className="chrome absolute top-full right-0 left-0 mt-2 overflow-hidden"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
              >
                {matches.map((m, i) => (
                  <button
                    key={`${m.name}-${m.lat}`}
                    type="button"
                    onClick={() => selectLandmark(m)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-fg transition-colors duration-150 ease-out",
                      i === activeIdx ? "bg-surface-2" : "hover:bg-surface-2",
                    )}
                  >
                    <span className="truncate">{m.name}</span>
                    <span className="shrink-0 text-xs tracking-[0.14em] text-muted uppercase">
                      {formatType(m.type)}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => void searchPlace(query)}
                  className={cn(
                    "w-full px-4 py-3 text-left text-sm text-muted italic",
                    activeIdx === matches.length ? "bg-surface-2" : "hover:bg-surface-2",
                  )}
                >
                  Search “{query.trim()}” as a place…
                </button>
              </div>
            )}
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            <span className="chrome hidden px-3 py-2 text-xs text-muted tabular-nums sm:inline">
              {landmarks.length ? `${landmarks.length}` : "—"}
            </span>
            <button
              type="button"
              aria-label={spinning ? "Pause spin" : "Resume spin"}
              onClick={() => {
                const next = !spinning;
                setSpinning(next);
                globe?.setSpin(next);
              }}
              className="chrome flex size-12 items-center justify-center text-fg transition-transform duration-150 ease-out active:scale-[0.96]"
            >
              {spinning ? <Pause className="size-4" /> : <Play className="size-4 ml-px" />}
            </button>
          </div>
        </div>
      </header>

      {!ready && (
        <div className="chrome pointer-events-none fixed top-20 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 px-4 py-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" />
          Lighting the globe…
        </div>
      )}

      <div
        ref={hoverTipRef}
        className={cn(
          "pin-tip pointer-events-none fixed z-30 px-3 py-1.5 text-xs tracking-wide",
          !hover ||
            (pick && hover.lat === pick.lat && hover.lng === pick.lng && hover.kind === pick.kind)
            ? "invisible"
            : "",
        )}
      >
        {hoverLabel}
      </div>

      <div
        ref={popupRef}
        className={cn(
          "fixed z-30 w-[min(22.5rem,calc(100vw-1.5rem))]",
          pick ? "pointer-events-auto" : "pointer-events-none invisible",
        )}
      >
        {pick ? (
          <PinCard
            key={`${pick.kind}-${pick.lat.toFixed(4)}-${pick.lng.toFixed(4)}`}
            pick={pick}
            onClose={() => setPick(null)}
          />
        ) : null}
      </div>

      <p className={cn("map-chrome-enter pointer-events-none fixed bottom-3 left-3 px-2 py-1 text-xs text-muted", chromeZ)}>
        Drag to orbit · scroll to zoom · click a pin
      </p>
    </div>
  );
}

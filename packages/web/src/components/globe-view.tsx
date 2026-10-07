import { useEffect, useMemo, useRef, useState } from "react";
import { List, Loader2, Pause, Play, Search, Shuffle } from "lucide-react";
import { FLY_LANDMARK_DIST, FLY_PLACE_DIST, type MarkerPick } from "@/lib/globe-types";
import { formatType, landmarkId, TYPE_GROUPS, type Landmark, type TypeGroup } from "@/lib/landmarks";
import { Wordmark } from "@/components/wordmark";
import { PinCard } from "@/components/pin-card";
import { PlacesPanel } from "@/components/places-panel";
import { cn } from "@/lib/cn";
import { useCloseMap, useGlobeSession } from "@/lib/globe-session";

export function GlobeView() {
  const globe = useGlobeSession((s) => s.globe);
  const landmarks = useGlobeSession((s) => s.landmarks);
  const ready = useGlobeSession((s) => s.ready);
  const opening = useGlobeSession((s) => s.mode === "opening");
  const pending = useGlobeSession((s) => s.pendingLandmark);
  const setPending = useGlobeSession((s) => s.setPendingLandmark);
  const chromeZ = opening ? "z-20" : "z-30";
  const closeMap = useCloseMap();
  const popupRef = useRef<HTMLDivElement>(null);
  const hoverTipRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const pickRef = useRef<MarkerPick | null>(null);
  const hoverRef = useRef<MarkerPick | null>(null);
  const visKeyRef = useRef("");
  const visAtRef = useRef(0);

  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(-1);
  const [openResults, setOpenResults] = useState(false);
  const [pick, setPick] = useState<MarkerPick | null>(null);
  const [hover, setHover] = useState<MarkerPick | null>(null);
  const [spinning, setSpinning] = useState(true);
  const [group, setGroup] = useState<TypeGroup>(TYPE_GROUPS[0]);
  const [visible, setVisible] = useState<Landmark[]>([]);
  const [panelOpen, setPanelOpen] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= 768,
  );

  pickRef.current = pick;
  hoverRef.current = hover;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return landmarks.filter((m) => {
      if (group.types && !group.types.includes(m.type)) return false;
      if (q && !m.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [landmarks, query, group]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return filtered.slice(0, 6);
  }, [filtered, query]);

  useEffect(() => {
    const g = globe;
    if (!g) return;
    g.holdIdleSpin(!!pick);
    if (pick) {
      g.setSpin(false);
      setSpinning(false);
    }
  }, [pick, globe]);

  useEffect(() => {
    globe?.setTypeFilter(group.types);
  }, [globe, group]);

  const flyToLandmark = (lm: Landmark) => {
    setOpenResults(false);
    setPick({ kind: "pin", lat: lm.lat, lng: lm.lng, landmark: lm });
    const g = globe;
    if (!g) return;
    g.suppressPicks(700);
    g.setFocus(lm);
    setSpinning(false);
    void g.flyTo(lm.lat, lm.lng, FLY_LANDMARK_DIST);
  };

  useEffect(() => {
    if (!pending || !globe || !ready) return;
    const lm = pending;
    setPending(null);
    flyToLandmark(lm);
  }, [pending, globe, ready, setPending]);

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
      const panel = document.getElementById("we-places");
      const panelBox = panel?.getBoundingClientRect();
      const rightInset =
        panelBox && stageW >= 768 && panelBox.width > 40 && panelBox.top < stageH * 0.7
          ? Math.max(0, stageW - panelBox.left) + 12
          : 12;
      const bottomInset =
        panelBox && stageW < 768 && panelBox.height > 40 ? Math.max(12, stageH - panelBox.top + 8) : 12;
      const gap = 16;
      const belowBottom = pos.y + gap + boxH;
      const aboveTop = pos.y - gap - boxH;
      const placeBelow = belowBottom <= stageH - bottomInset && (aboveTop < header || pos.y < stageH * 0.55);
      let top = placeBelow ? pos.y + gap : pos.y - gap - boxH;
      top = Math.min(Math.max(top, header), Math.max(header, stageH - boxH - bottomInset));
      const half = boxW / 2;
      const left = Math.min(Math.max(pos.x, half + 10), stageW - rightInset - half);
      node.style.left = `${left}px`;
      node.style.top = `${top}px`;
      node.style.transform = "translate(-50%, 0)";
    };
    const hide = (node: HTMLDivElement | null) => {
      if (!node) return;
      node.style.visibility = "hidden";
    };
    const sameSpot = (a: MarkerPick, b: MarkerPick) =>
      a.lat === b.lat && a.lng === b.lng && a.kind === b.kind;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const currentPick = pickRef.current;
      const currentHover = hoverRef.current;
      if (currentPick) place(popupRef.current, currentPick.lat, currentPick.lng, 0.08);
      else hide(popupRef.current);
      if (
        currentHover &&
        (currentHover.landmark?.name || currentHover.label) &&
        !(currentPick && sameSpot(currentHover, currentPick))
      ) {
        place(hoverTipRef.current, currentHover.lat, currentHover.lng, 0.07);
      } else {
        hide(hoverTipRef.current);
      }
      const now = performance.now();
      if (now - visAtRef.current > 180) {
        visAtRef.current = now;
        const vis = globe.visibleLandmarks(18);
        const key = vis.map(landmarkId).join("|");
        if (key !== visKeyRef.current) {
          visKeyRef.current = key;
          setVisible(vis);
        }
      }
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

  const searchPlace = async (q: string) => {
    setOpenResults(false);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const results = (await res.json()) as { lat: string; lon: string; display_name?: string }[];
      const placeHit = results?.[0];
      if (!placeHit) return;
      const lat = parseFloat(placeHit.lat);
      const lng = parseFloat(placeHit.lon);
      const label = String(placeHit.display_name ?? q);
      globe?.dropGeocode(lat, lng, label);
      setPick({ kind: "geocode", lat, lng, label });
      globe?.setFocus(null);
      setSpinning(false);
      void globe?.flyTo(lat, lng, FLY_PLACE_DIST);
    } catch {
      /* nominatim can block unnamed clients */
    }
  };

  const hopIdx = pick?.landmark ? filtered.findIndex((m) => landmarkId(m) === landmarkId(pick.landmark!)) : -1;
  const hoverLabel = hover?.landmark?.name ?? hover?.label ?? "";

  return (
    <div className="pointer-events-none">
      <header className={cn("map-chrome-enter pointer-events-none fixed inset-x-0 top-0 p-3 sm:p-4", chromeZ)}>
        <div className="mx-auto flex max-w-6xl items-center gap-2 sm:gap-3">
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
            <div className="chrome relative flex h-12 items-center rounded-full">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
              <input
                id="we-search"
                type="text"
                inputMode="search"
                value={query}
                placeholder="Search a landmark or a place…"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpenResults(true);
                  setActiveIdx(-1);
                  if (!panelOpen && window.innerWidth < 768) setPanelOpen(true);
                }}
                onFocus={() => query.trim() && setOpenResults(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (activeIdx >= 0 && activeIdx < matches.length) flyToLandmark(matches[activeIdx]);
                    else if (matches[0]) flyToLandmark(matches[0]);
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
            {openResults && query.trim() && !panelOpen && (
              <div
                ref={resultsRef}
                className="chrome absolute top-full right-0 left-0 mt-2 overflow-hidden rounded-xl"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
              >
                {matches.map((m, i) => (
                  <button
                    key={`${m.name}-${m.lat}`}
                    type="button"
                    onClick={() => flyToLandmark(m)}
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
            <button
              type="button"
              aria-label={panelOpen ? "Hide places" : "Show places"}
              aria-pressed={panelOpen}
              onClick={() => setPanelOpen((v) => !v)}
              className="chrome hidden size-12 items-center justify-center text-fg transition-transform duration-150 ease-out active:scale-[0.96] md:flex"
            >
              <List className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Surprise me"
              onClick={() => {
                if (!filtered.length) return;
                flyToLandmark(filtered[Math.floor(Math.random() * filtered.length)]);
              }}
              className="chrome flex size-12 items-center justify-center text-fg transition-transform duration-150 ease-out active:scale-[0.96]"
            >
              <Shuffle className="size-4" />
            </button>
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
          Bringing the globe in…
        </div>
      )}

      <PlacesPanel
        open={panelOpen}
        landmarks={landmarks}
        query={query}
        group={group}
        visible={visible}
        selected={pick?.landmark ?? null}
        onToggle={() => setPanelOpen((v) => !v)}
        onSelect={flyToLandmark}
        onGroup={setGroup}
      />

      <div
        ref={hoverTipRef}
        className="pin-tip pointer-events-none invisible fixed z-30 px-3 py-1.5 text-xs tracking-wide"
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
            onPrev={hopIdx > 0 ? () => flyToLandmark(filtered[hopIdx - 1]) : undefined}
            onNext={hopIdx >= 0 && hopIdx < filtered.length - 1 ? () => flyToLandmark(filtered[hopIdx + 1]) : undefined}
            indexLabel={hopIdx >= 0 ? `${hopIdx + 1} / ${filtered.length}` : undefined}
          />
        ) : null}
      </div>

      <p className={cn("map-chrome-enter pointer-events-none fixed bottom-3 left-3 hidden px-2 py-1 text-xs text-muted md:block", chromeZ)}>
        Drag to orbit · scroll to zoom · browse the list
      </p>
    </div>
  );
}

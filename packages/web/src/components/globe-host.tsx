import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { WonderGlobe } from "@/lib/globe-engine";
import { loadLandmarks } from "@/lib/landmarks";
import { useGlobeSession } from "@/lib/globe-session";
import { warmEarthImage } from "@/lib/globe-types";
import { cn } from "@/lib/cn";

const noop = () => {};
const GLOBE_SCREEN_K = 0.346;
warmEarthImage();

export function GlobeHost() {
  const stageRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<WonderGlobe | null>(null);
  const [animOn, setAnimOn] = useState(false);
  const [painted, setPainted] = useState(false);
  const [view, setView] = useState({ w: 1280, h: 800 });
  const mode = useGlobeSession((s) => s.mode);
  const slot = useGlobeSession((s) => s.slot);
  const setGlobe = useGlobeSession((s) => s.setGlobe);
  const setLandmarks = useGlobeSession((s) => s.setLandmarks);
  const setReady = useGlobeSession((s) => s.setReady);
  const setMode = useGlobeSession((s) => s.setMode);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const expanded = mode === "opening" || mode === "map";
  const live = mode === "map";

  useEffect(() => {
    if (pathname === "/map") {
      if (mode !== "map") setMode("map");
      return;
    }
    if (pathname === "/" && mode === "map") setMode("hero");
  }, [pathname, mode, setMode]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const globe = new WonderGlobe(el, {
      onPick: noop,
      onHover: noop,
      onReady: () => {
        document.documentElement.classList.add("globe-on");
        setPainted(true);
        setReady(true);
      },
    });
    globeRef.current = globe;
    setGlobe(globe);
    (window as unknown as { __wonderGlobe?: WonderGlobe }).__wonderGlobe = globe;
    void loadLandmarks()
      .then((list) => {
        setLandmarks(list);
        globe.setLandmarks(list);
      })
      .catch(() => {});
    return () => {
      const w = window as unknown as { __wonderGlobe?: WonderGlobe };
      if (w.__wonderGlobe === globe) delete w.__wonderGlobe;
      globe.dispose();
      globeRef.current = null;
      setGlobe(null);
    };
  }, [setGlobe, setLandmarks, setReady]);

  useEffect(() => {
    globeRef.current?.setPresentation(mode === "map" ? "map" : "hero");
  }, [mode]);

  useLayoutEffect(() => {
    const measure = () => setView({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (!slot) return;
    const t = window.setTimeout(() => setAnimOn(true), 40);
    return () => window.clearTimeout(t);
  }, [slot]);

  const s = slot?.r ?? 0;
  const globeR = Math.max(24, GLOBE_SCREEN_K * view.h);
  const heroScale = s > 0 ? (s * 0.72) / globeR : 0.55;
  const tx = slot ? slot.x - view.w / 2 : 0;
  const ty = slot ? slot.y - view.h / 2 : 0;
  const clip = expanded
    ? `circle(${Math.hypot(view.w, view.h)}px at ${view.w / 2}px ${view.h / 2}px)`
    : slot
      ? `circle(${s}px at ${slot.x}px ${slot.y}px)`
      : undefined;

  return (
    <div
      className={cn(
        "globe-frame",
        live && "is-live",
        expanded && "is-expanded",
        mode === "opening" && "is-opening",
        animOn && "can-anim",
        painted && "is-painted",
      )}
      style={clip ? { clipPath: clip } : undefined}
      aria-hidden={mode === "hero" || mode === "opening"}
    >
      <div
        ref={stageRef}
        className={cn("globe-host", animOn && "can-anim")}
        style={{
          transform: expanded || !slot ? "none" : `translate(${tx}px, ${ty}px) scale(${heroScale})`,
        }}
      />
    </div>
  );
}

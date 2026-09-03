import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import type { WonderGlobe } from "@/lib/globe-engine";
import { loadLandmarks, type Landmark } from "@/lib/landmarks";
import { useGlobeSession } from "@/lib/globe-session";
import { warmEarthImage } from "@/lib/globe-types";
import { cn } from "@/lib/cn";

warmEarthImage();

const noop = () => {};
const GLOBE_SCREEN_K = 0.346;

export function GlobeHost() {
  const stageRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<WonderGlobe | null>(null);
  const [painted, setPainted] = useState(false);
  const [view, setView] = useState({ w: 1280, h: 800 });
  const mode = useGlobeSession((s) => s.mode);
  const slot = useGlobeSession((s) => s.slot);
  const setGlobe = useGlobeSession((s) => s.setGlobe);
  const setLandmarks = useGlobeSession((s) => s.setLandmarks);
  const setReady = useGlobeSession((s) => s.setReady);
  const setMode = useGlobeSession((s) => s.setMode);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const expanded = mode === "opening" || mode === "map";
  const live = mode === "map";
  const morphing = mode === "opening" || mode === "closing";

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
    let alive = true;
    let globe: WonderGlobe | null = null;
    let release: ((g: WonderGlobe) => void) | null = null;

    void import("@/lib/globe-engine").then(({ acquireGlobe, releaseGlobe }) => {
      if (!alive || !stageRef.current) return;
      release = releaseGlobe;
      globe = acquireGlobe(stageRef.current, {
        onPick: noop,
        onHover: noop,
        onReady: () => {
          document.documentElement.classList.add("globe-on");
          setPainted(true);
          setReady(true);
        },
      });
      globe.setPresentation(modeRef.current === "map" ? "map" : "hero");
      globeRef.current = globe;
      setGlobe(globe);
      (window as unknown as { __wonderGlobe?: WonderGlobe }).__wonderGlobe = globe;
      const mounted = globe;
      const apply = (list: Landmark[]) => {
        if (globeRef.current !== mounted) return;
        setLandmarks(list);
        mounted.setLandmarks(list);
      };
      void loadLandmarks(apply).catch(() => {});
    });

    return () => {
      alive = false;
      const w = window as unknown as { __wonderGlobe?: WonderGlobe };
      if (globe && w.__wonderGlobe === globe) delete w.__wonderGlobe;
      if (globe && release) release(globe);
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
        morphing && "is-opening",
        morphing && "can-anim",
        painted && (live || !!slot) && "is-painted",
      )}
      style={clip ? { clipPath: clip } : undefined}
      aria-hidden={mode === "hero" || mode === "opening"}
    >
      <div
        ref={stageRef}
        className={cn("globe-host", morphing && "can-anim")}
        style={{
          transform: expanded || !slot ? "none" : `translate(${tx}px, ${ty}px) scale(${heroScale})`,
        }}
      />
    </div>
  );
}

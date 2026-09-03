import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { WonderGlobe } from "@/lib/globe-engine";
import { loadLandmarks, type Landmark } from "@/lib/landmarks";
import { useGlobeSession } from "@/lib/globe-session";
import { applyHeroFrame, applyMapFrame, animateToHero, animateToMap } from "@/lib/globe-morph";
import { warmEarthImage } from "@/lib/globe-types";
import { cn } from "@/lib/cn";

warmEarthImage();

const noop = () => {};

export function GlobeHost() {
  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<WonderGlobe | null>(null);
  const animRef = useRef<Animation | null>(null);
  const [painted, setPainted] = useState(false);
  const mode = useGlobeSession((s) => s.mode);
  const slot = useGlobeSession((s) => s.slot);
  const setGlobe = useGlobeSession((s) => s.setGlobe);
  const setLandmarks = useGlobeSession((s) => s.setLandmarks);
  const setReady = useGlobeSession((s) => s.setReady);
  const setMode = useGlobeSession((s) => s.setMode);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const openFromSlot = useRef(slot);
  if (mode === "hero" && slot) openFromSlot.current = slot;

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

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    if (mode === "map") {
      applyMapFrame(frame);
      globeRef.current?.setPresentation("map");
      return;
    }
    if (mode === "hero" && slot) {
      applyHeroFrame(frame, slot);
      globeRef.current?.setPresentation("hero");
    }
  }, [mode, slot]);

  useEffect(() => {
    const frame = frameRef.current;
    const from = openFromSlot.current;
    if (!frame || mode !== "opening" || !from) return;

    animRef.current?.cancel();
    globeRef.current?.setPresentation("hero");
    const anim = animateToMap(frame, from);
    animRef.current = anim;
    let alive = true;
    void anim.finished.then(
      () => {
        if (!alive) return;
        applyMapFrame(frame);
        anim.cancel();
        globeRef.current?.setPresentation("map");
        void navigate({ to: "/map" });
      },
      () => {},
    );
    return () => {
      alive = false;
      anim.cancel();
    };
  }, [mode, navigate]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || mode !== "closing" || !slot) return;

    animRef.current?.cancel();
    globeRef.current?.setPresentation("hero");
    const anim = animateToHero(frame, slot);
    animRef.current = anim;
    let alive = true;
    void anim.finished.then(
      () => {
        if (!alive) return;
        applyHeroFrame(frame, slot);
        anim.cancel();
        globeRef.current?.setPresentation("hero");
        setMode("hero");
      },
      () => {},
    );
    return () => {
      alive = false;
      anim.cancel();
    };
  }, [mode, slot, setMode]);

  const show = painted && (live || !!slot);

  return (
    <div
      ref={frameRef}
      className={cn(
        "globe-frame",
        live && "is-live",
        morphing && "is-morphing",
        mode === "hero" && "is-hero",
        show && "is-painted",
      )}
      aria-hidden={mode === "hero" || mode === "opening"}
    >
      <div ref={stageRef} className="globe-host" />
    </div>
  );
}

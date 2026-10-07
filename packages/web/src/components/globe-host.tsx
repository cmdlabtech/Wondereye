import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { WonderGlobe } from "@/lib/globe-engine";
import { loadLandmarks, type Landmark } from "@/lib/landmarks";
import { useGlobeSession } from "@/lib/globe-session";
import { applyHeroFrame, applyMapFrame, animateToHero, animateToMap } from "@/lib/globe-morph";
import { warmEarthImage } from "@/lib/globe-types";
import { cn } from "@/lib/cn";

warmEarthImage();

const globeEngine = import("@/lib/globe-engine");
const noop = () => {};

export function GlobeHost() {
  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<WonderGlobe | null>(null);
  const animRef = useRef<Animation | null>(null);
  const [painted, setPainted] = useState(false);
  const [mapLive, setMapLive] = useState(false);
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

  const live = mode === "map" || (mode === "opening" && mapLive);
  const morphing = mode === "opening" || mode === "closing";

  useEffect(() => {
    if (pathname === "/map") {
      if (mode === "opening" || mode === "closing") return;
      if (mode !== "map") setMode("map");
      return;
    }
    if (pathname === "/") {
      if (mode === "opening" || mode === "closing") return;
      if (mode === "map") setMode("hero");
    }
  }, [pathname, mode, setMode]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let alive = true;
    let globe: WonderGlobe | null = null;
    let release: ((g: WonderGlobe) => void) | null = null;

    void globeEngine.then(({ acquireGlobe, releaseGlobe }) => {
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
      globeRef.current = globe;
      globe.setPresentation(modeRef.current === "map" ? "map" : "hero");
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
      document.documentElement.classList.remove("globe-on");
      const w = window as unknown as { __wonderGlobe?: WonderGlobe };
      if (globe && w.__wonderGlobe === globe) delete w.__wonderGlobe;
      if (globe && release) release(globe);
      globeRef.current = null;
      setGlobe(null);
      setReady(false);
    };
  }, [setGlobe, setLandmarks, setReady]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    if (morphing) return;
    if (mode === "map") {
      applyMapFrame(frame);
      globeRef.current?.setPresentation("map");
      return;
    }
    if (slot) {
      applyHeroFrame(frame, slot);
      globeRef.current?.setPresentation("hero");
      return;
    }
    applyMapFrame(frame);
  }, [mode, slot, morphing]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame || mode !== "opening") return;
    const from = openFromSlot.current;
    if (!from) {
      void navigate({ to: "/map" });
      return;
    }
    const globe = globeRef.current;

    animRef.current?.cancel();
    setMapLive(false);
    globe?.setPresentation("map", { interactive: false });
    globe?.setResizePaused(true);
    const anim = animateToMap(frame, from);
    animRef.current = anim;
    let alive = true;
    void anim.finished.then(
      () => {
        if (!alive) return;
        applyMapFrame(frame);
        anim.cancel();
        globeRef.current?.setResizePaused(false);
        globeRef.current?.setPresentation("map");
        setMapLive(true);
        setMode("map");
        void navigate({ to: "/map" });
      },
      () => {},
    );
    return () => {
      alive = false;
      anim.cancel();
      globeRef.current?.setResizePaused(false);
    };
  }, [mode, navigate, setMode]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame || mode !== "closing") return;
    const to = openFromSlot.current;
    if (!to) {
      setMapLive(false);
      setMode("hero");
      return;
    }
    const globe = globeRef.current;

    animRef.current?.cancel();
    setMapLive(false);
    globe?.setResizePaused(true);
    globe?.freezeView();
    globe?.setPresentation("map", { interactive: false });
    const anim = animateToHero(frame, to);
    animRef.current = anim;
    let alive = true;
    void anim.finished.then(
      () => {
        if (!alive) return;
        applyHeroFrame(frame, to);
        anim.cancel();
        globeRef.current?.setResizePaused(false);
        globeRef.current?.setPresentation("hero");
        setMode("hero");
      },
      () => {},
    );
    return () => {
      alive = false;
      anim.cancel();
      globeRef.current?.setResizePaused(false);
    };
  }, [mode, setMode]);

  const show = painted && (live || !!slot || morphing);

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
      aria-hidden={mode === "hero" || (mode === "opening" && !mapLive)}
    >
      <div ref={stageRef} className="globe-host" />
    </div>
  );
}

import { create } from "zustand";
import { useNavigate } from "@tanstack/react-router";
import type { Landmark } from "./landmarks";
import type { WonderGlobe } from "./globe-engine";
import { prefersReducedMotion } from "./globe-morph";

export type GlobeMode = "hero" | "opening" | "map" | "closing";

export type GlobeSlot = {
  x: number;
  y: number;
  r: number;
};

type GlobeSession = {
  mode: GlobeMode;
  slot: GlobeSlot | null;
  globe: WonderGlobe | null;
  landmarks: Landmark[];
  ready: boolean;
  pendingLandmark: Landmark | null;
  setMode: (mode: GlobeMode) => void;
  setSlot: (slot: GlobeSlot | null) => void;
  setGlobe: (globe: WonderGlobe | null) => void;
  setLandmarks: (landmarks: Landmark[]) => void;
  setReady: (ready: boolean) => void;
  setPendingLandmark: (landmark: Landmark | null) => void;
};

export const useGlobeSession = create<GlobeSession>((set) => ({
  mode: "hero",
  slot: null,
  globe: null,
  landmarks: [],
  ready: false,
  pendingLandmark: null,
  setMode: (mode) => set({ mode }),
  setSlot: (slot) => set({ slot }),
  setGlobe: (globe) => set({ globe }),
  setLandmarks: (landmarks) => set({ landmarks }),
  setReady: (ready) => set({ ready }),
  setPendingLandmark: (pendingLandmark) => set({ pendingLandmark }),
}));

export function useOpenMap() {
  const navigate = useNavigate();

  return () => {
    const { mode, ready, setMode } = useGlobeSession.getState();
    if (!ready || mode === "opening" || mode === "map") return;
    if (prefersReducedMotion()) {
      setMode("map");
      void navigate({ to: "/map" });
      return;
    }
    setMode("opening");
  };
}

export function useOpenLandmark() {
  const openMap = useOpenMap();
  const setPendingLandmark = useGlobeSession((s) => s.setPendingLandmark);

  return (landmark: Landmark) => {
    setPendingLandmark(landmark);
    openMap();
  };
}

export function useCloseMap() {
  const navigate = useNavigate();
  const setMode = useGlobeSession((s) => s.setMode);
  const mode = useGlobeSession((s) => s.mode);

  return () => {
    if (mode === "closing" || mode === "hero") {
      void navigate({ to: "/" });
      return;
    }
    if (prefersReducedMotion()) {
      setMode("hero");
      void navigate({ to: "/" });
      return;
    }
    setMode("closing");
    void navigate({ to: "/" });
  };
}

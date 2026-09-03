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
  setMode: (mode: GlobeMode) => void;
  setSlot: (slot: GlobeSlot | null) => void;
  setGlobe: (globe: WonderGlobe | null) => void;
  setLandmarks: (landmarks: Landmark[]) => void;
  setReady: (ready: boolean) => void;
};

export const useGlobeSession = create<GlobeSession>((set) => ({
  mode: "hero",
  slot: null,
  globe: null,
  landmarks: [],
  ready: false,
  setMode: (mode) => set({ mode }),
  setSlot: (slot) => set({ slot }),
  setGlobe: (globe) => set({ globe }),
  setLandmarks: (landmarks) => set({ landmarks }),
  setReady: (ready) => set({ ready }),
}));

export function useOpenMap() {
  const navigate = useNavigate();
  const setMode = useGlobeSession((s) => s.setMode);
  const mode = useGlobeSession((s) => s.mode);

  return () => {
    if (mode === "opening" || mode === "map") return;
    if (prefersReducedMotion()) {
      setMode("map");
      void navigate({ to: "/map" });
      return;
    }
    setMode("opening");
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

import type { Landmark } from "./landmarks";

export type MarkerKind = "pin" | "geocode";

export type MarkerPick = {
  kind: MarkerKind;
  lat: number;
  lng: number;
  landmark?: Landmark;
  label?: string;
};

export const FLY_LANDMARK_DIST = 1.42;
export const FLY_PLACE_DIST = 1.32;
// Hashed by Vite (served from /assets/ with an immutable cache). index.html
// preloads this same file with crossorigin="anonymous", matching the
// TextureLoader's default CORS mode, so the browser fetches it exactly once.
export { default as EARTH_URL } from "../assets/earth-blue-marble.webp";
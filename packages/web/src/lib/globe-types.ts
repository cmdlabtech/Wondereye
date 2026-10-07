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
export const EARTH_URL = "/earth-fs6.jpg";

export function warmEarthImage() {
  if (typeof window === "undefined") return;
  const img = new Image();
  img.decoding = "async";
  img.src = EARTH_URL;
}
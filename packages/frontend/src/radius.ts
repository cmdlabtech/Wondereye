import { SEARCH_RADIUS } from './constants';

const KEY = 'wondereye-radius';

// Bounds must stay within the worker's clamp (MIN_RADIUS=50, MAX_RADIUS=2000).
export const RADIUS_MIN = 250;
export const RADIUS_MAX = SEARCH_RADIUS; // 2000
export const RADIUS_STEP = 250;

export function getRadius(): number {
  const raw = Number(localStorage.getItem(KEY));
  if (!Number.isFinite(raw) || raw <= 0) return SEARCH_RADIUS;
  return Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, raw));
}

export function setRadius(meters: number): void {
  const clamped = Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, Math.round(meters)));
  localStorage.setItem(KEY, String(clamped));
}

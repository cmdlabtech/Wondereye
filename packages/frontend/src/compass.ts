import { AppState } from './types';
import { renderList } from './renderer';

// IMU x-axis: assumed to be the yaw (left-right rotation) channel on G2 glasses.
// The raw unit-to-degree mapping is empirical — tune IMU_DEGREES_PER_UNIT against
// the physical device if highlighting feels too sensitive or too sluggish.
// NOTE: headingOffset is RELATIVE to the user's startup orientation, not absolute
// compass north. compassReference anchors the relative frame to real-world bearings
// by treating the median landmark bearing as "straight ahead" at calibration.
const IMU_DEGREES_PER_UNIT = 30; // raw IMU units → degrees of head rotation
const FOV_DEGREES = 20;           // landmark is "in view" if within ±20° of heading
const RENDER_DEBOUNCE_MS = 150;   // max one list re-render per 150ms from compass

// Module-level state — reset when imuBaseline is cleared (i.e., after each landmark refresh)
let compassReference: number | null = null;
let lastRenderTime = 0;

/** Convert a bearing in degrees to an 8-point cardinal label (N, NE, E, …). */
export function cardinalDirection(bearing: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(((bearing % 360) + 360) % 360 / 45) % 8;
  return dirs[idx];
}

/** Compute the absolute GPS bearing (degrees, -180..180) from one point to another. */
export function bearingTo(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => d * Math.PI / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return Math.atan2(y, x) * 180 / Math.PI;
}

/** Shortest angular difference between two headings (-180..180). */
function angleDiff(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
}

/** Compute the median GPS bearing from the user to all landmarks with known coordinates. */
function computeCompassReference(state: AppState): number | null {
  if (state.userLat == null || state.userLng == null) return null;
  const bearings = state.landmarks
    .filter(l => l.lat != null && l.lng != null)
    .map(l => bearingTo(state.userLat!, state.userLng!, l.lat!, l.lng!))
    .sort((a, b) => a - b);
  if (bearings.length === 0) return null;
  return bearings[Math.floor(bearings.length / 2)];
}

/**
 * Call from the IMU event handler on each heading update.
 * Reads x (yaw) to determine which landmark the user is facing and updates
 * state.compassHighlight. Debounces renderList calls to avoid thrashing at 200Hz.
 *
 * Called from main.ts via initIMU's onHeadingUpdate callback.
 */
export function updateCompassHeading(state: AppState, x: number): void {
  // Calibration: first call establishes the baseline. If imuBaseline was reset
  // (e.g., after a landmark refresh), compassReference is also reset here.
  if (state.imuBaseline == null) {
    compassReference = null;
    state.imuBaseline = x;
    compassReference = computeCompassReference(state);
    return;
  }

  // Only update compass highlight in list mode
  if (state.mode !== 'list') {
    if (state.compassHighlight != null) {
      state.compassHighlight = null;
    }
    return;
  }

  if (state.userLat == null || state.userLng == null) return;

  // Lazy-init reference if landmarks weren't available at calibration time
  if (compassReference == null) {
    compassReference = computeCompassReference(state);
    if (compassReference == null) return;
  }

  const headingOffset = (x - state.imuBaseline) * IMU_DEGREES_PER_UNIT;
  const targetBearing = compassReference + headingOffset;

  let closestIndex: number | null = null;
  let closestDelta = FOV_DEGREES;

  for (let i = 0; i < state.landmarks.length; i++) {
    const lm = state.landmarks[i];
    if (lm.lat == null || lm.lng == null) continue;
    const bearing = bearingTo(state.userLat, state.userLng, lm.lat, lm.lng);
    const delta = Math.abs(angleDiff(bearing, targetBearing));
    if (delta < closestDelta) {
      closestDelta = delta;
      closestIndex = i;
    }
  }

  const prev = state.compassHighlight;
  state.compassHighlight = closestIndex;

  if (prev !== closestIndex) {
    const now = Date.now();
    if (now - lastRenderTime >= RENDER_DEBOUNCE_MS) {
      lastRenderTime = now;
      renderList(state).catch(() => {});
    }
  }
}

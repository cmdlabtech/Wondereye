import { getGeoEnabled } from './geo-settings';

export type LocationError =
  | { code: 'unsupported'; message: string }
  | { code: 'denied'; message: string }
  | { code: 'unavailable'; message: string }
  | { code: 'timeout'; message: string };

const CACHE_KEY = 'wondereye-last-location';

interface CachedFix {
  lat: number;
  lng: number;
  ts: number;
}

/**
 * Return the last successfully obtained position, if any.
 * Used as a fallback when geolocation is disabled or fails so a single good
 * fix keeps the app usable across launches.
 */
export function getCachedLocation(): { lat: number; lng: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const fix = JSON.parse(raw) as CachedFix;
    if (typeof fix.lat === 'number' && typeof fix.lng === 'number') {
      return { lat: fix.lat, lng: fix.lng };
    }
  } catch {
    // ignore corrupt cache
  }
  return null;
}

function cacheLocation(lat: number, lng: number): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ lat, lng, ts: Date.now() } as CachedFix));
  } catch {
    // ignore quota / storage errors
  }
}

function requestPosition(opts: PositionOptions): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        // PositionError.code: 1=denied, 2=unavailable (position), 3=timeout
        let mapped: LocationError;
        if (err.code === 1) {
          mapped = { code: 'denied', message: 'Location permission denied.' };
        } else if (err.code === 3) {
          mapped = { code: 'timeout', message: 'Location request timed out.' };
        } else {
          mapped = { code: 'unavailable', message: 'Location unavailable.' };
        }
        reject(mapped);
      },
      opts,
    );
  });
}

/**
 * Get the current position via the Even Hub WebView's browser geolocation.
 *
 * This requires the `location` permission in app.json and only works when the
 * app runs as a formal Hub plugin (QR sideload returns PERMISSION_DENIED).
 *
 * On success the fix is cached so it survives later failures/relaunches.
 * If the kill-switch (settings toggle) is off, throws `denied` immediately so
 * callers fall back to the cached fix or the Prague fallback.
 */
export async function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  if (!getGeoEnabled()) {
    throw { code: 'denied', message: 'Device location is turned off in settings.' } as LocationError;
  }

  if (!('geolocation' in navigator)) {
    throw { code: 'unsupported', message: 'Geolocation is not supported.' } as LocationError;
  }

  // Try high-accuracy GPS first, then fall back to a faster low-accuracy fix
  // (mirrors the two-try pattern proven in the old phone setup flow).
  let fix: { lat: number; lng: number };
  try {
    fix = await requestPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
  } catch {
    fix = await requestPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
  }

  cacheLocation(fix.lat, fix.lng);
  return fix;
}

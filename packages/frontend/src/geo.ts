import { AppLocationAccuracy } from '@evenrealities/even_hub_sdk';
import type { AppLocation, AppLocationOptions } from '@evenrealities/even_hub_sdk';
import { getBridge } from './bridge';
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

function isValidFix(loc: AppLocation | null): loc is AppLocation {
  return !!loc
    && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)
    && loc.latitude >= -90 && loc.latitude <= 90
    && loc.longitude >= -180 && loc.longitude <= 180
    // Null Island means an uninitialized fix from the host, not a real position
    && !(loc.latitude === 0 && loc.longitude === 0);
}

function requestAppLocation(opts: AppLocationOptions, hardTimeoutMs: number): Promise<{ lat: number; lng: number }> {
  // Outer guard: on host app versions that predate SDK 0.0.11, or when the
  // native side never responds, getAppLocation() can hang instead of
  // rejecting — and would otherwise stall loadLandmarks() at "Getting
  // location…" forever. This ceiling guarantees we always settle so callers
  // can fall back to the cached fix or Prague.
  let guard: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    guard = setTimeout(() => {
      reject({ code: 'timeout', message: 'Location request timed out.' } as LocationError);
    }, hardTimeoutMs);
  });

  const request = getBridge()
    .getAppLocation(opts)
    .then((loc) => {
      if (!isValidFix(loc)) {
        // Host returned no result (null) or invalid coordinates
        throw { code: 'unavailable', message: 'Location unavailable.' } as LocationError;
      }
      return { lat: loc.latitude, lng: loc.longitude };
    })
    .catch((e) => {
      // Optional chain: a raw bridge can reject with null/undefined
      if ((e as LocationError)?.code) throw e;
      // Raw bridge rejection — sniff for a permission denial, otherwise
      // treat as unavailable (covers hosts without the location method).
      const msg = e instanceof Error ? e.message : String(e);
      if (/denied|permission/i.test(msg)) {
        throw { code: 'denied', message: 'Location permission denied.' } as LocationError;
      }
      throw { code: 'unavailable', message: 'Location unavailable.' } as LocationError;
    });

  return Promise.race([request, timeout]).finally(() => clearTimeout(guard));
}

/**
 * Get the current position from the phone via the SDK bridge
 * (`getAppLocation`, added in even_hub_sdk 0.0.11). The G2 glasses have no
 * GPS; the fix comes from the companion app on the phone. Requires the
 * `location` permission in app.json.
 *
 * Never touches `navigator.geolocation` — the EvenHub WebView denies it and
 * older builds crashed outright.
 *
 * On success the fix is cached so it survives later failures/relaunches.
 * If the kill-switch (settings toggle) is off, throws `denied` immediately so
 * callers fall back to the cached fix or the Prague fallback.
 */
export async function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  if (!getGeoEnabled()) {
    throw { code: 'denied', message: 'Device location is turned off in settings.' } as LocationError;
  }

  try {
    getBridge();
  } catch {
    throw { code: 'unsupported', message: 'Even app bridge is not available.' } as LocationError;
  }

  // Try a high-accuracy fix first, then fall back to a faster low-accuracy
  // one (mirrors the two-try pattern proven in the old phone setup flow).
  // Each attempt has a hard ceiling slightly above its requested timeout so
  // a hung native call can't stall us indefinitely.
  let fix: { lat: number; lng: number };
  try {
    fix = await requestAppLocation({ accuracy: AppLocationAccuracy.High, timeoutMs: 8000 }, 10000);
  } catch (e) {
    const code = (e as LocationError)?.code;
    // A denied/unsupported result won't change on a low-accuracy retry — bail now
    // rather than making the user wait through a second timeout.
    if (code === 'denied' || code === 'unsupported') throw e;
    fix = await requestAppLocation({ accuracy: AppLocationAccuracy.Low, timeoutMs: 5000 }, 7000);
  }

  cacheLocation(fix.lat, fix.lng);
  return fix;
}

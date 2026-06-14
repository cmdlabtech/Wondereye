import { EvenAppBridge } from '@evenrealities/even_hub_sdk';

export type LocationError =
  | { code: 'unsupported'; message: string }
  | { code: 'denied'; message: string }
  | { code: 'unavailable'; message: string }
  | { code: 'timeout'; message: string };

const LOCATION_CACHE_KEY = 'wondereye-location';
const LOCATION_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

export interface CachedLocation {
  lat: number;
  lng: number;
  timestamp: number;
}

/**
 * Get cached location from glasses storage.
 * Returns null if no cache exists or cache has expired.
 */
export async function getCachedLocation(bridge: EvenAppBridge): Promise<CachedLocation | null> {
  try {
    const raw = await bridge.getLocalStorage(LOCATION_CACHE_KEY);
    if (!raw) return null;

    const cached: CachedLocation = JSON.parse(raw);
    
    // Check if cache has expired (7 days)
    const now = Date.now();
    if (now - cached.timestamp > LOCATION_CACHE_TTL) {
      console.log('[geo] location cache expired');
      return null;
    }

    console.log('[geo] using cached location');
    return cached;
  } catch (err) {
    console.warn('[geo] getCachedLocation failed:', err);
    return null;
  }
}

/**
 * Cache location on glasses storage.
 */
export async function cacheLocation(bridge: EvenAppBridge, lat: number, lng: number): Promise<void> {
  // Validate coordinates
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    console.warn('[geo] invalid coordinates, not caching:', lat, lng);
    return;
  }

  try {
    const cached: CachedLocation = {
      lat,
      lng,
      timestamp: Date.now(),
    };
    await bridge.setLocalStorage(LOCATION_CACHE_KEY, JSON.stringify(cached));
    console.log('[geo] location cached');
  } catch (err) {
    console.warn('[geo] cacheLocation failed:', err);
  }
}

/**
 * Clear cached location from glasses storage.
 */
export async function clearCachedLocation(bridge: EvenAppBridge): Promise<void> {
  try {
    await bridge.setLocalStorage(LOCATION_CACHE_KEY, '');
    console.log('[geo] location cache cleared');
  } catch (err) {
    console.warn('[geo] clearCachedLocation failed:', err);
  }
}

/**
 * Get current position.
 *
 * Both navigator.geolocation and bridge.callEvenApp('getLocation') crash
 * the Even G2 glasses at the native level (not catchable in JS).
 * We skip all location APIs in the WebView and rely on the fallback
 * coordinates in main.ts (Prague) until a safe location method is found.
 */
export async function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  const err: LocationError = {
    code: 'unavailable',
    message: 'Location unavailable.',
  };
  throw err;
}

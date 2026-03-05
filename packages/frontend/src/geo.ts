export type LocationError =
  | { code: 'unsupported'; message: string }
  | { code: 'denied'; message: string }
  | { code: 'unavailable'; message: string }
  | { code: 'timeout'; message: string };

/**
 * Get current position.
 *
 * Both navigator.geolocation and bridge.callEvenApp('getLocation') crash
 * the Even G2 glasses at the native level (not catchable in JS).
 * We skip all location APIs in the WebView and rely on the fallback
 * coordinates in main.ts (Prague) until a safe location method is found.
 */
export async function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  console.warn('[geo] skipping all WebView location APIs (crash risk), using fallback');
  const err: LocationError = {
    code: 'unavailable',
    message: 'Location unavailable.',
  };
  throw err;
}

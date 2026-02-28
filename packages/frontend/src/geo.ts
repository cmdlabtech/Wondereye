import { GEO_TIMEOUT, GEO_MAX_AGE } from './constants';

export type LocationError =
  | { code: 'unsupported'; message: string }
  | { code: 'denied'; message: string }
  | { code: 'unavailable'; message: string }
  | { code: 'timeout'; message: string };

/**
 * Check location permission state via Permissions API.
 * Returns 'granted', 'denied', 'prompt', or 'unknown' if API unavailable.
 * Works in iOS Safari WebView (14.5+) and Android WebView (Chromium).
 */
export async function checkLocationPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  try {
    if (!navigator.permissions) return 'unknown';
    const result = await navigator.permissions.query({ name: 'geolocation' });
    return result.state;
  } catch {
    // Permissions API not supported for geolocation in this context
    return 'unknown';
  }
}

/**
 * Get current position with platform-aware error handling.
 *
 * iOS WebView: Location requires the host app (Even App) to have
 *   NSLocationWhenInUseUsageDescription in Info.plist and user consent.
 *   If denied at the OS level, the WebView gets PERMISSION_DENIED.
 *
 * Android WebView: Location requires ACCESS_FINE_LOCATION or
 *   ACCESS_COARSE_LOCATION in the host app manifest, plus runtime permission.
 *   The WebView also needs onGeolocationPermissionsShowPrompt handling.
 */
export function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      const err: LocationError = {
        code: 'unsupported',
        message: 'Geolocation not available in this browser.',
      };
      reject(err);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        let locErr: LocationError;
        switch (error.code) {
          case error.PERMISSION_DENIED:
            // iOS: User denied in Settings > Privacy > Location Services
            // Android: User denied runtime permission or host app lacks manifest permission
            locErr = {
              code: 'denied',
              message: 'Location permission denied.\nEnable in phone Settings > Even App > Location.',
            };
            break;
          case error.POSITION_UNAVAILABLE:
            // GPS/network location unavailable (airplane mode, indoor, etc.)
            locErr = {
              code: 'unavailable',
              message: 'Location unavailable.\nCheck GPS and network settings.',
            };
            break;
          case error.TIMEOUT:
            locErr = {
              code: 'timeout',
              message: 'Location request timed out.\nMoving outdoors may help.',
            };
            break;
          default:
            locErr = {
              code: 'unavailable',
              message: `Location error: ${error.message}`,
            };
        }
        reject(locErr);
      },
      {
        enableHighAccuracy: true,
        timeout: GEO_TIMEOUT,
        maximumAge: GEO_MAX_AGE,
      }
    );
  });
}

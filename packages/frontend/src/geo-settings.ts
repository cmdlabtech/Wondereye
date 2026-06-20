// Kill-switch for on-glasses geolocation. Mirrors units.ts.
// When 'off', the app never calls navigator.geolocation and falls back to the
// last cached fix (or Prague) — a fast escape hatch if device GPS misbehaves.

const KEY = 'wondereye-geo';

export function getGeoEnabled(): boolean {
  return (localStorage.getItem(KEY) || 'on') !== 'off';
}

export function setGeoEnabled(enabled: boolean): void {
  localStorage.setItem(KEY, enabled ? 'on' : 'off');
}

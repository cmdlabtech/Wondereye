// Kill-switch for device location. Mirrors units.ts.
// When 'off', the app never calls the SDK's getAppLocation and falls back to
// the last cached fix (or Prague) — a fast escape hatch if location misbehaves.

const KEY = 'wondereye-geo';

export function getGeoEnabled(): boolean {
  return (localStorage.getItem(KEY) || 'on') !== 'off';
}

export function setGeoEnabled(enabled: boolean): void {
  localStorage.setItem(KEY, enabled ? 'on' : 'off');
}

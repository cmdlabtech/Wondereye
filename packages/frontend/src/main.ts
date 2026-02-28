import { initBridge } from './bridge';
import { getCurrentPosition } from './geo';
import { fetchLandmarks } from './api';
import { renderStartup, renderList, renderError } from './renderer';
import { setupEventHandlers } from './events';
import { AppState } from './types';
import { reverseGeocode } from './geocode';

const state: AppState = {
  landmarks: [],
  selectedIndex: 0,
  mode: 'loading',
};

// Fallback coordinates (Washington DC) for simulator/testing
const FALLBACK_LAT = 38.8977;
const FALLBACK_LNG = -77.0365;

async function getLocation(): Promise<{ lat: number; lng: number }> {
  // Allow overriding location via URL params (for simulator)
  const params = new URLSearchParams(window.location.search);
  const paramLat = parseFloat(params.get('lat') || '');
  const paramLng = parseFloat(params.get('lng') || '');
  if (Number.isFinite(paramLat) && Number.isFinite(paramLng)
      && paramLat >= -90 && paramLat <= 90 && paramLng >= -180 && paramLng <= 180) {
    console.log('[geo] using URL params');
    return { lat: paramLat, lng: paramLng };
  }

  try {
    return await getCurrentPosition();
  } catch (e) {
    console.warn('Geolocation failed, using fallback location:', e);
    return { lat: FALLBACK_LAT, lng: FALLBACK_LNG };
  }
}

async function loadLandmarks(): Promise<void> {
  try {
    state.mode = 'loading';
    console.log('[app] renderStartup');
    await renderStartup();

    console.log('[app] getting location');
    const { lat, lng } = await getLocation();
    console.log('[app] location acquired');

    console.log('[app] fetching landmarks');
    const [landmarks, city] = await Promise.all([
      fetchLandmarks(lat, lng),
      reverseGeocode(lat, lng),
    ]);
    console.log('[app] got landmarks:', landmarks.length, 'city:', city);

    if (landmarks.length === 0) {
      state.mode = 'error';
      state.errorMessage = 'No landmarks found nearby.\nTry moving to a new area.';
      await renderError(state.errorMessage);
      return;
    }

    state.landmarks = landmarks;
    state.selectedIndex = 0;
    state.mode = 'list';
    state.city = city;
    await renderList(state);
  } catch (error) {
    console.error('[app] loadLandmarks error:', error);
    state.mode = 'error';
    state.errorMessage = error instanceof Error ? error.message : 'Unknown error';
    try {
      await renderError(state.errorMessage);
    } catch (renderErr) {
      console.error('[app] renderError also failed:', renderErr);
    }
  }
}

async function main(): Promise<void> {
  const statusEl = document.getElementById('status');
  console.log('[app] starting');

  try {
    if (statusEl) statusEl.textContent = 'Connecting to glasses...';
    console.log('[app] waiting for bridge');
    await initBridge();
    console.log('[app] bridge ready');

    if (statusEl) statusEl.textContent = 'Connected. Loading landmarks...';
    setupEventHandlers(state, loadLandmarks);

    await loadLandmarks();

    if (statusEl) statusEl.textContent = 'App running on glasses.';
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[app] main error:', msg, error);
    if (statusEl) statusEl.textContent = `Error: ${msg}`;
  }
}

main();

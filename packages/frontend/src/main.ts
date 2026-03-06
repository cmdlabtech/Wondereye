import { initBridge } from './bridge';
import { getBridge } from './bridge';
import { getCurrentPosition, LocationError } from './geo';
import { fetchLandmarks, fetchUserLocation } from './api';
import { renderStartup, renderList, renderError } from './renderer';
import { setupEventHandlers } from './events';
import { AppState } from './types';
import { reverseGeocode } from './geocode';

const state: AppState = {
  landmarks: [],
  selectedIndex: 0,
  mode: 'loading',
};

// Fallback coordinates (Prague, Czech Republic) for simulator/testing
const FALLBACK_LAT = 50.090167;
const FALLBACK_LNG = 14.401917;

function setPhoneStatus(text: string) {
  const el = document.getElementById('connection-status');
  if (el) el.textContent = text;
}

function setPhoneDot(id: string, state: 'active' | 'loading' | 'off') {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'dot' + (state !== 'off' ? ' ' + state : '');
}

function setPhoneLocationStatus(text: string, active = false) {
  const el = document.getElementById('location-status');
  if (el) el.textContent = text;
  setPhoneDot('location-dot', active ? 'active' : 'off');
}

function showPhoneSetupLink(uid: number) {
  const section = document.getElementById('setup-section');
  const urlBox = document.getElementById('setup-url');
  if (!section || !urlBox) return;
  const url = `${window.location.origin}/?uid=${uid}`;
  urlBox.textContent = url;
  // Expose to the inline copy script
  (window as any)._setupUrl = url;
  section.style.display = 'block';
}

async function getLocation(): Promise<{ lat: number; lng: number }> {
  // Allow overriding location via URL params (for simulator)
  const params = new URLSearchParams(window.location.search);
  const paramLat = parseFloat(params.get('lat') || '');
  const paramLng = parseFloat(params.get('lng') || '');
  if (Number.isFinite(paramLat) && Number.isFinite(paramLng)
      && paramLat >= -90 && paramLat <= 90 && paramLng >= -180 && paramLng <= 180) {
    return { lat: paramLat, lng: paramLng };
  }

  // Try location stored via the homepage (uid-based)
  if (state.uid) {
    const stored = await fetchUserLocation(state.uid);
    if (stored) return stored;
  }

  try {
    return await getCurrentPosition();
  } catch (e) {
    const locErr = e as LocationError;
    console.warn('[geo] location failed, using Prague fallback:', locErr.code, locErr.message);
    return { lat: FALLBACK_LAT, lng: FALLBACK_LNG };
  }
}

async function loadLandmarks(): Promise<void> {
  try {
    state.mode = 'loading';
    await renderStartup();

    setPhoneLocationStatus('Getting location...');
    const { lat, lng } = await getLocation();

    const [landmarks, city] = await Promise.all([
      fetchLandmarks(lat, lng),
      reverseGeocode(lat, lng),
    ]);

    setPhoneLocationStatus(city || `${lat.toFixed(3)}, ${lng.toFixed(3)}`, true);

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

    const locErr = error as LocationError;
    if (locErr.code === 'denied') {
      state.errorMessage = locErr.message;
    } else if (locErr.code === 'unsupported') {
      state.errorMessage = locErr.message;
    } else {
      state.errorMessage = error instanceof Error ? error.message : 'Unknown error';
    }

    try {
      await renderError(state.errorMessage);
    } catch (renderErr) {
      console.error('[app] renderError also failed:', renderErr);
    }
  }
}

async function main(): Promise<void> {
  try {
    setPhoneStatus('Connecting...');
    setPhoneDot('connection-dot', 'loading');
    await initBridge();

    setPhoneStatus('Connected');
    setPhoneDot('connection-dot', 'active');

    // Get Even user uid for location persistence
    try {
      const user = await getBridge().getUserInfo();
      if (user?.uid) {
        state.uid = user.uid;
        showPhoneSetupLink(user.uid);
      }
    } catch (e) {
      console.warn('[app] getUserInfo failed:', e);
    }

    setupEventHandlers(state, loadLandmarks);
    await loadLandmarks();
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[app] main error:', msg, error);
    setPhoneStatus(`Error: ${msg}`);
    setPhoneDot('connection-dot', 'off');
  }
}

main();

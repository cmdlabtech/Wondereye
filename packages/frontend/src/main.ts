import { initBridge } from './bridge';
import { getBridge } from './bridge';
import { getCurrentPosition, LocationError } from './geo';
import { fetchLandmarks, fetchUserLocation } from './api';
import { renderStartup, renderLoading, renderList, renderError, renderReadingPage, renderSetupNotice } from './renderer';
import { setupEventHandlers } from './events';
import { initIMU } from './imu';
import { loadHistory } from './history';
import { updateCompassHeading } from './compass';
import { AppState, HistoryEntry } from './types';
import { reverseGeocode } from './geocode';
import { getUnits, setUnits } from './units';

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

function renderPhoneHistory(entries: HistoryEntry[]): void {
  const section = document.getElementById('history-section');
  const list = document.getElementById('history-list');
  if (!section || !list) return;

  if (entries.length === 0) {
    section.style.display = 'none';
    return;
  }

  const recent = entries.slice(0, 10);
  list.replaceChildren();
  for (const entry of recent) {
    const date = new Date(entry.visitedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' });
    const snippet = entry.snippet.length > 60 ? entry.snippet.slice(0, 57) + '...' : entry.snippet;
    const type = entry.type.replace(/_/g, ' ');

    const div = document.createElement('div');
    div.className = 'history-entry';

    const header = document.createElement('div');
    header.className = 'history-header';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'history-name';
    nameSpan.textContent = entry.name;

    const typeSpan = document.createElement('span');
    typeSpan.className = 'history-type';
    typeSpan.textContent = type;

    const dateSpan = document.createElement('span');
    dateSpan.className = 'history-date';
    dateSpan.textContent = date;

    header.append(nameSpan, typeSpan, dateSpan);

    const snippetDiv = document.createElement('div');
    snippetDiv.className = 'history-snippet';
    snippetDiv.textContent = snippet;

    div.append(header, snippetDiv);
    list.appendChild(div);
  }

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
    // Only rebuild if this is a refresh (not initial load — startup page already showing)
    if (state.landmarks.length > 0) {
      await renderLoading();
    }

    setPhoneLocationStatus('Getting location...');
    const { lat, lng } = await getLocation();

    // Store coordinates for compass bearing calculations; reset compass calibration
    state.userLat = lat;
    state.userLng = lng;
    state.imuBaseline = undefined;

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

    // Refresh phone history display after each successful landmark load
    loadHistory(getBridge()).then(renderPhoneHistory).catch(() => {});
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

async function rerenderCurrentView(): Promise<void> {
  if (state.mode === 'list') {
    await renderList(state);
  } else if (state.mode === 'reading') {
    const pages = state.readingPages || [];
    const page = state.readingPage ?? 0;
    const landmark = state.landmarks[state.selectedIndex];
    if (landmark) {
      await renderReadingPage(landmark, pages[page], page, pages.length, false, !!state.detailLoaded);
    }
  }
}

function initUnitsToggle(): void {
  const imperialBtn = document.getElementById('units-imperial');
  const metricBtn = document.getElementById('units-metric');
  if (!imperialBtn || !metricBtn) return;

  const refresh = () => {
    const current = getUnits();
    imperialBtn.classList.toggle('active', current === 'imperial');
    metricBtn.classList.toggle('active', current === 'metric');
  };

  refresh();

  imperialBtn.addEventListener('click', () => {
    setUnits('imperial');
    refresh();
    rerenderCurrentView().catch(() => {});
  });

  metricBtn.addEventListener('click', () => {
    setUnits('metric');
    refresh();
    rerenderCurrentView().catch(() => {});
  });
}

async function main(): Promise<void> {
  try {
    initUnitsToggle();
    setPhoneStatus('Connecting...');
    setPhoneDot('connection-dot', 'loading');
    await initBridge();

    setPhoneStatus('Connected');
    setPhoneDot('connection-dot', 'active');

    // Initialize glasses display immediately so something shows on-screen.
    // SDK requires createStartUpPageContainer called exactly once, before any rebuildPageContainer.
    await renderStartup();

    // Resolve Even account uid with a timeout — getUserInfo can hang or return uid=0
    // on new/test accounts. Never redirect based on this result.
    let resolvedUid: number | undefined;
    try {
      const user = await Promise.race([
        getBridge().getUserInfo(),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 2000)),
      ]);
      if (user?.uid) resolvedUid = user.uid;
    } catch (e) {
      console.warn('[app] getUserInfo failed:', e);
    }

    if (resolvedUid) {
      state.uid = resolvedUid;
      showPhoneSetupLink(resolvedUid);
    }

    // Load and display landmark visit history on the phone companion UI
    loadHistory(getBridge()).then(renderPhoneHistory).catch(() => {});

    // Initialize IMU for compass heading tracking
    let imuHandler: ((event: any) => void) | undefined;
    try {
      imuHandler = initIMU(getBridge(), {
        onHeadingUpdate: (x, _y) => updateCompassHeading(state, x),
      });
    } catch (err) {
      console.warn('[app] IMU not available:', err);
    }

    setupEventHandlers(
      state,
      loadLandmarks,
      imuHandler,
      () => loadHistory(getBridge()).then(renderPhoneHistory).catch(() => {}),
    );

    // Check if user has set up their location via the phone bridge.
    // If not, show a first-time setup notice on the glasses instead of jumping
    // straight to landmarks. Tap on the glasses will trigger loadLandmarks
    // (mode='error' reuses the existing tap-to-retry handler in events.ts).
    const hasStoredLocation = resolvedUid ? await fetchUserLocation(resolvedUid) : null;
    if (!hasStoredLocation) {
      state.mode = 'error';
      await renderSetupNotice(resolvedUid);
    } else {
      await loadLandmarks();
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[app] main error:', msg, error);
    setPhoneStatus(`Error: ${msg}`);
    setPhoneDot('connection-dot', 'off');
  }
}

main();

import { initBridge } from './bridge';
import { getBridge } from './bridge';
import { getCurrentPosition, getCachedLocation, LocationError } from './geo';
import { fetchLandmarks } from './api';
import { renderStartup, renderLoading, renderList, renderError, renderReadingPage } from './renderer';
import { setupEventHandlers } from './events';
import { initIMU } from './imu';
import { loadHistory } from './history';
import { updateCompassHeading } from './compass';
import { AppState, HistoryEntry } from './types';
import { reverseGeocode } from './geocode';
import { getUnits, setUnits } from './units';
import { getRadius, setRadius, RADIUS_MIN, RADIUS_MAX } from './radius';
import { getGeoEnabled, setGeoEnabled } from './geo-settings';

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

function renderContributions(entries: HistoryEntry[]): void {
  const summary = document.getElementById('contrib-summary');
  const list = document.getElementById('contrib-list');
  if (!summary || !list) return;

  list.replaceChildren();

  if (entries.length === 0) {
    summary.textContent = 'No contributions yet';
    const empty = document.createElement('div');
    empty.className = 'contrib-empty';
    empty.textContent = 'Landmarks you view on your glasses are added to the community map and will appear here.';
    list.appendChild(empty);
    return;
  }

  summary.textContent = entries.length === 1
    ? '1 landmark contributed'
    : `${entries.length} landmarks contributed`;

  for (const entry of entries) {
    const date = new Date(entry.visitedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' });
    const type = entry.type.replace(/_/g, ' ');

    const item = document.createElement('div');
    item.className = 'contrib-item';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'contrib-name';
    nameSpan.textContent = entry.name;

    const typeSpan = document.createElement('span');
    typeSpan.className = 'contrib-type';
    typeSpan.textContent = type;

    const dateSpan = document.createElement('span');
    dateSpan.className = 'contrib-date';
    dateSpan.textContent = date;

    item.append(nameSpan, typeSpan, dateSpan);
    list.appendChild(item);
  }
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

  // Primary: phone location via the SDK bridge (caches the fix on success).
  try {
    return await getCurrentPosition();
  } catch (e) {
    const locErr = e as LocationError;
    console.warn('[geo] device location failed:', locErr.code, locErr.message);
  }

  // Fallback: last successfully cached fix, then Prague.
  const cached = getCachedLocation();
  if (cached) {
    console.warn('[geo] using last cached location');
    return cached;
  }
  console.warn('[geo] no cached location, using Prague fallback');
  return { lat: FALLBACK_LAT, lng: FALLBACK_LNG };
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
    loadHistory(getBridge()).then(renderContributions).catch(() => {});
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

function formatRadius(meters: number): string {
  if (getUnits() === 'metric') {
    return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`;
  }
  return meters < 1609
    ? `${Math.round((meters * 3.28084) / 10) * 10} ft`
    : `${(meters / 1609.34).toFixed(1)} mi`;
}

function refreshRadiusLabel(): void {
  const label = document.getElementById('radius-value');
  if (label) label.textContent = formatRadius(getRadius());
}

function initUnitsToggle(): void {
  const imperialBtn = document.getElementById('units-imperial');
  const metricBtn = document.getElementById('units-metric');
  if (!imperialBtn || !metricBtn) return;

  const refresh = () => {
    const current = getUnits();
    imperialBtn.classList.toggle('active', current === 'imperial');
    metricBtn.classList.toggle('active', current === 'metric');
    refreshRadiusLabel(); // radius label is unit-aware
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

function initRadiusControl(): void {
  const slider = document.getElementById('radius-slider') as HTMLInputElement | null;
  if (!slider) return;

  slider.min = String(RADIUS_MIN);
  slider.max = String(RADIUS_MAX);
  slider.value = String(getRadius());
  refreshRadiusLabel();

  // Live label while dragging; persist as we go.
  slider.addEventListener('input', () => {
    const meters = Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, Number(slider.value) || RADIUS_MAX));
    setRadius(meters);
    const label = document.getElementById('radius-value');
    if (label) label.textContent = formatRadius(meters);
  });

  // Reload landmarks once the user settles on a value.
  slider.addEventListener('change', () => {
    setRadius(Number(slider.value) || RADIUS_MAX);
    loadLandmarks().catch(() => {});
  });
}

function initGeoToggle(): void {
  const onBtn = document.getElementById('geo-on');
  const offBtn = document.getElementById('geo-off');
  if (!onBtn || !offBtn) return;

  const refresh = () => {
    const enabled = getGeoEnabled();
    onBtn.classList.toggle('active', enabled);
    offBtn.classList.toggle('active', !enabled);
  };

  refresh();

  const set = (enabled: boolean) => {
    setGeoEnabled(enabled);
    refresh();
    loadLandmarks().catch(() => {});
  };

  onBtn.addEventListener('click', () => set(true));
  offBtn.addEventListener('click', () => set(false));
}

// Best-effort: open external links (map, supporter) in the phone's browser.
// The Even Hub SDK has no "open URL" bridge method, so this relies on the host
// WebView honoring a new-window request. window.open (from a user gesture) is
// the most widely supported signal; if the host blocks it we fall through to
// the anchor's native target="_blank".
function initExternalLinks(): void {
  const links = document.querySelectorAll<HTMLAnchorElement>('a[data-external]');
  links.forEach((link) => {
    link.addEventListener('click', (e) => {
      const url = link.href;
      if (!url) return;
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (opened) e.preventDefault(); // avoid a second navigation if it worked
    });
  });
}

function initContribToggle(): void {
  const toggle = document.getElementById('contrib-toggle');
  const list = document.getElementById('contrib-list');
  if (!toggle || !list) return;

  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    (list as HTMLElement).hidden = open;
  });
}

async function main(): Promise<void> {
  try {
    initUnitsToggle();
    initRadiusControl();
    initGeoToggle();
    initContribToggle();
    initExternalLinks();
    setPhoneStatus('Connecting...');
    setPhoneDot('connection-dot', 'loading');
    await initBridge();

    setPhoneStatus('Connected');
    setPhoneDot('connection-dot', 'active');

    // Initialize glasses display immediately so something shows on-screen.
    // SDK requires createStartUpPageContainer called exactly once, before any rebuildPageContainer.
    await renderStartup();

    // Load and display landmark visit history on the phone companion UI
    loadHistory(getBridge()).then(renderContributions).catch(() => {});

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
      () => loadHistory(getBridge()).then(renderContributions).catch(() => {}),
      rerenderCurrentView,
    );

    // Location now comes directly from the device, so load landmarks straight away.
    // If device location is denied/unavailable, getLocation() falls back to the
    // last cached fix or Prague, so this always proceeds.
    await loadLandmarks();
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[app] main error:', msg, error);
    setPhoneStatus(`Error: ${msg}`);
    setPhoneDot('connection-dot', 'off');
  }
}

main();

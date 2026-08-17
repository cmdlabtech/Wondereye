import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { API_BASE_URL } from './constants';

interface MapLandmark {
  name: string;
  type: string;
  lat: number;
  lng: number;
  snippet: string;
}

function escHtml(s: string | undefined | null): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatType(type: string): string {
  return type.replace(/_/g, ' ');
}

const geoMarkerIcon = L.divIcon({
  html: '<div class="wmap-marker"><div class="wmap-geo-dot"></div></div>',
  className: '',
  iconSize: L.point(44, 44),
  iconAnchor: L.point(22, 22),
  popupAnchor: L.point(0, -22),
});

function setupSearch(map: L.Map, clusters: L.MarkerClusterGroup, allMarkers: L.Marker[]) {
  const input = document.getElementById('search') as HTMLInputElement | null;
  const resultsEl = document.getElementById('search-results');
  if (!input || !resultsEl) return;

  let geoMarker: L.Marker | null = null;
  let activeIndex = -1;
  let currentMatches: L.Marker[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const hideResults = () => {
    resultsEl.hidden = true;
    resultsEl.innerHTML = '';
    activeIndex = -1;
    currentMatches = [];
  };

  const selectLandmark = (marker: L.Marker) => {
    const lm = (marker as any)._lm as MapLandmark;
    hideResults();
    input.value = lm.name;
    input.blur();
    clusters.zoomToShowLayer(marker, () => marker.openPopup());
  };

  const searchLocation = async (query: string) => {
    hideResults();
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`geocode error: ${res.status}`);
      const results = await res.json();
      const place = results?.[0];
      if (!place) return;

      const lat = parseFloat(place.lat);
      const lng = parseFloat(place.lon);
      if (geoMarker) map.removeLayer(geoMarker);
      geoMarker = L.marker([lat, lng], { icon: geoMarkerIcon }).addTo(map);
      geoMarker.bindPopup(`<strong>${escHtml(place.display_name)}</strong>`, { maxWidth: 260 });
      map.flyTo([lat, lng], Math.max(map.getZoom(), 13));
      map.once('moveend', () => geoMarker?.openPopup());
    } catch (e) {
      console.error('[map] Location search failed:', e);
    }
  };

  const renderResults = (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) {
      hideResults();
      return;
    }

    currentMatches = allMarkers
      .filter((m) => ((m as any)._lm as MapLandmark).name.toLowerCase().includes(q))
      .slice(0, 6);
    activeIndex = -1;

    const landmarkRows = currentMatches
      .map(
        (m, i) =>
          `<div class="search-result" data-i="${i}">` +
          `<span class="search-result-name">${escHtml(((m as any)._lm as MapLandmark).name)}</span>` +
          `<span class="search-result-type">${escHtml(formatType(((m as any)._lm as MapLandmark).type))}</span>` +
          `</div>`
      )
      .join('');

    const locationRow =
      `<div class="search-result search-result-location" data-location="1">Search “${escHtml(query.trim())}” as a place…</div>`;

    resultsEl.innerHTML = landmarkRows + locationRow;
    resultsEl.hidden = false;

    resultsEl.querySelectorAll('.search-result').forEach((el) => {
      el.addEventListener('click', () => {
        const i = (el as HTMLElement).dataset.i;
        if (i !== undefined) {
          selectLandmark(currentMatches[Number(i)]);
        } else {
          void searchLocation(input.value);
        }
      });
    });
  };

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => renderResults(input.value), 150);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < currentMatches.length) {
        selectLandmark(currentMatches[activeIndex]);
      } else if (currentMatches.length > 0) {
        selectLandmark(currentMatches[0]);
      } else if (input.value.trim()) {
        void searchLocation(input.value);
      }
    } else if (e.key === 'Escape') {
      hideResults();
      input.blur();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!currentMatches.length) return;
      e.preventDefault();
      activeIndex =
        e.key === 'ArrowDown'
          ? Math.min(activeIndex + 1, currentMatches.length - 1)
          : Math.max(activeIndex - 1, 0);
      resultsEl.querySelectorAll('.search-result').forEach((el, i) => {
        el.classList.toggle('active', i === activeIndex);
      });
    }
  });

  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Node)) return;
    if (!input.contains(e.target) && !resultsEl.contains(e.target)) hideResults();
  });
}

async function init() {
  const map = L.map('map', {
    zoomControl: false,
    minZoom: 2,
    maxZoom: 14,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 120,
  }).setView([20, 0], 2);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20,
  }).addTo(map);

  try {
    const res = await fetch(`${API_BASE_URL}/api/map`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    const landmarks: MapLandmark[] = data.landmarks ?? [];

    const countEl = document.getElementById('count');
    if (countEl) countEl.textContent = `${landmarks.length} landmark${landmarks.length !== 1 ? 's' : ''}`;

    const clusters = L.markerClusterGroup({
      maxClusterRadius: 60,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: false,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        const size = count < 10 ? 32 : count < 100 ? 40 : 48;
        return L.divIcon({
          html: `<div class="wmap-cluster">${count}</div>`,
          className: '',
          iconSize: L.point(size, size),
        });
      },
    });

    // 44×44 transparent hit area with a centred 10px visual dot for easy mobile tapping
    const markerIcon = L.divIcon({
      html: '<div class="wmap-marker"><div class="wmap-marker-dot"></div></div>',
      className: '',
      iconSize: L.point(44, 44),
      iconAnchor: L.point(22, 22),
      popupAnchor: L.point(0, -22),
    });

    const allMarkers: L.Marker[] = [];

    for (const lm of landmarks) {
      const marker = L.marker([lm.lat, lm.lng], { icon: markerIcon });
      (marker as any)._lm = lm;
      marker.bindPopup(
        `<strong>${escHtml(lm.name)}</strong>` +
        `<br><span class="popup-type">${escHtml(formatType(lm.type))}</span>` +
        `<br><br>${escHtml(lm.snippet)}`,
        { maxWidth: 260, maxHeight: 260 }
      );
      clusters.addLayer(marker);
      allMarkers.push(marker);
    }

    map.addLayer(clusters);

    setupSearch(map, clusters, allMarkers);

    let popupOpenedAtZoom: number | null = null;
    map.on('popupopen', () => { popupOpenedAtZoom = map.getZoom(); });
    map.on('popupclose', () => { popupOpenedAtZoom = null; });
    map.on('zoomend', () => {
      if (popupOpenedAtZoom !== null && map.getZoom() <= popupOpenedAtZoom - 1) {
        map.closePopup();
      }
    });

    clusters.on('clusterclick', (e: any) => {
      const markers: any[] = e.layer.getAllChildMarkers();
      const rows = markers
        .map((m, i) =>
          `<div class="cl-item" data-i="${i}">${escHtml(m._lm.name)}<span class="cl-type">${escHtml(formatType(m._lm.type))}</span></div>`
        )
        .join('');

      L.popup({ maxWidth: 280, maxHeight: 260 })
        .setLatLng(e.layer.getLatLng())
        .setContent(`<div class="cl-list">${rows}</div>`)
        .openOn(map);

      setTimeout(() => {
        document.querySelectorAll('.cl-item').forEach((el) => {
          el.addEventListener('click', () => {
            const lm = markers[Number((el as HTMLElement).dataset.i)]._lm;
            map.closePopup();
            L.popup({ maxWidth: 260, maxHeight: 260 })
              .setLatLng([lm.lat, lm.lng])
              .setContent(
                `<strong>${escHtml(lm.name)}</strong>` +
                `<br><span class="popup-type">${escHtml(formatType(lm.type))}</span>` +
                `<br><br>${escHtml(lm.snippet)}`
              )
              .openOn(map);
          });
        });
      }, 0);
    });

  } catch (e) {
    console.error('[map] Failed to load landmark data:', e);
  }
}

init();

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

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
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

    for (const lm of landmarks) {
      const marker = L.marker([lm.lat, lm.lng], { icon: markerIcon });
      (marker as any)._lm = lm;
      marker.bindPopup(
        `<strong>${escHtml(lm.name)}</strong>` +
        `<br><span class="popup-type">${escHtml(lm.type)}</span>` +
        `<br><br>${escHtml(lm.snippet)}`,
        { maxWidth: 260 }
      );
      clusters.addLayer(marker);
    }

    map.addLayer(clusters);

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
          `<div class="cl-item" data-i="${i}">${escHtml(m._lm.name)}<span class="cl-type">${escHtml(m._lm.type)}</span></div>`
        )
        .join('');

      L.popup({ maxWidth: 280 })
        .setLatLng(e.layer.getLatLng())
        .setContent(`<div class="cl-list">${rows}</div>`)
        .openOn(map);

      setTimeout(() => {
        document.querySelectorAll('.cl-item').forEach((el) => {
          el.addEventListener('click', () => {
            const lm = markers[Number((el as HTMLElement).dataset.i)]._lm;
            map.closePopup();
            L.popup({ maxWidth: 260 })
              .setLatLng([lm.lat, lm.lng])
              .setContent(
                `<strong>${escHtml(lm.name)}</strong>` +
                `<br><span class="popup-type">${escHtml(lm.type)}</span>` +
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

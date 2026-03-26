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

async function init() {
  const map = L.map('map', { zoomControl: false }).setView([30, 10], 2);
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
      const marker = L.marker([lm.lat, lm.lng], { icon: markerIcon }).bindPopup(
        `<strong>${lm.name}</strong>` +
        `<br><span class="popup-type">${lm.type}</span>` +
        `<br><br>${lm.snippet}`
      );
      clusters.addLayer(marker);
    }

    map.addLayer(clusters);

    if (landmarks.length > 0) {
      const bounds = L.latLngBounds(landmarks.map(lm => [lm.lat, lm.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
    }
  } catch (e) {
    console.error('[map] Failed to load landmark data:', e);
  }
}

init();

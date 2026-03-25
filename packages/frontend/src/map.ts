import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { API_BASE_URL } from './constants';

interface MapLandmark {
  name: string;
  type: string;
  lat: number;
  lng: number;
  snippet: string;
}

async function init() {
  const map = L.map('map').setView([30, 10], 2);

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

    for (const lm of landmarks) {
      L.circleMarker([lm.lat, lm.lng], {
        radius: 6,
        color: '#fff',
        weight: 1,
        fillColor: '#4ade80',
        fillOpacity: 0.85,
      })
        .addTo(map)
        .bindPopup(
          `<strong style="font-size:0.9rem">${lm.name}</strong>` +
          `<br><span style="font-size:0.75rem;color:#888;text-transform:uppercase;letter-spacing:0.04em">${lm.type}</span>` +
          `<br><br><span style="font-size:0.85rem">${lm.snippet}</span>`
        );
    }

    if (landmarks.length > 0) {
      const bounds = L.latLngBounds(landmarks.map(lm => [lm.lat, lm.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }
  } catch (e) {
    console.error('[map] Failed to load landmark data:', e);
  }
}

init();

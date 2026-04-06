import { Landmark } from './types';
import { API_BASE_URL, SEARCH_RADIUS } from './constants';

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function fetchLandmarks(lat: number, lng: number): Promise<Landmark[]> {
  const response = await fetch(`${API_BASE_URL}/api/landmarks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng, radius: SEARCH_RADIUS }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  const landmarks: Landmark[] = data.landmarks;

  // Cached distances are computed from rounded coordinates at cache-write time.
  // Recalculate from the user's actual position so the list is always sorted correctly.
  return landmarks
    .map(lm => ({
      ...lm,
      distance: lm.lat != null && lm.lng != null
        ? Math.round(haversineDistance(lat, lng, lm.lat, lm.lng))
        : lm.distance,
    }))
    .sort((a, b) => a.distance - b.distance);
}

export async function fetchUserLocation(uid: number): Promise<{ lat: number; lng: number } | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/location?uid=${uid}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function fetchLandmarkDetail(name: string, units: 'imperial' | 'metric' = 'imperial'): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/landmark-detail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, units }),
  });

  if (!response.ok) {
    return '';
  }

  const data = await response.json();
  return data.detail || '';
}

export async function fetchTranscribe(formData: FormData): Promise<{ matched: string | null; query: string }> {
  const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Transcribe API error: ${response.status}`);
  }

  return response.json();
}

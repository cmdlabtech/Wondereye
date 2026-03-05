import { Landmark } from './types';
import { API_BASE_URL, SEARCH_RADIUS } from './constants';

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
  return data.landmarks;
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

export async function fetchLandmarkDetail(name: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/landmark-detail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    return '';
  }

  const data = await response.json();
  return data.detail || '';
}

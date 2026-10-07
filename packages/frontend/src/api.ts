import { Landmark } from './types';
import { API_BASE_URL } from './constants';
import { getRadius } from './radius';

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

// Upper bound for the landmark lookup. The worker itself gives up on
// upstream data sources well before this; the client ceiling just makes sure
// a stalled connection can never leave the app "loading" forever.
const LANDMARKS_TIMEOUT_MS = 30_000;

/** Error from the landmark API, carrying a message fit for the glasses HUD. */
export class LandmarkApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'LandmarkApiError';
  }
}

function friendlyApiError(status: number): LandmarkApiError {
  if (status === 429) {
    return new LandmarkApiError('Too many requests.\nWait a minute, then tap to retry.', status);
  }
  if (status >= 500) {
    return new LandmarkApiError('Landmark service is busy.\nTap to retry in a moment.', status);
  }
  return new LandmarkApiError(`Could not load landmarks (${status}).\nTap to retry.`, status);
}

export async function fetchLandmarks(lat: number, lng: number): Promise<Landmark[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LANDMARKS_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/landmarks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng, radius: getRadius() }),
      signal: controller.signal,
    });
  } catch (e) {
    const aborted = (e as { name?: string })?.name === 'AbortError';
    throw new LandmarkApiError(
      aborted
        ? 'Landmark lookup timed out.\nTap to retry.'
        : 'No connection to Wondereye.\nCheck your phone, then tap to retry.',
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    console.warn('[api] /api/landmarks returned', response.status);
    throw friendlyApiError(response.status);
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

export async function fetchLandmarkDetail(landmark: Landmark, units: 'imperial' | 'metric' = 'imperial'): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/landmark-detail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: landmark.name,
      type: landmark.type,
      lat: landmark.lat,
      lng: landmark.lng,
      distance: landmark.distance,
      snippet: landmark.snippet,
      wikipedia: landmark.wikipedia,
      wikidata: landmark.wikidata,
      description: landmark.description,
      startDate: landmark.startDate,
      architect: landmark.architect,
      city: landmark.city,
      units,
    }),
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

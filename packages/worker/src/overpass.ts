import { RawPOI } from './types';

export async function queryOverpass(
  lat: number,
  lng: number,
  radius: number
): Promise<RawPOI[]> {
  const query = `
    [out:json][timeout:25];
    (
      nwr["name"]["tourism"~"museum|attraction|viewpoint|artwork|gallery"](around:${radius},${lat},${lng});
      nwr["name"]["historic"~"monument|memorial|castle|archaeological_site"](around:${radius},${lat},${lng});
      nwr["name"]["amenity"~"place_of_worship|theatre|library"](around:${radius},${lat},${lng});
      nwr["name"]["building"~"cathedral|church|mosque|synagogue|temple"](around:${radius},${lat},${lng});
    );
    out center body qt;
  `;

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.osm.ch/api/interpreter',
  ];

  const ENDPOINT_TIMEOUT_MS = 10_000;

  let response: Response | undefined;
  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ENDPOINT_TIMEOUT_MS);
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // Overpass instances require an identifying UA per OSM usage policy
          // (overpass-api.de returns 406 without one)
          'User-Agent': 'Wondereye/1.5.0 (https://wondereye.app)',
        },
        signal: controller.signal,
      });
    } catch {
      console.warn(`[overpass] ${endpoint} failed, trying next...`);
      continue;
    } finally {
      clearTimeout(timer);
    }
    if (response.ok) break;
    console.warn(`[overpass] ${endpoint} returned ${response.status}, trying next...`);
  }

  if (!response || !response.ok) {
    throw new Error(`Overpass API error: ${response?.status ?? 'no response'}`);
  }

  const data: any = await response.json();

  if (!data || !Array.isArray(data.elements)) {
    throw new Error('Unexpected Overpass response format');
  }

  const seen = new Set<string>();
  const pois: RawPOI[] = [];

  for (const element of data.elements) {
    const name = element.tags?.name;
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const elLat = element.lat ?? element.center?.lat;
    const elLng = element.lon ?? element.center?.lon;
    if (!elLat || !elLng) continue;

    // Prefer specific building types (cathedral, church, etc.) over generic tourism=attraction
    const specificBuilding = ['cathedral', 'church', 'mosque', 'synagogue', 'temple'].includes(element.tags.building)
      ? element.tags.building : null;
    const type = specificBuilding || element.tags.amenity || element.tags.historic || element.tags.tourism || 'landmark';

    const distance = haversineDistance(lat, lng, elLat, elLng);
    const tags = element.tags as Record<string, string> | undefined;

    pois.push({
      name,
      type,
      lat: elLat,
      lng: elLng,
      distance: Math.round(distance),
      ...(optionalTag(tags, 'wikipedia', 150, 'wikipedia')),
      ...(optionalTag(tags, 'wikidata', 40, 'wikidata')),
      ...(optionalTag(tags, 'description:en', 240, 'description')
        ?? optionalTag(tags, 'description', 240, 'description')),
      ...(optionalTag(tags, 'start_date', 40, 'startDate')),
      ...(optionalTag(tags, 'architect', 80, 'architect')
        ?? optionalTag(tags, 'artist_name', 80, 'architect')),
      ...(optionalTag(tags, 'addr:city', 80, 'city')
        ?? optionalTag(tags, 'addr:suburb', 80, 'city')
        ?? optionalTag(tags, 'is_in:city', 80, 'city')),
    });
  }

  return pois.sort((a, b) => a.distance - b.distance).slice(0, 20);
}

function optionalTag(
  tags: Record<string, string> | undefined,
  osmKey: string,
  max: number,
  field: string,
): Record<string, string> | undefined {
  const value = tags?.[osmKey]?.trim();
  if (!value) return undefined;
  return { [field]: value.slice(0, max) };
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

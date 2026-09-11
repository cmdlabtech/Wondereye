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
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    // Regional (Switzerland). Often 200 with zero elements outside CH — skip empties below.
    'https://overpass.osm.ch/api/interpreter',
  ];

  const ENDPOINT_TIMEOUT_MS = 20_000;
  const body = `data=${encodeURIComponent(query)}`;
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    // Overpass instances require an identifying UA per OSM usage policy
    // (overpass-api.de returns 406 without one)
    'User-Agent': 'Wondereye/1.6.2 (https://wondereye.app)',
  };

  const elements = await new Promise<any[]>((resolve, reject) => {
    let rejected = 0;
    const total = endpoints.length;
    for (const endpoint of endpoints) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ENDPOINT_TIMEOUT_MS);
      fetch(endpoint, { method: 'POST', body, headers, signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`status ${response.status}`);
          const parsed: any = await response.json();
          if (!parsed || !Array.isArray(parsed.elements)) throw new Error('unexpected body');
          // 200 with zero elements is a miss (regional mirrors), not "no POIs".
          if (parsed.elements.length === 0) throw new Error('0 elements');
          resolve(parsed.elements);
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[overpass] ${endpoint} failed: ${msg}`);
          rejected++;
          if (rejected === total) reject(new Error('Overpass API error: no response'));
        })
        .finally(() => clearTimeout(timer));
    }
  });

  const data = { elements };

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

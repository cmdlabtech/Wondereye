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
      nwr["name"]["historic"~"monument|memorial|castle|archaeological_site|building"](around:${radius},${lat},${lng});
      nwr["name"]["amenity"~"place_of_worship|theatre|library"](around:${radius},${lat},${lng});
      nwr["name"]["building"~"cathedral|church|mosque|synagogue|temple"](around:${radius},${lat},${lng});
    );
    out center body qt;
  `;

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.status}`);
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

    const type =
      element.tags.tourism ||
      element.tags.historic ||
      element.tags.amenity ||
      element.tags.building ||
      'landmark';

    const distance = haversineDistance(lat, lng, elLat, elLng);

    pois.push({ name, type, lat: elLat, lng: elLng, distance: Math.round(distance) });
  }

  return pois.sort((a, b) => a.distance - b.distance).slice(0, 20);
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

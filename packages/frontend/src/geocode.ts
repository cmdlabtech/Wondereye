export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    // Round to 2 decimal places (~1.1km precision) before sending to external service
    const safeLat = Math.round(lat * 100) / 100;
    const safeLng = Math.round(lng * 100) / 100;
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${safeLat}&lon=${safeLng}&format=json&zoom=10`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'G2-LandmarkExplorer/1.0' },
    });
    if (!res.ok) return '';
    const data = await res.json();
    return data.address?.city || data.address?.town || data.address?.village || '';
  } catch {
    return '';
  }
}

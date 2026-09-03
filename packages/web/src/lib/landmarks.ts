export type Landmark = {
  name: string;
  type: string;
  lat: number;
  lng: number;
  snippet: string;
};

export function formatType(type: string): string {
  return type.replace(/_/g, " ");
}

function onLiveOrigin(): boolean {
  if (typeof location === "undefined") return false;
  return /(?:^|\.)wondereye\.app$/i.test(location.hostname);
}

async function fromSnapshot(): Promise<Landmark[]> {
  const res = await fetch("/landmarks.json");
  if (!res.ok) throw new Error("Couldn't load landmarks");
  const data = (await res.json()) as { landmarks?: Landmark[] };
  return Array.isArray(data.landmarks) ? data.landmarks : [];
}

export async function loadLandmarks(): Promise<Landmark[]> {
  const snapshot = fromSnapshot();
  if (!onLiveOrigin()) return snapshot;

  try {
    const live = await fetch("https://api.wondereye.app/api/map", { signal: AbortSignal.timeout(2000) });
    if (live.ok) {
      const data = (await live.json()) as { landmarks?: Landmark[] };
      if (Array.isArray(data.landmarks) && data.landmarks.length) return data.landmarks;
    }
  } catch {
    /* fall through to snapshot */
  }
  return snapshot;
}
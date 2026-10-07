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

const snapshotStart = typeof window === "undefined" ? null : fromSnapshot();

async function loadLandmarksOnce(onUpdate?: (list: Landmark[]) => void): Promise<Landmark[]> {
  let snapshot: Landmark[] = [];
  try {
    snapshot = await (snapshotStart ?? fromSnapshot());
    if (snapshot.length) onUpdate?.(snapshot);
  } catch {
    /* live origin can still recover */
  }

  if (onLiveOrigin()) {
    try {
      const live = await fetch("https://api.wondereye.app/api/map", { signal: AbortSignal.timeout(2000) });
      if (live.ok) {
        const data = (await live.json()) as { landmarks?: Landmark[] };
        if (Array.isArray(data.landmarks) && data.landmarks.length) {
          onUpdate?.(data.landmarks);
          return data.landmarks;
        }
      }
    } catch {
      /* keep snapshot */
    }
  }

  if (!snapshot.length) throw new Error("Couldn't load landmarks");
  return snapshot;
}

let pending: Promise<Landmark[]> | null = null;

export function loadLandmarks(onUpdate?: (list: Landmark[]) => void): Promise<Landmark[]> {
  if (!pending) pending = loadLandmarksOnce(onUpdate);
  else if (onUpdate) void pending.then(onUpdate);
  return pending;
}
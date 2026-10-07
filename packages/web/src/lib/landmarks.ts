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

export function landmarkId(m: Landmark): string {
  return `${m.name}@${m.lat.toFixed(4)},${m.lng.toFixed(4)}`;
}

export type TypeGroup = {
  id: string;
  label: string;
  types: string[] | null;
};

export const TYPE_GROUPS: TypeGroup[] = [
  { id: "all", label: "All", types: null },
  { id: "museums", label: "Museums", types: ["museum", "gallery", "library", "arts_centre"] },
  { id: "sacred", label: "Sacred", types: ["church", "cathedral", "place_of_worship", "synagogue", "temple"] },
  { id: "memorials", label: "Memorials", types: ["memorial", "monument"] },
  { id: "stages", label: "Stages", types: ["theatre", "cinema"] },
  { id: "views", label: "Views", types: ["viewpoint", "attraction"] },
  { id: "sites", label: "Sites", types: ["castle", "archaeological_site", "building", "house"] },
  { id: "art", label: "Art", types: ["artwork"] },
];

const FEATURED_TYPES = new Set([
  "museum",
  "attraction",
  "castle",
  "monument",
  "cathedral",
  "viewpoint",
  "theatre",
  "artwork",
  "gallery",
]);

export function pickFeatured(list: Landmark[], n = 4): Landmark[] {
  const pool = list.filter(
    (m) => FEATURED_TYPES.has(m.type) && m.snippet && m.name.length >= 4 && m.name.length <= 42,
  );
  if (pool.length <= n) return pool.length ? pool : list.slice(0, n);
  const prefer = pool.find((m) => /times square|pražský|prague|manly|faneuil|moai|las vegas strip/i.test(m.name));
  const rest = prefer ? pool.filter((m) => m !== prefer) : [...pool];
  const chosen: Landmark[] = [prefer ?? rest.shift()!];
  while (chosen.length < n && rest.length) {
    let bestI = 0;
    let bestD = -1;
    for (let i = 0; i < rest.length; i++) {
      const d = Math.min(
        ...chosen.map((c) => {
          const dLat = c.lat - rest[i].lat;
          const dLng = c.lng - rest[i].lng;
          return dLat * dLat + dLng * dLng;
        }),
      );
      if (d > bestD) {
        bestD = d;
        bestI = i;
      }
    }
    chosen.push(rest.splice(bestI, 1)[0]);
  }
  return chosen;
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